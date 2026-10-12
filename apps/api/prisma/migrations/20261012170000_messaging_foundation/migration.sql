-- Issue #171 / D-087: internal messaging V1 foundation (PR A).
--
-- Reshapes the dormant Conversation / ConversationMember / Message tables from the
-- foundational migration, adds MessageRevision, and corrects the seeded messaging
-- grants (CLIENT_USER loses messages:view / messages:create, FINANCE_MANAGER gains
-- them).
--
-- MIGRATION SAFETY GATE (fail closed).
-- No application code has ever written these tables, but that does not prove a
-- deployed database holds no rows. The reshape below drops the polymorphic
-- "relatedEntityType"/"relatedEntityId" columns and the boolean "active"/"archivedAt"
-- membership state, and adds NOT NULL columns ("createdByUserId", "sequence",
-- "clientMessageId") that have no truthful value for a legacy row. No lossless
-- mapping has been reviewed, so the migration refuses to run if ANY legacy
-- messaging row exists. It takes table locks first, so no row can be
-- inserted between the check and the reshape, and it raises before any DDL. Prisma
-- runs this file as one transaction, so a refusal changes nothing; the migration is
-- recorded as failed and the operator follows docs/runbooks/messaging-legacy-rows.md.
-- The read-only diagnostic apps/api/diagnostics/messaging-legacy-rows.sql reports
-- the same counts without changing anything.

LOCK TABLE "Conversation", "ConversationMember", "Message" IN ACCESS EXCLUSIVE MODE;
-- SHARE blocks concurrent Document writes (so no message attachment can appear)
-- while still allowing Document reads during the migration.
LOCK TABLE "Document" IN SHARE MODE;

DO $$
DECLARE
  conversation_rows BIGINT;
  member_rows BIGINT;
  message_rows BIGINT;
  attachment_rows BIGINT;
BEGIN
  SELECT count(*) INTO conversation_rows FROM "Conversation";
  SELECT count(*) INTO member_rows FROM "ConversationMember";
  SELECT count(*) INTO message_rows FROM "Message";
  SELECT count(*) INTO attachment_rows FROM "Document" WHERE "messageId" IS NOT NULL;

  IF conversation_rows + member_rows + message_rows + attachment_rows > 0 THEN
    RAISE EXCEPTION
      'HIREME_MESSAGING_LEGACY_ROWS: refusing to reshape messaging tables that already hold data (Conversation=%, ConversationMember=%, Message=%, Document.messageId=%). Nothing was changed. Follow docs/runbooks/messaging-legacy-rows.md; do not run prisma migrate reset.',
      conversation_rows, member_rows, message_rows, attachment_rows;
  END IF;
END
$$;

-- CreateEnum
CREATE TYPE "ConversationMemberStatus" AS ENUM ('active', 'left', 'removed');

-- DropIndex
DROP INDEX "Conversation_relatedEntityType_relatedEntityId_idx";
DROP INDEX "Conversation_status_idx";
DROP INDEX "ConversationMember_active_idx";
DROP INDEX "ConversationMember_userId_idx";
DROP INDEX "Message_conversationId_idx";
DROP INDEX "Message_status_idx";

-- AlterTable
ALTER TABLE "Conversation" DROP COLUMN "relatedEntityId",
DROP COLUMN "relatedEntityType",
ADD COLUMN     "archivedByUserId" UUID,
ADD COLUMN     "createdByUserId" UUID NOT NULL,
ADD COLUMN     "directKey" TEXT,
ADD COLUMN     "lastMessageAt" TIMESTAMP(3),
ADD COLUMN     "lastMessageSequence" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ConversationMember" DROP COLUMN "active",
DROP COLUMN "archivedAt",
ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "historyAfterSequence" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "lastReadSequence" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "leftAt" TIMESTAMP(3),
ADD COLUMN     "removedByUserId" UUID,
ADD COLUMN     "status" "ConversationMemberStatus" NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "archivedByUserId" UUID,
ADD COLUMN     "clientMessageId" UUID NOT NULL,
ADD COLUMN     "editCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sequence" BIGINT NOT NULL;

-- CreateTable
CREATE TABLE "MessageRevision" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "previousBody" TEXT NOT NULL,
    "editedByUserId" UUID NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageRevision_editedByUserId_idx" ON "MessageRevision"("editedByUserId");
CREATE UNIQUE INDEX "MessageRevision_messageId_revisionNumber_key" ON "MessageRevision"("messageId", "revisionNumber");
CREATE UNIQUE INDEX "Conversation_directKey_key" ON "Conversation"("directKey");
CREATE INDEX "Conversation_status_lastMessageAt_idx" ON "Conversation"("status", "lastMessageAt" DESC);
CREATE INDEX "Conversation_createdByUserId_idx" ON "Conversation"("createdByUserId");
CREATE INDEX "Conversation_archivedByUserId_idx" ON "Conversation"("archivedByUserId");
CREATE INDEX "ConversationMember_userId_status_idx" ON "ConversationMember"("userId", "status");
CREATE INDEX "ConversationMember_conversationId_status_idx" ON "ConversationMember"("conversationId", "status");
CREATE INDEX "ConversationMember_removedByUserId_idx" ON "ConversationMember"("removedByUserId");
CREATE INDEX "Message_archivedByUserId_idx" ON "Message"("archivedByUserId");
CREATE UNIQUE INDEX "Message_conversationId_sequence_key" ON "Message"("conversationId", "sequence");
CREATE UNIQUE INDEX "Message_conversationId_authorUserId_clientMessageId_key" ON "Message"("conversationId", "authorUserId", "clientMessageId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_removedByUserId_fkey" FOREIGN KEY ("removedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessageRevision" ADD CONSTRAINT "MessageRevision_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessageRevision" ADD CONSTRAINT "MessageRevision_editedByUserId_fkey" FOREIGN KEY ("editedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Single-row shape rules. Cross-row invariants (exactly two PRIVATE members,
-- 3-50 GROUP members at creation, at most 50 active GROUP members, read cursor
-- not past the conversation's last sequence) cannot be CHECK constraints; they are
-- enforced transactionally under the Conversation row lock.

-- PRIVATE: no title, canonical "<lowerUuid>:<higherUuid>" key of two distinct
-- lowercase UUIDs. GROUP: trimmed 1-120 character title, no key.
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_type_shape_check" CHECK (
  (
    "type" = 'private'
    AND "title" IS NULL
    AND "directKey" IS NOT NULL
    AND "directKey" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part("directKey", ':', 1) < split_part("directKey", ':', 2)
  )
  OR (
    "type" = 'group'
    AND "directKey" IS NULL
    AND "title" IS NOT NULL
    AND char_length("title") BETWEEN 1 AND 120
    AND "title" = btrim("title")
  )
);

-- Only a GROUP can be archived, and archival records its actor and time.
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_archive_shape_check" CHECK (
  ("status" = 'active' AND "archivedAt" IS NULL AND "archivedByUserId" IS NULL)
  OR (
    "status" = 'archived'
    AND "type" = 'group'
    AND "archivedAt" IS NOT NULL
    AND "archivedByUserId" IS NOT NULL
  )
);

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_last_message_check" CHECK (
  ("lastMessageSequence" = 0 AND "lastMessageAt" IS NULL)
  OR ("lastMessageSequence" > 0 AND "lastMessageAt" IS NOT NULL)
);

ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_sequence_bounds_check" CHECK (
  "historyAfterSequence" >= 0 AND "lastReadSequence" >= 0
);

ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_status_shape_check" CHECK (
  ("status" = 'active' AND "leftAt" IS NULL AND "removedByUserId" IS NULL)
  OR ("status" = 'left' AND "leftAt" IS NOT NULL AND "removedByUserId" IS NULL)
  OR ("status" = 'removed' AND "leftAt" IS NOT NULL AND "removedByUserId" IS NOT NULL)
);

ALTER TABLE "Message" ADD CONSTRAINT "Message_sequence_positive_check" CHECK ("sequence" >= 1);

ALTER TABLE "Message" ADD CONSTRAINT "Message_body_length_check" CHECK (
  char_length("body") BETWEEN 1 AND 4000 AND char_length(btrim("body")) >= 1
);

ALTER TABLE "Message" ADD CONSTRAINT "Message_edit_shape_check" CHECK (
  "editCount" BETWEEN 0 AND 10
  AND (("editCount" = 0) = ("editedAt" IS NULL))
);

ALTER TABLE "Message" ADD CONSTRAINT "Message_status_shape_check" CHECK (
  ("status" = 'active' AND "editCount" = 0 AND "archivedAt" IS NULL AND "archivedByUserId" IS NULL)
  OR ("status" = 'edited' AND "editCount" >= 1 AND "archivedAt" IS NULL AND "archivedByUserId" IS NULL)
  OR ("status" = 'archived' AND "archivedAt" IS NOT NULL AND "archivedByUserId" IS NOT NULL)
);

ALTER TABLE "MessageRevision" ADD CONSTRAINT "MessageRevision_bounds_check" CHECK (
  "revisionNumber" BETWEEN 1 AND 10
  AND char_length("previousBody") BETWEEN 1 AND 4000
);

-- MessageRevision is append-only: an edit can never silently rewrite what a
-- colleague already read.
CREATE FUNCTION "MessageRevision_reject_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'HIREME_MESSAGE_REVISION_IMMUTABLE: MessageRevision rows are append-only.';
END
$$;

CREATE TRIGGER "MessageRevision_append_only"
BEFORE UPDATE OR DELETE ON "MessageRevision"
FOR EACH ROW EXECUTE FUNCTION "MessageRevision_reject_mutation"();

CREATE TRIGGER "MessageRevision_no_truncate"
BEFORE TRUNCATE ON "MessageRevision"
FOR EACH STATEMENT EXECUTE FUNCTION "MessageRevision_reject_mutation"();

-- Seeded grant reconciliation (D-087). Production does not run the seed, so the
-- correction is applied here; prisma/seed.ts applies the same rule for databases
-- it seeds. Both statements touch only these two roles' two messaging grants and
-- are no-ops on a database whose roles are not seeded yet.
-- CLIENT_USER: archive (revoke) any active messaging grant. Archival keeps the
-- grant history; effective permission resolution ignores archived grants.
UPDATE "RolePermission" AS grant_row
SET "archivedAt" = CURRENT_TIMESTAMP,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Role" AS role_row, "Permission" AS permission_row
WHERE grant_row."roleId" = role_row."id"
  AND grant_row."permissionId" = permission_row."id"
  AND role_row."name" = 'client_user'
  AND permission_row."code" IN ('messages:view', 'messages:create')
  AND grant_row."archivedAt" IS NULL;

-- FINANCE_MANAGER: grant both. An existing row (active or deliberately archived)
-- is left untouched.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "updatedAt")
SELECT gen_random_uuid(), role_row."id", permission_row."id", CURRENT_TIMESTAMP
FROM "Role" AS role_row
CROSS JOIN "Permission" AS permission_row
WHERE role_row."name" = 'finance_manager'
  AND permission_row."code" IN ('messages:view', 'messages:create')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

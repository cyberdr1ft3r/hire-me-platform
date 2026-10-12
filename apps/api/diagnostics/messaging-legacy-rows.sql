-- Read-only precondition check for migration 20261012170000_messaging_foundation
-- (Issue #171 / D-087 / R-053).
--
-- Run it BEFORE `prisma migrate deploy` on any database that predates the
-- migration. It is a single SELECT: it writes nothing, locks nothing, and creates
-- nothing. It returns counts only, never conversation titles, message bodies, or
-- user identifiers, so its output can be shared.
--
-- Every count must be 0 for the migration to apply. If any count is non-zero the
-- migration refuses to run (HIREME_MESSAGING_LEGACY_ROWS) and changes nothing;
-- follow docs/runbooks/messaging-legacy-rows.md.
--
-- Only valid on the PRE-migration shape (it reads the legacy "relatedEntityType"
-- and "active" columns, which the migration removes).
SELECT
  (SELECT count(*) FROM "Conversation") AS "conversationRows",
  (SELECT count(*) FROM "Conversation" WHERE "type" = 'private') AS "privateConversationRows",
  (SELECT count(*) FROM "Conversation" WHERE "type" = 'group') AS "groupConversationRows",
  (SELECT count(*) FROM "Conversation" WHERE "relatedEntityType" IS NOT NULL OR "relatedEntityId" IS NOT NULL) AS "conversationRowsWithLegacyContextLink",
  (SELECT count(*) FROM "ConversationMember") AS "conversationMemberRows",
  (SELECT count(*) FROM "ConversationMember" WHERE "active" = false OR "archivedAt" IS NOT NULL) AS "inactiveConversationMemberRows",
  (SELECT count(*) FROM "Message") AS "messageRows",
  (SELECT count(*) FROM "Document" WHERE "messageId" IS NOT NULL) AS "documentRowsLinkedToMessages";

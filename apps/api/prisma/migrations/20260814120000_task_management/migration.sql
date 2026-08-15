-- CreateEnum
CREATE TYPE "TaskAssignmentStatus" AS ENUM ('active', 'removed', 'archived');

-- CreateEnum
CREATE TYPE "TaskCommentStatus" AS ENUM ('active', 'edited', 'archived');

-- CreateEnum
CREATE TYPE "TaskReminderStatus" AS ENUM ('pending', 'processing', 'sent', 'canceled', 'failed');

-- CreateEnum
CREATE TYPE "TaskEventAction" AS ENUM (
  'created',
  'updated',
  'owner_changed',
  'assignee_added',
  'assignee_removed',
  'status_changed',
  'completed',
  'canceled',
  'reopened',
  'comment_created',
  'comment_edited',
  'comment_archived',
  'mentioned',
  'reminder_created',
  'reminder_canceled',
  'reminder_delivered',
  'reminder_failed',
  'overdue_notification_sent',
  'archived'
);

-- AlterTable
ALTER TABLE "Task"
  ADD COLUMN "startAt" TIMESTAMP(3),
  ADD COLUMN "timezone" TEXT,
  ADD COLUMN "ownerUserId" UUID,
  ADD COLUMN "completedByUserId" UUID,
  ADD COLUMN "canceledByUserId" UUID,
  ADD COLUMN "reopenedByUserId" UUID,
  ADD COLUMN "archivedByUserId" UUID,
  ADD COLUMN "recruitmentOfferId" UUID,
  ADD COLUMN "recruitmentOfferVersionId" UUID,
  ADD COLUMN "missionPlacementId" UUID,
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "completionNote" TEXT,
  ADD COLUMN "canceledAt" TIMESTAMP(3),
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "reopenedAt" TIMESTAMP(3),
  ADD COLUMN "reopenReason" TEXT,
  ADD COLUMN "blockingReason" TEXT,
  ADD COLUMN "archiveReason" TEXT;

-- Backfill owner from the legacy single assignee when present, otherwise the creator.
UPDATE "Task"
SET "ownerUserId" = COALESCE("assigneeUserId", "createdByUserId")
WHERE "ownerUserId" IS NULL;

-- AlterTable
ALTER TABLE "Notification"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "readAt" TIMESTAMP(3),
  ADD COLUMN "archivedByUserId" UUID;

-- CreateTable
CREATE TABLE "TaskAssignment" (
  "id" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "assignedByUserId" UUID,
  "removedByUserId" UUID,
  "status" "TaskAssignmentStatus" NOT NULL DEFAULT 'active',
  "reason" TEXT,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("id")
);

-- Backfill the normalized assignment table from the legacy single-assignee field.
INSERT INTO "TaskAssignment" (
  "id",
  "taskId",
  "userId",
  "assignedByUserId",
  "status",
  "reason",
  "assignedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  "id",
  "assigneeUserId",
  "createdByUserId",
  'active'::"TaskAssignmentStatus",
  'Migrated from legacy Task.assigneeUserId compatibility field.',
  "createdAt",
  "createdAt",
  CURRENT_TIMESTAMP
FROM "Task"
WHERE "assigneeUserId" IS NOT NULL;

-- CreateTable
CREATE TABLE "TaskComment" (
  "id" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  "authorUserId" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "status" "TaskCommentStatus" NOT NULL DEFAULT 'active',
  "editedAt" TIMESTAMP(3),
  "editedByUserId" UUID,
  "archivedAt" TIMESTAMP(3),
  "archivedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskMention" (
  "id" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  "commentId" UUID NOT NULL,
  "mentionedUserId" UUID NOT NULL,
  "createdByUserId" UUID,
  "notificationId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskReminder" (
  "id" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  "recipientUserId" UUID NOT NULL,
  "creatorUserId" UUID,
  "remindAt" TIMESTAMP(3) NOT NULL,
  "status" "TaskReminderStatus" NOT NULL DEFAULT 'pending',
  "idempotencyKey" TEXT NOT NULL,
  "processingToken" TEXT,
  "claimedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "canceledByUserId" UUID,
  "failureReason" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskEvent" (
  "id" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  "actorUserId" UUID,
  "action" "TaskEventAction" NOT NULL,
  "previousStatus" "TaskStatus",
  "nextStatus" "TaskStatus",
  "reason" TEXT,
  "safeSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_ownerUserId_idx" ON "Task"("ownerUserId");
CREATE INDEX "Task_createdByUserId_idx" ON "Task"("createdByUserId");
CREATE INDEX "Task_priority_idx" ON "Task"("priority");
CREATE INDEX "Task_startAt_idx" ON "Task"("startAt");
CREATE INDEX "Task_clientContactId_idx" ON "Task"("clientContactId");
CREATE INDEX "Task_missionRecruiterId_idx" ON "Task"("missionRecruiterId");
CREATE INDEX "Task_interviewId_idx" ON "Task"("interviewId");
CREATE INDEX "Task_recruitmentOfferId_idx" ON "Task"("recruitmentOfferId");
CREATE INDEX "Task_recruitmentOfferVersionId_idx" ON "Task"("recruitmentOfferVersionId");
CREATE INDEX "Task_missionPlacementId_idx" ON "Task"("missionPlacementId");
CREATE INDEX "Task_archivedAt_idx" ON "Task"("archivedAt");

CREATE UNIQUE INDEX "Notification_idempotencyKey_key" ON "Notification"("idempotencyKey");
CREATE INDEX "Notification_readAt_idx" ON "Notification"("readAt");
CREATE INDEX "Notification_archivedAt_idx" ON "Notification"("archivedAt");

CREATE INDEX "TaskAssignment_taskId_idx" ON "TaskAssignment"("taskId");
CREATE INDEX "TaskAssignment_userId_idx" ON "TaskAssignment"("userId");
CREATE INDEX "TaskAssignment_assignedByUserId_idx" ON "TaskAssignment"("assignedByUserId");
CREATE INDEX "TaskAssignment_status_idx" ON "TaskAssignment"("status");
CREATE UNIQUE INDEX "TaskAssignment_one_active_user_per_task_idx"
  ON "TaskAssignment"("taskId", "userId")
  WHERE "status" = 'active' AND "archivedAt" IS NULL;

CREATE INDEX "TaskComment_taskId_idx" ON "TaskComment"("taskId");
CREATE INDEX "TaskComment_authorUserId_idx" ON "TaskComment"("authorUserId");
CREATE INDEX "TaskComment_status_idx" ON "TaskComment"("status");
CREATE INDEX "TaskComment_createdAt_idx" ON "TaskComment"("createdAt");

CREATE UNIQUE INDEX "TaskMention_commentId_mentionedUserId_key" ON "TaskMention"("commentId", "mentionedUserId");
CREATE UNIQUE INDEX "TaskMention_notificationId_key" ON "TaskMention"("notificationId");
CREATE INDEX "TaskMention_taskId_idx" ON "TaskMention"("taskId");
CREATE INDEX "TaskMention_mentionedUserId_idx" ON "TaskMention"("mentionedUserId");

CREATE UNIQUE INDEX "TaskReminder_idempotencyKey_key" ON "TaskReminder"("idempotencyKey");
CREATE INDEX "TaskReminder_taskId_idx" ON "TaskReminder"("taskId");
CREATE INDEX "TaskReminder_recipientUserId_idx" ON "TaskReminder"("recipientUserId");
CREATE INDEX "TaskReminder_status_remindAt_idx" ON "TaskReminder"("status", "remindAt");
CREATE INDEX "TaskReminder_createdAt_idx" ON "TaskReminder"("createdAt");

CREATE INDEX "TaskEvent_taskId_idx" ON "TaskEvent"("taskId");
CREATE INDEX "TaskEvent_actorUserId_idx" ON "TaskEvent"("actorUserId");
CREATE INDEX "TaskEvent_action_idx" ON "TaskEvent"("action");
CREATE INDEX "TaskEvent_createdAt_idx" ON "TaskEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_canceledByUserId_fkey" FOREIGN KEY ("canceledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_reopenedByUserId_fkey" FOREIGN KEY ("reopenedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_recruitmentOfferId_fkey" FOREIGN KEY ("recruitmentOfferId") REFERENCES "RecruitmentOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_recruitmentOfferVersionId_fkey" FOREIGN KEY ("recruitmentOfferVersionId") REFERENCES "RecruitmentOfferVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_missionPlacementId_fkey" FOREIGN KEY ("missionPlacementId") REFERENCES "MissionPlacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_removedByUserId_fkey" FOREIGN KEY ("removedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_editedByUserId_fkey" FOREIGN KEY ("editedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaskMention" ADD CONSTRAINT "TaskMention_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskMention" ADD CONSTRAINT "TaskMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "TaskComment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskMention" ADD CONSTRAINT "TaskMention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskMention" ADD CONSTRAINT "TaskMention_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskMention" ADD CONSTRAINT "TaskMention_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_canceledByUserId_fkey" FOREIGN KEY ("canceledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

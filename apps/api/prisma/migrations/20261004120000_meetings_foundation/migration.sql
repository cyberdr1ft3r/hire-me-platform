-- Issue #124 bounded meetings prerequisite for agenda aggregation.

CREATE TYPE "MeetingStatus" AS ENUM ('scheduled', 'completed', 'canceled');

CREATE TYPE "MeetingParticipantStatus" AS ENUM (
  'scheduled',
  'accepted',
  'declined',
  'attended',
  'missed',
  'cancelled'
);

CREATE TABLE "Meeting" (
  "id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "scheduledStartAt" TIMESTAMP(3) NOT NULL,
  "scheduledEndAt" TIMESTAMP(3),
  "timezone" TEXT NOT NULL,
  "location" TEXT,
  "meetingUrl" TEXT,
  "organizerUserId" UUID NOT NULL,
  "clientId" UUID,
  "status" "MeetingStatus" NOT NULL DEFAULT 'scheduled',
  "completedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MeetingParticipant" (
  "id" UUID NOT NULL,
  "meetingId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "status" "MeetingParticipantStatus" NOT NULL DEFAULT 'scheduled',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeetingParticipant_meetingId_userId_key" ON "MeetingParticipant"("meetingId", "userId");
CREATE INDEX "Meeting_organizerUserId_idx" ON "Meeting"("organizerUserId");
CREATE INDEX "Meeting_clientId_idx" ON "Meeting"("clientId");
CREATE INDEX "Meeting_scheduledStartAt_idx" ON "Meeting"("scheduledStartAt");
CREATE INDEX "Meeting_status_idx" ON "Meeting"("status");
CREATE INDEX "Meeting_archivedAt_idx" ON "Meeting"("archivedAt");
CREATE INDEX "MeetingParticipant_meetingId_idx" ON "MeetingParticipant"("meetingId");
CREATE INDEX "MeetingParticipant_userId_idx" ON "MeetingParticipant"("userId");
CREATE INDEX "MeetingParticipant_status_idx" ON "MeetingParticipant"("status");

ALTER TABLE "Meeting"
  ADD CONSTRAINT "Meeting_organizerUserId_fkey"
  FOREIGN KEY ("organizerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Meeting"
  ADD CONSTRAINT "Meeting_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MeetingParticipant"
  ADD CONSTRAINT "MeetingParticipant_meetingId_fkey"
  FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MeetingParticipant"
  ADD CONSTRAINT "MeetingParticipant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('internal', 'client', 'guest');

-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('super_admin', 'admin', 'hr_manager', 'manager', 'team_leader', 'employee', 'guest', 'client_user');

-- CreateEnum
CREATE TYPE "RoleStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "PermissionStatus" AS ENUM ('active', 'deprecated');

-- CreateEnum
CREATE TYPE "PermissionScopeType" AS ENUM ('global', 'all_data', 'team', 'assigned', 'client', 'explicit');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('prospect', 'active', 'inactive', 'archived');

-- CreateEnum
CREATE TYPE "ClientContactStatus" AS ENUM ('active', 'inactive', 'archived');

-- CreateEnum
CREATE TYPE "PortalAccessStatus" AS ENUM ('disabled', 'invited', 'enabled', 'archived');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('active', 'inactive', 'talent_pool', 'archived');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('unknown', 'granted', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "CandidateDocumentStatus" AS ENUM ('active', 'superseded', 'archived');

-- CreateEnum
CREATE TYPE "CandidateDocumentType" AS ENUM ('cv', 'portfolio', 'certification', 'consent', 'hr_attachment', 'other');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('internal_only', 'assigned_only', 'client_shared', 'private');

-- CreateEnum
CREATE TYPE "DocumentVersionSource" AS ENUM ('uploaded', 'generated', 'imported');

-- CreateEnum
CREATE TYPE "RecruitmentMissionState" AS ENUM ('draft', 'internal_validation', 'active', 'job_description_approved', 'candidate_sourcing', 'hr_preselection', 'hr_interviews', 'technical_tests', 'candidate_presentation', 'client_interviews', 'final_selection', 'offer_sent', 'candidate_integrated', 'probation_monitoring', 'waiting_for_client_information', 'paused', 'canceled', 'closed_with_recruitment', 'closed_without_recruitment', 'deadline_expired_without_renewal', 'archived');

-- CreateEnum
CREATE TYPE "MissionClosureReason" AS ENUM ('client_closed_or_canceled', 'closed_without_recruitment', 'deadline_expired_without_renewal', 'positions_filled_and_candidates_integrated');

-- CreateEnum
CREATE TYPE "MissionRecruiterRole" AS ENUM ('lead_recruiter', 'recruiter', 'sourcer', 'contributor');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('active', 'inactive', 'archived');

-- CreateEnum
CREATE TYPE "MissionCandidateState" AS ENUM ('new', 'cv_review', 'hr_preselection', 'hr_interview_scheduled', 'hr_interview_completed', 'technical_test', 'internal_validation', 'presented_to_client', 'client_interview_1', 'client_interview_2', 'client_offer', 'accepted', 'integrated', 'probation_monitoring', 'end_of_probation', 'closed', 'waiting', 'on_hold', 'postponed', 'candidate_declined', 'client_rejected', 'withdrawn', 'talent_pool', 'archived');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('hr', 'technical', 'client', 'other');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('scheduled', 'postponed', 'completed', 'canceled', 'archived');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('draft', 'submitted', 'archived');

-- CreateEnum
CREATE TYPE "EvaluationRecommendation" AS ENUM ('strong_yes', 'yes', 'neutral', 'no', 'strong_no');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('open', 'in_progress', 'waiting', 'blocked', 'completed', 'canceled', 'archived');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('draft', 'active', 'superseded', 'archived');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('job_description', 'interview_report', 'candidate_summary', 'quotation', 'purchase_order', 'contract', 'invoice', 'hr_document', 'technical_test_report', 'training_material', 'message_attachment', 'client_file', 'other');

-- CreateEnum
CREATE TYPE "OutputFamily" AS ENUM ('pdf', 'word', 'excel', 'other');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('unread', 'read', 'archived');

-- CreateEnum
CREATE TYPE "TrainingProgramStatus" AS ENUM ('program_draft', 'program_active', 'program_closed', 'program_archived');

-- CreateEnum
CREATE TYPE "TrainingSessionStatus" AS ENUM ('session_planned', 'session_scheduled', 'session_in_progress', 'session_completed', 'session_postponed', 'session_canceled', 'session_archived');

-- CreateEnum
CREATE TYPE "TrainingEnrollmentStatus" AS ENUM ('registered', 'approval_pending', 'approved', 'payment_pending', 'enrolled', 'evaluated', 'individual_coaching', 'certificate_issued', 'satisfaction_recorded', 'follow_up', 'closed', 'rejected', 'canceled');

-- CreateEnum
CREATE TYPE "TrainingParticipantType" AS ENUM ('candidate', 'user', 'client_contact', 'external');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('not_required', 'pending', 'paid', 'waived');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('not_applicable', 'pending', 'issued');

-- CreateEnum
CREATE TYPE "TrainingSessionParticipationStatus" AS ENUM ('expected', 'attended', 'absent', 'excused', 'session_outcome_recorded', 'participation_archived');

-- CreateEnum
CREATE TYPE "ExternalParticipantStatus" AS ENUM ('active', 'inactive', 'archived');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('private', 'group');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "ConversationMemberRole" AS ENUM ('owner', 'member');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('active', 'edited', 'archived');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "userType" "UserType" NOT NULL DEFAULT 'internal',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "lastLoginAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "name" "RoleName" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "RoleStatus" NOT NULL DEFAULT 'active',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scopeType" "PermissionScopeType" NOT NULL,
    "status" "PermissionStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "status" "ClientStatus" NOT NULL DEFAULT 'prospect',
    "industry" TEXT,
    "commercialOwnerUserId" UUID,
    "commercialSummary" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "userId" UUID,
    "displayName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "phone" TEXT,
    "roleTitle" TEXT,
    "status" "ClientContactStatus" NOT NULL DEFAULT 'active',
    "portalStatus" "PortalAccessStatus" NOT NULL DEFAULT 'disabled',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "normalizedEmail" TEXT,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'active',
    "source" TEXT,
    "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'unknown',
    "salaryExpectationCents" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateDocument" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "documentType" "CandidateDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "currentVersionId" UUID,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'internal_only',
    "uploadedByUserId" UUID,
    "status" "CandidateDocumentStatus" NOT NULL DEFAULT 'active',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateDocumentVersion" (
    "id" UUID NOT NULL,
    "candidateDocumentId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "createdByUserId" UUID,
    "source" "DocumentVersionSource" NOT NULL,
    "status" "CandidateDocumentStatus" NOT NULL DEFAULT 'active',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentMission" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requirements" TEXT,
    "state" "RecruitmentMissionState" NOT NULL DEFAULT 'draft',
    "priority" "TaskPriority" NOT NULL DEFAULT 'normal',
    "numberOfPositions" INTEGER NOT NULL DEFAULT 1,
    "filledPlacementCount" INTEGER NOT NULL DEFAULT 0,
    "closureReason" "MissionClosureReason",
    "closedAt" TIMESTAMP(3),
    "commercialSummary" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionRecruiter" (
    "id" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MissionRecruiterRole" NOT NULL DEFAULT 'recruiter',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'active',
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "endedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissionRecruiter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionCandidate" (
    "id" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "state" "MissionCandidateState" NOT NULL DEFAULT 'new',
    "rank" INTEGER,
    "source" TEXT,
    "presentedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "closureReason" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" UUID NOT NULL,
    "missionCandidateId" UUID NOT NULL,
    "type" "InterviewType" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "meetingUrl" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'scheduled',
    "outcome" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateEvaluation" (
    "id" UUID NOT NULL,
    "missionCandidateId" UUID NOT NULL,
    "interviewId" UUID,
    "authorUserId" UUID,
    "recommendation" "EvaluationRecommendation",
    "score" INTEGER,
    "feedback" TEXT,
    "evaluationType" TEXT NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'draft',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'open',
    "dueAt" TIMESTAMP(3),
    "priority" "TaskPriority" NOT NULL DEFAULT 'normal',
    "assigneeUserId" UUID,
    "createdByUserId" UUID,
    "candidateId" UUID,
    "clientId" UUID,
    "clientContactId" UUID,
    "recruitmentMissionId" UUID,
    "missionRecruiterId" UUID,
    "missionCandidateId" UUID,
    "interviewId" UUID,
    "trainingProgramId" UUID,
    "trainingSessionId" UUID,
    "trainingEnrollmentId" UUID,
    "trainingSessionParticipationId" UUID,
    "documentId" UUID,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingProgram" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetAudience" TEXT,
    "status" "TrainingProgramStatus" NOT NULL DEFAULT 'program_draft',
    "ownerUserId" UUID,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" UUID NOT NULL,
    "trainingProgramId" UUID NOT NULL,
    "trainerUserId" UUID,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "TrainingSessionStatus" NOT NULL DEFAULT 'session_planned',
    "location" TEXT,
    "meetingUrl" TEXT,
    "outcome" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingEnrollment" (
    "id" UUID NOT NULL,
    "trainingProgramId" UUID NOT NULL,
    "participantType" "TrainingParticipantType" NOT NULL,
    "candidateId" UUID,
    "userId" UUID,
    "clientContactId" UUID,
    "externalTrainingParticipantId" UUID,
    "status" "TrainingEnrollmentStatus" NOT NULL DEFAULT 'registered',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'not_required',
    "evaluationResult" TEXT,
    "certificateStatus" "CertificateStatus" NOT NULL DEFAULT 'not_applicable',
    "satisfactionScore" INTEGER,
    "coachingStatus" TEXT,
    "followUpStatus" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSessionParticipation" (
    "id" UUID NOT NULL,
    "trainingSessionId" UUID NOT NULL,
    "trainingEnrollmentId" UUID NOT NULL,
    "status" "TrainingSessionParticipationStatus" NOT NULL DEFAULT 'expected',
    "sessionOutcome" TEXT,
    "trainerNotes" TEXT,
    "completionStatus" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingSessionParticipation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalTrainingParticipant" (
    "id" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "normalizedEmail" TEXT,
    "phone" TEXT,
    "organization" TEXT,
    "notes" TEXT,
    "status" "ExternalParticipantStatus" NOT NULL DEFAULT 'active',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalTrainingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "currentVersionId" UUID,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'internal_only',
    "generated" BOOLEAN NOT NULL DEFAULT false,
    "outputFamily" "OutputFamily",
    "ownerUserId" UUID,
    "createdByUserId" UUID,
    "candidateId" UUID,
    "clientId" UUID,
    "recruitmentMissionId" UUID,
    "missionCandidateId" UUID,
    "interviewId" UUID,
    "trainingSessionId" UUID,
    "trainingEnrollmentId" UUID,
    "messageId" UUID,
    "status" "DocumentStatus" NOT NULL DEFAULT 'draft',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "outputFamily" "OutputFamily",
    "createdByUserId" UUID,
    "source" "DocumentVersionSource" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'active',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "recipientUserId" UUID NOT NULL,
    "actorUserId" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodySummary" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'unread',
    "taskId" UUID,
    "documentId" UUID,
    "interviewId" UUID,
    "recruitmentMissionId" UUID,
    "missionCandidateId" UUID,
    "trainingSessionId" UUID,
    "trainingEnrollmentId" UUID,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "type" "ConversationType" NOT NULL,
    "title" TEXT,
    "relatedEntityType" TEXT,
    "relatedEntityId" UUID,
    "status" "ConversationStatus" NOT NULL DEFAULT 'active',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMember" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "ConversationMemberRole" NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'active',
    "editedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "targetUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadataSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_normalizedEmail_key" ON "User"("normalizedEmail");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_userType_idx" ON "User"("userType");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "Permission_scopeType_idx" ON "Permission"("scopeType");

-- CreateIndex
CREATE INDEX "Permission_status_idx" ON "Permission"("status");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "Client_normalizedName_idx" ON "Client"("normalizedName");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
CREATE INDEX "Client_commercialOwnerUserId_idx" ON "Client"("commercialOwnerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientContact_userId_key" ON "ClientContact"("userId");

-- CreateIndex
CREATE INDEX "ClientContact_clientId_idx" ON "ClientContact"("clientId");

-- CreateIndex
CREATE INDEX "ClientContact_portalStatus_idx" ON "ClientContact"("portalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ClientContact_clientId_normalizedEmail_key" ON "ClientContact"("clientId", "normalizedEmail");

-- CreateIndex
CREATE INDEX "Candidate_status_idx" ON "Candidate"("status");

-- CreateIndex
CREATE INDEX "Candidate_linkedinUrl_idx" ON "Candidate"("linkedinUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_normalizedEmail_key" ON "Candidate"("normalizedEmail");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateDocument_currentVersionId_key" ON "CandidateDocument"("currentVersionId");

-- CreateIndex
CREATE INDEX "CandidateDocument_candidateId_idx" ON "CandidateDocument"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateDocument_visibility_idx" ON "CandidateDocument"("visibility");

-- CreateIndex
CREATE INDEX "CandidateDocument_status_idx" ON "CandidateDocument"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateDocumentVersion_storageKey_key" ON "CandidateDocumentVersion"("storageKey");

-- CreateIndex
CREATE INDEX "CandidateDocumentVersion_candidateDocumentId_idx" ON "CandidateDocumentVersion"("candidateDocumentId");

-- CreateIndex
CREATE INDEX "CandidateDocumentVersion_createdByUserId_idx" ON "CandidateDocumentVersion"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateDocumentVersion_candidateDocumentId_versionNumber_key" ON "CandidateDocumentVersion"("candidateDocumentId", "versionNumber");

-- CreateIndex
CREATE INDEX "RecruitmentMission_clientId_idx" ON "RecruitmentMission"("clientId");

-- CreateIndex
CREATE INDEX "RecruitmentMission_state_idx" ON "RecruitmentMission"("state");

-- CreateIndex
CREATE INDEX "RecruitmentMission_closureReason_idx" ON "RecruitmentMission"("closureReason");

-- CreateIndex
CREATE INDEX "MissionRecruiter_missionId_idx" ON "MissionRecruiter"("missionId");

-- CreateIndex
CREATE INDEX "MissionRecruiter_userId_idx" ON "MissionRecruiter"("userId");

-- CreateIndex
CREATE INDEX "MissionRecruiter_status_idx" ON "MissionRecruiter"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MissionRecruiter_missionId_userId_role_key" ON "MissionRecruiter"("missionId", "userId", "role");

-- CreateIndex
CREATE INDEX "MissionCandidate_candidateId_idx" ON "MissionCandidate"("candidateId");

-- CreateIndex
CREATE INDEX "MissionCandidate_missionId_idx" ON "MissionCandidate"("missionId");

-- CreateIndex
CREATE INDEX "MissionCandidate_state_idx" ON "MissionCandidate"("state");

-- CreateIndex
CREATE UNIQUE INDEX "MissionCandidate_missionId_candidateId_key" ON "MissionCandidate"("missionId", "candidateId");

-- CreateIndex
CREATE INDEX "Interview_missionCandidateId_idx" ON "Interview"("missionCandidateId");

-- CreateIndex
CREATE INDEX "Interview_scheduledAt_idx" ON "Interview"("scheduledAt");

-- CreateIndex
CREATE INDEX "Interview_status_idx" ON "Interview"("status");

-- CreateIndex
CREATE INDEX "CandidateEvaluation_missionCandidateId_idx" ON "CandidateEvaluation"("missionCandidateId");

-- CreateIndex
CREATE INDEX "CandidateEvaluation_interviewId_idx" ON "CandidateEvaluation"("interviewId");

-- CreateIndex
CREATE INDEX "CandidateEvaluation_authorUserId_idx" ON "CandidateEvaluation"("authorUserId");

-- CreateIndex
CREATE INDEX "CandidateEvaluation_status_idx" ON "CandidateEvaluation"("status");

-- CreateIndex
CREATE INDEX "Task_assigneeUserId_idx" ON "Task"("assigneeUserId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_dueAt_idx" ON "Task"("dueAt");

-- CreateIndex
CREATE INDEX "Task_candidateId_idx" ON "Task"("candidateId");

-- CreateIndex
CREATE INDEX "Task_clientId_idx" ON "Task"("clientId");

-- CreateIndex
CREATE INDEX "Task_recruitmentMissionId_idx" ON "Task"("recruitmentMissionId");

-- CreateIndex
CREATE INDEX "Task_missionCandidateId_idx" ON "Task"("missionCandidateId");

-- CreateIndex
CREATE INDEX "Task_trainingEnrollmentId_idx" ON "Task"("trainingEnrollmentId");

-- CreateIndex
CREATE INDEX "Task_documentId_idx" ON "Task"("documentId");

-- CreateIndex
CREATE INDEX "TrainingProgram_status_idx" ON "TrainingProgram"("status");

-- CreateIndex
CREATE INDEX "TrainingProgram_ownerUserId_idx" ON "TrainingProgram"("ownerUserId");

-- CreateIndex
CREATE INDEX "TrainingSession_trainingProgramId_idx" ON "TrainingSession"("trainingProgramId");

-- CreateIndex
CREATE INDEX "TrainingSession_trainerUserId_idx" ON "TrainingSession"("trainerUserId");

-- CreateIndex
CREATE INDEX "TrainingSession_scheduledAt_idx" ON "TrainingSession"("scheduledAt");

-- CreateIndex
CREATE INDEX "TrainingSession_status_idx" ON "TrainingSession"("status");

-- CreateIndex
CREATE INDEX "TrainingEnrollment_trainingProgramId_idx" ON "TrainingEnrollment"("trainingProgramId");

-- CreateIndex
CREATE INDEX "TrainingEnrollment_participantType_idx" ON "TrainingEnrollment"("participantType");

-- CreateIndex
CREATE INDEX "TrainingEnrollment_candidateId_idx" ON "TrainingEnrollment"("candidateId");

-- CreateIndex
CREATE INDEX "TrainingEnrollment_userId_idx" ON "TrainingEnrollment"("userId");

-- CreateIndex
CREATE INDEX "TrainingEnrollment_clientContactId_idx" ON "TrainingEnrollment"("clientContactId");

-- CreateIndex
CREATE INDEX "TrainingEnrollment_externalTrainingParticipantId_idx" ON "TrainingEnrollment"("externalTrainingParticipantId");

-- CreateIndex
CREATE INDEX "TrainingEnrollment_status_idx" ON "TrainingEnrollment"("status");

-- CreateIndex
CREATE INDEX "TrainingSessionParticipation_trainingEnrollmentId_idx" ON "TrainingSessionParticipation"("trainingEnrollmentId");

-- CreateIndex
CREATE INDEX "TrainingSessionParticipation_status_idx" ON "TrainingSessionParticipation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingSessionParticipation_trainingSessionId_trainingEnro_key" ON "TrainingSessionParticipation"("trainingSessionId", "trainingEnrollmentId");

-- CreateIndex
CREATE INDEX "ExternalTrainingParticipant_status_idx" ON "ExternalTrainingParticipant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalTrainingParticipant_normalizedEmail_key" ON "ExternalTrainingParticipant"("normalizedEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Document_currentVersionId_key" ON "Document"("currentVersionId");

-- CreateIndex
CREATE INDEX "Document_visibility_idx" ON "Document"("visibility");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "Document_ownerUserId_idx" ON "Document"("ownerUserId");

-- CreateIndex
CREATE INDEX "Document_candidateId_idx" ON "Document"("candidateId");

-- CreateIndex
CREATE INDEX "Document_clientId_idx" ON "Document"("clientId");

-- CreateIndex
CREATE INDEX "Document_recruitmentMissionId_idx" ON "Document"("recruitmentMissionId");

-- CreateIndex
CREATE INDEX "Document_missionCandidateId_idx" ON "Document"("missionCandidateId");

-- CreateIndex
CREATE INDEX "Document_messageId_idx" ON "Document"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_storageKey_key" ON "DocumentVersion"("storageKey");

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_idx" ON "DocumentVersion"("documentId");

-- CreateIndex
CREATE INDEX "DocumentVersion_createdByUserId_idx" ON "DocumentVersion"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNumber_key" ON "DocumentVersion"("documentId", "versionNumber");

-- CreateIndex
CREATE INDEX "Notification_recipientUserId_idx" ON "Notification"("recipientUserId");

-- CreateIndex
CREATE INDEX "Notification_actorUserId_idx" ON "Notification"("actorUserId");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

-- CreateIndex
CREATE INDEX "Notification_taskId_idx" ON "Notification"("taskId");

-- CreateIndex
CREATE INDEX "Notification_documentId_idx" ON "Notification"("documentId");

-- CreateIndex
CREATE INDEX "Conversation_type_idx" ON "Conversation"("type");

-- CreateIndex
CREATE INDEX "Conversation_status_idx" ON "Conversation"("status");

-- CreateIndex
CREATE INDEX "Conversation_relatedEntityType_relatedEntityId_idx" ON "Conversation"("relatedEntityType", "relatedEntityId");

-- CreateIndex
CREATE INDEX "ConversationMember_userId_idx" ON "ConversationMember"("userId");

-- CreateIndex
CREATE INDEX "ConversationMember_active_idx" ON "ConversationMember"("active");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMember_conversationId_userId_key" ON "ConversationMember"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "Message_authorUserId_idx" ON "Message"("authorUserId");

-- CreateIndex
CREATE INDEX "Message_status_idx" ON "Message"("status");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_targetUserId_idx" ON "AuditLog"("targetUserId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_commercialOwnerUserId_fkey" FOREIGN KEY ("commercialOwnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateDocument" ADD CONSTRAINT "CandidateDocument_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateDocument" ADD CONSTRAINT "CandidateDocument_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateDocument" ADD CONSTRAINT "CandidateDocument_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "CandidateDocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateDocumentVersion" ADD CONSTRAINT "CandidateDocumentVersion_candidateDocumentId_fkey" FOREIGN KEY ("candidateDocumentId") REFERENCES "CandidateDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateDocumentVersion" ADD CONSTRAINT "CandidateDocumentVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentMission" ADD CONSTRAINT "RecruitmentMission_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionRecruiter" ADD CONSTRAINT "MissionRecruiter_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "RecruitmentMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionRecruiter" ADD CONSTRAINT "MissionRecruiter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionCandidate" ADD CONSTRAINT "MissionCandidate_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "RecruitmentMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionCandidate" ADD CONSTRAINT "MissionCandidate_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_missionCandidateId_fkey" FOREIGN KEY ("missionCandidateId") REFERENCES "MissionCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEvaluation" ADD CONSTRAINT "CandidateEvaluation_missionCandidateId_fkey" FOREIGN KEY ("missionCandidateId") REFERENCES "MissionCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEvaluation" ADD CONSTRAINT "CandidateEvaluation_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEvaluation" ADD CONSTRAINT "CandidateEvaluation_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientContactId_fkey" FOREIGN KEY ("clientContactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_recruitmentMissionId_fkey" FOREIGN KEY ("recruitmentMissionId") REFERENCES "RecruitmentMission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_missionRecruiterId_fkey" FOREIGN KEY ("missionRecruiterId") REFERENCES "MissionRecruiter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_missionCandidateId_fkey" FOREIGN KEY ("missionCandidateId") REFERENCES "MissionCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_trainingProgramId_fkey" FOREIGN KEY ("trainingProgramId") REFERENCES "TrainingProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_trainingEnrollmentId_fkey" FOREIGN KEY ("trainingEnrollmentId") REFERENCES "TrainingEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_trainingSessionParticipationId_fkey" FOREIGN KEY ("trainingSessionParticipationId") REFERENCES "TrainingSessionParticipation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingProgram" ADD CONSTRAINT "TrainingProgram_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_trainingProgramId_fkey" FOREIGN KEY ("trainingProgramId") REFERENCES "TrainingProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_trainerUserId_fkey" FOREIGN KEY ("trainerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEnrollment" ADD CONSTRAINT "TrainingEnrollment_trainingProgramId_fkey" FOREIGN KEY ("trainingProgramId") REFERENCES "TrainingProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEnrollment" ADD CONSTRAINT "TrainingEnrollment_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEnrollment" ADD CONSTRAINT "TrainingEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEnrollment" ADD CONSTRAINT "TrainingEnrollment_clientContactId_fkey" FOREIGN KEY ("clientContactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEnrollment" ADD CONSTRAINT "TrainingEnrollment_externalTrainingParticipantId_fkey" FOREIGN KEY ("externalTrainingParticipantId") REFERENCES "ExternalTrainingParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSessionParticipation" ADD CONSTRAINT "TrainingSessionParticipation_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSessionParticipation" ADD CONSTRAINT "TrainingSessionParticipation_trainingEnrollmentId_fkey" FOREIGN KEY ("trainingEnrollmentId") REFERENCES "TrainingEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_recruitmentMissionId_fkey" FOREIGN KEY ("recruitmentMissionId") REFERENCES "RecruitmentMission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_missionCandidateId_fkey" FOREIGN KEY ("missionCandidateId") REFERENCES "MissionCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_trainingEnrollmentId_fkey" FOREIGN KEY ("trainingEnrollmentId") REFERENCES "TrainingEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recruitmentMissionId_fkey" FOREIGN KEY ("recruitmentMissionId") REFERENCES "RecruitmentMission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_missionCandidateId_fkey" FOREIGN KEY ("missionCandidateId") REFERENCES "MissionCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_trainingEnrollmentId_fkey" FOREIGN KEY ("trainingEnrollmentId") REFERENCES "TrainingEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


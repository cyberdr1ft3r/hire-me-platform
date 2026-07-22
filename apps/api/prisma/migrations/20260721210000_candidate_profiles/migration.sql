-- Candidate master profile fields
ALTER TABLE "Candidate"
ADD COLUMN "firstName" TEXT,
ADD COLUMN "lastName" TEXT,
ADD COLUMN "normalizedPhone" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "country" TEXT,
ADD COLUMN "currentJobTitle" TEXT,
ADD COLUMN "professionalSummary" TEXT,
ADD COLUMN "sourceDetail" TEXT,
ADD COLUMN "consentRecordedAt" TIMESTAMP(3),
ADD COLUMN "availabilityNotice" TEXT,
ADD COLUMN "salaryExpectationCurrency" TEXT;

CREATE INDEX "Candidate_source_idx" ON "Candidate"("source");
CREATE INDEX "Candidate_city_idx" ON "Candidate"("city");
CREATE INDEX "Candidate_country_idx" ON "Candidate"("country");
CREATE INDEX "Candidate_currentJobTitle_idx" ON "Candidate"("currentJobTitle");

-- Structured candidate profile children
CREATE TABLE "CandidateSkill" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "level" TEXT,
    "years" INTEGER,
    "lastUsed" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateSkill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CandidateLanguage" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "proficiency" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateLanguage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CandidateWorkExperience" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "employer" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" TEXT,
    "endDate" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateWorkExperience_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CandidateEducation" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "institution" TEXT NOT NULL,
    "qualification" TEXT NOT NULL,
    "field" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "description" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateEducation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CandidateSkill_candidateId_idx" ON "CandidateSkill"("candidateId");
CREATE INDEX "CandidateSkill_name_idx" ON "CandidateSkill"("name");
CREATE INDEX "CandidateLanguage_candidateId_idx" ON "CandidateLanguage"("candidateId");
CREATE INDEX "CandidateLanguage_language_idx" ON "CandidateLanguage"("language");
CREATE INDEX "CandidateWorkExperience_candidateId_idx" ON "CandidateWorkExperience"("candidateId");
CREATE INDEX "CandidateWorkExperience_employer_idx" ON "CandidateWorkExperience"("employer");
CREATE INDEX "CandidateWorkExperience_title_idx" ON "CandidateWorkExperience"("title");
CREATE INDEX "CandidateEducation_candidateId_idx" ON "CandidateEducation"("candidateId");
CREATE INDEX "CandidateEducation_institution_idx" ON "CandidateEducation"("institution");
CREATE INDEX "CandidateEducation_qualification_idx" ON "CandidateEducation"("qualification");

ALTER TABLE "CandidateSkill" ADD CONSTRAINT "CandidateSkill_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CandidateLanguage" ADD CONSTRAINT "CandidateLanguage_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CandidateWorkExperience" ADD CONSTRAINT "CandidateWorkExperience_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CandidateEducation" ADD CONSTRAINT "CandidateEducation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

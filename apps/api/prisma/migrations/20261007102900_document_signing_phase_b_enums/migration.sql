-- Issue #143 Phase B: enum extensions (separate migration for PostgreSQL enum commit safety).

CREATE TYPE "SignatureValidationOverallResult" AS ENUM ('VALID', 'INVALID', 'INDETERMINATE');

ALTER TYPE "DocumentVersionSource" ADD VALUE IF NOT EXISTS 'signed';
ALTER TYPE "SigningRequestState" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "SigningRequestState" ADD VALUE IF NOT EXISTS 'VALIDATION_REJECTED';

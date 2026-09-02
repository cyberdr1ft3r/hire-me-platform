# Current Agent Handoff

Last updated: 2026-09-02

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issue #31 is complete; PR #32 merged task management, reminders, comments, and notifications into `main` as commit `621976272e7029b8bbca962684c8ad074b5e7ef8`.
- Issue #35 is active on branch `feat/document-management` in existing PR #40.
- Issue #35 incorporates Issue #12: `CONTRAT_RECRUTEMENT` and `CONTRAT_FORMATION` are distinct document taxonomy values and must not be collapsed into a generic contract type.
- PR #40 post-integration review identified a Task-to-Document authorization gap after Issue #31 and Issue #35 were combined.
- Current implemented document contexts are client, candidate, recruitment mission, mission-candidate process, and interview. Context IDs are validated server-side for existence, archival state, relationship consistency, and linked record scope.
- Mission, process, and interview document scope overrides are context-specific. DOCX/XLSX validation uses bounded OOXML ZIP-package validation rather than string-spoofable `PK` checks.
- Task create/update document context links must use the centralized document policy: `documents:view`, visibility/owner rules, and linked-context scope. Task and notification responses may keep the task visible but must redact `documentId` unless the actor can independently view that document at read time.
- Candidate CV and public-application upload behavior remains on `CandidateDocument` / `CandidateDocumentVersion`.
- Template rendering, e-signature, external portals, accounting/commercial records, training operations, external notifications, private messages/groups, email, WhatsApp, and calendar delivery remain out of scope.

## Next Action

Record the new exact-head CI run for PR #40, update the PR body with the new head SHA and PostgreSQL integration test count, and keep PR #40 open and unmerged for human review.

## Mandatory Rehydration Checklist For Every New Agent

Before working:

- Read `AGENTS.md`.
- Read `PROJECT_MEMORY.md`.
- Read `docs/project/STATUS.md`.
- Read `docs/project/DECISIONS.md`.
- Read this handoff.
- Read the full assigned issue and all comments.
- Inspect relevant merged documentation and active pull requests.
- Load all materially applicable project skills, including `project-memory`.
- State the active skills and current source-of-truth understanding.

Before finishing:

- Update `STATUS.md`.
- Replace this handoff with the next concrete action.
- Update the decision and risk logs when applicable.
- Link the issue or pull request that supports changes.
- Report checks performed and remaining blockers.

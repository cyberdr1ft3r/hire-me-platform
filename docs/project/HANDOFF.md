# Current Agent Handoff

Last updated: 2026-09-01

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issue #31 is complete; PR #32 merged task management, reminders, comments, and notifications into `main` as commit `621976272e7029b8bbca962684c8ad074b5e7ef8`.
- Issue #35 is active on branch `feat/document-management` in existing PR #40.
- Issue #35 incorporates Issue #12: `CONTRAT_RECRUTEMENT` and `CONTRAT_FORMATION` are distinct document taxonomy values and must not be collapsed into a generic contract type.
- PR #40 now needs post-`main` integration validation so the final branch contains both the merged Issue #31 task-management functionality and the Issue #35 centralized `Document` / `DocumentVersion` foundation.
- Current implemented document contexts are client, candidate, recruitment mission, mission-candidate process, and interview. Context IDs are validated server-side for existence, archival state, relationship consistency, and linked record scope.
- Mission, process, and interview document scope overrides are context-specific. DOCX/XLSX validation uses bounded OOXML ZIP-package validation rather than string-spoofable `PK` checks.
- Candidate CV and public-application upload behavior remains on `CandidateDocument` / `CandidateDocumentVersion`.
- Template rendering, e-signature, external portals, accounting/commercial records, training operations, external notifications, private messages/groups, email, WhatsApp, and calendar delivery remain out of scope.

## Next Action

Finish resolving and validating PR #40 against latest `main`, update the PR body with the integrated head SHA and CI evidence, and keep PR #40 open and unmerged for human review.

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

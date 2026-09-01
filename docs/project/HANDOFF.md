# Current Agent Handoff

Last updated: 2026-09-01

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issue #35 is active on branch `feat/document-management` in existing draft PR #40.
- Issue #35 incorporates Issue #12: `CONTRAT_RECRUTEMENT` and `CONTRAT_FORMATION` are distinct document taxonomy values and must not be collapsed into a generic contract type.
- The branch implements the internal centralized `Document` / `DocumentVersion` foundation with permission-code guarded API endpoints, shared contracts, minimal internal web controls, safe audit metadata, server-generated protected storage keys, immutable uploaded versions, authorized download, and database-level document list visibility.
- Current implemented document contexts are client, candidate, recruitment mission, mission-candidate process, and interview. Context IDs are validated server-side for existence, archival state, relationship consistency, and linked record scope.
- The final PR #40 follow-up corrects the remaining head `6457bdabb9e77914fdc56003a78e93a644a45bab` blockers by making mission, process, and interview document scope overrides context-specific and by validating DOCX/XLSX as bounded OOXML ZIP packages instead of accepting string-spoofed `PK` payloads.
- Candidate CV and public-application upload behavior remains on `CandidateDocument` / `CandidateDocumentVersion`.
- Template rendering, e-signature, external portals, accounting/commercial records, training operations, and Issue #31 task-management features remain out of scope.

## Next Action

Keep PR #40 open, draft, and unmerged for human review once the latest exact-head validation evidence is recorded in the draft PR.

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

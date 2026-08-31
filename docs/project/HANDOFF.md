# Current Agent Handoff

Last updated: 2026-08-31

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issue #35 is the active implementation task on branch `feat/document-management`, based on current `origin/main`.
- Issue #35 incorporates Issue #12: `CONTRAT_RECRUTEMENT` and `CONTRAT_FORMATION` are distinct document taxonomy values and must not be collapsed into a generic contract type.
- The branch implements the internal centralized `Document` / `DocumentVersion` foundation with permission-code guarded API endpoints, shared contracts, minimal internal web controls, safe audit metadata, server-generated protected storage keys, immutable uploaded versions, and authorized download.
- Current implemented document contexts are client, candidate, recruitment mission, mission-candidate process, and interview. Context IDs are validated server-side for existence, archival state, and relationship consistency.
- Candidate CV and public-application upload behavior remains on `CandidateDocument` / `CandidateDocumentVersion`.
- Template rendering, e-signature, external portals, accounting/commercial records, training operations, and Issue #31 task-management features remain out of scope.

## Next Action

Complete validation for Issue #35, push a new commit, open one draft PR linked with `Closes #35`, and keep it draft/open/unmerged.

Validation still needs real PostgreSQL. Local Docker Desktop was unavailable in this workspace, so the required database validation must run after Docker is started locally or through GitHub Actions on the pushed branch.

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

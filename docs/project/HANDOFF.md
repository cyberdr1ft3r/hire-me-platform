# Current Agent Handoff

Last updated: 2026-09-01

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issue #35 is the active implementation task on branch `feat/document-management` in existing draft PR #40.
- Issue #35 incorporates Issue #12: `CONTRAT_RECRUTEMENT` and `CONTRAT_FORMATION` are distinct document taxonomy values and must not be collapsed into a generic contract type.
- The branch implements the internal centralized `Document` / `DocumentVersion` foundation with permission-code guarded API endpoints, shared contracts, minimal internal web controls, safe audit metadata, server-generated protected storage keys, immutable uploaded versions, and authorized download.
- Current implemented document contexts are client, candidate, recruitment mission, mission-candidate process, and interview. Context IDs are validated server-side for existence, archival state, and relationship consistency.
- The active blocking-review correction enforces document visibility consistently across list, detail, version, download, and mutation paths; moves list visibility into the database predicate; re-checks exact service operation permissions; makes metadata/archive audit atomic with mutations; repairs DOCX/XLSX file validation; preserves safe original filename metadata separately from sanitized download filenames; and applies strict base64/raw-size upload bounds.
- Candidate CV and public-application upload behavior remains on `CandidateDocument` / `CandidateDocumentVersion`.
- Template rendering, e-signature, external portals, accounting/commercial records, training operations, and Issue #31 task-management features remain out of scope.

## Next Action

Finish validation for the PR #40 blocking-review correction, push a new commit whose head differs from `36f06dcd83297ba10db70e0b3e08c1b76f6df8f6`, update the existing draft PR #40 with the new head/test/Actions details, and keep it draft/open/unmerged.

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

# Current Agent Handoff

Last updated: 2026-09-02

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issue #31 (PR #32) and Issue #35 (PR #40) are merged into `main`.
- Issue #36 recruitment reporting is implemented on branch `feat/recruitment-reporting` as a draft PR. It is read-only, computed from existing authoritative records, and adds no schema migration.
- New API module: `apps/api/src/reporting` with permission-guarded `GET /v1/reporting/recruitment` endpoints (`summary`, `pipeline`, `trends`, `breakdowns`, `drilldown`, `export.csv`). Shared contracts in `packages/contracts/src/reporting.ts`.
- Record scope reuses the mission-candidate oversight model: broad requires `mission_candidates:transfer`, otherwise active `MissionRecruiter` assignment. Filters only narrow; out-of-scope/unknown IDs return identical empty results and status (no existence disclosure).
- Reporting never exposes salary/compensation, commercial, confidential evaluation, internal-note, storage, or secret fields. CSV export requires `reporting:recruitment:export`, is bounded/deterministic, neutralizes formula injection, and is audited with safe metadata only.
- Two seed permissions added (`reporting:recruitment:view`, `reporting:recruitment:export`) for `SUPER_ADMIN`/`ADMIN`/`HR_MANAGER`. KPI definitions documented in `docs/reporting.md`.
- Issue #38 (commercial/accounting) may proceed in parallel; Issue #36 avoids commercial/accounting code and schema. Issue #39 remains blocked by Issue #38.
- Reporting explicitly excludes revenue/accounting/profitability, training analytics, and task-productivity analytics. Those must not reuse the recruitment KPI names with different semantics.

## Next Action

Record the exact-head GitHub Actions result for the Issue #36 draft PR (`feat/recruitment-reporting`), keep it open and unmerged for human/ChatGPT review, and address review findings. Do not touch Issue #38 commercial/accounting scope.

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

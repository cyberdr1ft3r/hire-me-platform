# Current Agent Handoff

Last updated: 2026-09-04

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current Situation

- Issue #31 (PR #32), Issue #35 (PR #40), and Issue #36 (PR #43) are merged into `main`.
- Issue #37 is implemented on branch `feat/training-operations` and opened as a draft PR. The branch base was `main` at `cebd87ffa0f3686418e2244570a1b1d40f995541` (PR #44 coordination rules). Latest `main` at `6ff19ad2a03f3f6dc6bdbbf00be9db68d6779a2a` (PR #43 recruitment reporting) has been merged into the branch; both the merged reporting behavior and the Issue #37 training behavior are preserved.
- Issue #37 builds the internal training-operations module on the existing `TrainingProgram`, `TrainingSession`, `TrainingEnrollment`, and `TrainingSessionParticipation` records. No parallel training model exists.
- The only schema change is the additive migration `20260904143000_training_operations_foundation`. No existing migration was edited, renamed, or reordered.
- Program, session, and participation lifecycles follow `docs/workflows.md` exactly. Enrollment adds one documented extension: an explicit authorized withdrawal to `canceled` from any active state, required by Issue #37 and recorded in decision D-049.
- Training authorization combines capability plus server-side record scope. `training_programs:view_all` is the separate broad oversight capability, and client-linked programs additionally require `clients:view` in both the list predicate and the detail path.
- Attendance correction is a separate capability from recording attendance, always carries a reason, and is audited.
- Certificate readiness is a derived durable boundary only. Issue #37 generates no certificate, no contract file, and no `Document` records for training.
- Issue #38 (commercial/accounting, including training commercial records) is being implemented concurrently by another agent. Issue #37 does not depend on that branch and implements no pricing, billing, invoicing, payment, revenue, or profitability behavior. The stable training identifiers a later commercial feature can consume are the training program id and reference, the training session id, and the training enrollment id.
- Local validation for Issue #37 used a dedicated PostgreSQL database because a concurrent agent reset the shared development database during the task. See risk R-028.

## Next Action

Review the Issue #37 draft PR, confirm exact-head GitHub Actions, and keep the PR open and unmerged. Then require whichever remaining Prisma-heavy branch merges after Issue #37 to incorporate latest `main` and rerun a clean-database migration, double seed, and full integration suite before merge.

## Known Follow-Up Work For Training

Not implemented by Issue #37 and still requiring their own approved issues:

- Detailed assessment, exam, or lesson content and any LMS behavior.
- Certificate or training-contract file generation, rendering, templates, and distribution.
- Training pricing, quotations, invoicing, payments, revenue, and profitability (Issue #38 / Phase 8).
- Training analytics and reporting KPIs. Issue #36 deliberately excludes training analytics, and training KPI names must not reuse recruitment KPI names with different semantics.
- Satisfaction and follow-up workflows beyond their existing lifecycle states.
- Calendar, email, or WhatsApp delivery for training sessions.
- Any learner or client-facing training portal.

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

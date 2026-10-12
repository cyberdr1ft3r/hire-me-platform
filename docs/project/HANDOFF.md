# Current Agent Handoff

Last updated: 2026-10-12

## Current situation

- **R-036 Task reminder scheduler:** PR A (#173) and PR B (#177) merged on `main`. **Issue #178 PR C (draft):** operations runbook, AuditLog + lag observability, example systemd templates, UI diagnostic wording. **Staging evidence: BLOCKED / NOT EXECUTED** — see `docs/runbooks/task-reminder-scheduler-staging-evidence.md`. Do **not** close R-036 until staging checklist is satisfied on a real host.

- **D-068 / D-070:** runbook `RUNBOOK_READY`; no production execution.

- **Messaging V1:** **D-087 Proposed** (PR #165 preflight).

- **Issue #163:** draft PR #164 Finance visibility preflight (**D-086 Proposed**).
- **Issue #183:** draft **PR #185** — SoftHSM PKCS#11 lab; maintainer review blockers addressed (runtime smoke PINs, on-token certificate discovery/`CKA_ID` binding, required-mode CI); awaiting re-review; architecture-only proof. **#147 C2 state unchanged** (`READY_TO_CONTACT_PROVIDER`); **Ready for provider implementation: NO**.

## Next concrete action

1. Re-review **Issue #178** draft PR #181 (material `failureNotRecorded`, deployment-neutral systemd template/runbook, latest `main` merged) when exact-head CI is green.
2. On staging: deploy timer + worker, capture sanitized evidence per runbook staging gate, then mark R-036 mitigated/closed.
3. Optional future: dedicated PostgreSQL worker role after query footprint sign-off.

- **Issue #182 (R-049):** draft PR implements external Training participant management, EXTERNAL enrollment UI, and Training program/session deep links; review exact-head CI and ChatGPT architecture/security review when green.

- **D-068 operator inspection:** execute only the runbook's read-only topology/config checks and synthetic honeypot probe matrix under an approved production session; record sanitized evidence.
- **D-070 production migration:** only after a named release/window, verified backup, exact pending migration list, and prechecks. Migrate DB before deploying a D-070 build; on any failure/cancel, inspect for partial schema before `migrate resolve` or retry.

## Completion conditions for R-036 close

- PR C merged and reviewed.
- Staging evidence checklist in `docs/runbooks/task-reminder-scheduler.md` completed with real (sanitized) proof.
- No fabricated `systemctl`/journal artifacts in Git.

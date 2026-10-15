# Current Agent Handoff

Last updated: 2026-10-15

## Current situation

- **Next: review Issue #198 frontend lazy routes (Phase B1)** — draft PR on
  `cursor/issue-198-lazy-routes-cf71` for route-level `React.lazy` after PR #207 (`bdfbf5f`);
  evidence in [`issue-198-frontend-lazy-routes`](../audit/issue-198-frontend-lazy-routes.md).
  Confirm exact-head CI, then ChatGPT review. Console B0/B2 only after approval.

- **Merged: Issue #204 Clients Workspace v2.0** (PR #207, `bdfbf5f`). Optional human sign-off;
  [evidence](../audit/issue-204-clients-workspace-v2.md).

- **Merged: Missions Workspace v2.0** (PR #206, `4890f9b`). Human sign-off pending;
  [evidence](../audit/issue-204-missions-workspace-v2.md).

- **Merged: Candidates Workspace v2.0** (PR #205, `e2ff257`). Applications for a
  candidate stay deferred (needs a cross-mission backend read).

- **Merged:** PR #203 (Issue #202 Scope A, shared request core) into the integration
  branch, and #194 (integration) into `main` at `14fc745`. Still to decide: the
  cross-tab refresh follow-up (R-059) and Scope B (refresh limiter keying, proxy hops,
  R-055), as separate issues.

- **Next: Issue #198 Console Workspace sign-off.** Review the documentation-only draft
  PR #200 (preflight, D-089 proposal, interaction matrix, baseline). Completion requires
  maintainer answers to the ADR open questions and clickable interaction evidence.
  Phase B0 (request core) and B1 (lazy routes) are the first implementation PRs, only
  after approval. No merge/deploy automatically.
  Integration `c625018` (#199 and #201 merged) is merged into the branch; the
  preflight records what those changes alter in the baseline findings.

- **Merged: Issue #196 creation drawers** (PR #201, merge `c625018`, after integrating
  `542bbf0` with both memory sections kept). Remaining: human review of the EN/FR
  drawer evidence and real-device mobile keyboard check (R-056). Do not close #196:
  the utility bar/wordmark scope remains.

- **Merged: Issue #196 Notification Center Phase 1** (PR #199, merge `542bbf0`). The
  compact AppShell popover merges the existing notification and unread-conversation DTOs,
  keeps independent source read state and deep-links through the membership-scoped
  Messages read. See [the architecture audit](../design/notification-center-phase-1.md).
  Remaining: physical mobile and screen-reader acceptance. Utility Bar, Notes and
  branding stay outside it.

- **Next: review Workspace Surface v1.0** on `feat/workspace-surface-v1` (draft PR into
  `fix/ui-refinement-demo-20261013`). Completion requires exact-head CI, human visual
  review of the Messages/Candidates before/after evidence and a real-device check of
  the Messages composer with a mobile keyboard (R-056). Then migrate Commercial and
  Accounting per the addendum's order, one PR each. No merge/deploy automatically.

- **Next: review AppShell v1.2** on `feat/appshell-v1-2`, stacked on #194 head
  `ffc7fa2`. See the [proposed navigation addendum](../design/HIREME_UI_DNA_v1.2-navigation-proposed.md).
  Completion requires exact-head CI, 1440/1024/768/390 EN/FR screenshots with real
  panel-width gain on collapse, keyboard/RBAC/history checks and human visual
  review. Keep the follow-up draft; merge #194 first or explicitly rebase after
  its disposition. No automatic merge/deploy or backend changes.

- **UI refinement demonstration:** isolated branch `fix/ui-refinement-demo-20261013`
  on main `283c18a` (PR #193 merged). Review the small frontend commits and
  [verification/screenshot evidence](../audit/ui-refinement-20261013.md). Web 889
  and contracts 70 tests pass; static checks and build pass. Complete exact-head
  CI and human review before merging. The local Windows native PKCS#11 limitation
  is documented. No backend/schema/source authorization or production changes.
  Earlier historical draft references below are not an open-PR inventory; the
  repository's open-PR list was empty when this sprint began.

- **R-036 Task reminder scheduler:** PR A (#173) and PR B (#177) merged on `main`. **Issue #178 PR C (draft):** operations runbook, AuditLog + lag observability, example systemd templates, UI diagnostic wording. **Staging evidence: BLOCKED / NOT EXECUTED** — see `docs/runbooks/task-reminder-scheduler-staging-evidence.md`. Do **not** close R-036 until staging checklist is satisfied on a real host.

- **D-068 / D-070:** runbook `RUNBOOK_READY`; no production execution.

- **Messaging V1:** **D-087 Proposed** (PR #165 preflight). **Issue #171 PR A merged (#174).** **Issue #179 PR B merged (#187).** **Issue #188 hide API merged (#192).** **Issue #189 PR C (draft PR #193):** bilingual `/messages` workspace, AppShell unread badge, preview-free list rows, PRIVATE hide, polling-only sync, filter-aware list reconciliation on poll refresh. Branch includes `main` `7f92fd5` (retention runbook #191). No migration, no seed/catalog change. **Next:** exact-head CI on reconciliation commit; ChatGPT final merge review.

- **Issue #163** (R-050/R-051): preflight merged via PR #164 (**D-086**).
- **Issue #168** (D-086 backend): **Accepted; implemented/reviewed in PR #175** — `recruitment_financial_context:view` for `FINANCE_MANAGER`, shared financial mission scope across Commercial/Accounting/Documents/Generation/signing rechecks, bounded `financial-context` option routes, PostgreSQL security suite `apps/api/test/finance-recruitment-context.integration.test.ts`. No migration. **Issue #180 / PR #186 completes the reviewed Commercial/Accounting web pickers, including hybrid actors; R-050 is fully product-mitigated for that path.**
- **Issue #183:** draft **PR #185** — SoftHSM PKCS#11 lab; maintainer review blockers addressed (runtime smoke PINs, on-token certificate discovery/`CKA_ID` binding, required-mode CI); awaiting final merge review; architecture-only proof. **#147 C2 state unchanged** (`READY_TO_CONTACT_PROVIDER`); **Ready for provider implementation: NO**.
- **Issue #132 / #147:** Barid signing track unchanged; **Ready for provider implementation: NO**.
- **Missions #110 epic:** closed on `main` after **#159** / PR **#160**.

## Next concrete action

1. Re-review **Issue #178** draft PR #181 (material `failureNotRecorded`, deployment-neutral systemd template/runbook, latest `main` merged) when exact-head CI is green.
2. On staging: deploy timer + worker, capture sanitized evidence per runbook staging gate, then mark R-036 mitigated/closed.
3. Optional future: dedicated PostgreSQL worker role after query footprint sign-off.

- **Issue #182 (R-049):** draft PR implements external Training participant management, EXTERNAL enrollment UI, and Training program/session deep links; review exact-head CI and ChatGPT architecture/security review when green.

- **Issue #189 (Messaging PR C):** draft PR on `cursor/messaging-pr-c-web-f554`; review exact-head CI and ChatGPT architecture/security review when green. **Known limitation:** conversation list rows omit last-message preview until a safe API field exists (preflight §6 deferred).
- Before any production deploy, run `apps/api/diagnostics/messaging-legacy-rows.sql`; on any non-zero count follow `docs/runbooks/messaging-legacy-rows.md`. Broad rollout still needs an approved retention policy.

- **D-068 operator inspection:** execute only the runbook's read-only topology/config checks and synthetic honeypot probe matrix under an approved production session; record sanitized evidence.
- **D-070 production migration:** only after a named release/window, verified backup, exact pending migration list, and prechecks. Migrate DB before deploying a D-070 build; on any failure/cancel, inspect for partial schema before `migrate resolve` or retry.

## Completion conditions for R-036 close

- PR C merged and reviewed.
- Staging evidence checklist in `docs/runbooks/task-reminder-scheduler.md` completed with real (sanitized) proof.
- No fabricated `systemctl`/journal artifacts in Git.

## Issue #168 (D-086 backend) next actions

1. **D-086 backend + web path are accepted** through Issue #168 / PR #175 and Issue #180 / PR #186; preserve financial-context-first union semantics, dedicated Finance picker sources, and generic recruitment boundaries.
2. R-050 is fully product-mitigated for the reviewed Commercial mission/placement invoicing path.
3. R-051 remains partially open: Training expense contexts / profitability for Finance still need their own decision; not in #168/#180.
4. Maintainer C2 Barid outreach (#147) remains parallel.

## D-071 catalog guarantees

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.

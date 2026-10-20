# Current Agent Handoff

Last updated: 2026-10-20

## Current situation

- Latest B1 foundation is now merged into `main` at `0e0ae23cd0909085f1414fddda54588bd737f137`.
  Baseline Actions run `39435424188` failed only its Quality job; the other three required jobs
  passed. The reported failing test was `apps/web/src/App.test.tsx`,
  “loads read-only task lists without mutation controls.”
- CI-repair investigation established that this is a test synchronization issue at the lazy Tasks
  route boundary, not a permission, API mock, or status-filter defect: the route chunk and subsequent
  task-board request complete separately. On the exact baseline, the isolated test passed but the
  full web suite reproduced its failure before the task card rendered within the default one-second
  query. The CI-fix branch extends only this observed async query to a bounded five seconds and
  strengthens the test to open the authorized task and check read-only details. No production code
  has changed.
- Branch `fix/issue-232-readonly-tasks-ci` is dedicated to this repair. After the change, the target
  test passed in the full web run; the Windows run still had two unrelated failures (Admin save /
  confirmation timing and CSS line-ending expectation, 1103/1105 overall). WSL and Docker are
  inaccessible here, so the exact-head Linux Actions result is the required final gate.

- Latest verified `main` is `0e0ae23cd0909085f1414fddda54588bd737f137`; it includes merged PR #229, which
  records the accepted D-089 Phase A architecture with RV1/RV2. RV1 keeps tab identity in existing
  `history.state` with URL-only fallback and one navigation authority; RV2 guards only genuinely
  unsaved values. B2 must render only the active module; hidden Activity trees, response caching and
  sessionStorage restoration are out of scope.
- B0′ merged as PR #230 at `bb4ee927dddb93a13492c74ebe894e8df1d013b2`. Its dirty detection,
  multi-blocker navigation-guard behavior, and form coverage across Tasks, Training, Accounting,
  Commercial, Documents, Messages and Administration are preserved. Evidence:
  [B0′ audit](../audit/issue-228-b0-unsaved-input.md).
- B0′ exact-head Actions passed all four jobs on `d65009249d1084c8cec990d1a31a2752b947be5f`; its
  committed installed-Chrome audit is 20/20 on the hardened implementation. Browser checks could not
  be rerun during reconciliation because credentials and Docker access were unavailable.
- B1 PR #231 is merged in `main` at `0e0ae23cd0909085f1414fddda54588bd737f137`. No console tab UI
  exists; B2 remains gated on green main after the current CI repair and explicit authorization.

## Next concrete action

1. Complete the dedicated CI-repair branch checks and open a draft PR with root-cause evidence.
2. Verify all four required Actions jobs on its exact final SHA; stop at the CI-repair review
   checkpoint. Do not start B2, merge, or deploy.

## Completion conditions

- Read-only task UI remains visible with `tasks:view`; mutation controls remain absent at both list
  and detail levels.
- Repair PR remains draft/unmerged with all four exact-head jobs green before B2 can begin.
- No B2 implementation, merge, deployment, sidebar redesign, or unrelated work.

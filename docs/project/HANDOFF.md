# Current Agent Handoff

Last updated: 2026-10-06

## Current situation

- Latest `main` is **`29101c2`** (includes merged #132 preflight PR #134 and prior milestones).
- **Issue #141 (Phase A):** draft PR **#142** on `cursor/issue-141-signing-foundation-909e` — maintainer review corrections applied (actor-independent reconciliation, live source snapshot, atomic lifecycle/events, composite document/version FK). Await fresh exact-head CI after push.
- **Issue #132:** remains **open** (parent epic); Barid/provider confirmation still blocks provider-specific work (Phase C+).

## Next concrete action (Issue #141)

1. Confirm fresh exact-head CI green on PR #142 after review-correction commits.
2. ChatGPT/maintainer re-review of PR #142 (do **not** merge automatically).
3. If accepted, merge Phase A; open **Phase B** (validation + SIGNED publication) separately.

## Preserved unrelated follow-ups

- R-050: FINANCE_MANAGER mission-scope limits unchanged; signing must not grant `missions:view` as a workaround.
- Issue #109 flaky mission-candidate race test (non-blocking).
- D-068 production env/proxy verification; D-070 migration not deployed.

## D-071 catalog guarantees on `main`

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.

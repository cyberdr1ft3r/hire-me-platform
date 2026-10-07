# Current Agent Handoff

Last updated: 2026-10-07

## Current situation

- Latest `main` is **`29101c2`** (includes merged #132 preflight **PR #134** and prior milestones).
- **Issue #141 (Phase A):** draft PR **#142** on `cursor/issue-141-signing-foundation-909e` — architecture **maintainer-accepted**; final lifecycle regression coverage and **D-083 Accepted** docs reconciled; **awaiting maintainer merge only** (do **not** merge automatically).
- **Issue #132:** remains **open** (parent epic); provider-specific / Barid work remains blocked until separately approved.

## Next concrete action

**ChatGPT maintainer final merge of PR #142** (Issue #141 Phase A).

After merge, open **Phase B** (validation + SIGNED publication) as a **separate** issue/PR scope — not bundled with Phase A.

## Preserved unrelated follow-ups

- **R-050:** FINANCE_MANAGER mission-scope limits unchanged; signing must not grant `missions:view` as a workaround.
- Issue **#109** flaky mission-candidate race test (non-blocking; unrelated to signing).
- Issue **#110** Missions follow-ups.
- **D-068** production env/proxy verification; **D-070** migration not deployed in production.

## D-071 catalog guarantees on `main`

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.

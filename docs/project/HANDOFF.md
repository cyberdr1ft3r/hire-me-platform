# Current Agent Handoff

Last updated: 2026-10-09

## Current situation

- **Issue #150:** **complete** — merged via PR **#151** on `main` (nested pagination + client-contact selection).
- **Issue #152** (child of **#110**): bounded placement confirmation form — **draft PR open**; authority audit documents **eligibility SET permission: MISSING** (no new permission added); awaiting maintainer decision on commercial-eligibility write capability and ChatGPT review.
- **Issue #110:** **open** parent for remaining Missions V1+ items.
- **Issue #145 / #147:** Barid signing track unchanged; **Ready for provider implementation: NO**.

## Next concrete action

1. Maintainer decision on whether to add an explicit permission (or other capability) for setting `eligibleForInvoicing` at placement confirmation; until then web submits contract default `false` only.
2. Review and merge **Issue #152** draft PR when CI is green and review passes.
3. Continue **#110** with next scoped children (deadline filters, closure reason, read-only persona) after #152.

## Preserved unrelated follow-ups

- **R-050:** FINANCE_MANAGER mission-scope limits unchanged.
- **D-068** production env/proxy verification; **D-070** migration not deployed in production.

## D-071 catalog guarantees

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.

# Current Agent Handoff

Last updated: 2026-10-09

## Current situation

- **Issue #150** (child of **#110**): nested Missions pagination (assignments, interviews, evaluations) and searchable/paged client-contact invitation options — **draft PR open**, awaiting exact-head CI and ChatGPT review.
- **Issue #109:** **closed** — PR **#149** merged (deterministic MissionCandidate race integration test).
- **Issue #110:** **open** parent for remaining Missions V1+ items after #150.
- **Issue #145 / #147:** Barid signing track unchanged; **Ready for provider implementation: NO**.

## Next concrete action

1. Review and merge **Issue #150** draft PR when exact-head CI is green and review passes.
2. Continue **#110** with the next scoped child (placement confirmation fields, deadline filters, closure reason, or read-only persona — per issue sequencing).
3. Signing track: maintainer sends **#147 C2** questionnaire when ready; no Route A adapter until fixtures arrive.

## Preserved unrelated follow-ups

- **R-050:** FINANCE_MANAGER mission-scope limits unchanged.
- **D-068** production env/proxy verification; **D-070** migration not deployed in production.

## D-071 catalog guarantees

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.

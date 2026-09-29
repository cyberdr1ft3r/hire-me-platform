# Current Agent Handoff

Last updated: 2026-09-29

## Current situation

- Authoritative `main` is `94aba8808fabad4d57ba61789d3d53d4967621e8` (PR #107 / Issue #105 merged, after PR #106 / Issue #99 bilingual Missions workspace as `2c7bffa973d6974c95aa93c435b39211a1788a37`, PR #108 / Issue #103, PR #104 / Issue #93, and PR #101 / Issue #100).
- Issue #99 (Missions rollout) is **complete**: PR #106 merged. Missions lives in `apps/web/src/missions/`, is fully EN/FR and responsive, has no raw-ID controls, and uses the D-074 option sources (D-072 for new assignments). The candidate pipeline pages through every process. `missions` is no longer in `deferredEnglishRoutes`. It is web-only, with no backend, schema, or migration change.
- Remaining Missions limits (assignment, interview, and evaluation pagination; client-contact option cap; deadline filter; placement fields; closure-reason UX; read-only role) are recorded in R-047 and tracked in Issue #110 (non-blocking).
- Issue #102 Training preflight is complete. Issue #103 has merged (PR #108): it implements only the backend/contracts capability under D-073, so the Training UI rollout (Issue #111) is unblocked. It adds no permission or migration, does not edit `TrainingPanel`, and makes no bilingual Training claim. Candidate identity requires `candidates:view`; Client Contact identity requires both `clients:view` and `client_contacts:view`; hidden source identities are omitted from pickers and represented as `participantDisplay: null` on ordinary Training responses.
- Issue #105 is **complete**: PR #107 merged (reviewed head `48239faf8458104e3d69dbb2c176b379ea23371e`, exact-head CI `36591355990` green). Test infrastructure only. The D-071 catalog gate now enforces, after each pass: seeded Permission description, scope-type, and status drift 0; leftover test-created permissions 0; seeded RolePermission row replacement 0 and active-state drift 0. Integration: pass 1 363/363; reverse pass 2 without reseed 363/363.
- Issue #111 (bilingual Training workspace) is the current functional module rollout; it is open and no Training UI work has merged.
- Issue #113 (Documents as a contextual Document Center) is an open product correction in progress through draft PR #119; it is not merged.
- Issue #109 tracks the timing-based MissionCandidate archival/create race test flake; it is non-blocking and does not involve application behavior.
- D-068 production env/proxy body-size limits remain **unverified** operationally. D-070 production migration not run.

## Next concrete action

1. **Training rollout (Issue #111):** Issue #103 has merged; branch from the current `main` and consume the bounded sources; keep `/training` in `deferredEnglishRoutes` until the complete bilingual rollout is verified.
2. **Documents correction (Issue #113):** continue through draft PR #119 in parallel; merge only on maintainer approval after exact-head CI.
3. **Issue #110:** schedule the Missions follow-ups separately; do not fold them into other rollouts. **Issue #109:** make the MissionCandidate race test deterministic separately.
4. Preserve the Issue #93 seeded RolePermission row-identity guarantees and the Issue #105 seeded Permission metadata guarantees in every integration fixture.
5. Do **not** treat D-068 production proxy verification or D-070 production migration as closed.

## D-071 catalog guarantees on `main` (Issue #93 / PR #104, Issue #105 / PR #107)

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions without writing them, creates only missing codes (removed after the test file), and refuses an existing non-ACTIVE permission instead of reactivating it.
- Every integration change must keep, after both passes (second pass reverse order, no reseed): zero seeded Permission description, scope-type, and status drift; zero leftover test-created permissions; zero seeded RolePermission row replacement and active-state drift.

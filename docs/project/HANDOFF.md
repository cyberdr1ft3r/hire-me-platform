# Current Agent Handoff

Last updated: 2026-09-29

## Current situation

- Authoritative `main` is `39e8720e45220475de2373a47d1e7dd32b763ce8` (PR #108 / Issue #103 Training option sources merged, after PR #104 / Issue #93 and PR #101 / Issue #100).
- Issue #99 (Missions rollout) is **in review** through draft PR #106 on `cursor/issue-99-missions-bilingual-effe`. Missions lives in `apps/web/src/missions/`, is fully EN/FR, has no raw-ID controls, and uses the D-074 option sources (D-072 for new assignments). The candidate pipeline pages through every process. `missions` is no longer in `deferredEnglishRoutes`. It is web-only, with no backend, schema, or migration change.
- Remaining Missions limits (assignment, interview, and evaluation pagination; client-contact option cap; deadline filter; placement fields; closure-reason UX; read-only role) are recorded in R-047 and tracked in Issue #110.
- Issue #102 Training preflight is complete. Issue #103 has merged (PR #108): it implements only the backend/contracts capability under D-073, so the Training UI rollout is unblocked. It adds no permission or migration, does not edit `TrainingPanel`, and makes no bilingual Training claim. Candidate identity requires `candidates:view`; Client Contact identity requires both `clients:view` and `client_contacts:view`; hidden source identities are omitted from pickers and represented as `participantDisplay: null` on ordinary Training responses.
- D-068 production env/proxy body-size limits remain **unverified** operationally. D-070 production migration not run.

## Next concrete action

1. **Issue #99:** review PR #106 after exact-head CI and ChatGPT review; merge only on maintainer approval.
2. **Training rollout:** Issue #103 has merged; branch from the current `main` and consume the bounded sources; keep `/training` in `deferredEnglishRoutes` until the complete bilingual rollout is verified.
3. **Issue #110:** schedule the Missions follow-ups separately; do not fold them into other rollouts.
4. Preserve the Issue #93 seeded RolePermission row-identity guarantees in every integration fixture.
5. Do **not** treat D-068 production proxy verification or D-070 production migration as closed.

## Completion conditions for Issue #99

- Candidate pipeline page 2 reachable and selectable with >20 processes; stale page responses dropped; no stale process detail after paging.
- Latest `main` merged; full quality gates, D-071 two-pass PostgreSQL run with a clean catalog, and exact-head CI green.
- Draft PR #106 left open and unmerged.

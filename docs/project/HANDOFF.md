# Current Agent Handoff

Last updated: 2026-09-29

## Current situation

- Authoritative `main` is `94cb29b78642a3c1d5155082f58dbe1500c95f56` (PR #98 / Issue #97 Clients rollout merged).
- Issue #99 (Missions rollout) is **blocked** after Phase 1 discovery: the Mission assignment write has no permission-safe user picker source. No Missions UI implementation has started; `/missions` stays in `deferredEnglishRoutes`.
- Issue #100 adds that source (D-072): `GET /v1/missions/:missionId/assignment-user-options` under `mission_assignments:manage`, returning at most 20 `{id, displayName, email}` active, non-archived internal users ordered by `displayName` then `id`, with an optional `role` that omits only same-role active assignees; terminal/archived missions return `409 MISSION_TERMINAL`. Typed web client `listMissionAssignmentUserOptions` is added, not yet used by any UI. No migration, no new permission.
- D-068 production env/proxy body-size limits remain **unverified** operationally. D-070 production migration not run.

## Next concrete action

1. **Issue #100:** review and merge the draft PR after exact-head CI and ChatGPT review.
2. **Issue #99:** after #100 merges, branch from the new `main` and resume at Phase 2 (module extraction). Replace every raw-ID input using the Phase 1 matrix on Issue #99: clients list, candidates list, mission assignments (responsible recruiter, organizer, internal participants), client contacts, and the #100 source for new assignments. Do not use the Admin users list or Task user-options.
3. Continue Issue #93 seeded RolePermission identity cleanup separately.
4. Do **not** treat D-068 production proxy verification or D-070 production migration as closed.

## Completion conditions for Issue #99

- All rendered `/missions` sections bilingual; only `missions` removed from `deferredEnglishRoutes`.
- No UUID text inputs; server pagination and filters; Candidate/Clients-grade session and write safety with deferred-promise tests.
- D-071 disposable-DB browser evidence at 1440/1024/800/430/390 in EN and FR; exact-head CI green.

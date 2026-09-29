# Current Agent Handoff

Last updated: 2026-09-29

## Current situation

- Authoritative `main` is `80936daee7b5f8345ea9d1a328c2a2592344f0d1` (PR #104 / Issue #93 merged, above PR #101 / Issue #100 D-072 at `2faff040456dab3317812686ab90a1862fada538`).
- Issue #99 (Missions rollout) is **in review** through draft PR #106 on `cursor/issue-99-missions-bilingual-effe`. Missions lives in `apps/web/src/missions/`, is fully EN/FR, and has no raw-ID controls. Option sources follow D-073, including D-072 for new assignments. `missions` is no longer in `deferredEnglishRoutes`. It is web-only, with no backend, schema, or migration change.
- Accepted Missions limitations are recorded in R-047: first-page-only assignments and interviews, no deadline filter, fixed placement confirmation fields, and no seeded view-only role.
- D-068 production env/proxy body-size limits remain **unverified** operationally. D-070 production migration not run.

## Next concrete action

1. **Issue #99:** review PR #106 after exact-head CI and ChatGPT review; merge only on maintainer approval.
2. After #99 merges: open the bounded Training bilingual rollout issue per Issue #66 sequencing (Training → Commercial → Documents → Accounting → Admin), starting with a raw-ID discovery phase like Issue #99 Phase 1.
3. Decide whether R-047 follow-ups (full assignment/interview pagination, placement start date and invoicing flag, deadline filter) become their own issues.
4. Do **not** treat D-068 production proxy verification or D-070 production migration as closed.

## Completion conditions for the next rollout issue

- All rendered sections of the module bilingual; only that route removed from `deferredEnglishRoutes`.
- No UUID text inputs; every record reference from an existing permission-scoped source; missing sources raised as their own issue rather than broadening permissions.
- Session/context and write safety with deferred-promise tests; locale switch retains state without refetch.
- D-071 disposable-DB browser evidence at 1440/1024/800/430/390 in EN and FR; exact-head CI green; draft PR left open.

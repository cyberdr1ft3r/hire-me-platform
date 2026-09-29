# Current Agent Handoff

Last updated: 2026-09-29

## Current situation

- Authoritative `main` is `80936daee7b5f8345ea9d1a328c2a2592344f0d1` (PR #104 / Issue #93 test infrastructure merged, after PR #101 / Issue #100).
- Issue #99 Missions rollout continues independently now that its bounded assignment-option source has merged.
- Issue #102 Training preflight is complete. It found that Training UI rollout must not start until Issue #103 provides purpose-specific internal-user options, participation enrollment options, and redaction-safe participant presentation.
- Issue #103 implements only that backend/contracts capability under D-073. It adds no permission or migration, does not edit `TrainingPanel`, and makes no bilingual Training claim. Candidate identity requires `candidates:view`; Client Contact identity requires both `clients:view` and `client_contacts:view`; hidden source identities are omitted from pickers and represented as `participantDisplay: null` on ordinary Training responses.
- D-068 production env/proxy body-size limits remain **unverified** operationally. D-070 production migration not run.

## Next concrete action

1. **Issue #103:** complete review and merge only after exact-head CI. Do not start Training UI work from the feature branch.
2. **Issue #99:** continue the Missions rollout independently; do not mix its App/UI changes into Issue #103.
3. **Training rollout:** after Issue #103 merges, branch from the new `main` and consume the bounded sources; keep `/training` in `deferredEnglishRoutes` until the complete bilingual rollout is verified.
4. Preserve the Issue #93 seeded RolePermission row-identity guarantees in every integration fixture.
5. Do **not** treat D-068 production proxy verification or D-070 production migration as closed.

## Completion conditions for Issue #103

- Three statically guarded INTERNAL-user option routes and one session enrollment-option route expose at most 20 safe records.
- Enrollment and participation responses provide nullable redaction-safe participant presentation without weakening existing identifier redaction.
- Existing writes revalidate selections; full D-071 integration suite passes twice with the authorization catalog intact.
- No migration, permission, Training UI, or localization change; exact-head CI green.

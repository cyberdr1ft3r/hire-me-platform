# Current Agent Handoff

Last updated: 2026-09-29

## Current situation

- Authoritative `main` is `39e8720e45220475de2373a47d1e7dd32b763ce8` (PR #108 / Issue #103 Training option sources merged, after PR #104 / Issue #93 and PR #101 / Issue #100).
- Issue #99 Missions rollout continues independently now that its bounded assignment-option source has merged.
- Issue #102 Training preflight is complete. It found that Training UI rollout must not start until Issue #103 provides purpose-specific internal-user options, participation enrollment options, and redaction-safe participant presentation.
- Issue #103 has merged (PR #108): it implements only that backend/contracts capability under D-073, so the Training UI rollout is unblocked. It adds no permission or migration, does not edit `TrainingPanel`, and makes no bilingual Training claim. Candidate identity requires `candidates:view`; Client Contact identity requires both `clients:view` and `client_contacts:view`; hidden source identities are omitted from pickers and represented as `participantDisplay: null` on ordinary Training responses.
- D-068 production env/proxy body-size limits remain **unverified** operationally. D-070 production migration not run.

## Next concrete action

1. **Issue #99:** continue the Missions rollout independently.
2. **Training rollout:** Issue #103 has merged; branch from the current `main` and consume the bounded sources; keep `/training` in `deferredEnglishRoutes` until the complete bilingual rollout is verified.
3. Preserve the Issue #93 seeded RolePermission row-identity guarantees in every integration fixture.
4. **Issue #105** (test infrastructure only, independent of #99 and Training): review draft PR #107, which stops integration suites rewriting seeded Permission metadata; the D-071 catalog gate now fails on any seeded permission description, scope-type, or status drift and on leftover test-created permissions.
5. Do **not** treat D-068 production proxy verification or D-070 production migration as closed.

## Completion conditions for Issue #103

- Three statically guarded INTERNAL-user option routes and one session enrollment-option route expose at most 20 safe records.
- Enrollment and participation responses provide nullable redaction-safe participant presentation without weakening existing identifier redaction.
- Existing writes revalidate selections; full D-071 integration suite passes twice with the authorization catalog intact.
- No migration, permission, Training UI, or localization change; exact-head CI green.

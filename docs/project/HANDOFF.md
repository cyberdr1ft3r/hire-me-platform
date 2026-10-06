# Current Agent Handoff

Last updated: 2026-10-06

## Current situation

- Latest `main` is `4c0655d` (includes merged #116 / PR #138 and #117 / PR #137 / D-082).
- Issue #118: draft PR #139 — implementation and self-validating browser evidence are **complete** (reviewed implementation head `6d2f266`; evidence runner commit `3b77797`; **10/10** matrix PASS documented in `docs/audit/issue-118-missions-ia-evidence.md`; exact-head CI **green** on `6d2f266`, run `37454859605`).
- Unrelated document-generation flake fix: PR #140 (`cursor/issue-doc-gen-audit-redaction-909e`), not in #139 diff.
- Issue #109 / #110 non-blocking; D-068 / D-070 operational items still open.

## Next concrete action

1. **Issue #118:** ChatGPT maintainer **merge** of PR #139 after this docs-only project-memory reconciliation passes exact-head CI. Do not merge from agent tasks.
2. Preserve #116 reveal/focus and #117 picker/read-first rules in any follow-up edits.

## D-071 catalog guarantees on `main`

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.

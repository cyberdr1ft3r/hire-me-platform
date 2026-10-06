# Current Agent Handoff

Last updated: 2026-10-06

## Current situation

- Latest `main` is `4c0655d` (includes merged #116 stacked master-detail and #117 UI-DNA v1.1).
- Issue #118: draft PR #139 on `cursor/issue-118-missions-ia-909e`; implementation accepted in principle; final correction pass updates self-validating browser evidence and reconciles project memory.
- Browser evidence: executed PASS — 10 captures (1440 / 1024 / 800 / 430 / 390 × EN / FR); manifest `/opt/cursor/artifacts/issue118-evidence/manifest.json`; audit `docs/audit/issue-118-missions-ia-evidence.md`.
- Unrelated document-generation flake fix: PR #140 (`cursor/issue-doc-gen-audit-redaction-909e`), not in #139 diff.
- Prior exact-head CI on `7595ff3`: run `37444701933` (green). Fresh CI required on new correction head after push.
- Issue #109 / #110 non-blocking; D-068 / D-070 operational items still open.

## Next concrete action

1. **Issue #118:** ChatGPT maintainer review on PR #139; merge when satisfied. Do not merge from agent tasks.
2. Preserve #116 reveal/focus and #117 picker/read-first rules in any follow-up edits.

## D-071 catalog guarantees on `main`

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.

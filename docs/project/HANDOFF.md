# Current Agent Handoff

Last updated: 2026-10-05

## Current situation

- Latest `main` is `4c0655d` (includes merged #116 stacked master-detail and #117 UI-DNA v1.1).
- Issue #118 Missions IA/composition: branch `cursor/issue-118-missions-ia-909e` head `3abf317`; PR #139; exact-head CI run [37339464281](https://github.com/cyberdr1ft3r/hire-me-platform/actions/runs/37339464281) **green** (includes unrelated audit-test flake fix in `document-generation.integration.test.ts`).
- Browser matrix script: `scripts/issue-118-missions-ia-evidence.mjs` still not run in cloud agent VM (no Docker).
- Issue #109 / #110 non-blocking; D-068 / D-070 operational items still open.

## Next concrete action

1. **Issue #118:** Run Chromium evidence at 1440/1024/800/430/390 EN/FR on a machine with Docker; attach metrics to PR; wait for exact-head CI green.
2. ChatGPT review on draft PR; do not merge until browser gate and CI complete.
3. Preserve #116 reveal/focus and #117 picker/read-first rules in any follow-up edits.

## D-071 catalog guarantees on `main`

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.

# Current Agent Handoff

Last updated: 2026-10-06

## Current situation

- Latest `main` is **`bcf4b42`** (merged #118 Missions IA, #140 doc-gen audit test fix, #116/#117, Accounting #131, Agenda/Meetings #124, Documents #119, and earlier milestones).
- **Issue #132:** design/preflight only — PR **#134** on `docs/issue-132-signing-preflight`. Re-audited document generation and Documents/Commercial surfaces on `bcf4b42`; [preflight report](../design/issue-132-electronic-signature-preflight.md). **No implementation** in this PR. Issue #132 **open**.
- Issue #109 / #110 non-blocking; D-068 / D-070 operational items still open.

## Next concrete action (Issue #132)

1. Maintainer review of PR #134 preflight (domain model, permissions, threat model, provider questions, phased PR plan).
2. Obtain **written** Barid/integration answers (token model, PKCS#11/CSP, PDF/PAdES, timestamp onboarding, test token/sandbox) before any provider adapter PR.
3. Do **not** start schema/migrations or signing libraries until preflight is accepted and phased PR A is scoped as its own issue.

## Preserved unrelated follow-ups

- R-050: FINANCE_MANAGER mission-scope limits unchanged; signing must not grant `missions:view` as a workaround.
- D-068 production env/proxy verification; D-070 migration not deployed.

## D-071 catalog guarantees on `main`

- `ensurePermissionForTest()` reuses seeded ACTIVE permissions; never reactivate non-ACTIVE seeded permissions.
- After both integration passes: zero seeded Permission/RolePermission drift; provision with `C.UTF-8` collation.

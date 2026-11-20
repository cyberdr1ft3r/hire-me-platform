# Current Agent Handoff

Last updated: 2026-11-20

## Internal product UX stabilization

Review the #260 access overview draft and its real-browser regression. The #277 Training Reference
correction is being forward-ported onto the #274/#276 UX stack. After browser verification and CI,
address #259 Administration Users in its own batch, preserving effective privileges and the
last-SUPER_ADMIN safeguards. #258 Billing stays separately scoped. Run #261 after the
remaining Administration UX work.

## Executive Dashboard V1

Review the Dashboard draft and exact-head CI. Validate the existing role grants with business owners before expanding widget availability. Keep cross-team schedules, customization, and deployments in separate decisions.


## Placement acceptance

Review the placement draft and its exact-head checks. Continue Executive Dashboard V1 from its isolated stack using Issue #234, with permission-aware operational widgets and no financial metrics.


## Recruitment and external portal handoff

Review the draft and its exact-head CI. Next, cover successful offer-backed placement and mission closure, then broaden the assigned-recruiter matrix. Obtain approval on external identity, organization membership and sharing rules before making client recruitment demands or authenticated candidate profile changes available. See the [readiness audit](../audit/recruitment-lifecycle/README.md).


## Functional UI stabilization handoff — 2026-11-19

1. Review the QA branch's exact-head CI and reproduce with `pnpm test:e2e` and a fresh marked database. See `docs/audit/functional-ui-qa/README.md` for coverage and before/after screenshots.
2. Extend the suite through interview scheduling, offer progression, additional rejection outcomes, and record-level denial checks for recruitment and client roles. Require persisted UI results and authoritative API responses for both paths.
3. Resolve UI-02 and the residual UI-03 issues on the Administration branch. Review synthetic PDF generation on the invoice branch and require accounting and legal sign-off before issuance; see both exact-head reviews in the audit folder.
Last updated: 2026-11-10

## Current situation

- Issue #257 is implemented on `feat/issue-257-administration-navigation`, based on `main`
  `5919c8a2ee230afd3dac062b13bd314e9c90b686`.
- Administration is one Console workspace tab with Billing, Users, and Roles & Permissions addressed by
  `?section=` deep links. Existing history ownership, unsaved-change guards, RBAC, server authorization,
  and module workflows remain authoritative.
- Focused tests, lint, architecture/style/contrast checks, and isolated real-browser acceptance are green.
  Repository-wide typecheck remains blocked by the unchanged Commercial errors recorded in the PR.
- The PR is draft, unmerged, and undeployed. No staging or production setting changed.

## Next concrete action

1. Review the Issue #257 draft PR and its three synthetic screenshots.
2. Require exact-head CI on the final branch SHA; distinguish the two unchanged Commercial type errors
   from Issue #257 regressions.
3. Merge only with explicit maintainer approval. Do not deploy as part of Issue #257.
4. Keep Issues #258–#261 separate: deeper Billing, Users, Roles presentation, and final E2E acceptance.

## Completion conditions

- Exact-head CI and maintainer review are green before merge.
- Billing, Users, and Roles & Permissions preserve deep links, history, Console tab identity, RBAC,
  bilingual copy, responsive behavior, and unsaved-change protection.
- The Issue #257 PR stays draft until explicit approval; production and staging remain untouched.

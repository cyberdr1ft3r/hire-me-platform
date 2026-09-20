# Current Agent Handoff

Last updated: 2026-09-20

## Current situation

- Authoritative `main` is `2a578701038bbebf1accb9b563684cad546cda0c`, including reviewed/merged PR #74; Issue #73 is closed. D-066 is Accepted; D-PUBLIC-01 is corrected for **future** submissions.
- Public form input is human major currency units; `buildApplicationRequest` converts exactly to integer `salaryExpectationCents` minor units, capped at 2147483647. Existing Candidate compensation is not overwritten by an application.
- Historical salary records are not automatically corrected or classified by guessed unit/creation provenance. The reviewed SQL/runbook is a read-only human-review aid, no backfill or write.
- High-priority drift audit #66 continues through Issue #75, the full Public Opportunity conformance audit; repository-evidence matrix is recorded in comment `5749238121`. No fresh real-browser visual/screenshots were taken for #75.
- Source inspection found three concrete **pending decisions**, NOT accepted fixes: P-75-01 contradictory required/disabled certification or diploma settings can hide a mandatory control; P-75-02 unauthenticated uploads check PDF magic but not JPEG/PNG signatures; P-75-03 public salary currency shape differs from the internal three-character contract.
- The inspected listed/unlisted visibility, public DTO confidentiality, request isolation, candidate reuse/ATS process, and localized form behavior align with implemented code and existing tests. The audit does not claim fresh tests or production inspection.
- No public app deployment, schema change, salary backfill, or change to R-039 was made by the merge/audit. D-DESIGN-01 whole-product UI-DNA v1.1 remains deferred until after the functional module rollout.

## Active review and next executable action

1. Read Issue #75 and its latest audit matrix, Issue #66, Issues #27/#52/#54/#62/#73, `AGENTS.md`, project memory, and affected source files.
2. Get maintainer KEEP/CORRECT/DEFER decisions on P-75-01/02/03, especially the intended rule for required upload categories that are not enabled.
3. Capture fresh local real-browser public list/detail/application EN/FR screenshots at 1440/1024/800/430/390 CSS px and verify keyboard, focus, empty/not-found/errors, response privacy, and document horizontal overflow with synthetic records. Static code review is not a substitute.
4. Record accepted audit decisions in #75 and #66. Open isolated correction issues only after explicit approval and preserve all accepted public semantics. Keep #75 open until reviewed.
5. Then audit the shared AppShell/i18n foundation and proceed through Clients, Missions, Training and Commercial UX rollout. Finish with whole-product UI-DNA v1.1.

## Explicit boundaries

- Do not re-open the merged salary-unit conversion or auto-multiply historic salary rows.
- Do not implement #75 corrections inside this documentation task.
- No candidate accounts/dashboard or client portal in MVP; EN/FR preference remains locally persisted.
- No scope expansion into payroll, accounting, R-039, Reporting, Tasks, ATS lifecycle, schema/migrations, or production deployment.
- No agent merge without explicit maintainer instruction and exact-head review.

## Completion gate for this documentation-only reconciliation

- All stable memory files reflect the PR #74 merge and correctly distinguish accepted D-066 from proposed #75 findings.
- Dedicated docs PR linked to #76 remains draft/open/unmerged until review and exact-head CI.

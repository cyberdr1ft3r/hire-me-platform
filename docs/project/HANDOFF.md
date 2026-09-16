# Current Agent Handoff

Last updated: 2026-09-16

## Current situation

- Authoritative `main` is `949f43618afdd6d88cfa15a47bed93616a2c34f4`, including PR #72 / Issue #71 and accepted Reporting drift D-REPORT-01. D-064 and D-065 are both reconciled as Accepted.
- Issue #73 corrects the public application salary expectation unit drift (D-PUBLIC-01, risk R-035) on `fix/public-application-salary-unit-drift`. Keep its PR draft, open, unmerged, and undeployed.
- The public form control is `salaryExpectationAmount`: a text input with `inputMode="decimal"`, a localized example hint, and a length bound. It holds normal major currency units, and the candidate never sees the word "cents".
- `buildApplicationRequest` is the only place the unit boundary is crossed. It converts on the digit string through `apps/web/src/money`, extracted unchanged from the accepted Candidate compensation parser (D-064) so no cross-feature import was introduced; `candidates/candidate-sensitive.ts` re-exports it.
- `salaryExpectationCents` on the request, `PublicCandidateApplication.submittedSalaryExpectationCents`, and `Candidate.salaryExpectationCents` still mean integer minor units for every caller, so a direct API caller keeps sending cents. The submit contract now bounds the field to `CANDIDATE_SALARY_EXPECTATION_CENTS_MAX` (2147483647), turning a would-be database error into a 400.
- Existing-Candidate reuse is frozen: a public submission records the newly submitted cents on the application snapshot and never overwrites the Candidate's own compensation.
- No schema migration was added, because those columns already mean cents, and no merged migration was touched.
- Already-stored rows are deliberately not corrected. Persistence records no client, form version, or unit marker, and the public field has always been named `salaryExpectationCents`, so no heuristic can prove the original unit. Legacy treatment is the reviewed read-only `apps/api/diagnostics/public-application-salary-unit-review.sql` with `docs/runbooks/public-application-salary-unit-review.md`; it returns identifiers, booleans, and a classification label, never an amount or a currency, and writes nothing.
- No public endpoint, permission, visibility, anti-enumeration, duplicate, rate-limit, honeypot, consent, upload, storage, candidate-matching, recruiter-assignment, or transaction behavior changed. R-039 is untouched.
- Local gates pass on this branch: 34 contract, 85 API unit, 452 web, and 318 PostgreSQL integration tests, plus frozen install, Prisma validate/generate, format, diff, style, architecture, lint, typecheck, build, generation-asset verification, clean-database migration, and a repeated seed. Exact-head GitHub Actions remains the final automated gate.

## Review target

Run `pnpm --filter @hire-me/web dev --host 127.0.0.1`, then open a published opportunity's application form at `http://127.0.0.1:5173/opportunities.html`.

In the salary section, confirm the amount field accepts `36000`, `36000.5`, `36000.50`, and `36000,50`; refuses a negative amount, three decimals, text, and an amount above `21474836.47`; and that the request carries exact minor units. Review EN/FR at desktop and 390 px: the hint and the validation message describe a human amount, never cents, a language switch keeps the typed amount and does not refetch, there is no raw UUID text, and the document `scrollWidth === clientWidth`.

## Completion conditions

- Every Issue #73 repository gate and the exact-head GitHub Actions run are green.
- The Issue #73 draft PR links the issue and records the unit boundary, the storage bound, the frozen reuse policy, and the deliberate absence of a historical backfill.
- Issue #66 records `D-PUBLIC-01 — IMPLEMENTED / AWAITING CHATGPT REVIEW`, separating future submissions, API/storage units, new Candidate, existing Candidate, and historical stored values. It must not be marked corrected.
- ChatGPT conformance review accepts the correction or requests a bounded fix on the same branch.

## Explicit hard stop

Do not begin:

- any historical salary correction, bulk or scripted, from the read-only review output;
- Candidate compensation authorization, employer or public advertised salary, Mission salary ranges, Offer salary, payroll, or accounting work;
- R-039, Reporting, Tasks, or ATS lifecycle work;
- Client, Mission, or recruiter-directory redesign;
- schema, migration, deployment, or merge work.

## Resume checklist

- Read `AGENTS.md`, Issues #73, #66, #62, #27, #69, and all project-memory files.
- Fetch `origin`, verify the branch base/head, draft PR state, and exact-head CI.
- Keep corrections within the public application web boundary, the public submit contract bound, the read-only legacy statement and its runbook, translations, tests, and project documentation.

# UI refinement review — 2026-10-13

## Scope and baseline

Prepared for the 21:30 Morocco stakeholder demonstration. Baseline is main
`283c18ad012a2d6ce7e5b5a37c5c95d27dc812f7` (merged Messages PR #193).
The open-PR inventory was empty at the start of work; no overlapping open change
was found. Work is isolated on `fix/ui-refinement-demo-20261013`.

The UI DNA documents, semantic tokens and existing components remain authoritative.
No backend, schema, permission grant, API source, dependency or branding changes.

## Review sequence

1. Restore component hover precedence, reachable desktop list/detail breakpoints,
   shell scrolling, semantic status presentation and control sizing.
2. Refine Messages list/log separation and density; grow and shrink the composer
   with drafts, capped at 192px, in normal flow so messages remain unobscured.
3. Group Administration permission codes by their existing namespace, label forms
   and clarify Agenda action hierarchy and row separation.
4. Reuse BoundedCombobox for MissionPicker, retaining its original loaders,
   source keys, optional clearing and selection callbacks.
5. Apply the small screenshot-QA adjustments and record verification.

## Verification

| Check | Result |
| --- | --- |
| Web unit/component suite | 69 files, 889 tests passed, two workers |
| Contracts suite | 12 files, 70 tests passed |
| API suite | 208 tests passed initially; one rendering timeout passed in isolated 23-test rerun; native PKCS#11 suite could not load locally |
| Lint | Passed; existing unused eslint-disable warning in ClientsPanel.test.tsx |
| Prettier | Passed |
| Architecture, semantic style and contrast checks | Passed |
| Typecheck and production build | Passed; existing large-chunk advisory |
| Browser matrix | Synthetic fixtures at 1440px and 390px, EN and FR; before/after screenshots |

Windows lacks the C++ build tools needed by the existing pkcs11js dependency.
Dependencies were installed from the lockfile with scripts disabled, followed by
Prisma client generation. No database migration or production operation was run.
The PR's Linux CI remains authoritative for native signing and database integration
checks; inspect exact-head checks before approval.

The browser matrix covers Messages, Administration, Agenda, Training, Commercial,
Accounting, Documents, Missions, Candidates and Clients. Populated synthetic
fixtures exercise the four changed list/detail layouts. Other list screens also
check shared shell/control behavior. Checks cover horizontal overflow, desktop
split reachability, mobile control sizes, composer growth/shrink and short-height
sidebar keyboard focus. This is viewport testing, not a physical-device or full
assistive-technology audit. Existing automated keyboard and coarse-pointer tests
remain in the web suite.

## Evidence and limits

Representative before/after pairs are in [the screenshot directory](ui-refinement-20261013/).
The complete 80-screen matrix plus hover/sidebar checks is supplied with the
review deliverables. All records are synthetic, using intercepted API responses;
screenshots do not demonstrate production connectivity.

Administration intentionally retains the existing deferred-English route boundary
when FR is selected. This sprint does not represent it as newly translated.
Messages continue to omit API-unsupported message previews.

## Remaining work and review gate

- Human visual and code review; do not merge this draft without review.
- Confirm exact-head Linux CI, including database integration and native PKCS#11.
- Training, Commercial and Tasks duplicate picker migrations remain deferred;
  only MissionPicker was consolidated to keep authorization-sensitive scope small.
- Complete Administration localization in its own approved scope.
- Perform real-device and screen-reader acceptance checks before claiming full
  WCAG 2.2 AA conformance; existing contrast/focus/target checks are supporting evidence.
- Existing bundle-size warning and unrelated production/retention/provider/staging
  gates are unchanged.

Engineering assessment: focused and reviewable, with small commits and regression
coverage. Ready for stakeholder-demo review with synthetic fixtures; production
approval requires green exact-head CI and human review. No merge or deployment
was performed.

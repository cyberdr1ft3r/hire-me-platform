# Current Agent Handoff

Last updated: 2026-10-20

## Current situation

- Latest `main` is `cfe6be6`. Issue #228 Phase A was approved in the review of draft PR #229 with
  refinements RV1 (tab identity in `history.state`, URL-only fallback) and RV2 (guards ask only for
  genuinely unsaved input). PR #229 documents both; its exact-head CI is green and it stays draft.
- B0′ is a separate draft PR on `feat/issue-228-b0-unsaved-input-guards`: RV2 dirty detection in
  the shared guard, guard-stack fallthrough, and unsaved-input protection for Tasks, Training,
  Accounting, Commercial, Documents, Messages and Administration.
  [Evidence](../audit/issue-228-b0-unsaved-input.md).
- No console tab code exists yet. B2 onward is not approved.

## Next concrete action

1. Maintainer reviews the B0′ draft PR and its browser evidence; resolve comments on the same branch.
2. After B0′ review, open B1 (pure console state core with the RV1 history-state codec and
   resolution order, unit tests only, not rendered) as its own draft PR from latest `main`.
3. Reconcile `docs/project/STATUS.md` / `HANDOFF.md` between #229 and B0′ at merge time (both add
   an Issue #228 section).

## Completion conditions

- PR #229, B0′ and B1 stay draft and unmerged, each with green exact-head CI.
- No B2 implementation, merge, deployment, sidebar redesign or unrelated fix without explicit
  approval.

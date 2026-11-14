# Current Agent Handoff

Last updated: 2026-11-14

## Current situation

- Protected `main` is `5919c8a2ee230afd3dac062b13bd314e9c90b686` and did not advance during
  this stabilization pass.
- PR #262 (`hotfix/client-address-optional`) is an open draft at
  `4622314a27945d47e705a3963e4de81128cb77b1`. It incorporates PR #253 and its exact-head run
  `40792069910` passed all six checks. It preserves normal final numbering, issued snapshots,
  authorization and audit history for standalone manual buyers, including a null address.
- PR #263 (`fix/invoice-pdf-layout`) is an open draft. Its prior run `42863358894` failed one of
  1,124 web tests because the Documents guard assertion observed state before a React effect settled;
  database integration, authorization catalog, PostgreSQL health and PKCS#11 jobs passed.
- The minimal correction waits for the post-save navigation guard to become clean. It does not change
  invoice behavior or weaken the assertion. Fresh exact-head CI is required for the new branch head.
- A synthetic merge of #262 and #263 has two content conflicts:
  `apps/api/src/document-generation/generation-rendering.test.ts` and
  `apps/api/src/document-generation/template-registry.ts`. PR #262 uses invoice template version 7;
  PR #263 uses version 6. Both regression sets and a newly incremented combined version are required.
- The October 29 VPS recovery is documented as combining #262 and #263 through local images without
  changing invoice rows or existing document versions. The exact VPS-only commit `da77e547...` was
  never pushed, so its documented behavior is accounted for but exact source parity is unverified.

## Unresolved decisions

1. Accounting must decide whether the PDF may display a service date under `Facturée le` when the
   immutable issue date differs. Recommended presentation is to label service and issue dates
   separately; do not change stored dates or regenerate official PDFs before approval.
2. The company must accept or reject the legal/accounting risk of final tax invoices for a standalone
   buyer with a required name but no address. The technical implementation is not compliance approval.

## Next concrete action

1. Require all six checks to pass on the fresh exact PR #263 head and review the minimal test-only fix.
2. Create a dedicated consolidation branch from PR #262, then semantically apply #263's PDF layout.
   Preserve #262's draft/non-issued markers and optional-address behavior, assign the next invoice
   template version, and retain both branches' renderer and PostgreSQL regressions.
3. Validate the consolidation from a clean database and run exact-head CI. Compare generated synthetic
   PDFs only; do not regenerate official invoices or replace historical `DocumentVersion` bytes.
4. Keep #253, #262 and #263 open/unmerged until review selects the consolidation PR as their successor.

## Completion conditions

- Fresh exact-head CI is green for the stabilized #263 branch.
- The consolidation branch has no unresolved conflicts and proves numbering, snapshots,
  authorization, audit history, document immutability, draft/final separation and optional-address
  behavior.
- Accounting decisions on invoice-date presentation and optional buyer addresses are recorded before
  merge, deployment, official regeneration or live-data correction.
- No Administration redesign, deployment, VPS change, live-data mutation or invoice regeneration is
  included.

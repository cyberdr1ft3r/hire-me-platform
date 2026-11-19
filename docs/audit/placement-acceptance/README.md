# Successful placement and recruitment closure

Base: PR #268 at `5b6dd493b356ee8be48fab653677073e689debaf` (all six checks passed).

## Verification

- Use a freshly provisioned marked test database and the existing [disposable database runbook](../../runbooks/disposable-test-database.md). Run `node scripts/functional-qa/run.mjs --test-name-pattern="confirm placement and close"` or the full `pnpm test:e2e`. CI collects the PNGs from the reported evidence directory.
- Chrome checks that the draft offer cannot confirm a placement, that acceptance alone leaves the position vacant, and that submitting confirmation creates one placement from the accepted version. Retrying confirmation leaves the count and event history unchanged.
- At 390 px, close the mission as “Closed with recruitment” after reaching probation monitoring and filling the planned position. The API refuses successful closure with an insufficient count. Reload verifies the closed state, reason and timestamp, inactive recruiter assignment, retained integrated process and unchanged general candidate status. The closed record refuses ordinary edits.
- PostgreSQL checks the placement audit record, closure audit actor and entity, retained canonical placement, and assigned recruiter scope (own process write, peer read, peer write refusal, no access outside the assignment). The scoped test uses a fixture without the broad transfer grant. Production grants are unchanged.

## Remaining scope

No recruitment product defect was verified by this batch. The existing closure endpoint accepts a supplied filled count subject to its existing validation; this acceptance scenario uses the count produced by the offer-backed placement. Whether to eliminate manual counts for historical workflows is a separate business decision. External organization authorization remains outside this internal release.

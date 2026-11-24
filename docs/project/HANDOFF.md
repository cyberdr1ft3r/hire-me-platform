# Current Agent Handoff

Last updated: 2026-11-24

## HIRE ME v1.0-dev consolidation (PR #285)

Branch `integration/hireme-dev-v1` is the single authoritative development integration. It starts from
verified #281 (`b293ddd`) and now includes #284 public applications, #265 invoice consolidation, and
#282 portal documentation (proposed/pending approvals). The maintainer approved Candidate Portal
account registration and authenticated applications for isolated development on [PR #285](https://github.com/cyberdr1ft3r/hire-me-platform/pull/285#issuecomment-7134325337).
The maintainer also approved Client Portal V1 for isolated development on [PR #285](https://github.com/cyberdr1ft3r/hire-me-platform/pull/285#issuecomment-7135744378).
Invoice issuance remains disabled. Production portal rollout remains subject to applicable approvals in the
[#236 decision register](../design/external-portals/README.md). The
[delivery plan](../design/external-portals/delivery.md) defines first-PR and pilot acceptance gates.

## Next concrete action

1. Require green exact-head CI on the integrated head and maintainer review of draft PR #285.
2. Exercise live Google sign-in and email delivery with approved test credentials in an isolated
   environment using the [Candidate Portal runbook](../runbooks/candidate-portal-development.md) and [Client Portal runbook](../runbooks/client-portal-development.md).
3. Record accounting decisions on invoice date presentation and optional standalone buyer addresses
   before any issuance enablement or official PDF regeneration.
4. Run a combined staff → client request → internal mission → candidate application → staff review →
   client shortlist walkthrough. Review [#236 external portal readiness](../design/external-portals/README.md) with product, security
   and privacy owners before production release.
5. Use [#261 Administration acceptance](../audit/issue-261-administration/README.md) and
   [#283 public application evidence](../audit/issue-283-public-application/README.md) for controlled
   internal UAT; screen-reader, physical-device and business-user signoff remain separate.

## Completion conditions

- PR #285 exact-head CI and maintainer review are green before merge consideration.
- Source draft PRs (#253–#265, #281–#284) remain open until maintainers explicitly supersede them after
  verification.
- Client and Candidate Portal use is limited to isolated development. Deployment, production access and real invoice issuance require separate approval.

# Current Agent Handoff

Last updated: 2026-11-24

## HIRE ME v1.0-dev consolidation (PR #285)

Branch `integration/hireme-dev-v1` is the single authoritative development integration. It starts from
verified #281 (`b293ddd`) and now includes #284 public applications, #265 invoice consolidation, and
#282 portal documentation (proposed/pending approvals). Invoice issuance remains disabled; external
portal implementation (EP-01) remains blocked pending E01–E07 approvals recorded in the
[#236 decision register](../design/external-portals/README.md). The
[delivery plan](../design/external-portals/delivery.md) defines first-PR and pilot acceptance gates.

## Next concrete action

1. Require green exact-head CI on the integrated head and maintainer review of draft PR #285.
2. Record accounting decisions on invoice date presentation and optional standalone buyer addresses
   before any issuance enablement or official PDF regeneration.
3. Review [#236 external portal readiness](../design/external-portals/README.md) with product, security
   and privacy owners; do not implement EP-01 until applicable E01–E07 decisions are recorded.
4. Use [#261 Administration acceptance](../audit/issue-261-administration/README.md) and
   [#283 public application evidence](../audit/issue-283-public-application/README.md) for controlled
   internal UAT; screen-reader, physical-device and business-user signoff remain separate.

## Completion conditions

- PR #285 exact-head CI and maintainer review are green before merge consideration.
- Source draft PRs (#253–#265, #281–#284) remain open until maintainers explicitly supersede them after
  verification.
- No staging deployment, production change, portal activation, or real invoice issuance occurs from this
  consolidation work.
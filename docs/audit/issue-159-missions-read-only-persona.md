# Issue #159 — Missions read-only evidence persona

Last updated: 2026-10-11

## Maintainer decision (V1+)

Do **not** add a new seeded production role for a pure Missions viewer. Read-only
Missions access is a **synthetic test/evidence persona** built from explicit read
permissions. Production roles (ADMIN, HR_MANAGER, etc.) continue to represent real
business responsibilities.

## Seeded roles reviewed

| Role | Missions intent |
| --- | --- |
| **ADMIN** / **SUPER_ADMIN** | Full operators (broad mission write grants) |
| **HR_MANAGER** | Full Missions operator (create, lifecycle, offers, placements, …) |
| **MANAGER** / **TEAM_LEADER** / **EMPLOYEE** | No `missions:view` in seed — not Missions viewers |
| **FINANCE_MANAGER** | Commercial/accounting scope; not a dedicated Missions read-only persona |
| **GUEST** / **CLIENT_USER** | No Missions workspace access in seed |

No existing production role is a dedicated read-only Missions business persona.

## Web authorization model

- `apps/web/src/missions/mission-access.ts` derives flags from **permission codes only** (no `RoleName` checks in Missions UI).
- `readOnly === missions:view && no WRITE_PERMISSIONS` where `WRITE_PERMISSIONS` lists mission-area mutation capabilities.
- View permissions do not imply write permissions; commercial eligibility remains gated separately by `placement_commercial_eligibility:view` / `:update`.

## Canonical synthetic bundle (tests / evidence)

Defined in `apps/web/src/missions/mission-test-personas.ts` as
`MISSIONS_READ_ONLY_EVIDENCE_PERMISSIONS`:

```text
missions:view
mission_assignments:view
mission_candidates:view
interviews:view
evaluations:view
offers:view
placements:view
public_opportunities:view
public_applications:view
```

Regression coverage: `MissionsReadOnlyPersona.test.tsx`, existing
`MissionsWorkspace.test.tsx` read-only scenario, and `mission-rules.test.ts`.

## #110 closure

After Issue **#159** merges, no scoped Missions V1+ child work remains under **#110**.
Parent **#110** may be closed by the maintainer after final review.

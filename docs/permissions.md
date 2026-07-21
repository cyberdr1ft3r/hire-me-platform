# Permissions

## Model

Permissions should be explicit capabilities granted through `Role` records. Authorization must be enforced server-side with deny-by-default policy checks. Frontend permission checks can improve usability, but they are not security controls.

Candidate, HR, salary, CV, client, commercial, document, export, and audit data is confidential. Permissions must account for both action and record scope.

## Roles

- Super administrator
- Administrator
- HR manager
- Manager
- Team leader
- Employee
- Guest
- Client user

## Matrix Legend

- `Full`: unrestricted within the platform boundary.
- `Operations`: broad operational access without super administrator control.
- `Team`: limited to managed team or assigned team records.
- `Assigned`: limited to records assigned to the user or explicitly shared with the user.
- `Client`: limited to records explicitly shared with the user's client account.
- `Read`: read-only access.
- `None`: no access by default.

## First Permissions Matrix

| Capability | Super administrator | Administrator | HR manager | Manager | Team leader | Employee | Guest | Client user |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| View | Full | Operations | Operations | Operations | Team | Assigned | Read | Client |
| Create | Full | Operations | Operations | Operations | Team | Assigned | None | None |
| Update | Full | Operations | Operations | Operations | Team | Assigned | None | Client feedback only |
| Archive | Full | Operations | Operations | Operations | Team | None | None | None |
| Delete | Full | Limited administrative delete | None | None | None | None | None | None |
| Export | Full | Operations | Operations | Operations | Team | Assigned with approval | None | Client shared exports only |
| Document download | Full | Operations | Operations | Operations | Team | Assigned | None | Client shared documents only |
| User administration | Full | Operations except super administrator control | None | Team user requests only | None | None | None | None |
| Commercial-data access | Full | Operations | Operations | Operations | Team summary | None | None | Client-owned mission summary only |

## Capability Definitions

- View: read records in authorized scope.
- Create: create records in authorized modules.
- Update: modify records in authorized scope.
- Archive: mark records inactive while preserving history.
- Delete: permanently remove records where legally and operationally allowed.
- Export: create downloadable data extracts or reports.
- Document download: download `CandidateDocument` or `Document` files.
- User administration: create users, assign roles, suspend users, and manage access.
- Commercial-data access: view pricing, salary ranges, margins, contract values, client commercial terms, and commercial reports.

## Suggested Permission Names

- `records:view`
- `records:create`
- `records:update`
- `records:archive`
- `records:delete`
- `records:export`
- `documents:download`
- `users:admin`
- `commercial_data:access`

These names are documentation terms for the first pass. They should be refined when module boundaries and API routes are designed.

## Security and Audit Requirements

- Export, document download, commercial-data access, user administration, role changes, permission changes, and deletion should create `AuditLog` records.
- Client user permissions must be scoped by client account and explicit portal sharing rules.
- Guest access should be temporary, read-only, and denied for confidential documents by default.
- Employee access should not include commercial-data access by default.
- Delete should be rare; archival should be preferred for recruitment, HR, client, commercial, and audit history.
- Protected operations should use server-side policy checks and scoped queries to prevent insecure direct object references.

## Assumptions

- Super administrator can manage all roles and permissions.
- Administrator can manage operational access but cannot remove super administrator control.
- HR manager and manager have broad operational access, including commercial-data access.
- Team leader access is scoped to team activity.
- Employee access is scoped to assigned work.
- Client user access is limited to client portal records.

## Unresolved Decisions

- Whether employee exports require manager approval or a technical approval workflow.
- Whether commercial-data access should be split into pricing, salary, margin, contract, and revenue permissions.
- Whether guest access should expire automatically.
- Whether client users can upload documents.
- Whether permission scopes need regional, office, or department restrictions.

## Risks

- Broad operational roles can expose confidential candidate and commercial data.
- Export and document download permissions can create uncontrolled copies of CVs and HR files.
- Client user scoping mistakes can expose one client's data to another client.
- Frontend-only permission checks would be insufficient.

## Non-Goals

- No final role seeding strategy.
- No authentication implementation.
- No policy engine implementation.
- No database schema or migration.

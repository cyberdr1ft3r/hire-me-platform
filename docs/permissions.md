# Permissions

## Model

Permissions should be explicit capabilities granted through `Role` records and narrowed by record scope. Authorization must be enforced server-side with deny-by-default policy checks. Frontend permission checks can improve usability, but they are not security controls.

Candidate, HR, salary, CV, client, commercial, message, document, export, and audit data is confidential. Permissions must account for both action and record scope.

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
- `Admin`: platform administration without super administrator override.
- `Assigned`: records assigned to the user through ownership, `MissionAssignment`, task assignment, training responsibility, or explicit sharing.
- `Team`: records assigned to the user's team.
- `Explicit`: requires a specific permission assignment beyond the base role.
- `Shared read-only`: individually shared records only.
- `Client`: records explicitly shared with the user's client account.
- `None`: no access by default.

## First Permissions Matrix

| Capability | Super administrator | Administrator | HR manager | Manager | Team leader | Employee | Guest | Client user |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| View | Full | Admin or assigned | Assigned | Assigned | Team or assigned | Assigned | Shared read-only | Client |
| Create | Full | Admin or assigned | Assigned | Assigned | Team or assigned | Assigned | None | None |
| Update | Full | Admin or assigned | Assigned | Assigned | Team or assigned | Assigned | None | Client feedback only |
| Archive | Full | Explicit | Explicit | Explicit | Explicit team scope | None | None | None |
| Delete | Full | Explicit administrative delete | None | None | None | None | None | None |
| Export | Full | Explicit | Explicit | Explicit | Explicit team scope | Explicit assigned scope | None | Explicit client shared exports |
| Document download | Full | Explicit or assigned | Explicit or assigned | Explicit or assigned | Explicit team scope | Explicit assigned scope | None | Explicit shared documents |
| User administration | Full | Admin except super administrator control | None | Explicit team user requests only | None | None | None | None |
| Commercial-data access | Explicit full access | Explicit only | Explicit only | Explicit only | Explicit team summary only | None | None | Explicit client-owned summary only |

## Capability Definitions

- View: read records in authorized scope.
- Create: create records in authorized modules.
- Update: modify records in authorized scope.
- Archive: mark records inactive while preserving history.
- Delete: permanently remove records where legally and operationally allowed.
- Export: create downloadable data extracts or reports.
- Document download: download `CandidateDocument` or `Document` files.
- User administration: create users, assign roles, suspend users, and manage access.
- Commercial-data access: view pricing, salary ranges, revenue, margins, contract values, client commercial terms, quotations, purchase orders, invoices, and commercial reports.

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
- `messages:view`
- `messages:create`
- `training_enrollments:manage`
- `mission_assignments:manage`

These names are documentation terms for the first pass. They should be refined when module boundaries and API routes are designed.

## Security and Audit Requirements

- Export, document download, commercial-data access, user administration, role changes, permission changes, deletion, mission assignment changes, training enrollment changes, and sensitive conversation membership changes should create `AuditLog` records.
- Client user permissions must be scoped by client account and explicit portal sharing rules.
- Guest access must be temporary, individually shared, read-only, and denied for confidential documents by default.
- Employee access should not include commercial-data access by default.
- HR manager and manager access to commercial data requires explicit assignment; it is not a broad default.
- Delete should be rare; archival should be preferred for recruitment, HR, client, commercial, message, document, training, and audit history.
- Protected operations should use server-side policy checks and scoped queries to prevent insecure direct object references.
- Notifications and message previews should avoid exposing confidential payloads to unauthorized users.

## Confirmed Requirement Versus Implementation Sequence

The matrix is a provisional least-privilege default for V1. It confirms that the platform needs roles, permissions, confidential-data protection, exports, document downloads, commercial-data controls, user administration, and client-scoped access. Exact policy implementation, seed data, approval workflows, and per-module route permissions should be defined during implementation tasks.

## Assumptions

- Super administrator can manage all roles and permissions.
- Administrator can manage operational access but cannot remove super administrator control.
- HR manager and manager do not receive broad commercial-data access by default.
- Team leader access is scoped to team activity.
- Employee access is scoped to assigned work.
- Guest access is limited to individually shared read-only records.
- Client user access is limited to client portal records and explicit sharing.

## Unresolved Technical Choices

- Whether employee exports require manager approval or a technical approval workflow.
- Whether commercial-data access should be split into pricing, salary, revenue, margin, contract, quotation, purchase order, and invoice permissions.
- Whether guest access should expire automatically and how expiration is enforced.
- Whether client users can upload documents.
- Whether permission scopes need regional, office, department, or recruiter-assignment restrictions.
- Whether commercial-data access should require step-up authentication.

## Risks

- Broad operational roles can expose confidential candidate and commercial data.
- Export and document download permissions can create uncontrolled copies of CVs and HR files.
- Client user scoping mistakes can expose one client's data to another client.
- Guest read access can become overbroad if it is not individually shared and time-limited.
- Frontend-only permission checks would be insufficient.

## Non-Goals

- No final role seeding strategy.
- No authentication implementation.
- No policy engine implementation.
- No database schema or migration.

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
- `All data`: all normal product records, excluding protected super-administrator controls and separately protected commercial data.
- `Assigned`: records assigned to the user through ownership, `MissionAssignment`, task assignment, training responsibility, or explicit sharing.
- `Team`: records assigned to the user's team.
- `Explicit`: requires a specific permission assignment beyond the base role.
- `Shared read-only`: individually shared records only.
- `Client`: records explicitly shared with the user's client account.
- `None`: no access by default.

## First Permissions Matrix

| Capability | Super administrator | Administrator | HR manager | Manager | Team leader | Employee | Guest | Client user |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| View | Full | All data | All data | Team | Team | Assigned | Shared read-only | Client |
| Create | Full | All data | All data | Team | Team | Assigned | None | None |
| Update | Full | All data | All data | Team | Team | Assigned | None | Client feedback only |
| Archive | Full | All data | All data | Team | Team with explicit permission | None | None | None |
| Delete | Full | Explicit administrative delete | None | None | None | None | None | None |
| Export | Full | Explicit | Explicit | Explicit team scope | Explicit team scope | Explicit assigned scope | None | Explicit client shared exports |
| Document download | Full | Explicit or all data | Explicit or all data | Explicit team scope | Explicit team scope | Explicit assigned scope | None | Explicit shared documents |
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
- `users:view`
- `users:create`
- `users:update`
- `users:roles:manage`
- `users:status:manage`
- `users:sessions:revoke`
- `roles:view`
- `permissions:view`
- `commercial_data:access`
- `messages:view`
- `messages:create`
- `training_enrollments:manage`
- `mission_assignments:manage`

Issue #10 seeds the initial authentication and synthetic product permission names. Issue #13 adds the explicit internal administration permissions listed above. Permissions resolve through normalized `UserRole`, `RolePermission`, and `Permission` records. They remain the initial permission-code vocabulary and should be expanded only by future scoped module work.

## Implemented Administration Permissions

| Permission | Implemented use |
| --- | --- |
| `users:view` | List/search internal users, view safe user detail, view active-session summaries, and preview effective permissions. |
| `users:create` | Create internal users with administrator-set initial credentials. |
| `users:update` | Update approved non-sensitive profile fields. |
| `users:roles:manage` | Assign and remove approved roles. Assignment is limited to roles whose permissions are within the actor's effective permissions. |
| `users:status:manage` | Suspend, reactivate from suspension, and archive users. |
| `users:sessions:revoke` | Revoke one selected refresh session or all sessions for a selected user. |
| `roles:view` | Read the approved role catalog and role-to-permission mappings. |
| `permissions:view` | Read the approved permission catalog. |

Administration remains deny-by-default. The application protects the last active `SUPER_ADMIN`, prevents unsafe self-demotion/self-suspension/self-archival, revokes sessions when users are suspended or archived, and treats `UserRole` changes as archival rather than physical deletion.

## Security and Audit Requirements

- Export, document download, commercial-data access, user administration, role changes, permission changes, deletion, mission assignment changes, training enrollment changes, and sensitive conversation membership changes should create `AuditLog` records.
- Client user permissions must be scoped by client account and explicit portal sharing rules.
- Guest access must be temporary, individually shared, read-only, and denied for confidential documents by default.
- Employee access should not include commercial-data access by default.
- Administrator, HR manager, and manager access to commercial figures, pricing, salary, invoices, margins, and revenue requires explicit permission regardless of base operational visibility.
- Delete should be rare; archival should be preferred for recruitment, HR, client, commercial, message, document, training, and audit history.
- Protected operations should use server-side policy checks and scoped queries to prevent insecure direct object references.
- Notifications and message previews should avoid exposing confidential payloads to unauthorized users.

## Confirmed Requirement Versus Implementation Sequence

The matrix is a provisional least-privilege default for V1. It confirms that the platform needs roles, permissions, confidential-data protection, exports, document downloads, commercial-data controls, user administration, and client-scoped access. Issue #10 implements the normalized permission-resolution foundation and deny-by-default route guard. Issue #13 implements the first internal user-administration route permissions. Exact business record-scope queries, approval workflows, and per-module route permissions remain future scoped work.

## Assumptions

- Super administrator can manage all roles and permissions.
- Administrator has all normal product data visibility but cannot remove protected super administrator control.
- HR manager has all normal product data visibility for operational work.
- Manager and team leader access is scoped to team data.
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
- Final business-module permission-code catalog and route-to-permission map.

## Risks

- Broad operational roles can expose confidential candidate and commercial data.
- Export and document download permissions can create uncontrolled copies of CVs and HR files.
- Client user scoping mistakes can expose one client's data to another client.
- Guest read access can become overbroad if it is not individually shared and time-limited.
- Frontend-only permission checks would be insufficient.

## Non-Goals

- No final per-module policy engine.
- No record-scope query implementation.
- No arbitrary role-builder or permission-editing workflow.

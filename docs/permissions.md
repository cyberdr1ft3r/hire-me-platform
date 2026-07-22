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
- `clients:view`
- `clients:create`
- `clients:update`
- `clients:status:manage`
- `clients:archive`
- `client_contacts:view`
- `client_contacts:create`
- `client_contacts:update`
- `client_contacts:status:manage`
- `client_contacts:archive`
- `candidates:view`
- `candidates:create`
- `candidates:update`
- `candidates:status:manage`
- `candidates:archive`
- `candidate_profile:view`
- `candidate_profile:manage`
- `candidate_compensation:view`
- `candidate_compensation:update`
- `candidate_consent:view`
- `candidate_consent:manage`
- `missions:view`
- `missions:create`
- `missions:update`
- `missions:status:manage`
- `missions:archive`
- `missions:closure:manage`
- `mission_assignments:view`
- `messages:view`
- `messages:create`
- `training_enrollments:manage`
- `mission_assignments:manage`
- `mission_commercial_data:view`
- `mission_commercial_data:update`

Issue #10 seeds the initial authentication and synthetic product permission names. Issue #13 adds the explicit internal administration permissions listed above. Issue #15 adds explicit client organization and client-contact permissions. Issue #17 adds explicit candidate master/profile, candidate compensation, and candidate consent permissions. Issue #19 adds explicit recruitment mission, assignment, and mission commercial-data permissions. Permissions resolve through normalized `UserRole`, `RolePermission`, and `Permission` records. They remain the initial permission-code vocabulary and should be expanded only by future scoped module work.

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

Administration remains deny-by-default. The application protects the last active `SUPER_ADMIN`, prevents unsafe self-demotion/self-suspension/self-archival, revokes sessions when users are suspended or archived, centrally rejects still-unexpired access tokens for suspended or archived users, and treats `UserRole` changes as archival rather than physical deletion.

## Implemented Client CRM Permissions

Issue #15 implements these route permissions:

| Permission | Implemented use |
| --- | --- |
| `clients:view` | List/search client organizations and read safe client detail. |
| `clients:create` | Create client organization records. |
| `clients:update` | Update approved client fields. Commercial fields also require `commercial_data:access`. |
| `clients:status:manage` | Move clients through non-archival lifecycle transitions. |
| `clients:archive` | Archive clients without physical deletion. |
| `client_contacts:view` | List/search and read contacts under a client. |
| `client_contacts:create` | Create contacts under writable clients. |
| `client_contacts:update` | Update approved client-contact fields. |
| `client_contacts:status:manage` | Move contacts between active and inactive. |
| `client_contacts:archive` | Archive contacts without physical deletion. |

Development seed mapping gives all normal client CRM permissions to `SUPER_ADMIN`, `ADMIN`, and `HR_MANAGER`. Only `SUPER_ADMIN` receives `commercial_data:access` by default. `MANAGER`, `TEAM_LEADER`, `EMPLOYEE`, `GUEST`, and `CLIENT_USER` receive no client CRM permissions until team, assigned-record, or client-portal row scopes are implemented.

Commercial client fields require `commercial_data:access` in addition to ordinary client permissions. Frontend hiding is only a usability layer; the API enforces this rule.

Client archival and every dependent client/contact write use one PostgreSQL concurrency strategy: a transaction-scoped row lock on the parent `Client`. This prevents concurrent contact creation or ordinary client/contact mutation from committing after client archival. When archival wins the race, the dependent write receives the stable conflict code `CLIENT_ARCHIVED`.

## Implemented Candidate Permissions

Issue #17 implements these route permissions:

| Permission | Implemented use |
| --- | --- |
| `candidates:view` | List/search candidate master records and read safe candidate detail. |
| `candidates:create` | Create candidate master records without automatic merging. |
| `candidates:update` | Update approved reusable candidate master fields. Compensation and consent fields require their dedicated permissions. |
| `candidates:status:manage` | Move candidates through non-archival lifecycle transitions. |
| `candidates:archive` | Archive candidates and active structured profile records without physical deletion. |
| `candidate_profile:view` | Read structured candidate skills, languages, work experience, and education. |
| `candidate_profile:manage` | Create, update, and archive structured candidate skills, languages, work experience, and education. |
| `candidate_compensation:view` | Read salary expectation fields. |
| `candidate_compensation:update` | Create or update salary expectation fields. |
| `candidate_consent:view` | Read candidate consent status and recorded timestamp. |
| `candidate_consent:manage` | Create or update candidate consent fields. |

Development seed mapping gives normal candidate/profile permissions to `SUPER_ADMIN`, `ADMIN`, and `HR_MANAGER`. Only `SUPER_ADMIN` receives candidate compensation and consent permissions by default. `MANAGER`, `TEAM_LEADER`, `EMPLOYEE`, `GUEST`, and `CLIENT_USER` receive no broad candidate permissions until mission assignment, team, assigned-record, guest sharing, and client-portal row scopes are implemented.

Candidate detail and mutation responses are shaped by the caller's effective permissions independently. A caller with `candidates:create`, `candidates:update`, `candidates:status:manage`, or `candidates:archive` but without `candidate_profile:view` receives empty structured profile arrays for skills, languages, work experience, and education. Candidate listing responses do not include structured profile arrays, and profile-backed candidate search is available only when `candidate_profile:view` is effective. Candidate compensation and consent fields require their dedicated permissions even when ordinary candidate permissions are present. Frontend hiding is only a usability layer; the API enforces this rule.

Candidate archival and every dependent candidate/profile write use one PostgreSQL concurrency strategy: a transaction-scoped row lock on the parent `Candidate`. This prevents concurrent profile child creation or ordinary candidate/profile mutation from committing after candidate archival. When archival wins the race, the dependent write receives the stable conflict code `CANDIDATE_ARCHIVED`.

## Implemented Recruitment Mission Permissions

Issue #19 implements these route permissions:

| Permission | Implemented use |
| --- | --- |
| `missions:view` | List/search recruitment missions and read safe mission detail. |
| `missions:create` | Create recruitment missions under valid writable clients. |
| `missions:update` | Update approved mission fields. Salary and commercial fields also require `mission_commercial_data:update`. |
| `missions:status:manage` | Move missions through documented non-terminal lifecycle transitions. |
| `missions:closure:manage` | Close missions through a structured closure endpoint and approved closure reasons. |
| `missions:archive` | Archive closed or canceled missions without physical deletion. |
| `mission_assignments:view` | List recruiter and contributor assignments under a mission. |
| `mission_assignments:manage` | Create, update, deactivate, archive, and atomically change mission lead recruiter assignments. |
| `mission_commercial_data:view` | Read protected mission salary and commercial summary fields. |
| `mission_commercial_data:update` | Create or update protected mission salary and commercial summary fields. |

Development seed mapping gives normal mission and assignment permissions to `SUPER_ADMIN`, `ADMIN`, and `HR_MANAGER`. Only `SUPER_ADMIN` receives mission commercial view/update permissions by default. `MANAGER`, `TEAM_LEADER`, `EMPLOYEE`, `GUEST`, and `CLIENT_USER` receive no broad mission permissions until assignment, team, guest, or client-portal row scopes are implemented.

Mission salary and commercial fields require dedicated mission commercial permissions. Ordinary mission responses receive `commercial: null`. Frontend hiding is only a usability layer; the API enforces this rule.

Mission archival, closure, status changes, ordinary mission updates, assignment creation, assignment updates, assignment archival, and lead-recruiter replacement use one PostgreSQL concurrency strategy: a transaction-scoped row lock on the parent `RecruitmentMission`. This prevents concurrent assignment creation or ordinary mutation from committing after mission archival or terminal closure. When the losing operation observes the terminal parent, it receives the stable conflict code `MISSION_TERMINAL`.

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

The matrix is a provisional least-privilege default for V1. It confirms that the platform needs roles, permissions, confidential-data protection, exports, document downloads, commercial-data controls, user administration, and client-scoped access. Issue #10 implements the normalized permission-resolution foundation and deny-by-default route guard. Issue #13 implements the first internal user-administration route permissions. Issue #15 implements the first client organization and contact route permissions while denying unresolved team, assigned-record, and client-user scopes. Issue #17 implements the first candidate master/profile permissions while denying unresolved mission-assigned, team, guest, and client-user scopes. Issue #19 implements the first recruitment mission and assignment permissions while denying unresolved assignment/team/client-user scopes for lower-trust roles by default. Exact remaining business record-scope queries, approval workflows, and per-module route permissions remain future scoped work.

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
- Final business-module permission-code catalog and route-to-permission map beyond administration, client CRM, and candidate profile CRM.
- Whether candidate compensation and consent permissions should be further split by salary expectation, offer compensation, consent history, privacy preference, and retention action.

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

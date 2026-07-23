# Permissions

## Model

Permissions should be explicit capabilities granted through `Role` records and narrowed by record scope. Authorization must be enforced server-side with deny-by-default policy checks. Frontend permission checks can improve usability, but they are not security controls.

Candidate, HR, salary, CV, client, commercial, message, document, export, and audit data is confidential. Permissions must account for both action and record scope.

The main application is authenticated and internal. Candidate applicants do not have accounts, roles, dashboards, or permissions in the MVP; public application links accept only explicitly approved fields and files. Future client portal users are optional future scope.

## Roles

- Super administrator
- Administrator
- HR manager
- Manager
- Team leader
- Employee
- Guest
- Future client user

## Matrix Legend

- `Full`: unrestricted within the platform boundary.
- `Admin`: platform administration without super administrator override.
- `All data`: all normal product records, excluding protected super-administrator controls and separately protected commercial data.
- `Assigned`: records assigned to the user through ownership, `MissionAssignment`, task assignment, training responsibility, or explicit sharing.
- `Team`: records assigned to the user's team.
- `Explicit`: requires a specific permission assignment beyond the base role.
- `Shared read-only`: individually shared records only.
- `Future client`: records explicitly shared with the user's client account if a client portal is later approved.
- `None`: no access by default.

## First Permissions Matrix

| Capability | Super administrator | Administrator | HR manager | Manager | Team leader | Employee | Guest | Future client user |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| View | Full | All data | All data | Team | Team | Assigned | Shared read-only | Future client |
| Create | Full | All data | All data | Team | Team | Assigned | None | None |
| Update | Full | All data | All data | Team | Team | Assigned | None | Future client feedback only |
| Archive | Full | All data | All data | Team | Team with explicit permission | None | None | None |
| Delete | Full | Explicit administrative delete | None | None | None | None | None | None |
| Export | Full | Explicit | Explicit | Explicit team scope | Explicit team scope | Explicit assigned scope | None | Future explicit client shared exports |
| Document download | Full | Explicit or all data | Explicit or all data | Explicit team scope | Explicit team scope | Explicit assigned scope | None | Future explicit shared documents |
| User administration | Full | Admin except super administrator control | None | Explicit team user requests only | None | None | None | None |
| Commercial-data access | Explicit full access | Explicit only | Explicit only | Explicit only | Explicit team summary only | None | None | Future explicit client-owned summary only |

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
- Public application submission: unauthenticated operation limited to approved public opportunity fields and upload requirements; it is not a role permission.

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
- `public_opportunities:view`
- `public_opportunities:manage`
- `public_opportunities:publish`
- `public_applications:view`
- `public_applications:review`
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
- `interviews:view`
- `interviews:schedule`
- `interviews:reschedule`
- `interviews:complete`
- `interviews:cancel`
- `interviews:archive`
- `interview_participants:manage`
- `evaluations:view`
- `evaluations:internal:view`
- `evaluations:create`
- `evaluations:update`
- `evaluations:finalize`
- `client_feedback:view`
- `quotations:view`
- `quotations:manage`
- `contracts:view`
- `contracts:manage`
- `purchase_orders:view`
- `purchase_orders:manage`
- `invoices:view`
- `invoices:manage`
- `payments:view`
- `payments:manage`
- `expenses:view`
- `expenses:manage`
- `client_balances:view`
- `profitability:view`

Issue #10 seeds the initial authentication and synthetic product permission names. Issue #13 adds the explicit internal administration permissions listed above. Issue #15 adds explicit client organization and client-contact permissions. Issue #17 adds explicit candidate master/profile, candidate compensation, and candidate consent permissions. Issue #19 adds explicit recruitment mission, assignment, and mission commercial-data permissions. Issue #23 adds explicit interview, interview-participant, evaluation, and client-feedback visibility permissions. Permissions resolve through normalized `UserRole`, `RolePermission`, and `Permission` records. They remain the initial permission-code vocabulary and should be expanded only by future scoped module work.

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

Development seed mapping gives all normal client CRM permissions to `SUPER_ADMIN`, `ADMIN`, and `HR_MANAGER`. Only `SUPER_ADMIN` receives `commercial_data:access` by default. `MANAGER`, `TEAM_LEADER`, `EMPLOYEE`, `GUEST`, and `CLIENT_USER` receive no client CRM permissions until team, assigned-record, or optional future client-portal row scopes are implemented.

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

Development seed mapping gives normal candidate/profile permissions to `SUPER_ADMIN`, `ADMIN`, and `HR_MANAGER`. Only `SUPER_ADMIN` receives candidate compensation and consent permissions by default. `MANAGER`, `TEAM_LEADER`, `EMPLOYEE`, `GUEST`, and `CLIENT_USER` receive no broad candidate permissions until mission assignment, team, assigned-record, guest sharing, and optional future client-portal row scopes are implemented.

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

Development seed mapping gives normal mission and assignment permissions to `SUPER_ADMIN`, `ADMIN`, and `HR_MANAGER`. Only `SUPER_ADMIN` receives mission commercial view/update permissions by default. `MANAGER`, `TEAM_LEADER`, `EMPLOYEE`, `GUEST`, and `CLIENT_USER` receive no broad mission permissions until assignment, team, guest, or optional future client-portal row scopes are implemented.

Mission salary and commercial fields require dedicated mission commercial permissions. Ordinary mission responses receive `commercial: null`. Frontend hiding is only a usability layer; the API enforces this rule. Salary updates validate the effective next range inside the parent-mission transaction by combining supplied values with persisted values.

Mission archival, closure, status changes, ordinary mission updates, assignment creation, assignment updates, assignment archival, and lead-recruiter replacement use one PostgreSQL concurrency strategy: a transaction-scoped row lock on the parent `RecruitmentMission`. This prevents concurrent assignment creation or ordinary mutation from committing after mission archival or terminal closure. Assignment activation and lead-recruiter selection re-check that the assigned user is still active, non-archived, and internal inside the same transaction. When the losing operation observes the terminal parent, it receives the stable conflict code `MISSION_TERMINAL`.

## Implemented Mission Candidate Process Permissions

Issue #21 implements these route permissions:

| Permission | Implemented use |
| --- | --- |
| `mission_candidates:view` | List or read mission-specific candidate processes under assignment or authorized override scope. |
| `mission_candidates:create` | Link one reusable candidate to one writable recruitment mission with a responsible recruiter. |
| `mission_candidates:transition` | Move a mission-candidate process through the approved standard pipeline. |
| `mission_candidates:transfer` | Transfer responsible recruiter ownership with a required reason. |
| `mission_candidates:present` | Explicitly present a candidate to the client for that mission. |
| `mission_candidates:integration:confirm` | Manually confirm integration and count one placement idempotently. |
| `mission_candidates:outcome:manage` | Record rejection, withdrawal, and talent-pool outcomes. |
| `mission_candidate_notes:view` | Read internal process notes. |
| `mission_candidate_notes:manage` | Create or update internal process notes. |

Development seed mapping gives normal mission-candidate process permissions to `SUPER_ADMIN`, `ADMIN`, and `HR_MANAGER`. Only `SUPER_ADMIN` receives candidate compensation and consent read permissions by default. `MANAGER`, `TEAM_LEADER`, `EMPLOYEE`, `GUEST`, and `CLIENT_USER` receive no broad mission-candidate process permissions until assignment, team, guest, or optional future client-portal row scopes are implemented.

Mission-candidate access remains deny-by-default. A caller must have the route permission and either an active mission assignment or an explicit authorized override. The responsible recruiter, active lead recruiter, or authorized override user may manage the process depending on the operation. Responsible recruiters must be active, internal, non-archived users with an active mission assignment as lead recruiter, recruiter, or sourcer.

Mission-candidate responses are shaped by the caller's effective permissions. Internal notes require `mission_candidate_notes:view`; live candidate compensation requires `candidate_compensation:view`; live candidate consent requires `candidate_consent:view`. Linking a candidate to a mission does not approve candidate information for external client sharing. External client sharing starts only through the explicit presentation action, never through a generic transition to `PRESENTED_TO_CLIENT`, and future client-facing APIs must continue to exclude internal notes, confidential scores, unrelated missions, internal history, protected salary or compensation data unless specifically approved, and recruiter-only operational information.

`clientVisible` and client-facing wording mean approved for external sharing. They do not imply a current client portal.

Integration confirmation is a first-confirmation write and a retry-safe read thereafter. Repeating confirmation for an already-confirmed process must not increment placement count, create another `MissionCandidateEvent`, create another `AuditLog`, or overwrite the original confirmer or timestamp.

Mission-candidate creation and writes use a consistent PostgreSQL lock order: parent `RecruitmentMission`, then `MissionCandidate` when one already exists, then parent `Candidate`. Creation locks the mission and candidate before inserting the process. This prevents candidate archival, mission closure or archival, duplicate process creation, and dependent process writes from committing in an unsafe order. Losing operations receive stable conflict codes such as `MISSION_TERMINAL`, `CANDIDATE_ARCHIVED`, or `MISSION_CANDIDATE_ALREADY_EXISTS`.

## Implemented Interview and Evaluation Permissions

Issue #23 implements these route permissions:

| Permission | Implemented use |
| --- | --- |
| `interviews:view` | List and read interviews for authorized mission-candidate processes. |
| `interviews:schedule` | Schedule HR, technical, internal-validation, and client interviews under a writable mission-candidate process. |
| `interviews:reschedule` | Reschedule or postpone interviews with required reason history. |
| `interviews:complete` | Complete interviews idempotently without moving the candidate pipeline. |
| `interviews:cancel` | Cancel scheduled or postponed interviews with a required reason. |
| `interviews:archive` | Archive interview records without physical deletion. |
| `interview_participants:manage` | Add or archive internal-user, client-contact, or bounded external participants. |
| `evaluations:view` | List structured evaluations with permission-aware redaction. |
| `evaluations:internal:view` | View internal-only evaluation content, confidential scores, strengths, weaknesses, risks, and comments. |
| `evaluations:create` | Create structured interview evaluations as an authorized evaluator. |
| `evaluations:update` | Update own draft structured evaluations. |
| `evaluations:finalize` | Explicitly finalize evaluations idempotently. |
| `client_feedback:view` | View client-authored feedback records where future client-feedback scope allows it. |

Development seed mapping gives normal interview and evaluation permissions to `SUPER_ADMIN`, `ADMIN`, and `HR_MANAGER`. `MANAGER`, `TEAM_LEADER`, `EMPLOYEE`, `GUEST`, and `CLIENT_USER` receive no broad interview or evaluation permissions until assignment, team, guest, or optional future client-portal row scopes are implemented.

Interview and evaluation access remains deny-by-default. A caller must have the route permission and either authorized override scope or an active mission assignment, depending on the operation. Interview and evaluation writes use the established mission-candidate lock order: parent `RecruitmentMission`, existing `MissionCandidate`, parent `Candidate`, then the `Interview` row where applicable. Internal evaluations are redacted unless `evaluations:internal:view` is effective. Client feedback records are redacted unless `client_feedback:view` is effective. Candidate salary values are not returned through evaluation responses or audit metadata.

## Security and Audit Requirements

- Export, document download, commercial-data access, user administration, role changes, permission changes, deletion, mission assignment changes, training enrollment changes, and sensitive conversation membership changes should create `AuditLog` records.
- Public opportunity and application endpoints must allow only explicitly approved fields and must never expose confidential client, salary, commercial, recruiter, pipeline, internal note, or audit data.
- Future client user permissions must be scoped by client account and explicit sharing rules if a client portal is later approved.
- Guest access must be temporary, individually shared, read-only, and denied for confidential documents by default.
- Employee access should not include commercial-data access by default.
- Administrator, HR manager, and manager access to commercial figures, pricing, salary, invoices, margins, and revenue requires explicit permission regardless of base operational visibility.
- Delete should be rare; archival should be preferred for recruitment, HR, client, commercial, message, document, training, and audit history.
- Protected operations should use server-side policy checks and scoped queries to prevent insecure direct object references.
- Notifications and message previews should avoid exposing confidential payloads to unauthorized users.

## Confirmed Requirement Versus Implementation Sequence

The matrix is a provisional least-privilege default for V1. It confirms that the platform needs internal roles, permissions, confidential-data protection, exports, document downloads, commercial-data controls, user administration, public application safeguards, and optional future client-scoped access. Issue #10 implements the normalized permission-resolution foundation and deny-by-default route guard. Issue #13 implements the first internal user-administration route permissions. Issue #15 implements the first client organization and contact route permissions while denying unresolved team, assigned-record, and client-user scopes. Issue #17 implements the first candidate master/profile permissions while denying unresolved mission-assigned, team, guest, and client-user scopes. Issue #19 implements the first recruitment mission and assignment permissions while denying unresolved assignment/team/client-user scopes for lower-trust roles by default. Issue #21 implements mission-candidate process permissions, responsible-recruiter scope, protected live candidate-field redaction, and explicit client presentation. Exact remaining business record-scope queries, approval workflows, public application protections, optional future client-facing row scopes, and per-module route permissions remain future scoped work.

## Assumptions

- Super administrator can manage all roles and permissions.
- Administrator has all normal product data visibility but cannot remove protected super administrator control.
- HR manager has all normal product data visibility for operational work.
- Manager and team leader access is scoped to team data.
- HR manager and manager do not receive broad commercial-data access by default.
- Team leader access is scoped to team activity.
- Employee access is scoped to assigned work.
- Guest access is limited to individually shared read-only records.
- Future client user access is limited to explicitly shared records if a client portal is later approved.
- Public candidate applicants do not receive authenticated access.

## Unresolved Technical Choices

- Whether employee exports require manager approval or a technical approval workflow.
- Whether commercial-data access should be split into pricing, salary, revenue, margin, contract, quotation, purchase order, and invoice permissions.
- Whether guest access should expire automatically and how expiration is enforced.
- Whether future client users can upload documents.
- Whether a future client portal exists in the MVP at all; Issue #25 classifies it as optional future scope.
- Public opportunity permission split for managing lifecycle, application-link availability, listing, approved public fields, and application review.
- Commercial-accounting permission split for quotation, contract, purchase order, invoice, payment, expense, tax, balance, revenue, and profitability actions.
- Whether permission scopes need regional, office, department, or recruiter-assignment restrictions.
- Whether commercial-data access should require step-up authentication.
- Final business-module permission-code catalog and route-to-permission map beyond administration, client CRM, and candidate profile CRM.
- Whether candidate compensation and consent permissions should be further split by salary expectation, offer compensation, consent history, privacy preference, and retention action.

## Risks

- Broad operational roles can expose confidential candidate and commercial data.
- Export and document download permissions can create uncontrolled copies of CVs and HR files.
- Public opportunity field mistakes can expose confidential client, salary, commercial, recruiter, pipeline, or internal data.
- Future client user scoping mistakes can expose one client's data to another client.
- Guest read access can become overbroad if it is not individually shared and time-limited.
- Frontend-only permission checks would be insufficient.

## Non-Goals

- No final per-module policy engine.
- No record-scope query implementation.
- No arbitrary role-builder or permission-editing workflow.

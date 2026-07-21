# Authentication

Issue #10 implements the first local authentication and RBAC foundation. Issue #13 adds the first secured internal user administration surface on top of that foundation. The combined scope remains limited to email/password login, refresh-session rotation, session logout and administrative session revocation, permission-code resolution, safe authentication and administration audit logs, and internal user status/role management.

## Implemented Endpoints

| Method | Path | Authentication | Purpose |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | None | Validate email/password, issue an access token response, and set the refresh cookie. |
| `POST` | `/auth/refresh` | Refresh cookie | Rotate the refresh session and return a new access token. |
| `POST` | `/auth/logout` | Bearer access token plus optional refresh cookie | Revoke the current refresh session and clear the cookie. |
| `POST` | `/auth/logout-all` | Bearer access token | Revoke every active refresh session for the authenticated user. |
| `GET` | `/auth/me` | Bearer access token | Return the authenticated user and effective permission codes. |

All login failures use a generic response so unknown emails, wrong passwords, inactive accounts, suspended accounts, and archived accounts are not distinguishable to callers.

## Password Storage

`PasswordCredential` stores one credential per user. Passwords are hashed with Argon2id using explicit versioned parameters:

- algorithm: `argon2id`
- parameters version: `argon2id-v1`
- memory cost: `19456`
- time cost: `2`
- parallelism: `1`
- hash length: `32`

Plaintext passwords are accepted only as login or development bootstrap inputs and are never stored. Development bootstrap refuses weak placeholder-style passwords and is disabled in production.

## Token Lifecycle

Access tokens are short-lived bearer tokens signed with `AUTH_ACCESS_TOKEN_SECRET`; the default development lifetime is `300` seconds. Access tokens are returned to the web app and kept in memory only.

Refresh tokens are opaque random tokens. Only an HMAC hash using `AUTH_REFRESH_TOKEN_PEPPER` is stored in `RefreshSession.tokenHash`. Refresh sessions include a `sessionFamilyId`, expiry, last-use timestamp, revocation timestamp, reuse-detection timestamp, prior-session reference, and hashed request metadata.

Refresh is rotating:

1. A valid refresh token revokes the current refresh session.
2. The API creates a replacement session in the same family.
3. A reused, revoked, expired, or otherwise invalid refresh token revokes the session family where identifiable and writes a safe audit record.

Refresh-token consumption is atomic on PostgreSQL. The API uses a transaction-scoped compare-and-set update with predicates on the presented session id, `revokedAt IS NULL`, and `expiresAt` still in the future. A successor session is created only when that consume update affects exactly one row. If a concurrent request loses the race and affects zero rows, the API treats the token as reused, revokes the identifiable session family, writes the safe reuse audit event, and returns the generic authentication failure.

## Cookie Policy

The refresh token is stored only in an HTTP-only cookie named `hire_me_refresh` with:

- `Path=/auth`
- `HttpOnly`
- `SameSite=Strict`
- `Expires` matching the refresh-session expiry
- `Secure` when `AUTH_COOKIE_SECURE=true` or `NODE_ENV=production`

The web app must not place access or refresh tokens in `localStorage` or `sessionStorage`.

## RBAC Foundation

Permissions are resolved from normalized relational records:

`User` -> `UserRole` -> `Role` -> `RolePermission` -> `Permission`

Only active users, active roles, active permissions, and non-archived role assignments are considered. Authorization guards deny by default when a route does not declare required permissions. Protected route handlers must declare explicit permission codes and still apply record-scope checks when business modules are implemented.

## Internal User Administration

Issue #13 introduces versioned administration endpoints under `/v1/admin`. All routes require an authenticated active internal user and explicit permission codes; no route authorizes by hard-coded role name. Response contracts are shared through `packages/contracts` and never expose Prisma records directly.

| Method | Path | Required permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/v1/admin/users` | `users:view` | List/search internal users with pagination and status filtering. |
| `POST` | `/v1/admin/users` | `users:create` | Create an internal user with an administrator-set initial credential. |
| `GET` | `/v1/admin/users/:userId` | `users:view` | Return safe user detail, roles, effective permissions, status, last login, and active-session summary. |
| `PATCH` | `/v1/admin/users/:userId` | `users:update` | Update approved non-sensitive profile fields only. |
| `POST` | `/v1/admin/users/:userId/roles` | `users:roles:manage` | Assign an approved role when the actor already has the role's permissions. |
| `DELETE` | `/v1/admin/users/:userId/roles/:roleName` | `users:roles:manage` | Archive a user-role assignment. |
| `PATCH` | `/v1/admin/users/:userId/status` | `users:status:manage` | Suspend, reactivate from suspension, or archive an internal user. |
| `GET` | `/v1/admin/users/:userId/sessions` | `users:view` | List safe active refresh-session summaries. |
| `DELETE` | `/v1/admin/users/:userId/sessions/:sessionId` | `users:sessions:revoke` | Revoke one selected refresh session. |
| `DELETE` | `/v1/admin/users/:userId/sessions` | `users:sessions:revoke` | Revoke all refresh sessions for a selected user. |
| `GET` | `/v1/admin/roles` | `roles:view` | Read the approved role catalog and mapped permissions. |
| `GET` | `/v1/admin/permissions` | `permissions:view` | Read the approved permission catalog. |
| `GET` | `/v1/admin/users/:userId/effective-permissions` | `users:view` | Preview a user's effective permissions from multiple roles. |

The last active `SUPER_ADMIN` invariant is protected inside PostgreSQL transactions using a transaction-scoped advisory lock before role removal or status changes can reduce the active super-administrator count. Self-demotion, self-suspension, and self-archival are rejected to prevent accidental lockout. Suspending or archiving a user atomically revokes that user's active refresh sessions.

Administrator-set initial credentials must satisfy the existing password policy and are hashed with the same Argon2id parameters as login credentials. Password hashes, refresh-token hashes, raw tokens, cookies, IP hashes, user-agent hashes, and plaintext credentials are never returned by administration APIs.

## Audit Logging

Authentication and administration audit logs are safe summaries only. They record events such as successful login, failed login, refresh rotation, refresh-token reuse detection, current-session logout, all-session logout, development bootstrap, internal user creation/update, role assignment/removal, status changes, and administrative session revocation. Audit logs must not include plaintext passwords, raw refresh tokens, access tokens, cookie values, password hashes, refresh-token hashes, CV content, client data, message bodies, or full confidential payloads.

## Operational Notes

Run the role and permission seed before development bootstrap:

```sh
pnpm prisma:seed
AUTH_BOOTSTRAP_ADMIN_EMAIL=admin@example.test AUTH_BOOTSTRAP_ADMIN_PASSWORD=LocalSyntheticPassphrase123! pnpm auth:bootstrap-admin
```

The bootstrap command is development-only and idempotent for the configured email.

## Assumptions

- Local email/password authentication is an initial foundation and does not remove the confirmed future Microsoft 365 authentication requirement.
- The API access token remains intentionally small and does not embed permission lists.
- Refresh-session metadata hashes are for audit correlation, not identity proof.

## Unresolved Decisions

- Production secret management, secret rotation, and emergency refresh-session invalidation playbooks.
- Distributed rate limiting for multi-instance production deployments.
- Final business-module permission-code catalog and record-scope policy implementation.
- Microsoft 365 authentication integration and account-linking behavior.
- Invitation, password reset, and forced first-login password-change workflows.

## Non-Goals

- No registration.
- No password reset.
- No MFA.
- No SSO or Microsoft 365 authentication implementation.
- No arbitrary role creation, role-builder UI, or permission editing UI.
- No invitations, email delivery, password reset, or forced first-login password-change implementation.
- No business modules, dashboards, messaging, training, recruitment, candidate, client, document-download, or integration workflows.

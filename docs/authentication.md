# Authentication

Issue #10 implements the first local authentication and RBAC foundation. It is intentionally limited to email/password login, refresh-session rotation, session logout, permission-code resolution, and safe authentication audit logs.

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

## Audit Logging

Authentication audit logs are safe summaries only. They record events such as successful login, failed login, refresh rotation, refresh-token reuse detection, current-session logout, all-session logout, and development bootstrap. Audit logs must not include plaintext passwords, raw refresh tokens, access tokens, cookie values, CV content, client data, message bodies, or full confidential payloads.

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
- Final per-module permission-code catalog and record-scope policy implementation.
- Microsoft 365 authentication integration and account-linking behavior.

## Non-Goals

- No registration.
- No password reset.
- No MFA.
- No SSO or Microsoft 365 authentication implementation.
- No user-management CRUD.
- No business modules, dashboards, messaging, training, recruitment, candidate, client, document-download, or integration workflows.

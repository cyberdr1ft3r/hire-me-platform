---
name: application-security
description: Apply security and privacy controls to authentication, authorization, HR data, documents, audit logs, secrets, uploads, and integrations.
---

# Application Security Skill

## Threat-sensitive context

This platform stores CVs, contact details, interview notes, salaries, commercial records, and HR documents. Treat all such data as confidential.

## Workflow

1. Identify assets, actors, trust boundaries, and likely abuse cases.
2. Apply least privilege and deny-by-default authorization.
3. Separate authentication from authorization.
4. Validate all external input at trust boundaries.
5. Record security-relevant actions without logging secrets or sensitive document contents.
6. Document residual risks and deferred controls.

## Required controls

- Never commit secrets or real personal data.
- Use secure password hashing when local passwords are introduced.
- Use short-lived sessions/tokens with safe refresh and revocation design.
- Enforce authorization server-side for every protected operation.
- Prevent insecure direct object references through scoped queries and policy checks.
- Validate file type, size, ownership, and access; store files outside public web roots.
- Use randomized storage keys and protected download paths.
- Plan malware scanning for uploaded files.
- Rate-limit authentication and sensitive operations.
- Apply secure headers, CORS restrictions, and CSRF protection where applicable.
- Avoid sensitive values in logs, errors, URLs, analytics, and audit metadata.
- Protect exports and commercial data by permission.
- Use parameterized database access through the ORM.

## Review checklist

For each feature ask:

- Who may perform this action?
- Which records may they access?
- Can identifiers be guessed or changed?
- Is sensitive data exposed in responses, logs, or files?
- Is the action auditable?
- Can it be abused repeatedly or at scale?
- What happens when a user, client, or record is archived?

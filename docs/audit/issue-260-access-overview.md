# Administration access overview (Issue #260)

Baseline: PR #274 at `7bced4088a98308e791b29aa908a73ac04fda0f4`.

## Reproduce and verify

1. Start the real app and API against a marked synthetic database using the [disposable database runbook](../runbooks/disposable-test-database.md). Sign in as the synthetic administrator and open `/admin?section=access`.
2. On the baseline, open the first role. Its description appears together with a wall of 146 technical permission identifiers. It has no search or functional filter.
3. On the improvement branch, read role summaries directly. Search by role, functional area or permission code, or choose a functional area. Open the role grants, then a permission group, with Enter or Space. Inspect the server-supplied descriptions and exact codes. The catalog and role grants are read-only.
4. Enter a search with no results, clear the filters, then switch to French and repeat at 360 px. The toolbar, summaries, empty and retry states are translated. Canonical English catalog descriptions carry an explicit language attribute.
5. Open Users and select an account. Assigned roles and effective permissions are distinct. Effective permissions use the codes returned on that account. No broader catalog permission is required.

The view still uses `/v1/admin/roles` and `/v1/admin/permissions` under their separate existing grants. The Users detail still uses its existing `effectivePermissions` data. The work changes no permissions, APIs, sessions, roles or persisted data.

| Viewport | Baseline | Updated |
| --- | --- | --- |
| English, 1440 px | [Before](issue-260-access-overview/before-access-en-1440.png) | [After](issue-260-access-overview/after-access-en-1440.png) |
| French, 360 px | [Before](issue-260-access-overview/before-access-fr-360.png) | [After](issue-260-access-overview/after-access-fr-360.png) |

## Regression command

With `NODE_ENV=test` and a guarded `TEST_DATABASE_URL`, run:

```bash
node scripts/functional-qa/run.mjs --test-name-pattern=administration-access
```

The scenario uses real HTTP and Chrome. It verifies a temporarily unavailable catalog, retry, search and area filtering, keyboard-only disclosure and focus, technical code visibility, French labels and 360 px document width. The unit suite also verifies that a permissions-only actor causes no roles request. Human acceptance, including assistive technology on physical devices, remains separate.

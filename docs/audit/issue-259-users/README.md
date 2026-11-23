# Administration Users UX · Issue #259

The before captures use verified PR #278 at `297a2e1f0d19beb0a7e5e1fbfa7240c1f3d99738`.
Both sets use installed Chrome, the local Nest API, and synthetic accounts in a fresh,
marked PostgreSQL database.

## What the baseline showed

- At 360 and 390 px the table showed names and statuses first, with role and session
  columns offscreen. The create form and unselected detail placeholder extended the
  page below the directory.
- At desktop width the create form occupied the full directory width and pushed the
  selected profile, roles, sessions, and effective access into a long stack.
- Profile editing shared the detail surface, the language field offered no guidance, and
  role assignment opened with Super administrator selected. Session dates were raw ISO values.
- Loading, no-match, and unavailable states existed. The directory and role catalog loaded
  together, so a role catalog failure could also prevent directory use.

## Comparison

| Width | Before | After |
| --- | --- | --- |
| 360 px | [Directory](before-360.png) | [Directory](after-360.png), [French](after-fr-360.png) |
| 390 px | [Directory](before-390.png) | [Directory](after-390.png), [Create account](after-create-390.png) |
| 768 px | [Directory](before-768.png) | [Directory](after-768.png) |
| 1024 px | [Directory](before-1024.png) | [Directory](after-1024.png) |
| 1440 px | [Directory](before-1440.png), [Selected account](before-selected-1440.png) | [Directory](after-1440.png), [Selected account](after-selected-1440.png) |

## Reproduce

Provision a fresh database using the [disposable test database runbook](../../runbooks/disposable-test-database.md).
Set `NODE_ENV=test`, the provisioned `TEST_DATABASE_URL`, and `HIREME_E2E_CHROMIUM_CHANNEL=chrome`
for installed Chrome. Run the browser scenarios and the administration API suite.

```bash
node scripts/functional-qa/run.mjs --test-name-pattern='administration-users|administration-access|record-permissions'
pnpm --filter @hire-me/api test:db -- test/admin.integration.test.ts
pnpm test:db:check-catalog
```

The browser suite saves screenshots to the run's evidence directory. Set `HIREME_CAPTURE_USERS=1`
to refresh the checked-in after captures.

## Coverage

- The real browser opens and closes account details with the keyboard in EN and FR at all
  five widths. It checks focus transfer, no vacant details, and no horizontal overflow.
- The lifecycle scenario checks search and status filtering, list and role retry, English
  and French validation, duplicate email, dirty cancellation, and recovery after a rejected
  profile save. It verifies successful persistence after reload and runs role add/remove,
  suspension, reactivation, archiving, and one/all session revocations against the real API.
- The scenario checks seven denied mutations with an unprivileged account. The nine-role
  browser matrix compares Administration direct-route access against the API. The PostgreSQL
  suite covers the last active SUPER_ADMIN, self-lockout, role scope, revocation, and
  credential-safe responses and audit records.
- The Training regression exercises a real first keystroke, the Console dirty indicator
  and navigation confirmation, and clearing the guard when the draft is undone.

Search and status filtering use the existing directory query. Role names and assigned-role
summaries use the existing localized catalog copy. Effective access uses only the selected
account's server response and the #260 disclosure component. Account language accepts existing
contract-valid codes, with English and French suggestions in the form.

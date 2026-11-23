# Administration acceptance · Issue #261

The isolated acceptance branch starts at [PR #280](https://github.com/cyberdr1ft3r/hire-me-platform/pull/280) commit `7a8fc47fce20ee05491ae6904f793d1f86dc6dae`. It includes the reviewed #276 Access, #278 Console/Training, #279 Users and #280 Billing changes. Chrome uses the real Vite web app, NestJS REST API and a fresh, marked PostgreSQL 16 database bound to loopback, with synthetic users and company data. The browser environment keeps official invoice issuance disabled.

## Combined acceptance matrix

| Journey | Engineering evidence |
| --- | --- |
| Navigate Administration | Billing, Users and Roles and Permissions in EN/FR. Verify the current section, the one selected desktop Console tab and the corresponding mobile switcher entry at 360, 390, 768, 1024, 1280 and 1440 px. |
| Find and inspect an account | Search with keyboard input, filter by status, inspect selected-user details and return focus to the same directory item. Exercise loading, failure, empty results and filter reset. |
| Create and edit an account | Validate missing fields and duplicate email. Preserve edits across a failed request. Save and reload, verify no initial password in the create response or rendered form after completion, and leave protected edits only after confirmation. |
| Review and change access | Inspect roles, assign and remove a role through named confirmations, and inspect effective permissions. Check catalog search, filtering, disclosure, failed read and retry. |
| Revoke and change status | Confirm single and all-session revocations. Verify revoked refresh cookies return 401. Verify suspension disables login and rejects an unexpired bearer token. Reactivate the account and keep previously revoked sessions revoked. Verify last active `SUPER_ADMIN` and self-lockout rejection in PostgreSQL-backed API tests. |
| Change company profile | Validate missing input, cancel unsaved navigation, simulate a failing save, recover and reload persisted synthetic details. Check positive, read-only and denied paths on the API. |
| Review and activate numbering | Verify a blank baseline does not submit, preview the next reference before any write, confirm the baseline separately, and require a second explicit confirmation for numbering activation. Reject missing or regressing baselines. Assert an issuance request still returns `INVOICE_ISSUANCE_DISABLED` after successful synthetic numbering activation. |
| Verify historical and audit invariants | Database integration checks serialized allocation, collision refusal, the unchanged issued reference and complete business snapshot, unchanged invoice events and audit rows, and new audit records for allowed Administration operations. Synthetic Commercial integration fixtures are confined to their isolated suite. |
| Regression | Continue from the #278 Console guard through a trusted-key Training create and a GET of the saved program. Exercise Dashboard, Clients and Candidates on the real stack. |

Session revocation follows the current refresh-session contract. A bearer token issued before revocation can still work until its configured expiry while the account stays active. The default maximum remaining window is five minutes. Suspension rejects protected requests immediately. The existing confirmations describe the effect on renewal. Immediate revocation of previously issued bearer tokens would require a separate auth decision. [Authentication contract](../../authentication.md)

## Seeded role and permission matrix

| Role | Billing read | Billing manage | Users and effective access | Access catalog | Administration route |
| --- | --- | --- | --- | --- | --- |
| `SUPER_ADMIN` | Yes | Yes | Manage | Read | All three sections |
| `ADMIN` | Yes | Yes | Manage | Read | All three sections |
| `HR_MANAGER` | Denied | Denied | Denied | Denied | Denied |
| `MANAGER` | Denied | Denied | Denied | Denied | Denied |
| `TEAM_LEADER` | Denied | Denied | Denied | Denied | Denied |
| `EMPLOYEE` | Denied | Denied | Denied | Denied | Denied |
| `FINANCE_MANAGER` | Yes | Yes | Denied | Denied | Billing only |
| `GUEST` | Denied | Denied | Denied | Denied | Denied |
| `CLIENT_USER` | Denied | Denied | Denied | Denied | Denied |

The read-only Billing API test temporarily removes the management grant from one synthetic fixture in disposable PostgreSQL and restores the original grant. The catalog check verifies nine roles, 146 permissions and 477 grants, including active-state drift, replacements and permission metadata. `CLIENT_USER` here is an internal QA identity seeded for deny-path coverage. Portal access has its own [product and architecture preflight](../../design/issue-236-authenticated-portals-preflight.md).

## Human and financial gates

Use the separate [human-testing record](HUMAN-TESTING.md) for screen readers, physical mobile and business-user UAT. An authorized staging run on the reviewed SHA and signoff from business users are still required. #274 remains the designated UAT candidate until the maintainer changes it.

Before any invoice issuance decision, obtain finance and legal approval of the real seller identity and required fields, the official number series and highest previously issued external number for the applicable year, and the applicable tax/exception, buyer address and service-date policies. Issue #261 uses synthetic values and records no business approval. Keep #265 in its separate review.

## Defect register

| Priority | Finding | Disposition |
| --- | --- | --- |
| P0 | No release-blocking defect reproduced in the covered flows. | Human and staging gates remain pending. |
| P1 | Axe reported `aria-required-children` on the desktop Console tablist across Billing, Users and Access in both languages. Inline Close buttons shared the tablist with tabs. | Fixed and retested. The tablist contains tabs and presentational wrappers. Delete remains on each closable tab, and Close remains in the More tabs or mobile Tabs dialog. |
| P2 | A previously issued bearer can still make requests until expiry after standalone session revocation. | Existing auth behavior and a residual security limitation. Keep the refresh/session and suspension checks distinct. Product and security owners would need to approve any immediate bearer revocation requirement. |

## Screenshots

- Console tablist at 1440 px, English Access. [Before on #280](before-console-en-1440.png) · [After the semantic fix](after-console-en-1440.png)
- French administration at 360 px. [Billing](admin-261-billing-fr-360.png) · [Users](admin-261-users-fr-360.png) · [Access](admin-261-access-fr-360.png)
- Dedicated account creation and explicit numbering review. [New user at 390 px](user-create-390.png) · [Annual baseline review](billing-baseline-review.png)
- The prior scoped field and directory changes are documented with their original before/after captures. [Billing](../issue-258-billing/README.md#screenshots) · [Users](../issue-259-users/README.md)

## Accessibility evidence

Chrome 157 and axe-core 4.14.1 applied WCAG 2.0 and 2.1 A/AA rules. The baseline produced six desktop findings of the same tablist rule across Billing, Users and Access in EN/FR. The corrected build reported zero violations in the same 12 desktop and mobile section scans. These checks complement the full six-width responsive and keyboard coverage.

An operator-driven Chrome session exercised the English Users path with actual Tab, Shift+Tab, Enter, Escape and Delete. Tab moved from the selected Administration tab through the switcher, Billing, Users and Access, then to New user. Enter focused Display name in the drawer, Tab reached Email and Shift+Tab returned to Display name. Escape restored focus to New user when the form was clean. With a draft, Escape focused Keep editing. Choosing it preserved the entered value and returned focus to the field. Discard returned focus to New user, and Delete on Administration closed the workspace and selected Overview.

## Reproduce

Follow the [disposable database runbook](../../runbooks/disposable-test-database.md). Use `NODE_ENV=test`, the provisioned `TEST_DATABASE_URL` and `HIREME_E2E_CHROMIUM_CHANNEL=chrome`. For the accessibility run set `HIREME_AXE_SCRIPT` to the absolute path of `axe.min.js` from `axe-core@4.14.1` obtained in a temporary directory with `npm pack`. Screenshots and the JSON report are written to the functional runner's ignored evidence directory.

```bash
node scripts/functional-qa/run.mjs --test-name-pattern='administration-acceptance|administration-users|administration-billing|administration-access|record-permissions'
node scripts/functional-qa/run.mjs --test-name-pattern='executive-dashboard|candidate validation|client, mission'
pnpm --filter @hire-me/api test:db -- test/admin.integration.test.ts test/commercial.integration.test.ts
pnpm test:db:check-catalog
pnpm --filter @hire-me/web exec vitest run src/admin src/training src/App.test.tsx src/console
```

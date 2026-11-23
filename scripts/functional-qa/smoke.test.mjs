import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const {
  HIREME_E2E_WEB: web,
  HIREME_E2E_API: api,
  HIREME_E2E_EVIDENCE: evidence,
  HIREME_E2E_CHROMIUM_CHANNEL: channel,
} = process.env;
const admin = 'bootstrap-admin@test-db.hireme.test';
const password = 'CiSyntheticAdminPassphrase123!';
const run = randomUUID().slice(0, 8);
let browser;
before(async () => {
  assert.ok(web && api && evidence, 'Start with pnpm test:e2e.');
  for (const url of [web, api]) assert.equal(new URL(url).hostname, '127.0.0.1');
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch(channel ? { channel } : {});
});
after(async () => browser?.close());

async function withPage(operation, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ locale: 'en-GB', viewport });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(30_000);
    return await operation(page);
  } finally {
    await context.close();
  }
}
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const heading = (scope, name) => scope.getByRole('heading', { name, exact: true });
const nav = (page, route) => page.locator(`nav a[href="${route}"]`);
const response = (page, method, pathname) =>
  page.waitForResponse(
    (value) => new URL(value.url()).pathname === pathname && value.request().method() === method,
  );
async function request(token, url, method = 'GET', body) {
  return fetch(api + url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: JSON.stringify(body),
  });
}
async function login(page, email = admin) {
  await page.goto(web, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  const loginResponse = response(page, 'POST', '/auth/login');
  await button(page, 'Login').click();
  const result = await loginResponse;
  assert.equal(result.status(), 201, 'Login status');
  await heading(page, 'Overview').or(heading(page, 'Executive dashboard')).waitFor();
  return (await result.json()).accessToken;
}

test('executive-dashboard: real widgets, retry, language, drilldown and restricted fallback', async () => {
  let restrictedEmail;
  await withPage(async (page) => {
    const token = await login(page);
    const dashboard = heading(page, 'Executive dashboard');
    await dashboard.waitFor();
    const interviews = page.getByRole('region', { name: 'Your upcoming interviews' });
    await interviews.getByText('No matching records.').waitFor();
    const future = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const clientResponse = await request(token, '/v1/clients', 'POST', {
      name: `Executive client ${run}`,
    });
    assert.equal(clientResponse.status, 201);
    const { client } = await clientResponse.json();
    const title = `Executive mission ${run}`;
    const missionResponse = await request(token, '/v1/missions', 'POST', {
      clientId: client.id,
      title,
      applicationDeadline: future,
      state: 'ACTIVE',
    });
    assert.equal(missionResponse.status, 201);
    const { mission } = await missionResponse.json();
    const { user } = await (await request(token, '/auth/me')).json();
    const missionPath = `/v1/missions/${mission.id}`;
    assert.equal(
      (
        await request(token, `${missionPath}/assignments`, 'POST', {
          role: 'RECRUITER',
          userId: user.id,
        })
      ).status,
      201,
    );
    const candidateResponse = await request(token, '/v1/candidates', 'POST', {
      displayName: `Executive candidate ${run}`,
    });
    assert.equal(candidateResponse.status, 201);
    const { candidate } = await candidateResponse.json();
    const processResponse = await request(token, `${missionPath}/candidates`, 'POST', {
      candidateId: candidate.id,
      responsibleRecruiterUserId: user.id,
    });
    assert.equal(processResponse.status, 201);
    const { candidateProcess } = await processResponse.json();
    const processPath = `${missionPath}/candidates/${candidateProcess.id}`;
    for (const state of ['CV_TO_REVIEW', 'HR_PRESELECTION']) {
      assert.equal(
        (await request(token, `${processPath}/transition`, 'POST', { state })).status,
        200,
      );
    }
    assert.equal(
      (
        await request(token, `${processPath}/interviews`, 'POST', {
          type: 'HR',
          format: 'PHONE',
          scheduledStartAt: future,
          organizerUserId: user.id,
          timezone: 'UTC',
        })
      ).status,
      201,
    );
    const secondCandidateResponse = await request(token, '/v1/candidates', 'POST', {
      displayName: `Second executive candidate ${run}`,
    });
    assert.equal(secondCandidateResponse.status, 201);
    const { candidate: secondCandidate } = await secondCandidateResponse.json();
    const secondProcessResponse = await request(token, `${missionPath}/candidates`, 'POST', {
      candidateId: secondCandidate.id,
      responsibleRecruiterUserId: user.id,
    });
    assert.equal(secondProcessResponse.status, 201);
    const { candidateProcess: secondProcess } = await secondProcessResponse.json();
    for (const state of ['CV_TO_REVIEW', 'HR_PRESELECTION']) {
      assert.equal(
        (
          await request(token, `${missionPath}/candidates/${secondProcess.id}/transition`, 'POST', {
            state,
          })
        ).status,
        200,
      );
    }
    const task = `Executive due task ${run}`;
    assert.equal(
      (
        await request(token, '/v1/tasks', 'POST', {
          title: task,
          ownerUserId: user.id,
          dueAt: future,
        })
      ).status,
      201,
    );

    restrictedEmail = `dashboard-guest-${run}@qa.hireme.test`;
    const restricted = await request(token, '/v1/admin/users', 'POST', {
      displayName: 'QA dashboard guest',
      email: restrictedEmail,
      initialPassword: password,
      locale: 'en',
    });
    assert.equal(restricted.status, 201);
    const { user: guest } = await restricted.json();
    assert.equal(
      (
        await request(token, `/v1/admin/users/${guest.id}/roles`, 'POST', {
          roleName: 'GUEST',
        })
      ).status,
      201,
    );

    const summaryPath = '**/v1/reporting/recruitment/summary';
    await page.route(summaryPath, (route) => route.fulfill({ status: 503 }));
    const restored = response(page, 'POST', '/auth/refresh');
    restored.catch(() => {});
    await page.reload();
    assert.equal((await restored).status(), 201);
    await dashboard.waitFor();
    const snapshot = page.getByRole('region', { name: 'Recruitment snapshot' });
    await snapshot.getByText('This information could not be loaded.').waitFor();
    await page.getByRole('link', { name: task, exact: true }).waitFor();
    await page.unroute(summaryPath);
    await button(snapshot, 'Try again').click();
    const missionLink = snapshot.getByRole('link', { name: title, exact: true });
    await missionLink.waitFor();
    await interviews.getByRole('link', { name: 'Scheduled interview' }).waitFor();
    const activity = page.getByRole('region', { name: 'Recent pipeline activity' });
    const firstEntry = activity.getByRole('link', {
      name: `${title} — HR preselection (entry 1 of 2)`,
      exact: true,
    });
    const secondEntry = activity.getByRole('link', {
      name: `${title} — HR preselection (entry 2 of 2)`,
      exact: true,
    });
    await firstEntry.waitFor();
    await secondEntry.waitFor();
    const entryPaths = await Promise.all([
      firstEntry.getAttribute('href'),
      secondEntry.getAttribute('href'),
    ]);
    assert.deepEqual(
      entryPaths.sort(),
      [candidateProcess.id, secondProcess.id]
        .map((id) => `/missions?mission=${mission.id}&process=${id}`)
        .sort(),
    );
    assert.equal(await missionLink.getAttribute('href'), `/missions?mission=${mission.id}`);
    await page.screenshot({
      path: path.join(evidence, 'executive-dashboard-desktop.png'),
      fullPage: true,
    });
    await missionLink.click();
    await heading(page, title).waitFor();
    await page.goBack();
    await dashboard.waitFor();

    await page.getByRole('combobox', { name: 'Language' }).selectOption('fr');
    await page.setViewportSize({ width: 390, height: 844 });
    await heading(page, 'Tableau de bord exécutif').waitFor();
    await page.getByRole('link', { name: title, exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({
      path: path.join(evidence, 'executive-dashboard-mobile-fr.png'),
      fullPage: true,
    });
  });
  await withPage(async (page) => {
    const requests = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/v1/reporting/'))
        requests.push(request.url());
    });
    const token = await login(page, restrictedEmail);
    await heading(page, 'Overview').waitFor();
    assert.equal(await heading(page, 'Executive dashboard').count(), 0);
    assert.deepEqual(requests, []);
    assert.equal((await request(token, '/v1/reporting/recruitment/summary')).status, 403);
    await page.screenshot({ path: path.join(evidence, 'executive-dashboard-restricted.png') });
  });
});

test('protected route, refresh on reload, and logout', async () => {
  await withPage(async (page) => {
    await page.goto(`${web}/candidates`, { waitUntil: 'domcontentloaded' });
    await button(page, 'Login').waitFor();
    assert.equal((await request(null, '/v1/candidates')).status, 401);
    await login(page);
    let release;
    const refreshGate = new Promise((resolve) => {
      release = resolve;
    });
    await page.route('**/auth/refresh', async (route) => {
      await refreshGate;
      await route.continue();
    });
    const refresh = response(page, 'POST', '/auth/refresh');
    refresh.catch(() => {});
    try {
      await page.reload();
      await page.getByRole('status').filter({ hasText: 'Checking your session' }).waitFor();
      assert.equal(await button(page, 'Login').count(), 0);
      await page.screenshot({ path: path.join(evidence, 'restore-after.png') });
    } finally {
      release();
      await page.unroute('**/auth/refresh');
    }
    assert.equal((await refresh).status(), 201);
    await heading(page, 'Overview').or(heading(page, 'Executive dashboard')).waitFor();
    const logout = response(page, 'POST', '/auth/logout');
    logout.catch(() => {});
    await page.getByLabel('Account and session').click();
    await button(page, 'Sign out').click();
    await button(page, 'Login').waitFor();
    assert.ok((await logout).ok());
    await page.goto(`${web}/candidates`, { waitUntil: 'domcontentloaded' });
    await button(page, 'Login').waitFor();
  });
});

test('administration-access: search, permission disclosure, retry and bilingual narrow layout', async () => {
  await withPage(async (page) => {
    const token = await login(page);
    assert.equal((await request(token, '/v1/admin/roles')).status, 200);
    assert.equal((await request(token, '/v1/admin/permissions')).status, 200);
    await page.route('**/v1/admin/permissions', (route) => route.abort());
    await page.evaluate(() => {
      history.pushState(null, '', '/admin?section=access');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await heading(page, 'Roles and permissions').waitFor();
    await button(page, 'Retry loading access').waitFor();
    await page.unroute('**/v1/admin/permissions');
    await button(page, 'Retry loading access').click();

    const roles = page.getByRole('region', { name: 'Approved roles' });
    await roles.getByText('Platform-wide administration.', { exact: true }).waitFor();
    const query = page.getByRole('searchbox', { name: 'Search roles and permissions' });
    await query.fill('super administrator');
    assert.equal(await roles.getByRole('article').count(), 1);
    await page.getByRole('combobox', { name: 'Functional area' }).selectOption('recruitment');

    const role = roles.getByRole('article');
    const roleDisclosure = role.locator('summary').first();
    await roleDisclosure.focus();
    await page.keyboard.press('Enter');
    assert.equal(
      await roleDisclosure.evaluate((summary) => summary.matches(':focus-visible')),
      true,
    );
    const recruitment = role.locator('summary').filter({ hasText: /^Recruitment ·/ });
    await recruitment.waitFor();
    const technicalCode = role.locator('code').filter({ hasText: /^candidates:view$/ });
    assert.equal(await technicalCode.isVisible(), false);
    await recruitment.focus();
    await page.keyboard.press('Space');
    await technicalCode.waitFor();

    await query.fill('no result for this synthetic query');
    await roles.getByText('No entries match these filters.').waitFor();
    await button(page, 'Clear access filters').click();
    await heading(roles, 'Super administrator').waitFor();
    await page.locator('.app-shell__language-select:visible').selectOption('fr');
    await page.setViewportSize({ width: 360, height: 800 });
    await page.getByRole('searchbox', { name: 'Rechercher des rôles et permissions' }).waitFor();
    await heading(page, 'Super-administrateur').waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.screenshot({ path: path.join(evidence, 'access-overview-fr-360.png') });
  });
});

test('administration-billing: localized profile and guarded numbering on the real API', async () => {
  const output =
    process.env.HIREME_CAPTURE_BILLING === '1' ? 'docs/audit/issue-258-billing' : evidence;
  await mkdir(output, { recursive: true });
  const settingsPath = '/v1/admin/billing-settings';
  const baselinePath = settingsPath + '/numbering-baseline';
  const currentYear = new Date().getUTCFullYear();
  await withPage(async (page) => {
    const token = await login(page);
    const read = async () => {
      const result = await request(token, settingsPath);
      assert.equal(result.status, 200);
      const {
        settings: { updatedAt, ...settings },
      } = await result.json();
      return settings;
    };
    const original = await read();
    try {
      const seeded = await request(token, settingsPath, 'PATCH', {
        ...original,
        sellerLegalName: 'Synthetic Demo Company',
        sellerLegalForm: 'SARL',
        sellerAddress: '100 Example Avenue',
        sellerEmail: 'billing@example.test',
        paymentTerms: 'Synthetic terms',
        invoicePrefix: 'DEMO',
        invoiceDigits: 4,
        invoiceNumberingEnabled: false,
      });
      assert.equal(seeded.status, 200);
      await page.goto(web + '/admin?section=billing');
      const setBillingLocale = async (locale) => {
        await page.getByText('Synthetic Demo Company', { exact: true }).waitFor();
        if ((await page.locator('html').getAttribute('lang')) !== locale) {
          await page.evaluate((value) => localStorage.setItem('hireme.locale', value), locale);
          await page.reload({ waitUntil: 'domcontentloaded' });
        }
        await page.waitForFunction((value) => document.documentElement.lang === value, locale);
      };
      for (const locale of ['en', 'fr']) {
        await setBillingLocale(locale);
        const labels =
          locale === 'en'
            ? [
                'Legal identity',
                'Company contact details',
                'Payment information',
                'Invoice numbering and annual baseline',
              ]
            : ['Identité légale', 'Coordonnées', 'Paiement', 'Numérotation / base annuelle'];
        for (const width of [1440, 1024, 768, 390, 360]) {
          await page.setViewportSize({ width, height: 900 });
          for (const label of labels) await heading(page, label).waitFor();
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            true,
          );
          assert.equal(
            await page.locator('.billing-settings__numbering').getAttribute('open'),
            null,
          );
          if (locale === 'en' || width === 360) {
            await page.screenshot({
              animations: 'disabled',
              fullPage: true,
              path: path.join(
                output,
                locale === 'en' ? 'after-' + width + '.png' : 'after-fr-360.png',
              ),
            });
          }
          const edit = button(
            page,
            locale === 'en' ? 'Edit company profile' : 'Modifier le profil société',
          );
          await edit.press('Enter');
          const drawer = page.getByRole('dialog');
          const legalName = drawer.getByLabel(
            locale === 'en' ? 'Legal company name' : 'Raison sociale',
          );
          await legalName.waitFor();
          assert.equal(await legalName.evaluate((node) => document.activeElement === node), true);
          assert.equal(
            await drawer.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
            true,
          );
          assert.equal(
            await drawer
              .getByLabel(locale === 'en' ? 'Invoice prefix' : 'Préfixe des factures')
              .count(),
            0,
          );
          if (locale === 'en' && width === 390) {
            await page.screenshot({
              animations: 'disabled',
              path: path.join(output, 'after-profile-390.png'),
            });
          }
          await page.keyboard.press('Escape');
          await drawer.waitFor({ state: 'detached' });
          assert.equal(await edit.evaluate((node) => document.activeElement === node), true);
        }
      }
      await setBillingLocale('en');
      await page.getByRole('link', { name: 'Users', exact: true }).click();
      await heading(page, 'Users').waitFor();
      await page.getByRole('link', { name: 'Billing', exact: true }).click();
      await page.getByText('Synthetic Demo Company', { exact: true }).waitFor();
      await page.setViewportSize({ width: 390, height: 900 });
      await button(page, 'Edit company profile').press('Enter');
      let dialog = page.getByRole('dialog');
      const name = dialog.getByLabel('Legal company name');
      await name.press('End');
      await name.pressSequentially(' Updated');
      await page.keyboard.press('Escape');
      await button(dialog, 'Keep editing').press('Enter');
      assert.equal(await name.inputValue(), 'Synthetic Demo Company Updated');
      await page.evaluate(() => history.back());
      await button(dialog, 'Keep editing').press('Enter');
      await page.waitForURL('**/admin?section=billing');
      assert.equal(await name.inputValue(), 'Synthetic Demo Company Updated');
      const email = dialog.getByLabel('Email');
      await email.fill('not-an-email');
      await button(dialog, 'Save company profile').press('Enter');
      await dialog.getByText('Enter a valid email address.').waitFor();
      assert.equal(await email.getAttribute('aria-invalid'), 'true');
      await email.fill('updated@example.test');
      await page.route('**/v1/admin/billing-settings', (route) =>
        route.request().method() === 'PATCH'
          ? route.fulfill({ status: 503, json: {} })
          : route.continue(),
      );
      await button(dialog, 'Save company profile').press('Enter');
      await dialog.getByText(/Your entries are still available/).waitFor();
      assert.equal(await name.inputValue(), 'Synthetic Demo Company Updated');
      assert.equal(await email.inputValue(), 'updated@example.test');
      await page.unroute('**/v1/admin/billing-settings');
      await button(dialog, 'Save company profile').press('Enter');
      await dialog.waitFor({ state: 'detached' });
      await page.getByText('Billing settings saved.').waitFor();
      const updated = await read();
      assert.equal(updated.sellerEmail, 'updated@example.test');
      assert.equal(updated.invoicePrefix, 'DEMO');
      assert.equal(updated.invoiceNumberingEnabled, false);

      await page.setViewportSize({ width: 1024, height: 900 });
      const disclosure = page.locator('.billing-settings__numbering > summary');
      await disclosure.press('Enter');
      const stageNumbering = async () => {
        await button(page, 'Edit invoice numbering').press('Enter');
        const numbering = page.getByRole('dialog');
        await numbering.getByRole('checkbox', { name: 'Use automatic invoice numbering' }).check();
        await button(numbering, 'Review numbering change').press('Enter');
        const review = heading(numbering, 'Review the change');
        await review.waitFor();
        assert.equal(await review.evaluate((node) => document.activeElement === node), true);
        assert.equal((await read()).invoiceNumberingEnabled, false);
        return numbering;
      };
      dialog = await stageNumbering();
      await button(dialog, 'Confirm numbering change').press('Enter');
      await dialog.getByText(/Confirm the current UTC year/).waitFor();
      assert.equal(await dialog.evaluate((node) => node.contains(document.activeElement)), true);
      assert.equal((await read()).invoiceNumberingEnabled, false);
      await page.keyboard.press('Escape');
      await button(dialog, 'Discard changes').press('Enter');

      await button(page, 'Set annual baseline').press('Enter');
      dialog = page.getByRole('dialog');
      await dialog.getByLabel(/^Year/).fill(String(currentYear));
      await button(dialog, 'Review baseline').press('Enter');
      await dialog.getByText('Enter a non-negative whole number.').waitFor();
      await dialog.getByLabel(/^Highest externally issued number/).fill('18');
      let baselinePosts = 0;
      const countWrite = (req) => {
        if (req.method() === 'POST' && new URL(req.url()).pathname === baselinePath)
          baselinePosts++;
      };
      page.on('request', countWrite);
      await button(dialog, 'Review baseline').press('Enter');
      await dialog
        .getByText(
          'The next automatic reference would be DEMO-' +
            currentYear +
            '-0019 if the series is used.',
        )
        .waitFor();
      assert.equal(baselinePosts, 0);
      await page.screenshot({
        animations: 'disabled',
        path: path.join(output, 'after-baseline-review.png'),
      });
      await button(dialog, 'Back to edit').press('Enter');
      assert.equal(await dialog.getByLabel(/^Highest externally issued number/).inputValue(), '18');
      await button(dialog, 'Review baseline').press('Enter');
      await button(dialog, 'Confirm annual baseline').press('Enter');
      await page.getByText('Baseline confirmed for DEMO-' + currentYear + ' at 18.').waitFor();
      assert.equal(baselinePosts, 1);
      page.off('request', countWrite);
      assert.equal((await read()).invoiceNumberingEnabled, false);

      dialog = await stageNumbering();
      await button(dialog, 'Confirm numbering change').press('Enter');
      await dialog.waitFor({ state: 'detached' });
      assert.equal((await read()).invoiceNumberingEnabled, true);
      await page.reload();
      await page.getByText('Synthetic Demo Company Updated', { exact: true }).waitFor();
      await disclosure.press('Enter');
      await page
        .locator('.billing-settings__numbering')
        .getByText('Enabled', { exact: true })
        .waitFor();

      const lower = await request(token, baselinePath, 'POST', {
        year: currentYear,
        highestExternalNumber: 17,
        confirmed: true,
      });
      assert.equal(lower.status, 409);
      assert.equal((await lower.json()).error.code, 'INVOICE_NUMBER_BASELINE_REGRESSION');
    } finally {
      assert.equal((await request(token, settingsPath, 'PATCH', original)).status, 200);
    }
  });
});

test('administration-users: bilingual directory, account lifecycle and recovery', async () => {
  const captureDir =
    process.env.HIREME_CAPTURE_USERS === '1' ? 'docs/audit/issue-259-users' : evidence;
  await mkdir(captureDir, { recursive: true });

  await withPage(async (page) => {
    const token = await login(page);
    const createUser = async (displayName, email) => {
      const result = await request(token, '/v1/admin/users', 'POST', {
        displayName,
        email,
        initialPassword: password,
        locale: 'en',
      });
      assert.equal(result.status, 201);
      return (await result.json()).user;
    };
    const alex = await createUser('Alex Martin', 'audit-0@users259.test');
    const camille = await createUser('Camille Renard', 'audit-1@users259.test');
    const morgan = await createUser('Morgan Lee', 'audit-2@users259.test');
    const userPath = (user) => '/v1/admin/users/' + user.id;
    for (const [user, roleName] of [
      [alex, 'HR_MANAGER'],
      [camille, 'EMPLOYEE'],
      [morgan, 'EMPLOYEE'],
    ]) {
      assert.equal(
        (await request(token, userPath(user) + '/roles', 'POST', { roleName })).status,
        201,
      );
    }
    assert.equal(
      (await request(token, userPath(camille) + '/status', 'PATCH', { status: 'SUSPENDED' }))
        .status,
      200,
    );
    const signInTarget = (email) => request(undefined, '/auth/login', 'POST', { email, password });
    assert.equal((await signInTarget(alex.email)).status, 201);
    assert.equal((await signInTarget(alex.email)).status, 201);
    const restricted = await signInTarget(morgan.email);
    assert.equal(restricted.status, 201);
    const restrictedToken = (await restricted.json()).accessToken;

    const people = web + '/admin?section=users';
    await page.goto(people);
    const setUsersLocale = async (locale) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await button(page, 'Alex Martin').waitFor();
      const current = await page.locator('html').getAttribute('lang');
      if (current !== locale) {
        await page.evaluate((value) => localStorage.setItem('hireme.locale', value), locale);
        await page.reload({ waitUntil: 'domcontentloaded' });
      }
      await page.waitForFunction((value) => document.documentElement.lang === value, locale);
      await button(page, 'Alex Martin').waitFor();
    };
    const widths = [1440, 1024, 768, 390, 360];
    for (const locale of ['en', 'fr']) {
      await setUsersLocale(locale);
      const directory = page.getByRole('region', {
        name: locale === 'en' ? 'User directory' : 'Annuaire des utilisateurs',
      });
      const detail = page.getByRole('region', {
        name: locale === 'en' ? 'Selected user detail' : 'Détail de l’utilisateur sélectionné',
      });
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await button(directory, 'Alex Martin').waitFor();
        assert.equal(await detail.count(), 0, 'no vacant detail panel');
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
        );
        assert.equal(
          await directory.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
          true,
        );
        if (locale === 'en' || width === 360) {
          await page.evaluate(() => {
            document.activeElement?.blur();
            window.scrollTo(0, 0);
          });
          await page.screenshot({
            animations: 'disabled',
            path: path.join(
              captureDir,
              locale === 'en' ? 'after-' + width + '.png' : 'after-fr-360.png',
            ),
            fullPage: true,
          });
        }
        await button(directory, 'Alex Martin').press('Enter');
        const title = heading(detail, 'Alex Martin');
        await title.waitFor();
        assert.equal(await title.evaluate((node) => document.activeElement === node), true);
        await detail
          .getByText(locale === 'en' ? 'Assigned roles' : 'Rôles attribués', { exact: true })
          .waitFor();
        assert.equal(
          await detail.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
          true,
        );
        if (locale === 'en' && width === 1440) {
          assert.equal(await button(directory, 'Alex Martin').getAttribute('aria-current'), 'true');
          await page.screenshot({
            animations: 'disabled',
            path: path.join(captureDir, 'after-selected-1440.png'),
            fullPage: true,
          });
        }
        await button(detail, locale === 'en' ? 'Back to users' : 'Retour aux utilisateurs').press(
          'Enter',
        );
        await page.waitForFunction(() => document.activeElement?.textContent === 'Alex Martin');
      }
      if (locale === 'fr') {
        await button(page, 'Nouvel utilisateur').press('Enter');
        const localized = page.getByRole('dialog', { name: 'Créer un utilisateur interne' });
        await button(localized, 'Créer l’utilisateur').press('Enter');
        await localized.getByText('Saisissez une adresse e-mail valide.').waitFor();
        assert.equal(
          await localized.getByLabel('Nom affiché').getAttribute('aria-invalid'),
          'true',
        );
        await page.keyboard.press('Escape');
        await localized.waitFor({ state: 'detached' });
        await page.waitForFunction(
          () => document.activeElement?.textContent === 'Nouvel utilisateur',
        );
      }
    }

    await setUsersLocale('en');
    await page.route('**/v1/admin/users?*', (route) => route.fulfill({ status: 503, json: {} }));
    const search = page.getByRole('searchbox', { name: 'Search' });
    await search.pressSequentially('Camille');
    assert.equal(await search.inputValue(), 'Camille');
    await search.press('Enter');
    await page.getByText('Users unavailable').waitFor();
    await page.unroute('**/v1/admin/users?*');
    await button(page, 'Try again').click();
    assert.equal(await search.inputValue(), 'Camille');
    await page.getByText('1 user', { exact: true }).waitFor();
    await page.getByLabel('Status', { exact: true }).selectOption('ACTIVE');
    await button(page, 'Search users').click();
    await heading(page, 'No users found').waitFor();
    await button(page, 'Clear filters').click();
    await button(page, 'Alex Martin').waitFor();

    const opener = button(page, 'New user');
    await page.setViewportSize({ width: 390, height: 900 });
    await opener.press('Enter');
    let dialog = page.getByRole('dialog', { name: 'Create internal user' });
    let displayName = dialog.getByLabel('Display name');
    assert.equal(await displayName.evaluate((node) => document.activeElement === node), true);
    await page.screenshot({
      animations: 'disabled',
      path: path.join(captureDir, 'after-create-390.png'),
    });
    await button(dialog, 'Create user').click();
    await dialog.getByText('Enter a valid email address.').waitFor();
    assert.equal(await displayName.getAttribute('aria-invalid'), 'true');
    await displayName.pressSequentially('Taylor Admin Test');
    await page.keyboard.press('Escape');
    await button(dialog, 'Keep editing').press('Enter');
    assert.equal(await displayName.inputValue(), 'Taylor Admin Test');
    await dialog.getByLabel('Email').fill(alex.email);
    await dialog.getByLabel('Initial password').fill(password);
    await button(dialog, 'Create user').click();
    await dialog.getByText('An account already uses this email address.').waitFor();
    const email = 'taylor-' + run + '@users259.test';
    await dialog.getByLabel('Email').fill(email);
    const created = response(page, 'POST', '/v1/admin/users');
    await button(dialog, 'Create user').click();
    const createdResponse = await created;
    assert.equal(createdResponse.status(), 201);
    const body = await createdResponse.json();
    assert.equal(JSON.stringify(body).includes(password), false);
    assert.ok(!/password|credential|token/i.test(JSON.stringify(body)));
    const user = body.user;
    assert.equal(user.email, email);
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.locator('input[type=password]').count(), 0);
    await heading(page, 'Taylor Admin Test').waitFor();

    await button(page, 'Edit profile').press('Enter');
    dialog = page.getByRole('dialog', { name: 'Edit profile for Taylor Admin Test' });
    displayName = dialog.getByLabel('Display name');
    await displayName.press('ControlOrMeta+a');
    await displayName.pressSequentially('Taylor Saved');
    await page.route(
      '**/v1/admin/users/' + user.id,
      (route) => route.fulfill({ status: 503, json: {} }),
      { times: 1 },
    );
    await button(dialog, 'Save').click();
    await dialog.getByText('The request could not be completed. Try again.').waitFor();
    assert.equal(await displayName.inputValue(), 'Taylor Saved');
    await button(dialog, 'Save').press('Enter');
    await heading(page, 'Taylor Saved').waitFor();
    assert.equal(
      await button(page, 'Edit profile').evaluate((node) => document.activeElement === node),
      true,
    );

    const detail = page.getByRole('region', { name: 'Selected user detail' });
    await page.route('**/v1/admin/roles', (route) => route.fulfill({ status: 503, json: {} }));
    await button(detail, 'Assign role').click();
    dialog = page.getByRole('dialog', { name: 'Assign role' });
    await dialog.getByText('Could not load roles').waitFor();
    await page.unroute('**/v1/admin/roles');
    await button(dialog, 'Try again').click();
    const role = dialog.getByRole('combobox', { name: 'Role' });
    await role.waitFor();
    assert.equal(await role.inputValue(), '');
    assert.equal(await button(dialog, 'Assign role').isEnabled(), false);
    await role.selectOption('EMPLOYEE');
    await button(dialog, 'Assign role').press('Enter');
    await detail.getByText('Employee', { exact: true }).waitFor();
    const effective = detail.getByText('Effective permissions', { exact: true });
    await effective.press('Enter');
    assert.ok((await detail.locator('.admin-permission-groups summary').count()) > 0);
    await detail.getByRole('button', { name: 'Remove role: Employee' }).click();
    dialog = page.getByRole('dialog', { name: 'Remove role' });
    await dialog.getByText(/Remove Employee from Taylor Saved/).waitFor();
    await button(dialog, 'Remove role').click();
    await detail.getByText('No assigned roles').waitFor();

    for (const [action, cancel] of [
      ['Suspend', true],
      ['Suspend', false],
      ['Reactivate', false],
    ]) {
      await button(detail, action).press('Enter');
      dialog = page.getByRole('dialog', { name: action });
      await dialog.getByText(new RegExp(action + ' Taylor Saved')).waitFor();
      await button(dialog, cancel ? 'Cancel' : action).press('Enter');
      await dialog.waitFor({ state: 'detached' });
      const persisted = await request(token, userPath(user));
      assert.equal(
        (await persisted.json()).user.status,
        action === 'Suspend' && !cancel ? 'SUSPENDED' : 'ACTIVE',
      );
      if (action === 'Suspend' && !cancel) assert.equal((await signInTarget(email)).status, 401);
    }

    await button(detail, 'Back to users').click();
    await button(page, 'Alex Martin').press('Enter');
    const sessions = detail.getByRole('button', { name: /^Revoke session \d+, started/ });
    await sessions.first().waitFor();
    assert.equal(await sessions.count(), 2);
    await sessions.first().press('Enter');
    dialog = page.getByRole('dialog', { name: 'Revoke session' });
    await dialog.getByText(/for Alex Martin/).waitFor();
    await button(dialog, 'Revoke session').press('Enter');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await sessions.count(), 1);
    await button(detail, 'Revoke all sessions').press('Enter');
    dialog = page.getByRole('dialog', { name: 'Revoke all sessions' });
    await button(dialog, 'Revoke all sessions').press('Enter');
    await detail.getByText('No active sessions.').waitFor();
    assert.equal(
      (await (await request(token, userPath(alex) + '/sessions')).json()).sessions.length,
      0,
    );

    await page.reload();
    await button(page, 'Taylor Saved').waitFor();
    await button(page, 'Taylor Saved').press('Enter');
    await button(detail, 'Archive').press('Enter');
    dialog = page.getByRole('dialog', { name: 'Archive' });
    await button(dialog, 'Archive').press('Enter');
    await detail.getByText('Archived', { exact: true }).waitFor();
    assert.equal(await button(detail, 'Reactivate').count(), 0);

    const protectedMutations = [
      [
        'POST',
        '/v1/admin/users',
        {
          displayName: 'Denied account',
          email: 'denied@users259.test',
          initialPassword: password,
          locale: 'en',
        },
      ],
      ['PATCH', userPath(user), { displayName: 'Denied edit' }],
      ['PATCH', userPath(user) + '/status', { status: 'ACTIVE' }],
      ['POST', userPath(user) + '/roles', { roleName: 'EMPLOYEE' }],
      ['DELETE', userPath(user) + '/roles/EMPLOYEE'],
      ['DELETE', userPath(alex) + '/sessions/' + user.id],
      ['DELETE', userPath(alex) + '/sessions'],
    ];
    for (const [method, url, input] of protectedMutations) {
      assert.equal(
        (await request(restrictedToken, url, method, input)).status,
        403,
        method + ' ' + url,
      );
    }
  });
});

test('administration-users: Training keeps the first trusted key and blocks Console navigation', async () => {
  await withPage(async (page) => {
    await login(page);
    await page.goto(web + '/training');
    const create = page.locator('details.training-create');
    await create.locator('summary').press('Enter');
    const reference = create.getByLabel(/^Reference/);
    await reference.pressSequentially('T');
    assert.equal(await reference.inputValue(), 'T');
    await page.locator('[data-dirty="true"]').waitFor({ state: 'attached' });
    const overview = page.getByRole('tab', { name: 'Overview' });
    const modal = page.waitForEvent('dialog').then(async (dialog) => {
      const message = dialog.message();
      await dialog.dismiss();
      assert.match(message, /unsaved changes/);
    });
    await Promise.all([modal, overview.click()]);
    assert.equal(await reference.inputValue(), 'T');
    await reference.press('ControlOrMeta+a');
    await reference.press('Backspace');
    assert.equal(await reference.inputValue(), '');
    await page.locator('[data-dirty="true"]').waitFor({ state: 'detached' });
    await overview.click();
    await heading(page, 'Overview').or(heading(page, 'Executive dashboard')).waitFor();
  });
});

test('candidate validation, network failure, create, edit, and reload persistence', async () => {
  await withPage(async (page) => {
    const token = await login(page);
    await nav(page, '/candidates').click();
    await button(page, 'New candidate').click();
    const form = page.getByRole('form', { name: 'New candidate' });
    const submit = button(page, 'Create candidate');
    const name = `QA Candidate ${run}`;
    const fullName = form.getByLabel(/^Full name/);
    await submit.click();
    assert.equal(await fullName.evaluate((el) => el.validity.valid), false);
    await fullName.fill(name);
    await fullName.press('Escape');
    await page.getByRole('status').filter({ hasText: 'You have unsaved changes.' }).waitFor();
    await button(page, 'Keep editing').click();
    assert.equal(await fullName.inputValue(), name);
    await form.getByLabel('Email', { exact: true }).fill(`candidate-${run}@qa.hireme.test`);
    const endpoint = '**/v1/candidates';
    await page.route(endpoint, (route) =>
      route.request().method() === 'POST' ? route.abort('failed') : route.continue(),
    );
    try {
      const failure = page.waitForEvent(
        'requestfailed',
        (req) => req.method() === 'POST' && new URL(req.url()).pathname === '/v1/candidates',
      );
      await submit.click();
      await failure;
      await page
        .getByRole('alert')
        .filter({ hasText: 'The change could not be saved. Try again.' })
        .waitFor();
      assert.equal(await fullName.inputValue(), name);
    } finally {
      await page.unroute(endpoint);
    }
    let releaseCreate;
    const createGate = new Promise((resolve) => {
      releaseCreate = resolve;
    });
    let submissions = 0;
    await page.route(endpoint, async (route) => {
      if (route.request().method() === 'POST') {
        submissions++;
        await createGate;
      }
      await route.continue();
    });
    const created = response(page, 'POST', '/v1/candidates');
    created.catch(() => {});
    try {
      await submit.click();
      await page.locator('button[type=submit]:disabled').waitFor();
      await fullName.press('Enter');
    } finally {
      releaseCreate();
      await page.unroute(endpoint);
    }
    const result = await created;
    assert.equal(submissions, 1);
    assert.equal(result.status(), 201);
    const { candidate } = await result.json();
    await heading(page, name).waitFor();
    await button(page, 'Edit profile').click();
    const edit = page.getByRole('form', { name: 'Edit profile' });
    const city = 'Synthetic Test City';
    await edit.getByLabel('City', { exact: true }).fill(city);
    const saved = response(page, 'PATCH', `/v1/candidates/${candidate.id}`);
    await button(page, 'Save changes').click();
    assert.equal((await saved).status(), 200);
    await page.reload();
    await heading(page, name).waitFor();
    await page.getByText(city, { exact: true }).first().waitFor();
    const reloaded = await request(token, `/v1/candidates/${candidate.id}`);
    assert.equal(reloaded.status, 200);
    assert.equal((await reloaded.json()).candidate.city, city);
    const inactive = 'INACTIVE';
    await button(page, 'More actions').click();
    const change = response(page, 'PATCH', `/v1/candidates/${candidate.id}/status`);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('menuitem', { name: 'Mark inactive', exact: true }).click();
    assert.equal((await change).status(), 200);
    await page.reload();
    await heading(page, name).waitFor();
    await page.getByText('Inactive', { exact: true }).first().waitFor();
    assert.equal(
      (await (await request(token, `/v1/candidates/${candidate.id}`)).json()).candidate.status,
      inactive,
    );
    await page.screenshot({ path: path.join(evidence, 'candidate-persisted.png') });
  });
});

// Expected grants for these routes are the seeded role contract.
const roles = [
  ['SUPER_ADMIN', true, true],
  ['ADMIN', true, true],
  ['HR_MANAGER', true, false],
  ['MANAGER', false, false],
  ['TEAM_LEADER', false, false],
  ['EMPLOYEE', false, false],
  ['FINANCE_MANAGER', false, false, true],
  ['GUEST', false, false],
  ['CLIENT_USER', false, false],
];
test('record-permissions: nine roles agree on candidate and administration access in UI and API', async (t) => {
  const bootstrap = await request(null, '/auth/login', 'POST', { email: admin, password });
  assert.equal(bootstrap.status, 201);
  const { accessToken } = await bootstrap.json();
  const bootstrapUser = (await (await request(accessToken, '/auth/me')).json()).user;
  const fixtures = [];
  for (const variant of ['North', 'South']) {
    async function create(url, input) {
      const result = await request(accessToken, url, 'POST', input);
      assert.equal(result.status, 201, url);
      return result.json();
    }
    const { client } = await create('/v1/clients', { name: `QA ${variant} client ${run}` });
    const { mission } = await create('/v1/missions', {
      clientId: client.id,
      title: `QA ${variant} mission ${run}`,
    });
    const { candidate } = await create('/v1/candidates', {
      displayName: `QA ${variant} candidate ${run}`,
    });
    await create(`/v1/missions/${mission.id}/assignments`, {
      userId: bootstrapUser.id,
      role: 'RECRUITER',
    });
    const { candidateProcess: process } = await create(`/v1/missions/${mission.id}/candidates`, {
      candidateId: candidate.id,
      responsibleRecruiterUserId: bootstrapUser.id,
    });
    fixtures.push({ client, mission, candidate, process });
  }
  for (const [role, candidates, administration, billing = administration] of roles) {
    await t.test(role, async () => {
      const email = role === 'SUPER_ADMIN' ? admin : `${role.toLowerCase()}-${run}@qa.hireme.test`;
      if (role !== 'SUPER_ADMIN') {
        const created = await request(accessToken, '/v1/admin/users', 'POST', {
          displayName: `QA ${role}`,
          email,
          initialPassword: password,
          locale: 'en',
        });
        assert.equal(created.status, 201, `Create ${role}`);
        const { user } = await created.json();
        const granted = await request(accessToken, `/v1/admin/users/${user.id}/roles`, 'POST', {
          roleName: role,
        });
        assert.ok(granted.ok, `Grant ${role}: ${granted.status}`);
      }
      await withPage(async (page) => {
        const token = await login(page, email);
        for (const [route, endpoint, allowed] of [
          ['/candidates', '/v1/candidates', candidates],
          ['/admin', '/v1/admin/billing-settings', billing],
        ]) {
          assert.equal((await request(token, endpoint)).status, allowed ? 200 : 403, endpoint);
          if (route === '/admin' && (await button(page, 'More').isVisible()))
            await button(page, 'More').click();
          assert.equal((await nav(page, route).count()) > 0, allowed, route);
          if (!allowed) {
            if (role === 'EMPLOYEE' && route === '/admin') {
              await page.goto(web + route, { waitUntil: 'domcontentloaded' });
              await heading(page, 'Protected workspace').waitFor();
              assert.equal(await page.getByRole('tab', { selected: true }).count(), 0);
              await page.screenshot({ path: path.join(evidence, 'employee-admin-denied.png') });
            } else {
              // Reuse the authenticated session for the history route check. The API
              // deliberately rate-limits refreshes by IP, including anonymous requests.
              await page.evaluate((url) => {
                window.history.pushState(null, '', url);
                window.dispatchEvent(new PopStateEvent('popstate'));
              }, route);
              await heading(page, 'Protected workspace').waitFor();
            }
          }
        }
        assert.equal((await request(token, '/v1/admin/users')).status, administration ? 200 : 403);
        for (const { client, mission, candidate, process } of fixtures) {
          const clientPath = `/v1/clients/${client.id}`;
          const missionPath = `/v1/missions/${mission.id}`;
          const candidatePath = `/v1/candidates/${candidate.id}`;
          for (const [url, allowed] of [
            [clientPath, candidates || role === 'FINANCE_MANAGER'],
            [missionPath, candidates],
            [candidatePath, candidates],
            [`${missionPath}/candidates/${process.id}`, candidates],
          ]) {
            assert.equal(
              (await request(token, url)).status,
              allowed ? 200 : 403,
              `${role} GET ${url}`,
            );
          }
          for (const [url, payload] of [
            [clientPath, { name: client.name }],
            [missionPath, { title: mission.title }],
            [candidatePath, { displayName: candidate.displayName }],
          ]) {
            const allowed = candidates;
            assert.equal(
              (await request(token, url, 'PATCH', payload)).status,
              allowed ? 200 : 403,
              `${role} PATCH ${url}`,
            );
          }
        }

        if (!candidates) {
          const denied = await request(token, '/v1/candidates', 'POST', {
            displayName: `Unexpected QA write ${run}`,
          });
          assert.equal(denied.status, 403);
        }
      });
    });
  }
});

test('recruitment-lifecycle: interview, evaluation, offer and closure persist', async () => {
  await withPage(async (page) => {
    const token = await login(page);
    async function create(url, input) {
      const result = await request(token, url, 'POST', input);
      assert.equal(result.status, 201, url);
      return result.json();
    }
    async function submit(control, url, status, confirm = false) {
      const pending = response(page, 'POST', url);
      if (confirm) page.once('dialog', (dialog) => dialog.accept());
      pending.catch(() => {});
      await control.click();
      const result = await pending;
      assert.equal(result.status(), status, url);
      return result.json();
    }
    const { client } = await create('/v1/clients', { name: `Lifecycle client ${run}` });
    const title = `Lifecycle mission ${run}`;
    const { mission } = await create('/v1/missions', { clientId: client.id, title });
    const missionPath = `/v1/missions/${mission.id}`;
    const { user } = await (await request(token, '/auth/me')).json();
    await create(`${missionPath}/assignments`, { userId: user.id, role: 'RECRUITER' });
    const candidateName = `Lifecycle candidate ${run}`;
    const { candidate } = await create('/v1/candidates', { displayName: candidateName });
    const { candidateProcess } = await create(`${missionPath}/candidates`, {
      candidateId: candidate.id,
      responsibleRecruiterUserId: user.id,
    });
    const processPath = `${missionPath}/candidates/${candidateProcess.id}`;
    for (const state of ['CV_TO_REVIEW', 'HR_PRESELECTION']) {
      assert.equal(
        (await request(token, `${processPath}/transition`, 'POST', { state })).status,
        200,
      );
    }
    await nav(page, '/missions').click();
    await button(page, title).click();
    await button(page, 'Open full record').click();
    await heading(page, title).waitFor();
    async function reloadRecord() {
      const refresh = response(page, 'POST', '/auth/refresh');
      refresh.catch(() => {});
      await page.reload();
      assert.equal((await refresh).status(), 201, 'Restore session on mission record reload');
      await heading(page, title).waitFor();
    }
    async function section(name) {
      const tab = page.getByRole('tab', { name, exact: true });
      await ((await tab.count()) ? tab : button(page, name)).click();
    }
    async function openProcess() {
      const open = button(page, `Open the process for ${candidateName}`);
      if (!(await open.isVisible())) await section('Mission candidates');
      await open.click();
    }
    await openProcess();
    const schedule = page.getByRole('form', { name: 'Schedule an interview' });
    await schedule.getByLabel('Format', { exact: true }).selectOption('PHONE');
    const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    await schedule.getByLabel(/^Start/).fill(`${day}T10:00`);
    await schedule.getByLabel('Organizer').selectOption(user.id);
    const interviews = `${processPath}/interviews`;
    const { interview } = await submit(button(schedule, 'Schedule interview'), interviews, 201);
    const interviewPath = `${interviews}/${interview.id}`;
    const interviewRow = page.getByRole('row').filter({ hasText: 'HR interview' });
    await submit(
      interviewRow.getByRole('button', { name: /^Mark completed/ }),
      `${interviewPath}/complete`,
      200,
      true,
    );
    assert.equal(
      (
        await request(token, `${interviewPath}/cancel`, 'POST', {
          reason: 'Synthetic late cancellation',
        })
      ).status,
      409,
    );
    const savedInterview = await request(token, interviewPath);
    assert.equal(savedInterview.status, 200);
    const { interview: completed } = await savedInterview.json();
    assert.equal(completed.status, 'COMPLETED');
    assert.ok(completed.history.some((event) => event.action === 'COMPLETED'));
    await interviewRow.getByRole('button', { name: /^Details/ }).click();
    const evaluation = page.getByRole('form', { name: 'Add an evaluation' });
    await evaluation.getByLabel('Overall').fill('4');
    const evaluations = `${interviewPath}/evaluations`;
    const { evaluation: draft } = await submit(
      button(evaluation, 'Save evaluation'),
      evaluations,
      201,
    );
    await submit(button(page, 'Finalize'), `${evaluations}/${draft.id}/finalize`, 200, true);
    await reloadRecord();
    await openProcess();
    await interviewRow.getByRole('button', { name: /^Details/ }).click();
    await page.getByText('Finalized', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(evidence, 'interview-evaluation-persisted.png') });

    // Advance through the existing approved transition graph to reach the offer UI.
    async function advance(state, skip = false) {
      const result = await request(token, `${processPath}/transition`, 'POST', {
        state,
        ...(skip ? { skip, reason: 'Synthetic optional stage bypass' } : {}),
      });
      assert.equal(result.status, 200, state);
    }
    await advance('HR_INTERVIEW_SCHEDULED');
    await advance('HR_INTERVIEW_COMPLETED');
    await advance('INTERNAL_VALIDATION', true);
    assert.equal((await request(token, `${processPath}/present`, 'POST', {})).status, 200);
    await advance('CLIENT_INTERVIEW_1');
    await advance('CLIENT_OFFER', true);

    await reloadRecord();
    await openProcess();
    const offerForm = page.getByRole('form', { name: 'Create an offer draft' });
    await offerForm.getByLabel('Offered salary').fill('invalid');
    await button(offerForm, 'Create offer draft').press('Enter');
    await offerForm.getByText('Enter an amount such as 36000 or 36000.50.').waitFor();
    await offerForm.getByLabel('Offered salary').fill('10000');
    await offerForm.getByLabel('Contract type').fill('CDI');
    const offers = `${processPath}/offers`;
    const { offer } = await submit(button(offerForm, 'Create offer draft'), offers, 201);
    const version = `${offers}/${offer.currentVersionId}`;
    assert.equal(
      (await request(token, `${version}/response`, 'POST', { status: 'ACCEPTED' })).status,
      409,
    );
    await submit(button(page, 'Mark sent'), `${version}/mark-sent`, 200, true);
    await submit(button(page, 'Record response: Accepted'), `${version}/response`, 200, true);
    await reloadRecord();
    await openProcess();
    const offerRegion = page.getByRole('region', { name: 'Offer', exact: true });
    await offerRegion.getByText('Accepted', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(evidence, 'offer-acceptance-persisted.png') });

    const persistedOffer = await request(token, offers);
    assert.equal(persistedOffer.status, 200);
    assert.ok(
      (await persistedOffer.json()).offer.history.some(
        (event) => event.action === 'RESPONSE_RECORDED',
      ),
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await section('Overview');
    const closure = page.getByRole('form', { name: 'Close mission' });
    await closure.getByLabel('Closure outcome').selectOption('CANCELED');
    await submit(button(closure, 'Close mission'), `${missionPath}/close`, 201, true);
    await reloadRecord();
    await page.getByText('Canceled', { exact: true }).first().waitFor();
    const closed = await request(token, missionPath);
    assert.equal((await closed.json()).mission.state, 'CANCELED');
    await page.screenshot({ path: path.join(evidence, 'mission-cancellation-mobile.png') });
  });
});

test('recruitment-lifecycle: confirm placement and close a filled mission', async () => {
  await withPage(async (page) => {
    const token = await login(page);
    async function apiResult(method, url, expected, input) {
      const result = await request(token, url, method, input);
      assert.equal(result.status, expected, `${method} ${url}`);
      return result.json();
    }
    async function postFromPage(control, url, expected, confirm = false) {
      const pending = response(page, 'POST', url);
      pending.catch(() => {});
      if (confirm) page.once('dialog', (dialog) => dialog.accept());
      await control.click();
      const result = await pending;
      assert.equal(result.status(), expected, url);
      return result.json();
    }

    const { user } = await apiResult('GET', '/auth/me', 200);
    const { client } = await apiResult('POST', '/v1/clients', 201, {
      name: `Placement client ${run}`,
    });
    const title = `Placement mission ${run}`;
    const { mission } = await apiResult('POST', '/v1/missions', 201, {
      clientId: client.id,
      title,
      state: 'OFFER_SENT',
      numberOfPositions: 1,
    });
    const missionPath = `/v1/missions/${mission.id}`;
    await apiResult('POST', `${missionPath}/assignments`, 201, {
      role: 'RECRUITER',
      userId: user.id,
    });
    const name = `Placement candidate ${run}`;
    const { candidate } = await apiResult('POST', '/v1/candidates', 201, { displayName: name });
    const { candidateProcess } = await apiResult('POST', `${missionPath}/candidates`, 201, {
      candidateId: candidate.id,
      responsibleRecruiterUserId: user.id,
    });
    const processPath = `${missionPath}/candidates/${candidateProcess.id}`;
    async function advance(state, skip = false) {
      await apiResult('POST', `${processPath}/transition`, 200, {
        state,
        ...(skip ? { skip, reason: 'Synthetic optional stage bypass' } : {}),
      });
    }
    for (const state of [
      'CV_TO_REVIEW',
      'HR_PRESELECTION',
      'HR_INTERVIEW_SCHEDULED',
      'HR_INTERVIEW_COMPLETED',
    ]) {
      await advance(state);
    }
    await advance('INTERNAL_VALIDATION', true);
    await apiResult('POST', `${processPath}/present`, 200, {});
    await advance('CLIENT_INTERVIEW_1');
    await advance('CLIENT_OFFER', true);

    const { offer } = await apiResult('POST', `${processPath}/offers`, 201, {
      contractType: 'CDI',
    });
    const version = `${processPath}/offers/${offer.currentVersionId}`;
    const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const placementInput = { integrationStartDate: `${date}T00:00:00.000Z` };
    await apiResult('POST', `${version}/confirm-placement`, 409, placementInput);
    await apiResult('POST', `${version}/mark-sent`, 200, {});
    await apiResult('POST', `${version}/response`, 200, { status: 'ACCEPTED' });
    assert.equal((await apiResult('GET', missionPath, 200)).mission.filledPlacementCount, 0);

    const detailUrl = `${web}/missions?mission=${mission.id}`;
    await page.goto(detailUrl);
    await heading(page, title).waitFor();
    const missionTab = (label) =>
      page
        .getByRole('tablist', { name: 'Mission sections' })
        .getByRole('tab', { name: label, exact: true });
    await missionTab('Mission candidates').press('Enter');
    await button(page, `Open the process for ${name}`).click();
    await button(page, 'Confirm placement').click();
    const form = page.getByRole('form', { name: 'Confirm placement' });
    await form.getByLabel(/^Integration start date/).fill(date);
    const { placement } = await postFromPage(
      button(form, 'Confirm placement'),
      `${version}/confirm-placement`,
      200,
    );
    assert.equal(placement.status, 'CONFIRMED');
    assert.equal(placement.offerVersionId, offer.currentVersionId);
    const duplicate = await apiResult('POST', `${version}/confirm-placement`, 200, placementInput);
    assert.equal(duplicate.placement.id, placement.id);
    const recorded = await apiResult('GET', `${processPath}/placement`, 200);
    assert.equal(
      recorded.placement.history.filter((event) => event.action === 'CONFIRMED').length,
      1,
    );
    const integrated = await apiResult('GET', processPath, 200);
    assert.equal(integrated.candidateProcess.state, 'INTEGRATED');
    assert.equal(
      integrated.candidateProcess.history.filter(
        (event) => event.action === 'INTEGRATION_CONFIRMED',
      ).length,
      1,
    );
    assert.equal((await apiResult('GET', missionPath, 200)).mission.filledPlacementCount, 1);
    await page.getByText('Placement confirmed', { exact: true }).first().waitFor();
    await page.screenshot({ path: path.join(evidence, 'placement-confirmed.png') });

    for (const state of ['CANDIDATE_INTEGRATED', 'PROBATION_MONITORING']) {
      await apiResult('PATCH', `${missionPath}/status`, 200, { state });
    }
    const closedState = 'CLOSED_WITH_RECRUITMENT';
    const reason = 'POSITIONS_FILLED_AND_CANDIDATES_INTEGRATED';
    await apiResult('POST', `${missionPath}/close`, 409, {
      state: closedState,
      closureReason: reason,
      filledPlacementCount: 0,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(detailUrl);
    await heading(page, title).waitFor();
    const closure = page.getByRole('form', { name: 'Close mission' });
    await closure.getByLabel('Closure outcome').selectOption(closedState);
    await postFromPage(button(closure, 'Close mission'), `${missionPath}/close`, 201, true);
    await page.reload();
    await heading(page, title).waitFor();
    await page.getByText('Closed with recruitment', { exact: true }).first().waitFor();
    await page.getByText('Closed mission', { exact: true }).waitFor();
    const closed = (await apiResult('GET', missionPath, 200)).mission;
    assert.equal(closed.state, closedState);
    assert.equal(closed.closureReason, reason);
    assert.equal(closed.filledPlacementCount, closed.numberOfPositions);
    assert.ok(closed.closedAt);
    const assignments = await apiResult('GET', `${missionPath}/assignments`, 200);
    assert.equal(assignments.assignments.find((row) => row.userId === user.id)?.status, 'INACTIVE');
    assert.equal((await apiResult('GET', processPath, 200)).candidateProcess.state, 'INTEGRATED');
    assert.equal(
      (await apiResult('GET', `/v1/candidates/${candidate.id}`, 200)).candidate.status,
      candidate.status,
    );
    await apiResult('PATCH', missionPath, 409, { title: 'Disallowed closed mission edit' });
    await page.screenshot({ path: path.join(evidence, 'successful-closure-mobile.png') });
  });
});

// Use the real API to verify records written by the browser and linked across modules.
test('client, mission recruitment, linked task, and mobile workspace', async () => {
  await withPage(async (page) => {
    const token = await login(page);
    const open = async (route) => {
      const link = nav(page, route);
      if (!(await link.isVisible())) await button(page, 'More').click();
      await link.click();
    };
    const clientName = `QA Client ${run}`;
    await open('/clients');
    await button(page, 'New client').click();
    const clientDrawer = page.getByRole('dialog', { name: 'New client' });
    await clientDrawer.getByRole('textbox', { name: 'Client name' }).fill(clientName);
    const clientSave = response(page, 'POST', '/v1/clients');
    await button(clientDrawer, 'Create client').click();
    const clientResult = await clientSave;
    assert.equal(clientResult.status(), 201);
    const { client } = await clientResult.json();
    await heading(page, clientName).waitFor();

    const missionName = `QA Mission ${run}`;
    await open('/missions');
    await button(page, 'New mission').click();
    const missionDrawer = page.getByRole('dialog', { name: 'New mission' });
    await missionDrawer.getByRole('combobox', { name: 'Client', exact: true }).fill(clientName);
    await missionDrawer.getByRole('option', { name: clientName, exact: true }).click();
    await missionDrawer.getByRole('textbox', { name: /^Title/ }).fill(missionName);
    const missionSave = response(page, 'POST', '/v1/missions');
    await button(missionDrawer, 'Create mission').click();
    const missionResult = await missionSave;
    assert.equal(missionResult.status(), 201);
    const { mission } = await missionResult.json();
    await heading(page, missionName).waitFor();
    assert.equal(mission.clientId, client.id);

    const openSection = async (name) => {
      const container = page.getByRole('tab', { name, exact: true });
      if (await container.count()) await container.click();
      else await button(page, name).click();
    };
    const missionPath = `/v1/missions/${mission.id}`;
    await openSection('Team');
    const assignment = page.getByRole('form', { name: 'Assign a team member' });
    await assignment.getByLabel('Role', { exact: true }).selectOption('RECRUITER');
    await assignment.getByRole('combobox', { name: /Team member/ }).fill(admin);
    await page.getByRole('option', { name: new RegExp(admin, 'i') }).click();
    const assign = response(page, 'POST', `${missionPath}/assignments`);
    await button(assignment, 'Assign').click();
    const assigned = await assign;
    assert.equal(assigned.status(), 201);
    const { assignment: savedAssignment } = await assigned.json();
    const pipelineCandidate = `QA Pipeline ${run}`;
    const seedCandidate = await request(token, '/v1/candidates', 'POST', {
      displayName: pipelineCandidate,
    });
    assert.equal(seedCandidate.status, 201);
    await openSection('Mission candidates');
    const linkForm = page.getByRole('form', { name: 'Link a candidate' });
    await linkForm
      .getByRole('combobox', { name: 'Candidate', exact: true })
      .fill(pipelineCandidate);
    await page.getByRole('option', { name: new RegExp(pipelineCandidate) }).click();
    await linkForm
      .getByRole('combobox', { name: /^Responsible recruiter/ })
      .selectOption(savedAssignment.userId);
    const linking = response(page, 'POST', `${missionPath}/candidates`);
    await button(linkForm, 'Link candidate').click();
    const linked = await linking;
    assert.equal(linked.status(), 201);
    const { candidateProcess } = await linked.json();
    await button(page, `Open the process for ${pipelineCandidate}`).click();
    for (const [stage, label] of [
      ['CV_TO_REVIEW', 'CV to review'],
      ['HR_PRESELECTION', 'HR preselection'],
      ['CANDIDATE_REJECTED', 'Declined by candidate'],
    ]) {
      const changed = response(
        page,
        'POST',
        `${missionPath}/candidates/${candidateProcess.id}/transition`,
      );
      page.once('dialog', (dialog) => dialog.accept());
      await button(page, `Move to ${label}`).click();
      const stageResult = await changed;
      assert.equal(stageResult.status(), 200);
      assert.equal((await stageResult.json()).candidateProcess.state, stage);
    }
    await page.reload();
    await heading(page, missionName).waitFor();
    const pipeline = page.getByRole('region', { name: 'Mission candidates', exact: true });
    if (!(await pipeline.isVisible())) await openSection('Mission candidates');
    await pipeline
      .getByRole('row')
      .filter({ hasText: pipelineCandidate })
      .getByText('Declined by candidate', { exact: true })
      .waitFor();
    await page.screenshot({ path: path.join(evidence, 'recruitment-pipeline-persisted.png') });

    const taskName = `QA Task ${run}`;
    await open('/tasks');
    await button(page, 'New task').click();
    await page.getByRole('textbox', { name: /^Title/ }).fill(taskName);
    await page.getByLabel('Linked record type').selectOption('mission');
    const missionSelect = page.getByLabel('Mission', { exact: true });
    await missionSelect.selectOption(mission.id);
    const taskSave = response(page, 'POST', '/v1/tasks');
    await button(page, 'Create task').click();
    const taskResult = await taskSave;
    assert.equal(taskResult.status(), 201);
    const { task } = await taskResult.json();
    const taskCheck = await request(token, `/v1/tasks/${task.id}`);
    assert.equal(taskCheck.status, 200);
    assert.equal((await taskCheck.json()).task.title, taskName);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByText(taskName, { exact: true }).first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(evidence, 'mobile-linked-task.png') });
  });
});

test('reporting CSV and read-only module navigation', async () => {
  await withPage(async (page) => {
    await login(page);
    const report = response(page, 'GET', '/v1/reporting/recruitment/summary');
    // All routes here are real application views, using the same signed-in session.
    const navigate = async (route) => {
      const link = nav(page, route);
      if (!(await link.isVisible())) await button(page, 'More').click();
      await link.click();
    };
    await navigate('/reporting');
    assert.equal((await report).status(), 200);
    await heading(page, 'Recruitment reporting').waitFor();
    const download = page.waitForEvent('download');
    const csv = response(page, 'GET', '/v1/reporting/recruitment/export.csv');
    await button(page, 'Export CSV').click();
    const exportResult = await csv;
    assert.equal(exportResult.status(), 200);
    assert.match(exportResult.headers()['content-type'], /^text\/csv/);
    assert.match((await download).suggestedFilename(), /^recruitment-report.*\.csv$/);
    await page.screenshot({ path: path.join(evidence, 'recruitment-report.png') });
    for (const [route, title] of [
      ['/agenda', 'My Agenda'],
      ['/messages', 'Messages'],
      ['/accounting', 'Accounting'],
      ['/commercial', 'Commercial'],
      ['/documents', 'Documents'],
    ]) {
      await navigate(route);
      await heading(page, title).first().waitFor();
    }
  });
});

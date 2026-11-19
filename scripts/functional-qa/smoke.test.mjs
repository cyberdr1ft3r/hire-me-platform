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
  await heading(page, 'Overview').waitFor();
  return (await result.json()).accessToken;
}

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
    await heading(page, 'Overview').waitFor();
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
test('nine roles agree on candidate and administration access in UI and API', async (t) => {
  const bootstrap = await request(null, '/auth/login', 'POST', { email: admin, password });
  assert.equal(bootstrap.status, 201);
  const { accessToken } = await bootstrap.json();
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
              console.log(
                'Restricted Administration selected tabs:',
                await page.getByRole('tab', { selected: true }).allTextContents(),
              );
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

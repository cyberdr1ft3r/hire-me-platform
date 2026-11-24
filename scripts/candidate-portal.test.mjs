import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';

const {
  HIREME_E2E_API: api,
  HIREME_E2E_WEB: web,
  HIREME_E2E_EVIDENCE: evidence,
  CANDIDATE_MAIL_OUTBOX: outbox,
} = process.env;

test('Chrome verifies candidate ownership from direct unlisted job through receipt and dashboard', async () => {
  assert.ok(
    evidence &&
      outbox &&
      [new URL(api).hostname, new URL(web).hostname].every((host) => host === '127.0.0.1'),
  );
  const run = randomUUID().slice(0, 8);
  let token;
  async function request(endpoint, method = 'GET', body, status = 200) {
    const response = await fetch(api + endpoint, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    assert.equal(response.status, status, `${method} ${endpoint} ${result.error?.code ?? ''}`);
    return result;
  }
  const { user, accessToken } = await request(
    '/auth/login',
    'POST',
    {
      email: 'bootstrap-admin@test-db.hireme.test',
      password: 'CiSyntheticAdminPassphrase123!',
    },
    201,
  );
  token = accessToken;
  const { client } = await request('/v1/clients', 'POST', { name: `Synthetic #283 ${run}` }, 201);

  async function publish(name, settings) {
    const { mission } = await request(
      '/v1/missions',
      'POST',
      {
        clientId: client.id,
        title: name,
        state: 'ACTIVE',
      },
      201,
    );
    await request(
      `/v1/missions/${mission.id}/assignments`,
      'POST',
      {
        userId: user.id,
        role: 'LEAD_RECRUITER',
        isLead: true,
      },
      201,
    );
    const { publicOpportunity } = await request(
      `/v1/missions/${mission.id}/public-opportunity`,
      'PATCH',
      {
        status: 'OPEN',
        applicationLinkEnabled: true,
        publicTitle: name,
        publicSummary: 'Help a synthetic recruitment team improve its hiring process.',
        publicDescription:
          'Work with the team to plan interviews and improve candidate communications.',
        publicSkills: 'Organization and clear communication.',
        contentLanguage: 'en',
        publicLocation: 'Casablanca',
        publicEngagementType: 'Permanent',
        publicWorkArrangement: 'Hybrid',
        ...settings,
      },
    );
    return { id: mission.id, slug: publicOpportunity.publicSlug, name };
  }

  const listed = await publish('Listed synthetic role ' + run, { listedOnWebsite: true });
  const unlisted = await publish('Private synthetic link ' + run, {
    listedOnWebsite: false,
    cvRequired: true,
    certificationsEnabled: true,
    certificationsRequired: true,
  });
  const opening = web + '/opportunities/' + unlisted.slug;
  const applicationPath = '/v1/public/opportunities/' + unlisted.slug + '/applications';
  const direct = await fetch(api + applicationPath, {
    method: 'POST',
    headers: { Origin: web, 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: '{}',
  });
  assert.equal(direct.status, 401, 'staff bearer cannot apply');

  const browser = await chromium.launch({ channel: 'chrome' });
  const a = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const b = await browser.newContext();
  const email = user.email;
  const password = 'Candidate-QA-Browser99!';
  const heading = (page, name) => page.getByRole('heading', { name, exact: true });
  const shot = (page, name) => page.screenshot({ path: path.join(evidence, name + '.png') });

  async function finishSignup(page, address) {
    await page.getByLabel(/^Email/).fill(address);
    await page.getByRole('button', { name: 'Continue', exact: true }).press('Enter');
    await page.getByText(/Check your email for a link/).waitFor();
    const candidates = await Promise.all(
      (await readdir(outbox)).map(async (name) =>
        JSON.parse(await readFile(path.join(outbox, name), 'utf8')),
      ),
    );
    const proof = candidates.find((mail) => mail.email === address && mail.purpose === 'VERIFY');
    assert.ok(proof, 'verification must be delivered to the isolated mailbox');
    await page.goto(proof.link);
    await page.getByLabel(/^New password/).fill(password);
    await page.getByRole('button', { name: 'Continue', exact: true }).press('Enter');
  }

  try {
    const page = await a.newPage();
    await page.goto(web + '/opportunities');
    await page.getByRole('link', { name: listed.name }).waitFor();
    await page.getByRole('link', { name: 'My applications' }).waitFor();
    assert.equal(await page.getByRole('link', { name: unlisted.name }).count(), 0);
    await page.goto(opening + '?utm_source=linkedin', { referer: 'https://www.linkedin.com/' });
    await heading(page, unlisted.name).waitFor();
    await page.getByRole('link', { name: 'Apply now' }).press('Enter');
    await page.getByRole('link', { name: 'Create a candidate account' }).waitFor();
    assert.equal(await page.getByRole('form').count(), 0);
    await page.getByRole('link', { name: 'Create a candidate account' }).press('Enter');
    await finishSignup(page, email);
    await page.waitForURL(opening + '#apply');
    await page.getByLabel(/^Full name/).pressSequentially('Synthetic candidate');
    const emailField = page.getByLabel(/^Email/);
    assert.equal(await emailField.inputValue(), email);
    assert.equal(await emailField.getAttribute('readonly'), '');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await shot(page, 'candidate-mobile-application');
    const pdf = {
      name: 'candidate-fixture.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% synthetic QA file\n%%EOF\n'),
    };
    await page.locator('input[name=cv]').setInputFiles(pdf);
    await page
      .locator('input[name=certification]')
      .setInputFiles({ ...pdf, name: 'certificate.pdf' });
    await page.locator('input[name=consentGranted]').press('Space');
    let committed;
    await page.route(
      api + applicationPath,
      async (route) => {
        const request = route.request().postDataJSON();
        const response = await route.fetch({
          postData: { ...request, email: 'unowned@example.test' },
        });
        committed = response.status();
        await route.abort('connectionreset');
      },
      { times: 1 },
    );
    await page.getByRole('button', { name: 'Submit application' }).press('Enter');
    await page.getByText('Receipt unconfirmed', { exact: true }).waitFor();
    assert.equal(committed, 200);
    await page.getByRole('button', { name: 'Submit application' }).press('Enter');
    await heading(page, 'Application received').waitFor();
    await page.getByRole('link', { name: 'My applications' }).press('Enter');
    await heading(page, unlisted.name).waitFor();
    assert.equal(await heading(page, unlisted.name).count(), 1);
    await page.getByText(/^Received /).waitFor();
    await shot(page, 'candidate-mobile-dashboard');

    const ownerResult = await a.request.get(api + '/v1/candidate/applications');
    const { applications } = await ownerResult.json();
    assert.equal(applications.length, 1);
    assert.deepEqual(Object.keys(applications[0]).sort(), ['id', 'status', 'submittedAt', 'title']);
    const staffResult = await request(
      '/v1/missions/' + unlisted.id + '/public-opportunity/applications',
    );
    assert.equal(staffResult.applications[0].submittedEmail, email);
    assert.equal(staffResult.applications[0].fileCount, 2);
    assert.equal((await a.request.get(api + '/auth/me')).status(), 401);

    const other = await b.newPage();
    await other.goto(web + '/candidate/sign-up');
    await finishSignup(other, 'candidate-b-' + run + '@example.test');
    await other.getByText('You have no applications yet.').waitFor();
    assert.equal(
      (await b.request.get(api + '/v1/candidate/applications/' + applications[0].id)).status(),
      404,
    );
    assert.equal(
      (
        await b.request.get(api + '/v1/candidate/applications?cursor=' + applications[0].id)
      ).status(),
      404,
    );
    await page.getByRole('button', { name: 'Sign out' }).press('Enter');
    await heading(page, 'Candidate sign in').waitFor();
    assert.equal((await a.request.get(api + '/v1/candidate/applications')).status(), 401);
    await page.goto(
      web +
        '/candidate/sign-in?returnTo=' +
        encodeURIComponent('/opportunities/' + unlisted.slug + '#apply'),
    );
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Continue', exact: true }).press('Enter');
    await page.waitForURL(opening + '#apply');
    await page.getByLabel(/^Full name/).waitFor();
  } finally {
    await browser.close();
  }
});

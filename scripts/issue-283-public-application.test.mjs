import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';

const { HIREME_E2E_API: api, HIREME_E2E_WEB: web, HIREME_E2E_EVIDENCE: evidence } = process.env;
const baseline = process.env.HIREME_283_BASELINE === '1';
const copy = {
  en: { apply: 'Apply now', submit: 'Submit application', received: 'Application received' },
  fr: { apply: 'Postuler', submit: 'Envoyer ma candidature', received: 'Candidature reçue' },
};
const cv = {
  name: 'synthetic-cv.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n% Synthetic disposable browser fixture\n%%EOF\n'),
};

test('Public application journey uses real Chrome and the anonymous API', async () => {
  assert.ok(evidence, 'Use the disposable application QA setup');
  for (const url of [api, web]) assert.equal(new URL(url).hostname, '127.0.0.1');
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

  const listed = await publish('Recruitment Coordinator', {
    listedOnWebsite: true,
    cvRequired: false,
    additionalAttachmentsEnabled: true,
  });
  const unlisted = await publish('Recruitment Operations Specialist', {
    listedOnWebsite: false,
    cvRequired: true,
    certificationsEnabled: true,
    certificationsRequired: true,
    diplomasEnabled: true,
  });
  const disabled = await publish('Unavailable synthetic job', {
    applicationLinkEnabled: false,
    listedOnWebsite: false,
  });
  const expired = await publish('Expired synthetic job', {
    applicationDeadline: new Date(Date.now() - 60_000).toISOString(),
    listedOnWebsite: true,
  });
  const browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({
    locale: 'en-GB',
    viewport: { width: 360, height: 800 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const authRequests = [];
  page.on('request', (req) => {
    if (req.url().startsWith(`${api}/auth/`)) authRequests.push(req.url());
  });
  const detail = (job) => `${web}/opportunities/${job.slug}`;
  const shot = (name) =>
    page.screenshot({ path: path.join(evidence, `${name}.png`), animations: 'disabled' });
  const input = (name) => page.locator(`form [name="${name}"]`);
  const extras = page.locator('form details summary');
  const submit = (lang) => page.getByRole('button', { name: copy[lang].submit, exact: true });
  const endpoint = (job) => `${api}/v1/public/opportunities/${job.slug}/applications`;
  const post = (job) =>
    page.waitForResponse(
      (response) => response.url() === endpoint(job) && response.request().method() === 'POST',
    );
  const currentEmail = `synthetic-${run}@example.test`;
  async function fillApplicant(email) {
    await input('fullName').pressSequentially('Camille Exemple');
    await input('email').pressSequentially(email);
  }
  try {
    await page.goto(`${web}/opportunities`);
    await page.getByRole('heading', { name: listed.name }).waitFor();
    assert.equal(await page.getByText(unlisted.name).count(), 0);
    assert.equal(await page.getByText(expired.name).count(), 0);
    await page.locator(`a[href="/opportunities/${listed.slug}"]`).first().click();
    await page.getByRole('heading', { name: listed.name }).waitFor();
    await page.goBack();
    await page.getByRole('heading', { name: listed.name }).waitFor();
    await page.goto(detail(unlisted), { referer: 'https://www.linkedin.com/' });
    await page.getByRole('heading', { name: unlisted.name }).waitFor();
    await shot(baseline ? 'before-job-360' : 'after-job-360');
    await page.getByRole('link', { name: copy.en.apply, exact: true }).press('Enter');
    await input('fullName').waitFor();
    if (!baseline) {
      assert.equal(
        await page.locator('#apply').evaluate((node) => node === document.activeElement),
        true,
      );
    }
    const formMetrics = await page.locator('form').evaluate((form) => ({
      height: Math.round(form.getBoundingClientRect().height),
      visibleFields: [...form.querySelectorAll('input, textarea')].filter(
        (field) => field.name !== 'website' && !field.closest('details:not([open])'),
      ).length,
    }));
    await shot(baseline ? 'before-form-360' : 'after-form-360');
    await writeFile(path.join(evidence, 'form-metrics.json'), JSON.stringify(formMetrics));
    await submit('en').press('Enter');
    await input('fullName').waitFor();
    assert.equal(await input('fullName').getAttribute('aria-invalid'), 'true');
    assert.equal(
      await input('fullName').evaluate((field) => field === document.activeElement),
      true,
    );
    await fillApplicant(currentEmail);
    await input('cv').setInputFiles({
      name: 'wrong.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('wrong'),
    });
    await submit('en').press('Enter');
    assert.equal(await input('cv').getAttribute('aria-invalid'), 'true');
    assert.equal(await input('certification').getAttribute('aria-invalid'), 'true');
    assert.equal(await input('consentGranted').getAttribute('aria-invalid'), 'true');
    await input('cv').setInputFiles(cv);
    await input('certification').setInputFiles({ ...cv, name: 'synthetic-certificate.pdf' });
    await input('consentGranted').press('Space');

    const successful = post(unlisted);
    await submit('en').press('Enter');
    const received = await successful;
    assert.equal(received.status(), 200);
    const receipt = await received.json();
    assert.equal(receipt.status, 'RECEIVED');
    assert.deepEqual(Object.keys(receipt).sort(), ['message', 'status']);
    await page.getByRole('heading', { name: copy.en.received }).waitFor();
    await shot(baseline ? 'before-confirmation-360' : 'after-confirmation-360');
    const { applications } = await request(
      `/v1/missions/${unlisted.id}/public-opportunity/applications`,
    );
    assert.deepEqual(
      applications.map(({ submittedEmail, fileCount }) => [submittedEmail, fileCount]),
      [[currentEmail, 2]],
    );
    if (baseline) {
      await writeFile(
        path.join(evidence, 'staff-auth-requests.json'),
        JSON.stringify(authRequests),
      );
      return;
    }
    assert.deepEqual(authRequests, []);

    await page.reload();
    await input('fullName').waitFor();
    assert.equal(await input('fullName').inputValue(), '');
    assert.equal(await page.getByRole('heading', { name: copy.en.received }).count(), 0);

    for (const job of [disabled, expired]) {
      const request = page.waitForResponse(`${api}/v1/public/opportunities/${job.slug}`);
      await page.goto(detail(job));
      assert.equal((await request).status(), 404);
      await page.getByRole('heading', { name: 'This opportunity is not available' }).waitFor();
      assert.equal(await page.getByRole('form').count(), 0);
    }

    await page.goto(detail(listed), { referer: 'https://www.linkedin.com/' });
    await input('fullName').waitFor();
    assert.equal(await input('cv').getAttribute('required'), null);
    for (const locale of ['en', 'fr']) {
      await page.getByRole('combobox', { name: /Language|Langue/ }).selectOption(locale);
      await page.waitForFunction((lang) => document.documentElement.lang === lang, locale);
      for (const width of [360, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 800 });
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
        );
        assert.equal(await input('phone').isVisible(), false);
        assert.equal(await input('additional').isVisible(), false);
        await extras.press('Enter');
        await input('phone').waitFor();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
        );
        await extras.press('Enter');
        await input('phone').waitFor({ state: 'hidden' });
      }
    }

    await page.setViewportSize({ width: 390, height: 800 });
    await page.getByRole('link', { name: copy.fr.apply, exact: true }).press('Enter');
    await shot('after-form-fr-390');
    const retryEmail = `retry-${run}@example.test`;
    await fillApplicant(retryEmail);
    await extras.press('Enter');
    await input('motivation').pressSequentially('Synthetic optional note');
    await input('additional').setInputFiles({
      name: 'not-allowed.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('invalid'),
    });
    await extras.press('Enter');
    await input('consentGranted').press('Space');
    await submit('fr').press('Enter');
    await input('additional').waitFor();
    assert.equal(await input('additional').getAttribute('aria-invalid'), 'true');
    assert.equal(
      await input('additional').evaluate((field) => field === document.activeElement),
      true,
    );
    await page.getByRole('button', { name: /^Retirer/ }).press('Enter');
    await page.getByText('not-allowed.zip', { exact: true }).waitFor({ state: 'detached' });
    assert.equal(await input('additional').getAttribute('aria-invalid'), null);
    await extras.press('Enter');
    await input('cv').setInputFiles({ ...cv, buffer: Buffer.from('This is not a PDF.') });
    const invalidUpload = post(listed);
    await submit('fr').press('Enter');
    assert.equal((await invalidUpload).status(), 400);
    await page.getByText('Candidature non envoyée', { exact: true }).waitFor();
    assert.equal(await input('email').inputValue(), retryEmail);
    assert.equal(await input('motivation').inputValue(), 'Synthetic optional note');
    await input('cv').setInputFiles(cv);

    // Let the real API commit, then drop the response before Chrome sees it.
    let serverReceipt;
    await page.route(
      endpoint(listed),
      async (route) => {
        const result = await route.fetch();
        serverReceipt = { status: result.status(), body: await result.json() };
        await route.abort('connectionreset');
      },
      { times: 1 },
    );
    await submit('fr').press('Enter');
    const uncertain = page.getByRole('alert').filter({ hasText: 'Réception non confirmée' });
    await uncertain.waitFor();
    assert.equal(serverReceipt.status, 200);
    assert.equal(serverReceipt.body.status, 'RECEIVED');
    assert.equal(await input('email').inputValue(), retryEmail);
    assert.equal(await page.getByText(cv.name, { exact: true }).count(), 1);
    await shot('after-retry-fr-390');
    const retry = post(listed);
    await submit('fr').press('Enter');
    const retried = await retry;
    assert.equal(retried.status(), 200);
    assert.deepEqual(await retried.json(), serverReceipt.body);
    const confirmation = page.getByRole('heading', { name: copy.fr.received });
    await confirmation.waitFor();
    assert.equal(await confirmation.evaluate((node) => node === document.activeElement), true);
    assert.equal(await page.getByRole('form').count(), 0);
    const retryRecords = await request(`/v1/missions/${listed.id}/public-opportunity/applications`);
    assert.deepEqual(
      retryRecords.applications.map(({ submittedEmail, fileCount }) => [submittedEmail, fileCount]),
      [[retryEmail, 1]],
    );

    await page.reload();
    await input('fullName').waitFor();
    const noCvEmail = `no-cv-${run}@example.test`;
    await fillApplicant(noCvEmail);
    await input('consentGranted').press('Space');
    const optionalCv = post(listed);
    await submit('fr').press('Enter');
    assert.equal((await optionalCv).status(), 200);
    await confirmation.waitFor();
    const optionalCvRecords = await request(
      `/v1/missions/${listed.id}/public-opportunity/applications`,
    );
    assert.equal(
      optionalCvRecords.applications.find(({ submittedEmail }) => submittedEmail === noCvEmail)
        ?.fileCount,
      0,
    );
    assert.deepEqual(authRequests, []);
  } finally {
    await browser.close();
  }
});

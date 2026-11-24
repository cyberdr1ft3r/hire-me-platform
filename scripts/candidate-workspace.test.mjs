import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';

const {
  HIREME_E2E_API: api,
  HIREME_E2E_WEB: web,
  HIREME_E2E_EVIDENCE: evidence,
  CANDIDATE_MAIL_OUTBOX: outbox,
} = process.env;
const pdf = (name, marker) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n% ' + marker + '\n%%EOF\n'),
});

test('Chrome candidate profile and versioned CVs preserve historical applications', async () => {
  assert.ok(
    evidence && outbox && [api, web].every((value) => new URL(value).hostname === '127.0.0.1'),
  );
  const run = randomUUID().slice(0, 8);
  const email = 'workspace-' + run + '@example.test';
  const original = 'Synthetic original ' + run;
  const updated = 'Synthetic updated ' + run;
  const firstTitle = 'Profile QA first ' + run;
  const secondTitle = 'Profile QA second ' + run;
  let bearer;
  async function staff(route, status, body, method = body ? 'POST' : 'GET') {
    const response = await fetch(api + route, {
      method,
      headers: {
        ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body && JSON.stringify(body),
    });
    assert.equal(
      response.status,
      status,
      route + ' ' + (response.ok ? '' : await response.clone().text()),
    );
    return response.json();
  }
  const admin = await staff('/auth/login', 201, {
    email: 'bootstrap-admin@test-db.hireme.test',
    password: 'CiSyntheticAdminPassphrase123!',
  });
  bearer = admin.accessToken;
  const { client } = await staff('/v1/clients', 201, {
    name: 'Workspace synthetic ' + run,
    status: 'ACTIVE',
  });
  async function job(title) {
    const { mission } = await staff('/v1/missions', 201, {
      clientId: client.id,
      title,
      state: 'ACTIVE',
    });
    await staff('/v1/missions/' + mission.id + '/assignments', 201, {
      userId: admin.user.id,
      role: 'LEAD_RECRUITER',
      isLead: true,
    });
    const { publicOpportunity } = await staff(
      '/v1/missions/' + mission.id + '/public-opportunity',
      200,
      {
        status: 'OPEN',
        listedOnWebsite: true,
        applicationLinkEnabled: true,
        publicTitle: title,
        cvRequired: true,
        publicSummary: 'A job for isolated profile acceptance.',
        publicDescription: 'Synthetic job posting for test only.',
      },
      'PATCH',
    );
    return { slug: publicOpportunity.publicSlug, missionId: mission.id };
  }
  const first = await job(firstTitle);
  const second = await job(secondTitle);
  const browser = await chromium.launch({
    channel: process.env.HIREME_E2E_CHROMIUM_CHANNEL || 'chrome',
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const button = (name) => page.getByRole('button', { name, exact: true });
  const link = (name) => page.getByRole('link', { name, exact: true });
  const heading = (name) => page.getByRole('heading', { name, exact: true });
  const saved = () => page.getByText('Profile saved.', { exact: true }).waitFor();
  const screenshot = (name) => page.screenshot({ path: path.join(evidence, name + '.png') });

  async function apply(slug, name, expectedCv, { loseResponse = false, override } = {}) {
    await page.goto(web + '/opportunities/' + slug + '#apply');
    await page.getByLabel(/^Full name/).waitFor();
    assert.equal(await page.getByLabel(/^Full name/).inputValue(), name);
    assert.equal(await page.getByLabel(/^Email/).inputValue(), email);
    assert.match(
      await page.getByLabel('Use a CV from My CVs').locator('option:checked').textContent(),
      expectedCv,
    );
    if (override) await page.getByLabel(/^Full name/).fill(override);
    await page.locator('input[name=consentGranted]').press('Space');
    if (loseResponse) {
      await page.route(
        api + '/v1/public/opportunities/' + slug + '/applications',
        async (route) => {
          assert.equal((await route.fetch()).status(), 200);
          await route.abort('connectionreset');
        },
        { times: 1 },
      );
    }
    await button('Submit application').press('Enter');
    if (loseResponse) {
      await page.getByText('Receipt unconfirmed', { exact: true }).waitFor();
      await button('Submit application').press('Enter');
    }
    await heading('Application received').waitFor();
  }

  try {
    await page.goto(web + '/candidate/sign-up');
    await page.getByLabel(/^Email/).fill(email);
    await button('Continue').press('Enter');
    await page.getByText(/Check your email for a link/).waitFor();
    const messages = await Promise.all(
      (await readdir(outbox)).map(async (name) =>
        JSON.parse(await readFile(path.join(outbox, name), 'utf8')),
      ),
    );
    const proof = messages.find(
      (message) => message.email === email && message.purpose === 'VERIFY',
    );
    assert.ok(proof);
    await page.goto(proof.link);
    await page.getByLabel(/^New password/).fill('Synthetic-Workspace-Portal99!');
    await button('Continue').press('Enter');
    await page.waitForURL(web + '/candidate/applications');

    await link('My Profile').press('Enter');
    await page.getByLabel(/^Full name/).pressSequentially(original);
    await page.getByLabel('City', { exact: true }).fill('Rabat');
    await page
      .getByLabel('Current professional position', { exact: true })
      .fill('Systems engineer');
    await page
      .getByLabel('Work experience', { exact: true })
      .fill('Five years on a synthetic team.');
    await page
      .getByLabel('Qualifications and certifications', { exact: true })
      .fill('Synthetic qualification');
    await page
      .getByLabel('Professional links', { exact: true })
      .fill('https://example.test/portfolio');
    await button('Save profile').press('Enter');
    await saved();
    await page.reload();
    await page.getByLabel('Work experience', { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel('Work experience', { exact: true }).inputValue(),
      'Five years on a synthetic team.',
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await screenshot('candidate-profile-mobile');

    await link('My CVs').press('Enter');
    await page.getByLabel(/^PDF CV file/).setInputFiles(pdf('first-cv.pdf', 'first synthetic CV'));
    await button('Upload CV').press('Enter');
    await heading('first-cv.pdf').waitFor();
    const firstDownload = page.waitForEvent('download');
    await link('Download').press('Enter');
    assert.match(await readFile(await (await firstDownload).path(), 'utf8'), /first synthetic CV/);
    await apply(first.slug, original, /first-cv\.pdf/, {
      loseResponse: true,
      override: original + ' application',
    });

    await page.goto(web + '/candidate/profile');
    await page.getByLabel(/^Full name/).fill(updated);
    await page.getByLabel('City', { exact: true }).fill('Casablanca');
    await button('Save profile').press('Enter');
    await saved();
    await link('My CVs').press('Enter');
    await button('Replace CV').press('Enter');
    const replaceForm = page.locator('article form');
    await replaceForm
      .getByLabel(/^PDF CV file/)
      .setInputFiles(pdf('second-cv.pdf', 'second synthetic CV'));
    await replaceForm.getByRole('button', { name: 'Replace CV', exact: true }).press('Enter');
    await heading('second-cv.pdf').waitFor();
    await page.getByText('Previous versions', { exact: true }).press('Enter');
    await page.getByText(/Version 1 · first-cv\.pdf/).waitFor();

    await link('My Applications').press('Enter');
    const firstCard = page.getByRole('article').filter({ has: heading(firstTitle) });
    await firstCard.getByRole('button', { name: 'View submitted details' }).press('Enter');
    await firstCard.getByText(original + ' application', { exact: true }).waitFor();
    await firstCard.getByText(/first-cv\.pdf · Version 1/).waitFor();
    await firstCard.getByText('Rabat', { exact: true }).waitFor();
    assert.equal(await firstCard.getByText(updated, { exact: true }).count(), 0);

    await apply(second.slug, updated, /second-cv\.pdf/);
    await link('My applications').press('Enter');
    const secondCard = page.getByRole('article').filter({ has: heading(secondTitle) });
    await secondCard.getByRole('button', { name: 'View submitted details' }).press('Enter');
    await secondCard.getByText(updated, { exact: true }).waitFor();
    await secondCard.getByText(/second-cv\.pdf · Version 2/).waitFor();
    await secondCard.getByText('Casablanca', { exact: true }).waitFor();

    await link('My CVs').press('Enter');
    await page.getByRole('combobox', { name: /language/i }).selectOption('fr');
    await heading('Mes CV').waitFor();
    await screenshot('candidate-cvs-mobile-fr');
    await page.getByRole('combobox', { name: /langue/i }).selectOption('en');
    const privateUrl = await link('Download').getAttribute('href');
    page.once('dialog', (dialog) => void dialog.accept());
    await button('Remove CV').press('Enter');
    await page.getByText('You have no CVs yet.', { exact: true }).waitFor();
    assert.equal((await context.request.get(privateUrl)).status(), 404);
    await link('My Applications').press('Enter');
    await firstCard.getByRole('button', { name: 'View submitted details' }).press('Enter');
    await firstCard.getByText(/first-cv\.pdf · Version 1/).waitFor();
    const staffContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const staffPage = await staffContext.newPage();
    await staffPage.goto(web + '/missions?mission=' + first.missionId);
    await staffPage.getByLabel(/^Email/).fill('bootstrap-admin@test-db.hireme.test');
    await staffPage.getByLabel(/^Password/).fill('CiSyntheticAdminPassphrase123!');
    await staffPage.getByRole('button', { name: 'Login', exact: true }).press('Enter');
    await staffPage.getByRole('tab', { name: 'Public', exact: true }).press('Enter');
    const expected = staffPage.waitForEvent('download');
    await staffPage
      .getByRole('button', { name: 'Download submitted CV', exact: true })
      .press('Enter');
    const staffCopy = await expected;
    assert.match(await readFile(await staffCopy.path(), 'utf8'), /first synthetic CV/);
    await staffPage.screenshot({ path: path.join(evidence, 'staff-submitted-cv.png') });
  } finally {
    await browser.close();
  }
});

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
  CLIENT_PORTAL_MAIL_OUTBOX: outbox,
} = process.env;
const admin = 'bootstrap-admin@test-db.hireme.test';
const adminPassword = 'CiSyntheticAdminPassphrase123!';
const clientPassword = 'Synthetic-Client-Password9!';
const newPassword = 'Synthetic-Client-Reset9!';

test('Chrome staff invitation, client requests, draft mission and consented publication', async () => {
  assert.ok(evidence && outbox && [api, web].every((url) => new URL(url).hostname === '127.0.0.1'));
  const run = randomUUID().slice(0, 8);
  const name = 'Synthetic Organization ' + run;
  const nameB = 'Other Organization ' + run;
  const email = 'portal-a-' + run + '@example.test';
  const emailB = 'portal-b-' + run + '@example.test';
  const clientTitle = 'Portal recruitment ' + run;
  const candidateName = 'Synthetic Recruit ' + run;
  const job = 'Synthetic platform engineer';
  let token;
  async function request(endpoint, method = 'GET', body, status = 200) {
    const response = await fetch(api + endpoint, {
      method,
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const detail = await response.text();
    assert.equal(response.status, status, method + ' ' + endpoint + ' ' + detail);
    return detail ? JSON.parse(detail) : null;
  }

  const staff = await request(
    '/auth/login',
    'POST',
    { email: admin, password: adminPassword },
    201,
  );
  token = staff.accessToken;
  const { client } = await request('/v1/clients', 'POST', { name, status: 'ACTIVE' }, 201);
  const { client: otherClient } = await request(
    '/v1/clients',
    'POST',
    { name: nameB, status: 'ACTIVE' },
    201,
  );
  const { contact } = await request(
    '/v1/clients/' + client.id + '/contacts',
    'POST',
    { displayName: 'Synthetic Contact A', email },
    201,
  );
  const { contact: otherContact } = await request(
    '/v1/clients/' + otherClient.id + '/contacts',
    'POST',
    { displayName: 'Synthetic Contact B', email: emailB },
    201,
  );
  const { candidate } = await request(
    '/v1/candidates',
    'POST',
    {
      displayName: candidateName,
      currentJobTitle: job,
      city: 'Rabat',
      country: 'Morocco',
      consentStatus: 'GRANTED',
      consentRecordedAt: new Date().toISOString(),
      professionalSummary: 'Private internal description',
    },
    201,
  );
  const internal = '/v1/internal/client-portal/organizations/' + client.id;

  const browser = await chromium.launch({
    channel: process.env.HIREME_E2E_CHROMIUM_CHANNEL || 'chrome',
  });
  const staffContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const clientContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const otherContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  const page = await clientContext.newPage();
  const other = await otherContext.newPage();

  function button(page, name) {
    return page.getByRole('button', { name, exact: true });
  }
  function heading(page, name) {
    return page.getByRole('heading', { name, exact: true });
  }
  async function mailbox(address, purpose) {
    const messages = await Promise.all(
      (await readdir(outbox)).map(async (file) =>
        JSON.parse(await readFile(path.join(outbox, file), 'utf8')),
      ),
    );
    const proof = messages.find((entry) => entry.email === address && entry.purpose === purpose);
    assert.ok(proof);
    assert.equal(new URL(proof.link).origin, web);
    return proof.link;
  }
  async function redeem(page, address) {
    await page.goto(await mailbox(address, 'INVITE'));
    await heading(page, 'Accept your invitation').waitFor();
    await page.getByLabel(/^New password/).fill(clientPassword);
    await button(page, 'Continue').press('Enter');
    await page.waitForURL(web + '/client');
  }
  function shot(page, file) {
    return page.screenshot({ path: path.join(evidence, file + '.png') });
  }

  try {
    staffPage.on('dialog', (dialog) => void dialog.accept());
    await staffPage.goto(web + '/clients?client=' + client.id);
    await staffPage.getByLabel(/^Email/).fill(admin);
    await staffPage.getByLabel(/^Password/).fill(adminPassword);
    await button(staffPage, 'Login').press('Enter');
    const staffTab = staffPage.getByRole('tab', { name: 'Client portal' });
    await staffTab.waitFor();
    await staffTab.press('Enter');
    await staffPage.getByLabel(/Named company contact/).selectOption(contact.id);
    await button(staffPage, 'Send invitation').press('Enter');
    await staffPage.getByText('Saved', { exact: true }).waitFor();
    await request(
      '/v1/internal/client-portal/organizations/' + otherClient.id + '/invitations',
      'POST',
      { contactId: otherContact.id },
      202,
    );

    await redeem(page, email);
    await redeem(other, emailB);
    await heading(page, name).waitFor();
    await heading(other, nameB).waitFor();
    await button(page, 'New recruitment request').press('Enter');
    await page.getByLabel(/^Role title/).pressSequentially(clientTitle);
    await page
      .getByLabel(/^Request details/)
      .fill('A synthetic opening for the client portal acceptance test.');
    await page.getByLabel(/^Number of openings/).fill('2');
    await button(page, 'Save draft').press('Enter');
    await heading(page, clientTitle).waitFor();
    await button(page, 'Submit for review').press('Enter');
    await page.getByText('Submitted', { exact: true }).first().waitFor();

    await button(staffPage, 'Refresh').press('Enter');
    await staffPage.getByText(clientTitle + ' · Submitted', { exact: true }).click();
    await button(staffPage, 'Start review').press('Enter');
    await button(staffPage, 'Approve').press('Enter');
    await button(staffPage, 'Create draft mission').press('Enter');
    await staffPage.getByRole('link', { name: 'Open draft mission' }).waitFor();
    const staffData = await request(internal);
    const demand = staffData.demands.find((row) => row.title === clientTitle);
    assert.ok(demand.missionId);
    assert.equal((await request('/v1/missions/' + demand.missionId)).mission.state, 'DRAFT');
    assert.equal(
      (await otherContext.request.get(api + '/v1/client-portal/demands/' + demand.id)).status(),
      404,
    );

    await staffPage.getByLabel('Name or search term').fill(candidateName);
    await button(staffPage, 'Search').press('Enter');
    await staffPage.getByLabel('Candidate', { exact: true }).selectOption(candidate.id);
    await staffPage.getByLabel('Approve the downloadable profile summary').check();
    await button(staffPage, 'Preview client view').press('Enter');
    await staffPage
      .getByLabel('I confirmed consent to share this profile with this company.')
      .check();
    await button(staffPage, 'Publish profile').press('Enter');
    await staffPage.getByText('Saved', { exact: true }).waitFor();
    const missionPath = '/v1/missions/' + demand.missionId;
    await request(missionPath + '/status', 'PATCH', { state: 'INTERNAL_VALIDATION' });
    await request(missionPath + '/status', 'PATCH', { state: 'ACTIVE' });
    await request(
      missionPath + '/assignments',
      'POST',
      { userId: staff.user.id, role: 'LEAD_RECRUITER', isLead: true },
      201,
    );
    const { candidateProcess } = await request(
      missionPath + '/candidates',
      'POST',
      { candidateId: candidate.id, responsibleRecruiterUserId: staff.user.id },
      201,
    );
    const process = missionPath + '/candidates/' + candidateProcess.id;
    for (const state of [
      'CV_TO_REVIEW',
      'HR_PRESELECTION',
      'HR_INTERVIEW_SCHEDULED',
      'HR_INTERVIEW_COMPLETED',
      'TECHNICAL_TEST',
      'INTERNAL_VALIDATION',
    ]) {
      await request(process + '/transition', 'POST', { state });
    }
    await request(process + '/present', 'POST', {});
    await staffPage.getByLabel('Publish to').selectOption(demand.id);
    await button(staffPage, 'Preview client view').press('Enter');
    await staffPage
      .getByLabel('I confirmed consent to share this profile with this company.')
      .check();
    await button(staffPage, 'Publish profile').press('Enter');
    await staffPage.getByText('Saved', { exact: true }).waitFor();
    await shot(staffPage, 'client-portal-staff');

    await page.reload();
    await page.getByRole('button', { name: new RegExp(clientTitle) }).press('Enter');
    await page.getByText('Recruitment underway', { exact: true }).first().waitFor();
    const available = page
      .locator('section')
      .filter({ has: heading(page, 'Available candidates') })
      .last();
    const shortlist = page
      .locator('section')
      .filter({ has: heading(page, 'Shortlist') })
      .last();
    await heading(available, job).waitFor();
    await heading(shortlist, job).waitFor();
    assert.equal(await page.getByText('Private internal description').count(), 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    const documentLink = available.getByRole('link', { name: 'Download approved profile summary' });
    const documentUrl = await documentLink.getAttribute('href');
    const downloadEvent = page.waitForEvent('download');
    await documentLink.press('Enter');
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), 'hireme-profile-summary.txt');
    assert.match(await readFile(await download.path(), 'utf8'), /Synthetic platform engineer/);
    assert.equal((await otherContext.request.get(documentUrl)).status(), 404);
    assert.equal((await request(internal)).publications.length, 2);
    await staffPage
      .getByRole('listitem')
      .filter({ hasText: 'Available candidates' })
      .getByRole('button', { name: 'Revoke publication', exact: true })
      .press('Enter');
    await staffPage.getByText('Saved', { exact: true }).waitFor();
    assert.equal((await clientContext.request.get(documentUrl)).status(), 404);

    const language = page.getByRole('combobox', { name: /language/i });
    await language.selectOption('fr');
    await heading(page, 'Demandes de recrutement').waitFor();
    await shot(page, 'client-portal-mobile-fr');
    await page.getByRole('combobox', { name: /langue/i }).selectOption('en');
    await button(page, 'Sign out').press('Enter');
    await heading(page, 'Client sign in').waitFor();
    await page.getByRole('link', { name: 'Forgot password?' }).press('Enter');
    await page.getByLabel(/^Email address/).fill(email);
    await button(page, 'Continue').press('Enter');
    await page.getByText(/receive a password reset link/).waitFor();
    await page.goto(await mailbox(email, 'RESET'));
    await page.getByLabel(/^New password/).fill(newPassword);
    await button(page, 'Continue').press('Enter');
    await heading(page, name).waitFor();
    await button(page, 'Sign out').press('Enter');
    await page.getByLabel(/^Email address/).fill(email);
    await page.getByLabel(/^Password/).fill(newPassword);
    await button(page, 'Continue').press('Enter');
    await heading(page, name).waitFor();
    await button(staffPage, 'Revoke access').press('Enter');
    await staffPage.getByText('Saved', { exact: true }).waitFor();
    await page.reload();
    await heading(page, 'Client sign in').waitFor();
  } finally {
    await browser.close();
  }
});

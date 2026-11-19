import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';

const {
  HIREME_BROWSER_API: api,
  HIREME_BROWSER_WEB: web,
  HIREME_BROWSER_EVIDENCE: evidence,
  HIREME_E2E_CHROMIUM_CHANNEL: channel,
} = process.env;
for (const url of [api, web]) assert.equal(new URL(url).hostname, '127.0.0.1');

const browser = await chromium.launch(channel ? { channel } : {});
try {
  const page = await browser.newPage({ locale: 'en-GB' });
  page.setDefaultTimeout(15_000);
  const authResponse = (action) =>
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.origin === api &&
        url.pathname === `/auth/${action}` &&
        response.request().method() === 'POST'
      );
    });
  const login = page.getByRole('button', { name: 'Login', exact: true });
  const overview = page.getByRole('heading', { name: 'Overview', exact: true });

  await page.goto(`${web}/candidates`);
  await login.waitFor();
  assert.equal((await fetch(`${api}/v1/candidates`)).status, 401);

  await page.goto(web);
  await page.locator('input[type=email]').fill('bootstrap-admin@test-db.hireme.test');
  await page.locator('input[type=password]').fill('CiSyntheticAdminPassphrase123!');
  const [signedIn] = await Promise.all([authResponse('login'), login.click()]);
  assert.equal(signedIn.status(), 201);
  await overview.waitFor();

  const [refreshed] = await Promise.all([authResponse('refresh'), page.reload()]);
  assert.equal(refreshed.status(), 201);
  await overview.waitFor();
  await page.screenshot({ path: path.join(evidence, 'restored-overview.png') });

  await page.getByLabel('Account and session').click();
  const signOut = page.getByRole('button', { name: 'Sign out', exact: true });
  const [signedOut] = await Promise.all([authResponse('logout'), signOut.click()]);
  assert.ok(signedOut.ok());
  await login.waitFor();
  await page.goto(`${web}/candidates`);
  await login.waitFor();
  console.log('Baseline browser smoke passed: protected route, login, refresh, and logout.');
} finally {
  await browser.close();
}

#!/usr/bin/env node
/**
 * Issue #124 My Agenda browser evidence (Chromium).
 * Requires local API+web (`pnpm dev`) and seeded dev users with tasks/meetings permissions.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ARTIFACT_DIR = '/opt/cursor/artifacts/issue124-agenda-evidence';
const WEB = 'http://127.0.0.1:5173';

const setup = {
  email: 'admin@example.test',
  password: 'Synthetic-admin-123!',
};

async function login(page) {
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await page.locator('input[name="email"]').fill(setup.email);
  await page.locator('input[name="password"]').fill(setup.password);
  await page.locator('form.auth-panel button[type="submit"]').click();
  await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 30_000 });
}

async function openAgenda(page) {
  await page.evaluate(() => {
    window.history.pushState({}, '', '/agenda');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page
    .getByRole('region', { name: /agenda/i })
    .waitFor({ state: 'visible', timeout: 30_000 });
}

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await login(page);
  await openAgenda(page);
  const screenshotPath = path.join(ARTIFACT_DIR, 'agenda-workspace-en.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await writeFile(
    path.join(ARTIFACT_DIR, 'manifest.json'),
    JSON.stringify({ screenshot: screenshotPath, route: '/agenda' }, null, 2),
  );
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Issue #116 stacked master-detail reveal/focus browser evidence (Chromium).
 * Requires local API+web (`pnpm dev`) and default synthetic seed.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ARTIFACT_DIR = '/opt/cursor/artifacts/issue116-evidence';
const WEB = 'http://127.0.0.1:5173';

const VIEWPORTS = [
  { label: '800', width: 800, height: 900 },
  { label: '430', width: 430, height: 844 },
  { label: '390', width: 390, height: 844 },
];

const admin = {
  email: 'admin@example.test',
  password: 'Synthetic-admin-123!',
};

async function login(page) {
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await page.locator('input[name="email"]').fill(admin.email);
  await page.locator('input[name="password"]').fill(admin.password);
  await page.locator('form.auth-panel button[type="submit"]').click();
  await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 60_000 });
}

async function prepareLocale(context, locale) {
  await context.addInitScript((value) => {
    window.localStorage.setItem('hireme.locale', value);
  }, locale);
}

async function gotoRoute(page, route) {
  await page.evaluate((href) => {
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, route);
}

async function screenshot(page, name) {
  const file = path.join(ARTIFACT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function activeHeading(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return null;
    const tag = active.tagName.toLowerCase();
    const text = active.textContent?.trim() ?? '';
    return { tag, text: text.slice(0, 120) };
  });
}

async function captureCandidates(page, locale, viewport) {
  await gotoRoute(page, '/candidates');
  await page.locator('.candidate-list__select').first().click();
  await page.waitForTimeout(200);
  const focus = await activeHeading(page);
  const shot = await screenshot(page, `${locale}_${viewport}_candidates_stacked_selection`);
  return { module: 'candidates', locale, viewport, focus, shot };
}

async function captureClients(page, locale, viewport) {
  await gotoRoute(page, '/clients');
  await page.locator('.client-list__select').first().click();
  await page.waitForFunction(
    () => document.querySelector('.client-detail__title') === document.activeElement,
    null,
    { timeout: 15_000 },
  );
  const focus = await activeHeading(page);
  const shot = await screenshot(page, `${locale}_${viewport}_clients_stacked_selection`);
  return { module: 'clients', locale, viewport, focus, shot };
}

async function captureMissions(page, locale, viewport) {
  await gotoRoute(page, '/missions');
  await page.locator('button.mission-list__select').first().click();
  await page.waitForFunction(
    () => document.querySelector('.mission-detail__title') === document.activeElement,
    null,
    { timeout: 15_000 },
  );
  const missionFocus = await activeHeading(page);
  const missionShot = await screenshot(page, `${locale}_${viewport}_missions_stacked_selection`);

  const pipeline = page.locator('section.mission-section').filter({
    has: page.getByRole('heading', {
      level: 3,
      name: locale === 'fr' ? 'Vivier de candidats' : 'Candidate pipeline',
    }),
  });
  await pipeline.locator('button.mission-pipeline__select').first().click();
  await page.waitForFunction(
    () => document.querySelector('.mission-process__title') === document.activeElement,
    null,
    { timeout: 15_000 },
  );
  const processFocus = await activeHeading(page);
  const processShot = await screenshot(page, `${locale}_${viewport}_missions_process_stacked_open`);
  const processButtonVisible = await pipeline
    .locator('button.mission-pipeline__select')
    .first()
    .isVisible();

  return {
    module: 'missions',
    locale,
    viewport,
    missionFocus,
    processFocus,
    processButtonVisible,
    shots: [missionShot, processShot],
  };
}

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const locale of ['en', 'fr']) {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        locale: locale === 'fr' ? 'fr-FR' : 'en-US',
      });
      await prepareLocale(context, locale);
      const page = await context.newPage();
      await login(page);
      results.push(await captureCandidates(page, locale, viewport.label));
      results.push(await captureClients(page, locale, viewport.label));
      results.push(await captureMissions(page, locale, viewport.label));
      await context.close();
    }
  }

  await browser.close();
  await writeFile(path.join(ARTIFACT_DIR, 'summary.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.log(`Wrote ${results.length} captures to ${ARTIFACT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

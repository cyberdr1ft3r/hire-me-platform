#!/usr/bin/env node
/**
 * Issue #114 Missions public-opportunity browser evidence (Chromium).
 * Requires local API+web (`pnpm dev`) and `issue-114-evidence-setup.ts` data.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ARTIFACT_DIR = '/opt/cursor/artifacts/issue114-evidence';
const WEB = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:3000';

const setup = {
  adminEmail: 'admin@example.test',
  adminPassword: 'Synthetic-admin-123!',
  viewerEmail: 'issue114-view@test.hireme.test',
  viewerPassword: 'Synthetic-viewer-123!',
  missions: {
    missing: 'e9d96776-b65e-41f3-bd57-b148707fe93d',
    existing: '283cbfc6-0e05-496e-b937-64a3dedbd530',
    errorProbe: '2481b479-f5e8-4b72-a543-afe73e910d96',
  },
  missionTitles: {
    'e9d96776-b65e-41f3-bd57-b148707fe93d': 'Issue114 Missing Public',
    '283cbfc6-0e05-496e-b937-64a3dedbd530': 'Issue114 Existing Public',
    '2481b479-f5e8-4b72-a543-afe73e910d96': 'Issue114 Error Probe',
  },
};

const VIEWPORTS = [
  { label: '1440', width: 1440, height: 900 },
  { label: '390', width: 390, height: 844 },
];

async function login(page, email, password) {
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form.auth-panel button[type="submit"]').click();
  await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 30_000 });
}

async function prepareLocale(context, locale) {
  await context.addInitScript((value) => {
    window.localStorage.setItem('hireme.locale', value);
  }, locale);
}

async function ensureMissionsRoute(page) {
  if (!page.url().includes('/missions')) {
    await page.evaluate(() => {
      window.history.pushState({}, '', '/missions');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.locator('.mission-list').waitFor({ state: 'visible', timeout: 30_000 });
  }
}

async function openMission(page, missionId) {
  const title = setup.missionTitles[missionId];
  if (!title) {
    throw new Error(`Unknown mission id ${missionId}`);
  }
  await ensureMissionsRoute(page);
  await page.locator('button.mission-list__select').filter({ hasText: title }).click();
  await page
    .getByRole('heading', { level: 2, name: title })
    .waitFor({ state: 'visible', timeout: 30_000 });
  await page
    .locator('section.mission-section')
    .filter({
      has: page.getByRole('heading', {
        level: 3,
        name: /^Public opportunity$|^Annonce publique$/i,
      }),
    })
    .waitFor({ state: 'visible', timeout: 30_000 });
}

async function layoutOk(page) {
  return page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

async function screenshot(page, name) {
  const file = path.join(ARTIFACT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
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

      await login(page, setup.adminEmail, setup.adminPassword);

      await openMission(page, setup.missions.existing);
      const existingLayout = await layoutOk(page);
      const existingShot = await screenshot(
        page,
        `${locale}_${viewport.label}_admin_existing_public_opportunity`,
      );
      results.push({
        scenario: 'existing',
        locale,
        viewport: viewport.label,
        existingLayout,
        existingShot,
      });

      await openMission(page, setup.missions.missing);
      const missingLayout = await layoutOk(page);
      const missingShot = await screenshot(
        page,
        `${locale}_${viewport.label}_admin_missing_empty_state`,
      );
      const hasSectionError = await page
        .getByText(/section unavailable|section indisponible/i)
        .count();
      const hasEmptyTitle = await page
        .getByRole('heading', {
          name: /no public opportunity yet|aucune annonce publique pour l['’]instant/i,
        })
        .count();
      results.push({
        scenario: 'missing-admin',
        locale,
        viewport: viewport.label,
        missingLayout,
        hasSectionError,
        hasEmptyTitle,
        missingShot,
      });

      await context.close();
    }
  }

  for (const locale of ['en', 'fr']) {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        locale: locale === 'fr' ? 'fr-FR' : 'en-US',
      });
      await prepareLocale(context, locale);
      const page = await context.newPage();
      await login(page, setup.viewerEmail, setup.viewerPassword);
      await openMission(page, setup.missions.missing);
      const readOnlyShot = await screenshot(
        page,
        `${locale}_${viewport.label}_viewer_missing_read_only`,
      );
      const saveVisible = await page
        .getByRole('button', { name: /save public opportunity|enregistrer l'annonce publique/i })
        .count();
      results.push({
        scenario: 'missing-viewer',
        locale,
        viewport: viewport.label,
        saveVisible,
        readOnlyShot,
      });
      await context.close();
    }
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'en-US',
    });
    await prepareLocale(context, 'en');
    const page = await context.newPage();
    await login(page, setup.adminEmail, setup.adminPassword);
    await openMission(page, setup.missions.missing);
    const form = page.getByRole('form', {
      name: /edit public opportunity|modifier l['’]annonce publique/i,
    });
    await form.scrollIntoViewIfNeeded();
    const titleField = form.locator('input[name="publicTitle"]');
    await titleField.waitFor({ state: 'visible', timeout: 20_000 });
    await titleField.fill('Issue114 Created Public Title');
    await form
      .getByRole('button', { name: /save public opportunity|enregistrer l'annonce publique/i })
      .click();
    await page
      .getByText(
        /public opportunity configuration saved|configuration de l['’]annonce publique enregistrée/i,
      )
      .waitFor({ timeout: 20_000 });
    await page
      .getByRole('button', { name: /enable applications|activer les candidatures/i })
      .waitFor({ timeout: 20_000 });
    const createShot = await screenshot(page, 'en_1440_admin_first_create_ready_state');
    results.push({ scenario: 'first-create', createShot });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await prepareLocale(context, 'en');
    const page = await context.newPage();
    await page.route(`**/v1/missions/${setup.missions.errorProbe}/public-opportunity`, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'INTERNAL', message: 'Synthetic failure' }),
      }),
    );
    await login(page, setup.adminEmail, setup.adminPassword);
    await openMission(page, setup.missions.errorProbe);
    const errorShot = await screenshot(page, 'en_1440_admin_section_error_500');
    const hasSectionError = await page
      .getByText(/section unavailable|section indisponible/i)
      .count();
    results.push({ scenario: 'error-500', hasSectionError, errorShot });
    await context.close();
  }

  await browser.close();
  const summaryPath = path.join(ARTIFACT_DIR, 'summary.json');
  await writeFile(summaryPath, JSON.stringify({ setup, results }, null, 2));
  console.log(`Wrote evidence to ${ARTIFACT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

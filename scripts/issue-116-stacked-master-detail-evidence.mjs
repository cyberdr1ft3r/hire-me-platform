#!/usr/bin/env node
/**
 * Issue #116 stacked master-detail reveal/focus browser evidence (Chromium).
 * Requires local API+web (`pnpm dev`), seed, and `scripts/issue-116-evidence-setup.ts`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ARTIFACT_DIR = '/opt/cursor/artifacts/issue116-evidence';
const WEB = 'http://127.0.0.1:5173';

const FIXTURE = {
  candidateName: 'Issue116 Evidence Candidate',
  clientName: 'Issue116 Evidence Client',
  missionTitle: 'Issue116 Evidence Mission',
};

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

async function activeElementSummary(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return null;
    const tag = active.tagName.toLowerCase();
    const text = active.textContent?.trim() ?? '';
    const id = active.id || null;
    return { tag, text: text.slice(0, 120), id };
  });
}

async function pageOverflow(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
}

async function switchLocale(page, locale) {
  const select = page.locator('.app-shell__language-select');
  await select.selectOption(locale);
  await page.waitForTimeout(400);
}

async function captureCandidates(page, locale, viewport) {
  await gotoRoute(page, '/candidates');
  await page.locator('button.candidate-list__select', { hasText: FIXTURE.candidateName }).click();
  await page.waitForFunction(
    (name) => {
      const active = document.activeElement;
      return active?.tagName === 'H2' && active.textContent?.includes(name);
    },
    FIXTURE.candidateName,
    { timeout: 15_000 },
  );
  const focus = await activeElementSummary(page);
  const overflow = await pageOverflow(page);
  const shot = await screenshot(page, `${locale}_${viewport}_candidates_stacked_selection`);

  const focusBeforeLocale = await page.evaluate(() => document.activeElement?.textContent?.trim());
  await switchLocale(page, locale === 'en' ? 'fr' : 'en');
  const localeRefocus = await page.evaluate(
    (expected) => document.activeElement?.textContent?.trim() === expected,
    focusBeforeLocale,
  );

  await switchLocale(page, locale);
  await page.locator('form.candidate-filters button[type="submit"]').click();
  await page.waitForTimeout(800);
  const refreshRefocus = await page.evaluate(
    (name) => document.activeElement?.textContent?.includes(name),
    FIXTURE.candidateName,
  );

  return {
    module: 'candidates',
    locale,
    viewport,
    focus,
    overflow,
    localeRefocusStable: localeRefocus,
    refreshRefocusStable: refreshRefocus,
    shot,
  };
}

async function captureClients(page, locale, viewport) {
  await gotoRoute(page, '/clients');
  await page.locator('button.client-list__select', { hasText: FIXTURE.clientName }).click();
  await page.waitForFunction(
    () => document.querySelector('.client-detail__title') === document.activeElement,
    null,
    { timeout: 15_000 },
  );
  const focus = await activeElementSummary(page);
  const overflow = await pageOverflow(page);
  const shot = await screenshot(page, `${locale}_${viewport}_clients_stacked_selection`);
  return { module: 'clients', locale, viewport, focus, overflow, shot };
}

async function captureMissions(page, locale, viewport) {
  await gotoRoute(page, '/missions');
  await page.locator('button.mission-list__select', { hasText: FIXTURE.missionTitle }).click();
  await page.waitForFunction(
    () => document.querySelector('.mission-detail__title') === document.activeElement,
    null,
    { timeout: 15_000 },
  );
  const missionFocus = await activeElementSummary(page);
  const missionShot = await screenshot(page, `${locale}_${viewport}_missions_stacked_selection`);

  const pipeline = page.locator('section.mission-section').filter({
    has: page.getByRole('heading', {
      level: 3,
      name: locale === 'fr' ? 'Vivier de candidats' : 'Candidate pipeline',
    }),
  });
  const processButton = pipeline.locator('button.mission-pipeline__select').first();
  const processButtonBox = await processButton.boundingBox();
  const viewportSize = page.viewportSize();
  const processButtonInViewport =
    processButtonBox &&
    viewportSize &&
    processButtonBox.x >= 0 &&
    processButtonBox.x + processButtonBox.width <= viewportSize.width + 1;

  await processButton.click();
  await page.waitForFunction(
    () => document.querySelector('.mission-process__title') === document.activeElement,
    null,
    { timeout: 15_000 },
  );
  const processFocus = await activeElementSummary(page);
  const processShot = await screenshot(page, `${locale}_${viewport}_missions_process_stacked_open`);
  const overflow = await pageOverflow(page);

  return {
    module: 'missions',
    locale,
    viewport,
    missionFocus,
    processFocus,
    processButtonVisible: await processButton.isVisible(),
    processButtonInViewport,
    overflow,
    shots: [missionShot, processShot],
  };
}

function assertResults(results) {
  const failures = [];
  for (const row of results) {
    if (row.overflow?.overflow) {
      failures.push(`${row.module} ${row.locale} ${row.viewport}: horizontal overflow`);
    }
    if (row.module === 'candidates') {
      if (!row.focus?.text?.includes(FIXTURE.candidateName)) {
        failures.push(`${row.locale} ${row.viewport} candidates: focus not on candidate heading`);
      }
      if (row.localeRefocusStable === false) {
        failures.push(`${row.locale} ${row.viewport} candidates: locale switch refocused`);
      }
      if (row.refreshRefocusStable === false) {
        failures.push(`${row.locale} ${row.viewport} candidates: list refresh refocused`);
      }
    }
    if (row.module === 'clients' && !row.focus?.text?.includes(FIXTURE.clientName)) {
      failures.push(`${row.locale} ${row.viewport} clients: focus not on client heading`);
    }
    if (row.module === 'missions') {
      if (!row.missionFocus?.text?.includes(FIXTURE.missionTitle)) {
        failures.push(`${row.locale} ${row.viewport} missions: focus not on mission heading`);
      }
      if (!row.processFocus?.text?.includes(FIXTURE.candidateName)) {
        failures.push(
          `${row.locale} ${row.viewport} missions: process focus missing candidate name`,
        );
      }
      if (!row.processButtonVisible || !row.processButtonInViewport) {
        failures.push(
          `${row.locale} ${row.viewport} missions: pipeline open control not in viewport`,
        );
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`Evidence assertions failed:\n- ${failures.join('\n- ')}`);
  }
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
  assertResults(results);
  await writeFile(path.join(ARTIFACT_DIR, 'summary.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.log(`Wrote ${results.length} captures to ${ARTIFACT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

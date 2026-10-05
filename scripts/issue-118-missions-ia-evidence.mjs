#!/usr/bin/env node
/**
 * Issue #118 Missions IA browser evidence — scroll depth, overflow, pipeline split.
 * Requires `pnpm dev`, seeded DB, and rich mission fixture (reuse issue-116 setup or manual seed).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ARTIFACT_DIR = '/opt/cursor/artifacts/issue118-evidence';
const WEB = 'http://127.0.0.1:5173';

const VIEWPORTS = [
  { label: '1440', width: 1440, height: 900 },
  { label: '1024', width: 1024, height: 900 },
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

async function gotoMissions(page) {
  await page.evaluate(() => {
    window.history.pushState({}, '', '/missions');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.locator('.missions').waitFor({ state: 'visible', timeout: 60_000 });
}

async function measureDetail(page) {
  return page.evaluate(() => {
    const detail = document.querySelector('.mission-detail');
    const workspace = document.querySelector('.missions__workspace');
    const doc = document.documentElement;
    return {
      detailScrollHeight: detail?.scrollHeight ?? 0,
      detailClientHeight: detail?.getBoundingClientRect().height ?? 0,
      pageScrollHeight: doc.scrollHeight,
      pageClientHeight: doc.clientHeight,
      horizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
      hasPipelineSplit: Boolean(document.querySelector('.mission-pipeline-workspace--split')),
      hasDetailNav: Boolean(document.querySelector('.mission-detail-nav')),
    };
  });
}

async function runViewport(browser, viewport, locale) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
  await prepareLocale(context, locale);
  const page = await context.newPage();
  await login(page);
  await gotoMissions(page);
  await page
    .getByRole('button', { name: /Evidence Mission|Mission Alpha/i })
    .first()
    .click();
  await page.getByRole('tab', { name: locale === 'fr' ? /Vivier|Pipeline/i : 'Pipeline' }).click();
  await page
    .getByRole('button', { name: /Open the process|Ouvrir le processus/i })
    .first()
    .click();
  await page.waitForTimeout(600);
  const metrics = await measureDetail(page);
  const shot = path.join(ARTIFACT_DIR, `missions-${viewport.label}-${locale}-pipeline.png`);
  await page.screenshot({ path: shot, fullPage: true });
  await context.close();
  return { viewport: viewport.label, locale, metrics, screenshot: shot };
}

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const rows = [];
  for (const viewport of VIEWPORTS) {
    for (const locale of ['en', 'fr']) {
      rows.push(await runViewport(browser, viewport, locale));
    }
  }
  await browser.close();
  const report = {
    issue: 118,
    baselineAuditPx: { desktop1440: 3400, mobile390: 7500 },
    capturedAt: new Date().toISOString(),
    rows,
  };
  await writeFile(path.join(ARTIFACT_DIR, 'metrics.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

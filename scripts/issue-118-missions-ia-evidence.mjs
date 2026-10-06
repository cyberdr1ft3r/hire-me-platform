#!/usr/bin/env node
/**
 * Issue #118 Missions IA browser evidence (Chromium).
 * Prereq: PostgreSQL seeded, `pnpm dev`, `scripts/issue-118-evidence-setup.ts`.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ARTIFACT_DIR = '/opt/cursor/artifacts/issue118-evidence';
const WEB = 'http://127.0.0.1:5173';
const BASELINE = { desktopDetailPx: 3400, mobileDetailPx: 7500 };

const VIEWPORTS = [
  { label: '1440', width: 1440, height: 900 },
  { label: '1024', width: 1024, height: 900 },
  { label: '800', width: 800, height: 900 },
  { label: '430', width: 430, height: 844 },
  { label: '390', width: 390, height: 844 },
];

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const admin = {
  email: 'admin@example.test',
  password: 'Synthetic-admin-123!',
};

function databaseUrlFromEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  const line = readFileSync(envPath, 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL missing from .env');
  return line.slice('DATABASE_URL='.length).trim();
}

function loadFixture() {
  const raw = execSync('pnpm exec tsx ../../scripts/issue-118-evidence-setup.ts', {
    cwd: path.join(process.cwd(), 'apps/api'),
    env: { ...process.env, DATABASE_URL: databaseUrlFromEnvFile() },
    encoding: 'utf8',
  });
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error('Setup did not return fixture JSON');
  return JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
}

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

async function switchLocale(page, locale) {
  await page.locator('.app-shell__language-select').selectOption(locale);
  await page.waitForTimeout(400);
}

async function metrics(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const detail = document.querySelector('.mission-detail');
    const visiblePanel = document.querySelector(
      '.mission-detail__panel:not([hidden]), .mission-detail__panel[role="region"]',
    );
    return {
      pageScrollHeight: doc.scrollHeight,
      pageClientHeight: doc.clientHeight,
      detailScrollHeight: detail?.scrollHeight ?? 0,
      activePanelScrollHeight: visiblePanel?.scrollHeight ?? 0,
      horizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
      hasSplit: Boolean(document.querySelector('.mission-pipeline-workspace--split')),
      hasNav: Boolean(document.querySelector('.mission-detail-nav')),
    };
  });
}

async function bodyUuids(page) {
  return page.evaluate(() => document.body.innerText.match(/[0-9a-f-]{36}/gi) ?? []);
}

function tabName(locale, section) {
  const en = { overview: 'Overview', team: 'Team', pipeline: 'Pipeline', public: 'Public' };
  const fr = {
    overview: 'Vue d’ensemble',
    team: 'Équipe',
    pipeline: 'Vivier',
    public: 'Public',
  };
  return (locale === 'fr' ? fr : en)[section];
}

async function openMissionList(page, fixture) {
  await gotoRoute(page, '/missions');
  await page.locator('.missions').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: new RegExp(`^${fixture.missionTitle}`) }).click();
  await page.locator('.mission-detail__title').waitFor({ state: 'visible' });
}

async function captureViewport(page, locale, viewport, fixture) {
  const row = {
    locale,
    viewport: viewport.label,
    tabs: {},
    deepLinks: {},
    keyboard: {},
    profile: {},
    pipeline: {},
    focus: {},
    metrics: {},
    overflow: false,
    uuids: [],
    shots: [],
  };

  await openMissionList(page, fixture);

  for (const section of ['overview', 'team', 'pipeline', 'public']) {
    const tab = tabName(locale, section);
    const tabButton = page.getByRole('tab', { name: tab });
    if (await tabButton.count()) {
      await tabButton.click();
      await page.waitForTimeout(300);
      row.tabs[section] = await metrics(page);
      row.shots.push(await shot(page, `${locale}_${viewport.label}_tab_${section}`));
    }
  }

  // Profile read-first -> edit
  await page.getByRole('tab', { name: tabName(locale, 'overview') }).click();
  const editLabel = locale === 'fr' ? 'Modifier la mission' : 'Edit mission';
  const editBtn = page.getByRole('button', { name: editLabel });
  row.profile.editFormBeforeClick = await page.getByRole('form', { name: editLabel }).count();
  if (await editBtn.count()) {
    await editBtn.click();
    row.profile.editFormAfterClick = await page.getByRole('form', { name: editLabel }).count();
  }

  // Pipeline process via candidate-name control (#116)
  await page.getByRole('tab', { name: tabName(locale, 'pipeline') }).click();
  const openBtn = page.locator('button.mission-pipeline__select').first();
  const box = await openBtn.boundingBox();
  const vp = page.viewportSize();
  row.pipeline.processButtonInViewport = Boolean(
    box && vp && box.x >= 0 && box.x + box.width <= vp.width + 1,
  );
  await openBtn.click();
  await page.waitForTimeout(500);
  row.pipeline.processHeadingVisible = await page.locator('.mission-process__title').isVisible();
  row.metrics.pipelineOpen = await metrics(page);

  if (viewport.width <= 800) {
    await page.waitForFunction(
      () => document.querySelector('.mission-process__title') === document.activeElement,
      null,
      { timeout: 10_000 },
    );
    row.focus.stackedProcessHeadingFocused = true;
    const focusBefore = await page.evaluate(() => document.activeElement?.textContent?.trim());
    await switchLocale(page, locale === 'en' ? 'fr' : 'en');
    row.focus.localeSwitchRefocused =
      (await page.evaluate(() => document.activeElement?.textContent?.trim())) !== focusBefore;
    await switchLocale(page, locale);
  }

  row.overflow = (await metrics(page)).horizontalOverflow;
  row.uuids = await bodyUuids(page);

  // Deep links on fresh navigation
  await gotoRoute(
    page,
    `/missions?mission=${fixture.missionId}&process=${fixture.primaryProcessId}`,
  );
  await page.locator('.missions').waitFor({ state: 'visible' });
  row.deepLinks.processTabSelected = await page
    .getByRole('tab', { name: tabName(locale, 'pipeline'), selected: true })
    .count();
  row.deepLinks.processRegionVisible = await page
    .getByRole('region', { name: fixture.primaryCandidateName })
    .count();

  await gotoRoute(
    page,
    `/missions?mission=${fixture.missionId}&process=${fixture.primaryProcessId}&interview=${fixture.interviewId}`,
  );
  await page.locator('.missions').waitFor({ state: 'visible' });
  await page.waitForTimeout(800);
  row.deepLinks.interviewIntent = await page
    .getByRole('button', { name: /interview/i })
    .first()
    .count();

  await gotoRoute(page, `/missions?mission=${fixture.missionId}`);
  await page.locator('.missions').waitFor({ state: 'visible' });
  row.deepLinks.missionOnlyOverview =
    (await page.getByRole('tab', { name: tabName(locale, 'overview'), selected: true }).count()) >
      0 || (await page.getByRole('region', { name: tabName(locale, 'overview') }).count()) > 0;

  // Keyboard tab navigation (desktop-ish widths)
  if (viewport.width >= 1024) {
    await openMissionList(page, fixture);
    const firstTab = page.getByRole('tab').first();
    await firstTab.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    row.keyboard.movedTab = await page.evaluate(
      () => document.activeElement?.getAttribute('role') === 'tab',
    );
  }

  return row;
}

async function shot(page, name) {
  const file = path.join(ARTIFACT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

function assertManifest(manifest) {
  const failures = [];
  for (const row of manifest.matrix) {
    if (row.overflow) failures.push(`${row.locale} ${row.viewport}: horizontal overflow`);
    if (row.uuids.length > 0) failures.push(`${row.locale} ${row.viewport}: UUIDs in body`);
    if (row.pipeline.processButtonInViewport === false) {
      failures.push(`${row.locale} ${row.viewport}: pipeline open control off-screen`);
    }
    if (!row.pipeline.processHeadingVisible) {
      failures.push(`${row.locale} ${row.viewport}: process detail missing`);
    }
    if (row.focus.stackedProcessHeadingFocused === false) {
      failures.push(`${row.locale} ${row.viewport}: stacked process heading not focused`);
    }
    if (row.focus.localeSwitchRefocused === true) {
      failures.push(`${row.locale} ${row.viewport}: locale switch refocused process heading`);
    }
    if (row.deepLinks.processTabSelected === 0 && row.deepLinks.processRegionVisible === 0) {
      failures.push(`${row.locale} ${row.viewport}: process deep link failed`);
    }
    const pipelineMetrics = row.tabs.pipeline ?? row.metrics.pipelineOpen;
    if (pipelineMetrics && pipelineMetrics.detailScrollHeight > BASELINE.desktopDetailPx) {
      failures.push(`${row.locale} ${row.viewport}: detail taller than pre-#118 desktop baseline`);
    }
    if (
      (row.viewport === '390' || row.viewport === '430') &&
      pipelineMetrics &&
      pipelineMetrics.pageScrollHeight > BASELINE.mobileDetailPx
    ) {
      failures.push(`${row.locale} ${row.viewport}: page taller than pre-#118 mobile baseline`);
    }
  }
  if (failures.length) throw new Error(failures.join('\n'));
}

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const fixture = loadFixture();
  await writeFile(path.join(ARTIFACT_DIR, 'fixture.json'), `${JSON.stringify(fixture, null, 2)}\n`);

  const browser = await chromium.launch({ headless: true });
  const matrix = [];

  for (const locale of ['en', 'fr']) {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        locale: locale === 'fr' ? 'fr-FR' : 'en-US',
      });
      await prepareLocale(context, locale);
      const page = await context.newPage();
      await login(page);
      matrix.push(await captureViewport(page, locale, viewport, fixture));
      await context.close();
    }
  }

  await browser.close();

  const manifest = {
    issue: 118,
    capturedAt: new Date().toISOString(),
    baselineAuditPx: BASELINE,
    fixture,
    matrix,
    summary: {
      maxPageScrollHeight: Math.max(
        ...matrix.map((r) => r.metrics.pipelineOpen?.pageScrollHeight ?? 0),
      ),
      maxDetailScrollHeight: Math.max(
        ...matrix.map((r) => r.metrics.pipelineOpen?.detailScrollHeight ?? 0),
      ),
      allTabsRecorded: matrix.every((r) => Object.keys(r.tabs).length >= 3),
    },
  };

  assertManifest(manifest);
  await writeFile(
    path.join(ARTIFACT_DIR, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(`Issue #118 evidence PASS — ${matrix.length} captures → ${ARTIFACT_DIR}`);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});

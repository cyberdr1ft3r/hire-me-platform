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

async function loginOnVisibleForm(page) {
  if (
    !(await page
      .locator('input[name="email"]')
      .isVisible()
      .catch(() => false))
  ) {
    return;
  }
  await page.locator('input[name="email"]').fill(admin.email);
  await page.locator('input[name="password"]').fill(admin.password);
  await page.locator('form.auth-panel button[type="submit"]').click();
  await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 60_000 });
}

async function login(page) {
  await page.goto(`${WEB}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').waitFor({ state: 'visible', timeout: 60_000 });
  await loginOnVisibleForm(page);
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

function profileLabels(locale) {
  if (locale === 'fr') {
    return {
      edit: 'Modifier la mission',
      cancel: 'Annuler la modification',
      save: 'Enregistrer la mission',
    };
  }
  return {
    edit: 'Edit mission',
    cancel: 'Cancel editing',
    save: 'Save mission',
  };
}

function interviewTypeLabel(locale) {
  return locale === 'fr' ? 'Entretien RH' : 'HR interview';
}

async function tabKeyboardState(page) {
  return page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role="tablist"] [role="tab"]')];
    const active = document.activeElement;
    return {
      tabs: tabs.map((tab) => ({
        id: tab.id,
        selected: tab.getAttribute('aria-selected') === 'true',
      })),
      focusedTabId: active?.getAttribute('role') === 'tab' ? active.id : null,
    };
  });
}

async function assertKeyboardNavigation(page, locale) {
  const tablist = page.getByRole('tablist');
  if ((await tablist.count()) === 0) {
    return { skipped: true, reason: 'no tablist' };
  }

  const overviewTab = page.getByRole('tab', { name: tabName(locale, 'overview') });
  await overviewTab.focus();
  await page.waitForTimeout(100);

  const results = {};

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  let state = await tabKeyboardState(page);
  results.arrowRight =
    state.focusedTabId === 'mission-detail-tab-team' &&
    state.tabs.find((tab) => tab.id === 'mission-detail-tab-team')?.selected === true;

  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);
  state = await tabKeyboardState(page);
  results.arrowLeft =
    state.focusedTabId === 'mission-detail-tab-overview' &&
    state.tabs.find((tab) => tab.id === 'mission-detail-tab-overview')?.selected === true;

  await page.keyboard.press('End');
  await page.waitForTimeout(150);
  state = await tabKeyboardState(page);
  results.end =
    state.focusedTabId === 'mission-detail-tab-public' &&
    state.tabs.find((tab) => tab.id === 'mission-detail-tab-public')?.selected === true;

  await page.keyboard.press('Home');
  await page.waitForTimeout(150);
  state = await tabKeyboardState(page);
  results.home =
    state.focusedTabId === 'mission-detail-tab-overview' &&
    state.tabs.find((tab) => tab.id === 'mission-detail-tab-overview')?.selected === true;

  results.focusOnTab = state.focusedTabId !== null;
  return results;
}

async function assertReadFirstProfile(page, locale) {
  const labels = profileLabels(locale);
  await page.getByRole('tab', { name: tabName(locale, 'overview') }).click();
  await page.waitForTimeout(200);

  const editForm = page.getByRole('form', { name: labels.edit });
  const result = {
    editFormInitiallyHidden: (await editForm.count()) === 0,
    editRevealsForm: false,
    cancelReturnsReadFirst: false,
    saveReturnsReadFirst: false,
  };

  const editBtn = page.getByRole('button', { name: labels.edit });
  if ((await editBtn.count()) === 0) {
    return { ...result, skipped: true, reason: 'no edit permission' };
  }

  await editBtn.click();
  await page.waitForTimeout(150);
  result.editRevealsForm = (await editForm.count()) === 1;

  await page.getByRole('button', { name: labels.cancel }).click();
  await page.waitForTimeout(150);
  result.cancelReturnsReadFirst = (await editForm.count()) === 0;

  await editBtn.click();
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: labels.save }).click();
  await page.waitForTimeout(600);
  result.saveReturnsReadFirst = (await editForm.count()) === 0;

  return result;
}

async function openMissionList(page, fixture) {
  await gotoRoute(page, '/missions');
  await page.locator('.missions').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: new RegExp(`^${fixture.missionTitle}`) }).click();
  await page.locator('.mission-detail__title').waitFor({ state: 'visible' });
}

async function gotoMissionsDeepLink(page, search) {
  await page.goto(`${WEB}/missions${search}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await loginOnVisibleForm(page);
  await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 60_000 });
  await page.locator('.missions').waitFor({ state: 'visible', timeout: 60_000 });
}

async function assertMissionOnlyDeepLink(page, locale, fixture) {
  await gotoMissionsDeepLink(page, `?mission=${encodeURIComponent(fixture.missionId)}`);
  await page.locator('.mission-detail__title', { hasText: fixture.missionTitle }).waitFor({
    state: 'visible',
    timeout: 15_000,
  });
  const overviewTab = page.getByRole('tab', {
    name: tabName(locale, 'overview'),
    selected: true,
  });
  const overviewPanelVisible = await page.evaluate(() => {
    const panel = document.getElementById('mission-detail-panel-overview');
    return Boolean(panel && !panel.hidden);
  });
  return {
    missionTitleVisible: true,
    overviewActive: (await overviewTab.count()) > 0 || overviewPanelVisible,
  };
}

async function assertProcessDeepLink(page, locale, fixture) {
  await gotoMissionsDeepLink(
    page,
    `?mission=${encodeURIComponent(fixture.missionId)}&process=${encodeURIComponent(fixture.primaryProcessId)}`,
  );
  await page.waitForTimeout(800);
  const pipelineSelected =
    (await page.getByRole('tab', { name: tabName(locale, 'pipeline'), selected: true }).count()) >
    0;
  const processHeading = page.getByRole('heading', {
    level: 3,
    name: fixture.primaryCandidateName,
  });
  return {
    pipelineActive: pipelineSelected,
    processOpen: (await processHeading.count()) > 0 && (await processHeading.isVisible()),
  };
}

async function assertInterviewDeepLink(page, locale, fixture) {
  await gotoMissionsDeepLink(
    page,
    `?mission=${encodeURIComponent(fixture.missionId)}&process=${encodeURIComponent(fixture.primaryProcessId)}&interview=${encodeURIComponent(fixture.interviewId)}`,
  );
  const interviewHeading = page.locator(`#mission-interview-${fixture.interviewId}`);
  await interviewHeading.waitFor({ state: 'visible', timeout: 30_000 });

  const pipelineSelected =
    (await page.getByRole('tab', { name: tabName(locale, 'pipeline'), selected: true }).count()) >
    0;
  const processHeading = page.getByRole('heading', {
    level: 3,
    name: fixture.primaryCandidateName,
  });
  const interviewDetailId = `mission-interview-${fixture.interviewId}`;
  const detailHeading = page.locator(`#${interviewDetailId}`);
  const typeLabel = interviewTypeLabel(locale);
  const headingText = (await detailHeading.count()) > 0 ? await detailHeading.innerText() : '';
  const interviewDetailVisible =
    (await detailHeading.isVisible()) && headingText.includes(typeLabel);
  const interviewRowSelected = (await page.locator('tr[data-selected="true"]').count()) > 0;

  return {
    pipelineActive: pipelineSelected,
    processOpen: (await processHeading.count()) > 0 && (await processHeading.isVisible()),
    interviewDetailVisible,
    interviewRowSelected,
  };
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

  row.deepLinks.missionOnly = await assertMissionOnlyDeepLink(page, locale, fixture);
  row.deepLinks.process = await assertProcessDeepLink(page, locale, fixture);
  row.deepLinks.interview = await assertInterviewDeepLink(page, locale, fixture);

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

  row.profile = await assertReadFirstProfile(page, locale);

  await page.getByRole('tab', { name: tabName(locale, 'pipeline') }).click();
  const openBtn = page
    .locator('button.mission-pipeline__select')
    .filter({ hasText: fixture.primaryCandidateName })
    .first();
  const box = await openBtn.boundingBox();
  const vp = page.viewportSize();
  row.pipeline.processButtonInViewport = Boolean(
    box && vp && box.x >= 0 && box.x + box.width <= vp.width + 1,
  );
  await openBtn.click();
  await page.waitForTimeout(500);
  row.pipeline.processHeadingVisible = await page
    .getByRole('heading', { level: 3, name: fixture.primaryCandidateName })
    .isVisible();
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

  if (viewport.width >= 1024) {
    await openMissionList(page, fixture);
    row.keyboard = await assertKeyboardNavigation(page, locale);
  }

  return row;
}

async function shot(page, name) {
  const file = path.join(ARTIFACT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

function assertKeyboardResults(keyboard) {
  if (keyboard.skipped) return [];
  const failures = [];
  for (const key of ['arrowRight', 'arrowLeft', 'home', 'end', 'focusOnTab']) {
    if (!keyboard[key]) failures.push(`keyboard.${key}`);
  }
  return failures;
}

function assertProfileResults(profile, label) {
  const failures = [];
  if (profile.skipped) return failures;
  if (!profile.editFormInitiallyHidden) failures.push(`${label}: edit form visible initially`);
  if (!profile.editRevealsForm) failures.push(`${label}: Edit did not reveal form`);
  if (!profile.cancelReturnsReadFirst) failures.push(`${label}: Cancel did not return read-first`);
  if (!profile.saveReturnsReadFirst) failures.push(`${label}: Save did not return read-first`);
  return failures;
}

function assertDeepLinks(deepLinks, label) {
  const failures = [];
  if (!deepLinks.missionOnly?.overviewActive) {
    failures.push(`${label}: mission-only deep link did not activate Overview`);
  }
  if (!deepLinks.missionOnly?.missionTitleVisible) {
    failures.push(`${label}: mission-only deep link mission title missing`);
  }
  if (!deepLinks.process?.pipelineActive || !deepLinks.process?.processOpen) {
    failures.push(`${label}: process deep link did not open Pipeline + intended process`);
  }
  if (
    !deepLinks.interview?.pipelineActive ||
    !deepLinks.interview?.processOpen ||
    !deepLinks.interview?.interviewDetailVisible
  ) {
    failures.push(`${label}: interview deep link did not resolve intended process/interview`);
  }
  return failures;
}

function assertManifest(manifest) {
  const failures = [];
  for (const row of manifest.matrix) {
    const label = `${row.locale} ${row.viewport}`;
    if (row.overflow) failures.push(`${label}: horizontal overflow`);
    if (row.uuids.length > 0) failures.push(`${label}: UUIDs in body`);
    if (row.pipeline.processButtonInViewport === false) {
      failures.push(`${label}: pipeline open control off-screen`);
    }
    if (!row.pipeline.processHeadingVisible) {
      failures.push(`${label}: process detail missing`);
    }
    if (row.viewport === '800' || row.viewport === '430' || row.viewport === '390') {
      if (row.focus.stackedProcessHeadingFocused !== true) {
        failures.push(`${label}: stacked process heading not focused`);
      }
      if (row.focus.localeSwitchRefocused === true) {
        failures.push(`${label}: locale switch refocused process heading`);
      }
    }
    failures.push(...assertDeepLinks(row.deepLinks, label));
    failures.push(...assertProfileResults(row.profile, label));
    if (row.viewport === '1440' || row.viewport === '1024') {
      failures.push(...assertKeyboardResults(row.keyboard));
    }
    if (Object.keys(row.tabs).length < 4) {
      failures.push(`${label}: expected four local IA tabs`);
    }
    const pipelineOpenMetrics = row.metrics.pipelineOpen;
    const pipelineTabMetrics = row.tabs.pipeline;
    if (
      (row.viewport === '1440' || row.viewport === '1024') &&
      pipelineOpenMetrics &&
      !pipelineOpenMetrics.hasSplit
    ) {
      failures.push(`${label}: desktop split layout missing with process open`);
    }
    if (
      (row.viewport === '1440' || row.viewport === '1024') &&
      pipelineOpenMetrics &&
      pipelineOpenMetrics.detailScrollHeight > BASELINE.desktopDetailPx
    ) {
      failures.push(`${label}: detail taller than pre-#118 desktop baseline`);
    }
    if (
      (row.viewport === '390' || row.viewport === '430') &&
      (pipelineOpenMetrics ?? pipelineTabMetrics) &&
      (pipelineOpenMetrics ?? pipelineTabMetrics).pageScrollHeight > BASELINE.mobileDetailPx
    ) {
      failures.push(`${label}: page taller than pre-#118 mobile baseline`);
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

  const representative1440En = matrix.find((r) => r.locale === 'en' && r.viewport === '1440');
  const pipelineOpen = representative1440En?.metrics.pipelineOpen ?? {};

  const manifest = {
    issue: 118,
    capturedAt: new Date().toISOString(),
    baselineAuditPx: BASELINE,
    fixture,
    matrix,
    staticChecks: {
      singleSectionA11y: {
        backing: 'unit',
        file: 'apps/web/src/missions/MissionsWorkspace.test.tsx',
        test: 'names the Overview panel without a missing tab when navigation is omitted',
      },
      stackedRevealFocus: {
        backing: 'unit',
        file: 'apps/web/src/missions/MissionsWorkspace.test.tsx',
        test: 'opens a process from the candidate name control and focuses it on stacked layouts',
      },
      backgroundRefreshFocus: {
        backing: 'design',
        note: 'No aria-live on process reveal; list refresh focus stability covered by MissionsPanel generation guards (not re-exercised in browser matrix).',
      },
    },
    summary: {
      maxPageScrollHeightPipelineOpen: Math.max(
        ...matrix.map((r) => r.metrics.pipelineOpen?.pageScrollHeight ?? 0),
      ),
      maxDetailScrollHeightPipelineOpen: Math.max(
        ...matrix.map((r) => r.metrics.pipelineOpen?.detailScrollHeight ?? 0),
      ),
      maxActivePanelScrollHeightPipelineOpen: Math.max(
        ...matrix.map((r) => r.metrics.pipelineOpen?.activePanelScrollHeight ?? 0),
      ),
      representative1440EnPipelineOpen: pipelineOpen,
      keyboard1440En: representative1440En?.keyboard ?? {},
      allTabsRecorded: matrix.every((r) => Object.keys(r.tabs).length >= 4),
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

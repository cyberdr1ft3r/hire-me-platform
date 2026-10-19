#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const WEB = process.env.ISSUE_224_WEB_URL ?? 'http://127.0.0.1:4173';
const CHROME =
  process.env.ISSUE_224_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUTPUT = path.join(ROOT, 'docs', 'audit', 'issue-224-missions');
const MISSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const VIEWPORTS = [
  { height: 900, name: 'desktop', width: 1440 },
  { height: 1024, name: 'tablet', width: 768 },
  { hasTouch: true, height: 844, isMobile: true, name: 'mobile', width: 390 },
];
const LOCALES = ['en', 'fr'];

const copy = {
  en: { back: 'Back to missions', heading: 'Missions', open: 'Open full record' },
  fr: { back: 'Retour aux missions', heading: 'Missions', open: 'Ouvrir la fiche complète' },
};

function mission(index) {
  const id =
    index === 0 ? MISSION_ID : `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`;
  const title = index === 0 ? 'Synthetic Platform Mission' : `Synthetic Mission ${index + 1}`;
  return {
    applicationDeadline: index % 2 ? null : '2026-12-31T23:59:59.999Z',
    archivedAt: null,
    clientId: CLIENT_ID,
    clientName: index % 2 ? 'Synthetic Client France' : 'Synthetic Client Morocco',
    closedAt: null,
    closureReason: null,
    commercial: null,
    createdAt: '2026-07-21T12:00:00.000Z',
    description: `${title} description for deterministic Issue #224 browser verification.`,
    engagementType: 'CDI',
    filledPlacementCount: index % 3,
    id,
    location: index % 2 ? 'Lyon' : 'Casablanca',
    numberOfPositions: 3,
    priority: index % 5 === 0 ? 'HIGH' : 'NORMAL',
    requirements: 'Synthetic requirements',
    state: 'ACTIVE',
    targetStartDate: null,
    title,
    updatedAt: '2026-10-19T08:00:00.000Z',
    workArrangement: 'Hybrid',
  };
}

const missions = Array.from({ length: 36 }, (_, index) => mission(index));
const auth = {
  accessToken: 'issue-224-missions-browser-token',
  accessTokenExpiresAt: '2099-10-19T12:05:00.000Z',
  user: {
    displayName: 'Missions Workspace Reviewer',
    email: 'issue-224-missions@example.test',
    id: '00000000-0000-4000-8000-000000000224',
    permissions: ['missions:view', 'missions:create'],
  },
};

async function installApiFixtures(page, detailReads) {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.port !== '3000') {
      await route.continue();
      return;
    }
    if (url.pathname.endsWith('/health')) {
      await route.fulfill({
        json: {
          service: 'hire-me-api',
          status: 'ok',
          timestamp: '2026-10-19T08:00:00.000Z',
          uptimeSeconds: 1,
        },
      });
      return;
    }
    if (url.pathname.endsWith('/auth/refresh')) {
      await route.fulfill({ json: {}, status: 401 });
      return;
    }
    if (url.pathname.endsWith('/auth/login')) {
      await route.fulfill({ json: auth });
      return;
    }
    if (url.pathname === '/v1/missions') {
      const pageNumber = Number(url.searchParams.get('page') ?? '1');
      const pageSize = 20;
      const offset = (pageNumber - 1) * pageSize;
      await route.fulfill({
        json: {
          missions: missions.slice(offset, offset + pageSize),
          pagination: { page: pageNumber, pageSize, total: missions.length },
        },
      });
      return;
    }
    if (url.pathname === `/v1/missions/${MISSION_ID}`) {
      detailReads.push(request.url());
      await route.fulfill({ json: { mission: missions[0] } });
      return;
    }
    if (url.pathname === '/v1/notifications') {
      await route.fulfill({
        json: { notifications: [], pageInfo: { page: 1, pageSize: 25, total: 0 } },
      });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

async function signIn(page, locale) {
  await page.addInitScript((value) => localStorage.setItem('hireme.locale', value), locale);
  await page.goto(`${WEB}/missions`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(auth.user.email);
  await page.locator('input[name="password"]').fill('Synthetic-password-123!');
  await page.locator('form.auth-panel button[type="submit"]').click();
  await page.locator('.mission-directory__open').first().waitFor({ timeout: 15_000 });
}

async function horizontalOverflow(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function resetScroller(page, scroller, owner) {
  if (owner === 'nested-list') {
    await scroller.evaluate((element) => element.scrollTo(0, 0));
  } else {
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await page.waitForTimeout(80);
}

async function scrollTop(page, scroller, owner) {
  return owner === 'nested-list'
    ? scroller.evaluate((element) => element.scrollTop)
    : page.evaluate(() => window.scrollY);
}

async function synthesizeTouchScroll(page, target) {
  const box = await target.boundingBox();
  if (!box) throw new Error('Mission list scroll target has no bounding box');
  const session = await page.context().newCDPSession(page);
  const x = Math.floor(box.x + box.width / 2);
  const startY = Math.floor(box.y + Math.min(box.height * 0.78, box.height - 20));
  await session.send('Input.dispatchTouchEvent', {
    touchPoints: [{ x, y: startY }],
    type: 'touchStart',
  });
  for (let index = 1; index <= 6; index += 1) {
    await session.send('Input.dispatchTouchEvent', {
      touchPoints: [{ x, y: startY - index * 55 }],
      type: 'touchMove',
    });
    await page.waitForTimeout(35);
  }
  await session.send('Input.dispatchTouchEvent', { touchPoints: [], type: 'touchEnd' });
  await page.waitForTimeout(200);
  await session.detach();
}

async function verifyListScrolling(page, viewport) {
  const scroller = page.locator('.missions__list-pane .ui-workspace__pane-body');
  const metrics = await scroller.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  const owner = metrics.scrollHeight > metrics.clientHeight + 1 ? 'nested-list' : 'document';
  const values = { ...metrics, owner };

  await resetScroller(page, scroller, owner);
  await scroller.hover();
  values.wheelBefore = await scrollTop(page, scroller, owner);
  await page.mouse.wheel(0, 520);
  await page.waitForTimeout(160);
  values.wheelAfter = await scrollTop(page, scroller, owner);

  await resetScroller(page, scroller, owner);
  values.trackpadBefore = await scrollTop(page, scroller, owner);
  for (let index = 0; index < 7; index += 1) {
    await page.mouse.wheel(0, 72);
    await page.waitForTimeout(25);
  }
  values.trackpadAfter = await scrollTop(page, scroller, owner);

  await resetScroller(page, scroller, owner);
  if (owner === 'nested-list') {
    await scroller.evaluate((element) => {
      element.tabIndex = 0;
      element.focus();
    });
  } else {
    await page.locator('#main-content').evaluate((element) => {
      element.tabIndex = -1;
      element.focus();
    });
  }
  values.pageDownBefore = await scrollTop(page, scroller, owner);
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(160);
  values.pageDownAfter = await scrollTop(page, scroller, owner);

  if (viewport.hasTouch) {
    await resetScroller(page, scroller, owner);
    values.touchBefore = await scrollTop(page, scroller, owner);
    await synthesizeTouchScroll(page, scroller);
    values.touchAfter = await scrollTop(page, scroller, owner);
  }
  return values;
}

await mkdir(OUTPUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const results = [];

try {
  for (const viewport of VIEWPORTS) {
    for (const locale of LOCALES) {
      const context = await browser.newContext({
        hasTouch: viewport.hasTouch,
        isMobile: viewport.isMobile,
        viewport: { height: viewport.height, width: viewport.width },
      });
      const page = await context.newPage();
      const detailReads = [];
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(String(error)));
      await installApiFixtures(page, detailReads);
      await signIn(page, locale);

      await page.getByRole('heading', { level: 1, name: copy[locale].heading }).waitFor();
      const directoryShot = `${viewport.name}-${locale}-directory.png`;
      await page.screenshot({ path: path.join(OUTPUT, directoryShot) });
      const directoryKind = await page.locator('[data-page-kind="directory"]').count();
      const directoryHeadings = await page.locator('#main-content h1').count();
      const toolbar = await page.locator('.mission-filters .ui-filter-toolbar').count();
      const directoryOverflow = await horizontalOverflow(page);
      const scrolling = await verifyListScrolling(page, viewport);

      const row = page.locator('.mission-directory__open').first();
      await row.click();
      await page.waitForTimeout(120);
      const previewReads = detailReads.length;
      const selected = await row.getAttribute('aria-current');
      const sheet = (await page.locator('.ui-drawer[data-placement="bottom"]').count()) === 1;
      const previewShot = `${viewport.name}-${locale}-preview.png`;
      await page.screenshot({ path: path.join(OUTPUT, previewShot) });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      const focusReturned = await row.evaluate((element) => document.activeElement === element);

      await row.click();
      const previewRoot = sheet
        ? page.locator('.ui-drawer__footer')
        : page.locator('.mission-preview');
      await previewRoot.getByRole('button', { name: copy[locale].open }).click();
      await page.locator('[data-page-kind="record"]').waitFor();
      await page.locator('.mission-detail__title').waitFor();
      const recordUrl = page.url();
      const recordHeadings = await page.locator('#main-content h1').count();
      const recordKind = await page.locator('[data-page-kind="record"]').count();
      const recordOverflow = await horizontalOverflow(page);
      const actionPattern = await page.locator('.ui-page-header .ui-contextual-actions').count();
      const recordShot = `${viewport.name}-${locale}-record.png`;
      await page.screenshot({ fullPage: true, path: path.join(OUTPUT, recordShot) });

      await page.goBack();
      await page.locator('[data-page-kind="directory"]').waitFor();
      const backUrl = page.url();
      await page.goForward();
      await page.locator('[data-page-kind="record"]').waitFor();
      const forwardUrl = page.url();
      await page.getByRole('button', { name: copy[locale].back }).click();
      await page.locator('[data-page-kind="directory"]').waitFor();

      results.push({
        actionPattern,
        backUrl,
        detailReads: detailReads.length,
        directoryHeadings,
        directoryKind,
        directoryOverflow,
        focusReturned,
        forwardUrl,
        locale,
        pageErrors,
        previewReads,
        recordHeadings,
        recordKind,
        recordOverflow,
        recordUrl,
        screenshots: [directoryShot, previewShot, recordShot],
        scrolling,
        selected,
        sheet,
        toolbar,
        viewport: viewport.name,
      });
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const failures = results.filter((result) => {
  const scroll = result.scrolling;
  return (
    result.actionPattern !== 1 ||
    result.backUrl !== `${WEB}/missions` ||
    result.detailReads < 1 ||
    result.directoryHeadings !== 1 ||
    result.directoryKind !== 1 ||
    result.directoryOverflow > 1 ||
    !result.focusReturned ||
    result.forwardUrl !== `${WEB}/missions?mission=${MISSION_ID}` ||
    result.pageErrors.length > 0 ||
    result.previewReads !== 0 ||
    result.recordHeadings !== 1 ||
    result.recordKind !== 1 ||
    result.recordOverflow > 1 ||
    result.recordUrl !== `${WEB}/missions?mission=${MISSION_ID}` ||
    scroll.wheelAfter <= scroll.wheelBefore ||
    scroll.trackpadAfter <= scroll.trackpadBefore ||
    scroll.pageDownAfter <= scroll.pageDownBefore ||
    (result.viewport === 'mobile' && scroll.touchAfter <= scroll.touchBefore) ||
    result.selected !== 'true' ||
    result.toolbar !== 1
  );
});

const report = {
  browser: 'Google Chrome',
  chromeExecutable: CHROME,
  fixtureMode: 'contract-shaped synthetic API responses',
  generatedAt: new Date().toISOString(),
  passed: failures.length === 0,
  results,
};
await writeFile(path.join(OUTPUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  throw new Error(`Issue #224 Missions Chrome evidence failed in ${failures.length} scenario(s)`);
}

console.log(`Issue #224 Missions Chrome evidence passed (${results.length} scenarios).`);

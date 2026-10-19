#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const WEB = process.env.ISSUE_224_WEB_URL ?? 'http://127.0.0.1:4173';
const CHROME =
  process.env.ISSUE_224_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUTPUT = path.join(ROOT, 'docs', 'audit', 'issue-224-candidates');
const CANDIDATE_ID = '8a68ec11-453b-4f33-b65e-c09642ebc69b';
const VIEWPORTS = [
  { height: 900, name: 'desktop', width: 1440 },
  { height: 1024, name: 'tablet', width: 768 },
  { hasTouch: true, height: 844, isMobile: true, name: 'mobile', width: 390 },
];
const LOCALES = ['en', 'fr'];

const copy = {
  en: {
    back: 'Back to candidates',
    heading: 'Candidates',
    open: 'Open full profile',
  },
  fr: {
    back: 'Retour aux candidats',
    heading: 'Candidats',
    open: 'Ouvrir le profil complet',
  },
};

const permissions = [
  'candidates:view',
  'candidates:create',
  'candidates:update',
  'candidates:status:manage',
  'candidates:archive',
  'candidate_profile:view',
  'candidate_profile:manage',
];

function candidate(index) {
  const id =
    index === 0 ? CANDIDATE_ID : `8a68ec11-453b-4f33-b65e-${String(index).padStart(12, '0')}`;
  return {
    archivedAt: null,
    availabilityNotice: 'Available in one month',
    city: index % 2 ? 'Lyon' : 'Casablanca',
    compensation: null,
    consent: null,
    country: index % 2 ? 'France' : 'Morocco',
    createdAt: '2026-07-21T12:00:00.000Z',
    currentJobTitle: index % 2 ? 'Recruitment consultant' : 'Technical recruiter',
    displayName: index === 0 ? 'Synthetic Candidate Profile' : `Synthetic Candidate ${index + 1}`,
    education: [],
    email: `candidate-${index + 1}@example.test`,
    firstName: null,
    id,
    languages: [],
    lastName: null,
    linkedinUrl: null,
    normalizedEmail: `candidate-${index + 1}@example.test`,
    phone: `+212 5 00 00 ${String(index).padStart(2, '0')}`,
    professionalSummary:
      'Synthetic candidate information used only for Issue #224 browser verification.',
    skills: [],
    source: index % 3 === 0 ? 'public_application' : 'Synthetic referral',
    sourceDetail: null,
    status: index % 6 === 0 ? 'TALENT_POOL' : 'ACTIVE',
    updatedAt: '2026-10-19T08:00:00.000Z',
    workExperiences: [],
  };
}

const candidates = Array.from({ length: 36 }, (_, index) => candidate(index));
const auth = {
  accessToken: 'issue-224-candidates-browser-token',
  accessTokenExpiresAt: '2099-10-19T12:05:00.000Z',
  user: {
    displayName: 'Candidates Workspace Reviewer',
    email: 'issue-224-candidates@example.test',
    id: '00000000-0000-4000-8000-000000000224',
    permissions,
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
    if (url.pathname === '/v1/candidates') {
      const pageNumber = Number(url.searchParams.get('page') ?? '1');
      const pageSize = 20;
      const offset = (pageNumber - 1) * pageSize;
      await route.fulfill({
        json: {
          candidates: candidates.slice(offset, offset + pageSize),
          pagination: { page: pageNumber, pageSize, total: candidates.length },
        },
      });
      return;
    }
    if (url.pathname === `/v1/candidates/${CANDIDATE_ID}`) {
      detailReads.push(request.url());
      await route.fulfill({ json: { candidate: candidates[0] } });
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
  await page.goto(`${WEB}/candidates`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(auth.user.email);
  await page.locator('input[name="password"]').fill('Synthetic-password-123!');
  await page.locator('form.auth-panel button[type="submit"]').click();
  await page.locator('.candidate-directory__open').first().waitFor({ timeout: 15_000 });
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
  if (!box) throw new Error('Candidate list scroll target has no bounding box');
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
  const scroller = page.locator('.candidates__list-pane .ui-workspace__pane-body');
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
      const toolbar = await page.locator('.candidate-filters .ui-filter-toolbar').count();
      const directoryOverflow = await horizontalOverflow(page);
      const scrolling = await verifyListScrolling(page, viewport);

      const row = page.locator('.candidate-directory__open').first();
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
        : page.locator('.candidate-preview');
      await previewRoot.getByRole('button', { name: copy[locale].open }).click();
      await page.locator('[data-page-kind="record"]').waitFor();
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
    result.backUrl !== `${WEB}/candidates` ||
    result.detailReads < 1 ||
    result.directoryHeadings !== 1 ||
    result.directoryKind !== 1 ||
    result.directoryOverflow > 1 ||
    !result.focusReturned ||
    result.forwardUrl !== `${WEB}/candidates?candidate=${CANDIDATE_ID}` ||
    result.pageErrors.length > 0 ||
    result.previewReads !== 0 ||
    result.recordHeadings !== 1 ||
    result.recordKind !== 1 ||
    result.recordOverflow > 1 ||
    result.recordUrl !== `${WEB}/candidates?candidate=${CANDIDATE_ID}` ||
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
  throw new Error(`Issue #224 Candidates Chrome evidence failed in ${failures.length} scenario(s)`);
}

console.log(`Issue #224 Candidates Chrome evidence passed (${results.length} scenarios).`);

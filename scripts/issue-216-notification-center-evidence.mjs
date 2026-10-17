#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const WEB = process.env.ISSUE_216_WEB_URL ?? 'http://127.0.0.1:5173';
const OUTPUT = path.join(ROOT, 'docs', 'audit', 'issue-216-notification-center');
const CHROME =
  process.env.ISSUE_216_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const COUNTS = [0, 1, 20, 100];
const LOCALES = ['en', 'fr'];
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 900 },
  { name: 'mobile', width: 390, height: 844, hasTouch: true, isMobile: true },
];

function envValue(name) {
  const entry = readFileSync(path.join(ROOT, '.env'), 'utf8')
    .split(/\r?\n/u)
    .find((line) => line.startsWith(`${name}=`));
  if (!entry) throw new Error(`${name} is missing from .env`);
  return entry.slice(name.length + 1).trim();
}

const admin = {
  email: envValue('AUTH_BOOTSTRAP_ADMIN_EMAIL'),
  password: envValue('AUTH_BOOTSTRAP_ADMIN_PASSWORD'),
};

function notification(index) {
  const suffix = String(index + 1).padStart(12, '0');
  const timestamp = new Date(Date.UTC(2026, 9, 16, 12) - index * 60_000).toISOString();
  return {
    actorUserId: null,
    archivedAt: null,
    bodySummary:
      `Synthetic recording-readiness notification ${index + 1}. ` +
      'A deliberately long summary verifies wrapping without exposing personal data.',
    createdAt: timestamp,
    documentId: null,
    id: `10000000-0000-4000-8000-${suffix}`,
    interviewId: null,
    missionCandidateId: null,
    readAt: null,
    recipientUserId: '20000000-0000-4000-8000-000000000001',
    recruitmentMissionId: null,
    status: 'UNREAD',
    taskId: index === 0 ? '30000000-0000-4000-8000-000000000001' : null,
    title: `Synthetic notification with a long descriptive title ${index + 1}`,
    trainingEnrollmentId: null,
    trainingSessionId: null,
    type: 'synthetic.issue-216',
    updatedAt: timestamp,
  };
}

async function installFixtures(page, count) {
  const items = Array.from({ length: count }, (_, index) => notification(index));
  await page.route('**/v1/messages/conversations**', (route) =>
    route.fulfill({ json: { conversations: [], nextCursor: null } }),
  );
  await page.route('**/v1/notifications**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST') {
      if (url.pathname.endsWith('/read-all')) {
        await route.fulfill({ json: { updatedCount: count } });
        return;
      }
      const id = url.pathname.split('/').at(-2);
      const item = items.find((candidate) => candidate.id === id) ?? items[0];
      await route.fulfill({
        json: { notification: { ...item, readAt: item.updatedAt, status: 'READ' } },
      });
      return;
    }
    const pageSize = Number(url.searchParams.get('pageSize') ?? 25);
    await route.fulfill({
      json: {
        notifications: pageSize === 1 ? items.slice(0, 1) : items,
        pageInfo: { hasNextPage: false, page: 1, pageSize, total: count },
      },
    });
  });
}

async function login(page, locale) {
  await page.addInitScript((value) => localStorage.setItem('hireme.locale', value), locale);
  await page.goto(WEB, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(admin.email);
  await page.locator('input[name="password"]').fill(admin.password);
  await page.locator('form.auth-panel button[type="submit"]').click();
  await page.locator('.app-shell').waitFor();
}

async function metrics(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.notification-center__panel');
    const body = document.querySelector('.notification-center__body');
    const panelRect = panel?.getBoundingClientRect();
    const bodyRect = body?.getBoundingClientRect();
    const actions = [...document.querySelectorAll('.notification-center__panel .ui-button')];
    const visibleActions = actions.filter((action) => {
      const value = action.getBoundingClientRect();
      return !bodyRect || (value.bottom >= bodyRect.top - 1 && value.top <= bodyRect.bottom + 1);
    });
    return {
      actionHorizontalOverflow: visibleActions.some((action) => {
        const value = action.getBoundingClientRect();
        return !panelRect || value.left < panelRect.left - 1 || value.right > panelRect.right + 1;
      }),
      body: body
        ? {
            clientHeight: body.clientHeight,
            minHeight: getComputedStyle(body).minHeight,
            overflowY: getComputedStyle(body).overflowY,
            overscrollY: getComputedStyle(body).overscrollBehaviorY,
            scrollHeight: body.scrollHeight,
            scrollTop: Math.round(body.scrollTop),
          }
        : null,
      bodyOverflow: getComputedStyle(document.body).overflow,
      documentHorizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      listCount: document.querySelector('.notification-center__list')?.children.length ?? 0,
      panel: panel
        ? {
            gridRows: getComputedStyle(panel).gridTemplateRows,
            height: Math.round(panelRect.height),
            overflow: getComputedStyle(panel).overflow,
          }
        : null,
    };
  });
}

async function openCenter(page) {
  const bell = page.locator('.notification-center__trigger');
  await bell.click();
  await page.locator('.notification-center__panel').waitFor();
  await page.waitForTimeout(100);
  return bell;
}

async function touchScroll(context, page, body) {
  const box = await body.boundingBox();
  if (!box) throw new Error('Notification body is not visible');
  const client = await context.newCDPSession(page);
  const x = box.x + box.width / 2;
  const startY = box.y + Math.min(box.height - 20, 420);
  await client.send('Input.dispatchTouchEvent', {
    touchPoints: [{ x, y: startY }],
    type: 'touchStart',
  });
  for (const distance of [50, 100, 150, 200]) {
    await client.send('Input.dispatchTouchEvent', {
      touchPoints: [{ x, y: startY - distance }],
      type: 'touchMove',
    });
  }
  await client.send('Input.dispatchTouchEvent', { touchPoints: [], type: 'touchEnd' });
  await page.waitForTimeout(180);
}

async function runScenario(browser, locale, count, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    hasTouch: viewport.hasTouch,
    isMobile: viewport.isMobile,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installFixtures(page, count);
  await login(page, locale);
  const bell = await openCenter(page);
  const body = page.locator('.notification-center__body');
  const initial = await metrics(page);
  const result = { count, errors, initial, locale, viewport: viewport.name };

  if ((count === 100 && locale === 'fr') || (count === 20 && locale === 'en')) {
    await page.screenshot({
      path: path.join(OUTPUT, `after-${locale}-${viewport.name}-${count}.png`),
    });
  }

  if (count >= 20) {
    const box = await body.boundingBox();
    if (!box) throw new Error('Notification body is not visible');
    const point = { x: box.x + box.width / 2, y: box.y + Math.min(100, box.height / 2) };

    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(100);
    result.wheel = await metrics(page);

    await body.evaluate((element) => (element.scrollTop = 0));
    for (const delta of [25, 25, 25, 25]) await page.mouse.wheel(0, delta);
    await page.waitForTimeout(100);
    result.trackpad = await metrics(page);

    await body.evaluate((element) => (element.scrollTop = 0));
    await page.locator('.notification-center__list .ui-button').first().focus();
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(100);
    result.pageDown = await metrics(page);
    result.keyboardFocusStayedInside = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('.notification-center__panel')),
    );

    if (viewport.hasTouch) {
      await body.evaluate((element) => (element.scrollTop = 0));
      await touchScroll(context, page, body);
      result.touch = await metrics(page);
    }
  }

  await page.locator('.notification-center__panel').press('Escape');
  await page.waitForTimeout(50);
  result.escapeRestoredFocus = await bell.evaluate((element) => element === document.activeElement);
  result.bodyOverflowAfterClose = await page.evaluate(
    () => getComputedStyle(document.body).overflow,
  );
  await context.close();
  return result;
}

async function baselineEvidence(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    hasTouch: viewport.hasTouch,
    isMobile: viewport.isMobile,
  });
  const page = await context.newPage();
  await installFixtures(page, 20);
  await login(page, 'fr');
  await openCenter(page);
  await page.addStyleTag({
    content: `
      .notification-center__panel {
        grid-template-rows: none !important;
        overflow: hidden !important;
      }
      .notification-center__body { min-height: 8rem !important; }
      .notification-center__header > div { min-width: auto !important; }
      .notification-center__header > .ui-button,
      .notification-center__list li > .ui-button {
        max-width: none !important;
        white-space: nowrap !important;
      }
    `,
  });
  const before = await metrics(page);
  const body = page.locator('.notification-center__body');
  const box = await body.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(100);
  const afterWheel = await metrics(page);
  await page.screenshot({ path: path.join(OUTPUT, `before-fr-${viewport.name}-20.png`) });
  await context.close();
  return { afterWheel, before };
}

await mkdir(OUTPUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  const baseline = {};
  for (const viewport of [VIEWPORTS[0], VIEWPORTS[2]]) {
    baseline[viewport.name] = await baselineEvidence(browser, viewport);
  }

  const matrix = [];
  for (const locale of LOCALES) {
    for (const viewport of VIEWPORTS) {
      for (const count of COUNTS) {
        matrix.push(await runScenario(browser, locale, count, viewport));
      }
    }
  }
  const report = { baseline, generatedAt: new Date().toISOString(), matrix };
  await writeFile(path.join(OUTPUT, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}

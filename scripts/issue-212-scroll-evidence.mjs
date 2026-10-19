#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const WEB = process.env.ISSUE_212_WEB_URL ?? 'http://127.0.0.1:5173';
const OUTPUT = path.join(ROOT, 'docs', 'audit', 'issue-212-scroll');
const CHROME =
  process.env.ISSUE_212_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROUTES = ['clients', 'candidates', 'missions', 'documents', 'admin'];
const FIXTURE_ROW = {
  candidates: 'Issue 212 Scroll Candidate 30',
  clients: 'Issue 212 scroll client 30',
  missions: 'Issue 212 scroll mission 30',
};

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

async function login(page) {
  await page.addInitScript(() => window.localStorage.setItem('hireme.locale', 'en'));
  await page.goto(`${WEB}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(admin.email);
  await page.locator('input[name="password"]').fill(admin.password);
  await page.locator('form.auth-panel button[type="submit"]').click();
  await page.locator('.app-shell').waitFor({ state: 'visible' });
}

async function openMissionFixture(page) {
  await page.goto(`${WEB}/missions`, { waitUntil: 'domcontentloaded' });
  const search = page.getByRole('searchbox', { name: 'Search' });
  await search.waitFor();
  await search.fill('Issue118 Evidence Mission');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await page.getByRole('button', { name: 'Issue118 Evidence Mission', exact: true }).click();
  await page.getByRole('button', { name: 'Open full record' }).click();
  await page.getByRole('tab', { name: 'Pipeline' }).click();
  await page.getByRole('button', { name: 'Issue118 Primary Candidate', exact: true }).click();
  await page.locator('.mission-pipeline-workspace__detail').waitFor();
}

async function readScrollState(page) {
  return page.evaluate(() => {
    const detail = document.querySelector('.mission-pipeline-workspace__detail');
    const pane = document.querySelector('.ui-workspace__pane-body');
    const shellMain = document.querySelector('.app-shell__main');
    const metric = (element) =>
      element
        ? {
            clientHeight: element.clientHeight,
            overflowY: getComputedStyle(element).overflowY,
            overscrollY: getComputedStyle(element).overscrollBehaviorY,
            scrollHeight: element.scrollHeight,
            scrollTop: Math.round(element.scrollTop),
          }
        : null;
    return {
      bodyOverflow: getComputedStyle(document.body).overflow,
      detail: metric(detail),
      document: metric(document.scrollingElement),
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      pane: metric(pane),
      shellMain: metric(shellMain),
    };
  });
}

async function resetNestedBoundary(page) {
  await page.evaluate(() => {
    const detail = document.querySelector('.mission-pipeline-workspace__detail');
    document.scrollingElement.scrollTop = 0;
    detail.scrollTop = detail.scrollHeight;
  });
  const detail = page.locator('.mission-pipeline-workspace__detail');
  const box = await detail.boundingBox();
  if (!box) throw new Error('Mission detail is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 300));
}

async function wheelScenario(page, label, deltas) {
  await resetNestedBoundary(page);
  const before = await readScrollState(page);
  for (const delta of deltas) await page.mouse.wheel(0, delta);
  await page.waitForTimeout(150);
  const after = await readScrollState(page);
  await page.screenshot({ path: path.join(OUTPUT, `${label}.png`) });
  return {
    before,
    after,
    handedOff: after.document.scrollTop > before.document.scrollTop,
  };
}

async function touchScroll(page, context) {
  await page.goto(`${WEB}/missions`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Missions' }).waitFor();
  await page.evaluate(() => {
    document.scrollingElement.scrollTop = 0;
  });
  const before = await readScrollState(page);
  const client = await context.newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 320, y: 720 }],
  });
  for (const y of [620, 520, 420, 320, 220]) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 320, y }],
    });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250);
  const after = await readScrollState(page);
  return { before, after, moved: after.document.scrollTop > before.document.scrollTop };
}

async function workspaceMatrix(browser, viewport, mobile) {
  const context = await browser.newContext({ hasTouch: mobile, isMobile: mobile, viewport });
  const page = await context.newPage();
  await login(page);
  const results = {};
  for (const route of ROUTES) {
    await page.goto(`${WEB}/${route}`, { waitUntil: 'domcontentloaded' });
    await page.locator('main').waitFor();
    if (FIXTURE_ROW[route]) {
      await page.getByRole('button', { name: FIXTURE_ROW[route], exact: true }).waitFor();
    } else {
      await page.waitForTimeout(900);
    }
    const before = await readScrollState(page);
    const paneTarget = await page.evaluate(() => {
      const pane = [...document.querySelectorAll('.ui-workspace__pane-body')].find((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && element.scrollHeight > element.clientHeight;
      });
      if (!pane) return null;
      const rect = pane.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + Math.min(rect.height / 2, 300) };
    });
    if (paneTarget) await page.mouse.move(paneTarget.x, paneTarget.y);
    else await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(100);
    const after = await readScrollState(page);
    results[route] = {
      bodyUnlocked: after.bodyOverflow !== 'hidden',
      horizontalOverflow: after.horizontalOverflow,
      loaded: true,
      owner: paneTarget ? 'workspace-pane' : 'document',
      scrollable:
        before.document.scrollHeight > before.document.clientHeight ||
        (before.pane?.scrollHeight ?? 0) > (before.pane?.clientHeight ?? 0),
      wheelMoved:
        after.document.scrollTop > before.document.scrollTop ||
        (after.pane?.scrollTop ?? 0) > (before.pane?.scrollTop ?? 0),
    };
  }
  if (mobile) results.missionsTouch = await touchScroll(page, context);
  await context.close();
  return results;
}

await mkdir(OUTPUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  await login(page);
  await openMissionFixture(page);

  await page.addStyleTag({
    content:
      ".mission-pipeline-workspace__detail,.app-shell[data-layout='fill'] .ui-workspace__pane-body{overscroll-behavior:contain!important}",
  });
  const before = await wheelScenario(page, 'before-missions-wheel-trap', [700, 700]);

  await page
    .locator('style')
    .last()
    .evaluate((node) => node.remove());
  const wheel = await wheelScenario(page, 'after-missions-wheel-handoff', [700, 700]);
  const trackpad = await wheelScenario(page, 'after-missions-trackpad-handoff', [35, 35, 35, 35]);

  await page.evaluate(() => {
    document.scrollingElement.scrollTop = 0;
    document.querySelector('main').focus();
  });
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(150);
  const keyboard = {
    pageTop: await page.evaluate(() => Math.round(document.scrollingElement.scrollTop)),
  };
  keyboard.moved = keyboard.pageTop > 0;
  await desktop.close();

  const report = {
    generatedAt: new Date().toISOString(),
    baseline: {
      note: 'The exact pre-fix contain declaration was reapplied in-page to record the original behavior.',
      wheel: before,
    },
    fixed: { keyboard, trackpad, wheel },
    matrix: {
      desktop: await workspaceMatrix(browser, { width: 1440, height: 900 }, false),
      mobile: await workspaceMatrix(browser, { width: 390, height: 844 }, true),
    },
  };
  await writeFile(path.join(OUTPUT, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}

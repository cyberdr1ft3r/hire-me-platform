#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const WEB = process.env.ISSUE_214_WEB_URL ?? 'http://127.0.0.1:5173';
const OUTPUT = path.join(ROOT, 'docs', 'audit', 'issue-214-scroll');
const CHROME =
  process.env.ISSUE_214_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const THREAD_NAME = 'Issue 214 Scroll Colleague';

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

async function openMessages(page) {
  await page.goto(`${WEB}/messages`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Messages' }).waitFor();
  await page.locator('.messages-row').first().waitFor();
}

async function selectThread(page) {
  await page
    .locator('.messages-row')
    .filter({ has: page.getByText(THREAD_NAME, { exact: true }) })
    .click();
  await page.locator('.messages-log').waitFor();
  await page.waitForTimeout(250);
}

async function metrics(page) {
  return page.evaluate(() => {
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
      detailPane: metric(document.querySelector('.messages-detail .ui-workspace__pane-body')),
      document: metric(document.scrollingElement),
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      listPane: metric(document.querySelector('.messages-list .ui-workspace__pane-body')),
      log: metric(document.querySelector('.messages-log')),
      shellMain: metric(document.querySelector('.app-shell__main')),
    };
  });
}

async function pointAt(page, selector, yOffset = 80) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} is not visible`);
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(yOffset, box.height / 2));
  return box;
}

async function resetThreadBoundary(page) {
  await page.evaluate(() => {
    document.scrollingElement.scrollTop = 0;
    const log = document.querySelector('.messages-log');
    log.scrollTop = log.scrollHeight;
  });
  await pointAt(page, '.messages-log');
}

async function boundaryScenario(page, label, deltas) {
  await resetThreadBoundary(page);
  const before = await metrics(page);
  for (const delta of deltas) await page.mouse.wheel(0, delta);
  await page.waitForTimeout(180);
  const after = await metrics(page);
  await page.screenshot({ path: path.join(OUTPUT, `${label}.png`), fullPage: true });
  return {
    after,
    before,
    handedOff: after.document.scrollTop > before.document.scrollTop,
    threadStayedAtBoundary: after.log.scrollTop === before.log.scrollTop,
  };
}

async function desktopInteractions(browser) {
  // A short desktop viewport exercises both the document-flow fallback and the
  // log's independent max-height scroll range.
  const context = await browser.newContext({ viewport: { width: 1440, height: 440 } });
  const page = await context.newPage();
  await login(page);
  await openMessages(page);

  const listBefore = await metrics(page);
  await pointAt(page, '.messages-list .ui-workspace__pane-body', 140);
  await page.mouse.wheel(0, 320);
  await page.waitForTimeout(150);
  const listAfter = await metrics(page);

  const longThreadRow = page
    .locator('.messages-row')
    .filter({ has: page.getByText(THREAD_NAME, { exact: true }) });
  await longThreadRow.focus();
  await page.keyboard.press('Enter');
  await page.locator('.messages-log').waitFor();
  const keyboardConversationOpen = await page.locator('.messages-log').isVisible();

  await page.evaluate(() => {
    const log = document.querySelector('.messages-log');
    log.scrollTop = 0;
    log.focus();
  });
  const pageDownBefore = await metrics(page);
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(150);
  const pageDownAfter = await metrics(page);

  await page.evaluate(() => {
    const log = document.querySelector('.messages-log');
    log.scrollTop = 0;
  });
  await pointAt(page, '.messages-log');
  const threadBefore = await metrics(page);
  await page.mouse.wheel(0, 360);
  await page.waitForTimeout(150);
  const threadAfter = await metrics(page);
  await context.close();

  return {
    keyboard: {
      conversationOpenedWithEnter: keyboardConversationOpen,
      pageDownMovedThread: pageDownAfter.log.scrollTop > pageDownBefore.log.scrollTop,
      pageDownAfter,
      pageDownBefore,
    },
    list: {
      after: listAfter,
      before: listBefore,
      hasScrollRange: listBefore.listPane.scrollHeight > listBefore.listPane.clientHeight,
      outerScrollMoved: listAfter.document.scrollTop > listBefore.document.scrollTop,
      ownScrollMoved: listAfter.listPane.scrollTop > listBefore.listPane.scrollTop,
      scrollHandled:
        listAfter.listPane.scrollTop > listBefore.listPane.scrollTop ||
        listAfter.document.scrollTop > listBefore.document.scrollTop,
    },
    thread: {
      after: threadAfter,
      before: threadBefore,
      wheelMoved: threadAfter.log.scrollTop > threadBefore.log.scrollTop,
    },
  };
}

async function surroundingTargets(page) {
  const result = {};
  for (const [name, selector] of [
    ['composer', '.messages-conversation__composer'],
    ['header', '.messages-pane__header'],
  ]) {
    await page.evaluate(() => {
      document.scrollingElement.scrollTop = 0;
    });
    await pointAt(page, selector, 28);
    const before = await metrics(page);
    await page.mouse.wheel(0, 350);
    await page.waitForTimeout(120);
    const after = await metrics(page);
    result[name] = {
      after,
      before,
      documentMoved: after.document.scrollTop > before.document.scrollTop,
    };
  }
  return result;
}

async function mobileTouch(browser) {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await login(page);
  await openMessages(page);
  await selectThread(page);
  await page.evaluate(() => {
    const log = document.querySelector('.messages-log');
    log.scrollTop = 0;
  });
  const box = await page.locator('.messages-log').boundingBox();
  if (!box) throw new Error('Mobile message log is not visible');
  const x = box.x + box.width / 2;
  const startY = box.y + Math.min(box.height - 20, 420);
  const client = await context.newCDPSession(page);
  const before = await metrics(page);
  await client.send('Input.dispatchTouchEvent', {
    touchPoints: [{ x, y: startY }],
    type: 'touchStart',
  });
  for (const distance of [70, 140, 210, 280]) {
    await client.send('Input.dispatchTouchEvent', {
      touchPoints: [{ x, y: startY - distance }],
      type: 'touchMove',
    });
  }
  await client.send('Input.dispatchTouchEvent', { touchPoints: [], type: 'touchEnd' });
  await page.waitForTimeout(220);
  const after = await metrics(page);
  await page.screenshot({ path: path.join(OUTPUT, 'after-messages-mobile-touch.png') });
  await context.close();
  return {
    after,
    before,
    horizontalOverflow: after.horizontalOverflow,
    movedScrollableRegion:
      after.log.scrollTop > before.log.scrollTop ||
      after.shellMain.scrollTop > before.shellMain.scrollTop,
    note:
      after.log.scrollHeight > after.log.clientHeight
        ? 'The message log owns the mobile scroll range.'
        : 'The document-flow mobile layout hands touch scrolling to the shell.',
  };
}

async function fixedBoundaryEvidence(browser, label, deltas) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 440 } });
  const page = await context.newPage();
  await login(page);
  await openMessages(page);
  await selectThread(page);
  const result = await boundaryScenario(page, label, deltas);
  await context.close();
  return result;
}

await mkdir(OUTPUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 440 } });
  const page = await context.newPage();
  await login(page);
  await openMessages(page);
  await selectThread(page);

  await page.addStyleTag({ content: '.messages-log{overscroll-behavior:contain!important}' });
  const baseline = await boundaryScenario(page, 'before-messages-wheel-trap', [700]);
  await context.close();

  // Use fresh pointer sessions after the contained baseline so Chrome does not
  // retain the previous gesture's scroll latch when comparing the fixed rule.
  const wheel = await fixedBoundaryEvidence(browser, 'after-messages-wheel-handoff', [700, 700]);
  const trackpad = await fixedBoundaryEvidence(
    browser,
    'after-messages-trackpad-handoff',
    [35, 35, 35, 35],
  );
  const surroundingsContext = await browser.newContext({ viewport: { width: 1440, height: 440 } });
  const surroundingsPage = await surroundingsContext.newPage();
  await login(surroundingsPage);
  await openMessages(surroundingsPage);
  await selectThread(surroundingsPage);
  const surroundings = await surroundingTargets(surroundingsPage);
  await surroundingsContext.close();

  const report = {
    baseline: {
      note: 'The exact pre-fix contain declaration was reapplied in-page to record the original behavior.',
      wheel: baseline,
    },
    fixed: {
      desktop: await desktopInteractions(browser),
      mobile: await mobileTouch(browser),
      surroundings,
      trackpad,
      wheel,
    },
    generatedAt: new Date().toISOString(),
  };
  await writeFile(path.join(OUTPUT, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}

#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const WEB = process.env.ISSUE_221_WEB_URL ?? 'http://127.0.0.1:4173';
const CHROME =
  process.env.ISSUE_221_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUTPUT = path.join(ROOT, 'docs', 'audit', 'issue-221-messages');
const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const PEER_ID = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1';
const VIEWPORTS = [
  { height: 900, name: 'desktop', width: 1440 },
  { height: 1024, name: 'tablet', width: 768 },
  { hasTouch: true, height: 844, isMobile: true, name: 'mobile', width: 390 },
];
const LOCALES = ['en', 'fr'];

const copy = {
  en: {
    back: 'Back to conversations',
    log: 'Message history',
    newMessage: 'New message',
  },
  fr: {
    back: 'Retour aux conversations',
    log: 'Historique des messages',
    newMessage: 'Nouveau message',
  },
};

const auth = {
  accessToken: 'issue-221-browser-token',
  accessTokenExpiresAt: '2099-10-19T12:05:00.000Z',
  user: {
    displayName: 'Messages Reviewer',
    email: 'issue-221@example.test',
    id: ACTOR_ID,
    permissions: ['messages:view', 'messages:create'],
  },
};

const actor = { displayName: auth.user.displayName, id: ACTOR_ID, inactive: false };
const peer = { displayName: 'Synthetic Colleague', id: PEER_ID, inactive: false };
const messages = Array.from({ length: 48 }, (_, index) => {
  const sequence = index + 1;
  const own = sequence % 3 === 0;
  return {
    author: own ? actor : peer,
    body: `Synthetic message ${sequence}: page-system regression evidence with a long thread.`,
    clientMessageId: null,
    conversationId: CONVERSATION_ID,
    createdAt: `2026-10-19T${String(8 + Math.floor(index / 6)).padStart(2, '0')}:${String(
      (index % 6) * 10,
    ).padStart(2, '0')}:00.000Z`,
    editCount: 0,
    editedAt: null,
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    sequence,
    status: 'ACTIVE',
    withdrawn: false,
    withdrawnAt: null,
  };
});

let lastReadSequence = 2;

function summary() {
  return {
    activeMemberCount: 2,
    counterpart: { ...peer, email: 'synthetic-colleague@example.test' },
    createdAt: '2026-10-01T08:00:00.000Z',
    id: CONVERSATION_ID,
    lastMessageAt: messages.at(-1).createdAt,
    lastMessageSequence: messages.at(-1).sequence,
    lastReadSequence,
    myRole: 'MEMBER',
    status: 'ACTIVE',
    title: null,
    type: 'PRIVATE',
    unreadCount: Math.max(0, messages.at(-1).sequence - lastReadSequence),
  };
}

function detail() {
  return {
    ...summary(),
    historyAfterSequence: 0,
    members: [
      {
        joinedAt: '2026-10-01T08:00:00.000Z',
        role: 'MEMBER',
        user: { ...actor, email: auth.user.email },
      },
      {
        joinedAt: '2026-10-01T08:00:00.000Z',
        role: 'MEMBER',
        user: { ...peer, email: 'synthetic-colleague@example.test' },
      },
    ],
  };
}

async function installApiFixtures(page) {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.port !== '3000') {
      await route.continue();
      return;
    }
    if (url.pathname.endsWith('/health')) {
      await route.fulfill({ json: { service: 'hire-me-api', status: 'ok' } });
      return;
    }
    if (url.pathname.endsWith('/auth/login')) {
      await route.fulfill({ json: auth });
      return;
    }
    if (url.pathname.endsWith('/auth/refresh')) {
      await route.fulfill({ json: {}, status: 401 });
      return;
    }
    if (url.pathname === '/v1/messages/unread-summary') {
      await route.fulfill({ json: { unreadConversationCount: lastReadSequence < 48 ? 1 : 0 } });
      return;
    }
    if (url.pathname === '/v1/messages/conversations' && request.method() === 'GET') {
      await route.fulfill({ json: { conversations: [summary()], nextCursor: null } });
      return;
    }
    if (url.pathname === `/v1/messages/conversations/${CONVERSATION_ID}`) {
      await route.fulfill({ json: { conversation: detail() } });
      return;
    }
    if (url.pathname === `/v1/messages/conversations/${CONVERSATION_ID}/messages`) {
      const after = url.searchParams.get('after');
      const before = url.searchParams.get('before');
      const selected = messages.filter(
        (message) =>
          (after === null || message.sequence > Number(after)) &&
          (before === null || message.sequence < Number(before)),
      );
      await route.fulfill({ json: { hasMore: false, messages: selected.slice(-50) } });
      return;
    }
    if (
      url.pathname === `/v1/messages/conversations/${CONVERSATION_ID}/read` &&
      request.method() === 'POST'
    ) {
      lastReadSequence = 48;
      await route.fulfill({ json: { lastReadSequence, unreadCount: 0 } });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

async function signIn(page, locale) {
  await page.addInitScript((value) => localStorage.setItem('hireme.locale', value), locale);
  await page.goto(`${WEB}/messages`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(auth.user.email);
  await page.locator('input[name="password"]').fill('Synthetic-password-123!');
  await page.locator('form.auth-panel button[type="submit"]').click();
  await page.locator('[data-page-kind="directory"][data-page-layout="fill"]').waitFor();
}

async function scrollMetrics(page) {
  return page.evaluate(() => {
    const metric = (element) => ({
      clientHeight: element?.clientHeight ?? 0,
      overflowY: element ? getComputedStyle(element).overflowY : null,
      overscrollY: element ? getComputedStyle(element).overscrollBehaviorY : null,
      scrollHeight: element?.scrollHeight ?? 0,
      scrollTop: Math.round(element?.scrollTop ?? 0),
    });
    return {
      content: metric(document.querySelector('.ui-page-shell__content')),
      detailPane: metric(document.querySelector('.messages-detail .ui-workspace__pane-body')),
      document: metric(document.scrollingElement),
      horizontalOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      layout: metric(document.querySelector('.ui-workspace__layout')),
      log: metric(document.querySelector('.messages-log')),
      main: metric(document.querySelector('.app-shell__main')),
      page: metric(document.querySelector('.messages-panel')),
      workspace: metric(document.querySelector('.messages-workspace')),
    };
  });
}

async function touchScroll(page, selector) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} is not visible`);
  const session = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const startY = box.y + Math.min(box.height - 16, 360);
  await session.send('Input.dispatchTouchEvent', {
    touchPoints: [{ x, y: startY }],
    type: 'touchStart',
  });
  for (const distance of [60, 120, 180, 240]) {
    await session.send('Input.dispatchTouchEvent', {
      touchPoints: [{ x, y: startY - distance }],
      type: 'touchMove',
    });
  }
  await session.send('Input.dispatchTouchEvent', { touchPoints: [], type: 'touchEnd' });
  await page.waitForTimeout(220);
  await session.detach();
}

async function openThread(page, locale, useKeyboard) {
  const row = page.locator('.messages-row').first();
  await row.waitFor();
  const unreadBefore = await row.getAttribute('data-unread');
  if (useKeyboard) {
    await row.focus();
    await page.keyboard.press('Enter');
  } else {
    await row.click();
  }
  const log = page.getByRole('log', { name: copy[locale].log });
  await log.waitFor();
  return { log, row, unreadBefore };
}

async function boundaryHandoff(browser, locale) {
  const context = await browser.newContext({ viewport: { height: 440, width: 1440 } });
  const page = await context.newPage();
  await installApiFixtures(page);
  await signIn(page, locale);
  const { log } = await openThread(page, locale, false);
  await log.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const box = await log.boundingBox();
  if (!box) throw new Error('Message log is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const before = await scrollMetrics(page);
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(180);
  const after = await scrollMetrics(page);
  await context.close();
  return {
    after,
    before,
    handedOff:
      Math.max(after.main.scrollTop, after.document.scrollTop) >
      Math.max(before.main.scrollTop, before.document.scrollTop),
    threadStayedAtBoundary: after.log.scrollTop === before.log.scrollTop,
  };
}

await mkdir(OUTPUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const results = [];

try {
  for (const viewport of VIEWPORTS) {
    for (const locale of LOCALES) {
      lastReadSequence = 2;
      const context = await browser.newContext({
        hasTouch: viewport.hasTouch,
        isMobile: viewport.isMobile,
        viewport: { height: viewport.height, width: viewport.width },
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(String(error)));
      await installApiFixtures(page);
      await signIn(page, locale);

      const directoryShot = `${viewport.name}-${locale}-directory.png`;
      await page.screenshot({ path: path.join(OUTPUT, directoryShot), fullPage: true });
      const h1Count = await page.locator('#main-content h1').count();
      const pageKindCount = await page.locator('[data-page-kind="directory"]').count();
      const actionsCount = await page.locator('.ui-contextual-actions').count();
      const directoryOverflow = (await scrollMetrics(page)).horizontalOverflow;

      const { log, row, unreadBefore } = await openThread(page, locale, !viewport.hasTouch);
      const threadShot = `${viewport.name}-${locale}-thread.png`;
      await page.screenshot({ path: path.join(OUTPUT, threadShot), fullPage: true });

      await log.evaluate((element) => {
        element.scrollTop = 0;
        element.focus();
      });
      await log.hover();
      const wheelBefore = await scrollMetrics(page);
      await page.mouse.wheel(0, 420);
      await page.waitForTimeout(180);
      const wheelAfter = await scrollMetrics(page);

      await log.evaluate((element) => {
        element.scrollTop = 0;
      });
      await log.hover();
      const trackpadBefore = await scrollMetrics(page);
      for (let index = 0; index < 6; index += 1) {
        await page.mouse.wheel(0, 35);
        await page.waitForTimeout(30);
      }
      const trackpadAfter = await scrollMetrics(page);

      await log.evaluate((element) => {
        element.scrollTop = 0;
        element.focus();
      });
      const pageDownBefore = await scrollMetrics(page);
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(180);
      const pageDownAfter = await scrollMetrics(page);

      let touchMoved = null;
      if (viewport.hasTouch) {
        await log.evaluate((element) => {
          element.scrollTop = 0;
        });
        const touchBefore = await scrollMetrics(page);
        await touchScroll(page, '.messages-log');
        const touchAfter = await scrollMetrics(page);
        touchMoved = touchAfter.log.scrollTop > touchBefore.log.scrollTop;
      }

      const composer = page.getByRole('textbox', { name: 'Message' });
      await composer.fill('Unsaved synthetic browser-check draft');
      const composerPreserved =
        (await composer.inputValue()) === 'Unsaved synthetic browser-check draft';

      let focusReturned = null;
      if (viewport.width < 768) {
        await page.getByRole('button', { name: copy[locale].back }).click();
        focusReturned = await row.evaluate((element) => document.activeElement === element);
      }

      await page.evaluate((conversationId) => {
        history.pushState(null, '', `/messages?conversation=${conversationId}`);
        dispatchEvent(new PopStateEvent('popstate'));
      }, CONVERSATION_ID);
      await page.getByRole('log', { name: copy[locale].log }).waitFor();
      const deepLinkOpened = page.url().endsWith(`/messages?conversation=${CONVERSATION_ID}`);
      await page.goBack();
      await page.waitForURL((url) => url.pathname === '/messages' && url.search === '');
      const backReturnedToInbox = page.url().endsWith('/messages');
      await page.goForward();
      await page.getByRole('log', { name: copy[locale].log }).waitFor();
      const forwardReopened = page.url().endsWith(`/messages?conversation=${CONVERSATION_ID}`);

      results.push({
        actionsCount,
        backReturnedToInbox,
        composerPreserved,
        deepLinkOpened,
        directoryOverflow,
        focusReturned,
        forwardReopened,
        h1Count,
        locale,
        pageErrors,
        pageKindCount,
        pageDownMoved: pageDownAfter.log.scrollTop > pageDownBefore.log.scrollTop,
        screenshots: [directoryShot, threadShot],
        threadHasIndependentRange: wheelBefore.log.scrollHeight > wheelBefore.log.clientHeight,
        threadOverscroll: wheelBefore.log.overscrollY,
        trackpadMovedThread: trackpadAfter.log.scrollTop > trackpadBefore.log.scrollTop,
        touchMoved,
        unreadBefore,
        viewport: viewport.name,
        wheelMovedThread: wheelAfter.log.scrollTop > wheelBefore.log.scrollTop,
      });
      await context.close();
    }
  }

  const boundaries = {};
  for (const locale of LOCALES) boundaries[locale] = await boundaryHandoff(browser, locale);
  const failures = results.filter(
    (result) =>
      result.h1Count !== 1 ||
      result.pageKindCount !== 1 ||
      result.actionsCount !== 1 ||
      result.directoryOverflow > 1 ||
      result.unreadBefore !== 'true' ||
      !result.threadHasIndependentRange ||
      result.threadOverscroll !== 'auto' ||
      !result.wheelMovedThread ||
      !result.trackpadMovedThread ||
      !result.pageDownMoved ||
      !result.composerPreserved ||
      !result.deepLinkOpened ||
      !result.backReturnedToInbox ||
      !result.forwardReopened ||
      (result.viewport === 'mobile' && (!result.touchMoved || !result.focusReturned)) ||
      result.pageErrors.length > 0,
  );
  const boundaryFailures = Object.values(boundaries).filter(
    (result) => !result.handedOff || !result.threadStayedAtBoundary,
  );
  const report = {
    boundaries,
    browser: 'Google Chrome',
    chromeExecutable: CHROME,
    fixtureMode: 'contract-shaped synthetic API responses',
    generatedAt: new Date().toISOString(),
    passed: failures.length === 0 && boundaryFailures.length === 0,
    results,
  };
  await writeFile(path.join(OUTPUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) {
    throw new Error(
      `Issue #221 Chrome evidence failed: ${failures.length} scenario(s), ${boundaryFailures.length} boundary case(s)`,
    );
  }
  console.log(`Issue #221 Chrome evidence passed (${results.length} scenarios).`);
} finally {
  await browser.close();
}

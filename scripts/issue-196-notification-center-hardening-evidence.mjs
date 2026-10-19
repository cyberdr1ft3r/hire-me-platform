#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const WEB = process.env.ISSUE_196_WEB_URL ?? 'http://127.0.0.1:5173';
const OUTPUT = path.join(ROOT, 'docs', 'audit', 'issue-196-notification-center-hardening');
const CHROME =
  process.env.ISSUE_196_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';
const NOTIFICATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const VIEWPORTS = [
  { height: 900, name: 'desktop', width: 1440 },
  { height: 900, name: 'tablet', width: 768 },
  { hasTouch: true, height: 844, isMobile: true, name: 'mobile', width: 390 },
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

const notification = {
  actorUserId: null,
  archivedAt: null,
  bodySummary: 'Synthetic notification used only for Issue #196 browser verification.',
  createdAt: '2026-10-19T12:00:00.000Z',
  documentId: null,
  id: NOTIFICATION_ID,
  interviewId: null,
  missionCandidateId: null,
  readAt: null,
  recipientUserId: USER_ID,
  recruitmentMissionId: null,
  status: 'UNREAD',
  taskId: null,
  title: 'Synthetic notification',
  trainingEnrollmentId: null,
  trainingSessionId: null,
  type: 'synthetic.issue-196',
  updatedAt: '2026-10-19T12:00:00.000Z',
};

const conversation = {
  activeMemberCount: 2,
  counterpart: {
    displayName: 'Synthetic Colleague',
    email: 'colleague@example.test',
    id: USER_ID,
    inactive: false,
  },
  createdAt: '2026-10-19T11:00:00.000Z',
  id: CONVERSATION_ID,
  lastMessageAt: '2026-10-19T12:30:00.000Z',
  lastMessageSequence: 4,
  lastReadSequence: 2,
  myRole: 'MEMBER',
  status: 'ACTIVE',
  title: null,
  type: 'PRIVATE',
  unreadCount: 2,
};

async function installFixtures(page) {
  const calls = [];
  let notificationRead = false;
  await page.route('**/v1/messages/**', async (route) => {
    calls.push(`${route.request().method()} ${route.request().url()}`);
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/unread-summary')) {
      await route.fulfill({ json: { unreadConversationCount: 1 } });
      return;
    }
    if (url.pathname.endsWith(`/conversations/${CONVERSATION_ID}/messages`)) {
      await route.fulfill({ json: { hasMore: false, messages: [] } });
      return;
    }
    if (url.pathname.endsWith(`/conversations/${CONVERSATION_ID}`)) {
      await route.fulfill({
        json: {
          conversation: {
            ...conversation,
            historyAfterSequence: 0,
            members: [
              {
                joinedAt: conversation.createdAt,
                role: 'MEMBER',
                user: conversation.counterpart,
              },
            ],
          },
        },
      });
      return;
    }
    if (url.pathname.endsWith('/conversations')) {
      await route.fulfill({ json: { conversations: [conversation], nextCursor: null } });
      return;
    }
    await route.continue();
  });
  await page.route('**/v1/notifications**', async (route) => {
    const request = route.request();
    calls.push(`${request.method()} ${request.url()}`);
    const url = new URL(request.url());
    const pageSize = Number(url.searchParams.get('pageSize') ?? 25);
    const items = notificationRead ? [] : [notification];
    await route.fulfill({
      json: {
        notifications: pageSize === 1 ? items.slice(0, 1) : items,
        pageInfo: {
          hasNextPage: false,
          page: 1,
          pageSize,
          total: notificationRead ? 0 : 1,
        },
      },
    });
  });
  await page.route(`**/v1/notifications/${NOTIFICATION_ID}/read`, async (route) => {
    const request = route.request();
    calls.push(`${request.method()} ${request.url()}`);
    notificationRead = true;
    await route.fulfill({
      json: {
        notification: {
          ...notification,
          readAt: '2026-10-19T13:00:00.000Z',
          status: 'READ',
          updatedAt: '2026-10-19T13:00:00.000Z',
        },
      },
    });
  });
  return calls;
}

async function login(page, locale) {
  await page.addInitScript((value) => localStorage.setItem('hireme.locale', value), locale);
  await page.goto(WEB, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(admin.email);
  await page.locator('input[name="password"]').fill(admin.password);
  await page.locator('form.auth-panel button[type="submit"]').click();
  await page.locator('.app-shell').waitFor();
}

async function runScenario(browser, locale, viewport) {
  const context = await browser.newContext({
    hasTouch: viewport.hasTouch,
    isMobile: viewport.isMobile,
    viewport: { height: viewport.height, width: viewport.width },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const calls = await installFixtures(page);
  await login(page, locale);

  const bell = page.locator('.notification-center__trigger');
  await bell.waitFor();
  await page.waitForFunction(
    () => document.querySelector('.notification-center__badge')?.textContent === '2',
  );
  await bell.click();
  const panel = page.locator('.notification-center__panel');
  await panel.waitFor();
  await page.locator('.notification-center__list li').first().waitFor();
  const initialItems = await page.locator('.notification-center__list li').count();
  const unreadFilter = page.getByRole('button', {
    exact: true,
    name: locale === 'fr' ? 'Non lues' : 'Unread',
  });
  await unreadFilter.click();
  await page
    .getByText('Synthetic notification used only for Issue #196 browser verification.')
    .waitFor();
  await page
    .getByRole('button', {
      exact: true,
      name: locale === 'fr' ? 'Marquer comme lue' : 'Mark as read',
    })
    .click();
  await page.waitForTimeout(300);
  if (
    await page
      .getByText('Synthetic notification used only for Issue #196 browser verification.')
      .isVisible()
  ) {
    const actionError = await page.locator('.notification-center__action-error').textContent();
    throw new Error(
      `Notification row remained after read. Action error: ${actionError}. Calls: ${calls.join(' | ')}`,
    );
  }
  const badgeAfterRead = (await page.locator('.notification-center__badge').textContent())?.trim();
  if (badgeAfterRead !== '1') {
    const label = await bell.getAttribute('aria-label');
    const focusState = await page.evaluate(() => ({
      activeLabel: document.activeElement?.getAttribute('aria-label'),
      activeText: document.activeElement?.textContent,
      panelPresent: Boolean(document.querySelector('.notification-center__panel')),
    }));
    throw new Error(
      `Expected one unread conversation after Notification read; received ${badgeAfterRead} (${label}). Focus: ${JSON.stringify(focusState)}. Calls: ${calls.join(' | ')}`,
    );
  }
  const messageLink = page.getByRole('link', { name: /Synthetic Colleague/u });
  const href = await messageLink.getAttribute('href');
  const afterItems = await page.locator('.notification-center__list li').count();
  const documentHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  await page.screenshot({
    path: path.join(OUTPUT, `${locale}-${viewport.name}.png`),
  });
  await messageLink.click();
  await page.waitForURL(`**/messages?conversation=${CONVERSATION_ID}`);
  const exactNavigation = new URL(page.url()).searchParams.get('conversation') === CONVERSATION_ID;

  await bell.click();
  await panel.waitFor();
  await panel.press('Escape');
  await page.waitForTimeout(50);
  const escapeRestoredFocus = await bell.evaluate((element) => element === document.activeElement);
  const result = {
    afterItems,
    badgeAfterRead,
    documentHorizontalOverflow,
    errors,
    escapeRestoredFocus,
    exactNavigation,
    href,
    initialItems,
    locale,
    viewport: viewport.name,
  };
  await context.close();
  return result;
}

await mkdir(OUTPUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  const scenarios = [];
  for (const locale of ['en', 'fr']) {
    for (const viewport of VIEWPORTS) {
      scenarios.push(await runScenario(browser, locale, viewport));
    }
  }
  const report = { generatedAt: new Date().toISOString(), scenarios };
  await writeFile(path.join(OUTPUT, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}

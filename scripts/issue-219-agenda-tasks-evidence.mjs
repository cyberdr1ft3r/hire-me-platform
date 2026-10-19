#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const WEB = process.env.ISSUE_219_WEB_URL ?? 'http://127.0.0.1:5173';
const CHROME =
  process.env.ISSUE_219_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUTPUT = path.join(ROOT, 'docs', 'audit', 'issue-219-agenda-tasks');
const TASK_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VIEWPORTS = [
  { height: 900, name: 'desktop', width: 1440 },
  { height: 1024, name: 'tablet', width: 768 },
  { hasTouch: true, height: 844, isMobile: true, name: 'mobile', width: 390 },
];
const LOCALES = ['en', 'fr'];

const copy = {
  en: { agenda: 'My Agenda', closeTask: 'Close task detail', tasks: 'Task pipeline' },
  fr: {
    agenda: 'Mon agenda',
    closeTask: 'Fermer le détail de la tâche',
    tasks: 'Pipeline des tâches',
  },
};

const auth = {
  accessToken: 'issue-219-browser-token',
  accessTokenExpiresAt: '2099-10-19T12:05:00.000Z',
  user: {
    displayName: 'Agenda and Tasks Reviewer',
    email: 'issue-219@example.test',
    id: USER_ID,
    permissions: ['tasks:view', 'notifications:view_own'],
  },
};

function task(index) {
  const statuses = ['OPEN', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'COMPLETED'];
  return {
    archivedAt: null,
    assigneeUserIds: [USER_ID],
    canceledAt: null,
    completedAt: null,
    context: {
      candidateId: null,
      clientContactId: null,
      clientId: null,
      documentId: null,
      interviewId: null,
      missionCandidateId: null,
      missionPlacementId: null,
      missionRecruiterId: null,
      recruitmentMissionId: null,
      recruitmentOfferId: null,
      recruitmentOfferVersionId: null,
      trainingEnrollmentId: null,
      trainingProgramId: null,
      trainingSessionId: null,
      trainingSessionParticipationId: null,
    },
    createdAt: '2026-10-01T08:00:00.000Z',
    description: 'Synthetic task used only for Issue #219 browser verification.',
    dueAt: `2026-10-${String(20 + (index % 8)).padStart(2, '0')}T10:00:00.000Z`,
    id: index === 0 ? TASK_ID : `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
    ownerDisplayName: 'Agenda and Tasks Reviewer',
    ownerUserId: USER_ID,
    priority: index % 4 === 0 ? 'URGENT' : 'NORMAL',
    startAt: null,
    status: statuses[index % statuses.length],
    timezone: 'Europe/Paris',
    title: index === 0 ? 'Review candidate follow-up' : `Synthetic task ${index + 1}`,
    updatedAt: '2026-10-19T08:00:00.000Z',
  };
}

const tasks = Array.from({ length: 30 }, (_, index) => task(index));
const taskDetail = {
  ...tasks[0],
  assignments: [
    {
      archivedAt: null,
      assignedAt: '2026-10-01T08:00:00.000Z',
      id: '33333333-3333-4333-8333-333333333333',
      removedAt: null,
      status: 'ACTIVE',
      taskId: TASK_ID,
      userDisplayName: 'Agenda and Tasks Reviewer',
      userId: USER_ID,
    },
  ],
  comments: [],
  history: [],
  reminders: [],
};

const agendaItems = Array.from({ length: 30 }, (_, index) => ({
  allDay: false,
  deepLink: `/tasks?task=${index === 0 ? TASK_ID : tasks[index].id}`,
  dueAt: `2026-10-${String(20 + (index % 8)).padStart(2, '0')}T10:00:00.000Z`,
  id: `task:${tasks[index].id}`,
  overdue: index % 7 === 0,
  priority: tasks[index].priority,
  sourceId: tasks[index].id,
  sourceType: 'task',
  status: tasks[index].status,
  timezone: 'Europe/Paris',
  title: tasks[index].title,
}));

function pageInfo(page, pageSize, total) {
  return { hasNextPage: page * pageSize < total, page, pageSize, total };
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
    if (url.pathname === '/v1/agenda') {
      await route.fulfill({
        json: {
          items: agendaItems,
          window: {
            from: '2026-10-19T00:00:00.000Z',
            to: '2026-10-26T00:00:00.000Z',
            view: url.searchParams.get('view') ?? 'today',
          },
        },
      });
      return;
    }
    if (url.pathname === '/v1/notifications') {
      const pageNumber = Number(url.searchParams.get('page') ?? '1');
      const pageSize = Number(url.searchParams.get('pageSize') ?? '25');
      await route.fulfill({
        json: { notifications: [], pageInfo: pageInfo(pageNumber, pageSize, 0) },
      });
      return;
    }
    if (
      url.pathname === '/v1/tasks/user-options' ||
      url.pathname === '/v1/tasks/filter-user-options'
    ) {
      await route.fulfill({
        json: {
          users: [
            {
              displayName: auth.user.displayName,
              email: auth.user.email,
              id: auth.user.id,
            },
          ],
        },
      });
      return;
    }
    if (url.pathname === `/v1/tasks/${TASK_ID}`) {
      await route.fulfill({ json: { task: taskDetail } });
      return;
    }
    if (url.pathname === '/v1/tasks') {
      const pageNumber = Number(url.searchParams.get('page') ?? '1');
      const pageSize = Number(url.searchParams.get('pageSize') ?? '20');
      const status = url.searchParams.get('status');
      const matching = status ? tasks.filter((entry) => entry.status === status) : tasks;
      const offset = (pageNumber - 1) * pageSize;
      await route.fulfill({
        json: {
          pageInfo: pageInfo(pageNumber, pageSize, matching.length),
          tasks: matching.slice(offset, offset + pageSize),
        },
      });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

async function signIn(page, locale, route = '/agenda') {
  await page.addInitScript((value) => localStorage.setItem('hireme.locale', value), locale);
  await page.goto(`${WEB}${route}`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(auth.user.email);
  await page.locator('input[name="password"]').fill('Synthetic-password-123!');
  await page.locator('form.auth-panel button[type="submit"]').click();
  await page.locator('[data-page-kind="directory"]').waitFor({ timeout: 15_000 });
}

async function scrollMetric(page) {
  return page.evaluate(() => {
    const candidates = [document.scrollingElement, document.querySelector('main')].filter(Boolean);
    return Math.max(window.scrollY, ...candidates.map((element) => element.scrollTop));
  });
}

async function resetScroll(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.scrollingElement?.scrollTo(0, 0);
    document.querySelector('main')?.scrollTo(0, 0);
  });
  await page.waitForTimeout(80);
}

async function synthesizeTouchScroll(page) {
  const session = await page.context().newCDPSession(page);
  const viewport = page.viewportSize();
  const x = Math.floor(viewport.width / 2);
  const startY = Math.floor(viewport.height * 0.75);
  await session.send('Input.dispatchTouchEvent', {
    touchPoints: [{ x, y: startY }],
    type: 'touchStart',
  });
  for (let index = 1; index <= 6; index += 1) {
    await session.send('Input.dispatchTouchEvent', {
      touchPoints: [{ x, y: startY - index * 70 }],
      type: 'touchMove',
    });
    await page.waitForTimeout(40);
  }
  await session.send('Input.dispatchTouchEvent', { touchPoints: [], type: 'touchEnd' });
  await page.waitForTimeout(250);
  await session.detach();
}

async function verifyScrolling(page, viewport) {
  const values = {};
  await resetScroll(page);
  await page.locator('.agenda-item-row').first().hover();
  values.wheelBefore = await scrollMetric(page);
  await page.mouse.wheel(0, 520);
  await page.waitForTimeout(180);
  values.wheelAfter = await scrollMetric(page);

  await resetScroll(page);
  values.trackpadBefore = await scrollMetric(page);
  for (let index = 0; index < 6; index += 1) {
    await page.mouse.wheel(0, 80);
    await page.waitForTimeout(30);
  }
  values.trackpadAfter = await scrollMetric(page);

  await resetScroll(page);
  await page.locator('.ui-page-header').click({ position: { x: 8, y: 8 } });
  values.keyboardBefore = await scrollMetric(page);
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(180);
  values.keyboardAfter = await scrollMetric(page);

  if (viewport.hasTouch) {
    await resetScroll(page);
    values.touchBefore = await scrollMetric(page);
    await synthesizeTouchScroll(page);
    values.touchAfter = await scrollMetric(page);
  }
  return values;
}

function horizontalOverflow(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
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
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(String(error)));
      await installApiFixtures(page);
      await signIn(page, locale);

      await page.getByRole('heading', { level: 1, name: copy[locale].agenda }).waitFor();
      const agendaShot = `${viewport.name}-${locale}-agenda.png`;
      await page.screenshot({ fullPage: true, path: path.join(OUTPUT, agendaShot) });
      const agendaScroll = await verifyScrolling(page, viewport);
      const agendaOverflow = await horizontalOverflow(page);
      const agendaHeadings = await page.locator('#main-content h1').count();
      const agendaToolbar = await page.locator('.agenda-toolbar.ui-filter-toolbar').count();

      await resetScroll(page);
      await page.locator('.agenda-item-row').first().getByRole('button').click();
      await page.getByRole('dialog').waitFor();
      const deepLink = page.url();
      await page.goBack();
      await page.getByRole('heading', { level: 1, name: copy[locale].agenda }).waitFor();
      const backUrl = page.url();
      await page.goForward();
      await page.getByRole('dialog').waitFor();
      const forwardUrl = page.url();
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });

      await signIn(page, locale, '/tasks');
      await page.getByRole('heading', { level: 1, name: copy[locale].tasks }).waitFor();
      await page.locator('.task-card__open').first().waitFor();
      const tasksShot = `${viewport.name}-${locale}-tasks.png`;
      await page.screenshot({ fullPage: true, path: path.join(OUTPUT, tasksShot) });
      const tasksOverflow = await horizontalOverflow(page);
      const tasksHeadings = await page.locator('#main-content h1').count();
      const tasksToolbar = await page.locator('.task-filters .ui-filter-toolbar').count();
      const opener = page.locator('.task-card__open').first();
      if (viewport.hasTouch) await opener.tap();
      else await opener.click();
      await page.getByRole('dialog').waitFor();
      const drawerShot = `${viewport.name}-${locale}-task-detail.png`;
      await page.screenshot({ path: path.join(OUTPUT, drawerShot) });
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      const focusReturned = await opener.evaluate((element) => document.activeElement === element);
      let touchClose = null;
      if (viewport.hasTouch) {
        await opener.tap();
        await page.getByRole('dialog').waitFor();
        await page.getByRole('button', { name: copy[locale].closeTask }).tap();
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        touchClose = true;
      }

      results.push({
        agendaHeadings,
        agendaOverflow,
        agendaScroll,
        agendaToolbar,
        backUrl,
        deepLink,
        focusReturned,
        forwardUrl,
        locale,
        pageErrors,
        screenshots: [agendaShot, tasksShot, drawerShot],
        tasksHeadings,
        tasksOverflow,
        tasksToolbar,
        touchClose,
        viewport: viewport.name,
      });
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const failures = results.filter((result) => {
  const scroll = result.agendaScroll;
  return (
    result.agendaHeadings !== 1 ||
    result.agendaOverflow > 1 ||
    result.agendaToolbar !== 1 ||
    scroll.wheelAfter <= scroll.wheelBefore ||
    scroll.trackpadAfter <= scroll.trackpadBefore ||
    scroll.keyboardAfter <= scroll.keyboardBefore ||
    (result.viewport === 'mobile' && scroll.touchAfter <= scroll.touchBefore) ||
    !result.deepLink.endsWith(`/tasks?task=${TASK_ID}`) ||
    !result.backUrl.endsWith('/agenda') ||
    !result.forwardUrl.endsWith(`/tasks?task=${TASK_ID}`) ||
    !result.focusReturned ||
    result.pageErrors.length > 0 ||
    result.tasksHeadings !== 1 ||
    result.tasksOverflow > 1 ||
    result.tasksToolbar !== 1 ||
    (result.viewport === 'mobile' && result.touchClose !== true)
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
  throw new Error(`Issue #219 Chrome evidence failed in ${failures.length} scenario(s)`);
}

console.log(`Issue #219 Chrome evidence passed (${results.length} scenarios).`);

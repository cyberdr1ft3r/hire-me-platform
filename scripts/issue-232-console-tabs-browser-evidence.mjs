#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const WEB = process.env.ISSUE_232_WEB_URL ?? 'http://localhost:5180';
const CHROME =
  process.env.ISSUE_232_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUTPUT = path.join(
  ROOT,
  'docs',
  'audit',
  'issue-232-console-tabs-evidence',
  'refinement-after',
);
const VIEWPORTS = [
  { height: 900, name: 'desktop', width: 1440 },
  { height: 900, name: 'desktop-breakpoint', width: 900 },
  { hasTouch: true, height: 1024, name: 'tablet', width: 768 },
  { hasTouch: true, height: 844, isMobile: true, name: 'mobile', width: 390 },
];
const copy = {
  en: { home: 'Overview', tasks: 'Tasks', trigger: 'Tabs', title: 'Open workspaces' },
  fr: { home: 'Vue d’ensemble', tasks: 'Tâches', trigger: 'Onglets', title: 'Espaces ouverts' },
};

const auth = {
  accessToken: 'issue-232-synthetic-token',
  accessTokenExpiresAt: '2099-10-20T12:05:00.000Z',
  user: {
    displayName: 'Console Workspace Reviewer',
    email: 'issue-232@example.test',
    id: '00000000-0000-4000-8000-000000000232',
    permissions: [
      'tasks:view',
      'clients:view',
      'candidates:view',
      'missions:view',
      'documents:view',
      'quotations:view',
    ],
  },
};

async function installFixtures(page) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.port !== '3000') {
      await route.continue();
      return;
    }
    if (url.pathname.endsWith('/health')) {
      await route.fulfill({ json: { service: 'hire-me-api', status: 'ok', uptimeSeconds: 1 } });
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
    if (url.pathname === '/v1/tasks') {
      await route.fulfill({
        json: { pageInfo: { hasNextPage: false, page: 1, pageSize: 25, total: 0 }, tasks: [] },
      });
      return;
    }
    if (url.pathname.startsWith('/v1/tasks/')) {
      await route.fulfill({ json: { users: [] } });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

async function signIn(page, locale, route = 'tasks') {
  await page.addInitScript((value) => localStorage.setItem('hireme.locale', value), locale);
  await page.goto(`${WEB}/${route === 'home' ? '' : route}`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill('issue-232@example.test');
  await page.locator('input[name="password"]').fill('Synthetic-password-232!');
  await page.locator('form.auth-panel button[type="submit"]').click();
  await page.locator('.app-shell').waitFor({ state: 'visible' });
  await page.locator('.app-shell__surface').waitFor({ state: 'visible' });
  await page.waitForFunction(
    () => !document.querySelector('.app-shell__surface [aria-busy="true"]'),
    undefined,
    { timeout: 15_000 },
  );
}

await mkdir(OUTPUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const results = [];

try {
  for (const viewport of VIEWPORTS) {
    for (const locale of ['en', 'fr']) {
      const context = await browser.newContext({
        hasTouch: viewport.hasTouch,
        isMobile: viewport.isMobile,
        viewport: { height: viewport.height, width: viewport.width },
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(String(error)));
      await installFixtures(page);
      await signIn(page, locale);

      const expected = copy[locale];
      const tabList = page.locator('.console-tabs__list');
      const mobileTrigger = page.locator('.console-tabs__mobile-trigger');
      const isDesktop = viewport.width >= 900;
      const desktopListVisible = await tabList.evaluate(
        (element) => getComputedStyle(element).display !== 'none',
      );
      const triggerVisible = await mobileTrigger.isVisible();
      if (desktopListVisible !== isDesktop || triggerVisible === isDesktop) {
        throw new Error(
          `${locale} ${viewport.name}: incorrect tab presentation at ${viewport.width}px (list=${desktopListVisible}, trigger=${triggerVisible})`,
        );
      }

      if (isDesktop) {
        const taskTab = page.getByRole('tab', { name: expected.tasks });
        const overviewTab = page.getByRole('tab', { name: expected.home });
        if ((await taskTab.getAttribute('aria-selected')) !== 'true') {
          throw new Error(`${locale} ${viewport.name}: route did not activate Tasks tab`);
        }
        await page.screenshot({ path: path.join(OUTPUT, `${viewport.name}-${locale}.png`) });
        await taskTab.press('ArrowLeft');
        await page.waitForFunction(() => window.location.pathname === '/');
        if ((await overviewTab.getAttribute('aria-selected')) !== 'true') {
          throw new Error(`${locale} ${viewport.name}: arrow-key activation failed`);
        }
        await page.goBack();
        await page.waitForFunction(() => window.location.pathname === '/tasks');
        if ((await taskTab.getAttribute('aria-selected')) !== 'true') {
          throw new Error(`${locale} ${viewport.name}: RV1 Back did not restore the active tab`);
        }
      } else {
        await page.screenshot({
          path: path.join(OUTPUT, `${viewport.name}-${locale}-page.png`),
        });
        await mobileTrigger.tap();
        const dialog = page.getByRole('dialog', { name: expected.title });
        await dialog.waitFor({ state: 'visible' });
        const dialogShot = `${viewport.name}-${locale}-dialog.png`;
        await page.screenshot({ path: path.join(OUTPUT, dialogShot) });
        await dialog.getByRole('button', { name: expected.home }).tap();
        await page.waitForFunction(() => window.location.pathname === '/');
        await mobileTrigger.tap();
        await page
          .getByRole('dialog', { name: expected.title })
          .getByRole('button', {
            name: expected.tasks,
            exact: true,
          })
          .tap();
        await page.waitForFunction(() => window.location.pathname === '/tasks');
      }

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 1 || pageErrors.length) {
        const overflowElements = await page.evaluate(() =>
          Array.from(document.querySelectorAll('*'))
            .map((element) => ({
              className: typeof element.className === 'string' ? element.className : '',
              clientWidth: element.clientWidth,
              id: element.id,
              left: Math.round(element.getBoundingClientRect().left),
              right: Math.round(element.getBoundingClientRect().right),
              scrollWidth: element.scrollWidth,
              tag: element.tagName,
            }))
            .filter((element) => element.right > window.innerWidth + 1)
            .slice(0, 8),
        );
        throw new Error(
          `${locale} ${viewport.name}: overflow=${overflow}, elements=${JSON.stringify(overflowElements)}, errors=${pageErrors.join('; ')}`,
        );
      }
      results.push({
        desktopListVisible,
        locale,
        pageErrors,
        screenshots: isDesktop
          ? [`${viewport.name}-${locale}.png`]
          : [`${viewport.name}-${locale}-dialog.png`],
        triggerVisible,
        viewport: viewport.name,
        width: viewport.width,
        horizontalOverflow: overflow,
      });
      await context.close();
    }
  }

  for (const route of ['tasks', 'clients', 'documents', 'commercial', 'candidates']) {
    for (const locale of ['en', 'fr']) {
      for (const viewport of [VIEWPORTS[0], VIEWPORTS[3]]) {
        const context = await browser.newContext({
          hasTouch: viewport.hasTouch,
          isMobile: viewport.isMobile,
          viewport: { height: viewport.height, width: viewport.width },
        });
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(String(error)));
        await installFixtures(page);
        await signIn(page, locale, route);
        const shell = page.locator('.app-shell[data-console-workspace="true"]');
        const surface = shell.locator('.app-shell__surface');
        await surface.waitFor({ state: 'visible' });
        await page.waitForTimeout(200);
        const surfaceStyle = await surface.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            borderRadius: style.borderRadius,
            height: Math.round(element.getBoundingClientRect().height),
            width: Math.round(element.getBoundingClientRect().width),
          };
        });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 1 || pageErrors.length || surfaceStyle.width <= 0) {
          throw new Error(
            `${locale} ${route} ${viewport.name}: overflow=${overflow}, surface=${JSON.stringify(surfaceStyle)}, errors=${pageErrors.join('; ')}`,
          );
        }
        const shot = `${route}-${locale}-${viewport.name}.png`;
        await page.screenshot({ path: path.join(OUTPUT, shot) });
        results.push({
          locale,
          pageErrors,
          route,
          screenshot: shot,
          surface: surfaceStyle,
          viewport: viewport.name,
          width: viewport.width,
          horizontalOverflow: overflow,
        });
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

const report = {
  browser: 'Google Chrome',
  chromeExecutable: CHROME,
  chromeVersion: browser.version(),
  generatedAt: new Date().toISOString(),
  passed: true,
  results,
};
await writeFile(path.join(OUTPUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Issue #232 Chrome evidence passed (${results.length} locale/viewport scenarios).`);

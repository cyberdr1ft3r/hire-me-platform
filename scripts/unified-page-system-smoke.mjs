#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const WEB = process.env.PAGE_SYSTEM_WEB_URL ?? 'http://127.0.0.1:5173';
const CHROME =
  process.env.PAGE_SYSTEM_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUTPUT = path.join(ROOT, 'docs', 'audit', 'unified-page-system');
const VIEWPORTS = [
  { height: 900, name: 'desktop', width: 1440 },
  { height: 900, name: 'tablet', width: 1024 },
  { hasTouch: true, height: 844, isMobile: true, name: 'mobile', width: 390 },
];
const LOCALES = ['en', 'fr'];

const auth = {
  accessToken: 'page-system-smoke-token',
  accessTokenExpiresAt: '2026-10-18T12:05:00.000Z',
  user: {
    displayName: 'Page System Reviewer',
    email: 'page-system@example.test',
    id: '00000000-0000-4000-8000-000000000218',
    permissions: ['tasks:view'],
  },
};

async function installApiFixtures(page) {
  await page.route('http://127.0.0.1:3000/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/health')) {
      await route.fulfill({
        json: {
          service: 'hire-me-api',
          status: 'ok',
          timestamp: '2026-10-18T12:00:00.000Z',
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
    if (url.pathname.includes('/tasks')) {
      await route.fulfill({
        json: {
          pageInfo: { hasNextPage: false, page: 1, pageSize: 25, total: 0 },
          tasks: [],
        },
      });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

async function signIn(page, locale, route = '/') {
  await page.addInitScript((value) => localStorage.setItem('hireme.locale', value), locale);
  await page.goto(`${WEB}${route}`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill('page-system@example.test');
  await page.locator('input[name="password"]').fill('Synthetic-password-123!');
  await page.locator('form.auth-panel button[type="submit"]').click();
  await page.locator('.app-shell').waitFor();
}

async function pageMetrics(page) {
  return page.evaluate(() => {
    const shell = document.querySelector('.app-shell');
    const pageShell = document.querySelector('.ui-page-shell');
    const headings = [...document.querySelectorAll('#main-content h1')];
    return {
      documentHorizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      documentLanguage: document.documentElement.lang,
      headingCount: headings.length,
      headingText: headings.map((heading) => heading.textContent?.trim()),
      pageLayout: pageShell?.getAttribute('data-page-layout') ?? null,
      shellLayout: shell?.getAttribute('data-layout') ?? null,
    };
  });
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
      await installApiFixtures(page);
      await signIn(page, locale);
      await page.getByRole('heading', { level: 1 }).waitFor();

      const navigation = { escapeClosed: null, focusReturned: null };
      if (viewport.name === 'mobile') {
        const trigger = page.locator('.app-shell__menu-trigger');
        await trigger.click();
        await page.locator('.app-shell__sidebar[role="dialog"]').waitFor();
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => {
          const sidebar = document.querySelector('.app-shell__sidebar');
          return sidebar?.getAttribute('data-open') !== 'true';
        });
        navigation.escapeClosed = true;
        navigation.focusReturned = await trigger.evaluate(
          (element) => document.activeElement === element,
        );
      }

      const metrics = await pageMetrics(page);
      const screenshot = `${viewport.name}-${locale}-overview.png`;
      await page.screenshot({ fullPage: true, path: path.join(OUTPUT, screenshot) });
      results.push({ locale, metrics, navigation, screenshot, viewport: viewport.name });
      await context.close();
    }
  }

  for (const locale of LOCALES) {
    const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
    const page = await context.newPage();
    await installApiFixtures(page);
    await signIn(page, locale, '/admin');
    const alert = page.getByRole('alert');
    await alert.waitFor();
    const screenshot = `desktop-${locale}-permission-denied.png`;
    await page.screenshot({ fullPage: true, path: path.join(OUTPUT, screenshot) });
    results.push({
      alertName: await alert.getAttribute('aria-labelledby'),
      alertText: (await alert.textContent())?.replace(/\s+/gu, ' ').trim(),
      locale,
      metrics: await pageMetrics(page),
      screenshot,
      viewport: 'desktop-permission-denied',
    });
    await context.close();
  }
} finally {
  await browser.close();
}

const failures = results.filter(
  (result) =>
    result.metrics.documentHorizontalOverflow ||
    result.metrics.documentLanguage !== result.locale ||
    (!result.alertText && result.viewport.includes('permission-denied')) ||
    result.metrics.headingCount !== 1 ||
    result.metrics.pageLayout !== 'flow' ||
    result.navigation?.focusReturned === false,
);

const report = {
  browser: 'Google Chrome',
  chromeExecutable: CHROME,
  generatedAt: new Date().toISOString(),
  passed: failures.length === 0,
  results,
};
await writeFile(path.join(OUTPUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  throw new Error(`Page-system browser smoke failed in ${failures.length} scenario(s)`);
}

console.log(`Unified page-system Chrome smoke passed (${results.length} scenarios).`);

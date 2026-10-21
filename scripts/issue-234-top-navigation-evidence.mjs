#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const WEB =
  process.env.ISSUE_234_WEB_URL ?? pathToFileURL(path.join(ROOT, 'apps/web/dist/index.html')).href;
const CHROME =
  process.env.ISSUE_234_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUTPUT = path.join(ROOT, 'docs/audit/issue-234-top-navigation');
const viewports = [
  { height: 707, name: 'reference-desktop', width: 1117 },
  { hasTouch: true, height: 844, isMobile: true, name: 'mobile', width: 390 },
];
const auth = {
  accessToken: 'issue-234-synthetic-token',
  accessTokenExpiresAt: '2099-10-20T12:05:00.000Z',
  user: {
    displayName: 'Navigation Reviewer',
    email: 'issue-234@example.test',
    id: '00000000-0000-4000-8000-000000000234',
    permissions: [
      'users:view',
      'clients:view',
      'candidates:view',
      'missions:view',
      'tasks:view',
      'messages:view',
      'documents:view',
      'training_programs:view',
      'reporting:recruitment:view',
      'quotations:view',
      'payments:view',
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
      await route.fulfill({
        json: {
          service: 'hire-me-api',
          status: 'ok',
          timestamp: '2026-10-21T00:00:00.000Z',
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
    await route.fulfill({ json: {} });
  });
}

async function signIn(page, locale) {
  await page.addInitScript((value) => {
    localStorage.setItem('hireme.locale', value);
    if (location.protocol === 'file:') {
      const nativePushState = history.pushState.bind(history);
      const nativeReplaceState = history.replaceState.bind(history);
      history.pushState = (state, title) => nativePushState(state, title);
      history.replaceState = (state, title) => nativeReplaceState(state, title);
    }
  }, locale);
  await page.goto(WEB, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill('issue-234@example.test');
  await page.locator('input[name="password"]').fill('Synthetic-password-234!');
  await page.locator('form.auth-panel button[type="submit"]').click();
  await page.locator('.app-shell').waitFor({ state: 'visible' });
}

await mkdir(OUTPUT, { recursive: true });
const browser = await chromium.launch({
  args: ['--allow-file-access-from-files'],
  executablePath: CHROME,
  headless: true,
});
const results = [];

try {
  for (const viewport of viewports) {
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

      const isMobile = viewport.width <= 900;
      const primaryNav = page.getByRole('navigation', {
        name: locale === 'fr' ? 'Navigation principale' : 'Primary navigation',
      });
      const menuTrigger = page.getByRole('button', {
        name: locale === 'fr' ? 'Ouvrir la navigation' : 'Open navigation',
      });
      if ((await primaryNav.count()) !== (isMobile ? 0 : 1)) {
        throw new Error(
          `${locale} ${viewport.name}: module navigation visibility did not match viewport`,
        );
      }

      if (isMobile) {
        const tabRowHeight = await page
          .locator('.app-shell__console-workspace')
          .evaluate((element) => Math.round(element.getBoundingClientRect().height));
        if (tabRowHeight > 64) {
          throw new Error(`${locale} mobile: Console tabs row expanded to ${tabRowHeight}px`);
        }
        await page.screenshot({ path: path.join(OUTPUT, `${viewport.name}-${locale}.png`) });
        await menuTrigger.click();
        await page
          .getByRole('dialog', {
            name: locale === 'fr' ? 'Navigation mobile' : 'Mobile navigation',
          })
          .waitFor({ state: 'visible' });
        await page.keyboard.press('Escape');
        if (!(await menuTrigger.getAttribute('aria-expanded')).includes('false')) {
          throw new Error(`${locale} mobile: drawer Escape did not close navigation`);
        }
        const restoredMobileFocus = await menuTrigger.evaluate(
          (element) => document.activeElement === element,
        );
        if (!restoredMobileFocus) throw new Error(`${locale} mobile: drawer did not restore focus`);
      } else {
        const navLabels = await primaryNav.locator('a').allTextContents();
        const expectedPrimary =
          locale === 'fr'
            ? ['Accueil', 'Candidats', 'Missions', 'Clients', 'Tâches', 'Messages', 'Commercial']
            : ['Home', 'Candidates', 'Missions', 'Clients', 'Tasks', 'Messages', 'Commercial'];
        if (JSON.stringify(navLabels) !== JSON.stringify(expectedPrimary)) {
          throw new Error(
            `${locale} desktop: unexpected primary links ${JSON.stringify(navLabels)}`,
          );
        }
        await page.screenshot({ path: path.join(OUTPUT, `${viewport.name}-${locale}.png`) });
        const more = page.getByRole('button', {
          exact: true,
          name: locale === 'fr' ? 'Plus' : 'More',
        });
        await more.click();
        await page
          .getByRole('link', { name: locale === 'fr' ? 'Administration' : 'Administration' })
          .waitFor({ state: 'visible' });
        const menuOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (menuOverflow > 1) {
          throw new Error(
            `${locale} desktop: More menu introduced ${menuOverflow}px horizontal overflow`,
          );
        }
        await page.keyboard.press('Escape');
        const restoredMoreFocus = await more.evaluate(
          (element) => document.activeElement === element,
        );
        if (!restoredMoreFocus) throw new Error(`${locale} desktop: More did not restore focus`);
      }

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 1 || pageErrors.length) {
        throw new Error(
          `${locale} ${viewport.name}: overflow=${overflow}, errors=${pageErrors.join('; ')}`,
        );
      }
      results.push({
        locale,
        viewport: viewport.name,
        width: viewport.width,
        horizontalOverflow: overflow,
        pageErrors,
      });
      await context.close();
    }
  }

  const zoomContext = await browser.newContext({ viewport: { width: 559, height: 354 } });
  const zoomPage = await zoomContext.newPage();
  await installFixtures(zoomPage);
  await signIn(zoomPage, 'en');
  const zoomOverflow = await zoomPage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (zoomOverflow > 1) throw new Error(`200% zoom-equivalent viewport overflow=${zoomOverflow}`);
  results.push({
    locale: 'en',
    viewport: '200%-zoom-equivalent',
    width: 559,
    horizontalOverflow: zoomOverflow,
  });
  await zoomContext.close();

  console.log(JSON.stringify({ results }, null, 2));
} finally {
  await browser.close();
}

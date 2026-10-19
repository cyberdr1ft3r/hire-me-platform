#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const WEB = process.env.CLIENTS_V21_WEB_URL ?? 'http://127.0.0.1:5173';
const CHROME =
  process.env.CLIENTS_V21_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUTPUT = path.join(ROOT, 'docs', 'audit', 'clients-workspace-v2.1');
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const VIEWPORTS = [
  { height: 900, name: 'desktop', width: 1440 },
  { height: 1024, name: 'tablet', width: 768 },
  { hasTouch: true, height: 844, isMobile: true, name: 'mobile', width: 390 },
];
const LOCALES = ['en', 'fr'];

const copy = {
  en: { back: 'Back to clients', close: 'Close preview', open: 'Open full record' },
  fr: { back: 'Retour aux clients', close: 'Fermer l’aperçu', open: 'Ouvrir la fiche complète' },
};

const permissions = [
  'clients:view',
  'clients:create',
  'clients:update',
  'clients:status:manage',
  'clients:archive',
  'client_contacts:view',
  'client_contacts:create',
  'client_contacts:update',
  'client_contacts:status:manage',
  'client_contacts:archive',
  'commercial_data:access',
];

function client(index) {
  const id = index === 0 ? CLIENT_ID : `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`;
  return {
    archivedAt: null,
    city: index % 2 ? 'Lyon' : 'Paris',
    commercial: {
      commercialOwnerUserId: null,
      commercialSummary: 'Synthetic commercial context.',
    },
    country: 'France',
    createdAt: '2026-01-01T00:00:00.000Z',
    id,
    industry: index % 2 ? 'Professional services' : 'Technology',
    mainPhone: `+33 1 84 00 ${String(index).padStart(2, '0')}`,
    name: index === 0 ? 'Acme International Consulting Group' : `Synthetic Client ${index + 1}`,
    normalizedName:
      index === 0 ? 'acme international consulting group' : `synthetic client ${index + 1}`,
    status: index % 5 === 0 ? 'PROSPECT' : 'ACTIVE',
    updatedAt: '2026-10-19T08:00:00.000Z',
    website: 'https://example.test',
  };
}

const clients = Array.from({ length: 30 }, (_, index) => client(index));
const auth = {
  accessToken: 'clients-v21-browser-token',
  accessTokenExpiresAt: '2099-10-19T12:05:00.000Z',
  user: {
    displayName: 'Clients Workspace Reviewer',
    email: 'clients-v21@example.test',
    id: '00000000-0000-4000-8000-000000000210',
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
    if (url.pathname === '/v1/clients') {
      await route.fulfill({
        json: { clients, pagination: { page: 1, pageSize: 50, total: clients.length } },
      });
      return;
    }
    if (url.pathname === `/v1/clients/${CLIENT_ID}`) {
      detailReads.push(request.url());
      await route.fulfill({ json: { client: clients[0] } });
      return;
    }
    if (url.pathname === `/v1/clients/${CLIENT_ID}/contacts`) {
      await route.fulfill({
        json: {
          contacts: [
            {
              archivedAt: null,
              clientId: CLIENT_ID,
              createdAt: '2026-01-01T00:00:00.000Z',
              displayName: 'Jane Doe',
              email: 'jane.doe@example.test',
              id: '22222222-2222-4222-8222-222222222222',
              normalizedEmail: 'jane.doe@example.test',
              phone: '+33 1 84 00 00 00',
              portalStatus: 'DISABLED',
              roleTitle: 'Buyer',
              status: 'ACTIVE',
              updatedAt: '2026-10-19T08:00:00.000Z',
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1 },
        },
      });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

async function signIn(page, locale) {
  await page.addInitScript((value) => localStorage.setItem('hireme.locale', value), locale);
  await page.goto(`${WEB}/clients`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill('clients-v21@example.test');
  await page.locator('input[name="password"]').fill('Synthetic-password-123!');
  await page.locator('form.auth-panel button[type="submit"]').click();
  try {
    await page.locator('.client-directory__open').first().waitFor({ timeout: 10_000 });
  } catch (error) {
    const body = await page.locator('body').innerText();
    throw new Error(`Clients directory did not load at ${page.url()}: ${body.slice(0, 1_000)}`, {
      cause: error,
    });
  }
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
      const detailReads = [];
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(String(error)));
      await installApiFixtures(page, detailReads);
      await signIn(page, locale);

      const directory = await page.locator('[data-page-kind="directory"]').count();
      const headings = await page.locator('#main-content h1').count();
      const toolbarCount = await page.locator('.ui-filter-toolbar__status').textContent();
      const overflow = await horizontalOverflow(page);
      const listBody = page.locator('.clients__list-pane .ui-workspace__pane-body');
      const directoryShot = `${viewport.name}-${locale}-directory.png`;
      await page.screenshot({ path: path.join(OUTPUT, directoryShot) });
      const scrollBefore = await listBody.evaluate((element) => element.scrollTop + window.scrollY);
      await listBody.hover();
      await page.mouse.wheel(0, 520);
      await page.waitForTimeout(150);
      const scrollAfter = await listBody.evaluate((element) => element.scrollTop + window.scrollY);

      const row = page.locator('.client-directory__open').first();
      await row.click();
      await page.waitForTimeout(150);
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
        : page.locator('.client-preview');
      await previewRoot.getByRole('button', { name: copy[locale].open }).click();
      await page.locator('[data-page-kind="record"]').waitFor();
      const recordUrl = page.url();
      const recordHeadings = await page.locator('#main-content h1').count();
      const actionPattern = await page.locator('.client-detail .ui-contextual-actions').count();
      const recordShot = `${viewport.name}-${locale}-record.png`;
      await page.screenshot({ fullPage: true, path: path.join(OUTPUT, recordShot) });

      await page.getByRole('button', { name: copy[locale].back }).focus();
      await page.keyboard.press('PageDown');
      await page.getByRole('button', { name: copy[locale].back }).click();
      await page.locator('[data-page-kind="directory"]').waitFor();

      results.push({
        actionPattern,
        detailReads: detailReads.length,
        directory,
        focusReturned,
        headings,
        horizontalOverflow: overflow,
        locale,
        pageErrors,
        previewDetailReads: previewReads,
        recordHeadings,
        recordUrl,
        screenshots: [directoryShot, previewShot, recordShot],
        scrollAfter,
        scrollBefore,
        selected,
        sheet,
        toolbarCount: toolbarCount?.trim(),
        viewport: viewport.name,
      });
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const failures = results.filter(
  (result) =>
    result.actionPattern !== 1 ||
    result.detailReads !== 1 ||
    result.directory !== 1 ||
    !result.focusReturned ||
    result.headings !== 1 ||
    result.horizontalOverflow > 1 ||
    result.pageErrors.length > 0 ||
    result.previewDetailReads !== 0 ||
    result.recordHeadings !== 1 ||
    !/\?client=11111111-1111-4111-8111-111111111111$/u.test(result.recordUrl) ||
    result.scrollAfter <= result.scrollBefore ||
    result.selected !== 'true' ||
    !result.toolbarCount?.includes('30'),
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
  throw new Error(`Clients v2.1 Chrome evidence failed in ${failures.length} scenario(s)`);
}

console.log(`Clients v2.1 Chrome evidence passed (${results.length} scenarios).`);

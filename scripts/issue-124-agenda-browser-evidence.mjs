#!/usr/bin/env node
/**
 * Issue #124 My Agenda browser evidence (Chromium via Playwright).
 * Requires API+web against a seeded database (D-071 disposable or dev).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ARTIFACT_DIR = '/opt/cursor/artifacts/issue124-agenda-evidence';
const WEB = process.env.HIREME_WEB_URL ?? 'http://127.0.0.1:5173';
const LOCALE_KEY = 'hireme.locale';

const VIEWPORTS = [
  { label: '1440', width: 1440, height: 900 },
  { label: '1024', width: 1024, height: 768 },
  { label: '800', width: 800, height: 900 },
  { label: '430', width: 430, height: 844 },
  { label: '390', width: 390, height: 844 },
];

const VIEWS_EN = ['Today', 'Week', 'Month', 'Upcoming', 'Overdue', 'Past'];
const VIEWS_FR = ["Aujourd'hui", 'Semaine', 'Mois', 'À venir', 'En retard', 'Passé'];

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

const login = {
  email: 'admin@example.test',
  password: 'Synthetic-admin-123!',
};

async function setLocale(page, locale) {
  await page.evaluate(
    ([key, value]) => {
      localStorage.setItem(key, value);
    },
    [LOCALE_KEY, locale],
  );
  await page.reload({ waitUntil: 'networkidle' });
}

async function signIn(page) {
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await page.locator('input[name="email"]').fill(login.email);
  await page.locator('input[name="password"]').fill(login.password);
  await page.locator('form.auth-panel button[type="submit"]').click();
  await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 60_000 });
}

async function openAgenda(page) {
  await page.evaluate(() => {
    window.history.pushState({}, '', '/agenda');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.getByRole('region', { name: /agenda|mon agenda/i }).waitFor({
    state: 'visible',
    timeout: 60_000,
  });
}

async function assertNoUuidLeak(page) {
  const text = await page.locator('main').innerText();
  if (UUID_RE.test(text)) {
    throw new Error('Visible UUID detected in main content');
  }
}

async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) return false;
    return main.scrollWidth > main.clientWidth + 2;
  });
  if (overflow) {
    throw new Error('Horizontal overflow detected on main');
  }
}

async function captureMatrix(page, locale, viewLabels, manifest) {
  await setLocale(page, locale);
  await openAgenda(page);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openAgenda(page);
    for (const viewLabel of viewLabels) {
      const viewControl = page.getByRole('button', { name: viewLabel, exact: true });
      if (await viewControl.count()) {
        await viewControl.click();
        await page.waitForTimeout(300);
      }
      const file = `agenda-${locale}-${viewport.label}-${viewLabel.replace(/\s+/g, '-').toLowerCase()}.png`;
      const screenshotPath = path.join(ARTIFACT_DIR, file);
      await assertNoUuidLeak(page);
      await assertNoHorizontalOverflow(page);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      manifest.captures.push({ locale, viewport: viewport.label, view: viewLabel, file });
    }
    const sourceSelect = page
      .locator('select')
      .filter({ hasText: /source|source/i })
      .first();
    if (await sourceSelect.count()) {
      await sourceSelect.selectOption({ label: locale === 'fr' ? 'Réunions' : 'Meetings' });
      await page.waitForTimeout(300);
      const filterFile = `agenda-${locale}-${viewport.label}-filter-meetings.png`;
      await page.screenshot({ path: path.join(ARTIFACT_DIR, filterFile), fullPage: true });
      manifest.captures.push({
        locale,
        viewport: viewport.label,
        view: 'source-meetings',
        file: filterFile,
      });
    }
  }
}

async function exerciseKeyboard(page) {
  await openAgenda(page);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
}

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const manifest = {
    web: WEB,
    login: login.email,
    captures: [],
    executedAt: new Date().toISOString(),
  };
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page);
  await captureMatrix(page, 'en', VIEWS_EN, manifest);
  await captureMatrix(page, 'fr', VIEWS_FR, manifest);
  await exerciseKeyboard(page);
  await writeFile(path.join(ARTIFACT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await browser.close();
  console.log(`Issue #124 agenda evidence: ${manifest.captures.length} captures → ${ARTIFACT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

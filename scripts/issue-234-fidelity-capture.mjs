#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const WEB =
  process.env.ISSUE_234_WEB_URL ?? pathToFileURL(path.join(ROOT, 'apps/web/dist/index.html')).href;
const CHROME =
  process.env.ISSUE_234_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PHASE = 'after-affordance-correction';
const OUTPUT = path.join(ROOT, 'docs/audit/issue-234-top-navigation');
const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const syntheticTime = '2026-10-20T10:00:00.000Z';
const candidateNames = [
  ['Sofia El Amrani', 'Senior Product Designer', 'Casablanca'],
  ['Youssef Benali', 'DevOps Engineer', 'Rabat'],
  ['Lina Haddad', 'Frontend Developer', 'Marrakesh'],
  ['Omar Idrissi', 'IT Project Manager', 'Casablanca'],
  ['Meryem Alaoui', 'Security Analyst', 'Tangier'],
  ['Nadia Bennis', 'Data Analyst', 'Rabat'],
  ['Karim Tazi', 'Product Manager', 'Casablanca'],
  ['Salma Zahra', 'UX Researcher', 'Fez'],
  ['Anas Chraibi', 'QA Engineer', 'Agadir'],
];
const candidates = candidateNames.map(([displayName, currentJobTitle, city], index) => ({
  id: index === 0 ? CANDIDATE_ID : `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
  displayName,
  firstName: null,
  lastName: null,
  email: index === 0 ? 'sofia.elamrani@example.test' : `candidate${index}@example.test`,
  normalizedEmail: index === 0 ? 'sofia.elamrani@example.test' : `candidate${index}@example.test`,
  phone: index === 0 ? '+212 6 12 34 56 78' : null,
  city,
  country: 'Morocco',
  currentJobTitle,
  professionalSummary:
    index === 0 ? 'Senior product designer with seven years of experience.' : null,
  linkedinUrl: null,
  status: 'ACTIVE',
  source: index === 0 ? 'Direct application' : 'Referral',
  sourceDetail: null,
  availabilityNotice: index === 0 ? '30 days' : null,
  compensation: null,
  consent: null,
  archivedAt: null,
  createdAt: syntheticTime,
  updatedAt: syntheticTime,
}));
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
          timestamp: syntheticTime,
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
    if (url.pathname.endsWith('/v1/candidates')) {
      await route.fulfill({
        json: { candidates, pagination: { page: 1, pageSize: 20, total: candidates.length } },
      });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

const browser = await chromium.launch({
  args: ['--allow-file-access-from-files'],
  executablePath: CHROME,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1117, height: 707 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));

try {
  await mkdir(OUTPUT, { recursive: true });
  await installFixtures(page);
  await page.addInitScript(() => {
    localStorage.setItem('hireme.locale', 'en');
    if (location.protocol === 'file:') {
      const nativePushState = history.pushState.bind(history);
      const nativeReplaceState = history.replaceState.bind(history);
      history.pushState = (state, title) => nativePushState(state, title);
      history.replaceState = (state, title) => nativeReplaceState(state, title);
    }
  });
  await page.goto(WEB, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill('issue-234@example.test');
  await page.locator('input[name="password"]').fill('Synthetic-password-234!');
  await page.locator('form.auth-panel button[type="submit"]').click();
  await page.locator('.app-shell').waitFor({ state: 'visible' });
  await page.getByRole('link', { name: 'Candidates' }).click();
  try {
    await page.getByRole('heading', { name: 'Candidates', level: 1 }).waitFor({ timeout: 10000 });
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          url: page.url(),
          text: await page.locator('body').innerText(),
          pageErrors,
        },
        null,
        2,
      ),
    );
    throw error;
  }
  await page.locator(`[data-candidate-id="${CANDIDATE_ID}"]`).click();
  await page
    .locator(`.candidate-preview[data-candidate-id="${CANDIDATE_ID}"]`)
    .waitFor({ state: 'visible' });
  await page.getByRole('heading', { name: 'Sofia El Amrani' }).waitFor();

  const prefix = `${PHASE}-candidates-desktop-en`;
  await page.screenshot({ path: path.join(OUTPUT, `${prefix}.png`) });
  const metrics = await page.evaluate(() => {
    const bounds = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        fontSize: style.fontSize,
        paddingBlock: style.paddingBlock,
      };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      rows: {
        utility: bounds('.app-shell__utility-bar'),
        moduleNavigation: bounds('.app-shell__module-nav'),
        workspaceTabs: bounds('.app-shell__console-workspace'),
      },
      activeWorkspaceTab: bounds('.console-tabs__tab[aria-selected="true"]'),
      activeWorkspaceTabClose: bounds(
        '.console-tabs__item:has(.console-tabs__tab[aria-selected="true"]) .console-tabs__close',
      ),
      candidateHeader: bounds('.ui-page-header'),
      candidateSurface: bounds('.app-shell__surface'),
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  const more = page.getByRole('button', { exact: true, name: 'More' });
  await more.click();
  const morePanel = page.locator('.app-shell__more-panel');
  await morePanel.waitFor({ state: 'visible' });
  const menu = await page.evaluate(() => {
    const panel = document.querySelector('.app-shell__more-panel');
    const list = document.querySelector('.app-shell__module-list');
    if (!panel || !list) return null;
    const panelRect = panel.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const panelStyle = getComputedStyle(panel);
    const listStyle = getComputedStyle(list);
    const visibleTop = Math.max(panelRect.top, listRect.top);
    const visibleBottom = Math.min(panelRect.bottom, listRect.bottom);
    return {
      panel: {
        top: panelRect.top,
        bottom: panelRect.bottom,
        left: panelRect.left,
        right: panelRect.right,
      },
      moduleList: {
        top: listRect.top,
        bottom: listRect.bottom,
        overflowX: listStyle.overflowX,
        overflowY: listStyle.overflowY,
      },
      position: panelStyle.position,
      overlapHeightWithModuleList: Math.max(0, visibleBottom - visibleTop),
      hiddenByModuleList:
        panelStyle.position === 'absolute' &&
        listStyle.overflowY !== 'visible' &&
        panelRect.bottom > listRect.bottom,
    };
  });
  await page.screenshot({ path: path.join(OUTPUT, `${PHASE}-more-menu-en.png`) });
  if (menu?.hiddenByModuleList) {
    throw new Error(`More menu is clipped by the module list: ${JSON.stringify(menu)}`);
  }
  if (metrics.documentOverflow > 0 || pageErrors.length > 0) {
    throw new Error(
      `pageOverflow=${metrics.documentOverflow}, pageErrors=${pageErrors.join('; ')}`,
    );
  }
  await writeFile(
    path.join(OUTPUT, `${prefix}.json`),
    JSON.stringify({ phase: PHASE, metrics, menu, pageErrors }, null, 2),
  );
  console.log(JSON.stringify({ phase: PHASE, metrics, menu, pageErrors }, null, 2));
} finally {
  await context.close();
  await browser.close();
}

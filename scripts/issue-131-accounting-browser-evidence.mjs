#!/usr/bin/env node
/**
 * Issue #131 Accounting workspace browser evidence (Chromium via Playwright).
 * Requires local API+web and synthetic login users (created on first run).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ARTIFACT_DIR = '/opt/cursor/artifacts/issue131-evidence';
const WEB = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:3000';
const LOCALE_KEY = 'hireme.locale';

const VIEWPORTS = [
  { label: '1440', width: 1440, height: 900 },
  { label: '1024', width: 1024, height: 768 },
  { label: '800', width: 800, height: 900 },
  { label: '430', width: 430, height: 844 },
  { label: '390', width: 390, height: 844 },
];

const AREA_EN = ['Payments', 'Expenses', 'Client balances', 'Profitability'];
const AREA_FR = ['Paiements', 'Dépenses', 'Soldes clients', 'Rentabilité'];

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

const personas = {
  operator: {
    email: 'admin@example.test',
    password: 'Synthetic-admin-123!',
  },
  finance: {
    email: 'issue131-finance@test.hireme.test',
    password: 'Synthetic-finance-131!',
  },
};

async function api(method, route, body, token) {
  const response = await fetch(`${API}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

async function loginApi(email, password) {
  const result = await api('POST', '/auth/login', { email, password });
  if (result.status !== 201 || !result.data?.accessToken) {
    throw new Error(`API login failed for ${email}: ${result.status}`);
  }
  return result.data.accessToken;
}

async function ensureEvidenceUsers() {
  const adminToken = await loginApi(personas.operator.email, personas.operator.password);

  async function ensureUser(key, roleName, extraRoleNames = []) {
    const spec = personas[key];
    const list = await api('GET', '/v1/admin/users?pageSize=50&search=issue131', null, adminToken);
    const existing = list.data?.users?.find(
      (row) => row.email?.toLowerCase() === spec.email.toLowerCase(),
    );
    let userId = existing?.id;
    if (!userId) {
      const created = await api(
        'POST',
        '/v1/admin/users',
        {
          email: spec.email,
          displayName: `Issue131 ${key}`,
          initialPassword: spec.password,
          locale: 'en',
        },
        adminToken,
      );
      if (created.status !== 201) {
        throw new Error(
          `create user ${spec.email}: ${created.status} ${JSON.stringify(created.data)}`,
        );
      }
      userId = created.data.user.id;
    }
    for (const role of [roleName, ...extraRoleNames]) {
      await api('POST', `/v1/admin/users/${userId}/roles`, { roleName: role }, adminToken);
    }
  }

  await ensureUser('finance', 'FINANCE_MANAGER');
}

async function prepareLocale(context, locale) {
  await context.addInitScript(
    (storageKey, value) => {
      window.localStorage.setItem(storageKey, value);
    },
    LOCALE_KEY,
    locale,
  );
}

async function loginUi(page, email, password) {
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form.auth-panel button[type="submit"]').click();
  await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 30_000 });
}

async function openAccounting(page) {
  if (!page.url().includes('/accounting')) {
    await page.evaluate(() => {
      window.history.pushState({}, '', '/accounting');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  }
  await page.locator('section.accounting').waitFor({ state: 'visible', timeout: 30_000 });
}

async function layoutOk(page) {
  return page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

async function workspaceText(page) {
  return page.locator('section.accounting').innerText();
}

function uuidHits(text) {
  const matches = text.match(new RegExp(UUID_RE.source, 'gi'));
  return matches ?? [];
}

async function screenshot(page, name) {
  const file = path.join(ARTIFACT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function visitAreas(page, labels) {
  for (const label of labels) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.locator('section.accounting').waitFor({ state: 'visible' });
  }
}

async function runMatrix(personaKey, locale, widths, areaLabels) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: locale === 'fr' ? 'fr-FR' : 'en-GB',
  });
  await prepareLocale(context, locale);
  const page = await context.newPage();
  const spec = personas[personaKey];
  const failures = [];
  let checks = 0;

  await loginUi(page, spec.email, spec.password);
  await openAccounting(page);

  for (const viewport of widths) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await visitAreas(page, areaLabels);
    for (const label of areaLabels) {
      await page.getByRole('button', { name: label, exact: true }).click();
      checks += 1;
      const layout = await layoutOk(page);
      if (!layout.overflow) {
        failures.push(`${personaKey} ${locale} ${viewport.label} ${label}: horizontal overflow`);
      }
      const text = await workspaceText(page);
      const hits = uuidHits(text);
      if (hits.length > 0) {
        failures.push(
          `${personaKey} ${locale} ${viewport.label} ${label}: UUID visible (${hits.slice(0, 2).join(', ')})`,
        );
      }
      await screenshot(
        page,
        `${personaKey}-${locale}-${viewport.label}-${label.replace(/\s+/g, '-')}`,
      );
    }
  }

  await browser.close();
  return { personaKey, locale, checks, failures };
}

async function runKeyboardAndLocale() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'en-GB' });
  await prepareLocale(context, 'en');
  const page = await context.newPage();
  await loginUi(page, personas.operator.email, personas.operator.password);
  await openAccounting(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Payments', exact: true }).click();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const keyboardOk = await page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName;
    const cls = active.className?.toString() ?? '';
    return tag === 'BUTTON' && cls.includes('accounting');
  });
  await page.getByRole('button', { name: 'Expenses', exact: true }).click();
  await page.locator('select.app-shell__language-select').selectOption('fr');
  await page.waitForTimeout(300);
  const frVisible = await page.getByRole('button', { name: 'Dépenses', exact: true }).isVisible();
  await page.close();
  await context.close();
  await browser.close();
  return { keyboardOk, frVisible };
}

async function runFinanceManagerNetwork(locale) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: locale === 'fr' ? 'fr-FR' : 'en-GB' });
  await prepareLocale(context, locale);
  const page = await context.newPage();
  const requests = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/v1/missions') || url.includes('placement-options')) {
      requests.push(url);
    }
  });
  await loginUi(page, personas.finance.email, personas.finance.password);
  await openAccounting(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await visitAreas(page, locale === 'fr' ? AREA_FR : AREA_EN);
  await browser.close();
  return requests;
}

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await ensureEvidenceUsers();

  const results = [];
  results.push(await runMatrix('operator', 'en', VIEWPORTS, AREA_EN));
  results.push(await runMatrix('operator', 'fr', VIEWPORTS, AREA_FR));
  results.push(
    await runMatrix(
      'finance',
      'en',
      [
        { label: '1440', width: 1440, height: 900 },
        { label: '390', width: 390, height: 844 },
      ],
      AREA_EN,
    ),
  );
  results.push(
    await runMatrix(
      'finance',
      'fr',
      [
        { label: '1440', width: 1440, height: 900 },
        { label: '390', width: 390, height: 844 },
      ],
      AREA_FR,
    ),
  );

  const financeRequestsEn = await runFinanceManagerNetwork('en');
  const financeRequestsFr = await runFinanceManagerNetwork('fr');
  const interaction = await runKeyboardAndLocale();

  const failures = results.flatMap((row) => row.failures);
  if (!interaction.keyboardOk) {
    failures.push('Keyboard focus did not reach an accounting control after Tab');
  }
  if (!interaction.frVisible) {
    failures.push('Locale switch to FR did not show French area tab label');
  }
  if (financeRequestsEn.length > 0 || financeRequestsFr.length > 0) {
    failures.push(
      `Finance Manager issued forbidden requests: en=${financeRequestsEn.length} fr=${financeRequestsFr.length}`,
    );
  }

  const totalChecks = results.reduce((sum, row) => sum + row.checks, 0);
  const gate = failures.length === 0 ? 'PASS' : 'FAIL';
  const summary = {
    gate: `ISSUE 131 ACCOUNTING WORKSPACE GATE: ${gate}`,
    totalChecks,
    failures,
    artifactDir: ARTIFACT_DIR,
  };
  await writeFile(path.join(ARTIFACT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const WEB = new URL(process.env.PR_277_WEB_URL ?? 'http://127.0.0.1:5173');
if (WEB.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(WEB.hostname)) {
  throw new Error('The keyboard acceptance script requires a loopback URL.');
}
const CHROME = process.env.PR_277_CHROME_PATH;
const OUTPUT = path.resolve(
  process.env.PR_277_OUTPUT_DIR ?? path.join(tmpdir(), 'hireme-training-reference-keyboard'),
);
const REFERENCE = 'TRN-2026-277';
const PROGRAM_NAME = 'Chrome Synthetic Program';
const PROGRAM_ID = '00000000-0000-4000-8277-000000000277';
const CLIENT_ID = '2a2a2a2a-2a2a-42a2-82a2-2a2a2a2a2a2a';
const OWNER_ID = '1b1b1b1b-1b1b-41b1-81b1-1b1b1b1b1b1b';
const VIEWPORTS = [
  { height: 800, name: 'narrow', width: 360 },
  { height: 900, name: 'desktop', width: 1440 },
];
const LOCALES = ['en', 'fr'];

const copy = {
  en: {
    createSummary: 'New training program',
    createButton: 'Create program',
    created: 'Program created.',
    duplicate: 'Another program already uses this reference.',
    referenceLabel: 'Reference',
    nameLabel: 'Name',
    heading: 'Training',
    loginEmail: 'pr-277@example.test',
  },
  fr: {
    createSummary: 'Nouveau programme de formation',
    createButton: 'Créer le programme',
    created: 'Programme créé.',
    duplicate: 'Un autre programme utilise déjà cette référence.',
    referenceLabel: 'Référence',
    nameLabel: 'Nom',
    heading: 'Formation',
    loginEmail: 'pr-277@example.test',
  },
};

const auth = {
  accessToken: 'pr-277-browser-token',
  accessTokenExpiresAt: '2099-11-20T12:00:00.000Z',
  user: {
    displayName: 'Training Create Reviewer',
    email: 'pr-277@example.test',
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0277',
    permissions: [
      'training_programs:view',
      'training_programs:manage',
      'training_programs:status:manage',
      'training_programs:archive',
      'training_sessions:view',
      'training_sessions:manage',
      'training_enrollments:view',
      'training_participation:view',
      'clients:view',
    ],
  },
};

const timestamp = '2026-11-20T10:00:00.000Z';

function program(name, reference, id) {
  return {
    id,
    reference,
    name,
    description: null,
    targetAudience: null,
    status: 'PROGRAM_ACTIVE',
    ownerUserId: OWNER_ID,
    ownerDisplayName: 'Synthetic Owner',
    clientId: null,
    clientDisplayName: null,
    plannedStartDate: null,
    plannedEndDate: null,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const state = {
  programs: [program('Synthetic Onboarding', 'TRN-A', '3a3a3a3a-3a3a-43a3-83a3-3a3a3a3a3a3a')],
  posts: [],
  failNextCreate: false,
};

function pageJson(key, items, page = 1, pageSize = 20) {
  return {
    [key]: items,
    pagination: { page, pageSize, total: items.length },
  };
}

function isApiUrl(url) {
  return (
    url.port === '3000' &&
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1')
  );
}

async function installApiFixtures(page, pickerGates) {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!isApiUrl(url)) {
      if (url.origin === WEB.origin) await route.continue();
      else await route.abort();
      return;
    }
    if (url.pathname.endsWith('/health')) {
      await route.fulfill({
        json: {
          service: 'hire-me-api',
          status: 'ok',
          timestamp,
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
    if (url.pathname === '/v1/training/program-owner-user-options') {
      await pickerGates.owner;
      await route.fulfill({
        json: {
          users: [{ id: OWNER_ID, displayName: 'Synthetic Owner', email: 'owner@example.test' }],
        },
      });
      return;
    }
    if (url.pathname === '/v1/clients') {
      await pickerGates.client;
      await route.fulfill({
        json: pageJson('clients', [
          {
            id: CLIENT_ID,
            name: 'Synthetic Client',
            normalizedName: 'synthetic client',
            status: 'ACTIVE',
            industry: null,
            website: null,
            mainPhone: null,
            country: null,
            city: 'Synthetic City',
            commercial: null,
            archivedAt: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ]),
      });
      return;
    }
    if (url.pathname === '/v1/training/programs' && request.method() === 'GET') {
      await route.fulfill({ json: pageJson('programs', state.programs) });
      return;
    }
    if (url.pathname === '/v1/training/programs' && request.method() === 'POST') {
      const body = request.postDataJSON();
      state.posts.push(body);
      if (state.failNextCreate) {
        state.failNextCreate = false;
        await route.fulfill({
          status: 409,
          json: { error: { code: 'TRAINING_PROGRAM_REFERENCE_TAKEN', message: 'Taken.' } },
        });
        return;
      }
      const created = program(String(body.name), String(body.reference), PROGRAM_ID);
      state.programs = [created, ...state.programs];
      await route.fulfill({ json: { program: created }, status: 201 });
      return;
    }
    await route.fulfill({ json: {}, status: 404 });
  });
}

async function signIn(page, locale) {
  await page.addInitScript((value) => localStorage.setItem('hireme.locale', value), locale);
  await page.goto(new URL('/training', WEB).href, { waitUntil: 'networkidle' });
  const trainingHeading = page.getByRole('heading', { level: 1, name: copy[locale].heading });
  if (!(await trainingHeading.isVisible().catch(() => false))) {
    const loginEmail = page.locator('form.login-form input[name="email"]');
    await loginEmail.waitFor({ state: 'visible', timeout: 20_000 });
    await loginEmail.fill(auth.user.email);
    await page.locator('input[name="password"]').fill('Synthetic-password-277!');
    await page.locator('form.login-form button[type="submit"]').click();
  }
  await trainingHeading.waitFor({ state: 'visible', timeout: 20_000 });
}

async function runScenario(browser, locale, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const labels = copy[locale];
  const result = { locale, viewport: viewport.name, steps: [] };

  state.programs = [
    program('Synthetic Onboarding', 'TRN-A', '3a3a3a3a-3a3a-43a3-83a3-3a3a3a3a3a3a'),
  ];
  state.posts = [];
  state.failNextCreate = true;
  const ownerGate = Promise.withResolvers();
  const clientGate = Promise.withResolvers();

  await installApiFixtures(page, { owner: ownerGate.promise, client: clientGate.promise });
  await signIn(page, locale);

  await page.getByRole('button', { name: 'Synthetic Onboarding' }).waitFor({ timeout: 20_000 });
  const create = page.locator('details.training-create');
  await create.locator('summary').click();
  const reference = create.getByLabel(labels.referenceLabel);
  const name = create.getByLabel(labels.nameLabel);
  await reference.waitFor({ state: 'visible', timeout: 15_000 });

  const ownerOption = page.locator('option', { hasText: 'Synthetic Owner' });
  const clientOption = page.locator('option', { hasText: 'Synthetic Client' });
  const owner = create.locator('select').filter({ has: ownerOption });
  const client = create.locator('select').filter({ has: clientOption });
  const dirtyMarker = page.locator('[data-dirty="true"]');
  if ((await create.locator('select[aria-busy="true"]').count()) !== 2) {
    throw new Error('Both create pickers must be loading before the first keystroke.');
  }

  await reference.evaluate((input) => {
    for (const eventType of ['keydown', 'input']) {
      input.addEventListener(eventType, (event) => {
        input.dataset[event.type] = String(event.isTrusted);
      });
    }
  });
  await reference.pressSequentially('T');
  await expectValue(reference, 'T', result, 'first-character-while-both-pickers-load');
  for (const eventType of ['keydown', 'input']) {
    if ((await reference.getAttribute('data-' + eventType)) !== 'true') {
      throw new Error('Expected a trusted ' + eventType + ' event from keyboard entry.');
    }
  }
  result.steps.push({ step: 'trusted-keydown-and-input' });
  await dirtyMarker.first().waitFor({ state: 'attached' });
  result.steps.push({ step: 'console-marks-form-dirty' });

  ownerGate.resolve();
  await owner.locator(ownerOption).waitFor({ state: 'attached' });
  await expectValue(reference, 'T', result, 'first-character-after-owner-load');
  if ((await create.locator('select[aria-busy="true"]').count()) !== 1) {
    throw new Error('Client picker must still be loading after owner options arrive.');
  }
  clientGate.resolve();
  await client.locator(clientOption).waitFor({ state: 'attached' });
  await expectValue(reference, 'T', result, 'first-character-after-client-load');

  await reference.pressSequentially(REFERENCE.slice(1));
  await expectValue(reference, REFERENCE, result, 'full-reference');
  await expectValue(name, '', result, 'name-still-empty');
  await name.pressSequentially(PROGRAM_NAME);
  await owner.selectOption(OWNER_ID);
  await client.selectOption(CLIENT_ID);
  await expectValue(reference, REFERENCE, result, 'reference-after-picker-selection');

  await page.getByRole('button', { name: labels.createButton }).click();
  await page.getByText(labels.duplicate).waitFor({ timeout: 10_000 });
  result.steps.push({ step: 'duplicate-feedback' });

  await expectValue(reference, REFERENCE, result, 'reference-after-duplicate');
  await reference.press('ControlOrMeta+a');
  await reference.press('Backspace');
  await expectValue(reference, '', result, 'reference-after-keyboard-clear');
  await reference.pressSequentially(REFERENCE);
  await expectValue(reference, REFERENCE, result, 'reference-after-retype');
  await page.getByRole('button', { name: labels.createButton }).click();
  await page.getByText(labels.created).waitFor({ timeout: 10_000 });
  result.steps.push({ step: 'created-success' });
  await reference.waitFor({ state: 'hidden' });
  await dirtyMarker.first().waitFor({ state: 'detached' });
  result.steps.push({ step: 'successful-save-clears-dirty-marker' });

  await page.getByRole('button', { name: PROGRAM_NAME }).waitFor({ timeout: 10_000 });
  result.steps.push({ step: 'list-shows-created-program' });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await signIn(page, locale);
  await page.getByRole('button', { name: PROGRAM_NAME }).waitFor({ timeout: 15_000 });
  result.steps.push({ step: 'reload-and-sign-in-keeps-created-program' });

  const shot = path.join(OUTPUT, `pr-277-${locale}-${viewport.name}.png`);
  await page.screenshot({ fullPage: true, path: shot });
  result.screenshot = path.relative(ROOT, shot);
  result.posts = state.posts;

  await context.close();
  return result;
}

async function expectValue(locator, expected, result, step) {
  const value = await locator.inputValue();
  if (value !== expected) {
    throw new Error(`${step}: expected "${expected}", got "${value}"`);
  }
  result.steps.push({ step, value });
}

const browser = await chromium.launch({ executablePath: CHROME });
const browserVersion = browser.version();
await mkdir(OUTPUT, { recursive: true });
const results = [];

try {
  for (const locale of LOCALES) {
    for (const viewport of VIEWPORTS) {
      results.push(await runScenario(browser, locale, viewport));
    }
  }
} finally {
  await browser.close();
}

const report = {
  browser: CHROME ? 'Google Chrome' : 'Playwright Chromium',
  browserVersion,
  reference: REFERENCE,
  programName: PROGRAM_NAME,
  results,
};

await writeFile(path.join(OUTPUT, 'report.json'), JSON.stringify(report, null, 2));
for (const entry of results) {
  if (
    entry.posts.length !== 2 ||
    entry.posts.some(
      (post) =>
        post.reference !== REFERENCE ||
        post.name !== PROGRAM_NAME ||
        post.ownerUserId !== OWNER_ID ||
        post.clientId !== CLIENT_ID,
    )
  ) {
    throw new Error(
      `PR #277 Chrome evidence failed for ${entry.locale}/${entry.viewport}: ${JSON.stringify(entry.posts)}`,
    );
  }
}
console.log(`PR #277 Chrome evidence passed (${results.length} scenarios).`);

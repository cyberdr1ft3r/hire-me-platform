// Issue #228 B0′ browser evidence: unsaved-input guards in Tasks, Admin and Messages.
// Production build (vite preview) + local API with synthetic data (seed.mjs).
//
//   WEB=http://localhost:5720 ADMIN_EMAIL=.. ADMIN_PASSWORD=.. OUT=<dir> [VIDEO=1] node evidence.mjs > results.json
//
// Every step records whether a native confirmation (in-app guard) or a beforeunload
// prompt appeared, the URL after the step, and whether the typed value survived.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const WEB = process.env.WEB ?? 'http://localhost:5720';
const OUT = process.env.OUT ?? '.';
mkdirSync(`${OUT}/screenshots`, { recursive: true });
// Video needs Playwright's ffmpeg build; opt in with VIDEO=1 once it is installed.
const VIDEO = process.env.VIDEO === '1';
if (VIDEO) mkdirSync(`${OUT}/video`, { recursive: true });

const TASK = 'Synthetic follow-up for evidence';
const results = [];

async function session({ width, height, locale, video }) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width, height },
    locale: locale === 'fr' ? 'fr-FR' : 'en-GB',
    ...(video && VIDEO ? { recordVideo: { dir: `${OUT}/video`, size: { width, height } } } : {}),
  });
  await context.addInitScript((l) => localStorage.setItem('hireme.locale', l), locale);
  const page = await context.newPage();
  const dialogs = [];
  let answer = 'dismiss';
  page.on('dialog', async (dialog) => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    if (answer === 'accept') await dialog.accept();
    else await dialog.dismiss();
  });
  await page.goto(`${WEB}/`);
  await page.fill('input[name=email]', process.env.ADMIN_EMAIL);
  await page.fill('input[name=password]', process.env.ADMIN_PASSWORD);
  await page.click('button[type=submit]');
  // The navigation is a hidden modal on phones; the shell's main region exists everywhere.
  await page.waitForSelector('main.app-shell__main');
  return {
    browser,
    context,
    page,
    dialogs,
    setAnswer: (value) => (answer = value),
  };
}

/** In-app navigation the way the router writes it (indexed entry + popstate). */
async function routeTo(page, path) {
  await page.evaluate((target) => {
    const index = (history.state?.hiremeHistoryIndex ?? 0) + 1;
    history.pushState({ hiremeHistoryIndex: index }, '', target);
    dispatchEvent(new PopStateEvent('popstate', { state: { hiremeHistoryIndex: index } }));
  }, path);
  await page.waitForTimeout(800);
}

async function step(s, name, action, expectPrompt, check) {
  const before = s.dialogs.length;
  await action();
  await s.page.waitForTimeout(700);
  const prompts = s.dialogs.slice(before);
  const url = new URL(s.page.url());
  const extra = check ? await check() : {};
  const asked = prompts.length > 0;
  const entry = {
    name,
    expectedPrompt: expectPrompt,
    prompted: asked,
    prompts,
    urlAfter: url.pathname + url.search,
    ...extra,
    pass: asked === expectPrompt && (extra.pass ?? true),
  };
  results.push(entry);
  return entry;
}

async function openTaskEdit(page) {
  // Matches the seeded task whatever an earlier run saved as its title.
  await page.getByRole('button', { name: new RegExp(`^${TASK}`) }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Edit task|Modifier la tâche/ }).click();
  return dialog.getByLabel(/^(Title|Titre)/);
}

async function shellLink(page, name) {
  const link = page.getByRole('link', { name, exact: true });
  await link.focus();
  await page.keyboard.press('Enter');
}

async function desktopTasks() {
  const s = await session({ width: 1440, height: 900, locale: 'en', video: true });
  const { page } = s;
  await routeTo(page, '/tasks');

  let title = await openTaskEdit(page);
  await title.focus();
  await step(s, 'tasks: unchanged edit form, shell link', () => shellLink(page, 'My Agenda'), false, async () => ({
    pass: new URL(page.url()).pathname === '/agenda',
  }));
  await page.goBack();
  await page.waitForTimeout(800);

  title = await openTaskEdit(page);
  const savedTitle = await title.inputValue();
  await title.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' (edited)');
  await step(s, 'tasks: changed title, shell link (stay)', () => shellLink(page, 'My Agenda'), true, async () => ({
    kept: await title.inputValue(),
    pass: new URL(page.url()).pathname === '/tasks' && (await title.inputValue()).endsWith('(edited)'),
  }));
  await page.screenshot({ path: `${OUT}/screenshots/desktop-en-tasks-dirty-kept.png` });
  await step(s, 'tasks: changed title, browser Back (stay)', () => page.goBack().catch(() => undefined), true, async () => ({
    pass: new URL(page.url()).pathname === '/tasks' && (await title.inputValue()).endsWith('(edited)'),
  }));
  await step(s, 'tasks: changed title, reload (stay)', () => page.reload({ timeout: 3000 }).catch(() => undefined), true, async () => ({
    pass: (await title.inputValue().catch(() => '')).endsWith('(edited)'),
  }));

  await title.fill(savedTitle);
  await step(s, 'tasks: title restored to saved value, shell link', () => shellLink(page, 'My Agenda'), false, async () => ({
    pass: new URL(page.url()).pathname === '/agenda',
  }));
  await page.goBack();
  await page.waitForTimeout(800);

  title = await openTaskEdit(page);
  await title.fill(`${TASK} (saved ${new Date().toISOString().slice(11, 19)})`);
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await page.getByText('Task updated.').first().waitFor();
  await step(s, 'tasks: after a successful save, shell link', () => shellLink(page, 'My Agenda'), false, async () => ({
    pass: new URL(page.url()).pathname === '/agenda',
  }));
  await page.goBack();
  await page.waitForTimeout(800);

  const search = page.getByLabel('Search tasks');
  await search.fill('synthetic');
  await step(s, 'tasks: search filter typed, shell link', () => shellLink(page, 'My Agenda'), false, async () => ({
    pass: new URL(page.url()).pathname === '/agenda',
  }));

  // Admin: create form is reset after saving; profile form stays open after saving.
  await routeTo(page, '/admin');
  const create = page.getByRole('form', { name: 'Create internal user' });
  await create.getByLabel('Display name').fill('Evidence User');
  await step(s, 'admin: create form typed, browser Back (stay)', () => page.goBack().catch(() => undefined), true, async () => ({
    pass: new URL(page.url()).pathname === '/admin',
  }));
  await create.getByLabel('Email').fill(`evidence${Date.now()}@example.test`);
  await create.getByLabel('Initial password').fill('Evidence-Synthetic-Pass1!');
  await create.getByRole('button', { name: 'Create user' }).click();
  await page.getByText('User created.').first().waitFor();
  await step(s, 'admin: create form reset after saving, browser Back', () => page.goBack().catch(() => undefined), false, async () => ({
    pass: new URL(page.url()).pathname !== '/admin',
  }));
  await page.goForward();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /^Synthetic Peer/ }).first().click();
  const detail = page.getByRole('region', { name: 'Selected user detail' });
  const displayName = detail.getByLabel('Display name');
  await displayName.fill(`Synthetic Peer ${new Date().toISOString().slice(11, 19)}`);
  await step(s, 'admin: profile changed, reload (stay)', () => page.reload({ timeout: 3000 }).catch(() => undefined), true);
  await detail.getByRole('button', { name: 'Update profile' }).click();
  await page.getByText('User updated.').first().waitFor();
  await page.screenshot({ path: `${OUT}/screenshots/desktop-en-admin-profile-saved.png` });
  await step(s, 'admin: profile saved and still open, browser Back', () => page.goBack().catch(() => undefined), false, async () => ({
    pass: new URL(page.url()).pathname !== '/admin',
  }));

  // Messages: an unsent draft asks; a sent message clears it.
  await routeTo(page, '/messages');
  await page.getByRole('button', { name: /Synthetic Peer/ }).first().click();
  const composer = page.getByRole('textbox', { name: 'Message' });
  await composer.click();
  await page.keyboard.type('Synthetic draft for evidence');
  await step(s, 'messages: unsent draft, browser Back (stay)', () => page.goBack().catch(() => undefined), true, async () => ({
    pass: new URL(page.url()).pathname === '/messages' && (await composer.inputValue()) !== '',
  }));
  await page.screenshot({ path: `${OUT}/screenshots/desktop-en-messages-draft-kept.png` });
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(1200);
  await step(s, 'messages: draft sent, browser Back', () => page.goBack().catch(() => undefined), false, async () => ({
    pass: new URL(page.url()).pathname !== '/messages',
  }));

  await s.context.close();
  await s.browser.close();
}

async function frenchPrompt() {
  const s = await session({ width: 1024, height: 768, locale: 'fr', video: false });
  const { page } = s;
  await routeTo(page, '/tasks');
  const title = await openTaskEdit(page);
  await title.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' (modifié)');
  await step(s, 'tasks (FR, 1024px): changed title, browser Back (stay)', () => page.goBack().catch(() => undefined), true, async () => ({
    pass: new URL(page.url()).pathname === '/tasks',
  }));
  await page.screenshot({ path: `${OUT}/screenshots/tablet-fr-tasks-dirty-kept.png` });
  await s.browser.close();
}

async function mobileTasks() {
  const s = await session({ width: 390, height: 844, locale: 'en', video: true });
  const { page } = s;
  await routeTo(page, '/tasks');
  const title = await openTaskEdit(page);
  await title.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' (mobile)');
  await step(s, 'tasks (390px): changed title, browser Back (stay)', () => page.goBack().catch(() => undefined), true, async () => ({
    pass: new URL(page.url()).pathname === '/tasks' && (await title.inputValue()).endsWith('(mobile)'),
  }));
  await page.screenshot({ path: `${OUT}/screenshots/mobile-en-tasks-dirty-kept.png` });
  await step(s, 'tasks (390px): changed title, reload (stay)', () => page.reload({ timeout: 3000 }).catch(() => undefined), true);
  s.setAnswer('accept');
  await step(s, 'tasks (390px): changed title, Back and discard', () => page.goBack().catch(() => undefined), true, async () => ({
    pass: new URL(page.url()).pathname !== '/tasks',
  }));
  await s.context.close();
  await s.browser.close();
}

try {
  await desktopTasks();
  await frenchPrompt();
  await mobileTasks();
} finally {
  console.log(
    JSON.stringify(
      { date: new Date().toISOString(), web: WEB, passed: results.filter((r) => r.pass).length, total: results.length, results },
      null,
      2,
    ),
  );
}

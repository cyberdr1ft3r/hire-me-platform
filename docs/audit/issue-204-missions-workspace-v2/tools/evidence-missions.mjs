// Issue #204 stage D evidence: Missions v2.0 on a production build against a local API with
// synthetic data. usage: node evidence-missions.mjs <playwright> <outDir>
//   env: WEB, API, EMAIL, PW, LABEL (after | before)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2]);
const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });
const { WEB, API, EMAIL, PW } = process.env;
const LABEL = process.env.LABEL ?? 'after';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail);
};
const SIZES = [
  [1440, 900, ''],
  [1024, 768, ''],
  [768, 1024, ''],
  [390, 844, ''],
  [390, 500, 'short / keyboard open'],
  [720, 450, '1440 at 200% zoom'],
];
const T = {
  en: { open: 'Open full record', back: /Back to missions/, close: 'Close', edit: 'Edit mission', pipeline: 'Pipeline', overview: 'Overview', search: 'Search' },
  fr: { open: 'Ouvrir la fiche complète', back: /Retour aux missions/, close: 'Fermer', edit: 'Modifier la mission', pipeline: 'Vivier', overview: 'Vue d’ensemble', search: 'Rechercher' },
};
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const go = (p, path) =>
  p.evaluate((x) => {
    history.pushState({ hiremeHistoryIndex: (history.state?.hiremeHistoryIndex ?? 0) + 1 }, '', x);
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }, path);

// A mission that has a candidate pipeline, for the Pipeline screenshot.
const login = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PW }) })).json();
const auth = { authorization: `Bearer ${login.accessToken}` };
const missions = (await (await fetch(`${API}/v1/missions?page=1&pageSize=100`, { headers: auth })).json()).missions;
let pipelineMission = null;
for (const m of missions) {
  const c = await (await fetch(`${API}/v1/missions/${m.id}/candidates?page=1&pageSize=1`, { headers: auth })).json();
  if ((c.pagination?.total ?? 0) > 0) { pipelineMission = m; break; }
}
console.log('pipeline mission', pipelineMission?.title);

const b = await chromium.launch({ channel: 'chrome', headless: true });
for (const locale of ['en', 'fr']) {
  const t = T[locale];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((l) => { try { localStorage.setItem('hireme.locale', l); } catch {} }, locale);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(`${WEB}/`);
  await p.fill('input[name=email]', EMAIL);
  await p.fill('input[name=password]', PW);
  await p.click('button[type=submit]');
  await p.getByRole('button', { name: /^Notifications/ }).waitFor({ timeout: 20000 });
  await go(p, '/missions');

  if (LABEL === 'before') {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      await p.setViewportSize({ width: w, height: h });
      await p.locator('.mission-list__select').first().waitFor({ timeout: 20000 });
      await p.waitForTimeout(500);
      await p.screenshot({ path: `${OUT}/before-${locale}-missions-${w}x${h}.png` });
    }
    await ctx.close();
    continue;
  }

  const rows = () => p.locator('.mission-directory__open');
  await rows().first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(400);
  const toolbar = await p.evaluate(() => Math.round(document.querySelector('.missions__list-pane > .ui-workspace__toolbar')?.getBoundingClientRect().height ?? 0));
  check(`${locale} 1440: directory toolbar height`, toolbar > 0 && toolbar < 120, `${toolbar}px`);

  for (const [w, h, note] of SIZES) {
    const tag = `${locale} ${w}x${h}${note ? ` (${note})` : ''}`;
    await p.setViewportSize({ width: w, height: h });
    await rows().first().waitFor();
    await p.waitForTimeout(400);
    const layout = await p.evaluate(() => ({ panes: document.querySelectorAll('.ui-workspace__pane').length, view: document.querySelector('.ui-workspace__layout')?.getAttribute('data-view') }));
    check(`${tag}: one full-width directory pane`, layout.panes === 1 && layout.view === 'list', JSON.stringify(layout));
    check(`${tag}: directory has no horizontal overflow`, (await overflow(p)) <= 0, String(await overflow(p)));
    if (w === 1440 || w === 390) await p.screenshot({ path: `${OUT}/${locale}-directory-${w}x${h}.png` });

    await p.evaluate(() => window.scrollTo(0, 200));
    await p.waitForTimeout(150);
    const scrollBefore = await p.evaluate(() => Math.round(window.scrollY));
    const row = rows().nth(1);
    await row.focus();
    await row.press('Enter');
    await p.waitForTimeout(450);
    const workspaceRem = await p.evaluate(() => document.querySelector('.missions').getBoundingClientRect().width / parseFloat(getComputedStyle(document.documentElement).fontSize));
    const expectSheet = workspaceRem < 44;
    const sheet = await p.locator('.ui-drawer[data-placement="bottom"]').count();
    check(`${tag}: preview is a ${expectSheet ? 'bottom sheet' : 'side pane'} (workspace ${workspaceRem.toFixed(1)}rem)`, expectSheet ? sheet === 1 : sheet === 0 && (await p.locator('[data-pane="detail"] .mission-preview').count()) === 1);
    check(`${tag}: preview has no horizontal overflow`, (await overflow(p)) <= 0);
    if (expectSheet) {
      const geo = await p.evaluate(() => {
        const panel = document.querySelector('.ui-drawer__panel').getBoundingClientRect();
        const footer = document.querySelector('.ui-drawer__footer').getBoundingClientRect();
        const body = document.querySelector('.ui-drawer__body');
        return { top: Math.round(panel.top), bottom: Math.round(panel.bottom), vh: innerHeight, footerVisible: footer.top >= 0 && footer.bottom <= innerHeight + 1, fitsOrScrolls: body.scrollHeight <= body.clientHeight || body.scrollHeight > body.clientHeight && getComputedStyle(body).overflowY === 'auto', titleFocused: document.activeElement?.classList.contains('ui-drawer__title'), rootInert: document.getElementById('root')?.inert === true };
      });
      check(`${tag}: sheet visible at once, actions inside the viewport, content fits or scrolls`, geo.top >= 0 && geo.bottom <= geo.vh + 1 && geo.footerVisible && geo.fitsOrScrolls, JSON.stringify(geo));
      check(`${tag}: sheet focuses its title, app behind is inert`, geo.titleFocused && geo.rootInert);
      for (let i = 0; i < 5; i++) await p.keyboard.press('Tab');
      check(`${tag}: Tab stays inside the sheet`, await p.evaluate(() => !!document.activeElement?.closest('.ui-drawer__panel')));
      await p.screenshot({ path: `${OUT}/${locale}-sheet-${w}x${h}.png` });
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      const after = await p.evaluate(() => ({ open: !!document.querySelector('.ui-drawer'), y: Math.round(window.scrollY), focusRow: document.activeElement?.classList.contains('mission-directory__open') }));
      check(`${tag}: Escape closes, focus back on the row, list scroll kept`, !after.open && after.focusRow && Math.abs(after.y - scrollBefore) <= 2, `${JSON.stringify(after)} before=${scrollBefore}`);
      await row.click();
      await p.waitForTimeout(300);
      await p.locator('.ui-drawer__footer').getByRole('button', { name: t.open }).click();
    } else {
      check(`${tag}: pane focuses its heading`, await p.evaluate(() => document.activeElement?.closest('.mission-preview') !== null));
      if (w === 1440) await p.screenshot({ path: `${OUT}/${locale}-preview-${w}x${h}.png` });
      await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
      check(`${tag}: Escape closes the pane, focus back on the row`, await p.evaluate(() => document.activeElement?.classList.contains('mission-directory__open')));
      await row.click();
      await p.getByRole('button', { name: t.open }).click();
    }

    await p.waitForSelector('.mission-record .mission-detail__title', { timeout: 20000 });
    await p.waitForTimeout(600);
    check(`${tag}: record opens with focus on its heading`, await p.evaluate(() => document.activeElement?.classList.contains('mission-detail__title')));
    check(`${tag}: record URL is the mission deep link`, /\?mission=[0-9a-f-]{36}$/.test(p.url()), p.url());
    check(`${tag}: record has no horizontal overflow`, (await overflow(p)) <= 0, String(await overflow(p)));
    if (w === 1440 || w === 390) await p.screenshot({ path: `${OUT}/${locale}-record-${w}x${h}.png` });
    await p.getByRole('button', { name: t.back }).click();
    await rows().first().waitFor();
    await p.waitForTimeout(300);
    check(`${tag}: Back to missions returns focus to the row`, await p.evaluate(() => document.activeElement?.classList.contains('mission-directory__open')));
  }

  // Pipeline tab on a mission with candidates (1440 and 390).
  if (pipelineMission) {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      await p.setViewportSize({ width: w, height: h });
      await rows().first().waitFor();
      const search = p.getByRole('searchbox', { name: t.search });
      await search.fill(pipelineMission.title);
      await search.press('Enter');
      await p.waitForTimeout(1200);
      await rows().filter({ hasText: pipelineMission.title }).first().click();
      await p.waitForTimeout(300);
      const openButton = (await p.locator('.ui-drawer__footer').count()) ? p.locator('.ui-drawer__footer').getByRole('button', { name: t.open }) : p.getByRole('button', { name: t.open });
      await openButton.click();
      await p.waitForSelector('.mission-record .mission-detail__title');
      await p.getByRole('tab', { name: t.pipeline }).click();
      await p.waitForTimeout(1200);
      check(`${locale} ${w}x${h}: Pipeline section lists candidates without overflow`, (await p.locator('.mission-record [role="tabpanel"]:not([hidden]) li, .mission-record [role="tabpanel"]:not([hidden]) tr').count()) > 0 && (await overflow(p)) <= 0);
      await p.screenshot({ path: `${OUT}/${locale}-record-pipeline-${w}x${h}.png`, fullPage: w === 1440 });
      await p.getByRole('tab', { name: t.overview }).click();
      await p.getByRole('button', { name: t.back }).click();
      await rows().first().waitFor();
      await p.getByRole('searchbox', { name: t.search }).fill('');
      await p.getByRole('searchbox', { name: t.search }).press('Enter');
      await p.waitForTimeout(1000);
    }
  }

  // History, reload, unsaved input (1440).
  await p.setViewportSize({ width: 1440, height: 900 });
  await rows().nth(2).click();
  await p.getByRole('button', { name: t.open }).click();
  await p.waitForSelector('.mission-record .mission-detail__title');
  const recordUrl = p.url();
  await p.goBack();
  await rows().first().waitFor();
  check(`${locale}: browser Back returns to the directory`, new URL(p.url()).search === '');
  await p.goForward();
  await p.waitForSelector('.mission-record .mission-detail__title');
  check(`${locale}: browser Forward reopens the record`, p.url() === recordUrl);
  await p.reload();
  await p.waitForSelector('.mission-record .mission-detail__title', { timeout: 20000 });
  check(`${locale}: reload keeps the record (deep link)`, p.url() === recordUrl);
  await p.getByRole('button', { name: t.edit }).click();
  const titleField = p.locator('.mission-record form input[name="title"]').first();
  await titleField.fill('Synthetic edited title');
  const dialogs = [];
  p.once('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
  await p.goBack();
  await p.waitForTimeout(1200);
  check(`${locale}: Back with unsaved input asks and stays`, dialogs.length === 1 && p.url() === recordUrl && (await titleField.inputValue()) === 'Synthetic edited title', dialogs[0]);
  p.once('dialog', (d) => { dialogs.push(d.message()); void d.accept(); });
  await p.goBack();
  await rows().first().waitFor({ timeout: 10000 });
  check(`${locale}: accepting leaves for the directory`, dialogs.length === 2 && new URL(p.url()).search === '');

  // A fresh session opening the deep link directly.
  const ctx2 = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx2.addInitScript((l) => { try { localStorage.setItem('hireme.locale', l); } catch {} }, locale);
  const p2 = await ctx2.newPage();
  await p2.goto(recordUrl);
  await p2.fill('input[name=email]', EMAIL);
  await p2.fill('input[name=password]', PW);
  await p2.click('button[type=submit]');
  await p2.waitForSelector('.mission-record .mission-detail__title', { timeout: 20000 });
  check(`${locale}: deep link opens the record in a new session after sign-in`, p2.url() === recordUrl);
  await ctx2.close();
  check(`${locale}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await b.close();
writeFileSync(`${OUT}/results-${LABEL}.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

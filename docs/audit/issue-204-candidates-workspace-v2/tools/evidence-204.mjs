// Issue #204 browser evidence: Candidates v2.0 on a production build against a local API with
// synthetic data. usage: node evidence-204.mjs <playwright> <outDir>  env: WEB, EMAIL, PW, MODE=after|before
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2]);
const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });
const { WEB, EMAIL, PW } = process.env;
const MODE = process.env.MODE ?? 'after';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail);
};
const SIZES = [
  [1440, 900],
  [1024, 768],
  [768, 1024],
  [390, 844],
];
const T = {
  en: { open: 'Open full profile', back: /Back to candidates/, close: 'Close preview', tasks: 'Tasks', dir: 'Candidate directory', edit: 'Edit profile' },
  fr: { open: 'Ouvrir le profil complet', back: /Retour aux candidats/, close: 'Fermer l’aperçu', tasks: 'Tâches', dir: 'Répertoire des candidats', edit: 'Modifier le profil' },
};
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const go = (p, path) =>
  p.evaluate((x) => {
    history.pushState({ hiremeHistoryIndex: (history.state?.hiremeHistoryIndex ?? 0) + 1 }, '', x);
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }, path);

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
  await go(p, '/candidates');

  if (MODE === 'before') {
    for (const [w, h] of SIZES) {
      await p.setViewportSize({ width: w, height: h });
      await p.waitForSelector('.candidate-list__select');
      await p.waitForTimeout(600);
      await p.screenshot({ path: `${OUT}/before-${locale}-directory-${w}.png` });
    }
    await ctx.close();
    continue;
  }

  const rowButtons = () => p.locator('.candidate-directory__open');
  for (const [w, h] of SIZES) {
    const tag = `${locale} ${w}x${h}`;
    await p.setViewportSize({ width: w, height: h });
    await rowButtons().first().waitFor({ timeout: 20000 });
    await p.waitForTimeout(500);
    const layout = await p.evaluate(() => ({
      panes: document.querySelectorAll('.ui-workspace__pane').length,
      view: document.querySelector('.ui-workspace__layout')?.getAttribute('data-view'),
      tableWidth: Math.round(document.querySelector('.candidate-directory__table')?.getBoundingClientRect().width ?? 0),
      surfaceWidth: Math.round(document.querySelector('.ui-workspace__layout')?.getBoundingClientRect().width ?? 0),
    }));
    check(`${tag}: full-width directory, no empty record pane`, layout.panes === 1 && layout.view === 'list' && layout.tableWidth >= layout.surfaceWidth - 80, JSON.stringify(layout));
    check(`${tag}: directory has no horizontal page overflow`, (await overflow(p)) <= 0, String(await overflow(p)));
    await p.screenshot({ path: `${OUT}/after-${locale}-directory-${w}.png` });

    // Preview from the first row.
    await rowButtons().first().click();
    const preview = p.locator('.candidate-preview');
    await preview.waitFor();
    const focusOk = await p.evaluate(() => document.activeElement?.closest('.candidate-preview') !== null && document.activeElement?.tagName === 'H2');
    check(`${tag}: preview opens with focus on its heading`, focusOk);
    check(`${tag}: preview has no horizontal page overflow`, (await overflow(p)) <= 0, String(await overflow(p)));
    const side = await p.evaluate(() => {
      const list = document.querySelector('[data-pane="list"]').getBoundingClientRect();
      const pv = document.querySelector('[data-pane="detail"]').getBoundingClientRect();
      return { sideBySide: pv.left >= list.right - 2, previewWidth: Math.round(pv.width) };
    });
    check(`${tag}: preview ${w >= 1024 ? 'beside' : 'stacked with'} the directory`, w >= 1024 ? side.sideBySide : true, JSON.stringify(side));
    await p.screenshot({ path: `${OUT}/after-${locale}-preview-${w}.png` });

    // Escape returns focus to the row.
    await p.keyboard.press('Escape');
    await preview.waitFor({ state: 'detached' });
    const backOnRow = await p.evaluate(() => document.activeElement?.classList.contains('candidate-directory__open'));
    check(`${tag}: Escape closes the preview and returns focus to the row`, backOnRow);

    // Focused record.
    await rowButtons().first().click();
    await p.getByRole('button', { name: t.open }).click();
    await p.waitForSelector('.candidate-record .candidate-detail h2');
    await p.waitForTimeout(600);
    const recordFocus = await p.evaluate(() => document.activeElement?.closest('.candidate-detail__heading') !== null);
    check(`${tag}: record opens with focus on its heading`, recordFocus);
    check(`${tag}: record URL is the candidate deep link`, /\?candidate=[0-9a-f-]{36}$/.test(p.url()), p.url());
    check(`${tag}: record has no horizontal page overflow`, (await overflow(p)) <= 0, String(await overflow(p)));
    await p.screenshot({ path: `${OUT}/after-${locale}-record-${w}.png`, fullPage: w === 1440 });
    if (w === 1440) {
      await p.getByRole('tab', { name: t.tasks }).click();
      await p.waitForTimeout(800);
      await p.screenshot({ path: `${OUT}/after-${locale}-record-tasks-${w}.png` });
      await p.getByRole('tab', { name: locale === 'en' ? 'Profile' : 'Profil' }).click();
    }
    await p.getByRole('button', { name: t.back }).click();
    await rowButtons().first().waitFor();
    await p.waitForTimeout(300);
    const rowFocus = await p.evaluate(() => document.activeElement?.classList.contains('candidate-directory__open'));
    check(`${tag}: Back to candidates returns focus to the row`, rowFocus);
  }

  // Keyboard-only path at 1440: Tab into the directory, Enter previews, Open full profile, browser Back/Forward.
  await p.setViewportSize({ width: 1440, height: 900 });
  await rowButtons().nth(1).focus();
  await p.keyboard.press('Enter');
  await p.locator('.candidate-preview').waitFor();
  const label = () => p.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim());
  await p.keyboard.press('Tab');
  const forward = await label();
  await p.keyboard.press('Shift+Tab');
  const backward = await label();
  check(`${locale}: keyboard reaches Open full profile (Tab) and Close (Shift+Tab) from the preview heading`, forward === t.open && backward === t.close, `${forward} | ${backward}`);
  await p.getByRole('button', { name: t.open }).press('Enter');
  await p.waitForSelector('.candidate-record .candidate-detail h2');
  const recordUrl = p.url();
  await p.goBack();
  await rowButtons().first().waitFor();
  check(`${locale}: browser Back returns to the directory`, new URL(p.url()).search === '', p.url());
  await p.goForward();
  await p.waitForSelector('.candidate-record .candidate-detail h2');
  check(`${locale}: browser Forward reopens the record`, p.url() === recordUrl, p.url());

  // Reload on the record: the deep link restores it in a fresh document.
  await p.reload();
  await p.waitForSelector('.candidate-record .candidate-detail h2', { timeout: 20000 });
  check(`${locale}: reload keeps the focused record (deep link)`, p.url() === recordUrl);

  // Unsaved input: Back asks; dismissing stays, accepting leaves.
  await p.getByRole('button', { name: t.edit }).click();
  await p.locator('.candidate-record input[name=city]').fill('Synthetic City');
  const dialogs = [];
  p.once('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
  await p.goBack();
  await p.waitForTimeout(1200);
  check(`${locale}: Back with unsaved input asks and stays when dismissed`, dialogs.length === 1 && p.url() === recordUrl && (await p.locator('.candidate-record input[name=city]').inputValue()) === 'Synthetic City', dialogs[0]);
  p.once('dialog', (d) => { dialogs.push(d.message()); void d.accept(); });
  await p.goBack();
  await rowButtons().first().waitFor({ timeout: 10000 });
  check(`${locale}: accepting leaves for the directory`, dialogs.length === 2 && new URL(p.url()).search === '', p.url());

  // A fresh browser session opening the deep link directly.
  const ctx2 = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx2.addInitScript((l) => { try { localStorage.setItem('hireme.locale', l); } catch {} }, locale);
  const p2 = await ctx2.newPage();
  await p2.goto(recordUrl);
  await p2.fill('input[name=email]', EMAIL);
  await p2.fill('input[name=password]', PW);
  await p2.click('button[type=submit]');
  await p2.waitForSelector('.candidate-record .candidate-detail h2', { timeout: 20000 });
  check(`${locale}: deep link opens the record in a new browser session after sign-in`, p2.url() === recordUrl);
  await ctx2.close();

  check(`${locale}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await b.close();
writeFileSync(`${OUT}/results-${MODE}.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

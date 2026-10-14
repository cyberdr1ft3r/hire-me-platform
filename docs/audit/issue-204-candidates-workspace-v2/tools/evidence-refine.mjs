// Issue #204 refinement evidence (PR #205): desktop pane, mobile sheet, focused record, menu.
// usage: node evidence-refine.mjs <playwright> <outDir>   env: WEB, EMAIL, PW, LABEL (file prefix)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2]);
const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });
const { WEB, EMAIL, PW } = process.env;
const LABEL = process.env.LABEL ?? 'after';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail);
};
// [width, height, note]; 720x450 is a 1440x900 window at 200% browser zoom.
const SIZES = [
  [1440, 900, ''],
  [1024, 768, ''],
  [768, 1024, ''],
  [390, 844, ''],
  [390, 500, 'short / keyboard open'],
  [720, 450, '1440 at 200% zoom'],
];
const T = {
  en: { open: 'Open full profile', back: /Back to candidates/, tasks: 'Tasks', profile: 'Profile', edit: 'Edit profile', more: 'More actions', close: 'Close' },
  fr: { open: 'Ouvrir le profil complet', back: /Retour aux candidats/, tasks: 'Tâches', profile: 'Profil', edit: 'Modifier le profil', more: 'Plus d’actions', close: 'Fermer' },
};
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const go = (p, path) =>
  p.evaluate((x) => {
    history.pushState({ hiremeHistoryIndex: (history.state?.hiremeHistoryIndex ?? 0) + 1 }, '', x);
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }, path);
const active = (p) => p.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.trim().slice(0, 60), label: document.activeElement?.getAttribute('aria-label') }));

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
  const rows = () => p.locator('.candidate-directory__open');
  await rows().first().waitFor({ timeout: 20000 });

  // Toolbar height (same measure for the previous build, see LABEL).
  await p.waitForTimeout(500);
  const toolbar = await p.evaluate(() => Math.round(document.querySelector('.candidates__list-pane > .ui-workspace__toolbar')?.getBoundingClientRect().height ?? 0));
  check(`${locale} 1440: directory toolbar height`, toolbar > 0, `${toolbar}px`);
  if (LABEL !== 'after') {
    writeFileSync(`${OUT}/toolbar-${LABEL}-${locale}.json`, JSON.stringify({ toolbar }));
    await p.screenshot({ path: `${OUT}/${LABEL}-${locale}-directory-1440.png` });
    await ctx.close();
    continue;
  }

  for (const [w, h, note] of SIZES) {
    const tag = `${locale} ${w}x${h}${note ? ` (${note})` : ''}`;
    await p.setViewportSize({ width: w, height: h });
    await rows().first().waitFor();
    await p.waitForTimeout(400);
    check(`${tag}: directory has no horizontal overflow`, (await overflow(p)) <= 0, String(await overflow(p)));
    if (w === 1440 || w === 390) await p.screenshot({ path: `${OUT}/${locale}-directory-${w}x${h}.png` });

    // Scroll the directory a little, then preview the third row.
    await p.evaluate(() => window.scrollTo(0, 260));
    await p.waitForTimeout(150);
    const scrollBefore = await p.evaluate(() => Math.round(window.scrollY));
    const row = rows().nth(2);
    await row.focus();
    await row.press('Enter');
    await p.waitForTimeout(450);
    const sheet = await p.locator('.ui-drawer[data-placement="bottom"]').count();
    // The rule: below a 44rem Candidates workspace the preview is a sheet, otherwise a side pane.
    const workspaceRem = await p.evaluate(() => document.querySelector('.candidates').getBoundingClientRect().width / parseFloat(getComputedStyle(document.documentElement).fontSize));
    const expectSheet = workspaceRem < 44;
    check(`${tag}: preview is a ${expectSheet ? 'bottom sheet' : 'side pane'} (workspace ${workspaceRem.toFixed(1)}rem)`, expectSheet ? sheet === 1 : sheet === 0 && (await p.locator('[data-pane="detail"] .candidate-preview').count()) === 1);
    if (expectSheet) {
      const geo = await p.evaluate(() => {
        const panel = document.querySelector('.ui-drawer__panel').getBoundingClientRect();
        const footer = document.querySelector('.ui-drawer__footer').getBoundingClientRect();
        const body = document.querySelector('.ui-drawer__body');
        return {
          top: Math.round(panel.top), bottom: Math.round(panel.bottom), vh: innerHeight,
          footerVisible: footer.top >= 0 && footer.bottom <= innerHeight + 1,
          bodyScrollable: body.scrollHeight > body.clientHeight,
          titleFocused: document.activeElement?.classList.contains('ui-drawer__title'),
          rootInert: document.getElementById('root')?.inert === true,
        };
      });
      check(`${tag}: sheet visible at once, actions not clipped`, geo.bottom <= geo.vh + 1 && geo.top >= 0 && geo.footerVisible, JSON.stringify(geo));
      check(`${tag}: sheet takes focus on its title, app behind is inert`, geo.titleFocused && geo.rootInert);
      const fits = await p.evaluate(() => { const body = document.querySelector('.ui-drawer__body'); return body.scrollHeight <= body.clientHeight; });
      check(`${tag}: sheet content fits or its body scrolls on its own`, fits || geo.bodyScrollable, JSON.stringify({ ...geo, fits }));
      // Tab stays inside the sheet.
      for (let i = 0; i < 5; i++) await p.keyboard.press('Tab');
      const inside = await p.evaluate(() => !!document.activeElement?.closest('.ui-drawer__panel'));
      check(`${tag}: Tab stays inside the sheet`, inside, JSON.stringify(await active(p)));
      await p.screenshot({ path: `${OUT}/${locale}-sheet-${w}x${h}.png` });
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      const after = await p.evaluate(() => ({ open: !!document.querySelector('.ui-drawer'), y: Math.round(window.scrollY), focusRow: document.activeElement?.classList.contains('candidate-directory__open') }));
      check(`${tag}: Escape closes, focus back on the row, list scroll kept`, !after.open && after.focusRow && Math.abs(after.y - scrollBefore) <= 2, `${JSON.stringify(after)} before=${scrollBefore}`);
      // Close button in the footer, then Open full profile.
      await row.click();
      await p.waitForTimeout(300);
      await p.locator('.ui-drawer__footer').getByRole('button', { name: t.close }).click();
      await p.waitForTimeout(300);
      check(`${tag}: footer Close closes the sheet`, (await p.locator('.ui-drawer').count()) === 0);
      await row.click();
      await p.waitForTimeout(300);
      await p.locator('.ui-drawer__footer').getByRole('button', { name: t.open }).click();
    } else {
      check(`${tag}: pane takes focus on its heading`, await p.evaluate(() => document.activeElement?.closest('.candidate-preview') !== null));
      if (w === 1440) await p.screenshot({ path: `${OUT}/${locale}-preview-${w}x${h}.png` });
      await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
      check(`${tag}: Escape closes the pane, focus back on the row`, await p.evaluate(() => document.activeElement?.classList.contains('candidate-directory__open')));
      await row.click();
      await p.getByRole('button', { name: t.open }).click();
    }

    // Focused record.
    await p.waitForSelector('.candidate-record .candidate-detail h2', { timeout: 20000 });
    await p.waitForTimeout(500);
    check(`${tag}: record opens with focus on its heading`, await p.evaluate(() => !!document.activeElement?.closest('.candidate-detail__heading')));
    check(`${tag}: record has no horizontal overflow`, (await overflow(p)) <= 0, String(await overflow(p)));
    const edit = p.getByRole('button', { name: t.edit });
    check(`${tag}: Edit profile is the primary record action`, (await edit.getAttribute('class'))?.includes('ui-button--primary'));
    if (w === 1440 || w === 390) await p.screenshot({ path: `${OUT}/${locale}-record-${w}x${h}.png`, fullPage: w === 1440 });

    // Overflow menu by keyboard.
    const more = p.getByRole('button', { name: t.more });
    await more.focus();
    await more.press('ArrowDown');
    const menu = await p.evaluate(() => {
      const list = document.querySelector('[role="menu"]');
      const r = list?.getBoundingClientRect();
      return { items: [...(list?.querySelectorAll('[role="menuitem"]') ?? [])].map((i) => i.textContent), focused: document.activeElement?.getAttribute('role'), inView: r ? r.left >= 0 && r.right <= innerWidth + 1 : false };
    });
    check(`${tag}: More actions menu opens on its first item, inside the viewport`, menu.items.length >= 2 && menu.focused === 'menuitem' && menu.inView, JSON.stringify(menu));
    if (w === 1440 && locale === 'en') await p.screenshot({ path: `${OUT}/${locale}-record-menu-${w}x${h}.png` });
    await p.keyboard.press('Escape');
    check(`${tag}: Escape closes the menu, focus back on its button`, await p.evaluate(() => !document.querySelector('[role="menu"]') && document.activeElement?.getAttribute('aria-haspopup') === 'menu'));

    await p.getByRole('button', { name: t.back }).click();
    await rows().first().waitFor();
    await p.waitForTimeout(300);
    check(`${tag}: Back to candidates returns focus to the row`, await p.evaluate(() => document.activeElement?.classList.contains('candidate-directory__open')));
  }

  // Focused Tasks section on the candidate that has linked tasks (the newest, first row).
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    await p.setViewportSize({ width: w, height: h });
    await rows().first().waitFor();
    await rows().first().click();
    await p.waitForTimeout(300);
    const openButton = (await p.locator('.ui-drawer__footer').count()) ? p.locator('.ui-drawer__footer').getByRole('button', { name: t.open }) : p.getByRole('button', { name: t.open });
    await openButton.click();
    await p.waitForSelector('.candidate-record .candidate-detail h2');
    await p.getByRole('tab', { name: t.tasks }).click();
    await p.locator('.candidate-related__row').first().waitFor({ timeout: 10000 });
    await p.waitForTimeout(300);
    const tasks = await p.evaluate(() => ({
      rows: document.querySelectorAll('.candidate-related__row').length,
      overdue: [...document.querySelectorAll('.candidate-related__due[data-due="overdue"]')].map((e) => e.textContent),
      today: document.querySelectorAll('.candidate-related__due[data-due="today"]').length,
      count: document.querySelector('.candidate-related__count')?.textContent,
    }));
    check(`${locale} ${w}x${h}: Tasks lists the linked tasks with status, priority and due wording`, tasks.rows === 4 && tasks.overdue.length === 1 && /Overdue|En retard/.test(tasks.overdue[0]) && tasks.today === 1, JSON.stringify(tasks));
    check(`${locale} ${w}x${h}: Tasks section has no horizontal overflow`, (await overflow(p)) <= 0);
    await p.screenshot({ path: `${OUT}/${locale}-record-tasks-${w}x${h}.png`, fullPage: w === 1440 });
    await p.getByRole('tab', { name: t.profile }).click();
    await p.getByRole('button', { name: t.back }).click();
    await rows().first().waitFor();
  }

  // History, reload, unsaved input (1440).
  await p.setViewportSize({ width: 1440, height: 900 });
  await rows().nth(1).click();
  await p.getByRole('button', { name: t.open }).click();
  await p.waitForSelector('.candidate-record .candidate-detail h2');
  const recordUrl = p.url();
  await p.goBack();
  await rows().first().waitFor();
  check(`${locale}: browser Back returns to the directory`, new URL(p.url()).search === '');
  await p.goForward();
  await p.waitForSelector('.candidate-record .candidate-detail h2');
  check(`${locale}: browser Forward reopens the record`, p.url() === recordUrl);
  await p.reload();
  await p.waitForSelector('.candidate-record .candidate-detail h2', { timeout: 20000 });
  check(`${locale}: reload keeps the record (deep link)`, p.url() === recordUrl);
  await p.getByRole('button', { name: t.edit }).click();
  await p.locator('.candidate-record input[name=city]').fill('Synthetic City');
  const dialogs = [];
  p.once('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
  await p.goBack();
  await p.waitForTimeout(1200);
  check(`${locale}: Back with unsaved input asks and stays`, dialogs.length === 1 && p.url() === recordUrl && (await p.locator('.candidate-record input[name=city]').inputValue()) === 'Synthetic City');
  p.once('dialog', (d) => { dialogs.push(d.message()); void d.accept(); });
  await p.goBack();
  await rows().first().waitFor({ timeout: 10000 });
  check(`${locale}: accepting leaves for the directory`, dialogs.length === 2 && new URL(p.url()).search === '');
  check(`${locale}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await b.close();
writeFileSync(`${OUT}/results-${LABEL}.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

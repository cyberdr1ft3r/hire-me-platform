// Issue 204 browser evidence: Clients v2.0 on a production build against a local API with
// synthetic data. usage: node evidence-clients.mjs <playwright> <outDir>
//   env: WEB, API, EMAIL, PW
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2]);
const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });
const { WEB, API, EMAIL, PW } = process.env;
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
  en: {
    open: 'Open full record',
    back: /Back to clients/,
    close: 'Close preview',
    contacts: 'Contacts',
    missions: 'Missions',
    search: 'Search',
    dir: 'Client directory',
  },
  fr: {
    open: 'Ouvrir la fiche complète',
    back: /Retour aux clients/,
    close: 'Fermer l’aperçu',
    contacts: 'Contacts',
    missions: 'Missions',
    search: 'Recherche',
    dir: 'Répertoire clients',
  },
};
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const go = (p, path) =>
  p.evaluate((x) => {
    history.pushState({ hiremeHistoryIndex: (history.state?.hiremeHistoryIndex ?? 0) + 1 }, '', x);
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }, path);

async function ensureSyntheticData(auth) {
  let clients = (await (await fetch(`${API}/v1/clients?page=1&pageSize=20`, { headers: auth })).json()).clients;
  if (clients.length < 2) {
    for (const name of ['Synthetic Client Alpha', 'Synthetic Client Beta']) {
      await fetch(`${API}/v1/clients`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ name, industry: 'Technology', city: 'Paris', country: 'France' }),
      });
    }
    clients = (await (await fetch(`${API}/v1/clients?page=1&pageSize=20`, { headers: auth })).json()).clients;
  }
  const primary = clients[0];
  const contacts = (
    await (await fetch(`${API}/v1/clients/${primary.id}/contacts?page=1&pageSize=20`, { headers: auth })).json()
  ).contacts;
  if (contacts.length === 0) {
    await fetch(`${API}/v1/clients/${primary.id}/contacts`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Synthetic Contact',
        email: 'synthetic.contact@example.test',
        roleTitle: 'Buyer',
      }),
    });
  }
  const missions = (
    await (await fetch(`${API}/v1/missions?page=1&pageSize=20&clientId=${primary.id}`, { headers: auth })).json()
  ).missions;
  if (missions.length === 0) {
    await fetch(`${API}/v1/missions`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({
        clientId: primary.id,
        title: 'Synthetic recruitment mission',
        numberOfPositions: 1,
        priority: 'NORMAL',
        location: 'Paris',
        workArrangement: 'HYBRID',
        engagementType: 'PERMANENT',
      }),
    });
  }
  return primary;
}

const login = await (
  await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PW }),
  })
).json();
const auth = { authorization: `Bearer ${login.accessToken}` };
const primaryClient = await ensureSyntheticData(auth);
console.log('primary client', primaryClient.name, primaryClient.id);

const b = await chromium.launch({ channel: 'chrome', headless: true });
for (const locale of ['en', 'fr']) {
  const t = T[locale];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((l) => {
    try {
      localStorage.setItem('hireme.locale', l);
    } catch {}
  }, locale);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  const clientDetailGets = [];
  p.on('request', (req) => {
    const u = req.url();
    if (req.method() === 'GET' && /\/v1\/clients\/[0-9a-f-]{36}$/.test(u.replace(/\?.*$/, ''))) {
      clientDetailGets.push(u);
    }
  });

  await p.goto(`${WEB}/`);
  await p.fill('input[name=email]', EMAIL);
  await p.fill('input[name=password]', PW);
  await p.click('button[type=submit]');
  await p.getByRole('button', { name: /^Notifications/ }).waitFor({ timeout: 30000 });
  clientDetailGets.length = 0;
  await go(p, '/clients');

  const rows = () => p.locator('.client-directory__open');
  await rows().first().waitFor({ timeout: 30000 });
  await p.waitForTimeout(400);

  for (const [w, h, note] of SIZES) {
    const tag = `${locale} ${w}x${h}${note ? ` (${note})` : ''}`;
    await p.setViewportSize({ width: w, height: h });
    await rows().first().waitFor();
    await p.waitForTimeout(400);
    const layout = await p.evaluate(() => ({
      panes: document.querySelectorAll('.ui-workspace__pane').length,
      view: document.querySelector('.ui-workspace__layout')?.getAttribute('data-view'),
    }));
    check(`${tag}: one full-width directory pane`, layout.panes === 1 && layout.view === 'list', JSON.stringify(layout));
    check(`${tag}: directory has no horizontal overflow`, (await overflow(p)) <= 0, String(await overflow(p)));
    if (w === 1440 || w === 390) {
      await p.screenshot({ path: `${OUT}/${locale}-directory-${w}x${h}.png` });
    }

    await p.evaluate(() => window.scrollTo(0, 200));
    await p.waitForTimeout(150);
    const scrollBefore = await p.evaluate(() => Math.round(window.scrollY));
    const detailBefore = clientDetailGets.length;
    const row = rows().nth(1);
    await row.focus();
    await row.press('Enter');
    await p.waitForTimeout(450);
    check(`${tag}: preview does not GET client detail`, clientDetailGets.length === detailBefore, String(clientDetailGets.length - detailBefore));

    const workspaceRem = await p.evaluate(
      () =>
        document.querySelector('.clients').getBoundingClientRect().width /
        parseFloat(getComputedStyle(document.documentElement).fontSize),
    );
    const expectSheet = workspaceRem < 44;
    const sheet = await p.locator('.ui-drawer[data-placement="bottom"]').count();
    check(
      `${tag}: preview is a ${expectSheet ? 'bottom sheet' : 'side pane'} (${workspaceRem.toFixed(1)}rem)`,
      expectSheet ? sheet === 1 : sheet === 0 && (await p.locator('[data-pane="detail"] .client-preview').count()) === 1,
    );
    if (expectSheet) {
      await p.screenshot({ path: `${OUT}/${locale}-sheet-${w}x${h}.png` });
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      await row.click();
      await p.waitForTimeout(300);
      await p.locator('.ui-drawer__footer').getByRole('button', { name: t.open }).click();
    } else {
      if (w === 1440) await p.screenshot({ path: `${OUT}/${locale}-preview-${w}x${h}.png` });
      await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
      await row.click();
      await p.getByRole('button', { name: t.open }).click();
    }

    await p.waitForSelector('.client-record', { timeout: 20000 });
    await p.waitForTimeout(600);
    check(`${tag}: record URL is client deep link`, /\?client=[0-9a-f-]{36}$/.test(p.url()), p.url());
    if (w === 1440 || w === 390) await p.screenshot({ path: `${OUT}/${locale}-record-${w}x${h}.png` });

    await p.getByRole('tab', { name: t.contacts }).click();
    await p.waitForTimeout(800);
    check(`${tag}: contacts tab shows contact search`, (await p.getByRole('search', { name: /Contact search|Recherche contacts/ }).count()) > 0);
    if (w === 1440) await p.screenshot({ path: `${OUT}/${locale}-record-contacts-${w}x${h}.png`, fullPage: true });

    const missionGetsBefore = await p.evaluate(() => window.__missionGets ?? 0);
    await p.route('**/v1/missions?**', (route) => {
      p.evaluate(() => {
        window.__missionGets = (window.__missionGets ?? 0) + 1;
      });
      return route.continue();
    });
    await p.getByRole('tab', { name: t.missions }).click();
    await p.waitForTimeout(1200);
    check(`${tag}: missions tab loads linked missions`, (await p.locator('.client-related-missions__list li').count()) >= 0);
    if (w === 1440) await p.screenshot({ path: `${OUT}/${locale}-record-missions-${w}x${h}.png`, fullPage: true });

    await p.getByRole('button', { name: t.back }).click();
    await rows().first().waitFor();
    await p.waitForTimeout(300);
    check(`${tag}: back returns to directory`, (await overflow(p)) <= 0);
  }

  // History and unsaved (1440).
  await p.setViewportSize({ width: 1440, height: 900 });
  await rows().nth(0).click();
  await p.getByRole('button', { name: t.open }).click();
  await p.waitForSelector('.client-record');
  const recordUrl = p.url();
  await p.goBack();
  await rows().first().waitFor();
  check(`${locale}: browser Back returns to directory`, new URL(p.url()).search === '');
  await p.goForward();
  await p.waitForSelector('.client-record');
  check(`${locale}: browser Forward reopens record`, p.url() === recordUrl);

  const nameField = p.locator('.client-record form input[name="name"]').first();
  await nameField.fill('Synthetic unsaved edit');
  const dialogs = [];
  p.once('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  await p.goBack();
  await p.waitForTimeout(800);
  check(`${locale}: unsaved Back asks and stays`, dialogs.length === 1 && p.url() === recordUrl);

  check(`${locale}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await b.close();
writeFileSync(`${OUT}/browser-checks.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);

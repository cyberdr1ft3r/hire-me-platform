// #203 real-API acceptance, transient refresh failure (phase C, focused rerun with a
// timeline). Same setup as expiry.mjs. Synthetic data only.
// usage: node expiry-transient.mjs <playwright path> <outDir>   env: WEB, API, EMAIL, PW, TTL
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2]);
const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });
const { WEB, API, EMAIL, PW } = process.env;
const TTL = Number(process.env.TTL ?? 60);
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ channel: 'chrome', headless: true });

async function session() {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('hireme.locale', 'en'); } catch {}
    Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => (window.__hmHidden ? 'hidden' : 'visible') });
    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => !!window.__hmHidden });
  });
  const p = await ctx.newPage();
  const log = [];
  p.on('response', (r) => {
    const u = r.url();
    if (u.startsWith(API)) log.push({ at: Date.now(), method: r.request().method(), path: u.slice(API.length), status: r.status() });
  });
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(WEB + '/');
  await p.fill('input[name=email]', EMAIL);
  await p.fill('input[name=password]', PW);
  await p.click('button[type=submit]');
  await p.getByRole('button', { name: /^Notifications/ }).waitFor({ timeout: 15000 });
  await p.waitForTimeout(1500);
  return { ctx, p, log, errors };
}
// Let the token expire naturally while the tab is hidden (a backgrounded tab), so the
// visibility-aware shell polls stay suspended; then show it and fire the burst. Headless
// Chrome never reports background tabs as hidden, so visibility is emulated here.
async function expireWhileHidden(ctx, pages, logs = []) {
  const setHidden = (h) => Promise.all(pages.map((pg) => pg.evaluate((v) => { window.__hmHidden = v; document.dispatchEvent(new Event('visibilitychange')); }, h)));
  await setHidden(true);
  const hiddenAt = Date.now();
  console.log(`tab(s) hidden; waiting ${TTL + 8}s for natural expiry…`);
  await sleep((TTL + 8) * 1000);
  const quiet = logs.every((l) => since(l, hiddenAt + 500).length === 0);
  check('no API traffic while hidden (nothing refreshed before the burst)', quiet, logs.map((l) => since(l, hiddenAt + 500).map((r) => r.path).join(',')).join(' | '));
  const t = Date.now();
  await setHidden(false);
  return t;
}
const since = (log, t) => log.filter((r) => r.at >= t);
const refreshes = (rows) => rows.filter((r) => r.path === '/auth/refresh');
const loggedOut = (p) => p.locator('input[name=password]').isVisible();
const go = async (p, route) => {
  const sel = `a[href="/${route}"]`;
  if (!(await p.locator(sel).first().isVisible().catch(() => false))) {
    const rails = p.locator('button.app-shell__rail-button');
    for (let i = 0; i < (await rails.count()); i++) {
      await rails.nth(i).click();
      if (await p.locator(sel).first().isVisible().catch(() => false)) break;
    }
  }
  await p.mouse.move(1000, 600);
  await p.waitForTimeout(150);
  await p.locator(sel).first().focus();
  await p.keyboard.press("Enter");
};
// Several modules' requests at once: Tasks (inbox, counts, list…) + Missions + Clients
// opened back to back, plus the shell's own notification refresh via the bell.
async function burst(p) {
  await Promise.all([go(p, 'tasks'), p.getByRole('button', { name: /^Notifications/ }).click()]);
  await go(p, 'missions');
  await go(p, 'clients');
  await p.waitForTimeout(4000);
  await p.keyboard.press('Escape');
}

{
  const { ctx, p, log, errors } = await session();
  let failOnce = true;
  await p.route(`${API}/auth/refresh`, (route) => {
    if (failOnce) { failOnce = false; return route.fulfill({ status: 503, body: '{"message":"unavailable"}', contentType: 'application/json' }); }
    return route.continue();
  });
  const t2 = await expireWhileHidden(ctx, [p], [log]);
  // Wave 1: only the shell's resume polls (no navigation).
  await p.waitForTimeout(4000);
  const w1 = since(log, t2);
  const rf1 = refreshes(w1);
  check('C: wave 1 → one refresh attempt, 503', rf1.length === 1 && rf1[0].status === 503, rf1.map((r) => r.status).join(','));
  check('C: wave 1 401s returned as-is, not replayed', w1.filter((r) => r.status === 401).every((f) => !w1.some((r) => r.at > f.at && r.path === f.path && r.status < 400)), w1.map((r) => `${r.status} ${r.path.split('?')[0]}`).join(' ; '));
  check('C: 503 keeps the session', !(await loggedOut(p)));
  await p.waitForTimeout(6000);
  check('C: no automatic refresh retry after 503 (10 s quiet)', refreshes(since(log, t2)).length === 1, refreshes(since(log, t2)).map((r) => r.status).join(','));
  // Wave 2: a new user action.
  const t3 = Date.now();
  await go(p, 'missions');
  await p.waitForTimeout(3000);
  const w2 = since(log, t3);
  const rf2 = refreshes(w2);
  check('C: next user action → one refresh, 201, and replay succeeds', rf2.length === 1 && rf2[0].status < 300 && w2.some((r) => r.path.startsWith('/v1/missions') && r.status === 200), w2.map((r) => `${r.status} ${r.path.split('?')[0]}`).join(' ; '));
  check('C: still signed in, no page errors', !(await loggedOut(p)) && errors.length === 0);
  writeFileSync(`${OUT}/C_requests.json`, JSON.stringify(since(log, t2).map((r) => ({ ...r, at: r.at - t2 })), null, 2));
  await ctx.close();
}
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

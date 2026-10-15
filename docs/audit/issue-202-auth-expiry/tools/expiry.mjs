// #203 real-API acceptance: natural access-token expiry against a live local API
// (ACCESS_TOKEN_TTL_SECONDS=60), Vite dev server (StrictMode). Synthetic data only.
// usage: node expiry.mjs <playwright path> <outDir>   env: WEB, API, EMAIL, PW, TTL
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

// A. Natural expiry, simultaneous module requests, exactly one refresh, recovery.
{
  const { ctx, p, log, errors } = await session();
  const t0 = await expireWhileHidden(ctx, [p], [log]);
  await burst(p);
  const rows = since(log, t0);
  const r401 = rows.filter((r) => r.status === 401 && r.path !== '/auth/refresh');
  const rf = refreshes(rows);
  check('A: expired token produced 401s on concurrent module requests', r401.length >= 2, `${r401.length} 401s: ${[...new Set(r401.map((r) => r.path.split('?')[0]))].join(', ')}`);
  check('A: exactly one POST /auth/refresh in this tab', rf.length === 1, `refresh statuses: ${rf.map((r) => r.status).join(',')}`);
  check('A: refresh succeeded', rf[0]?.status === 200 || rf[0]?.status === 201, String(rf[0]?.status));
  const retried = r401.every((f) => rows.some((r) => r.at > f.at && r.path === f.path && r.method === f.method && r.status < 400));
  check('A: every 401 request was replayed once and succeeded', retried);
  const after = rows.filter((r) => r.path !== '/auth/refresh' && r.at > (rf[0]?.at ?? Infinity));
  check('A: no 401 after the refresh', after.every((r) => r.status !== 401), after.filter((r) => r.status === 401).map((r) => r.path).join(','));
  check('A: not logged out, Clients rendered', !(await loggedOut(p)) && (await p.evaluate(() => location.pathname)) === '/clients');
  await p.screenshot({ path: `${OUT}/A_recovered_clients.png` });
  writeFileSync(`${OUT}/A_requests.json`, JSON.stringify(rows.map((r) => ({ ...r, at: r.at - t0 })), null, 2));

  // B. Reload restores the session with a single refresh (StrictMode dev build).
  const t1 = Date.now();
  await p.reload();
  await p.getByRole('button', { name: /^Notifications/ }).waitFor({ timeout: 15000 });
  await p.waitForTimeout(2500);
  const rf1 = refreshes(since(log, t1));
  check('B: reload restores session without login', !(await loggedOut(p)));
  check('B: reload uses exactly one refresh', rf1.length === 1, rf1.map((r) => r.status).join(','));

  // C. Refresh 503 (transient) keeps the session; next expiry recovers.
  let failOnce = true;
  await p.route(`${API}/auth/refresh`, (route) => {
    if (failOnce) { failOnce = false; return route.fulfill({ status: 503, body: '{"message":"unavailable"}', contentType: 'application/json' }); }
    return route.continue();
  });
  const t2 = await expireWhileHidden(ctx, [p], [log]);
  await go(p, 'missions');
  await p.waitForTimeout(3000);
  const rf2 = refreshes(since(log, t2));
  check('C: transient refresh 503 does not sign out', !(await loggedOut(p)), `refresh statuses: ${rf2.map((r) => r.status).join(',')}`);
  check('C: one refresh attempt for the burst (no retry storm)', rf2.length === 1);
  await p.unroute(`${API}/auth/refresh`);
  const t3 = Date.now();
  await go(p, 'clients');
  await p.waitForTimeout(3000);
  const rf3 = refreshes(since(log, t3));
  check('C: next request refreshes and recovers', !(await loggedOut(p)) && rf3.length === 1 && rf3[0].status < 300, rf3.map((r) => r.status).join(','));

  // D. Revocation: replay the refresh cookie outside the browser (rotation), so the
  // browser's own next refresh is a reused token → API revokes the family → one sign-out.
  const cookies = await ctx.cookies(`${API}/auth/refresh`);
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const ext = await fetch(`${API}/auth/refresh`, { method: 'POST', headers: { cookie: cookieHeader, origin: WEB } });
  check('D: out-of-band refresh rotated the token', ext.ok, `${ext.status} cookies=${cookies.map((c) => c.name).join(',')}`);
  const t4 = await expireWhileHidden(ctx, [p], [log]);
  await burst(p).catch(() => {});
  await p.waitForTimeout(2500);
  const rows4 = since(log, t4);
  const rf4 = refreshes(rows4);
  check('D: revoked refresh → exactly one refresh attempt', rf4.length === 1 && rf4[0].status === 401, rf4.map((r) => r.status).join(','));
  check('D: user returned to sign-in', await loggedOut(p));
  await p.waitForTimeout(3000);
  check('D: no further refresh/module calls after sign-out', refreshes(since(log, t4)).length === 1);
  await p.screenshot({ path: `${OUT}/D_revoked_signin.png` });
  const t5 = Date.now();
  await p.reload();
  await p.waitForTimeout(3000);
  check('D: reload after revocation stays signed out (no restore)', await loggedOut(p), refreshes(since(log, t5)).map((r) => r.status).join(','));
  check('A–D: no page errors', errors.length === 0, errors.join(' | '));
  writeFileSync(`${OUT}/D_requests.json`, JSON.stringify(rows4.map((r) => ({ ...r, at: r.at - t4 })), null, 2));
  await ctx.close();
}

// E. Missing cookie (cleared) → refresh 401 → single sign-out.
{
  // With a dirty creation drawer open (#201): the shell's own 60 s poll hits the
  // expiry, the refresh fails, and sign-out must not leave the app inert.
  const { ctx, p, log } = await session();
  await go(p, 'missions');
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'New mission' }).click();
  await p.locator('.ui-drawer input[name=title]').fill('Synthetic draft during expiry');
  await ctx.clearCookies();
  const t = Date.now();
  await sleep((TTL + 8) * 1000);
  for (let i = 0; i < 80 && !(await loggedOut(p)); i++) await sleep(1000);
  await p.waitForTimeout(1500);
  const rf = refreshes(since(log, t));
  check('E: missing refresh cookie → exactly one refresh, then sign-in', rf.length === 1 && (await loggedOut(p)), rf.map((r) => r.status).join(','));
  check('E: sign-out with a dirty drawer leaves no drawer and no inert app', (await p.locator('.ui-drawer').count()) === 0 && !(await p.evaluate(() => document.getElementById('root').inert)));
  await p.fill('input[name=email]', EMAIL);
  await p.fill('input[name=password]', PW);
  await p.click('button[type=submit]');
  check('E: can sign in again afterwards', await p.getByRole('button', { name: /^Notifications/ }).waitFor({ timeout: 15000 }).then(() => true, () => false));
  await ctx.close();
}

// F. Cross-tab refresh coordination (R-059): one refresh across tabs, both stay signed in.
{
  const { ctx, p, log } = await session();
  const p2 = await ctx.newPage();
  const log2 = [];
  p2.on('response', (r) => { if (r.url().startsWith(API)) log2.push({ at: Date.now(), path: r.url().slice(API.length), status: r.status() }); });
  await p2.goto(WEB + '/');
  await p2.getByRole('button', { name: /^Notifications/ }).waitFor({ timeout: 15000 }).catch(() => {});
  const t = await expireWhileHidden(ctx, [p, p2], [log, log2]);
  await Promise.all([burst(p).catch(() => {}), burst(p2).catch(() => {})]);
  await p.waitForTimeout(4000);
  const r1 = refreshes(since(log, t));
  const r2 = refreshes(since(log2, t));
  const allRefresh = [...r1, ...r2];
  const out = {
    tab1Refresh: r1.map((r) => r.status),
    tab2Refresh: r2.map((r) => r.status),
    tab1SignedOut: await loggedOut(p),
    tab2SignedOut: await loggedOut(p2),
    totalRefreshCalls: allRefresh.length,
  };
  console.log('F (cross-tab):', JSON.stringify(out));
  writeFileSync(`${OUT}/F_cross_tab.json`, JSON.stringify(out, null, 2));
  check('F: exactly one POST /auth/refresh across both tabs', allRefresh.length === 1, `counts tab1=${r1.length} tab2=${r2.length}`);
  check('F: refresh succeeded', allRefresh[0]?.status === 200 || allRefresh[0]?.status === 201, String(allRefresh[0]?.status));
  check('F: neither tab signed out', !(await loggedOut(p)) && !(await loggedOut(p2)));
  await ctx.close();
}

await b.close();
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

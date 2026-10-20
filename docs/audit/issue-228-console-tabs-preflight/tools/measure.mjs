// Console Workspace tabs (#228) baseline harness. Derived from the #198 harness in
// ../../console-workspace-v1-baseline/tools/measure.mjs with three changes:
//   1. SWITCH waits until the lazy-route fallback (`.route-module-fallback`) is gone
//      and starts the 200 ms quiet window at the navigation, so a first visit that
//      downloads a route chunk before its first request is not cut short.
//   2. `history` scenario: Back/Forward traversal latency over 5 visited workspaces.
//   3. `deeplink` also covers `/clients?client=` (added on main after #198).
//   4. `layout` scenario: header/strip space and horizontal overflow at 1440/1024/768/390
//      in EN and FR (input for the tab strip placement; no tab UI exists yet).
// Measures the current production build (vite preview) against a local API seeded
// with synthetic data.
//
//   WEB=http://localhost:5710 API=http://localhost:3710 ADMIN_EMAIL=.. ADMIN_PASSWORD=.. \
//   CPU=4 CYCLES=50 node measure.mjs <scenario> > result.json
//
// Scenarios: cold | switch | poll | deeplink | expiry | history | layout
import { chromium } from 'playwright-core';

const WEB = process.env.WEB ?? 'http://localhost:5610';
const API = process.env.API ?? 'http://localhost:3610';
const CPU = Number(process.env.CPU ?? 4);
const CYCLES = Number(process.env.CYCLES ?? 50);
const scenario = process.argv[2] ?? 'switch';

// Installed in every document before app code: fetch accounting + long tasks.
const INIT = () => {
  window.__perf = { inflight: 0, lastActivity: performance.now(), requests: [], longtasks: [] };
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const rec = { url, method: init?.method ?? 'GET', start: performance.now(), end: 0, status: 0 };
    window.__perf.requests.push(rec);
    window.__perf.inflight++;
    window.__perf.lastActivity = performance.now();
    try {
      const res = await original(input, init);
      rec.status = res.status;
      return res;
    } finally {
      rec.end = performance.now();
      window.__perf.inflight--;
      window.__perf.lastActivity = performance.now();
    }
  };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__perf.longtasks.push({ start: e.startTime, duration: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__perf.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
};

// In-page: navigate the way AppShell does (pushState + the app's popstate listener)
// and time first paint and data settlement.
const SWITCH = async (path) => {
  const p = window.__perf;
  const reqBefore = p.requests.length;
  const ltBefore = p.longtasks.length;
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const t0 = performance.now();
  p.lastActivity = t0;
  if (path === 'back' || path === 'forward') {
    // Real traversal: the app's own popstate listener and history guard handle it.
    history[path]();
  } else {
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  await raf();
  await raf();
  const paint = performance.now() - t0;
  const deadline = t0 + 15000;
  while (performance.now() < deadline) {
    const chunkPending = document.querySelector('.route-module-fallback') !== null;
    if (!chunkPending && p.inflight === 0 && performance.now() - p.lastActivity > 200) break;
    await new Promise((r) => setTimeout(r, 16));
  }
  const reqs = p.requests.slice(reqBefore);
  const lastEnd = reqs.reduce((m, r) => Math.max(m, r.end), 0);
  const settled = (reqs.length ? lastEnd : t0 + paint) - t0;
  const lts = p.longtasks.slice(ltBefore);
  return {
    path,
    paintMs: paint,
    settledMs: Math.max(paint, settled),
    requests: reqs.map((r) => `${r.method} ${new URL(r.url).pathname}${new URL(r.url).search}`),
    statuses: reqs.map((r) => r.status),
    longTaskCount: lts.length,
    longTaskMaxMs: lts.reduce((m, l) => Math.max(m, l.duration), 0),
    blockingMs: lts.reduce((s, l) => s + Math.max(0, l.duration - 50), 0),
    domNodes: document.getElementsByTagName('*').length,
  };
};

const pct = (xs, q) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return +s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)].toFixed(1);
};
const summary = (xs) => ({ n: xs.length, median: pct(xs, 0.5), p95: pct(xs, 0.95), max: pct(xs, 1) });

async function setup() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB' });
  await context.addInitScript(INIT);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  return { browser, context, page, cdp };
}

async function login(page) {
  await page.goto(`${WEB}/`, { waitUntil: 'load' });
  await page.fill('input[name=email]', process.env.ADMIN_EMAIL);
  await page.fill('input[name=password]', process.env.ADMIN_PASSWORD);
  const t0 = Date.now();
  await page.click('button[type=submit]');
  await page.waitForSelector('main, [role=main]', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('nav') !== null, null, { timeout: 30000 });
  return Date.now() - t0;
}

async function heap(cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  const dom = await cdp.send('Memory.getDOMCounters');
  return { heapMB: +(usedSize / 1048576).toFixed(2), nodes: dom.nodes, listeners: dom.jsEventListeners, documents: dom.documents };
}

async function ids() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  });
  const { accessToken } = await res.json();
  const get = async (p) => (await fetch(`${API}${p}`, { headers: { Authorization: `Bearer ${accessToken}` } })).json();
  return {
    candidate: (await get('/v1/candidates?page=3&pageSize=20')).candidates[5].id,
    mission: (await get('/v1/missions?page=1&pageSize=20')).missions[2].id,
    client: (await get('/v1/clients?page=2&pageSize=20')).clients[3].id,
  };
}

const ROUTES5 = ['/clients', '/candidates', '/missions', '/tasks', '/messages'];
const ROUTES10 = [...ROUTES5, '/commercial', '/accounting', '/training', '/documents', '/reporting'];

const out = { scenario, cpuThrottle: CPU, date: new Date().toISOString(), web: WEB };
const { browser, page, cdp } = await setup();
try {
  if (scenario === 'cold') {
    // Unauthenticated entry (parses the whole bundle), then login, then an authenticated
    // reload of a workspace (refresh-cookie session restoration).
    const runs = [];
    for (let i = 0; i < Number(process.env.RUNS ?? 5); i++) {
      await page.context().clearCookies();
      await cdp.send('Network.enable');
      await cdp.send('Network.clearBrowserCache');
      await page.goto(`${WEB}/`, { waitUntil: 'load' });
      // React renders after the load event; wait for the login form to exist.
      await page.waitForSelector('input[name=email]');
      await page.waitForTimeout(500);
      const nav = await page.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0];
        const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
        const res = performance.getEntriesByType('resource').filter((r) => /\.(js|css)$/.test(r.name));
        return {
          domContentLoadedMs: n.domContentLoadedEventEnd,
          loadMs: n.loadEventEnd,
          fcpMs: fcp,
          loginFormLcpMs: window.__perf.lcp ?? null,
          transferKB: +(res.reduce((s, r) => s + r.transferSize, 0) / 1024).toFixed(1),
          decodedKB: +(res.reduce((s, r) => s + r.decodedBodySize, 0) / 1024).toFixed(1),
          longTasks: window.__perf.longtasks.length,
          blockingMs: window.__perf.longtasks.reduce((s, l) => s + Math.max(0, l.duration - 50), 0),
          longestTaskMs: window.__perf.longtasks.reduce((m, l) => Math.max(m, l.duration), 0),
        };
      });
      const m = await cdp.send('Performance.getMetrics');
      const metric = (k) => m.metrics.find((x) => x.name === k)?.value;
      nav.scriptDurationMs = +(metric('ScriptDuration') * 1000).toFixed(1);
      nav.jsHeapAfterLoadMB = +(metric('JSHeapUsedSize') / 1048576).toFixed(2);
      const loginMs = await login(page).catch(() => login(page));
      // Authenticated reload directly into a workspace URL (session restoration path).
      const t0 = Date.now();
      await page.goto(`${WEB}/candidates`, { waitUntil: 'load' });
      let restored = true;
      try {
        await page.waitForFunction(() => window.__perf.requests.some((r) => r.url.includes('/v1/candidates') && r.end > 0), null, { timeout: 20000 });
        await page.waitForFunction(() => window.__perf.inflight === 0, null, { timeout: 20000 });
      } catch {
        restored = false; // recorded, not thrown: a failed session restoration is a finding
      }
      const reload = await page.evaluate(() => ({
        requests: window.__perf.requests.map((r) => `${r.method} ${new URL(r.url).pathname} ${r.status}`),
        blockingMs: window.__perf.longtasks.reduce((s, l) => s + Math.max(0, l.duration - 50), 0),
        lcpMs: window.__perf.lcp ?? null,
      }));
      runs.push({ ...nav, loginToShellMs: loginMs, restored, reloadToCandidatesSettledMs: restored ? Date.now() - t0 : null, reload });
    }
    out.runs = runs;
    for (const k of ['domContentLoadedMs', 'fcpMs', 'loginFormLcpMs', 'loadMs', 'scriptDurationMs', 'blockingMs', 'longestTaskMs', 'loginToShellMs', 'reloadToCandidatesSettledMs'])
      out[k] = summary(runs.map((r) => r[k]).filter((x) => x != null));
    out.transferKB = runs[0].transferKB;
    out.restorationFailures = runs.filter((r) => !r.restored).map((r) => r.reload.requests);
    out.decodedKB = runs[0].decodedKB;
  }

  if (scenario === 'switch') {
    await login(page);
    await page.evaluate(SWITCH, '/');
    const baseline = await heap(cdp);
    const heapAfter = { start: baseline };
    const activations = [];
    // Distinct-route breadth: 1, 5 and 10 distinct workspaces visited.
    activations.push({ phase: 'first', ...(await page.evaluate(SWITCH, ROUTES10[0])) });
    heapAfter.after1 = await heap(cdp);
    for (const r of ROUTES10.slice(1, 5)) activations.push({ phase: 'first', ...(await page.evaluate(SWITCH, r)) });
    heapAfter.after5 = await heap(cdp);
    for (const r of ROUTES10.slice(5)) activations.push({ phase: 'first', ...(await page.evaluate(SWITCH, r)) });
    heapAfter.after10 = await heap(cdp);
    // Repeated switching across the 5 core workspaces.
    const curve = [];
    for (let c = 1; c <= CYCLES; c++) {
      for (const r of ROUTES5) activations.push({ phase: 'repeat', cycle: c, ...(await page.evaluate(SWITCH, r)) });
      if (c % 10 === 0) curve.push({ cycle: c, ...(await heap(cdp)) });
    }
    out.heap = heapAfter;
    out.heapCurve = curve;
    const byRoute = {};
    for (const a of activations) {
      const k = `${a.phase}:${a.path}`;
      (byRoute[k] ??= []).push(a);
    }
    out.routes = Object.fromEntries(
      Object.entries(byRoute).map(([k, xs]) => [
        k,
        {
          paintMs: summary(xs.map((x) => x.paintMs)),
          settledMs: summary(xs.map((x) => x.settledMs)),
          requestsPerActivation: summary(xs.map((x) => x.requests.length)),
          blockingMs: summary(xs.map((x) => x.blockingMs)),
          domNodes: xs.at(-1).domNodes,
          sampleRequests: xs[0].requests,
          non2xx: xs.flatMap((x) => x.statuses.filter((s) => s >= 400)).length,
        },
      ]),
    );
    const repeats = activations.filter((a) => a.phase === 'repeat');
    out.repeatAll = {
      paintMs: summary(repeats.map((x) => x.paintMs)),
      settledMs: summary(repeats.map((x) => x.settledMs)),
      requests: repeats.reduce((s, x) => s + x.requests.length, 0),
      activations: repeats.length,
    };
    // Same URL fetched again on a later activation = no client cache reuse.
    const counts = {};
    for (const a of repeats) for (const r of a.requests) counts[r] = (counts[r] ?? 0) + 1;
    out.topRepeatedRequests = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);
  }

  if (scenario === 'poll') {
    // Idle request rate per workspace while visible.
    await login(page);
    const minutes = Number(process.env.MINUTES ?? 3);
    out.idle = {};
    for (const r of ['/clients', '/messages']) {
      await page.evaluate(SWITCH, r);
      const before = await page.evaluate(() => window.__perf.requests.length);
      await page.waitForTimeout(minutes * 60_000);
      const reqs = await page.evaluate((b) => window.__perf.requests.slice(b).map((x) => new URL(x.url).pathname), before);
      const byPath = {};
      for (const p of reqs) byPath[p] = (byPath[p] ?? 0) + 1;
      out.idle[r] = { minutes, total: reqs.length, perMinute: +(reqs.length / minutes).toFixed(2), byPath };
    }
  }

  if (scenario === 'deeplink') {
    // A pasted record URL in a clean, signed-in session.
    const { candidate, mission, client } = await ids();
    await login(page);
    out.deeplinks = {};
    for (const url of [`/candidates?candidate=${candidate}`, `/missions?mission=${mission}`, `/clients?client=${client}`]) {
      const runs = [];
      for (let i = 0; i < 5; i++) {
        await page.goto(`${WEB}${url}`, { waitUntil: 'load' });
        const t0 = await page.evaluate(() => performance.now());
        await page.waitForFunction(() => window.__perf.requests.length > 2 && window.__perf.inflight === 0 && performance.now() - window.__perf.lastActivity > 300, null, { timeout: 30000 });
        runs.push(await page.evaluate(() => ({
          settledMs: Math.max(...window.__perf.requests.map((r) => r.end)),
          requests: window.__perf.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`),
          urlAfter: location.pathname + location.search,
        })));
        void t0;
      }
      out.deeplinks[url.split('?')[0]] = { settledMs: summary(runs.map((r) => r.settledMs)), requests: runs[0].requests, urlPreserved: runs.every((r) => r.urlAfter.startsWith(url.split('=')[0])) };
    }
  }

  if (scenario === 'history') {
    // Visit 5 workspaces, then Back ×4 and Forward ×4, repeated: what a tab switch
    // through browser history costs today (remount + refetch on every step).
    await login(page);
    const steps = [];
    for (let c = 0; c < Number(process.env.HISTORY_CYCLES ?? 10); c++) {
      for (const r of ROUTES5) await page.evaluate(SWITCH, r);
      for (let i = 0; i < 4; i++) steps.push({ dir: 'back', ...(await page.evaluate(SWITCH, 'back')) });
      for (let i = 0; i < 4; i++) steps.push({ dir: 'forward', ...(await page.evaluate(SWITCH, 'forward')) });
    }
    out.history = Object.fromEntries(
      ['back', 'forward'].map((dir) => {
        const xs = steps.filter((s) => s.dir === dir);
        return [dir, {
          paintMs: summary(xs.map((x) => x.paintMs)),
          settledMs: summary(xs.map((x) => x.settledMs)),
          requestsPerStep: summary(xs.map((x) => x.requests.length)),
        }];
      }),
    );
    out.finalUrl = await page.evaluate(() => location.pathname);
  }

  if (scenario === 'layout') {
    // Space available for a one-row tab strip today, per width and locale.
    await login(page);
    out.layout = [];
    for (const locale of ['en', 'fr']) {
      await page.evaluate((l) => localStorage.setItem('hireme.locale', l), locale);
      for (const [w, h] of [[1440, 900], [1024, 768], [768, 1024], [390, 844], [1280, 400]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.goto(`${WEB}/candidates`, { waitUntil: 'load' });
        await page.waitForFunction(() => window.__perf.inflight === 0 && !document.querySelector('.route-module-fallback'), null, { timeout: 30000 });
        await page.waitForTimeout(300);
        out.layout.push(await page.evaluate(({ w, h, locale }) => {
          const main = document.querySelector('main.app-shell__main');
          const utilityBar = document.querySelector('.app-shell__utility-bar');
          const header = main?.querySelector('.ui-page-header');
          const rect = (el) => (el ? (({ width, height, top }) => ({ width: Math.round(width), height: Math.round(height), top: Math.round(top) }))(el.getBoundingClientRect()) : null);
          return {
            viewport: `${w}x${h}`,
            locale,
            lang: document.documentElement.lang,
            mobileNavigation: window.matchMedia('(max-width: 56.25rem)').matches,
            utilityBar: rect(utilityBar),
            main: rect(main),
            pageHeader: rect(header),
            horizontalOverflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        }, { w, h, locale }));
      }
    }
  }

  if (scenario === 'expiry') {
    // Requires the API to run with a short ACCESS_TOKEN_TTL_SECONDS (e.g. 60).
    await login(page);
    await page.evaluate(SWITCH, '/clients');
    const waitS = Number(process.env.WAIT_S ?? 75);
    await page.waitForTimeout(waitS * 1000);
    const after = await page.evaluate(SWITCH, '/candidates');
    const alerts = await page.locator('[role=alert]').allTextContents();
    out.expiry = { waitedSeconds: waitS, requests: after.requests, statuses: after.statuses, alerts: alerts.map((a) => a.slice(0, 120)) };
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(out, null, 2));

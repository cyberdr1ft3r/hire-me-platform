// Candidates workspace before/after measurement (Issue #204). Same instrumentation as the
// #198 baseline harness: in-page fetch accounting, long tasks, CDP heap/DOM counters,
// production build, CPU throttle. Synthetic data only.
//   WEB=.. API=.. ADMIN_EMAIL=.. ADMIN_PASSWORD=.. STATE=before|after CPU=4 node measure-candidates.mjs <playwright> > out.json
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2]);
const { WEB, API, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
const STATE = process.env.STATE ?? 'before';
const CPU = Number(process.env.CPU ?? 4);
const ACTIVATIONS = Number(process.env.ACTIVATIONS ?? 20);
const CYCLES = Number(process.env.CYCLES ?? 40);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INIT = () => {
  window.__perf = { requests: [], longtasks: [], lastActivity: performance.now() };
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const rec = { url, method: init?.method ?? 'GET', start: performance.now(), end: 0, status: 0 };
    window.__perf.requests.push(rec);
    window.__perf.lastActivity = performance.now();
    try {
      const res = await original(input, init);
      rec.status = res.status;
      return res;
    } finally {
      rec.end = performance.now();
      window.__perf.lastActivity = performance.now();
    }
  };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.longtasks.push({ start: e.startTime, duration: e.duration }); }).observe({ type: 'longtask', buffered: true });
  } catch {}
};

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  return { n: s.length, median: Math.round(q(0.5)), p95: Math.round(q(0.95)), min: Math.round(s[0]), max: Math.round(s[s.length - 1]) };
};

// Waits until no request has been in flight or started for `quiet` ms.
async function settle(page, quiet = 800) {
  await page.waitForFunction((q) => {
    const p = window.__perf;
    return p.requests.every((r) => r.end > 0) && performance.now() - p.lastActivity > q;
  }, quiet, { timeout: 30000, polling: 100 });
}
const reqCount = (page) => page.evaluate(() => window.__perf.requests.length);
const reqsSince = (page, n) => page.evaluate((k) => window.__perf.requests.slice(k).map((r) => `${r.method} ${r.url.replace(/^https?:\/\/[^/]+/, '').replace(/[0-9a-f-]{36}/g, ':id').replace(/\?.*/, '')}`), n);

async function heap(cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  const dom = await cdp.send('Memory.getDOMCounters');
  return { heapMB: +(usedSize / 1048576).toFixed(2), nodes: dom.nodes, listeners: dom.jsEventListeners };
}

// UI adapters: the only part that differs between the two implementations.
const UI = {
  before: {
    rows: '.candidate-list__select',
    async activate(page, i) {
      await page.locator('.candidate-list__select').nth(i).click();
      await page.waitForSelector('.candidate-detail h2', { timeout: 20000 });
    },
    async close() {},
  },
  after: {
    rows: '.candidate-directory__open',
    async activate(page, i) {
      await page.locator('.candidate-directory__open').nth(i).click();
      await page.waitForSelector('.candidate-preview h2', { timeout: 20000 });
    },
    async close(page) {
      await page.keyboard.press('Escape');
      await page.waitForSelector('.candidate-preview', { state: 'detached', timeout: 10000 });
    },
    async openRecord(page, i) {
      await page.locator('.candidate-directory__open').nth(i).click();
      await page.waitForSelector('.candidate-preview h2');
      await page.getByRole('button', { name: /Open full profile/ }).click();
      await page.waitForSelector('.candidate-record .candidate-detail h2', { timeout: 20000 });
    },
    async back(page) {
      await page.getByRole('button', { name: /Back to candidates/ }).click();
      await page.waitForSelector('.candidate-directory__open', { timeout: 20000 });
    },
  },
}[STATE];

const out = { state: STATE, cpuThrottle: CPU, date: new Date().toISOString() };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(INIT);
await ctx.addInitScript(() => { try { localStorage.setItem('hireme.locale', 'en'); } catch {} });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await page.goto(`${WEB}/`);
await page.fill('input[name=email]', ADMIN_EMAIL);
await page.fill('input[name=password]', ADMIN_PASSWORD);
await page.click('button[type=submit]');
await page.getByRole('button', { name: /^Notifications/ }).waitFor({ timeout: 20000 });
await settle(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

// A. Cold load of /candidates (session restore via refresh cookie), 5 runs spaced for the limiter.
{
  const runs = [];
  for (let i = 0; i < 5; i++) {
    await page.goto(`${WEB}/candidates`, { waitUntil: 'load' });
    await page.waitForSelector(UI.rows, { timeout: 30000 });
    const firstRow = await page.evaluate(() => performance.now());
    await settle(page);
    const r = await page.evaluate(() => ({
      requests: window.__perf.requests.map((x) => `${x.method} ${x.url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*/, '')}`),
      blocking: window.__perf.longtasks.reduce((s, t) => s + Math.max(0, t.duration - 50), 0),
    }));
    runs.push({ firstRowMs: firstRow, requests: r.requests.length, blockingMs: r.blocking, list: r.requests });
    await sleep(4000);
  }
  out.cold = { firstRowMs: stats(runs.map((r) => r.firstRowMs)), requests: stats(runs.map((r) => r.requests)), blockingMs: stats(runs.map((r) => r.blockingMs)), sampleRequests: runs[runs.length - 1].list };
}

// B. Row activation: click → content shown, requests issued per activation.
{
  const times = [];
  const reqs = [];
  let sample = [];
  for (let i = 0; i < ACTIVATIONS; i++) {
    const n = await reqCount(page);
    const t0 = Date.now();
    await UI.activate(page, i % 20);
    await settle(page, 500);
    times.push(Date.now() - t0);
    reqs.push((await reqCount(page)) - n);
    if (i === 0) sample = await reqsSince(page, n);
    await UI.close(page);
  }
  out.rowActivation = { ms: stats(times), requestsPerActivation: stats(reqs), sample };
}

// C. Focused record open and return (after only).
if (UI.openRecord) {
  const open = [];
  const back = [];
  const openReqs = [];
  const backReqs = [];
  let sample = [];
  for (let i = 0; i < 10; i++) {
    let n = await reqCount(page);
    let t0 = Date.now();
    await UI.openRecord(page, i);
    await settle(page, 500);
    open.push(Date.now() - t0);
    openReqs.push((await reqCount(page)) - n);
    if (i === 0) sample = await reqsSince(page, n);
    n = await reqCount(page);
    t0 = Date.now();
    await UI.back(page);
    await settle(page, 500);
    back.push(Date.now() - t0);
    backReqs.push((await reqCount(page)) - n);
  }
  out.focusedRecord = { openMs: stats(open), openRequests: stats(openReqs), backMs: stats(back), backRequests: stats(backReqs), sampleOpen: sample };
}

// D. Deep link cold load /candidates?candidate=<id>.
{
  const login = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }) })).json();
  const list = await (await fetch(`${API}/v1/candidates?page=3&pageSize=20`, { headers: { authorization: `Bearer ${login.accessToken}` } })).json();
  const id = list.candidates[5].id;
  const runs = [];
  for (let i = 0; i < 3; i++) {
    await page.goto(`${WEB}/candidates?candidate=${id}`, { waitUntil: 'load' });
    await page.waitForSelector('.candidate-detail h2', { timeout: 30000 });
    const t = await page.evaluate(() => performance.now());
    await settle(page);
    runs.push({ ms: t, requests: await page.evaluate(() => window.__perf.requests.map((x) => `${x.method} ${x.url.replace(/^https?:\/\/[^/]+/, '').replace(/[0-9a-f-]{36}/g, ':id').replace(/\?.*/, '')}`)) });
    await sleep(4000);
  }
  out.deepLink = { recordMs: stats(runs.map((r) => r.ms)), requests: stats(runs.map((r) => r.requests.length)), sample: runs[0].requests };
}

// E. Memory across activation cycles.
{
  await page.goto(`${WEB}/candidates`, { waitUntil: 'load' });
  await page.waitForSelector(UI.rows);
  await settle(page);
  const series = [{ cycle: 0, ...(await heap(cdp)) }];
  for (let c = 1; c <= CYCLES; c++) {
    if (UI.openRecord && c % 2 === 0) {
      await UI.openRecord(page, c % 20);
      await settle(page, 300);
      await UI.back(page);
    } else {
      await UI.activate(page, c % 20);
      await settle(page, 300);
      await UI.close(page);
    }
    if (c % 10 === 0) series.push({ cycle: c, ...(await heap(cdp)) });
  }
  out.memory = series;
}

// F. Idle requests for 65 s with the directory (and, after, an open preview) on screen.
{
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await UI.activate(page, 0);
  await settle(page);
  const n = await reqCount(page);
  await sleep(65000);
  out.idle65s = await reqsSince(page, n);
}

await browser.close();
console.log(JSON.stringify(out, null, 2));

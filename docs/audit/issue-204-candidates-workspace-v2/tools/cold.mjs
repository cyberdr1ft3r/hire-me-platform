// Cold load of /candidates only, same instrumentation as measure-candidates.mjs. env: WEB, EMAIL, PW, ROW, RUNS
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2]);
const { WEB, EMAIL, PW, ROW } = process.env;
const RUNS = Number(process.env.RUNS ?? 7);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const INIT = () => {
  window.__lt = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ type: 'longtask', buffered: true });
  } catch {}
};
const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(INIT);
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await p.goto(`${WEB}/`);
await p.fill('input[name=email]', EMAIL);
await p.fill('input[name=password]', PW);
await p.click('button[type=submit]');
await p.getByRole('button', { name: /^Notifications/ }).waitFor();
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const first = [];
const blocking = [];
for (let i = 0; i < RUNS; i++) {
  await p.goto(`${WEB}/candidates`, { waitUntil: 'load' });
  await p.waitForSelector(ROW, { timeout: 30000 });
  first.push(await p.evaluate(() => performance.now()));
  await sleep(2500);
  blocking.push(await p.evaluate(() => window.__lt.reduce((s, d) => s + Math.max(0, d - 50), 0)));
  await sleep(3000);
}
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log(JSON.stringify({ firstRow: first.map(Math.round), firstRowMedian: Math.round(med(first)), blocking: blocking.map(Math.round), blockingMedian: Math.round(med(blocking)) }));
await b.close();

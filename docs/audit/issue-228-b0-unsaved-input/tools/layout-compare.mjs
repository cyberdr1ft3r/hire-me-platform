// Layout-neutrality check for the B0′ scope wrapper: records element boxes on seven routes at
// 1440px and 390px. Run once against main and once against the branch on the same API, then diff.
//   ADMIN_EMAIL=.. ADMIN_PASSWORD=.. node layout-compare.mjs > layout-<build>.json
import { chromium } from 'playwright-core';
const routes = ['/messages', '/tasks', '/training', '/commercial', '/documents', '/accounting', '/admin'];
const out = {};
const b = await chromium.launch({ channel: 'chrome', headless: true });
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  await p.goto('http://localhost:5720/');
  await p.fill('input[name=email]', process.env.ADMIN_EMAIL);
  await p.fill('input[name=password]', process.env.ADMIN_PASSWORD);
  await p.click('button[type=submit]');
  await p.waitForSelector('main.app-shell__main');
  for (const r of routes) {
    await p.evaluate((t) => { const i = (history.state?.hiremeHistoryIndex ?? 0) + 1; history.pushState({ hiremeHistoryIndex: i }, '', t); dispatchEvent(new PopStateEvent('popstate', { state: { hiremeHistoryIndex: i } })); }, r);
    await p.waitForTimeout(1500);
    out[`${w}${r}`] = await p.evaluate(() => {
      const c = document.querySelector('.app-shell__content');
      const boxes = [...document.querySelectorAll('.app-shell__content *')].slice(0, 400).map((e) => { const r = e.getBoundingClientRect(); return `${e.tagName}.${e.className}:${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`; }).filter((s) => !s.startsWith('DIV.unsaved-input-scope'));
      return { layout: document.querySelector('.app-shell')?.getAttribute('data-layout'), contentH: Math.round(c.getBoundingClientRect().height), scrollW: document.documentElement.scrollWidth, hash: boxes.join('|') };
    });
  }
}
await b.close();
console.log(JSON.stringify(out));

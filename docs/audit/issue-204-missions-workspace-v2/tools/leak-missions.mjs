// Isolates DOM node / listener growth per interaction. env: WEB, EMAIL, PW, MODE=after|before
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2]);
const { WEB, EMAIL, PW } = process.env;
const MODE = process.env.MODE ?? 'after';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
const counters = async () => {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const d = await cdp.send('Memory.getDOMCounters');
  return `${d.nodes} nodes / ${d.jsEventListeners} listeners`;
};
await p.goto(`${WEB}/`);
await p.fill('input[name=email]', EMAIL);
await p.fill('input[name=password]', PW);
await p.click('button[type=submit]');
await p.getByRole('button', { name: /^Notifications/ }).waitFor();
await p.evaluate(() => { history.pushState({ hiremeHistoryIndex: 1 }, '', '/missions'); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); });
const row = MODE === 'after' ? '.mission-directory__open' : '.mission-list__select';
await p.locator(row).first().waitFor();
await p.waitForTimeout(1500);
console.log('start', await counters());
if (MODE === 'after') {
  for (let i = 0; i < 20; i++) {
    await p.locator(row).nth(i % 20).click();
    await p.locator('.mission-preview h2').waitFor();
    await p.keyboard.press('Escape');
    await p.locator('.mission-preview').waitFor({ state: 'detached' });
  }
  console.log('after 20 previews', await counters());
  for (let i = 0; i < 20; i++) {
    await p.locator(row).nth(i % 20).click();
    await p.getByRole('button', { name: 'Open full record' }).click();
    await p.locator('.mission-record .mission-detail__title').waitFor();
    await p.waitForTimeout(200);
    await p.getByRole('button', { name: /Back to missions/ }).click();
    await p.locator(row).first().waitFor();
  }
  console.log('after 20 records', await counters());
} else {
  for (let i = 0; i < 20; i++) {
    await p.locator(row).nth(i % 20).click();
    await p.locator('.mission-detail__title').waitFor();
    await p.waitForTimeout(200);
  }
  console.log('after 20 selections', await counters());
}
// Same page, nothing done: does the count drift on its own (polling, timers)?
await p.waitForTimeout(5000);
console.log('idle 5s', await counters());
await b.close();

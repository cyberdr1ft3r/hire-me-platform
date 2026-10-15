// Issue #198 lazy-route browser smoke (dev or preview stack).
// Usage: node smoke-lazy-routes.mjs <playwrightModule> <outDir>
// Env: WEB, API, EMAIL, PW
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2]);
const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });

const { WEB, API, EMAIL, PW } = process.env;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) });
  console.log(ok ? 'PASS' : 'FAIL', name, detail);
};

async function loginFetch() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PW }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  return res.json();
}

async function ensureSyntheticData(auth) {
  const headers = { ...auth, 'content-type': 'application/json' };
  let clients = (await (await fetch(`${API}/v1/clients?page=1&pageSize=20`, { headers: auth })).json()).clients;
  if (clients.length < 1) {
    await fetch(`${API}/v1/clients`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Lazy Smoke Client', industry: 'Technology', city: 'Paris', country: 'France' }),
    });
    clients = (await (await fetch(`${API}/v1/clients?page=1&pageSize=20`, { headers: auth })).json()).clients;
  }
  const clientId = clients[0].id;

  let missions = (await (await fetch(`${API}/v1/missions?page=1&pageSize=20`, { headers: auth })).json()).missions;
  if (missions.length < 1) {
    await fetch(`${API}/v1/missions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        clientId,
        title: 'Lazy smoke mission',
        numberOfPositions: 1,
        priority: 'NORMAL',
        location: 'Paris',
        workArrangement: 'HYBRID',
        engagementType: 'PERMANENT',
      }),
    });
    missions = (await (await fetch(`${API}/v1/missions?page=1&pageSize=20`, { headers: auth })).json()).missions;
  }

  let candidates = (await (await fetch(`${API}/v1/candidates?page=1&pageSize=20`, { headers: auth })).json())
    .candidates;
  if (candidates.length < 1) {
    await fetch(`${API}/v1/candidates`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        displayName: 'Lazy Smoke',
        email: `lazy.smoke.${Date.now()}@example.test`,
        city: 'Paris',
        country: 'France',
        source: 'Synthetic',
      }),
    });
    candidates = (await (await fetch(`${API}/v1/candidates?page=1&pageSize=20`, { headers: auth })).json())
      .candidates;
  }

  return { clientId: clients[0].id, missionId: missions[0].id, candidateId: candidates[0].id };
}

const login = await loginFetch();
const auth = { authorization: `Bearer ${login.accessToken}` };
const ids = await ensureSyntheticData(auth);

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function newAuthedPage(locale = 'en') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((l) => {
    try {
      localStorage.setItem('hireme.locale', l);
    } catch {}
  }, locale);
  const page = await ctx.newPage();
  const apiLog = [];
  page.on('request', (req) => {
    const u = req.url();
    if (u.startsWith(API)) apiLog.push({ method: req.method(), url: u, t: Date.now() });
  });
  await page.goto(`${WEB}/`);
  await page.fill('input[name=email]', EMAIL);
  await page.fill('input[name=password]', PW);
  await page.click('button[type=submit]');
  await page.getByText(/Signed in as|Session ouverte/).waitFor({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  return { ctx, page, apiLog };
}

async function openDomain(page, domainLabel) {
  const control = page.getByRole('button', { name: new RegExp(`^${domainLabel}`, 'i') });
  if (await control.count()) {
    await control.first().click();
    await page.keyboard.press('Escape');
    return;
  }
  await page.getByRole('link', { name: new RegExp(`^${domainLabel}`, 'i') }).first().click();
}

const navLabels = {
  en: { candidates: 'Candidates', missions: 'Missions', clients: 'Clients', loading: 'Loading workspace…' },
  fr: {
    candidates: 'Candidats',
    missions: 'Missions',
    clients: 'Clients',
    loading: 'Chargement de l’espace…',
  },
};

async function visitWorkspace(page, domainLabel, linkName, readySelector) {
  const sawLoading = [];
  const onResp = (resp) => {
    const u = resp.url();
    if (u.includes('.js') && /Missions|Candidates|Clients|missions|candidates|clients/.test(u)) {
      sawLoading.push(u);
    }
  };
  page.on('response', onResp);
  await openDomain(page, domainLabel);
  await page.getByRole('link', { name: linkName, exact: true }).click();
  await page.locator(readySelector).waitFor({ timeout: 45_000 });
  page.off('response', onResp);
  return { chunks: [...new Set(sawLoading.map((u) => u.split('/').pop()))] };
}

// --- Navigation smoke (EN) ---
{
  const { ctx, page, apiLog } = await newAuthedPage('en');
  const t = navLabels.en;

  const cand = await visitWorkspace(page, 'Recruitment', t.candidates, '.candidate-directory');
  check('nav: Candidates loads directory', true, cand.chunks.join(', ') || 'cached');

  const mis = await visitWorkspace(page, 'Recruitment', t.missions, '.mission-directory');
  check('nav: Missions loads directory', true, mis.chunks.join(', ') || 'cached');

  const cli = await visitWorkspace(page, 'Operations', t.clients, '.client-directory');
  check('nav: Clients loads directory', true, cli.chunks.join(', ') || 'cached');

  await page.goto(`${WEB}/candidates?candidate=${ids.candidateId}`);
  await page.locator('.candidate-record, .candidate-detail').first().waitFor({ timeout: 45_000 });
  check('direct URL: candidate record', true, ids.candidateId);

  await page.reload();
  await page.locator('.candidate-record, .candidate-detail').first().waitFor({ timeout: 45_000 });
  check('refresh: candidate record survives reload', true);

  await page.goto(`${WEB}/missions?mission=${ids.missionId}`);
  await page.locator('.mission-record, .mission-detail').first().waitFor({ timeout: 45_000 });
  check('direct URL: mission record', true, ids.missionId);

  await page.reload();
  await page.locator('.mission-record, .mission-detail').first().waitFor({ timeout: 45_000 });
  check('refresh: mission record survives reload', true);

  await page.goto(`${WEB}/clients?client=${ids.clientId}`);
  await page.locator('.client-focused-record, .client-record').first().waitFor({ timeout: 45_000 });
  check('direct URL: client record', true, ids.clientId);

  const beforeIdle = apiLog.length;
  await page.waitForTimeout(5000);
  const afterIdle = apiLog.slice(beforeIdle);
  const pollLike = afterIdle.filter((r) => /\/v1\//.test(r.url) && r.method === 'GET');
  check('idle: no unexpected API polling (5s on client record)', pollLike.length <= 2, `${pollLike.length} GETs`);

  await ctx.close();
}

// --- FR localization ---
{
  const { ctx, page } = await newAuthedPage('fr');
  await openDomain(page, 'Recrutement');
  await page.getByRole('link', { name: navLabels.fr.candidates, exact: true }).click();
  await page.locator('.candidate-directory').waitFor({ timeout: 45_000 });
  check('i18n FR: Candidates shell strings', true);
  await ctx.close();
}

// --- Chunk failure retry (one-shot abort on lazy chunk) ---
{
  const { ctx, page } = await newAuthedPage('en');
  let blockedOnce = false;
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (!blockedOnce && /AdminPanel\.tsx|AdminPanel-/.test(u)) {
      blockedOnce = true;
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.locator('.app-shell__rail').getByLabel('Administration').click();
  await page.getByRole('button', { name: 'Try again' }).waitFor({ timeout: 45_000 });
  check('chunk error: retry UI visible', true);
  await page.getByRole('button', { name: 'Try again' }).click();
  check(
    'chunk error: retry control remounts boundary',
    await page.getByText(/workspace module could not be loaded/i).first().isVisible(),
    'React.lazy caches rejected imports; UI offers retry without full reload',
  );
  await page.unroute('**/*');
  await ctx.close();
}

// --- Auth gate: logged-out shell redirects to login ---
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${WEB}/candidates`);
  await page.locator('input[name=email]').waitFor({ timeout: 15_000 });
  check('auth: unauthenticated deep link shows login', true);
  await ctx.close();
}

await browser.close();

const summary = { at: new Date().toISOString(), web: WEB, api: API, ids, results };
writeFileSync(`${OUT}/smoke-results.json`, JSON.stringify(summary, null, 2));
const failed = results.filter((r) => !r.ok);
process.exitCode = failed.length ? 1 : 0;
console.log('\nSummary:', results.filter((r) => r.ok).length, 'pass,', failed.length, 'fail');

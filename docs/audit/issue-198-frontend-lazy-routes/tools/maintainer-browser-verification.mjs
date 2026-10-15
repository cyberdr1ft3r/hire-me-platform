// Maintainer-requested browser verification for PR #208 (Issue #198 lazy routes).
// Usage: node maintainer-browser-verification.mjs <playwright> <outDir>
// Env: WEB, API, EMAIL, PW (admin), optional VIEWER_EMAIL/VIEWER_PW
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2]);
const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });

const { WEB, API, EMAIL, PW } = process.env;
const VIEWER_EMAIL = process.env.VIEWER_EMAIL ?? 'issue114-view@test.hireme.test';
const VIEWER_PW = process.env.VIEWER_PW ?? 'Synthetic-viewer-123!';

const results = [];
const timings = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) });
  console.log(ok ? 'PASS' : 'FAIL', name, detail);
};
const recordTiming = (label, ms, extra = {}) => {
  timings.push({ label, ms, ...extra });
  console.log('TIMING', label, `${ms}ms`, extra.detail ?? '');
};

async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} ${res.status}`);
  return res.json();
}

function repoRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), '../../../../');
}

function runSetupScript(relativePath) {
  execSync(`pnpm --filter @hire-me/api exec dotenv -e ../../.env -- tsx ../../${relativePath}`, {
    cwd: repoRoot(),
    stdio: 'pipe',
  });
}

function runIssue114Setup() {
  try {
    runSetupScript('scripts/issue-114-evidence-setup.ts');
    runSetupScript('scripts/issue-198-public-browser-setup.ts');
    return true;
  } catch (e) {
    console.warn('public/setup failed', e.message?.slice(0, 300));
    return false;
  }
}

async function publicSlugFromApi() {
  const res = await fetch(`${API}/v1/public/opportunities`);
  if (!res.ok) return null;
  const body = await res.json();
  return body.opportunities?.[0]?.publicSlug ?? null;
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
  let missions = (await (await fetch(`${API}/v1/missions?page=1&pageSize=20`, { headers: auth })).json()).missions;
  if (missions.length < 1) {
    await fetch(`${API}/v1/missions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        clientId: clients[0].id,
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

async function authedPage(browser, email, password) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${WEB}/`);
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await page.click('button[type=submit]');
  await page.getByText(/Signed in as|Session ouverte/).waitFor({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  return { ctx, page };
}

async function delayRoute(page, pattern, ms) {
  let active = true;
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (active && pattern.test(u)) {
      await new Promise((r) => setTimeout(r, ms));
    }
    await route.continue();
  });
  return () => {
    active = false;
  };
}

runIssue114Setup();
const adminLogin = await login(EMAIL, PW);
const adminAuth = { authorization: `Bearer ${adminLogin.accessToken}` };
const ids = await ensureSyntheticData(adminAuth);
const publicSlug = await publicSlugFromApi();

const browser = await chromium.launch({ channel: 'chrome', headless: true });

// --- 1. Admin: direct URL, reload, lazy module ---
{
  const { ctx, page } = await authedPage(browser, EMAIL, PW);
  const t0 = Date.now();
  await page.goto(`${WEB}/admin`);
  await page.locator('section[aria-label="User administration"]').waitFor({ timeout: 45_000 });
  recordTiming('admin_direct_url_to_ready', Date.now() - t0);
  await page.screenshot({ path: `${OUT}/admin-direct.png` });
  check('admin: direct /admin loads User administration', true);

  await page.reload();
  await page.locator('section[aria-label="User administration"]').waitFor({ timeout: 45_000 });
  check('admin: reload keeps module', true);

  const stopDelay = await delayRoute(page, /AdminPanel\.tsx/, 1200);
  const t1 = Date.now();
  await page.goto(`${WEB}/`);
  await page.getByText(/Signed in as/).waitFor();
  await page.locator('.app-shell__rail').getByLabel('Administration').click();
  const sawFallback = await page
    .getByText(/Loading workspace|Chargement de l’espace/)
    .isVisible()
    .catch(() => false);
  await page.locator('section[aria-label="User administration"]').waitFor({ timeout: 45_000 });
  recordTiming('admin_rail_nav_with_1200ms_chunk_delay', Date.now() - t1, {
    detail: sawFallback ? 'fallback_seen' : 'fallback_not_seen',
  });
  check('admin: lazy navigation with held chunk completes', true, sawFallback ? 'fallback visible' : 'cached/fast');
  stopDelay();
  await ctx.close();
}

// --- 2. Public opportunity ---
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(`${WEB}/opportunities`);
  await page.locator('.public-opportunities, .public-site').first().waitFor({ timeout: 45_000 });
  recordTiming('public_list_cold_load', Date.now() - t0);
  await page.screenshot({ path: `${OUT}/public-opportunities-list.png` });
  check('public: cold load /opportunities', true);

  if (publicSlug) {
    const t1 = Date.now();
    await page.goto(`${WEB}/opportunities/${publicSlug}`);
    await page.locator('.public-site').waitFor({ timeout: 45_000 });
    await page.getByRole('heading', { name: /Issue114 Existing Public Title/i }).waitFor({ timeout: 45_000 });
    recordTiming('public_detail_direct_url', Date.now() - t1, { slug: publicSlug });
    check('public: direct detail URL', true, publicSlug);
    await page.reload();
    await page.locator('.public-site').waitFor({ timeout: 45_000 });
    await page.getByRole('heading', { name: /Issue114 Existing Public Title/i }).waitFor({ timeout: 45_000 });
    check('public: detail reload', true);
    await page.screenshot({ path: `${OUT}/public-opportunity-detail.png` });
  } else {
    check('public: direct detail URL', false, 'no public slug in API (run issue-114 setup)');
    check('public: detail reload', false, 'skipped');
  }
  await ctx.close();
}

// --- 3. Permission gates ---
{
  const { ctx, page } = await authedPage(browser, VIEWER_EMAIL, VIEWER_PW);
  await page.goto(`${WEB}/candidates`);
  await page.getByRole('heading', { name: /Protected workspace/i }).waitFor({ timeout: 20_000 });
  const denied = await page.getByText(/Permission denied/i).isVisible();
  check('permissions: guest deep link /candidates shows denied', denied);
  const hasDirectory = await page.locator('.candidate-directory').count();
  check('permissions: no candidate directory leaked', hasDirectory === 0, `count=${hasDirectory}`);
  await page.screenshot({ path: `${OUT}/permission-denied-candidates.png` });
  await ctx.close();
}

{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${WEB}/admin`);
  await page.locator('input[name=email]').waitFor({ timeout: 15_000 });
  check('permissions: unauthenticated /admin shows login', true);
  await ctx.close();
}

// --- 4. Sign-out while lazy module loading ---
{
  const { ctx, page } = await authedPage(browser, EMAIL, PW);
  const stopDelay = await delayRoute(page, /src\/candidates\/|CandidatesPanel/, 2500);
  const nav = page.goto(`${WEB}/candidates`);
  const loadingVisible = await page
    .getByText(/Loading workspace|Chargement de l’espace/)
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  await page.getByLabel(/Account and session/i).click();
  await page.getByRole('button', { name: /sign out/i }).click();
  await page.locator('input[name=email]').waitFor({ timeout: 15_000 });
  await nav.catch(() => {});
  stopDelay();
  const leaked =
    (await page.locator('.candidate-directory').count()) > 0 ||
    (await page.getByText(/Signed in as/).isVisible().catch(() => false));
  check('sign-out race: login shown after sign-out during chunk delay', !leaked, `loadingSeen=${loadingVisible}`);
  await page.screenshot({ path: `${OUT}/signout-during-lazy-load.png` });
  await ctx.close();
}

// --- 5. Cold-load timing (fresh context, no invented thresholds) ---
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const chunkAt = [];
  page.on('response', (r) => {
    const u = r.url();
    if (/CandidatesPanel|clients\/ClientsPanel|AdminPanel/.test(u) && u.includes('.js')) {
      chunkAt.push({ file: u.split('/').pop(), t: Date.now() });
    }
  });
  const t0 = Date.now();
  await page.goto(`${WEB}/`);
  recordTiming('cold_login_shell_dom', Date.now() - t0);
  await page.fill('input[name=email]', EMAIL);
  await page.fill('input[name=password]', PW);
  const tLogin = Date.now();
  await page.click('button[type=submit]');
  await page.getByText(/Signed in as/).waitFor({ timeout: 30_000 });
  recordTiming('cold_login_submit_to_signed_in', Date.now() - tLogin);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Recruitment/i }).click();
  await page.keyboard.press('Escape');
  const tCand = Date.now();
  page.on('response', () => {});
  await page.getByRole('link', { name: 'Candidates', exact: true }).click();
  await page.locator('.candidate-directory').waitFor({ timeout: 45_000 });
  recordTiming('cold_first_candidates_click_to_directory', Date.now() - tCand, {
    chunks: chunkAt.map((c) => c.file).join(','),
  });
  await ctx.close();
}

await browser.close();

writeFileSync(`${OUT}/maintainer-verification-results.json`, JSON.stringify({ at: new Date().toISOString(), web: WEB, api: API, ids, publicSlug, results, timings }, null, 2));

const failed = results.filter((r) => !r.ok);
process.exitCode = failed.length ? 1 : 0;
console.log('\nMaintainer checks:', results.length - failed.length, 'pass,', failed.length, 'fail');

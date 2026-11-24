import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, open } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const root = fileURLToPath(new URL('../', import.meta.url));
const apiCwd = path.join(root, 'apps/api');
const webCwd = path.join(root, 'apps/web');
const db = process.env.TEST_DATABASE_URL;
if (process.env.NODE_ENV !== 'test' || !db) {
  throw new Error(
    'Run with NODE_ENV=test and a provisioned TEST_DATABASE_URL. See the disposable DB runbook.',
  );
}
if ([process.env.DATABASE_URL, process.env.DIRECT_URL].some((url) => url && url !== db)) {
  throw new Error('Unset DATABASE_URL and DIRECT_URL before starting functional QA.');
}
const isolatedEnv = { ...process.env, DATABASE_URL: db, DIRECT_URL: db };
const health = '/health';
const base = (port) => `http://127.0.0.1:${port}`;
const apiPort = 3118;
const webPort = 5198;
const api = base(apiPort);
const web = base(webPort);
const candidateWorkspace = process.argv.includes('--candidate-workspace');
const candidatePortal = candidateWorkspace || process.argv.includes('--candidate-portal');
const clientPortal = process.argv.includes('--client-portal');
const evidenceRoot = path.join(root, '.tmp-runtime/issue283');
await mkdir(evidenceRoot, { recursive: true });
const evidence = await mkdtemp(path.join(evidenceRoot, 'run-'));
const candidateOutbox = path.join(evidence, 'candidate-mail');
const clientOutbox = path.join(evidence, 'client-mail');

function start(args, cwd, env, stdio = 'inherit') {
  const child = spawn(process.execPath, args, { cwd, env, stdio });
  const exited = once(child, 'exit');
  // Keep failed process starts observable through the awaited promise.
  exited.catch(() => {});
  return { child, exited };
}
async function run(args, cwd, env) {
  const [code, signal] = await start(args, cwd, env).exited;
  if (code !== 0) throw new Error(`Command failed (${signal ?? code}): ${args.join(' ')}`);
}
async function ready(process, url, accept) {
  const stop = Date.now() + 45_000;
  while (Date.now() < stop) {
    const result = await Promise.race([
      process.exited.then(([code, signal]) => {
        throw new Error(`Server exited (${signal ?? code}): ${url}`);
      }),
      fetch(url, { signal: AbortSignal.timeout(1_000) })
        .then(accept)
        .catch(() => false),
    ]);
    if (result) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

// The repo guard verifies the URL, on-disk receipt, and marker inside PostgreSQL.
await run(['--import', 'tsx', 'test/support/test-db-cli.ts', 'check-catalog'], apiCwd, isolatedEnv);
for (const url of [api + health, web]) {
  if (await fetch(url, { signal: AbortSignal.timeout(500) }).catch(() => null)) {
    throw new Error(`Functional QA needs exclusive use of ${url}.`);
  }
}
const services = [];
async function service(label, args, cwd, env) {
  const log = await open(path.join(evidence, `${label}.log`), 'w');
  try {
    const child = start(args, cwd, env, ['ignore', log.fd, log.fd]);
    services.push(child);
    return child;
  } finally {
    await log.close();
  }
}
console.log(`Functional QA evidence: ${evidence}`);
try {
  const backend = await service('api', ['--import', 'tsx', 'src/main.ts'], apiCwd, {
    ...isolatedEnv,
    API_HOST: '127.0.0.1',
    API_PORT: String(apiPort),
    API_CORS_ORIGIN: web,
    AUTH_ACCESS_TOKEN_SECRET: 'FunctionalQaOnlyAccessTokenSecretWithEnoughCharacters',
    AUTH_REFRESH_TOKEN_PEPPER: 'FunctionalQaOnlyRefreshTokenPepperWithEnoughCharacters',
    AUTH_COOKIE_SECURE: 'false',
    CANDIDATE_PORTAL_ENABLED: candidatePortal ? 'true' : 'false',
    ...(candidatePortal
      ? { CANDIDATE_MAIL_OUTBOX: candidateOutbox, CANDIDATE_GOOGLE_CLIENT_ID: undefined }
      : {}),
    CLIENT_PORTAL_ENABLED: clientPortal ? 'true' : 'false',
    ...(clientPortal ? { CLIENT_PORTAL_MAIL_OUTBOX: clientOutbox } : {}),
    INVOICE_ISSUANCE_ENABLED: 'false',
    PRIVATE_UPLOAD_STORAGE_ROOT: path.join(evidence, 'private-uploads'),
  });
  await ready(
    backend,
    api + health,
    async (result) => result.ok && (await result.json()).service === 'hire-me-api',
  );
  const frontend = await service(
    'web',
    [
      'node_modules/vite/bin/vite.js',
      '--host',
      '127.0.0.1',
      '--port',
      String(webPort),
      '--strictPort',
    ],
    webCwd,
    {
      ...process.env,
      VITE_API_BASE_URL: api,
    },
  );
  await ready(frontend, web, (result) => result.ok);
  await run(
    [
      '--test',
      '--test-concurrency=1',
      ...(candidatePortal ? ['scripts/candidate-portal.test.mjs'] : []),
      ...(candidateWorkspace ? ['scripts/candidate-workspace.test.mjs'] : []),
      ...(clientPortal ? ['scripts/client-portal.test.mjs'] : []),
      ...(!candidatePortal && !clientPortal
        ? ['scripts/issue-283-public-application.test.mjs']
        : []),
    ],
    root,
    {
      ...process.env,
      HIREME_E2E_API: api,
      HIREME_E2E_WEB: web,
      HIREME_E2E_EVIDENCE: evidence,
      ...(candidatePortal ? { CANDIDATE_MAIL_OUTBOX: candidateOutbox } : {}),
      ...(clientPortal ? { CLIENT_PORTAL_MAIL_OUTBOX: clientOutbox } : {}),
    },
  );
} finally {
  for (const { child } of services) child.kill();
  await Promise.allSettled(services.map(({ exited }) => exited));
}

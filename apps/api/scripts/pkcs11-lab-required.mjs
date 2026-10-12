/**
 * Required-mode SoftHSM PKCS#11 lab runner for the dedicated CI job (Issue #183).
 *
 * Fails closed when the SoftHSM CLI or PKCS#11 module is unavailable, when any lab test
 * fails, or when the real SoftHSM suite did not execute. Normal `pnpm test` stays skippable.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REAL_SUITE = 'PKCS#11 SoftHSM signing lab (Issue #183)';
const DEFAULT_MODULE_PATHS = [
  '/usr/lib/softhsm/libsofthsm2.so',
  '/usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so',
  '/usr/local/lib/softhsm/libsofthsm2.so',
];

function fail(reason) {
  console.log(`PKCS11_LAB_REQUIRED: FAILED ${reason}`);
  process.exit(1);
}

function resolveModulePath() {
  const explicit = process.env.HIREME_PKCS11_LAB_MODULE_PATH?.trim();
  if (explicit) return existsSync(explicit) ? explicit : null;
  return DEFAULT_MODULE_PATHS.find((candidate) => existsSync(candidate)) ?? null;
}

const cli = spawnSync('softhsm2-util', ['--version'], { encoding: 'utf8' });
if (cli.error || cli.status !== 0) fail('SOFTHSM_CLI_MISSING');
const softhsmVersion = /^\d+\.\d+\.\d+$/.test(cli.stdout.trim()) ? cli.stdout.trim() : 'unknown';

if (!resolveModulePath()) fail('MODULE_UNAVAILABLE');

const apiRoot = fileURLToPath(new URL('..', import.meta.url));
const vitestBin = join(apiRoot, 'node_modules', '.bin', 'vitest');
const reportDir = mkdtempSync(join(tmpdir(), 'hireme-pkcs11-lab-report-'));
const reportPath = join(reportDir, 'vitest.json');

let report = null;
let runFailure = null;
try {
  const run = spawnSync(
    vitestBin,
    [
      'run',
      'src/document-signing/lab',
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${reportPath}`,
    ],
    { cwd: apiRoot, stdio: 'inherit', env: { ...process.env, PKCS11_LAB_REQUIRED: '1' } },
  );
  if (run.error) runFailure = 'VITEST_NOT_RUNNABLE';
  else if (!existsSync(reportPath)) runFailure = 'REPORT_MISSING';
  else if (run.status !== 0) runFailure = 'LAB_TESTS_FAILED';
  else report = JSON.parse(readFileSync(reportPath, 'utf8'));
} finally {
  rmSync(reportDir, { recursive: true, force: true });
}
if (runFailure) fail(runFailure);

const realResults = report.testResults
  .flatMap((file) => file.assertionResults)
  .filter((result) => result.ancestorTitles[0] === REAL_SUITE);
const executed = realResults.filter((result) => result.status === 'passed').length;
const notPassed = realResults.length - executed;

console.log(`PKCS11_LAB_SOFTHSM_VERSION=${softhsmVersion}`);
console.log(`PKCS11_LAB_REAL_SOFTHSM_TESTS_EXECUTED=${executed}`);
console.log(`PKCS11_LAB_REAL_SOFTHSM_TESTS_NOT_PASSED=${notPassed}`);
if (executed === 0) fail('REAL_SOFTHSM_SUITE_NOT_EXECUTED');
if (notPassed !== 0) fail('REAL_SOFTHSM_SUITE_INCOMPLETE');
console.log('PKCS11_LAB_REQUIRED: OK');

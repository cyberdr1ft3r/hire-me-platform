import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { mapNativePkcs11Failure } from './pkcs11-lab.errors.js';

export type SofthsmEphemeralEnvironment = {
  rootDir: string;
  configPath: string;
  tokenLabel: string;
  userPin: string;
  soPin: string;
  previousSofthsmConf: string | undefined;
};

export function createEphemeralSofthsmEnvironment(tokenLabel: string): SofthsmEphemeralEnvironment {
  const rootDir = mkdtempSync(join(tmpdir(), 'hireme-pkcs11-lab-'));
  const tokenDir = join(rootDir, 'tokens');
  mkdirSync(tokenDir, { recursive: true });
  const configPath = join(rootDir, 'softhsm2.conf');
  writeFileSync(
    configPath,
    `directories.tokendir = ${tokenDir}\nobjectstore.backend = file\nlog.level = ERROR\n`,
  );

  const userPin = randomLabPin('user');
  const soPin = randomLabPin('so');

  const previousSofthsmConf = process.env.SOFTHSM2_CONF;
  process.env.SOFTHSM2_CONF = configPath;

  try {
    execFileSync(
      'softhsm2-util',
      ['--init-token', '--slot', '0', '--label', tokenLabel, '--pin', userPin, '--so-pin', soPin],
      { env: process.env, stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch {
    restoreSofthsmConf(previousSofthsmConf);
    rmSync(rootDir, { recursive: true, force: true });
    throw mapNativePkcs11Failure('PKCS11_TOKEN_INIT_FAILED');
  }

  return { rootDir, configPath, tokenLabel, userPin, soPin, previousSofthsmConf };
}

export function destroyEphemeralSofthsmEnvironment(env: SofthsmEphemeralEnvironment): void {
  restoreSofthsmConf(env.previousSofthsmConf);
  rmSync(env.rootDir, { recursive: true, force: true });
}

function restoreSofthsmConf(previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env.SOFTHSM2_CONF;
  } else {
    process.env.SOFTHSM2_CONF = previous;
  }
}

/** Per-run PIN from the CSPRNG; never logged, persisted, or committed. */
function randomLabPin(kind: 'user' | 'so'): string {
  return `hm-${kind}-${randomBytes(16).toString('hex')}`;
}

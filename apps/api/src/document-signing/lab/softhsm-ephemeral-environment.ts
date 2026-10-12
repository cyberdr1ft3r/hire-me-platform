import { execFileSync } from 'node:child_process';
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
    process.env.SOFTHSM2_CONF = previousSofthsmConf;
    rmSync(rootDir, { recursive: true, force: true });
    throw mapNativePkcs11Failure('PKCS11_TOKEN_NOT_FOUND');
  }

  return { rootDir, configPath, tokenLabel, userPin, soPin, previousSofthsmConf };
}

export function destroyEphemeralSofthsmEnvironment(env: SofthsmEphemeralEnvironment): void {
  process.env.SOFTHSM2_CONF = env.previousSofthsmConf;
  rmSync(env.rootDir, { recursive: true, force: true });
}

function randomLabPin(kind: 'user' | 'so'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Buffer.from(bytes).toString('hex');
  return `hm-${kind}-${hex}`;
}

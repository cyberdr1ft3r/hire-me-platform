/**
 * Development/test-only SoftHSM PKCS#11 smoke (Issue #183).
 *
 * Output is limited to fixed status lines: `PKCS11_LAB_SMOKE: OK` or
 * `PKCS11_LAB_SMOKE: FAILED <STEP>`. PINs are generated per run and never printed.
 */
import { execFileSync } from 'node:child_process';
import { createPublicKey, createVerify, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import graphene from 'graphene-pk11';

const DEFAULT_MODULE_PATHS = [
  '/usr/lib/softhsm/libsofthsm2.so',
  '/usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so',
  '/usr/local/lib/softhsm/libsofthsm2.so',
];

class SmokeFailure extends Error {
  constructor(step) {
    super(step);
    this.step = step;
  }
}

function step(name, fn) {
  try {
    return fn();
  } catch (error) {
    if (error instanceof SmokeFailure) throw error;
    throw new SmokeFailure(name);
  }
}

function resolveModulePath() {
  const explicit = process.env.HIREME_PKCS11_LAB_MODULE_PATH?.trim();
  if (explicit) return existsSync(explicit) ? explicit : null;
  return DEFAULT_MODULE_PATHS.find((candidate) => existsSync(candidate)) ?? null;
}

function runtimePin(kind) {
  return `hm-${kind}-${randomBytes(16).toString('hex')}`;
}

const labDir = mkdtempSync(join(tmpdir(), 'hireme-pkcs11-smoke-'));
const previousConf = process.env.SOFTHSM2_CONF;
let mod = null;
let session = null;
let exitCode = 0;

try {
  const modulePath = resolveModulePath();
  if (!modulePath) throw new SmokeFailure('MODULE_UNAVAILABLE');

  const tokenDir = join(labDir, 'tokens');
  mkdirSync(tokenDir, { recursive: true });
  const confPath = join(labDir, 'softhsm2.conf');
  writeFileSync(
    confPath,
    `directories.tokendir = ${tokenDir}\nobjectstore.backend = file\nlog.level = ERROR\n`,
  );
  process.env.SOFTHSM2_CONF = confPath;

  const label = `HireMeLabSmoke${randomBytes(4).toString('hex')}`;
  const userPin = runtimePin('user');
  const soPin = runtimePin('so');
  step('TOKEN_INIT', () =>
    execFileSync(
      'softhsm2-util',
      ['--init-token', '--free', '--label', label, '--pin', userPin, '--so-pin', soPin],
      { env: process.env, stdio: 'ignore' },
    ),
  );

  mod = step('MODULE_LOAD', () => {
    const loaded = graphene.Module.load(modulePath, label);
    loaded.initialize();
    return loaded;
  });

  const slot = step('SLOT_LOOKUP', () => {
    const slots = mod.getSlots(true);
    for (let i = 0; i < slots.length; i++) {
      const candidate = slots.items(i);
      if (candidate.getToken().label.trim() === label) return candidate;
    }
    throw new SmokeFailure('SLOT_NOT_FOUND');
  });

  session = step('SESSION_OPEN', () =>
    slot.open(graphene.SessionFlag.RW_SESSION | graphene.SessionFlag.SERIAL_SESSION),
  );
  step('LOGIN', () => session.login(userPin));

  const id = randomBytes(8);
  const keys = step('KEYGEN', () =>
    session.generateKeyPair(
      graphene.KeyGenMechanism.RSA,
      {
        keyType: graphene.KeyType.RSA,
        modulusBits: 2048,
        publicExponent: Buffer.from([1, 0, 1]),
        label: 'smoke-sign-key',
        id,
        token: true,
        verify: true,
      },
      {
        keyType: graphene.KeyType.RSA,
        label: 'smoke-sign-key',
        id,
        token: true,
        private: true,
        sensitive: true,
        extractable: false,
        sign: true,
      },
    ),
  );

  step('KEY_PROTECTION', () => {
    const attrs = keys.privateKey.getAttribute({ sensitive: null, extractable: null });
    if (attrs.sensitive !== true || attrs.extractable !== false) {
      throw new SmokeFailure('KEY_PROTECTION');
    }
  });

  const message = randomBytes(64);
  const signature = step('SIGN', () => {
    const signer = session.createSign('SHA256_RSA_PKCS', keys.privateKey);
    signer.update(message);
    return signer.final();
  });

  step('VERIFY', () => {
    const { modulus, publicExponent } = keys.publicKey.getAttribute({
      modulus: null,
      publicExponent: null,
    });
    const publicKey = createPublicKey({
      key: {
        kty: 'RSA',
        n: Buffer.from(modulus).toString('base64url'),
        e: Buffer.from(publicExponent).toString('base64url'),
      },
      format: 'jwk',
    });
    const verifier = createVerify('sha256');
    verifier.update(message);
    if (!verifier.verify(publicKey, signature)) throw new SmokeFailure('VERIFY');
  });

  console.log('PKCS11_LAB_SMOKE: OK');
} catch (error) {
  const failedStep = error instanceof SmokeFailure ? error.step : 'UNEXPECTED';
  console.log(`PKCS11_LAB_SMOKE: FAILED ${failedStep}`);
  exitCode = 1;
} finally {
  try {
    session?.logout();
  } catch {
    // teardown only
  }
  try {
    session?.close();
  } catch {
    // teardown only
  }
  try {
    mod?.finalize();
  } catch {
    // teardown only
  }
  if (previousConf === undefined) delete process.env.SOFTHSM2_CONF;
  else process.env.SOFTHSM2_CONF = previousConf;
  rmSync(labDir, { recursive: true, force: true });
}

process.exitCode = exitCode;

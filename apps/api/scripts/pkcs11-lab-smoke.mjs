import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import graphene from 'graphene-pk11';

const labDir = mkdtempSync(join(tmpdir(), 'hireme-pkcs11-smoke-'));
const tokenDir = join(labDir, 'tokens');
mkdirSync(tokenDir, { recursive: true });
const confPath = join(labDir, 'softhsm2.conf');
writeFileSync(confPath, `directories.tokendir = ${tokenDir}\nobjectstore.backend = file\n`);
process.env.SOFTHSM2_CONF = confPath;

const label = 'HireMeLabSmoke';
const userPin = 'lab-user-pin-183';
const soPin = 'lab-so-pin-183-87654321';
execFileSync(
  'softhsm2-util',
  ['--init-token', '--slot', '0', '--label', label, '--pin', userPin, '--so-pin', soPin],
  { env: process.env, stdio: 'inherit' },
);

const lib = '/usr/lib/softhsm/libsofthsm2.so';
const mod = graphene.Module.load(lib, label);
mod.initialize();
const slots = mod.getSlots(true);
let slot = null;
for (let i = 0; i < slots.length; i++) {
  const candidate = slots.items(i);
  if (candidate.getToken().label.trim() === label) {
    slot = candidate;
    break;
  }
}
if (!slot) throw new Error('slot missing');
const session = slot.open(graphene.SessionFlag.RW_SESSION | graphene.SessionFlag.SERIAL_SESSION);
session.login(userPin);
const id = Buffer.from('01020304', 'hex');
const keys = session.generateKeyPair(
  graphene.KeyGenMechanism.RSA,
  {
    keyType: graphene.KeyType.RSA,
    modulusBits: 2048,
    publicExponent: Buffer.from([1, 0, 1]),
    label: 'person-sign-key',
    id,
    token: true,
    verify: true,
  },
  {
    keyType: graphene.KeyType.RSA,
    label: 'person-sign-key',
    id,
    token: true,
    private: true,
    sensitive: true,
    extractable: false,
    sign: true,
  },
);
console.log('keypair ok', keys.privateKey.handle);
session.logout();
session.close();
mod.finalize();
rmSync(labDir, { recursive: true, force: true });
console.log('ok');

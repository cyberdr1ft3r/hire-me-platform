import { webcrypto } from 'node:crypto';

import { CryptoEngine, setEngine } from 'pkijs';

let pkijsEngineReady = false;

/** One-time PKI.js Web Crypto binding for Node (certificate chain validation). */
export function ensurePkijsCryptoEngine(): void {
  if (pkijsEngineReady) {
    return;
  }
  setEngine('hireme-node', new CryptoEngine({ name: 'hireme-node', crypto: webcrypto }));
  pkijsEngineReady = true;
}

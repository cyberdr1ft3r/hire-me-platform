import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('PKCS#11 lab production isolation', () => {
  it('does not wire lab code into DocumentSigningModule or controller', () => {
    const moduleSource = readFileSync(
      new URL('../document-signing.module.ts', import.meta.url),
      'utf8',
    );
    const controllerSource = readFileSync(
      new URL('../document-signing.controller.ts', import.meta.url),
      'utf8',
    );
    expect(moduleSource).not.toMatch(/document-signing\/lab/);
    expect(controllerSource).not.toMatch(/pkcs11|PKCS11|SoftHSM|softhsm/i);
  });
});

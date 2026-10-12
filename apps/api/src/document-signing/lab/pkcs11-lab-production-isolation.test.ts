import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = fileURLToPath(new URL('../../', import.meta.url));
const labRoot = fileURLToPath(new URL('./', import.meta.url));

function productionSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return path.startsWith(labRoot.replace(/[\\/]$/, '')) ? [] : productionSourceFiles(path);
    }
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

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
    expect(moduleSource).not.toMatch(/document-signing\/lab|\.\/lab\//);
    expect(controllerSource).not.toMatch(/pkcs11|PKCS11|SoftHSM|softhsm/i);
  });

  it('keeps every non-lab API source free of lab, PKCS#11 binding, and SoftHSM references', () => {
    const files = productionSourceFiles(srcRoot);
    expect(files.length).toBeGreaterThan(50);
    const offenders = files
      .filter((file) =>
        /(?:from|import)\s*\(?\s*['"][^'"]*\/lab\/|graphene-pk11|pkcs11js|softhsm/i.test(
          readFileSync(file, 'utf8'),
        ),
      )
      .map((file) => relative(srcRoot, file).split(sep).join('/'));
    expect(offenders).toEqual([]);
  });

  it('scopes the PKCS#11 binding to devDependencies only', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(manifest.dependencies?.['graphene-pk11']).toBeUndefined();
    expect(manifest.dependencies?.pkcs11js).toBeUndefined();
    expect(manifest.devDependencies?.['graphene-pk11']).toBeDefined();
  });
});

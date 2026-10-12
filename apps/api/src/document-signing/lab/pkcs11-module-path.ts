import { existsSync } from 'node:fs';

/** Resolve a PKCS#11 module path for lab use only — never a provider-specific name. */
export function resolvePkcs11ModulePathForLab(): string | null {
  const candidates = [
    process.env.HIREME_PKCS11_LAB_MODULE_PATH?.trim(),
    '/usr/lib/softhsm/libsofthsm2.so',
    '/usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so',
    '/usr/local/lib/softhsm/libsofthsm2.so',
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function isPkcs11LabRuntimeAvailable(): boolean {
  return resolvePkcs11ModulePathForLab() !== null;
}

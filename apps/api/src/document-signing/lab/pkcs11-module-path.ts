import { existsSync } from 'node:fs';

const DEFAULT_LAB_MODULE_PATHS = [
  '/usr/lib/softhsm/libsofthsm2.so',
  '/usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so',
  '/usr/local/lib/softhsm/libsofthsm2.so',
];

/**
 * Resolve a PKCS#11 module path for lab use only — never a provider-specific name.
 * An explicit `HIREME_PKCS11_LAB_MODULE_PATH` is authoritative: if it does not exist, no
 * default path is substituted.
 */
export function resolvePkcs11ModulePathForLab(): string | null {
  const explicit = process.env.HIREME_PKCS11_LAB_MODULE_PATH?.trim();
  if (explicit) {
    return existsSync(explicit) ? explicit : null;
  }
  return DEFAULT_LAB_MODULE_PATHS.find((candidate) => existsSync(candidate)) ?? null;
}

export function isPkcs11LabRuntimeAvailable(): boolean {
  return resolvePkcs11ModulePathForLab() !== null;
}

/** Development/test-only PKCS#11 lab errors — safe categories only (Issue #183). */

export type Pkcs11LabErrorCode =
  | 'PKCS11_MODULE_UNAVAILABLE'
  | 'PKCS11_MODULE_LOAD_FAILED'
  | 'PKCS11_TOKEN_NOT_FOUND'
  | 'PKCS11_SLOT_NOT_FOUND'
  | 'PKCS11_LOGIN_FAILED'
  | 'PKCS11_SESSION_FAILED'
  | 'PKCS11_KEY_NOT_FOUND'
  | 'PKCS11_CERT_NOT_FOUND'
  | 'PKCS11_CERT_KEY_MISMATCH'
  | 'PKCS11_SIGN_MECHANISM_UNSUPPORTED'
  | 'PKCS11_SIGN_FAILED'
  | 'PKCS11_OPERATION_ABORTED';

export class Pkcs11LabError extends Error {
  readonly code: Pkcs11LabErrorCode;

  constructor(code: Pkcs11LabErrorCode, message: string) {
    super(message);
    this.name = 'Pkcs11LabError';
    this.code = code;
  }
}

export function mapNativePkcs11Failure(code: Pkcs11LabErrorCode): Pkcs11LabError {
  return new Pkcs11LabError(code, code);
}

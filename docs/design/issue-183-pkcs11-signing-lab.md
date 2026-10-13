# Issue #183 — Provider-neutral PKCS#11 signing lab (SoftHSM)

Parent: **#132**. Provider evidence gate: **#147** (unchanged). Phase A/B baseline: **D-083**, **D-084**.

## Purpose

This lab answers **only**:

> Can Hire-Me's prepared-PDF / CMS / Phase B validation architecture operate through a **standard PKCS#11 token interface**?

It does **not** prove Barid eSign compatibility, qualified Moroccan signatures/seals, or authorization for a Barid adapter. **#147** remains the real provider-evidence gate.

## Architecture flow

```text
Provisioning (lab only):
  C_GenerateKeyPair (RSA-2048, on-token) ── CKA_ID = random 16 bytes, CKA_LABEL = key label
  → synthetic X.509 TBS signed on-token (SHA256_RSA_PKCS)
  → C_CreateObject CKO_CERTIFICATE / CKC_X_509 ── same CKA_ID, CKA_LABEL = certificate label

Signing proof:
  C_FindObjects(CKO_CERTIFICATE + CKC_X_509 + CKA_LABEL) → CKA_ID, CKA_VALUE (DER)
  → C_FindObjects(CKO_PRIVATE_KEY + CKA_LABEL) → CKA_ID, CKA_MODULUS, CKA_PUBLIC_EXPONENT
  → require exactly one of each, equal CKA_ID, certificate RSA key == token key
  → Synthetic PDF → PreparedSigningArtifactService (D-083/D-084 ByteRange)
  → CMS detached signature (@signpdf + forge PKCS#7, RSA_PKCS on-token)
  → PdfSignatureValidatorService (Phase B, token certificate as test-only trust anchor)
  → VALID / INVALID (test scope only; no SIGNED DB publication in this lab)
```

Code lives under `apps/api/src/document-signing/lab/` and is **not** imported by `DocumentSigningModule`, controllers, or production DI.

## Prerequisites

- **Linux (CI/dev):** `softhsm2`, `libsofthsm2` (Ubuntu package `softhsm2`).
- **Windows:** use [SoftHSM2 for Windows](https://github.com/disig/SoftHSM2-for-Windows); automation in this repo targets Linux CI; manual lab runs are documented here.
- **Node:** repository Node version (see `.node-version`); native addon **`pkcs11js`** (via **`graphene-pk11`**) must build (listed in `pnpm-workspace.yaml` `onlyBuiltDependencies`).

## Lab commands

```bash
# Developer mode: SoftHSM suite runs when SoftHSM2 is installed, otherwise it is skipped
pnpm --filter @hire-me/api test:signing-pkcs11-lab

# Required mode (dedicated CI job): fails closed if softhsm2-util, the native binding, or the module is missing,
# if any lab test fails, or if zero real SoftHSM tests executed
pnpm --filter @hire-me/api test:signing-pkcs11-lab:required

# Smoke: ephemeral token, on-token key pair, one sign + verify; prints PKCS11_LAB_SMOKE: OK
pnpm --filter @hire-me/api pkcs11:lab-smoke
```

Required mode prints fixed-safe evidence lines only:

```text
PKCS11_LAB_SOFTHSM_VERSION=<x.y.z>
PKCS11_LAB_REAL_SOFTHSM_TESTS_EXECUTED=<n>   # must be > 0
PKCS11_LAB_REAL_SOFTHSM_TESTS_NOT_PASSED=0
PKCS11_LAB_REQUIRED: OK
```

Failure lines are `PKCS11_LAB_REQUIRED: FAILED <SOFTHSM_CLI_MISSING | NATIVE_BINDING_UNAVAILABLE | MODULE_UNAVAILABLE | LAB_TESTS_FAILED | REAL_SOFTHSM_SUITE_NOT_EXECUTED | REAL_SOFTHSM_SUITE_INCOMPLETE | ...>`. Inside the suite, `PKCS11_LAB_REQUIRED=1` also turns the "SoftHSM unavailable" fallback test into a failure.

Environment overrides:

- `SOFTHSM2_CONF` — set automatically by the lab for ephemeral tokens; do not point at production tokens.
- `HIREME_PKCS11_LAB_MODULE_PATH` — explicit PKCS#11 module path. When set it is authoritative: a nonexistent path is reported as unavailable instead of falling back to default SoftHSM paths. CI sets `/usr/lib/softhsm/libsofthsm2.so`.
- `PKCS11_LAB_REQUIRED=1` — set by the required runner; not needed for developer runs.

## Token / credential strategy

- Ephemeral `SOFTHSM2_CONF` + temp `tokendir`; destroyed after tests and smoke.
- **User/SO PINs generated per run** from `node:crypto` `randomBytes` (tests, smoke); never committed, logged, or printed. The mock client PIN is also random per run.
- RSA-2048 key pair generated **inside** the token (`CKA_TOKEN`, `CKA_PRIVATE`, `CKA_SENSITIVE=true`, `CKA_EXTRACTABLE=false`, `CKA_SIGN=true`).
- Self-signed X.509 with CN **`Hire-Me PKCS11 Test Signer - NOT QUALIFIED`** (separate **`Hire-Me PKCS11 Test Seal - NOT QUALIFIED`** org-seal credential in tests); TBS signed on-token.
- The certificate is stored on-token as `CKO_CERTIFICATE` / `CKC_X_509` (`CKA_TOKEN=true`, `CKA_PRIVATE=false`, `CKA_SUBJECT`, `CKA_ISSUER`, `CKA_SERIAL_NUMBER`, `CKA_VALUE`).
- Public key, private key, and certificate share one random 16-byte `CKA_ID`; the key pair carries the requested key `CKA_LABEL`, the certificate the requested certificate `CKA_LABEL`.
- Provisioning returns labels only. Signing always resolves the credential from token objects: exactly one certificate by label (else `PKCS11_CERT_NOT_FOUND` / `PKCS11_OBJECT_AMBIGUOUS`), exactly one private key by label (else `PKCS11_KEY_NOT_FOUND` / `PKCS11_OBJECT_AMBIGUOUS`), equal `CKA_ID` and equal RSA modulus/exponent between certificate and private key (else `PKCS11_CERT_KEY_MISMATCH`). A public-key object with the same `CKA_ID`, if present, must match too.
- Test trust anchor = the token-resolved certificate PEM (never added to production `SIGNING_TRUST_ANCHOR_PEMS`).

## PKCS#11 signing mechanisms

- **Certificate (TBS) signing:** `SHA256_RSA_PKCS` over TBSCertificate DER.
- **CMS/PDF signing:** `RSA_PKCS` over SHA-256 DigestInfo (single-shot `Sign.once`), matching forge PKCS#7 expectations.
- The client requires the slot to advertise both mechanisms at open time, else `PKCS11_SIGN_MECHANISM_UNSUPPORTED`.

## Native dependency note

| Package | Role | Scope |
| --- | --- | --- |
| `graphene-pk11` | PKCS#11 session/key/sign abstraction | `@hire-me/api` **devDependency** only |
| `pkcs11js` | Native PKCS#11 binding (node-gyp) | Transitive; built in CI/dev install |

No production runtime dependency on PKCS#11. Normal `pnpm test` includes mock-matrix tests; SoftHSM tests skip when the module or CLI is unavailable. Only the dedicated CI job runs required mode. No dependency was added for certificate objects: `graphene-pk11` already exposes `C_CreateObject` / `C_FindObjects` / `C_GetAttributeValue`.

## Evidence matrix

Real SoftHSM rows run in the dedicated CI job (required mode) and locally when SoftHSM2 is installed. Mock rows exercise the in-memory stand-in only and are **not** SoftHSM or token evidence.

| Case | Code / outcome | Evidence |
| --- | --- | --- |
| Ephemeral token init with runtime PINs | — | Real SoftHSM |
| On-token key pair, cert object, shared `CKA_ID`, labels; resolve after module re-initialization | private key read from token: `CKA_TOKEN`, `CKA_PRIVATE`, `CKA_SENSITIVE`, `CKA_LOCAL`, `CKA_ALWAYS_SENSITIVE`, `CKA_NEVER_EXTRACTABLE` true, `CKA_EXTRACTABLE` false; certificate `CKA_TOKEN` true; public-key object matched | Real SoftHSM |
| Prepared PDF signed with token-resolved credential; CMS signer cert == token cert DER; signer public key == token key modulus; Phase B `VALID` | `VALID` | Real SoftHSM |
| Person signature vs organization seal distinct (`CKA_ID`, fingerprint, CN) | — | Real SoftHSM |
| Tampered signed bytes | `INVALID`, `PREPARED_ARTIFACT_BYTE_MISMATCH` | Real SoftHSM |
| Different prepared source / wrong expected fingerprint | binding `INVALID` / not `VALID` | Real SoftHSM |
| Wrong PIN (no PIN in message or stack) | `PKCS11_LOGIN_FAILED` | Real SoftHSM + mock |
| Certificate object missing | `PKCS11_CERT_NOT_FOUND` | Real SoftHSM + mock |
| Private key object missing | `PKCS11_KEY_NOT_FOUND` | Real SoftHSM + mock |
| Matching certificate stored under a different `CKA_ID` | `PKCS11_CERT_KEY_MISMATCH` | Real SoftHSM |
| Certificate whose `CKA_ID` belongs to another key pair | `PKCS11_CERT_KEY_MISMATCH` | Real SoftHSM + mock |
| Certificate with the key's `CKA_ID` but another public key | `PKCS11_CERT_KEY_MISMATCH` | Real SoftHSM |
| Duplicate certificate label | `PKCS11_OBJECT_AMBIGUOUS` | Real SoftHSM |
| Sign after logout | `PKCS11_SIGN_FAILED` | Real SoftHSM |
| Key generation without user login | `PKCS11_PROVISIONING_FAILED` | Real SoftHSM |
| Unknown token label | `PKCS11_SLOT_NOT_FOUND` | Real SoftHSM |
| Module path missing | `PKCS11_MODULE_UNAVAILABLE` | Real module resolution (no token) |
| Non-PKCS#11 file as module | `PKCS11_MODULE_LOAD_FAILED` | Real native load (no token) |
| Wrong trust anchor (unrelated synthetic anchor with the same CN) | CMS and binding `VALID`, chain `UNTRUSTED`, `INVALID`, `CERTIFICATE_CHAIN_UNTRUSTED` | Real SoftHSM + mock |
| Sign failure / unsupported mechanism at sign boundary | `PKCS11_SIGN_FAILED` / `PKCS11_SIGN_MECHANISM_UNSUPPORTED` | Mock only (SoftHSM supports both mechanisms) |
| Session failure during resolution | `PKCS11_SESSION_FAILED` | Mock only |
| Token initialization failure | `PKCS11_TOKEN_INIT_FAILED` | Not exercised (lab setup guard only) |

All codes are thrown as `Pkcs11LabError` with `message === code`; native/library error text is never propagated.

## Barid / #147 — explicitly NOT proven

SoftHSM proves only **generic PKCS#11 architecture compatibility**. It provides **zero** evidence that Barid eSign exposes a supported third-party PKCS#11/CSP/KSP interface, that its middleware permits this integration, or that Barid-produced signatures preserve Hire-Me prepared-artifact compatibility.

**Ready for provider implementation: NO** until **#147** evidence is satisfied.

## Limitations

- Lab does not publish `SIGNED` `DocumentVersion` rows (validation-only proof).
- No browser bridge, no PIN transport from UI, no production trust-anchor changes.
- Windows SoftHSM automation is manual/documented only.
- `softhsm2-util --init-token` receives the ephemeral PINs as process arguments, so they are visible to same-host process listings for the duration of that command. Acceptable for a disposable single-user lab token; never reuse this pattern for real tokens.
- Signing is canceled/aborted at the lab boundary only by throwing; there is no separate abort code.

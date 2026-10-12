# Issue #183 — Provider-neutral PKCS#11 signing lab (SoftHSM)

Parent: **#132**. Provider evidence gate: **#147** (unchanged). Phase A/B baseline: **D-083**, **D-084**.

## Purpose

This lab answers **only**:

> Can Hire-Me's prepared-PDF / CMS / Phase B validation architecture operate through a **standard PKCS#11 token interface**?

It does **not** prove Barid eSign compatibility, qualified Moroccan signatures/seals, or authorization for a Barid adapter. **#147** remains the real provider-evidence gate.

## Architecture flow

```text
Synthetic PDF (lab fixture)
  → PreparedSigningArtifactService (D-083/D-084 placeholder / ByteRange)
  → PKCS#11 token private key (SoftHSM, non-extractable)
  → CMS detached signature (@signpdf + forge PKCS#7)
  → Signed PDF bytes
  → PdfSignatureValidatorService (Phase B, test-only trust anchor)
  → VALID / INVALID (test scope only; no SIGNED DB publication in this lab)
```

Code lives under `apps/api/src/document-signing/lab/` and is **not** imported by `DocumentSigningModule`, controllers, or production DI.

## Prerequisites

- **Linux (CI/dev):** `softhsm2`, `libsofthsm2` (Ubuntu package `softhsm2`).
- **Windows:** use [SoftHSM2 for Windows](https://github.com/disig/SoftHSM2-for-Windows); automation in this repo targets Linux CI; manual lab runs are documented here.
- **Node:** repository Node version (see `.node-version`); native addon **`pkcs11js`** (via **`graphene-pk11`**) must build (listed in `pnpm-workspace.yaml` `onlyBuiltDependencies`).

## Lab commands

```bash
# Ephemeral token + PKCS#11 prepared-PDF proof (requires SoftHSM2)
pnpm --filter @hire-me/api test:signing-pkcs11-lab

# Optional smoke (initializes token, generates key, one sign)
node apps/api/scripts/pkcs11-lab-smoke.mjs
```

Environment overrides:

- `SOFTHSM2_CONF` — set automatically by the lab for ephemeral tokens; do not point at production tokens.
- `HIREME_PKCS11_LAB_MODULE_PATH` — optional PKCS#11 module path (defaults include `/usr/lib/softhsm/libsofthsm2.so`).

## Token / credential strategy

- Ephemeral `SOFTHSM2_CONF` + temp `tokendir`; destroyed after tests.
- Token label generated per run; **user/SO PINs generated at runtime** (never committed).
- RSA-2048 key pair generated **inside** the token (`CKA_TOKEN`, `CKA_PRIVATE`, `CKA_SENSITIVE`, `CKA_EXTRACTABLE=false`).
- Self-signed X.509 with CN **`Hire-Me PKCS11 Test Signer - NOT QUALIFIED`** (and separate org-seal credential in tests).
- Test trust anchor = same synthetic self-signed PEM (never added to production `SIGNING_TRUST_ANCHOR_PEMS`).

## PKCS#11 signing mechanisms

- **Certificate (TBS) signing:** `SHA256_RSA_PKCS` over TBSCertificate DER.
- **CMS/PDF signing:** `RSA_PKCS` over SHA-256 DigestInfo (single-shot `Sign.once`), matching forge PKCS#7 expectations.

## Native dependency note

| Package | Role | Scope |
| --- | --- | --- |
| `graphene-pk11` | PKCS#11 session/key/sign abstraction | `@hire-me/api` **devDependency** only |
| `pkcs11js` | Native PKCS#11 binding (node-gyp) | Transitive; built in CI/dev install |

No production runtime dependency on PKCS#11. Normal `pnpm test` includes mock-matrix tests; SoftHSM tests skip when the module or CLI is unavailable.

## Barid / #147 — explicitly NOT proven

SoftHSM proves only **generic PKCS#11 architecture compatibility**. It provides **zero** evidence that Barid eSign exposes a supported third-party PKCS#11/CSP/KSP interface, that its middleware permits this integration, or that Barid-produced signatures preserve Hire-Me prepared-artifact compatibility.

**Ready for provider implementation: NO** until **#147** evidence is satisfied.

## Limitations

- Lab does not publish `SIGNED` `DocumentVersion` rows (validation-only proof).
- No browser bridge, no PIN transport from UI, no production trust-anchor changes.
- Windows SoftHSM automation is manual/documented only.

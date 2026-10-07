# Issue #143 — validation engine preflight (Phase B)

Date: 2026-10-07. Base: `main` @ `2859efb3366b55da170e90bb95b8b7f4815ba09f`.

## Ready for implementation

**YES** — maintained libraries cover ByteRange/CMS extraction and PKIX path validation; Hire Me policy layer owns signer identity, prepared-artifact binding, trust-root selection, and publication fencing.

## Selected stack (v3 — PR #144 final security corrections)

| Concern | Owner |
| --- | --- |
| PDF `/ByteRange` / `/Contents` extraction | `pdf-signature-reader` via Hire Me `pdf-signature-extract.ts` |
| CMS parsing (SignedData) | `pkijs` + `asn1js` |
| Actual SignerInfo signer resolution | Hire Me `cms-pdf-signature.ts` (not certificate-bag order) |
| Detached CMS cryptographic integrity | `node-forge` PKCS#7 pattern in `cms-pdf-signature.ts` |
| Prepared-artifact binding | Hire Me `prepared-artifact-binding.ts` (deterministic `/ByteRange` + `/Contents` zones) |
| X.509 path validation (basicConstraints, key usage, path length where enforced) | **PKI.js** `CertificateChainValidationEngine` in `signing-trust-policy.ts` |
| Trust-root selection | Hire Me policy: **only** `SIGNING_TRUST_ANCHOR_PEMS` (never OS/Node roots) |
| Certificate validity time | PKI.js `checkDate` + Hire Me reference time |
| Policy decision / bounded reason codes | Hire Me `signing-trust-policy.ts` → TRUSTED / UNTRUSTED / INDETERMINATE |
| Legal / qualified assurance classification | **Out of scope** — `VALID` does not imply Moroccan qualified status |

| Layer | Library | Role |
| --- | --- | --- |
| PDF signing (tests only) | `@signpdf/signpdf`, `@signpdf/signer-p12` | Synthetic detached signatures in integration tests |
| Prepared artifact (runtime) | `@signpdf/placeholder-plain` | Deterministic placeholder PDF at approval |
| PDF signature extraction | `pdf-signature-reader` | `/ByteRange`, `/Contents` hex → CMS DER |
| CMS SignerInfo + parse | `pkijs` + `asn1js` | Resolve signer certificate (issuer+serial / SKI) |
| Detached CMS integrity | `node-forge` (Hire Me `cms-pdf-signature.ts`) | messageDigest + authenticatedAttributes over ByteRange data |
| Trust path | **PKI.js** `CertificateChainValidationEngine` + Hire Me `signing-trust-policy.ts` | PKIX path to explicit PEM anchors |
| PKIX crypto primitives | `@peculiar/x509` | Fingerprint helpers where needed; not used for manual DN walks |
| Prepared binding | Hire Me `prepared-artifact-binding.ts` | Signed PDF ≡ prepared artifact except `/Contents` + `/ByteRange` |

## Meaning of `VALID` (Phase B)

**`VALID` means:**

- CMS cryptography valid for the detached signature
- Approved prepared-artifact binding valid
- Actual signer fingerprint matches the request credential
- X.509 chain valid under configured Hire Me trust policy (explicit anchors only)

**`VALID` does NOT mean:**

- Moroccan qualified legal status
- Barid qualification
- Revocation checked in production (no production OCSP/CRL/TSA in Phase B)
- Trusted timestamp verified
- Long-term validation (LTV)

## Guarantees (Phase B v3)

- CMS signer cert from `SignerInfo`, not cert-bag order
- Trust only when PKI.js path validation terminates at configured anchors
- Non-CA intermediates and applicable CA/keyUsage/pathLen violations fail closed
- Prepared-artifact binding blocks visible-content incremental-revision attacks
- V1 exactly one signature; malformed/overlapping/out-of-bounds ByteRange fail closed
- Crypto + validation **outside** DB; staged immutable storage; **SERIALIZABLE** final acceptance transaction with authority/source rechecks; post-commit `signature.accepted` audit only

## Explicit limitations

See [Phase B architecture](./issue-143-phase-b-architecture.md).

## Phase C blockers (unchanged)

Barid/provider integration, USB token, PKCS#11/CSP, native bridge, production trust onboarding, signing UX.

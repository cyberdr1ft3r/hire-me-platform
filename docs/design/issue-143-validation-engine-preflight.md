# Issue #143 — validation engine preflight (Phase B)

Date: 2026-10-07. Base: `main` @ `2859efb3366b55da170e90bb95b8b7f4815ba09f`.

## Ready for implementation

**YES** — a maintained, layered validator stack can meet Issue #143 requirements without hand-rolled CMS/ASN.1/PDF cryptography.

## Selected stack

| Layer | Library | Role |
| --- | --- | --- |
| PDF signing (tests/fixtures) | `@signpdf/signpdf`, `@signpdf/placeholder-plain`, `@signpdf/signer-p12` | Produce synthetic incremental PKCS#7 detached signatures over exact source PDF bytes |
| PDF signature extraction | `pdf-signature-reader` (`extractSignature`, `getCertificatesInfoFromPDF`) | Parse `/ByteRange`, `/Contents`, extract CMS payload and signer certificate (no custom ASN.1) |
| CMS integrity | `pdf-signature-reader` verify pipeline (uses maintained `node-forge` PKCS#7 message digest checks) | Cryptographic integrity + authenticated attributes message digest |
| Trust policy | `@peculiar/x509` (`X509Certificate`, `X509ChainBuilder`) + explicit anchor PEM configuration | Provider-neutral trust store; **does not** imply qualified Moroccan legal status |
| Source/result binding (V1) | Hire Me policy in `pdf-signature-extract.ts` | ByteRange trailing-byte rejection + exact source-byte prefix preservation inside ByteRange-covered octets |

Spike script: `apps/api/scripts/spike-issue-143-validation.mjs` (pdfkit source → signpdf sign → extract/verify).

## Guarantees proven in spike

- Detects real PKCS#7 PDF signature (not a visual-only stamp)
- CMS integrity verification (`integrity: true` on valid synthetic signature)
- Signer certificate extraction + SHA-256 fingerprint
- Valid ByteRange structure and signed-byte reconstruction
- Tampered PDF bytes fail integrity verification
- V1 source prefix derivation (`assertSourcePrefixDerivation`)
- Unsigned trailing bytes rejected (`assertNoTrailingBytesAfterByteRange`)

## Explicit limitations (Phase B)

- **VALID** means: CMS integrity OK, ByteRange/source binding OK, credential fingerprint match, certificate valid at reference time, and trust policy accepts configured anchors.
- **VALID does NOT prove** qualified Moroccan e-signature, Barid assurance, or legal non-repudiation.
- No production OCSP/CRL/TSA onboarding; empty/missing trust store → **INDETERMINATE** (fail closed for publication).
- No provider callback, token, PIN, or remote signing API.

## Phase C blockers (unchanged)

Barid/provider integration, USB token, PKCS#11/CSP, native bridge, production trust onboarding, RFC 3161/OCSP/CRL operations, signing UX.

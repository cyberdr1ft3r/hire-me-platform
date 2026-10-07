# Issue #143 — Phase B validation and SIGNED publication

Parent: #132. Predecessor: D-083 / Phase A (#141). **D-084 remains Proposed** until maintainer re-accepts after PR #144 security corrections.

## Validator responsibility matrix (v2.0.0)

| Concern | Owner |
|--------|--------|
| PDF `/ByteRange` extraction | `pdf-signature-reader` helper (`extractSignature`) |
| V1 exactly-one-signature / malformed ByteRange policy | Hire Me `pdf-byte-range-policy.ts` |
| Unsigned trailing bytes after signed envelope | Hire Me `pdf-byte-range-policy.ts` |
| Prepared-artifact binding (not source-prefix-only) | Hire Me `prepared-artifact-binding.ts` |
| CMS `SignerInfo` → signer certificate DER | Hire Me `cms-pdf-signature.ts` (`pkijs`) |
| Detached CMS integrity (messageDigest + authenticatedAttributes) | Hire Me `cms-pdf-signature.ts` (forge PKCS#7 verify pattern; signer key from resolved cert, **not** cert-bag order) |
| Credential fingerprint / subject / issuer evidence | Same resolved signer DER (`node-forge` summaries) |
| Trust path to configured anchors | Hire Me `signing-trust-policy.ts` (`@peculiar/x509` signature verification + explicit anchor termination) |
| Policy decision (`VALID` / `INVALID` / `INDETERMINATE`) | `PdfSignatureValidatorService` v2.0.0 |

Hire Me does **not** treat OS trust, `pdf-signature-reader` `authenticity`, cert-bag ordering, or a single `integrity` flag as the complete validation policy.

## Prepared signing artifact (approval binding)

On approval, the API builds a deterministic placeholder PDF from the bound source version (`PreparedSigningArtifactService` / `@signpdf/placeholder-plain`), stores it under `signing-prepared/{requestId}.pdf`, and binds `preparedSigningArtifactSha256` on the request.

Validation compares the submitted signed PDF to that **prepared** artifact byte-for-byte except `/Contents` and `/ByteRange` regions. Generic “source PDF is a ByteRange prefix” is **not** sufficient (incremental-revision / visible-content change attacks).

## Trust anchors

Path validation requires a verified chain from the CMS signer leaf to an explicitly configured PEM anchor (`SIGNING_TRUST_ANCHOR_PEMS`, `|||` separated). CMS bag certificates are untrusted path candidates; anchors are also available for path termination. Empty store → `INDETERMINATE` / fail-closed.

## Result submission and acceptance

- Validate **outside** the publication transaction (crypto, parsing, prepared binding, trust).
- Stage signed PDF + evidence JSON **before** the short DB transaction; delete staged objects on rollback.
- Inside transaction: lock request, recheck expiry/state/source current version/source SHA/business snapshot, run test barrier (if any), **re-run bound authority** (`assertAcceptanceAuthority`), publish rows, commit.
- Platform audit `signature.accepted` is recorded **after** successful commit (not inside the transaction client).

## Evidence DB invariants (migration `20261007120000_document_signing_phase_b_hardening`)

- SIGNED versions cannot self-reference (`derivedFromVersionId <> id`).
- `DocumentSignature.performingOperatorUserId` → `ON DELETE RESTRICT`.
- Composite FK: `DocumentSignature (acceptanceValidationId, signingRequestId)` → `SignatureValidation (id, signingRequestId)`.

## What `VALID` means

Detached CMS integrity over ByteRange-covered bytes; prepared-artifact binding; signer fingerprint matches request; cert valid at reference time; chain terminates at configured anchor; V1 single signature.

## What `VALID` does **not** prove

Qualified Moroccan eIDAS/Barid legal status, LTV, production OCSP/CRL/TSA, multi-party signing, or provider token UX.

## Runtime dependencies (Phase B)

| Package | Role |
|---------|------|
| `pdf-signature-reader` | ByteRange / CMS DER extraction only |
| `pkijs` + `asn1js` | CMS parse, SignerInfo resolution |
| `node-forge` | Detached CMS integrity verify, PEM/DER helpers |
| `@peculiar/x509` | Trust path signature checks |
| `@signpdf/placeholder-plain` | Prepared artifact at approval |

Test-only: `@signpdf/signpdf`, `@signpdf/signer-p12` (synthetic fixtures).

## Phase C blockers (out of scope)

Barid integration, token/PKCS#11, remote signing API, production trust onboarding, signing UX, multi-party signing.

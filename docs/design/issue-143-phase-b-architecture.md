# Issue #143 — Phase B validation and SIGNED publication

Parent: #132. Predecessor: D-083 / Phase A (#141).

## Validation engine (maintained stack)

Orchestrated in `apps/api/src/document-signing/validation/` — **no hand-rolled CMS, ASN.1, or ByteRange cryptography.**

| Concern | Library |
|--------|---------|
| PDF signature / ByteRange extract | `pdf-signature-reader` helpers |
| CMS integrity over signed ranges | `pdf-signature-reader` |
| Signer certificate extract | `pdf-signature-reader` + `node-forge` (DER fingerprint only) |
| Trust policy | `@peculiar/x509` against explicit PEM anchors (`SIGNING_TRUST_ANCHOR_PEMS`, `\|\|\|` separated) |
| V1 source binding | Hire Me policy: source bytes must appear unchanged as the ByteRange prefix of the signed PDF |

Preflight spike: `apps/api/scripts/spike-issue-143-validation.mjs` and `docs/design/issue-143-validation-engine-preflight.md`.

### What `VALID` means

- Cryptographic PDF signature present; CMS integrity passes; ByteRange covers the signed envelope with no unsigned trailing bytes; signed bytes derive from the bound source PDF under the V1 prefix policy; signer certificate fingerprint matches the bound credential; certificate is within validity window; chain verifies to a configured trust anchor.

### What `VALID` does **not** prove

- Qualified Moroccan eIDAS/Barid legal status, long-term archival (LTV), production OCSP/CRL/TSA assurance, or multi-party workflow completeness.

Empty trust configuration → chain `INDETERMINATE` / publication **fail-closed**.

## Result submission and acceptance

- `POST /v1/signing/requests/:requestId/results` — bound signer/seal operator only; quarantine storage; validate **outside** DB transaction; short acceptance transaction with full recheck (request `AWAITING_RESULT`, expiry, approval, authority, source version current, source SHA-256, business snapshot fingerprint, validation binding).
- Terminal states added: `COMPLETED`, `VALIDATION_REJECTED`.
- Exactly one accepted `DocumentSignature` / SIGNED `DocumentVersion` per request.

## SIGNED `DocumentVersion` lineage

`GENERATED` (or other source) → validated signed PDF → new row with `source = SIGNED`, `derivedFromVersionId`, new storage key and checksum. Ordinary upload path continues to create `UPLOADED` only.

## Evidence

`SignatureValidation` stores bounded result codes; optional `SigningEvidence` JSON blob in protected storage on acceptance (no private keys or provider secrets).

## Phase C blockers (out of scope)

Barid integration, token/PKCS#11, remote signing API, production trust onboarding, signing UX, multi-party signing.

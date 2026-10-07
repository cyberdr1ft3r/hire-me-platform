# Issue #143 — validation engine preflight (Phase B)

Date: 2026-10-07. Base: `main` @ `2859efb3366b55da170e90bb95b8b7f4815ba09f`.

## Ready for implementation

**YES** — maintained libraries cover ByteRange/CMS extraction and PKIX checks; Hire Me policy layer owns signer identity, prepared-artifact binding, and trust termination.

## Selected stack (v2 — PR #144 maintainer corrections)

| Layer | Library | Role |
| --- | --- | --- |
| PDF signing (tests only) | `@signpdf/signpdf`, `@signpdf/signer-p12` | Synthetic detached signatures in integration tests |
| Prepared artifact (runtime) | `@signpdf/placeholder-plain` | Deterministic placeholder PDF at approval |
| PDF signature extraction | `pdf-signature-reader` (`extractSignature`) | `/ByteRange`, `/Contents` hex → CMS DER |
| CMS SignerInfo + parse | `pkijs` + `asn1js` | Resolve signer certificate (issuer+serial / SKI) |
| Detached CMS integrity | `node-forge` PKCS#7 (Hire Me `cms-pdf-signature.ts`) | messageDigest + authenticatedAttributes over ByteRange data |
| Trust path | `@peculiar/x509` + Hire Me `signing-trust-policy.ts` | Verify signatures up to explicit PEM anchors |
| Prepared binding | Hire Me `prepared-artifact-binding.ts` | Signed PDF ≡ prepared artifact except `/Contents` + `/ByteRange` |

Spike script (legacy prefix demo): `apps/api/scripts/spike-issue-143-validation.mjs`.

## Guarantees (Phase B v2)

- CMS signer cert from `SignerInfo`, not cert-bag order
- Trust only when chain terminates at configured anchors (not “non-empty chain”)
- Prepared-artifact binding blocks visible-content incremental-revision attacks that preserve a source prefix
- V1 exactly one signature; malformed/overlapping/out-of-bounds ByteRange fail closed
- Acceptance-time authority fence + staged storage + post-commit platform audit

## Explicit limitations

See [Phase B architecture](./issue-143-phase-b-architecture.md).

## Phase C blockers (unchanged)

Barid/provider integration, USB token, PKCS#11/CSP, native bridge, production trust onboarding, signing UX.

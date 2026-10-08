# Issue #145 — Phase C: Barid eSign provider integration and token feasibility

Date: 2026-10-08. Status: **feasibility evidence for maintainer review** (no production adapter authorized).

Source of truth: [Issue #145](https://github.com/cyberdr1ft3r/hire-me-platform/issues/145). Parent: [#132](https://github.com/cyberdr1ft3r/hire-me-platform/issues/132) (**open**).

**Audited platform baseline:** `main` @ `0b8da9aa71055249a85831309229e5ef36d53e11` (Phase A **D-083 Accepted**, Phase B **D-084 Accepted**).

**Skills used:** project-memory, product-architecture, application-security.

No production certificate, private key, PIN, PUK, provider account, or customer PDF was used. No isolated hardware spike was executed (no Barid test token or signing sandbox available to this pass).

---

## Executive summary

| Question | Answer |
| --- | --- |
| **Ready for provider implementation** | **NO** |
| **Ready for ChatGPT review of this deliverable** | **YES** (evidence-classified; blockers explicit) |
| **Recommended primary route (Proposed D-085)** | **A — Manual desktop fallback** (prepare → download → Barid/Adobe desktop sign → upload → Phase B validate) **only after** prepared-artifact byte compatibility is proven with Barid fixtures |
| **Custom local bridge required for route A** | **NO** |
| **Custom local bridge required for in-app USB signing** | **UNKNOWN** (likely **YES** unless Barid supplies an official browser/native component) |
| **Remote Barid document-signing API confirmed** | **NOT FOUND** |
| **Isolated technical spike** | **BLOCKED** (no usable test token / private key) |

Phase B invariants are **not** weakened: provider output must pass independent CMS/X.509/prepared-artifact validation; `VALID` still does not imply Moroccan qualified legal status ([validation preflight](./issue-143-validation-engine-preflight.md)).

---

## 0. Inherited provider-neutral boundary (Phase A/B)

From **D-083** / **D-084** and merged code on `main`:

| Domain surface | Role in future Barid adapter |
| --- | --- |
| `SigningOrganization` | Legal entity for organization seal (not `Client`) |
| `SigningCredential` | Public metadata + fingerprint only (no private key) |
| `SigningCredentialGrant` | Mandate for `USE_ORGANIZATION_SEAL` |
| `SigningRequest` | Immutable binding to one `DocumentVersion`, prepared artifact hash, credential fingerprint, expiry, policy |
| `DocumentSigningApproval` | Human approval of exact binding |
| Prepared signing artifact | `@signpdf/placeholder-plain` deterministic placeholder at approval |
| Result submission | Bounded PDF upload + hash |
| `PdfSignatureValidatorService` | **Authoritative** acceptance gate (not provider) |
| `SignatureValidation` / `SigningEvidence` / `DocumentSignature` | Evidence and lineage |
| SIGNED `DocumentVersion` | Immutable publication after successful validation + SERIALIZABLE acceptance fence |

A future **Barid adapter** supplies signed bytes or drives a local signing step; it must **never** bypass validation or widen authorization.

---

## 1. Evidence classification key

| Label | Meaning |
| --- | --- |
| **CONFIRMED — official** | DGSSI decision/listing, Barid publication title, Barid TSA policy PDF referenced in #132 |
| **CONFIRMED — indirect** | Reputable press describing Barid↔Lleida.net platform (not an integration API for third parties) |
| **VENDOR CAPABILITY ONLY** | Thales SafeNet Authentication Client / generic eToken docs |
| **REASONABLE INFERENCE** | Logical consequence of confirmed facts, explicitly marked |
| **NOT FOUND / REQUIRES BARID CONFIRMATION** | Gap requiring written Barid answer or test token |

---

## 2. DGSSI / regulatory findings

| Finding | Classification | Detail |
| --- | --- | --- |
| Barid agrément PSCo under Law 43-20 | **CONFIRMED — official** | [Decision 1/PSCo/2025 (15 Jan 2025)](https://www.dgssi.gov.ma/sites/default/files/2025-01/decision_d_agrement_Barid_2025.pdf): Barid Al Maghrib agréée prestataire de services de confiance. |
| Qualified **natural-person signature** service | **CONFIRMED — official** | Service OID **`1.2.504.1.1.1.2.1.1.2.1.10`**, name **« Classe 3 signature »** (délivrance certificats qualifiés de signature électronique). |
| Qualified **organization seal** service | **CONFIRMED — official** | Service OID **`1.2.504.1.1.1.2.1.1.2.2.10`**, name **« Classe 3 cachet »** (délivrance certificats qualifiés de cachet électronique). |
| Separate qualified **timestamp** service | **CONFIRMED — official** | Listed on [DGSSI regulated products table](https://www.dgssi.gov.ma/fr/prestations-et-produits-reglementes/) (distinct OID; see §8). |
| QSCD requirements | **CONFIRMED — official** | [Ref_QSCD v1.0](https://www.dgssi.gov.ma/sites/default/files/2023-09/Ref_QSCD_v1.0.pdf): qualified signature/seal requires qualified creation device; Type 1 vs remote QSCD rules. |
| Certificate issuance provider requirements | **CONFIRMED — official** | [Ref_Deliv_Cert_Qual v1.0](https://www.dgssi.gov.ma/sites/default/files/2023-09/Ref_Deliv_Cert_Qual_v1.0.pdf): ETSI EN 319 412-3 for qualified seal profiles; identity/mandate rules differ for person vs legal entity. |
| Prior Barid agrément expiry on DGSSI page | **CONFIRMED — official** | DGSSI table still notes older **Agrément n°2/PSCE/2022 expiré le 14/07/2024** alongside current Barid eSign product rows — use **2025 decision + current table** as active qualified services; confirm certificate policy OIDs on issued certs at enrollment. |

**Consequence:** Person signature and organization seal are **separate qualified products** with distinct service OIDs. Hire Me must map `SigningKind.PERSON_SIGNATURE` vs `ORGANIZATION_SEAL` to **different certificate policies** and never accept cross-kind credentials.

---

## 3. Barid product findings

### 3.1 Natural-person electronic signature

| Topic | Classification | Notes |
| --- | --- | --- |
| Product family | **CONFIRMED — official** | Barid eSign **Classe 3 signature** (qualified), OID above. |
| Issuing CA / chain | **CONFIRMED — official (#132 S3)** | Guides reference **AC Racine G2 / Qualified CA Barid eSign**; [PKI repository](https://pki.baridesign.ma/repository) and [CRL](https://crl.pki.baridesign.ma/crl/) cited in Barid usage guide (repository fetch timed out 2026-10-08 — verify live). |
| Certificate policy OID in certs | **REQUIRES BARID CONFIRMATION** | Guide mentions OID `1.2.504.1.1.1.2.12.14.1` in verification context (#132 S3); map to **issued** qualified person certs at enrollment. |
| Hardware-bound key | **CONFIRMED — official (#132 S2–S3)** | Qualified workflow documented with **USB token + SafeNet**; aligns with QSCD Type 1 model. |
| Renewal / revocation | **CONFIRMED — official (#132 S3)** | CRL publication documented; operational renewal via Barid channels — **REQUIRES BARID CONFIRMATION** for SLA and replacement token process. |
| Advanced (non-qualified) signature product | **CONFIRMED — official** | DGSSI table lists **Certificat classe 3 de signature avancée** (separate OID `1.2.504.1.1.1.1.1.1.1.27.6`) — do not treat as qualified Classe 3 signature. |

### 3.2 Organization electronic seal (cachet électronique)

| Topic | Classification | Notes |
| --- | --- | --- |
| Product | **CONFIRMED — official** | **Classe 3 cachet**, OID **`1.2.504.1.1.1.2.1.1.2.2.10`**. |
| Authorization / mandate | **CONFIRMED — official (Ref_Deliv_Cert_Qual)** | Legal-entity issuance under organization responsibility; Hire Me **`SigningCredentialGrant`** + RBAC models this but **Barid enrollment paperwork** must align. |
| Same token as person cert | **NOT FOUND / REQUIRES BARID CONFIRMATION** | No public doc stating one USB token holds both kinds; assume **separate credentials** until Barid confirms. |
| PDF “company seal” appearance | **NOT FOUND / REQUIRES BARID CONFIRMATION** | Desktop signing appearance behavior not specified for legal-person seal vs person signature. |

### 3.3 Platform backend (context only)

| Finding | Classification | Notes |
| --- | --- | --- |
| Lleida.net certificate lifecycle platform | **CONFIRMED — indirect** | [EcoActu 2024](https://ecoactu.ma/signature-electronique-lleida-net-barid-al-maghrib/): Lleida.net maintains Barid eSign **certificate management** platform (RA/admin + citizen/enterprise portals). |
| Hire Me integration API | **NOT FOUND** | No public REST/SOAP **document-signing** API identified; platform description is **not** proof of third-party signing API. |

---

## 4. USB token and middleware

### 4.1 Barid-published packages (2026-10-08 inventory)

From [Barid Publications](https://www.barid.ma/bamb2cstorefront/fr/Publications) (titles only; installers not executed):

| Publication | Classification |
| --- | --- |
| Kit d'installation automatique Barid eSign — **Certificats Classe 3 Qualifiés — Windows** | **CONFIRMED — official** |
| Package d'installation des **Certificats Qualifiés — Windows** | **CONFIRMED — official** |
| Pilote manuel **macOS Sequoia+** (SafeNet) | **CONFIRMED — official** |
| Pilote manuel **macOS Monterey / Ventura / Sonoma** (SafeNet) | **CONFIRMED — official** |
| Pilote manuel **Windows — certificat classe 3 qualifié (SafeNet)** | **CONFIRMED — official** |
| **CA du certificat client.pem** | **CONFIRMED — official** (public material sample; **not** a signing sandbox) |

### 4.2 Exact token model

| Topic | Classification |
| --- | --- |
| Manufacturer / model / firmware | **NOT FOUND / REQUIRES BARID CONFIRMATION** |
| SafeNet Authentication Client version bundled with Barid kit | **REQUIRES BARID CONFIRMATION** (#132 cited **10.7** in 2024 Windows guide — verify current kit) |
| 32/64-bit, driver install steps | **CONFIRMED — official (#132 S2)** for Windows manual flow; macOS drivers listed separately |
| PIN retry / lockout / token removal | **REQUIRES BARID CONFIRMATION** (generic SafeNet behavior exists — **VENDOR CAPABILITY ONLY**) |
| Concurrent sessions | **REQUIRES BARID CONFIRMATION** |

### 4.3 SafeNet / Thales (vendor-only)

| Topic | Classification | Notes |
| --- | --- | --- |
| PKCS#11 v2.20, PKCS#15 | **VENDOR CAPABILITY ONLY** | [Thales SAC product page](https://cpl.thalesgroup.com/access-management/security-applications/authentication-client-token-management) |
| Windows CryptoAPI / **CSP / KSP / CNG** | **VENDOR CAPABILITY ONLY** | Same source |
| macOS CTK / PC/SC | **VENDOR CAPABILITY ONLY** | Same source |
| Typical PKCS#11 module paths (e.g. `libetpkcs11.dylib`) | **VENDOR CAPABILITY ONLY** | [GlobalSign SafeNet support](https://support.globalsign.com/digital-certificates/manage-safeNet-eToken/safenet-drivers) — **not** Barid-specific |
| eToken 5110 / SAC 10.8-R8 | **VENDOR CAPABILITY ONLY** | GlobalSign/Sectigo KB — **do not** infer Barid ships this model |

**Barid-supported PKCS#11 module name, path, bitness, mechanisms:** **NOT FOUND / REQUIRES BARID CONFIRMATION.**

---

## 5. Supported programmatic interfaces (Barid vs industry)

| Mechanism | Barid official support | Evidence |
| --- | --- | --- |
| **Desktop manual signing** (Adobe Reader / Barid workflow) | **CONFIRMED — official (#132 S2)** | Installation guide: USB token + Adobe digital signature + local PIN |
| **PKCS#11** | **NOT FOUND / REQUIRES BARID CONFIRMATION** | Plausible via SafeNet stack (**VENDOR CAPABILITY ONLY**) |
| **Windows CSP / KSP / CNG** | **NOT FOUND / REQUIRES BARID CONFIRMATION** | Same |
| **Native SDK / CLI** | **NOT FOUND** | No public developer kit located |
| **Browser plugin / native messaging / localhost service** | **NOT FOUND** | No Barid protocol documentation |
| **Remote / cloud document-signing API** | **NOT FOUND** | Do **not** infer from TSA endpoint or Lleida.net RA platform |
| **Adobe Acrobat Pro integration** | **REASONABLE INFERENCE** | Standard path for SAC + PDF; **REQUIRES BARID CONFIRMATION** for qualified Classe 3 |
| **Mobile signing** | **NOT FOUND** | |

---

## 6. PDF / PAdES and prepared-artifact compatibility

### 6.1 What Barid docs establish

| Topic | Classification |
| --- | --- |
| PDF digital signature via desktop tooling | **CONFIRMED — official (#132 S2)** |
| PAdES B-B / B-T / B-LT / B-LTA profile guarantee | **NOT FOUND / REQUIRES BARID CONFIRMATION** |
| CMS **SubFilter** in produced PDFs | **NOT FOUND** (no trustworthy Barid sample PDF in this pass) |
| Visible signature appearance / seal graphics | **NOT FOUND / REQUIRES BARID CONFIRMATION** |
| Signature container / placeholder size limits | **NOT FOUND / REQUIRES BARID CONFIRMATION** |

### 6.2 Hire Me Phase B prepared-artifact binding (authoritative)

Merged Phase B requires ([D-084](./issue-143-validation-engine-preflight.md)):

- Signed PDF equals approved **prepared artifact** except **`/Contents`** and **`/ByteRange`** zones (deterministic binding).
- Exactly **one** signature in V1; no unapproved trailing incremental updates.
- Independent validation **before** any SIGNED publication.

### 6.3 Compatibility assessment

| Scenario | Classification | Consequence |
| --- | --- | --- |
| User signs **Hire Me prepared PDF** in Adobe without altering business bytes | **NOT FOUND / REQUIRES BARID CONFIRMATION** | **Route A blocked for production** until byte-level proof (sanitized fixtures + Phase B validator) |
| Barid desktop app rewrites PDF structure outside signature dictionary | **REASONABLE INFERENCE risk** | Would **fail** Phase B binding → **provider compatibility blocker**, not a reason to weaken validation |
| External CMS / PAdES external signature (hash-only signing) | **REQUIRES BARID CONFIRMATION** | If Barid supports signing **digest + CMS** for an existing ByteRange placeholder, Route B bridge might sign **hash only** — must be confirmed with Barid + tested |

**Prepared-artifact compatibility:** **UNKNOWN — REQUIRES BARID CONFIRMATION AND FIXTURES.**

---

## 7. Sample signed PDF evidence

| Item | Result |
| --- | --- |
| Official Barid sample PDF (person) | **NOT FOUND** in public sources reviewed |
| Official Barid sample PDF (organization seal) | **NOT FOUND** |
| Public `CA du certificat client.pem` | **CONFIRMED — official** — useful for **parsing/chain study only** (no private key) |
| Third-party “Barid” PDFs | **Not used** (would not label as Barid evidence) |

**If Barid provides sanitized samples:** analyze SignerInfo, chain, policy OIDs, ByteRange, SubFilter, timestamp, incremental updates, and run through **`PdfSignatureValidatorService`** with test trust anchors.

---

## 8. Sandbox / test credentials

| Item | Classification |
| --- | --- |
| Public test certificates in guides | **CONFIRMED — official (#132 S3)** — **no private key** → **not** a signing sandbox |
| Test USB token / demo qualified cert with key | **NOT FOUND / REQUIRES BARID CONFIRMATION** |
| Integration environment / support-issued dev token | **NOT FOUND / REQUIRES BARID CONFIRMATION** |
| Test TSA / test OCSP / CRL | **PARTIAL (#132 S7–S8)** — TSA subscription docs exist; **test vs prod endpoints REQUIRES BARID CONFIRMATION** |

**Isolated spike (§11 issue scope):** **BLOCKED** — no test token or signing-capable sandbox available to this agent pass.

---

## 9. Qualified timestamping (separate service)

| Topic | Classification | Notes |
| --- | --- | --- |
| Service distinct from document signing | **CONFIRMED — official** | DGSSI table + Barid TSA policy (**#132 S7**) |
| RFC 3161 | **CONFIRMED — official (#132 S7)** | Policy v2.0 effective 07/11/2025 |
| Production endpoint ( cited in #132 ) | **CONFIRMED — official (#132 S7)** | `https://tsaqual.baridesign.ma/adss/tsa` — **verify still current with Barid** |
| SHA-256/384/512, nonce | **CONFIRMED — official (#132 S7)** | |
| mTLS / interconnection certificate | **CONFIRMED — official (#132 S7–S8)** | Organizational subscription; **not** USB signing key |
| Bundled automatically in desktop PDF sign | **NOT FOUND / REQUIRES BARID CONFIRMATION** |
| Phase B includes production TSA verify | **CONFIRMED — platform** | **No** — `VALID` excludes trusted timestamp ([D-084](./issue-143-validation-engine-preflight.md)) |

---

## 10. Revocation and trust validation (production Phase D/E)

| Topic | Classification | Notes |
| --- | --- | --- |
| CRL repository | **CONFIRMED — official (#132 S3)** | `https://crl.pki.baridesign.ma/crl/` |
| OCSP | **REQUIRES BARID CONFIRMATION** | Not established in this pass |
| Trust chain bundles | **CONFIRMED — official (#132 S3)** | PKI repository URL (verify live) |
| Phase B production OCSP/CRL | **CONFIRMED — out of scope** | Explicit anchors only; no production revocation fetch in Phase B |
| Phase D/E needs | **REASONABLE INFERENCE** | Allowlisted fetch, freshness rules, INDETERMINATE on outage — per #132 threat model |

---

## 11. Commercial / operational (public sources)

| Topic | Classification |
| --- | --- |
| Certificate / token / seal pricing | **NOT FOUND** (public price list not reviewed) |
| TSA subscription | **CONFIRMED — official (#132 S8)** — guide exists; pricing **REQUIRES BARID CONFIRMATION** |
| SDK/API licensing | **NOT FOUND** |
| Middleware redistribution | **REQUIRES BARID CONFIRMATION** (critical for any bundled local agent) |
| Issuance lead time / paperwork | **NOT FOUND / REQUIRES BARID CONFIRMATION** |
| Support / SLA / integration assistance | **NOT FOUND / REQUIRES BARID CONFIRMATION** |

---

## 12. Integration architecture comparison

### A. Manual desktop fallback (recommended **primary** pending PDF proof)

| Dimension | Assessment |
| --- | --- |
| Evidence | **CONFIRMED — official** desktop path (#132 S2) |
| Server | Prepare artifact, approval, download, upload result, **Phase B validate**, SERIALIZABLE publish |
| Browser | Download/upload only; no PIN |
| Workstation | SafeNet + Adobe/Barid desktop; **PIN local** |
| Private key | **Never on Hire Me server** |
| Prepared-artifact risk | **HIGH until proven** — Adobe may rewrite PDF |
| Deployment | No Hire Me bridge binary |

### B. Custom local native bridge

| Dimension | Assessment |
| --- | --- |
| Evidence | **NOT FOUND** Barid approval; **VENDOR CAPABILITY ONLY** for PKCS#11 |
| Use when | In-app signing **and** Barid confirms PKCS#11/CSP module + redistribution |
| PIN | Local only |
| Threats | See §14 and #132 §9 |

### C. Provider-supplied browser/native component

| Dimension | Assessment |
| --- | --- |
| Evidence | **NOT FOUND** |
| Preference | **Prefer over custom bridge** if Barid offers maintained component |

### D. Remote signing API

| Dimension | Assessment |
| --- | --- |
| Evidence | **NOT FOUND** |
| Status | **Do not plan** until Barid documents API distinct from TSA |

**Recommendation (Proposed **D-085**):** Pursue **A** first for pilot (upload path already exists in Phase B), parallel **Barid engagement** for fixtures + test token. Defer **B** unless A fails prepared-artifact proof **and** Barid confirms local API. Do **not** start **D** without written API contract.

---

## 13. Local bridge design (documentation only — not implemented)

If Barid confirms PKCS#11/CSP and in-app signing is required, a **separate package/repository** is warranted (not embedded in API runtime).

Minimum controls (from #132 §9, unchanged):

- Loopback or native messaging with **exact origin + Host allowlist**, DNS rebinding defenses
- **One-time capability** bound to `signingRequestId`, prepared artifact hash, credential fingerprint, expiry
- **No** arbitrary path/digest signing; **no** wildcard CORS; **no** long-lived Hire Me bearer token storage
- User confirmation of binding summary before PIN
- PIN never logged; handle lockout/token removal as provider errors
- Signed update channel / SBOM for bridge binary
- Return **CMS/signed PDF bytes only** to browser for upload to existing Phase B endpoint

---

## 14. Future provider adapter mapping

| Phase A/B concept | Barid-side counterpart (future) |
| --- | --- |
| `SigningCredential` enrollment | Barid issuance → store fingerprint, subject/issuer summaries, policy OID, validity |
| `SigningCredentialGrant` | Barid mandate / internal org authorization |
| Prepared artifact download | Exact bytes user or bridge must sign |
| `submitSigningResult` | Upload signed PDF (Route A) or bridge POST (Route B) |
| `PdfSignatureValidatorService` | **Unchanged** — must pass for publication |
| Trust anchors | Production `SIGNING_TRUST_ANCHOR_PEMS` onboarding (Phase D/E) — **not** in #145 |

Provider success callbacks (if any future remote API) authenticate provider and map to existing `SigningRequest` — **never** create authority.

---

## 15. Threat model delta (Issue #145)

Extends #132 §9; updates [RISKS.md](../project/RISKS.md).

| Threat | Phase C finding | Control (unchanged or new emphasis) |
| --- | --- | --- |
| Generic SafeNet = Barid support | **Confirmed gap** | Label vendor vs Barid; written confirmation before adapter |
| Adobe/desktop rewrites prepared PDF | **New emphasis** | Phase B binding rejects; **block Route A** until fixtures prove compatibility |
| Person cert used as org seal | DGSSI separate OIDs | Certificate policy + kind validation at enrollment and validation |
| Remote API spoofing | No API found | If added later: mTLS/signed callbacks bound to request id |
| TSA mistaken for signing API | TSA documented separately | Architecture docs and adapter boundaries |
| No test token → false confidence | Spike blocked | Do not implement PKCS#11 in production path without proof |

---

## 16. Provider questionnaire (send to Barid)

Use with Barid integration / eSign support. **Omit** items already confirmed above (qualified service OIDs, separate seal product, TSA as separate service).

### Certificate products

1. For **Classe 3 signature** and **Classe 3 cachet**, provide current **certificate policy OIDs**, sample **public** PEM/DER (no private keys), and sample **qualified certificate** PDFs signed with each kind.
2. Confirm **organization seal** enrollment: legal mandate paperwork, whether seal cert can coexist on same token as person cert, and QC statement fields we should store in `SigningCredential`.
3. Confirm **advanced** vs **qualified** product boundaries (OID `…27.6` vs `…2.1.10`).

### Token / middleware

4. Exact **USB token model**, firmware, and **SafeNet Authentication Client** version shipped in current Windows/macOS kits.
5. Official **PKCS#11 module file name and path** (Windows x64, macOS ARM/x64), supported mechanisms for RSA-PSS/ECDSA with SHA-256.
6. Official **CSP/KSP provider names** if Windows signing must use CNG instead of PKCS#11.
7. **PIN** entry UI (SAC vs Adobe), retry/lockout limits, behavior on token removal mid-sign.
8. **Redistribution license** for middleware bundled with a third-party desktop agent.

### SDK / API / integration

9. Is there an **official SDK, CLI, or localhost/native-messaging signing component** for third-party business applications? If yes, provide documentation, authentication model, and maintenance lifecycle.
10. Is there a **remote document-signing API** (distinct from qualified TSA)? If yes, provide OpenAPI/SOAP spec, callback auth, idempotency, and certificate types supported.
11. **Integration support process**: contact, test account, acceptance criteria for third-party apps.

### PDF / PAdES / Hire Me prepared artifact

12. Can **Adobe Acrobat** or Barid tooling sign a PDF that already contains a **PDF signature placeholder** (`/ByteRange` + empty `/Contents`) **without modifying bytes outside** the signature dictionary and range?
13. Which **PAdES profiles** (B-B, B-T, B-LT, B-LTA) are supported for Classe 3 signature and cachet respectively? Which **SubFilter** values are emitted?
14. Maximum **signature container size** vs placeholder slot; support for **visible** vs invisible signatures and **organization seal appearance**.

### Timestamp / revocation / trust

15. Current **test TSA** endpoint and **production TSA** endpoint; mTLS onboarding steps and test interconnection certificates.
16. Is qualified timestamp **embedded automatically** in desktop PDF signing, or invoked separately?
17. **OCSP** URLs and freshness rules; complete **trust chain** download location; revocation behavior when offline.

### Sandbox / commercial

18. Availability of **test USB tokens** or **demo signing credentials** for integrators; lead time and cost.
19. **Pricing** for qualified person cert, organization seal, token hardware, TSA subscription, and integration support.

---

## 17. Recommended next implementation split (derived from evidence)

| Phase | Scope | Entry gate |
| --- | --- | --- |
| **C2 — Barid engagement + fixtures** | Send §16 questionnaire; obtain test token or signing sandbox; collect sanitized signed PDFs | Barid response + fixtures |
| **D1 — Manual route hardening** | EN/FR UX for download prepared / upload result; operator runbook; **no** PKCS#11 in API | Prepared-artifact PDF proof passes Phase B validator |
| **D2 — Provider adapter interface** | `SigningAdapter` implementation mapping Barid enrollment metadata only | Confirmed signing mechanism + credential enrollment API |
| **D3 — Local bridge** (only if required) | Separate repo; PKCS#11/CSP per Barid confirmation | D1 fails or in-app USB mandated **and** Barid approves |
| **D4 — Production trust & validation** | `SIGNING_TRUST_ANCHOR_PEMS`, OCSP/CRL policy, TSA verification policy | Legal/compliance sign-off |
| **E — Commercial/Documents signing UX** | Workspaces, preview, audit display | D1 or D3 end-to-end green |

Do **not** close #132 until provider path is production-piloted and UX phases are accepted.

---

## 18. Source register (Issue #145 pass)

| ID | Source |
| --- | --- |
| S1 | [DGSSI regulated products](https://www.dgssi.gov.ma/fr/prestations-et-produits-reglementes/) |
| S1b | [Decision 1/PSCo/2025 Barid agrément PDF](https://www.dgssi.gov.ma/sites/default/files/2025-01/decision_d_agrement_Barid_2025.pdf) |
| S2 | Barid Publications — Windows installation guide v4.0 2024 (#132 register) |
| S3 | Barid Publications — usage/verification guide v1.0 13/11/2024 (#132 register) |
| S4 | [Thales SafeNet Authentication Client](https://cpl.thalesgroup.com/access-management/security-applications/authentication-client-token-management) (**vendor only**) |
| S5 | [Barid Publications inventory](https://www.barid.ma/bamb2cstorefront/fr/Publications) (2026-10-08 crawl) |
| S6 | [EcoActu — Lleida.net / Barid platform](https://ecoactu.ma/signature-electronique-lleida-net-barid-al-maghrib/) (**indirect**) |
| S7–S8 | Barid qualified TSA / subscription guides (#132 register) |
| S9 | [Ref_QSCD v1.0](https://www.dgssi.gov.ma/sites/default/files/2023-09/Ref_QSCD_v1.0.pdf) |
| S10 | [Ref_Deliv_Cert_Qual v1.0](https://www.dgssi.gov.ma/sites/default/files/2023-09/Ref_Deliv_Cert_Qual_v1.0.pdf) |

Prior synthesis: [issue-132-electronic-signature-preflight.md](./issue-132-electronic-signature-preflight.md) §4 (re-verified where cited).

---

## 19. Verification (this PR)

- **Docs-only** (no schema, no production code, no provider secrets).
- **Checks:** `pnpm format:check`, `git diff --check`.
- **Spike:** not executed (blocked).

**Ready for provider implementation: NO.**

**Ready for ChatGPT review: YES.**

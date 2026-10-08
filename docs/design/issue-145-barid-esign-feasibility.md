# Issue #145 — Phase C: Barid eSign provider integration and token feasibility

Date: 2026-10-08 (final first-party Barid evidence pass). Status: **Phase C feasibility evidence accepted by maintainer** (no production adapter authorized).

Source of truth: [Issue #145](https://github.com/cyberdr1ft3r/hire-me-platform/issues/145). Parent: [#132](https://github.com/cyberdr1ft3r/hire-me-platform/issues/132) (**open**).

**Audited platform baseline:** `main` @ `0b8da9aa71055249a85831309229e5ef36d53e11` (Phase A **D-083 Accepted**, Phase B **D-084 Accepted**).

**Skills used:** project-memory, product-architecture, application-security.

No production certificate, private key, PIN, PUK, provider account, or customer PDF was used. No isolated hardware spike was executed (no Barid test token with signing key available to this pass).

Publications index: [Barid Publications](https://www.barid.ma/bamb2cstorefront/fr/Publications) (crawled and PDFs downloaded 2026-10-08).

---

## Executive summary

| Question | Answer |
| --- | --- |
| **Ready for provider implementation** | **NO** |
| **Ready for ChatGPT final Phase C review** | **YES** (first-party Barid set incorporated; residual gaps explicit) |
| **Recommended primary route (D-085 Accepted)** | **A — Manual desktop fallback** after prepared-artifact byte proof with Barid fixtures |
| **Custom local bridge required for route A** | **NO** |
| **Custom local bridge required for in-app USB signing** | **UNKNOWN** (likely **YES** unless Barid supplies a maintained third-party signing component) |
| **Remote Barid document-signing API confirmed** | **NOT FOUND** |
| **Isolated technical spike** | **BLOCKED** (no signing-capable test token; public audit certs have no private keys) |
| **D-085** | **Accepted** as a sequencing decision; it does **not** authorize provider implementation or production signing |

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
| **CONFIRMED — BARID** | Current Barid first-party publication (CGU, PC, DPC, PKI disclosure, official guide, official PEM/chain zip on Publications) |
| **CONFIRMED — DGSSI** | DGSSI decision, regulated-products table, Ref_QSCD, Ref_Deliv_Cert_Qual |
| **CONFIRMED — indirect** | Reputable press (e.g. Lleida.net RA platform) — not a Hire Me integration API |
| **VENDOR CAPABILITY ONLY** | Thales SafeNet generic docs — not Barid product confirmation |
| **REASONABLE INFERENCE** | Logical consequence of confirmed facts, explicitly marked |
| **NOT DOCUMENTED / REQUIRES BARID CONFIRMATION** | Gap requiring Barid answer, test token, or signed fixture |

---

## 2. First-party Barid document inventory (2026-10-08)

All items below were located on the official [Publications](https://www.barid.ma/bamb2cstorefront/fr/Publications) page unless noted. PDFs were downloaded and text-mined for this pass.

| # | Exact title (as published) | Version / OID on doc | Effective / doc date | Official source | Claims supported | Current? |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | **CGU Personne Physique — Certificat Qualifié de Signature électronique** | OID doc: `1.2.504.1.1.1.2.3.1.2.5` **v5.0** | (on PDF footer) | [Publications → CGU PP](https://www.barid.ma/bamb2cstorefront/fr/Publications) | Subscriber duties, PIN, QSCD use, revocation, OCSP/CRL URLs, PC OID refs | **Current** on storefront |
| B2 | **CGU Personne Morale — Certificat Qualifié de Cachet électronique** | OID doc: `1.2.504.1.1.1.2.3.1.3.5` **v5.0** | (on PDF footer) | [Publications → CGU PM](https://www.barid.ma/bamb2cstorefront/fr/Publications) | Seal responsible person, mandate, RCC/MC roles, revocation actors, QSCD, OCSP/CRL | **Current** |
| B3 | **Déclaration de Divulgation PKI** (délivrance certificats qualifiés signature et cachet) | OID doc: `1.2.504.1.1.1.2.3.1.5.1` | (on PDF) | Publications | Repository/CRL/OCSP, cert policy OIDs for issued products, QSCD on QSCD delivery | **Current** |
| B4 | **PC pour les Certificats Classe 3 Qualifiés de Signature et de Cachet électronique** | PC OID `1.2.504.1.1.1.2.1.1.2.10` **v6.0** | **16/09/2026** | Publications | Certificate type OIDs, PAdES/XAdES/CAdES applicability, key gen on QSCD, non-export, CRL/OCSP SLAs, validity 1–3 years | **Current** (supersedes PC v5.x for new issuance policy) |
| B5 | **DPC pour les Certificats Qualifiés de Signature et de Cachet électronique** | DPC OID `1.2.504.1.1.1.2.2.3.11` **v6.0** | **16/09/2026** | Publications | Operational practices mirroring PC; OCSP URL; enrollment/revocation procedures | **Current** |
| B6 | **Guide d'Utilisation et Vérification des certificats** | Guide OID `1.2.504.1.1.1.2.12.14.1` **v1.0** | **13/11/2024** | Publications | AC Racine G2, Qualified CA Barid eSign, repository URL, **public audit test certs** (no private keys), CRL check steps | **Current** |
| B7 | **Guide d'Obtention des Certificats Classe 3 Qualifiés** | Guide OID `1.2.504.1.1.1.2.12.1.3` **V3.0** | **09/06/2026** | Publications | RL/MC/porteur forms, identity/org proofs, MonCertificat, seal cert via call center, 6-month incomplete dossier rule | **Current** |
| B8 | **Guide Activation du compte utilisateur et Génération du code PIN** | Guide OID `1.2.504.1.1.1.2.12.24.1` **V1.0** | **09/06/2026** | Publications | MonCertificat activation, **Go>Sign** + SafeNet prerequisites, PIN ≥6 chars, token inserted | **Current** |
| B9 | **Guide Changement du code PIN et Déblocage** | Guide OID `1.2.504.1.1.1.2.12.26.1` **V1.0** | **09/06/2026** | Publications | PIN change/unblock via MonCertificat portal + SMS OTP | **Current** |
| B10 | **Guide de demande de Révocation des Certificats Qualifiés** | OID `1.2.504.1.1.1.2.12.3.1` **v1.0** | **12/05/2024** | Publications | Revocation reasons, channels | **Current** (older date; still listed) |
| B11 | **Formulaire de Demande de Révocation des Certificats Classe 3 Qualifiés** | — | — | Publications | Paper/form revocation | **Current** |
| B12 | **Guide d'Installation Certificat Barid eSign sous Windows** | **GUIDE.VER 4.0** | **© 2024**; SAC **10.7** | Publications | SafeNet + **Adobe Acrobat Reader DC+**, PDF signing workflow, USB token | **Current** on storefront |
| B13 | **Chaine de confiance certificat classe 3 Qualifié** (zip) | — | Certs dated **2024-07-04** | Publications | **AC Racine G2** + **Qualified CA Barid eSign** DER files | **Current** package |
| B14 | **CRL Liste des certificats qualifiés révoqués** | — | — | Publications page **title listed** | Qualified subscriber CRL | **Partial** — storefront HTML shows title; **direct `href` not present in static HTML**; use PKI disclosure CRL URLs (§10) |
| B15 | **CRL Horodatage Qualifié.crl** | — | — | Publications (download) | TSA-related CRL | **Current** |
| B16 | **CA du certificat client.pem** | — | — | Publications | Sample client CA PEM (study only) | **Current** |
| B17 | Kits/pilotes Windows & macOS (SafeNet) | — | — | Publications | Middleware distribution, not integration API | **Current** |
| B18 | **PH-DPH Service Horodatage Qualifié** | (policy doc on Publications) | TSA policy v2.x lineage | Publications | RFC 3161, `https://tsaqual.baridesign.ma/adss/tsa`, hashes, TSU chain | **Current** |
| B19 | **Guide d'Abonnement au service d'Horodatage Qualifié** | — | — | Publications | TSA subscription / mTLS onboarding (organizational) | **Current** |
| B20 | **Déclaration de divulgation PKI pour le service Horodatage Qualifié** | — | — | Publications | TSA PKI disclosure | **Current** |
| B21 | **Autorisation de Retrait du Certificat Qualifié** | — | — | Publications | In-person certificate pickup authorization | **Current** |
| B22 | **Guide Contrôle d'Identité et Face à Face par le Mandataire de certification** | — | — | Publications | MC face-to-face identity control | **Current** |

**Not downloaded but listed on Publications:** Guide de Déblocage du Certificat par code PUK; older PIN-only guide; advanced-class revocation guides (out of qualified scope).

**Live URL checks (2026-10-08):** `pki.baridesign.ma/repository` and `crl.pki.baridesign.ma` did not respond reliably within 20s from this environment — treat repository/CRL as **documented** with **live reachability REQUIRES BARID CONFIRMATION** at integration time.

---

## 3. Service OIDs vs certificate policy OIDs (distinct concepts)

| Concept | Person qualified signature | Organization qualified seal | Evidence | Confidence |
| --- | --- | --- | --- | --- |
| **DGSSI regulated service** (prestation/product row) | `1.2.504.1.1.1.2.1.1.2.1.10` « Classe 3 signature » | `1.2.504.1.1.1.2.1.1.2.2.10` « Classe 3 cachet » | DGSSI table + **PC v6.0** + PKI disclosure B3 | **CONFIRMED** |
| **PC document identifier** (policy document OID) | Parent PC: `1.2.504.1.1.1.2.1.1.2.10` | Same PC covers both products | PC v6.0 header | **CONFIRMED** |
| **Certificate type / policy OID in issued end-entity certs** | `1.2.504.1.1.1.2.1.1.2.1.10` | `1.2.504.1.1.1.2.1.1.2.2.10` | PC § certificate types table; PKI disclosure; CGUs reference PC `…2.10` + product `…2.1.10` / `…2.2.10` | **CONFIRMED — BARID** (for **issued qualified** person/seal certs) |
| **PDS / CGU disclosure OID** (contractual, not cert extension) | CGU OID `1.2.504.1.1.1.2.3.1.2.5` v5.0 | CGU OID `1.2.504.1.1.1.2.3.1.3.5` v5.0 | CGUs B1/B2 | **CONFIRMED** |
| **Guide document OIDs** (e.g. `…2.12.14.1`, `…2.12.24.1`) | User guides only | Same | Guides B6–B9 | **CONFIRMED** — **not** certificate policy OIDs |
| **Legacy guide mention `…2.12.14.1`** | Previously cited as cert policy | — | Usage guide B6 | **Corrected:** guide identifier, **not** EE certificatePolicies |
| **QCStatements / ETSI profile in EE certs** | ETSI EN 319 412-5 referenced in PC | Same | PC text | **CONFIRMED at policy level** — exact statement OIDs on **samples REQUIRES BARID CONFIRMATION** |
| **Issuing CA** | **Qualified CA Barid eSign** | Same CA hierarchy (no separate seal intermediate in published chain zip) | B6, B13, chain zip | **CONFIRMED** |
| **Root CA** | **AC Racine G2** (self-signed) | Same | B6, B13 | **CONFIRMED** |
| **Product name** | Certificat qualifié de **signature électronique** (person physical) | Certificat qualifié de **cachet électronique** (legal person/org) | PC, CGUs, DGSSI | **CONFIRMED** |

**Important:** For Barid qualified Classe 3 person/seal products, the **DGSSI service OID and the certificate type OID published in PC v6.0 match** (`…2.1.10` and `…2.2.10`). They must still be distinguished conceptually from **guide OIDs**, **CGU OIDs**, and the **parent PC document OID** (`…2.1.1.2.10`).

---

## 4. Qualified person-signature findings (natural person)

| Topic | Classification | Detail |
| --- | --- | --- |
| Product | **CONFIRMED — BARID/DGSSI** | Classe 3 qualified signature; cert type OID `…2.1.10` |
| Subscriber | **CONFIRMED — BARID** | Natural person **porteur** (B7, CGU B1) |
| Identity / enrollment | **CONFIRMED — BARID** | CIN/passport, 4-digit **code secret** envelope, RL form if minor; agency deposit + MonCertificat portal `https://online.baridesign.ma/` (B7) |
| Validity period | **CONFIRMED — BARID** | **1–3 years** (PC); commercial offer selects within range |
| Issuing CA / chain | **CONFIRMED — BARID** | Qualified CA Barid eSign ← AC Racine G2 (B6, B13) |
| Key generation | **CONFIRMED — BARID** | Keys generated **on QSCD**; certificate delivered on cryptographic device (PC §4.3, PKI disclosure) |
| Private key export | **CONFIRMED — BARID** | Porteur keys **not exportable** from QSCD (PC §6.2.6) |
| Sole control / PIN | **CONFIRMED — BARID** | Porteur defines PIN at first use (MonCertificat); must keep PIN secret; exclusive control duties (CGU B1, PC) |
| QSCD certification identity | **NOT DOCUMENTED** | PC: QSCD **qualified/agréé** by national authority; **exact model/certification ID not in public PC/CGU** |
| Token hardware model | **REQUIRES BARID CONFIRMATION** | USB token + SafeNet in guides; **no model/firmware in first-party set** |
| Renewal | **CONFIRMED — BARID** | New key generation on renewal (PC); operational steps via Barid channels |
| Revocation | **CONFIRMED — BARID** | Porteur/RCC/MC/legal rep; online portal; max processing **24 h** (PC `T_REV_TRAIT`); forms B10/B11 |
| Suspension | **CONFIRMED — BARID** | **Not allowed** (PC §4.9.13) |
| Lost/stolen token | **CONFIRMED — BARID** | Revoke on compromise/loss (CGU, revocation guides) |
| Advanced vs qualified | **CONFIRMED — DGSSI** | Separate advanced product OID `…27.6` — must not accept as qualified |

---

## 5. Qualified organization-seal findings (cachet)

| Topic | Classification | Detail |
| --- | --- | --- |
| Product | **CONFIRMED — BARID/DGSSI** | Classe 3 qualified **cachet**; cert type OID `…2.2.10` |
| Certificate subscriber vs operator | **CONFIRMED — BARID** | Legal entity; **responsable du certificat cachet (RCC)**; **mandataire de certification (MC)** optional; **porteur** may differ (B7 definitions, CGU B2) |
| Seal enrollment entry | **CONFIRMED — BARID** | Qualified **cachet** request: contact **080 200 60 60** / ServiceClient@poste.ma for commercial routing (B7) — not fully self-service like person flow |
| Mandate / authorization | **CONFIRMED — BARID** | Statutes, PV, legal rep proof, MC mandate form if designated; face-to-face ID (B7, B22, CGU B2) |
| Device control | **CONFIRMED — BARID** | Must use **Barid-provided QSCD**; RCC duties for seal use (CGU B2) |
| Multiple operators | **NOT DOCUMENTED** | MC can verify multiple porteurs for entity; **whether multiple seal credentials share one token** — **REQUIRES BARID CONFIRMATION** |
| Revocation authority | **CONFIRMED — BARID** | RCC, legal rep, MC; same compromise/loss grounds (CGU B2) |
| Hire Me mapping | **REASONABLE INFERENCE** | `SigningOrganization` ≈ legal entity; `SigningCredentialGrant` ≈ internal mandate — **does not replace** Barid RCC/MC enrollment or pickup authorization (B21) |

---

## 6. PIN and token lifecycle

| Topic | Classification | Detail |
| --- | --- | --- |
| Initial account activation | **CONFIRMED — BARID** | Email → MonCertificat `https://moncertificat.baridesign.ma` (B7, B8) |
| Initial PIN generation | **CONFIRMED — BARID** | First portal login with token inserted; PIN **≥ 6 characters** (B8); PC: porteur defines PIN at first use |
| PIN change | **CONFIRMED — BARID** | MonCertificat → Gestion certificats → Définir code PIN; SMS OTP (B9) |
| PIN unblock | **CONFIRMED — BARID** | Same portal flow “Débloquer votre certificat” (B9); PC references published unblock guide |
| PUK | **NOT DOCUMENTED in guides reviewed** | Separate **Guide de Déblocage du Certificat par code PUK** listed on Publications — **not text-mined this pass** |
| Retry counter / lockout threshold | **NOT DOCUMENTED** | Not stated in B8/B9/PC sections reviewed — **REQUIRES BARID CONFIRMATION** |
| Who performs unblock | **CONFIRMED — BARID** | **Porteur** via MonCertificat (+ OTP); not Hire Me server |
| SafeNet client | **CONFIRMED — BARID** | Required for token use; Windows guide **SAC 10.7** (B12); activation guide installs SafeNet + **Go>Sign** (B8) |
| Go>Sign role | **CONFIRMED — BARID** | Desktop component: **MonCertificat ↔ token** for PIN set/change/unblock — **not** documented as generic third-party PDF signing API |
| Browser involvement | **CONFIRMED — BARID** | MonCertificat is browser portal; PDF signing per B12 is **Adobe Reader** locally |
| Token removal mid-operation | **NOT DOCUMENTED** | — |

---

## 7. QSCD / key-control evidence

| Topic | Classification | Detail |
| --- | --- | --- |
| Local physical QSCD | **CONFIRMED — BARID** | Certificates delivered on cryptographic device; keys generated in QSCD (PC, PKI disclosure B3) |
| Remote QSCD | **NOT DOCUMENTED** for this product | PC focuses on porteur QSCD; remote QSCD rules exist at DGSSI Ref_QSCD generally — **Barid qualified USB path is local QSCD model** |
| Private key non-export | **CONFIRMED — BARID** | PC §6.2.6 |
| Sole control | **CONFIRMED — BARID** | CGU duties; activation via porteur PIN |
| Certificate bound to device | **CONFIRMED — BARID** | Issuance on device; renewal implies new key pair |
| QSCD product/model/certification | **REQUIRES BARID CONFIRMATION** | Policy-level “agréé” only |
| “Hardware-bound” wording | Use only with above | Do **not** infer eToken 5110 or firmware |

---

## 8. Trust chain and certificate repository

| Item | Classification | Detail |
| --- | --- | --- |
| Publication | **CONFIRMED — BARID** | Zip B13 on Publications; usage guide points to `https://pki.baridesign.ma/repository` |
| Root | **CONFIRMED — BARID** | **CN=AC Racine G2**, self-issued, valid **2024-06-12 → 2044-07-04**, SHA-256 **0D:17:63:2B:…:A4:BB** (parsed from B13 zip, 2026-10-08) |
| Intermediate / issuing CA | **CONFIRMED — BARID** | **CN=Qualified CA Barid eSign**, issued by AC Racine G2, valid **2024-07-04 → 2034-07-04**, SHA-256 **EC:EF:18:4B:…:C7:52** |
| Separate person vs seal intermediates | **CONFIRMED — BARID** | Published qualified chain zip contains **one** issuing CA — **same hierarchy** for qualified products |
| Cross-certification | **NOT DOCUMENTED** in B13 | — |
| Production trust onboarding | **Out of scope #145** | Do **not** add to `SIGNING_TRUST_ANCHOR_PEMS` in this PR |

---

## 9. CRL / OCSP / revocation

| Topic | Classification | Detail |
| --- | --- | --- |
| CRL distribution | **CONFIRMED — BARID** | `http://pki.baridesign.ma/crl/` (CGU); PKI disclosure: `https://crl.pki.baridesign.ma/crl/QCA_Barid_eSign_partc1.crl` (and related part URLs in TSA doc) |
| Qualified revoked list on Publications | **Partial** | Title **CRL Liste des certificats qualifiés révoqués** visible; **direct download link absent in static HTML** — use CRL URLs above |
| CRL publication frequency | **CONFIRMED — BARID** | **Every 24 h**, CRL lifetime **7 days** (`F_PUB_LCR`, PC appendix) |
| Max delay publish after generation | **CONFIRMED — BARID** | **30 min** (`T_PUB_LCR`) |
| Revocation request max processing | **CONFIRMED — BARID** | **24 h** (`T_REV_TRAIT`) |
| OCSP URL | **CONFIRMED — BARID** | **`http://ocsp.baridesign.ma/ocsp`** (CGU B2, PKI disclosure B3, DPC) |
| OCSP vs CRL skew | **CONFIRMED — BARID** | Up to **24 h** lag; **OCSP prevails** on inconsistency |
| OCSP response time | **CONFIRMED — BARID** | **≤ 10 s** (PC §4.10.1) |
| Suspension | **CONFIRMED — BARID** | Not permitted |
| Phase B runtime OCSP/CRL | **CONFIRMED — platform** | Not in Phase B (explicit anchors only) |

---

## 10. Enrollment and paperwork (public)

**Person qualified signature (B7):** online enrollment; printed/signed forms (porteur, RL, CGU, bon de commande, code secret envelope); identity + org proofs by entity type; agency deposit; certificate pickup; MonCertificat PIN.

**Organization qualified seal (B7 + B2):** same structural paperwork plus **commercial contact** for cachet product; RCC/MC roles; stronger revocation/mandate rules in CGU B2.

**Removed from provider questionnaire:** generic “what documents are required?” — answered by B7/B2/B22.

---

## 11. PDF / PAdES / prepared-artifact

| Topic | Classification | Detail |
| --- | --- | --- |
| Desktop PDF signing | **CONFIRMED — BARID** | Windows guide: **Adobe Acrobat Reader DC+**, token visible in SafeNet (B12) |
| PAdES B-B/B-T/B-LT/B-LTA in **produced PDFs** | **NOT DOCUMENTED** | PC §1.4.1: qualified certs **may be used** with **PAdES (ETSI EN 319 142-1)**, XAdES, CAdES, ASiC — **policy applicability**, not Adobe Reader profile guarantee |
| SubFilter / CMS details | **NOT DOCUMENTED** | No trustworthy Barid-signed Hire Me–style fixture |
| Visible seal appearance | **NOT DOCUMENTED** | |
| Placeholder / byte-preservation signing | **NOT DOCUMENTED** | Adobe manual path does **not** prove prepared-artifact compatibility |
| Prepared-artifact compatibility | **BLOCKED** | Requires sanitized signed PDFs + Phase B validator |

---

## 12. Qualified timestamping (separate service)

| Topic | Classification | Detail |
| --- | --- | --- |
| Distinct from document signing | **CONFIRMED — BARID/DGSSI** | B18–B20 |
| RFC 3161 production endpoint | **CONFIRMED — BARID** | `https://tsaqual.baridesign.ma/adss/tsa` (PH-DPH B18) |
| SHA-256/384/512 | **CONFIRMED — BARID** | B18 |
| mTLS / subscription | **CONFIRMED — BARID** | B19 (organizational interconnection) |
| Auto-embed in desktop PDF sign | **NOT DOCUMENTED** | |
| Test vs prod TSA endpoint | **REQUIRES BARID CONFIRMATION** | Production URL documented; **test endpoint not established** in docs reviewed |
| Phase B trusted TSA verify | **CONFIRMED — platform** | Out of scope; `VALID` ≠ trusted timestamp |

---

## 13. Programmatic integration (PKCS#11 / CSP / KSP / SDK / API)

| Mechanism | Barid first-party support | Evidence |
| --- | --- | --- |
| **MonCertificat + Go>Sign + SafeNet** (PIN lifecycle) | **CONFIRMED — BARID** | B8 — **not** third-party document signing |
| **Adobe Reader PDF sign** | **CONFIRMED — BARID** | B12 — manual end-user |
| **PKCS#11 / CSP / KSP for third-party apps** | **NOT DOCUMENTED** | SafeNet mentioned as **driver** only — **VENDOR CAPABILITY ONLY** for app integration |
| **SDK / CLI / localhost / native messaging** | **NOT FOUND** | |
| **Remote document-signing API** | **NOT FOUND** | Lleida.net = **CONFIRMED — indirect** RA platform only |

---

## 14. Exact token model

| Topic | Classification |
| --- | --- |
| Manufacturer / model / firmware | **REQUIRES BARID CONFIRMATION** |
| SafeNet Authentication Client | **CONFIRMED — BARID** Windows qualified guide: from **10.7** (B12); macOS/Windows pilots on Publications |
| QSCD certification reference | **REQUIRES BARID CONFIRMATION** |
| OS support | **CONFIRMED — BARID** | Windows (B12); macOS Sequoia+ and Monterey–Sonoma pilots listed |

---

## 15. Sample signed PDF / sandbox

| Item | Result |
| --- | --- |
| Public audit certs (`test_audit_*.der`) | **CONFIRMED — BARID** (B6) — **no private keys** → verify chain only |
| Official sample signed PDFs | **NOT FOUND** |
| Test USB token for integrators | **NOT DOCUMENTED** |
| Spike | **BLOCKED** |

---

## 16. Integration architecture (D-085 Accepted)

**Recommendation unchanged:** **Route A** manual desktop (prepare → download → sign with Barid-documented desktop stack → upload → Phase B validate) **only after** fixture proof. **Route B** custom bridge only if in-app signing required **and** Barid confirms PKCS#11/CSP module + redistribution. **No Route D** without written API.

| Custom bridge for Route A | **NO** |
| Custom bridge for in-app USB | **UNKNOWN** (likely **YES** if no official Barid signing component) |

**D-085 accepted:** manual desktop compatibility proof remains the first route to prove; this does **not** authorize an adapter, pilot, or production signing before the documented entry gates pass.

---

## 17. Threat model delta

Unchanged from prior pass; emphasize: **Go>Sign ≠ Hire Me integration**; **PAdES in PC ≠ Adobe output profile**; **OCSP/CRL now documented** for Phase D/E planning only.

---

## 18. Minimal provider questionnaire (integration blockers only)

Send to Barid eSign integration support after this pass. **Do not ask** service OIDs, enrollment paperwork, trust/CRL/OCSP URLs, PIN portal flow, or TSA production URL — covered by §2–12.

### Integration mechanism

1. For **third-party business applications** (not MonCertificat/Go>Sign), is there a **supported** signing interface (PKCS#11 module name/path, Windows CSP/KSP, or official SDK)? Provide documentation, redistribution license, and supported algorithms (RSA-PSS/ECDSA + SHA-256).
2. Is **Go>Sign** or any Barid component licensed/supported for **signing arbitrary PDFs** from another vendor’s application (not only PIN management)?
3. Any **remote document-signing API** (distinct from qualified TSA)? If yes, provide spec and authentication model.

### Fixtures and compatibility

4. Provide **sanitized sample PDFs** signed with **qualified person** and **qualified cachet** credentials showing **SubFilter**, **ByteRange**, and whether bytes outside `/Contents`/`/ByteRange` changed.
5. Will **Adobe Acrobat/Reader** or Barid tooling sign a PDF that already contains a **placeholder** (`/ByteRange` + empty `/Contents`) **without modifying** bytes outside the signature dictionary zones?
6. Which **PAdES profile** (if any) is **actually emitted** in PDF signing for Classe 3 signature vs cachet?
7. Maximum **signature container** size vs placeholder slot.

### Seal-specific

8. Sample **cachet** certificate PEM + signed PDF; can person signature and organization cachet **coexist on one token**? Operator selection semantics?

### Test environment

9. **Integrator test USB token** or signing sandbox (lead time, cost, support contact).
10. **Test TSA** endpoint (if distinct from production) and test interconnection certificate process.

### Token clarity

11. Exact **USB token model**, firmware, and current **SAC** version in the 2026 qualified Windows kit.

### Commercial (if not public)

12. Integration support **SLA** and pricing for qualified cachet + integrator support (optional if sales channel answers via 080 200 60 60).

---

## 19. Recommended next implementation split

| Phase | Scope | Entry gate |
| --- | --- | --- |
| **C2 — Barid engagement** | Send §18 questionnaire; obtain test token + sanitized PDFs | Barid response |
| **D1 — Manual route** | Download/upload UX + runbook | Prepared-artifact proof passes Phase B |
| **D2 — Adapter metadata** | Enrollment mapping only | Confirmed signing mechanism |
| **D3 — Local bridge** | Separate repo | D1 fails or in-app USB mandated + Barid confirms PKCS#11/CSP |
| **D4 — Production trust/revocation** | Anchors, OCSP/CRL policy, TSA policy | Compliance sign-off |
| **E — Commercial/Documents UX** | Workspaces | D1 or D3 green |

Do **not** close #132 until production-piloted path and UX are accepted.

---

## 20. Source register (Issue #145 final pass)

| ID | Source |
| --- | --- |
| S1 | [DGSSI regulated products](https://www.dgssi.gov.ma/fr/prestations-et-produits-reglementes/) |
| S1b | [Decision 1/PSCo/2025 Barid agrément PDF](https://www.dgssi.gov.ma/sites/default/files/2025-01/decision_d_agrement_Barid_2025.pdf) |
| S2 | Barid Publications inventory B1–B22 (2026-10-08) |
| S3 | PC v6.0 / DPC v6.0 qualified signature+seal (Publications) |
| S4 | CGUs person/seal v5.0 (Publications) |
| S5 | PKI disclosure qualified issuance (Publications) |
| S6 | Usage guide v1.0 2024-11-13; Obtention V3.0 2026-06-09; PIN guides 2026-06-09 (Publications) |
| S7 | Windows install guide v4.0 / SAC 10.7 (Publications) |
| S8 | Trust chain zip + PH-DPH / TSA subscription guides (Publications) |
| S9 | [Ref_QSCD v1.0](https://www.dgssi.gov.ma/sites/default/files/2023-09/Ref_QSCD_v1.0.pdf) |
| S10 | [Ref_Deliv_Cert_Qual v1.0](https://www.dgssi.gov.ma/sites/default/files/2023-09/Ref_Deliv_Cert_Qual_v1.0.pdf) |
| S11 | [Thales SAC](https://cpl.thalesgroup.com/access-management/security-applications/authentication-client-token-management) (**vendor only**) |

Prior synthesis: [issue-132-electronic-signature-preflight.md](./issue-132-electronic-signature-preflight.md) (superseded where this doc is more specific and first-party).

---

## 21. Verification (this PR)

- **Docs-only** (no schema, no production code, no provider secrets).
- **Checks:** `pnpm format:check`, `git diff --check`.
- **Spike:** not executed (blocked).

**Ready for provider implementation: NO.**

**Ready for ChatGPT final Phase C review: YES.**

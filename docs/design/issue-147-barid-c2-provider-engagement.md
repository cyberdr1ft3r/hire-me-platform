# Issue #147 — C2: Barid eSign fixtures and prepared-artifact compatibility

Date: 2026-10-08. **C2 state:** `READY_TO_CONTACT_PROVIDER`

Parent: [#132](https://github.com/cyberdr1ft3r/hire-me-platform/issues/132) (**open**).

Predecessors: **D-083**, **D-084**, **D-085 Accepted** ([#145 feasibility](./issue-145-barid-esign-feasibility.md)).

Platform baseline: `main` @ `b729c1758462a538d07a9f2dfab72fc38343edc6`.

**No production Barid adapter.** Phase B validation remains authoritative ([D-084](./issue-143-phase-b-architecture.md)).

---

## Executive summary (C2)

| Item | Status |
| --- | --- |
| **C2 state** | `READY_TO_CONTACT_PROVIDER` |
| **Questionnaire sent to Barid** | **NO** (package prepared; human/maintainer send required) |
| **Provider response** | **NOT REQUESTED YET** |
| **Person fixture** | **NOT REQUESTED / NOT RECEIVED** |
| **Organization seal fixture** | **NOT REQUESTED / NOT RECEIVED** |
| **Test token / sandbox** | **NOT REQUESTED / AVAILABILITY UNKNOWN** |
| **Third-party PKCS#11/CSP/KSP** | **UNKNOWN** (not Barid-confirmed) |
| **SDK / native / remote signing API** | **NOT CONFIRMED** |
| **Prepared-artifact compatibility** | **BLOCKED** (no Barid-signed fixtures) |
| **Route A (D-085 manual desktop)** | **BLOCKED** |
| **Ready for provider implementation** | **NO** |

---

## 1. Official Barid contact channels (first-party only)

Do **not** use invented addresses. Sources: [Issue #145](./issue-145-barid-esign-feasibility.md) guides B7, CGUs B1/B2.

| Channel | Value | Use for C2 |
| --- | --- | --- |
| **Email** | **ServiceClient@poste.ma** | Primary written channel cited for information/reclamations and qualified cachet orientation (Guide d’obtention V3.0, CGUs). |
| **Telephone** | **080 200 60 60** | Qualified **cachet** commercial routing; general eSign support (CGUs, obtention guide). |
| **Enrollment portal** | [https://online.baridesign.ma/](https://online.baridesign.ma/) | Certificate lifecycle enrollment — **not** third-party integration support. |
| **MonCertificat (subscribers)** | [https://moncertificat.baridesign.ma](https://moncertificat.baridesign.ma) | PIN/account — **not** integrator API. |
| **Publications / PKI docs** | [Barid Publications](https://www.barid.ma/bamb2cstorefront/fr/Publications) | Policies and user guides only. |
| **Dedicated integrator email** | **NOT DOCUMENTED** | No public `integration@` or equivalent found in first-party set. |

**Recommended delivery route for this package:** email **ServiceClient@poste.ma** (French cover + technical appendix below), subject line requesting orientation toward **integration technique / partenaires logiciels** for qualified Classe 3 signature and cachet; follow up by phone **080 200 60 60** if no routing within a reasonable SLA. Ask Barid to name the correct integration mailbox or ticket process if one exists.

---

## 2. French cover message (ready to send)

**Objet :** Demande d’informations — intégration logicielle tierce et éléments de test (signature qualifiée / cachet qualifié Barid eSign)

Madame, Monsieur,

Nous développons une plateforme métier interne (Hire Me) et souhaitons, dans le cadre d’une **intégration future**, valider la **compatibilité technique** entre nos documents PDF préparés pour signature et le parcours **desktop/token** documenté par Barid eSign (Adobe Reader / token USB / SafeNet), **sans affaiblir** nos contrôles de validation cryptographique indépendants.

Nous avons pris connaissance de votre documentation publique (PC/DPC v6.0, CGU, guides MonCertificat, Go>Sign, etc.) et ne redemandons **pas** les éléments déjà publiés (OID de service, chaîne de confiance, OCSP/CRL, procédures d’enrôlement standard).

**Nous ne sollicitons pas :** clés privées, codes PIN/PUK, jetons de production, documents clients, secrets d’API, ni certificats P12/PFX contenant des clés privées.

**Nous sollicitons :**

1. Confirmation écrite des **interfaces officiellement supportées** pour une application tierce (PKCS#11, CSP/KSP/CNG, SDK, composant natif, API de signature documentaire distincte de l’horodatage qualifié).
2. Un **environnement de test** (token USB de test, certificats de démonstration personne physique et cachet personne morale, ou bac à sable) et un **contact intégration**.
3. Des **PDF signés échantillons assainis** (signature qualifiée personne + cachet qualifié organisation), avec votre accord explicite pour analyse d’intégration.
4. Une réponse précise sur la **signature d’un PDF contenant déjà un placeholder de signature** (`/ByteRange`, `/Contents` réservé) sans réécriture des octets hors zones de signature.

Vous trouverez ci-dessous notre **questionnaire technique résiduel** et la **liste des artefacts** demandés.

Nous restons disponibles pour un échange téléphonique ou une visioconférence technique sous NDA si nécessaire.

Cordialement,

_[Nom / société / contact technique — à compléter par le maintainer avant envoi]_

---

## 3. Residual technical questionnaire (English appendix)

Derived from [Issue #145 §18](./issue-145-barid-esign-feasibility.md). **Do not** re-ask DGSSI OIDs, public CRL/OCSP URLs, standard enrollment, or production TSA URL.

### 3.1 Third-party application signing

| ID | Question |
| --- | --- |
| Q1 | For **third-party business applications** (outside MonCertificat/Go>Sign PIN lifecycle), does Barid **officially support** signing through **PKCS#11**? If yes: exact **module/library name**, **path**, **OS/bitness**, and **mechanisms** (e.g. RSA-PSS, ECDSA, SHA-256). |
| Q2 | Is a **Windows CSP, KSP, or CNG provider** officially supported for qualified Classe 3 signature and cachet? Provider names and documentation? |
| Q3 | Is there an official **SDK, CLI, or native/browser component** for third-party PDF or CMS signing? Lifecycle and redistribution terms? |
| Q4 | May **Go>Sign** be used to sign **PDFs from third-party applications**, or is it limited to **MonCertificat ↔ token** (PIN/unblock)? |
| Q5 | Is there a **remote document-signing API** (distinct from qualified **TSA** RFC 3161)? If yes: specification, authentication, supported certificate types. |
| Q6 | **Redistribution/license** terms for SafeNet middleware or any Barid-branded component bundled with our software. |

### 3.2 Test environment

| ID | Question |
| --- | --- |
| Q7 | **Integrator test USB token** or **signing sandbox**: availability, lead time, cost, support contact. |
| Q8 | **Demo/test qualified person-signature** credential (certificate + token or sandbox). |
| Q9 | **Demo/test qualified organization-seal** credential. |
| Q10 | Named **integration support process** (ticket queue, SLA, technical contact). |
| Q11 | **Test TSA** endpoint and test **interconnection certificate** process, if distinct from production. |

### 3.3 PDF / PAdES / prepared-artifact

| ID | Question |
| --- | --- |
| Q12 | Provide **sanitized PDF(s)** signed with **qualified person** credential: actual **PAdES profile**, **SubFilter**, algorithms, **timestamp** behavior, **signature container size**, **ByteRange**, extra revisions. |
| Q13 | Same for **qualified organization seal** (cachet). |
| Q14 | Can **Adobe Acrobat/Reader** or Barid tooling sign a PDF that **already contains** a signature **placeholder** (`/ByteRange` + empty `/Contents`) **without modifying bytes outside** the signature dictionary and approved ranges? |
| Q15 | Maximum **CMS/signature container** size vs a **8192-byte** (or other) placeholder slot. |

### 3.4 Seal-specific

| ID | Question |
| --- | --- |
| Q16 | Sanitized **cachet certificate** (public PEM/DER only) and **cachet-signed PDF**. |
| Q17 | Can **person signature** and **organization cachet** credentials **coexist on one physical token**? |
| Q18 | **Operator/certificate selection** semantics when multiple credentials are present. |

### 3.5 Token clarity (still unresolved publicly)

| ID | Question |
| --- | --- |
| Q19 | Exact **USB token model**, **firmware** (if relevant), **QSCD certification reference** (if shareable). |
| Q20 | Current **SafeNet Authentication Client** version shipped in the **2026** qualified Windows kit. |
| Q21 | **PIN retry / lockout** thresholds and **PUK** behavior beyond public guides (if not fully specified). |

### 3.6 Commercial / support (optional)

| ID | Question |
| --- | --- |
| Q22 | Integrator **SLA**, **pricing** for test token and integration support (if not public). |

---

## 4. Exact artifacts requested

| ID | Artifact | Person / seal | Sanitized | Private key? |
| --- | --- | --- | --- | --- |
| A1 | Qualified **person** signed PDF (representative of desktop/Adobe path) | Person | **Required** | Must contain **no** customer data |
| A2 | Qualified **cachet** signed PDF | Seal | **Required** | Same |
| A3 | **Public certificate(s)** matching A1/A2 (PEM/DER) | Both | Yes | **Public only** |
| A4 | Written confirmation of **placeholder signing** (Q14) | N/A | N/A | N/A |
| A5 | **PKCS#11/CSP/SDK** documentation if supported | N/A | N/A | N/A |
| A6 | **Test token** or sandbox access instructions | Both | N/A | **Never** ship PIN/PUK |
| A7 | Provider **permission statement** for repository storage of A1–A3 (hashes + sanitized copies) | Both | N/A | N/A |

**Explicitly excluded from request:** P12/PFX with private keys, production tokens, PIN/PUK, production customer PDFs, API secrets.

---

## 5. Provider-response tracking table

Update this table when Barid responds. **Do not fabricate rows.**

| ID | Topic | Question | Barid response summary | Evidence ref | Status | Updated |
| --- | --- | --- | --- | --- | --- | --- |
| Q1 | PKCS#11 | Third-party PKCS#11 | — | — | **OPEN** | — |
| Q2 | CSP/KSP | Windows crypto provider | — | — | **OPEN** | — |
| Q3 | SDK/native | SDK/CLI/component | — | — | **OPEN** | — |
| Q4 | Go>Sign | Scope beyond MonCertificat | — | — | **OPEN** | — |
| Q5 | Remote API | Document signing API | — | — | **OPEN** | — |
| Q6 | License | Redistribution | — | — | **OPEN** | — |
| Q7 | Sandbox | Test token/sandbox | — | — | **OPEN** | — |
| Q8 | Test cred | Person demo cert | — | — | **OPEN** | — |
| Q9 | Test cred | Seal demo cert | — | — | **OPEN** | — |
| Q10 | Support | Integration contact | — | — | **OPEN** | — |
| Q11 | TSA test | Test TSA | — | — | **OPEN** | — |
| Q12 | Fixture | Person signed PDF | — | — | **OPEN** | — |
| Q13 | Fixture | Seal signed PDF | — | — | **OPEN** | — |
| Q14 | Placeholder | Byte-preserving sign | — | — | **OPEN** | — |
| Q15 | Placeholder | Container size | — | — | **OPEN** | — |
| Q16 | Seal | Cachet cert + PDF | — | — | **OPEN** | — |
| Q17 | Seal | Coexistence on token | — | — | **OPEN** | — |
| Q18 | Seal | Selection semantics | — | — | **OPEN** | — |
| Q19 | Token | Model/firmware/QSCD ref | — | — | **OPEN** | — |
| Q20 | Token | SAC version | — | — | **OPEN** | — |
| Q21 | Token | PIN lockout/PUK | — | — | **OPEN** | — |
| Q22 | Commercial | SLA/pricing | — | — | **OPEN** | — |

**Status values:** `OPEN` | `ANSWERED` | `PARTIAL` | `DECLINED` | `N/A`

---

## 6. C2 state model

| State | Meaning | Current? |
| --- | --- | --- |
| `READY_TO_CONTACT_PROVIDER` | Engagement package complete; send not yet executed | **YES** |
| `WAITING_ON_PROVIDER` | Questionnaire/artifacts requested; awaiting Barid | No |
| `PROVIDER_RESPONSE_RECEIVED` | Written answers received | No |
| `FIXTURES_RECEIVED` | Sanitized PDFs/certs in intake | No |
| `COMPATIBILITY_TESTING` | Prepared-artifact proof in progress | No |
| `ROUTE_A_PASS` | D-085 manual path proven with real fixtures | No |
| `ROUTE_A_FAIL` | Provider path breaks Phase B binding | No |
| `BLOCKED_PROVIDER_EVIDENCE` | Cannot proceed without provider | No |

**Transition (expected):** `READY_TO_CONTACT_PROVIDER` → (human sends email) → `WAITING_ON_PROVIDER` → …

---

## 7. Fixture intake runbook

Location for future sanitized files: `docs/design/barid-c2-fixtures/` (metadata and registry only until Barid approves commits).

### 7.1 Intake steps

1. Receive artifact from Barid (email secure link, physical media, or ticket attachment).
2. Verify **sanitized** (no real customer names/IDs/contracts unless Barid confirms test data).
3. Compute **SHA-256** of each file; record in **§7.2 registry**.
4. Store **original** outside git (maintainer secure storage); commit only if Barid **A7** permission granted and content is sanitized.
5. Never commit private keys, PIN/PUK, P12/PFX with keys, or full email threads with secrets.

### 7.2 Fixture provenance registry

| fixture_id | provider | received_date | kind (person/seal) | test/demo | sanitized | sha256 | mime | cert_fp | product_oid | repo_commit_ok | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| _(empty — no fixtures received)_ | | | | | | | | | | | |

### 7.3 Allowed in repository after approval

- Sanitized PDFs and public certificates explicitly authorized by Barid.
- Analysis reports (Markdown) with hashes and structural findings.
- Redacted provider emails (no secrets).

---

## 8. Compatibility test plan (execute when fixtures/token exist)

**Prerequisite:** Real Barid-produced signed PDFs and/or test token; operator with local PIN (never logged).

### 8.1 Existing Barid-signed fixture analysis (person and seal separately)

For each sanitized PDF **A1** / **A2**:

1. Count **signature fields** in PDF V1; detect **incremental updates**.
2. Extract **ByteRange**, **SubFilter**, **Contents** length (hex).
3. Parse **CMS** SignerInfo: digest alg, signature alg, signer cert serial/issuer.
4. Map **certificatePolicies**, **QCStatements**, EKU, key usage.
5. Build **chain** to test anchors (AC Racine G2 / Qualified CA — test config only, not production env).
6. Note **timestamp** token if present; document **PAdES profile** only if provable from PDF/CMS.
7. Record **revocation** check outcome (optional manual OCSP/CRL for analysis — not Phase B production policy).

Deliverable: `docs/design/barid-c2-fixtures/analysis-<fixture_id>.md` (no secrets).

### 8.2 Hire Me prepared-artifact proof (Route A gate)

1. In **test environment**, create synthetic document + `SigningRequest` + approval → generate **prepared PDF** per Phase B (`@signpdf/placeholder-plain`).
2. Record **prepared_sha256** and approved binding metadata.
3. Sign **exact prepared file bytes** using **Barid-documented path** (Adobe Reader + token per B12, or provider-confirmed method from Q1–Q5).
4. Upload result through existing **`submitSigningResult`** flow (test credentials).
5. Run **`PdfSignatureValidatorService`** with **test-only** `SIGNING_TRUST_ANCHOR_PEMS` (qualified chain from Publications zip — not production rollout).
6. Assert Phase B rules ([validation preflight](./issue-143-validation-engine-preflight.md)):
   - Exactly **one** signature in V1.
   - **Prepared-artifact binding**: only `/Contents` and `/ByteRange` zones differ from prepared artifact (deterministic comparison).
   - No unapproved trailing revision.
   - CMS crypto **VALID** under test anchors.
   - Signer fingerprint matches enrolled test credential metadata.

**PASS:** all steps green with Barid-produced output.  
**FAIL:** any unapproved byte change, extra signature, or validation rejection — document diff regions; **do not** change Phase B.  
**BLOCKED:** no token/fixtures.

### 8.3 Optional isolated token spike (if Q7–Q9 satisfied)

- Enumerate certificates on token; store **public** metadata only.
- Confirm **non-export** (policy-level; no key material extraction).
- If PKCS#11 **Barid-confirmed**: record module path and mechanism list locally (not in CI).
- Sign synthetic prepared PDF; repeat §8.2.

**CI:** no hardware; spike scripts manual/local only.

---

## 9. Route A decision (D-085)

| Classification | Criteria | **Current** |
| --- | --- | --- |
| **PASS** | Sanitized fixtures + prepared-artifact proof passes Phase B | **No** |
| **FAIL** | Provider tooling rewrites unapproved bytes or cannot sign placeholder | **No** |
| **BLOCKED** | Insufficient provider evidence | **YES** |

---

## 10. Threat-model notes (C2 engagement)

Extends [#132](./issue-132-electronic-signature-preflight.md) and [#145 §17](./issue-145-barid-esign-feasibility.md). See [RISKS.md](../project/RISKS.md) updates for:

- Desktop PDF **rewrite** breaking prepared binding.
- **Wrong certificate** selected on multi-cert token.
- **Person vs seal** policy confusion.
- **Revoked** test credential used for false confidence.
- **Test vs production** token behavioral drift.
- **Middleware version** drift (SAC kit vs documented 10.7).
- **PIN lockout** during pilot.
- **Redistribution** license blocking bundled bridge.
- **Timestamp/LTV** adding post-sign revisions.
- **Compromised workstation** during manual Route A.

---

## 11. Recommended next path (after C2 evidence)

| Outcome | Next step |
| --- | --- |
| Route A **PASS** | Issue **D1**: manual download/upload UX + operator runbook (no bridge). |
| Route A **FAIL** + PKCS#11 confirmed | Separate adapter/bridge **preflight** issue. |
| Official **native component** | Prefer over custom bridge; security review. |
| Remote **signing API** confirmed | Separate architecture/security preflight before code. |
| Still **BLOCKED** | Remain **Ready for provider implementation: NO**. |

---

## 12. Verification (this PR)

- Docs-only; no adapter, no fixtures committed.
- `pnpm format:check`, `git diff --check`.

**Questionnaire sent:** **NO**  
**Provider response:** **NOT REQUESTED YET**  
**Ready for provider implementation:** **NO**  
**Ready for ChatGPT review:** **YES** (engagement package complete; external dependency explicit)

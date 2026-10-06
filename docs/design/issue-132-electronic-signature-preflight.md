# Issue #132 — electronic signature and company seal preflight

Date: 2026-10-06. Status: **proposal for review; no implementation authorized by this document**.

Source of truth: [Issue #132](https://github.com/cyberdr1ft3r/hire-me-platform/issues/132). **Audited main:** `bcf4b424dc2cce9c5280cb64db5254bd98bdb477` (includes merged PR #139 Issue #118 Missions IA, PR #140 document-generation audit assertion fix, PR #138/#137, Accounting #131, Agenda/Meetings #124, Documents #119, and earlier milestones). Prior preflight baseline was `696a539361f0455c843fd79c80c83c76ebaa842d`; this revision re-reads **current** code on `bcf4b42` and does not trust the old audit where behavior diverged.

**Ready for neutral implementation planning: YES** (provider-neutral domain, permissions, request/validation boundaries). **Ready for provider-specific implementation or production signing: NO** until Barid (or chosen provider) confirms the integration mechanism, token/SDK contract, and PDF/PAdES fixtures. No real token, private key, PIN, provider account or production document was used in this pass.

### Changes since preflight baseline `696a539` (relevant to signing)

| Area | Then (`696a539`) | Now (`bcf4b42`) | Signing impact |
| --- | --- | --- | --- |
| Missions / UI-DNA | Pre–#116/#117/#118 layout | Merged stacked master-detail (#116), interaction grammar (#117), bounded Missions IA (#118) | No new signing entities; UX patterns (read-first, bounded panels) inform future Commercial/Documents signing UI only |
| Documents workspace | Present | Bilingual `apps/web/src/documents/` (#119): list, filters, register, metadata, version upload, protected download | Signing UX should reuse Documents version history and permission model; not only Commercial session state |
| Accounting V1 | Not on baseline | Merged #131: operational accounting workspace | Financial records remain authoritative sources; generation today is still **Commercial** templates (quotation, PO, contract, invoice)—Accounting does not call `DocumentGenerationService` |
| Agenda / Meetings | Not on baseline | Merged #124 | Out of #132 V1 scope |
| Audit integration tests | Full-row JSON scan for redaction substrings | PR #140: `metadataSummary`-only redaction assertions (avoids UUID false positives) | Future signing audit events must follow the same **operator-visible metadata** rule; never scan raw entity ids for secret substrings |
| `main` project memory | Stale phase pins | Updated through #139/#140 merges | STATUS/HANDOFF on this PR add **bounded** #132 status only |

## 1. Current generated-document architecture

The application is a NestJS modular monolith with API-owned Prisma/PostgreSQL, shared Zod contracts and React Commercial/Documents workspaces. Signing should be another bounded domain module, not logic embedded in Commercial or the PDF renderer.

| Existing surface | Audited behavior |
| --- | --- |
| `apps/api/prisma/schema.prisma`: `Document` | Logical file identity, context/source relations, visibility, mutable metadata/status and `currentVersionId`. Generated identity is unique per source type/id, output family and language. Commercial source FKs use RESTRICT. |
| Same file: `DocumentVersion` | Numbered stored file; unique storage key and (documentId, versionNumber); size, MIME, SHA-256, creator, source, template/version/language, unique generation idempotency key and source snapshot fingerprint. No signing request, certificate, approval or signature model. No issuer Organization/Company model exists; `Client` is the customer, not the signing company. |
| `document-generation/document-generation.service.ts`: `generate*`, `generate`, `publish` | Resolves authorized business snapshot, renders PDF/DOCX, hashes exact bytes, publishes storage, then commits a new version and advances current pointer. Inside the transaction it stabilizes rendered rows with shared locks, rechecks snapshot/eligibility, locks or creates Document, allocates version and audits. Failed commits compensate only this attempt's storage object. |
| `template-registry.ts`, `renderable-document.ts`, `renderers/pdf.renderer.ts` | Code-owned, data-only templates; PDFKit/fontkit/bidi and bundled fonts; DOCX separately. No cryptographic signing or provider bridge. Template-defined anchors must be introduced explicitly; a visual block alone is not signature evidence. |
| `documents/documents.service.ts` | Lists/detail/version/download enforce document permissions, visibility and source-domain authorization. Generated financial records require source view + commercial-data access + client access; mission-linked records also require mission visibility and assignment/override. Uploaded versions can currently be added to generated logical documents. |
| `storage/protected-storage.service.ts` | Local private filesystem; temporary write and atomic hard link prevent overwrite through `put`. `get` reads bytes; `delete` exists for compensation. This is application-level preservation, not WORM storage or protection against a privileged filesystem/database administrator. |
| `DocumentsService.downloadVersion` | Authorizes exact version and reads protected storage, but does **not** recompute/compare checksum before returning bytes. No cryptographic validation. |
| `CommercialGeneration.tsx` | Generates PDF/Word, lists generated versions and downloads via protected API. Local state begins with generation in the current UI session; a durable signing UX must also discover existing authorized versions after refresh (Documents workspace already models durable version lists). Generation is gated on `documents:generate` plus commercial/source scope; **sign-only** actors need separate proposed permissions (§6). |
| `documents/DocumentsWorkspace.tsx`, `DocumentsPanel.tsx` | Bilingual Documents module: server-paged list, filters, register, metadata edit, **upload new version**, archive, protected download. Uses same `DocumentsService` authorization as Commercial downloads. | Primary home for cross-context document history; signing status and audit should appear here as well as on Commercial financial records. |
| `document-generation.integration.test.ts` (audit case) | N/A on old baseline wording | Asserts redaction on `metadataSummary` only, not `JSON.stringify` of audit rows (PR #140) | Signing audit design must not reintroduce full-row substring scans that include UUID `entityId` values |
| `DocumentVersion_generation_provenance_consistent` migration constraint | GENERATED requires full generation provenance; other sources prohibit those generation fields. A future SIGNED source needs deliberate additive constraint evolution, not a fake generation idempotency key. |

Generation eligibility is not approval to sign: quotations currently generate in ISSUED/ACCEPTED/REJECTED/EXPIRED; purchase orders in DRAFT/RECEIVED; contracts in DRAFT/ACTIVE/COMPLETED; invoices only ISSUED, all subject to archive/cancellation checks. Proposed signing eligibility: quotations ISSUED/ACCEPTED; PO DRAFT/RECEIVED; contracts DRAFT/ACTIVE; invoices ISSUED. DRAFT signing freezes an explicitly approved snapshot without activating the business record. This narrower policy needs maintainer review; generation behavior is unchanged.

`checksumSha256` fingerprints file bytes. `sourceSnapshotSha256` fingerprints rendered business fields. They are not interchangeable. Generation tests already cover historical preservation, source authorization, stale snapshots, concurrency, compensation and database provenance constraints; none prove electronic signing.

## 2. Exact integration points and domain boundaries

| Location | Proposed integration |
| --- | --- |
| New API `document-signing/` module | Own eligibility, preparation, approval, requests, submission, independent validation and publication; orchestrate provider-neutral interfaces. |
| `DocumentGenerationService` source resolvers/fingerprint helpers | Extract reusable read-only authorization/snapshot policy where necessary. Signing uses stored bytes; it never calls regenerate as a substitute for the version selected by the user. Recheck current source fingerprint and eligible lifecycle at prepare, confirm and commit. |
| `DocumentsService.assertDocumentAccess`, `assertGeneratedSourceScope`, predicates | Extract a shared document access policy rather than copy or weaken private helpers. Use it for every request, preview, upload, result, audit read and download. |
| `publish` / Document row locking | Reuse version allocation/storage compensation pattern in a distinct signed publication service. Never invoke ordinary upload and then mark the file signed. |
| `addUploadedVersion`, regeneration, archive | Every new current version makes older unfinished signing requests stale. Reject ordinary uploaded/imported bytes as signing inputs even on a generated Document. Preserve all old evidence. Signing metadata may never flow from a logical Document onto all its versions. |
| `template-registry.ts` / renderable contract | Versioned fixed signature/seal anchors, page/rectangle resolved after layout; no arbitrary drag editor. Existing PDFs lacking anchors require explicit regeneration and new approval. |
| `packages/contracts/src/documents.ts`, new signing contract | Safe per-version signature summaries and separately permission-gated audit DTOs. No private paths, raw provider payloads or PIN fields. |
| `CommercialPanel.tsx` / `CommercialGeneration.tsx`, Documents detail/history | Separate sign capability from generate capability; list and preview already stored versions; EN/FR confirmation, method, actor/entity, version/reference, certificate summary, cancellation and errors. |
| `PermissionsService`, permission catalog/seed and Finance Manager contract | Permission codes plus source scope and credential authority; no FINANCE_MANAGER branch in runtime authorization. |
| Protected download and storage | Verify source/output byte checksums, retain exact evidence, reject corrupted bytes; preserve existing protected download rules. Operational retention/backup policy is a separate deployment gate. |

Conceptual interfaces: `SigningPreparation.prepare`, `SigningAdapter.capabilities/begin/cancel`, `SignatureValidator.validate`, and `SigningPublication.accept`. The adapter supplies a signature/result, not authoritative validation or a decision to grant access. Time-stamping is its own service capability. All remain domain concepts here; no interface code or dependency is added.

Proposed API shape: create request against `/v1/documents/:documentId/versions/:versionId/signing-requests`; authorized request preview; approve/confirm; bounded result submission; cancel; request status; signature audit. All IDs are resolved server-side under the actor's current scope. A future remote callback authenticates the provider and binds its transaction to an existing request; it cannot create a signing authority.

## 3. Immutable operation and PDF integrity contract

1. Prepare only a current, active, GENERATED PDF in the four permitted financial source families. Recheck account, permissions, source scope/lifecycle and current rendered-field fingerprint. Read bytes and recompute source SHA-256 against the stored checksum.
2. Create a durable request binding document/version/hash, source snapshot, actor, credential fingerprint, signature kind, issuer, method, template anchor, policy version and expiration. Recommended initial expiry: 15 minutes, subject to measured token UX. Same idempotency key with a different binding is a conflict.
3. Prepare and persist a PDF signing payload using an independently selected PDF signature engine. Keep original source bytes intact; explicitly define and validate the signature-only incremental update. Include request id and a fresh nonce commitment in the signed portion of the prepared payload so an old signature cannot satisfy a newly created request for identical business bytes. Save payload hash, length, ByteRange digest, reserved signature slot, fixed appearance and engine/version. Preview this exact prepared payload before approval. Never change appearance/anchor or re-render business content after confirmation.
4. Persist approval/confirmation of that complete binding, not just a business record id. V1 proposal permits the authorized signer/sealer to approve their own exact request; four-eyes approval is not claimed. A changed payload, identity, method or policy requires a new request and approval.
5. Local/native or supported remote adapter signs the prepared data using the selected credential. For CMS integration, signing the raw original-file SHA-256 is not sufficient: the PDF ByteRange digest and CMS signed attributes must follow the selected engine's documented protocol [S6].
6. Receive bounded untrusted evidence. Independently verify the returned CMS/PDF, expected certificate and kind, source lineage, payload binding, certificate path, algorithm policy, revocation evidence and any timestamp. For prepared-PDF mode, require exact equality outside the reserved signature Contents, correct complete ByteRange coverage and no unapproved trailing revisions. Recompute the result SHA-256. A PDF that merely contains the original file or the same extracted text is insufficient.
7. Publish under a fresh immutable storage key; in a short transaction recheck request state/expiry, active actor authority, credential grant, document current pointer, source eligibility/fingerprint and approval, then create SIGNED version + signature/evidence/event, consume request and advance current pointer together. Lock relevant source rows parent-first, then Document, then request; never hold locks during PIN prompts, network calls or validation. Serialize revocation/grant changes with acceptance or use an equivalent transactional authorization fence.
8. Regeneration/upload yields an unsigned new current version; old signed output remains linked only to its original input. V1 rejects stale request completion if current version or source snapshot changed. A cryptographically signed but rejected return may remain in restricted quarantine per retention policy; it is never published as accepted.

**Two hashes alone do not prove derivation.** Generic desktop download/sign/re-upload is therefore a candidate transport, not an enabled shortcut. It needs a tested validator for the exact permitted incremental changes. If Acrobat cannot honor the prepared-payload contract, that path stays disabled until its alternate binding proof is reviewed. Do not accept visual equality or a provider success string as proof.

V1 proposal: one person signature **or** one company seal per generated source version. No automatic second action or multi-party routing. If a document must carry both, explicitly plan a subsequent reviewed phase: sign the previous immutable output, preserve and revalidate every existing signature, and create a lineage chain. The schema below supports lineage without enabling that feature.

No silent timestamp/LT augmentation: evidence-only validation can append reports, but any operation changing PDF bytes produces a new output version with explicit lineage. Business statuses, invoice issuance and settlement remain unchanged.

## 4. Barid / DGSSI findings: evidence versus inference

Research re-checked **2026-10-06** against current DGSSI listings and Barid publications. Documented **market/regulator** capability does not prove operation with a particular customer's token, middleware build, or Hire-Me integration.

| Finding | Evidence and confidence | Consequence |
| --- | --- | --- |
| Separate qualified services | **CONFIRMED [S1][S1b]:** DGSSI regulated-products table and **Decision 1/PSCo/2025 (15 Jan 2025)** accredit Barid Al Maghrib for qualified **Classe 3 signature** and **Classe 3 cachet** (separate OIDs `1.2.504.1.1.1.2.1.1.2.1.10` and `1.2.504.1.1.1.2.1.1.2.2.10`). Qualified timestamp service is listed separately (OID `1.2.504.1.1.1.2.1.1.3.10` on DGSSI table). | Natural-person **electronic signature** and legal-person **electronic seal** are distinct products; never conflate certificate kinds. Accreditation ≠ this application's qualified signature. |
| Local USB/PDF workflow | **Confirmed, Barid guide [S2], 2024 v4.0, pp. 2–12:** SafeNet Authentication Client 10.7, Windows setup, USB token, Adobe Reader digital signing and local PIN entry are documented. | A manual desktop signature is a documented baseline; no automatic integration contract is established. This guide is listed under advanced/secured certificates, so do not infer all qualified-token details from it. |
| Qualified certificate tooling | **Confirmed [S3], v1.0 13/11/2024:** SafeNet token tooling, AC Racine G2 / Qualified CA Barid eSign, public test certificate examples and CRL publication are documented. | Use qualified-chain-specific evidence, not a legacy root assumption. Public test certificates are not a signing sandbox or private test keys. |
| PKCS#11 and Windows CSP/KSP | **Confirmed for SafeNet product [S4]:** PKCS#11 and CryptoAPI/CNG interfaces are supported. **Inference for intended Barid token:** plausible integration candidates, not yet a supported Barid SDK contract. | Obtain exact token model, firmware, SAC build, module/provider names, algorithms, licensing and sample operation before choosing one. |
| Operating systems | **Confirmed publication inventory [S5]:** Windows qualified packages and macOS SafeNet drivers are offered. | Installer listing is not proof that our future bridge works. Windows-first is a reasonable proposed pilot; confirm actual workstation support. |
| Desktop app, CLI, SDK, browser bridge, remote signing | Desktop manual flow is confirmed [S2]. No usable public Barid CLI/SDK, browser-signing/native-bridge protocol, or remote **document-signing** API contract was located in the reviewed material. | Ask Barid; absence from this search is not proof of absence. Browser compatibility in an installer guide is not arbitrary JavaScript access to token keys. |
| PDF/PAdES | PDF certificate signing is documented [S2]. No Barid-specific PAdES B/T/LT/LTA integration guarantee was established. | Request signed fixtures/profile and independent validation evidence; no claim of baseline or long-term conformance yet. |
| Qualified timestamps | **Confirmed [S7], policy v2.0 effective 07/11/2025:** RFC 3161, endpoint `https://tsaqual.baridesign.ma/adss/tsa`, SHA-256/384/512 and nonce processing. The policy describes interconnection certificates for mutual TLS; [S8] describes subscription. | This is a timestamp service, not remote document signing. Confirm test/prod onboarding and entitlements before use. Its client authentication certificate is distinct from a USB signing key. |

**Local signing bridge required?**

| Scenario | Bridge required? | Reasoning |
| --- | --- | --- |
| Manual fallback (download prepared PDF → Barid/Adobe desktop → upload result) | **NO** custom Hire-Me bridge | Uses provider-documented desktop flow; server still must **cryptographically validate** binding to exact `DocumentVersion` bytes/hash |
| Integrated in-app signing with USB token | **YES** (provider bridge **or** custom localhost/native agent) | Browsers do not expose PKCS#11/USB signing safely; **REQUIRES PROVIDER CONFIRMATION** whether Barid supplies native messaging, SDK, or approved local service |
| Remote/cloud document signing API | **UNKNOWN** | No public Barid **document-signing** API contract found; do not infer from TSA or accreditation alone |

Do **not** use WebUSB or arbitrary JavaScript token access. Any localhost bridge must follow §8 trust boundary (loopback, allowlist, one-time challenge, hash/version binding, expiry, no arbitrary file signing).

### Source register

- **S1:** [DGSSI regulated products/services — trust-service table](https://www.dgssi.gov.ma/fr/prestations-et-produits-reglementes/) (Barid Classe 3 signature, Classe 3 cachet, timestamp OIDs).
- **S1b:** [DGSSI Decision 1/PSCo/2025 — Barid accreditation PDF](https://www.dgssi.gov.ma/sites/default/files/2025-01/decision_d_agrement_Barid_2025.pdf) (qualified signature + seal certificate issuance services, Law 43-20).
- **S2:** [Barid publications](https://www.barid.ma/bamb2cstorefront/fr/Publications), “Guide d'Installation Certificat Barid eSign sous Windows”, v4.0, 2024; installation and PDF signing pp. 2–12.
- **S3:** Same [publications page](https://www.barid.ma/bamb2cstorefront/fr/Publications), “Guide d'Utilisation et Vérification des certificats”, v1.0, 13/11/2024, pp. 1, 4, 15, 24–26; OID `1.2.504.1.1.1.2.12.14.1`; links to [PKI repository](https://pki.baridesign.ma/repository) and [CRL repository](https://crl.pki.baridesign.ma/crl/).
- **S4:** [Thales SafeNet Authentication Client product technical specifications](https://cpl.thalesgroup.com/access-management/security-applications/authentication-client-token-management), supported API table. General vendor capability only.
- **S5:** [Barid publications inventory](https://www.barid.ma/bamb2cstorefront/fr/Publications), qualified Windows and macOS driver entries; no installers executed.
- **S6:** [European Commission DSS external CMS/PAdES interface](https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/apidocs/eu/europa/esig/dss/pades/signature/PAdESWithExternalCMSService.html) and [DSS documentation](https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/doc/dss-documentation.html). Technical reference only; DSS is not selected and EU trust lists are not a Moroccan trust policy.
- **S7:** [Barid publications](https://www.barid.ma/bamb2cstorefront/fr/Publications), “PH DPH Service Horodatage Qualifié”, v2.0, 07/11/2025: §5.1 (p. 11 endpoint), §8.7.1.2 (p. 26 request hashes/nonces), appendix on interconnection certificates (p. 37, mutual TLS).
- **S8:** Same page, “Guide d'Abonnement au service d'Horodatage Qualifié”, v1.0, 22/05/2025; organizational subscription and technical responsible person/interconnection certificate.

## 5. Proposed schema — conceptual only

UUID keys and UTC instants. No migration in this PR. Mutable configuration has createdAt/updatedAt; history/evidence is append-only. Application-level metadata, provider assertions and independently validated facts are distinct.

| Entity | Attributes and relationships | Constraints / lifecycle |
| --- | --- | --- |
| `SigningOrganization` | Issuing legal entity: id, legal name, registration identifier(s), country, status, verified identity reference. One organization has many credentials. | New internal issuer concept; never reuse customer Client or infer issuer from document clientId. V1 explicitly configures one issuer; not a new multitenancy system. Archive, never cascade evidence. Identity changes do not rewrite signed snapshots. |
| `SigningCredential` | ownerType USER/ORGANIZATION; exactly one ownerUserId or organizationId; provider, service type/OID, method capability, certificate DER/public chain references, issuer+serial, SHA-256 fingerprint, validity, key usage/QC metadata, declared assurance, binding verifiedBy/At and evidence reference. | Unique certificate fingerprint; stable identity per certificate; renewal creates new row. Administrative enabled/disabled is separate from observed certificate valid/revoked/expired/unknown with checkedAt. Never store token private key, PIN, PUK or P12 in this table. |
| `SigningCredentialGrant` | credentialId, userId, allowed action, document-family scope, authorizer, authority/mandate reference, startsAt/expiresAt/revokedAt. | Per-credential authorization in addition to RBAC. Own-person credential cannot be delegated. Organization grants require verified mandate; permission assignment alone is insufficient. Preserve revoked grants. |
| `SigningRequest` | documentId, sourceVersionId, sourceSha256, sourceSnapshotSha256, requestedBy, intended signerUserId or organizationId, credentialId/fingerprint, kind, method/provider, prepared artifact key/hash/size, ByteRange digest/slot spec, appearance/template anchor hash, policy version, nonceHash, idempotencyKey, expiresAt, state, provider reference, terminal reason. | Source belongs to document; bound tuple immutable after preparation. Unique (actor,idempotencyKey); partial unique active request per source version in V1. One request has events and at most one accepted signature. Retry terminal failure through a new request, not editing approved binding. |
| `DocumentSigningApproval` | requestId unique, approverUserId, exact binding hash, approvedAt, confirmation text/policy version, optional withdrawnAt as an appended withdrawal event. | Approval belongs to this request/payload, never inherited by regeneration. V1 permits self-approval with approve+sign/seal permissions. Persist confirmation before invoking credential operation. |
| `DocumentSignature` | requestId unique, documentId, sourceVersionId, signedOutputVersionId unique, kind PERSON_SIGNATURE/ORGANIZATION_SEAL, signerUserId or organizationId, performedByUserId, credentialId, immutable certificate/subject/issuer/organization snapshot, sourceSha256, signedFileSha256, provider/method/reference, claimedSigningTime, receivedAt, trustedTimestampTime nullable, acceptanceValidationId. | Person signer equals credential's verified owner; seal organization equals verified credential organization and request issuer; always preserve human operator for seal. Exactly one identity kind. Input/output differ and belong to same logical Document; FKs RESTRICT. Immutable accepted evidence; no boolean signed column on business source. |
| `SignatureValidation` | signature or pending request reference, input/output/evidence hashes, validator/version, policy/trust-store version, checkedAt, crypto/chain/revocation/timestamp/source-binding results, overall VALID/INVALID/INDETERMINATE, assurance assessed, bounded reason codes, protected raw report reference. | One request/signature can have many historical validations; immutable reports. Initially acceptance requires VALID under configured policy. Later checks append results; do not rewrite acceptance facts. No timestamp is not a trusted signing time. |
| `SigningEvidence` | request/signature reference; type CERTIFICATE_CHAIN/CRL/OCSP/TIMESTAMP/VALIDATION_REPORT; protected storage object locator, SHA-256, size, MIME, capturedAt, evidence validity interval and retention class. | Protected immutable objects; no cryptographic private keys. Restrict audit access; validate/store only bounded allowlisted evidence. |
| `SigningEvent` | requestId, sequence, action, actor, occurredAt, safe reason, evidence correlation, minimal request metadata. | Unique (requestId,sequence); append-only request/approval/dispatch/cancel/expiry/reject/accept trail. No raw document, PIN, credential secrets or unbounded provider error. Existing AuditLog receives corresponding safe events. |
| Existing `DocumentVersion` extension | New source SIGNED plus derivedFromVersionId and signature relationship; signed version retains PDF family, full checksum and size. | Original GENERATED version keeps provenance. Resolve its template/source provenance by lineage, not invented generation fields. Additive future constraint branch for SIGNED requires lineage/checksum/PDF; must not relax existing GENERATED checks. Prevent content/lineage updates or deletion once referenced by approval/signature, with database protections and restricted storage writes. |

Use database checks for owner/kind XOR, nonempty SHA-256 shape, positive sizes and self-lineage prohibition; composite foreign keys (documentId,versionId) for same-document relationships; unique request/output acceptance; indexes on sourceVersionId, organizationId, credentialId, actor/state/expiry and signature/validation date. Cross-row credential-kind, grant and certificate matching also need transactional service validation. Preserve identity through RESTRICT archival rather than nullable evidence identities.

Prepared payload is a protected immutable request artifact, not a second authoritative business record. It is linked and hashed in approval and evidence. Signed output becomes the next normal DocumentVersion. Ordinary upload cannot populate SIGNED or signature/evidence records.

## 6. Permissions and approval

Proposed codes (not seeded here): `financial_documents:approve_signing`, `financial_documents:sign`, `financial_documents:seal`, `financial_documents:view_signature_audit`, `signing_credentials:manage`.

| Existing role | Approve | Sign | Seal | Signature audit | Manage credentials/grants |
| --- | --- | --- | --- | --- | --- |
| SUPER_ADMIN | Yes | Yes | Yes | Yes | Yes |
| ADMIN | No | No | No | Yes | Yes |
| FINANCE_MANAGER | Yes | Yes | Yes | Yes | No |
| HR_MANAGER, MANAGER, TEAM_LEADER, EMPLOYEE, GUEST, CLIENT_USER | No | No | No | No | No |

This is a proposed explicit default matrix for review. SUPER_ADMIN's existing all-catalog seed behavior remains compatible, **but no role, including SUPER_ADMIN, bypasses credential identity, organizational mandate, local token authentication or document scope**. Credential management can register/disable metadata and administer approved grants; it cannot copy keys, silently sign, self-assert a legal mandate, or change trusted root/policy bundles. Root/policy configuration requires a separately reviewed operational release.

Sign/seal also requires active internal account, documents:view + documents:download, source view, commercial_data:access, clients:view, existing contextual scope, active matching credential/grant and exact approval. documents:generate is needed only for generation. Approve additionally requires the source-specific manage permission so read-only document access cannot authorize an official output. Own-person credential visibility is a narrow read of metadata needed to sign, not a grant to administer credentials.

Keep R-050 unchanged: FINANCE_MANAGER lacks missions:view; signing does not open mission-linked financial records or grant recruitment visibility. Audit permission never grants document access by itself. Ordinary authorized document viewers get a minimal per-version status; full subject identifiers, certificate chain and provider/audit detail require audit permission. Revocation/suspension is rechecked at completion and interrupts pending workflows.

## 7. State and validation semantics

Request: PREPARED → APPROVED → AWAITING_RESULT → VALIDATING → COMPLETED. CANCELLED, EXPIRED, FAILED, REJECTED and STALE are terminal alternatives. VALIDATING may await retryable validation infrastructure recovery only until request expiry; no automatic re-sign or repeated PIN prompt. Bound provider idempotency protects timeout/retry; ambiguous outcomes remain unresolved until reconciled, never inferred successful.

Acceptance requires cryptographic validity, exact source/payload binding, correct identity/kind, current business authorization, and a policy-valid certificate path/revocation result. UNKNOWN/INDETERMINATE never displays SIGNED/SEALED. A provider callback is evidence intake, not acceptance.

Separate claimed signing time, server receipt time and validated trusted timestamp time. Without valid trusted time, do not claim proven historical signing-time validity; a future policy may permit a clearly labelled currently validated certificate signature, but the recommended initial production policy requires a trusted timestamp. Expired/revoked certificates reject new signing. Historical verification considers evidence and revocation timing under the retained policy, not merely today's certificate expiration.

UI state is per-version: UNSIGNED, pending state, SIGNED/SEALED with validation summary, or validation problem. Business and payment states are untouched. Show latest validation alongside original acceptance where they differ.

## 8. Local versus server responsibilities

| Surface | Responsibility |
| --- | --- |
| Browser | Select authorized existing version; display exact protected preview, actor/entity/method and confirmation; request status/cancel/download. No PIN fields, key extraction or trust decisions. Clear stale state on principal/token/version changes. |
| Authorized workstation / middleware | Detect supported token, select expected public certificate, recompute prepared payload binding, show trusted confirmation and handle PIN locally, invoke hardware cryptography, return evidence. Key never leaves token. Do not auto-retry wrong PIN; cleanup protected temporary files. |
| Optional custom agent | Only after provider gate: code-signed installer/update, least privilege, fixed operation set, origin-bound session pairing, short-lived one-use capability, local confirmation. Prefer supported native messaging over an unauthenticated loopback server. No arbitrary file paths, URLs, shell commands or general signing oracle. |
| Hire-Me server | Authorization/approval, hashes, immutable payloads, short-lived request capabilities, independent validation, safe publication, history, access-controlled downloads and audit; bounded reconciliation. |
| Provider | Certificate issuance/revocation, token middleware support and contracted timestamp/remote services. No assumption that buying a USB token includes a remote signing API. |
| Server timestamp adapter, if contracted | RFC 3161 request/response handling and independent validation; mTLS interconnection credential in dedicated secret manager with rotation/access controls, **not** in SigningCredential/DB or a token-key extraction flow. Exact custody/configuration confirmed before deployment. |

## 9. Threat model

Assets: exact financial bytes, signer/legal-entity identity, private keys/PINs, permissions/mandates, approval, immutable evidence and confidential commercial data. Boundaries: browser↔API, browser↔native middleware, workstation↔token, API↔provider/validator, API↔DB/private storage. Attackers include unauthorized users, compromised sessions/workstations, malicious PDFs/bridges and privileged storage operators.

| Threat | Required control and residual risk |
| --- | --- |
| Preview substitution / stale business fields | Exact version+source+prepared hashes, persisted explicit approval, fixed anchor, current source comparison and transaction recheck. A compromised browser/workstation can still misrepresent the preview; local trusted confirmation reduces but cannot eliminate that risk. |
| Replay / duplicate callbacks / timeout races | One-use nonce, expiry, actor/credential binding, request state CAS/locks, unique accepted output, provider transaction binding; reject mismatched replay, return same safe result for an identical accepted retry. |
| Valid signature on a different or altered PDF | Independent CMS/PDF validation, complete ByteRange and exact prepared-byte comparison, no trailing revision; reject shadow-content, changed page objects and text-only equivalence. |
| Certificate substitution / personal certificate used as company seal | Verified enrollment binding, expected fingerprint and certificate policy/kind validation, organization mandate + operator grant. Display labels are never evidence. |
| IDOR / cross-client or mission access | Shared current document/source policy on every endpoint and artifact; no public storage URL; same hidden/not-found envelope; audit permission adds no source access. |
| Privilege loss during long PIN operation | Recheck active actor, roles, approval, credential grant and issuer status at acceptance with transactional fencing. Cancellation does not undo a signature already created outside Hire-Me. |
| Local bridge abuse / DNS rebinding / CSRF | Exact origin and host checks, pairing, one-use scoped capability, local confirmation, no wildcard CORS or arbitrary path/URL/sign commands. Long-lived app bearer token must not be passed to the agent. |
| PIN/key disclosure / token lockout | Local provider-controlled PIN, no server PIN contract, no secret logging/crash dump collection; no automatic PIN retries. Lost token/compromised workstation invokes provider revocation and grant disablement. |
| Malicious signed upload / parser exploitation | Strict transport and decompressed-content limits, quarantine, patched isolated validator with CPU/memory/time limits and no arbitrary egress. Signature validity does not make a PDF safe. Scanner must reject/quarantine rather than rewrite signed bytes. |
| Revocation/AIA/TSA SSRF or outage | Allowlisted destinations, no internal-address/redirect escape, bounded fetch/cache, signed fresh CRL/OCSP validation and policy-versioned trust roots; outage → indeterminate, never success. |
| Storage/DB tampering or orphaned output | Rehash before signing/download; immutable object publication, atomic DB evidence commit, narrow compensation and reconciler. Hashes in the same mutable DB do not defeat privileged tampering: production needs separately protected evidence/backup manifests, retention controls and restore verification. |
| Audit leak or repudiation | Minimal events, protected certificate/evidence details, identity snapshot, explicit consent and timestamp evidence. Logging success without cryptographic proof is prohibited; audit storage alone is not a qualified archival service. |

## 10. Recommended implementation phases / PR split

| Phase / PR | Scope and exit gate |
| --- | --- |
| 0 — this documentation PR | Audit, proposal, provider evidence, questions, risks and handoff only. Maintainer reviews permission defaults, issuer identity, eligibility, approval, stale policy, timestamp requirement and one-operation V1. No migration or production code. |
| 1 — provider-neutral persistence and authorization | Additive reviewed schema, issuer/credential metadata and grants, approval/request/events, lifecycle, API contracts and safe summaries. No real adapter and no successful production signing through a test double. Validate new constraints and historical GENERATED compatibility on disposable DB. |
| 2 — immutable preparation, verification and publication | Select/test PDF engine and independent validator; implement exact binding, checksum-on-read, protected evidence, SIGNED lineage, stale/race/compensation handling. Synthetic certificates and fixtures only. Disabled in production until end-to-end gates pass. |
| 3 — provider feasibility evidence | Obtain Barid integration pack and approved test token; demonstrate exact middleware interface, PIN cancellation, supported certificate kinds and PDF interoperability; timestamp mTLS onboarding and revocation fixtures. Capture sanitized proof, not secrets. May run alongside phases 1–2; blocks phase 4. |
| 4 — Barid adapter / optional native agent | Separate narrowly reviewed adapter PR; separate agent repository/package/release if necessary. No native middleware added to the pure document renderer. Complete token/workstation and timestamp tests before enablement. |
| 5 — Commercial and Documents UX | Durable version discovery, exact preview/confirmation, independent signature/business state, per-version audit, EN/FR, permission-aware controls and failure recovery. Can develop against disabled synthetic adapter; no fake production success. |
| 6 — controlled pilot and operations | Trust policy approval, credential/mandate enrollment, signed-output validation by an independent tool, retention/restore drill, key-loss/revocation procedure, packaging/SBOM/update policy and feature flag. Deployment requires its own authorization. |

Future tests: exact version/hash/payload binding; regenerated/ordinary-uploaded current version unsigned; source changes without regeneration; both language/family separation; concurrent regeneration/cancel/revoke/complete; duplicate and stale replay; certificate/person/seal mismatch; no private-key/PIN persistence; expiry/revocation/unknown chain; wrong timestamp imprint/nonce/untrusted time; PDF alteration/ByteRange/trailing revision; permission matrix and R-050 denial; storage/DB partial failures; protected downloads/audit; PIN cancellation and token removal; EN/FR session/version safety. Extend existing generation/document tests without changing their accepted behavior. Use D-071 disposable databases and preserve seeded permission and grant identities.

No test certificate private keys or provider secrets from production in CI. Clearly labelled synthetic private keys used solely for deterministic tests are not production credentials. Public Barid test certificates alone cannot exercise hardware signing.

## 11. Provider blockers and questions

Obtain written answers / current technical pack from Barid's integration team; no message was sent in this task.

1. Which exact certificate product is held/ordered: qualified natural-person signature, qualified legal-person seal or advanced signature? Supply sanitized public certificate, service policy and relevant key-use/QC statements; confirm legal authority/mandate handling.
2. Exact token model, firmware, SAC version and supported Windows/macOS configurations? PKCS#11 library or CSP/KSP provider names, bitness, algorithm/mechanism support, PIN UI behavior, licensing and redistribution rights?
3. Is an official SDK/CLI/native messaging or localhost bridge available? Supply API contract, origin/session controls, cancellation semantics, errors, maintenance lifecycle and a sample. Is third-party development supported?
4. Is there a remote signing/sealing API distinct from TSA? If yes, specify authorization/consent, key custody, transaction idempotency, callback authentication, data residency and supported certificate types.
5. Can the supported stack sign our prepared ByteRange/CMS payload without rewriting business content? Which PAdES profiles and algorithms are guaranteed? Supply representative valid/tampered/revoked/expired/timestamped fixtures and verifier results. Is a legal-person seal supported on the same token mechanism?
6. For the documented qualified TSA endpoint: confirm test endpoint, mTLS certificate issuance/custody, subscription, quota, SLA, current policy, size limits, certificate rollover and integration example. Confirm profile needed for PAdES T/LT/LTA.
7. Which trust bundles, current certificate policies, revocation endpoints/OCSP behavior and freshness rules apply to these exact products? What historical validation evidence must be retained, and are qualified validation/conservation services available separately?
8. Test token or signing sandbox, support contact and integration acceptance criteria? Public certificate samples are useful for parsing but insufficient for a signing proof.

Planning can proceed using the neutral boundaries. Provider selection, legal-assurance labels, automatic signing/sealing and native-agent implementation remain gated. No claim that Hire-Me is a trust-service provider or supplies qualified validation/conservation.

## 12. Verification and handoff (this PR pass)

**Code re-audit pinned to `bcf4b424dc2cce9c5280cb64db5254bd98bdb477`:** `schema.prisma` (`Document`, `DocumentVersion`), `document-generation.service.ts` (render → storage → transactional publish, `sourceSnapshotSha256`, shared locks), `documents.service.ts` (scope, upload version, download without checksum re-verify on read), `protected-storage.service.ts`, `CommercialGeneration.tsx`, `documents/*` workspace, `document-generation-permissions.ts`, Finance Manager permission catalog, generation integration tests (including post–#140 audit redaction pattern).

**Skills used:** project-memory, product-architecture, prisma-postgresql, application-security, quality-gates.

**This PR:** documentation/preflight only — no migrations, runtime code, libraries, or provider configuration. `docs/project/DECISIONS.md` unchanged (no new accepted decision). Issue **#132 stays open**. PR **#134** remains draft/unmerged.

**Provider research:** DGSSI/Barid public sources re-verified 2026-10-06; gaps labelled CONFIRMED / REASONABLE ASSUMPTION / REQUIRES PROVIDER CONFIRMATION in §4.

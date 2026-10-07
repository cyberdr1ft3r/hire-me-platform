# Issue #141 — Phase A implementation preflight

Date: 2026-10-06. Base: `main` @ `29101c21366bc550f83c2a5c120fcf25d57fb039`.

## Confirmed current architecture (pre-implementation audit)

| Area | Finding |
| --- | --- |
| `Document` / `DocumentVersion` | GENERATED versions require full provenance (`DocumentVersion_generation_provenance_consistent`); `checksumSha256` is file bytes; `sourceSnapshotSha256` is business snapshot fingerprint. |
| Authorization | `DocumentsService.assertDocumentAccess` + `assertGeneratedSourceScope` enforce source/domain scope (commercial, training, missions R-050). |
| Permissions | Seeded catalog via `seed.ts`; `FINANCE_MANAGER` matrix in `packages/contracts/src/finance-manager-role.ts`; D-071 disposable DB rules. |
| Audit | `AuditLog.metadataSummary` bounded; PR #140 pattern avoids full-row secret scans. |
| Integration tests | `test/support/permission-fixtures.ts`, catalog snapshot gate, normal + reverse suite order. |

## Binding semantics (Phase A)

- **`sourceSha256`:** checksum of the exact stored PDF bytes on the bound `DocumentVersion`.
- **`sourceSnapshotSha256`:** fingerprint of the authoritative rendered business source at preparation time; reconciliation recomputes the **current** source fingerprint (shared with document generation) and marks the request `STALE` when business data changes without regeneration.

## Reconciliation authority (PR #142 review)

Request validity is evaluated against the **bound signing authority** (intended signer for person signatures; `requestedByUserId` seal operator for organization seals), not the actor who reads the request. View access remains gated by normal document authorization.

Lifecycle transitions commit `SigningRequest` state and append-only `SigningEvent` rows in the same transaction, with row-level locking on the request for sequence allocation.

## Phase A schema/API surface (implemented on branch)

- **Persistence:** `SigningOrganization`, `SigningCredential`, `SigningCredentialGrant`, `SigningRequest`, `DocumentSigningApproval`, `SigningEvent`.
- **API:** credential/org admin, create/read/approve/cancel signing request, audit read.
- **Deferred:** `DocumentSignature`, SIGNED publication, crypto validation, provider adapters, UX (Phase B–E).

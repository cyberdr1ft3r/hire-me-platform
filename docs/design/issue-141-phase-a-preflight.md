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

## Phase A schema/API surface (implemented on branch)

- **Persistence:** `SigningOrganization`, `SigningCredential`, `SigningCredentialGrant`, `SigningRequest`, `DocumentSigningApproval`, `SigningEvent`.
- **API:** credential/org admin, create/read/approve/cancel signing request, audit read.
- **Deferred:** `DocumentSignature`, SIGNED publication, crypto validation, provider adapters, UX (Phase B–E).

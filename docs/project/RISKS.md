# Risk Register

Last updated: 2026-07-21

| ID | Risk | Impact | Current mitigation | State |
| --- | --- | --- | --- | --- |
| R-001 | Product scope grows faster than delivery capacity. | Delays, unstable architecture, incomplete modules. | Use scoped issues, roadmap phases, explicit non-goals, and dependency gates. | Active |
| R-002 | Broad permissions expose candidate, HR, salary, CV, client, document, or commercial data. | Confidentiality breach and loss of client trust. | Deny-by-default server authorization, record scopes, least privilege, audit logs, and security reviews. | Active |
| R-003 | Client requirements are simplified or misrepresented during architecture work. | Wrong workflows, missing entities, and expensive rework. | Treat questionnaire results and reviewed requirements as confirmed facts; use blocking PR reviews for mismatches. | Active |
| R-004 | Existing candidate and document imports contain duplicates, inconsistent data, or unsafe files. | Corrupted records, privacy exposure, failed migration. | Build staged import, duplicate detection, validation reports, administrator approval, and protected file handling. | Planned mitigation |
| R-005 | External integrations depend on unavailable APIs, licenses, tenant permissions, or provider limitations. | Blocked functionality and schedule changes. | Implement adapters, verify provider access before coding, and keep core workflows functional without integrations. | Active |
| R-006 | File storage or download design exposes CVs and HR documents. | Serious confidentiality incident. | Protected storage keys, authorized download endpoints, no public URLs, audit downloads, and future malware scanning. | Active |
| R-007 | Workflow states become inconsistent across documentation, database enums, API logic, and UI. | Broken reporting and invalid business transitions. | Keep one vocabulary, shared contracts, explicit state machines, transition tests, and documentation reviews. | Active |
| R-008 | A single-developer implementation becomes too complex to maintain. | Slow delivery and fragile code. | Modular monolith, shared standards, automated quality gates, small tasks, and documented decisions. | Active |
| R-009 | Repository memory becomes stale or contradictory. | Codex and humans act on outdated assumptions. | Mandatory status and handoff updates, source-of-truth hierarchy, compact living documents, and PR review. | Active |
| R-010 | Real client data is accidentally committed to GitHub. | Permanent data exposure through Git history. | Explicit repository rules, sanitized fixtures only, `.gitignore`, secret scanning, and review of imports and attachments. | Active |
| R-011 | Physical database constraints diverge from the approved domain model as implementation begins. | Broken workflows, missing history, and difficult migrations. | Review Prisma schema against `docs/domain-model.md`, run relational integration tests, and document implementation deviations in the domain model. | Active |
| R-012 | Prisma leaks across monorepo package boundaries or generated client state depends on pnpm `node_modules` layout. | Frontend/contracts become coupled to server persistence and builds become non-deterministic. | API-owned explicit generated output, ignored generated files, `pnpm check:architecture`, and CI clean-regeneration checks before typecheck, tests, and build. | Active |

## Risk protocol

- Update the register when likelihood, impact, mitigation, or ownership materially changes.
- Add newly discovered risks before beginning work that depends on them.
- Link implementation issues for concrete mitigations when they are created.
- Remove a risk only when it is no longer relevant; otherwise mark it mitigated or accepted.
- Never include confidential evidence or live personal data in the register.

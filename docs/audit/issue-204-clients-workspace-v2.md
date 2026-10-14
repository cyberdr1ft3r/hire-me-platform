# Issue #204 — Clients Workspace v2.0 evidence

Date: 2026-10-14. Base `main` `4890f9b` (#206 Missions v2.0 merged). Frontend only:
no API, contract, schema, or permission change. Reuses the Entity Workspace v2.0
interaction model from Candidates (#205) and Missions (#206).

## What changed

| Area | Change |
| --- | --- |
| `ClientDirectory.tsx` (replaces `ClientList.tsx`) | Full-width table: client, status, industry, location, phone, updated. Row opens quick preview only (no detail read). |
| `ClientQuickPreview.tsx` | List-row data only; **no commercial summary** in preview. Side pane or bottom sheet. |
| `ClientFocusedRecord.tsx` | Overview (profile + lifecycle), Contacts, optional Missions tab (`missions:view`, first page via existing `listMissions` + `clientId`). Leave guard for unsaved forms. |
| `ClientsWorkspace.tsx` | Directory + preview + record; creation drawer unchanged. |
| `ClientsPanel.tsx` | Preview state; record open/close with URL `/clients?client=<id>`; detail and contacts load only when the record opens. |
| `ClientFilters.tsx` | Compact toolbar: search inline; status and industry in Filters disclosure. |
| `App.tsx` / `record-deep-links.ts` | `clientDeepLink`, `recordIntent.clientId`. |

## Build size (exact PR head, local `pnpm --filter @hire-me/web build`)

| Asset | Gzip |
| --- | --- |
| `index-*.js` | 318.24 KB |
| `index-*.css` | 20.76 KB |

No lazy route split (same as pre-change Clients on this bundle).

## Validation (local)

- `pnpm exec turbo run lint typecheck test --filter=@hire-me/web` (after plural-path pin update)
- `ClientsPanel.test.tsx`: preview does not call `GET /v1/clients/:id`; record flow via Open full record; back navigation with leave guard

## Security

- Preview never renders `commercialSummary` or other commercial fields from list rows (commercial on record still gated by `commercial_data:access`).
- Record reads and writes unchanged; server authorization unchanged.
- Missions tab uses the same scoped `listMissions` API as elsewhere.

## Known limitations

- Missions tab shows the first page only; no new cross-module aggregate APIs.
- Figma-only fields without list/record data remain omitted.

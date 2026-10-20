# Issue #232 — Console Workspace Tabs evidence

The reproducible browser harness is `scripts/issue-232-console-tabs-browser-evidence.mjs`.
It uses installed Google Chrome 155.0.8059.85 with synthetic task data and no production
credentials. Its current `report.json` records eight passing EN/FR viewport scenarios:

- Desktop at 1440px and the 900px desktop breakpoint.
- Touch-enabled tablet at 768px and mobile at 390px.
- Desktop arrow-key activation and browser Back restoration of the RV1 active-tab identity.
- Mobile touch activation through the accessible workspace-list dialog.
- No horizontal document overflow or uncaught page errors in the passing runs.

PNG evidence is captured for the desktop tab strip and mobile/tablet tab-list dialog in both
locales. `report.json` contains exact viewport and overflow results.

## Architecture / implementation note

D-089/RV1/RV2 remain the contract: the existing router and `navigation-guard.ts` remain the only
history authority; existing record URLs remain unchanged; tab descriptors live only in React
session state; permission checks are not delegated to history; only the active route module is
mounted; there is no response cache, hidden Activity tree, or tab persistence. Clean-session
record URLs create a canonical record descriptor from validated URL intent. Back/Forward restores
only a compatible open descriptor from the current console instance, then a canonical open record
tab, then URL-only fallback.

An App-level review found that a route change through one shared Suspense boundary could keep the
previous module's DOM hidden while the next lazy chunk resolved. The boundary is now keyed by the
active route, so changing routes unmounts the old module immediately; the App regression asserts
the prior workspace heading is absent. Local React tests additionally cover direct Candidate and
Mission record URLs, Back/Forward, tab selection, dirty guards, and permissions.

## Verification notes

Direct local formatting, architecture, web lint, TypeScript, production bundle, focused React tests,
and Chrome checks are recorded in the PR. The full web suite was also exercised on Windows; the
last broad run before the record-link follow-up was affected by suite-load failures and the existing
literal-LF stylesheet assertion against CRLF checkout bytes. This is not being represented as a
green local full suite; exact-head GitHub Actions is the authoritative integration gate. The Vite
production build completes but reports its largest-chunk warning (934.44 kB minified,
244.28 kB gzip); no like-for-like baseline build was available in this workspace.

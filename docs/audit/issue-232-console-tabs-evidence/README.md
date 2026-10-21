# Issue #232 — Console Workspace Tabs evidence

The reproducible browser harness is `scripts/issue-232-console-tabs-browser-evidence.mjs`.
It uses installed Google Chrome 155.0.8059.85 with synthetic task data and no production
credentials. The original `report.json` records eight passing EN/FR viewport scenarios; the
visual-refinement run is under `refinement-after/report.json` and records 28 passing scenarios:

- Desktop at 1440px and the 900px desktop breakpoint.
- Touch-enabled tablet at 768px and mobile at 390px.
- Desktop arrow-key activation and browser Back restoration of the RV1 active-tab identity.
- Mobile touch activation through the accessible workspace-list dialog.
- No horizontal document overflow or uncaught page errors in the passing runs.

PNG evidence is captured for the desktop tab strip and mobile/tablet tab-list dialog in both
locales. The refinement run additionally covers Tasks, Clients, Documents, Commercial, and
Candidates on desktop and mobile in EN/FR. It reports zero horizontal overflow and zero uncaught
page errors. Matching pre-refinement desktop/mobile screenshots are in `refinement-before/`.

The panel refinement keeps the tab navigation and route surface independent: a tokenized neutral
canvas surrounds a white bordered surface (12px radius, 16px padding) on desktop. On mobile the
outer border/radius are removed to preserve usable width. The utility controls, sidebar, router,
active-only rendering, tab state, and route behavior are unchanged.

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
and Chrome checks are recorded in the PR. The full web suite was rerun with two workers: 83/84 files
and 1,110/1,111 tests passed. The sole failure is the pre-existing literal-LF stylesheet assertion
in `src/ui/foundation.test.tsx` against CRLF checkout bytes; focused AppShell tests pass 16/16. The
earlier default-parallel Windows run also timed out under suite load. Neither is represented as a
green local full suite; exact-head GitHub Actions is the integration gate.

The production build completes but reports the existing large-chunk warning (934.74 kB minified,
244.29 kB gzip); no like-for-like B2 baseline build was available. The requested native browser
200% zoom check remains outstanding: this environment's native-app UI bridge cannot reach the
headed Chrome window, and Playwright page-level keyboard events do not invoke Chrome's browser zoom
shortcut. The attempt did not change application state or browser preferences.

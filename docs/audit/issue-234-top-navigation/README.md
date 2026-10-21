# Issue #234 top-navigation browser evidence

Captured from the existing HireMe application in installed Google Chrome, using only a synthetic authenticated reviewer and synthetic API responses. The module pages and B2 workspace tabs are the merged application components; no module content is recreated for these screenshots.

| Screenshot | Viewport | Locale |
| --- | ---: | --- |
| [Reference desktop — English](reference-desktop-en.png) | 1117 × 707 | EN |
| [Reference desktop — French](reference-desktop-fr.png) | 1117 × 707 | FR |
| [Mobile — English](mobile-en.png) | 390 × 844 | EN |
| [Mobile — French](mobile-fr.png) | 390 × 844 | FR |

The browser script also checks the primary navigation order, permission-filtered More destinations, More Escape/focus restoration, mobile drawer Escape/focus restoration, mobile Console-tab row sizing, page errors, and horizontal overflow. Results: zero horizontal overflow at all four screenshots and at a 559 × 354 CSS viewport (200%-zoom equivalent); no page errors; mobile tab row remains at or below 64px.

Run from the repository root with `node scripts/issue-234-top-navigation-evidence.mjs`. The script launches the installed Chrome binary and writes updated evidence to this directory.

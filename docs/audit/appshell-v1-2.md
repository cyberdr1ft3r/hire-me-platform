# AppShell v1.2 review evidence

Follow-up to [PR #194](https://github.com/cyberdr1ft3r/hire-me-platform/pull/194),
implemented on `feat/appshell-v1-2` in [draft PR #195](https://github.com/cyberdr1ft3r/hire-me-platform/pull/195).
The comparison base is #194 head `ffc7fa2`; original main is `283c18a`.
No main changes or overlapping PR other than #194 were found at initial inspection.

## Implementation

See the [proposed UI-DNA v1.2 addendum](../design/HIREME_UI_DNA_v1.2-navigation-proposed.md)
for exact domain mapping, state, accessibility and review boundaries.
The change touches only shell presentation, shared layout tokens, bilingual shell
copy, tests and documentation. No routes, RBAC, data sources, schemas or backend
behavior are changed. PR #194's source commits are ancestors and remain intact.

## Browser verification

[Representative screenshots and machine-readable results](appshell-v1-2/README.md).
The full review package includes every screenshot.

| Viewport | Workspaces/locales checked | Actual panel gain on collapse | Horizontal overflow |
| --- | --- | --- | --- |
| 1440px | 4 × EN/FR | 176px in every case | None |
| 1024px | 4 × EN/FR | 176px in every case | None |
| 768px | 4 × EN/FR | Overlay drawer; no persistent sidebar | None |
| 390px | 4 × EN/FR | Overlay drawer; no persistent sidebar | None |

Workspaces: Messages, Candidates, Commercial and Administration. Browser contexts
use synthetic intercepted API responses and populated records. Before screenshots
use #194, not main. Desktop captures include expanded and collapsed navigation;
tablet/mobile captures include the page and open drawer.

Additional real-browser keyboard checks pass in both languages at all four widths:
44px rail/mobile targets, named icon controls, focus-visible tooltips, Escape
dismissal, keyboard account opening/closing, 390px-high rail reachability, drawer
footer reachability, forward/reverse focus wrap, Escape focus restoration and body
scroll restoration. Existing App tests retain route/back/forward, auth, notification
and permission regression assertions.

## Checks

- Frontend TypeScript and production build pass using the existing installed
  binaries. Existing bundle-size advisory remains.
- ESLint passes with the existing unused directive warning in ClientsPanel tests.
- Semantic CSS, contrast and Prisma architecture-boundary checks pass.
- Local full web suite: 898 passed, one static CSS assertion failed because the
  Windows worktree had CRLF in an unchanged file. Normalizing that working copy to
  LF produced a passing 12-test foundation rerun, with no tracked stylesheet or
  test relaxation. All 899 test cases are covered by the suite and rerun.
- Fresh Linux install, full root quality checks, native signing and database
  integration results are authoritative in the PR's exact-head CI. Check them
  before approval; the handoff report records the final run.

The worktree reuses #194's locked dependencies via local junctions; no package or
lockfile change. No local production database, merge or deployment was performed.

## Remaining review and risks

- Human visual approval: domain grouping, icon clarity, account disclosure and
  navigation proportions. The v1.2 addendum remains **Proposed**.
- Stacked dependency: review/merge #194 first, then retarget/rebase #195 and rerun
  exact-head CI if its effective source changes. Do not merge automatically.
- Physical devices and screen readers are not fully audited; browser focus,
  target and contrast evidence is not a blanket WCAG conformance claim.
- Administration retains its existing English-content boundary in a French shell.
- Existing bundle-size warning and unrelated operational/retention/provider gates
  remain unchanged. Figma-only global search and unsupported preview/notification
  controls were intentionally not invented.

Engineering assessment: **8/10, staging ready subject to green exact-head CI and
human review**. Shared shell styles affect every workspace; the centralized width
token avoids module-specific fixes, while full regression tests and the four-module
matrix provide bounded evidence.

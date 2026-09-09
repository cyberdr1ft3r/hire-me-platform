# Current Agent Handoff

Last updated: 2026-09-09

## Current situation

- Authoritative `main` remains `e2879b38c54dcc1b42b85aa345680260487454dc`.
- Issue #52 and draft PR #53 remain open on `design/ui-ux-v1`; do not merge or deploy them.
- The maintainer approved the Phase 1 UI-DNA foundation on 2026-09-09 and authorized Task 2.
- Task 2 implements the authenticated internal AppShell and PageHeader only. Candidate, Recruitment/Reporting, and Public Opportunity representative redesigns have not started.
- The bounded visual correction uses one aligned `56.25rem`/900px JS and CSS threshold: 1024px stays persistent and 900px and below use off-canvas navigation. Button labels remain intact while PageHeader actions wrap as a group, and border-box sidebar sizing keeps the scrollable navigation plus fixed session footer inside the viewport.

## Review target

Run from the repository root:

```text
pnpm --filter @hire-me/web dev
```

Open `http://127.0.0.1:5173/app-shell.html` and review:

- desktop/laptop sidebar hierarchy, density, active destination, content width, and persistent session chrome;
- permission filtering, including removal of empty groups and a generic denial for direct unauthorized routes;
- tablet/mobile off-canvas navigation, scrim, close button, action wrapping, and absence of horizontal overflow;
- intact PageHeader button labels and reachable refresh/sign-out actions at desktop, short laptop, tablet, and mobile heights;
- keyboard skip link, focus order, route-change focus, Escape close, focus containment, and trigger focus restoration;
- compact text-plus-dot API health and safe display-name/email identity presentation.

The preview is synthetic and API-free. For an authenticated integration smoke check, use the documented local-only development credentials from the current task environment; never record that passphrase in Git.

## Completion conditions

- Local quality gates and exact-head GitHub Actions are green.
- `app-shell.html` and `design-system.html` are absent from the normal production build output.
- PR #53 remains draft, open, and unmerged.
- Maintainer grants explicit AppShell visual approval or requests another bounded correction.

## Explicit hard stop

Do not begin the Recruitment/Reporting representative surface until AppShell visual approval. Do not begin Candidate workspace, Public Opportunity redesign, broader module redesigns, migration, deployment, or merge work.

## Resume checklist

- Read `AGENTS.md`, Issue #52, PR #53 review history, and the project-memory files.
- Fetch `origin`; verify `main`, branch head, draft PR state, and exact-head CI.
- Keep any requested correction inside the AppShell/PageHeader boundary.

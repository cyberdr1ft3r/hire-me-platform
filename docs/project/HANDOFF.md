# Current Agent Handoff

Last updated: 2026-09-09

## Current situation

- Authoritative `main` is `a0236fe66936891d8235236c924e652c8067ab13`, the PR #53 merge commit for Issue #52 Tasks 1–2 (UI-DNA, foundation components, internal `AppShell`, `PageHeader`).
- Issue #52 remains open for its later representative-surface checkpoints. PR #53 is merged and closed.
- Issue #54 and draft PR #55 are open on `feat/web-i18n-en-fr`. Do not merge or deploy them.
- Issue #54 adds the English/French localization foundation only. It is deliberately sequenced before the Reporting redesign so Reporting is bilingual from its first commit.
- No database change was made: there is no `preferredLocale` column and no migration.
- Legacy business modules and the public opportunity pages stay English on purpose. They migrate when each is redesigned.

## Review target

Run from the repository root:

```text
pnpm --filter @hire-me/web dev
```

Open `http://127.0.0.1:5173/app-shell.html` and review:

- the language control in the shell session region: native `<select>`, labelled `Language`/`Langue`, each language named in its own language, no flags, keyboard reachable, focus visible;
- switching English to French and back with no page reload, no route change, no API call, and no permission change;
- French navigation groups and destinations, including `Vue d’ensemble`, `Tâches`, `Comptabilité`, `Gestion commerciale`, and `Administration`;
- French session chrome, including `Actualiser le profil` and `Se déconnecter`;
- `Intl` output in the preview metadata: number, date-time, `MAD`, and `EUR` in both locales;
- `document.documentElement.lang` following the active locale while `dir` stays untouched;
- 390, 430, 800, 1024, and 1440 px in French: no clipping, no horizontal shell overflow, session controls reachable, `<= 900px` off-canvas and `> 900px` persistent unchanged;
- the mobile drawer keeping the language control reachable without consuming excessive vertical space.

The preview is synthetic and API-free. The login screen at `http://127.0.0.1:5173/` is also localized and can be reviewed without a running API.

## Completion conditions

- Local quality gates and exact-head GitHub Actions are green.
- The web dependency set is still React, ReactDOM, Vite, and `@hire-me/contracts`; no i18n framework was added.
- A missing or misspelled translation key still fails `pnpm typecheck`.
- PR #55 remains draft, open, and unmerged.
- The maintainer accepts the localization foundation or requests a bounded correction.

## Explicit hard stop

Do not begin the Recruitment/Reporting representative surface until the localization foundation is accepted. Do not begin the Candidate workspace, the Public Opportunity redesign, a legacy-module translation sweep, a server-stored locale preference, Arabic or RTL work, migration, deployment, or merge work.

## Resume checklist

- Read `AGENTS.md`, Issue #54, PR #55 review history, and the project-memory files.
- Fetch `origin`; verify `main`, the branch head, the draft PR state, and exact-head CI.
- Keep any requested correction inside the localization boundary: `apps/web/src/i18n`, the shell and authentication surfaces it already translates, and the design/project documentation.

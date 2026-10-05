# Issue #118 — Missions IA browser evidence

## Status

**Automated:** `727` web tests pass (including Missions navigation, read-first profile, process deep-link → Pipeline tab, pagination/stale guards, App-level mission flows).

**Browser matrix:** Not captured in the cloud agent environment (`docker` unavailable; API/web stack not runnable). Use:

```bash
pnpm dev   # with Docker Compose PostgreSQL/API
pnpm exec tsx scripts/issue-116-evidence-setup.ts   # or equivalent rich mission fixture
node scripts/issue-118-missions-ia-evidence.mjs
```

Artifacts target: `/opt/cursor/artifacts/issue118-evidence/` (`metrics.json` + PNG per viewport/locale).

## Expected UX delta (design intent vs pre-#118 audit)

| Metric | Pre-#118 audit | Post-#118 (per-tab) |
| --- | --- | --- |
| Desktop detail scroll | ~3400px single column | One tab panel at a time; pipeline uses split list + sticky process detail |
| Mobile detail scroll | ~7500px | Same tab isolation; process remains under pipeline tab with #116 reveal/focus |
| Process placement | Detached block below public sections | Adjacent to pipeline source row (desktop) |
| List column dead space | Long detail scroll empties list | Detail height bounded by active tab |

## Manual verification checklist (when stack is up)

- [ ] 1440 / 1024 / 800 / 430 / 390 EN + FR
- [ ] No horizontal page overflow
- [ ] Pipeline tab: selected row + process detail visibly associated
- [ ] Deep link `?mission=&process=` opens Pipeline with process
- [ ] No raw UUIDs in UI

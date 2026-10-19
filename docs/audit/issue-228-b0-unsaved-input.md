# Issue #228 B0′ — unsaved-input guards for every module with forms

Date: 2026-10-20. Base `main` `cfe6be6`. First implementation step after the Phase A approval in
PR #229 (refinement **RV2**: protect genuinely unsaved input; ignore unchanged, saved and
search/filter forms; verify save/reset clearing and Back/reload). No console tabs, API, contract,
schema, permission or dependency change.

## What changed

| Area | Change |
| --- | --- |
| `navigation/use-record-leave-guard.ts` | Dirty = the person changed a control **and** the form's values differ from a baseline taken when editing began (`focusin`/`pointerdown`). Typing then restoring the value no longer asks. New `savedSignal` option: when it changes after the form's submit started a write, the form's current values become the new baseline (edit forms that stay open after saving). Failed writes keep the input unsaved. Forms marked `data-unsaved-guard="ignore"` are skipped like `role="search"`. A form inside a nested guard belongs to that guard. Existing `clearOnSubmit` / `failureSignal` behaviour (Missions) is kept. |
| `navigation/navigation-guard.ts` | The guard stack asks the most recent blocker that has something unsaved (a later blocker with nothing to protect no longer hides an earlier one), and after one surface's input is discarded, the next surface that still holds unsaved input asks too. Still one `popstate` authority. |
| `navigation/UnsavedInputScope.tsx` (new) | A `display: contents` boundary that applies the guard with the shared EN/FR prompt (`navigation.unsavedInputPrompt`). No layout, scroll-owner or focus-order change. |
| Tasks, Training, Commercial, Documents | Workspace wrapped in a scope with the module's existing `pending` and success/danger `feedback`. |
| Accounting | Expenses and Payments areas each wrapped with their own `feedback`. |
| Messages | Panel scope for the composer, message edit and new-conversation forms (each clears on success); Group details has its own nested scope for rename/add-member forms that stay open. |
| Administration | Scope plus form-write tracking for create/update/assign-role (still rethrows failures, as before). Its user search form is marked as a filter. |
| Tasks filters | Marked as a filter form (`data-unsaved-guard="ignore"`). |

Not changed: Candidates, Clients and Missions keep their existing record guards and gain only the
new dirty definition (one Candidates test now types a value that differs from the saved city and a
new test covers the reverted case). Form submission, validation, write locking and feedback are
unchanged in every module.

Known limits (pre-existing, recorded for later): switching areas inside Accounting, switching
conversations in Messages, or selecting another record inside a module is not navigation, so it is
not guarded. Sign-out does not ask (ending the session drops everything by design). A write that
ends with neither success nor failure feedback leaves the form counted as unsaved (it asks once more
rather than losing input).

## Tests

- New `navigation/UnsavedInputScope.test.tsx` (12 tests): unchanged, changed (localized prompt,
  proceed only on confirmation), reverted, search and ignored filter forms, reset, saved while open
  then edited again, failed write, a submit that started no write followed by an unrelated success,
  Back held only while dirty, `beforeunload` only while dirty, nested scope ownership, form removed.
- `navigation-guard.test.ts` +2: a later blocker with nothing unsaved is skipped; two surfaces with
  unsaved input both ask before an in-app navigation proceeds.
- Module tests: Tasks (2), Training (1), Documents (2, including saved-while-open and failed save),
  Commercial (1), Accounting (1), Messages (2, draft kept after a failed send and cleared once sent;
  group rename saved while details stay open), Administration (new file, profile saved while open),
  Candidates (+1 reverted case).

| Check | Result |
| --- | --- |
| `pnpm format:check`, `pnpm check:architecture` | pass |
| `pnpm --filter @hire-me/web lint` | pass (one pre-existing warning in `ClientsPanel.test.tsx`) |
| `pnpm --filter @hire-me/web typecheck`, production build | pass |
| Web tests (`vitest run`, 2 workers) | 1061/1062; the one failure is the known Windows-only CRLF assertion in `ui/foundation.test.tsx` (passes on Linux CI) |
| Entry JS (gzip -9) | 179,214 → 179,287 bytes (+73: the EN/FR prompt strings); the guard stays in a 3.6 KB lazy chunk |

## Browser evidence (installed Chrome, production build, local API, synthetic data)

Harness: [`tools/evidence.mjs`](./issue-228-b0-unsaved-input/tools/evidence.mjs) with
[`tools/seed.mjs`](./issue-228-b0-unsaved-input/tools/seed.mjs) against a throwaway PostgreSQL
container. Raw results: [`results.json`](./issue-228-b0-unsaved-input/results.json) — **17/17 pass**.
Native confirmation and `beforeunload` prompts are not part of page screenshots, so each step
records the prompt type and text, the URL afterwards and whether the typed value survived.

| Step | Prompt | Outcome |
| --- | --- | --- |
| Tasks: edit form focused, unchanged → shell link | none | navigated |
| Tasks: title changed → shell link, answer "stay" | confirm (EN) | stayed on `/tasks`, value kept |
| Tasks: title changed → browser Back, "stay" | confirm | stayed, value kept |
| Tasks: title changed → reload, "stay" | `beforeunload` | reload cancelled, value kept |
| Tasks: title typed back to the saved value → shell link | none | navigated |
| Tasks: after "Task updated." → shell link | none | navigated |
| Tasks: search filter typed → shell link | none | navigated |
| Admin: create form typed → Back, "stay" | confirm | stayed |
| Admin: after "User created." (form reset) → Back | none | navigated |
| Admin: profile changed → reload, "stay" | `beforeunload` | stayed |
| Admin: after "User updated." (form still open) → Back | none | navigated |
| Messages: unsent draft → Back, "stay" | confirm | stayed, draft kept |
| Messages: draft sent → Back | none | navigated |
| Tasks, FR, 1024px: title changed → Back | confirm (FR) | stayed |
| Tasks, 390px: title changed → Back, "stay" | confirm | stayed, value kept |
| Tasks, 390px: title changed → reload, "stay" | `beforeunload` | stayed |
| Tasks, 390px: title changed → Back, "discard" | confirm | left the page |

Layout neutrality: [`tools/layout-compare.mjs`](./issue-228-b0-unsaved-input/tools/layout-compare.mjs)
recorded the boxes of the first 400 elements in the workspace on Messages, Tasks, Training,
Commercial, Documents, Accounting and Administration at 1440×900 and 390×844 for a `main` build and
this branch on the same API: **identical on all 14 route/width pairs** (content height, horizontal
overflow and every box). The `display: contents` boundary changes no layout. Note for later
(pre-existing, not changed here): `.app-shell__content > .admin-panel` in `app-shell.css` has not
matched since the route boundary `div` arrived in #208.

Screenshots: `screenshots/desktop-en-tasks-dirty-kept.png`, `desktop-en-admin-profile-saved.png`,
`desktop-en-messages-draft-kept.png`, `tablet-fr-tasks-dirty-kept.png`,
`mobile-en-tasks-dirty-kept.png`. Video recording is supported by the harness (`VIDEO=1`) but needs
Playwright's ffmpeg build, which was not installed for this run; video is required from B2 onward.

Reproduce: throwaway DB + API on 3720 (`API_CORS_ORIGIN=http://localhost:5720`), web built with
`VITE_API_BASE_URL=http://localhost:3720` and served by `vite preview --port 5720`, `node seed.mjs`,
then `OUT=<this folder> node evidence.mjs > results.json` with `playwright-core` resolvable next to
the script.

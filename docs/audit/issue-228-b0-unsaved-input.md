# Issue #228 B0′ — unsaved-input guards for every module with forms

Date: 2026-10-20. Base `main` `cfe6be6`. First implementation step after the Phase A approval in
PR #229 (refinement **RV2**: protect genuinely unsaved input; ignore unchanged, saved and
search/filter forms; verify save/reset clearing and Back/reload). Hardened after the first review
of draft PR #230 (see "Review hardening"). No console tabs, API, contract, schema, permission or
dependency change.

## What changed

| Area | Change |
| --- | --- |
| `navigation/use-record-leave-guard.ts` | Dirty = the person changed a control **and** the form's values differ from a baseline taken when editing began (`focusin`/`pointerdown`). Typing then restoring the value no longer asks. Input stays unsaved until its write is confirmed: by `savedSignal` (success; forms that stay open), by `clearOnSubmit` (write ended without `failureSignal`; Missions), by a reset, or by the form closing. A save in flight no longer hides the question. Forms marked `data-unsaved-guard="ignore"` are skipped like `role="search"`; a form inside a nested guard belongs to that guard. |
| `navigation/navigation-guard.ts` | Asks the most recent blocker that has something unsaved, then each further blocker with unsaved input in turn. Confirmations are local to one navigation attempt and never unregister a blocker (see below). Still one `popstate` authority. |
| `navigation/UnsavedInputScope.tsx` (new) | A `display: contents` boundary that applies the guard with the shared EN/FR prompt (`navigation.unsavedInputPrompt`). No layout, scroll-owner or focus-order change. |
| Tasks, Training, Commercial, Documents | Workspace wrapped in a scope with the module's existing `pending` and success/danger `feedback`. |
| Accounting | Expenses and Payments areas each wrapped with their own `feedback`. |
| Messages | Panel scope for the composer, message edit and new-conversation forms (each clears on success); Group details has its own nested scope for rename/add-member forms that stay open. |
| Administration | One scope per form (create, profile, role) with its own tracked write, so each outcome is credited to the right form; failures still reject as before. The user search form is outside every scope. |
| Tasks filters | Marked as a filter form (`data-unsaved-guard="ignore"`). |

Candidates, Clients and Missions keep their existing record guards and gain the new rules. Form
submission, validation, write locking and feedback are unchanged in every module.

## Review hardening (PR #230 review, 2026-10-20)

### Multi-blocker confirmation flow

Before: confirming one surface called `release(blocker)` before the next surface asked. If the
person then cancelled the next question, the earlier dirty surface had lost its blocker for good and
a later navigation left without asking. Now each attempt keeps its own set of surfaces that agreed:

- in-app navigation (`requestNavigation`) asks in turn and proceeds only when every surface with
  unsaved input has agreed; an answer to an older attempt is ignored;
- Back/Forward: each answer replays the same traversal with its agreements; the next held surface
  asks after the replay lands; the final replay is applied once. Any traversal the guard did not
  replay itself starts a new attempt, and late answers to an abandoned traversal are ignored;
- blockers leave the stack only when their screen releases them (unmount, or nothing unsaved).

The four new multi-surface tests fail against the previous implementation and pass now.

### Signal audit (`writePending`, `savedSignal`, `failureSignal`)

| Case | Before | Now |
| --- | --- | --- |
| Leave while the form's own save is in flight | No question (pending suppressed it); if the save then failed after the screen was gone, the input was lost | Asks; the form stays unsaved until the write is confirmed |
| Another form in the same screen dirty while one form saves | No question for **any** form during the save | The other form keeps asking during and after the save |
| Submit refused because a write already holds the lock | Replaced the in-flight submission; the saving form was never confirmed (safe but wrong) | Ignored; the success is credited only to the form whose submit started the write |
| Submit that returns without starting a write, later unrelated success | Timer heuristic | First commit after the submit decides; a submit that changed nothing is dropped before the next task; never confirmed by a later write |
| Write starts and settles before React renders in between (fast responses) | Lost confirmation (form kept asking): the cause of the first CI failure in `AdminPanel.test.tsx` | Confirmed: the first commit after the submit carries the outcome |
| Input typed while the save is in flight | Became the saved baseline on success | Stays unsaved unless it equals what was saved |
| Write ends with neither success nor failure feedback | Treated as unknown | Keeps the input unsaved (asks once more rather than lose input) |
| `clearOnSubmit` (Missions): leave during save | Untracked from submit until a failure restored it; lost if the record unmounted first | Protected until the write ends without failure; failure keeps it unsaved |
| Screen unmounts | Guard released | Guard released; this only happens after the person agreed to leave, or when the session ends (sign-out, documented) |
| Several writes in parallel (Administration) | One shared counter could confirm the wrong form | One scope and tracked write per form |

Contract recorded in the hook: each scope's `writePending` is a single write lock (true for every
module using a scope; Administration now has one lock per form).

User-visible change: leaving a screen while its save is still running now asks (the same prompt).
Five Candidates tests that leave a record mid-save to check late-result scoping now answer "leave"
and assert that the question was asked.

Known limits (pre-existing, recorded for later): switching areas inside Accounting, switching
conversations in Messages, or selecting another record inside a module is not navigation, so it is
not guarded. Sign-out does not ask (ending the session drops everything by design). Several dirty
surfaces ask one native question each.

## Tests

- `navigation/UnsavedInputScope.test.tsx` (21): what counts as unsaved (unchanged, changed with the
  localized prompt, reverted, search/filter, reset, Back, `beforeunload`); writes (in flight then
  confirmed, failed then unrelated success, ended silently, submit without a write, instant write,
  typed during the save); simultaneous forms (other form dirty during/after a save, refused submit
  never credited, nested scope ownership, outer and nested asked in turn with partial cancel then
  retry); unmount (form removed, screen removed during a save); `clearOnSubmit` success and failure.
  Seven of these fail against the previous hook.
- `navigation-guard.test.ts` (20): the multi-surface suite: partial confirmation then cancellation
  keeps the earlier surface registered, a retry asks every surface again and completes only after all
  agree, a late answer to an abandoned attempt is ignored, Back held for each surface in turn with
  the earlier one kept after a cancel, Back completed after all agree and applied once.
- Module tests: Tasks (2), Training (1), Documents (2), Commercial (1), Accounting (1), Messages (2),
  Administration (1), Candidates (+1 reverted case; 5 mid-save tests answer the new question).

| Check (head after hardening) | Result |
| --- | --- |
| `pnpm format:check`, `pnpm check:architecture` | pass |
| `pnpm --filter @hire-me/web lint` | pass (one pre-existing warning in `ClientsPanel.test.tsx`) |
| `pnpm --filter @hire-me/web typecheck`, production build | pass |
| Web tests (`vitest run`, 2 workers) | 1075/1076; the one failure is the known Windows-only CRLF assertion in `ui/foundation.test.tsx` (passes on Linux CI) |
| Entry JS (gzip -9) | 179,214 (`main`) → 179,420 bytes (+206: prompt strings and attempt tracking); the hook stays in a 1.5 KB-gzip lazy chunk |

## Browser evidence (installed Chrome, production build, local API, synthetic data)

Harness: [`tools/evidence.mjs`](./issue-228-b0-unsaved-input/tools/evidence.mjs) with
[`tools/seed.mjs`](./issue-228-b0-unsaved-input/tools/seed.mjs) against a throwaway PostgreSQL
container, re-run on the hardened head. Raw results:
[`results.json`](./issue-228-b0-unsaved-input/results.json) — **20/20 pass**. Native confirmation
and `beforeunload` prompts are not part of page screenshots, so each step records the prompt type and
text, the URL afterwards and whether the typed value survived.

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
| Admin: two dirty forms → Back, agree to the first, cancel the second | confirm ×2 | stayed, both inputs kept |
| Admin: retry Back after that cancelled attempt | confirm (asked again) | stayed |
| Admin: retry Back, agree to both | confirm ×2 | left the page |
| Messages: unsent draft → Back, "stay" | confirm | stayed, draft kept |
| Messages: draft sent → Back | none | navigated |
| Tasks, FR, 1024px: title changed → Back | confirm (FR) | stayed |
| Tasks, 390px: title changed → Back, "stay" | confirm | stayed, value kept |
| Tasks, 390px: title changed → reload, "stay" | `beforeunload` | stayed |
| Tasks, 390px: title changed → Back, "discard" | confirm | left the page |

Layout neutrality: [`tools/layout-compare.mjs`](./issue-228-b0-unsaved-input/tools/layout-compare.mjs)
recorded the boxes of the first 400 elements in the workspace on Messages, Tasks, Training,
Commercial, Documents, Accounting and Administration at 1440×900 and 390×844 for a `main` build and
this branch on the same API: **identical on all 14 route/width pairs** (measured before the
hardening; the hardening adds no markup outside Administration, where the scopes moved from the page
to its three forms and remain `display: contents`). Note for later (pre-existing, not changed here):
`.app-shell__content > .admin-panel` in `app-shell.css` has not matched since the route boundary
`div` arrived in #208.

Screenshots: `screenshots/desktop-en-tasks-dirty-kept.png`, `desktop-en-admin-profile-saved.png`,
`desktop-en-messages-draft-kept.png`, `tablet-fr-tasks-dirty-kept.png`,
`mobile-en-tasks-dirty-kept.png`. Video recording is supported by the harness (`VIDEO=1`) but needs
Playwright's ffmpeg build, which was not installed for this run; video is required from B2 onward.

Reproduce: throwaway DB + API on 3720 (`API_CORS_ORIGIN=http://localhost:5720`), web built with
`VITE_API_BASE_URL=http://localhost:3720` and served by `vite preview --port 5720`, `node seed.mjs`,
then `OUT=<this folder> node evidence.mjs > results.json` with `playwright-core` resolvable next to
the script.

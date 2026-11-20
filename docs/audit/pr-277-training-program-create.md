# PR #277 — Training program create Reference acceptance

Synthetic browser evidence for the Training **New program** create disclosure: reference
keyboard input, delayed owner/client picker loads, submit, duplicate recovery, reload, EN/FR
at 360px width.

## Run locally

1. Start the web dev server: `pnpm --filter @hire-me/web dev`
2. In another terminal (with optional installed Chrome):

```bash
PR_277_WEB_URL=http://127.0.0.1:5173 \
node scripts/pr-277-training-program-create-evidence.mjs
```

When `C:/Program Files/Google/Chrome/Application/chrome.exe` (or `PR_277_CHROME_PATH`) is
available, the script uses installed Google Chrome; otherwise it uses Playwright Chromium on
the agent/CI host.

Artifacts: `docs/audit/pr-277-training-program-create/report.json` and locale screenshots.

## UX branch integration (#274 / #276)

Keep **PR #277** reviewable on `main` by itself. After merge (or once approved):

1. On the UX development branch that carries **#274** / **#276**, integrate the merge commit
   from **#277** (after review) via cherry-pick or a single merge from `main` — not the
   intermediate-only `3730b9a` snapshot if later review commits landed on the PR branch.
2. Do **not** rewrite, squash, or merge open release candidates **#274** or **#276** as part of
   this fix; land #277 on `main` first, then forward-port the verified patch.
3. Resolve conflicts only in `ProgramForm.tsx`, `TrainingWorkspace.tsx`, `ProgramProfile.tsx`,
   and tests if the UX branch touched Training create.
4. Re-run Training focused tests and this Chrome script on the integrated branch before folding
   into the UAT candidate.

Next isolated UX batch after this regression closes: **#259 Administration Users**.
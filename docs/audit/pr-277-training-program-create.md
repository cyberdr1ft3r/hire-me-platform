# PR #277 — Training program create Reference acceptance

The Training **New program** check uses Playwright keyboard entry and a loopback API fixture.
It verifies trusted keydown and input events, keeps both pickers loading through the first
keystroke, then releases owners and clients in order. It checks the unsaved marker, full
reference and picker IDs in both create requests, duplicate recovery, and list reload in
English and French at 360 and 1440 px.

## Run locally

1. Serve a local web build or dev server with `VITE_API_BASE_URL=http://127.0.0.1:3000`.
2. In another terminal, set the preview URL and optionally specify installed Chrome:

```bash
PR_277_WEB_URL=http://127.0.0.1:5173 \
node scripts/pr-277-training-program-create-evidence.mjs
```

Set `PR_277_CHROME_PATH` to use an installed Chrome binary. With no path, the script uses
Playwright Chromium. Set `PR_277_OUTPUT_DIR` to choose where the report and screenshots are
written. The default is `hireme-training-reference-keyboard` under the OS temporary directory.

The [original report and screenshots](pr-277-training-program-create/) record the synthetic
input run attached to #277 before the keyboard verification.

## UX branch integration (#274 / #276)

The exact #277 head `1dd5798` still reverted the first trusted keystroke in Chrome before
either picker responded. Chrome reported the inserted value on input capture and an empty
value by the end of the same event. The shared unsaved-input guard recorded the edit during
native capture and immediately notified the Console shell, whose render restored the previous
controlled input value before React processed the edit.

The UX integration carries all three #277 commits on top of #276 at `6590673`. It defers the
Console's input notification until React has processed the event. Navigation and unload
checks still see edits immediately. The keyboard scenario also verifies that the Console
marks the form dirty and clears the marker after successful create. The dedicated draft lets
the original #277 and the #274/#276 stack continue through their own reviews.

Google Chrome 157.0.8103.52 passed all four locale and viewport combinations on the
integrated production web build. Each scenario checked two create payloads, one with a
fixture 409 response and one with a 201 response, and found the saved program after reload.

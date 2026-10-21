# Issue #234 top-navigation visual-fidelity evidence

All screenshots were captured in installed Google Chrome at a 1117 × 707 CSS viewport with synthetic API responses. The Candidates comparison uses the same nine-row directory and selected Sofia El Amrani quick profile on both sides. The “before” frame applies the exact PR #238 baseline `app-shell.css` from `4d37d4b4e2bbe07b498ed88d0cd48f7281ea4566` to the same built app; the “after” frame uses the refined shell. No Candidate module code or data contracts were changed.

| State | Screenshot |
| --- | --- |
| Before — Candidates directory + quick profile | [PNG](before-candidates-desktop-en.png) |
| After — Candidates directory + quick profile | [PNG](after-candidates-desktop-en.png) |
| Before — More menu open | [PNG](before-more-menu-en.png) |
| After — More menu open | [PNG](after-more-menu-en.png) |

## Measured layout

| Element | Before | After |
| --- | ---: | ---: |
| Utility header row | 56px | 45px |
| Module navigation row | 33px | 33px |
| B2 workspace tab row | 34px | 33px |
| Content surface inset from viewport | 16px | 12px |
| Content surface inner padding | 16px | 12px |
| Candidate page header top | 156px | 136px |
| Document horizontal overflow | 0px | 0px |

The page-header position changes with the more compact shell and surface spacing. The row height for desktop workspace tabs remains in the same compact range; the update is primarily a slimmer, integrated tab treatment. Mobile tab controls retain their existing minimum touch target.

## More-menu clipping

Before: the menu was absolutely positioned inside the horizontally scrollable module `<ul>`. Chrome reported the list's computed `overflow-y:auto`; the menu had 0px vertical intersection with the module-list scrollport, clipping its options.

After: the popup is positioned against the viewport below the compact header. All options fit in the viewport and remain keyboard-visible; the browser capture reported no document overflow and no page errors. Existing Escape and focus-restoration behavior is covered by the EN/FR shell evidence runner.

## Browser and regression coverage

Run the visual captures from the repository root:

```powershell
$env:ISSUE_234_PHASE='before'; node scripts/issue-234-fidelity-capture.mjs
$env:ISSUE_234_PHASE='after'; node scripts/issue-234-fidelity-capture.mjs
node scripts/issue-234-top-navigation-evidence.mjs
```

The evidence scripts use the locally built production bundle and the installed Chrome binary with synthetic data. A file-origin history adapter is enabled only in the capture harness because this execution environment blocks the app's local HTTP listener; the production application code is unchanged by that adapter. The focused capture asserts the Candidates record-preview view, checks the More menu against the clipping scrollport, and fails on horizontal overflow or browser page errors. The broader runner checks EN/FR at 1117 × 707 and 390 × 844, More/drawer Escape and focus restoration, primary-navigation visibility/order, mobile workspace-tab sizing, and 559 × 354 CSS dimensions as a 200%-zoom-equivalent viewport.

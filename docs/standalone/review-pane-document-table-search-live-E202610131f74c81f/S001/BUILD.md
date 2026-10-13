<!-- insrc:artifact BUILD-1f74c81f507dbe78-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T16:14:59.110Z  ·  **Updated:** 2026-10-13T16:14:59.110Z

**Commit:** f5765ed7

## Summary

media/insrc-review-icon.svg and media/insrc-review-icon-dark.svg are new: the delivery board icon's spiral group, unchanged, behind a document page with a folded corner and a check mark, stroked #1a4528 (light) and #ffffff (dark), with no background. package.json's insrc.chat.docsReview command declares the pair. The panel's tab icon is set in task 3, where the plan puts the wiring. I rendered both files beside the delivery board's in headless Chrome at 200 px and 24 px (/tmp/t9/icon/icons.png): the glyph reads at tab size in both.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/media/insrc-review-icon-dark.svg` — **insrc-build** (2026-10-13T16:14:59.110Z)
- `vscode-plugin/media/insrc-review-icon.svg` — **insrc-build** (2026-10-13T16:14:59.110Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-13T16:14:59.110Z)
- `vscode-plugin/src/chat/__tests__/review-icon.test.ts` — **insrc-build** (2026-10-13T16:14:59.110Z)

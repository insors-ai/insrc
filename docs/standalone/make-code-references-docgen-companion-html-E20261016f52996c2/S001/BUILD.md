<!-- insrc:artifact BUILD-f52996c2709dba81-s1 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-16T11:29:23.058Z  ·  **Updated:** 2026-10-16T11:46:49.111Z

**Commit:** f887c578

## Summary

The docgen call-sequence diagram labels each frame with its repo-relative path and line. A page script, inlined in the companion page and both docgen shells, marks code references and posts a click to the parent. The review pane forwards such a message only from its own companion frame, with valid fields, as the existing open-code-ref. A test pins the script's grammar to the chat page's.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/docgen/__tests__/code-ref-grammar-pin.test.ts` — **insrc-build** (2026-10-16T11:46:49.111Z)
- `src/docgen/extract/__tests__/call-sequence-label.test.ts` — **insrc-build** (2026-10-16T11:46:49.111Z)
- `src/docgen/extract/call-sequence.ts` — **insrc-build** (2026-10-16T11:46:49.111Z)
- `src/docgen/render/code-ref-script.ts` — **insrc-build** (2026-10-16T11:46:49.111Z)
- `src/docgen/render/fallback.ts` — **insrc-build** (2026-10-16T11:46:49.111Z)
- `src/docgen/render/shell.ts` — **insrc-build** (2026-10-16T11:46:49.111Z)
- `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts` — **insrc-build** (2026-10-16T11:46:49.111Z)
- `src/workflow/artifacts/companion/shell.ts` — **insrc-build** (2026-10-16T11:46:49.111Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-10-16T11:46:49.111Z)
- `vscode-plugin/src/chat/__tests__/review-frame-message.test.ts` — **insrc-build** (2026-10-16T11:46:49.111Z)
- `vscode-plugin/src/chat/docs-review-panel.ts` — **insrc-build** (2026-10-16T11:46:49.111Z)

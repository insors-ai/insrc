<!-- insrc:artifact BUILD-1f74c81f507dbe78-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T16:14:59.110Z  ·  **Updated:** 2026-10-13T16:38:06.477Z

**Commit:** 2800f2a0

## Summary

In the shell's renderContent (vscode-plugin/src/chat/docs-review-panel.ts), a content for the document already shown is a reload in place: the scrollTop of the document region (#insrc-rv-scroll) is taken before the body is rendered again and put back after, and when the content is marked changed (===true) and its contentVersion differs from the one shown, the result line says 'This document changed on disk and was reloaded.'. The re-read after the shell's own decision is not marked changed, so the decision's result line stays; the watch's later report of that same write carries the version already shown and says nothing. Drafts and the whole-document field are kept by the existing same-document path. Test: the one named test added (the harness models a browser putting the region back at the top when the body is rendered); the shell baseline recomputed with a history line. Pane tests 226/226; whole plugin suite: only the two existing manifest-catalog failures; plugin typecheck clean. Six of seven mutations failed the test; the seventh is equivalent (the value it changes is not used for another document).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/media/insrc-review-icon-dark.svg` — **insrc-build** (2026-10-13T16:38:06.477Z)
- `vscode-plugin/media/insrc-review-icon.svg` — **insrc-build** (2026-10-13T16:38:06.477Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-13T16:38:06.477Z)
- `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` — **insrc-build** (2026-10-13T16:38:06.477Z)
- `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` — **insrc-build** (2026-10-13T16:38:06.477Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-10-13T16:38:06.477Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-10-13T16:38:06.477Z)
- `vscode-plugin/src/chat/__tests__/review-icon.test.ts` — **insrc-build** (2026-10-13T16:38:06.477Z)
- `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` — **insrc-build** (2026-10-13T16:38:06.477Z)
- `vscode-plugin/src/chat/docs-review-client.ts` — **insrc-build** (2026-10-13T16:38:06.477Z)
- `vscode-plugin/src/chat/docs-review-comments.ts` — **insrc-build** (2026-10-13T16:38:06.477Z)
- `vscode-plugin/src/chat/docs-review-list.ts` — **insrc-build** (2026-10-13T16:38:06.477Z)
- `vscode-plugin/src/chat/docs-review-panel.ts` — **insrc-build** (2026-10-13T16:38:06.477Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-13T16:38:06.477Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-13T16:38:06.477Z)
- `vscode-plugin/src/vscode.d.ts` — **insrc-build** (2026-10-13T16:38:06.477Z)

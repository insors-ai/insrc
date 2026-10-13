<!-- insrc:artifact BUILD-1f74c81f507dbe78-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T16:14:59.110Z  ·  **Updated:** 2026-10-13T16:32:19.913Z

**Commit:** 74ad686f

## Summary

The dropdown of documents is replaced by a list view (new source string DOCS_LIST_SOURCE in vscode-plugin/src/chat/docs-review-list.ts, inlined in the shell after the comments source): a toolbar with a search field completed from a datalist (at most 50 titles and ids of the chosen type), a type select with counts and a count line; a notice line; a table of 25 rows a page ordered by type then title in its own scrolling region; and a pager outside it. The header's select is replaced by a back button and the document's title. The view changes to the document only when a content carries reveal; a content without it never changes the view. Search, type, page and view are kept in the saved webview state through a merging writer (rvPutState) that the draft writer now uses too, so each keeps the other's key. The host's empty-id notice goes to the list view's notice line instead of the document body. Tests: the seven named tests added; four existing tests updated for the new markup (no-document notice, layout scrollers and the one sticky rule on the table header, the header title, the source inlining); the shell baseline recomputed with a history line. Pane tests 225/225; whole plugin suite 1248 pass, 2 fail (the two existing manifest-catalog failures, unrelated); plugin typecheck clean. Eleven mutations of the list code each failed the tests. The list view was also checked in headless Chrome against the live list of 240 pending documents.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/media/insrc-review-icon-dark.svg` — **insrc-build** (2026-10-13T16:32:19.913Z)
- `vscode-plugin/media/insrc-review-icon.svg` — **insrc-build** (2026-10-13T16:32:19.913Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-13T16:32:19.913Z)
- `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` — **insrc-build** (2026-10-13T16:32:19.913Z)
- `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` — **insrc-build** (2026-10-13T16:32:19.913Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-10-13T16:32:19.913Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-10-13T16:32:19.913Z)
- `vscode-plugin/src/chat/__tests__/review-icon.test.ts` — **insrc-build** (2026-10-13T16:32:19.913Z)
- `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` — **insrc-build** (2026-10-13T16:32:19.913Z)
- `vscode-plugin/src/chat/docs-review-client.ts` — **insrc-build** (2026-10-13T16:32:19.913Z)
- `vscode-plugin/src/chat/docs-review-comments.ts` — **insrc-build** (2026-10-13T16:32:19.913Z)
- `vscode-plugin/src/chat/docs-review-list.ts` — **insrc-build** (2026-10-13T16:32:19.913Z)
- `vscode-plugin/src/chat/docs-review-panel.ts` — **insrc-build** (2026-10-13T16:32:19.913Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-13T16:32:19.913Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-13T16:32:19.913Z)
- `vscode-plugin/src/vscode.d.ts` — **insrc-build** (2026-10-13T16:32:19.913Z)

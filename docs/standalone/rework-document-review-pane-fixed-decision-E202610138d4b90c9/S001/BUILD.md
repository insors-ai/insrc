<!-- insrc:artifact BUILD-8d4b90c9ab301e66-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T12:12:45.679Z  ·  **Updated:** 2026-10-13T13:49:35.582Z

**Commit:** 4efeb4a0

## Summary

docs-review-comments.ts: a thread is now one passage with its saved comments and its drafts. On every render rvPlaceAll reads docs-content's feedback list, skips and counts entries whose author, timestamp or comment is not a string, orders the rest oldest first (entries of one time keep their stored order), and for each entry with an anchor finds the quote again with rvFind (never in the document's own Feedback section). Entries found on the same passage share one mark (solid; dashed while the passage has a draft) and one margin marker, a button in the document's margin showing the number of comments, placed level with the passage when the page can measure it. A click on the marker or the mark opens the thread card: the quote, the saved comments oldest first with author, local time and decision (tagged 'on an earlier revision' when the entry's version differs from the document's), then drafts and the field; a reply is a draft with that passage's anchor. Entries with no passage go to the strip (a details element between the scrolling region and the comment panel, hidden when empty): whole-document entries, entries on an HTML document (tagged with the file name), and entries whose quote is gone, with the quote shown and tagged 'on an earlier revision'. The strip's summary gives the count and how many saved comments could not be shown. After a clean result a passage with saved comments keeps its thread. A document not awaiting review gets the same history, with approve and reject hidden (from task 9). All text is set with textContent; no markup is assigned. Deliberate change to a task 9 assertion: the strip's list is capped at 170px and scrolls on its own, so there are now two vertical scrollers (the document region and that list); the layout test asserts exactly those two. SHELL_BASELINE moved by +8232 chars with a history line. Four mutations (no time ordering, no skipping, searching the Feedback section, dropping an entry whose quote is gone) each fail a named test. Seen in headless Chrome over the real shell with a sample history (/tmp/t9/shell-dark-history.png): the marked passage, its marker with 2, the open thread oldest first, and the strip with three rows and the could-not-be-shown note. Not checked in a browser: marker positions after a window resize. Plugin suite without forced exit: 1239 tests, 1229 pass, 8 skipped, 2 fail (src/config/__tests__/manifest-catalog.test.ts, failing before this Story).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`
- ✓ `t10`
- ✓ `t11`
- ✓ `t12`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/index.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `src/workflow/__tests__/feedback-carry-finalize.test.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `src/workflow/artifact-content.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `src/workflow/artifacts/companion/__tests__/header.test.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `src/workflow/artifacts/companion/header.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `src/workflow/artifacts/format/bindings.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `src/workflow/artifacts/provenance/schema.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `src/workflow/artifacts/provenance/tool.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `src/workflow/artifacts/provenance/types.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `src/workflow/artifacts/provenance/writer.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `src/workflow/review-decision.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `vscode-plugin/src/chat/docs-review-client.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `vscode-plugin/src/chat/docs-review-comments.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `vscode-plugin/src/chat/docs-review-panel.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)
- `vscode-plugin/src/chat/turn-lifecycle.ts` — **insrc-build** (2026-10-13T13:49:35.582Z)

<!-- insrc:artifact BUILD-8d4b90c9ab301e66-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T12:12:45.679Z  ·  **Updated:** 2026-10-13T13:15:23.105Z

**Commit:** c3181c44

## Summary

vscode-plugin/src/chat/docs-review-panel.ts (the shell): the header has a tab list filled from docs-content's documents, one button per document, the markdown first and each HTML document by its title (set as text); with fewer than two documents no tab is shown. The scrolling region holds two views: the markdown document's hosts (#insrc-rv-md) and an HTML document's view (#insrc-rv-html: its path, a note line and a frame host); the tab chosen shows one and hides the other. Choosing an HTML tab posts open-companion { artifactId, relPath }, shows the path and 'Loading…' and drops any earlier frame. A docs-companion for the shown artifact and the tab on show creates an iframe by script, sets sandbox to exactly 'allow-scripts', then its title, then srcdoc to the posted text, and only then adds it to the page; an answer for another file or artifact is ignored; with no html (or html that is not a string) the note says the document cannot be shown and the path stays. A re-post of the same artifact keeps the tab and its frame; another artifact, or an HTML document no longer listed, goes back to the markdown. A comment sent while an HTML tab is on show is { comment, file: that path } with no anchor and no version; on the markdown it carries the version and no file. The field's placeholder names the file. One deliberate exception to 'theme variables only': the frame's own background is the system colour Canvas under color-scheme light, because the pages are standalone documents with their own palette written for a light page (the approved mock showed the HTML document on a light page); the task 9 theme test now asserts that this is the only place a colour scheme or Canvas is named. The frame element is created by script, so the shell's markup still has no element that loads anything. The test harness now records listeners on created elements (it used to make addEventListener a no-op) so a tab can be clicked. SHELL_BASELINE moved by +3297 chars for this task and its history says so. Checked by eye in headless Chrome: the three tabs, the path, a small page running a script inside the frame with cookie and parent access both blocked by the sandbox, and the Story's real 3.3 MB sequence-diagram page drawing inside the frame (/tmp/t9/shell-dark-simple.png, /tmp/t9/shell-dark-html-long.png). Not checked here: the frame under VS Code's own webview CSP; the user's earlier probe showed that works for the sequence diagram, and task 14's hand check covers the other kinds. Plugin suite without forced exit: 1232 tests, 1222 pass, 8 skipped, 2 fail (src/config/__tests__/manifest-catalog.test.ts, failing before this Story).

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

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/index.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `src/workflow/__tests__/feedback-carry-finalize.test.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `src/workflow/artifact-content.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `src/workflow/artifacts/companion/__tests__/header.test.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `src/workflow/artifacts/companion/header.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `src/workflow/artifacts/format/bindings.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `src/workflow/artifacts/provenance/schema.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `src/workflow/artifacts/provenance/tool.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `src/workflow/artifacts/provenance/types.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `src/workflow/artifacts/provenance/writer.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `src/workflow/review-decision.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `vscode-plugin/src/chat/docs-review-client.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `vscode-plugin/src/chat/docs-review-panel.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)
- `vscode-plugin/src/chat/turn-lifecycle.ts` — **insrc-build** (2026-10-13T13:15:23.105Z)

<!-- insrc:artifact BUILD-8d4b90c9ab301e66-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T12:12:45.679Z  ·  **Updated:** 2026-10-13T13:52:51.995Z

**Commit:** 2244a5b0

## Summary

vscode-plugin/src/extension.ts gives createDocsReviewHost two more dependencies: notifyChat: (text) => chatHost.submitExternal(text), and readCompanion: createCompanionReader({ root: first workspace folder }). New vscode-free module vscode-plugin/src/chat/companion-reader.ts: it answers a file's text only when the path ends in .html, is not absolute, stays under <root>/docs as written and again after symlinks are resolved, is a regular file and is at most 8 MB (COMPANION_MAX_BYTES); anything else, a throw included, is undefined. On 'neither host module imports the other': chat-panel.ts imports nothing of the review pane. docs-review-panel.ts has one import from chat-panel.js that predates this Story, { attr, type ChatPanelChannel, type ChatPanelLogger }: the shared attribute escaper and two types, a line another existing test (chat-theme.test.ts) pins on purpose. I left it as it is; the wiring test asserts that this is the only import, that the review host never names createChatPanelHost or submitExternal, and that it reaches the chat only through the function it is given. If the check is meant to forbid that shared helper too, it is not met and attr would need its own module. Smoke: I rendered the real shell (the host's own HTML, CSP meta removed and the VS Code API stubbed, with stand-in theme values) in headless Chrome 155 at 1100x760 over this Story's LLD (539 lines). Measured by script: the document is 21,484 px tall in a 502 px scrolling region; the comment panel's box is top 543, bottom 673 of a 673 px viewport at scrollTop 0, 10,742 and 20,982, the header is 0 to 41 at all three, and the page itself does not scroll. Before this Story the controls were 17,167 px down a 17,197 px page. Screenshots at the top and bottom of the scroll show the mock's layout: header with select, kind badge, state and tabs; one scrolling document; the rounded comment box with three round icon buttons at the bottom. What the smoke does not cover: the real VS Code webview (its CSP and theme variables), which is task 14's hand check. Plugin suite without forced exit: 1241 tests, 1231 pass, 8 skipped, 2 fail (src/config/__tests__/manifest-catalog.test.ts, failing before this Story). Both typechecks are clean.

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
- ✓ `t13`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/index.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `src/workflow/__tests__/feedback-carry-finalize.test.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `src/workflow/artifact-content.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `src/workflow/artifacts/companion/__tests__/header.test.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `src/workflow/artifacts/companion/header.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `src/workflow/artifacts/format/bindings.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `src/workflow/artifacts/provenance/schema.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `src/workflow/artifacts/provenance/tool.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `src/workflow/artifacts/provenance/types.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `src/workflow/artifacts/provenance/writer.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `src/workflow/review-decision.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `vscode-plugin/src/chat/companion-reader.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `vscode-plugin/src/chat/docs-review-client.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `vscode-plugin/src/chat/docs-review-comments.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `vscode-plugin/src/chat/docs-review-panel.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `vscode-plugin/src/chat/turn-lifecycle.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-13T13:52:51.995Z)

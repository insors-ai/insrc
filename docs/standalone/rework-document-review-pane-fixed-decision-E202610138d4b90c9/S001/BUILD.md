<!-- insrc:artifact BUILD-8d4b90c9ab301e66-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T12:12:45.679Z  ·  **Updated:** 2026-10-13T12:53:02.450Z

**Commit:** abbe50c1

## Summary

vscode-plugin/src/chat/docs-review-panel.ts: the host keeps one OpenDocument record (artifact id, docPath, HTML companion paths, kind, title), set whenever a document's content is read. A docs-decision is acted on only for that document; approve and reject also need it in the pending list, feedback does not; each refusal is a docs-decision-result with ok false and nothing is sent to the daemon. On an accepted decision the host calls client.decide once with the docPath and every comment, hands the chat one message through deps.notifyChat (the decision line with the artifact id, title, path and reviewer; then, when there are comments, the numbered comments with quote and section, or the companion file's path), posts docs-decision-result { ok, outcome, recorded, message }, then re-reads the pending list and re-reads the document by its path, read-only when it is no longer pending. A failing decide posts ok false, sends no chat message and keeps the open document; the document is re-read only if its place in the pending list changed, so a daemon that is down does not replace the document on screen with an error. A withheld approval, a commentsError and each chat hand-over outcome (sent, queued, unavailable, throwing, absent) are worded in the result line; withheld and commentsError are also in the chat message. open-companion is answered with docs-companion: the reader is called only for a path the open document lists, and its text gets the shell's nonce on every script tag without one (stampScriptNonce, exported); any other path, another artifact's id, an absent reader, undefined or a throw is answered with no html. A boot ping re-reads the list and then re-posts the open document by its path. docs-content gains docPath, contentVersion, feedback, reviewer, state and documents (protocol.ts: DocsDocumentTab). The two host tests from task 7 whose inline notices became result messages were updated; the nine named tests are in a new file. Not in this task: the 'theme' message is still posted to this pane and the shell is unchanged; both belong to task 9. Plugin suite without forced exit: 1226 tests, 1216 pass, 8 skipped, 2 fail (src/config/__tests__/manifest-catalog.test.ts, failing before this Story). The new test file was compiled once with a temporary tsconfig, since the plugin's tsc excludes tests.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/index.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `src/workflow/__tests__/feedback-carry-finalize.test.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `src/workflow/artifact-content.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `src/workflow/artifacts/companion/__tests__/header.test.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `src/workflow/artifacts/companion/header.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `src/workflow/artifacts/format/bindings.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `src/workflow/artifacts/provenance/schema.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `src/workflow/artifacts/provenance/tool.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `src/workflow/artifacts/provenance/types.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `src/workflow/artifacts/provenance/writer.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `src/workflow/review-decision.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `vscode-plugin/src/chat/docs-review-client.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `vscode-plugin/src/chat/docs-review-panel.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)
- `vscode-plugin/src/chat/turn-lifecycle.ts` — **insrc-build** (2026-10-13T12:53:02.450Z)

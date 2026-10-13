<!-- insrc:artifact BUILD-e62a9269a7cb9550-S001 -->

# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-10-13T18:16:07.404Z  ·  **Updated:** 2026-10-13T19:24:37.284Z

**Commit:** bd3a9e47

## Summary

A document a chat turn presents for approval is opened in the review pane. New module vscode-plugin/src/chat/review-presenter.ts (createReviewPresenter: begin() returns a per-turn handle with toolResult(output) and end()): a tool result carrying pendingApproval.artifactPath opens the pending document with that path at once; the turn's end opens every document that became pending during the turn and was not opened in it; a turn begun while the one before has not ended carries that turn's state on, and the earlier turn's end opens nothing. The chat host (chat-panel.ts) begins a presented turn just before turns.start, passes each non-error tool result from the run sink, and ends it in a finally around the awaited run; a followed turn begins one lazily on its first event and ends it when the follow ended. Each call is wrapped so a throwing presenter is logged. The review client gains pendingDocuments(); the review host's openArtifact gains quiet, createPanel gains opts.quiet (Beside with preserveFocus in extension.ts, Active otherwise) and the channel's reveal gains an optional preserveFocus; vscode.d.ts declares the two forms. review-wiring.test.ts's two assertions on the createPanel source are restated. Tests: ten, one per subject of the design. Mutations of the presenter, the call sites and the quiet open each failed the tests after two tests were tightened. One deviation worth stating: the start list is requested synchronously inside begin() so it is the list of that moment. The design's unverified point (a brainstorm SPEC's path) was not checked in this build; such a document is still opened by the end-of-turn rule.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-1f74c81f507dbe78-S001.json` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `.insrc/artifacts/BUILD-cb09a32ccdc4ed2b-S001.json` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `.insrc/artifacts/CR-cb09a32ccdc4ed2b-S001.json` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `.insrc/artifacts/LLD-dd277f9cddd6d879-S001.json` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `.insrc/artifacts/TESTS-1f74c81f507dbe78-S001.json` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `.insrc/artifacts/TESTS-cb09a32ccdc4ed2b-S001.json` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `.insrc/build-start/cb09a32ccdc4ed2b-S001.json` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `.insrc/build-start/dd277f9cddd6d879-S001.json` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `docs/standalone/list-pending-build-records-review-E20261013dd277f9c/S001/LLD.md` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `docs/standalone/review-pane-document-table-search-live-E202610131f74c81f/S001/BUILD.md` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `docs/standalone/review-pane-document-table-search-live-E202610131f74c81f/S001/TESTS.md` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `docs/standalone/show-epic-s-own-records-its-E20261013cb09a32c/S001/BUILD.md` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `docs/standalone/show-epic-s-own-records-its-E20261013cb09a32c/S001/CR.md` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `docs/standalone/show-epic-s-own-records-its-E20261013cb09a32c/S001/TESTS.md` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `src/workflow/__tests__/pending.test.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `src/workflow/pending.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `vscode-plugin/src/chat/docs-review-client.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `vscode-plugin/src/chat/docs-review-panel.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `vscode-plugin/src/chat/review-presenter.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `vscode-plugin/src/chat/webview-channel.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `vscode-plugin/src/delivery/__tests__/epic-records.test.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `vscode-plugin/src/delivery/board-host.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `vscode-plugin/src/delivery/board-model.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `vscode-plugin/src/delivery/board-protocol.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `vscode-plugin/src/delivery/board-state.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)
- `vscode-plugin/src/vscode.d.ts` — **insrc-build** (2026-10-13T19:24:37.284Z)

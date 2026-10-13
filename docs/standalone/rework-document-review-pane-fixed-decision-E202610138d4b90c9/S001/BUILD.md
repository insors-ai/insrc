<!-- insrc:artifact BUILD-8d4b90c9ab301e66-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T12:12:45.679Z  ·  **Updated:** 2026-10-13T19:27:26.754Z

**Commit:** efe17ea4

## Summary

Task 14 adds no code of its own. Both suites were run, the daemon was pushed, updated and restarted before the plugin was installed (push on the user's word), and the user checked the pane by hand. Three fixes found in the hand check were committed under this Story: the review client names the workspace folder as repo on every call; no comment button is offered while no document is open; a diagram or mock that has its own tab is not also drawn inside the markdown. Two things are stated plainly in the evidence: the chat-timing check (a decision sent while a turn runs, and one with the chat closed) was not tried by hand, and the entity-model diagram's tab was not separately confirmed.

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
- ✗ `t14`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-1f74c81f507dbe78-S001.json` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `.insrc/artifacts/BUILD-cb09a32ccdc4ed2b-S001.json` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `.insrc/artifacts/BUILD-e62a9269a7cb9550-S001.json` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `.insrc/artifacts/CR-cb09a32ccdc4ed2b-S001.json` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `.insrc/artifacts/ISSUE-1f1e16c61c017931.json` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `.insrc/artifacts/LLD-1f74c81f507dbe78-S001.json` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `.insrc/artifacts/LLD-cb09a32ccdc4ed2b-S001.json` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `.insrc/artifacts/LLD-dd277f9cddd6d879-S001.json` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `.insrc/artifacts/LLD-e62a9269a7cb9550-S001.json` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `.insrc/artifacts/PLAN-1f74c81f507dbe78-S001.json` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `.insrc/artifacts/TESTS-1f74c81f507dbe78-S001.json` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `.insrc/artifacts/TESTS-cb09a32ccdc4ed2b-S001.json` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `.insrc/artifacts/TESTS-e62a9269a7cb9550-S001.json` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `.insrc/build-start/1f74c81f507dbe78-S001.json` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `.insrc/build-start/cb09a32ccdc4ed2b-S001.json` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `.insrc/build-start/dd277f9cddd6d879-S001.json` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `.insrc/build-start/e62a9269a7cb9550-S001.json` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `docs/standalone/list-pending-build-records-review-E20261013dd277f9c/S001/LLD.md` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `docs/standalone/open-document-presented-approval-review-pane-E20261013e62a9269/S001/BUILD.md` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `docs/standalone/open-document-presented-approval-review-pane-E20261013e62a9269/S001/LLD.md` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `docs/standalone/open-document-presented-approval-review-pane-E20261013e62a9269/S001/TESTS.md` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `docs/standalone/review-pane-document-table-search-live-E202610131f74c81f/S001/BUILD.md` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `docs/standalone/review-pane-document-table-search-live-E202610131f74c81f/S001/LLD.md` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `docs/standalone/review-pane-document-table-search-live-E202610131f74c81f/S001/PLAN.md` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `docs/standalone/review-pane-document-table-search-live-E202610131f74c81f/S001/TESTS.md` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `docs/standalone/show-epic-s-own-records-its-E20261013cb09a32c/S001/BUILD.md` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `docs/standalone/show-epic-s-own-records-its-E20261013cb09a32c/S001/CR.md` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `docs/standalone/show-epic-s-own-records-its-E20261013cb09a32c/S001/LLD.md` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `docs/standalone/show-epic-s-own-records-its-E20261013cb09a32c/S001/TESTS.md` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `docs/standalone/src-shared-classify-ts-carries-second-E202610101f1e16c6/ISSUE.md` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `src/workflow/__tests__/feedback-carry-finalize.test.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `src/workflow/__tests__/pending.test.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `src/workflow/artifact-content.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `src/workflow/artifacts/companion/__tests__/header.test.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `src/workflow/artifacts/companion/header.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `src/workflow/artifacts/format/bindings.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `src/workflow/artifacts/provenance/schema.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `src/workflow/artifacts/provenance/tool.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `src/workflow/artifacts/provenance/types.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `src/workflow/artifacts/provenance/writer.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `src/workflow/pending.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `src/workflow/review-decision.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/media/insrc-review-icon-dark.svg` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/media/insrc-review-icon.svg` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/chat/__tests__/review-icon.test.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/chat/companion-reader.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/chat/docs-review-client.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/chat/docs-review-comments.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/chat/docs-review-list.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/chat/docs-review-panel.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/chat/review-presenter.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/chat/turn-lifecycle.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/chat/webview-channel.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/delivery/__tests__/epic-records.test.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/delivery/board-host.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/delivery/board-model.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/delivery/board-protocol.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/delivery/board-state.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)
- `vscode-plugin/src/vscode.d.ts` — **insrc-build** (2026-10-13T19:27:26.754Z)

<!-- insrc:artifact BUILD-1f74c81f507dbe78-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T16:14:59.110Z  ·  **Updated:** 2026-10-13T18:47:18.015Z

**Commit:** 43ee0e20

## Summary

Task 6 adds no code. The plugin's suite and typecheck were run after task 5, the real shell's list view was rendered in headless Chrome over the live pending list of 240 documents, and the plugin was built, packaged and installed (insrc-vscode 0.5.14) for the user's hand check. The user worked with the installed pane and reported the remaining manual verification done apart from another Story's; they did not confirm each listed item separately, which the evidence says.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✗ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-cb09a32ccdc4ed2b-S001.json` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `.insrc/artifacts/BUILD-e62a9269a7cb9550-S001.json` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `.insrc/artifacts/CR-cb09a32ccdc4ed2b-S001.json` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `.insrc/artifacts/LLD-cb09a32ccdc4ed2b-S001.json` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `.insrc/artifacts/LLD-e62a9269a7cb9550-S001.json` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `.insrc/artifacts/TESTS-cb09a32ccdc4ed2b-S001.json` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `.insrc/artifacts/TESTS-e62a9269a7cb9550-S001.json` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `.insrc/build-start/cb09a32ccdc4ed2b-S001.json` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `.insrc/build-start/e62a9269a7cb9550-S001.json` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `docs/standalone/open-document-presented-approval-review-pane-E20261013e62a9269/S001/BUILD.md` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `docs/standalone/open-document-presented-approval-review-pane-E20261013e62a9269/S001/LLD.md` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `docs/standalone/open-document-presented-approval-review-pane-E20261013e62a9269/S001/TESTS.md` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `docs/standalone/show-epic-s-own-records-its-E20261013cb09a32c/S001/BUILD.md` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `docs/standalone/show-epic-s-own-records-its-E20261013cb09a32c/S001/CR.md` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `docs/standalone/show-epic-s-own-records-its-E20261013cb09a32c/S001/LLD.md` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `docs/standalone/show-epic-s-own-records-its-E20261013cb09a32c/S001/TESTS.md` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/media/insrc-review-icon-dark.svg` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/media/insrc-review-icon.svg` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/chat/__tests__/review-icon.test.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/chat/docs-review-client.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/chat/docs-review-comments.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/chat/docs-review-list.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/chat/docs-review-panel.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/chat/review-presenter.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/chat/webview-channel.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/delivery/__tests__/epic-records.test.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/delivery/board-host.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/delivery/board-model.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/delivery/board-protocol.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/delivery/board-state.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)
- `vscode-plugin/src/vscode.d.ts` — **insrc-build** (2026-10-13T18:47:18.015Z)

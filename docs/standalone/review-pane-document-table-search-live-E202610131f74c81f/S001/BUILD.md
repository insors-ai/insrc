<!-- insrc:artifact BUILD-1f74c81f507dbe78-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T16:14:59.110Z  ·  **Updated:** 2026-10-13T16:20:17.087Z

**Commit:** a6475dad

## Summary

docs-review-panel.ts: the host gains optional deps watchDocument and setTimer. setOpened is now the one place the open document's record is assigned; it keeps the watch when the same document (same artifact id and path) is read again, ends it and starts a new one on [docPath, .insrc/artifacts/<id>.json] for another document, and ends it when the record is cleared (a failed open of another document, the panel closing, dispose). Keeping the watch for the same document is the reviewer's suggestion from the LLD's last review, so a change cannot fall between ending and restarting it. A change starts a quiet period of RELOAD_QUIET_MS (300), restarted by further changes; at its end the host re-reads the pending list and the open document by its path, posted with changed: true. decide() counts decisions in flight; a change during one is remembered and starts the quiet period when the decision settles on any path (recorded, refused, failed). openDoc takes reveal and changed: reveal is passed by a list-row open and by openArtifact and is on both the content and the 'unavailable' content of a failed read; re-reads never carry it. protocol.ts: docs-content gains reveal? and changed?. extension.ts: createPanel sets panel.iconPath to the review icon pair before wrapping it, and watchDocument creates one VS Code file watcher per path under the first workspace folder. vscode.d.ts (the plugin's own compile-only declarations) gains createFileSystemWatcher, RelativePattern and FileSystemWatcher. One fix outside the task, in its own commit: extension-chat-wiring.test.ts pinned createDocsReviewClient(client); my earlier hand-check fix (d7536863) had added the repository argument and I had not run the whole suite then, so that test was failing; its assertion now expects the argument. Not checked: the real VS Code file watcher (whether it reports changes under .insrc/, and its timing); that is the hand check in task 6. Plugin suite without forced exit: 1251 tests, 1241 pass, 8 skipped, 2 fail (manifest-catalog.test.ts, failing before either Story).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/media/insrc-review-icon-dark.svg` — **insrc-build** (2026-10-13T16:20:17.087Z)
- `vscode-plugin/media/insrc-review-icon.svg` — **insrc-build** (2026-10-13T16:20:17.087Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-13T16:20:17.087Z)
- `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` — **insrc-build** (2026-10-13T16:20:17.087Z)
- `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` — **insrc-build** (2026-10-13T16:20:17.087Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-10-13T16:20:17.087Z)
- `vscode-plugin/src/chat/__tests__/review-icon.test.ts` — **insrc-build** (2026-10-13T16:20:17.087Z)
- `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` — **insrc-build** (2026-10-13T16:20:17.087Z)
- `vscode-plugin/src/chat/docs-review-client.ts` — **insrc-build** (2026-10-13T16:20:17.087Z)
- `vscode-plugin/src/chat/docs-review-panel.ts` — **insrc-build** (2026-10-13T16:20:17.087Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-13T16:20:17.087Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-13T16:20:17.087Z)
- `vscode-plugin/src/vscode.d.ts` — **insrc-build** (2026-10-13T16:20:17.087Z)

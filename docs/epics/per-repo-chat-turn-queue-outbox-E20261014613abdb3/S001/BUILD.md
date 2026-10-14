<!-- insrc:artifact BUILD-613abdb351c2c738-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-14T11:13:11.458Z  ·  **Updated:** 2026-10-14T12:04:19.680Z

**Commit:** 1cfe1e75

## Summary

New vscode-plugin/src/chat/chat-queue-setup.ts (vscode-free): WINDOW_KEY_STATE / windowKeyOf (window key created once and kept in workspaceState, so a reload keeps it), repoKeyOf (first 16 hex of sha256 of the realpath of the chat folder's git top-level; the folder itself outside git), queuePathOf (<insrc home>/chat-queue/<key>.sqlite), processAliveCheck (pid alive AND, when given, the same start time), createQueueFactory (opens the store and returns the worker factory; on failure logs, shows the notice once — a newer-plugin message for a too-new schema, else QUEUE_UNSUPPORTED_NOTICE — and returns undefined so the chat keeps its direct path). extension.ts builds the factory before createChatPanelHost: repo key via `git -C <cwd> rev-parse --show-toplevel`, node:sqlite loaded lazily through createRequire, the claim from the window key + the extension host's pid and start time (session-lock's defaultProcessStartTime), isAlive from defaultIsAlive + defaultProcessStartTime, notify via showWarningMessage; it passes queue only when the factory exists. package.json engines: vscode ^1.141.0, node >=22.13. Pinned tests updated: extension-chat-wiring's import regex (adds defaultIsAlive, defaultProcessStartTime) and packaging's engines.vscode. The queued attachment test in chat-panel.test.ts now disposes its host, so its worker's poll timers stop and the file exits on its own. Whole plugin suite without force-exit: 1286 tests, 1276 pass, 8 skipped, 2 fail — both the pre-existing manifest-catalog failures (unrelated, failing before this Epic). Plugin typecheck clean. Commit 1cfe1e75.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/package.json` — **insrc-build** (2026-10-14T12:04:19.680Z)
- `vscode-plugin/src/__tests__/packaging.test.ts` — **insrc-build** (2026-10-14T12:04:19.680Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-14T12:04:19.680Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-routing.test.ts` — **insrc-build** (2026-10-14T12:04:19.680Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` — **insrc-build** (2026-10-14T12:04:19.680Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-setup.test.ts` — **insrc-build** (2026-10-14T12:04:19.680Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` — **insrc-build** (2026-10-14T12:04:19.680Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` — **insrc-build** (2026-10-14T12:04:19.680Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-10-14T12:04:19.680Z)
- `vscode-plugin/src/chat/__tests__/fixtures/queue-ack-child.mts` — **insrc-build** (2026-10-14T12:04:19.680Z)
- `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` — **insrc-build** (2026-10-14T12:04:19.680Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-14T12:04:19.680Z)
- `vscode-plugin/src/chat/chat-queue-setup.ts` — **insrc-build** (2026-10-14T12:04:19.680Z)
- `vscode-plugin/src/chat/chat-queue-store.ts` — **insrc-build** (2026-10-14T12:04:19.680Z)
- `vscode-plugin/src/chat/chat-queue-worker.ts` — **insrc-build** (2026-10-14T12:04:19.680Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-14T12:04:19.680Z)
- `vscode-plugin/src/chat/turn-lifecycle.ts` — **insrc-build** (2026-10-14T12:04:19.680Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-14T12:04:19.680Z)

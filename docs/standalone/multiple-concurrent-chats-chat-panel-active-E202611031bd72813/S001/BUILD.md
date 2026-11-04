<!-- insrc:artifact BUILD-1bd72813bfa795f4-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-11-03T19:59:20.775Z  ·  **Updated:** 2026-11-04T17:12:47.804Z

**Commit:** 50fd8cc9b

## Summary

t5: observer transitions corrected — done only on real terminal or verified pid death with a caught-up observer; budget aborts/observation failures keep last status; retention archives pinned generations; 178 panel + output tests pass, tsc clean.

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

- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/stream-events.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/turn-lifecycle.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/__tests__/session-store.test.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/session-file-store.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/session-store.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/__tests__/session-output.test.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/session-output.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/__tests__/chat-theme-before.json` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/__tests__/approval-queue.test.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/__tests__/fixtures.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/approval-queue.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/docs-review-panel.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/review-presenter.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/docs-review-comments.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `docs/standalone/multiple-concurrent-chats-chat-panel-active-E202611031bd72813/S001/MANUAL-CODE-REVIEW.md` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `docs/standalone/multiple-concurrent-chats-chat-panel-active-E202611031bd72813/S001/evidence/manual-code-review/affected-tests.tap` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `docs/standalone/multiple-concurrent-chats-chat-panel-active-E202611031bd72813/S001/evidence/manual-code-review/evidence.json` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `docs/standalone/multiple-concurrent-chats-chat-panel-active-E202611031bd72813/S001/evidence/manual-code-review/probes/async-routing.mts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `docs/standalone/multiple-concurrent-chats-chat-panel-active-E202611031bd72813/S001/evidence/manual-code-review/probes/followup.mts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `docs/standalone/multiple-concurrent-chats-chat-panel-active-E202611031bd72813/S001/evidence/manual-code-review/probes/panels.mts` — **insrc-build** (2026-11-04T17:12:47.804Z)
- `docs/standalone/multiple-concurrent-chats-chat-panel-active-E202611031bd72813/S001/evidence/manual-code-review/probes/present-replay.mts` — **insrc-build** (2026-11-04T17:12:47.804Z)

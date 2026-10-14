<!-- insrc:artifact BUILD-613abdb351c2c738-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-14T12:57:26.478Z  ·  **Updated:** 2026-10-14T13:02:08.162Z

**Commit:** 29e9f12f

## Summary

New vscode-plugin/src/chat/chat-outbox.ts (sc5, pure, vscode-free): OutboxRow, OutboxView (runningChat, blockedBy, note), OutboxAction and projectOutbox(rows, sessionId, { titleOf, here?, note? }). Positions are 1-based among every queued/retrying row; processing (and done) rows never appear; failed/not-delivered rows have no position; aheadFromOtherChats counts other chats' waiting rows before this chat's first waiting row (all of them when it has none); runningChat names another chat's processing row ('another chat' when untitled; here from ctx.here); blockedBy comes from that row's waitingOn; attempts>0 and nextAttemptAt pass through for s4. protocol.ts: HostToWebview gains { type:'outbox', view }, WebviewToHost gains OutboxAction; HOST_TO_WEBVIEW_TYPES adds 'outbox' and WEBVIEW_TO_HOST_TYPES adds the four outbox-* types. The protocol tests assert inclusion, not exact lists, so none needed changing; a new named test pins the additions. Mutations (ahead counting every other row, keeping processing rows, naming the shown chat as running, ignoring here) each fail a test. Plugin suite: 1295 tests, 1285 pass, 8 skipped, 2 fail (pre-existing manifest-catalog). Typecheck clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-613abdb351c2c738-s2.json` — **insrc-build** (2026-10-14T13:02:08.162Z)
- `vscode-plugin/src/chat/__tests__/chat-outbox.test.ts` — **insrc-build** (2026-10-14T13:02:08.162Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` — **insrc-build** (2026-10-14T13:02:08.162Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` — **insrc-build** (2026-10-14T13:02:08.162Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-14T13:02:08.162Z)
- `vscode-plugin/src/chat/chat-outbox.ts` — **insrc-build** (2026-10-14T13:02:08.162Z)
- `vscode-plugin/src/chat/chat-queue-store.ts` — **insrc-build** (2026-10-14T13:02:08.162Z)
- `vscode-plugin/src/chat/chat-queue-worker.ts` — **insrc-build** (2026-10-14T13:02:08.162Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-14T13:02:08.162Z)

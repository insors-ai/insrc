<!-- insrc:artifact BUILD-613abdb351c2c738-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-14T12:57:26.478Z  ·  **Updated:** 2026-10-14T13:08:37.126Z

**Commit:** fe1d2a5a

## Summary

vscode-plugin/src/chat/chat-panel.ts: the queue runner's run(message, onSpawn, onWaiting) keeps onWaiting on the QueuedRun with the last reported card. reportCards() computes the card the running queued message waits on (an approval when the approval queue has a head, else a selection when one is pending, else none) and calls onWaiting only when it changes; it does nothing when no queued message runs (so a turn not run from the queue reports nothing). It is called when an approval is enqueued, when a selection request arrives, after a permission or selection decision (in a microtask, after the state changes), and when the waiting approvals are rejected, superseded or dropped. The worker writes each report with markWaiting (t2), and every window's projection shows blockedBy (t3/t4). Test: the named test runs two hosts (w-1, w-2) on one queue file: an approval card in w-1's running message marks it 'approval' and w-2's outbox shows blockedBy { 'fix the board', 'approval' } with runningChat; answering clears it; a selection card reports 'selection'; once the message and its selection continuation end, nothing stays marked and w-2 shows no blockedBy or runningChat. Mutations: reporting approvals only, and dropping the report after a decision, each fail the test. Plugin suite: 1301 tests, 1291 pass, 8 skipped, 2 fail (pre-existing manifest-catalog). Typecheck clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-613abdb351c2c738-s2.json` — **insrc-build** (2026-10-14T13:08:37.126Z)
- `vscode-plugin/src/chat/__tests__/chat-outbox.test.ts` — **insrc-build** (2026-10-14T13:08:37.126Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` — **insrc-build** (2026-10-14T13:08:37.126Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` — **insrc-build** (2026-10-14T13:08:37.126Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` — **insrc-build** (2026-10-14T13:08:37.126Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-14T13:08:37.126Z)
- `vscode-plugin/src/chat/chat-outbox.ts` — **insrc-build** (2026-10-14T13:08:37.126Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-14T13:08:37.126Z)
- `vscode-plugin/src/chat/chat-queue-store.ts` — **insrc-build** (2026-10-14T13:08:37.126Z)
- `vscode-plugin/src/chat/chat-queue-worker.ts` — **insrc-build** (2026-10-14T13:08:37.126Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-14T13:08:37.126Z)

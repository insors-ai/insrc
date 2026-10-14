<!-- insrc:artifact BUILD-613abdb351c2c738-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-14T11:13:11.458Z  ·  **Updated:** 2026-10-14T11:25:37.825Z

**Commit:** 5028ef1e

## Summary

vscode-plugin/src/chat/turn-lifecycle.ts as the s1 LLD specifies. (1) The newest-wins supersede is removed: start() no longer aborts a turn waiting for the session lease; a start made while another start of this lifecycle is in progress is chained (it calls sink.onWaiting and awaits the previous start) and only then takes its generation, so the earlier turn is never dropped; a start with nothing in progress begins at once as before. stop() (through stopLive), detach() and invalidate() bump a chain epoch that a chained start checks when it resumes, so it is dropped and never spawns. (2) SpawnedCli { pid?, startedAt?, exited } and onSpawn? on TurnSink and FollowSink, called from run()'s onSpawn and follow()'s onAttach; exited settles on the process's exit and survives detach(); a process without a pid is reported without one; a throwing onSpawn is logged. Tests: the named test added; the tests that pinned the supersede (as the HLD lists: :205, :229, :728, :766, :984, and the superseded leg of :946) are rewritten to the chained behaviour with their old titles noted; the lifecycle suite passes 32/32. Five mutations each failed the tests (a sixth target did not match and was not run). Plugin typecheck clean. The chat-panel tests that pin the supersede at the host change in t5.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` — **insrc-build** (2026-10-14T11:25:37.825Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` — **insrc-build** (2026-10-14T11:25:37.825Z)
- `vscode-plugin/src/chat/__tests__/fixtures/queue-ack-child.mts` — **insrc-build** (2026-10-14T11:25:37.825Z)
- `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` — **insrc-build** (2026-10-14T11:25:37.825Z)
- `vscode-plugin/src/chat/chat-queue-store.ts` — **insrc-build** (2026-10-14T11:25:37.825Z)
- `vscode-plugin/src/chat/chat-queue-worker.ts` — **insrc-build** (2026-10-14T11:25:37.825Z)
- `vscode-plugin/src/chat/turn-lifecycle.ts` — **insrc-build** (2026-10-14T11:25:37.825Z)

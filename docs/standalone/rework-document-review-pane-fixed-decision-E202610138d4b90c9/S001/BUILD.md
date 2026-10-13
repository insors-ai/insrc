<!-- insrc:artifact BUILD-8d4b90c9ab301e66-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T12:12:45.679Z  ·  **Updated:** 2026-10-13T12:37:48.576Z

**Commit:** a509e0a3

## Summary

vscode-plugin/src/chat/chat-panel.ts: ChatPanelHost gains submitExternal(text) -> 'sent' | 'queued' | 'unavailable'. The host keeps a waiting list, a flag that says the webview has posted 'ready' since the channel was wired (false in wireChannel and when the channel is disposed), and a count of runTurn calls that have not yet called turns.start. drainExternal runs the first waiting message through runTurn (after supersedeQueuedApprovals, which rejects nothing because none is waiting and resets the grant chain as a typed message does) only when the webview is ready, the lifecycle is not busy, no runTurn is starting and the approval queue has no waiting request. It is called at the end of the sink's onTerminal (after runCompletedBatch), in onError, at a follow's end on both outcomes, after a permission decision (after runCompletedBatch), after the Stop control's turns.stop() resolves, after a chat switch has set the session, and at the end of 'ready'. The list is dropped with a logged warning naming how many when the panel is disposed or closed; it is kept when adopt() replaces the channel. A panel that is closed is opened; an open one is not revealed. One change in turn-lifecycle.ts beyond task 5: busy() is false before a turn's error is reported (onError), as it already was before onTerminal and onEnd; without it the drain in onError could never run. Two tests beyond the six named ones cover that (one in each test file). Each of four mutations (dropping the ready, busy, unanswered-request and failed-follow conditions) makes the matching named test fail. Plugin suite without forced exit: 1216 tests, 1206 pass, 8 skipped, 2 fail; both failures are in src/config/__tests__/manifest-catalog.test.ts and exist without this Story's changes. Both typechecks are clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/index.ts` — **insrc-build** (2026-10-13T12:37:48.576Z)
- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-13T12:37:48.576Z)
- `src/workflow/__tests__/feedback-carry-finalize.test.ts` — **insrc-build** (2026-10-13T12:37:48.576Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-13T12:37:48.576Z)
- `src/workflow/artifact-content.ts` — **insrc-build** (2026-10-13T12:37:48.576Z)
- `src/workflow/artifacts/companion/__tests__/header.test.ts` — **insrc-build** (2026-10-13T12:37:48.576Z)
- `src/workflow/artifacts/companion/header.ts` — **insrc-build** (2026-10-13T12:37:48.576Z)
- `src/workflow/artifacts/format/bindings.ts` — **insrc-build** (2026-10-13T12:37:48.576Z)
- `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` — **insrc-build** (2026-10-13T12:37:48.576Z)
- `src/workflow/artifacts/provenance/schema.ts` — **insrc-build** (2026-10-13T12:37:48.576Z)
- `src/workflow/artifacts/provenance/tool.ts` — **insrc-build** (2026-10-13T12:37:48.576Z)
- `src/workflow/artifacts/provenance/types.ts` — **insrc-build** (2026-10-13T12:37:48.576Z)
- `src/workflow/artifacts/provenance/writer.ts` — **insrc-build** (2026-10-13T12:37:48.576Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-13T12:37:48.576Z)
- `src/workflow/review-decision.ts` — **insrc-build** (2026-10-13T12:37:48.576Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-13T12:37:48.576Z)
- `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` — **insrc-build** (2026-10-13T12:37:48.576Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-13T12:37:48.576Z)
- `vscode-plugin/src/chat/turn-lifecycle.ts` — **insrc-build** (2026-10-13T12:37:48.576Z)

<!-- insrc:artifact BUILD-8d4b90c9ab301e66-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T12:12:45.679Z  ·  **Updated:** 2026-10-13T12:31:31.992Z

**Commit:** 7fda274d

## Summary

vscode-plugin/src/chat/turn-lifecycle.ts: TurnLifecycle gains busy(). It is true from start() until the turn's terminal event has been handed to the sink (set false before onTerminal), or until start returns on any other path; a superseded turn's end leaves it true because the newer turn owns it; stop(), detach() and invalidate() set it false at once; a follow counts while it is read and not aborted. FollowSink.onEnd now takes the outcome 'ended' or 'failed' and is called once on either path, after the follow is no longer in progress; a follow that stop() or detach() ended is not reported. A throwing onEnd is logged. The chat host's follow sink returns early on 'failed', so its behaviour is unchanged in this task (task 6 adds the drain). The existing test 'a failing resume keeps the cursor saved' was updated: it now expects the failed end to be reported, and still checks that the cursor stays saved. Plugin typecheck clean. Plugin suite: 1208 tests, 1198 pass, 8 skipped, 2 fail; both failures are in src/config/__tests__/manifest-catalog.test.ts and fail the same way without this task's changes.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/index.ts` — **insrc-build** (2026-10-13T12:31:31.992Z)
- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-13T12:31:31.992Z)
- `src/workflow/__tests__/feedback-carry-finalize.test.ts` — **insrc-build** (2026-10-13T12:31:31.992Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-13T12:31:31.992Z)
- `src/workflow/artifact-content.ts` — **insrc-build** (2026-10-13T12:31:31.992Z)
- `src/workflow/artifacts/companion/__tests__/header.test.ts` — **insrc-build** (2026-10-13T12:31:31.992Z)
- `src/workflow/artifacts/companion/header.ts` — **insrc-build** (2026-10-13T12:31:31.992Z)
- `src/workflow/artifacts/format/bindings.ts` — **insrc-build** (2026-10-13T12:31:31.992Z)
- `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` — **insrc-build** (2026-10-13T12:31:31.992Z)
- `src/workflow/artifacts/provenance/schema.ts` — **insrc-build** (2026-10-13T12:31:31.992Z)
- `src/workflow/artifacts/provenance/tool.ts` — **insrc-build** (2026-10-13T12:31:31.992Z)
- `src/workflow/artifacts/provenance/types.ts` — **insrc-build** (2026-10-13T12:31:31.992Z)
- `src/workflow/artifacts/provenance/writer.ts` — **insrc-build** (2026-10-13T12:31:31.992Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-13T12:31:31.992Z)
- `src/workflow/review-decision.ts` — **insrc-build** (2026-10-13T12:31:31.992Z)
- `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` — **insrc-build** (2026-10-13T12:31:31.992Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-13T12:31:31.992Z)
- `vscode-plugin/src/chat/turn-lifecycle.ts` — **insrc-build** (2026-10-13T12:31:31.992Z)

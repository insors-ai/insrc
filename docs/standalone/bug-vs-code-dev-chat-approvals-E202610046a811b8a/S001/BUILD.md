<!-- insrc:artifact BUILD-6a811b8acca60ac5-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-12T05:58:45.405Z  ·  **Updated:** 2026-10-12T06:00:19.431Z

**Commit:** 38001c26

## Summary

Added the optional resolution field to the approval-request TurnEvent; claude's permission_denied branch sets 'turn-ended' and normalizeApprovalEvent (control protocol and codex) sets 'in-turn'. The one adapter test pinning the event's key set now includes resolution.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-6a811b8acca60ac5-S001.json` — **insrc-build** (2026-10-12T06:00:19.431Z)
- `vscode-plugin/src/chat/__tests__/approval-queue.test.ts` — **insrc-build** (2026-10-12T06:00:19.431Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — **insrc-build** (2026-10-12T06:00:19.431Z)
- `vscode-plugin/src/chat/approval-queue.ts` — **insrc-build** (2026-10-12T06:00:19.431Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-10-12T06:00:19.431Z)
- `vscode-plugin/src/chat/stream-events.ts` — **insrc-build** (2026-10-12T06:00:19.431Z)

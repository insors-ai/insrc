<!-- insrc:artifact BUILD-83c85f38afad7843-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-10-25T17:24:18.514Z  ·  **Updated:** 2026-10-25T17:41:14.810Z

**Commit:** b4ed4ea1f

## Summary

Preserved chat replies after queued native results and across repeated reloads using request UUIDs and bounded retained-prefix recovery. Verified new/resumed installed-Claude turns, provider completion behavior and baseline-accounted plugin regressions.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/session-output.test.ts` — **insrc-build** (2026-10-25T17:47:00.211Z)
- `vscode-plugin/src/chat/session-output.ts` — **insrc-build** (2026-10-25T17:47:00.211Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` — **insrc-build** (2026-10-25T17:47:00.211Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — **insrc-build** (2026-10-25T17:47:00.211Z)
- `vscode-plugin/src/chat/__tests__/fixtures.ts` — **insrc-build** (2026-10-25T17:47:00.211Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-10-25T17:47:00.211Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-fault-injection.test.ts` — **insrc-build** (2026-10-25T17:47:00.211Z)

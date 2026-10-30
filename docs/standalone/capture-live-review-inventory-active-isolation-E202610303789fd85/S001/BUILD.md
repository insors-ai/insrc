<!-- insrc:artifact BUILD-3789fd85d0bbeb22-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-10-30T08:12:56.225Z  ·  **Updated:** 2026-10-30T08:50:35.361Z

**Commit:** 46ac5a0bf

## Summary

Paired control/restricted probes run serially through CliProvider with aggregate budget/deadline/retention bounds and exact phase pins. Strict export validation checks manifests, host receipts and runtime files. All 22 focused tests and TypeScript passed; commit 46ac5a0bf. No real model calls or activation.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/agent/providers/__tests__/claude-investigation-events.test.ts` — **insrc-build** (2026-10-30T08:50:35.361Z)
- `src/agent/providers/__tests__/native-investigation-fixtures.ts` — **insrc-build** (2026-10-30T08:50:35.361Z)
- `src/agent/providers/claude-investigation-events.ts` — **insrc-build** (2026-10-30T08:50:35.361Z)
- `src/agent/providers/claude-investigation-probe.ts` — **insrc-build** (2026-10-30T08:50:35.361Z)
- `src/agent/providers/claude-investigation-session.ts` — **insrc-build** (2026-10-30T08:50:35.361Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-30T08:50:35.361Z)
- `src/agent/providers/native-investigation-probe.ts` — **insrc-build** (2026-10-30T08:50:35.361Z)
- `src/daemon/__tests__/review-investigation-probe-fixtures.test.ts` — **insrc-build** (2026-10-30T08:50:35.361Z)
- `src/daemon/review-investigation-canaries.ts` — **insrc-build** (2026-10-30T08:50:35.361Z)
- `src/daemon/review-investigation-probe-fixtures.ts` — **insrc-build** (2026-10-30T08:50:35.361Z)
- `src/agent/providers/__tests__/native-investigation-probe.test.ts` — **insrc-build** (2026-10-30T08:50:35.361Z)
- `src/daemon/review-investigation-probe-export.ts` — **insrc-build** (2026-10-30T08:50:35.361Z)
- `src/shared/review-investigation-probe.ts` — **insrc-build** (2026-10-30T08:50:35.361Z)

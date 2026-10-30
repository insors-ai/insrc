<!-- insrc:artifact BUILD-c32aa60534232f36-s7 -->

# Build (plan-driven) — Story s7

**Standalone:** no  ·  **Created:** 2026-10-30T15:17:01.015Z  ·  **Updated:** 2026-10-30T15:17:01.015Z

**Commit:** df7c076c5

## Summary

Task1 adds compact private native inputs, host-owned evidence/expectation aliases, strict protocol binding and translation through the existing durable kernel. Existing native sessions and default selection remain unchanged. Build and affected fixture-only tests pass; full sweep stalled in unrelated suites and was stopped, not certified passing. Production compact qualification and real ACK pilot remain Task2 work.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/agent/providers/native-investigation-session.ts` — **insrc-build** (2026-10-30T15:17:01.015Z)
- `src/bin/insrc-review-bridge.ts` — **insrc-build** (2026-10-30T15:17:01.015Z)
- `src/daemon/review-investigation-bridge.ts` — **insrc-build** (2026-10-30T15:17:01.015Z)
- `src/daemon/review-investigation-compact.ts` — **insrc-build** (2026-10-30T15:17:01.015Z)
- `src/mcp/__tests__/review-investigation-compact.test.ts` — **insrc-build** (2026-10-30T15:17:01.015Z)
- `src/mcp/review-investigation-bridge.ts` — **insrc-build** (2026-10-30T15:17:01.015Z)
- `src/mcp/review-investigation-native.ts` — **insrc-build** (2026-10-30T15:17:01.015Z)
- `src/shared/review-investigation-catalog.ts` — **insrc-build** (2026-10-30T15:17:01.015Z)
- `src/shared/review-investigation-compact.ts` — **insrc-build** (2026-10-30T15:17:01.015Z)

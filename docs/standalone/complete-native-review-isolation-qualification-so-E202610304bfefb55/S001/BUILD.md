<!-- insrc:artifact BUILD-4bfefb556f0dc560-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-10-30T09:51:03.769Z  ·  **Updated:** 2026-10-30T10:21:28.220Z

**Commit:** 332fbfb12

## Summary

Independent v2 export reconstruction rejects changed proof/candidate/native/source/phase/runtime facts, and installed sessions recheck source policy before accepting scoped operations.63 affected scripted provider/adoption/recovery tests and full npm build passed. Commit332fbfb12. Actual installed qualification remains t4; no activation or legacy deletion.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/agent/providers/__tests__/claude-investigation-v2.test.ts` — **insrc-build** (2026-10-30T10:21:28.220Z)
- `src/agent/providers/__tests__/investigation-session.test.ts` — **insrc-build** (2026-10-30T10:21:28.220Z)
- `src/agent/providers/__tests__/native-investigation-fixtures.ts` — **insrc-build** (2026-10-30T10:21:28.220Z)
- `src/agent/providers/claude-investigation-policy.ts` — **insrc-build** (2026-10-30T10:21:28.220Z)
- `src/agent/providers/claude-investigation-probe.ts` — **insrc-build** (2026-10-30T10:21:28.220Z)
- `src/agent/providers/claude-investigation-session.ts` — **insrc-build** (2026-10-30T10:21:28.220Z)
- `src/agent/providers/investigation-session.ts` — **insrc-build** (2026-10-30T10:21:28.220Z)
- `src/agent/providers/native-investigation-probe.ts` — **insrc-build** (2026-10-30T10:21:28.220Z)
- `src/daemon/review-investigation-probe-export.ts` — **insrc-build** (2026-10-30T10:21:28.220Z)
- `src/daemon/review-investigation-probe-fixtures.ts` — **insrc-build** (2026-10-30T10:21:28.220Z)
- `src/shared/review-investigation-probe.ts` — **insrc-build** (2026-10-30T10:21:28.220Z)
- `src/shared/review-isolation-evidence.ts` — **insrc-build** (2026-10-30T10:21:28.220Z)
- `src/agent/providers/__tests__/native-investigation-probe.test.ts` — **insrc-build** (2026-10-30T10:21:28.220Z)
- `src/agent/providers/claude-investigation-diagnostics.ts` — **insrc-build** (2026-10-30T10:21:28.220Z)
- `src/agent/providers/claude-investigation-qualification.ts` — **insrc-build** (2026-10-30T10:21:28.220Z)
- `src/agent/providers/__tests__/claude-investigation-session.test.ts` — **insrc-build** (2026-10-30T10:21:28.220Z)
- `src/agent/providers/native-investigation-session.ts` — **insrc-build** (2026-10-30T10:21:28.220Z)

<!-- insrc:artifact BUILD-7aaf7e1b4a54e86f-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-10-29T20:03:05.623Z  ·  **Updated:** 2026-10-29T21:07:39.058Z

**Commit:** 609fdb21d

## Summary

Added read-only unsigned evidence export with retained file hashes and shared non-authoritative inspection, keeping authenticated qualification verify-before-file-access and private handle issuance unchanged. Launch identity is persisted before invocation. Added IPC-only operator client and independent attestation/approval/activation runbook; no signing, key generation, approval or engine changes occur.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/agent/providers/__tests__/investigation-probe-grant.test.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/agent/providers/investigation-probe-grant.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/shared/review-investigation-probe.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/daemon/__tests__/review-investigation-provider-lane.test.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/daemon/review-investigation-provider-lane.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/daemon/review-investigation-repository.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/daemon/__tests__/review-investigation-probe-fixtures.test.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/daemon/review-investigation-probe-fixtures.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/agent/providers/__tests__/native-investigation-probe.test.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/agent/providers/claude-investigation-session.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/agent/providers/codex-investigation-session.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/agent/providers/native-investigation-probe.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/shared/process-group.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/agent/providers/__tests__/claude-investigation-probe.test.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/agent/providers/claude-investigation-probe.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/agent/providers/__tests__/codex-investigation-probe.test.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/agent/providers/codex-investigation-probe.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/daemon/__tests__/helpers/probe-ipc-worker.mjs` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/daemon/__tests__/review-investigation-probe.test.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/daemon/review-investigation-gateway.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/daemon/review-investigation-probe.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `docs/review-investigation.md` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `scripts/review-investigation-probe.mjs` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/agent/providers/__tests__/investigation-session.test.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/agent/providers/investigation-session.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/daemon/__tests__/review-investigation-probe-export.test.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)
- `src/daemon/review-investigation-probe-export.ts` — **insrc-build** (2026-10-29T21:07:39.058Z)

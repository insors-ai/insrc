<!-- insrc:artifact BUILD-ce99b72065d03b1b-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-25T14:58:56.690Z  ·  **Updated:** 2026-10-25T15:11:02.264Z

**Commit:** 5aa9be4be

## Summary

Moved the daemon's fatal model-definitions validation from after worker start to just before the settings reconcile, proven by a real daemon boot in a temp home against a corrupted asset.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/assets/models/cloud-model-catalog.json` — **insrc-build** (2026-10-25T15:11:02.264Z)
- `src/daemon/__tests__/model-catalog-asset.test.ts` — **insrc-build** (2026-10-25T15:11:02.264Z)
- `src/daemon/__tests__/model-catalog.test.ts` — **insrc-build** (2026-10-25T15:11:02.264Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-25T15:11:02.264Z)
- `src/daemon/model-catalog.ts` — **insrc-build** (2026-10-25T15:11:02.264Z)
- `src/daemon/__tests__/model-registry.test.ts` — **insrc-build** (2026-10-25T15:11:02.264Z)
- `src/daemon/model-registry.ts` — **insrc-build** (2026-10-25T15:11:02.264Z)
- `src/shared/paths.ts` — **insrc-build** (2026-10-25T15:11:02.264Z)
- `src/daemon/threads/__tests__/helpers/registry-worker.ts` — **insrc-build** (2026-10-25T15:11:02.264Z)
- `src/daemon/threads/__tests__/worker-model-registry.test.ts` — **insrc-build** (2026-10-25T15:11:02.264Z)
- `src/daemon/threads/worker-entry.ts` — **insrc-build** (2026-10-25T15:11:02.264Z)
- `src/daemon/__tests__/boot-model-catalog.test.ts` — **insrc-build** (2026-10-25T15:11:02.264Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-25T15:11:02.264Z)

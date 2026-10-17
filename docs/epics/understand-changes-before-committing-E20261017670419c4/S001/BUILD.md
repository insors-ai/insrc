<!-- insrc:artifact BUILD-670419c4ad8bea8e-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-17T13:09:28.300Z  ·  **Updated:** 2026-10-17T13:29:01.179Z

**Commit:** 909b4bc2

## Summary

Mandatory service open secures the actual active GraphStore path, supports file and directory LMDB layouts, checks the lock file, and recovers before access. Six service tests plus 20 graph-store regressions pass; baseline failures remain recorded.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-b94cf2c9058fd82a-S001.json` — **insrc-build** (2026-10-17T13:29:01.179Z)
- `src/daemon/__tests__/queue-code-index-work.test.ts` — **insrc-build** (2026-10-17T13:29:01.179Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-17T13:29:01.179Z)

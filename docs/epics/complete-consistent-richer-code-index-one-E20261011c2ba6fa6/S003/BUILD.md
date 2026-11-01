<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-11-01T06:05:36.818Z  ·  **Updated:** 2026-11-01T07:54:54.491Z

**Commit:** 77571a318

## Summary

Added the MIGRATION_V5_TO_V6 step (SCHEMA_VERSION 5->6): walks the entity table once and backfills entityByFile for every row, idempotent via LMDB's no-op dupSort put of an already-present (key,value) pair.

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

- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S003/LLD.md` — **insrc-build** (2026-11-01T07:54:54.491Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S003/PLAN.md` — **insrc-build** (2026-11-01T07:54:54.491Z)

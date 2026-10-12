<!-- insrc:artifact BUILD-ddc4ede1dbf84626-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-12T07:35:29.855Z  ·  **Updated:** 2026-10-12T07:35:29.855Z

**Commit:** f14226ea

## Summary

Adds transcript-window.ts: latestWindow and pageBefore cut a page by one rule (100 rows back from the end of the range, then back to the nearest user row within 100 more, else the plain cut), with `before` clamped. PAGE_ROWS is a fixed constant. Nothing uses the module yet.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-ddc4ede1dbf84626-S001.json` — **insrc-build** (2026-10-12T07:35:29.855Z)

<!-- insrc:artifact BUILD-bd1c6c9005ff6390-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-17T09:39:24.421Z  ·  **Updated:** 2026-10-17T09:45:26.410Z

**Commit:** 5746ab7e

## Summary

walkNode credits calls made at module load (program-level statements including every test() body, program-level and exported declarations' non-function values, export default values) to the file entity, one CALLS per callee per file. The file-level scan skips every subtree that gets an entity of its own (function and class declarations and function-valued declarators, at any depth), so calls inside them, including ones declared in a top-level block or a test callback, keep only their own caller. Nine mutations each fail the tests.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/DEF-670419c4ad8bea8e.json` — **insrc-build** (2026-10-17T09:45:26.410Z)

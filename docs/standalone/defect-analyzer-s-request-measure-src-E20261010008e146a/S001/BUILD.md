<!-- insrc:artifact BUILD-008e146ad1475ef9-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-10T14:08:41.695Z  ·  **Updated:** 2026-10-10T14:11:59.702Z

**Commit:** b909bfb9

## Summary

The measure of a stored area now reads a symbol scope by its entity's id and a file scope by the entities of its file, counts only entities of the scope's repository, and falls back to the whole-repository read when the narrow read finds none, so every result is the one the whole read gives. The index check made while a code or docs scope is resolved is unchanged and is, through measureRequestScope, the only whole-repository read left for such a scope. One follow-up from the gate's note on t1 is included: a direct measure of one source with a signal already aborted returns before its pool is loaded. Five falsifying mutations were each caught.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-008e146ad1475ef9-S001.json` — **insrc-build** (2026-10-10T14:11:59.702Z)
- `src/analyze/__tests__/measure-pass.test.ts` — **insrc-build** (2026-10-10T14:11:59.702Z)
- `src/analyze/measure.ts` — **insrc-build** (2026-10-10T14:11:59.702Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-10T14:11:59.702Z)
- `src/config/__tests__/data-source-listing-timeout.test.ts` — **insrc-build** (2026-10-10T14:11:59.702Z)
- `src/config/analyze.ts` — **insrc-build** (2026-10-10T14:11:59.702Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-10T14:11:59.702Z)

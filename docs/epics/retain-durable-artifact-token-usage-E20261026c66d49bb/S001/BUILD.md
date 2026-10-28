<!-- insrc:artifact BUILD-c66d49bb81925886-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-26T13:03:05.535Z  ·  **Updated:** 2026-10-26T18:06:01.332Z

**Commit:** 323fb900a

## Summary

Full npm run build passed (tsc, native helpers, model-definition checks, asset copying), evidence /tmp/tu1-s1-t11-build.log and usage README. Public contract fixture now directly exercises correction, reconciliation, cumulative and transfer composition as well as attribution, identity/replay, unsupported input and ownership compatibility. Node 22.22.1 isolated packaging passed. Prior full-backend failures remain documented separately.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`
- ✓ `t10`
- ✓ `t11`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/usage/__tests__/fixtures/types-contract.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/__tests__/schema-contract.test.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/index.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/types.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/ledger-record.v1.avsc.json` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/ledger-record.v1.schema.json` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/schemas.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/__tests__/identity.test.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/canonical.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/__tests__/fixtures/domain-fixtures.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/__tests__/source-capabilities.test.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/__tests__/validation.test.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/capabilities.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/validation.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/__tests__/attribution.test.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/attribution.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/__tests__/domain-contract.test.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/__tests__/reducer.test.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/reducer.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/__tests__/reconciliation.test.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/basis.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/cumulative.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/__tests__/transfer-state.test.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/ownership.ts` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/__tests__/fixtures/source-capabilities.v1.json` — **insrc-build** (2026-10-26T18:06:01.332Z)
- `src/workflow/usage/README.md` — **insrc-build** (2026-10-26T18:06:01.332Z)

<!-- insrc:artifact BUILD-2f27754d4ad00b8e-s9 -->

# Build (plan-driven) — Story s9

**Standalone:** no  ·  **Created:** 2026-10-22T06:35:52.447Z  ·  **Updated:** 2026-10-22T11:49:26.392Z

**Commit:** fb26244a

## Summary

Added src/workflow/convert/stamps.ts (stampRule, applyStamps, anchorOf: epicCreatedAt from the Define, ISSUE or SPEC head, else the earliest record of a standalone design; no source is a problem, a stamp already there is kept) and amendments.ts (amendmentRule, applyAmendments, flatToHead: a flat AMD becomes a { meta, body, citations } head still carrying legacy stamps so the ordinary head migration gives it its lifecycle; pending becomes a draft, approvedBy and sideEffects are kept in the body; a record with no proposedAt, an unknown status, no amendment or no work-item head is a problem).

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
- ✓ `t12`
- ✓ `t13`
- ✓ `t14`
- ✓ `t17`
- ✓ `t18`
- ✓ `t19`
- ✓ `t20`
- ✓ `t21`
- ✓ `t15`
- ✓ `t16`
- ✓ `t22`
- ✓ `t23`
- ✓ `t24`
- ✓ `t25`
- ✓ `t26`
- ✓ `t27`
- ✓ `t28`
- ✓ `t29`
- ✓ `t30`
- ✓ `t31`
- ✓ `t32`
- ✓ `t33`
- ✓ `t34`
- ✓ `t35`
- ✓ `t36`
- ✓ `t37`
- ✓ `t38`
- ✓ `t39`
- ✓ `t40`
- ✓ `t41`
- ✓ `t42`
- ✓ `t43`
- ✓ `t44`
- ✓ `t45`
- ✓ `t46`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/CR-2f27754d4ad00b8e-s9.json` — **insrc-build** (2026-10-22T11:49:26.392Z)
- `docs/epics/one-common-model-every-artifact-E202610192f27754d/S009/CR.md` — **insrc-build** (2026-10-22T11:49:26.392Z)

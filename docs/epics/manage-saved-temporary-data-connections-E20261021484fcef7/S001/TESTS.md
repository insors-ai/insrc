<!-- insrc:artifact TESTS-484fcef7efaf229e-s1 -->

# Tests: 484fcef7efaf229e s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-24T08:30:48.653Z on commit `119d66734`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S1-A: per-driver profile matrix covers every listRegisteredKinds entry and preserves unexposed supported config.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-A: every registered kind has a grounded fail-closed field classification and preservation fixture | `src/daemon/db/__tests__/driver-field-audit.test.ts` |
| pass | SQLite file URLs preserve encoded pathname text and explicit path takes precedence | `src/daemon/db/__tests__/driver-field-audit.test.ts` |

**integration: CM-S1-L: static TypeScript import/alias/factory/acquire inventory with zero unclassified production sites; each classified use has metadata-only, full-use lease or bounded-private-probe rationale.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S1-L: typed production acquisition aliases and factory sites have explicit migration classifications | `src/daemon/db/__tests__/driver-field-audit.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/driver-field-audit.test.ts` | 0 | 3 | 6.2 s |  |

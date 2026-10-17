<!-- insrc:artifact TESTS-670419c4ad8bea8e-s1 -->

# Tests: 670419c4ad8bea8e s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-17T13:09:28.300Z on commit `cefc8ef4`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Identity source precedence, authority separation and no automatic merge**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Identity precedence preserves authority, case and distinct accounts | `src/understanding/__tests__/identity.test.ts` |
| pass | Incomplete provider discovery never selects an apparently unique account | `src/understanding/__tests__/identity.test.ts` |

**integration: Provider source matrix and available/disconnected/missing/failed adapters; Git/OS fallback**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Provider adapters distinguish available, disconnected, missing and failed sources | `src/understanding/__tests__/identity.test.ts` |
| pass | Local adapter reads effective repository Git email and falls back to OS without author substitution | `src/understanding/__tests__/identity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/understanding/__tests__/identity.test.ts` | 0 | 4 | 0.5 s |  |

<!-- insrc:artifact TESTS-50cde239426d6e2a-s3 -->

# Tests: 50cde239426d6e2a s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-19T11:17:23.419Z on commit `4665d920a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: ReviewTargets is exported with the exact documented field shape**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | is exported with the exact documented field shape | `src/workflow/artifact-core/__tests__/review-targets.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/review-targets.test.ts` | 0 | 2 | 0.9 s |  |

## t2

Run at 2026-11-19T11:21:21.247Z on commit `a4bfa64af`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a ReviewTargets built from a fresh Pointer list contains exactly those entries, nothing else**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a ReviewTargets built from a fresh Pointer list contains exactly those entries, nothing else | `src/workflow/artifact-core/__tests__/review-targets.test.ts` |

**unit: no builder, factory or merge function exists anywhere in ReviewTargets' exported surface (a1's deliberate absence of such an API)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | no builder, factory or merge function exists anywhere in ReviewTargets' exported surface (a1's deliberate absence of such an API) | `src/workflow/artifact-core/__tests__/review-targets.test.ts` |

**unit: two ReviewTargets instances built for consecutive rounds on the same artifact are independent objects sharing no entries by construction**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two ReviewTargets instances built for consecutive rounds on the same artifact are independent objects sharing no entries by construction | `src/workflow/artifact-core/__tests__/review-targets.test.ts` |

**unit: ReviewTargets' exported surface contains no validator, allow-list or restriction function of any kind that could cap investigation to entries**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ReviewTargets' exported surface contains no validator, allow-list or restriction function of any kind that could cap investigation to entries | `src/workflow/artifact-core/__tests__/review-targets.test.ts` |

**unit: a ReviewTargets with zero entries is structurally valid**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a ReviewTargets with zero entries is structurally valid | `src/workflow/artifact-core/__tests__/review-targets.test.ts` |

**unit: entries with a duplicate Pointer (same path and section) is accepted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | entries with a duplicate Pointer (same path and section) is accepted | `src/workflow/artifact-core/__tests__/review-targets.test.ts` |

**unit: entries mixing whole-file Pointers (no section) and region-pinned Pointers (section populated) is accepted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | entries mixing whole-file Pointers (no section) and region-pinned Pointers (section populated) is accepted | `src/workflow/artifact-core/__tests__/review-targets.test.ts` |

**integration: every ReviewTargets.entries[] Pointer can be passed directly to sc6's PointerPathValidator with no reshaping**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every ReviewTargets.entries[] Pointer can be passed directly to sc6's PointerPathValidator with no reshaping | `src/workflow/artifact-core/__tests__/review-targets.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/review-targets.test.ts` | 0 | 10 | 0.9 s |  |

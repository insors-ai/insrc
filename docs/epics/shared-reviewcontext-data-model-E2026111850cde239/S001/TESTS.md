<!-- insrc:artifact TESTS-50cde239426d6e2a-s1 -->

# Tests: 50cde239426d6e2a s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 13 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-19T08:54:23.219Z on commit `cbac31f46`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Locator, Pointer, StalenessResult and PathValidationResult are exported with the exact documented field shapes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | are exported with the exact documented field shapes | `src/workflow/artifact-core/__tests__/locator-pointer.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/locator-pointer.test.ts` | 0 | 3 | 0.8 s |  |

## t2

Run at 2026-11-19T09:48:46.341Z on commit `d25eec8e2`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: PointerStalenessCheck and PointerPathValidator are exported with their documented signatures and are pure (no I/O)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | are exported with their documented signatures and are pure (no I/O) | `src/workflow/artifact-core/__tests__/pointer-checks.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/pointer-checks.test.ts` | 0 | 11 | 0.4 s |  |

## t3

Run at 2026-11-19T09:04:09.713Z on commit `3ce40617f`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a Pointer with path + section (Locator) identifies both the file and the region**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Pointer with path + section (Locator) identifies both the file and the region | `src/workflow/artifact-core/__tests__/locator-pointer.test.ts` |

**unit: a Pointer with no section still identifies the whole file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Pointer with no section still identifies the whole file | `src/workflow/artifact-core/__tests__/locator-pointer.test.ts` |

**unit: a Locator with kind='symbol'/'lineRange'/'docSection' is accepted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Locator with kind='symbol'/'lineRange'/'docSection' is accepted | `src/workflow/artifact-core/__tests__/locator-pointer.test.ts` |

**unit: a Locator with an arbitrary future kind string is accepted and read via a non-exhaustive string-keyed lookup, not an exhaustive switch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Locator with an arbitrary future kind string is accepted and read via a non-exhaustive string-keyed lookup, not an exhaustive switch | `src/workflow/artifact-core/__tests__/locator-pointer.test.ts` |

**unit: PointerStalenessCheck returns stale:true when pointer.contentHash differs from currentContentHash**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | PointerStalenessCheck returns stale:true when pointer.contentHash differs from currentContentHash | `src/workflow/artifact-core/__tests__/pointer-checks.test.ts` |

**unit: PointerStalenessCheck returns stale:false when pointer.contentHash equals currentContentHash**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | PointerStalenessCheck returns stale:false when pointer.contentHash equals currentContentHash | `src/workflow/artifact-core/__tests__/pointer-checks.test.ts` |

**unit: PointerStalenessCheck returns stale:false when pointer.contentHash is absent (no hash was ever recorded)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | PointerStalenessCheck returns stale:false when pointer.contentHash is absent (no hash was ever recorded) | `src/workflow/artifact-core/__tests__/pointer-checks.test.ts` |

**unit: PointerStalenessCheck returns stale:true when pointer.contentHash is an empty string compared against a real hex digest**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | PointerStalenessCheck returns stale:true when pointer.contentHash is an empty string compared against a real hex digest | `src/workflow/artifact-core/__tests__/pointer-checks.test.ts` |

**unit: PointerStalenessCheck always returns the same stale value for the same two arguments (purity), only checkedAt varies**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | PointerStalenessCheck always returns the same stale value for the same two arguments (purity), only checkedAt varies | `src/workflow/artifact-core/__tests__/pointer-checks.test.ts` |

**unit: PointerPathValidator returns ok:true for a Pointer.path that resolves within registeredRepoRoot**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | PointerPathValidator returns ok:true for a Pointer.path that resolves within registeredRepoRoot | `src/workflow/artifact-core/__tests__/pointer-checks.test.ts` |

**unit: PointerPathValidator returns ok:false with a named violation for a Pointer.path containing '..' segments that resolves outside registeredRepoRoot**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | PointerPathValidator returns ok:false with a named violation for a Pointer.path containing '..' segments that resolves outside registeredRepoRoot | `src/workflow/artifact-core/__tests__/pointer-checks.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/locator-pointer.test.ts` | 0 | 7 | 0.9 s |  |
| `src/workflow/artifact-core/__tests__/pointer-checks.test.ts` | 0 | 9 | 0.4 s |  |

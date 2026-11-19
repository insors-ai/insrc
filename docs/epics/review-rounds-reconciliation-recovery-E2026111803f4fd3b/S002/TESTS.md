<!-- insrc:artifact TESTS-03f4fd3b9102aab8-s2 -->

# Tests: 03f4fd3b9102aab8 s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-19T18:42:19.290Z on commit `89027e8f3`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Finding and FindingCategory are exported with the exact documented field shapes, including the id field**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | are exported with the exact documented field shapes, including the id field | `src/workflow/review-round/__tests__/finding.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-round/__tests__/finding.test.ts` | 0 | 7 | 0.9 s |  |

## t2

Run at 2026-11-19T18:57:42.012Z on commit `0d33cc2c7`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: FindingCategory accepts exactly the five fixed categories (correctness, functional-completeness, security, quality, maintainability) and rejects any other category value at compile time**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | FindingCategory accepts exactly the five fixed categories (correctness, functional-completeness, security, quality, maintainability) and rejects any other category value at compile time | `src/workflow/review-round/__tests__/finding.test.ts` |

**unit: Finding.severity accepts any string value, including a review-type-specific custom severity scale outside HIGH/MED**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Finding.severity accepts any string value, including a review-type-specific custom severity scale outside HIGH/MED | `src/workflow/review-round/__tests__/finding.test.ts` |

**unit: DEFAULT_SEVERITY_SCALE names HIGH and MED as the documented fallback scale for a review type that declares none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DEFAULT_SEVERITY_SCALE names HIGH and MED as the documented fallback scale for a review type that declares none | `src/workflow/review-round/__tests__/finding.test.ts` |

**unit: Finding's exported shape contains exactly id, category and severity, and no other field of any kind**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Finding's exported shape contains exactly id, category and severity, and no other field of any kind | `src/workflow/review-round/__tests__/finding.test.ts` |

**unit: two Finding values with identical category and severity but different id values are distinct findings**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two Finding values with identical category and severity but different id values are distinct findings | `src/workflow/review-round/__tests__/finding.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-round/__tests__/finding.test.ts` | 0 | 7 | 0.8 s |  |

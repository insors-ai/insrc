<!-- insrc:artifact TESTS-b9d5c5c40df5a574-s2 -->

# Tests: b9d5c5c40df5a574 s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-09T16:31:36.297Z on commit `c5b16af1`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: sizeOfCounts gives each size at and just above each of the eight thresholds, takes the larger of the two sizes, never gives a smaller size for a larger count, and throws RangeError for a negative or fractional count (mutation: take the smaller of the two sizes)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sizeOfCounts gives each size at and just above each of the eight thresholds, takes the larger of the two sizes, never gives a smaller size for a larger count, and throws RangeError for a negative or fractional count (mutation: take the smaller of the two sizes) | `src/analyze/__tests__/measure.test.ts` |

**unit: measureNamedArea counts the entities of the scope's area and their distinct file paths for a repo, a module, a file and a symbol scope, and does not count the whole repo for a narrower scope (mutation: count every entity given)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | measureNamedArea counts the entities of the scope's area and their distinct file paths for a repo, a module, a file and a symbol scope, and does not count the whole repo for a narrower scope (mutation: count every entity given) | `src/analyze/__tests__/measure.test.ts` |

**unit: measureNamedArea gives XS with determined true for an area that holds nothing, and counts files by distinct path when the repo has no entity of kind 'file'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | measureNamedArea gives XS with determined true for an area that holds nothing, and counts files by distinct path when the repo has no entity of kind 'file' | `src/analyze/__tests__/measure.test.ts` |

**unit: measureLookupResults sums the returned counts of the outputs that carry a completeness record, counts each file once through filesNamedBy, records the characters, and adds nothing for a failed or unsupported lookup (mutation: count a failed lookup's partial findings)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | measureLookupResults sums the returned counts of the outputs that carry a completeness record, counts each file once through filesNamedBy, records the characters, and adds nothing for a failed or unsupported lookup (mutation: count a failed lookup's partial findings) | `src/analyze/__tests__/measure.test.ts` |

**unit: measureLookupResults gives a measure that is not determined, with size XL, when no output carries a completeness record**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | measureLookupResults gives a measure that is not determined, with size XL, when no output carries a completeness record | `src/analyze/__tests__/measure.test.ts` |

**unit: every measure records the hint it was given and the hint never changes the size, whether the hint is smaller or larger than the measured size (mutation: use the hint when it is larger)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every measure records the hint it was given and the hint never changes the size, whether the hint is smaller or larger than the measured size (mutation: use the hint when it is larger) | `src/analyze/__tests__/measure.test.ts` |

**unit: renderMeasureLine states the size, the source and the counts for each of the three sources, the characters for lookup results, the note when not determined, and the hint when one was given**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | renderMeasureLine states the size, the source and the counts for each of the three sources, the characters for lookup results, the note when not determined, and the hint when one was given | `src/analyze/__tests__/measure.test.ts` |

**unit: filesNamedBy returns the file paths of a fixture of every lookup output type, none for the three data outputs and for a failed or unsupported output, and is a switch the compiler checks for every member of the output union**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | filesNamedBy returns the file paths of a fixture of every lookup output type, none for the three data outputs and for a failed or unsupported output, and is a switch the compiler checks for every member of the output union | `src/analyze/__tests__/measure.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/__tests__/measure.test.ts` | 0 | 8 | 0.6 s |  |

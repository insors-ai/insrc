<!-- insrc:artifact TESTS-e4af63128c7cbec2-s1 -->

# Tests: e4af63128c7cbec2 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-09T07:52:13.312Z on commit `1191a5352`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts: unverified admission and resource guards preserve pinned code history and refuse approval**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | unverified admission and resource guards preserve pinned code history and refuse approval | `src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts` |

**unit: src/shared/__tests__/review-resources.test.ts: bounded exact review lease and clearance receipt contracts reject invalid input**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bounded exact review lease and clearance receipt contracts reject invalid input | `src/shared/__tests__/review-resources.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/review-resources.test.ts` | 0 | 1 | 0.6 s |  |
| `src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts` | 0 | 1 | 1 s |  |

## t2

Run at 2026-11-09T08:05:19.987Z on commit `81edc5d07`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts: historical design attempts and unverified admission retain separate semantics**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | historical design attempts and unverified admission retain separate semantics | `src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts` |

**unit: src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts: serialized resource and progress updates cannot lose open intents**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | serialized resource and progress updates cannot lose open intents | `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts` | 0 | 1 | 0.8 s |  |
| `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` | 0 | 5 | 0.8 s |  |

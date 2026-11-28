<!-- insrc:artifact TESTS-4b33600426ce4112-s1 -->

# Tests: 4b33600426ce4112 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-28T09:32:39.162Z on commit `e906a32fe`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: exec-stand-in keeps its server ref'd while installed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | exec-stand-in keeps its server ref'd while installed, an awaited gh call resolves, and remove() tears it down | `src/workflow/__tests__/helpers/exec-stand-in.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/helpers/exec-stand-in.test.ts` | 0 | 1 | 0.5 s |  |

## t2

Run at 2026-11-28T09:46:37.745Z on commit `6eabac620`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: bare sweep with the default timeout terminates and reports every file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | package.json test:sweep runs the node test runner with a finite --test-timeout | `scripts/__tests__/test-sweep.test.ts` |
| pass | npm run test:sweep terminates and reports every requested file | `scripts/__tests__/test-sweep.test.ts` |
| pass | a stuck file is failed at the per-test timeout and cannot block the sweep | `scripts/__tests__/test-sweep.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/test-sweep.test.ts` | 0 | 3 | 4 s |  |

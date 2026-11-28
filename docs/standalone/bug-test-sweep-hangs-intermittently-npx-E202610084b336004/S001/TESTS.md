<!-- insrc:artifact TESTS-4b33600426ce4112-s1 -->

# Tests: 4b33600426ce4112 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 8 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

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

Run at 2026-11-28T12:02:40.762Z on commit `016f92780`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

## t3

Run at 2026-11-28T12:37:24.878Z on commit `64065828d`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: repro sweep finishes within the bound on every attempt**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/smoke-sweep-comparison2.txt protocol note + per-run TAP files /tmp/smoke2-*.tap: baseline 2/2 killed at 300s no summary (hang); postfix 2/2 self-terminated 135s/144s full TAP, timeout-fired stragglers 3 and 9 reported at 120000ms, all under a common 300s outer deadline with identical 439-file selection.

## t4

Run at 2026-11-28T12:17:33.775Z on commit `9cc97b3f6`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: harness run of the touched helper file passes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | exec-stand-in keeps its server ref'd while installed, an awaited gh call resolves, and remove() tears it down | `src/workflow/__tests__/helpers/exec-stand-in.test.ts` |
| pass | package.json test:sweep runs the node test runner with a finite --test-timeout | `scripts/__tests__/test-sweep.test.ts` |
| pass | npm run test:sweep terminates and reports every requested file | `scripts/__tests__/test-sweep.test.ts` |
| pass | a stuck file is failed at the per-test timeout and cannot block the sweep | `scripts/__tests__/test-sweep.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/test-sweep.test.ts` | 0 | 3 | 4 s |  |
| `src/workflow/__tests__/helpers/exec-stand-in.test.ts` | 0 | 1 | 0.5 s |  |

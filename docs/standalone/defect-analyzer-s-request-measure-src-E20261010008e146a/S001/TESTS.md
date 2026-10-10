<!-- insrc:artifact TESTS-008e146ad1475ef9-S001 -->

# Tests: 008e146ad1475ef9 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 17 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-10T14:08:41.695Z on commit `169e973a`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a live source whose listing never returns, and one that is never reached, is reported as not determined after the time limit with the reason that the listing timed out, and is never a count**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a live source whose listing never returns, and one that is never reached, is reported as not determined after the time limit with the reason that the listing timed out, and is never a count | `src/analyze/__tests__/measure-pass.test.ts` |

**unit: a request cancelled while a source is being measured stops at once and the remaining sources of a pool are not asked; a signal already aborted reads nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a request cancelled while a source is being measured stops at once and the remaining sources of a pool are not asked; a signal already aborted reads nothing | `src/analyze/__tests__/measure-pass.test.ts` |

**unit: one stalled connection among several does not stop the others from being measured, each has its own time limit, and the sum is not a count**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | one stalled connection among several does not stop the others from being measured, each has its own time limit, and the sum is not a count | `src/analyze/__tests__/measure-pass.test.ts` |

**unit: the rejection of a listing abandoned after its time limit is caught and is not an unhandled rejection**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the rejection of a listing abandoned after its time limit is caught and is not an unhandled rejection | `src/analyze/__tests__/measure-pass.test.ts` |

**unit: the time limit comes from the setting, a value in the options replaces it, and a value that cannot be a time limit gives the default of 120 seconds**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the time limit comes from the setting, a value in the options replaces it, and a value that cannot be a time limit gives the default of 120 seconds | `src/analyze/__tests__/measure-pass.test.ts` |
| pass | the time limit comes from the setting, a value in the options replaces it, and a value that cannot be a time limit gives the default of 120 seconds | `src/config/__tests__/data-source-listing-timeout.test.ts` |

**unit: the setting analyzer.dataSourceListingTimeoutMs is in the configuration catalog as a number with a default of 120000**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the setting analyzer.dataSourceListingTimeoutMs is in the configuration catalog as a number with a default of 120000 | `src/config/__tests__/data-source-listing-timeout.test.ts` |
| pass | the real CONFIG_CATALOG has 37 rows (flat models.* surface; shaper*/summariser* now derived; + codeReview.enforce + codeReview.freshnessTimeoutMs + models.local.embeddingKeepAlive + five designReview.* rows + analyzer.dataSourceListingTimeoutMs) | `src/config/__tests__/config-catalog-contract.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/__tests__/measure-pass.test.ts` | 0 | 13 | 2.6 s |  |
| `src/config/__tests__/config-catalog-contract.test.ts` | 0 | 10 | 0.4 s |  |
| `src/config/__tests__/data-source-listing-timeout.test.ts` | 0 | 2 | 0.5 s |  |

## t2

Run at 2026-10-10T14:11:59.702Z on commit `b909bfb9`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a symbol scope is measured with one read by id and a file scope with the read of that file's entities; the measure of a resolved scope (measureResolvedScope) asks the store for every entity of the repository in neither case, and the counts and the size equal those of the whole-repository read; driven through measureRequestScope for a code request, the index check of the scope resolution is the only whole-repository read**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a symbol scope is measured with one read by id and a file scope with the read of that file's entities; the measure of a resolved scope (measureResolvedScope) asks the store for every entity of the repository in neither case, and the counts and the size equal those of the whole-repository read; driven through measureRequestScope for a code request, the index check of the scope resolution is the only whole-repository read | `src/analyze/__tests__/measure-pass.test.ts` |

**unit: a symbol or file scope whose narrow read finds nothing, or finds entities of another repository only, is read as before with the same result; a repo, module or directory scope is read as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a symbol or file scope whose narrow read finds nothing, or finds entities of another repository only, is read as before with the same result; a repo, module or directory scope is read as before | `src/analyze/__tests__/measure-pass.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/__tests__/measure-pass.test.ts` | 0 | 15 | 4.4 s |  |

## t3

Run at 2026-10-10T14:18:34.157Z on commit `15a3b403`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: a run takes one measure of the area it names: the context builder uses the measure it is handed and does not measure, and the size of its planning call is the size on the run's intent; the plan RPC hands its measure to the builder in the same way**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a run takes one measure of the area it names: the context builder uses the measure it is handed and does not measure, and the size of its planning call is the size on the run's intent; the plan RPC hands its measure to the builder in the same way | `src/analyze/context/__tests__/pipeline-outcome.test.ts` |
| pass | a run takes one measure of the area it names: the context builder uses the measure it is handed and does not measure, and the size of its planning call is the size on the run's intent; the plan RPC hands its measure to the builder in the same way | `src/analyze/orchestrator/__tests__/run-measure.test.ts` |
| pass | a run takes one measure of the area it names: the context builder uses the measure it is handed and does not measure, and the size of its planning call is the size on the run's intent; the plan RPC hands its measure to the builder in the same way | `src/daemon/__tests__/analyze-rpc-measure.test.ts` |

**integration: a caller that hands the context builder no measure, or a measure of lookup results, is measured by the builder as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a caller that hands the context builder no measure, or a measure of lookup results, is measured by the builder as before | `src/analyze/context/__tests__/pipeline-outcome.test.ts` |

**integration: the bundle cache key is the same with and without a handed measure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the bundle cache key is the same with and without a handed measure | `src/analyze/context/__tests__/lookup-measure.test.ts` |

**integration: the run driver passes its signal to the measure and to the recursive planner, and the planner passes it to the measure of each child plan**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the run driver passes its signal to the measure and to the recursive planner, and the planner passes it to the measure of each child plan | `src/analyze/orchestrator/__tests__/run-measure.test.ts` |
| pass | the run driver passes its signal to the measure and to the recursive planner, and the planner passes it to the measure of each child plan | `src/analyze/planner/__tests__/recursive.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/lookup-measure.test.ts` | 0 | 4 | 1.1 s |  |
| `src/analyze/context/__tests__/pipeline-outcome.test.ts` | 0 | 17 | 0.7 s |  |
| `src/analyze/orchestrator/__tests__/run-measure.test.ts` | 0 | 3 | 1.1 s |  |
| `src/analyze/planner/__tests__/recursive.test.ts` | 0 | 13 | 0.7 s |  |
| `src/daemon/__tests__/analyze-rpc-measure.test.ts` | 0 | 3 | 1.2 s |  |

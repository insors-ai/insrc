<!-- insrc:artifact TESTS-008e146ad1475ef9-S001 -->

# Tests: 008e146ad1475ef9 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

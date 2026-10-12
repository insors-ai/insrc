<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s11 -->

# Tests: c2ba6fa62a148ed1 s11

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 26 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-12T11:26:57.256Z on commit `9f1697eb`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: review stream module: ReviewStreamError from src/shared/review-stream.ts is the same class daemon-stream.ts exports, and the routing tests pass unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review stream module: ReviewStreamError from src/shared/review-stream.ts is the same class daemon-stream.ts exports, and the routing tests pass unchanged | `src/shared/__tests__/review-stream.test.ts` |
| pass | T11 a daemon review that fails (timeout) is an error: nothing stamped, no controller loop offered | `src/mcp/review-step/__tests__/review-step-routing.test.ts` |
| pass | T11 against an older daemon (a plain unknown-method line, socket kept open) the tool fails at once with the update message | `src/mcp/review-step/__tests__/review-step-routing.test.ts` |
| pass | T17 a diff the daemon cannot read comes back as a failed daemon review naming the cause; nothing is stamped | `src/mcp/code-review-step/__tests__/routing.test.ts` |
| pass | T11 the tool waits 30 minutes: with a daemon that never answers it fails when that limit fires | `src/mcp/code-review-step/__tests__/routing.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/code-review-step/__tests__/routing.test.ts` | 0 | 21 | 0.7 s |  |
| `src/mcp/review-step/__tests__/review-step-routing.test.ts` | 0 | 20 | 0.5 s |  |
| `src/shared/__tests__/review-stream.test.ts` | 0 | 1 | 0.4 s |  |

## t2

Run at 2026-10-12T11:35:47.361Z on commit `dcecd4d1`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: vector store owner rule: live path refused with no declaration and nothing created; opens after declareLiveStoreOwner; a temporary path opens; relative path and symbolic link refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vector store owner rule: live path refused with no declaration and nothing created; opens after declareLiveStoreOwner; a temporary path opens; relative path and symbolic link refused | `src/db/lance/__tests__/live-vector-store-owner.test.ts` |
| pass | vector store owner rule: the graph store's temporary reader allowance does not open the live vector store | `src/db/lance/__tests__/live-vector-store-owner.test.ts` |

**integration: no test opens the live vector store: each repaired test file run in a temporary home leaves no lance directory**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | no test opens the live vector store: each repaired test file run in a temporary home leaves no lance directory | `src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts` |
| pass | the check sees a vector store that IS opened at the default path | `src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/lance/__tests__/live-vector-store-owner.test.ts` | 0 | 2 | 1 s |  |
| `src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts` | 0 | 2 | 30.7 s |  |

## t3

Run at 2026-10-12T11:43:13.587Z on commit `62ccb310`. Tests check: **passed**. 17 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: moved analyze tests pass at src/daemon/steps (the analyze-step suite, bundle-md, and the repointed importers and source scans)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a missing answer prompt after the lookups ran returns a non-retryable error with the results and the report, from the plan phase and from the narrow phase | `src/daemon/steps/__tests__/analyze-step-answer-prompt-missing.test.ts` |
| pass | the step tool's bundle phase attaches the report it derives from its state and rejects an agent-supplied one as 'bundle-schema' | `src/daemon/steps/__tests__/analyze-step-bundle-report.test.ts` |
| pass | stepPlan with a lookup whose prepare throws records the failed output and goes on to the next lookup (mutation: remove the conversion) | `src/daemon/steps/__tests__/analyze-step-failed-lookup.test.ts` |
| pass | handler rejects non-object input | `src/daemon/steps/__tests__/analyze-step-handler.test.ts` |
| pass | the step tool carries a caller's stated size in its state token from the start phase to the bundle phase and the answer turn, whose reports give the measured size with that hint; a token minted before the change still decodes | `src/daemon/steps/__tests__/analyze-step-measure.test.ts` |
| pass | state codec round-trips awaiting_narrow with preparedBlob + resumeState | `src/daemon/steps/__tests__/analyze-step-narrow.test.ts` |
| pass | step tool start phase: resolved workspace scope, and the pairing test refusing a stand-in scope | `src/daemon/steps/__tests__/analyze-step-scope.test.ts` |
| pass | encodeState + decodeState round-trip preserves every field | `src/daemon/steps/__tests__/analyze-step-state.test.ts` |
| pass | render includes the meta comment prefix by default | `src/daemon/steps/__tests__/bundle-md.test.ts` |
| pass | every writer of an answer's head (the run context's markdown, both writers of the bundle's markdown, the step tool's answer turn, both writers of the workflow runner, and the plan tree's final report) carries the measure line under the completeness line; the plan tree's merged report carries the run's measure; and a report or a run record stored before the change is read as it is | `src/analyze/__tests__/report-head.test.ts` |
| pass | executor dispatches to the registered runner | `src/analyze/explore/__tests__/executor-lmdb.test.ts` |
| pass | the daemon's error payload, the one-shot tool's message and the workflow runner's step failure carry the report and the reason | `src/daemon/__tests__/answer-step-failed-callers.test.ts` |
| pass | the context builder gives the planning call the size of the named-area measure, gives the answer step the size of the measure from lookup results, and puts that measure in the report, as do the step tool's bundle phase and answer turn; the one-shot tool, the step tool and the workflow runner set no size of their own; the free-form lookup uses the request size its runner context carries and, when it carries none, measures its resolved scope or a repo scope at its repo path | `src/analyze/context/__tests__/lookup-measure.test.ts` |
| pass | a source scan finds no call that picks a size with a model and no literal default size at the four places that set M today (mutation: restore one default) | `src/analyze/classifier/__tests__/no-size.test.ts` |
| pass | no source file under src/daemon/steps/analyze-step writes a literal schema version | `src/analyze/context/__tests__/bundle-report-schema.test.ts` |
| pass | the one-shot tool and the workflow runner state no size of their own and their answers carry the measure line; a run-level request needs no size on its intent, and a run and a plan request for the same scope share one cached run bundle | `src/daemon/__tests__/analyze-rpc-measure.test.ts` |
| pass | the MCP step and review tests, found by the full audit, create nothing at the default path | `src/db/graph/__tests__/no-live-store-in-tests.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/__tests__/report-head.test.ts` | 0 | 1 | 0.8 s |  |
| `src/analyze/classifier/__tests__/no-size.test.ts` | 0 | 2 | 0.6 s |  |
| `src/analyze/context/__tests__/bundle-report-schema.test.ts` | 0 | 3 | 0.4 s |  |
| `src/analyze/context/__tests__/lookup-measure.test.ts` | 0 | 4 | 0.9 s |  |
| `src/analyze/explore/__tests__/executor-lmdb.test.ts` | 0 | 9 | 1.4 s |  |
| `src/daemon/__tests__/analyze-rpc-measure.test.ts` | 0 | 3 | 1 s |  |
| `src/daemon/__tests__/answer-step-failed-callers.test.ts` | 0 | 3 | 0.6 s |  |
| `src/daemon/steps/__tests__/analyze-step-answer-prompt-missing.test.ts` | 0 | 2 | 0.7 s |  |
| `src/daemon/steps/__tests__/analyze-step-bundle-report.test.ts` | 0 | 1 | 0.5 s |  |
| `src/daemon/steps/__tests__/analyze-step-failed-lookup.test.ts` | 0 | 7 | 1.2 s |  |
| `src/daemon/steps/__tests__/analyze-step-handler.test.ts` | 0 | 8 | 0.6 s |  |
| `src/daemon/steps/__tests__/analyze-step-measure.test.ts` | 0 | 1 | 0.7 s |  |
| `src/daemon/steps/__tests__/analyze-step-narrow.test.ts` | 0 | 4 | 0.6 s |  |
| `src/daemon/steps/__tests__/analyze-step-scope.test.ts` | 0 | 3 | 0.7 s |  |
| `src/daemon/steps/__tests__/analyze-step-state.test.ts` | 0 | 11 | 0.5 s |  |
| `src/daemon/steps/__tests__/bundle-md.test.ts` | 0 | 8 | 0.3 s |  |
| `src/db/graph/__tests__/no-live-store-in-tests.test.ts` | 0 | 5 | 5.9 s |  |

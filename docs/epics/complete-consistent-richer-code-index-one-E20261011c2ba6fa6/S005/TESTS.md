<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s5 -->

# Tests: c2ba6fa62a148ed1 s5

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 59 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-10-13T11:53:21.419Z on commit `e3612253`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: OllamaProvider: a connection refused / socket hang up / stream ended early is raised as ModelCallFailedError**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | OllamaProvider: complete() raises a connection refused and a socket hang up (after its retry) as ModelCallFailedError | `src/agent/providers/__tests__/ollama-model-call-failure.test.ts` |
| pass | OllamaProvider: completeStructured failures on the call and during iteration are raised as ModelCallFailedError | `src/agent/providers/__tests__/ollama-model-call-failure.test.ts` |

**unit: OllamaProvider: a socket failure during stream iteration is raised as ModelCallFailedError**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | OllamaProvider: stream creation and stream iteration failures are raised as ModelCallFailedError with the client error as cause | `src/agent/providers/__tests__/ollama-model-call-failure.test.ts` |

**unit: retry helper: a ModelCallFailedError on the last attempt is re-thrown as a ModelCallFailedError with the attempt prefix**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | retry helper: a ModelCallFailedError on the last attempt is re-thrown as a ModelCallFailedError with the attempt prefix | `src/agent/providers/__tests__/ollama-model-call-failure.test.ts` |
| pass | retry helper: a shape failure on the last attempt stays a plain Error even after an earlier failed call | `src/agent/providers/__tests__/ollama-model-call-failure.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/ollama-model-call-failure.test.ts` | 0 | 5 | 5.5 s |  |

## t2

Run at 2026-10-13T12:33:07.673Z on commit `7589466b`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: isModelCallFailure: a validation message quoting 'ECONNREFUSED' / 'Model not found' / 'EPIPE' / 'fetch failed' without ' text=' is not a failed call; a ModelCallFailedError from the local provider, bare and behind the retry helper's prefix, is**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | isModelCallFailure: a validation message quoting 'ECONNREFUSED' / 'Model not found' / 'EPIPE' / 'fetch failed' without ' text=' is not a failed call; a ModelCallFailedError from the local provider, bare and behind the retry helper's prefix, is | `src/analyze/context/__tests__/model-failure.test.ts` |
| pass | what the model WROTE is not evidence about the call: a quoted answer is never matched | `src/analyze/context/__tests__/model-failure.test.ts` |

**unit: isModelCallFailure: a plain 'structured-output: ... attempts: Model call failed: ...' message is a failed call**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | isModelCallFailure: a plain 'structured-output: ... attempts: Model call failed: ...' message is a failed call | `src/analyze/context/__tests__/model-failure.test.ts` |

**unit: each consumer family of isModelCallFailure (the classifier, the planner, the summariser, the aggregator, the synthesizer and the decomposer) on a stand-in Ollama socket failure still reports the model as unavailable, not a shape failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | each consumer family of isModelCallFailure (the classifier, the planner, the summariser, the aggregator, the synthesizer and the decomposer) on a stand-in Ollama socket failure still reports the model as unavailable, not a shape failure | `src/analyze/context/__tests__/model-failure.test.ts` |
| pass | each of the five callers classifies a CLI call failure as its model-unavailable error and a shape failure as its schema error | `src/analyze/context/__tests__/model-failure-callers.test.ts` |
| pass | classifyError: Ollama-down patterns -> aggregator-llm-unavailable | `src/analyze/runtimes/shared/__tests__/aggregator.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/model-failure-callers.test.ts` | 0 | 3 | 0.7 s |  |
| `src/analyze/context/__tests__/model-failure.test.ts` | 0 | 11 | 0.6 s |  |
| `src/analyze/runtimes/shared/__tests__/aggregator.test.ts` | 0 | 23 | 0.5 s |  |

## t3

Run at 2026-10-13T12:39:56.293Z on commit `9ebe0d95`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: classifyOllamaError: a CLI provider's failure in the tool loop reads 'The model call for the tool loop failed: ...' and does not mention Ollama; an Ollama failure's own detail is kept**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | classifyOllamaError: a CLI provider's failure in the tool loop reads 'The model call for the tool loop failed: ...' and does not mention Ollama; an Ollama failure's own detail is kept | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | ShaperLlmUnavailableError message names the call, never a provider | `src/analyze/context/__tests__/shaper-errors.test.ts` |

**unit: classifyOllamaError from runFinalStructuredEmit reads 'The model call for the final structured emit failed: ...'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | classifyOllamaError from runFinalStructuredEmit reads 'The model call for the final structured emit failed: ...' | `src/analyze/context/__tests__/driver-unit.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/driver-unit.test.ts` | 0 | 31 | 0.8 s |  |
| `src/analyze/context/__tests__/shaper-errors.test.ts` | 0 | 4 | 0.6 s |  |

## t4

Run at 2026-10-13T12:45:35.350Z on commit `2cec35d1`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: runShaper: a lastIndexedAt that throws ends as ShaperIndexStateReadError (code 'index-state-read-failed'), through the one injectable reader (PipelineSteps.lastIndexedAt), at runShaper's freshness read and inside the pipeline**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runShaper: a lastIndexedAt that throws ends as ShaperIndexStateReadError (code 'index-state-read-failed'), through the one injectable reader (PipelineSteps.lastIndexedAt), at runShaper's freshness read and inside the pipeline | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |

**unit: pipeline: an executePlan that throws ends as ShaperLookupFailedError (code 'lookup-failed'); PIPELINE_CAUSES and errorForPipelineCause have one case per member**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | pipeline: an executePlan that throws ends as ShaperLookupFailedError (code 'lookup-failed'); PIPELINE_CAUSES and errorForPipelineCause have one case per member | `src/analyze/context/__tests__/pipeline-outcome.test.ts` |
| pass | cause-to-error table: one case per cause, ShaperLlmUnavailableError only for a failed planning call | `src/analyze/context/__tests__/pipeline-outcome.test.ts` |

**unit: classifyShaperError: index-state-read-failed and lookup-failed map to their own codes in both mappings**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | classifyShaperError: index-state-read-failed and lookup-failed map to their own codes in both mappings | `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` |
| pass | the cause codes are declared in both lists | `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` |

**unit: runAnalyze: index-state-read-failed and lookup-failed end with their own codes, not internal-error**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runAnalyze: index-state-read-failed and lookup-failed end with their own codes, not internal-error | `src/analyze/orchestrator/__tests__/shaper-causes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/pipeline-outcome.test.ts` | 0 | 18 | 0.8 s |  |
| `src/analyze/context/__tests__/run-shaper-wiring.test.ts` | 0 | 10 | 1.7 s |  |
| `src/analyze/orchestrator/__tests__/shaper-causes.test.ts` | 0 | 1 | 0.7 s |  |
| `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` | 0 | 8 | 0.6 s |  |

## t5

Run at 2026-10-13T13:01:23.220Z on commit `a73aee5a`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: registry codec: a row with lastRun round-trips; an older row without it decodes with lastRun undefined**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | registry codec: a row with lastRun round-trips; an older row without it decodes with lastRun undefined | `src/db/graph/__tests__/codec.test.ts` |
| pass | repo row round-trip | `src/db/graph/__tests__/codec.test.ts` |

**unit: registry codec: decodeRepoRow keeps lastRun, and a status write without lastRun keeps the stored one**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | registry codec: decodeRepoRow keeps lastRun, and a status write without lastRun keeps the stored one | `src/db/__tests__/repos-lmdb.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/repos-lmdb.test.ts` | 0 | 26 | 2.7 s |  |
| `src/db/graph/__tests__/codec.test.ts` | 0 | 20 | 0.4 s |  |

## t6

Run at 2026-10-13T13:05:58.188Z on commit `c9614ed3`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: full index: during a run the in-process record shows began and files done of selected; at the end the registry row's lastRun is written once with outcome 'completed' or 'failed' (a forced failure mid-walk), and the record is closed; no write per file (counted)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | full index: during a run the in-process record shows began and files done of selected; at the end the registry row's lastRun is written once with outcome 'completed' or 'failed' (a forced failure mid-walk), and the record is closed; no write per file (counted) | `src/indexer/__tests__/index-run-record.test.ts` |

**integration: reindex of a ready repository: status indexing and the running record carries the new run's figures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reindex of a ready repository: status indexing and the running record carries the new run's figures | `src/indexer/__tests__/index-run-record.test.ts` |

**unit: start-up re-queue: repositories left indexing without lastIndexed are still re-queued, unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | start-up re-queue: repositories left indexing without lastIndexed are still re-queued, unchanged | `src/indexer/__tests__/index-run-record.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/index-run-record.test.ts` | 0 | 3 | 1.1 s |  |

## t7

Run at 2026-10-13T13:11:56.874Z on commit `d721fee2`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: ensureNonEmptyClosure: status 'indexing' (with and without entities) throws RepoIndexingError with the running record's figures; 'indexing' with no record says the figures are not known; 'error' with lastRun.outcome 'failed' throws with lastRun's figures and error; 'pending' and 'ready' with no entities keep ScopeNotIndexedError and its message**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ensureNonEmptyClosure: status 'indexing' (with and without entities) throws RepoIndexingError with the running record's figures; 'indexing' with no record says the figures are not known; 'error' with lastRun.outcome 'failed' throws with lastRun's figures and error; 'pending' and 'ready' with no entities keep ScopeNotIndexedError and its message | `src/analyze/context/__tests__/invariants.test.ts` |

**unit: ensureRepoQueryable: a docs / data / infra / generic run on a repository under index is refused; an 'error' row without lastRun is refused with figures unknown and its errorMsg**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ensureRepoQueryable: a docs / data / infra / generic run on a repository under index is refused; an 'error' row without lastRun is refused with figures unknown and its errorMsg | `src/analyze/context/__tests__/invariants.test.ts` |

**unit: ensureRepoQueryable: a registry read that throws, and a pristine registry, skip the check (no refusal, no raw error)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ensureRepoQueryable: a registry read that throws, and a pristine registry, skip the check (no refusal, no raw error) | `src/analyze/context/__tests__/invariants.test.ts` |
| pass | ensureNonEmptyClosure: with readers the check keeps its leniency for a registry that cannot be read or holds no repo | `src/analyze/context/__tests__/invariants.test.ts` |

**unit: plan walk: the walker (executor/walker.ts) records a task whose scope's repository is under index with code 'repo-indexing' through taskRefusalMapping**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | plan walk: the walker (executor/walker.ts) records a task whose scope's repository is under index with code 'repo-indexing' through taskRefusalMapping | `src/analyze/executor/__tests__/walker.test.ts` |

**unit: classifyShaperError: RepoIndexingError maps to 'repo-indexing' with its data in both mappings**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | classifyShaperError: RepoIndexingError maps to 'repo-indexing' with its data in both mappings | `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/invariants.test.ts` | 0 | 18 | 2 s |  |
| `src/analyze/executor/__tests__/walker.test.ts` | 0 | 29 | 0.5 s |  |
| `src/analyze/orchestrator/__tests__/shaper-error-mapping.test.ts` | 0 | 9 | 0.8 s |  |

## t8

Run at 2026-10-13T19:36:41.442Z on commit `96d4c105`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: runShaper cache order: a cache hit does not call scope resolution (a scopeDeps that throws is never reached) and returns the bundle; a hit on a connection scope while another repository's connections file is broken returns the bundle**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runShaper cache order: a cache hit does not call scope resolution (a scopeDeps that throws is never reached) and returns the bundle; a hit on a connection scope while another repository's connections file is broken returns the bundle | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |

**unit: runShaper: a cache hit for a bundle whose repository is now being indexed is refused with RepoIndexingError and the bundle is not returned; a bundle without repoPath is a miss**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runShaper: a cache hit for a bundle whose repository is now being indexed is refused with RepoIndexingError and the bundle is not returned; a bundle without repoPath is a miss | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |
| pass | a bundle cached before the change is not returned | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |

**unit: runShaper: a cache hit whose recorded repository was reindexed since (newer last-indexed time) is a miss and the request is built**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runShaper: a cache hit whose recorded repository was reindexed since (newer last-indexed time) is a miss and the request is built | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |

**unit: bundle schema: a freshly built bundle with repoPath (a string and null) passes validateBundleWithErrors; an older bundle without it still validates**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bundle schema: a freshly built bundle with repoPath (a string and null) passes validateBundleWithErrors; an older bundle without it still validates | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |
| pass | runShaper cache order: a cache hit does not call scope resolution (a scopeDeps that throws is never reached) and returns the bundle; a hit on a connection scope while another repository's connections file is broken returns the bundle | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |

**unit: runShaper: a connection-scope bundle (repoPath null) is served from cache without the indexing and freshness checks**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runShaper: a connection-scope bundle (repoPath null) is served from cache without the indexing and freshness checks | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/run-shaper-wiring.test.ts` | 0 | 16 | 2.5 s |  |

## t9

Run at 2026-10-13T13:28:59.818Z on commit `34c8c765`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: run order: a code request on a path no registered repository contains emits no 'classified' event and no measure substep, and ends failed at classify with the same code and message as runShaper's refusal (recorded from today's code before the change)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | run order: a code request on a path no registered repository contains emits no 'classified' event and no measure substep, and ends failed at classify with the same code and message as runShaper's refusal (recorded from today's code before the change) | `src/analyze/orchestrator/__tests__/run-order.test.ts` |

**unit: run order: the same on the hinted-target branch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | run order: the same on the hinted-target branch | `src/analyze/orchestrator/__tests__/run-order.test.ts` |

**unit: run order: a docs request on an unindexed scope emits no 'classified' event and ends failed at classify with the moved check's code and message**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | run order: a docs request on an unindexed scope emits no 'classified' event and ends failed at classify with the moved check's code and message | `src/analyze/orchestrator/__tests__/run-order.test.ts` |
| pass | a docs run on a scope in no registered repo ends at stage 'classify' with 'scope-not-indexed' before anything is measured or built; a refused pairing still ends at 'classify'; a generic run is not checked (mutation: remove the check before planning) | `src/analyze/orchestrator/__tests__/scope-before-plan.test.ts` |

**unit: run order: a request that passes the check still emits 'classified' with its measure, as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | run order: a request that passes the check still emits 'classified' with its measure, as before | `src/analyze/orchestrator/__tests__/run-order.test.ts` |
| pass | hinted request with a valid pairing reaches the context builder and the planner | `src/analyze/orchestrator/__tests__/hinted-branch.test.ts` |

**unit: runAnalyze: a request about a repository under index ends with code 'repo-indexing' through the orchestrator's mapping (not 'internal-error')**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runAnalyze: a request about a repository under index ends with code 'repo-indexing' through the orchestrator's mapping (not 'internal-error') | `src/analyze/orchestrator/__tests__/run-order.test.ts` |

**unit: runAnalyze's scopeChecked option reaches runShaper through ShapeOpts and does not change the cache key**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runAnalyze's scopeChecked option reaches runShaper through ShapeOpts and does not change the cache key | `src/analyze/orchestrator/__tests__/run-order.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/orchestrator/__tests__/hinted-branch.test.ts` | 0 | 8 | 1.6 s |  |
| `src/analyze/orchestrator/__tests__/run-order.test.ts` | 0 | 6 | 1.3 s |  |
| `src/analyze/orchestrator/__tests__/scope-before-plan.test.ts` | 0 | 1 | 0.8 s |  |

## t10

Run at 2026-10-13T13:37:23.467Z on commit `8e943746`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: analyze.classify on an unindexed scope answers 'scope-not-indexed' and returns no measured size; on a repository under index, 'repo-indexing'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | analyze.classify on an unindexed scope answers 'scope-not-indexed' and returns no measured size; on a repository under index, 'repo-indexing' | `src/daemon/__tests__/analyze-rpc-measure.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/analyze-rpc-measure.test.ts` | 0 | 4 | 1.5 s |  |

## t11

Run at 2026-10-13T13:56:46.991Z on commit `4f78c9d2`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: search request contract: each guarded search request accepts its existing params and answers**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | search request contract: each guarded search request accepts its existing params and answers | `src/daemon/__tests__/search-request-contract.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/search-request-contract.test.ts` | 0 | 1 | 2.6 s |  |

## t12

Run at 2026-10-13T19:39:21.039Z on commit `96d4c105`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: search requests: search.callers / search.callees / search.by_file / search.closure / entity.summary / repo.depends_on / locate.inferParents about a repository being indexed answer 'repo-indexing: ...' with the figures and no result; about another, ready repository they answer as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | search requests: search.callers / search.callees / search.by_file / search.closure / entity.summary / repo.depends_on / locate.inferParents about a repository being indexed answer 'repo-indexing: ...' with the figures and no result; about another, ready repository they answer as before | `src/daemon/__tests__/search-guard.test.ts` |
| pass | search request contract: each guarded search request accepts its existing params and answers | `src/daemon/__tests__/search-request-contract.test.ts` |

**integration: entity.closure / entity.unreachable with a root in a repository under index are refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | entity.closure / entity.unreachable with a root in a repository under index are refused | `src/daemon/__tests__/search-guard.test.ts` |

**integration: search guard: a registry read that throws skips the guard and the request is answered as today**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | search guard: a registry read that throws skips the guard and the request is answered as today | `src/daemon/__tests__/search-guard.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/search-guard.test.ts` | 0 | 3 | 66.5 s |  |
| `src/daemon/__tests__/search-request-contract.test.ts` | 0 | 1 | 3.2 s |  |

## t13

Run at 2026-10-13T19:41:57.790Z on commit `96d4c105`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: search.callers across repositories leaves out the entities of a repository under index**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | search.callers across repositories leaves out the entities of a repository under index | `src/daemon/__tests__/search-filter.test.ts` |

**integration: search.query while one repository is being indexed returns rows from the other repositories only**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | search.query while one repository is being indexed returns rows from the other repositories only | `src/daemon/__tests__/search-filter.test.ts` |

**integration: entity.closure, entity.unreachable, search.closure, repo.depends_on and repo.search_cross_repo from a ready repository whose closure reaches a repository under index leave that repository's entities out**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | entity.closure, entity.unreachable, search.closure, repo.depends_on and repo.search_cross_repo from a ready repository whose closure reaches a repository under index leave that repository's entities out | `src/daemon/__tests__/search-filter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/search-filter.test.ts` | 0 | 3 | 122.5 s |  |

## t14

Run at 2026-10-13T19:37:29.276Z on commit `96d4c105`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: the built-in graph tools (graph_entity, graph_callers, graph_callees, graph_query) about a repository under index fail with 'repo-indexing'; graph_search leaves such a repository out**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the built-in graph tools (graph_entity, graph_callers, graph_callees, graph_query) about a repository under index fail with 'repo-indexing'; graph_search leaves such a repository out | `src/daemon/tools/builtins/graph/__tests__/graph-guard.test.ts` |

**integration: graph_query from a ready repository whose closure reaches a repository under index leaves that repository's entities out**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | graph_query from a ready repository whose closure reaches a repository under index leaves that repository's entities out | `src/daemon/tools/builtins/graph/__tests__/graph-guard.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/graph/__tests__/graph-guard.test.ts` | 0 | 3 | 0.9 s |  |

## t15

Run at 2026-10-13T16:00:42.703Z on commit `c3832632`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: analyze through the daemon (analyze.context.buildRun and the step tools via step.call) on a repository being indexed returns code 'repo-indexing' with the figures; the workflow step that reaches it passes the reply on unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | analyze through the daemon (analyze.context.buildRun and the step tools via step.call) on a repository being indexed returns code 'repo-indexing' with the figures; the workflow step that reaches it passes the reply on unchanged | `src/daemon/steps/__tests__/repo-indexing-steps.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/__tests__/repo-indexing-steps.test.ts` | 0 | 1 | 1.2 s |  |

## t16

Run at 2026-10-13T19:23:26.507Z on commit `b899aaf3`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: installed daemon: an analyze on an unindexed path is refused before any size is announced**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S005/smoke.md, section 'Smoke 1' (re-run on daemon e5e374b5, 2026-10-14; the first run on d250513b failed and was fixed by ISSUE-7c255f61)

**smoke: installed daemon: a request during a reindex is refused with 'repo-indexing' and its figures; after it the row shows lastRun**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S005/smoke.md, sections 'Smoke 2' and 'Smoke 3' (AFM reindex 2026-10-13T17:51Z, probe log /tmp/smoke-s5-afm2.log)

<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s5 -->

# Tests: c2ba6fa62a148ed1 s5

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 32 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

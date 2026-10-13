<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s5 -->

# Tests: c2ba6fa62a148ed1 s5

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s5 -->

# Tests: c2ba6fa62a148ed1 s5

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

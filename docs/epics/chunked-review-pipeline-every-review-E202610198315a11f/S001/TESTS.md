<!-- insrc:artifact TESTS-8315a11f29fd2812-s1 -->

# Tests: 8315a11f29fd2812 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 88 pass, 0 fail, 0 skipped, 0 not found; 3 reported by the builder and not run by the gate.

## t1

Run at 2026-10-20T08:19:05.922Z on commit `28bc836c`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/agent/providers/__tests__/internal-retry.test.ts: 'internalRetry false makes exactly one attempt on CliProvider completeStructured, runReviewSession and OllamaProvider completeStructured; absent keeps today's counts'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | internalRetry false makes exactly one attempt on CliProvider completeStructured, runReviewSession and OllamaProvider completeStructured; absent keeps today's counts | `src/agent/providers/__tests__/internal-retry.test.ts` |
| pass | a relaunch after a failed launch (ENOENT) delivers the prompt exactly once, even with internalRetry false | `src/agent/providers/__tests__/internal-retry.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/internal-retry.test.ts` | 0 | 2 | 7.5 s |  |

## t2

Run at 2026-10-20T08:21:33.249Z on commit `5a9dc90e`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/agent/providers/__tests__/cli-review-session.test.ts: 'a size refusal in a claude session envelope is now an InputTooLargeError, and a codex session refusal still is'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a size refusal in a claude session envelope is now an InputTooLargeError, and a codex session refusal still is | `src/agent/providers/__tests__/cli-review-session.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-review-session.test.ts` | 0 | 16 | 14.3 s |  |

## t3

Run at 2026-10-20T08:28:16.797Z on commit `12d09cd5`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'the default chunk limit is 384,000 characters for every provider and follows review.chunkTokens'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the default chunk limit is 384,000 characters for every provider and follows review.chunkTokens | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` | 0 | 1 | 0.4 s |  |

## t4

Run at 2026-10-20T08:48:36.717Z on commit `c45d8658`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/agent/providers/__tests__/abort-in-flight.test.ts: 'aborting a CLI completeStructured or reviewer session in flight kills the process group and throws AbortError at once; an aborted Ollama request throws AbortError; neither is retried'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | aborting a CLI completeStructured or reviewer session in flight kills the process group and throws AbortError at once; an aborted Ollama request throws AbortError; neither is retried | `src/agent/providers/__tests__/abort-in-flight.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/abort-in-flight.test.ts` | 0 | 1 | 1 s |  |

## t5

Run at 2026-10-20T09:00:30.302Z on commit `7b70ffa1`. Tests check: **passed**. 55 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/analyze/context/__tests__/driver-unit.test.ts (existing, still passes)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stable stringify produces identical output for object key permutations | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | stable stringify is order-stable for Maps with reverse insertion | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | stable stringify treats different values as distinct | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | stable stringify is deterministic for arrays (insertion order matters) | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | classifyOllamaError(ECONNREFUSED) -> ShaperLlmUnavailableError | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | classifyOllamaError("Ollama is not running. Start it...") -> ShaperLlmUnavailableError | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | classifyOllamaError("Model not found ...") -> ShaperLlmUnavailableError | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | classifyOllamaError("fetch failed") -> ShaperLlmUnavailableError (retries exhausted by provider) | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | classifyOllamaError("Did not receive done...") -> ShaperLlmUnavailableError (retries exhausted) | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | classifyOllamaError("ECONNRESET") -> ShaperLlmUnavailableError | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | classifyOllamaError("socket hang up") -> ShaperLlmUnavailableError | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | classifyOllamaError(arbitrary other Error) -> original error | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | classifyOllamaError(non-Error value) -> wraps in Error | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | deriveEmptyLayers on an all-empty bundle returns every layer | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | deriveEmptyLayers on a fully-populated bundle returns [] | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | deriveEmptyLayers treats whitespace-only bodies as empty | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | deriveEmptyLayers preserves the spec render order in its return | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | ShaperLlmUnavailableError carries the call and the cause in its message | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | ShaperToolLoopExhausted carries the turn count in its message | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | ShaperSchemaUnrecoverable carries the retry count + reasons in its message | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | ShaperPromptMissingError carries the absolute prompt path | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | renderUpstreamSection: classification mode returns empty string | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | renderUpstreamSection: run mode returns empty string | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | renderUpstreamSection: task mode with empty upstream map returns empty string | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | renderUpstreamSection: task mode with one populated upstream renders a JSON block | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | renderUpstreamSection: null upstream value renders [unavailable: ...] marker | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | renderUpstreamSection: undefined upstream value also renders unavailable marker | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | renderUpstreamSection: mixed populated + null upstream renders both | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | renderUpstreamSection: upstream task ids are sorted alphabetically | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | classifyOllamaError: a CLI provider's failure in the tool loop reads 'The model call for the tool loop failed: ...' and does not mention Ollama; an Ollama failure's own detail is kept | `src/analyze/context/__tests__/driver-unit.test.ts` |
| pass | classifyOllamaError from runFinalStructuredEmit reads 'The model call for the final structured emit failed: ...' | `src/analyze/context/__tests__/driver-unit.test.ts` |

**integration: src/analyze/context/__tests__/run-shaper-wiring.test.ts (existing, still passes)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runShaper, run mode: an unfocused request on a module gets a stamped bundle, and each step is handed the resolved scope | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |
| pass | runShaper, run mode: a refused pairing fails before the scope is resolved or any step runs | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |
| pass | runShaper, run mode: a scope outside every registered repo fails as not indexed before any step runs | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |
| pass | runShaper, run mode: a cause becomes its typed error and does NOT fall through to the tool loop | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |
| pass | runShaper's run-mode bundle carries the report derived from the executed lookups | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |
| pass | a lookup that returns no completeness record is listed as failed, and the answer is still written from the other lookups | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |
| pass | a request answered by the free-form lookup alone returns a bundle with a one-source 'model-directed' report | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |
| pass | a bundle cached before the change is not returned | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |
| pass | the tool loop's final answer is asked for with a schema that has no report, and a classification bundle carries none | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |
| pass | runShaper: a lastIndexedAt that throws ends as ShaperIndexStateReadError (code 'index-state-read-failed'), through the one injectable reader (PipelineSteps.lastIndexedAt), at runShaper's freshness read and inside the pipeline | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |
| pass | runShaper cache order: a cache hit does not call scope resolution (a scopeDeps that throws is never reached) and returns the bundle; a hit on a connection scope while another repository's connections file is broken returns the bundle | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |
| pass | runShaper: a cache hit for a bundle whose repository is now being indexed is refused with RepoIndexingError and the bundle is not returned; a bundle without repoPath is a miss | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |
| pass | runShaper: a cache hit whose recorded repository was reindexed since (newer last-indexed time) is a miss and the request is built | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |
| pass | bundle schema: a freshly built bundle with repoPath (a string and null) passes validateBundleWithErrors; an older bundle without it still validates | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |
| pass | runShaper: a connection-scope bundle (repoPath null) is served from cache without the indexing and freshness checks | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |
| pass | runShaper: a cache hit decides the index state by the same rule as a miss: a generic run, or a run whose caller checked the scope, about a repository being indexed is served from a warm cache as it would be built from a cold one; a code run is refused | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |
| pass | runShaper: a cache hit on a code run whose recorded repository the index no longer holds is refused as not indexed, as the same request is from a cold cache | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |
| pass | runShaper (ISSUE-0c845762): a docs run on a scope the index does not hold (in no registered repository, or in a registered repository with no stored entities) is refused as not indexed before any lookup or model call, cold and warm, with the run's message; a caller that checked the scope already is not checked again | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |

**integration: src/analyze/context/__tests__/shaper-errors.test.ts (existing, still passes)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ShaperLlmUnavailableError message names the call, never a provider | `src/analyze/context/__tests__/shaper-errors.test.ts` |
| pass | ShaperAnswerStepFailedError states its reason, keeps what the lookups found, and never reports retries | `src/analyze/context/__tests__/shaper-errors.test.ts` |
| pass | the other new errors carry their detail and their own name | `src/analyze/context/__tests__/shaper-errors.test.ts` |
| pass | a tool's output with no JSON form is described as text and never thrown into the tool loop | `src/analyze/context/__tests__/shaper-errors.test.ts` |

**integration: src/agent/providers/__tests__/ollama-review-session.test.ts: 'cancelling an Ollama reviewer session mid tool loop aborts the in-flight turn and starts no further turn'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cancelling an Ollama reviewer session mid tool loop aborts the in-flight turn and starts no further turn | `src/agent/providers/__tests__/ollama-review-session.test.ts` |

**integration: src/agent/providers/__tests__/ollama-review-session.test.ts: 'a returned file_write or Write call, or any tool outside the read-only allowlist, is refused before dispatch and never executed'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a returned file_write or Write call, or any tool outside the read-only allowlist, is refused before dispatch and never executed | `src/agent/providers/__tests__/ollama-review-session.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/ollama-review-session.test.ts` | 0 | 2 | 1 s |  |
| `src/analyze/context/__tests__/driver-unit.test.ts` | 0 | 31 | 0.7 s |  |
| `src/analyze/context/__tests__/run-shaper-wiring.test.ts` | 0 | 18 | 3.1 s |  |
| `src/analyze/context/__tests__/shaper-errors.test.ts` | 0 | 4 | 0.6 s |  |

## t6

Run at 2026-10-20T09:38:32.008Z on commit `7f60f593`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/agent/providers/__tests__/ollama-review-session.test.ts: 'an Ollama reviewer session reads the repo with read-only tools and returns a schema-checked answer within its deadline'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an Ollama reviewer session reads the repo with read-only tools and returns a schema-checked answer within its deadline | `src/agent/providers/__tests__/ollama-review-session.test.ts` |
| pass | a tool input is anchored at the session repo: relative paths resolve there and an absent optional root defaults to it | `src/agent/providers/__tests__/ollama-review-session.test.ts` |
| pass | every read-only tool argument that looks like a path is classified as a filesystem location or not | `src/agent/providers/__tests__/ollama-review-session.test.ts` |

**integration: src/agent/providers/__tests__/ollama-review-session.test.ts: 'cancelling an Ollama reviewer session mid tool loop aborts the in-flight turn and starts no further turn'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cancelling an Ollama reviewer session mid tool loop aborts the in-flight turn and starts no further turn | `src/agent/providers/__tests__/ollama-review-session.test.ts` |

**integration: src/agent/providers/__tests__/ollama-review-session.test.ts: 'a returned file_write or Write call, or any tool outside the read-only allowlist, is refused before dispatch and never executed'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a returned file_write or Write call, or any tool outside the read-only allowlist, is refused before dispatch and never executed | `src/agent/providers/__tests__/ollama-review-session.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/ollama-review-session.test.ts` | 0 | 5 | 3.2 s |  |

## t7

Run at 2026-10-20T10:13:26.096Z on commit `55f92c0f`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a review under the limit is one chunk whose calls carry today's messages and schema inside the envelope'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a review under the limit is one chunk whose calls carry today's messages and schema inside the envelope | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a missing or wrong callId is rejected and the call re-issued once under a new callId; no prompt hash repeats'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a missing or wrong callId is rejected and the call re-issued once under a new callId; no prompt hash repeats | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a transient error, a stall or an invalid answer is re-issued once under a new callId, then the stage failure policy applies'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a transient error, a stall or an invalid answer is re-issued once under a new callId, then the stage failure policy applies | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a size refusal re-divides exactly the atoms and notes the call carried and never resends the prompt'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a size refusal re-divides exactly the atoms and notes the call carried and never resends the prompt | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'refusal re-planning reads only the job snapshot, so a changed source between turns cannot change the material'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | refusal re-planning reads only the job snapshot, so a changed source between turns cannot change the material | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'runStage commits a deterministic stage's output; extract claims and probe evidence enter the snapshot once and re-planning reads only them'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runStage commits a deterministic stage's output; extract claims and probe evidence enter the snapshot once and re-planning reads only them | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a re-issued reviewer-session call gets only the remaining time to the job deadline; past the deadline no call is issued and the review fails with today's message'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a re-issued reviewer-session call gets only the remaining time to the job deadline; past the deadline no call is issued and the review fails with today's message | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/pack-into-batches.test.ts and src/workflow/review-pipeline/__tests__/review-job-core.test.ts: the delivered ISSUE-aef82b03 tests, moved and rewritten to the new API**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every item in exactly one batch, every batch fits, and an item that alone does not fit raises AtomTooLargeError naming it | `src/workflow/review-pipeline/__tests__/pack-into-batches.test.ts` |
| pass | a fitting review is one call with today's prompt and schema | `src/workflow/review-pipeline/__tests__/review-job-core.test.ts` |
| pass | every call the job issues fits the limit, for material many times the limit, and every atom is read whole | `src/workflow/review-pipeline/__tests__/review-job-core.test.ts` |
| pass | a refused call is re-planned and the job completes, sending no prompt twice | `src/workflow/review-pipeline/__tests__/review-job-core.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/pack-into-batches.test.ts` | 0 | 1 | 0.4 s |  |
| `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` | 0 | 8 | 0.7 s |  |
| `src/workflow/review-pipeline/__tests__/review-job-core.test.ts` | 0 | 3 | 0.5 s |  |

## t8

Run at 2026-10-20T10:31:10.771Z on commit `54ad73c1`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'an obligation whose evidence exceeds the limit is reduced level by level, every gather call fits and provenance is kept'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an obligation whose evidence exceeds the limit is reduced level by level, every gather call fits and provenance is kept | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a relation judged by two calls is complete only when both are answered'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a relation judged by two calls is complete only when both are answered | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` | 0 | 10 | 0.7 s |  |

## t9

Run at 2026-10-20T10:40:14.387Z on commit `53cfbb82`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a review cancelled while a call is in flight ends at once with AbortError, no re-issue, nothing recorded'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a review cancelled while a call is in flight ends at once with AbortError, no re-issue, nothing recorded | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: 'a re-issued reviewer-session call gets only the remaining time to the job deadline; past the deadline no call is issued and the review fails with today's message'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a re-issued reviewer-session call gets only the remaining time to the job deadline; past the deadline no call is issued and the review fails with today's message | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |
| pass | a re-issued reviewer-session call gets only the remaining time to the job deadline; past the deadline no call is issued and the review fails with today's message (runReviewJob) | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` | 0 | 12 | 0.8 s |  |

## t10

Run at 2026-10-20T10:56:02.613Z on commit `5c3d41db`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'an under-limit code review makes today's calls per dimension, with the repo as cwd, and gives today's findings and verdict, diagram and ux included'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an under-limit code review makes today's calls per dimension, with the repo as cwd, and gives today's findings and verdict, diagram and ux included | `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts` |

**integration: src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'adherence makes no call without an approved LLD or plan'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | adherence makes no call without an approved LLD or plan | `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts` |

**integration: src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'a mock added or removed after prepare does not change the ux result'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a mock added or removed after prepare does not change the ux result | `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts` | 0 | 3 | 0.7 s |  |

## t11

Run at 2026-10-20T11:21:41.024Z on commit `ae59e798`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'an under-limit DEF review makes one extract call, a probe and one verify call per premise with the 3-minute limit; extraction failing fails the review, a verify call failing twice records the premise as not judged'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an under-limit DEF review makes one extract call, a probe and one verify call per premise with the 3-minute limit; extraction failing fails the review, a verify call failing twice records the premise as not judged | `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts` |

**integration: src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'an under-limit HLD review makes one reviewer-session call and gives today's report'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an under-limit HLD review makes one reviewer-session call and gives today's report | `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts` |

**integration: src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'the controller premise stage plan under the limit offers one batched verify call holding every premise, with today's buildBatchedVerifyPrompt prompt and schema'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the controller premise stage plan under the limit offers one batched verify call holding every premise, with today's buildBatchedVerifyPrompt prompt and schema | `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts` |

**integration: src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts: 'an HLD answer that breaks the checklist is re-issued once by the pipeline with today's correction text under a new callId; a second break fails the review; the stage never re-asks'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an HLD answer that breaks the checklist is re-issued once by the pipeline with today's correction text under a new callId; a second break fails the review; the stage never re-asks | `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts` | 0 | 7 | 1.2 s |  |

## t12

Run at 2026-10-20T12:03:27.154Z on commit `adad384c`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**live: src/workflow/review-pipeline/__tests__/envelope.live.test.ts: 'claude and codex accept the envelope around every review answer schema and echo the callId'**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S001/live-evidence/envelope-cli-20261020T171730.log (INSRC_LIVE_TESTS=1, ok 1, EXIT=0)

**live: src/workflow/review-pipeline/__tests__/envelope.live.test.ts: 'a configured high-end Ollama model completes a template review and a code-review dimension through the pipeline'**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S001/live-evidence/ollama-20261020T172812.log (INSRC_LIVE_TESTS=1, qwen3.8:27b, ok 1, EXIT=0; template review verdict warn after 475 s; the session called file_read, search_grep/glob and graph tools, none refused)

## t13

Run at 2026-10-20T13:05:18.377Z on commit `55426c36`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: Installed daemon: a real under-limit code review and a real design review complete with today's result shape (manual smoke recorded in the BUILD record)**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S001/live-evidence/t13-smoke-record.txt (process-to-build linkage, input sizes, daemon log lines), docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S001/live-evidence/smoke-template-review-installed-daemon-973fc8bd.txt, .insrc/artifacts/CR-f431a4420d03374f-s1.json

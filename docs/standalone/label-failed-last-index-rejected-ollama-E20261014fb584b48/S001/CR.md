<!-- insrc:artifact CR-fb584b4856ebeea9-s1 -->

# Code review: fb584b4856ebeea9:S001

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 6 · model `claude:opus`

**Changed files:** 5

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/agent/providers/ollama.ts:771 | Present but unverified: isRequestRejection and the new pass-through branch in wrapOllamaError are exercised by the new test in src/agent/providers/__tests__/ollama-model-call-failure.test.ts (ResponseError 400 passes through unwrapped with status_code 400, is not retried, and isModelCallFailure is false; 404 and 500 stay ModelCallFailedError; checked for both stream and complete, failing at the call and during iteration). testsReaching is empty only because the changed entities are file-level diff nodes, not graph symbols. No build record exists and the test run could not be executed here, so its pass-state is unconfirmed. |
| LOW | src/agent/providers/structured-output.ts:240 | Present but unverified: the change that keeps lastThrown as the cause of withStructuredRetry's final plain Error is exercised by the completeStructured block of the new ollama-model-call-failure test (maxAttempts 1, a 400 rejection becomes the cause, the error is not a ModelCallFailedError, isModelCallFailure is false). The pass-state is unconfirmed because there is no build record and the test was not run. Minor gap: no test covers resetting lastThrown to undefined after a later attempt fails validation without throwing, which happens only when maxAttempts > 1. |
| LOW | src/daemon/steps/analyze-step/handler.ts:128 | Present but unverified: the change to scopeErrorResult, where 'repo-indexing' is retryable only when status is 'indexing', is exercised by the new test in src/daemon/steps/__tests__/scope-not-indexed-steps.test.ts. It calls scopeErrorResult directly for status 'indexing' (retryable true) and 'error' (retryable false), and also goes end to end through step.call for a registered repo whose last index failed. The pass-state is unconfirmed because there is no build record and the test was not run. |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/agent/providers/ollama.ts:774 | isRequestRejection treats every 4xx except 404 as a rejection of the request's content. That includes transient statuses such as 408 (request timeout) and 429 (too many requests), which a proxy in front of Ollama can return. Those errors would pass through unwrapped and would not be recognised as a failed model call (an outage), which goes against the doc comment's own split between content rejection and failing to reach the model. Consider excluding 408 and 429 alongside 404. |
| LOW | src/agent/providers/structured-output.ts:219 | A content rejection (for example a 400 for an invalid format schema) now reaches withStructuredRetry as a plain Error, and the helper still retries it up to maxAttempts times as if it were a validation failure. Every retry sends the same request and gets the same rejection. The behaviour is unchanged from before (it was wrapped, and still retried), but now that the rejection can be told apart by its type, the helper could stop at once on it, as it already does for cancellation. |
| LOW | src/daemon/steps/analyze-step/handler.ts:128 | The cast `(scoped.data as { status?: unknown } \| undefined)?.status` is not needed. ScopeErrorMapping is a union discriminated on `code`, and its 'repo-indexing' member types `data` as RepoIndexingData, so checking `scoped.code === 'repo-indexing' && scoped.data.status === 'indexing'` narrows it with full typing. The cast hides a rename of `status` from the compiler. This is a matter of taste. |


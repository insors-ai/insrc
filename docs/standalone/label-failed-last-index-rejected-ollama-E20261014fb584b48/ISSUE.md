<!-- insrc:artifact ISSUE-fb584b4856ebeea9 -->

# Label a failed last index and a rejected Ollama request truthfully

## Reproduction

Two separate cases.

1. Failed last index reported as retryable. Register a repository whose last full index ended in an error (registry status 'error'). Call insrc_analyze_step phase=start (target code) on it.
Observed: the reply is {next:'error', error:{code:'repo-indexing', message:'... Re-index the repository.', retryable:true}}.
Expected: retryable:false. Nothing will change until someone re-indexes the repository, so a client that honours retryable keeps retrying a request that cannot succeed. A repository that is being indexed right now should stay retryable:true, since its index ends on its own.

2. Ollama request rejection reported as an outage. Send the local provider a request the Ollama server rejects for its content. For example, a format schema the server refuses or a prompt over the model's context length; the Ollama client raises its ResponseError with an HTTP status code such as 400.
Observed: the provider raises ModelCallFailedError ('Model call failed: <server message>'). Every consumer then reports the model as unavailable (codes such as shaper-llm-unavailable or classifier-llm-unavailable).
Expected: a connection failure (connection refused, socket hang up, fetch failed, a stream that ends early) is still reported as a failed model call. A request the server rejected for its content is reported as that rejection, with the server's status and message, not as an outage. 'Ollama is not running' and 'model not found' keep their actionable wording.

## Root cause

1. scopeErrorResult (src/daemon/steps/analyze-step/handler.ts:123) is the step tool's single mapping from a scope error to its reply. It sets retryable from the reply code alone: code === 'repo-indexing'. RepoIndexingError carries that code both for a repository being indexed and for one whose last full index failed; its data.status tells them apart ('indexing' or 'error'). The failed case's own message ends 'Re-index the repository.' (src/analyze/context/invariants.ts:143,147). Its only production caller is the handler's catch (handler.ts:109).

2. wrapOllamaError (src/agent/providers/ollama.ts:774-787) is called at every place the provider rethrows a client error (ollama.ts:342, 348, 519, 622). Since Story s5 task t1, it turns every error except a ModelCallFailedError or a cancellation into a ModelCallFailedError. That includes the client's ResponseError, which carries the HTTP status of a request the server rejected. Consumers recognise the type through isModelCallFailure (src/analyze/context/model-failure.ts:63) and report it as the model being unavailable; for example, the classifier driver maps it to ClassifierLlmUnavailableError (src/analyze/classifier/driver.ts:303).

## Fix intent

1. The step tool marks a 'repo-indexing' refusal retryable only while the repository is being indexed. A refusal for a repository whose last index failed is not retryable. The code and message stay as they are.

2. The local provider reports a failure to reach or keep the model (a connection or stream failure) as a failed model call, as now. It reports a request the Ollama server rejected for its content as that rejection, keeping the server's status and message, and consumers do not report it as the model being unavailable. 'Ollama not running' and 'model not found' keep their actionable wording and stay classed as the model being unavailable. A cancellation stays a cancellation.

## Citations

- **[[c1]]** `code` `src/daemon/steps/analyze-step/handler.ts:123` — "return errorResult(scoped.code, scoped.message, scoped.code === 'repo-indexing');"
- **[[c2]]** `code` `src/daemon/steps/analyze-step/handler.ts:109` — "const scoped = scopeErrorResult(err);"
- **[[c3]]** `code` `src/analyze/context/invariants.ts:143`
- **[[c4]]** `code` `src/agent/providers/ollama.ts:774` — "function wrapOllamaError(err: unknown): unknown {"
- **[[c5]]** `code` `src/agent/providers/ollama.ts:342` — "throw wrapOllamaError(err);"
- **[[c6]]** `code` `src/analyze/context/model-failure.ts:63` — "export function isModelCallFailure(err: unknown): boolean {"
- **[[c7]]** `code` `src/analyze/classifier/driver.ts:303` — "if (isModelCallFailure(err)) return new ClassifierLlmUnavailableError(modelCallFailureDetail(err));"
- **[[c8]]** `analyze-bundle` `insrc_analyze_step run (2026-10-14): wrapOllamaError call sites ollama.ts:342,348,519,622; scopeErrorResult's one caller handler.ts:109; consumers via isModelCallFailure`
- **[[c9]]** `prior-artifact` `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S005/CR.md` — "round 3 MEDs at src/daemon/steps/analyze-step/handler.ts:123 and src/agent/providers/ollama.ts:774"

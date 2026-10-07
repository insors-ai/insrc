<!-- insrc:artifact ISSUE-e2bcadd9b0f63f99 -->

# Fix four context-builder defects left by story 6's code review

## Reproduction

Four separate defects in the analyzer's context builder, each found by reading the code in the daemon's second code review of story 6 (CR-b9d5c5c40df5a574-s6). None has been observed in a run.

1. Wrong provider named. Run a classification or task context build with the tool loop served by a provider that is not Ollama, and make the model call fail. Observed: the error reads 'Local Ollama unavailable for shaper invocation: ...'. Expected: it names the call that failed and no provider the failure did not come from.

2. A throw with no cause. Make the lookup executor or the read of the repo's last-indexed time throw during a run-mode context build (a store error, a lookup that crashes). Observed: the error leaves the lookup pipeline as a raw rejection and is reported as 'internal-error'. Expected: it is one of the pipeline's named causes, like every other way of not proceeding.

3. Scope resolved before the cache. (a) Request a context that is already cached. Observed: the scope is resolved first, which reads the repo registry, the file's entities for a symbol scope, and every registered repo's connections file for a connection scope, before the cached bundle is returned. Expected: a cache hit does not pay for resolution it does not need. (b) With one registered repo whose connections file does not parse, request a cached context on a connection scope of another repo. Observed: resolution throws and the cached bundle is never reached. Expected: an unrelated repo's broken file does not make a cached bundle unreachable.

4. Failure text matched inside echoed output. Have a model answer fail validation with a validation message that quotes a value containing 'ECONNREFUSED', 'Model not found', 'EPIPE' or 'fetch failed' (likely when the repository under analysis is this one). Observed: the failure is classified as a failed model call. Expected: a wrong-shaped answer is a failure of shape whatever text it contains.

## Root cause

1. The tool loop's classifier (classifyOllamaError, src/analyze/context/driver.ts:895) now recognises a failed call for any provider through the shared check, but still builds its error without the 'call' argument. Without it the error's constructor writes 'Local Ollama unavailable for shaper invocation'.

2. In the lookup pipeline only the planning call and the answer-writing call are wrapped. The read of the last-indexed time (driver.ts:1280) and the lookup executor (:1282) are awaited bare, so a throw from either bypasses the cause list and the one table that turns a cause into an error.

3. runShaper resolves the scope (driver.ts:254) before it consults the bundle cache (:264). Resolution reads the registry and, for a symbol or a connection, the stores and every registered repo's connections file; and it can throw. The cache key does not depend on the resolved scope, only the freshness check does.

4. The shared check cuts a quoted answer off only at ' text=' and then matches the Ollama and socket texts anywhere in what remains (src/analyze/context/model-failure.ts:82). Shape failures can echo model or data content without that marker, for example a schema validation message that quotes an offending value.

## Fix intent

1. A failed call in the tool loop is worded by the call that failed, for whichever provider served it, and says Ollama only when the failure came from Ollama.

2. A throw from the lookup executor or from the last-indexed read becomes a named cause of the pipeline with its own typed error and code, so no way of not proceeding leaves the pipeline as an unexplained internal error.

3. A cached bundle is returned without paying for scope resolution it does not need, and a failure to resolve something the cache lookup does not depend on cannot make a cached bundle unreachable. The pairing check and the rule that the scope is resolved once for a request that is actually built are kept.

4. The failure texts are matched only where a provider itself writes them, not inside content echoed from a model answer or from data, so a wrong-shaped answer is never read as a failed call. A real connection failure, wrapped by the retry helper or not, is still recognised.

Each correction comes with a test that fails without it.

## Citations

- **[[c1]]** `code` `src/analyze/context/driver.ts` — "return new ShaperLlmUnavailableError(modelCallFailureDetail(err));"
- **[[c2]]** `code` `src/analyze/context/driver.ts` — "const lastIndexedMs = await steps.lastIndexedAt(freshnessPathOf(args.scope));"
- **[[c3]]** `code` `src/analyze/context/driver.ts` — "const scope = await prepareScope(invocationMode, inputs, args.scopeDeps);"
- **[[c4]]** `code` `src/analyze/context/model-failure.ts` — "if (msg.includes(text)) return true;"
- **[[c5]]** `prior-artifact` `CR-b9d5c5c40df5a574-s6: the daemon's second code review of story 6 of the analyzer epic, 2026-10-07 (warn, 0 HIGH, 12 MED, 15 LOW). These are four of its MED findings; the grounding here is a direct reading of the two files on 2026-10-07, not an analyzer pass.`
- **[[c6]]** `stakeholder` `user, 2026-10-07: approve story 6's build record at 'warn' and file these four findings as one follow-up issue` — "approve, then commit and push."

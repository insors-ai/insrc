<!-- insrc:artifact CR-c2ba6fa62a148ed1-s5 -->

# Code review: c2ba6fa62a148ed1:s5

⚠️ **WARN** — HIGH 0 · MED 5 · LOW 8 · model `claude:opus`

**Changed files:** 59

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/analyze/context/driver.ts:376 | On a cache hit, servedFromCache runs ensureRepoQueryable only when checksScopeState(...) is true. That excludes the classification and task modes and the generic shaper, as well as the scopeChecked case. So a cached bundle whose recorded repoPath is now 'indexing' or 'error' is still served for a generic run-mode request and for any non-run-mode request. The approved LLD says a hit with a string repoPath is checked with ensureRepoQueryable and only a null repoPath skips the check. The scopeChecked skip is approved. The generic and non-run-mode skips go further than the design states, although the plan's t7 says a generic intent is not checked. |

## conventions — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/steps/analyze-step/handler.ts:15 | The new application import `import { scopeErrorMapping } from '../../../analyze/context/invariants.js'` sits above the `node:fs` builtin import. The touched modules put `node:` builtins first and project imports after them (see search-guard.ts, run-order.test.ts and task-scope.ts). This is ordering drift only, not a documented rule. The same pattern appears where `ModelCallFailedError` imports were added between `node:assert` and `node:fs` in test files such as runtimes/shared/__tests__/aggregator.test.ts. |
| LOW | src/analyze/orchestrator/driver.ts:319 | The new pre-measure scope check passes `unsized.target as Exclude<typeof unsized.target, 'generic'>` to resolveTaskScope. It needs the cast because the narrowing is held in a separate boolean (`scopeChecked`). The parallel check added in src/daemon/analyze-rpc.ts classify() narrows inline with `if (unsized.target !== 'generic')` and needs no cast. The two copies of the same check use different idioms, and the cast would hide a future widening of the target union. |

## coverage — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/analyze/orchestrator/driver.ts:309 | Promised smoke test not in the grounding. The changed set contains no automated test for 'installed daemon: an analyze on an unindexed path is refused before any size is announced'. It is a manual check against the installed daemon. The commit log mentions smoke notes (b899aaf3), but no build record was provided, so whether it ran and passed cannot be confirmed. The same behaviour is covered in-process by run-order.test.ts, scope-before-plan.test.ts and analyze-rpc-measure.test.ts. Reported as unverified rather than wholly missing. |
| MED | src/indexer/index.ts:754 | Promised smoke test not in the grounding. 'installed daemon: a request during a reindex is refused with 'repo-indexing' and its figures; after it the row shows lastRun' has no automated test in the changed set and no build record to confirm it passed. In-process coverage exists: search-guard.test.ts and search-filter.test.ts run a real seeded daemon through a real full index, and index-run-record.test.ts and repos-lmdb.test.ts check that lastRun is written. The smoke run itself is unverified. |
| LOW | src/daemon/search-guard.ts:1 | All 43 promised unit and integration tests are present in the changed test files, by exact or equivalent name. Three are covered under different names: the OllamaProvider transport-failure tests in ollama-model-call-failure.test.ts appear as 'stream creation and stream iteration failures…', 'completeStructured failures…' and 'complete() raises a connection refused and a socket hang up…'. No build record was provided, so none of these tests' pass state can be confirmed. Every symbol's testsReaching is empty, including the test files themselves, so the graph grounding is hollow for this diff. The empty edges are therefore not evidence of an untested symbol. Each changed production file is reached by name from at least one added test: search-guard, invariants, driver (context and orchestrator), model-failure, ollama, structured-output, codec, repos, indexer/index, run-record, analyze-rpc, analyze-step handler and scope, graph tools, and schema. |

## quality — 7 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/analyze/context/driver.ts:378 | A cache hit on a code run can answer differently from a cold run, though the code says it never does. On a hit, `servedFromCache` only calls `ensureRepoQueryable`, which returns without refusing when no registered repo contains the path or the registry is empty. It does not call `ensureNonEmptyClosure`, which a miss runs for `shaperId === 'code'`. Failure case: a bundle was cached with `repoPath` R, then R is removed from the registry or its entities are cleared. On the hit, `lastIndexedOf(R)` returns undefined, so the stale bundle is served. A cold run of the same request throws `ScopeNotIndexedError`. For a code hit, run the same check the miss runs (`ensureNonEmptyClosure` on a repo scope built from R), or treat an undefined watermark on a recorded repoPath as a miss. |
| MED | src/analyze/context/driver.ts:1589 | The new try/catch around `steps.executePlan` turns every rejection into the 'lookup-failed' cause via `didNotProceed('lookup-failed', errorText(err))`. That includes typed errors the executor already raises with their own codes, such as scope errors (`RepoIndexingError`, `ScopeNotIndexedError`) or a model-call failure from a lookup that calls a model. Those used to reach `classifyShaperError` and keep their codes. Now they are reported as `ShaperLookupFailedError` and the typed data (repo, run figures) is lost. Rethrow errors that `scopeErrorMapping` or `isModelCallFailure` recognise before falling back to 'lookup-failed'. |
| MED | src/agent/providers/ollama.ts:769 | `wrapOllamaError` now wraps every non-ModelCallFailedError value as `ModelCallFailedError`, including an AbortError from a cancelled request. Before, an abort passed through untyped and `isModelCallFailure` did not match it. Now every consumer (decomposer, synthesizer, classifier, planner, aggregator, summariser, tool loop) will report a user or run cancellation as 'model unavailable'. Pass through abort errors (`err.name === 'AbortError'` or the signal's reason) unwrapped. |
| LOW | src/daemon/analyze-rpc.ts:358 | The scope check that runs before measuring in `classify` repeats the block in `runStages` almost line for line: `resolveTaskScope`, then `scopeErrorMapping`, then rethrow if undefined. That is the same rule now implemented in three places, counting `stepScope`'s `ensureScopeQueryable` call. Pull it into one helper that returns the mapped refusal or undefined, so the generic exemption and label cannot drift between the daemon classify path and the run. |
| LOW | src/daemon/search-guard.ts:65 | Each guarded request reads the registry repeatedly. `guardSearchRequest` calls `ensureRepoQueryable` once per named path, and each call does its own `listRepos`. Handlers that also call `underIndexFilter` read it once more, so `entity.closure` with N roots costs N+1 registry reads. Read the registry once in the guard and reuse that snapshot for the filter. This also stops the guard and the filter from disagreeing when a status flips between the two reads. |
| LOW | src/daemon/search-guard.ts:113 | `underIndexFilter` swallows a failed registry read with a bare `catch {}` and logs nothing. Its sibling paths (`ensureRepoQueryable`, the entity-read branch of `guardSearchRequest`) log at debug level when they skip. A broken registry would silently turn off filtering on every search request. Add the same debug log. |
| LOW | src/agent/providers/structured-output.ts:229 | When the last attempt failed on the model call itself, the typed error's detail still begins 'structured-output: validation failed after N attempts: ', so `modelCallFailureDetail` and the user-facing messages describe an outage as a validation failure. This is a wording issue only: the type is already correct. |


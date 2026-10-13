<!-- insrc:artifact CR-c2ba6fa62a148ed1-s5 -->

# Code review: c2ba6fa62a148ed1:s5

⚠️ **WARN** — HIGH 0 · MED 3 · LOW 11 · model `claude:opus`

**Changed files:** 59

## adherence — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/analyze/context/driver.ts:395 | On a cache hit runShaper runs more than the LLD allows. For the code source, the recorded repository goes through ensureNonEmptyClosure (checkScopeState), which reads the repository's entity list. The LLD says a hit runs only ensureRepoQueryable and the freshness read, and that "nothing else is resolved". The extra check is deliberate: it makes a warm-cache answer match a cold-cache one, and run-shaper-wiring.test.ts tests it. It is still a behaviour the approved design does not state. Either add it to the LLD, or limit the hit path to ensureRepoQueryable. |
| LOW | src/analyze/context/driver.ts:364 | checksScopeState applies the under-index check only to run-mode, non-generic requests that runAnalyze has not already checked. That covers both the miss path and the cache-hit path. A classification-mode or task-mode request, or a generic-source request, about a repository under index is therefore neither refused on a miss nor checked on a hit. The plan (t7) does exempt the generic intent, so that part matches. But the LLD's runShaper and ensureRepoQueryable postconditions say ensureRepoQueryable runs "for every source" on a miss and on any hit with a string repoPath. The skip for task and classification modes is not in the approved design; today a task's own resolveTaskScope covers it only indirectly. |

## conventions — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/__tests__/helpers/seeded-daemon.ts:117 | `startSeededDaemon(opts: { readonly bigRepos?: readonly number[]; readonly linkBig?: boolean })` declares optional properties without `\| undefined`. Under exactOptionalPropertyTypes the documented convention is `bigRepos?: readonly number[] \| undefined` and `linkBig?: boolean \| undefined`. The other new option types in this Story follow it (SearchGuardDeps, SearchRequestNames, RepoIndexingRun, ShapeOpts.scopeChecked). |
| LOW | src/daemon/steps/analyze-step/handler.ts:15 | The new `import { scopeErrorMapping } from '../../../analyze/context/invariants.js'` is placed above the `node:fs` builtin import. The touched modules (search-guard.ts, invariants.ts, task-scope.ts, the new test files) put `node:` builtins first and project imports after them. |
| LOW | src/agent/providers/structured-output.ts:207 | The abort test is written inline as `err instanceof Error && err.name === 'AbortError'`. The same Story adds a named `isAbortError` helper for exactly this check in ollama.ts, a sibling module in the same directory. Two separate statements of the cancellation rule could drift apart. Sharing one helper, for example from model-call-error.ts, would match how the Story keeps a single statement of other rules (`isUnderIndex`, `scopeErrorMapping`). |

## coverage — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/agent/providers/ollama.ts:784 | wrapOllamaError's 'not found' / '404' branch, which rewrites the detail to 'Model not found in Ollama. Pull it with: ollama pull <model>', is not exercised through the provider. The FAILURES list in ollama-model-call-failure.test.ts has no 404 or 'not found' error. Only the ECONNREFUSED detail rewrite is asserted, in the complete() test. Other tests build a ModelCallFailedError('Model not found ...') by hand, so they never go through wrapOllamaError. |
| LOW | src/daemon/__tests__/search-filter.test.ts:1 | All 44 promised automated tests are present by name in the changed test files. 'start-up re-queue: repositories left indexing without lastIndexed are still re-queued, unchanged' is cut off in the grounding but exists at src/indexer/__tests__/index-run-record.test.ts:191. Their pass-state is unverified because no build record was supplied. search-filter.test.ts and search-guard.test.ts also depend on a live 3000-file reindex still running while the requests are made (whileIndexing throws if the index finishes first), so they can fail from timing on a fast machine. Every testsReaching list is empty only because this grounding is diff-only file entities, not because the tests are missing. That emptiness is not evidence of a coverage gap, so no HIGH is raised from it. |
| LOW | src/daemon/index.ts:1 | The two promised smoke checks are not automated tests and are not in this grounding: 'installed daemon: an analyze on an unindexed path is refused before any size is announced' and 'installed daemon: a request during a reindex is refused with repo-indexing and its figures; after it the row shows lastRun'. The Story's S005/smoke.md records them as PASS against installed daemon e5e374b5. The later code-review round-2 commits (e0edb0bb: cancellation handling, cache-hit scope check) were not smoke-checked again, so for the current code they are present but unverified. |

## quality — 6 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/analyze/context/driver.ts:373 | checkScopeState restates the per-source rule that ensureScopeQueryable (task-scope.ts) already owns, and the two copies disagree. ensureScopeQueryable treats code AND docs as graph families and runs ensureNonEmptyClosure for both. checkScopeState runs it only for 'code' and gives docs ensureRepoQueryable alone. So a docs run-mode request that reaches runShaper without scopeChecked (for example analyze.context.buildRun / insrc_analyze one-shot) is not refused on an unindexed scope, while the same request through runAnalyze is refused with 'scope-not-indexed'. Calling ensureScopeQueryable(scope, shaperId) here would keep one statement of the rule. |
| MED | src/daemon/steps/analyze-step/handler.ts:123 | scopeErrorResult marks every 'repo-indexing' reply retryable. That code also covers status 'error' (the last index failed before completing), and that refusal's own message says 'Re-index the repository'. A failed index does not clear on its own, so a client that honours retryable:true will keep retrying a request that cannot succeed until someone re-indexes. Retryable should be true only when err.data.status === 'indexing'. |
| MED | src/agent/providers/ollama.ts:774 | wrapOllamaError now turns every non-abort error into ModelCallFailedError, including request rejections that come from the content of the request: a 400 for a bad format schema, an exceeded context length, or any provider-side error raised inside the wrapped try. These used to stay plain Errors and were treated as shape/schema failures. They now classify as shaper-llm-unavailable / '*-llm-unavailable' and are reported as an outage. The message only says the transport is down, which misleads whoever debugs a bad request. |
| LOW | src/agent/providers/structured-output.ts:207 | The AbortError test (err instanceof Error && err.name === 'AbortError') is written inline here and duplicates isAbortError, added in ollama.ts in this same change. If the rule for recognising a cancellation changes (for example to include a DOMException that is not an Error), only one copy is likely to be updated. A shared helper next to ModelCallFailedError would keep them aligned. |
| LOW | src/daemon/analyze-rpc.ts:358 | The 'check scope before measuring' block (skip generic → resolveTaskScope → scopeErrorMapping → rethrow anything else) is a near copy of the block added to runStages in the orchestrator. The orchestrator copy also needs a redundant `as Exclude<...,'generic'>` cast that this copy does without. Two copies of the pre-measure refusal can drift, for example in which targets are skipped. |
| LOW | src/daemon/search-guard.ts:85 | guardSearchRequest calls ensureRepoQueryable once per named path. Each call re-reads the whole registry with listRepos, and each entity id adds its own getEntity read. A request with many rootIds (entity.closure, entity.unreachable, graph_query closure/scc) therefore does O(n) registry reads. Every guarded handler then makes one more registry read in underIndexFilter. Reading the registry once and checking every path against that one read would be both cheaper and consistent within a single request. |


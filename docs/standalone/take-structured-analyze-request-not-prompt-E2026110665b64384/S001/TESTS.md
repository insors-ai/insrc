<!-- insrc:artifact TESTS-65b643840a294422-s1 -->

# Tests: 65b643840a294422 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 63 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-11-06T19:50:07.951Z on commit `d07de0287`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: analyze-rpc-intent.test.ts: parseIntent keeps context and scopeSource, refuses a bad value of either, and parses an intent without them as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parseIntent keeps context and scopeSource, refuses a bad value of either, and parses an intent without them as before | `src/daemon/__tests__/analyze-rpc-intent.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/analyze-rpc-intent.test.ts` | 0 | 1 | 0.7 s |  |

## t2

Run at 2026-11-06T19:51:38.025Z on commit `a66aab929`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: request.test.ts: buildIntentFromRequest makes the same intent for a request through both tools, defaults target to code, ignores a flat target and size, refuses an empty question, an over-long context and a differing focus, and keeps context off scopeRef**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | buildIntentFromRequest makes the same intent for a request through both tools, defaults target to code, ignores a flat target and size, refuses an empty question, an over-long context and a differing focus, and keeps context off scopeRef | `src/analyze/context/__tests__/request.test.ts` |
| pass | a prompt-only call gets the workspace scope and scopeSource prompt | `src/analyze/context/__tests__/request.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/request.test.ts` | 0 | 2 | 0.4 s |  |

## t3

Run at 2026-11-06T19:55:09.054Z on commit `76512b76b`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: scope-area.test.ts: graphRepoOf, inAreaOf, docsAreaOf and scopeArea behave as pinned after the move; scopeArea is null for workspace, repo and connection scopes and the one entity for a symbol; scopeAreaKey differs per area**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | graphRepoOf, inAreaOf, docsAreaOf and scopeArea behave as pinned after the move; scopeArea is null for workspace, repo and connection scopes and the one entity for a symbol; scopeAreaKey differs per area | `src/analyze/context/__tests__/scope-area.test.ts` |
| pass | a module, a file, a symbol and a connection scope resolve to the registered repo and the area | `src/analyze/runtimes/shared/__tests__/task-scope.test.ts` |
| pass | a table test over four families and seven kinds of scope: pairings in the table resolve, the rest throw the mismatch error naming the kinds allowed (mutation: give a family a kind outside its row) | `src/analyze/runtimes/shared/__tests__/task-scope.test.ts` |
| pass | sourceModulesOf returns one module per directory that directly holds a source file, none for a directory of artifacts only, and none for a directory whose source is all in sub-directories (mutation: count artifact files as source) | `src/analyze/runtimes/shared/__tests__/source-modules.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/scope-area.test.ts` | 0 | 1 | 0.6 s |  |
| `src/analyze/runtimes/shared/__tests__/source-modules.test.ts` | 0 | 5 | 0.6 s |  |
| `src/analyze/runtimes/shared/__tests__/task-scope.test.ts` | 0 | 5 | 0.6 s |  |

## t4

Run at 2026-11-07T11:16:40.776Z on commit `3308ff579`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: scope-validate.test.ts: validateRequestScope refuses a nonexistent path, a wrong path kind and a scope in another registered repository, accepts an existing empty directory, leaves workspace, repo and connection scopes to the existing checks, and resolves '..' and equivalent spellings to one canonical path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | validateRequestScope refuses a nonexistent path, a wrong path kind and a scope in another registered repository, accepts an existing empty directory, leaves workspace, repo and connection scopes to the existing checks, and resolves '..' and equivalent spellings to one canonical path | `src/analyze/context/__tests__/scope-validate.test.ts` |
| pass | graphRepoOf, inAreaOf, docsAreaOf and scopeArea behave as pinned after the move; scopeArea is null for workspace, repo and connection scopes and the one entity for a symbol; scopeAreaKey differs per area | `src/analyze/context/__tests__/scope-area.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/scope-area.test.ts` | 0 | 2 | 0.5 s |  |
| `src/analyze/context/__tests__/scope-validate.test.ts` | 0 | 1 | 0.5 s |  |

## t5

Run at 2026-11-07T04:40:00.085Z on commit `489eee9c8`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: start-request.test.ts: the real start, plan and narrow handlers refuse a nonexistent path, a wrong path kind, a '..' path into another repository and a repository mismatch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the plan phase through the real handler refuses a nonexistent path, a wrong path kind and a raw '..' path into another registered repository, from the state token | `src/daemon/steps/__tests__/start-request.test.ts` |
| pass | the narrow phase through the real handler repeats the scope check on resume: a nonexistent path and a raw '..' path into another registered repository are refused | `src/daemon/steps/__tests__/start-request.test.ts` |
| pass | a valid request mints a state whose intent has the named scope, context and scopeSource request and measures the area that scope names; an invalid one is refused at start | `src/daemon/steps/__tests__/start-request.test.ts` |

**integration: analyze-oneshot-handler.test.ts: the real one-shot handler and buildRun refuse the same invalid scopes through prepareScope with the repository from oneShotRunParams**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runAnalyzeOneShot hands the call's repository to the run, and the real buildRun refuses a nonexistent path, a wrong path kind and a raw '..' path into another registered repository before any read | `src/daemon/steps/__tests__/analyze-oneshot-handler.test.ts` |
| pass | runShaper: with the call's repository a cached bundle is not served for a nonexistent path, a wrong path kind or a raw '..' path into another registered repository; without it the cache still comes first | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/run-shaper-wiring.test.ts` | 0 | 20 | 1.1 s |  |
| `src/daemon/steps/__tests__/analyze-oneshot-handler.test.ts` | 0 | 2 | 0.9 s |  |
| `src/daemon/steps/__tests__/start-request.test.ts` | 0 | 4 | 0.8 s |  |

## t6

Run at 2026-11-07T11:17:40.721Z on commit `3308ff579`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: analyze-oneshot-request.test.ts: checkOneShotArgs accepts a request with no focus, returns a message for a malformed request, requires one of request or focus; oneShotRunParams builds the intent from the builder and returns the expected repository**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | checkOneShotArgs accepts a request with no focus, returns a message for a malformed request, requires one of request or focus; oneShotRunParams builds the intent from the builder and returns the expected repository | `src/daemon/steps/__tests__/analyze-oneshot-request.test.ts` |

**integration: start-request.test.ts: a valid request mints a state whose intent has the named scope, context and scopeSource request and measures the area that scope names**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a valid request mints a state whose intent has the named scope, context and scopeSource request and measures the area that scope names; an invalid one is refused at start | `src/daemon/steps/__tests__/start-request.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/__tests__/analyze-oneshot-request.test.ts` | 0 | 1 | 0.6 s |  |
| `src/daemon/steps/__tests__/start-request.test.ts` | 0 | 5 | 0.8 s |  |

## t7

Run at 2026-11-07T05:06:38.852Z on commit `cf118ca9e`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: plan-module-scope.test.ts: the plan and the narrow resume pass the containing repository and the named area and return the module's entities**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the plan phase passes the containing repository and the named area for a module scope; a symbol lookup returns its entities and the module profile runs | `src/daemon/steps/__tests__/plan-module-scope.test.ts` |
| pass | the plan phase passes the containing repository and the named area for a manifest-dir scope; a symbol lookup returns its entities and the module profile runs | `src/daemon/steps/__tests__/plan-module-scope.test.ts` |
| pass | the narrow resume passes the same containing repository and area as the plan, so the lookup after the pause finds the module's entities | `src/daemon/steps/__tests__/plan-module-scope.test.ts` |

**integration: oneshot-module-scope.test.ts: the one-shot shaper session and executePlan use graphRepoOf(scope) for module and manifest-dir scopes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the one-shot shaper session and executePlan use the containing repository for module and manifest-dir scopes, and a lookup returns the stored entities | `src/analyze/context/__tests__/oneshot-module-scope.test.ts` |
| pass | the one-shot shaper session is keyed on the containing repository for module and manifest-dir scopes, and the area travels as the scope | `src/analyze/context/__tests__/oneshot-module-scope.test.ts` |
| pass | planRepoOf: the containing repository for an area scope, today's own path for a repo or workspace scope | `src/analyze/context/__tests__/scope-area.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/oneshot-module-scope.test.ts` | 0 | 2 | 0.8 s |  |
| `src/analyze/context/__tests__/scope-area.test.ts` | 0 | 2 | 0.6 s |  |
| `src/daemon/steps/__tests__/plan-module-scope.test.ts` | 0 | 3 | 0.9 s |  |

## t8

Run at 2026-11-07T05:19:34.815Z on commit `a595d2be3`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: concept-resolve-scope.test.ts: no candidate outside the area, anchor named-scope with an empty hit list, a child does not displace the anchor, symbol anchor identity, entity hit to symbol anchor, workspace and repo results equal today's**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | module scope: no hit lies outside the area, the anchor is the area even with no hit, and a child that outranks the area does not displace it | `src/analyze/explore/__tests__/concept-resolve-scope.test.ts` |
| pass | manifest-dir scope: no hit lies outside the area, the anchor is the area even with no hit, and a child that outranks the area does not displace it | `src/analyze/explore/__tests__/concept-resolve-scope.test.ts` |
| pass | file scope: only that file and its entities are candidates; the anchor is the file | `src/analyze/explore/__tests__/concept-resolve-scope.test.ts` |
| pass | symbol scope: the one entity is the only candidate; the anchor is the symbol with its entity id and file | `src/analyze/explore/__tests__/concept-resolve-scope.test.ts` |
| pass | workspace and repo scopes return today's hits and the top hit as the anchor; a ranked entity hit becomes a symbol anchor; no hit gives no anchor | `src/analyze/explore/__tests__/concept-resolve-scope.test.ts` |
| pass | directory match beats file match on same token count (Test 3 case) | `src/analyze/explore/__tests__/concept-resolve-unit.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/explore/__tests__/concept-resolve-scope.test.ts` | 0 | 5 | 0.6 s |  |
| `src/analyze/explore/__tests__/concept-resolve-unit.test.ts` | 0 | 24 | 0.6 s |  |

## t9

Run at 2026-11-07T05:24:39.893Z on commit `f808738cc`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: request-end-to-end.test.ts: a module-scope request profiles the named module with no lexical match and a small symbol in a large file runs symbol-aware runners, skips or labels file-level runners and synthesis centres on the symbol**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a module-scope request profiles the named module through the real dependent runners even when the question shares no word with it | `src/analyze/explore/__tests__/request-end-to-end.test.ts` |
| pass | a small symbol in a large file is sized and searched as the one entity; file-level explorations are contextual | `src/analyze/explore/__tests__/request-end-to-end.test.ts` |
| pass | legacy repo and workspace plans behave as before: the anchor path is the top hit's path | `src/analyze/explore/__tests__/request-end-to-end.test.ts` |
| pass | the planning and synthesis prompts name the anchor: no recipe chains on hits[0].path of a concept.resolve, symbol anchors chain on the entity id and label file-level results | `src/analyze/explore/__tests__/request-end-to-end.test.ts` |
| pass | planning prompt has a no-focus recipe per kind of source, with existing lookups and no limit parameter | `src/analyze/context/__tests__/no-focus-prompts.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/no-focus-prompts.test.ts` | 0 | 4 | 0.8 s |  |
| `src/analyze/explore/__tests__/request-end-to-end.test.ts` | 0 | 4 | 0.9 s |  |

## t10

Run at 2026-11-07T11:15:45.380Z on commit `3308ff579`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: capability-reuse-anchor.test.ts: a capability question with no lexical match still inspects the named module, a higher-ranked child does not replace the subject, a symbol anchor is handled by entity id, on both execution modes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a capability question with no word in common with the named module still inspects that module, first, on the one-shot and the multi-turn mode | `src/analyze/explore/__tests__/capability-reuse-anchor.test.ts` |
| pass | a higher-ranked child does not replace the named subject, on both execution modes | `src/analyze/explore/__tests__/capability-reuse-anchor.test.ts` |
| pass | a symbol subject is handled by entity id on both execution modes: its file is the candidate, its name the only evidence | `src/analyze/explore/__tests__/capability-reuse-anchor.test.ts` |
| pass | an empty named area is checked on both execution modes and its completeness says there was nothing in it | `src/analyze/explore/__tests__/capability-reuse-anchor.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/explore/__tests__/capability-reuse-anchor.test.ts` | 0 | 5 | 0.9 s |  |

## t11

Run at 2026-11-07T11:18:41.020Z on commit `3308ff579`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: doc-area-forwarding.test.ts: the adapters for doc.mention, doc.decision-trace and doc.constraint-enumerate forward docsAreaOf(ctx.scope) for file and module scopes and no area for repo or workspace scopes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the adapters for doc.mention, doc.decision-trace and doc.constraint-enumerate forward the area for a module and a file scope and no area for a repo or workspace scope, on both execution modes | `src/analyze/explore/__tests__/doc-area-forwarding.test.ts` |
| pass | an area with no candidate performs no embedding on either execution mode | `src/analyze/explore/__tests__/doc-area-forwarding.test.ts` |

**unit: docs-retrieval.test.ts: with a stubbed vector search an area passes only candidate ids inside the area, a stronger outside section never competes and no candidates performs no embedding**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with a stubbed vector search an area passes only candidate ids inside the area, a stronger outside section never competes, and no candidates inside the area performs no embedding | `src/analyze/__tests__/docs-retrieval.test.ts` |

**integration: docs-plan-area.test.ts: complete file-scope and module-scope docs plans return no section outside the area through the step executor and the one-shot executor**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | complete file-scope and module-scope docs plans return no section outside the area through the step executor and the one-shot executor | `src/analyze/explore/__tests__/doc-area-forwarding.test.ts` |
| pass | a docs constraint task and a docs decision task with a module scope retrieve only sections under that directory and count within it; without an area the runners and the lookup pipeline's calls return what they did (mutation: drop the area at the hand-over from runner to prepare) | `src/analyze/runtimes/docs/__tests__/docs-area-retrieval.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/__tests__/docs-retrieval.test.ts` | 0 | 18 | 0.6 s |  |
| `src/analyze/explore/__tests__/doc-area-forwarding.test.ts` | 0 | 3 | 0.7 s |  |
| `src/analyze/runtimes/docs/__tests__/docs-area-retrieval.test.ts` | 0 | 1 | 0.6 s |  |

## t12

Run at 2026-11-07T05:40:09.065Z on commit `fcdde7b58`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: exploration-cache-scope.test.ts: the key differs per area and per version, a version-2 row is not read and the narrow write uses the executor's key**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the cache key differs per area and per version for the area-aware lookups, a version-2 row is not read and the narrow write uses the executor's key function | `src/analyze/explore/__tests__/exploration-cache-scope.test.ts` |
| pass | a lookup output cached before the change is not returned: the cache key includes its version | `src/analyze/explore/__tests__/removed-flags.test.ts` |

**integration: cache-area-isolation.test.ts: consecutive same-question requests on different modules, including capability.reuse-check, do not share an entry on the step and one-shot tools and a version-2 row is not read**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two consecutive same-question requests on different modules do not share an entry on the one-shot executor and the step executor | `src/analyze/explore/__tests__/cache-area-isolation.test.ts` |
| pass | capability.reuse-check on different modules does not share an entry on either executor | `src/analyze/explore/__tests__/cache-area-isolation.test.ts` |
| pass | a row keyed the old way is not read, and the narrow phase writes under the area-aware key | `src/analyze/explore/__tests__/cache-area-isolation.test.ts` |
| pass | a version-2 row, written exactly as the previous code wrote it, is not read by either executor | `src/analyze/explore/__tests__/cache-area-isolation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/explore/__tests__/cache-area-isolation.test.ts` | 0 | 4 | 1 s |  |
| `src/analyze/explore/__tests__/exploration-cache-scope.test.ts` | 0 | 1 | 0.6 s |  |
| `src/analyze/explore/__tests__/removed-flags.test.ts` | 0 | 2 | 0.6 s |  |

## t13

Run at 2026-11-07T05:47:36.758Z on commit `736ae1190`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: answer-report-scope.test.ts: the scope line for request, prompt and not-recorded sources, same scopeRef with different scopeSource renders differently, a prompt-only docs analysis is not text-matched while a ranked concept.resolve result is**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the scope line for request, prompt and not-recorded sources, the same scopeRef with a different source renders differently, a prompt-only docs analysis is not text-matched while a ranked concept.resolve result is | `src/analyze/explore/__tests__/answer-report-scope.test.ts` |
| pass | the one-shot pipeline's report states the scope and who named it, with the same line the step tool renders for the same intent | `src/analyze/context/__tests__/pipeline-outcome.test.ts` |

**integration: start-request.test.ts: a state token lacking context and scopeSource still drives the plan and bundle phases and the report says the origin was not recorded**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a state token lacking context and scopeSource still drives the plan and bundle phases and the report says the origin was not recorded; the same intent renders the same scope line through a narrow continuation; request, prompt and older payloads differ | `src/daemon/steps/__tests__/start-request.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/pipeline-outcome.test.ts` | 0 | 21 | 0.8 s |  |
| `src/analyze/explore/__tests__/answer-report-scope.test.ts` | 0 | 1 | 0.4 s |  |
| `src/daemon/steps/__tests__/start-request.test.ts` | 0 | 5 | 1 s |  |

## t14

Run at 2026-11-07T05:53:34.818Z on commit `ea8112871`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: context-prompts.test.ts: context reaches the planning and synthesis prompts through both handlers and a narrow continuation without changing the named scope**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | context reaches the planning and synthesis prompts through both handlers and a narrow continuation, on its own line, without changing the named scope | `src/analyze/context/__tests__/context-prompts.test.ts` |

**integration: cache-key-scope.test.ts: the one-shot computeCacheKey differs for scope, question, context or scopeSource, a cached report renders its own scope line, and isolation is asserted on the one-shot key and the exploration cache**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the one-shot cache key differs for a different scope, question, context or scopeSource and is equal for the same request | `src/analyze/context/__tests__/cache-key-scope.test.ts` |
| pass | a cached bundle renders its own scope line: requests that differ only in who named the scope do not share a bundle | `src/analyze/context/__tests__/cache-key-scope.test.ts` |
| pass | two consecutive same-question requests on different modules do not share an entry on the one-shot executor and the step executor | `src/analyze/explore/__tests__/cache-area-isolation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/cache-key-scope.test.ts` | 0 | 2 | 0.8 s |  |
| `src/analyze/context/__tests__/context-prompts.test.ts` | 0 | 1 | 1.2 s |  |
| `src/analyze/explore/__tests__/cache-area-isolation.test.ts` | 0 | 4 | 1.1 s |  |

## t15

Run at 2026-11-07T05:56:35.735Z on commit `9032fa2e0`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: daemon-status-features.test.ts: buildDaemonStatus includes analyze-request and both the threaded admin handler and the single-threaded handler return it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | buildDaemonStatus includes analyze-request and both the threaded admin handler and the single-threaded handler return it | `src/daemon/__tests__/daemon-status-features.test.ts` |
| pass | daemon status payload: no storeFailure when healthy; kind, time, operation and cause when locks-lost | `src/daemon/__tests__/status-store-failure.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/daemon-status-features.test.ts` | 0 | 1 | 1 s |  |
| `src/daemon/__tests__/status-store-failure.test.ts` | 0 | 2 | 0.7 s |  |

## t16

Run at 2026-11-07T06:04:21.260Z on commit `6d1aadcdf`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: forward-step-features.test.ts: a request call to a daemon lacking analyze-request is refused with DaemonTooOldError, forwarded to a daemon that advertises it, a prompt-only call is forwarded to either, and a same-process reconnect that switches daemon capability between calls sees the change**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a request call to a daemon lacking analyze-request is refused with DaemonTooOldError, forwarded to a daemon that advertises it, a prompt-only call is forwarded to either, and a same-process reconnect that switches daemon capability between calls sees the change | `src/mcp/__tests__/forward-step-features.test.ts` |
| pass | a daemon that does not know daemon.status at all refuses a request call by name and runs no handler | `src/mcp/__tests__/forward-step-features.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/__tests__/forward-step-features.test.ts` | 0 | 2 | 1.2 s |  |

## t17

Run at 2026-11-07T06:08:46.607Z on commit `e259494d2`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: forward-step.test.ts: the thirteen tools keep their names, descriptions and input schemas against the regenerated golden file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | MCP tool surface: the thirteen tools keep their names, descriptions and input schemas | `src/mcp/__tests__/forward-step.test.ts` |

**integration: analyze-request-forward.test.ts: both registrations accept request-only, prompt-only and mixed calls, forward the request unchanged and reject a malformed request with the schema message**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | both analyze tools accept request-only, prompt-only and mixed calls, forward the request unchanged, and refuse a malformed request with the schema message | `src/mcp/__tests__/analyze-request-forward.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/__tests__/analyze-request-forward.test.ts` | 0 | 1 | 1.2 s |  |
| `src/mcp/__tests__/forward-step.test.ts` | 0 | 6 | 2.3 s |  |

## t18

Run at 2026-11-07T13:02:45.751Z on commit `366ac7b1c`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: steering-analyze-request.test.ts: the injected skeleton from steering-block.md, the template and both tool descriptions tell agents to send the request object and keep the decision rule**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the injected skeleton from steering-block.md, the template and both tool descriptions tell agents to send the request object and keep the decision rule | `src/daemon/__tests__/steering-analyze-request.test.ts` |

**integration: steering-gated-refresh.test.ts: the boot refresh does not publish the request guidance when the capability is absent and publishes it when present**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the boot refresh does not publish the request guidance when the capability is absent and publishes it when present | `src/daemon/__tests__/steering-gated-refresh.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/steering-analyze-request.test.ts` | 0 | 1 | 0.8 s |  |
| `src/daemon/__tests__/steering-gated-refresh.test.ts` | 0 | 1 | 0.6 s |  |

## t19

Run at 2026-11-07T09:31:53.821Z on commit `06b473e4b`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: npm run build typechecks and the analyze, daemon-step, daemon, db and MCP suites pass or inherited failures are recorded**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/take-structured-analyze-request-not-prompt-E2026110665b64384/S001/T19-VERIFICATION.md section 'Build and suites': per-suite counts; every failing file run alone at HEAD and at d923f91dc with the counts compared; the one failure not on the baseline (task-review-plan-path) traced to the other session's commit 3622c7780

**live: a live module-scope analysis and a prompt-only call against the daemon return answers whose reports state the scope**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/take-structured-analyze-request-not-prompt-E2026110665b64384/S001/T19-VERIFICATION.md section 'Live runs against the updated daemon' (module scope: 'Scope: module ..., named by the request'; prompt-only: 'Scope: workspace ..., the whole repository by default')

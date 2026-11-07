<!-- insrc:artifact PLAN-65b643840a294422-s1 -->

# Plan: STORY-65b643840a294422-s1

## Summary

**Epic:** `take-structured-analyze-request-not-prompt`
**LLD run:** `wf-1793992092485-royzfd`
**LLD effective hash:** `1fbc0044dfcb...`

The build lays the request type, the shared builder and the area helpers first, then the one validation hook (with a canonical-path rule) on both the step and one-shot paths, then moves the four plan-context sites onto the containing repository. On that base concept.resolve returns an anchor that the recipes, the capability runner and the docs adapters follow, the exploration cache is keyed on the area, and the report, prompts and one-shot cache key carry the scope and context. The daemon capability, the forwarder refusal, the MCP schemas, the gated steering publication and the rollout notes come last, followed by one verification pass.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add AnalyzeRequest, the two intent fields and the RPC parser support | S | — | — | unit: analyze-rpc-intent.test.ts: parseIntent keeps context and scopeSource, refuses a bad value of either, and parses an intent without them as before | [[c1]] [[c8]] |
| 2 | **`t2`** Add the synchronous shared request builder | S | — | `t1` | unit: request.test.ts: buildIntentFromRequest makes the same intent for a request through both tools, defaults target to code, ignores a flat target and size, refuses an empty question, an over-long context and a differing focus, and keeps context off scopeRef | [[c1]] [[c12]] |
| 3 | **`t3`** Move the area helpers to the shared scope module and add scopeArea | S | — | — | unit: scope-area.test.ts: graphRepoOf, inAreaOf, docsAreaOf and scopeArea behave as pinned after the move; scopeArea is null for workspace, repo and connection scopes and the one entity for a symbol; scopeAreaKey differs per area | [[c3]] |
| 4 | **`t4`** Add the canonical-path rule and validateRequestScope | M | — | `t3` | unit: scope-validate.test.ts: validateRequestScope refuses a nonexistent path, a wrong path kind and a scope in another registered repository, accepts an existing empty directory, leaves workspace, repo and connection scopes to the existing checks, and resolves '..' and equivalent spellings to one canonical path | [[c2]] [[c12]] |
| 5 | **`t5`** Run the validation hook on both resolution paths with the expected repository | M | — | `t2`, `t4` | integration: start-request.test.ts: the real start, plan and narrow handlers refuse a nonexistent path, a wrong path kind, a '..' path into another repository and a repository mismatch; integration: analyze-oneshot-handler.test.ts: the real one-shot handler and buildRun refuse the same invalid scopes through prepareScope with the repository from oneShotRunParams | [[c2]] [[c8]] |
| 6 | **`t6`** Make both tools use the builder and accept the request | M | — | `t5` | unit: analyze-oneshot-request.test.ts: checkOneShotArgs accepts a request with no focus, returns a message for a malformed request, requires one of request or focus; oneShotRunParams builds the intent from the builder and returns the expected repository; integration: start-request.test.ts: a valid request mints a state whose intent has the named scope, context and scopeSource request and measures the area that scope names | [[c8]] [[c1]] |
| 7 | **`t7`** Key graph reads on the containing repository at all four plan-context sites | M | — | `t3`, `t5` | integration: plan-module-scope.test.ts: the plan and the narrow resume pass the containing repository and the named area and return the module's entities; integration: oneshot-module-scope.test.ts: the one-shot shaper session and executePlan use graphRepoOf(scope) for module and manifest-dir scopes | [[c3]] |
| 8 | **`t8`** Scope concept.resolve to its area and return the anchor | M | — | `t3`, `t7` | unit: concept-resolve-scope.test.ts: no candidate outside the area, anchor named-scope with an empty hit list, a child does not displace the anchor, symbol anchor identity, entity hit to symbol anchor, workspace and repo results equal today's | [[c5]] |
| 9 | **`t9`** Follow the anchor in the planning recipes and the synthesizer prompt | M | — | `t8` | integration: request-end-to-end.test.ts: a module-scope request profiles the named module with no lexical match and a small symbol in a large file runs symbol-aware runners, skips or labels file-level runners and synthesis centres on the symbol | [[c5]] |
| 10 | **`t10`** Make capability.reuse-check use the named anchor | M | — | `t8` | integration: capability-reuse-anchor.test.ts: a capability question with no lexical match still inspects the named module, a higher-ranked child does not replace the subject, a symbol anchor is handled by entity id, on both execution modes | [[c5]] [[c12]] |
| 11 | **`t11`** Forward the docs area at both dispatch tables | M | — | `t3`, `t7` | unit: doc-area-forwarding.test.ts: the adapters for doc.mention, doc.decision-trace and doc.constraint-enumerate forward docsAreaOf(ctx.scope) for file and module scopes and no area for repo or workspace scopes; unit: docs-retrieval.test.ts: with a stubbed vector search an area passes only candidate ids inside the area, a stronger outside section never competes and no candidates performs no embedding; integration: docs-plan-area.test.ts: complete file-scope and module-scope docs plans return no section outside the area through the step executor and the one-shot executor | [[c6]] |
| 12 | **`t12`** Key the persistent exploration cache on the area and raise its version | M | — | `t8`, `t10`, `t11` | unit: exploration-cache-scope.test.ts: the key differs per area and per version, a version-2 row is not read and the narrow write uses the executor's key; integration: cache-area-isolation.test.ts: consecutive same-question requests on different modules, including capability.reuse-check, do not share an entry on the step and one-shot tools and a version-2 row is not read | [[c4]] |
| 13 | **`t13`** Report the scope in the answer | M | — | `t6`, `t8` | unit: answer-report-scope.test.ts: the scope line for request, prompt and not-recorded sources, same scopeRef with different scopeSource renders differently, a prompt-only docs analysis is not text-matched while a ranked concept.resolve result is; integration: start-request.test.ts: a state token lacking context and scopeSource still drives the plan and bundle phases and the report says the origin was not recorded | [[c7]] |
| 14 | **`t14`** Show scope and context in the prompts and key the one-shot cache | M | — | `t6` | integration: context-prompts.test.ts: context reaches the planning and synthesis prompts through both handlers and a narrow continuation without changing the named scope; integration: cache-key-scope.test.ts: the one-shot computeCacheKey differs for scope, question, context or scopeSource, a cached report renders its own scope line, and isolation is asserted on the one-shot key and the exploration cache | [[c10]] [[c7]] |
| 15 | **`t15`** Advertise the analyze-request capability in the shared status builder | S | — | — | unit: daemon-status-features.test.ts: buildDaemonStatus includes analyze-request and both the threaded admin handler and the single-threaded handler return it | [[c9]] |
| 16 | **`t16`** Refuse request-carrying calls to a daemon without the capability | M | — | `t15` | integration: forward-step-features.test.ts: a request call to a daemon lacking analyze-request is refused with DaemonTooOldError, forwarded to a daemon that advertises it, a prompt-only call is forwarded to either, and a same-process reconnect that switches daemon capability between calls sees the change | [[c9]] |
| 17 | **`t17`** Add the request object to both MCP schemas and regenerate the golden file | M | — | `t6`, `t16` | integration: forward-step.test.ts: the thirteen tools keep their names, descriptions and input schemas against the regenerated golden file; integration: analyze-request-forward.test.ts: both registrations accept request-only, prompt-only and mixed calls, forward the request unchanged and reject a malformed request with the schema message | [[c10]] [[c8]] |
| 18 | **`t18`** Publish the steering text safely and document the rollout | M | — | `t15`, `t17` | integration: steering-analyze-request.test.ts: the injected skeleton from steering-block.md, the template and both tool descriptions tell agents to send the request object and keep the decision rule; integration: steering-gated-refresh.test.ts: the boot refresh does not publish the request guidance when the capability is absent and publishes it when present | [[c10]] [[c11]] |
| 19 | **`t19`** Verify the whole change | S | — | `t9`, `t12`, `t13`, `t14`, `t18` | smoke: npm run build typechecks and the analyze, daemon-step, daemon, db and MCP suites pass or inherited failures are recorded; live: a live module-scope analysis and a prompt-only call against the daemon return answers whose reports state the scope | [[c11]] [[c13]] |

### 1.1 TASK-65b643840a294422-s1-t1 — Add AnalyzeRequest, the two intent fields and the RPC parser support

Add AnalyzeRequest to src/shared/analyze-types.ts; add optional context and scopeSource (explicit | undefined) to ClassifiedIntent and UnsizedIntent; make parseIntent in src/daemon/analyze-rpc.ts keep context (string, at most 4000 characters) and scopeSource ('request' or 'prompt') and refuse any other value; an intent without them parses as before.

**Acceptance checks:**
- parseIntent keeps context and scopeSource and refuses a bad value of either
- an intent without the fields parses exactly as before
- the project typechecks

### 1.2 TASK-65b643840a294422-s1-t2 — Add the synchronous shared request builder

Add buildIntentFromRequest in src/analyze/context/request.ts: builds the unsized intent from a request or the old flat fields, sets context and scopeSource, defaults target to code, ignores flat target and scope when a request is present, refuses an empty question, an over-long context and a request with a differing focus; it reads no file system or index.

**Acceptance checks:**
- the same request yields the same intent for the step tool's and the one-shot tool's inputs
- a prompt-only call gets the workspace scope and scopeSource prompt
- a request ignores a flat target and size

### 1.3 TASK-65b643840a294422-s1-t3 — Move the area helpers to the shared scope module and add scopeArea

Move graphRepoOf, inAreaOf and docsAreaOf from src/analyze/runtimes/shared/task-scope.ts to src/analyze/context/scope.ts, re-exporting them from the old path so task runtimes are unchanged; add scopeArea (dir, file or symbol area, null for workspace, repo and connection scopes) and scopeAreaKey (the serialised area, or 'repo') built on them.

**Acceptance checks:**
- task runtimes still pass their existing tests through the re-exports
- scopeArea of a symbol scope is the one entity and null for a workspace, repo or connection scope
- scopeAreaKey differs for two different modules

### 1.4 TASK-65b643840a294422-s1-t4 — Add the canonical-path rule and validateRequestScope

Add a canonical-path rule before repository resolution: a file, module or manifest-dir scope value is normalised to an absolute path with '.' and '..' segments resolved (symbolic links are not followed) and the one canonical string is used by containment, validateRequestScope, inAreaOf filtering and the cache area key. Add validateRequestScope in src/analyze/context/scope.ts with ScopeNotFoundError (missing or wrong path type) and ScopeRepoMismatchError (scope in a registered repository other than expectedRepo); a valid existing empty directory is a valid empty area.

**Acceptance checks:**
- /work/a/../b/file.ts is resolved to /work/b/file.ts and refused with ScopeRepoMismatchError when the call's repository is /work/a
- equivalent spellings of one path give the same scope value and cache key
- a nonexistent file, a directory given as a file scope and a file given as a module scope are refused with ScopeNotFoundError
- an existing directory with no stored entity is accepted

### 1.5 TASK-65b643840a294422-s1-t5 — Run the validation hook on both resolution paths with the expected repository

Give stepScope and prepareScope an optional expectedRepo argument that calls validateRequestScope after resolution; the step start passes the resolved repository, plan and narrow pass the state's repoPath; oneShotRunParams returns expectedRepo and the daemon's buildRun passes it to prepareScope, so start, plan, narrow and the one-shot run refuse an invalid scope before any read.

**Acceptance checks:**
- the real step handlers refuse an invalid scope at start, plan and narrow
- the real one-shot handler refuses an invalid scope before any read
- a continuation repeats the check
- a '..' path that enters another registered repository is refused through both real handlers, comparing the canonical path

### 1.6 TASK-65b643840a294422-s1-t6 — Make both tools use the builder and accept the request

Add an optional request to StepInputStart (focus optional, one required) and to the one-shot arguments; handleStart and oneShotRunParams use buildIntentFromRequest; checkOneShotArgs accepts a request in place of a focus and returns a message for a malformed request; prompt-only calls keep working and stay accepted (refusal only by a declared contract in a later Story).

**Acceptance checks:**
- handleStart with a request mints a state whose intent has the named scope, context and scopeSource request
- checkOneShotArgs accepts a request with no focus and returns a message for a malformed one
- a prompt-only call behaves as before

### 1.7 TASK-65b643840a294422-s1-t7 — Key graph reads on the containing repository at all four plan-context sites

Use graphRepoOf(scope) for repoPath and closureRepos at step plan (phases/plan.ts), step narrow resume (phases/narrow.ts), the one-shot shaper session (context/driver.ts) and one-shot executePlan (context/driver.ts), passing the named area as ctx.scope; the resumed plan uses the same key as the paused one.

**Acceptance checks:**
- for a module and a manifest-dir scope with entities stored under the registered repository, module.profile and symbol.locate return the module's entities on both tools
- a post-narrow resume uses the same repository key
- a repo or workspace scope keeps today's values

### 1.8 TASK-65b643840a294422-s1-t8 — Scope concept.resolve to its area and return the anchor

Restrict concept.resolve candidates to the area (inAreaOf), add ConceptAnchor (path, kind, source, entityId and filePath for a symbol) to the output, convert a ranked entity hit to a symbol anchor, and return the named area as the anchor even when no hit exists; a repo or workspace scope returns hits[0] converted, or none.

**Acceptance checks:**
- no hit outside the named area is returned and the anchor is the area with source named-scope even with no hit
- a child that outranks the named module does not displace the anchor
- a workspace or repo scope returns hits[0] as the anchor
- a ranked entity hit becomes a symbol anchor

### 1.9 TASK-65b643840a294422-s1-t9 — Follow the anchor in the planning recipes and the synthesizer prompt

Change the recipes in src/prompts/analyze/decompose.system.md from hits[0].path to anchor.path and the instruction in src/prompts/analyze/synthesize.code.system.md to centre on the anchor; for a symbol anchor chain symbol-aware explorations on the entity id and skip or label file-level dependents (module.profile, convention.detect) as contextual file expansion.

**Acceptance checks:**
- a module-scope request profiles the named module through the real dependent runners even when the question shares no word with it
- a small symbol in a large file keeps file-level explorations skipped or labelled contextual and is sized and searched as the one entity
- legacy repo and workspace plans behave as before

### 1.10 TASK-65b643840a294422-s1-t10 — Make capability.reuse-check use the named anchor

In prepareCapabilityReuseCheck (and its run path) take the candidates from the named-scope anchor when concept.resolve returns one, instead of short-circuiting on empty hits or profiling only ranked hits; handle a symbol anchor by entity id; record completeness honestly when the area is empty.

**Acceptance checks:**
- a capability question whose wording shares no token with the named module still inspects that module
- a higher-ranked child does not replace the named subject
- a symbol anchor is handled by entity id

### 1.11 TASK-65b643840a294422-s1-t11 — Forward the docs area at both dispatch tables

Give doc.mention an area argument forwarded to retrieveDocSections; make the one-shot RUNNERS dispatch adapters and the step NARROW_RUNNERS.prepare adapters (separate code paths) for doc.mention, doc.decision-trace and doc.constraint-enumerate pass docsAreaOf(ctx.scope); repo and workspace scopes pass no area.

**Acceptance checks:**
- a file and a module docs plan returns no section outside the area on both execution modes
- with no candidate in the area no embedding runs
- repo and workspace scopes call retrieval as before

### 1.12 TASK-65b643840a294422-s1-t12 — Key the persistent exploration cache on the area and raise its version

Hash scopeAreaKey into the cache params of concept.resolve, the doc.* explorations and capability.reuse-check through one key function used by the executor and by the narrow phase's write; raise EXPLORATION_CACHE_VERSION to 3 so older rows (without an anchor) are not read.

**Acceptance checks:**
- two consecutive same-question requests on different modules do not share an entry on either tool, including capability.reuse-check
- a version-2 row is not read
- the narrow write and the executor write use the same key function

### 1.13 TASK-65b643840a294422-s1-t13 — Report the scope in the answer

Add scope { kind, value, named } to the answer report through reportFromLookups at both call sites (context/driver.ts and the step bundle path) and render one line: the workspace default from scopeSource; anchor selection only when an executed concept.resolve result establishes it; not-recorded for older payloads.

**Acceptance checks:**
- both tools, including a narrow continuation, render the same scope line for the same intent
- a prompt-only docs analysis is not described as text-matched
- a structured workspace request and a prompt-only call with the same question render differently

### 1.14 TASK-65b643840a294422-s1-t14 — Show scope and context in the prompts and key the one-shot cache

Show scope, question and context on separate lines in the planning prompt and context as background in synthesis; include scope, question, context and scopeSource in computeCacheKey.

**Acceptance checks:**
- context reaches the planning and synthesis prompts through both handlers and a narrow continuation without changing the named scope
- the one-shot cache key differs for a different scope, question, context or scopeSource and is equal for the same request
- scopeSource is pinned in cache verification including cached final-report rendering

### 1.15 TASK-65b643840a294422-s1-t15 — Advertise the analyze-request capability in the shared status builder

Add features (readonly string[]) containing 'analyze-request' to DaemonStatus in src/shared/types.ts and to buildDaemonStatus in src/daemon/status.ts, so the threaded admin handler and the single-threaded handler both return it.

**Acceptance checks:**
- daemon.status returns the feature from the threaded and the single-threaded handler
- the DaemonStatus type includes features

### 1.16 TASK-65b643840a294422-s1-t16 — Refuse request-carrying calls to a daemon without the capability

In src/mcp/forward-step.ts, reuse the existing daemon.status request and the DaemonStatus type from t15 (no new RPC) to read features before forwarding a call that carries a request object to insrc_analyze_step or insrc_analyze, on a fresh connection per call, and throw DaemonTooOldError when 'analyze-request' is absent; prompt-only calls are always forwarded.

**Acceptance checks:**
- a request call to a daemon without the feature is refused with DaemonTooOldError
- a prompt-only call is forwarded to any daemon
- a same-process reconnect test that switches daemon capability between calls sees the change

### 1.17 TASK-65b643840a294422-s1-t17 — Add the request object to both MCP schemas and regenerate the golden file

Add the request object to the zod input schemas of insrc_analyze_step and insrc_analyze in src/mcp/server.ts, update the tool descriptions, and regenerate src/mcp/__tests__/fixtures/tool-surface.golden.json.

**Acceptance checks:**
- the tool-surface test passes against the regenerated golden file
- both registrations accept request-only, prompt-only and mixed calls and reject a malformed request with the schema message
- a request is forwarded to the daemon handlers unchanged

### 1.18 TASK-65b643840a294422-s1-t18 — Publish the steering text safely and document the rollout

Gate publication of the request guidance so the daemon's boot-time steering refresh includes it only when the daemon advertises analyze-request; update src/prompts/steering-block.md (the injected skeleton), src/mcp/steering-template.md and the tool descriptions to tell agents to send the request object while keeping the search-versus-analysis rule; document the deploy order (update MCP processes, then restart the daemon, or suspend analysis during the transition), that in-flight tokens end at the restart, that zeroDowntime is false, that prompt-only calls stay accepted with refusal only by a declared contract in a later Story, and that the follow-up Story is limited to runners that already have an area filter.

**Acceptance checks:**
- the boot refresh does not publish the request guidance when the capability is absent
- the injected skeleton from steering-block.md tells agents to send the request object and keeps the decision rule
- the migration notes state zeroDowntime false and the deploy order

### 1.19 TASK-65b643840a294422-s1-t19 — Verify the whole change

Run the typecheck (npm run build), the analyze, daemon-step, daemon, db and MCP suites once, and one live analysis with a named module scope and one prompt-only call against the daemon; record results in the build record.

**Acceptance checks:**
- npm run build passes
- the named suites pass or any inherited failure is recorded
- a live module-scope analysis and a prompt-only call return answers whose reports state the scope

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/analyze/context/__tests__/request.test.ts: buildIntentFromRequest makes the same intent for a request through the step tool's and the one-shot tool's inputs; a request without target gets code; a request ignores a flat target and size; a prompt-only call gets the workspace scope and scopeSource prompt; a request and a different focus are refused; an empty question and an over-long context are refused; context is carried on the intent and never changes scopeRef | `t2` |
| src/analyze/context/__tests__/scope-validate.test.ts: validateRequestScope refuses a nonexistent file or directory inside an indexed repository, a directory given as a file scope, a file given as a module scope, and a scope in another registered repository; accepts an existing directory that holds no stored entity as a valid empty area; leaves workspace, repo and connection scopes to the existing checks | `t4` |
| src/analyze/context/__tests__/scope-area.test.ts: graphRepoOf, inAreaOf, docsAreaOf and scopeArea behave as the task runtimes' tests already pin after the move, and scopeArea returns null for workspace, repo and connection scopes and the one entity for a symbol | `t3` |
| src/daemon/steps/__tests__/analyze-oneshot-request.test.ts: checkOneShotArgs accepts a request with no focus, returns a message for a missing question, an unknown scopeRef kind, a non-string value or context and for a request plus a differing focus, and still requires one of the two; oneShotRunParams builds the intent from the builder and returns the expected repository | `t6` |
| src/daemon/__tests__/analyze-rpc-intent.test.ts: parseIntent keeps context and scopeSource, refuses a bad value of either, and parses an intent without them as before | `t1` |
| src/analyze/explore/__tests__/concept-resolve-scope.test.ts: with a module, manifest-dir, file or symbol scope no candidate outside the area is returned, the anchor is the area with source named-scope even with an empty hit list, and a child that outranks the named module does not displace the anchor; a symbol scope gives kind symbol with entityId and the file; a ranked hit of kind entity becomes a symbol anchor; with a workspace or repo scope the result equals today's and the anchor is hits[0] | `t8` |
| src/analyze/__tests__/docs-retrieval.test.ts: with a stubbed vector search, an area passed to retrieveDocSections passes only candidate ids inside the area, a stronger-matching section outside the area never competes, and no candidates inside the area performs no embedding | `t11` |
| src/analyze/explore/__tests__/doc-area-forwarding.test.ts: the adapters for doc.mention, doc.decision-trace and doc.constraint-enumerate forward docsAreaOf(ctx.scope) for a file and a module scope and forward no area for a repo or workspace scope | `t11` |
| src/db/__tests__/exploration-cache-scope.test.ts: the cache key differs for the same exploration and params under different areas and under version 2 and 3, a version-2 row is not read, and the narrow-phase write uses the executor's key | `t12` |
| src/analyze/explore/__tests__/answer-report-scope.test.ts: reportFromLookups renders the scope line for request, prompt and not-recorded sources; two intents with the same scopeRef but different scopeSource render differently; a prompt-only docs analysis is not described as text-matched while a ranked concept.resolve result is | `t13` |
| src/daemon/steps/analyze-step/__tests__/start-request.test.ts: through the real handleStart, plan and narrow handlers, a request with a nonexistent path, a wrong path kind or a scope in another repository is refused at start, and refused at a plan or narrow continuation when the state's repository no longer matches; a valid request mints a state whose intent has the named scope, context and scopeSource request and measures the area that scope names | `t5`, `t6` |
| src/daemon/steps/__tests__/analyze-oneshot-handler.test.ts: through the real one-shot handler and buildRun, the same invalid scopes are refused through prepareScope with the repository from oneShotRunParams | `t5` |
| src/daemon/steps/analyze-step/__tests__/plan-module-scope.test.ts: for a module and a manifest-dir scope with entities stored under the registered repository root, the plan and the narrow resume both pass the containing repository as repoPath and closureRepos and the named area as ctx.scope, the resumed plan uses the same key as the paused one, and module.profile and symbol.locate return the module's entities instead of an empty list | `t7` |
| src/analyze/context/__tests__/oneshot-module-scope.test.ts: the one-shot shaper session and executePlan use graphRepoOf(scope) for a module and a manifest-dir scope with entities stored under the containing repository | `t7` |
| src/analyze/explore/__tests__/cache-area-isolation.test.ts: two consecutive requests with the same question against two different modules, on the step tool and on the one-shot tool, run concept.resolve twice with different areas and the second does not receive the first module's anchor or hits; a row written under version 2 is not read | `t12` |
| src/analyze/context/__tests__/cache-key-scope.test.ts: the one-shot computeCacheKey differs for a different scope, question, context or scopeSource and is equal for the same request; a cached final report renders the scope line of its own intent for a structured workspace request and a prompt-only call; the step tool has no bundle cache (readBundleForStep returns null), so isolation is asserted on the one-shot key and on the exploration cache, not on handleStart | `t14` |
| src/analyze/explore/__tests__/docs-plan-area.test.ts: a complete file-scope and module-scope docs plan returns no section outside the area through the step executor and the one-shot executor | `t11` |
| src/analyze/explore/__tests__/request-end-to-end.test.ts: a module-scope request runs planning and execution and the recipes chained on the anchor profile the named module even when the question shares no word with it; a symbol-scope request on a small symbol in a large file runs the real symbol-aware dependent runners on the entity, skips or labels contextual the file-level runners, and the synthesis prompt centres on the symbol | `t9` |
| src/analyze/explore/__tests__/context-prompts.test.ts: context reaches the planning prompt and the synthesis prompt through both handlers and through a narrow continuation, without changing the named scope | `t14` |
| src/daemon/steps/analyze-step/__tests__/start-request.test.ts: a state token whose intent lacks context and scopeSource still drives the plan and bundle phases and the final report says the origin was not recorded | `t13` |
| src/mcp/__tests__/forward-step.test.ts: the thirteen tools keep their names, descriptions and input schemas against the regenerated golden file with the request object on both analyze tools | `t17` |
| src/mcp/__tests__/analyze-request-forward.test.ts: both registrations accept a request-only call, a prompt-only call and a mixed call, forward the request object to the daemon handlers unchanged, and reject a malformed request with the schema message | `t17` |
| src/mcp/__tests__/forward-step-features.test.ts: mixed versions: the forwarder refuses a request-carrying call to a daemon whose daemon.status lacks analyze-request with DaemonTooOldError, forwards the same call to a daemon that advertises it, and forwards a prompt-only call to either | `t16` |
| src/daemon/__tests__/steering-analyze-request.test.ts: the skeleton returned by the injected-block path from src/prompts/steering-block.md tells agents to read the user's prompt, decide the scope and send the request object, and still contains the search-versus-analysis decision rule; src/mcp/steering-template.md and both tool descriptions say the same | `t18` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD-65b643840a294422-s1 contractDetails: AnalyzeRequest, buildIntentFromRequest and the intent fields`
- **[[c2]]** `prior-artifact` `LLD-65b643840a294422-s1 contractDetails: validateRequestScope and the stepScope and prepareScope hook`
- **[[c3]]** `prior-artifact` `LLD-65b643840a294422-s1 dataModelChanges: area helpers and the repository key at four plan-context sites`
- **[[c4]]** `prior-artifact` `LLD-65b643840a294422-s1 dataModelChanges: persistent exploration cache key and version`
- **[[c5]]** `prior-artifact` `LLD-65b643840a294422-s1 contractDetails: ConceptResolveOutput.anchor, recipes and capability consumer`
- **[[c6]]** `prior-artifact` `LLD-65b643840a294422-s1 dataModelChanges: document explorations area forwarding`
- **[[c7]]** `prior-artifact` `LLD-65b643840a294422-s1 contractDetails: reportFromLookups scope field and one-shot cache key`
- **[[c8]]** `prior-artifact` `LLD-65b643840a294422-s1 contractDetails: handleStart, oneShotRunParams, checkOneShotArgs, parseIntent`
- **[[c9]]** `prior-artifact` `LLD-65b643840a294422-s1 contractDetails: daemon capability and forwarder refusal`
- **[[c10]]** `prior-artifact` `LLD-65b643840a294422-s1 dataModelChanges: MCP schemas, golden file, prompts and steering text`
- **[[c11]]** `prior-artifact` `LLD-65b643840a294422-s1 migration: deploy order, backward compatibility and verification`
- **[[c12]]** `prior-artifact` `LLD-65b643840a294422-s1 errorPaths: error cases, edge cases and invariants`
- **[[c13]]** `prior-artifact` `LLD-65b643840a294422-s1 testStrategy: unit, integration and contract levels`

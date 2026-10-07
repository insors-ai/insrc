<!-- insrc:artifact PLAN-b9d5c5c40df5a574-s6 -->

# Plan: E20261007b9d5c5c4:S006

## Summary

**Epic:** `make-insrc-analysis-complete-used-right`
**LLD run:** `wf-1791360221429-2l2w8l`
**LLD effective hash:** `7d17654ecfd1...`

Building this Story is mostly work inside the analyzer's context builder. It starts with small additive pieces that nothing calls yet (new error codes and classes, one shared test for a failed model call, a function that resolves a scope once, a corrected table of which scope goes with which source). It then changes the lookup pipeline to return a named cause where it returns nothing today, moves every reader of a scope to the resolved one, and only then removes the two gates that stop a broad request and four kinds of scope from being served. The plan tree's two classification branches and live checks against the real model come last.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Declare the new codes and error classes, and map them on both sides | S | — | unit: both classifyShaperError functions map each of the five new error classes to its code; unit: one list of ten error classes gives the same code from the plan tree's and the daemon's mapping; unit: ShaperLlmUnavailableError message with and without a call | [[c1]] [[c2]] [[c5]] |
| 2 | **`t2`** One shared test for a failed model call, used by the planning and answer-writing calls | M | `t1` | unit: isModelCallFailure: Ollama texts, CLI call failures, ModelCallFailedError are failures; shape failures are not; unit: planning and answer-writing classifiers raise their model-unavailable error for a CLI call failure; unit: sampling provider raises ModelCallFailedError when the sampler rejects; non-text content is a shape failure; unit: model-unavailable messages are provider-neutral and carry the underlying message in a field | [[c2]] [[c3]] |
| 3 | **`t3`** Move the six other copies of the failure-text list to the shared test | M | `t2` | unit: source search: the failure-text list exists only in model-failure.ts; unit: each of the six callers classifies a CLI call failure as its model-unavailable error and a shape failure as its schema error | [[c2]] [[c7]] |
| 4 | **`t4`** The scope module: resolve a scope once | M | `t1` | unit: resolveScope for each of the seven kinds, with nested repos; unit: resolveScope symbol cases: split, no '#', none, two, '#' in the path; unit: resolveScope connection cases: one, none, two, unparseable connections file; unit: resolveScope directory kinds keep their own directory as lookupPath; a path in no repo gives repoPath null; unit: resolveScope symbol not-indexed cases: empty repo, no containing repo, empty registry | [[c1]] [[c3]] |
| 5 | **`t5`** Correct the pairing table, the symbol form in the validator, and the classifier prompt | S | — | unit: pairing matrix: thirty-five pairings against the corrected rows; unit: validator symbol form: passes, no '#', file part not a file; unit: classifier prompt's pairing list equals the exported table | [[c1]] [[c2]] |
| 6 | **`t6`** The pipeline returns a named cause, and one table converts it to an error | L | `t1`, `t2` | unit: pipeline returns each cause for the stand-in that produces it, including 'empty-plan' through the fourth stand-in; unit: pipeline returns 'not-applicable' for classification and task modes; unit: cause-to-error table: one case per cause, ShaperLlmUnavailableError only for the two model-failed causes; unit: runShaper throws ShaperAnswerInvalidError with stage 'bundle validation' for an invalid bundle; unit: error messages state the cause, name the failed call, and never say retries or Ollama for another provider; unit: CLI and sampling call failures give 'planner-model-failed' and 'answer-model-failed' from the pipeline; unit: focused request on a repo: stand-in arguments and bundle equal the recorded baseline | [[c1]] [[c3]] [[c5]] |
| 7 | **`t7`** Resolve the scope for every mode inside the context builder | L | `t4`, `t5`, `t6` | unit: pipeline returns a bundle for file, symbol, manifest directory and connection scopes with the resolved lookup path; unit: module scope: lookup path and cache key unchanged; unit: runShaper refuses a pairing the table does not allow before resolving the scope; unit: indexed check takes a resolved scope: eight rewritten cases plus the symbol exception; unit: scope-path inference cases rewritten against resolveScope; unit: tool loop's path for classification and task modes is the resolved lookupPath; unit: generic and classification-mode requests on a symbol in an unindexed repo fail as not indexed; on a module they proceed | [[c1]] [[c2]] [[c3]] [[c5]] |
| 8 | **`t8`** The planning prompt's user turn and the step tool take the resolved scope | M | `t7` | unit: planning user turn: 'Repo path' from lookupPath, and the line naming a file, entity or connection; unit: prepareDecompose and decompose build the same user turn for a resolved scope; unit: step tool start phase: resolved workspace scope, and the pairing test refusing a stand-in scope; unit: step tool plan and narrow phases resolve the scope from a token that has no scope field | [[c2]] [[c5]] |
| 9 | **`t9`** The free-form lookup receives the request's scope | M | `t7`, `t8` | unit: free-form lookup for a file-scope request builds a file intent and uses the resolved repo as the loop's path; unit: free-form loop's path for a connection is the connection's repo | [[c2]] [[c4]] |
| 10 | **`t10`** Serve a request with no focus | M | `t8`, `t9` | unit: pipeline returns a bundle for an unfocused intent on a repo, a module and a workspace; unit: planning prompt has a no-focus recipe per kind of source, with existing lookups and no limit parameter; unit: planning user turn for an unfocused intent names the no-focus section; unit: every prompt that prints the intent's focus states the no-focus rule; unit: free-form replacement's purpose for an unfocused intent is the broad survey | [[c1]] [[c2]] [[c3]] |
| 11 | **`t11`** The plan tree's two classification branches | M | `t1`, `t4`, `t5` | integration: hinted request: focused with the prompt as focus, unfocused with an empty prompt; integration: hinted pairing the table refuses fails at 'classify' with a failed run record; integration: hinted request with a scope that does not resolve fails with 'scope-ref-unresolved'; integration: hinted request with a valid pairing reaches the context builder and the planner; unit: plan tree's classify mapping returns the inner code and passes context errors on; the table-test row rewritten; unit: the classifier receives a connection check from each caller | [[c1]] [[c3]] [[c5]] |
| 12 | **`t12`** Live checks and the mirrored contract | S | `t10`, `t11` | live: unfocused code request on this repository returns a bundle with a no-focus focus layer; live: file scope and symbol scope return a bundle; live: real planning call follows the no-focus recipe for code and returns a free-form lookup for docs; live: failure codes: 'scope-ref-unresolved' with the model running, 'shaper-llm-unavailable' with it stopped | [[c4]] [[c5]] |

### 1.1 E20261007b9d5c5c4:S006:T001 — Declare the new codes and error classes, and map them on both sides

Add 'no-plan-for-request', 'answer-step-failed' and 'run-abandoned' to RunErrorCode and AnalyzeRpcErrorCode. Add the five error classes of the context builder (ShaperInvalidInputError, ShaperNoPlanError, ScopeRefUnresolvedError, ScopeKindTargetMismatchError, ShaperAnswerInvalidError with its stage) and the optional 'call' argument on ShaperLlmUnavailableError. Add their cases to both classifyShaperError functions. Nothing raises them yet.

**Acceptance checks:**
- The three codes are members of both unions, proven by a compile-time assignment in a source file
- Both classifyShaperError functions return the stated code for each of the five new classes, and one test iterates a single list of classes through both
- ShaperLlmUnavailableError built with a call reads 'The model call for <call> failed: ...'; built without one it keeps today's text
- The tests are run under Node 22 and pass

### 1.2 E20261007b9d5c5c4:S006:T002 — One shared test for a failed model call, used by the planning and answer-writing calls

Add src/analyze/context/model-failure.ts with isModelCallFailure: the existing Ollama and socket texts, the CLI provider's failures of the call itself, and a typed ModelCallFailedError that the sampling provider raises when the sampling request fails. Use it in the classifiers of the planning call and the answer-writing call. Replace the 'Local Ollama' prefix on their two model-unavailable errors with a provider-neutral one, give each a field holding the underlying message, and give their two prompt-missing errors a path field.

**Acceptance checks:**
- isModelCallFailure is true for each Ollama text, each CLI call failure and ModelCallFailedError, and false for a shape failure
- With a stand-in provider that throws a CLI call failure, the planning call raises its model-unavailable error and so does the answer-writing call; neither raises a schema error
- A stand-in sampler that rejects makes the sampling provider raise ModelCallFailedError; a response that is not text stays a shape failure
- Neither model-unavailable error's message contains 'Ollama' for a failure that did not come from Ollama
- The tests are run under Node 22 and pass

### 1.3 E20261007b9d5c5c4:S006:T003 — Move the six other copies of the failure-text list to the shared test

Replace the list in the plan tree's planner, its aggregator, the classifier, the scope picker, the summariser and the tool loop's classifyOllamaError with a call to isModelCallFailure. Each keeps its own error classes and codes.

**Acceptance checks:**
- No file under src/analyze other than model-failure.ts contains the failure-text list (a test searches the source)
- For each of the six callers a stand-in CLI call failure gives that caller's model-unavailable error and a shape failure gives its schema error
- Every existing test of those six classifiers is run under Node 22 and still passes

### 1.4 E20261007b9d5c5c4:S006:T004 — The scope module: resolve a scope once

Add src/analyze/context/scope.ts with resolveScope, ResolvedScope and ScopeDeps (registered repos, entities by file, entities by repo, connections by repo). Rules: directory kinds keep their own directory as lookupPath; a file and a symbol use the containing registered repo; a symbol is '<absolute file path>#<name>', split at the last '#', and must match exactly one stored entity; a connection id must be declared by exactly one registered repo. A symbol outside any registered repo, with an empty registry, or in a repo with no stored entities fails as not indexed. Nothing calls it yet.

**Acceptance checks:**
- resolveScope returns the stated fields for each of the seven kinds, with longest-prefix choice between nested repos
- A module and a manifest directory inside a registered repo keep their own directory as lookupPath; making lookupPath the repo root makes this test fail
- Symbol: no '#', no entity, two entities (both listed) fail with ScopeRefUnresolvedError; the three not-indexed cases fail with ScopeNotIndexedError
- Connection: one repo resolves; none and two fail with ScopeRefUnresolvedError naming the repos; a connections file that fails to parse is reported, not skipped
- The tests are run under Node 22 and pass

### 1.5 E20261007b9d5c5c4:S006:T005 — Correct the pairing table, the symbol form in the validator, and the classifier prompt

Change TARGET_TO_KINDS to the corrected rows with its comment. Make the validator split a symbol's value at the last '#' before any file-system test. Rewrite the classifier prompt's pairing list and its rule for a symbol's value. Rewrite the matrix test and add the test that compares the prompt with the table.

**Acceptance checks:**
- The matrix test asserts every pairing of five kinds of source and seven kinds of scope against the corrected rows
- A symbol value in the new form passes when its file exists and fails with 'scope-ref-unresolved' with no '#' or a file part that is not a file
- A test reads the classifier prompt and finds the same rows as the exported table; changing one row in either makes it fail
- The tests are run under Node 22 and pass

### 1.6 E20261007b9d5c5c4:S006:T006 — The pipeline returns a named cause, and one table converts it to an error

Change the pipeline's return type to the three-case outcome with the eight causes. Give each of its null returns its cause, including the catch-all after the answer-writing call. Add the exhaustive table from cause to error in runShaper, report a bundle that fails validation as ShaperAnswerInvalidError, and delete the single 'model unavailable' throw. Export the pipeline for tests with four steps passed in (planning, lookups, answer writing, free-form replacement). Both gates stay in this task, each returning its own cause.

**Acceptance checks:**
- The pipeline returns each of the eight causes for the stand-in input that produces it, and 'not-applicable' for classification and task modes
- The table has one case per cause with a never check and no bare default; only the two model-failed causes give ShaperLlmUnavailableError
- Each error's message states its cause; none says retries were exhausted; the two prompt-missing errors carry the prompt's path
- For a request with a focus on a repo, the planning, lookup and answer-writing stand-ins each receive the same arguments as a baseline recorded before the change, and the bundle is equal
- The tests are run under Node 22 and pass

### 1.7 E20261007b9d5c5c4:S006:T007 — Resolve the scope for every mode inside the context builder

In runShaper, make the pairing check for run mode, then call resolveScope for every mode. Move the readers inside the context builder to the resolved scope: the cache freshness read, the tool loop's path at both call sites, the pipeline's lookup path and freshness read, and the indexed check, whose signature changes to take the resolved scope. Delete resolveRepoPath, inferRepoPath and inferScopePath with the test export. Remove the pipeline's gate on the kind of scope.

**Acceptance checks:**
- The pipeline returns a bundle for a file, a symbol, a manifest directory and a connection scope with the resolved path given to the lookups; restoring the gate on the kind of scope makes this test fail
- A module scope gives the lookups the module's own directory and the same lookup cache key as before
- runShaper in run mode refuses a pairing the table does not allow, with ScopeKindTargetMismatchError, before resolving the scope
- The rewritten tests of the indexed check (eight calls) and of scope-path inference keep every case they had, and add the symbol exception
- A generic request and a classification-mode request on a symbol in a repo with no stored entities fail as not indexed; the same on a module proceed
- The tests are run under Node 22 and pass

### 1.8 E20261007b9d5c5c4:S006:T008 — The planning prompt's user turn and the step tool take the resolved scope

Give decompose's arguments and prepareDecompose a resolved scope, and have buildMessages print lookupPath as the 'Repo path' line plus one line naming the file, entity or connection. In the step tool, resolve the scope and make the pairing test in the start phase, and have the plan and narrow phases resolve the scope again from the intent in the state token, whose shape does not change.

**Acceptance checks:**
- For a module scope the user turn's 'Repo path' line is the module's directory, as before; for a file, a symbol and a connection it has the further line
- prepareDecompose given a resolved scope returns the same user turn as decompose builds for it
- The step tool's start phase passes a resolved workspace scope and returns an error result, minting no state, for a stand-in pairing the table refuses
- A state token minted without any scope field still drives the plan and narrow phases
- The tests are run under Node 22 and pass

### 1.9 E20261007b9d5c5c4:S006:T009 — The free-form lookup receives the request's scope

Add the resolved scope to the lookup executor's runner context and to executePlan's and stepPlan's arguments. Make the free-form lookup build its intent with the request's own scope and pass the resolved scope to runShaperToolLoop, whose arguments gain it and which takes the loop's path from lookupPath.

**Acceptance checks:**
- A file-scope request whose plan is replaced by the free-form lookup builds an intent of kind 'file' with the file's path, and the loop's path is the resolved repo
- For a connection the loop's path is the connection's repo, not the working directory
- The existing free-form tests are run under Node 22 and pass

### 1.10 E20261007b9d5c5c4:S006:T010 — Serve a request with no focus

Add the section for an intent with no focus to the planning prompt, one recipe per kind of source, after the other recipes and before the output format, and name it from the user turn. Add the rule for an intent with no focus to the six answer-writing prompts. Change the free-form replacement's purpose for such an intent to a stated broad survey. Then remove the pipeline's gate on an unfocused intent.

**Acceptance checks:**
- The pipeline returns a bundle for an unfocused intent on a repo, a module and a workspace, and the planning stand-in received the unfocused intent; restoring the gate makes this test fail
- The planning prompt has a recipe for each of the five kinds of source, naming only lookups that exist and no limit parameter; removing the section makes this test fail
- Every prompt that prints the intent's focus states what to write when there is none; the test finds those prompts by search
- An unfocused intent replaced by the free-form lookup gets the broad-survey purpose, not the classifier's reasoning text
- The tests are run under Node 22 and pass

### 1.11 E20261007b9d5c5c4:S006:T011 — The plan tree's two classification branches

On the branch for a request with a stated kind of source, carry the trimmed prompt as the focus and call the validator on the intent. Supply the connection check from both callers of the classifier and from the daemon's classify request. Change the plan tree's classify mapping to return the validator's inner code and to pass other errors to the context mapping, and rewrite the two existing tests that pin the old behaviour.

**Acceptance checks:**
- With a prompt the hinted intent is focused with the prompt as its focus; with an empty prompt it is unfocused
- A hinted pairing the table refuses, and a scope that does not resolve, fail the run at stage 'classify' with the check's code and a failed run record
- The classify mapping returns the inner code of ClassifierValidationExhausted and maps a context error through classifyShaperError
- The classifier receives a connection check from each of its callers
- The tests are run under Node 22 and pass

### 1.12 E20261007b9d5c5c4:S006:T012 — Live checks and the mirrored contract

Add the live tests gated by INSRC_LIVE_TESTS. They start the context build in process from this working tree, with the real model and the real stores read through the running daemon's index, so they do not depend on the installed daemon having the new code. Run them: an unfocused code request, a file scope and a symbol scope return a bundle; the real planning call follows the recipe; failures carry the right code. Record the three new codes for the IDE repository.

**Acceptance checks:**
- An unfocused code request on this repository returns a bundle whose focus layer says there is no focus and names the scope, with no 'undefined' and no '<intent.focus>'
- The real planning call for an unfocused code request on a module returns the recipe's lookups on that module's path
- A scope that does not resolve fails with 'scope-ref-unresolved' while the model is running
- The full unit sweep of src/analyze, src/mcp and src/daemon passes under Node 22

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| pipeline returns 'bundle' for an unfocused intent on a repo, a module and a workspace, and the planning stand-in received the unfocused intent (mutation: restore the focused gate, the test fails) | `t10` |
| pipeline returns 'bundle' for a file, a symbol, a manifest directory and a connection scope, and the lookup stand-in received the resolved repo as its path (mutation: restore the scope-kind gate) | `t7` |
| pipeline returns each of 'planner-model-failed', 'planner-prompt-missing', 'answer-model-failed', 'answer-prompt-missing', 'answer-invalid', 'invalid-input' for the stand-in error or input that causes it | `t6` |
| pipeline returns 'empty-plan' when the free-form replacement, passed in as a fourth stand-in, returns a plan with no lookups (with the real replacement the cause cannot be reached, since it always returns one lookup) | `t6` |
| pipeline returns 'not-applicable' for classification and task modes | `t6` |
| an unfocused intent that falls to the free-form lookup gets the stated broad-survey purpose and not the classifier's reasoning text (the existing case in freeform-fallback.test.ts:66, which asserts the reasoning text, is changed with it) | `t10` |
| the table from cause to error: one case per member of PipelineCause, each asserting the error class and that only the two model-failed causes give ShaperLlmUnavailableError | `t6` |
| runShaper throws ShaperAnswerInvalidError with stage 'bundle validation', not ShaperLlmUnavailableError and not ShaperSchemaUnrecoverable, when the pipeline's bundle fails validation | `t6` |
| the message of each error states its cause: 'bundle failed validation' for 'bundle-invalid', 'answer-writing output invalid' for 'answer-invalid', and the prompt file's path for the two prompt-missing causes; none contains 'exhausted' or 'retries'; for the two model-failed causes the message names the call that failed ('planning', 'answer writing') and, with a stand-in error from a provider that is not Ollama, does not contain 'Ollama' | `t2`, `t6` |
| a file-scope request whose plan is replaced by the free-form lookup: the intent the free-form lookup builds has kind 'file' and the file's path, and the loop's path is the resolved repo (today the intent is a workspace scope on the repo) | `t9` |
| runShaper in run mode refuses a code request on a connection scope with ScopeKindTargetMismatchError before resolving the scope, and accepts every pairing in the corrected table | `t7` |
| the planning prompt has the section for an intent with no focus, with a recipe for each of the five kinds of source, each naming only lookups that exist in the catalog and no limit parameter (the test reads the prompt file and the lookup registry) | `t10` |
| the planning call's user turn for an unfocused intent names that section | `t10` |
| every prompt under src/prompts/analyze that tells the model to write 'Intent focus: <intent.focus>' also states the rule for an intent with no focus (the test finds the prompts by searching for that line, so a prompt added later is covered) | `t10` |
| isModelCallFailure is true for each Ollama and socket text and for each of the CLI provider's call failures ('claude --print failed', 'claude exited with', 'codex emitted error event', 'codex exited with'), and false for a shape failure ('no structured_output', 'not parseable JSON') | `t2` |
| with a stand-in provider that throws a CLI call failure, the planning call raises DecomposerLlmUnavailableError and the pipeline returns 'planner-model-failed' (not a free-form replacement), and the answer-writing call raises SynthesizerLlmUnavailableError and the pipeline returns 'answer-model-failed' (not 'answer-invalid') | `t2`, `t6` |
| the message test for the two model-failed causes throws the classes the pipeline actually catches, DecomposerLlmUnavailableError and SynthesizerLlmUnavailableError, built from a CLI failure, and asserts the final message does not contain 'Ollama' | `t2`, `t6` |
| with a stand-in sampler that rejects, the sampling provider raises ModelCallFailedError, isModelCallFailure is true for it, and the pipeline returns 'planner-model-failed' and 'answer-model-failed' for the two calls; a sampling response that is not text is a shape failure | `t2`, `t6` |
| no file under src/analyze other than model-failure.ts contains the list of failure texts (the test searches the source for 'ECONNREFUSED'), so a ninth copy cannot be added unnoticed | `t3` |
| for each of the six other callers (planner, aggregator, classifier, scope picker, summariser, tool loop), a stand-in CLI call failure is classified as that caller's model-unavailable error and a shape failure as its schema error | `t3` |
| resolveScope for each of the seven kinds inside a registered repo, including longest-prefix choice between nested repos | `t4` |
| symbol: split at the last '#'; no '#'; no entity of that name; two entities of that name (the message lists both); a file path that itself contains '#' | `t4` |
| connection: found in one repo; in none; in two (the message names both); a connections file that fails to parse is reported, not skipped | `t4` |
| a path inside no registered repo gives repoPath null and the scope's own directory | `t4` |
| the planning prompt's user turn names the file, entity or connection from the ResolvedScope and prints the repo path, not the raw value | `t8` |
| the existing test of inferScopePath (src/analyze/context/__tests__/resolve-repo-indexed.test.ts:79-93) rewritten against resolveScope, keeping its cases | `t7` |
| prepareDecompose given a resolved scope returns the same user turn as decompose builds for it, and the step tool's start phase passes a resolved workspace scope | `t8` |
| the tool loop's path for classification, task and free-form use is the resolved lookupPath, and for a connection it is the connection's repo, not the working directory | `t7`, `t9` |
| a module scope and a manifest directory scope inside a registered repo: lookupPath is the scope's own directory, and the planning prompt's 'Repo path' line and the lookup executor's path are that directory, as today (mutation: make lookupPath the repo root, the test fails) | `t4`, `t7`, `t8` |
| a symbol scope in a registered repo with no stored entities fails with ScopeNotIndexedError, not ScopeRefUnresolvedError | `t4` |
| the step tool's plan and narrow phases resolve the scope from the intent in the state token, and a token without any scope field still works | `t8` |
| a generic request and a classification-mode request on a symbol in a registered repo with no stored entities both fail with ScopeNotIndexedError; the same two on a module in that repo proceed as today | `t7` |
| the step tool's start phase tests the pairing of the intent it builds: its workspace scope passes for every kind of source, and a stand-in scope the table refuses returns an error result and mints no state | `t8` |
| a symbol whose file is inside no registered repo, and a symbol with an empty registry, both fail with ScopeNotIndexedError with registeredAs undefined; a module with an empty registry proceeds as today | `t4` |
| the existing tests of the indexed check (invariants.test.ts, eight calls) rewritten to pass a resolved scope, keeping the cases for a registry with no repos and for a connection, and adding the symbol exception | `t7` |
| the matrix test rewritten to the corrected rows: every pairing of five kinds of source and seven kinds of scope asserted as accepted or refused (the existing 'infra+repo -> mismatch' case flips) | `t5` |
| a symbol value in the new form passes when the file exists and fails with 'scope-ref-unresolved' when it has no '#' or the file part is not a file | `t5` |
| a connection is checked when the function is supplied, and both callers of the classifier now supply it (asserted on the argument the classifier receives) | `t11` |
| the classifier prompt's pairing list states the same rows as the table: the test reads the prompt file and compares it with the exported table, so the two cannot drift | `t5` |
| the plan tree's and the daemon's classifyShaperError each map ShaperInvalidInputError, ShaperNoPlanError, ScopeRefUnresolvedError, ScopeKindTargetMismatchError and ShaperAnswerInvalidError to their codes | `t1` |
| one test iterates a single list of error classes (the five mapped today and the five new ones) through both functions and asserts the same code from each | `t1` |
| the plan tree's classifyClassifierError returns the inner code of ClassifierValidationExhausted for both inner codes, and passes ScopeNotIndexedError and ShaperLlmUnavailableError to the context mapping (today: 'classifier-validation-exhausted' and 'internal-error') | `t11` |
| the three new codes are members of both RunErrorCode and AnalyzeRpcErrorCode (a compile-time assignment in a source file, since tsc skips tests) | `t1` |
| the existing table test's ClassifierValidationExhausted row (orchestrator.test.ts:72) rewritten with a real ValidationFailure, expecting its inner code | `t11` |
| with a prompt, the intent passed to the context builder has focused true and the prompt as focus; with an empty prompt it has focused false | `t11` |
| a hinted kind of source that does not go with the scope fails the run at stage 'classify' with 'scope-ref-kind-target-mismatch' and writes a failed run record | `t11` |
| a hinted request with a scope that does not resolve fails with 'scope-ref-unresolved' | `t11` |
| a hinted request with a valid pairing reaches the context builder and the planner | `t11` |
| the daemon's run-context request for an unfocused code request on this repository returns a bundle (the check of 2026-10-07 that failed at once) | `t12` |
| the same for a file scope and for a symbol scope in the new form | `t12` |
| an unfocused request with the model stopped fails with 'shaper-llm-unavailable', and a request whose scope does not resolve fails with 'scope-ref-unresolved' while the model is running | `t12` |
| the real planning call for an unfocused code request on a module returns the recipe's lookups on that module's path, and for an unfocused docs request returns a single free-form lookup | `t12` |
| the bundle returned for an unfocused code request has a focus layer that says there is no focus and names the scope, and does not contain the text 'undefined' or '<intent.focus>' | `t12` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s6 (LLD-b9d5c5c40df5a574-s6) contract details: the pipeline's outcome, runShaper's cause table, resolveScope, the validator, runAnalyze, and the two mapping functions`
- **[[c2]]** `prior-artifact` `LLD s6 data model changes: the new codes, PipelineOutcome, ResolvedScope, the typed errors, the symbol form, the hinted intent, the planning prompt's user turn and its no-focus section, the free-form lookup's scope, the answer-writing prompts, and how a failed model call is recognised`
- **[[c3]]** `prior-artifact` `LLD s6 error paths: error cases, edge cases and invariants to preserve`
- **[[c4]]** `prior-artifact` `LLD s6 test strategy: six test levels with 53 subjects, and the acceptance mapping`
- **[[c5]]** `prior-artifact` `LLD s6 migration: eight steps and the backward-compatibility statement`
- **[[c7]]** `step-output` `s1 context of this plan: file sizes and call-site counts measured on 2026-10-07 by line count and text search, including the seven files that declare the model-failure text list`

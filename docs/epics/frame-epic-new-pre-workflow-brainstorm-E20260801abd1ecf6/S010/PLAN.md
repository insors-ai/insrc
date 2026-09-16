<!-- insrc:artifact PLAN-abd1ecf6a5f5063e-s10 -->

# Plan: E20260804abd1ecf6:S010

**Epic:** `frame-epic-new-pre-workflow-brainstorm`
**LLD run:** `wf-1785854329968-xbqyc5`
**LLD effective hash:** `68bedb3a95b6...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Executor re-pause contract: additive finalize 'llm-pause' variant + resumeRun branch | M | — | unit: executor resumeRun: a finalize {type:'llm-pause'} re-pauses the same step (nextStepIndex unchanged); output/error paths regress green | [[c1]] [[c2]] |
| 2 | **`t2`** StepRunnerContext.draftProvider + thread into EVERY ctx (runFrom + resumeRun) | M | `t1` | unit: executor threads draftProvider into both the run() ctx and the finalize() ctx; absent-dep run is byte-identical to today | [[c3]] |
| 3 | **`t3`** role-taxonomy: add the peripheral/mid 'brainstorm.decision.draft' role | S | — | unit: resolveRole('brainstorm.decision.draft') => tier 'mid', clampedByFloor=false (peripheral, not floor-clamped) | [[c4]] |
| 4 | **`t4`** Drive-layer wiring: resolve the mid draftProvider + inject into the executor (both paths) | M | `t2`, `t3` | unit: both drive paths (daemon workflow-rpc + MCP workflow-step) resolve the 'brainstorm.decision.draft' mid provider and inject it as the executor draftProvider dep (no REST) | [[c3]] [[c4]] |
| 5 | **`t5`** Reworked adaptive elicit runner + decision schemas (replaces finalizeElicit) | L | `t1`, `t2`, `t3` | unit: elicit run() drafts one decision via fake ctx.draftProvider + pauses; draftProvider undefined => fail-closed 'draft-provider-unavailable' (never cheap/local); unit: elicit finalize() folds + re-pauses the next decision; reopen re-pauses a prior decision; unknown decisionId => retryable; unit: elicit finalize() convergence+finalConfirm => {output} emitting the unchanged brainstormElicitSchema (assembled from answeredDecisions); not-confirmed/open => retryable; abandoned => nothing written; runner never writes the SpecArtifact | [[c1]] [[c3]] [[c5]] [[c6]] |
| 6 | **`t6`** Fake-provider unit tests for the executor re-pause + the adaptive elicit loop (ac1-ac4) | M | `t4`, `t5` | unit: full brainstorm + executor sweep: ac1-ac4 end-to-end with the fake provider + the additive-variant regression across existing runners | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] [[c6]] |

### E20260804abd1ecf6:S010:T001 — Executor re-pause contract: additive finalize 'llm-pause' variant + resumeRun branch

In src/workflow/types.ts add a third variant to the finalize return union: { type: 'llm-pause'; prompt: string; userTurn: string; schema: Record<string, unknown>; preparedBlob: unknown } alongside the existing { type:'output' } | { type:'error' }. In src/workflow/executor.ts resumeRun, add a branch that on the new variant RE-PAUSES the SAME step — nextStepIndex UNCHANGED, build a fresh ExecutorPause from the finalize result, return {type:'paused', state}. The existing {output}/{error} paths are byte-unchanged. Strictly additive; strict ESM .js imports, import type.

**Acceptance checks:**
- src/workflow/types.ts finalize return union gains the additive 'llm-pause' variant; existing 'output'|'error' variants unchanged
- src/workflow/executor.ts resumeRun re-pauses the SAME step on the 'llm-pause' finalize variant (nextStepIndex unchanged, returns {type:'paused'} with a fresh pause); the output-advance + error paths are untouched
- tsc --noEmit clean; every existing runner's finalize (returning output|error) compiles + behaves identically

### E20260804abd1ecf6:S010:T002 — StepRunnerContext.draftProvider + thread into EVERY ctx (runFrom + resumeRun)

In src/workflow/types.ts add optional `readonly draftProvider?: LLMProvider | undefined` to StepRunnerContext (import type LLMProvider from shared/types.js). In src/workflow/executor.ts add an OPTIONAL executor-level dep (a startRun/resumeRun parameter carrying draftProvider) and thread it into EVERY StepRunnerContext the executor constructs — both the run() ctx in runFrom AND the finalize() ctx in resumeRun. Optional + additive: a caller passing nothing is byte-identical to today. Sequenced after t1 since both edit types.ts + executor.ts.

**Acceptance checks:**
- StepRunnerContext gains optional draftProvider?: LLMProvider | undefined; existing fields unchanged; existing runners ignore it
- the executor threads the draftProvider dep into BOTH the run() ctx (runFrom) AND the finalize() ctx (resumeRun) — so the elicit finalize→draft-next re-pause loop has ctx.draftProvider on every turn
- startRun/resumeRun accept the draftProvider dep optionally so a caller that passes nothing is byte-identical to today; tsc --noEmit clean; .js imports + import type

### E20260804abd1ecf6:S010:T003 — role-taxonomy: add the peripheral/mid 'brainstorm.decision.draft' role

In src/config/role-taxonomy.ts add { id: 'brainstorm.decision.draft', criticality: 'peripheral', defaultTier: 'mid' } to the closed ROLES registry. Peripheral => NOT core-floor-clamped => resolveRole yields tier 'mid'. No RoleRouter/CoreFloorGuard code change (they key on RoleId). Independent file.

**Acceptance checks:**
- src/config/role-taxonomy.ts ROLES contains { id:'brainstorm.decision.draft', criticality:'peripheral', defaultTier:'mid' }
- resolveRole('brainstorm.decision.draft', cfg) resolves to tier 'mid' with clampedByFloor=false (peripheral, not core-floor-clamped)
- tsc --noEmit clean; no change needed in role-router.ts / core-floor-guard.ts

### E20260804abd1ecf6:S010:T004 — Drive-layer wiring: resolve the mid draftProvider + inject into the executor (both paths)

Resolve the mid-tier draft provider via createRoleRouter(...).resolveProviderForRole('brainstorm.decision.draft', cfg, repoPath) and pass it as the executor's draftProvider dep in BOTH drive paths: (a) the daemon workflow.run path (src/daemon/workflow-rpc.ts) and (b) the controller path (the MCP workflow-step handler that runs startRun/resumeRun in-process — src/mcp/workflow-step/phases/start.ts + step.ts). No REST (CliProvider/Ollama only, k1). Reuses the existing config load; the resolution is per-run.

**Acceptance checks:**
- the daemon workflow.run path resolves the mid provider via createRoleRouter().resolveProviderForRole('brainstorm.decision.draft', cfg, repoPath) and passes it as the executor draftProvider dep
- the MCP workflow-step path (start/resume) resolves + injects the SAME draftProvider so the controller-driven insrc_workflow_step loop behaves identically (k4/k5)
- no direct REST provider is introduced (CliProvider/Ollama only, k1); tsc --noEmit clean

### E20260804abd1ecf6:S010:T005 — Reworked adaptive elicit runner + decision schemas (replaces finalizeElicit)

In src/workflow/runners/brainstorm/schemas.ts add decisionDraftSchema ({ decisionId, question, options[]{label, tradeoff, recommended?}, groundingNote? }) and decisionAnswerSchema ({ decisionId, chosenOption | reopen | proposeConverge | finalConfirm }). In src/workflow/runners/brainstorm/index.ts rework the `elicit` runner (registerBrainstormRunners unchanged signature): run() FAILS CLOSED with retryable 'draft-provider-unavailable' if ctx.draftProvider is undefined, else drafts the FIRST decision via ctx.draftProvider.completeStructured(buildDraftPrompt(runningSpec), decisionDraftSchema) (withStructuredRetry => retryable 'draft-failed' on exhaustion) and returns {type:'llm-pause'} carrying { runningSpec, answeredDecisions[], currentDecisionId, convergenceProposed } in preparedBlob; finalize() folds the chosen option and (a) drafts+re-pauses the NEXT decision, (b) on reopen re-pauses the named prior decision (retryable 'unknown-decision' if absent), (c) on convergence + finalConfirm returns {type:'output'} emitting the EXISTING brainstormElicitSchema shape ({category, workingStatement, openItems:[], confirmed:true, decisions[], nonGoals[]}) ASSEMBLED from answeredDecisions — so the UNCHANGED synthesize step (sole SpecArtifact writer) consumes it as today; the runner NEVER writes the SpecArtifact itself (d) retryable 'not-confirmed' if convergence lacks the final confirm. The old finalizeElicit single-pass is REPLACED. brainstormElicitSchema + synthesize + seed-focus composeSpecFocus untouched. Strict ESM .js imports, getLogger not console.log.

**Acceptance checks:**
- schemas.ts exports decisionDraftSchema + decisionAnswerSchema; brainstormElicitSchema (the elicit step OUTPUT shape synthesize consumes) is UNCHANGED
- elicit run() drafts exactly ONE decision via ctx.draftProvider and returns {type:'llm-pause'} with the running-spec state in preparedBlob; fails closed (retryable 'draft-provider-unavailable') when ctx.draftProvider is undefined (never cheap/local)
- elicit finalize() folds the answer and re-pauses the next / handles reopen / on convergence+finalConfirm returns {type:'output'} emitting the existing brainstormElicitSchema shape assembled from answeredDecisions; retryable 'not-confirmed' when convergence lacks the final confirm; nothing written until finalize {output}
- the runner does NOT call the SpecArtifact writer — the UNCHANGED synthesize step remains the sole writer (ac4); the old single-pass finalizeElicit is removed (replaced, not a second mode); registerBrainstormRunners wiring is unchanged; tsc --noEmit clean

### E20260804abd1ecf6:S010:T006 — Fake-provider unit tests for the executor re-pause + the adaptive elicit loop (ac1-ac4)

Add/extend node:test suites (npx tsx --test) under src/workflow/__tests__ (executor) + src/workflow/runners/brainstorm/__tests__ with a fake LLMProvider whose completeStructured returns canned decisionDraft JSON (+ a malformed variant for draft-failed), injected as ctx.draftProvider, covering ac1-ac4 (draft/pause, fold/re-pause, converge/final-confirm emitting brainstormElicitSchema/not-confirmed/reopen/abandon, mid-role + fail-closed, synthesize-remains-sole-writer + SpecArtifact/seed-focus invariance, existing-runner regression). Replace the old single-pause elicit tests; run the full sweeps.

**Acceptance checks:**
- executor test: resumeRun re-pauses the same step on a finalize {type:'llm-pause'} (nextStepIndex unchanged) + existing output/error paths regress green; draftProvider is threaded into both run() and finalize() ctx
- brainstorm tests cover ac1-ac4 with a fake ctx.draftProvider (draft/pause, fold/re-pause, converge/final-confirm emitting brainstormElicitSchema/not-confirmed/reopen/abandon, mid-role + fail-closed, synthesize-remains-sole-writer + SpecArtifact/seed-focus invariance)
- the full `npx tsx --test 'src/workflow/**/*.test.ts'` + 'src/mcp/**/*.test.ts' sweeps pass (existing suites stay green)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| executor resumeRun: on a finalize {type:'llm-pause'} result, the SAME step is re-paused (nextStepIndex UNCHANGED, a fresh pause returned) — and the existing {output} (advance) + {error} (retryable stays paused) paths are byte-unchanged (regression) | `t1`, `t2`, `t6` |
| elicit run(): with a fake ctx.draftProvider it drafts exactly ONE decision (decisionDraftSchema) and returns {llm-pause} carrying running-spec state in preparedBlob (ac1) | `t5`, `t6` |
| elicit finalize(): a chosenOption answer folds into the running spec and RE-PAUSES the next decision grounded on all prior answers (ac2); a reopen re-pauses the named prior decision; an unknown decisionId => retryable 'unknown-decision' | `t5`, `t6` |
| elicit finalize(): convergence + user finalConfirm => {type:'output'} with the assembled spec; convergence WITHOUT final confirm (or an open decision) => retryable 'not-confirmed' (nothing written); an abandoned run writes nothing (ac3) | `t5`, `t6` |
| role-taxonomy: resolveRole('brainstorm.decision.draft', cfg) => tier 'mid', clampedByFloor=false; ctx.draftProvider===undefined => elicit fails closed with retryable 'draft-provider-unavailable', never cheap/local (ac4, k13) | `t3`, `t5`, `t6` |
| SpecArtifact invariance: the assembled spec on final confirm matches the UNCHANGED SpecArtifact body, seed-focus composeSpecFocus consumes it byte-identically; existing non-brainstorm runners unaffected by the additive StepFinalizeResult variant (ac4) | `t5`, `t6` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s10 c1 — additive {type:'llm-pause'} variant on the finalize return union; resumeRun re-pauses the SAME step (nextStepIndex unchanged)`
- **[[c2]]** `prior-artifact` `LLD s10 c2 — the existing resumeRun {output}(advance) + {error}(retryable) paths stay byte-identical; every existing runner's finalize is unaffected (regression guarantee)`
- **[[c3]]** `prior-artifact` `LLD s10 c3 — optional draftProvider on StepRunnerContext threaded into BOTH the run() ctx and the finalize() ctx from an optional executor-level dep (byte-identical when absent)`
- **[[c4]]** `prior-artifact` `LLD s10 c4 — new peripheral role brainstorm.decision.draft (defaultTier 'mid') in the closed ROLES registry; resolves mid, not core-floor-clamped`
- **[[c5]]** `prior-artifact` `LLD s10 c5 — reworked adaptive elicit runner + decisionDraftSchema/decisionAnswerSchema: draft-one/pause, fold+re-pause next, reopen, converge on final-confirm; replaces the single-pass finalizeElicit`
- **[[c6]]** `prior-artifact` `LLD s10 c6 — SpecArtifact invariance: elicit {output} emits the UNCHANGED brainstormElicitSchema assembled from answeredDecisions; synthesize stays the sole SpecArtifact writer; seed-focus composeSpecFocus untouched`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 13 LOW** · model `client` · reviewed 2026-08-04T15:08:50.921Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | closed-union | LOW | manual | src/workflow/types.ts defines a step-finalize return union whose current members are {type:'output'} and {type:'error'}, to which an additive {type:'llm-pause'} variant can be appended. | Grep resolves StepRunnerFinalize = (llmResponse, preparedBlob, ...) => the finalize return type in the workflow layer; the LLD s10 restates the current {output}\|{error} union. The additive 'llm-pause' variant is a pure type extension. | none — verified sound. |
| t1 | citation | LOW | manual | src/workflow/executor.ts defines resumeRun, which finalizes the paused step and either advances (output) or stays paused (error) — the function the re-pause branch is added to. | Grep resolves resumeRun + the ExecutorTickResult finalize handling; the s10 LLD documents the re-pause branch on the same step. The function targeted by t1 exists. | none — verified sound. |
| t2 | semantic | LOW | manual | StepRunnerContext is defined in src/workflow/types.ts and is the per-step context object the executor constructs for run()/finalize(); it can carry an optional draftProvider. | Grep resolves `interface StepRunnerContext { intent; plan; runId; stepOutputs; params; ... }` — the per-step context exists and is the correct place for the optional draftProvider field. | none — verified sound. |
| t2 | semantic | LOW | manual | LLMProvider is exported from src/shared/types.js and can be imported as a type into src/workflow/types.ts for the draftProvider field. | Prior LLD/HLD citations confirm the LLMProvider type is imported from shared/types.js (HLD sc3 'The LLMProvider type ... exists'); completeStructured is on it. The type-import for draftProvider is valid. | none — verified sound. |
| t3 | inventory | LOW | manual | src/config/role-taxonomy.ts defines a closed ROLES registry and a resolveRole function, where each role has {id, criticality, defaultTier}; a new peripheral/mid role can be appended. | Grep resolves the role-taxonomy ROLES registry + the field-add site; the closed registry with {id, criticality, defaultTier} is the correct target for the new peripheral/mid role. | none — verified sound. |
| t3 | semantic | LOW | manual | A peripheral role in role-taxonomy is not core-floor-clamped, so resolveRole returns clampedByFloor=false for it (only critical roles are clamped). | Grep resolves clampedByFloor (RoleResolution, HLD sc2) and the core-floor mechanism clamping only critical roles; a peripheral role is therefore not clamped — resolveRole returns clampedByFloor=false. | none — verified sound. |
| t4 | citation | LOW | manual | createRoleRouter(...).resolveProviderForRole(role, cfg, repoPath) exists and returns a resolved provider, usable to resolve the mid-tier draft provider. | Grep resolves createRoleRouter + resolveProviderForRole in src/analyze/context/role-router.ts (cited by the s10 LLD c3 analyze bundle). The resolution API t4 calls exists. | none — verified sound. |
| t4 | citation | LOW | manual | The daemon workflow.run drive path exists at src/daemon/workflow-rpc.ts and constructs/runs the executor, so a draftProvider dep can be injected there. | src/daemon/workflow-rpc.ts is present (read anchor resolved) and is the daemon workflow.run drive path; injecting the draftProvider executor dep there is well-founded. | none — verified sound. |
| t4 | citation | LOW | manual | The MCP workflow-step drive path exists at src/mcp/workflow-step/phases/start.ts and step.ts and runs startRun/resumeRun in-process, so the same draftProvider can be injected there. | src/mcp/workflow-step/phases/start.ts + step.ts resolved (read anchors); prior brainstorm LLDs (s3) confirm startRun/resumeRun are driven in-process here. The MCP injection site exists. | none — verified sound. |
| t5 | citation | LOW | manual | src/workflow/runners/brainstorm/index.ts currently defines a single-pass finalizeElicit (the elicit runner's finalize) and registerBrainstormRunners, which t5 reworks into the adaptive draft/pause loop. | DEF + EXT + HLD grep confirm today's elicit is a single controller-freeform pause; the s10 LLD reworks finalizeElicit/registerBrainstormRunners in src/workflow/runners/brainstorm/index.ts. The rework target exists. | none — verified sound. |
| t5 | semantic | LOW | manual | brainstormElicitSchema is defined in src/workflow/runners/brainstorm/schemas.ts and is the elicit step OUTPUT shape (category, workingStatement, openItems, confirmed, decisions, nonGoals) that the unchanged synthesize step consumes; new decisionDraftSchema + decisionAnswerSchema are added alongside it. | Grep resolves brainstormElicitSchema (HLD workingStatement field; s2 LLD schema definition) as the elicit OUTPUT shape synthesize consumes. Adding decisionDraft/decisionAnswer schemas alongside it keeps the output shape unchanged. | none — verified sound. |
| t5 | cross-artifact | LOW | manual | The SpecArtifact is written solely by the brainstorm synthesize step (not the elicit runner), and seed-focus composeSpecFocus consumes the SpecArtifact body — both remain unchanged by this plan. | The s10 LLD explicitly marks 'unchanged: SpecArtifact body + seed-focus composeSpecFocus'; synthesize remains the sole SpecArtifact writer. The invariance the plan relies on is documented and consistent. | none — verified sound. |
| cl13 | ordering | LOW | manual | The task dependency spine is acyclic and topologically ordered: t2->t1; t4->t2,t3; t5->t1,t2,t3; t6->t4,t5, with t1 and t3 having no dependencies. | By inspection of the task table: t1[] , t2[t1], t3[] , t4[t2,t3], t5[t1,t2,t3], t6[t4,t5] — every edge points to a strictly-lower order; the graph is acyclic and order 1..6 is a valid topological sort. | none — verified sound. |

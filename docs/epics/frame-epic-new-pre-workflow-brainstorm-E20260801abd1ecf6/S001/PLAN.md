<!-- insrc:artifact PLAN-abd1ecf6a5f5063e-s1 -->

# Plan: E20260801abd1ecf6:S001

**Epic:** `frame-epic-new-pre-workflow-brainstorm`
**LLD run:** `wf-1785591199795-7gd4h8`
**LLD effective hash:** `688a10691972...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Standalone brainstorm context type | S | — | unit: StandaloneBrainstormContext accepts a bare focus string (peer of StandaloneStoryContext) | [[c1]] |
| 2 | **`t2`** Brainstorm step schemas placeholder | S | — | unit: schemas.ts exports valid ajv-compilable JSON Schema stub(s), one per planned brainstorm step runner | [[c1]] |
| 3 | **`t5`** BrainstormElicitState type + WorkflowStepStatePayload wiring | M | — | unit: BrainstormElicitState round-trips through state-store saveState->token->loadState unchanged, and releaseState frees it; unit: loadState(token) for an unknown or expired token still throws unchanged — no brainstorm-specific catch/silent-replace | [[c2]] [[c3]] [[c4]] |
| 4 | **`t3`** Brainstorm runner registration scaffold (index.ts) | M | `t1`, `t2` | unit: registerBrainstormRunners is idempotent — a second call is a no-op (registered guard), no duplicate-runner throw; unit: after registerBrainstormRunners(), getRunner('brainstorm', <runnerId>) resolves each brainstorm step runner; unit: brainstorm runner module imports nothing from the chat-agent brainstorm.addIdea offlineRpc path (k10 import-guard); unit: registering a duplicate runnerId under workflow 'brainstorm' without the guard reproduces executor.ts's duplicate-runner throw | [[c1]] [[c5]] [[c6]] [[c7]] |
| 5 | **`t4`** Boot-wire brainstorm into registerWorkflowRunners + workflow-id recognition | S | `t3` | unit: registerWorkflowRunners() calls registerBrainstormRunners() beside the existing register*Runners (source-level assertion); unit: workflow-step handler phase switch gains no new case — brainstorm recognized via workflow-id union only (source assertion); integration: insrc_workflow_step start with workflow:'brainstorm' returns a continuation token whose shape matches other stages' tokens (opaque, round-trippable); integration: a resume with an unknown/expired token surfaces a clear error rather than silently starting fresh; integration: existing stages (design.story, design.epic, plan, build) still start/step/synthesize unchanged after brainstorm is registered — no phase-dispatch regression; unit: triage route table (classify.ts) is unchanged — small/trivial requests still route to build/standalone-story, never inserting the brainstorm stage (ac5) | [[c1]] [[c8]] [[c9]] [[c10]] [[c11]] |

### E20260801abd1ecf6:S001:T001 — Standalone brainstorm context type

Create src/workflow/runners/brainstorm/standalone.ts exporting StandaloneBrainstormContext { readonly focus: string }, a peer of design-story's StandaloneStoryContext (standalone.ts:23), for invoking brainstorm outside an Epic with just a rough focus string.

**Acceptance checks:**
- standalone.ts exports StandaloneBrainstormContext with exactly one required field, focus: string, mirroring the shape of design-story's StandaloneStoryContext
- compiles cleanly under strict TS / exactOptionalPropertyTypes with no optional-field handling needed since focus is required

### E20260801abd1ecf6:S001:T002 — Brainstorm step schemas placeholder

Create src/workflow/runners/brainstorm/schemas.ts with minimal placeholder JSON schemas for the stage's step runner(s), sized as stubs since elicitation-turn validation is owned by s2-s5, not this scaffold story.

**Acceptance checks:**
- schemas.ts exports one or more named JSON Schema objects, each a minimal/empty object shape (e.g. { type: 'object' }) with no field-level validation logic, one per planned brainstorm step runner
- each exported schema is valid JSON Schema and compiles with no errors under the project's ajv-based schema validator

### E20260801abd1ecf6:S001:T005 — BrainstormElicitState type + WorkflowStepStatePayload wiring

Define BrainstormElicitState { readonly workingStatement: string; readonly answered: readonly string[]; readonly openQuestions: readonly string[] } in src/mcp/workflow-step/state.ts and thread it as an addition inside the existing WorkflowStepStatePayload, without changing the saveState/loadState/releaseState signatures or the opaque continuation-token format.

**Acceptance checks:**
- BrainstormElicitState is exported from state.ts with exactly the three fields (workingStatement, answered, openQuestions) per sc3's interfaceSketch
- a WorkflowStepStatePayload carrying BrainstormElicitState round-trips unchanged through saveState(payload) -> token -> loadState(token), and releaseState(token) frees it
- state-store.ts's saveState/loadState/releaseState function signatures and the opaque token format are unmodified (k9 — no new store introduced)
- loadState(token) for an unknown or expired token still throws unchanged — no brainstorm-specific code path catches or silently replaces it with a fresh session

### E20260801abd1ecf6:S001:T003 — Brainstorm runner registration scaffold (index.ts)

Create src/workflow/runners/brainstorm/index.ts exporting registerBrainstormRunners(), with a module-level `registered` idempotent guard mirroring design-story/index.ts:541-552, that registers the stage's placeholder step runner(s) for workflow id 'brainstorm' via the existing executor.registerRunner, importing types from standalone.ts and schemas.ts.

**Acceptance checks:**
- calling registerBrainstormRunners() twice does not throw and registers each runner exactly once (registered guard, mirrors design-story:541-552)
- after registerBrainstormRunners(), executor.getRunner('brainstorm', <runnerId>) resolves each registered placeholder runner
- registering a duplicate runnerId under workflow 'brainstorm' without the guard reproduces executor.ts's 'registerRunner: duplicate runner' throw (fail-fast at boot, not swallowed)
- index.ts imports nothing from the shared/chat-agent brainstorm.addIdea offlineRpc path (k10 separateness)

### E20260801abd1ecf6:S001:T004 — Boot-wire brainstorm into registerWorkflowRunners + workflow-id recognition

Add a registerBrainstormRunners() call to registerWorkflowRunners() in src/workflow/index.ts beside the existing registerDesignEpicRunners()/registerDesignStoryRunners() calls, and add the 'brainstorm' literal to the workflow-id type/union consumed by executor.ts and the workflow-step start phase (src/mcp/workflow-step/phases/start.ts) so a start request with workflow:'brainstorm' is recognized rather than rejected.

**Acceptance checks:**
- registerWorkflowRunners() invokes registerBrainstormRunners(); no other existing register*Runners call is modified, removed, or reordered
- a workflow-step start-phase request with workflow:'brainstorm' passes id validation and reaches executor.getRunner('brainstorm', runnerId) instead of being rejected as an unknown workflow
- existing stages (design.story, design.epic, plan, build) still register and resolve unchanged after this change
- src/workflow/triage/classify.ts route table is not modified by this story — small/trivial requests continue to route to build/standalone-story unchanged (ac5)
- handler.ts's phase-dispatch switch/case list (start/plan/step/synthesize/resolve_question/review_deferred) is unchanged by this task — 'brainstorm' is recognized purely via the workflow-id union consumed by phases/start.ts, with no new phase case added and no modification to handler.ts's switch statement

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| registerBrainstormRunners is idempotent — a second call is a no-op (registered guard), no duplicate-runner throw | `t3` |
| after registerBrainstormRunners(), getRunner('brainstorm', <runnerId>) resolves each brainstorm step runner | `t3` |
| BrainstormElicitState round-trips through state-store saveState->token->loadState unchanged, and releaseState frees it | `t5` |
| StandaloneBrainstormContext accepts a bare focus string (peer of StandaloneStoryContext) | `t1` |
| insrc_workflow_step start with workflow:'brainstorm' returns a continuation token whose shape matches the other stages' tokens (opaque, round-trippable) | `t4` |
| a resume with an unknown/expired token surfaces a clear error rather than silently starting fresh | `t4`, `t5` |
| existing stages (design.story etc.) still start/step/synthesize unchanged after brainstorm is registered — no phase-dispatch regression | `t4` |
| registerWorkflowRunners() calls registerBrainstormRunners() beside the existing register*Runners (source-level assertion) | `t4` |
| the brainstorm runner module imports NOTHING from the chat-agent brainstorm.addIdea path — an import-guard test enforcing k10 separateness | `t3` |
| the workflow-step handler phase switch gains NO new case (start/plan/step/synthesize/resolve_question/review_deferred unchanged) — source assertion that brainstorm is a new workflow value, not a new phase | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD abd1ecf6a5f5063e-s1 sc2`
- **[[c2]]** `prior-artifact` `LLD abd1ecf6a5f5063e-s1 sc3`
- **[[c3]]** `prior-artifact` `LLD abd1ecf6a5f5063e-s1 c1`
- **[[c4]]** `prior-artifact` `LLD abd1ecf6a5f5063e-s1 c14`
- **[[c5]]** `prior-artifact` `LLD abd1ecf6a5f5063e-s1 c3`
- **[[c6]]** `prior-artifact` `LLD abd1ecf6a5f5063e-s1 k10`
- **[[c7]]** `prior-artifact` `LLD abd1ecf6a5f5063e-s1 a1`
- **[[c8]]** `prior-artifact` `LLD abd1ecf6a5f5063e-s1 k4`
- **[[c9]]** `prior-artifact` `LLD abd1ecf6a5f5063e-s1 k5`
- **[[c10]]** `prior-artifact` `LLD abd1ecf6a5f5063e-s1 ac1`
- **[[c11]]** `prior-artifact` `LLD abd1ecf6a5f5063e-s1 ac5`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-08-01T14:59:11.097Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t5 | citation | LOW | manual | WorkflowStepStatePayload is defined in src/mcp/workflow-step/state.ts — the existing payload t5 threads BrainstormElicitState into without changing saveState/loadState signatures. | src/mcp/workflow-step/state.ts:30 `export interface WorkflowStepStatePayload` — the existing payload t5 threads BrainstormElicitState into (imported widely incl. phases/plan.ts, state-store test). Confirmed. | none — verified sound |
| t4 | citation | LOW | manual | src/mcp/workflow-step/phases/start.ts is the workflow-step start phase that validates/handles the workflow id (where 'brainstorm' must be recognized). | src/mcp/workflow-step/phases/start.ts:1 found=True (imported by daemon/workflow-rpc.ts augmentStandaloneParams/epicKeyFor) — the start phase where workflow:'brainstorm' must be recognized. Confirmed. | none — verified sound |
| t4 | citation | LOW | manual | src/workflow/triage/classify.ts holds the triage route table (which t4 asserts is NOT modified by this story, preserving ac5). | src/workflow/triage/classify.ts:1 found=True; exports routeForSizeClass consumed by src/mcp/triage-step/phases/classify.ts — the triage route table t4 correctly asserts is NOT modified by this story (ac5). Confirmed. | none — verified sound |
| t3 | citation | LOW | manual | design-story/index.ts:541-552 is registerDesignStoryRunners with the module-level `registered` idempotent guard that t3's registerBrainstormRunners mirrors. | src/workflow/runners/design-story/index.ts:541 registerDesignStoryRunners + the `if (registered) return` guard (shared by define/design-epic/plan/stub/tracker) — the idempotent template t3 mirrors. Confirmed. | none — verified sound |
| t4 | citation | LOW | manual | A workflow-id type/union enumerating the existing workflows (define/design.epic/design.story/plan/build) exists, that 'brainstorm' is added to. | WORKFLOW_NAMES + `type WorkflowName` in src/daemon/workflow-rpc.ts:43/364; the 'design.story'/'design.epic'/'plan'/'build' literals recur across src — a real workflow-name union that 'brainstorm' is added to. Confirmed (build may touch >1 add-site; the seam is correctly identified). | none — verified sound |
| pl-tasks | inventory | LOW | manual | The plan enumerates exactly 5 tasks: t1, t2, t3, t4, t5. | The plan enumerates exactly five tasks t1–t5 (task table + per-task sections); count re-derives to 5. Confirmed. | none — verified sound |
| pl-dag | ordering | LOW | manual | The task dependency DAG is acyclic and dependencies precede dependents: t1(—), t2(—), t5(—); t3→t1,t2; t4→t3. | DAG: t1(—), t2(—), t5(—); t3→t1,t2; t4→t3. Acyclic; every dependency precedes its dependent (context type + schemas + state before the registration scaffold, which precedes boot-wiring). Confirmed. | none — verified sound |

<!-- insrc:artifact LLD-1cd9a4c34f403a80-s5 -->

# LLD: E202607151cd9a4c3:S005

**Epic:** `add-plan-workflow-insrc-framework-4th`
**HLD base run:** `wf-1784121669696-i1rc6r`
**HLD effective hash:** `c7645d42a9f5...`

## HLD context

**Framework:** Implement `plan` as a new fine-grained instance of the shared workflow skeleton, peer to define/design.epic/design.story. A single runner module registers a fixed six-step recipe (context.assemble -> tasks.enumerate -> tasks.critique -> tasks.finalize -> test-strategy.write -> checklist.verify) whose outputs the orchestrator's three per-workflow arms turn into a persisted, cited PlanArtifact for exactly one Story. A new gate reads the Story's approved, non-stale LLD (adding requireApprovedLld by mirroring requireApprovedHld and reusing the existing effective-hash/staleness machinery), and a new storage helper writes the artifact under the as-built slug-md + hash-json convention. Nothing about the executor, state store, approval flow, or MCP phase loop changes except a single 'plan' arm added at each existing seam.
**Rollout phase:** Phase C — Multi-turn interface wiring
**Owns:** `sc5` (PlanOrchestration)
**Consumes:** `sc1` (PlanTask), `sc2` (PlanArtifact)

## Contract details

**Surface level:** internal-shared

### `PlanStepId`

```typescript
type PlanStepId =
  | 'context.assemble'
  | 'tasks.enumerate'
  | 'tasks.critique'
  | 'tasks.finalize'
  | 'test-strategy.write'
  | 'checklist.verify';
```

**Returns:** `PlanStepId` — The fixed, ordered set of step ids the plan workflow always runs — sc5 verbatim. prepareDecompose's 'plan' case emits exactly this sequence, symmetric with the other fine-grained workflows (ac2).

**Preconditions:**
- The six ids are registered as StepRunners via registerPlanRunners

**Postconditions:**
- A plan run's step plan is exactly these six ids in this order

### `planDecomposer`

```typescript
function planDecomposer(intent: WorkflowIntent): DecomposerPrompt
```

**Parameters:**
- `intent: WorkflowIntent` — the plan invocation (workflow='plan', epicHash, storyId)

**Returns:** `DecomposerPrompt` — The fixed six-step plan + schema for the plan workflow; the 'plan' case of prepareDecompose (orchestrator.ts:119) delegates here, matching the DecomposerPrompt shape define/design.epic/design.story already return.

**Preconditions:**
- intent.workflow === 'plan'

**Postconditions:**
- Returns a DecomposerPrompt whose steps are the six PlanStepId values in order

### `planSynthesizer`

```typescript
function planSynthesizer(intent: WorkflowIntent, stepOutputs: Readonly<Record<string, unknown>>): SynthesizerPrompt
```

**Parameters:**
- `intent: WorkflowIntent` — the plan invocation
- `stepOutputs: Readonly<Record<string, unknown>>` — the six step outputs (context/tasks/critique/finalize/test-strategy/checklist)

**Returns:** `SynthesizerPrompt` — The synthesizer prompt + PlanArtifact schema; the 'plan' case of prepareSynthesize (orchestrator.ts:186) delegates here, mirroring the other workflows' synthesizer arms.

**Preconditions:**
- intent.workflow === 'plan'
- stepOutputs carries the tasks.finalize + test-strategy.write outputs

**Postconditions:**
- Returns a SynthesizerPrompt that instructs assembly of a PlanArtifact (sc2)

### `finalizePlan`

```typescript
function finalizePlan(intent: WorkflowIntent, stepOutputs: Readonly<Record<string, unknown>>, runId: string, elapsedMs: number, llmResponse: Record<string, unknown>): FinalizeResult
```

**Parameters:**
- `intent: WorkflowIntent` — the plan invocation
- `stepOutputs: Readonly<Record<string, unknown>>` — the six step outputs
- `runId: string` — the plan run id, stamped into PlanMeta
- `elapsedMs: number` — run duration for meta
- `llmResponse: Record<string, unknown>` — the synthesized PlanArtifact body+citations from the LLM turn

**Returns:** `FinalizeResult` — The finalized PlanArtifact (PlanMeta+PlanBody+citations) ready to persist; the 'plan' case of finalizeArtifact (orchestrator.ts:282) delegates here. It stamps PlanMeta (epicHash/epicSlug/storyId/lldRunId/lldEffectiveHash), validates body+citations, and runs checkTestStrategyCoverage (sc4) — mirroring how finalizeArtifact validates the LLD.

**Errors:**
- `Error` when body/citation validation fails or checkTestStrategyCoverage (sc4) returns issues — surfaced as a retryable synthesize failure

**Preconditions:**
- intent.workflow === 'plan'
- the upstream gate (sc3) already confirmed an approved, non-stale LLD

**Postconditions:**
- Returns a FinalizeResult carrying a valid PlanArtifact whose meta pins the LLD run + effective hash

### `registerPlanRunners`

```typescript
function registerPlanRunners(): void
```

**Returns:** `void` — Registers one StepRunner per PlanStepId via registerRunner (executor.ts:57); called by registerWorkflowRunners (index.ts:22) alongside the existing register*Runners, exactly as registerDesignStoryRunners is.

**Preconditions:**
- Called once at startup from registerWorkflowRunners

**Postconditions:**
- The six plan step ids resolve to runners in the executor's registry

### `pathsForWorkflow`

```typescript
// existing private fn (synthesize.ts:96) gains one branch:
// if (workflow === 'plan') return planArtifactPaths(repoPath, epicHash, storyId, epicSlug);
```

**Returns:** `ArtifactPaths` — The 'plan' branch maps a finalized plan run to its on-disk PlanArtifact paths (hash-json + slug-md) via planArtifactPaths (sc2/s3), inserted before the 'not yet supported' throw at synthesize.ts:137.

**Errors:**
- `Error` when unchanged: throws if a plan finalized without meta.epicHash (synthesize.ts:112)

**Preconditions:**
- workflow === 'plan' and meta.epicHash/storyId are present

**Postconditions:**
- Returns planArtifactPaths(...) for the plan run

## Data model changes

### `PlanStepId` — new

New union type naming the six fixed plan steps; drives the plan runner registration + prepareDecompose 'plan' case. Reuses the existing StepRunner/DecomposerPrompt types.

```
+ type PlanStepId = 'context.assemble'|'tasks.enumerate'|'tasks.critique'|'tasks.finalize'|'test-strategy.write'|'checklist.verify'
```

**Call sites:**
- `src/workflow/runners/plan/index.ts (registerPlanRunners registers one StepRunner per PlanStepId)`
- `src/workflow/orchestrator.ts (prepareDecompose 'plan' case emits the sequence)`

### `planDecomposer / planSynthesizer / finalizePlan` — new

Three orchestrator arms added as new 'plan' cases in the existing prepareDecompose (L119) / prepareSynthesize (L186) / finalizeArtifact (L282) switches; each keeps the seam's existing signature and delegates to the plan module.

```
+ case 'plan': return planDecomposer(intent) // in prepareDecompose
+ case 'plan': return planSynthesizer(intent, stepOutputs) // in prepareSynthesize
+ case 'plan': return finalizePlan(intent, stepOutputs, runId, elapsedMs, llmResponse) // in finalizeArtifact
```

**Call sites:**
- `src/workflow/orchestrator.ts:119 (prepareDecompose)`
- `src/workflow/orchestrator.ts:186 (prepareSynthesize)`
- `src/workflow/orchestrator.ts:282 (finalizeArtifact)`

### `pathsForWorkflow 'plan' branch` — field-add

One added branch in the existing pathsForWorkflow switch mapping workflow='plan' to planArtifactPaths, before the terminal 'not yet supported' throw.

```
+ if (workflow === 'plan') return planArtifactPaths(repoPath, epicHash, storyId, epicSlug);
```

**Call sites:**
- `src/mcp/workflow-step/phases/synthesize.ts:96 (pathsForWorkflow)`
- `src/mcp/workflow-step/phases/synthesize.ts:73 (invocation)`

### `registerWorkflowRunners` — field-add

One added call to registerPlanRunners() inside the existing aggregator, alongside the other register*Runners.

```
+ registerPlanRunners(); // in registerWorkflowRunners
```

**Call sites:**
- `src/workflow/index.ts:22 (registerWorkflowRunners)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc5` | implements | s5 owns and implements sc5: PlanStepId + planDecomposer/planSynthesizer/finalizePlan wired as one 'plan' arm at each of the three orchestrator seams, registerPlanRunners in the runner aggregator, and the pathsForWorkflow 'plan' branch. The exact prompt/schema content + wiring detail stays private to s5. |
| `sc1` | consumes | planSynthesizer instructs assembly of PlanTask[] and finalizePlan validates/carries them into PlanBody; s5 never reshapes PlanTask (owned by s1). |
| `sc2` | consumes | finalizePlan produces a PlanArtifact (PlanMeta+PlanBody+citations, owned by s3) and pathsForWorkflow routes it to planArtifactPaths; s5 wires the production + persistence but does not define the PlanArtifact shape. |

## Error paths

### Error cases

- **A user invokes workflow='plan' but the runner module was never registered (registerPlanRunners not called from registerWorkflowRunners).** (terminal)
  - Detection: The executor looks up each PlanStepId in its StepRunner registry and finds no runner for the step id, throwing the existing 'no runner registered' error at step-plan execution.
  - Response: Surface the executor's unregistered-step error; the fix is wiring registerPlanRunners() into registerWorkflowRunners (index.ts:22) — a startup wiring bug, not a runtime user error.
  - User impact: The plan run fails immediately at the first step with a clear 'runner not registered' message; no partial artifact.
- **A workflow='plan' run reaches synthesize but pathsForWorkflow has no 'plan' branch.** (terminal)
  - Detection: pathsForWorkflow (synthesize.ts:96) falls through its switch to the terminal throw `pathsForWorkflow: workflow 'plan' not yet supported` (synthesize.ts:137).
  - Response: Add the 'plan'→planArtifactPaths branch before the throw; until then the run raises the explicit not-yet-supported error rather than writing to a wrong path.
  - User impact: Synthesize fails loudly with a named error; nothing is persisted.
- **finalizePlan receives an llmResponse whose PlanBody fails body/citation validation or checkTestStrategyCoverage (sc4) returns issues.** (recoverable)
  - Detection: finalizePlan runs the same validate-body-and-citations pass finalizeArtifact uses for the LLD, plus checkTestStrategyCoverage; a non-empty issue list or a validation failure is caught before persistence.
  - Response: Return a retryable synthesize failure naming the offending citation/coverage gap so the synthesize turn is re-emitted; no PlanArtifact is written.
  - User impact: None visible beyond an internal retry; the persisted plan is always valid + fully cited (k8).
- **A workflow='plan' run finalizes without meta.epicHash (e.g. intent lacked the Epic anchor).** (terminal)
  - Detection: pathsForWorkflow throws the existing guard `workflow 'plan' finalized without meta.epicHash` (synthesize.ts:112) before attempting to compute paths.
  - Response: Reuse the existing guard unchanged; the plan intent must carry epicHash/storyId (as design.story does).
  - User impact: Synthesize fails with the explicit missing-epicHash error; nothing persisted.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A plan invoked for a Story whose LLD is approved but stale (upstream HLD/LLD effective hash changed). | The upstream gate (sc3, s2) refuses before any step runs — s5's wiring never reaches the runners; consistent with how requireApprovedHld gates design.story. |
| A second plan run for the same Story after the first was approved. | The wiring is idempotent on paths (planArtifactPaths is deterministic from epicHash/storyId/slug); a re-run overwrites/refreshes the same hash-json + slug-md atomically, exactly like re-running design.story. |
| A plan whose tasks.finalize produced zero Tasks. | The wiring still drives all six steps and finalizePlan runs validation; an empty Task list is a body-validation/coverage concern owned by s1/s4 finalize checks, not an s5 wiring failure — s5 surfaces whatever finalize decides. |

### Invariants to preserve

- The plan workflow adds exactly one 'plan' arm at each existing seam (prepareDecompose:119 / prepareSynthesize:186 / finalizeArtifact:282 / registerWorkflowRunners:22 / pathsForWorkflow:96) and changes nothing else in the executor, state store, approval flow, or MCP phase loop — each arm keeps the seam's existing signature. [[c1]]
- The plan stage is driven through the same multi-turn insrc_workflow_step phase loop (start→plan→steps→synthesize) as define/design.epic/design.story; it is a registered workflow name, not a bespoke pipeline (k7/ac1). [[c2]]
- The fixed PlanStepId sequence (context.assemble→tasks.enumerate→tasks.critique→tasks.finalize→test-strategy.write→checklist.verify) is presented in a fixed order consistent with the other fine-grained stages (ac2), matching the recipe the meta doc fixes. [[c3]]

## Test strategy

**Test framework:** `node:test (tsx --test), mirroring src/mcp/workflow-step/__tests__/design-story-e2e.test.ts and src/workflow/__tests__/chain.test.ts`

### Test levels

- **unit** — Exercise the three orchestrator arms + pathsForWorkflow branch directly, asserting the plan seam behaves like the others.
  - Subjects: `prepareDecompose(intent{workflow:'plan'}) returns a DecomposerPrompt whose steps are exactly the six PlanStepId values in order`, `prepareSynthesize(intent{workflow:'plan'}, stepOutputs) returns a SynthesizerPrompt (delegates to planSynthesizer)`, `finalizeArtifact(intent{workflow:'plan'}, ...) delegates to finalizePlan and returns a FinalizeResult with a valid PlanArtifact`, `pathsForWorkflow(workflow='plan') returns planArtifactPaths and no longer hits the 'not yet supported' throw`, `registerWorkflowRunners registers all six plan step ids in the executor registry`
  - Fixtures: `a WorkflowIntent with workflow='plan', epicHash, storyId`, `a stepOutputs fixture carrying tasks.finalize + test-strategy.write outputs`
- **integration** — Drive a full plan run through the real insrc_workflow_step phase loop (start→plan→steps→synthesize) and assert it behaves identically to the other workflows, mirroring the existing design-story-e2e test.
  - Subjects: `a workflow='plan' run walks start→plan→(six steps)→synthesize and writes a persisted PlanArtifact (hash-json + slug-md) via the standard loop`, `the emitted step plan is the fixed six-step sequence in order (no bespoke invocation path)`, `the run reuses the same phase handlers as design.story with only the 'plan' arm differing`
  - Fixtures: `a seeded approved+non-stale LLD for the target Story (so the sc3 gate passes)`, `an offline/stubbed synthesize LLM turn returning a valid PlanArtifact body`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: a workflow='plan' run completes start→plan→steps→synthesize through the shared loop and returns the persisted breakdown`, `unit: pathsForWorkflow(workflow='plan') returns planArtifactPaths so the run persists rather than throwing` |
| `ac2` | `unit: prepareDecompose(workflow='plan') emits exactly the six PlanStepId values in fixed order`, `integration: the run's step plan matches the fixed ordered sequence consistent with the other fine-grained stages` |

## Migration

**State before:** Today the orchestrator's three seams (prepareDecompose:119-132, prepareSynthesize:186-202, finalizeArtifact:282-301) switch on workflow name across define/design.epic/design.story/tracker/stub; registerWorkflowRunners (index.ts:22-30) aggregates the per-workflow register*Runners via registerRunner (executor.ts:57); and pathsForWorkflow (synthesize.ts:96) maps those workflow names to artifact-path helpers, throwing 'not yet supported' (synthesize.ts:137) for anything else [[c1]]. There is NO 'plan' arm at any seam, no registerPlanRunners, and no plan branch in pathsForWorkflow — invoking workflow='plan' would fail at the executor (no runners) or at the pathsForWorkflow throw.

**State after:** A new runner module (src/workflow/runners/plan/index.ts, registerPlanRunners) registers the six PlanStepId runners; registerWorkflowRunners calls it alongside the others; each of the three orchestrator seams gains one 'plan' case delegating to planDecomposer/planSynthesizer/finalizePlan; and pathsForWorkflow gains one 'plan'→planArtifactPaths branch before its throw. workflow='plan' then runs through the unchanged start→plan→steps→synthesize phase loop exactly like design.story. Every existing workflow's seam behaviour is untouched.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the plan runner module (src/workflow/runners/plan/index.ts) exporting registerPlanRunners, registering one StepRunner per PlanStepId. Pure addition; no existing runner touched. — ↩ rollbackable
2. Add a registerPlanRunners() call inside registerWorkflowRunners (index.ts:22-30), alongside the existing register*Runners. Additive; other workflows' registration unchanged. — ↩ rollbackable
3. Add a 'plan' case to each of prepareDecompose (L119), prepareSynthesize (L186), and finalizeArtifact (L282) delegating to planDecomposer/planSynthesizer/finalizePlan. Each is a new switch branch; existing cases are not modified. — ↩ rollbackable
4. Add the 'plan'→planArtifactPaths branch to pathsForWorkflow (synthesize.ts:96) before the terminal 'not yet supported' throw. Additive branch; existing branches unchanged. — ↩ rollbackable
5. No data backfill or artifact rewrite: existing define/HLD/LLD artifacts and their paths are untouched; the plan arm only activates for workflow='plan'. — ↩ rollbackable

**Backward compat:** No existing public API changes. The three seam signatures (prepareDecompose/prepareSynthesize/finalizeArtifact), registerWorkflowRunners, registerRunner, and pathsForWorkflow keep their signatures; only new switch branches / a new register call are added. define/design.epic/design.story/tracker/stub behave identically, and the MCP phase loop, executor, state store, and approval flow are unchanged. Reached only when workflow==='plan'.

## Alternatives considered

### a1: Mirror the design.story wiring exactly: dedicated plan runner module + three named orchestrator arms + one pathsForWorkflow branch — **CHOSEN**

Add src/workflow/runners/plan/index.ts (registerPlanRunners) registering the six PlanStepId runners, three new cases planDecomposer/planSynthesizer/finalizePlan in the existing orchestrator switches, and a single 'plan'→planArtifactPaths branch in pathsForWorkflow — structurally identical to how design.story is wired.

sc5 is realized by replicating the proven design.story shape. (1) A new runner module src/workflow/runners/plan/index.ts exports registerPlanRunners(), registering one StepRunner per PlanStepId ('context.assemble','tasks.enumerate','tasks.critique','tasks.finalize','test-strategy.write','checklist.verify') via registerRunner; registerWorkflowRunners (index.ts:22-30) calls it alongside the others. (2) The three orchestrator seams gain a 'plan' case each: prepareDecompose returns the fixed six-step DecomposerPrompt (plan + schema), prepareSynthesize returns the SynthesizerPrompt from step outputs, finalizeArtifact delegates to finalizePlan which assembles PlanMeta+PlanBody+citations (calling checkTestStrategyCoverage from sc4) and returns FinalizeResult. planDecomposer/planSynthesizer/finalizePlan are the three named arms sc5 declares, each keeping the existing seam signature (WorkflowIntent / stepOutputs / runId+elapsedMs+llmResponse). (3) pathsForWorkflow (synthesize.ts:96) gains 'if (workflow === "plan") return planArtifactPaths(...)' before the 'not yet supported' throw. Nothing else in executor/state-store/approval/MCP loop changes.

### a2: Generic table-driven workflow registry (replace the per-workflow switches with a lookup)

Refactor prepareDecompose/prepareSynthesize/finalizeArtifact and pathsForWorkflow to dispatch through a WorkflowSpec registry keyed by name, then register 'plan' as one more table entry.

Instead of adding a 'plan' case to each switch, introduce a WorkflowSpec { decompose, synthesize, finalize, paths } registry; the orchestrator seams and pathsForWorkflow become thin lookups (registry[intent.workflow].decompose(intent), etc.). 'plan' is then registered as a single WorkflowSpec entry. sc5's three arm functions still exist but are wired via the table rather than switch cases.

**Rejected because:** Only partial on sc5 + k7: it rewrites the shared orchestrator seams for every existing workflow, contradicting the HLD's 'add a single plan arm at each existing seam / nothing else changes'. That is an HLD deviation (amendment territory), carries L cost + regression risk against green e2e suites, and buys no accuracy — so it loses to a1.

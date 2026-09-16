<!-- insrc:artifact LLD-185807ba9a6b35d3-s1 -->

# LLD: E20260717185807ba:S001

**Epic:** `add-build-workflow-insrc-5th-stage`
**HLD base run:** `wf-1784289418318-fl5y3m`
**HLD effective hash:** `6d130af6ef10...`
**Tracker:** [insors-ai/insrc#2](https://github.com/insors-ai/insrc/issues/2)

## HLD context

**Framework:** Chosen framework: **a2 — a registered `build` stage that delegates each Task's editing work to a CliProvider subprocess, while the daemon keeps sequencing and verification on its own side.** The stage is added exactly where the sibling stages live: a `src/workflow/runners/build/` subdir (index.ts + schemas.ts, one exported `registerBuildRunners(): void`, no classes, no base class — mirroring the confirmed design-story shape) plus a `src/workflow/artifacts/build.ts` artifact definition, reusing the parent module's `hash.ts` / `slug.ts` writers and `gates.ts` rather than adding skeleton machinery. The `insrc_workflow_step` surface gains a `build` phase handler mirroring `phases/plan.ts`, so the developer-facing turn shape (start → decompose → synthesize → finalize) is unchanged.

Why a2 over the field: it is the only alternative with no partial or unknown across all nine constraints. It removes the k9 dependency instead of absorbing it — the multi-turn edit/test/repair loop does **not** live inside the synthesize seam that is proven only for one-JSON-document-per-turn; it lives behind a one-Task-at-a-time subprocess boundary, so `executor.ts`/`orchestrator.ts` are asked only to do what they already demonstrably do (host a stage, run a gate, finalize an artifact). It keeps k2 enforcement daemon-side: the daemon decides advancement from a test run and a tree diff it performs itself, so a non-cooperating implementer cannot advance the run — unlike the advisory-order failure the Epic's problem statement names. And k8 is satisfied by construction rather than by special pleading: CliProvider is CLAUDE.md's sanctioned cloud path and one-subprocess-at-a-time is serial by definition.

Two items are carried into design as unproven, not settled. (1) **CliProvider's structured-output path is built for JSON returns, not for supervising a long free-form editing session** — that usage is unverified and may require provider-level work; the design must inspect `src/agent/providers/cli-provider.ts` directly, since no analyze bundle touched it (k8 is carried verbatim from CLAUDE.md). (2) Per the coverage-gap bundle, `gates.ts`, `hash.ts` and `slug.ts` are cited at **module level only** — no exploration located an entity in them by name — so k1's gate shape and k3's writer contract are unread APIs that must be read directly, alongside k9's required reading of `executor.ts` and `orchestrator.ts`. The scope phase's "clear match" verdict on `src/workflow` answers "does the skeleton exist?" (yes) and is not license to assume those files fit a code-editing workload.
**Rollout phase:** Phase A — stage registration + driving surface
**Owns:** `sc1` (BuildStageRegistration), `sc2` (WorkflowStepInputBuild)

## Contract details

**Surface level:** internal-shared

### `registerBuildRunners`

```typescript
export declare function registerBuildRunners(): void
```

**Returns:** `void` — Side-effecting registration; on return the build stage's start/decompose/synthesize/finalize StepRunners are present in the runner registry under keys `build/<runner-id>` and the stage is dispatchable.

**Errors:**
- `none` when Mirrors registerDesignStoryRunners exactly — pure registration, no throw path. A duplicate call is absorbed by the module-level idempotency guard.

**Preconditions:**
- Called from registerWorkflowRunners() in src/workflow/index.ts (the 7th register* call) before any workflow dispatch.
- 'build' is a member of WORKFLOW_NAMES (src/workflow/types.ts) so the runner registry key type `${WorkflowName}/${string}` accepts build/* keys — see dataModel + amendment.

**Postconditions:**
- Each build StepRunner has `workflow: 'build'` and is retrievable via the executor's registry (registerRunner in src/workflow/executor.ts).
- Second and later invocations are no-ops (idempotent, like every sibling register* function).

### `registerWorkflowRunners`

```typescript
export function registerWorkflowRunners(): void
```

**Returns:** `void` — Idempotent bootstrap that wires every stage's runners into the registry; reshaped by this Story to add a registerBuildRunners() call alongside its five siblings.

**Errors:**
- `none` when No throw path; guarded by a module-level `registered` boolean.

**Preconditions:**
- Existing API at src/workflow/index.ts:23-32 (entityId 74af0f8c30f0659a9d73a5d585d13363, from s1 symbol.locate). Reshape is additive: insert `registerBuildRunners();` in the register* sequence — no sibling call is altered or reordered semantically.

**Postconditions:**
- After the call, listing registered workflow stages (enumerating WORKFLOW_NAMES) shows `build` alongside define, design.epic, design.story and plan (ac1).

### `WorkflowStepInputStart`

```typescript
export interface WorkflowStepInputStart { readonly phase: 'start'; readonly workflow: WorkflowName; readonly focus: string; readonly repo?: string; readonly params?: Record<string, unknown>; }
```

**Parameters:**
- `phase: 'start'` — Discriminant selecting the start handler in handleWorkflowStep's dispatch.
- `workflow: WorkflowName` — Which stage to run; accepts 'build' once WORKFLOW_NAMES gains the member. THIS is how a developer starts a build run through the same surface — no new input type is added (sc2 realized).
- `focus: string` — One-line human framing passed to the decomposer + every step prompt.
- `repo: string | undefined` _(optional)_ — Target repo path; falls back to $INSRC_REPO when absent.
- `params: Record<string, unknown> | undefined` _(optional)_ — Per-workflow params; build carries { epicHash, storyId } identifying the approved plan to implement (validated by the build runner, mirroring design.story).

**Returns:** `Promise<WorkflowStepMcpEnvelope>` — Verified existing driving-surface input (src/mcp/workflow-step/types.ts, read directly per HLD backFlowNotes item 2). Fed to handleWorkflowStep -> handleStart; drives build through the identical start/plan/step/synthesize turn shape used by every earlier stage (ac2). No bespoke command, IPC method or UI.

**Errors:**
- `WorkflowStepError { code:'bad-input'|'internal' }` when handleWorkflowStep returns next:'error' when input lacks a `phase` field or a handler throws; unknown workflow names are rejected downstream by the decomposer/registry lookup.

**Preconditions:**
- 'build' must be a valid WorkflowName for `workflow:'build'` to be accepted — see dataModel + amendment.

**Postconditions:**
- The start turn returns next:'emit_plan' with a WorkflowStepEmitPlan (existing output shape), continuing the standard multi-turn loop; no new output union member is introduced for build.

### `handleWorkflowStep`

```typescript
export function handleWorkflowStep(input: unknown): Promise<WorkflowStepMcpEnvelope>
```

**Parameters:**
- `input: unknown` — The raw WorkflowStepInput; narrowed on `phase` to start/plan/step/synthesize handlers.

**Returns:** `Promise<WorkflowStepMcpEnvelope>` — Existing stage-agnostic dispatcher (src/mcp/workflow-step/handler.ts, named in s1 module.profile). Unchanged by this Story — build flows through the same dispatch as its siblings, which is precisely why sc2 needs no new surface.

**Errors:**
- `WorkflowStepError` when next:'error' for bad-input / bad-phase / internal — the existing error envelope; no build-specific error arm is added at this layer.

**Preconditions:**
- registerWorkflowRunners() has run so the build runners are resolvable.

**Postconditions:**
- No change to this function's body is required by s1; the build stage is reachable purely by the WORKFLOW_NAMES addition + registerBuildRunners().

## Data model changes

### `WorkflowName / WORKFLOW_NAMES` — field-add

Add the string literal 'build' to the WORKFLOW_NAMES tuple (src/workflow/types.ts:69-78) so `WorkflowName = typeof WORKFLOW_NAMES[number]` includes 'build'. This is the single load-bearing, additive change that makes the stage first-class: it is what registerBuildRunners' registry keys (`build/<id>`), StepRunner.workflow, WorkflowIntent.workflow, WorkflowPlan.workflow and WorkflowStepInputStart.workflow all key on. It is the REAL primitive that sc1's BUILD_STAGE_ID sketch and sc2's WorkflowStepStage-with-'build' sketch stood in for — the codebase has no per-stage descriptor object and no stage-name union on the MCP surface.

```
export const WORKFLOW_NAMES = [ 'stub', 'define', 'design.epic', 'design.story', 'plan',
+  'build',            // Phase A — implements an approved Story plan
  'tracker.push', 'tracker.sync', 'tracker.post' ] as const;
```

**Call sites:**
- `src/workflow/types.ts (WORKFLOW_NAMES / WorkflowName / RunnerRegistryKey / WorkflowIntent.workflow / WorkflowStep.runner — s1 module.profile pathsCited)`
- `src/workflow/index.ts (registerWorkflowRunners — s1 symbol.locate, index.ts:23-32)`
- `src/mcp/workflow-step/types.ts (WorkflowStepInputStart.workflow: WorkflowName — s1 module.profile pathsCited)`

### `Runner registry entries `build/<runner-id>`` — new

registerBuildRunners() adds StepRunner entries keyed by RunnerRegistryKey `build/<id>` (start/decompose/synthesize/finalize handlers, wired in a later Story). No new registry mechanism — reuses the executor's registerRunner exactly as design.story does. This is instantiation, not rebuild (c1/ac3).

**Call sites:**
- `src/workflow/executor.ts (registerRunner — s1 coverage-gap pathsCited)`
- `src/workflow/runners/design-story/index.ts:541-552 (registerDesignStoryRunners — the shape mirrored, s1 symbol.locate)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | registerBuildRunners() is sc1 realized as an idempotent `export function registerBuildRunners(): void` mirroring registerDesignStoryRunners (src/workflow/runners/design-story/index.ts:541), added as the 7th register* call inside registerWorkflowRunners() (src/workflow/index.ts:23-32). Direct reads confirm the codebase has NO per-stage descriptor object: sc1's interfaceSketch BuildStageDescriptor { stage/title/description/consumesStage } and BUILD_STAGE_ID do not correspond to any existing pattern. Stage identity = WORKFLOW_NAMES membership + the `workflow:'build'` field on each StepRunner; `consumesStage:'plan'` is expressed operationally by the build runner's start-turn gate (requireApproved* over the plan artifact) and its params { epicHash, storyId }, not by a descriptor field. The contract's PURPOSE (make build a discoverable first-class stage, k4/k6) is fully met; only its sketched shape is corrected — recorded in the amendment proposal. |
| `sc2` | implements | sc2's purpose — drive build through the same multi-turn surface with no bespoke command, IPC method or UI — is realized by the EXISTING stage-agnostic surface, not a new input type. Direct reads (mandated by HLD backFlowNotes item 2) of src/mcp/workflow-step/types.ts, handler.ts and state.ts show: WorkflowStepPhase is 'start'\|'plan'\|'step'\|'synthesize' (there is no start/decompose/synthesize/finalize BuildPhase); WorkflowStepInputStart already carries `workflow: WorkflowName`; and WorkflowStepStage (state.ts) is 'awaiting_plan'\|'awaiting_llm_step'\|'awaiting_synthesize' — a codec stage, NOT a workflow-name union. A developer starts build via insrc_workflow_step({ phase:'start', workflow:'build', focus, repo, params:{ epicHash, storyId } }) and continues through the identical emit_plan/emit_step/emit_synthesize loop. Consequently the sc2 interfaceSketch types (WorkflowStepInputBuild, WorkflowStepOutputBuild, BuildPhase, and the 'build'-bearing WorkflowStepStage union) are NOT introduced — introducing them would be inventing a discriminated surface the code does not have. The one real enabler is 'build' ∈ WORKFLOW_NAMES; see amendment proposal. |

## Error paths

### Error cases

- **Build start turn is invoked with params missing epicHash or storyId (or carrying malformed values) that identify which approved plan to implement.** (recoverable)
  - Detection: The build runner's start handler destructures params and validates epicHash/storyId presence and shape before materializing any work list — mirroring how design.story validates its own params — and short-circuits when they are absent or ill-typed. This is the runner's own guard, not a downstream surprise.
  - Response: Return a WorkflowStepError envelope (next:'error', code:'bad-input') from the start turn before any gate evaluation or plan load; no work list is materialized.
  - User impact: Developer sees an immediate, actionable 'build requires epicHash + storyId' error on the first turn and cannot start a directionless run.
- **The plan artifact for the given epicHash/storyId exists but is not approved, or is stale relative to its upstream design.story artifact.** (recoverable)
  - Detection: The build runner's start-turn gate runs the requireApproved*/freshness check over the plan artifact (the same gate seam design.story uses over its upstream), reading the artifact's approval flag and its content hash versus upstream; it finds the plan unapproved or its hash stale.
  - Response: Refuse at the start turn with a gate-refusal WorkflowStepError before any task list is materialized; the run does not proceed to decompose.
  - User impact: Developer is told the plan must be approved (or re-approved after upstream drift) before build can run, protecting the authorization boundary that test commands come from an approved plan.
- **No plan artifact exists at all for the supplied epicHash/storyId.** (recoverable)
  - Detection: The gate/artifact loader looks the plan artifact up by its hash-derived key and gets a miss (the same load path define/design.epic/design.story use through hash.ts).
  - Response: Return a WorkflowStepError (next:'error') from the start turn reporting the missing upstream plan; no runner work begins.
  - User impact: Developer learns they must run and approve the plan stage first, keeping build strictly downstream of plan.
- **A build run is dispatched (workflow:'build') but registerBuildRunners() never executed, so no build/<id> StepRunner is in the executor registry.** (terminal)
  - Detection: The executor's registry lookup for the RunnerRegistryKey `build/<id>` returns a miss when handleWorkflowStep tries to resolve the runner for the turn.
  - Response: handleWorkflowStep surfaces next:'error' (code:'internal') — the existing unresolved-runner arm; no build-specific error path is added.
  - User impact: A misbootstrapped daemon fails loudly on the first build turn rather than silently accepting and hanging; signals a registration wiring bug.
- **A WorkflowStepInput arrives with workflow:'build' but a missing or unrecognized `phase` discriminant.** (recoverable)
  - Detection: handleWorkflowStep narrows on `phase` across its start/plan/step/synthesize arms and finds no matching arm (the existing stage-agnostic dispatch guard).
  - Response: Return the existing WorkflowStepError envelope (next:'error', code:'bad-input'); build reuses the shared dispatcher's error handling with no new arm.
  - User impact: Malformed turn input is rejected identically to every other stage — build introduces no divergent error semantics on the shared surface.

### Edge cases

| Input | Expected |
| :--- | :--- |
| registerBuildRunners() (or registerWorkflowRunners()) is invoked a second or later time. | The module-level `registered` boolean guard short-circuits; build runners are registered exactly once and the repeat call is a silent no-op, matching every sibling register* function — no throw, no duplicate registry entries. |
| A build start turn omits `repo`. | The handler falls back to $INSRC_REPO exactly as the shared start path already does for every other stage; the run proceeds against the env-configured repo. |
| registerBuildRunners() is inserted at a different position within the register* sequence in registerWorkflowRunners() (e.g. before plan rather than after). | The resulting registry is identical — registration is order-independent and additive, so no sibling stage's behaviour changes regardless of insertion point (ac3). |
| A developer enumerates the available workflow stages while 'build' sits in WORKFLOW_NAMES between 'plan' and the 'tracker.*' entries. | 'build' appears alongside define, design.epic, design.story and plan with no gaps or duplicates, described as the stage that implements an approved Story plan (ac1). |
| A build start turn supplies a valid but terse `focus` string (e.g. a single word). | It is accepted and threaded to the decomposer and every step prompt unchanged — focus is human framing, not a validated field, so no shape check rejects it. |

### Invariants to preserve

- Registration idempotency: every register* entrypoint is a no-throw function guarded by a module-level `registered` boolean, so repeated calls are no-ops. registerBuildRunners() must preserve this exactly — the s1 symbol.locate bundle establishes registerDesignStoryRunners as the shape to mirror (registration function, no base class), and the sibling calls inside registerWorkflowRunners (src/workflow/index.ts:23-32) must remain unaltered and un-reordered semantically. [[c1]]
- The MCP driving surface stays stage-agnostic: per the s1 module.profile of src/mcp/workflow-step, WorkflowStepPhase remains 'start'|'plan'|'step'|'synthesize' and WorkflowStepInputStart already carries `workflow: WorkflowName`. Build must be driven through this existing surface with NO build-specific input/output/phase type and NO change to handleWorkflowStep's body — introducing a WorkflowStepInputBuild/BuildPhase would break the shared-surface invariant sc2 depends on. [[c1]]
- Sibling stages are untouched: the s1 symbol.locate registry seam shows build is composed by plugging a registered stage into the executor registry, not by altering define, design.epic, design.story or plan. Adding build must leave every existing stage's dispatch and behaviour byte-for-byte unchanged (ac3). [[c1]]
- The approved plan is the authorization boundary: the s1 data-model.trace bundle establishes that the approved PlanTask is what build consumes (test commands come verbatim from an approved plan). Build must not materialize a work list or proceed past its start turn without an approved, non-stale plan artifact for the supplied epicHash/storyId. [[c1]]
- Same durability envelope as the sibling artifacts: the s1 data-model.trace bundle establishes that build reuses the parent module's hash.ts + slug.ts writers alongside plan.ts/define.ts rather than adding new persistence machinery. Any build artifact definition must write through those existing writers, preserving the define/design.epic/design.story/plan durability contract. [[c1]]

## Test strategy

**Test framework:** `node:test via `tsx --test`, colocated `*.test.ts` files under each module's `__tests__/` (src/workflow/__tests__ and src/mcp/workflow-step/__tests__ — per s1 test.locate)`

### Test levels

- **unit** — Prove the single load-bearing primitive — 'build' ∈ WORKFLOW_NAMES — makes the stage first-class and discoverable, and that registerBuildRunners() mirrors the sibling register* idempotency/registration contract without touching siblings.
  - Subjects: `WORKFLOW_NAMES tuple / WorkflowName union (src/workflow/types.ts) — asserts 'build' is present between 'plan' and the 'tracker.*' entries, once, with no gaps or duplicates`, `registerBuildRunners() (src/workflow/runners/build/index.ts) — registers start/decompose/synthesize/finalize StepRunners keyed build/<id> with workflow:'build' via the executor's registerRunner`, `registerWorkflowRunners() (src/workflow/index.ts:23-32) — still registers every sibling stage's runners and now also invokes registerBuildRunners()`, `idempotency guard — the module-level `registered` boolean short-circuits repeat registerBuildRunners()/registerWorkflowRunners() calls to no-ops`
  - Fixtures: `a fresh/reset runner registry per test (the executor registry seam) so registration side effects are observable and isolated`, `a snapshot of sibling (define/design.epic/design.story/plan) registry entries taken before build registration, to assert byte-for-byte non-mutation`
- **integration** — Prove a developer drives build through the identical stage-agnostic MCP surface used by earlier stages — no bespoke input/phase type, no new dispatcher arm — by exercising handleWorkflowStep end-to-end for a build start turn.
  - Subjects: `handleWorkflowStep (src/mcp/workflow-step/handler.ts) — accepts { phase:'start', workflow:'build', focus, repo?, params:{ epicHash, storyId } } and dispatches through the existing start/plan/step/synthesize turn shape`, `WorkflowStepInputStart.workflow: WorkflowName (src/mcp/workflow-step/types.ts) — verifies 'build' is accepted with no WorkflowStepInputBuild/BuildPhase introduced`, `start-turn envelope — returns next:'emit_plan' (existing WorkflowStepEmitPlan output), continuing the standard multi-turn loop with no build-specific output union member`
  - Fixtures: `registerWorkflowRunners() invoked in test setup so build/<id> runners are resolvable (mirror src/daemon/__tests__/workflow-rpc.test.ts run-driving setup)`, `a stub/fixture approved plan artifact keyed by { epicHash, storyId } written through the existing hash.ts/slug.ts writers so the start-turn gate can pass and the run reaches emit_plan`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: WORKFLOW_NAMES contains 'build' alongside define, design.epic, design.story and plan — exactly once, no gaps or duplicates (src/workflow/__tests__)`, `unit: after registerWorkflowRunners(), enumerating WORKFLOW_NAMES / the registered workflow stages lists 'build' as a first-class stage that implements an approved Story plan` |
| `ac2` | `integration: handleWorkflowStep accepts { phase:'start', workflow:'build', focus, params:{ epicHash, storyId } } and returns next:'emit_plan', driving build through the same start/plan/step/synthesize loop as plan (src/mcp/workflow-step/__tests__)`, `unit/type: WorkflowStepInputStart.workflow accepts 'build' with no WorkflowStepInputBuild / BuildPhase / build-specific dispatcher arm added — build reuses the shared stage-agnostic surface (no bespoke command, IPC method or UI)` |
| `ac3` | `unit: registerBuildRunners() adds build/<id> StepRunners to the executor registry via registerRunner while a before/after snapshot shows sibling (define/design.epic/design.story/plan) registry entries are byte-for-byte unchanged`, `unit: registerBuildRunners() is idempotent — a second and later invocation is a silent no-op producing no duplicate registry entries and no throw`, `unit: inserting registerBuildRunners() at a different position within the register* sequence yields an identical resulting registry (registration is order-independent and additive)` |

## Migration

**State before:** Per s1 symbol.locate (registerWorkflowRunners at src/workflow/index.ts:23-32, entityId 74af0f8c30f0659a9d73a5d585d13363) and s1 data-model.trace, the workflow chain today knows five doc-producing stages plus the tracker family: WORKFLOW_NAMES (src/workflow/types.ts:69-78) is `['stub','define','design.epic','design.story','plan','tracker.push','tracker.sync','tracker.post']`, so `WorkflowName` has no 'build' member and the runner-registry key type `${WorkflowName}/${string}` rejects `build/*` keys. registerWorkflowRunners() wires exactly its existing register* siblings (design-epic, design-story, plan, tracker), with no registerBuildRunners among them, so the executor registry (registerRunner, src/workflow/executor.ts, s1 coverage-gap) holds no runner whose `workflow` is 'build'. On the driving surface (s1 module.profile of src/mcp/workflow-step), handleWorkflowStep dispatches on WorkflowStepInputStart.workflow: WorkflowName; because 'build' is not a member, `insrc_workflow_step({phase:'start', workflow:'build', ...})` is rejected downstream by the decomposer/registry lookup. Per s1 data-model.trace, src/workflow/artifacts holds define.ts/plan.ts/etc. but no build.ts. Net: build is an off-chain activity — undiscoverable in the stage list and undrivable through the shared MCP surface.

**State after:** 'build' is a first-class member of WORKFLOW_NAMES, so `WorkflowName` includes 'build' and the registry key type accepts `build/<id>`. registerBuildRunners() exists as an idempotent `export function ...(): void` mirroring registerDesignStoryRunners (src/workflow/runners/design-story/index.ts:541), registering start/decompose/synthesize/finalize StepRunners each carrying `workflow:'build'`, and is called as the 7th register* inside registerWorkflowRunners() (src/workflow/index.ts) without altering or reordering any sibling. Enumerating WORKFLOW_NAMES shows 'build' alongside define, design.epic, design.story and plan, described as the stage that implements an approved Story plan (ac1). A developer starts a run via the unchanged shared surface — `insrc_workflow_step({phase:'start', workflow:'build', focus, repo, params:{epicHash, storyId}})` — and continues through the identical emit_plan/emit_step/emit_synthesize loop (ac2), with no bespoke command, IPC method, UI, or new input/output union type introduced. A build.ts artifact definition sits in src/workflow/artifacts alongside plan.ts, reusing the parent module's hash.ts + slug.ts writers (ac3, c1).

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the string literal 'build' to the WORKFLOW_NAMES tuple in src/workflow/types.ts (between 'plan' and the 'tracker.*' members) so that `WorkflowName` gains 'build' and the runner-registry key type `${WorkflowName}/${string}` accepts `build/*` keys. This is the single load-bearing additive primitive; no existing member is removed, renamed, or reordered. — ↩ rollbackable
2. Add a build.ts artifact definition under src/workflow/artifacts, mirroring plan.ts/define.ts and reusing the parent module's hash.ts + slug.ts writers — a new sibling file with no change to existing artifact definitions or persistence machinery. — ↩ rollbackable
3. Add a registerBuildRunners() entrypoint under src/workflow/runners/build/, mirroring registerDesignStoryRunners: register start/decompose/synthesize/finalize StepRunners keyed `build/<id>`, each with `workflow:'build'`, guarded by the same module-level idempotency boolean so repeat calls are no-ops. Pure addition of new runner entries via the existing executor registerRunner; no sibling runner is touched. — ↩ rollbackable
4. Insert a `registerBuildRunners();` call into registerWorkflowRunners() (src/workflow/index.ts:23-32) as the 7th register* invocation, alongside its five siblings, inside the existing `registered`-boolean idempotency guard. Additive insertion only — no existing register* call is altered, removed, or semantically reordered. — ↩ rollbackable
5. Extend the two co-located sibling suites in place (s1 test.locate): add an ac1 discoverability assertion in src/workflow/__tests__ that 'build' appears in the enumerated stage list beside its siblings, and an ac2 phase-shape assertion in src/mcp/workflow-step/__tests__ that a `workflow:'build'` start turn is accepted and driven through the same start/plan/step/synthesize loop. No new test harness is introduced. — ↩ rollbackable

**Backward compat:** No backward-incompatible change. The surface is internal-shared and every step is purely additive: adding 'build' to WORKFLOW_NAMES widens the `WorkflowName` union and the `${WorkflowName}/${string}` key type without removing or altering any existing member, so all current callers (define/design.epic/design.story/plan/tracker dispatch, registry lookups, WorkflowStepInputStart.workflow validation) continue to accept exactly what they accepted before. handleWorkflowStep and WorkflowStepInputStart are unchanged — no new input/output union member is introduced, so existing MCP callers are unaffected. registerWorkflowRunners() stays idempotent and its sibling register* calls are neither reordered nor modified, so a daemon that never starts a build run behaves identically to today. No existing public API signature changes; a rollback of any step leaves the prior stages fully functional. Because the amendment (sc1 fieldAdd, breaking:false) only adds a literal, no consumer of the union needs updating to keep compiling.

## Alternatives considered

### a1: Twin dedicated types, literal plan mirror — **CHOSEN**

sc1 is a registration function and sc2 is a standalone WorkflowStepInputBuild/OutputBuild pair, each a byte-for-byte structural copy of plan's, with a new phases/build.ts.

Shape both owned contracts as exact siblings of the plan stage. sc1 = `registerBuildRunners(): void` plus a `BuildStageDescriptor` literal (stage/title/description/consumesStage:'plan'), mirroring registerDesignStoryRunners with no base class. sc2 = a dedicated `WorkflowStepInputBuild` interface discriminated by `stage:'build'` and its own `WorkflowStepOutputBuild`, both living in src/mcp/workflow-step/types.ts alongside — not merged into — the plan types, dispatched by a new phases/build.ts that copies phases/plan.ts's start/decompose/synthesize/finalize turn threading. Each stage owns its own concrete input/output types; nothing shared is edited beyond adding 'build' to the WorkflowStepStage string union and one registry entry.

### a2: Discriminated-union member on the shared WorkflowStepInput

'build' becomes a new member of an existing WorkflowStepInput/Output discriminated union keyed on `stage`, routed through the generic handleStep, with no dedicated phases/build.ts.

Treat sc2 not as a standalone interface but as an additive variant of a shared discriminated union. `WorkflowStepInput` gains a `{ stage:'build'; phase:BuildPhase; storyId; state?; repo? }` arm and `WorkflowStepOutput` gains the matching build arm carrying refusal/progress; dispatch flows through the existing generic handleStep (phases/step.ts) which narrows on `stage`, so no new phase-handler file is created. sc1 still exports registerBuildRunners() and a BuildStageDescriptor, but the descriptor is what the generic dispatcher reads to route a `build` turn. Build-specific payload shapes (BuildAdmissionRefusal, BuildRunProgress) remain s1-owned named types referenced from the union arm.

**Rejected because:** Ranked below a1 because it scores partial on both ac3 and sc2: folding build into a shared WorkflowStepInput union diverges from the standalone interface the sc2 interfaceSketch mandates (a contract-shape back-flow risk) and, if plan turns out to be handler-per-file, reshapes a contract siblings own — exceeding s1's boundary and enlarging blast radius (a malformed narrowing fails all stages, not just build). Its smaller-code-surface advantage is conditional on a shared union already existing, which the alternative itself flags as unverified. Cost M.

### a3: Descriptor-driven declarative stage

sc1 BuildStageDescriptor is the single source of truth — stage id, titles, consumesStage, and the phase set as data — and sc2's input is a thin generic WorkflowStepInput<'build'> derived from it.

Make the stage *descriptor* the center of the data model. sc1 = a `BuildStageDescriptor` record that declares not just title/description/consumesStage but the ordered phase set ('start'|'decompose'|'synthesize'|'finalize') as data; registerBuildRunners() registers that record once. sc2 = `WorkflowStepInput<'build'>` / `WorkflowStepOutput<'build'>` parameterized generics whose phase type is read from the descriptor, so the driving surface derives its turn shape from the registered record rather than a hand-written per-stage interface. ac1's stage list falls out of enumerating registered descriptors; the MCP surface validates `phase` against the descriptor's declared phase set.

**Rejected because:** The weakest fit to the constraints as written: it violates ac3 and sc2 and scores partial on ac2 and sc1. A descriptor-driven generic that declares the phase set as data rebuilds skeleton machinery rather than plugging in a sibling (breaching k5/k6, 'instantiate not rebuild'); parameterized WorkflowStepInput<'build'>/WorkflowStepOutput<'build'> generics replace the HLD's concrete interfaceSketches with heavier contracts (a contract-shape back-flow on sc1 and sc2); and deriving phase validation from data moves turn-shape errors from compile time to run time, weakening the structural ac2 guarantee. Highest cost estimate (L). Ranked last.

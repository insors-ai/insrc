<!-- insrc:artifact PLAN-185807ba9a6b35d3-s1 -->

# Plan: s1

**Epic:** `add-build-workflow-insrc-5th-stage`
**LLD run:** `wf-1784304852747-uu8si8`
**LLD effective hash:** `6d130af6ef10...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add 'build' to WORKFLOW_NAMES so WorkflowName includes it | S | — | unit: WORKFLOW_NAMES includes 'build' exactly once between 'plan' and the 'tracker.*' entries, with no gaps or duplicates (src/workflow/__tests__); unit: WorkflowStepInputStart.workflow accepts 'build' at the type level with no WorkflowStepInputBuild/BuildPhase introduced (src/mcp/workflow-step/__tests__) | [[c1]] [[c5]] |
| 2 | **`t2`** Add the build.ts artifact definition under src/workflow/artifacts | M | `t1` | unit: build artifact round-trips through the shared hash.ts + slug.ts writers, keyed/slugged consistently with the sibling plan artifact (src/workflow/__tests__) | [[c2]] |
| 3 | **`t3`** Add registerBuildRunners() under src/workflow/runners/build/ | M | `t1` | unit: registerBuildRunners() registers start/decompose/synthesize/finalize StepRunners keyed build/<id> tagged workflow:'build' via registerRunner (src/workflow/__tests__); unit: registerBuildRunners() is idempotent — a second/later call is a silent no-op via the `registered` guard, producing no duplicate entries and no throw (src/workflow/__tests__) | [[c3]] |
| 4 | **`t4`** Insert registerBuildRunners() into registerWorkflowRunners() | S | `t3` | unit: registerWorkflowRunners() invokes registerBuildRunners() alongside every sibling register* call, with a before/after snapshot showing sibling registrations byte-for-byte unchanged (src/workflow/__tests__); unit: registerWorkflowRunners() stays idempotent and order-independent — build/<id> runners resolvable, repeat call registers nothing twice and does not throw (src/workflow/__tests__) | [[c4]] |
| 5 | **`t5`** Extend the co-located test suites for build discoverability + start-turn phase shape | M | `t2`, `t4` | integration: handleWorkflowStep { phase:'start', workflow:'build', focus, params:{ epicHash, storyId } } advances to next:'emit_plan' via the shared start/plan/step/synthesize turn shape, backed by a stub approved-plan fixture (src/mcp/workflow-step/__tests__); unit: 'build' enumerates as a first-class stage alongside define/design.epic/design.story/plan after registerWorkflowRunners() (src/workflow/__tests__) | [[c1]] [[c3]] [[c5]] |

### `t1` — Add 'build' to WORKFLOW_NAMES so WorkflowName includes it

In src/workflow/types.ts, insert the 'build' string literal into the WORKFLOW_NAMES tuple between 'plan' and the 'tracker.*' members. This is the single load-bearing additive primitive: `WorkflowName = typeof WORKFLOW_NAMES[number]` gains 'build', the runner-registry key type `${WorkflowName}/${string}` starts accepting `build/*` keys, and WorkflowStepInputStart.workflow (src/mcp/workflow-step/types.ts) accepts `workflow:'build'` with no new input/output/phase type — realizing sc2 through the existing stage-agnostic MCP surface. No existing member is removed, renamed, or reordered.

**Acceptance checks:**
- WORKFLOW_NAMES contains 'build' exactly once, positioned between 'plan' and the first 'tracker.*' entry, with no gaps or duplicates
- `WorkflowName` resolves to a union that includes the 'build' literal and the project typechecks (tsc) with the widened union
- The `${WorkflowName}/${string}` runner-registry key type accepts a `build/<id>` key (type-level assertion compiles)
- WorkflowStepInputStart.workflow accepts `'build'` as a value with no WorkflowStepInputBuild / BuildPhase / build-specific dispatcher arm introduced anywhere on src/mcp/workflow-step

### `t2` — Add the build.ts artifact definition under src/workflow/artifacts

Create src/workflow/artifacts/build.ts as a new sibling of plan.ts/define.ts, defining the Task-bearing BuildArtifact and wiring it through the parent module's existing hash.ts + slug.ts writers and storage.ts — preserving the identical durability envelope used by define/design.epic/design.story/plan (hash-json + slug-md, incremental-checkpoint-capable). No change to any existing artifact definition or persistence machinery; a self-contained additive file.

**Acceptance checks:**
- src/workflow/artifacts/build.ts exists defining the build stage's artifact, mirroring the structure of the sibling plan.ts artifact definition
- The definition writes through the parent module's existing hash.ts + slug.ts writers (and storage.ts) — no new persistence substrate, no direct file I/O introduced
- Existing artifact definitions (define.ts/plan.ts/etc.) and the shared writer machinery are byte-for-byte unchanged by this addition
- The module typechecks and the artifact is keyed/slugged consistently with its siblings

### `t3` — Add registerBuildRunners() under src/workflow/runners/build/

Create src/workflow/runners/build/ (index.ts + schemas.ts) exporting an idempotent `export function registerBuildRunners(): void` that mirrors registerDesignStoryRunners: register the build stage's start/decompose/synthesize/finalize StepRunners via the executor's registerRunner, each keyed `build/<id>` and carrying `workflow:'build'`. No classes, no base class, no inheritance. A module-level `registered` boolean guard makes repeat calls silent no-ops. No sibling runner is touched. SCOPE BOUNDARY for this Story per dataModelChanges: this Task delivers registry MEMBERSHIP + dispatchability only — the four StepRunner entries are registered under build/<id> with workflow:'build', but the actual turn-handler bodies are minimal placeholders deferred to a later Story (dataModelChanges: 'wired in a later Story'). Accordingly, acceptance asserts registry presence + workflow tag, NOT end-to-end handler behavior.

**Acceptance checks:**
- registerBuildRunners() is exported from src/workflow/runners/build/index.ts as an idempotent `(): void` function with no class or base-class inheritance, mirroring registerDesignStoryRunners
- After calling it, the executor registry HOLDS start/decompose/synthesize/finalize StepRunner entries keyed `build/<id>`, each tagged `workflow:'build'` — assertion is on registry membership + workflow tag, not on invoking a functioning handler body (handler logic is a deferred-to-later-Story placeholder)
- A second and later invocation is a silent no-op (no throw, no duplicate registry entries) via the module-level `registered` guard
- A before/after snapshot shows sibling (define/design.epic/design.story/plan) registry entries are unchanged — registration is additive and order-independent

### `t4` — Insert registerBuildRunners() into registerWorkflowRunners()

In src/workflow/index.ts (registerWorkflowRunners at lines 23-32), add a `registerBuildRunners();` call as the 7th register* invocation alongside its five siblings, inside the existing `registered`-boolean idempotency guard. Additive insertion only — no existing register* call is altered, removed, or semantically reordered — so the build stage becomes discoverable and dispatchable while every sibling stage's dispatch stays byte-for-byte unchanged.

**Acceptance checks:**
- registerWorkflowRunners() invokes registerBuildRunners() exactly once, added alongside the existing sibling register* calls with none altered or reordered
- After registerWorkflowRunners() runs, the build/<id> runners are resolvable from the executor registry (a build turn can resolve its runner)
- registerWorkflowRunners() remains idempotent under its module-level guard — repeat calls register nothing twice and do not throw
- Enumerating WORKFLOW_NAMES / the registered stages lists 'build' as a first-class stage alongside define, design.epic, design.story and plan

### `t5` — Extend the co-located test suites for build discoverability + start-turn phase shape

Fulfil migration.migrationSteps step 5 and testStrategy's acceptanceMapping (ac1/ac2/ac3), the sole handoff item uncovered by t1–t4. Extend two existing co-located suites in place — no new test harness. UNIT (src/workflow/__tests__): assert 'build' enumerates alongside its siblings in WORKFLOW_NAMES/the registered stages (ac1 discoverability), and that registerBuildRunners() registers the start/decompose/synthesize/finalize build/<id> entries with workflow:'build' while a before/after registry snapshot leaves sibling stages byte-for-byte unchanged and a repeat call is a silent no-op. INTEGRATION (src/mcp/workflow-step/__tests__): drive handleWorkflowStep end-to-end with { phase:'start', workflow:'build', focus, params:{ epicHash, storyId } } through to next:'emit_plan' (ac2 phase-shape assertion), using a stub approved-plan artifact fixture written via the existing hash.ts/slug.ts writers. Assertions map explicitly to ac1/ac2/ac3 in testStrategy.acceptanceMapping. Only test files are added/extended; no product source is touched.

**Acceptance checks:**
- A unit test in src/workflow/__tests__ asserts 'build' enumerates alongside define/design.epic/design.story/plan (proves ac1 discoverability) and that registerBuildRunners() registers the four build/<id> StepRunner entries tagged workflow:'build', with a before/after snapshot showing siblings unchanged and a second call a silent no-op
- An integration test in src/mcp/workflow-step/__tests__ drives handleWorkflowStep with { phase:'start', workflow:'build', focus, params:{ epicHash, storyId } } and asserts it advances to next:'emit_plan' (proves ac2 start-turn phase shape), backed by a stub approved-plan fixture written through the existing hash.ts/slug.ts writers
- Each added assertion is annotated to the ac1/ac2/ac3 entry it proves per testStrategy.acceptanceMapping, and the full test sweep (npx tsx --test 'src/workflow/**/*.test.ts' 'src/mcp/**/*.test.ts') passes
- The change adds/extends test files only — no product source under src/workflow or src/mcp/workflow-step is modified by this Task

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| WORKFLOW_NAMES tuple / WorkflowName union (src/workflow/types.ts) — asserts 'build' is present between 'plan' and the 'tracker.*' entries, once, with no gaps or duplicates | `t1`, `t5` |
| registerBuildRunners() (src/workflow/runners/build/index.ts) — registers start/decompose/synthesize/finalize StepRunners keyed build/<id> with workflow:'build' via the executor's registerRunner | `t3`, `t5` |
| registerWorkflowRunners() (src/workflow/index.ts:23-32) — still registers every sibling stage's runners and now also invokes registerBuildRunners() | `t4` |
| idempotency guard — the module-level `registered` boolean short-circuits repeat registerBuildRunners()/registerWorkflowRunners() calls to no-ops | `t3`, `t4` |
| handleWorkflowStep (src/mcp/workflow-step/handler.ts) — accepts { phase:'start', workflow:'build', focus, repo?, params:{ epicHash, storyId } } and dispatches through the existing start/plan/step/synthesize turn shape | `t5` |
| WorkflowStepInputStart.workflow: WorkflowName (src/mcp/workflow-step/types.ts) — verifies 'build' is accepted with no WorkflowStepInputBuild/BuildPhase introduced | `t1` |
| start-turn envelope — returns next:'emit_plan' (existing WorkflowStepEmitPlan output), continuing the standard multi-turn loop with no build-specific output union member | `t5` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1 WORKFLOW_NAMES tuple / WorkflowName union widening (src/workflow/types.ts) — add 'build' between 'plan' and the 'tracker.*' entries so the union and the `${WorkflowName}/${string}` runner-registry key type gain 'build'`
- **[[c2]]** `prior-artifact` `LLD s1 build.ts artifact definition (src/workflow/artifacts/build.ts) — Task-bearing BuildArtifact wired through the existing hash.ts + slug.ts writers and storage.ts, mirroring the sibling plan.ts durability envelope`
- **[[c3]]** `prior-artifact` `LLD s1 registerBuildRunners() (src/workflow/runners/build/index.ts) — idempotent (): void registering start/decompose/synthesize/finalize StepRunners keyed build/<id> with workflow:'build' via the executor's registerRunner, guarded by a module-level `registered` boolean`
- **[[c4]]** `prior-artifact` `LLD s1 registerWorkflowRunners() insertion (src/workflow/index.ts:23-32) — additive registerBuildRunners() call alongside its sibling register* invocations, inside the existing idempotency guard`
- **[[c5]]** `prior-artifact` `LLD s1 WorkflowStepInputStart.workflow: WorkflowName (src/mcp/workflow-step/types.ts) — 'build' accepted through the stage-agnostic MCP start-turn surface with no WorkflowStepInputBuild/BuildPhase or build-specific dispatcher arm, and handleWorkflowStep returns next:'emit_plan'`

<!-- insrc:artifact LLD-1cd9a4c34f403a80-s1 -->

# LLD: E202607151cd9a4c3:S001

**Epic:** `add-plan-workflow-insrc-framework-4th`
**HLD base run:** `wf-1784121669696-i1rc6r`
**HLD effective hash:** `c7645d42a9f5...`

## HLD context

**Framework:** Implement `plan` as a new fine-grained instance of the shared workflow skeleton, peer to define/design.epic/design.story. A single runner module registers a fixed six-step recipe (context.assemble -> tasks.enumerate -> tasks.critique -> tasks.finalize -> test-strategy.write -> checklist.verify) whose outputs the orchestrator's three per-workflow arms turn into a persisted, cited PlanArtifact for exactly one Story. A new gate reads the Story's approved, non-stale LLD (adding requireApprovedLld by mirroring requireApprovedHld and reusing the existing effective-hash/staleness machinery), and a new storage helper writes the artifact under the as-built slug-md + hash-json convention. Nothing about the executor, state store, approval flow, or MCP phase loop changes except a single 'plan' arm added at each existing seam.
**Rollout phase:** Phase A — Core breakdown + contract shapes
**Owns:** `sc1` (PlanTask)
**Consumes:** `sc3` (PlanUpstreamGate), `sc4` (TaskTestPlan), `sc5` (PlanOrchestration)

## Contract details

**Surface level:** internal-shared

### `PlanTask`

```typescript
interface PlanTask { readonly id: string; readonly title: string; readonly summary: string; readonly size: 'S'|'M'|'L'; readonly order: number; readonly dependsOn: readonly string[]; readonly acceptanceChecks: readonly string[]; readonly derivedFrom: readonly string[]; readonly tests: readonly TaskTestRef[]; }
```

**Returns:** `PlanTask` — One atomic, ordered, sized, dependency-labelled unit of work with its own acceptance checks and provenance; the enumerate/critique/finalize steps produce a PlanTask[] for the Story.

**Preconditions:**
- id is unique within the Story and matches /^t\d+$/
- every dependsOn id references another PlanTask id in the same Story
- derivedFrom is non-empty (each Task is grounded in an LLD handoff item / citation)

**Postconditions:**
- order is a valid 1-based topological position over the dependsOn edges
- the PlanTask[] dependency graph is acyclic
- the union of derivedFrom covers the approved LLD's handoff items (design coverage)

### `readPlanUpstream`

```typescript
function readPlanUpstream(repoPath: string, epicHash: string, storyId: string): PlanUpstream
```

**Parameters:**
- `repoPath: string` — repo root
- `epicHash: string` — 16-hex Epic hash
- `storyId: string` — the Story to plan

**Returns:** `PlanUpstream` — The approved+non-stale LLD, the HLD context slice, and the define storyDependsOn edges — the only input s1 reads to enumerate Tasks.

**Errors:**
- `ArtifactNotApprovedError` when raised by the sc3 gate when the LLD is unapproved/rejected/stale (s1 never sees an unusable design)

**Preconditions:**
- the sc3 gate (requireApprovedLld) has been satisfied

**Postconditions:**
- s1 consumes only the returned PlanUpstream; it never re-reads or re-validates the design

### `finalizePlan`

```typescript
function finalizePlan(intent: WorkflowIntent, stepOutputs: Readonly<Record<string, unknown>>, runId: string, elapsedMs: number, llmResponse: Record<string, unknown>): FinalizeResult
```

**Parameters:**
- `stepOutputs: Readonly<Record<string, unknown>>` — prior step outputs incl. the enumerated/critiqued/finalized tasks
- `llmResponse: Record<string, unknown>` — the synthesized PlanArtifact body

**Returns:** `FinalizeResult` — ok with the validated PlanArtifact, or a retryable schema failure when the Task graph is cyclic, mis-ordered, has dangling dependsOn, or under-covers the design.

**Errors:**
- `schema-failure (retryable)` when PlanTask graph is not acyclic, order is not a valid topo order, a dependsOn id is unknown, or derivedFrom does not cover the LLD handoff items

**Preconditions:**
- the enumerate/critique/finalize steps have produced a PlanTask[]

**Postconditions:**
- s1's acyclic + design-coverage + storyDependsOn-consistency validation runs here, mirroring the existing finalize dependency-DAG check pattern

## Data model changes

### `PlanTask` — new

New Task-tier record introduced by sc1; carries id/title/summary/size/order/dependsOn/acceptanceChecks/derivedFrom, with tests[] filled by s4. It is the atomic element of PlanBody.tasks and the unit build consumes one at a time.

```
+ interface PlanTask { id; title; summary; size; order; dependsOn[]; acceptanceChecks[]; derivedFrom[]; tests[] }
```

**Call sites:**
- `src/workflow/orchestrator.ts (the new finalizePlan arm validates PlanTask[])`
- `src/workflow/artifacts/plan.ts (new artifact module defining PlanTask, mirroring artifacts/lld.ts)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | s1 owns and produces the PlanTask shape; the enumerate step emits PlanTask[] and finalizePlan enforces its invariants (acyclic, topo order, coverage) before the artifact is accepted. |
| `sc3` | consumes | s1 calls readPlanUpstream to obtain the approved+non-stale LLD + HLD slice + storyDependsOn; it never re-reads or re-validates the design, delegating all approval/staleness decisions to the gate. |
| `sc4` | consumes | s1 leaves each PlanTask's tests[] empty for s4 (TaskTestPlan) to populate; it does not name tests itself, keeping the test contract owned by s4. |
| `sc5` | consumes | s1's enumerate/critique/finalize logic runs as steps within the fixed PlanOrchestration step plan, and its Task-graph validation is invoked from the finalizePlan arm sc5 defines. |

## Error paths

### Error cases

- **The enumerated PlanTask[] contains a dependency cycle.** (recoverable)
  - Detection: finalizePlan runs a topological sort over the dependsOn edges and detects a back-edge (unresolved nodes remain after Kahn's algorithm).
  - Response: Return a retryable schema failure naming the cycle members; the LLM re-emits corrected tasks. No artifact is written.
  - User impact: None visible — the run retries internally; only a persistent failure surfaces to the user.
- **A PlanTask.dependsOn references a Task id that does not exist in the Story.** (recoverable)
  - Detection: finalizePlan checks every dependsOn id against the set of emitted Task ids and finds an unknown id.
  - Response: Return a retryable schema failure listing the dangling id.
  - User impact: None visible; internal retry.
- **The Tasks under-cover the approved design (a handoff item has no covering Task).** (recoverable)
  - Detection: finalizePlan diffs the union of tasks' derivedFrom against the LLD handoff item set (contractDetails/dataModelChanges/errorPaths/testStrategy) and finds an uncovered item.
  - Response: Return a retryable schema failure naming the uncovered handoff item so tasks.critique/finalize can add a Task.
  - User impact: None visible; internal retry.
- **Task ordering contradicts the define Story dependency context.** (recoverable)
  - Detection: finalizePlan checks the Task order against the storyDependsOn edges from the PlanUpstream and finds an inconsistency.
  - Response: Return a retryable schema failure.
  - User impact: None visible; internal retry.
- **The Story's LLD is unapproved, rejected, or stale when planning starts.** (recoverable)
  - Detection: readPlanUpstream/requireApprovedLld (sc3) raises ArtifactNotApprovedError before s1 enumerates anything.
  - Response: The run terminates with the gate's message; no PlanTasks are produced.
  - User impact: The user must approve or refresh (re-run/ack-stale) the design before planning.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A tiny LLD whose handoff describes a single change. | Exactly one PlanTask, order 1, empty dependsOn; passes the acyclic + coverage checks trivially. |
| A Story whose Tasks are fully parallel (no inter-Task dependencies). | All Tasks have empty dependsOn and distinct order values; any topological order is accepted as valid. |
| A new-capability-flavor LLD with no migration section. | No migration-derived Tasks; coverage is computed only over the present handoff items, and the absence of migration is not treated as under-coverage. |

### Invariants to preserve

- s1 never re-reads or re-validates the approved design; every approval/staleness decision stays behind the sc3 gate, so the enumeration always operates on an already-validated PlanUpstream. [[c2]]
- The plan's finalize Task-graph validation mirrors the existing finalizeArtifact cross-artifact-invariant pattern and must not alter or weaken the existing define/design.story dependency-DAG checks it sits beside. [[c1]]
- Task-level ordering must respect the define Story dependency graph; the plan may sub-order within the Story but must never contradict the Story's place in that graph. [[c3]]

## Test strategy

**Test framework:** `node:test (tsx --test), mirroring the existing src/workflow/**/__tests__ and src/mcp/workflow-step/__tests__ suites`

### Test levels

- **unit** — Exercise the deterministic finalizePlan validation over hand-crafted PlanTask[] fixtures without any LLM.
  - Subjects: `finalizePlan: acyclic check rejects a cyclic dependsOn graph`, `finalizePlan: rejects dangling dependsOn ids`, `finalizePlan: rejects order that is not a valid topological order`, `finalizePlan: rejects design under-coverage (a handoff item with no covering derivedFrom)`, `finalizePlan: accepts a valid single-task and a valid multi-task graph`, `PlanTask id/shape validation (t\d+ ids, non-empty derivedFrom)`
  - Fixtures: `a valid approved LLD fixture with a small handoff`, `PlanTask[] fixtures: valid, cyclic, dangling-dep, mis-ordered, under-covering`
- **integration** — Walk the plan workflow end-to-end through the MCP phase loop with canned LLM step responses (the design.story-e2e pattern).
  - Subjects: `start->plan->step(context.assemble..checklist.verify)->synthesize writes a PlanArtifact under the plan paths`, `the produced PlanArtifact.body.tasks is ordered/sized/dependency-labelled and addressable as epic-slug/story-id/task-id`, `a plan run over an unapproved/stale LLD is refused by the sc3 gate`
  - Fixtures: `seeded approved+non-stale LLD on disk`, `seeded unapproved and stale LLD variants`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: finalizePlan rejects design under-coverage`, `integration: e2e run produces a PlanArtifact whose tasks' derivedFrom covers the LLD handoff items` |
| `ac2` | `unit: PlanTask shape validation (size/order/dependsOn present)`, `integration: produced tasks each carry size, order, and dependsOn` |
| `ac3` | `unit: finalizePlan acyclic check rejects a cycle`, `unit: finalizePlan rejects order inconsistent with storyDependsOn`, `integration: e2e produced task graph is acyclic and consistent with the define Story dependency context` |
| `ac4` | `unit: PlanTask ids are Story-scoped t\d+`, `integration: the persisted artifact resolves as epic-slug/story-id/task-id via the plan storage paths` |

## Migration

**State before:** Today the workflow framework has no `plan` stage: the WorkflowName union covers stub/define/design.epic/design.story/tracker, the orchestrator's prepareDecompose/prepareSynthesize/finalizeArtifact seams have no 'plan' arm, and there is no PlanTask type or artifacts/plan.ts module [[c1]]. Task-tier work is not captured as a first-class artifact.

**State after:** The framework gains an additive 'plan' member in the WorkflowName union, a new artifacts/plan.ts defining PlanTask/PlanArtifact, and a 'plan' arm on each orchestrator seam whose finalizePlan validates the PlanTask graph. Existing workflows and their artifacts are byte-for-byte unaffected; only new code paths are added.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the new artifacts/plan.ts module (PlanTask + PlanArtifact types + renderer). Pure addition; nothing imports it yet. — ↩ rollbackable
2. Add 'plan' to the WorkflowName union and register the plan runner set via registerWorkflowRunners. Additive; the executor gains new runner keys but existing keys are untouched. — ↩ rollbackable
3. Add the 'plan' arm to prepareDecompose/prepareSynthesize/finalizeArtifact (and the MCP pathsForWorkflow) as new switch cases; do not edit existing cases. — ↩ rollbackable
4. No data backfill: existing DEF-/HLD-/LLD- artifacts are not touched. The first PlanArtifact is written only when a user runs the plan stage. — ↩ rollbackable

**Backward compat:** No existing public API changes: the orchestrator seam signatures are unchanged (only new switch branches are added), and no existing artifact schema is modified. Every existing workflow (stub/define/design.epic/design.story/tracker) must continue to behave identically; the plan additions are guarded by the new 'plan' workflow name and never execute for other workflows.

## Alternatives considered

### a1: Direct enumerate + deterministic finalize-validate — **CHOSEN**

tasks.enumerate emits fully-formed PlanTasks; tasks.critique/finalize are LLM refinement turns; finalizePlan deterministically validates the graph (acyclic + consistent + covers the design) and fails synthesize on violation.

s1's enumeration produces PlanTask[] directly in one LLM step, each Task already carrying id/title/summary/size/order/dependsOn/acceptanceChecks/derivedFrom (tests are filled by s4). tasks.critique flags missing/over-sized/misordered tasks; tasks.finalize applies fixes. All hard guarantees live in finalizePlan (deterministic): acyclic dependsOn, order is a valid topological order, every dependsOn id exists, and derivedFrom covers the LLD handoff items and is consistent with the define storyDependsOn context. A failure returns a retryable synthesize error, mirroring the existing finalizers.

### a2: Coverage-matrix-first enumeration

tasks.enumerate first builds a matrix mapping each LLD handoff item to one or more Tasks, then derives the PlanTask[] from the matrix so design coverage is structural.

The enumerate step emits an intermediate coverage matrix keyed by LLD handoff item; every handoff item must map to at least one Task before Tasks are materialised. PlanTasks inherit derivedFrom from the matrix keys; finalizePlan still runs the acyclic + consistency checks, but coverage is by construction.

**Rejected because:** Strongest structural coverage but adds an intermediate matrix schema (partial on sc1) and over-granulates small Stories; its coverage benefit is captured by folding the item->Task coverage requirement into a1's deterministic finalize check, so a1 wins without a2's added surface.

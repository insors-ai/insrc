<!-- insrc:artifact HLD-1cd9a4c34f403a80 -->

# HLD: Implement `plan` as a new fine-grained instance of the shared workflow skeleton, peer to define/design

## Framework summary

Implement `plan` as a new fine-grained instance of the shared workflow skeleton, peer to define/design.epic/design.story. A single runner module registers a fixed six-step recipe (context.assemble -> tasks.enumerate -> tasks.critique -> tasks.finalize -> test-strategy.write -> checklist.verify) whose outputs the orchestrator's three per-workflow arms turn into a persisted, cited PlanArtifact for exactly one Story. A new gate reads the Story's approved, non-stale LLD (adding requireApprovedLld by mirroring requireApprovedHld and reusing the existing effective-hash/staleness machinery), and a new storage helper writes the artifact under the as-built slug-md + hash-json convention. Nothing about the executor, state store, approval flow, or MCP phase loop changes except a single 'plan' arm added at each existing seam.

## Architecture shape

The plan workflow is a thin specialisation over the shared skeleton [[c7]]. Control flows exactly as it does for design.story: the MCP phase machine (start -> plan -> step* -> synthesize) drives runner steps registered via the executor, and the orchestrator switches on the workflow name to pick the plan-specific decomposer/synthesizer/finalizer. The gate boundary is the only genuinely new surface: `requireApprovedLld` reads the Story's LLD, refuses when it is unapproved/rejected, and recomputes its effective hash to refuse when it is stale (honoring a stale-ack), mirroring `requireApprovedHld` + the existing staleness scan [[c6]]. Upstream context for enumeration is assembled from the approved LLD's handoff block plus a slice of the HLD and the define Story dependency graph [[c4]][[c5]]. The output is a PlanArtifact whose body is an ordered, sized, dependency-labelled Task[] with per-Task acceptance checks and named tests, persisted as hash-json + slug-md with the insrc:artifact marker so it resolves and gates like every other artifact [[c1]][[c3]]. Ownership is split so each Story owns exactly one cross-cutting contract: s1 owns the Task shape, s2 owns the upstream gate/read contract, s3 owns the PlanArtifact + persistence contract, s4 owns the per-Task test contract, and s5 owns the orchestration/step-plan contract; the runners compose these left-to-right within a single run.

## Shared contracts

### sc1: PlanTask

**Owner Story:** `s1`
**Consumed by:** `s3`, `s4`, `s5`

**Purpose:** The shape of a single work unit in a Story's breakdown: ordered, sized, dependency-labelled, with its own acceptance checks and provenance. This is the atomic Task-tier record the whole Epic exists to produce.

**Interface sketch (type-level):**

```
interface PlanTask {
  readonly id: string;                 // 't1','t2',... scoped to the Story
  readonly title: string;
  readonly summary: string;
  readonly size: 'S' | 'M' | 'L';
  readonly order: number;              // 1-based position in execution order
  readonly dependsOn: readonly string[];       // other PlanTask ids in this Story
  readonly acceptanceChecks: readonly string[];// per-Task done conditions
  readonly derivedFrom: readonly string[];     // citation ids grounding this Task
  readonly tests: readonly TaskTestRef[];      // named tests (owned by s4 / sc4)
}
```

**Assumptions cited:** [[c5]]

### sc2: PlanArtifact

**Owner Story:** `s3`
**Consumed by:** `s5`

**Purpose:** The persisted, reviewable breakdown for one Story: meta (pinning the Epic, Story, and the LLD/effective-hash it was authored against), a Task list, test-strategy coverage, and citations. This is the canonical unit build consumes one Task at a time.

**Interface sketch (type-level):**

```
interface PlanMeta extends ArtifactMetaBase {
  readonly epicHash: string;
  readonly epicSlug: string;
  readonly storyId: string;
  readonly lldRunId: string;           // the LLD this plan was authored against
  readonly lldEffectiveHash: string;   // for staleness of the plan vs its LLD/HLD
  readonly approvedAt?: string;
}
interface PlanBody {
  readonly tasks: readonly PlanTask[];
  readonly testStrategyCoverage: readonly TestStrategyCoverage[]; // from sc4
}
interface PlanArtifact {
  readonly meta: PlanMeta;
  readonly body: PlanBody;
  readonly citations: readonly Citation[];
}
```

**Assumptions cited:** [[c3]]

### sc3: PlanUpstreamGate

**Owner Story:** `s2`
**Consumed by:** `s1`

**Purpose:** The read+gate boundary: obtain the Story's approved, non-stale LLD plus the cross-cutting context needed to enumerate Tasks, or refuse. Isolates every 'is the design usable?' decision behind one contract.

**Interface sketch (type-level):**

```
interface PlanUpstream {
  readonly lld: LldArtifact;                 // approved + non-stale
  readonly hldSlice: HldContextSlice;        // cross-cutting context for this Story
  readonly storyDependsOn: readonly string[];// define Story dependency edges
}
// declarations only (no bodies):
function requireApprovedLld(repoPath: string, epicHash: string, storyId: string): LldArtifact;
function readPlanUpstream(repoPath: string, epicHash: string, storyId: string): PlanUpstream;
```

**Assumptions cited:** [[c5]] [[c6]]

### sc4: TaskTestPlan

**Owner Story:** `s4`
**Consumed by:** `s1`

**Purpose:** The per-Task named tests and the mapping proving the Story design's test strategy is collectively covered by the Tasks' tests.

**Interface sketch (type-level):**

```
type TestLevel = 'unit' | 'integration' | 'live' | 'smoke';
interface TaskTestRef {
  readonly level: TestLevel;
  readonly name: string;                 // human-readable test name/subject
}
interface TestStrategyCoverage {
  readonly lldStrategyItem: string;      // an item from the LLD testStrategy
  readonly coveredByTaskIds: readonly string[];
}
```

**Assumptions cited:** [[c5]]

### sc5: PlanOrchestration

**Owner Story:** `s5`
**Consumed by:** `s1`

**Purpose:** The fixed step plan for the plan workflow and the three orchestrator arm signatures + MCP path arm that make it drivable through the standard multi-turn interface.

**Interface sketch (type-level):**

```
type PlanStepId =
  | 'context.assemble'
  | 'tasks.enumerate'
  | 'tasks.critique'
  | 'tasks.finalize'
  | 'test-strategy.write'
  | 'checklist.verify';
// orchestrator arms (declarations only, no bodies):
function planDecomposer(intent: WorkflowIntent): DecomposerPrompt;
function planSynthesizer(intent: WorkflowIntent, stepOutputs: Readonly<Record<string, unknown>>): SynthesizerPrompt;
function finalizePlan(intent: WorkflowIntent, stepOutputs: Readonly<Record<string, unknown>>, runId: string, elapsedMs: number, llmResponse: Record<string, unknown>): FinalizeResult;
```

**Assumptions cited:** [[c7]]

## Story boundaries

### Story `s1`

**Owns:** `sc1`
**Depends on:** `sc3`, `sc4`, `sc5`

Private to s1: the enumeration/critique/finalize prompts and the internal reasoning that turns the LLD handoff into candidate Tasks, plus the acyclicity + dependency-consistency validation logic over the Task graph. Nothing outside s1 sees how Tasks are derived; other Stories only consume the resulting PlanTask shape.

### Story `s2`

**Owns:** `sc3`

Private to s2: how approval is checked and how staleness is recomputed (reading meta.approvedAt, recomputing the effective hash, honoring staleAckedAt). Callers only see either a usable PlanUpstream or a typed refusal; the comparison mechanics stay inside the gate.

### Story `s3`

**Owns:** `sc2`
**Depends on:** `sc1`

Private to s3: the PlanArtifact markdown renderer, the insrc:artifact marker embedding, the atomic write + path resolution, and how the review gate reads meta.approvedAt. Other Stories consume the PlanArtifact type but not the rendering/persistence internals.

### Story `s4`

**Owns:** `sc4`
**Depends on:** `sc1`

Private to s4: how the LLD test strategy is decomposed into per-Task named tests and how the coverage mapping is computed. Consumers see only the TaskTestRef[] embedded in each Task and the TestStrategyCoverage list.

### Story `s5`

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`

Private to s5: the exact prompt/schema content of the fixed step plan and the wiring of the three orchestrator arms + the MCP pathsForWorkflow branch. Other Stories run inside this orchestration but do not see its registration/wiring details.

## Non-functional targets

- **Performance:** No new hard latency target; plan runs are LLM-bound like the other fine-grained workflows. The deterministic parts (gate read, staleness recompute, atomic persist) must stay O(size of one LLD + one Story's Tasks) and sub-second, matching design.story's gate/persist cost.
- **Security:** No new external surface: plan reads and writes only local repo files through the existing storage helpers and never calls the network or a tracker during the run; approval and tracker-push stay out-of-band exactly as for the other artifacts.
- **Observability:** Each plan run appends a per-step jsonl trace under the existing workflow-runs log keyed by Epic hash, identical to the other workflows, so a run is fully reconstructable.
- **Durability:** The PlanArtifact JSON + markdown are written atomically (write-temp-then-rename, as the existing storage layer does) so a crash mid-write never leaves a partial artifact; the canonical JSON is the source of truth and the markdown is regenerable from it.

## Rollout

### Phase A — Core breakdown + contract shapes

**Stories:** `s1`

s1 is the Epic's foundation (every other Story dependsOn s1) and owns the PlanTask shape (sc1) that s3/s4/s5 consume. It lands first, together with the type-level definitions of the contracts it composes (the upstream gate sc3, test plan sc4, orchestration sc5), so downstream Stories implement against fixed interfaces.

**Backward compat:** None — net-new workflow; no existing behaviour changes. The WorkflowName union gains 'plan' additively.

### Phase B — Gate, persistence, and test naming

**Stories:** `s2`, `s3`, `s4`

s2 (requireApprovedLld gate + staleness refusal), s3 (PlanArtifact persistence + review gate), and s4 (per-Task named tests + coverage) each dependsOn s1 in the Epic and consume the sc1 Task shape; none depends on another, so they can be built in parallel once Phase A is in.

**Backward compat:** Preserve the existing requireApprovedHld gate + scanLldStaleness semantics unchanged — the new requireApprovedLld mirrors them without altering the HLD staleness path; preserve the storage layer's atomic-write + slug-md/hash-json convention exactly.

### Phase C — Multi-turn interface wiring

**Stories:** `s5`

s5 wires the orchestrator arms + MCP pathsForWorkflow branch and dependsOn s1 and s3 (it returns the persisted PlanArtifact via synthesize); it lands last because it composes the completed enumeration (s1) and persistence (s3) into the standard start->plan->step->synthesize loop.

**Backward compat:** Preserve the MCP workflow-step phase machine + state store for all existing workflows — add only a 'plan' arm at each seam; the existing decompose/synthesize/finalize switches must keep their current behaviour for stub/define/design.epic/design.story/tracker.

**Ordering rationale:** Phases follow the Epic Story dependency graph, which is authoritative: s1 is foundational; s2/s3/s4 each dependsOn only s1; s5 dependsOn s1 and s3. Shared-contract ownership agrees with this at the artifact level (s1 owns the Task shape sc1 that s3/s4/s5 consume; s3 owns PlanArtifact sc2 that s5 consumes). Where s1's boundary lists the gate/test/orchestration contracts (sc3/sc4/sc5) as dependencies, that is a TYPE-LEVEL dependency only: those interfaces are fixed in Phase A as part of the shared HLD, and their owning Stories (s2/s4/s5) supply the implementations in later phases — so no build-order cycle exists (interfaces-first, implementations-phased). This keeps the rollout consistent with both the Epic edges and the contract graph.

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| New requireApprovedLld gate + LLD staleness | There is no requireApprovedLld today; getting the staleness recompute wrong (or ignoring staleAckedAt) would let plan run against a superseded design, violating k5. | Reuse computeHldEffectiveHash + the existing scanLldStaleness comparison verbatim rather than re-deriving staleness; add unit tests mirroring the effective-and-staleness tests (approved/unapproved/stale/stale-acked) before wiring the gate into the runner. |
| Task ordering vs define's Story dependency graph (k4) | The plan orders Tasks within one Story, but must not contradict the cross-Story ordering define established; a wrong reading could produce a Task order that conflicts with the Story's place in the Epic. | context.assemble reads the define Story dependsOn edges into the brief and finalizePlan validates the Task graph is acyclic AND consistent with the Story's dependency context, failing synthesize on violation (same pattern as design.story's dependency checks). |
| Orchestrator seam + MCP path arm regression | Adding a 'plan' arm touches the three central switches (prepareDecompose/prepareSynthesize/finalizeArtifact) and pathsForWorkflow that every workflow shares; a mistake could regress define/design/tracker. | Add the 'plan' case as a pure additive branch (no edits to existing cases) and run the full existing workflow + mcp e2e suite as a regression gate, plus a new plan-e2e test that walks start->...->synthesize. |

## Alternatives considered

### a1: Faithful fine-grained skeleton instance (mirror design.story) — **CHOSEN**

plan is a new fine-grained workflow instance: a runner module with a fixed multi-step recipe, arms on the three orchestrator seams, its own PlanArtifact + gate + storage helper, wired into MCP exactly like design.story.

Add `plan` to the WorkflowName union and implement it as a peer of define/design.epic/design.story. A new runner module registers a fixed sequence of llm-pause runners via executor.registerRunner, aggregated by registerWorkflowRunners; the orchestrator gains one arm each on prepareDecompose, prepareSynthesize, and finalizeArtifact, switching on 'plan'. A new artifact type (PlanArtifact/PlanBody with a Task[]) + renderer mirrors the LLD artifact; a new storage helper (planArtifactPaths) gives the slug-md + hash-json pair with the insrc:artifact marker; and a new gate (requireApprovedLld) is added by mirroring requireApprovedHld and reusing computeHldEffectiveHash + scanLldStaleness. The recipe follows the meta-doc's fine-grained steps; MCP needs only its pathsForWorkflow arm extended.

**Pros:**
- Satisfies k7 verbatim (an instance of the shared skeleton) and k6 (reuses the slug-md + hash-json + insrc:artifact convention).
- Every extension point is a known, tested seam, so the blast radius is one new module plus one arm per seam.
- The fine-grained recipe yields self-critique (tasks.critique) and a forced checklist, matching k8 and the meta doc's recorded decision.
- Reuses computeHldEffectiveHash + scanLldStaleness, so LLD staleness semantics stay identical across the chain.

**Cons:**
- Largest surface of the three: a full runner module + schemas + artifact type + renderer + gate + storage helper + MCP arm + e2e tests.
- Introduces the first requireApprovedLld gate (net-new, though it mirrors requireApprovedHld closely).

**Cost estimate:** L

### a2: Coarse-handoff plan (three steps, like build/tracker)

Model plan on the coarse-handoff pattern: context.assemble (deterministic) -> execute (one big LLM turn emits the whole task list) -> checklist.verify.

Instead of a fine-grained recipe, plan registers three runners mirroring the tracker/build shape: a deterministic context.assemble, a single execute LLM turn that emits the entire Task list at once, and a forced checklist.verify. The artifact, gate, and storage pieces are the same as a1, but there is no tasks.critique/tasks.finalize/test-strategy.write decomposition.

**Pros:**
- Smallest step surface (three runners), so less schema and per-step prompt code than a1.
- Reuses the coarse-handoff shape already proven by the tracker workflows.

**Cons:**
- Contradicts the recorded decision that plan is fine-grained and only build is coarse (meta §3.10).
- A single execute turn loses the tasks.critique self-check, weakening k3/k4 ordering + sizing guarantees.
- Harder to ground each Task to its input at fine granularity (k8).

**Cost estimate:** M

**Rejected because:** Outright violates k7 (the fine-grained decision) and weakens k3/k4/k8; the smaller footprint does not offset contradicting the documented design and the Epic's ordering/sizing guarantees.

### a3: Third design sub-mode (design.plan under the design family)

Implement plan as a third mode of the design workflow (alongside design.epic/design.story), reusing the design runner scaffolding and gate wiring directly.

Add a design.plan mode so the Task breakdown is produced by the same design family that already reads approved Epics/HLDs/LLDs. The design decomposer/synthesizer/finalize arms branch on the sub-mode, and the existing design gate code is extended in place to also gate on an approved LLD.

**Pros:**
- Maximal reuse of the design runner scaffolding since plan sits adjacent to design.story.
- Avoids adding a new top-level WorkflowName value.

**Cons:**
- Miscategorises the chain: the meta doc models plan as its own workflow row with a different consumer (build) and artifact tier (Task, not Design), blurring the Epic/Story/Task hierarchy (k1).
- Couples plan's lifecycle to the design workflow's gates and synthesizer, raising regression risk.
- Breaks the 1:1 stage mapping the docs and tracker conventions assume, complicating status/chain reporting.

**Cost estimate:** M

**Rejected because:** Partially undermines k1 (tier blur) and k7 (workflow-identity coupling), and breaks the 1:1 stage mapping the tracker/chain reporting assumes; a1 keeps Tasks in a clean own tier with a clean workflow identity.

## Open questions

- Item sc2: the shared-contract graph lists s1 as the consumer of sc3/sc4/sc5 (the gate, test plan, and orchestration contracts), which inverts the Epic's dependency edges (the Epic has s2/s4/s5 dependsOn s1, not the reverse). The rollout resolves this as an interfaces-first / type-level dependency (interfaces fixed in Phase A, implementations phased later), but the reviewer should confirm that resolution OR ask for the ownership to be re-modelled at implementation time — e.g. s1 owns the upstream-read + Task shapes and s2/s4/s5 consume them — so the contract graph reads acyclically without the interfaces-first caveat.

## Citations

- **[[c1]]** `analyze-bundle` `s1 how-does-it-work: src/workflow framework seams` — "Per-workflow branching is centralised in orchestrator.ts (prepareDecompose/prepareSynthesize/finalizeArtifact switch on workflow); runner modules register via executor.registerRunner, aggregated by re"
- **[[c3]]** `doc` `plans/workflow-define.md#as-built-deltas` — "AS-BUILT: canonical JSON named by 16-char Epic hash under .insrc/artifacts/, human markdown named by slug under docs/ with an insrc:artifact marker; workflows run via the insrc_workflow_step MCP tool."
- **[[c4]]** `doc` `plans/meta-workflow-framework.md#design` — "Plan reads BOTH the HLD (cross-cutting) AND the specific Story's LLD; Task-level ordering respects the Story dependency graph from define."
- **[[c5]]** `analyze-bundle` `s1 how-does-it-work: LLD artifact shape + handoff + gate + staleness` — "LldBody/LldArtifact (lld.ts) carry the handoff block (contractDetails/dataModelChanges/errorPaths/testStrategy/migration); lldArtifactPaths (storage.ts) gives slug-md + hash-json; gates.ts has require"
- **[[c6]]** `analyze-bundle` `s1 how-does-it-work: LLD staleness mechanism` — "LLD staleness is recomputed: scanLldStaleness (amendments/staleness.ts) compares meta.hldEffectiveHash to current computeHldEffectiveHash (lld.ts:167), emitting staleReason; ackStaleArtifact writes me"
- **[[c7]]** `doc` `plans/meta-workflow-framework.md#1-motivation` — "If we build that skeleton once as workflow/, each of the five becomes a small specialisation (recipe library, step-runner registry, artifact shape) rather than a bespoke pipeline."

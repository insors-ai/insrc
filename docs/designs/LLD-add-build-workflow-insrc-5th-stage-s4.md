<!-- insrc:artifact LLD-185807ba9a6b35d3-s4 -->

# LLD: s4

**Epic:** `add-build-workflow-insrc-5th-stage`
**HLD base run:** `wf-1784289418318-fl5y3m`
**HLD effective hash:** `6d130af6ef10...`
**Tracker:** [insors-ai/insrc#5](https://github.com/insors-ai/insrc/issues/5)

## HLD context

**Framework:** Chosen framework: **a2 — a registered `build` stage that delegates each Task's editing work to a CliProvider subprocess, while the daemon keeps sequencing and verification on its own side.** The stage is added exactly where the sibling stages live: a `src/workflow/runners/build/` subdir (index.ts + schemas.ts, one exported `registerBuildRunners(): void`, no classes, no base class — mirroring the confirmed design-story shape) plus a `src/workflow/artifacts/build.ts` artifact definition, reusing the parent module's `hash.ts` / `slug.ts` writers and `gates.ts` rather than adding skeleton machinery. The `insrc_workflow_step` surface gains a `build` phase handler mirroring `phases/plan.ts`, so the developer-facing turn shape (start → decompose → synthesize → finalize) is unchanged.

Why a2 over the field: it is the only alternative with no partial or unknown across all nine constraints. It removes the k9 dependency instead of absorbing it — the multi-turn edit/test/repair loop does **not** live inside the synthesize seam that is proven only for one-JSON-document-per-turn; it lives behind a one-Task-at-a-time subprocess boundary, so `executor.ts`/`orchestrator.ts` are asked only to do what they already demonstrably do (host a stage, run a gate, finalize an artifact). It keeps k2 enforcement daemon-side: the daemon decides advancement from a test run and a tree diff it performs itself, so a non-cooperating implementer cannot advance the run — unlike the advisory-order failure the Epic's problem statement names. And k8 is satisfied by construction rather than by special pleading: CliProvider is CLAUDE.md's sanctioned cloud path and one-subprocess-at-a-time is serial by definition.

Two items are carried into design as unproven, not settled. (1) **CliProvider's structured-output path is built for JSON returns, not for supervising a long free-form editing session** — that usage is unverified and may require provider-level work; the design must inspect `src/agent/providers/cli-provider.ts` directly, since no analyze bundle touched it (k8 is carried verbatim from CLAUDE.md). (2) Per the coverage-gap bundle, `gates.ts`, `hash.ts` and `slug.ts` are cited at **module level only** — no exploration located an entity in them by name — so k1's gate shape and k3's writer contract are unread APIs that must be read directly, alongside k9's required reading of `executor.ts` and `orchestrator.ts`. The scope phase's "clear match" verdict on `src/workflow` answers "does the skeleton exist?" (yes) and is not license to assume those files fit a code-editing workload.
**Rollout phase:** Phase D — halt semantics + run progress
**Owns:** `sc6` (BuildRunProgress)
**Consumes:** `sc1` (BuildStageRegistration), `sc2` (WorkflowStepInputBuild), `sc4` (BuildTaskOutcome), `sc5` (TaskImplementerAdapter)

## Contract details

**Surface level:** internal-shared

### `BuildRunProgress`

```typescript
interface BuildRunProgress { readonly storyId: string; readonly runState: BuildRunState; readonly totalTasks: number; readonly completedTaskIds: readonly string[]; readonly inFlightTaskId?: string | undefined; readonly halt?: BuildHaltInfo | undefined; readonly filesTouchedSoFar: readonly string[] }
```

**Parameters:**
- `storyId: string` — The Story whose approved plan is being implemented.
- `runState: BuildRunState` — 'running' | 'halted' | 'complete'; 'halted' iff some outcome row has status 'failed'.
- `totalTasks: number` — Count of PlanTasks in the approved plan graph.
- `completedTaskIds: readonly string[]` — Task ids whose outcome status is 'completed'.
- `inFlightTaskId: string` _(optional)_ — The single Task currently being implemented, re-derived from the one 'running' slot in the outcome array; concurrency is structurally impossible.
- `halt: BuildHaltInfo` _(optional)_ — Present iff runState==='halted'.
- `filesTouchedSoFar: readonly string[]` — Union of filesTouched across completed outcome rows.

**Returns:** `BuildRunProgress` — A read-time projection over the accumulated BuildTaskOutcome[] (sc4) plus the approved PlanArtifact graph. Not a separately stored record — no field is writable independently of the outcome array, so progress can never skew from the persisted outcomes (winning alt a1).

**Preconditions:**
- The run's accumulated BuildTaskOutcome[] (sc4) is available (persisted incrementally at each Task boundary via storage.ts/hash.ts/slug.ts).
- The approved PlanArtifact DEPENDS_ON graph is loaded so blocked/not-reached membership can be derived.

**Postconditions:**
- runState==='halted' iff at least one outcome has status==='failed'; 'complete' iff every Task has a terminal status and none failed.
- inFlightTaskId is the single 'running' slot or undefined — never more than one.
- filesTouchedSoFar equals the union of filesTouched across all 'completed' outcomes.
- Computed on demand per read; recompute cannot disagree with the sc4 rows or the live plan graph.

### `BuildHaltInfo`

```typescript
interface BuildHaltInfo { readonly failedTaskId: string; readonly failedTaskTitle: string; readonly reason: string; readonly blockedTaskIds: readonly string[] }
```

**Parameters:**
- `failedTaskId: string` — PlanTask id of the Task whose stated tests could not be brought to passing.
- `failedTaskTitle: string` — Human-facing title of the failed Task, so inspection names it without a tree read (ac2).
- `reason: string` — Why the run gave up on the Task — the daemon's own test verdict summary, not a bare non-zero exit.
- `blockedTaskIds: readonly string[]` — Transitive DEPENDS_ON dependents of the failed Task, recomputed against the live plan graph so it can never go stale.

**Returns:** `BuildHaltInfo` — The halt frame a developer inspects after a run stops — which Task failed, why, and which Tasks were blocked as a consequence — computed on demand from the outcome array plus the plan graph.

**Preconditions:**
- runState==='halted' — exactly one outcome has status==='failed'.
- The approved PlanArtifact graph is loaded to walk the failed Task's transitive dependents.

**Postconditions:**
- blockedTaskIds is the transitive DEPENDS_ON closure of failedTaskId, always consistent with the plan graph (recomputed, never snapshotted).
- No Task in blockedTaskIds was started; each carries outcome status 'blocked' or 'not-reached'.

## Data model changes

### `BuildRunProgress` — new

Owned by s4 (sc6). Realized as a PURE PROJECTION of the sc4 BuildTaskOutcome[] plus the approved plan graph per winning alt a1 — never a second writeable record, so no progress-vs-outcome skew is structurally possible. inFlightTaskId is re-derived from the single 'running' slot rather than stored, so it survives a daemon restart. Lives in the new src/workflow/runners/build/schemas.ts alongside sc4/sc6 (search.text confirmed no existing halt/status vocabulary in the package to reconcile against).

```
+ interface BuildRunProgress { storyId; runState: BuildRunState; totalTasks; completedTaskIds[]; inFlightTaskId?; halt?: BuildHaltInfo; filesTouchedSoFar[] }
```

**Call sites:**
- `src/workflow/runners/build/schemas.ts`
- `src/workflow/orchestrator.ts`
- `src/workflow/chain.ts`

### `BuildHaltInfo` — new

Owned by s4 (part of sc6). Computed on demand at inspection time from the outcome array and the live plan graph; blockedTaskIds is recomputed (not snapshotted) so it cannot go stale relative to the plan. The halt-detection and blocked-vs-not-reached distinction is private to s4 (boundary.internal); only the resulting frame is shared.

```
+ interface BuildHaltInfo { failedTaskId; failedTaskTitle; reason; blockedTaskIds[] }
```

**Call sites:**
- `src/workflow/runners/build/schemas.ts`
- `src/workflow/gates.ts`
- `src/workflow/orchestrator.ts`

### `BuildRunState` — new

Owned by s4 (part of sc6). New string union 'running' | 'halted' | 'complete' — the run-level terminal-state discriminant. types.ts carries no existing run-state discriminant to reuse (search.text), so the union is introduced in the build subdir per the sibling-per-stage idiom. Derived from the presence/absence of a 'failed' outcome and whether every Task has reached a terminal status.

```
+ type BuildRunState = 'running' | 'halted' | 'complete'
```

**Call sites:**
- `src/workflow/runners/build/schemas.ts`
- `src/workflow/orchestrator.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc6` | implements | s4 owns BuildRunProgress (HLD ownedByStory: s4). Realized exactly as winning alt a1 prescribes: a pure read-time projection of the accumulated sc4 outcome array plus the live plan graph, with runState/completedTaskIds/inFlightTaskId/halt/filesTouchedSoFar all computable and never separately stored. Consumed by s5, which wraps this run-level frame in its BuildArtifact. |
| `sc4` | consumes | Reads the BuildTaskOutcome[] (owned by s3) as the SINGLE authoritative state. Every BuildRunProgress and BuildHaltInfo field is folded from these rows — status drives runState and completed/blocked/not-reached membership, filesTouched drives filesTouchedSoFar. No parallel record, so no dual-write skew (a1). See amendment proposal: sc4's BuildTaskStatus needs a 'running' member so the single in-flight Task is representable in the array a1 projects from. |
| `sc1` | consumes | s4's halt/progress logic lives inside the registered build stage (owned by s1). The halt gate reuses the existing gates.ts machinery and the finalize routing runs inside the build runner registered via registerBuildRunners() — no new stage, no new gate type, mirroring the sibling registration idiom (registerWorkflowRunners at src/workflow/index.ts). |
| `sc2` | consumes | s4 populates the driving-surface output WorkflowStepOutputBuild (owned by s1): it sets next to 'done' on a halted-or-complete finalize and fills progress?: BuildRunProgress so the developer inspects the halt frame through the same insrc_workflow_step turn shape as every earlier stage — no bespoke IPC or UI. |
| `sc5` | consumes | s4 halts on the outcome the daemon produces AFTER the TaskImplementerAdapter subprocess (owned by s3) returns. The adapter's self-report is advisory and never advances the run; s4's give-up decision (ac1) is taken on the daemon's own test verdict + tree diff, and marking dependents blocked/not-reached is s4-private. The quarantine seam is untouched by the derived-progress choice. |

## Error paths

### Error cases

- **The accumulated BuildTaskOutcome[] contains more than one row with status 'failed' — impossible under the halt-on-first-failure guarantee, so the array was corrupted or written by a buggy upstream drive loop.** (terminal)
  - Detection: When folding the outcome array to derive runState and BuildHaltInfo, the projection counts status==='failed' rows and finds the count is greater than one.
  - Response: Throw a projection-invariant error naming the offending taskIds rather than fabricating a BuildHaltInfo that arbitrarily picks one failed Task; the halt frame is never emitted from an ambiguous set.
  - User impact: Inspection surfaces a hard 'run state inconsistent' error instead of a misleading halt frame that names an arbitrary Task as the failure.
- **The 'failed' outcome row's taskId does not resolve to any node in the loaded approved PlanArtifact DEPENDS_ON graph — the plan was edited/re-approved while a stale outcome array from a prior run is still on disk.** (terminal)
  - Detection: BuildHaltInfo computation looks up failedTaskId in the live plan graph to walk its transitive dependents and the node lookup returns undefined.
  - Response: Throw a plan/outcome-drift error; blockedTaskIds cannot be recomputed against a graph that no longer contains the failed Task, so no halt frame with a guessed or empty blocked set is produced.
  - User impact: The developer is told the run's recorded outcomes are out of sync with the current plan, instead of silently receiving blockedTaskIds=[] as if nothing was blocked.
- **A non-failed outcome row (completed/blocked/not-reached) carries a taskId that is absent from the live plan graph — same plan-vs-outcome drift, seen while computing totals and membership sets rather than the halt frame.** (terminal)
  - Detection: While folding rows into completedTaskIds and the blocked/not-reached membership sets, a row's taskId fails to resolve against the loaded plan graph's node set.
  - Response: Throw the same plan/outcome-drift error; the projection refuses to report a totalTasks / completedTaskIds pairing it cannot reconcile against the current plan graph.
  - User impact: No skewed progress (e.g. completedTaskIds naming a Task that no longer exists in the plan) is ever shown; the drift is reported explicitly.
- **The incrementally-checkpointed BuildTaskOutcome[] is missing or cannot be decoded at read time — an interrupted per-Task-boundary write or a corrupt storage envelope.** (recoverable)
  - Detection: The projection's precondition load through storage.ts/hash.ts/slug.ts throws on decode, or returns no outcome array for the run's storyId.
  - Response: Surface a load error naming the storyId/run; BuildRunProgress is not manufactured as an empty { runState:'complete', totalTasks:0 } projection from absent data.
  - User impact: The developer sees 'run state unreadable' rather than a false 'complete' or zero-task 'running' state; the last durably-checkpointed Task boundary is the recovery point for a resumed/re-run.
- **A persisted outcome row carries a status string outside the BuildTaskStatus union ('running'|'completed'|'failed'|'blocked'|'not-reached') — e.g. a row written by a newer or older schema version.** (terminal)
  - Detection: The status-fold switch that maps each row into runState / membership sets hits its default (unmatched) branch on that row.
  - Response: Throw a schema-version error rather than treating the unknown status as non-terminal, which would wrongly leave runState pinned at 'running' forever.
  - User impact: The developer gets a clear schema-mismatch signal instead of a run that appears perpetually in-flight and never finalizes.

### Edge cases

| Input | Expected |
| :--- | :--- |
| Every PlanTask reaches outcome status 'completed' and no row is 'failed'. | runState==='complete', halt===undefined, inFlightTaskId===undefined, completedTaskIds equals every Task id, and filesTouchedSoFar equals the deduped union of every completed row's filesTouched. |
| A run halts on a failed Task that has no DEPENDS_ON dependents. | runState==='halted' and BuildHaltInfo is present with blockedTaskIds===[] — an empty blocked set is valid; the halt is still fully reported (which Task failed + reason). |
| The approved plan is empty (totalTasks===0). | runState==='complete' vacuously, completedTaskIds===[], filesTouchedSoFar===[], inFlightTaskId===undefined, halt===undefined. |
| The failed Task is the plan root and every other Task is its transitive dependent. | blockedTaskIds equals every other Task id, completedTaskIds===[], none of the dependents was started (each row is 'blocked' or 'not-reached'), and runState==='halted'. |
| Two 'completed' Tasks each report an overlapping file path in filesTouched. | filesTouchedSoFar contains that path exactly once — the projection takes the set union, not a concatenation. |
| A Task completes having edited nothing (outcome.filesTouched===[]). | The Task appears in completedTaskIds but contributes nothing to filesTouchedSoFar; a completed row with no files is legal, not treated as a failure. |
| A run is mid-flight: exactly one outcome row is 'running', the rest 'completed' or not yet present. | runState==='running', inFlightTaskId equals that single 'running' task id, halt===undefined — the in-flight Task is re-derived from the one 'running' slot and survives a daemon restart. |
| BuildRunProgress is read twice for the same run with no intervening outcome write. | Both reads return an identical projection — the computation is a pure fold over the sc4 rows plus the plan graph with no time- or random-derived field, so a recompute can never disagree with itself or with the persisted outcomes. |

### Invariants to preserve

- The build stage registers through the single existing registry seam — a plain registration function (registerBuildRunners) wired via registerWorkflowRunners, no base class, mirroring registerDesignEpicRunners and llmPauseRunner. s4's halt/progress logic must not introduce a new registry mechanism or a parallel runner-registration path. [[c1]]
- A halted run finalizes into a record carried by ChainReport via the existing artifact-writer path (storage.ts + hash.ts + slug.ts) — the same persistence envelope the sibling stages use. ac3's 'record of what happened' must reuse that substrate rather than introducing a second, parallel result store. [[c2]]
- The halt gate reuses the existing gates.ts checkpoint/gate machinery and inserts into the orchestrator.ts per-Task drive loop; s4 adds no new gate type. The exact insertion point (mark not-completed + block dependents) is confirmed by reading orchestrator.ts/gates.ts directly, not by assuming the current loop already halts. [[c3]]
- No existing halt/blocked/status vocabulary lives in the workflow package and types.ts carries no run-state discriminant to reuse; BuildRunState and BuildTaskStatus are introduced fresh in src/workflow/runners/build/schemas.ts per the sibling-per-stage idiom, without duplicating or shadowing an established enum. [[c4]]
- The halt-and-report tests extend the src/workflow/__tests__ patterns (executor.test.ts runner-registration/drive path, plan-artifact.test.ts task fixture) and the src/mcp/workflow-step/__tests__ driving-surface mirror; the src/analyze/** mkTask fixtures are the analyze executor's and are out of scope — they must not be reused for the build-stage tests. [[c5]]

## Test strategy

**Test framework:** `node:test (Node.js built-in test runner, run via `tsx --test 'src/**/__tests__/*.test.ts'`) — the framework test.locate reported for the existing src/workflow/__tests__ and src/mcp/workflow-step/__tests__ suites (executor.test.ts, plan-artifact.test.ts, tracker-tasks.test.ts, workflow-rpc.test.ts).`

### Test levels

- **unit** — Prove BuildRunProgress/BuildHaltInfo are a correct pure read-time fold over the accumulated BuildTaskOutcome[] (sc4) plus the live approved-plan DEPENDS_ON graph (winning alt a1): runState/completedTaskIds/inFlightTaskId/halt/filesTouchedSoFar are all derivable, deterministic, and never disagree with the persisted rows. Covers the s5 error paths (multi-'failed', plan/outcome drift, undecodable outcomes, unknown status) as thrown invariants rather than fabricated frames, and every s5 edge case (all-completed, no-dependents halt, empty plan, root failure, overlapping/empty filesTouched, mid-flight single 'running' slot, idempotent recompute).
  - Subjects: `src/workflow/runners/build/schemas.ts — BuildRunProgress, BuildHaltInfo, BuildRunState (and the consumed BuildTaskStatus incl. the additive 'running' member)`, `The BuildRunProgress projection function that folds BuildTaskOutcome[] + PlanArtifact graph into the run-level frame (src/workflow/runners/build/)`
  - Fixtures: `In-memory approved PlanArtifact DEPENDS_ON graph fixtures (root-only, linear chain, diamond, disjoint) built with the src/workflow __tests__ task-shaped fixture idiom (plan-artifact.test.ts:38) — NOT the src/analyze/** mkTask helpers, which are out of scope`, `Hand-authored BuildTaskOutcome[] arrays covering each status ('running'|'completed'|'failed'|'blocked'|'not-reached'), overlapping/empty filesTouched, and the corrupt shapes from s5 (two 'failed' rows, a row whose taskId is absent from the graph, an out-of-union status string)`, `A malformed / undecodable persisted-outcome envelope to drive the storage.ts/hash.ts/slug.ts load-failure path`
- **integration** — Prove the halt-and-report behavior end-to-end through the registered build runner and the orchestrator per-Task drive loop + gates.ts checkpoint machinery: giving up on an unrepairable Task marks it not-completed and starts no dependent (ac1), and the halted run still finalizes into a ChainReport record via the existing storage.ts/hash.ts/slug.ts artifact-writer envelope (ac3). Extends the executor.test.ts runner-registration/drive path; asserts no new registry mechanism or parallel result store is introduced.
  - Subjects: `registerBuildRunners wired via registerWorkflowRunners (src/workflow/index.ts, src/workflow/executor.ts)`, `The per-Task drive loop halt insertion point (src/workflow/orchestrator.ts + src/workflow/gates.ts)`, `Halted-run finalize into ChainReport (src/workflow/chain.ts + src/workflow/storage.ts)`
  - Fixtures: `A stub TaskImplementerAdapter (sc5) whose test verdict is driven to 'failed' for a chosen Task and 'passing' for others, so the daemon's own give-up decision (not the adapter self-report) is exercised`, `A multi-Task approved plan graph with dependents of the failing Task`, `A temp storage dir so the incremental per-Task-boundary checkpoint + finalized ChainReport are read back and asserted (extends the executor.test.ts / llmRunner drive-path pattern at executor.test.ts:49)`
- **integration** — Prove the inspection surface (ac2): after a halted run the developer, through the same insrc_workflow_step turn shape, receives WorkflowStepOutputBuild with next==='done' and progress?: BuildRunProgress carrying the halt frame — failedTaskId/failedTaskTitle/reason and filesTouchedSoFar — so the failed Task and what earlier Tasks left in place are named without reconstructing them from the working tree, via no bespoke IPC.
  - Subjects: `WorkflowStepOutputBuild population in the build runner (sc2, owned by s1) surfaced through the driving-surface mirror`, `src/mcp/workflow-step/__tests__ (driving-surface exercise; mirrors tracker-tasks-coarse.test.ts) and src/daemon/__tests__/workflow-rpc.test.ts (IPC-level shape)`
  - Fixtures: `A halted-run outcome array + plan graph fixture reused from the integration halt scenario`, `A driving-surface harness asserting the emitted step output's next==='done' and progress halt frame + filesTouchedSoFar, following the src/mcp/workflow-step/__tests__ pattern`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: drive loop gives up on an unrepairable Task, records it as not-completed, and starts no dependent Task`, `unit: BuildHaltInfo.blockedTaskIds equals the transitive DEPENDS_ON closure of the failed Task, recomputed against the live plan graph`, `unit: every dependent of the failed Task carries outcome status 'blocked' or 'not-reached' and none is 'completed' or started`, `unit(edge): failed plan-root blocks every other Task; completedTaskIds===[] and runState==='halted'`, `unit(edge): a failed Task with no DEPENDS_ON dependents yields blockedTaskIds===[] and is still fully reported` |
| `ac2` | `unit: BuildHaltInfo names failedTaskId, failedTaskTitle and reason (daemon test-verdict summary, not a bare exit code) from the single 'failed' outcome row`, `unit: BuildRunProgress.filesTouchedSoFar is the deduped set-union of completed rows' filesTouched`, `unit(edge): overlapping filesTouched across two completed rows appears exactly once; a completed row with empty filesTouched contributes nothing and is not a failure`, `unit(edge): mid-flight run derives inFlightTaskId from the single 'running' slot; halt===undefined`, `integration(driving-surface): halted WorkflowStepOutputBuild.progress carries the halt frame + filesTouchedSoFar so inspection names the failed Task and prior work without a working-tree read` |
| `ac3` | `integration: a run with several completed Tasks and one failed still finalizes into a ChainReport record via the storage.ts/hash.ts/slug.ts artifact-writer envelope, not an untracked side-effect`, `unit: runState==='halted' iff exactly one outcome has status==='failed'; 'complete' iff every Task has a terminal status and none failed`, `unit(edge): all-completed run finalizes as runState==='complete' with halt===undefined; empty plan (totalTasks===0) finalizes 'complete' vacuously`, `integration(driving-surface): the halted-or-complete finalize sets next==='done' on the driving-surface output`, `unit(error): projection throws (never fabricates a record) on multiple 'failed' rows, plan/outcome drift, an undecodable outcome envelope, or an out-of-union status string` |

## Migration

**State before:** Per the s1 analyze bundles, the workflow package today has no `build` stage and no halt-and-report seam. symbol.locate confirms `registerWorkflowRunners(): void` (src/workflow/index.ts:23-32) is the only public registry entrypoint, mirrored by registerDesignEpicRunners and llmPauseRunner — there is no build runner registered. search.text found NO existing halt/status vocabulary anywhere in the package (chain.ts/executor.ts/gates.ts/orchestrator.ts/types.ts/...), so BuildRunState, BuildRunProgress, and BuildHaltInfo have no prior signature to reconcile against; symbol.locate resolves none of s4's owned/consumed contract types to an indexed entity — they are net-new. The run-result carrier that exists today is ChainReport (chain.ts, data-model.trace), and incremental per-Task persistence lives in storage.ts/hash.ts/slug.ts. Critically, the halt-vs-press-on branch body of the per-Task drive loop was NOT read by the graph exploration (usage.example reported this limitation): whether orchestrator.ts (71 KB) today halts or presses on when a Task's tests fail cannot be asserted from the bundles and must be confirmed by opening orchestrator.ts and gates.ts directly. sc4's BuildTaskStatus as inherited has members 'completed'|'failed'|'blocked'|'not-reached' with no in-flight ('running') value.

**State after:** The build stage owns a halt-and-report seam. When a run gives up on a Task whose stated tests cannot be brought to passing (ac1), that Task is recorded not-completed and no transitive DEPENDS_ON dependent is started; the run finalizes into a ChainReport-carried record even with one failure (ac3), and a developer inspecting the run is told which Task failed, why, and what the completed Tasks left in place — without reading the working tree (ac2). BuildRunState ('running'|'halted'|'complete'), BuildHaltInfo, and BuildRunProgress are defined in the new src/workflow/runners/build/schemas.ts. BuildRunProgress is a pure read-time projection over the accumulated sc4 BuildTaskOutcome[] plus the live approved-plan graph — never a second writeable record — with inFlightTaskId re-derived from the single 'running' outcome slot, so progress can never skew from persisted outcomes and survives a daemon restart. sc4's BuildTaskStatus gains an additive 'running' member so the in-flight Task is representable in the authoritative array. The halt gate reuses existing gates.ts machinery and the build runner is registered via registerBuildRunners() through the same registerWorkflowRunners seam; WorkflowStepOutputBuild carries progress?: BuildRunProgress so inspection flows through the standard insrc_workflow_step turn shape.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Create the new src/workflow/runners/build/schemas.ts and add the run-level terminal-state discriminant: a new string union BuildRunState with members 'running' | 'halted' | 'complete'. Net-new type, nothing consumes it yet. — ↩ rollbackable
2. Add the BuildHaltInfo interface (failedTaskId, failedTaskTitle, reason, blockedTaskIds) to the same build/schemas.ts as a net-new value object. No existing type is modified. — ↩ rollbackable
3. Add the BuildRunProgress interface (storyId, runState, totalTasks, completedTaskIds, optional inFlightTaskId, optional halt, filesTouchedSoFar) to build/schemas.ts as a net-new projection type. Declared as a read-time view, not a stored record. — ↩ rollbackable
4. Amend sc4's BuildTaskStatus union to add the 'running' member (from 'completed'|'failed'|'blocked'|'not-reached' to 'running'|'completed'|'failed'|'blocked'|'not-reached'). Additive value only; ownership stays with s3. Existing outcome rows and consumers use no 'running' value, so none are invalidated. — ↩ rollbackable _(needs: `sc4-amendment-accepted`)_
5. Open orchestrator.ts (71 KB) and gates.ts (18 KB) directly to confirm the actual halt-vs-press-on branch (unread by the s1 graph exploration), then fix the halt insertion point in the per-Task drive loop: on a daemon test-verdict failure for a Task, mark that Task's outcome status 'failed' and derive its transitive DEPENDS_ON dependents as 'blocked'/'not-reached' so none are started. This behaviour is reached only via the not-yet-registered build runner, so the drive-loop change is inert until step 8. — ↩ rollbackable
6. Route finalize-on-halt through the existing ChainReport carrier (chain.ts) so a run with one failed Task still produces a result record rather than an untracked side-effect (ac3), persisted at the Task boundary via the existing storage.ts/hash.ts/slug.ts envelope. Reuses the existing persistence substrate; no new store. — ↩ rollbackable
7. Implement BuildRunProgress and BuildHaltInfo as on-demand projections folded from the accumulated sc4 outcome array plus the live plan graph (runState from presence of a 'failed' row; inFlightTaskId from the single 'running' slot; blockedTaskIds recomputed, never snapshotted). Populate WorkflowStepOutputBuild.progress with this projection. No separately stored progress record is introduced. — ↩ rollbackable
8. Register the build runner via registerBuildRunners() through the existing registerWorkflowRunners seam (src/workflow/index.ts), mirroring registerDesignEpicRunners/llmPauseRunner. This is the flip that makes the halt seam live. Rolling back = unregister, which fully reverts to the prior no-build-stage behaviour. — ↩ rollbackable

**Backward compat:** All of s4's owned types (BuildRunState, BuildHaltInfo, BuildRunProgress) are net-new (surfaceLevel internal-shared; symbol.locate resolved none to an existing entity), so they reconcile against no prior signature and break no existing caller. The one change touching an already-declared contract is the sc4 BuildTaskStatus amendment, which is strictly additive (adds 'running'); existing BuildTaskOutcome rows and every consumer remain valid because none produced or matched a 'running' value before, and exhaustive switches over the old members continue to compile with a default/unhandled path. WorkflowStepOutputBuild gains only an optional progress?: BuildRunProgress field, which older readers can ignore. BuildRunProgress being a pure projection over the sc4 array (never a second writeable record) means no consumer that reads outcomes can observe a skewed or newly-required field. No public API signature is removed or narrowed.

## Alternatives considered

### a1: Derived read-model over the outcome list — **CHOSEN**

Persist only BuildTaskOutcome[]; compute BuildRunProgress + BuildHaltInfo on demand as a pure projection.

Persist only the accumulating BuildTaskOutcome[] (sc4) as the run's authoritative state, appended/updated at each Task boundary through the parent module's hash.ts / slug.ts / storage.ts envelope. BuildRunProgress (sc6) and its nested BuildHaltInfo are never stored — they are computed on demand from that array plus the approved plan's PlanTask dependency graph: runState from the presence of a 'failed' outcome, completedTaskIds / filesTouchedSoFar by folding the array, inFlightTaskId from the single 'running' slot, and BuildHaltInfo.blockedTaskIds as the transitive DEPENDS_ON closure of the failed Task computed at read time. Finalize seals the same array into the BuildArtifact — no parallel result substrate, matching the ChainReport-carrier idiom in chain.ts.

### a2: Materialized progress record persisted beside the outcomes

Persist BuildRunProgress as a stateful record updated every Task boundary; freeze BuildHaltInfo at halt.

Treat BuildRunProgress as a first-class stateful record persisted incrementally at every Task boundary: task-start stamps inFlightTaskId, advance appends to completedTaskIds / filesTouchedSoFar, and halt sets runState='halted' and freezes a BuildHaltInfo whose blockedTaskIds is the transitive-dependent set snapshotted at the moment of halt. The record is written through the same hash.ts / slug.ts / storage.ts writers as the BuildTaskOutcome[] array, so an inspection returns the stored record verbatim and the halt narrative reflects the plan graph exactly as it stood when the run stopped.

**Rejected because:** Highest read performance and best halt-moment fidelity (ac2), but the second stateful record is a real correctness liability against sc4: dual write invites skew and needs a reconcile-on-restart rule that a1 avoids by construction. Scored partial on sc4 (dual-write skew; the frozen blocked snapshot can diverge from a freshly recomputed closure, so sc4 remains authoritative but no longer the single source of truth). Under accuracy-over-cost, the O(1) benefit does not justify the skew surface, so it ranks below a1.

### a3: Eagerly materialized outcome rows (self-describing array)

Write an outcome row for every plan Task up front; stamp blocked/not-reached in place so progress is a trivial fold.

Persist BuildTaskOutcome[] as the authoritative state but write a row for EVERY plan Task, filling status eagerly: 'not-reached' at run start, flipped to 'running' / 'completed' / 'failed' as the sequencer advances, and 'blocked' stamped onto each transitive dependent the instant a Task fails. BuildRunProgress (sc6) becomes a thin projection whose blockedTaskIds and not-reached set read directly off status='blocked' / 'not-reached' rows, with no dependency-graph recompute at read time. Finalize seals the array unchanged through the existing writers.

**Rejected because:** Achieves cheap self-describing reads but at the cost of writing speculative rows into an array whose sc4 contract says rows are daemon-verified results — scored partial on sc4 (eager 'not-reached'/'blocked' rows are speculative placeholders written before any run, so the array no longer contains only verified outcomes) and partial on ac3 (pre-written 'not-reached' rows must be corrected on a clean completion, so the finalized record carries provisional state unless the correcting pass is reliable), plus a wide halt-boundary multi-row mutation. It moves the dependency-closure work earlier without removing it, delivering the same read-time answer as a1 with more moving parts and more contract stretch — last.

## Open questions

- alt-completeness (s8 alt2, partial): the s3 alternatives are scored against ac1/ac2/ac3 and shared contracts sc6/sc4/sc5, but the two consumed contracts sc1 (BuildStageRegistration) and sc2 (WorkflowStepInputBuild) are not individually scored, and the Epic k-constraints are covered only indirectly via the acceptance criteria rather than enumerated by id. sc1/sc2 are judged orthogonal to the persistence-strategy choice (all three alternatives would score identically on them), so the omission is defensible — but a reviewer wanting the literal 'every shared contract and Epic constraint scored' should confirm sc1/sc2 are genuinely invariant across a1/a2/a3 before treating the comparison as exhaustive.

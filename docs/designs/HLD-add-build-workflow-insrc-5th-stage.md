<!-- insrc:artifact HLD-185807ba9a6b35d3 -->

# HLD: Chosen framework: **a2 — a registered `build` stage that delegates each Task's editing work to a CliProvider subprocess, while the daemon keeps sequencing and verification on its own side

**Tracker:** [insors-ai/insrc#1](https://github.com/insors-ai/insrc/issues/1)

## Framework summary

Chosen framework: **a2 — a registered `build` stage that delegates each Task's editing work to a CliProvider subprocess, while the daemon keeps sequencing and verification on its own side.** The stage is added exactly where the sibling stages live: a `src/workflow/runners/build/` subdir (index.ts + schemas.ts, one exported `registerBuildRunners(): void`, no classes, no base class — mirroring the confirmed design-story shape) plus a `src/workflow/artifacts/build.ts` artifact definition, reusing the parent module's `hash.ts` / `slug.ts` writers and `gates.ts` rather than adding skeleton machinery. The `insrc_workflow_step` surface gains a `build` phase handler mirroring `phases/plan.ts`, so the developer-facing turn shape (start → decompose → synthesize → finalize) is unchanged.

Why a2 over the field: it is the only alternative with no partial or unknown across all nine constraints. It removes the k9 dependency instead of absorbing it — the multi-turn edit/test/repair loop does **not** live inside the synthesize seam that is proven only for one-JSON-document-per-turn; it lives behind a one-Task-at-a-time subprocess boundary, so `executor.ts`/`orchestrator.ts` are asked only to do what they already demonstrably do (host a stage, run a gate, finalize an artifact). It keeps k2 enforcement daemon-side: the daemon decides advancement from a test run and a tree diff it performs itself, so a non-cooperating implementer cannot advance the run — unlike the advisory-order failure the Epic's problem statement names. And k8 is satisfied by construction rather than by special pleading: CliProvider is CLAUDE.md's sanctioned cloud path and one-subprocess-at-a-time is serial by definition.

Two items are carried into design as unproven, not settled. (1) **CliProvider's structured-output path is built for JSON returns, not for supervising a long free-form editing session** — that usage is unverified and may require provider-level work; the design must inspect `src/agent/providers/cli-provider.ts` directly, since no analyze bundle touched it (k8 is carried verbatim from CLAUDE.md). (2) Per the coverage-gap bundle, `gates.ts`, `hash.ts` and `slug.ts` are cited at **module level only** — no exploration located an entity in them by name — so k1's gate shape and k3's writer contract are unread APIs that must be read directly, alongside k9's required reading of `executor.ts` and `orchestrator.ts`. The scope phase's "clear match" verdict on `src/workflow` answers "does the skeleton exist?" (yes) and is not license to assume those files fit a code-editing workload.

## Architecture shape

Five layers, each mapping cleanly onto one Story, with the code-editing risk quarantined behind a subprocess boundary.

**1. Registration + phase surface (s1).** `src/workflow/runners/build/index.ts` exports `registerBuildRunners(): void`, called from `registerWorkflowRunners()` at `src/workflow/index.ts:23-32` (the located registry seam, entityId 74af0f8c30f0659a9d73a5d585d13363). It registers the four turn handlers for stage id `build` into the same per-stage registry that `registerDesignEpicRunners` / `registerDesignStoryRunners` use. On the driving side, `src/mcp/workflow-step/phases/build.ts` mirrors `phases/plan.ts`, with a `WorkflowStepInputBuild` added to `src/mcp/workflow-step/types.ts` and `'build'` added to `WorkflowStepStage` in `state.ts`; `handleWorkflowStep` in `handler.ts` dispatches to it. Nothing in define/design.epic/design.story/plan changes — the stage plugs in, it does not modify siblings (k4, k5, k6).

**2. Admission gate (s2).** The stage's start turn resolves the Story's upstream `PlanArtifact` and runs an admission check through the parent module's `gates.ts` before any work list is built and before any tool that can write to disk is reachable. Three refusal shapes — missing, unapproved, stale (plan's recorded upstream design hash ≠ current design.story artifact hash) — each name the failed condition. Refusal happens at start, so no editing subprocess has been spawned and the working tree is provably untouched (k1). *Design must read `gates.ts` directly to learn the real gate shape.*

**3. Sequenced Task loop (s3) — the daemon-side sequencer.** On admission, the run's work list is materialized verbatim from the approved plan's `PlanTask[]` — same set, same order, same `dependsOn` edges, nothing added, dropped or reordered. The loop is a plain serial `for...of` over a topological order: pick the next Task whose dependencies are all `completed`, hand it to the implementer adapter, wait, then **the daemon itself** decides advancement by (a) running the Task's stated test command and (b) diffing the working tree to record files touched. Exactly one Task is in flight at any moment; there is no `Promise.all` anywhere on this path (k2, k8).

**4. Implementer adapter (s3) — the quarantine boundary.** Each Task is handed to a single `CliProvider` subprocess invocation through the `LLMProvider` abstraction, given the Task statement plus the Story design and plan as context, and allowed to edit code. One subprocess at a time — serial by construction, no direct cloud REST (k8). The critical property: the adapter's **self-report is advisory; the daemon's test run + tree diff are authoritative.** A subprocess that claims success but leaves failing tests does not advance the run.

**5. Halt + finalize (s4, s5).** A Task whose stated tests cannot be brought to passing after the adapter's bounded repair budget is marked `failed`; the loop halts, and every Task transitively depending on it is marked `blocked` rather than started. Halted or complete, the run **always** reaches finalize (k3): `artifacts/build.ts` defines the `BuildArtifact`, written via the parent module's reused `hash.ts` (hash-json) and `slug.ts` (slug-md) writers, citing the `PlanArtifact` id + hash it derived from, carrying per-Task outcome and files touched, and offered for approval through the same path as every other workflow artifact. *Design must read `hash.ts` / `slug.ts` directly — their APIs are unread.*

Risk quarantine, restated: the only thing that touches the k9-unproven seams is a stage registration, a gate call, and a single finalize call — all shapes those files already serve for four existing stages. The novel, unproven work (a long free-form editing session) sits inside the adapter, behind a subprocess, where the sequencing and verification guarantees do not depend on its cooperation.

## Shared contracts

### sc1: BuildStageRegistration

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** The registration entrypoint that makes `build` a first-class stage of the chain — the single exported function registerWorkflowRunners() calls, mirroring registerDesignEpicRunners / registerDesignStoryRunners. Owning this is what satisfies k4/k6 and makes the stage discoverable in the registry alongside its four siblings.

**Interface sketch (type-level):**

```
// src/workflow/runners/build/index.ts

export declare const BUILD_STAGE_ID: 'build';

export interface BuildStageDescriptor {
  readonly stage: typeof BUILD_STAGE_ID;
  readonly title: string;
  readonly description: string;
  /** Stage whose approved artifact this stage consumes. */
  readonly consumesStage: 'plan';
}

/**
 * Registers the build stage's start/decompose/synthesize/finalize turn
 * handlers into the per-stage workflow runner registry.
 * Called from registerWorkflowRunners() in src/workflow/index.ts.
 * Registration only — no inheritance, no mutation of sibling stages.
 */
export declare function registerBuildRunners(): void;
```

**Assumptions cited:** [[c1]] [[c3]] [[c10]]

### sc2: WorkflowStepInputBuild

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** The insrc_workflow_step driving-surface input for the `build` phase, mirroring WorkflowStepInputPlan / handlePlan so a developer drives build through the same multi-turn turn shape as every earlier stage — no bespoke command, IPC method or UI.

**Interface sketch (type-level):**

```
// src/mcp/workflow-step/types.ts (additions)

// existing union gains 'build'
export type WorkflowStepStage =
  | 'define' | 'design.epic' | 'design.story' | 'plan' | 'build';

export type BuildPhase = 'start' | 'decompose' | 'synthesize' | 'finalize';

export interface WorkflowStepInputBuild {
  readonly stage: 'build';
  readonly phase: BuildPhase;
  /** Story whose approved plan is being implemented. */
  readonly storyId: string;
  /** Opaque server-side run token; preserved verbatim between turns. */
  readonly state?: string | undefined;
  readonly repo?: string | undefined;
}

export interface WorkflowStepOutputBuild {
  readonly next: BuildPhase | 'done' | 'refused';
  readonly guidance: string;
  readonly state?: string | undefined;
  readonly refusal?: BuildAdmissionRefusal | undefined;
  readonly progress?: BuildRunProgress | undefined;
  readonly markdown?: string | undefined;
}
```

**Assumptions cited:** [[c1]]

### sc3: BuildAdmissionResult

**Owner Story:** `s2`
**Consumed by:** `s3`, `s5`

**Purpose:** The gate verdict returned before any work list is materialized and before any code-touching path is reachable. Encodes admit-vs-refuse plus which upstream condition failed, so k1's 'refuse and say why, tree untouched' is a typed outcome rather than an ad-hoc error string.

**Interface sketch (type-level):**

```
// src/workflow/runners/build/schemas.ts

export type BuildRefusalReason =
  | 'plan-missing'
  | 'plan-unapproved'
  | 'plan-stale';

export interface BuildAdmissionRefusal {
  readonly reason: BuildRefusalReason;
  /** Human-facing sentence naming the failed upstream condition. */
  readonly message: string;
  /** Present for 'plan-stale': the drift that was detected. */
  readonly staleness?: {
    readonly planRecordedDesignHash: string;
    readonly currentDesignHash: string;
  } | undefined;
  /** Invariant: always true on refusal. */
  readonly treeUntouched: true;
}

export interface BuildAdmissionAccepted {
  readonly planArtifactId: string;
  readonly planArtifactHash: string;
  readonly storyId: string;
}

export type BuildAdmissionResult =
  | { readonly admitted: true; readonly plan: BuildAdmissionAccepted }
  | { readonly admitted: false; readonly refusal: BuildAdmissionRefusal };
```

**Assumptions cited:** [[c15]]

### sc4: BuildTaskOutcome

**Owner Story:** `s3`
**Consumed by:** `s4`, `s5`

**Purpose:** The per-Task verified result the sequencer produces — status, files touched, and the daemon's own test verdict. This is the unit s4 halts on and s5 finalizes into the artifact. Load-bearing property: filesTouched and testVerdict are populated by the daemon's tree diff and test run, never by the implementer's self-report.

**Interface sketch (type-level):**

```
// src/workflow/runners/build/schemas.ts

export type BuildTaskStatus =
  | 'completed'    // edits made AND stated tests observed passing
  | 'failed'       // stated tests could not be brought to passing
  | 'blocked'      // a dependency failed; never started
  | 'not-reached'; // run halted before this Task

export interface BuildTestVerdict {
  readonly command: string;
  readonly passed: boolean;
  readonly exitCode: number;
  readonly summary: string;
}

export interface BuildTaskOutcome {
  /** PlanTask id, verbatim from the approved plan. */
  readonly taskId: string;
  readonly title: string;
  readonly dependsOn: readonly string[];
  readonly status: BuildTaskStatus;
  /** Repo-relative paths, from the daemon's working-tree diff. */
  readonly filesTouched: readonly string[];
  readonly testVerdict?: BuildTestVerdict | undefined;
  readonly attempts: number;
  readonly note?: string | undefined;
}
```

**Assumptions cited:** [[c15]] [[c16]]

### sc5: TaskImplementerAdapter

**Owner Story:** `s3`
**Consumed by:** `s4`

**Purpose:** The quarantine boundary — the seam through which one Task at a time is handed to a CliProvider subprocess that may edit code. Isolates the k9-unproven long free-form editing workload from executor.ts/orchestrator.ts, and makes k8 structural: one subprocess at a time, via LLMProvider, never Promise.all, no direct cloud REST. Its self-report is explicitly advisory.

**Interface sketch (type-level):**

```
// src/workflow/runners/build/schemas.ts

export interface TaskImplementerRequest {
  readonly task: PlanTask;
  readonly storyDesignMarkdown: string;
  readonly planMarkdown: string;
  /** Outcomes of already-completed dependencies, for context. */
  readonly completedDependencies: readonly BuildTaskOutcome[];
  readonly repoRoot: string;
  /** Bounded repair budget for this Task. */
  readonly maxAttempts: number;
}

/**
 * ADVISORY ONLY. The sequencer never advances on this value; advancement
 * is decided by the daemon's own test run + working-tree diff.
 */
export interface TaskImplementerReport {
  readonly claimedComplete: boolean;
  readonly narrative: string;
}

export interface TaskImplementerAdapter {
  /**
   * Runs exactly one implementer subprocess to completion.
   * Serial by construction — callers await one call before the next.
   */
  implement(req: TaskImplementerRequest): Promise<TaskImplementerReport>;
}
```

**Assumptions cited:** [[c16]] [[c14]]

### sc6: BuildRunProgress

**Owner Story:** `s4`
**Consumed by:** `s5`

**Purpose:** The run-level status a developer inspects mid-run or after a halt — which Task failed, what the completed Tasks left in place, what was never reached. Lets s4 report a halt without the developer reconstructing state from the working tree, and gives s5 the run-level frame its artifact wraps.

**Interface sketch (type-level):**

```
// src/workflow/runners/build/schemas.ts

export type BuildRunState = 'running' | 'halted' | 'complete';

export interface BuildHaltInfo {
  readonly failedTaskId: string;
  readonly failedTaskTitle: string;
  readonly reason: string;
  /** Tasks marked 'blocked' because they depend on the failed Task. */
  readonly blockedTaskIds: readonly string[];
}

export interface BuildRunProgress {
  readonly storyId: string;
  readonly runState: BuildRunState;
  readonly totalTasks: number;
  readonly completedTaskIds: readonly string[];
  /** Exactly one, or none. Concurrency is structurally impossible. */
  readonly inFlightTaskId?: string | undefined;
  readonly halt?: BuildHaltInfo | undefined;
  /** Union of filesTouched across completed Tasks. */
  readonly filesTouchedSoFar: readonly string[];
}
```

**Assumptions cited:** [[c15]]

### sc7: BuildArtifact

**Owner Story:** `s5`

**Purpose:** The persistent, citable, approvable record the run finalizes into — the thing that stops the chain's review discipline from evaporating at the moment real code is written. Written via the parent module's reused hash.ts (hash-json) and slug.ts (slug-md) writers, defined beside its siblings in artifacts/, and offered for approval through the same path as every other workflow artifact.

**Interface sketch (type-level):**

```
// src/workflow/artifacts/build.ts

export declare const BUILD_ARTIFACT_KIND: 'build';

export interface BuildArtifactUpstream {
  /** The approved PlanArtifact this run derived from — the citation. */
  readonly planArtifactId: string;
  readonly planArtifactHash: string;
  readonly storyId: string;
  readonly epicId: string;
}

export interface BuildArtifact {
  readonly kind: typeof BUILD_ARTIFACT_KIND;
  readonly upstream: BuildArtifactUpstream;
  readonly runState: BuildRunState;
  /** One entry per PlanTask, in the plan's order. */
  readonly taskOutcomes: readonly BuildTaskOutcome[];
  readonly halt?: BuildHaltInfo | undefined;
  /** Union of filesTouched across all Tasks. */
  readonly filesTouched: readonly string[];
  readonly summary: string;
}
```

**Assumptions cited:** [[c15]] [[c3]]

## Story boundaries

### Story `s1`

**Owns:** `sc1`, `sc2`

How the four turn handlers are wired into the per-stage registry — the internal handler table shape, the descriptor strings shown when a developer lists stages, and the argument threading from handleWorkflowStep down into the runner — stays private to s1. The opaque `state` token's encoding (how a run id is minted, serialized and validated across turns) is s1's business alone; every other Story sees only an opaque string. The decision of whether the build decomposer mirrors designEpicDecomposer inside orchestrator.ts or lives entirely in runners/build/ is s1's, provided the k9 reading of orchestrator.ts is done first and the registration-not-inheritance shape (k6) holds. No other Story may reach into the registry or the MCP phase dispatch.

### Story `s2`

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

Everything about how upstream freshness is actually determined stays private: how the PlanArtifact is resolved for a Story, how gates.ts is called and what its real signature turns out to be (unread at Epic time — s2 owns the direct inspection), how approval state is read, and how the plan's recorded upstream design hash is compared against the current design.story artifact hash to detect drift. The wording of refusal messages is s2's. Other Stories see only the BuildAdmissionResult verdict — they never re-derive staleness, never re-check approval, and must not implement a second gate. If gates.ts turns out not to fit, adapting it is s2's problem, not a shared contract change.

### Story `s3`

**Owns:** `sc4`, `sc5`
**Depends on:** `sc1`, `sc2`, `sc3`

The sequencer's guts are private: the topological ordering of the plan's PlanTask[] into a serial work list, the `for...of` loop that walks it, the per-Task attempt/repair budget, how the working-tree diff is taken to compute filesTouched, how the Task's stated test command is extracted from the PlanTask and executed, and how the test exit code plus diff are combined into the authoritative advance decision. Also private: the prompt handed to the implementer subprocess, the CliProvider invocation shape, and the direct inspection of cli-provider.ts needed to establish whether its structured-output path can supervise a long free-form editing session at all (unproven at Epic time — s3 owns the finding, and provider-level work if the answer is no). Other Stories consume finished BuildTaskOutcome values and must never call the adapter directly or infer status from the implementer's advisory narrative.

### Story `s4`

**Owns:** `sc6`
**Depends on:** `sc1`, `sc2`, `sc4`, `sc5`

Private to s4: how a failed Task's transitive dependents are computed and marked `blocked` versus `not-reached`, how the run's in-flight state is tracked so progress can be reported mid-run, how a halt is distinguished from a clean completion, and the phrasing of the halt narrative a developer reads. Also private: guaranteeing that the halt path still reaches finalize — the internal control flow that routes a halted run into s5's finalize rather than letting it end as an untracked side-effect. Other Stories read BuildRunProgress; nobody else decides what halting means or recomputes the blocked set.

### Story `s5`

**Owns:** `sc7`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc6`

The artifact writing machinery usage is private to s5: how hash.ts is called to produce the hash-json and slug.ts to produce the slug-md (both unread APIs at Epic time — s5 owns the direct inspection and any adaptation needed), the markdown rendering of per-Task outcomes and touched files that a reviewer actually reads, the storage.ts persistence call, and the wiring into the existing approval path. Also private: how the PlanArtifact citation is formatted in the rendered document. Other Stories hand s5 typed outcomes and progress; none of them format, hash, slug, persist or render — and none of them may write an artifact by any other route.

## Non-functional targets

- **Performance:** Accuracy is primary; cost is the least priority — a build run is expected to be slow and expensive, and that is the correct trade. Sequencing is strictly one Task at a time (s3/ac3) even where dependencies would permit parallelism, and one implementer subprocess at a time; there is no Promise.all anywhere on the provider path and no concurrency knob to add later without reopening k2. Expect wall-clock proportional to Task count times (edit session + test run), i.e. tens of minutes for a real Story — do not optimize this by batching Tasks or by parallelizing provider calls. The per-Task repair budget (maxAttempts) is the only latency bound, and it should be generous rather than tight: giving up early produces a wrong `failed` verdict, which costs more than the retry did.
- **Security:** The refusal path is a safety boundary, not a convenience: the gate runs at the start turn, before any work list is materialized and before the implementer adapter is reachable, so `treeUntouched: true` on refusal is structural rather than asserted. No direct cloud REST from our process under any circumstance — the implementer reaches cloud models only through the locally-installed claude/codex CLI binaries via CliProvider, so auth and quota stay with the user's CLI OAuth session and no API keys enter this stage. The implementer subprocess is the only component in the design that can write to the repository; its blast radius is the registered repo root, and its self-report is never trusted to advance the run. Test commands executed by the daemon come verbatim from the approved plan's PlanTask — an approved artifact is the authorization boundary for what gets run.
- **Observability:** Long serial runs are opaque by default, and this one is the longest in the chain — BuildRunProgress exists so a developer can see which Task is in flight, which completed, and what they left on the tree without reading the working tree themselves. Progress should be emitted at every Task boundary at minimum: task-start, implementer-finished, test-verdict, advance-or-halt. Halts must name the failed Task, the reason, and the blocked set explicitly (s4/ac2) rather than surfacing a bare non-zero exit. Every stage boundary logs via getLogger('workflow:build') — never console.log. The finalized artifact is the durable observability surface: per-Task status, files touched, test verdict, and the cited PlanArtifact make the whole run reviewable after the fact, which is the entire point of the stage.
- **Durability:** The BuildArtifact must survive the run ending — a halted run finalizes just as a complete one does (s4/ac3), so a crash mid-Task must not be the only way the record is lost. Every Task boundary is a natural checkpoint: the run's accumulated BuildTaskOutcome[] should be persisted incrementally, not only at finalize, so a daemon restart mid-run leaves a readable record of what already landed on the tree rather than an untracked side-effect. The artifact is written through the parent module's existing hash-json + slug-md writers and storage.ts — same durability envelope as define/design.epic/design.story/plan, no new persistence substrate. Working-tree edits themselves are NOT transactional: this framework deliberately does not add worktree lifecycle (that was a4's breach of k5), so a halted run leaves partial edits in place — which is why the artifact naming what landed is the durability guarantee that matters.

## Rollout

### Phase A — stage registration + driving surface

**Stories:** `s1`
**Flag:** `insrc.workflow.build`

s1 owns sc1 (BuildStageRegistration) and sc2 (WorkflowStepInputBuild), which every other Story consumes — there is no seam to hang a gate, a sequencer, a halt reporter or a finalizer on until the stage exists in the registry and `insrc_workflow_step` accepts a `build` phase. It also carries k9's required direct reading of executor.ts and orchestrator.ts, which is the precondition the Epic puts on all downstream planning. Landing it alone keeps the first contact with the unproven seams to the one shape those files already serve for four sibling stages: a registration, a dispatch, a descriptor.

**Backward compat:** define, design.epic, design.story and plan must behave identically after registerBuildRunners() is wired in — the stage plugs in by registration, never by altering a sibling (k5/k6). The existing WorkflowStepStage union gains 'build' additively; no existing phase input shape, IPC method or artifact kind changes. A daemon that has never run a build stays byte-for-byte compatible.

### Phase B — admission gate

**Stories:** `s2`
**Flag:** `insrc.workflow.build`

s2 owns sc3 (BuildAdmissionResult) and depends on sc1/sc2 from Phase A. It lands second and before anything that can write to disk, because it is the safety boundary: once the sequencer exists, a run that skips admission can edit the working tree, so the gate must be the thing already standing when the first code-touching path arrives. Landing it here also means `treeUntouched: true` is structurally true rather than asserted — at this point in the rollout there is literally no editing path to reach. s2 also carries the direct inspection of gates.ts, whose real signature is unread at Epic time.

**Backward compat:** gates.ts is reused, not modified — the four existing stages' gate behaviour must be unchanged by whatever s2 learns about its signature. If gates.ts turns out not to fit a plan-freshness check, s2 adapts on its own side rather than changing the shared gate contract underneath define/design.epic/design.story/plan.

### Phase C — sequenced Task loop + implementer adapter

**Stories:** `s3`
**Flag:** `insrc.workflow.build`

s3 owns sc4 (BuildTaskOutcome) and sc5 (TaskImplementerAdapter), both consumed by s4 and s5, and depends on sc3 from Phase B — the gate must precede the first path that edits code. This is the phase where the design's two unproven items land: whether CliProvider's structured-output path can supervise a long free-form editing session at all (cli-provider.ts is unread at Epic time), and whether daemon-side test-run-plus-tree-diff is a sound advance decision. Isolating it in its own phase means that if the provider answer is 'no' and provider-level work is needed, the blast radius is one phase behind a subprocess boundary — the registration and gate already landed and stay landed.

**Backward compat:** The LLMProvider interface and CliProvider must remain unchanged for every existing caller. If s3's inspection shows the provider needs work to supervise an editing session, that work is additive — existing structured-output JSON callers (analyze, the four earlier workflow stages) keep their current behaviour. No Promise.all is introduced on any provider path, here or anywhere.

### Phase D — halt semantics + run progress

**Stories:** `s4`
**Flag:** `insrc.workflow.build`

s4 owns sc6 (BuildRunProgress), which s5 consumes as the run-level frame its artifact wraps, so the owner lands before the consumer. It depends on sc4/sc5 from Phase C: you cannot decide what halting means until per-Task outcomes exist to halt on. Landing halt semantics before finalize is deliberate — s4/ac3 requires that a halted run still reaches finalize, so the halt path must be the thing already defined when s5 builds the finalizer, rather than a case retrofitted onto a happy-path writer.

**Backward compat:** Nothing downstream exists to break yet — sc6 is new surface. The compat concern is internal: the blocked-versus-not-reached distinction and the halt narrative become the vocabulary s5's artifact renders, so s4 must settle them before Phase E rather than reopening them mid-finalize.

### Phase E — finalize into an approvable artifact

**Stories:** `s5`

s5 owns sc7 (BuildArtifact) and depends on sc3, sc4 and sc6 — every input the artifact records is produced upstream, so it lands last. It carries the direct inspection of hash.ts and slug.ts, both cited at module level only and therefore unread APIs at Epic time. This is the phase that closes the Epic's actual problem: until it lands, a build run's outcome is still an untracked side-effect. Removing the feature flag belongs here, because a stage that runs but produces no citable, approvable record is worse than one that is off.

**Backward compat:** hash.ts, slug.ts and storage.ts are reused verbatim — the four existing artifact kinds must hash, slug, persist and render exactly as they do today after BuildArtifact is added. The new artifact enters the existing approval path as an additional kind, not as a change to how approval works for any existing kind. If a writer's real API does not fit, s5 adapts on its own side.

**Ordering rationale:** The Epic's dependency edges are a near-linear chain (s1 → s2 → s3, then s4 and s5 both off s3), and s4's shared-contract graph tightens the one place the Epic left slack: s5 consumes sc6, which s4 owns, so the two cannot land together — owner before consumer forces s5 last. That yields one Story per phase, which is not a failure to batch but the honest shape of this Epic: every phase's owned contracts are consumed by every phase after it, so there is no pair with independent surfaces to merge.

Beyond satisfying the edges, the order is chosen so each phase's risk is contained by what already landed. The gate (Phase B) precedes the first code-editing path (Phase C) — that is what makes s2/ac2–ac4's "no file in the repository is modified" structural rather than asserted, since at Phase B there is no editing path to reach at all. The k9-unproven work is deliberately spread across the ordering rather than concentrated: Phase A touches executor.ts/orchestrator.ts only in the registration shape they already serve for four sibling stages, and carries the required direct inspection; Phase C absorbs the genuinely novel workload (a long free-form editing session) behind the subprocess boundary, one phase at a time, so a bad answer on CliProvider does not unwind the registration or the gate. Halt semantics (Phase D) land before the finalizer (Phase E) because s4/ac3 makes "a halted run still finalizes" a requirement — building the writer first would mean retrofitting the halt case onto a happy-path artifact, which is exactly how untracked side-effects get reintroduced.

The `insrc.workflow.build` flag covers Phases A–D and clears in Phase E. The reason is the Epic's own problem statement: a stage that sequences and edits code but produces no cited, approvable record has all the blast radius of the feature and none of its value. The flag stays on until sc7 exists.

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Phase C — CliProvider supervising a long free-form editing session (cli-provider.ts unread at Epic time; the provider's structured-output path is built for one-JSON-document-per-turn returns, not for an editing loop) | This is the design's first named unproven item and the only one that can invalidate the chosen framework rather than merely cost rework. If the provider cannot supervise an editing session without provider-level work, Phase C's adapter has no implementation and Phases D–E have no outcomes to consume. It is unproven because no analyze bundle touched cli-provider.ts — k8 is carried verbatim from CLAUDE.md, not from an exploration of the file. | Phase C opens with a direct read of src/agent/providers/cli-provider.ts and a throwaway spike that drives one trivial Task end-to-end through a real subprocess, before any sequencer code is written. If the answer is that provider-level work is needed, that work is scoped and landed as additive change inside Phase C — existing structured-output JSON callers keep their behaviour. The adapter's subprocess boundary is what makes this survivable: the failure is contained to sc5's implementation and does not reach the registration, the gate, or executor.ts/orchestrator.ts. |
| Phases A/B/E — gates.ts, hash.ts and slug.ts are cited at module level only; no exploration located an entity in them by name | k1's gate shape and k3's writer contract are unread APIs spread across three phases. The scope phase's 'clear match' on src/workflow answers 'does the skeleton exist?' — it is not evidence those files fit this workload. A signature that does not fit could tempt a phase into changing a file four existing stages depend on, which would turn an additive rollout into a regression surface for define/design.epic/design.story/plan. | Each phase reads its own file directly as its first task and treats it as read-only: s2 reads gates.ts in Phase B, s5 reads hash.ts/slug.ts in Phase E. The standing rule across the rollout is that a misfit is adapted around on the consuming side (a local wrapper in runners/build/), never by editing the shared writer or gate. Any change that would touch those files' existing behaviour stops the phase and comes back as a scope question rather than being absorbed silently. |
| Phase C onward — partial working-tree edits are not transactional, and this framework deliberately adds no worktree lifecycle | A halted or crashed run leaves real, uncommitted edits on the developer's tree. The design accepts this on purpose (worktree lifecycle was a4's breach of k5), which means the artifact naming what landed is the only durability guarantee — and that artifact does not exist until Phase E. Between Phase C landing and Phase E landing, a halted run leaves edits with no record of what they were. | The insrc.workflow.build flag stays on through Phase D precisely to keep this window closed for anyone who has not opted in. From Phase C, the run persists accumulated BuildTaskOutcome[] incrementally at every Task boundary rather than only at finalize, so a daemon restart mid-run leaves a readable record of what already landed. Phase E then makes the record durable and reviewable, and only then does the flag clear. |

## Alternatives considered

### a1: In-process build runner (sibling-shaped, orchestrator-driven)

Add runners/build + artifacts/build.ts that mirror design-story exactly, and drive code edits from inside the daemon using LLMProvider plus the existing built-in file/shell/test tools.

The build stage is instantiated as one more stage of the existing skeleton, structurally indistinguishable from its siblings: a runners/build subdir holding index.ts + schemas.ts exporting registerBuildRunners(), an artifacts/build.ts definition, a buildDecomposer alongside designEpicDecomposer inside orchestrator.ts, a gate in gates.ts for the approved-and-non-stale PlanArtifact check, and finalize through the parent module's hash.ts + slug.ts writers. The decompose seam yields the plan's Tasks verbatim as the work list; each Task becomes one synthesize turn driven by executor.ts.

The distinguishing choice is that the code-editing work happens inside the daemon process. Per Task, the runner assembles context, makes serial LLMProvider calls to reason about the edit, applies the edit through the built-in file tools, runs the Task's stated tests through the shell/test tools, and records outcome plus files touched before advancing to the next Task in dependency order. Nothing leaves the process except provider calls and test subprocesses; the run's state, sequencing, halt-on-failure behaviour and artifact all live where the other four stages' do.

**Pros:**
- Sequencing (k2), gating (k1) and finalize (k3) are all enforced by code the daemon owns, so the invariants hold without trusting an external agent's cooperation.
- Per-Task outcome and files-touched come from the runner's own tool calls, so the artifact's record is observed rather than self-reported.
- Registration seam is exactly registerBuildRunners() at src/workflow/index.ts:23-32 with no skeleton change, satisfying k5 and k6 by construction.
- One process boundary means a failed Task halts the run deterministically at the point of failure (s4/ac1) rather than after a subprocess exits.

**Cons:**
- Directly contradicts the k9 unknown: executor.ts (12,476 B) and orchestrator.ts (68,207 B) are proven only for doc-emitting stages, and a code-editing workload may need per-Task retry loops and multi-turn tool use those seams do not have — this alternative absorbs that rework wholesale.
- The runner has to reimplement an edit-then-test-then-repair loop that the claude/codex CLIs already provide, inside a synthesize seam designed to return one JSON document per turn.
- Serial-only provider calls (k8) plus in-process edit loops make wall-clock per Task the sum of every reasoning turn, with no path to the CLI's own internal parallelism.
- Largest surface area of the four: decomposer, gate, per-Task executor mode, artifact and both test dirs all change together.

**Cost estimate:** L

**Rejected because:** Ranked 2nd. Satisfies eight of nine constraints cleanly with the field's strongest enforcement story — every invariant upheld by code the daemon owns, nothing delegated to a cooperating party — but falls on k9 (partial): it takes the unknown head-first, hosting a multi-turn edit/test/repair loop inside a synthesize seam whose only proven use is returning one JSON document per turn, while the coverage-gap bundle is explicit that the clear-match verdict on src/workflow covers registry, gate and artifact seams only. It also rebuilds a loop the claude/codex CLIs already provide, and k8's serial-only discipline makes per-Task wall-clock the sum of every reasoning turn with no access to the CLI's internal parallelism. Cost L with the largest surface area (decomposer, gate, per-Task executor mode, artifact, both test dirs).

### a2: Delegated coding agent per Task (CliProvider as the implementer) — **CHOSEN**

The stage owns the gate, the dependency-ordered work list, verification and the artifact; each Task's actual code editing is delegated to a claude/codex CLI subprocess through the existing CliProvider.

Structurally this is the same sibling-shaped stage as a1 — runners/build + artifacts/build.ts + registerBuildRunners() + a gate + hash/slug finalize — but it draws the responsibility line differently. The stage is a supervisor, not an implementer. Decompose turns the approved PlanArtifact into the ordered work list; for each Task, in dependency order, one at a time, the stage spawns a CLI subprocess through CliProvider with that Task's statement and its acceptance tests as the brief, and lets the CLI run its own edit/test/repair loop to completion.

When the subprocess returns, the stage does not take its word for it: it runs the Task's stated tests itself and diffs the working tree to determine which files actually changed. That observed result — not the agent's claim — is what gets recorded as the Task's outcome and advances (or halts) the run. This keeps every invariant the Epic cares about on the insrc side of the boundary while the part that is genuinely hard and already solved elsewhere (multi-turn code editing) stays outside.

**Pros:**
- Sidesteps the k9 risk: orchestrator.ts/executor.ts never host a code-editing loop, so their fitness for that workload stops being load-bearing — each Task is a single delegate-and-verify turn, the shape those seams already support.
- Reuses the CLI's mature edit/test/repair loop instead of rebuilding it, so per-Task success rate rides on a tool already trusted for exactly this job.
- Honours k8 with no special pleading: CliProvider is the sanctioned cloud path, and one subprocess at a time is already the serial discipline k2/ac3 demands.
- Verification and files-touched are measured by the stage (test run + tree diff), so a lying or confused subagent cannot forge a completed Task in the artifact.
- Smallest new logic per Task — brief in, subprocess out, verify, record — keeps runners/build close to the two-file design-story shape (33 KB, 6 entities).

**Cons:**
- Adds a per-Task subprocess spawn plus full CLI session to the run's cost and wall-clock; a 12-Task plan is 12 cold CLI starts.
- The stage cannot constrain what the subprocess edits, so a Task can touch files outside its scope and the artifact records that only after the fact, never prevents it.
- Failure attribution is coarse: when a CLI run ends without passing tests, the stage knows the Task failed but has little insight into why, which weakens the s4/ac2 report to 'this Task failed' plus a test log.
- Depends on CLI OAuth/session availability at run time, so a build run can fail for reasons unrelated to the plan or the code.
- CliProvider's structured-output path is built for JSON returns, not for supervising a long free-form editing session — that usage is unproven and may need provider-level work.

**Cost estimate:** M

### a3: Client-driven build phase (insrc_workflow_step hands work back to the calling session)

Mirror the multi-turn insrc_analyze_step / workflow-step pattern: the daemon gates, sequences and records, while the host agent session that called insrc_workflow_step performs each Task's edits with its own tools.

The daemon adds a `build` phase to src/mcp/workflow-step mirroring phases/plan.ts and WorkflowStepInputPlan, plus the same runners/build + artifacts/build.ts pair. But the stage never edits code and never calls an LLM. On start it runs the gate against the PlanArtifact and refuses with the named failing condition; on decompose it emits the dependency-ordered work list and hands back the next Task — exactly one — as a prompt for the calling session. The client agent does the edit and the test run with its own tooling, then reports back through the next step call.

The daemon's job is to be the thing that cannot be talked out of the rules. It releases Task N+1 only after Task N is reported complete and it has independently confirmed the Task's stated tests pass; it halts and finalizes on failure; and it writes the hash-json + slug-md artifact citing the plan. This is the existing insrc_workflow_step turn shape used literally, with code editing as just another thing the client does between turns.

**Pros:**
- Zero new provider surface: no LLM call originates in the daemon, so k8's serial-and-no-REST constraint is satisfied vacuously rather than by discipline.
- Reuses the multi-turn step loop the codebase already runs for define/design.epic/design.story/plan, so s1/ac2's 'same turn shape the developer already knows' is met by literally being that loop.
- No subprocess spawn and no separate billing — reasoning stays in the session the developer is already in, matching the stated preference for insrc_analyze_step over insrc_analyze.
- Smallest daemon-side footprint of the four: a gate, an ordered work-list cursor, a test check and an artifact writer — none of it a code-editing loop, so k9's unproven seams stay out of the path.
- The client agent has full repo context and its own tools, so per-Task edit quality rides on the strongest available implementer with no context handoff loss.

**Cons:**
- k2's 'no Task starts before its dependencies complete' becomes an interface the daemon enforces on a cooperating client; a client that ignores the returned Task and edits whatever it likes is not stopped, only recorded.
- A build run is only as durable as the client session — an interrupted session leaves a run mid-work-list with the tree already modified, and resumption is a new concern the sibling stages never had.
- There is no headless path: the daemon-side workflow.run IPC could never drive a build to completion by itself, so build is the one stage that cannot run unattended.
- Files-touched in the artifact is reconstructed from a tree diff between turns rather than from the editor's own record, so concurrent developer edits during a run contaminate the s5/ac2 per-Task attribution.
- Splits responsibility for a single Task across two processes, making s4/ac2's 'what was left in place' harder to state precisely when the client dies mid-Task.

**Cost estimate:** S

**Rejected because:** Ranked 4th. The cheapest option (S), satisfying k8 vacuously since no LLM call originates in the daemon and meeting s1/ac2's 'same turn shape the developer already knows' by literally being the existing insrc_workflow_step loop — but it downgrades k2 (partial), typed in the Epic as an invariant, into an interface enforced on a cooperating client. By its own admission a client that ignores the returned Task and edits whatever it likes 'is not stopped, only recorded' — the exact advisory-order failure the Epic's problem statement exists to fix. Two weaknesses compound: k3 is partial because files-touched is reconstructed from a between-turn tree diff that concurrent developer edits contaminate, degrading s5/ac2; and durability is bound to the client session, so an interrupted run leaves a modified tree mid-work-list, making s4/ac2's 'what was left in place' hard to state and ruling out any headless workflow.run path.

### a4: Propose-then-apply (per-Task patch set, approved before it touches the tree)

The build run produces verified patches in an isolated worktree and finalizes them into the artifact; the developer's actual repo is only written after the build artifact is approved.

This alternative moves the approval gate from after the fact to before the fact. The build stage clones the repo into an isolated worktree, then walks the plan's Tasks in dependency order inside it — implementing each Task and running its stated tests there, one at a time, using either of the implementer choices above. The developer's working tree is never touched during the run. Each Task's result is captured as a patch plus a test outcome, and the build artifact records the whole ordered patch set, per-Task pass/fail, and the files each patch touches, citing the PlanArtifact.

Approval of the build artifact — through the same approval path as every other stage — is what causes the patch set to be applied to the real repo. The artifact stops being a retrospective record of what already happened to your files and becomes the reviewable proposal that decides whether it happens at all, which is a stronger reading of the Epic's 'the moment real code is written, that discipline disappears' than the other three offer.

**Pros:**
- k1's 'no file in the repository is modified' on refusal holds trivially and for every failure mode, not just gate failures, because the run never writes the real tree.
- A reviewer reads the build artifact before the code lands, so approval is a decision rather than an acknowledgement — the only alternative where the artifact's approval has consequences.
- A halted run (s4) leaves the developer's tree pristine, so 'what was left in place by the Tasks completed before it' is answered entirely by the artifact with nothing to clean up.
- Files-touched per Task is exact — it is the patch's own file list, not a tree diff that could pick up unrelated concurrent edits.
- Tests run against an isolated tree, so a green Task result is not contaminated by the developer's uncommitted work.

**Cons:**
- Adds worktree lifecycle (create, populate, run tests in, apply from, tear down) that no existing stage has and that no cited file in src/workflow provides — the one alternative that does require machinery beyond the k5 'runners/build + artifacts/build.ts' shape.
- Patches go stale between finalize and approve: if the developer edits the same files while the artifact awaits sign-off, application conflicts and the run's value is lost.
- Tests passing in a clean worktree does not guarantee they pass in the developer's tree, so the artifact's verification claim is weaker than it looks at exactly the moment it is trusted most.
- Worktree setup per run plus a full dependency install for test execution is real per-run cost and latency on top of whichever implementer strategy is chosen inside it.
- Layers on top of a1/a2/a3 rather than replacing them — the implementer question is still open, so this is the largest total scope of the four.

**Cost estimate:** L

**Rejected because:** Ranked 3rd. Has the field's single strongest reading of k1 — the developer's tree is never written during the run, so 'no file in the repository is modified' holds for every failure mode, not just gate refusals — and gives exact per-Task files-touched from the patch's own file list rather than a contaminable tree diff. Rejected because it is the only alternative that breaches k5 (partial): worktree lifecycle (create, populate, install deps, run tests in, apply from, tear down) is machinery no existing stage has and no cited file in src/workflow provides, which is precisely what k5 says not to add. Its k8 verdict is unknown because the implementer question stays open — it layers on top of a1/a2/a3 rather than replacing one — which makes it the largest total scope and leaves k9 exposure unresolved (partial, deferred behind an unmade choice). Its patch-staleness and clean-tree-verification cons weaken the artifact's verification claim at the moment it is trusted most.

## Open questions

- [sc2 / missed] Three sharedContract consumedByStories entries invert the Epic's Story dependency edges and were not surfaced as questions or Epic amendments: sc6 is owned by s4 and consumed by s5 though the Epic has s5 dependsOn s3 with no s5→s4 edge; sc3 is owned by s2 and consumed by s1, reversing s2 dependsOn s1; sc7 is owned by s5 and consumed by s4, reversing s4's position entirely. The rollout's orderingRationale resolves the sc6 case by ordering (owner before consumer forces s5 last) rather than raising it. Design must decide whether these are genuine consumption edges requiring an Epic amendment to the Story dependency graph, or over-broad consumedByStories entries to be narrowed.
- [f2 / partial] The framework's MCP-side references — src/mcp/workflow-step/phases/plan.ts, types.ts, state.ts and handler.ts — carry no analyze-bundle citation and rest on Epic constraint k4's prose instead; src/agent/providers/cli-provider.ts is named with the explicit admission that no analyze bundle touched it. These paths and their shapes must be verified by direct reading at design time before any of s1's or s3's work depends on them.
- [nf1 / partial] The four nonFunctional properties state structural guarantees and directions rather than measurable targets. 'Tens of minutes for a real Story' is explicitly framed as an expectation not to optimize against, and maxAttempts is named only as 'generous rather than tight' with no value. Only observability's per-Task emission set (task-start, implementer-finished, test-verdict, advance-or-halt) is concrete, and it is a cadence rather than a threshold. Design must decide whether any of these need a number a reviewer could fail a build against — in particular the maxAttempts repair budget, which s3 owns.

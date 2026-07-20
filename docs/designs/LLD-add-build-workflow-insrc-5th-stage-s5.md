<!-- insrc:artifact LLD-185807ba9a6b35d3-s5 -->

# LLD: E20260717185807ba:S005

**Epic:** `add-build-workflow-insrc-5th-stage`
**HLD base run:** `wf-1784289418318-fl5y3m`
**HLD effective hash:** `6d130af6ef10...`
**Tracker:** [insors-ai/insrc#6](https://github.com/insors-ai/insrc/issues/6)

## HLD context

**Framework:** Chosen framework: **a2 — a registered `build` stage that delegates each Task's editing work to a CliProvider subprocess, while the daemon keeps sequencing and verification on its own side.** The stage is added exactly where the sibling stages live: a `src/workflow/runners/build/` subdir (index.ts + schemas.ts, one exported `registerBuildRunners(): void`, no classes, no base class — mirroring the confirmed design-story shape) plus a `src/workflow/artifacts/build.ts` artifact definition, reusing the parent module's `hash.ts` / `slug.ts` writers and `gates.ts` rather than adding skeleton machinery. The `insrc_workflow_step` surface gains a `build` phase handler mirroring `phases/plan.ts`, so the developer-facing turn shape (start → decompose → synthesize → finalize) is unchanged.

Why a2 over the field: it is the only alternative with no partial or unknown across all nine constraints. It removes the k9 dependency instead of absorbing it — the multi-turn edit/test/repair loop does **not** live inside the synthesize seam that is proven only for one-JSON-document-per-turn; it lives behind a one-Task-at-a-time subprocess boundary, so `executor.ts`/`orchestrator.ts` are asked only to do what they already demonstrably do (host a stage, run a gate, finalize an artifact). It keeps k2 enforcement daemon-side: the daemon decides advancement from a test run and a tree diff it performs itself, so a non-cooperating implementer cannot advance the run — unlike the advisory-order failure the Epic's problem statement names. And k8 is satisfied by construction rather than by special pleading: CliProvider is CLAUDE.md's sanctioned cloud path and one-subprocess-at-a-time is serial by definition.

Two items are carried into design as unproven, not settled. (1) **CliProvider's structured-output path is built for JSON returns, not for supervising a long free-form editing session** — that usage is unverified and may require provider-level work; the design must inspect `src/agent/providers/cli-provider.ts` directly, since no analyze bundle touched it (k8 is carried verbatim from CLAUDE.md). (2) Per the coverage-gap bundle, `gates.ts`, `hash.ts` and `slug.ts` are cited at **module level only** — no exploration located an entity in them by name — so k1's gate shape and k3's writer contract are unread APIs that must be read directly, alongside k9's required reading of `executor.ts` and `orchestrator.ts`. The scope phase's "clear match" verdict on `src/workflow` answers "does the skeleton exist?" (yes) and is not license to assume those files fit a code-editing workload.
**Rollout phase:** Phase E — finalize into an approvable artifact
**Owns:** `sc7` (BuildArtifact)
**Consumes:** `sc1` (BuildStageRegistration), `sc2` (WorkflowStepInputBuild), `sc3` (BuildAdmissionResult), `sc4` (BuildTaskOutcome), `sc6` (BuildRunProgress)

## Contract details

**Surface level:** internal-shared

### `BUILD_ARTIFACT_KIND`

```typescript
export declare const BUILD_ARTIFACT_KIND: 'build';
```

**Returns:** `'build'` — The literal artifact-kind discriminator for the build stage's record, mirroring the per-kind constants that plan/define/design artifacts carry. This is the tag gates.ts and the reviewer approval path key the new kind on.

**Preconditions:**
- None — a compile-time constant.

**Postconditions:**
- Registered as an ADDITIONAL artifact kind (ac4); it never changes the discriminant of any existing kind.

### `BuildArtifactUpstream`

```typescript
export interface BuildArtifactUpstream {
  readonly planArtifactId: string;
  readonly planArtifactHash: string;
  readonly storyId: string;
  readonly epicId: string;
}
```

**Parameters:**
- `planArtifactId: string` — Id of the approved PlanArtifact this run derived from — mapped straight from BuildAdmissionAccepted (sc3).
- `planArtifactHash: string` — Canonical hash of that PlanArtifact — mapped from BuildAdmissionAccepted.planArtifactHash — so the citation pins the exact approved revision, not just the id.
- `storyId: string` — The Story whose approved plan was implemented; from BuildAdmissionAccepted.storyId.
- `epicId: string` — The parent Epic id, completing the up-the-chain citation trail.

**Returns:** `BuildArtifactUpstream` — The embedded citation block that satisfies ac3 — the traceable link from the finalized record back to the approved plan it was built from.

**Preconditions:**
- Populated only from a BuildAdmissionAccepted (sc3) verdict; never from the implementer subprocess's self-report.

**Postconditions:**
- Immutable once written into the BuildArtifact; carried verbatim through the hash-json + slug-md seal.

### `BuildArtifact`

```typescript
export interface BuildArtifact {
  readonly kind: typeof BUILD_ARTIFACT_KIND;
  readonly upstream: BuildArtifactUpstream;
  readonly runState: BuildRunState;
  readonly taskOutcomes: readonly BuildTaskOutcome[];
  readonly halt?: BuildHaltInfo | undefined;
  readonly filesTouched: readonly string[];
  readonly summary: string;
}
```

**Parameters:**
- `kind: typeof BUILD_ARTIFACT_KIND` — Discriminant tying the record to the build kind for the approval path.
- `upstream: BuildArtifactUpstream` — The PlanArtifact citation block (ac3).
- `runState: BuildRunState` — Re-projected once at finalize from the terminal BuildRunProgress (sc6): 'complete' or 'halted'. Flattened onto the record per the HLD interfaceSketch, not nested under a progress sub-object.
- `taskOutcomes: readonly BuildTaskOutcome[]` — One entry per PlanTask in the plan's order (sc4) — the per-Task status + filesTouched a reviewer reads (ac2).
- `halt: BuildHaltInfo | undefined` _(optional)_ — Present iff runState==='halted'; names the failed Task, reason, and blocked set. The only field that varies between complete and halted runs, so both finalize into the same shape.
- `filesTouched: readonly string[]` — Union of filesTouched across all Tasks (re-projected from sc4/sc6) — the durability guarantee: what actually landed on the tree.
- `summary: string` — One-line human summary of the run outcome for the rendered slug-md header.

**Returns:** `BuildArtifact` — The persistent, citable, approvable flat record the run finalizes into — the single owned type (a1), matching the HLD interfaceSketch verbatim so no amendment to sc7 is needed. Serialised to canonical hash-json and rendered to slug-md with the `insrc:artifact` marker.

**Errors:**
- `n/a (type-level declaration)` when No runtime errors are defined at the type level; malformed-body handling lives in the reused storage.ts/hash.ts writers, unchanged by s5.

**Preconditions:**
- taskOutcomes come verbatim from sc4; run-level fields are re-projected once from the terminal BuildRunProgress (sc6) at finalize.
- upstream is populated from a BuildAdmissionAccepted (sc3) verdict.

**Postconditions:**
- Written through the parent module's reused hash.ts (hash-json) + slug.ts (slug-md) + storage.ts — same durability envelope as every sibling artifact, no new persistence substrate (ac1/c1).
- Grow-in-place: the same flat shape is persisted at every Task boundary and sealed at finalize, so a halted or crashed run still leaves a readable record (ac1/durability NFR).
- Enters gates.ts through the identical approval path as every other workflow artifact, as an additional kind (ac4).

## Data model changes

### `BuildArtifact` — new

A new per-stage artifact-definition module (src/workflow/artifacts/build.ts) mirroring artifacts/plan.ts and artifacts/define.ts — a plain artifact-definition module, no base class, consistent with the module's empty baseClassIdioms. Persisted as a single flat owned type (winning alt a1): run-level scalars (runState/halt/filesTouched/summary) live directly on the record, not nested under a progress sub-object, matching the HLD interfaceSketch verbatim. Written incrementally — the same flat shape grows in place at every Task boundary and is sealed (hash-json + slug-md) at finalize, so complete, halted, and daemon-restart-mid-run cases all leave a readable record. Serves as the durable observability surface (per-Task status, filesTouched, testVerdict, cited PlanArtifact). The exact hash.ts/slug.ts/storage.ts call shapes are UNREAD at design time (cited at module level only) — s5 owns the direct inspection of those writer signatures before implementation.

**Call sites:**
- `src/workflow/artifacts/build.ts`
- `src/workflow/artifacts/plan.ts`
- `src/workflow/hash.ts`
- `src/workflow/slug.ts`
- `src/workflow/storage.ts`
- `src/workflow/gates.ts`

### `BuildArtifactUpstream` — new

The embedded citation block on BuildArtifact carrying planArtifactId/planArtifactHash/storyId/epicId. Populated by mapping a BuildAdmissionAccepted (sc3) verdict directly into the record; rendered in the slug-md so a reviewer can trace the build back to the approved plan (ac3). Immutable once written; carried verbatim through the hash-json seal.

**Call sites:**
- `src/workflow/artifacts/build.ts`
- `src/workflow/runners/build/schemas.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc7` | implements | s5 owns and defines BuildArtifact, BuildArtifactUpstream, and BUILD_ARTIFACT_KIND exactly per the HLD interfaceSketch — flat run-level fields (runState/halt?/filesTouched/summary) on the record, no amendment. Realized as artifacts/build.ts, written via the reused hash.ts (hash-json) + slug.ts (slug-md) + storage.ts writers and offered through gates.ts as an additional kind. Grow-in-place: the identical flat shape is persisted at each Task boundary and sealed at finalize. |
| `sc1` | consumes | s5's finalize turn handler is registered into the build stage's runner registry via registerBuildRunners() (owned by s1) without modifying sc1; the finalize phase is where the BuildArtifact is produced and persisted. |
| `sc2` | consumes | The 'finalize' phase of WorkflowStepInputBuild/WorkflowStepOutputBuild (owned by s1, mirroring handlePlan) drives artifact production; s5's finalize handler returns markdown (the rendered slug-md) and leaves WorkflowStepOutputBuild.progress (the sc6 live view) unaffected by finalizing into the flat owned record. |
| `sc3` | consumes | BuildAdmissionAccepted (planArtifactId/planArtifactHash/storyId, owned by s2) is mapped straight into BuildArtifactUpstream, supplying the ac3 up-the-chain citation. s5 never populates the citation from the implementer's self-report. |
| `sc4` | consumes | BuildTaskOutcome[] (owned by s3) is carried verbatim as BuildArtifact.taskOutcomes — the per-Task status + filesTouched a reviewer reads (ac2). Re-projecting means s5 tracks sc4 field-shape changes, a minor maintenance cost, not a contract break. |
| `sc6` | consumes | BuildRunProgress (owned by s4) is consumed as the live mid-run view; s5 re-projects its run-level fields (runState/halt/filesTouched) once, at finalize, into the immutable BuildArtifact. This is the accepted contained sc6 duplication (a1's sole partial) — a one-time projection into an immutable record, not a continuous second source of truth. |

## Error paths

### Error cases

- **Sealing the finalized BuildArtifact fails because its flat body cannot be canonically serialised or atomically written.** (recoverable)
  - Detection: The reused hash.ts/storage.ts writer throws while producing the hash-json seal — canonical-json serialisation of the flat BuildArtifact body or the atomic file write raises inside the finalize handler.
  - Response: Following the parent module's established precedent (finalize must not abort the run on a malformed body), the throw is caught at the finalize-handler boundary: the last grow-in-place record persisted at the prior Task boundary remains the readable record, and the seal failure is surfaced rather than crashing the run.
  - User impact: The run does not crash; the reviewer still has the last incrementally-persisted record, and the seal failure is reported so the artifact can be re-finalized.
- **runState is re-projected from a BuildRunProgress (sc6) that has not reached a terminal state.** (terminal)
  - Detection: At finalize the handler re-projects runState once from the terminal BuildRunProgress and finds it is neither 'complete' nor 'halted' (still mid-run) — the terminal-state precondition the projection asserts is violated.
  - Response: Finalize refuses to seal a run-level state it cannot project and reports a finalize-precondition violation instead of writing a record with an invented runState; the caller must drive the run to a terminal BuildRunProgress before finalizing.
  - User impact: No misleading record with a fabricated outcome is written; the run must first reach complete/halted.
- **The halt/runState pairing is internally inconsistent — halt present on a complete run, or runState 'halted' with no BuildHaltInfo.** (terminal)
  - Detection: Before sealing, the handler validates the shape invariant that `halt` is present iff runState==='halted'; a mismatch is detected against the projected run-level fields.
  - Response: Finalize rejects the inconsistent record rather than seal a BuildArtifact whose halt block contradicts its runState, so complete and halted runs both finalize into the same well-formed flat shape.
  - User impact: Reviewers never see a record where the halt block and the stated run state disagree.
- **The BuildAdmissionAccepted (sc3) verdict is missing when the upstream citation block is populated.** (terminal)
  - Detection: Populating BuildArtifactUpstream requires a BuildAdmissionAccepted verdict; the finalize handler finds the accepted-admission record absent when it maps planArtifactId/planArtifactHash/storyId/epicId.
  - Response: Finalize aborts producing the record rather than fabricate the ac3 citation from the implementer subprocess's self-report — the up-the-chain trace must pin the exact approved plan revision or the artifact is not written.
  - User impact: The traceability guarantee (ac3) is never satisfied with an unverified citation; the run signals that the approved-plan link is unavailable.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A build run halts on a failed Task — BuildRunState 'halted', BuildHaltInfo names the failed Task, its reason, and the blocked set. | Finalize still seals a hash-json + slug-md BuildArtifact in the identical flat shape, with runState='halted' and the halt block populated; the record is readable, cites the PlanArtifact, and is offered for approval exactly like a complete run (ac1 durability). |
| An admitted run finalizes having executed no Tasks (taskOutcomes empty). | A valid record is still written with taskOutcomes=[] and filesTouched=[]; the summary reflects a no-op run, and the artifact is approvable through the same path — the empty case is a valid record, not an error. |
| Several BuildTaskOutcome entries touch the same file path. | BuildArtifact.filesTouched is the deduplicated union across all Tasks, listing each path exactly once, so the durability view reflects the true set of files that landed on the tree. |
| The daemon restarts after the grow-in-place record was persisted at a Task boundary but before finalize sealed it. | The already-persisted flat record is reloadable and finalize seals it in place; the run leaves a readable, sealed record rather than an untracked partial — the same flat shape survives the restart. |
| A finalized build artifact has not yet passed the gates.ts approval gate. | Downstream treats the unapproved build artifact as absent, exactly as for every other artifact kind (prior-stage precedent: an unapproved artifact is treated as absent downstream) — the build kind gets no special-casing in the approval path. |

### Invariants to preserve

- The build artifact is written through the same reused hash.ts (hash-json) + slug.ts (slug-md) + storage.ts persistence envelope as every sibling artifact, introducing no new persistence substrate — it is a new per-stage artifact definition (artifacts/build.ts), not new writing machinery. Grounded in the s1 capability.reuse-check bundle, which confirms src/workflow already holds executor.ts/gates.ts/hash.ts/slug.ts/storage.ts and that every writer seam s5 needs is reused as-is. [[c1]]
- The stage plugs in by registering its runners (registerBuildRunners) via registerWorkflowRunners, and artifacts/build.ts is a plain artifact-definition module with no base class — never by subclassing. Grounded in the s1 convention.detect bundle, which reports baseClassIdioms empty across both the tracker module and the parent src/workflow and shows the module composes purely via registration functions. [[c1]]
- BUILD_ARTIFACT_KIND enters gates.ts as an ADDITIONAL artifact kind through the identical approval path; the approval semantics of every existing kind (plan/define/design/tracker) are unchanged. Grounded in the s1 doc.constraint.enumerate bundle recording ac4 — the artifact is offered for sign-off through the same approval path as every other workflow artifact, an addition rather than a change to how approval works. [[c2]]
- Even a halted run with a failed Task still finalizes into a ChainReport-style record via the storage.ts/hash.ts/slug.ts writer envelope, never an untracked side-effect; the same flat shape is persisted incrementally at every Task boundary and sealed at finalize. Grounded in the s1 doc.constraint.enumerate bundle, which carries this durability invariant tying s5 to s4/ac3. [[c1]]

## Test strategy

**Test framework:** `node:test via tsx (`npx tsx --test 'src/**/__tests__/*.test.ts'`), *.test.ts files — the pattern test.locate reported for the tracker/workflow/mcp __tests__ dirs`

### Test levels

- **unit** — Exercise artifacts/build.ts in isolation: canonical-json serialisation, slug-md rendering (with the `insrc:artifact` marker), the flat-shape invariants, and the filesTouched projection — no daemon, no real storage, driven by hand-built BuildArtifact values.
  - Subjects: `src/workflow/artifacts/build.ts (BuildArtifact / BuildArtifactUpstream / BUILD_ARTIFACT_KIND definition + canonical-json + slug-md render)`, `filesTouched dedup-union projection across taskOutcomes`, `halt-present-iff-halted shape invariant validation`
  - Fixtures: `A complete-run BuildArtifact fixture (runState='complete', 2-3 BuildTaskOutcome entries, populated upstream citation)`, `A halted-run BuildArtifact fixture (runState='halted', BuildHaltInfo naming the failed Task + blocked set)`, `An empty-run fixture (taskOutcomes=[], filesTouched=[])`, `Overlapping-filesTouched fixture (several BuildTaskOutcome entries touching the same path)`
- **unit** — Exercise the runners/build finalize handler's projection + guard logic: re-project runState/halt/filesTouched once from a terminal BuildRunProgress, populate BuildArtifactUpstream from a BuildAdmissionAccepted verdict, and reject the s5 error-path conditions before sealing.
  - Subjects: `src/workflow/runners/build finalize handler (BuildRunProgress → BuildArtifact projection)`, `BuildArtifactUpstream population from BuildAdmissionAccepted (sc3)`, `finalize preconditions: non-terminal runState refusal, halt/runState inconsistency rejection, missing-admission abort, seal-failure catch-at-boundary`
  - Fixtures: `Terminal BuildRunProgress (complete) and (halted) inputs`, `A non-terminal BuildRunProgress input (still mid-run)`, `An inconsistent projection (halt present on complete / 'halted' with no BuildHaltInfo)`, `A missing BuildAdmissionAccepted verdict`, `A stubbed hash.ts/storage.ts writer that throws on seal to assert the throw is caught and the prior grow-in-place record survives`
- **integration** — Drive the finalize phase end-to-end through the workflow-step surface into the reused hash.ts + slug.ts + storage.ts envelope, then reload from storage — proving the hash-json + slug-md pair is persisted in the same form as sibling artifacts, survives the run ending, is reloadable after a simulated daemon restart, and enters gates.ts as an additional approvable kind.
  - Subjects: `src/workflow/runners/build registered via registerBuildRunners()/registerWorkflowRunners()`, `src/mcp/workflow-step build finalize phase (mirroring handlePlan) returning the rendered slug-md`, `src/workflow/storage.ts write+reload of the build artifact`, `src/workflow/gates.ts approval path for BUILD_ARTIFACT_KIND`
  - Fixtures: `A temp workflow storage root (isolated per test, following the tracker/workflow __tests__ pattern)`, `A processed build run state with a BuildAdmissionAccepted verdict and populated taskOutcomes/BuildRunProgress`, `A grow-in-place record persisted at a Task boundary but not yet sealed (to simulate restart-before-finalize)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: finalize writes a hash-json + slug-md BuildArtifact pair through the reused storage.ts/hash.ts/slug.ts envelope and it reloads from storage after the run ends, in the same form as a sibling (plan) artifact`, `integration: a run halted on a failed Task still finalizes into the identical flat shape (runState='halted', halt block populated) and is reloadable — durability holds for the halted path`, `integration: after a simulated daemon restart, a grow-in-place record persisted at a Task boundary is reloadable and finalize seals it in place rather than leaving an untracked partial`, `unit: an empty run (taskOutcomes=[]) still produces a valid readable record with filesTouched=[] and a no-op summary` |
| `ac2` | `unit: slug-md render lists one entry per Task in plan order with each Task's completion status and its filesTouched`, `unit: BuildArtifact.filesTouched is the deduplicated union across all taskOutcomes (overlapping paths listed exactly once)`, `integration: the reloaded finalized artifact's rendered md exposes per-Task status + filesTouched to a reviewer` |
| `ac3` | `unit: BuildArtifactUpstream is populated from the BuildAdmissionAccepted verdict (planArtifactId/planArtifactHash/storyId/epicId) and never from the implementer self-report, and renders into the slug-md citation block`, `unit: finalize aborts producing the record when the BuildAdmissionAccepted verdict is missing rather than fabricating the citation`, `integration: the reloaded finalized artifact carries the upstream citation pinning the exact approved PlanArtifact revision` |
| `ac4` | `integration: gates.ts offers the finalized BUILD_ARTIFACT_KIND for sign-off through the same approval path as every other kind, with the approval semantics of existing kinds unchanged`, `integration: an unapproved finalized build artifact is treated as absent downstream, exactly as for every other artifact kind` |

## Migration

**State before:** Per the s1 bundles, the workflow chain terminates at the tracker stage and there is no `build` stage or BuildArtifact. The module.profile of src/workflow/tracker (46 entities, exports[]=[], entrypoints[]=[]) and the failed symbol.locate (errorCode prerequisite-empty) establish that finalize is NOT an exported symbol today — it is realized per-stage as a runner + artifact pairing over the parent module's shared writers (hash.ts/slug.ts/storage.ts). test.locate matched no test entity or file named `finalize` anywhere, and no `build` artifact kind exists: gates.ts currently keys the reviewer approval path only on the existing kinds (define/plan/design/tracker), and registerWorkflowRunners at src/workflow/index.ts:23-32 registers only registerDesignEpicRunners/registerDesignStoryRunners (and siblings). There is no artifacts/build.ts, no runners/build subdir, and nothing downstream cites a PlanArtifact from a build record because no build record is ever written — when a code-writing run ends today it leaves no persistent, citable, approvable artifact.

**State after:** A `build` run finalizes into a persistent BuildArtifact written in the same form as every other stage's artifact and surviving the run ending (ac1). The record is a single flat owned type (runState/halt?/filesTouched/summary flattened onto it, taskOutcomes[] carried verbatim from sc4, upstream citation from sc3), defined in a new artifacts/build.ts mirroring artifacts/plan.ts, and sealed through the reused hash.ts (hash-json) + slug.ts (slug-md with the `insrc:artifact` marker) + storage.ts writers — no new persistence substrate. A reviewer reads per-Task completion + filesTouched (ac2) and the cited approved PlanArtifact traceable up the chain (ac3). The record is offered for sign-off through the identical gates.ts approval path as every other workflow artifact, as an ADDITIONAL kind keyed on BUILD_ARTIFACT_KIND, never a change to how existing kinds are approved (ac4). The flat shape is persisted incrementally at each Task boundary and sealed at finalize, so complete, halted (BuildHaltInfo), and daemon-restart-mid-run cases all leave a readable ChainReport-style record.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add a new per-stage artifact-definition module (src/workflow/artifacts/build.ts) declaring the BUILD_ARTIFACT_KIND discriminant, BuildArtifactUpstream, and the flat BuildArtifact type per the HLD interfaceSketch — a plain definition module mirroring artifacts/plan.ts, adding a new kind alongside the existing ones and re-tagging none of them. — ↩ rollbackable
2. Inspect the exact hash.ts/slug.ts/storage.ts writer signatures (UNREAD at design time — cited at module level only) to learn the call shape that produces the hash-json + slug-md pair and persists it, so build.ts seals its record through the same writer envelope as artifacts/plan.ts and the tracker record. — ↩ rollbackable
3. Add the runners/build subdir with its finalize turn handler and schemas.ts, projecting the terminal BuildRunProgress (sc6) once into the immutable BuildArtifact, mapping the BuildAdmissionAccepted (sc3) verdict into BuildArtifactUpstream, and carrying BuildTaskOutcome[] (sc4) verbatim — mirroring the runners/design-story finalize handler. — ↩ rollbackable _(needs: `sc3:BuildAdmissionAccepted (s2)`, `sc4:BuildTaskOutcome (s3)`, `sc6:BuildRunProgress (s4)`)_
4. Register the build kind in gates.ts as an ADDITIONAL approvable kind keyed on BUILD_ARTIFACT_KIND, so the build artifact enters the identical sign-off path (ac4) without altering the discriminant, gate, or approval flow of any existing kind. — ↩ rollbackable
5. Wire registerBuildRunners() into registerWorkflowRunners at src/workflow/index.ts:23-32, appended alongside registerDesignEpicRunners/registerDesignStoryRunners, so the finalize handler is discoverable — an added call that leaves the registry function's void signature and every existing registration unchanged. — ↩ rollbackable
6. Persist the flat BuildArtifact shape incrementally at each Task boundary (grow-in-place) and seal it at finalize into the hash-json + slug-md pair, so a complete run, a halted run (populating the optional halt/BuildHaltInfo field), and a daemon-restart-mid-run all leave a readable record rather than an untracked side-effect. — ↩ rollbackable

**Backward compat:** The change is purely additive at an internal-shared surface (s4 surfaceLevel), so no existing public API signature changes and no consumer is broken. BUILD_ARTIFACT_KIND is a brand-new discriminant literal ('build') that never re-tags an existing kind; gates.ts gains one additional case while the approval gate and discriminant of every existing kind (define/plan/design/tracker) stay byte-for-byte unchanged; registerWorkflowRunners gains one appended registerBuildRunners() call while its `(): void` signature and all prior registrations are untouched. On-disk artifacts written by the earlier stages are read, rendered, and approved exactly as before — the new kind adds a record type, it does not migrate or reshape any existing one. A daemon or reviewer that predates s5 simply never encounters a `build` kind, so no forward-compat shim or dual-read is required; there is nothing to deprecate.

## Alternatives considered

### a1: Flattened self-contained artifact — **CHOSEN**

BuildArtifact owns its run-level scalar fields directly, matching the HLD sketch, with taskOutcomes[] as detail and an embedded upstream citation.

Keep the HLD interfaceSketch verbatim: BuildArtifact carries its own run-level scalars (runState, halt, filesTouched, summary), holds taskOutcomes: readonly BuildTaskOutcome[] (sc4) as the per-Task detail, and an embedded BuildArtifactUpstream citation block (sc7). BuildRunProgress (sc6) is consumed only as the live mid-run view; at finalize, s5 re-projects the terminal run state into the artifact's own owned fields. Incremental persistence writes the same BuildArtifact shape repeatedly (grow-in-place) so the on-disk checkpoint and the finalized record are one type, and the hash-json + slug-md pair is produced from that single type via hash.ts/slug.ts.

### a2: Compose over sc6 (embed BuildRunProgress verbatim)

BuildArtifact embeds the terminal BuildRunProgress snapshot as the single source of run-level truth rather than re-declaring runState/halt/filesTouched.

Shape BuildArtifact as { kind, upstream, progress: BuildRunProgress, taskOutcomes: readonly BuildTaskOutcome[], summary }. Instead of flattening run-level scalars onto the artifact, embed the terminal BuildRunProgress (sc6) snapshot s4 already produces as the single source of run-level truth, and carry taskOutcomes[] (sc4) separately since sc6 holds only task ids, not per-Task outcome detail. s5 formats, hashes, slugs, and persists exactly what s3/s4 hand it — no reshaping of run-level state — and renders the md by reaching through .progress plus taskOutcomes.

**Rejected because:** Cleanest consumption boundary (sc6 satisfies best, s5 does pure format/hash/slug/persist), but loses to a1 on the owned sc7 contract — it forces sc7 to `partial` by nesting run-level scalars under `.progress`, an amendment away from the flat HLD sketch, and couples the persisted+hashed record to another Story's evolving type (sc6). Same S cost as a1 without a1's owned-contract fidelity.

### a3: Two-record model: durable checkpoint plus finalized artifact

Split the incrementally-persisted running checkpoint from the immutable finalize-time BuildArtifact, so durability and the approvable surface are distinct types.

Separate the durability substrate from the review surface. A BuildRunCheckpoint (accumulated taskOutcomes[] + the current BuildRunProgress) is the incrementally-persisted running record written at every Task boundary through storage.ts. The BuildArtifact is the finalize-time crystallization that seals the latest checkpoint and adds the upstream citation (sc7) + summary, then emits the hash-json + slug-md pair via hash.ts/slug.ts. Finalize — complete or halted — reads the terminal checkpoint and produces the approvable artifact; only the sealed BuildArtifact enters gates.ts and the approval path.

**Rejected because:** Best on the durability NFR and approval cleanliness (ac1/ac4), but pushes sc7 to `partial` by introducing a second persisted owned type (BuildRunCheckpoint) that reads as new substrate against k5/c1 ('additional artifact kind, same writers — not new machinery') and enlarges s5's owned+tested surface, at M cost vs S. The durability benefit does not outweigh the added owned surface and substrate risk given a1/a2 already satisfy ac1 with a single type.

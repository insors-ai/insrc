<!-- insrc:artifact PLAN-185807ba9a6b35d3-s5 -->

# Plan: s5

**Epic:** `add-build-workflow-insrc-5th-stage`
**LLD run:** `wf-1784316082755-gh7hjg`
**LLD effective hash:** `6d130af6ef10...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define artifacts/build.ts — BuildArtifact type family, guards, and renderer | M | — | unit: artifacts/build.ts canonical-json + slug-md render over complete-run, halted-run, and empty-run fixtures (asserts `insrc:artifact` marker, per-Task plan-order entries, upstream citation block); unit: filesTouched dedup-union projection over the overlapping-filesTouched fixture (a path touched by several BuildTaskOutcome entries appears exactly once); unit: isBuildBody halt-present-iff-halted invariant: rejects halt-on-complete and runState='halted'-without-BuildHaltInfo, accepts consistent complete/halted records | [[c1]] |
| 2 | **`t2`** Add build* path helpers to storage.ts over the reused writer envelope | S | `t1` | unit: build* path helpers (buildArtifactId/buildArtifactPaths/buildFilenamePrefix/buildMdRel) mirror the plan* helper shape keyed on BUILD_ARTIFACT_KIND, and the plan*/define*/hld*/lld* helpers stay byte-for-byte unchanged | [[c2]] |
| 3 | **`t3`** Register BUILD_ARTIFACT_KIND in gates.ts as an additional approvable kind | M | `t1`, `t2` | integration: gates.ts offers a finalized BUILD_ARTIFACT_KIND for sign-off via the same approveArtifactByJsonPath/rejectArtifactByJsonPath path as sibling kinds, sibling approval semantics unchanged, and an unapproved build artifact is treated as absent downstream | [[c3]] |
| 4 | **`t4`** Implement the runners/build finalize projection and the four precondition guards (pure) | M | `t1` | unit: finalize projection re-projects runState/halt/filesTouched once from terminal BuildRunProgress (complete + halted) and carries taskOutcomes[] verbatim, on pure hand-built values; unit: BuildArtifactUpstream populated only from a BuildAdmissionAccepted verdict (planArtifactId/planArtifactHash/storyId/epicId), never from the implementer self-report; unit: finalize preconditions: non-terminal BuildRunProgress refused with no record, halt/runState inconsistency rejected, missing BuildAdmissionAccepted aborts instead of fabricating the citation | [[c1]] [[c4]] |
| 5 | **`t5`** Grow-in-place incremental checkpoint persistence at each Task boundary | M | `t2` | integration: grow-in-place checkpoint persisted at a Task boundary through storage.ts is independently reloadable before finalize, over complete-run, halted-run (runState='halted' + BuildHaltInfo), and empty-run fixtures | [[c7]] |
| 6 | **`t6`** Finalize seal-in-place over the checkpoint, with restart-safety and seal-failure boundary | M | `t2`, `t4`, `t5` | unit: seal-failure catch-at-boundary: a stubbed storage/hash writer that throws on seal is caught at the handler boundary and the prior grow-in-place checkpoint survives readable; integration: restart-then-finalize: after a simulated daemon restart the last grow-in-place checkpoint is reloaded and finalize seals it in place (hash-json + slug-md) into the identical flat shape, over complete-run and halted-run fixtures | [[c4]] [[c7]] |
| 7 | **`t7`** Add the build finalize phase to the insrc_workflow_step driving surface | M | `t6` | integration: workflow-step build finalize phase (mirroring handlePlan) drives end-to-end into storage, returns WorkflowStepOutputBuild markdown = rendered slug-md / next 'done', and the reloaded hash-json + slug-md pair matches sibling-artifact form and exposes per-Task status/testVerdict/filesTouched + upstream PlanArtifact citation | [[c5]] |
| 8 | **`t8`** Register the finalize handler into the build runner registry and registerWorkflowRunners | S | `t6`, `t7` | integration: registerBuildRunners() registers the finalize handler and registerWorkflowRunners() invokes it alongside its siblings, making the build finalize phase discoverable in the per-stage runner registry while the (): void signature and prior registrations stay unchanged | [[c6]] |

### `t1` — Define artifacts/build.ts — BuildArtifact type family, guards, and renderer

Add the new per-stage artifact-definition module src/workflow/artifacts/build.ts, mirroring artifacts/plan.ts (plain module, no base class). Declare BUILD_ARTIFACT_KIND ('build'), BuildArtifactUpstream, and the flat BuildArtifact (runState/halt?/filesTouched/summary on the record, taskOutcomes[] as detail) exactly per the HLD sc7 interfaceSketch. Add an isBuildBody-style guard enforcing the halt-present-iff-runState==='halted' invariant, the filesTouched dedup-union projection across taskOutcomes, and renderBuildMarkdown producing the slug-md with the `insrc:artifact` marker, one entry per Task in plan order (status + testVerdict + filesTouched), and the BuildArtifactUpstream citation block — this renderer is s5-private and the sole place the PlanArtifact citation is formatted.

**Acceptance checks:**
- src/workflow/artifacts/build.ts exports BUILD_ARTIFACT_KIND ('build'), BuildArtifactUpstream, and BuildArtifact matching the HLD sc7 interfaceSketch verbatim (flat runState/halt?/filesTouched/summary, taskOutcomes[] as detail)
- renderBuildMarkdown emits slug-md carrying the `insrc:artifact` marker, listing one entry per Task in plan order with each Task's status, testVerdict, and its filesTouched
- renderBuildMarkdown emits the BuildArtifactUpstream citation block (planArtifactId/planArtifactHash/storyId/epicId) into the slug-md so a reviewer can trace the run back to the approved PlanArtifact revision
- BuildArtifact.filesTouched is the deduplicated union across taskOutcomes (overlapping paths listed exactly once)
- the body guard rejects a record where halt is present but runState !== 'halted', or runState==='halted' with no BuildHaltInfo
- unit tests over complete-run, halted-run, empty-run, overlapping-filesTouched, and citation-block fixtures pass

### `t2` — Add build* path helpers to storage.ts over the reused writer envelope

Inspect the exact hash.ts (hash-json) / slug.ts (slug-md) / storage.ts writer signatures (unread at design time) and add a parallel build* path-helper set to storage.ts — buildArtifactId/buildArtifactPaths/buildFilenamePrefix/buildMdRel — mirroring the plan*/define*/hld*/lld* siblings and keyed on BUILD_ARTIFACT_KIND, so artifacts/build.ts seals through the identical writer envelope with no new persistence substrate.

**Acceptance checks:**
- storage.ts gains buildArtifactId/buildArtifactPaths/buildFilenamePrefix/buildMdRel helpers mirroring the plan* set and keyed on BUILD_ARTIFACT_KIND
- artifacts/build.ts seals its record through the same hash.ts (hash-json) + slug.ts (slug-md) calls as artifacts/plan.ts — no new persistence substrate introduced
- existing plan*/define*/hld*/lld* path helpers are unchanged

### `t3` — Register BUILD_ARTIFACT_KIND in gates.ts as an additional approvable kind

Add a build reader/upstream/require pairing to gates.ts (readBuildArtifact / readBuildUpstream / requireApprovedBuild-style) keyed on BUILD_ARTIFACT_KIND, so the build artifact enters the identical approve/reject sign-off path as every sibling kind — an addition, never a change to the discriminant, gate, or approval flow of any existing kind (define/plan/design/tracker), and an unapproved build artifact is treated as absent downstream.

**Acceptance checks:**
- gates.ts gains a build reader/upstream/require pairing keyed on BUILD_ARTIFACT_KIND that routes through the same approveArtifactByJsonPath/rejectArtifactByJsonPath approval path as sibling kinds
- the approval semantics of every existing kind (define/plan/design/tracker) are byte-for-byte unchanged — build is an additional case only
- a finalized but unapproved build artifact is treated as absent downstream, exactly as for every other artifact kind

### `t4` — Implement the runners/build finalize projection and the four precondition guards (pure)

Add the pure, storage-free core of the finalize turn handler in runners/build (mirroring the runners/design-story finalize handler): re-project runState/halt/filesTouched once from the terminal BuildRunProgress (sc6), carry BuildTaskOutcome[] (sc4) verbatim into taskOutcomes, and map BuildAdmissionAccepted (sc3) into BuildArtifactUpstream. Enforce the three pre-seal preconditions on hand-built values — non-terminal runState → precondition violation (no record produced); halt/runState inconsistency → reject; missing BuildAdmissionAccepted → abort rather than fabricate the citation. Depends on t1 only; the seal + writer-throw boundary is split out to t6 where the t2 storage seam and the t5 checkpoint exist.

**Acceptance checks:**
- the finalize handler re-projects runState/halt/filesTouched once from the terminal BuildRunProgress (sc6) and carries taskOutcomes[] verbatim from sc4, exercised on hand-built fixture values with no storage dependency
- BuildArtifactUpstream (planArtifactId/planArtifactHash/storyId/epicId) is populated only from a BuildAdmissionAccepted verdict (sc3), never from the implementer subprocess self-report
- a non-terminal BuildRunProgress is refused with a finalize-precondition violation (no record produced); a halt/runState inconsistency is rejected; a missing BuildAdmissionAccepted aborts rather than fabricating the citation
- unit tests over terminal (complete/halted), non-terminal, inconsistent-projection, and missing-admission fixtures pass — all on pure values without the storage seam

### `t5` — Grow-in-place incremental checkpoint persistence at each Task boundary

Persist the flat BuildArtifact shape incrementally at each Task boundary (grow-in-place) through the t2 storage helpers, so a run in flight always has a readable, independently-reloadable checkpoint rather than an untracked partial — the durability guarantee that naming what landed on the tree survives before finalize. Cover the complete, halted (populating the optional halt/BuildHaltInfo field), and empty paths in the same flat shape. Depends on t2 (storage helpers); no dependency on the finalize handler.

**Acceptance checks:**
- the flat BuildArtifact shape is persisted incrementally at each Task boundary (grow-in-place) via storage.ts through the same envelope as sibling kinds
- a checkpoint persisted at a Task boundary is independently reloadable from storage before finalize (durability during the run)
- the halted path persists the identical flat shape with runState='halted' and the BuildHaltInfo block populated
- unit tests over complete-run, halted-run, and empty-run checkpoint fixtures pass

### `t6` — Finalize seal-in-place over the checkpoint, with restart-safety and seal-failure boundary

Wire the t4 finalize projection/guards to the t5 grow-in-place checkpoint: finalize reloads the last checkpoint and seals it in place via storage.ts (hash-json + slug-md) rather than leaving an untracked partial, so complete runs, halted runs, and a daemon-restart-mid-run all resolve to a sealed readable record. Catch a writer throw on seal at the handler boundary so the prior grow-in-place checkpoint survives readable. Depends on t2 (writer envelope), t4 (projection/guards), and t5 (the checkpoint the seal and error path rely on).

**Acceptance checks:**
- finalize reloads the last grow-in-place checkpoint and seals it in place via storage.ts (hash-json + slug-md) rather than producing a fresh untracked record
- a writer throw on seal is caught at the handler boundary and the prior grow-in-place checkpoint record survives readable
- after a simulated daemon restart mid-run the last checkpoint is reloaded and finalize seals it in place; the halted-run path reloads and seals into the identical flat shape
- unit tests over seal-success, throwing-writer, and restart-then-finalize (complete + halted) fixtures pass

### `t7` — Add the build finalize phase to the insrc_workflow_step driving surface

Add a finalize branch to the workflow-step build phase handler (phases/build.ts) mirroring handlePlan's finalize, returning WorkflowStepOutputBuild with markdown set to the rendered slug-md and next 'done', leaving the sc6 live progress view unaffected. Drive finalize end-to-end through the workflow-step surface into the reused hash.ts + slug.ts + storage.ts envelope so the hash-json + slug-md pair is produced and reloadable in the same form as sibling artifacts.

**Acceptance checks:**
- phases/build.ts gains a finalize branch mirroring handlePlan that returns WorkflowStepOutputBuild with markdown = the rendered slug-md and next 'done'
- an integration test drives the finalize phase end-to-end through the workflow-step surface into storage and reloads the hash-json + slug-md pair in the same form as a sibling (plan) artifact
- the reloaded finalized artifact's rendered md exposes per-Task status + testVerdict + filesTouched and the upstream PlanArtifact citation to a reviewer

### `t8` — Register the finalize handler into the build runner registry and registerWorkflowRunners

Register the s5 finalize turn handler (t4 projection/guards + t6 seal) into the build stage's runner registry via registerBuildRunners() (the s1-owned entrypoint), and ensure registerWorkflowRunners() at src/workflow/index.ts invokes registerBuildRunners() alongside registerDesignEpicRunners/registerDesignStoryRunners so the finalize handler is discoverable — an appended call that leaves the registry function's (): void signature and every existing registration untouched.

**Acceptance checks:**
- the s5 finalize turn handler is registered into the build runner registry via registerBuildRunners()
- registerWorkflowRunners() at src/workflow/index.ts invokes registerBuildRunners() alongside its siblings; the (): void signature and all prior registrations are unchanged
- the build stage's finalize phase is discoverable in the per-stage workflow runner registry

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/workflow/artifacts/build.ts (BuildArtifact / BuildArtifactUpstream / BUILD_ARTIFACT_KIND definition + canonical-json + slug-md render) | `t1` |
| filesTouched dedup-union projection across taskOutcomes | `t1` |
| halt-present-iff-halted shape invariant validation | `t1` |
| src/workflow/runners/build finalize handler (BuildRunProgress → BuildArtifact projection) | `t4`, `t6` |
| BuildArtifactUpstream population from BuildAdmissionAccepted (sc3) | `t4` |
| finalize preconditions: non-terminal runState refusal, halt/runState inconsistency rejection, missing-admission abort, seal-failure catch-at-boundary | `t4`, `t6` |
| src/workflow/runners/build registered via registerBuildRunners()/registerWorkflowRunners() | `t8` |
| src/mcp/workflow-step build finalize phase (mirroring handlePlan) returning the rendered slug-md | `t7` |
| src/workflow/storage.ts write+reload of the build artifact | `t2`, `t5`, `t6`, `t7` |
| src/workflow/gates.ts approval path for BUILD_ARTIFACT_KIND | `t3` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s5 artifacts/build.ts — BuildArtifact / BuildArtifactUpstream / BUILD_ARTIFACT_KIND definition, halt-present-iff-halted guard, filesTouched dedup-union, and renderBuildMarkdown (slug-md with insrc:artifact marker + per-Task plan-order entries + upstream citation block)`
- **[[c2]]** `prior-artifact` `LLD s5 storage.ts — build* path helpers (buildArtifactId/buildArtifactPaths/buildFilenamePrefix/buildMdRel) keyed on BUILD_ARTIFACT_KIND over the reused hash.ts (hash-json) + slug.ts (slug-md) writer envelope`
- **[[c3]]** `prior-artifact` `LLD s5 gates.ts — build reader/upstream/require pairing keyed on BUILD_ARTIFACT_KIND routing through the shared approveArtifactByJsonPath/rejectArtifactByJsonPath sign-off path; unapproved build treated as absent downstream`
- **[[c4]]** `prior-artifact` `LLD s5 runners/build — finalize projection (runState/halt/filesTouched re-projected once from terminal BuildRunProgress sc6; taskOutcomes[] from sc4; BuildArtifactUpstream from BuildAdmissionAccepted sc3) plus the pre-seal precondition guards and seal / writer-throw boundary`
- **[[c5]]** `prior-artifact` `LLD s5 mcp/workflow-step phases/build.ts — finalize branch mirroring handlePlan returning WorkflowStepOutputBuild (markdown = rendered slug-md, next 'done') driving end-to-end into the storage envelope`
- **[[c6]]** `prior-artifact` `LLD s5 registerBuildRunners() / registerWorkflowRunners() — registering the finalize turn handler into the build stage runner registry alongside the design-epic/design-story siblings, (): void signature and prior registrations untouched`
- **[[c7]]** `prior-artifact` `LLD s5 grow-in-place incremental checkpoint persistence — flat BuildArtifact persisted at each Task boundary via storage.ts, independently reloadable before finalize (complete/halted/empty paths), the durability substrate the seal-in-place reloads`

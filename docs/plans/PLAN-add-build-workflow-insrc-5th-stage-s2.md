<!-- insrc:artifact PLAN-185807ba9a6b35d3-s2 -->

# Plan: s2

**Epic:** `add-build-workflow-insrc-5th-stage`
**LLD run:** `wf-1784306027950-xa0wsh`
**LLD effective hash:** `6d130af6ef10...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add build/schemas.ts with the BuildAdmissionResult discriminated union (sc3) | S | — | unit: BuildAdmissionResult discriminates on `admitted`; the accepted branch constructs with only {planArtifactId, planArtifactHash, storyId} and no PlanArtifact body; unit: BuildAdmissionRefusal types treeUntouched as the literal true and staleness as an optional inline {planRecordedDesignHash, currentDesignHash}; unit: BuildRefusalReason accepts exactly 'plan-missing' \\| 'plan-unapproved' \\| 'plan-stale' and nothing else | [[c1]] |
| 2 | **`t2`** Add the build-private non-throwing approval wrapper over the gates.ts accessor | M | `t1` | unit: approval wrapper maps a thrown ArtifactNotApprovedError to a verdict carrying reason:'plan-unapproved'; unit: approval wrapper maps a thrown ArtifactMissingError to a verdict carrying reason:'plan-missing'; unit: approval wrapper re-throws an unrelated store/IO Error rather than swallowing it into a modeled refusal reason; unit: guard: the approval wrapper is not present on build/'s public exported surface | [[c3]] [[c2]] |
| 3 | **`t3`** Add the build-private plan-vs-design.story drift comparator | M | `t1` | unit: drift comparator yields reason:'plan-stale' with inline staleness={planRecordedDesignHash, currentDesignHash} when recorded differs from current design hash; unit: drift comparator treats a recorded design hash equal to the current design.story hash as fresh (no 'plan-stale' verdict); unit: drift comparator conservatively yields 'plan-stale' when the recorded design hash is empty/absent; unit: drift comparator returns a typed verdict without throwing, and guard: it is not re-exported from build/'s public surface | [[c4]] [[c2]] |
| 4 | **`t4`** Add build/index.ts exporting admitBuild composing the gate verdict | M | `t2`, `t3` | unit: admitBuild returns {admitted:true} with only the thin {planArtifactId, planArtifactHash, storyId} pointer when the plan is approved and the recorded design hash equals the current design.story hash (incl. the equality boundary); unit: admitBuild evaluates approval before staleness: an unapproved AND drifted plan returns the single reason 'plan-unapproved' and the drift comparison is not computed; unit: admitBuild returns 'plan-missing' (precedence over staleness) when a Story has a current design but no plan record — never 'plan-stale' or an empty admitted run; unit: admitBuild returns 'plan-stale' with inline staleness for a drifted or empty-recorded approved plan, and every refusal reports treeUntouched===true with the working tree byte-identical before/after; unit: admitBuild propagates unmodeled errors (malformed epicHash, corrupt plan body, missing current design.story) rather than remapping them to a modeled refusal reason | [[c5]] |
| 5 | **`t5`** Wire admitBuild into the build phase handler as the start-turn gate | M | `t4` | integration: build phase handler invokes admitBuild at the start turn and emits next:'refused' carrying the BuildAdmissionRefusal (plan-missing / plan-unapproved / plan-stale) in WorkflowStepOutputBuild.refusal when admitted is false; integration: build phase handler lets the stage proceed with no next:'refused' when admitBuild returns admitted:true; integration: WorkflowStepOutputBuild.refusal (reason, message, and inline staleness) survives JSON serialization across the insrc_workflow_step turn boundary intact | [[c6]] |

### `t1` — Add build/schemas.ts with the BuildAdmissionResult discriminated union (sc3)

Create the new file src/workflow/runners/build/schemas.ts, purely additive with no edits to existing types. Define the flat BuildRefusalReason enum ('plan-missing' | 'plan-unapproved' | 'plan-stale'), the thin BuildAdmissionAccepted record ({planArtifactId, planArtifactHash, storyId}), the BuildAdmissionRefusal interface (reason, s2-authored message, optional inline staleness {planRecordedDesignHash, currentDesignHash} present only for 'plan-stale', and the treeUntouched:true structural invariant), and the BuildAdmissionResult union {admitted:true, plan} | {admitted:false, refusal}. Implement verbatim from the HLD interfaceSketch; keep the accepted branch thin (no full PlanArtifact — a4 rejected).

**Acceptance checks:**
- src/workflow/runners/build/schemas.ts exists and exports BuildRefusalReason, BuildAdmissionAccepted, BuildAdmissionRefusal, and BuildAdmissionResult
- BuildAdmissionResult is a discriminated union keyed on `admitted`; the accepted branch carries only {planArtifactId, planArtifactHash, storyId} and no PlanArtifact body
- BuildAdmissionRefusal has treeUntouched typed as the literal `true` and staleness typed as an optional inline literal {planRecordedDesignHash, currentDesignHash} | undefined
- BuildRefusalReason is a flat union of exactly 'plan-missing' | 'plan-unapproved' | 'plan-stale'
- No existing type is modified; the module is additive and type-checks under strict + exactOptionalPropertyTypes

### `t2` — Add the build-private non-throwing approval wrapper over the gates.ts accessor

Inside src/workflow/runners/build/, add a build-private wrapper that calls the existing requireApprovedLld-family accessor against the plan artifact and catches by error class: `instanceof ArtifactNotApprovedError` yields reason:'plan-unapproved' (ac2), `instanceof ArtifactMissingError` yields reason:'plan-missing' (ac4). Any error matching neither class must fall through the discriminator and re-throw (never swallowed into a modeled reason). Precondition (folded in from the c2 de-risking, no longer a standalone task): confirm from gates.ts:44-56 which error the accessor throws for missing vs unapproved and its real signature, so this wrapper is built against the actual accessor rather than an assumed one. Does NOT modify gates.ts and does NOT change requireApprovedLld's throwing contract for its existing callers — the non-throwing form is contained here only. The wrapper is private to build/ and never re-exported.

**Acceptance checks:**
- The wrapper calls the actual requireApprovedLld-family accessor from gates.ts (matching gates.ts:44-56) rather than an assumed signature
- ArtifactNotApprovedError is caught and mapped to a verdict carrying reason:'plan-unapproved'
- ArtifactMissingError is caught and mapped to a verdict carrying reason:'plan-missing'
- An unrelated store/IO error (neither ArtifactMissingError nor ArtifactNotApprovedError) re-throws rather than being mapped to a modeled refusal reason
- gates.ts is unchanged and requireApprovedLld retains its throwing contract for existing callers
- The wrapper is not part of build/'s public exported surface

### `t3` — Add the build-private plan-vs-design.story drift comparator

Inside src/workflow/runners/build/, add a private comparator that reads the plan's recorded upstream design hash via the existing readPlanUpstream and the current design.story artifact hash via the existing readLldArtifact, then compares them, mirroring scanLldStaleness's return-a-typed-verdict-don't-throw discipline. On drift it produces reason:'plan-stale' with inline staleness {planRecordedDesignHash, currentDesignHash}; equal hashes count as fresh (not drifted); an empty/absent recorded design hash conservatively refuses as 'plan-stale' since freshness cannot be positively established. Precondition (folded in from the c2 de-risking): confirm the real signatures of readPlanUpstream (gates.ts:250-269) and readLldArtifact, and confirm scanLldStaleness (staleness.ts:60-119) returns a typed verdict without throwing and compares LLD-vs-HLD, so it is used only as a pattern source. It does NOT call scanLldStaleness and does NOT generalize it into shared amendments/staleness.ts (a3 rejected). The comparator stays private to build/ and is never re-exported; scanLldStaleness and its callers (chain.ts::readStoryLldStatus, cli/services/workflow.ts::staleness) remain untouched.

**Acceptance checks:**
- The comparator reads the recorded upstream design hash via the actual readPlanUpstream and the current hash via the actual readLldArtifact (matching gates.ts:250-269)
- A recorded upstream design hash differing from the current design.story hash yields reason:'plan-stale' with inline staleness={planRecordedDesignHash, currentDesignHash}
- Equality of recorded and current design hashes is treated as fresh (no 'plan-stale' verdict)
- An empty/absent recorded design hash conservatively yields reason:'plan-stale' rather than admitting
- The comparator returns a typed verdict without throwing and neither calls scanLldStaleness nor edits amendments/staleness.ts
- The comparator is private to src/workflow/runners/build/ and is not re-exported; chain.ts and cli/services/workflow.ts staleness callers are unmodified

### `t4` — Add build/index.ts exporting admitBuild composing the gate verdict

Add src/workflow/runners/build/index.ts exporting admitBuild(repoPath, storyId): BuildAdmissionResult, mirroring runners/plan/index.ts::upstream. Resolve epicHash via the existing computeEpicHash (whose signature is confirmed here per the c2 de-risking), then compose in fixed order: approval wrapper (t2) evaluated before staleness — plan-missing (ac4) and plan-unapproved (ac2) short-circuit before any drift comparison — then the drift comparator (t3) for plan-stale (ac3). Return admitted:true with the thin {planArtifactId, planArtifactHash, storyId} pointer when approved and non-drifted (ac1), else admitted:false with the appropriate BuildAdmissionRefusal (staleness populated only for 'plan-stale'). Non-throwing for all four modeled conditions; read-only so treeUntouched:true is structural. Unmodeled errors (malformed epicHash via assertEpicHash, corrupt plan body, missing current design.story) propagate rather than being remapped. Adds no second stage registration.

**Acceptance checks:**
- admitBuild(repoPath, storyId) resolves epicHash via computeEpicHash and returns BuildAdmissionResult for all four modeled conditions without throwing
- Approval is evaluated before staleness: an unapproved-and-drifted plan returns the single reason 'plan-unapproved' and the drift comparison is not computed
- 'plan-missing' takes precedence over staleness: a Story with a current design but no plan record returns 'plan-missing', never 'plan-stale' or an empty admitted run
- admitted:true carries only the thin {planArtifactId, planArtifactHash, storyId} pointer with no PlanArtifact body
- Every refusal reports treeUntouched===true with the working tree byte-identical before and after the call; unmodeled errors (malformed epicHash, corrupt plan body, missing current design.story) propagate rather than mapping to a modeled reason
- index.ts adds no second stage registration and mirrors the runners/plan/index.ts structure

### `t5` — Wire admitBuild into the build phase handler as the start-turn gate

Wire src/mcp/workflow-step/phases/build.ts (the s1-owned driving surface) to invoke admitBuild at the start turn and translate admitted:false into next:'refused', carrying the serializable BuildAdmissionRefusal in WorkflowStepOutputBuild.refusal — mirroring phases/plan.ts::handlePlan. admitted:true lets the stage proceed with no next:'refused'. Consumes s1's sc1 (registerBuildRunners) and sc2 (WorkflowStepInputBuild/OutputBuild + types.ts additions), which must already be landed — this task is ordered after them per storyDependsOn:[s1]. s2 adds no bespoke command, IPC method, or UI; the turn shape is s1's. The refusal payload must survive JSON serialization across the insrc_workflow_step turn boundary intact.

**Acceptance checks:**
- The build phase handler invokes admitBuild at the start turn and emits next:'refused' carrying BuildAdmissionRefusal in WorkflowStepOutputBuild.refusal when admitted is false
- admitted:true lets the stage proceed with no next:'refused'
- The refusal payload (including reason, message, and any staleness detail) survives JSON serialization across the insrc_workflow_step turn boundary intact
- The handler mirrors phases/plan.ts::handlePlan and consumes s1's sc1/sc2 without adding a bespoke command, IPC method, or UI; no sibling stage's behaviour changes
- Reverting only this handler wiring restores the pre-gate behaviour without touching any other stage

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| admitBuild (src/workflow/runners/build/index.ts) | `t4` |
| BuildAdmissionResult / BuildAdmissionRefusal (src/workflow/runners/build/schemas.ts) | `t1`, `t4` |
| build-private non-throwing approval wrapper over requireApprovedLld family | `t2` |
| build-private plan-vs-design.story drift comparator (private to src/workflow/runners/build/) | `t3` |
| src/mcp/workflow-step/phases/build.ts (build phase handler) | `t5` |
| WorkflowStepOutputBuild.refusal round-trip (src/mcp/workflow-step/types.ts) | `t5` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s2 BuildAdmissionResult / BuildAdmissionRefusal (src/workflow/runners/build/schemas.ts)`
- **[[c2]]** `prior-artifact` `LLD s2 accessor-signature de-risking precondition (gates.ts:44-56 requireApprovedLld family, gates.ts:250-269 readPlanUpstream/readLldArtifact, staleness.ts:60-119 scanLldStaleness, computeEpicHash)`
- **[[c3]]** `prior-artifact` `LLD s2 build-private non-throwing approval wrapper over requireApprovedLld family`
- **[[c4]]** `prior-artifact` `LLD s2 build-private plan-vs-design.story drift comparator (private to src/workflow/runners/build/)`
- **[[c5]]** `prior-artifact` `LLD s2 admitBuild (src/workflow/runners/build/index.ts)`
- **[[c6]]** `prior-artifact` `LLD s2 src/mcp/workflow-step/phases/build.ts (build phase handler) + WorkflowStepOutputBuild.refusal round-trip (src/mcp/workflow-step/types.ts)`

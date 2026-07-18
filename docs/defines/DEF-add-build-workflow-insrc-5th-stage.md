<!-- insrc:artifact DEF-185807ba9a6b35d3 -->

# Epic: Once a Story's plan is approved, the chain stops.

**Flavor:** enhancement
**Tracker:** [insors-ai/insrc#1](https://github.com/insors-ai/insrc/issues/1)

## Problem

Once a Story's plan is approved, the chain stops. The approved breakdown of ordered, sized, dependency-labelled Tasks is the last thing the system knows about that Story: nothing in insrc consumes it, so the work of actually turning those Tasks into working code happens entirely outside the chain. That has three consequences. First, there is no gate — implementation can begin against a plan that was never approved, or one that has drifted out of date relative to the Story design it was derived from, and nothing notices. Second, the dependency order the plan spent an entire stage establishing is advisory only; nothing holds the work to it, so Tasks can be done out of order or half-done without that being visible. Third, the outcome is untracked: what was implemented, which Tasks succeeded, which files changed, and whether the tests the plan called for actually pass all live as unreviewable side-effects on somebody's working tree rather than as a cited, approvable record like every earlier stage produces. The four stages before this one each end in a persistent artifact a reviewer can approve; the moment real code is written, that discipline disappears — which is exactly the moment it matters most.

## Non-goals

- **Producing, reordering, re-sizing, or re-deriving the Task breakdown itself** — The upstream `plan` Epic already owns producing the breakdown — all five of its stories concern producing it, none concern executing it [[c11]]. This Epic begins where that one ends: it consumes the approved PlanArtifact as a fixed, gated input rather than reopening it.
- **Building new workflow skeleton machinery — a step-runner registry, decompose/synthesize/finalize seams, gate evaluation, or the hash-json / slug-md writing machinery** — The capability probe returned a clear match: src/workflow already holds executor.ts, gates.ts, hash.ts, slug.ts plus runners/ and artifacts/ — every named seam [[c2]] [[c6]]. This Epic instantiates that skeleton; rebuilding any of it would be duplication.
- **The 6th stage (`test`) of the define→design→plan→build→test chain** — The raw ask scopes this to the 5th stage. Making a Task's stated tests pass is in scope as part of implementing that Task; a separate test stage with its own gate, artifact and runner is a distinct problem.
- **Changing how the other four stages (define / design.epic / design.story / plan) behave** — They are the mirrored precedent this stage follows [[c8]] [[c9]] [[c10]]. Modifying them widens blast radius without addressing the gap, and the convention pass confirms stages plug in by registering rather than by altering shared inheritance [[c12]].
- **An alternative driving surface — a bespoke CLI command, IPC method, or UI for running the build stage** — The ask specifies driving via insrc_workflow_step, the existing surface every other stage uses [[c5]]. A second surface would fork the contract.

## Assumptions

- `med` A Story's approved PlanArtifact is the sole input this stage needs — the ordered, sized, dependency-labelled Tasks in it are sufficient to drive implementation without re-consulting the LLD directly. [[c6]]
- `med` The staleness signal the gate needs (plan hash versus the LLD it was derived from) is already computable from the existing hash machinery rather than needing a new mechanism. [[c3]]
- `low` The gate's exact shape for 'approved + non-stale upstream plan' is unverified — no exploration located gates.ts / hash.ts / slug.ts entities by name, so those files are cited at module level only and their internal APIs must be read directly during design. [[c13]]
- `low` The skeleton's decompose/synthesize/finalize seams may not fit a code-EDITING stage. Every runner that exists (define, design-epic, design-story, plan, tracker, stub) and every artifact (define.ts, hld.ts, lld.ts, plan.ts, tracker.ts) corresponds to a stage that emits documents; nothing demonstrates the skeleton has hosted a stage that edits code and runs tests. This is the primary reason the scope is L. [[c14]]
- `high` A new stage plugs in by registering rather than by subclassing — convention.detect found baseClassIdioms empty across 507 sampled entities, and the module composes via registration functions. [[c12]]
- `high` registerWorkflowRunners at src/workflow/index.ts:23-32 is the single concrete integration point for a new runner — symbol.locate returned exactly one hit for that name. [[c1]]
- `high` handlePlan in src/mcp/workflow-step/phases/plan.ts and WorkflowStepInputPlan in types.ts are the closest analogues a build phase handler and input type would mirror. [[c7]]
- `med` File naming should follow the visible neighbours (tracker-auto.ts, design-epic/, state-store.ts read kebab-case) rather than the convention pass's reported snake_case signal, which its own cited filenames contradict. [[c12]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | contract | The stage must refuse to touch code when its upstream plan is unapproved or stale, and must report which upstream condition failed. | [[c15]] |
| `k2` | invariant | No Task may start before the Tasks it depends on have completed — the plan's dependency order is binding, not advisory, and Tasks are implemented one at a time. | [[c15]] |
| `k3` | contract | The run must finalize into a hash-json + slug-md artifact recording per-Task outcome and files touched, citing the PlanArtifact it derived from, and be offered for approval like every other workflow artifact. | [[c15]] |
| `k4` | contract | The runner must be present in the registry alongside define/design.epic/design.story/plan after registerWorkflowRunners() runs, and insrc_workflow_step must accept a `build` phase input mirroring the existing plan phase handler. | [[c1]] |
| `k5` | convention | A new stage is added as a runners/build subdir plus an artifacts/build.ts — not as new skeleton machinery; hash.ts and slug.ts are reused from the parent module. | [[c3]] |
| `k6` | convention | Integration is by registration function (registerBuildRunners, mirroring registerDesignEpicRunners / registerDesignStoryRunners), not by inheritance. | [[c10]] |
| `k7` | convention | Functions are camelCase (292 of 311 sampled), classes PascalCase (106 of 106), test files follow *.test — with test dirs at src/workflow/__tests__ and src/mcp/workflow-step/__tests__. | [[c12]] |
| `k8` | convention | Any LLM interaction the stage performs goes through the LLMProvider interface — never Promise.all across provider calls, always serial for...of; and no direct cloud REST (cloud access is via the claude/codex CLI subprocesses). | [[c16]] |
| `k9` | invariant | executor.ts and orchestrator.ts must be inspected directly before planning — the clear-match/partial verdicts cover the registry, gate and artifact seams only and are not evidence those two files fit a code-editing workload. | [[c14]] |

## Stories

### s1: Start a `build` run for a Story through the same workflow interface as every other stage

**User value:** `size: M`

A developer who has an approved plan for a Story can begin implementation the same way they began every earlier stage — no new command, no separate surface to learn — and the system recognises `build` as a first-class stage of the chain rather than an off-chain activity.

**Extends:** [[c2]] [[c4]]

**Acceptance criteria:**

- **ac1:** Given a daemon that has completed its workflow runner registration, when a developer lists the workflow stages available to them, then `build` appears alongside define, design.epic, design.story and plan, described as the stage that implements an approved Story plan. _(operationalizes `k4`, `k6`)_
- **ac2:** Given a Story identified to the workflow interface, when the developer starts the `build` stage for it through the same multi-turn workflow interface used by the plan stage, then the run is accepted and driven through the same start / decompose / synthesize / finalize turn shape a developer already knows from the earlier stages, with no bespoke command, IPC method or UI required. _(operationalizes `k4`)_
- **ac3:** Given a `build` run in progress, when the developer inspects how the stage was assembled, then it is composed the same way its sibling stages are — plugged in as a registered stage rather than by altering the behaviour of define, design.epic, design.story or plan. _(operationalizes `k5`, `k6`)_

**Local constraints:**

- `c1` (convention) The stage is added as a sibling of the existing per-stage runners and artifact definitions; the shared skeleton (gate evaluation, artifact hashing, slug writing, decompose/synthesize/finalize seams) is instantiated, not rebuilt. [[c3]]

### s2: Refuse to touch code when the Story's plan is unapproved or stale

**User value:** `size: M`

A developer can never accidentally implement against a breakdown nobody signed off on, or one that has drifted away from the Story design it came from — the system stops first and says exactly which condition failed, so the fix is obvious and the working tree is untouched.

**Depends on:** `s1`

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given a Story whose plan has been approved and has not drifted from the Story design it was derived from, when a developer starts the `build` stage for that Story, then the run is admitted and proceeds. _(operationalizes `k1`)_
- **ac2:** Given a Story whose plan exists but has never been approved, when a developer starts the `build` stage for that Story, then the run is refused, the developer is told the plan is unapproved, and no file in the repository is modified. _(operationalizes `k1`)_
- **ac3:** Given a Story whose plan was approved but whose upstream Story design has since changed, leaving the plan stale, when a developer starts the `build` stage for that Story, then the run is refused, the developer is told the plan is stale relative to the design it came from, and no file in the repository is modified. _(operationalizes `k1`)_
- **ac4:** Given a Story with no plan at all, when a developer starts the `build` stage for that Story, then the run is refused with the missing upstream named, rather than starting an empty run. _(operationalizes `k1`)_

**Local constraints:**

- `c1` (invariant) The exact conditions the gate reads for 'approved' and 'non-stale' must be confirmed against the existing gate and hash machinery before this behaviour is designed — no exploration verified their internal shape. [[c13]]

### s3: Implement the plan's Tasks one at a time in the order the plan established

**User value:** `size: XL`

The dependency order the plan stage spent a whole stage establishing actually governs the work: a developer watching the run sees each Task implemented and its stated tests brought to passing before the next begins, so nothing is built on top of something that isn't there yet.

**Depends on:** `s2`

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given an admitted `build` run for a Story whose plan holds several ordered, dependency-labelled Tasks, when the run begins, then those Tasks — exactly as the approved plan states them, in the order and with the dependencies it recorded — become the run's work list, with nothing added, dropped or reordered. _(operationalizes `k2`)_
- **ac2:** Given a work list in which one Task depends on another, when the run proceeds, then the depended-upon Task is implemented and complete before the dependent Task is started. _(operationalizes `k2`)_
- **ac3:** Given a work list of several Tasks, when the run proceeds, then exactly one Task is being worked at any moment — Tasks are never implemented concurrently, even where their dependencies would permit it. _(operationalizes `k2`, `k8`)_
- **ac4:** Given a Task that is being worked, when the run implements it, then code is edited and the tests that Task stated are brought to passing before the Task is treated as complete. _(operationalizes `k2`)_
- **ac5:** Given a `build` run that reasons about a Task before editing code, when it consults a language model to do so, then it does so one call at a time through the system's existing provider abstraction, never issuing provider calls in parallel and never reaching a cloud service directly. _(operationalizes `k8`)_

**Local constraints:**

- `c1` (invariant) Whether the existing decompose/synthesize/finalize seams can host a stage that edits code and runs tests — rather than one that emits a document — is unproven and must be established before this behaviour is designed. [[c14]]
- `c2` (contract) The approved plan is a fixed input: the run consumes the Tasks as ordered, sized and dependency-labelled, and never reorders, re-sizes or re-derives them. [[c11]]

### s4: Halt and report when a Task cannot be completed, instead of pressing on

**User value:** `size: M`

When a Task's tests won't pass, the developer finds out at that Task — with the run stopped and the state of the work so far recorded — rather than discovering a half-built Story after the run silently continued over broken ground.

**Depends on:** `s3`

**Acceptance criteria:**

- **ac1:** Given a run working a Task whose stated tests cannot be brought to passing, when the run gives up on that Task, then the Task is recorded as not completed, and no Task that depends on it is started. _(operationalizes `k2`)_
- **ac2:** Given a run that has halted on a failed Task, when the developer inspects the run, then they are told which Task failed and what was left in place by the Tasks completed before it, without having to reconstruct that from the working tree. _(operationalizes `k2`, `k3`)_
- **ac3:** Given a run in which some Tasks completed and one failed, when the run ends, then it still finalizes into a record of what happened rather than ending as an untracked side-effect. _(operationalizes `k3`)_

### s5: Finalize the run into a reviewable, approvable record of what was built

**User value:** `size: M`

The moment real code gets written stops being the moment the chain's review discipline disappears: a reviewer gets the same kind of cited, approvable artifact the four earlier stages produce, saying which Tasks succeeded and which files changed.

**Depends on:** `s3`, `s4`

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given a `build` run that has processed its Tasks, when the run finalizes, then a persistent artifact is written in the same form as every other stage's artifact, and it survives the run ending. _(operationalizes `k3`, `k5`)_
- **ac2:** Given a finalized `build` run, when a reviewer reads its artifact, then they can see, per Task, whether it completed and which files it touched. _(operationalizes `k3`)_
- **ac3:** Given a finalized `build` run, when a reviewer reads its artifact, then it cites the approved plan it was derived from, so the record is traceable back up the chain. _(operationalizes `k3`)_
- **ac4:** Given a finalized `build` artifact, when the reviewer is asked to sign off, then it is offered for approval through the same approval path as every other workflow artifact. _(operationalizes `k3`)_

**Local constraints:**

- `c1` (convention) The artifact is written through the same persistence and slug machinery the earlier stages' artifacts use, as a new per-stage artifact definition rather than new writing machinery. [[c3]]

## Open questions

- Item a2: The Epic has no `openQuestions` at all, so neither low-confidence assumption maps to one. Both low-confidence items — the unverified gate/hash/slug internals (source c13) and the unproven fit of the decompose/synthesize/finalize seams for a code-editing stage (source c14) — are instead carried as constraint k9 and as Story localConstraints on s2 and s3. That is a reasonable resting place for them, but it is not what this item asks for: the checklist requires an openQuestion, and there is none.
- Item s1a: All five Stories have a `userValue` paragraph, and four stand on their own — s2's (never implementing against an unsigned-off breakdown), s3's (the plan's order actually governing the work), s4's (finding out at the failing Task, not after) each argue value the Epic paragraph does not itself make. s5's is the exception: "The moment real code gets written stops being the moment the chain's review discipline disappears" is a near-verbatim restatement of the Epic problem's closing line ("the moment real code is written, that discipline disappears — which is exactly the moment it matters most"). It echoes the Epic rather than articulating value independently of it.
- Item s1b: Every title names a user-visible outcome and a real vertical slice — none is a component name or a layer. But only s1 ("Start a `build` run for a Story through the same workflow interface as every other stage") is phrased from the actor's side. s2 ("Refuse to touch code…"), s4 ("Halt and report…") and s5 ("Finalize the run…") are phrased from the system's side: the subject performing the verb is the software, not a user. They read as system-behaviour statements rather than user stories, though each is trivially re-anchorable to the developer already named in its `userValue`.
- Item ac3: Four of five Stories map cleanly — s1's "no new command, no separate surface" → ac2 and "first-class stage" → ac1; s2's unapproved/stale/named-condition/untouched-tree elements → ac2, ac3, ac4; s4's stop-at-the-Task and record-what-was-done → ac1, ac2, ac3; s5's cited, approvable, per-Task, files-changed → ac1–ac4. The gap is s3: its userValue opens with "a developer watching the run sees each Task implemented and its stated tests brought to passing before the next begins", but no criterion covers the seeing. ac2/ac3/ac4 establish that the ordering and the test-passing hold; none establishes that the run surfaces per-Task progress to the watching developer. Either the observability is a real element needing its own criterion, or the prose should stop claiming it.

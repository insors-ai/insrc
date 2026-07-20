<!-- insrc:artifact DEF-1cd9a4c34f403a80 -->

# Epic: The insrc workflow chain frames a problem (define) and designs each Story at two altitudes (design.epic HLD and design.story LLD), but there is no stage that turns an approved Story design into a persistent, reviewable breakdown of that Story into concrete units of work.

**Flavor:** enhancement

## Problem

The insrc workflow chain frames a problem (define) and designs each Story at two altitudes (design.epic HLD and design.story LLD), but there is no stage that turns an approved Story design into a persistent, reviewable breakdown of that Story into concrete units of work. The Epic/Story/Task hierarchy the framework promises end-to-end is therefore missing its third tier in practice: once a Story design is approved, the discrete, right-sized, correctly-ordered pieces of work needed to realize that Story are never captured as first-class, cited artifacts. Instead they live informally (for example as ad-hoc checkboxes in a tracker issue) or are re-derived from scratch by whoever implements the Story, so the handoff into implementation is inconsistent, un-auditable, and disconnected from the design's contracts, error paths, and test strategy. This gap blocks task-level progress tracking and leaves the fourth rung of the designed five-stage ladder empty, so downstream implementation has no stable, approved, ordered contract describing what to build and in what sequence.

## Non-goals

- **Implementing the `build` workflow or executing/realizing any Task (writing code, opening branches or PRs).** — build is a separate downstream stage that consumes one Task at a time; this Epic only produces the task breakdown, it never carries out the work.
- **Pushing Tasks to the GitHub tracker as first-class issues.** — Tracker integration for the Task tier is a distinct concern the framework deliberately deferred; Tasks are not modelled as issues today, and coupling that in would widen scope.
- **Re-opening, re-deciding, or re-architecting the Story's design.** — The breakdown consumes an approved design verbatim; architecture/API/algorithm choices belong to design.story. A discovered design gap is handled by the existing amendment / back-flow mechanism, not by re-designing inside this stage.
- **Supporting task-list amendments (editing an approved breakdown in place without a re-run).** — Amendments are opt-in per workflow and not required for a first version; today only the HLD supports them, and adding it here would be premature.
- **Accepting any input other than a single Story's approved design.** — The breakdown is per-Story and consumes exactly one approved Story design; multi-Story or Epic-level planning is out of scope.

## Assumptions

- `high` The approved Story design (LLD) already carries a handoff payload sufficient to derive concrete units of work — its contract details, data-model changes, error paths, test strategy, and (for enhancement flavor) migration. [[c5]]
- `high` An approved Story design and a staleness signal already exist in the framework, so this stage can gate on an approved and non-stale design without inventing new approval machinery. [[c5]]
- `med` The Story dependency graph established by define is available on the approved upstream artifacts at breakdown time, so ordering can respect it. [[c4]]
- `med` The downstream consumer (build) is not yet implemented, so the consumer contract for this stage's output is defined by the written specification rather than by existing code. [[c8]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | The output must populate the Task tier of the shared Epic/Story/Task hierarchy, which maps 1:1 to the standard software-engineering ladder and must remain addressable end to end as <epic-slug>/<story-id>/<task-id>. | [[c1]] |
| `k2` | contract | The breakdown is derived from exactly ONE approved Story design and must be consumable one unit at a time by the downstream build stage. | [[c2]] |
| `k3` | contract | Each unit of work must be ordered, right-sized, and dependency-labelled, and every unit must carry its own acceptance checks. | [[c2]] |
| `k4` | contract | Ordering of the units must respect the Story dependency graph established by define; the breakdown reads both the Epic HLD (for cross-cutting context) and the specific Story's LLD (for what to break down). | [[c4]] |
| `k5` | invariant | The stage must refuse to run against an unapproved or rejected upstream design — downstream stages treat an unapproved/rejected artifact as absent — and against a stale design whose upstream effective state has changed. | [[c6]] |
| `k6` | convention | Any artifact this stage produces must follow the as-built storage convention: a canonical hash-named JSON plus a slug-named human-readable markdown carrying the insrc:artifact resolution marker, and the stage must be driven through the multi-turn insrc_workflow_step interface (not a bespoke command). | [[c3]] |
| `k7` | convention | The stage must be implemented as an instance of the shared workflow framework skeleton (per-workflow step-runner registry, central decompose/synthesize/finalize seams, gates, storage) rather than as a bespoke pipeline. | [[c7]] |
| `k8` | invariant | Every claim in the produced artifact must cite its inputs (the approved design, the HLD, or an analyze bundle); uncited material is not permitted, consistent with the framework-wide grounding rule. | [[c7]] |

## Stories

### E202607151cd9a4c3:S001 — Break an approved Story design into an ordered, sized, dependency-labelled task list

**User value:** `size: L`

Whoever will implement a Story receives a concrete, right-sized, correctly-ordered set of work units derived directly from the approved design, instead of re-deriving the breakdown by hand every time. The breakdown becomes the single source of truth for what work the Story entails.

**Extends:** [[c9]]

**Acceptance criteria:**

- **ac1:** Given an approved Story design carrying its handoff payload, when the plan stage runs for that Story, then it produces one or more work units that together cover the Story's design. _(operationalizes `k2`)_
- **ac2:** Given the produced work units, when any unit is inspected, then it carries a size, an explicit position in the overall order, and its dependencies on other units of the same Story. _(operationalizes `k3`)_
- **ac3:** Given the Story's dependency context established by define, when the units are ordered, then the ordering is consistent with that dependency context and the units' own dependency graph is acyclic. _(operationalizes `k4`)_
- **ac4:** Given the produced set of work units, when a single unit is referenced, then it is addressable within the hierarchy as epic-slug/story-id/task-id. _(operationalizes `k1`)_

### E202607151cd9a4c3:S002 — Refuse to break down an unapproved or stale Story design

**User value:** `size: M`

A reviewer can trust that any task breakdown was produced only from an approved, current design, so no one plans — and later builds — against a draft, rejected, or superseded design.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given a Story whose design is not approved or has been rejected, when the plan stage is invoked for that Story, then the stage refuses to produce work units and reports the design as absent/unapproved. _(operationalizes `k5`)_
- **ac2:** Given a Story whose approved design has since become stale because its upstream effective state changed, when the plan stage is invoked for that Story, then the stage refuses to produce work units and reports the staleness instead. _(operationalizes `k5`)_

### E202607151cd9a4c3:S003 — Persist the breakdown as a reviewable, approvable, cited artifact

**User value:** `size: M`

The team can read the breakdown as human-readable documentation, approve or reject it through the same gate as every other stage, and have downstream work consume the canonical form. The breakdown outlives the session and every claim in it is traceable to its inputs.

**Depends on:** `s1`

**Extends:** [[c9]]

**Acceptance criteria:**

- **ac1:** Given a completed breakdown, when it is saved, then a human-readable document and a canonical machine-readable record are written following the framework's storage convention, with the human document resolvable back to its canonical record. _(operationalizes `k6`)_
- **ac2:** Given the persisted breakdown, when a reader inspects any unit or ordering claim, then that claim is traceable to the approved design, the HLD, or an analyze bundle it was derived from. _(operationalizes `k8`)_
- **ac3:** Given the persisted breakdown, when it is reviewed, then it can be approved or rejected through the same review gate the other stages use, and an unapproved breakdown is treated as absent by anything downstream. _(operationalizes `k6`)_

### E202607151cd9a4c3:S004 — State the tests each unit of work should produce

**User value:** `size: M`

Whoever implements and verifies a unit of work knows up front which tests demonstrate it is done, so verification is planned alongside the work rather than improvised afterward.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given a produced unit of work, when its acceptance is described in the breakdown, then the breakdown names the tests (across levels such as unit, integration, live, and smoke) that would validate that unit. _(operationalizes `k3`)_
- **ac2:** Given the whole breakdown and the Story design's test strategy, when the two are compared, then the per-unit tests collectively cover the design's stated test strategy. _(operationalizes `k2`)_

### E202607151cd9a4c3:S005 — Drive the breakdown through the standard multi-turn workflow interface

**User value:** `size: M`

A user drives the plan stage exactly like the other stages — through the same multi-turn interface with a fixed, ordered step sequence — so it composes into the existing chain with no new tooling or invocation style to learn.

**Depends on:** `s1`, `s3`

**Extends:** [[c9]]

**Acceptance criteria:**

- **ac1:** Given the workflow chain, when a user invokes the plan stage for a Story, then it runs through the same multi-turn step interface (start, plan, steps, synthesize) as the other stages and returns the persisted breakdown. _(operationalizes `k7`)_
- **ac2:** Given the plan stage, when it is invoked, then it presents a fixed, ordered sequence of steps consistent with the other fine-grained stages of the framework. _(operationalizes `k7`)_

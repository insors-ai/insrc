<!-- insrc:artifact PLAN-2ff0dfdadb1c8d1c-s2 -->

# Plan: E202610082ff0dfda:S002

## Summary

**Epic:** `e1-delivery-read-model-daemon-from`
**LLD run:** `wf-1791454582508-356km7`
**LLD effective hash:** `215b5fd4f60f...`

The build adds the four stage-annotation types to the delivery module's types, then one new stage.ts holding the stage pass: route resolution from each item's recorded fields, the ordered stage rules with each route's ready gate, the reason text, the issue-level roll-up and the pass's two notices. Everything is tested over fabricated records in one new stage.test.ts, plus a type-level check of the new types.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Stage annotation types | S | — | unit: types.test.ts: 'the stage and route types list exactly the HLD members' | [[c1]] |
| 2 | **`t2`** Stage pass for stories: route resolution, stage rules and reasons | M | `t1` | unit: stage.test.ts: 'a full-chain story with an approved plan and no build is ready-plan-approved, naming the plan'; unit: stage.test.ts: 'a story with an unapproved build whose tasks all passed is build-recorded'; unit: stage.test.ts: 'a story with an approved build is complete whatever its task results and review verdict'; unit: stage.test.ts: 'a story with no design, plan or build record is scoped'; unit: stage.test.ts: 'the issue magnitude decides a fix story's route ahead of its build stamp'; unit: stage.test.ts: 'a non-standalone build stamp is never read and an epic story is full-chain'; unit: stage.test.ts: 'a sized-bugfix or full-chain story with an approved design and no plan is design-plan'; unit: stage.test.ts: 'an unknown or disagreeing stamp gives the unknown route, never a guess' | [[c2]] [[c3]] [[c4]] |
| 3 | **`t3`** Stage pass for issues and the pass's notices | M | `t2` | unit: stage.test.ts: 'a small story with an approved design and a small-bugfix issue with an approved issue are ready-design-approved with no plan notice'; unit: stage.test.ts: 'a code review with no build leaves the stage and raises review-without-build'; unit: stage.test.ts: 'an item with no recorded route keeps its records' stage and raises unknown-route'; unit: stage.test.ts: 'a story or issue with no design, plan or build is scoped'; unit: stage.test.ts: 'an issue takes the least advanced stage of its fix stories'; unit: stage.test.ts: 'missing evidence records and wrongly typed fields never throw'; unit: stage.test.ts: 'every story and issue in the real-shape fixtures gets exactly one stage, deterministically' | [[c3]] [[c5]] |

### 1.1 E202610082ff0dfda:S002:T001 — Stage annotation types

Add DeliveryStage, DeliveryRoute, StageAnnotation and StagePassResult to src/workflow/delivery/types.ts exactly as the HLD sc4 sketch.

**Acceptance checks:**
- The four sc4 types are exported from types.ts with exactly the HLD members and fields.
- The module compiles under the repo's strict tsconfig.

### 1.2 E202610082ff0dfda:S002:T002 — Stage pass for stories: route resolution, stage rules and reasons

New src/workflow/delivery/stage.ts exporting deriveStages(graph, recordSet). For each story it resolves the route by the LLD precedence (ISSUE magnitude for the hash, LLD sizeClass, agreeing standalone BUILD sizeClass, full-chain for a non-standalone epic story, else unknown), applies the five ordered stage rules with the per-route ready gate, and writes the reason text and artifact ids.

**Acceptance checks:**
- A full-chain story with an approved PLAN and no BUILD is ready-plan-approved with a reason naming the PLAN.
- A story with an unapproved BUILD is build-recorded and one with an approved BUILD is complete, whatever task results or review verdicts say.
- A story with no LLD, PLAN or BUILD is scoped.
- The ISSUE magnitude wins over a BUILD stamp; a non-standalone BUILD's sizeClass is never read; an unknown or disagreeing stamp gives 'unknown'.
- A sized-bugfix or full-chain story with an approved LLD and no PLAN is design-plan.
- Approval is read only from ArtifactRecord.approval.state.

### 1.3 E202610082ff0dfda:S002:T003 — Stage pass for issues and the pass's notices

Extend deriveStages: an issue with fix stories takes the least advanced child's stage, an issue with none uses its own ISSUE (small-bugfix approved is ready-design-approved, sized approved is design-plan); raise unknown-route for every story or issue with an unknown route and review-without-build for a story with a CR and no BUILD; sort the notices; never throw on missing records or wrongly typed fields.

**Acceptance checks:**
- A small story with an approved LLD and a small-bugfix issue with an approved ISSUE are both ready-design-approved, with no plan-related notice.
- An issue's stage is its least advanced fix story's.
- A CR with no BUILD leaves the stage unchanged and raises one review-without-build notice naming the CR.
- An unknown route keeps the records' stage and raises one unknown-route notice.
- Missing evidence records and wrongly typed fields never throw, and every story and issue gets exactly one stage, deterministically.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| stage.test.ts: 'a full-chain story with an approved plan and no build is ready-plan-approved, naming the plan' | `t2` |
| stage.test.ts: 'a small story with an approved design and a small-bugfix issue with an approved issue are ready-design-approved with no plan notice' | `t3` |
| stage.test.ts: 'a story with an unapproved build whose tasks all passed is build-recorded' | `t2` |
| stage.test.ts: 'a story with an approved build is complete whatever its task results and review verdict' | `t2` |
| stage.test.ts: 'a code review with no build leaves the stage and raises review-without-build' | `t3` |
| stage.test.ts: 'an item with no recorded route keeps its records' stage and raises unknown-route' | `t3` |
| stage.test.ts: 'a story or issue with no design, plan or build is scoped' | `t3` |
| stage.test.ts: 'the issue magnitude decides a fix story's route ahead of its build stamp' | `t2` |
| stage.test.ts: 'a non-standalone build stamp is never read and an epic story is full-chain' | `t2` |
| stage.test.ts: 'a sized-bugfix or full-chain story with an approved design and no plan is design-plan' | `t2` |
| stage.test.ts: 'an unknown or disagreeing stamp gives the unknown route, never a guess' | `t2` |
| stage.test.ts: 'an issue takes the least advanced stage of its fix stories' | `t3` |
| stage.test.ts: 'missing evidence records and wrongly typed fields never throw' | `t3` |
| stage.test.ts: 'every story and issue in the real-shape fixtures gets exactly one stage, deterministically' | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s2 data model: DeliveryStage, DeliveryRoute, StageAnnotation, StagePassResult (sc4 types)`
- **[[c2]]** `prior-artifact` `LLD s2 DeliveryRoute (route resolution)`
- **[[c3]]** `prior-artifact` `LLD s2 DeliveryStage (stage rules) and StageAnnotation (reason)`
- **[[c4]]** `prior-artifact` `LLD s2 StagePassResult (deriveStages): approval read only through sc1`
- **[[c5]]** `prior-artifact` `LLD s2 DeliveryNotice (stage-pass notices) and error paths`

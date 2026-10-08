<!-- insrc:artifact PLAN-2ff0dfdadb1c8d1c-s3 -->

# Plan: E202610082ff0dfda:S003

## Summary

**Epic:** `e1-delivery-read-model-daemon-from`
**LLD run:** `wf-1791458944705-ro00q5`
**LLD effective hash:** `215b5fd4f60f...`

The build adds the sc5 gate types to the delivery module's types, re-using the review verdict type, then one new gate.ts holding the gate pass in two layers: an artifact gate per record (approval, review, effective verdict, blocking) and an item gate per epic, story and issue (task validation, the story-level result, the approved-but-failed conflict, the attention reasons with the superseded-pending rule, and the pass's two notices). Everything is tested over fabricated records in one new gate.test.ts, plus a type-level check of the new types.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Gate annotation types | S | — | unit: types.test.ts: 'the gate types re-export the review verdict and list exactly the sketched members' | [[c1]] |
| 2 | **`t2`** Artifact gates: approval and review facts | M | `t1` | unit: gate.test.ts: 'approved, rejected and unstamped artifacts read approved, rejected and pending'; unit: gate.test.ts: 'an approved historical block and an overridden block do not block and still show the verdict and the override'; unit: gate.test.ts: 'a block whose blocking findings are all resolved has effective verdict pass, and a warn with an unresolved MED is effectively a block'; unit: gate.test.ts: 'a code review blocks only while its story has no approved build'; unit: gate.test.ts: 'the reviewer party is read through reviewerPartyOf, and a code review's own approval stamp is reported but does not lift its block' | [[c2]] [[c5]] |
| 3 | **`t3`** Item gates: task validation, conflict, attention and notices | M | `t2` | unit: gate.test.ts: 'an unapproved block with no override is blocking and puts the item in Needs attention, and deriveStages over the same fixture gives the same stage as without the review'; unit: gate.test.ts: 'a malformed review, finding, code-review body, task entry or unparseable task id never throws and reports nothing invented'; unit: gate.test.ts: 'an approved build with a failed task is a validation conflict and keeps both facts, and deriveStages over the same fixture still reads complete'; unit: gate.test.ts: 'a failed story-level result on an approved build raises the conflict (BUILD-0855311b6b32eb72-S001 shape)'; unit: gate.test.ts: 'a planned task with no recorded result is unrecorded and counted as neither passed nor failed'; unit: gate.test.ts: 'a build task with no planned task keeps its result and is marked unplanned'; unit: gate.test.ts: 'a pending artifact superseded by an approved later gate on the same item stops counting, even with a blocked review or as a SPEC on a story, and the rule is stated'; unit: gate.test.ts: 'every epic, story and issue in the real-shape fixtures gets item gates, deterministically' | [[c3]] [[c4]] [[c5]] [[c6]] |

### 1.1 E202610082ff0dfda:S003:T001 — Gate annotation types

Add ArtifactGate, TaskResult, TaskValidation, AttentionReason, ItemGates and GatePassResult to src/workflow/delivery/types.ts as the HLD sc5 sketch, importing ReviewVerdict with `import type` from ../review/types.js and re-exporting it.

**Acceptance checks:**
- The sc5 types are exported from types.ts with exactly the sketched members and fields.
- ReviewVerdict is re-exported from review/types.ts, not redeclared.
- The module compiles under the repo's strict tsconfig.

### 1.2 E202610082ff0dfda:S003:T002 — Artifact gates: approval and review facts

New src/workflow/delivery/gate.ts exporting deriveGates(graph, recordSet). Layer 1 builds one ArtifactGate per record: approval state and time; the review for design kinds from meta.review (findings filtered to well-formed entries before effectiveReviewVerdict, resolvedFindings, reviewOverride, reviewerPartyOf with unknown as null, effectiveVerdict including warn-with-unresolved-MED as block and all-resolved block as pass) and for a CR from body.verdict / body.counts (per-field, non-numbers as 0) / reviewerPartyOf(meta); review null for BUILD and AMD; blocking for design artifacts against their own approval and for a CR against its story's BUILD approval, ignoring the CR's own stamp and reading no config. After this task deriveGates returns the full artifacts map with an empty items map and no notices; t3 fills those.

**Acceptance checks:**
- Approved, rejected and unstamped records read approved, rejected and pending with the matching time.
- An unapproved block with no override is blocking; an approved block and an overridden block are not, and still report the verdict and override.
- A block whose HIGH/MED findings are all resolved has effectiveVerdict pass; a warn with an unresolved MED has effectiveVerdict block.
- A CR blocks only while its story has no approved BUILD, whatever the CR's own stamp.
- A CR stamped model 'client' without reviewedBy reads reviewedBy 'controller'.
- Malformed reviews, findings and CR bodies never throw and invent nothing.

### 1.3 E202610082ff0dfda:S003:T003 — Item gates: task validation, conflict, attention and notices

Layer 2 of deriveGates: one ItemGates per epic, story and issue. Task validation per task child (planned by ordinal against plannedTaskIds, result failed > passed > unrecorded over the story's BUILD body.tasks, through private null-returning ordinal wrappers, ignoring malformed or unparseable entries); the story-level result; the conflict when a BUILD is approved and any result failed; attentionReasons over the evidence minus superseded pending records (chains SPEC<DEF<HLD on an epic, SPEC<LLD<PLAN<BUILD on a story; ISSUE, EXT and AMD never superseded; a CR never raises pending-decision); attentionRule naming the excluded records; unplanned-task and validation-conflict notices sorted with sortNotices. gate.ts never imports stage.ts; the ac2/ac5 tests import deriveStages test-only to assert the stage is unchanged.

**Acceptance checks:**
- An approved BUILD with a failed task carries the conflict, validation-failed and validation-conflict, and a validation-conflict notice; its approval stays approved and deriveStages (test-only) still reads complete.
- The BUILD-0855311b6b32eb72-S001 shape gives storyLevelResult failed, no task items and a story-level conflict.
- A planned task with no result is unrecorded; a build task with no planned task keeps its result, is unplanned and raises an unplanned-task notice.
- A pending LLD under an approved PLAN, a pending DEF under an approved HLD and a pending SPEC on a story with an approved LLD raise no attention reason, even with a blocked review, and attentionRule names them; pending ISSUE, EXT and AMD still raise pending-decision.
- Every epic, story and issue gets exactly one ItemGates, deterministically, and the pass never throws.
- gate.ts has no import of stage.ts.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| gate.test.ts: 'approved, rejected and unstamped artifacts read approved, rejected and pending' | `t2` |
| gate.test.ts: 'an unapproved block with no override is blocking and puts the item in Needs attention, and deriveStages over the same fixture gives the same stage as without the review' | `t2`, `t3` |
| gate.test.ts: 'an approved historical block and an overridden block do not block and still show the verdict and the override' | `t2` |
| gate.test.ts: 'a block whose blocking findings are all resolved has effective verdict pass, and a warn with an unresolved MED is effectively a block' | `t2` |
| gate.test.ts: 'a code review blocks only while its story has no approved build' | `t2` |
| gate.test.ts: 'a malformed review, finding, code-review body, task entry or unparseable task id never throws and reports nothing invented' | `t2`, `t3` |
| gate.test.ts: 'the reviewer party is read through reviewerPartyOf, and a code review's own approval stamp is reported but does not lift its block' | `t2` |
| gate.test.ts: 'an approved build with a failed task is a validation conflict and keeps both facts, and deriveStages over the same fixture still reads complete' | `t3` |
| gate.test.ts: 'a failed story-level result on an approved build raises the conflict (BUILD-0855311b6b32eb72-S001 shape)' | `t3` |
| gate.test.ts: 'a planned task with no recorded result is unrecorded and counted as neither passed nor failed' | `t3` |
| gate.test.ts: 'a build task with no planned task keeps its result and is marked unplanned' | `t3` |
| gate.test.ts: 'a pending artifact superseded by an approved later gate on the same item stops counting, even with a blocked review or as a SPEC on a story, and the rule is stated' | `t3` |
| gate.test.ts: 'every epic, story and issue in the real-shape fixtures gets item gates, deterministically' | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 dataModelChanges: the sc5 types in delivery/types.ts with ReviewVerdict re-exported from review/types.ts`
- **[[c2]]** `prior-artifact` `LLD s3 contractDetails: ArtifactGate rules (approval, review, effectiveVerdict, blocking, CR guarded gate)`
- **[[c3]]** `prior-artifact` `LLD s3 contractDetails: ItemGates task validation, storyLevelResult and conflict`
- **[[c4]]** `prior-artifact` `LLD s3 contractDetails: AttentionReason and the stakeholder-confirmed superseded-pending rule`
- **[[c5]]** `prior-artifact` `LLD s3 errorPaths: malformed reviews, findings, CR bodies, task entries and unparseable ids`
- **[[c6]]** `prior-artifact` `LLD s3 contractDetails: DeliveryNotice gate-pass notices (unplanned-task, validation-conflict)`

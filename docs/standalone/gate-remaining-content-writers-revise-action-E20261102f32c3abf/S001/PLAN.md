<!-- insrc:artifact PLAN-f32c3abf4a55494b-s1 -->

# Plan: STORY-f32c3abf4a55494b-s1

## Summary

**Epic:** `gate-remaining-content-writers-revise-action`
**LLD run:** `wf-1793611542462-nl097c`
**LLD effective hash:** `f32c3abf4a55...`

Building this Story adds one shared check to the team author gate and calls it before the first write of the two content writers that had no gate: the define run that extends an existing Epic and the review-comment recorder. The write inventory then names the gate behind every content writer, with a test that fails for one that has none. The work ends with the decisions recorded and one full sweep.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the shared revise-or-author check to the author gate | S | — | — | unit: src/workflow/team/__tests__/revise-draft-gate.test.ts: assertMayReviseDraft asks teamGate for revise when the stage is in signoff or changes-requested and for author otherwise, and applies assertHeld for revise; unit: src/workflow/team/__tests__/revise-draft-gate.test.ts: assertMayReviseDraft resolves with no tracker call in a repo with no team policy; unit: src/workflow/team/__tests__/revise-draft-gate.test.ts: assertMayReviseDraft rethrows a ToolDenied and throws TeamGateRefusedError for every other refusal | [[c1]] [[c3]] [[c5]] |
| 2 | **`t2`** Gate the define extend path before its first write | M | — | `t1` | integration: src/workflow/__tests__/define-extend-gate.test.ts: the define extend path refuses a non-holder while the Define is in signoff and writes nothing, and the holder's extend is written as today; integration: src/workflow/__tests__/define-extend-gate.test.ts: a repo with no team policy makes no tracker call and the extend is written as today; integration: src/workflow/__tests__/define-extend-gate.test.ts: a duplicate Story id or an unapproved Epic fails before the gate is asked, and a denied tracker call in the gate stops the run | [[c1]] [[c3]] [[c4]] |
| 3 | **`t3`** Gate the review-comment recorder before its first record | M | — | `t1` | integration: src/workflow/__tests__/resolve-comment-gate.test.ts: handleResolveComment answers an error and records nothing when the actor may not revise the stage; integration: src/workflow/__tests__/resolve-comment-gate.test.ts: the gate is asked once for several comments and maps define, hld and lld to the Epic and Story stages; integration: src/workflow/__tests__/resolve-comment-gate.test.ts: outside signoff a comment behaves as an author turn, and a repo with no team policy records as today; integration: src/workflow/__tests__/resolve-comment-gate.test.ts: a denied tracker call in the gate is rethrown and is not an error result | [[c1]] [[c3]] [[c4]] |
| 4 | **`t4`** Name the gate behind every content writer in the write inventory | M | — | `t2`, `t3` | unit: src/workflow/__tests__/artifact-write-inventory.test.ts: every content entry and site names a gatedBy entry point or an exemption with a reason, including appendStoryToDefine; unit: src/workflow/__tests__/artifact-write-inventory.test.ts: a content writer with neither a gate nor an exemption is reported | [[c2]] [[c4]] [[c5]] |
| 5 | **`t5`** Record the decisions and run the full sweep once | S | — | `t4` | unit: src/workflow/team/__tests__/revise-writers-record.test.ts: the revise-writers section of team-workflow.md records the decisions, the exemptions, the sweep result and the open items | [[c4]] [[c5]] |

### 1.1 TASK-f32c3abf4a55494b-s1-t1 — Add the shared revise-or-author check to the author gate

Add assertMayReviseDraft(repoPath, unit, stage, authoring) to src/workflow/team/author-gate.ts: it asks teamGate for 'revise' when isUnderSignoff(repoPath, unit, stage) holds and for 'author' otherwise, keeps the first-author exception for a stage with no issue, applies assertHeld for 'revise', throws TeamGateRefusedError for any other outcome and rethrows a ToolDenied. assertMayAuthor calls it for the unit and stage it already finds, so its behaviour and its three call sites do not change.

**Acceptance checks:**
- the helper asks for 'revise' when the stage is in signoff or changes-requested and for 'author' otherwise, and applies assertHeld for 'revise'
- a repo with no team policy resolves with no tracker call
- a ToolDenied is rethrown and every other refusal is a TeamGateRefusedError
- the existing assertMayAuthor tests pass unchanged

### 1.2 TASK-f32c3abf4a55494b-s1-t2 — Gate the define extend path before its first write

In finalizeDefineExtend (src/workflow/orchestrator.ts), after the Epic anchor is resolved and before appendStoryToDefine, call assertMayReviseDraft for the unit {epic, repoPath, epicHash}, stage DEF and authoring 'define'. A refusal throws before the Story, the amendment or the EXT record is written; every existing validation failure still returns first, so the gate does not run for a request that fails anyway. The first define of a fresh Epic is not gated. The test drives the existing define-extend test harness (the orchestrator entry the existing extend tests use) with a stand-in policy reader and tracker port through the gate's test seams; no new export is added unless that harness cannot reach the function.

**Acceptance checks:**
- an extend by someone who is not the holder, while the Define is in signoff, is refused and writes no Story, no amendment and no EXT record
- the holder's extend, and an extend in a repo with no team policy, are written as today
- a duplicate Story id or an unapproved Epic still fails before the gate is asked
- a ToolDenied from the gate stops the run and is not turned into a refusal

### 1.3 TASK-f32c3abf4a55494b-s1-t3 — Gate the review-comment recorder before its first record

In handleResolveComment (src/workflow/resolve-comment.ts), after the artifact is found and before the first recordResolution, call assertMayReviseDraft once, mapping parseArtifactId's define and hld to the Epic (stages DEF, HLD) and lld to the Story (stage LLD). A TeamGateRefusedError becomes an { error } naming the gate's reason with nothing recorded; a ToolDenied is rethrown. ResolveCommentDeps gains an optional gate seam for tests. Outside signoff the rule asks for 'author', so a comment on an unassigned stage takes the claim as any author turn does; this is tested, not assumed.

**Acceptance checks:**
- a comment from someone who may not revise the stage is answered with an { error } and records nothing
- the gate is asked once for several comments and maps define, hld and lld to the right unit and stage
- a comment outside signoff by the holder, or on an unassigned stage, behaves as an author turn would (claim taken), and a stage held by someone else is refused
- a repo with no team policy records as today
- a ToolDenied is rethrown and is not an { error }

### 1.4 TASK-f32c3abf4a55494b-s1-t4 — Name the gate behind every content writer in the write inventory

Add the optional gatedBy field to InventoryEntry and WriteSite in src/workflow/artifact-write-inventory.ts (an entry point name, or an object with an exemption reason), fill it for the eight content places (synthesize.ts, workflow-rpc.ts, resolve-comment.ts, unit-head.ts, standalone-record.ts, test-record.ts, task-set.ts and the appendStoryToDefine site), and add the test in src/workflow/__tests__/artifact-write-inventory.test.ts that fails for a content entry or site with neither.

**Acceptance checks:**
- every content entry and site names a gate or an exemption with a reason
- the test fails for a content writer with neither, shown by a fixture entry
- appendStoryToDefine is recorded as gated by finalizeDefineExtend and resolve-comment.ts by handleResolveComment
- the existing inventory rules still pass

### 1.5 TASK-f32c3abf4a55494b-s1-t5 — Record the decisions and run the full sweep once

Write the decisions of this Story (resolveComment holder-only revise for every comment, the extend gated as author outside signoff, the exemptions) and the outcome in docs/plans/team-workflow.md, then run the full test sweep once in foreground chunks and compare by test name with the tree before this Story.

**Acceptance checks:**
- the decisions and the outcome are written in docs/plans/team-workflow.md
- no new failure and no new skipped test against the tree before this Story, with the pre-existing failures listed

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| assertMayReviseDraft asks teamGate for 'revise' when the stage is in signoff or changes-requested and for 'author' otherwise, applies assertHeld for 'revise', rethrows a ToolDenied and resolves with no tracker call in a repo with no team policy | `t1` |
| the write inventory names a gatedBy entry point or an exemption with a reason for every content entry and site, and the test fails for a content writer with neither | `t4` |
| the define extend path refuses when the Epic's Define is in signoff and the actor is not the holder, and writes no Story, no amendment and no EXT record; the holder is allowed and the extend is written as today | `t2` |
| handleResolveComment answers an { error } with the gate's reason and records no comment when the stage is in signoff and the actor is not the holder, asks the gate once for several comments, maps define and hld to the Epic and lld to the Story, and records as today in a repo with no team policy | `t3` |
| a denied tracker call in the gate is rethrown by both entry points and is not an { error } | `t2`, `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contract: assertMayReviseDraft, finalizeDefineExtend, handleResolveComment, appendStoryToDefine`
- **[[c2]]** `prior-artifact` `LLD s1 data model: the gatedBy field of the write inventory`
- **[[c3]]** `prior-artifact` `LLD s1 error paths: TeamGateRefusedError, ToolDenied, the error result of the recorder`
- **[[c4]]** `prior-artifact` `LLD s1 test strategy: levels, subjects and acceptance mapping ac1 to ac5`
- **[[c5]]** `prior-artifact` `LLD s1 migration: the three steps and the backward compatibility`

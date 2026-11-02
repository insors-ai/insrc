<!-- insrc:artifact LLD-f32c3abf4a55494b-s1 -->

# LLD: STORY-f32c3abf4a55494b-s1

## Summary

**Epic:** `gate-remaining-content-writers-revise-action`
**HLD base run:** `wf-1793611542462-nl097c`
**HLD effective hash:** `f32c3abf4a55...`

Three places that change a draft while it may be in signoff get the team gate's check: the define run that extends an existing Epic, the review-comment recorder, and (through its only caller) the write that appends a Story to a Define. One shared check chooses 'revise' when the stage is in signoff and 'author' otherwise, and a repo with no team policy sees no change and no tracker call. The write inventory names the check behind each content writer, and a test fails when one has none.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `assertMayReviseDraft`

```typescript
assertMayReviseDraft(repoPath: string, unit: UnitRef, stage: SignoffStage, authoring: string): Promise<void>
```

**Parameters:**
- `repoPath: string` — The repository whose team policy and tracker apply
- `unit: UnitRef` — The Epic or Story whose stage draft is about to change
- `stage: SignoffStage` — The stage artifact being changed: DEF, HLD or LLD
- `authoring: string` — The workflow or operation name the gate records and passes to the completion hook

**Returns:** `Promise<void>` — Resolves when the actor may change the draft; a repo with no team policy resolves with no tracker call

**Errors:**
- `TeamGateRefusedError` when teamGate answers anything but allowed (held by another, awaiting signoff, no issue, refused), or the action is 'revise' and nobody holds the stage
- `ToolDenied` when A denied tracker call stops the operation; it is rethrown, never made a refusal

**Preconditions:**
- The unit has an artifact for the stage, or the call is the first author turn of a stage with no issue

**Postconditions:**
- The action asked of teamGate is 'revise' when isUnderSignoff(repoPath, unit, stage) holds and 'author' otherwise
- assertHeld is applied for 'revise', so revising never takes the claim
- assertMayAuthor keeps its behaviour and its three call sites

### 2.2 `finalizeDefineExtend`

```typescript
finalizeDefineExtend(...existing parameters): Promise<ExtendResult>
```

**Parameters:**
- `existing parameters: unchanged` — No parameter is added; the unit comes from the target Epic the extend already resolves

**Returns:** `unchanged` — The extend result, or the failure the orchestrator already returns

**Errors:**
- `TeamGateRefusedError` when The gate refuses the Epic's DEF stage; thrown before appendStoryToDefine, the amendment id or any file is touched

**Preconditions:**
- The target Epic and its HLD are approved (as today)

**Postconditions:**
- The gate is asked for the Epic and stage DEF after the Epic anchor is resolved and before the first side effect
- A refused extend writes no Story, no amendment and no EXT record

### 2.3 `handleResolveComment`

```typescript
handleResolveComment(params, repoEnv, deps?: ResolveCommentDeps): Promise<ResolveCommentResult | ResolveCommentError>
```

**Parameters:**
- `deps: ResolveCommentDeps` _(optional)_ — Gains an optional gate seam beside record, for tests

**Returns:** `ResolveCommentResult | ResolveCommentError` — A refused gate is an { error } naming the gate's reason and recording nothing

**Errors:**
- `ToolDenied` when Rethrown to the daemon method, as for every denied tracker call

**Preconditions:**
- The artifactId parses as DEF, HLD or LLD and the artifact exists

**Postconditions:**
- The gate runs after the artifact is found and before the first recordResolution
- define and hld map to the Epic (stages DEF, HLD) and lld to the Story (stage LLD)
- A repo with no team policy behaves as today

### 2.4 `appendStoryToDefine`

```typescript
appendStoryToDefine(repoPath: string, epicHash: string, story: DefineStory): DefineArtifact
```

**Returns:** `DefineArtifact` — Unchanged

**Preconditions:**
- Its only production caller, finalizeDefineExtend, has passed the gate

**Postconditions:**
- Signature and behaviour are unchanged; the inventory records that it is gated by finalizeDefineExtend

## 3. Data model changes

### 3.1 `WriteInventoryEntry (src/workflow/artifact-write-inventory.ts)` — field-add

Each content-kind entry or site gains gatedBy: the name of the entry point that calls assertMayReviseDraft or assertMayAuthor for it, or { exempt: reason } (for example the raw design-run writes, which are gated at workflow entry by assertMayAuthor). A test fails for a content writer with neither. Compatible: the field is optional for non-content entries.

**Call sites:**
- `src/workflow/artifact-write-inventory.ts`

## 4. Error paths

**Error cases**

- **Someone other than the holder extends a Define with the define workflow while its stage is in signoff** (recoverable)
  - Detection: assertMayReviseDraft asks teamGate for 'revise' (isUnderSignoff is true for DEF) and gets held-by-other, or awaiting-signoff
  - Response: TeamGateRefusedError is thrown from finalizeDefineExtend before appendStoryToDefine, the amendment id or any file is touched; the run stops with the gate's reason
  - User impact: The extend is refused with the reason and the holder's name; nothing was written
- **Nobody holds the Epic while its Define is in signoff and someone extends it** (recoverable)
  - Detection: teamGate allows 'revise' on an unassigned stage, then assertHeld finds no holder
  - Response: TeamGateRefusedError 'nobody holds the issue: claim it before revising work that is in signoff'; nothing written
  - User impact: The person must claim the Epic first
- **A comment is recorded with resolveComment by someone who may not revise the stage** (recoverable)
  - Detection: handleResolveComment calls assertMayReviseDraft after the artifact is found and gets a TeamGateRefusedError
  - Response: The method answers { error: 'workflow.resolveComment: <gate reason>' } and records no comment, so the plugin keeps the buffer
  - User impact: The review pane shows Unavailable with the reason and keeps the unsent comments
- **The tracker call inside the gate is denied** (recoverable)
  - Detection: teamGate or assertHeld throws a ToolDenied (isToolDenied)
  - Response: Rethrown unchanged by the helper and by both entries; never turned into a refusal or an { error } that hides the denial
  - User impact: The operation stops as every denied tracker call does
- **The team gate fails to read the policy or the tracker** (recoverable)
  - Detection: teamGate returns refused('the team gate failed: ...') or a no-issue outcome
  - Response: The helper throws TeamGateRefusedError with that reason; the writer does not run
  - User impact: The operation is refused with the cause; it can be retried
- **A content writer is added to the write inventory with no gatedBy** (recoverable)
  - Detection: The inventory test reads every content entry and site and finds neither gatedBy nor an exemption with a reason
  - Response: The test fails and names the entry
  - User impact: A build is stopped at its tests, not a user

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repo with no team policy, or teamMode false, runs the define extend or resolveComment | teamGate answers allowed with no tracker call; the writers behave exactly as today |
| resolveComment on an artifact whose stage is not in signoff | The action asked is 'author'; the holder is allowed, an unassigned stage is claimed as for any author turn, and a stage held by someone else is refused as for design.epic and design.story |
| The define run is a first define (a fresh Epic, no target) | Not gated: there is no unit yet; only the extend path, which has a target Epic, asks the gate |
| resolveComment names an lld artifactId | The unit is the Story (epicHash and storyId from the id) and the stage is LLD; define and hld name the Epic with stage DEF or HLD |
| The extend finds a duplicate Story id or an unapproved Epic | The existing validation failures are returned before the gate is asked, so the gate never runs for a request that would fail anyway |
| resolveComment with several comments | The gate is asked once, before the first recordResolution, not once per comment |

**Invariants to preserve**

- teamGate never throws except for a ToolDenied, and a repo with no team policy gets 'allowed' with no tracker call [[c1]]
- appendStoryToDefine keeps the lifecycle approval of the Define (the extend is the sanctioned edit) and its synchronous signature [[c2]]
- handleResolveComment records nothing when it answers an { error }, and a retry after a partial failure does not duplicate comments [[c3]]
- assertMayAuthor keeps its behaviour at its three call sites, including the first-author exception for a stage with no issue [[c1]]
- isUnderSignoff is true only for in-signoff and changes-requested and false for an absent head [[c4]]

## 5. Test strategy

**Test framework:** `node:test with tsx (npx tsx --test), tests co-located in __tests__; a stand-in tracker port and policy reader as in src/workflow/team/__tests__`

**Test levels**

- **unit** — The shared check chooses the action and applies the holder rule; the write inventory has a gate for every content writer
  - Subjects: `assertMayReviseDraft asks teamGate for 'revise' when the stage is in signoff or changes-requested and for 'author' otherwise, applies assertHeld for 'revise', rethrows a ToolDenied and resolves with no tracker call in a repo with no team policy`, `the write inventory names a gatedBy entry point or an exemption with a reason for every content entry and site, and the test fails for a content writer with neither`
  - Fixtures: `a stand-in tracker port with a holder`, `a policy reader returning team, off and none`, `a temp repo with a Define head in each lifecycle status`
- **integration** — The two entry points refuse before any write and leave a repo with no team policy unchanged
  - Subjects: `the define extend path refuses when the Epic's Define is in signoff and the actor is not the holder, and writes no Story, no amendment and no EXT record; the holder is allowed and the extend is written as today`, `handleResolveComment answers an { error } with the gate's reason and records no comment when the stage is in signoff and the actor is not the holder, asks the gate once for several comments, maps define and hld to the Epic and lld to the Story, and records as today in a repo with no team policy`, `a denied tracker call in the gate is rethrown by both entry points and is not an { error }`
  - Fixtures: `a temp repo with an approved Define, HLD and a scope.assess result of decision extend`, `a stand-in tracker port`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `the define extend path refuses a non-holder while the Define is in signoff and writes nothing (integration)`, `assertMayReviseDraft asks teamGate for 'revise' when the stage is in signoff and for 'author' otherwise (unit)` |
| `ac2` | `handleResolveComment answers an { error } and records nothing when the actor may not revise the stage (integration)` |
| `ac3` | `the write inventory names a gate or an exemption for every content writer, including appendStoryToDefine (unit)` |
| `ac4` | `a repo with no team policy makes no tracker call and behaves as today for the define extend and for handleResolveComment (integration)`, `assertMayReviseDraft resolves with no tracker call in a repo with no team policy (unit)` |
| `ac5` | `a denied tracker call in the gate is rethrown by both entry points and is not an { error } (integration)`, `assertMayReviseDraft rethrows a ToolDenied (unit)` |

## 6. Migration

**State before:** The define extend path and handleResolveComment change a Define, HLD or LLD draft with no team-gate check; appendStoryToDefine is reached only from the extend path; the write inventory lists content writers without naming a gate (c2, c3); assertMayAuthor gates design.epic, design.story and plan runs at workflow entry (c1).

**State after:** Both entry points ask the team gate through one helper before their first write, choosing 'revise' for a stage in signoff and 'author' otherwise; the write inventory names the gate behind every content writer and a test fails for one with none; a repo with no team policy is unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the shared helper to author-gate.ts next to assertMayAuthor, and make assertMayAuthor's action choice use the same rule; no call site changes yet — ↩ rollbackable
2. Call the helper in the define extend path before its first side effect, and in handleResolveComment before the first record — ↩ rollbackable
3. Add the optional gatedBy field to the write inventory entries and sites, fill it for every content writer, and add the test that fails for a content writer with neither a gate nor an exemption — ↩ rollbackable

**Backward compat:** No stored data changes and no public API changes. Behaviour changes only in a repo with a team policy: an extend or a comment recorded by someone who may not revise a stage in signoff is now refused where it was allowed. A repo with no team policy sees no tracker call and no difference. The daemon method workflow.resolveComment gains one more possible { error } text, which the plugin already renders as Unavailable.

## 7. Alternatives considered

### 7.1 a1: One shared check at each writer's entry

Add assertMayReviseDraft(repo, unit, stage) to author-gate.ts and call it at the three entries: the define extend path before its side effects, handleResolveComment before the first write, and nowhere inside the pure Define write.

Generalise authorActionOf and assertMayAuthor into one helper that takes a unit and a stage, asks teamGate for 'revise' when isUnderSignoff holds for that stage and for 'author' otherwise, then applies assertHeld for 'revise'. The define extend path in the orchestrator calls it for the Epic and stage DEF once the target Epic is known and before appendStoryToDefine; handleResolveComment calls it after it has parsed the artifactId and found the artifact, before the first recordResolution. appendStoryToDefine stays a synchronous pure write whose only caller is already gated.

**Rejected because:** Meets the Story with the least change, but nothing stops a future caller of the pure writer from skipping the gate; a3 adds the inventory test that closes that gap for the same code.

### 7.2 a2: Gate inside the writers

Make appendStoryToDefine and the resolution recorder await the gate themselves, so no caller can skip it.

appendStoryToDefine becomes async and takes the acting context, calls the shared check for the Epic and stage DEF, then writes; recordResolution (used by resolveComment and by other callers) calls the check for the artifact it changes.

**Rejected because:** Makes a synchronous exported function async, touches every caller and test, and would also gate the other users of the resolution recorder (design runs), which is outside the Story and changes behaviour for non-reviewers.

### 7.3 a3: Entry checks plus an inventory test — **CHOSEN**

a1, and make the write inventory name the gate each content writer is behind, with a test that fails when a content writer has none.

Take a1 for the code. Extend artifact-write-inventory.ts so each content-kind entry carries a gatedBy field: the entry that calls the shared check, or an explicit 'exempt' with a reason. A new test reads the inventory and fails for a content writer with neither.

## 8. References

- **[[c1]]** `code` `src/workflow/team/author-gate.ts`
- **[[c2]]** `code` `src/workflow/gates.ts:210`
- **[[c3]]** `code` `src/workflow/resolve-comment.ts`
- **[[c4]]** `code` `src/workflow/team/signoff.ts:254`
- **[[c5]]** `doc` `docs/plans/team-workflow.md`
- **[[c6]]** `code` `src/workflow/artifact-write-inventory.ts`

## 9. Open questions

- Item ts1: the Story has no acceptance criteria; ac1 to ac5 in the test strategy were derived from the Story text and need confirming at plan time
- Reviewers and resolveComment: when the stage is in signoff, should a person who is not the holder (a reviewer) still be allowed to record comments, or is 'revise' (holder only) the rule for every comment? This design applies 'revise' to every comment, as the Story says, which refuses a non-holder reviewer
- An extend of a Define that is not in signoff: this design asks for 'author' (which takes the claim on an unassigned Epic, as for design.epic); the alternative is 'revise' for every extend

## Resolved questions

- `q72dabd19` — Item ts1: the Story has no acceptance criteria; ac1 to ac5 in the test strategy were derived from the Story text and need confirming at plan time
  - **resolved**: Accept derived ACs as-is — The user approved the LLD on 2026-11-02 with ac1 to ac5 in its test strategy. _(2026-11-02T09:33:19.969Z)_

## Citations

- **[[c1]]** `code` `src/workflow/team/author-gate.ts`
- **[[c2]]** `code` `src/workflow/gates.ts:210`
- **[[c3]]** `code` `src/workflow/resolve-comment.ts`
- **[[c4]]** `code` `src/workflow/team/signoff.ts:254`
- **[[c5]]** `doc` `docs/plans/team-workflow.md`
- **[[c6]]** `code` `src/workflow/artifact-write-inventory.ts`

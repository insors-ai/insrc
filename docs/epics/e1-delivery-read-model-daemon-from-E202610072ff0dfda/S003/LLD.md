<!-- insrc:artifact LLD-2ff0dfdadb1c8d1c-s3 -->

# LLD: E202610082ff0dfda:S003

## Summary

**Epic:** `e1-delivery-read-model-daemon-from`
**HLD base run:** `wf-1791360301609-41fijn`
**HLD effective hash:** `215b5fd4f60f...`

This Story adds the gate pass to the delivery read model. For every record it reports the approval state and, where the record carries one, its review: verdict, counts, override, resolved findings, the effective verdict and whether it still blocks. For every epic, story and issue it reports each task's validation result (passed, failed or unrecorded, and whether the task was planned), any result recorded against the story itself, the conflict when a completion approval coexists with a failed result, and the attention reasons with the rule applied. A pending artifact stops counting toward Needs attention once a later gate on the same work item is approved; the stage is never changed.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

> See **HLD-2ff0dfdadb1c8d1c** § 2. Framework summary

**Rollout phase:** Phase B — stage, gate and currency passes
**Owns:** `sc5` (GateAnnotation)
**Consumes:** `sc1` (ArtifactRecordSet), `sc2` (WorkItemGraph), `sc3` (DeliveryNotice)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Private to s1: how the store directory is listed and each file parsed; how a record's kind, work-item hash and raw story id are lifted from its file name and meta; the use of the canonical ordinal rule to join s1/S1/S001 and the decision of when two records are ambiguous rather than the same; sourcing story membership from the Define's story list and from accepted extension records; attaching fix stories to an issue through the shared work-item hash and resolving meta.parentRef; nesting tasks by plan and build task ids; and the sort order of records, failures and child lists. No other story reads the files or re-derives identity. Also private: the per-kind lift, including reading flat amendment records; the anchor-date rule for minting canonical ids after grouping by hash and ordinal, which must reproduce deriveWorkItemIdentity and the existing path-scheme folder for every work item those can identify; attaching each SPEC to the item that names it in meta.seededFromSpec; resolving a slug-only parentRef through records' meta.epicSlug. Its LLD maps each of s1 ac1-ac6 to a named test, including ac3 (an ambiguity notice naming the other record), ac4 (two fix stories under one issue) and ac6 (colliding short task ids in two stories). Task items are minted only from t<n> build and plan task ids; a build task id equal to the story's id is left for s3 as a story-level result, with a fixture of that shape. Slug resolution of an issue's parentRef excludes records sharing the issue's own hash; a parentRef that names only the issue itself yields no corrected parent and no notice. Fixtures cover both real shapes: a self-slug parentRef (for example ISSUE-0855311b6b32eb72) and an outward slug (for example ISSUE-2d9e9e694a94116b). — owns `sc1`, `sc2`, `sc3`
- `s2`: Private to s2: the mapping from a work item's recorded route fields to a DeliveryRoute, read in this order of precedence: ISSUE meta.magnitude for an issue and for every fix story whose work-item hash is that issue's hash (small-bugfix or sized-bugfix, ahead of any BUILD stamp such as 'trivial'); the story's LLD meta.sizeClass; the standalone BUILD record's meta.sizeClass (the only place a trivial route is recorded); and, for a story under a non-standalone epic with none of these, the full chain; including treating any value that is not a SizeClass member (such as a scope letter 'M') or a missing stamp as unknown; a non-standalone BUILD's sizeClass is never read; the first-match-wins precedence that picks the stage; which gate counts as the ready gate for each route; and the wording of stage reasons. It reads approval state only through sc1 and never consults gate or currency annotations. Its LLD maps each of s2 ac1-ac7 to a named test over fabricated records. — owns `sc4`
- `s4`: Private to s4: deciding review currency only from recorded fields (for example the framework's existing story-design staleness against its high-level design) and reporting unknown otherwise, never from file modification time; comparing accepted extension records with their epic framing; and detecting expected-but-missing fields, such as an artifact with no title. It never decides route-dependent gaps, which need s2's route. It reports through notices and never adds or removes work items. Also private: deriving each epic's amendments, and any story design's staleness against its high-level design, from the AMD, HLD and LLD records already in sc1, reusing only pure helpers such as computeHldEffectiveHash and never the amendments module's disk-reading listers, so the pass adds no second read and one malformed amendment cannot fail the snapshot. Staleness hashes the epic's approved amendments in rising approvedAt order, the order the existing scanner uses, which is separate from sc6's presentation sort by amendmentId. Its LLD maps each of s4 ac1-ac5 to a named test, including ac5 asserting that no file in the store changes. Its ac4 test covers the missing-field half (an artifact with no title); the build-without-plan half is tested in s5. — owns `sc6`
- `s5`: Private to s5: running the load, graph and three annotation passes in order for one request; joining annotations onto items; deciding needsAttention as any sc5 attention reason or any notice with attention true; computing counts over the full item set; the deterministic sort of items and notices; choosing openWith from whether an artifact's markdown carries its marker; the two daemon handler-map entries and their repo resolution and error mapping; the artifact-id validation that keeps evidence reads inside the artifact store; and the 1,000-artifact performance fixture. Also private: the error-path mapping (absent store is an empty snapshot; unreadable store, invalid or unknown evidence id is { error }). Also private: the determinism test (two snapshots over the same fixture are identical) and the regression check that the existing workflow.pending and workflow.artifactContent tests pass unchanged. Its LLD maps each of s5 ac1-ac6 to a named test: ac1 asserts the store is byte-identical after a request, ac3 reads a marker-less BUILD through workflow.deliveryEvidence, and ac6 is a type-level check that the VS Code plugin compiles against the published types plus a fixture the JetBrains mirror parses. Also private: the one route-dependent completeness check, raising an 'incomplete-evidence' notice for a story whose sc4 route requires a plan (full-chain, feature, sized-bugfix) but which has a build and no plan; small and small-bugfix routes never get it. Its LLD also owns the test for the build-without-plan half of s4 ac4: a full-chain story with a build and no plan gets the incomplete-evidence notice, and small and small-bugfix stories with a build and no plan do not. — owns `sc7`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `GatePassResult (deriveGates)`

```typescript
export function deriveGates(graph: WorkItemGraph, recordSet: ArtifactRecordSet): GatePassResult
```

**Parameters:**
- `graph: WorkItemGraph` — The s1 graph; its epics, stories and issues get ItemGates from their evidence, task children and plannedTaskIds.
- `recordSet: ArtifactRecordSet` — The s1 record set; every record gets an ArtifactGate.

**Returns:** `GatePassResult` — artifacts: one ArtifactGate per record, keyed by artifactId. items: one ItemGates per epic, story and issue, keyed by item id (tasks have none). notices: unplanned-task and validation-conflict, sorted with sortNotices.

**Preconditions:**
- graph was built from recordSet.

**Postconditions:**
- Never throws: a missing record, a malformed review or a field of the wrong type yields review null, an unrecorded result or no reason.
- Pure and deterministic; reads no stage (sc4) or currency (sc6) annotation and never changes a stage.

### 2.2 `ArtifactGate`

```typescript
interface ArtifactGate { readonly artifactId: string; readonly approval: { readonly state: 'approved' | 'rejected' | 'pending'; readonly at: string | null }; readonly review: { readonly verdict: ReviewVerdict; readonly reviewedAt: string; readonly reviewedBy: 'controller' | 'daemon' | null; readonly counts: { readonly high: number; readonly med: number; readonly low: number }; readonly override: { readonly reason: string; readonly at: string | null } | null; readonly resolvedFindings: number; readonly effectiveVerdict: ReviewVerdict; readonly blocking: boolean } | null }
```

**Returns:** `ArtifactGate` — approval: ArtifactRecord.approval.state, with at = approvedAt when approved, rejectedAt when rejected, else null. review for DEF, HLD, LLD, PLAN, SPEC, ISSUE and EXT: from meta.review when it is an object whose verdict is pass, warn or block (else null); reviewedAt = meta.review.reviewedAt (record createdAt, else '', when absent); reviewedBy = reviewerPartyOf(meta.review) (src/workflow/review/party.ts: reviewedBy wins, else the stored model label decides), with 'unknown' mapped to null; counts from meta.review.counts (a non-number reads 0); override = meta.reviewOverride when its reason is a string; resolvedFindings = HIGH/MED findings with an entry in meta.reviewResolutions; effectiveVerdict = 'block' when effectiveReviewVerdict(meta.review with its findings filtered to well-formed entries, meta.reviewResolutions when a plain object) returns 'block', 'pass' when the recorded verdict is 'block' but every HIGH/MED finding is resolved, otherwise the recorded verdict. A recorded 'warn' stays 'warn' unless it carries an unresolved HIGH/MED finding (a MED that blockOn chose not to block on, verdict.ts), in which case effectiveVerdict is 'block', matching the approval gate (gates.ts). review for a CR: null unless body.verdict is pass, warn or block; verdict = body.verdict, reviewedAt = record createdAt, reviewedBy = reviewerPartyOf(meta) with 'unknown' mapped to null (a CR stamped model 'client' without reviewedBy reads 'controller'), counts read per field from body.counts (absent, non-object or non-number fields read 0), resolvedFindings 0, effectiveVerdict = body.verdict, override = the CR's own meta.reviewOverride or the reviewed BUILD's. BUILD and AMD records have review null. blocking = effectiveVerdict 'block' AND the gate the review guards is unapproved AND no override: for a design artifact the guarded gate is the artifact itself; for a CR it is its story's BUILD, so a CR blocks only while its story has no approved BUILD. CR blocking is an attention signal, not the enforced completion gate: it is reported the same whatever codeReview.enforce is set to (code-review/gate.ts treats a block as advisory when enforce is off, the default), and deriveGates reads no config. A CR's own approval stamp (a few live CRs carry meta.approvedAt) is reported in approval unchanged but is not the gate its review guards and plays no part in blocking.

**Postconditions:**
- The recorded verdict and override are always reported unchanged, whatever blocking says.
- Stakeholder-confirmed readings of the sc5 sketch (2026-10-08), refining it for s5 and the IDE mirrors: (1) a recorded 'block' whose every HIGH/MED finding is resolved has effectiveVerdict 'pass', matching effectiveReviewVerdict and the approval gate (gates.ts); (2) for a CR record the 'artifact unapproved' term of blocking means its story's BUILD is unapproved, since a story's completion gate is its BUILD approval; the CR's own approval stamp is reported but does not lift its block.

### 2.3 `ItemGates`

```typescript
interface ItemGates { readonly itemId: string; readonly tasks: readonly TaskValidation[]; readonly validation: { readonly passed: number; readonly failed: number; readonly unrecorded: number; readonly unplanned: number }; readonly storyLevelResult: TaskResult | null; readonly conflict: { readonly failedTaskItemIds: readonly string[]; readonly storyLevelFailed: boolean } | null; readonly attentionReasons: readonly AttentionReason[]; readonly attentionRule: string }
```

**Returns:** `ItemGates` — tasks (stories only): one TaskValidation per task child, sorted by taskItemId. planned = the task's ordinal (taskIdToOrdinal over its sourceIds) matches a plannedTaskId's ordinal. result over the story's BUILD records' body.tasks entries with that task ordinal: 'failed' when any has passed false, else 'passed' when any has passed true, else 'unrecorded'; a non-boolean passed is ignored. validation counts passed, failed and unrecorded over tasks, and unplanned = tasks with planned false. storyLevelResult: from BUILD entries whose id is a story id (storyIdToOrdinal) equal to the story's ordinal, the same failed/passed rule, null when none; never a task, never unplanned. conflict: when some BUILD of the story is approved and a task result or the storyLevelResult is 'failed', listing the failed task item ids and whether the story-level result failed; else null. attentionReasons (sorted in declaration order), over the item's evidence records minus the superseded ones (a superseded pending record contributes no reason at all, neither 'pending-decision' nor 'review-blocked', though its ArtifactGate still reports its review and blocking flag): 'pending-decision' when an evidence record other than a CR is pending (a CR never raises it, whatever its own stamp); 'rejected' when an evidence record is rejected; 'review-blocked' when an evidence record's gate is blocking; 'validation-failed' when a task result or the storyLevelResult is failed; 'validation-conflict' when conflict is set. attentionRule states the superseded-pending rule and lists the pending records it excluded on this item.

**Postconditions:**
- Epics and issues have tasks [], zeroed validation, storyLevelResult null and conflict null.

### 2.4 `AttentionReason (superseded-pending rule)`

```typescript
type AttentionReason = 'pending-decision' | 'rejected' | 'review-blocked' | 'validation-failed' | 'validation-conflict'
```

**Returns:** `AttentionReason` — Stakeholder-confirmed policy (lc1, 2026-10-08): a pending record stops counting toward Needs attention once a later gate on the same work item is approved. 'Later' follows each item's gate chain: SPEC < DEF < HLD on an epic; SPEC < LLD < PLAN < BUILD on a story (a SPEC is attached to whichever item names it in meta.seededFromSpec, which can be a standalone story). ISSUE, EXT and AMD records are on no chain and are never superseded. The superseded record still reports approval 'pending' in its ArtifactGate.

**Postconditions:**
- A rejected record is never superseded and never shown as pending.

### 2.5 `DeliveryNotice (gate-pass notices)`

```typescript
makeNotice('unplanned-task' | 'validation-conflict', message, { itemIds, artifactIds })
```

**Returns:** `DeliveryNotice` — unplanned-task: one per task with planned false, naming the task and its story and the BUILD records holding its result (attention false). validation-conflict: one per story whose conflict is set, naming the story, the approved BUILD and the failed task items (attention true).

## 3. Data model changes

### 3.1 `ArtifactGate, TaskResult, TaskValidation, AttentionReason, ItemGates, GatePassResult` — new

The sc5 types, added to src/workflow/delivery/types.ts beside sc1-sc4, as sketched in the HLD. ReviewVerdict is not redeclared: types.ts imports it with `import type { ReviewVerdict } from '../review/types.js'` and re-exports it, so the delivery model shares the one verdict language code-review/types.ts already reuses.

**Call sites:**
- `src/workflow/delivery/types.ts`
- `src/workflow/review/types.ts`

### 3.2 `deriveGates` — new

New module src/workflow/delivery/gate.ts. It imports effectiveReviewVerdict from src/workflow/review/resolve.ts, reviewerPartyOf from src/workflow/review/party.ts, taskIdToOrdinal and storyIdToOrdinal from src/workflow/id.ts (which throw on an unparseable id, so gate.ts calls them only through private null-returning try/catch wrappers, as graph.ts's storyOrdinalOf / taskOrdinalOf do), and makeNotice / sortNotices from notice.ts; it has no caller yet (s5 will call it).


## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc5` | implements | Defines the sc5 types and produces GatePassResult. |
| `sc1` | consumes | Reads approval, meta.review, meta.reviewResolutions, meta.reviewOverride, meta.reviewedBy and body (verdict, counts, tasks) of each record. |
| `sc2` | consumes | Uses evidenceArtifactIds, childIds, sourceIds and plannedTaskIds; adds no items. |
| `sc3` | consumes | Raises unplanned-task and validation-conflict through makeNotice. |

## 5. Error paths

**Error cases**

- **meta.review is present but malformed (not an object, no recognised verdict, findings not an array, or a findings array holding null, non-object entries or entries without a string claimId and severity).** (recoverable)
  - Detection: A typeof check on meta.review and a membership check of its verdict; Array.isArray on findings, then a per-entry filter keeping only plain objects whose claimId and severity are strings; meta.reviewResolutions is used only when it is a plain object. effectiveReviewVerdict (which dereferences each finding's severity) is called only with a report whose findings are the filtered entries, and resolvedFindings counts the same filtered entries.
  - Response: review is null when the verdict is unrecognised; with a recognised verdict, malformed finding entries are dropped before effectiveReviewVerdict runs and before resolvedFindings is counted; with no findings array, effectiveVerdict is the recorded verdict and resolvedFindings 0.
  - User impact: The artifact shows no review rather than an invented one; nothing throws.
- **A CR record's body.verdict is missing or not pass/warn/block, or body.counts is absent, not an object, or holds non-number fields.** (recoverable)
  - Detection: A membership check of body.verdict; typeof checks on body.counts and on each of high, med and low.
  - Response: review is null when the verdict is not a ReviewVerdict; otherwise each missing or non-number count reads 0.
  - User impact: The CR shows no review rather than an invented one, or zero counts where none were recorded; nothing throws.
- **A body.tasks entry is malformed (not an object, id not a string, passed not a boolean).** (recoverable)
  - Detection: typeof checks on each entry.
  - Response: The entry is ignored for every result.
  - User impact: The task reads unrecorded instead of a guessed result.
- **An item's evidence names an id with no record.** (recoverable)
  - Detection: The record-set index lookup returns undefined.
  - Response: The id is skipped.
  - User impact: None beyond s1's own report.
- **A body.tasks entry id parses as neither a t<n> task id nor the story's own id (for example 'x9', or another story's id).** (recoverable)
  - Detection: The null-returning ordinal wrappers return null for the task form, and the story form is null or a different ordinal.
  - Response: The entry is ignored for every result.
  - User impact: No task or story-level result is invented; nothing throws.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Three LLDs: one approved, one rejected, one with neither stamp. | approved, rejected and pending; the rejected one never reads pending and is never superseded. |
| An approved BUILD with one task passed false. | conflict lists the failed task item; validation-failed and validation-conflict reasons; a validation-conflict notice; the BUILD's approval is still 'approved'. |
| The BUILD-0855311b6b32eb72-S001 shape: an approved standalone build whose only entry is the story's own id with passed false. | storyLevelResult 'failed', no task items, unplanned 0, conflict with storyLevelFailed true. |
| A planned task t2 with no BUILD entry. | result 'unrecorded', counted in unrecorded only. |
| A BUILD entry t3 with no PLAN task t3. | A task with its result and planned false; unplanned 1; an unplanned-task notice. |
| An unapproved LLD with review verdict block and no override. | blocking true; review-blocked reason. |
| An approved LLD whose review is block. | verdict and effectiveVerdict still block; blocking false; no review-blocked reason. |
| An unapproved LLD whose block carries meta.reviewOverride. | override reported; blocking false; no review-blocked reason. |
| A recorded block whose every HIGH/MED finding has a reviewResolutions entry. | effectiveVerdict 'pass', resolvedFindings counted, blocking false. |
| A CR with verdict block on a story whose BUILD is approved. | CR blocking false: the gate it guards is approved. |
| A CR with verdict block on a story with an unapproved BUILD, or no BUILD. | CR blocking true; review-blocked on the story. |
| A pending LLD on a story whose PLAN is approved. | Superseded: no pending-decision reason; the LLD still reads pending; attentionRule names it. |
| A pending DEF on an epic whose HLD is approved. | Superseded the same way on the epic. |
| A pending ISSUE, EXT or AMD. | pending-decision; never superseded. |
| A story with only a CR (no approval stamp on the CR). | The CR does not raise pending-decision. |
| A superseded pending LLD (its story's PLAN is approved) whose review is an unresolved block with no override. | The LLD's ArtifactGate still reports blocking true; the story gets neither pending-decision nor review-blocked from it; attentionRule names it. |
| A CR carrying meta.approvedAt with verdict block, on a story whose BUILD is unapproved. | approval 'approved' and blocking true on the CR; review-blocked on the story; no pending-decision from the CR. |
| A pending SPEC attached to a standalone story whose LLD is approved. | Superseded: no pending-decision from the SPEC; attentionRule names it. |
| A CR with meta.model 'client' and no meta.reviewedBy. | reviewedBy 'controller'. |
| A recorded block whose findings array holds null, a string and one valid unresolved MED finding. | No throw; the two malformed entries are dropped; effectiveVerdict 'block' from the valid MED; resolvedFindings 0. |
| A recorded 'warn' review carrying an unresolved MED finding (blockOn excluded MED). | verdict 'warn', effectiveVerdict 'block'; blocking true while the artifact is unapproved with no override. |
| A CR whose body is { verdict: 'block' } with no counts. | review present with counts { high: 0, med: 0, low: 0 }. |
| A CR with verdict block on a story with an unapproved BUILD, under the default codeReview.enforce off. | CR blocking true and review-blocked on the story, the same as with enforce on; no config is read. |

## 6. Test strategy

**Test framework:** `node:test via `npx tsx --test` (node:assert/strict), over fabricated records from src/workflow/delivery/__tests__/fixtures.ts`

**Test levels**

- **unit** — Artifact gates: approval and review facts.
  - Subjects: `gate.test.ts: 'approved, rejected and unstamped artifacts read approved, rejected and pending'`, `gate.test.ts: 'an unapproved block with no override is blocking and puts the item in Needs attention, and deriveStages over the same fixture gives the same stage as without the review'`, `gate.test.ts: 'an approved historical block and an overridden block do not block and still show the verdict and the override'`, `gate.test.ts: 'a block whose blocking findings are all resolved has effective verdict pass, and a warn with an unresolved MED is effectively a block'`, `gate.test.ts: 'a code review blocks only while its story has no approved build'`, `gate.test.ts: 'a malformed review, finding, code-review body, task entry or unparseable task id never throws and reports nothing invented'`, `gate.test.ts: 'the reviewer party is read through reviewerPartyOf, and a code review's own approval stamp is reported but does not lift its block'`
- **unit** — Item gates: task validation, conflict, attention.
  - Subjects: `gate.test.ts: 'an approved build with a failed task is a validation conflict and keeps both facts, and deriveStages over the same fixture still reads complete'`, `gate.test.ts: 'a failed story-level result on an approved build raises the conflict (BUILD-0855311b6b32eb72-S001 shape)'`, `gate.test.ts: 'a planned task with no recorded result is unrecorded and counted as neither passed nor failed'`, `gate.test.ts: 'a build task with no planned task keeps its result and is marked unplanned'`, `gate.test.ts: 'a pending artifact superseded by an approved later gate on the same item stops counting, even with a blocked review or as a SPEC on a story, and the rule is stated'`, `gate.test.ts: 'every epic, story and issue in the real-shape fixtures gets item gates, deterministically'`
  - Fixtures: `The ac2 and ac5 tests import deriveStages from stage.ts (test-only; gate.ts itself never consults the stage) to assert the stage half of those criteria.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `gate.test.ts: 'approved, rejected and unstamped artifacts read approved, rejected and pending'` |
| `ac2` | `gate.test.ts: 'an approved build with a failed task is a validation conflict and keeps both facts, and deriveStages over the same fixture still reads complete'`, `gate.test.ts: 'a failed story-level result on an approved build raises the conflict (BUILD-0855311b6b32eb72-S001 shape)'` |
| `ac3` | `gate.test.ts: 'a planned task with no recorded result is unrecorded and counted as neither passed nor failed'` |
| `ac4` | `gate.test.ts: 'a build task with no planned task keeps its result and is marked unplanned'` |
| `ac5` | `gate.test.ts: 'an unapproved block with no override is blocking and puts the item in Needs attention, and deriveStages over the same fixture gives the same stage as without the review'`, `gate.test.ts: 'a code review blocks only while its story has no approved build'`, `gate.test.ts: 'the reviewer party is read through reviewerPartyOf, and a code review's own approval stamp is reported but does not lift its block'` |
| `ac6` | `gate.test.ts: 'an approved historical block and an overridden block do not block and still show the verdict and the override'`, `gate.test.ts: 'a block whose blocking findings are all resolved has effective verdict pass, and a warn with an unresolved MED is effectively a block'` |
| `ac7` | `gate.test.ts: 'a pending artifact superseded by an approved later gate on the same item stops counting, even with a blocked review or as a SPEC on a story, and the rule is stated'` |

## 7. Alternatives considered

### 7.1 a1: Two-layer pass: artifact gates, then item gates over them — **CHOSEN**

Compute one ArtifactGate per record first, then each item's task validation, conflict and attention reasons from its evidence's gates.

A new src/workflow/delivery/gate.ts exports deriveGates(graph, recordSet): GatePassResult, with the sc5 types beside the other contract types in types.ts. Layer 1 builds an ArtifactGate for every record: approval from ArtifactRecord.approval; review from meta.review (+ meta.reviewResolutions, meta.reviewOverride) for design kinds, from body.verdict/body.counts/meta.reviewedBy for a CR; effectiveVerdict via effectiveReviewVerdict; blocking when the effective verdict is block, the gate the review guards is unapproved, and no override is recorded (for a CR the guarded gate is its story's BUILD). Layer 2 builds ItemGates for every epic, story and issue: task validation from the story's task items, plannedTaskIds and its BUILD records' body.tasks; the story-level result; the conflict when a BUILD is approved and any result failed; and the attention reasons from the item's evidence gates, applying the superseded-pending rule. Notices: unplanned-task and validation-conflict.

### 7.2 a2: Item-first pass

Walk each item and derive its artifacts' gates inline as needed.

For each item, read each evidence record's approval and review on the fly and accumulate attention reasons; build the artifacts map as a by-product.

**Rejected because:** Leaves store-level records without a gate.

### 7.3 a3: Gates folded into the BUILD entry

Attach the CR verdict and task results to the BUILD's ArtifactGate and skip a separate CR entry.

Treat the BUILD as the single gate of the build phase, with the CR verdict and task results stored on it.

**Rejected because:** Violates sc5.

## 8. References

- **[[c1]]** `code` `src/workflow/review/resolve.ts` — "export function effectiveReviewVerdict("
- **[[c2]]** `code` `src/workflow/types.ts` — "readonly reviewOverride?: { readonly reason: string; readonly at: string };"
- **[[c3]]** `code` `src/workflow/delivery/types.ts` — "export interface WorkItemNode {"
- **[[c4]]** `code` `src/workflow/id.ts` — "export function taskIdToOrdinal(taskId: string): number {"
- **[[c5]]** `analyze-bundle` `design.story/s1 data-model.trace: recorded review fields and build task results in the live store`
- **[[c6]]** `prior-artifact` `HLD-2ff0dfdadb1c8d1c sc5 GateAnnotation and the s3 story boundary`
- **[[c7]]** `code` `src/workflow/review/party.ts` — "export function reviewerPartyOf(review: unknown): PartyOrUnknown {"
- **[[c8]]** `code` `src/workflow/delivery/graph.ts` — "function taskOrdinalOf(taskId: string): number | null {"
- **[[c9]]** `code` `src/workflow/review/types.ts` — "export type ReviewVerdict = 'pass' | 'warn' | 'block';"
- **[[c10]]** `code` `src/workflow/review/verdict.ts` — "computeVerdict"
- **[[c11]]** `code` `src/workflow/code-review/gate.ts` — "verdict"
- **[[c12]]** `code` `src/workflow/code-review/gate.ts` — "return raw.codeReview?.enforce === true;"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 14 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-08T12:01:03.608Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._

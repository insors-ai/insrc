<!-- insrc:artifact LLD-599f1d0bd42e0c37-s1 -->

# LLD: STORY-599f1d0bd42e0c37-s1

## Summary

**Epic:** `reconcile-later-submitted-fixes-before-reporting`
**HLD base run:** `wf-1793853163874-e2733b`
**HLD effective hash:** `11fe5e0a0004...`

Review each task against one submitter-pinned final code revision while retaining the original commit selections as immutable scope provenance. Derive a bounded final-code view, account explicitly for surviving, superseded and deleted selections, and reject ambiguous or out-of-set changes. Reuse the current review coordinator and source readers; the other three code-review reliability fixes remain separate. The explicit pin is enforced by fresh schema construction; explicit effective task types and persisted host-computed identity guards define prompt, validation and reuse behavior. Coordination and missing-test non-regression requirements are specified below. Code citations identify current extension points; newly proposed behavior is not claimed to already exist. [[c1]] [[c18]] Standalone acceptance labels used by the test mapping are defined here: ac1 = explicit immutable pin and valid origins; ac2 = distinguish historical fixed defects from unresolved final defects; ac3 = complete bounded caller-selected scope and strict finding coordinates; ac4 = durable resume/reuse/publication/history and truthful failure handling; ac5 = end-to-end native/controller behavior against the originating issue. These labels organize this LLD’s requirements derived from the approved ISSUE rather than claiming an upstream Epic definition. [[c1]]

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour. The empty shared-contract arrays have no applicable HLD ids; explicit process coordination is documented in the coordination dataModelChanges entry and does not create a data entity. [[c13]] [[c14]] [[c15]] Historical evidence boundary: the temporary S3 checkpoint cited by the originating ISSUE is unavailable. Durable CR review 1 t3/t9, its original selected commit scope and immutable source/test objects independently support the stale-version defect; no claim about the unavailable original packet, attribution, elapsed timing or rejected t6 payload is needed for this LLD. The evidence inventory states these limits and defines a labelled synthetic behavior reproduction rather than a raw-packet replay. [[c19]] [[c20]]
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `prepareReviewPacket`

```typescript
prepareReviewPacket(input: unknown, sources: ReviewSources, historical?: boolean, route?: StoryRoute, stored?: StoredDerived): Promise<PreparedReviewPacket>
```

**Parameters:**
- `input: unknown` — Existing untrusted packet; new starts require reviewRevision, a full commit object ID. Original reviewSet and after-block/deletion selections remain mandatory. [[c2]] [[c3]]
- `sources: ReviewSources` — Existing daemon-owned committed object/diff adapter; add explicit ancestor validation using the existing typed Git merge-base tool. No direct shell, checkout, HEAD or cloud access. [[c3]] [[c4]]
- `historical, route, stored: existing optional parameters` _(optional)_ — Preserve route-correct document reads and immutable stored-history decoding. Historical read permission never authorizes old unpinned model execution. [[c3]]

**Returns:** `Promise<PreparedReviewPacket>` — Validated original selections plus a bounded final-revision projection and origin-complete effective task input. No model call during preparation. [[c3]]

**Errors:**
- `TaskReviewInputError` when field=reviewRevision for missing/symbolic/unavailable/non-commit pin; field=reviewRevision.ancestry for a verified non-ancestor origin; field=scope_conflict for an unprovable mapping/replacement/path; field=projection_limit for explicit budget exhaustion. Existing original-selection/document/source fields retain their current names. These are Error.field identifiers, not a new error.code enum. Source transport/object-integrity errors are not false ancestry. [[c2]] [[c3]] [[c4]] New pinned zero-segment originals are explicitly scope_conflict, including the previously accepted metadata/non-textual limitations case. [[c3]] Existing envelope oversize remains field=input and existing changedRanges truncation remains field=changes; only the newly introduced projection/read/fragment/serialized-snapshot counters emit projection_limit. No message-text based error rewriting. [[c2]] [[c4]]

**Preconditions:**
- Keep existing strict original hunk/parent/path/document validation. Require each origin commit to be an ancestor of or equal to the pinned final revision. Packet array order never establishes ancestry. Never infer or substitute HEAD. [[c2]] [[c3]] [[c4]]
- Build the new submission schema as a fresh TypeBox Object from a separately cloned field-definition map: supply reviewRevision as a non-optional OID field when constructing that Object and preserve additionalProperties=false. StoredPacketSchema constructs reviewRevision as optional for historical reads. Omit before-version selections only from the separately cloned submission shape. Do not merely replace a property on a cloned object whose required array was already computed. Validate that PacketSchema.required contains reviewRevision and decodeReview rejects its absence, while StoredPacketSchema still reads old records. This specifies schema construction, not an API that already exists. [[c2]]
- New pinned execution deliberately rejects every original file selection with segments=[] (metadata-only, mode-only or non-textual selections) using TaskReviewInputError field=scope_conflict, naming its origin change index and path, before admission or model dispatch. This replaces the current non-error limitations path for new pinned execution. It does not create an OriginRef with a fictional segmentIndex, drop a module, or treat an empty selection as whole-file scope. Historical no-pin records remain readable under their original rules. A fully superseded original with nonempty submitted segments is different: it still has dispositions and may derive findingScope=none. [[c2]] [[c3]] [[c5]] [[c18]]

**Postconditions:**
- Project each explicitly selected original +/- span or deletion anchor using committed path/line lineage into reviewRevision. All resulting finding coordinates and embedded reviewed text refer to that revision. Preserve every origin selection as surviving, superseded or deleted, including partial supersession. Keep one stable preparation entry per original file selection so attribution indexes remain accountable. [[c1]] [[c3]]
- Unchanged text outside selected spans may shift offsets but never becomes selected. Replacement/deletion of selected material is accepted only when covered by other submitted origin selections projected to the same final scope; otherwise reject scope_conflict. Superseded origins carry trace metadata and no historical code as active finding scope. Never silently drop required modules or expand to a whole file because effective spans are empty. [[c1]] [[c3]]
- Validate actual selected rename links with Git objects, preserve previousPath provenance and map to the final path. Refuse ambiguous/colliding/unselected rename paths rather than guessing. Merge-resolution text must be explicitly represented in the submitted review set if it replaces selected text. [[c3]] [[c4]]
- Before any attribution/model dispatch, validate the pinned projection and its metadata-only unmapped-failure snapshot against the existing 4 MiB MAX_REVIEW_JSON_BYTES boundary together with submitted input. Accepted mapping size is not yet known: after attribution is validated, enforce the complete mapping/snapshot budget before atomically accepting it or dispatching ANY task assessment/reuse. A rejected oversized mapping becomes an explicit unmapped attribution failure (or a pointed correction within the existing attribution policy); an attribution model call may already have occurred, but no task assessment does. Direct no-model mapping is checked at the same boundary. Never truncate indexes. [[c2]] [[c3]] [[c10]] [[c11]] [[c12]]

### 2.2 `projectReviewScope (proposed private helper)`

```typescript
projectReviewScope(origins: readonly SelectedChange[], reviewRevision: string, sources: ReviewSources): Promise<ReviewProjection>
```

**Parameters:**
- `origins: readonly SelectedChange[]` — Already-validated original selections, never untrusted raw final coordinates. [[c3]]
- `reviewRevision: full commit OID` — Submitter-pinned final version, independently object/ancestry-validated. [[c2]]
- `sources: ReviewSources` — Bounded committed object and zero-context changed-run reads. Existing identical blob OIDs imply identity mapping without requesting a diff that requires textual changes. [[c4]]

**Returns:** `Promise<ReviewProjection>` — Final paths/blobs, projected after spans/deletion boundaries and complete origin-disposition ledger derived from immutable input. Private derived state, not a second caller-authored change set. [[c3]]

**Errors:**
- `TaskReviewInputError` when field=scope_conflict for unprovable replacement/partial mapping/rename lineage; field=projection_limit ONLY for the helper’s new projection-local byte/read/fragment/snapshot counters. Reused changedRanges truncation/tool failures retain field=changes; input envelope oversize retains field=input; source integrity/transport errors retain their original typed fields. Ancestor/pin validation happens first in prepareReviewPacket. [[c2]] [[c3]] [[c4]]

**Preconditions:**
- Operate serially through existing ReviewSources and typed Git tools. Bound work before allocating model context; do not add a generalized graph or dependency service. [[c4]]
- Every input SelectedChange has at least one validated segment; the earlier prepareReviewPacket guard handles zero-segment originals. OriginRef.segmentIndex always names a real submitted segment. [[c3]]

**Postconditions:**
- Treat original line intervals as sets of surviving subintervals: unchanged runs retain text with the exact line offset derived from preceding +/- counts; overlapping changed runs split the interval into surviving and superseded portions. Map only unambiguous deleted boundaries as anchors, including line zero for an empty file. Coalesce overlapping final spans while retaining all source origin IDs. Verify each projected span is within the final decoded UTF-8 blob. [[c3]] [[c4]]
- Track superseded portions separately; require their replacement spans/deletion boundaries to have submitted-origin witnesses in the final projection. If overlapping partial replacement or rename cannot be proved, fail closed. No heuristic text matching, fuzzy relocation, graph inference or invented scope. Process the entire origin set before deciding whether a superseded portion has a valid replacement witness. [[c3]]
- For an origin that leaves no final code, retain an explicit no-finding-scope disposition; this is not an empty segment list that permits whole-file findings. The task still assesses its acceptance checks against final code/context and remaining selected origins. Pure deleted-file/anchor scope retains current deletion semantics and committed evidence. [[c3]] [[c5]]
- Projection retains each original SelectedChange unchanged and returns the exact ReviewProjection/ProjectedEntry/OriginDisposition fields in the data model. Superseded sourcePart partitions require strictly later ancestor-verified witness origins; reject witness cycles or unknown/out-of-range indexes. The deterministic identity covers final blob IDs and normalized full projection, not unpinned working-tree content. [[c3]] [[c4]]

### 2.3 `ReviewSources / RegistryReviewSources`

```typescript
ReviewSources += isAncestor(ancestor: string, descendant: string): Promise<boolean>
```

**Parameters:**
- `ancestor, descendant: full commit OIDs` — Pinned objects only; existing commit/file/changedRanges methods remain the source readers. [[c4]]

**Returns:** `Promise<boolean>` — Existing typed git_merge_base isAncestor result; unavailable objects/transport errors are errors, not false ancestry. [[c4]]

**Errors:**
- `existing source error` when Preserve existing typed source/commit/changes failures. changedRanges uses field=changes for tool failures, truncation and unverifiable changed ranges; source object integrity failures retain field=source and commit resolution retains field=commit. No transport/integrity error is relabeled as projection_limit or false ancestry. Projection-local counters alone use projection_limit in projectReviewScope. No automatic checkout/fetch. [[c2]] [[c3]] [[c4]]

**Preconditions:**
- Use callTool with existing daemon authority and read-only Git tool. [[c4]]

**Postconditions:**
- No repo/index/database ownership change. No direct child process, network fetch or raw generic repository dump is introduced. [[c4]]

### 2.4 `selectedCode / deriveTaskAssignments / assignmentPrompt`

```typescript
Existing functions consume PreparedReviewPacket's final projection while retaining original selection indexes
```

**Parameters:**
- `prepared/assignment: existing prepared packet/task assignment with final scope metadata` — Same task dependency order and complete attribution. Cross-cutting origins may map to multiple tasks. All submitted tests remain mandatory attribution evidence. [[c3]] [[c6]]

**Returns:** `existing assignment/prompt shapes with bounded final scope metadata` — One common policy and final code view for native and controller reviewers. Historical code is context/provenance only. [[c6]]

**Errors:**
- `existing attribution error` when Any original selection or supplied test is unassigned; final projection cannot justify task scope.

**Preconditions:**
- Every original entry remains accounted for even when superseded; preserve the existing no-scope-omission check. [[c3]] [[c6]]

**Postconditions:**
- Embed selected final-version code only; give finalRevision:path evidence refs and source-origin pointers. Grants include explicit reads of pinned final and origin objects, never git show HEAD. Superseded-only entries cannot manufacture whole-file finding scope. [[c6]]
- Review actual final requirements, test coverage and acceptance checks. Explain that a historical defect fixed by a later submitted change is not an unresolved final defect; unresolved final defects still block. The other approved fixes remain separately owned and sequenced as the coordination section specifies. [[c13]] [[c14]] [[c15]]
- For a task attributed a superseded origin, require the same task's changeIndexes to include the later replacement/deletion witness entries (transitively, with bounded ancestry-ordered closure). Reject an incomplete attribution with pointed missing indexes rather than accepting a vacuous no-finding-scope pass. Cross-task replacement entries remain reusable by multiple tasks; every acceptance check is assessed against active final witness scope. [[c3]] [[c6]]
- The explicit EffectiveTaskChange -> TaskAssignment.changes -> selectedCode/policy.ts -> assignmentResultSchema/TaskResultScope path is defined in §3.2. The same effective objects supply prompt code, read grants, native path constraints and final host range validation. Original SelectedChange objects remain origin evidence only. None-scope rows never authorize arbitrary path findings. [[c3]] [[c5]] [[c8]] [[c16]] [[c17]]

### 2.5 `validateTaskResult / reuseAssessment / history publication`

```typescript
Existing result, reuse and publication paths validate and retain the pinned final scope
```

**Parameters:**
- `scope/context: task's derived final projection and immutable attempt metadata` — Use final paths/line spans for finding locations; origin versions remain inspectable evidence, not active coordinates. [[c5]]

**Returns:** `existing result/CR records plus reviewRevision provenance` — A passing current build binding represents the final submitted code, with original selections and prior attempts preserved. [[c5]]

**Errors:**
- `existing scope/reuse/identity error` when Finding targets historical/superseded-only coordinates; reused feedback has incompatible final blobs/projected scope/requirements/test inputs; an execution without explicit pin is requested.

**Preconditions:**
- New starts require the pin. Completed historical records lacking it remain readable/publishable as historical records, without new model execution or a final-version equivalence claim. Old unpinned interrupted work requires a new explicit pinned attempt rather than silently inferring a revision. [[c2]] [[c2]] [[c9]] [[c11]]

**Postconditions:**
- Persist reviewRevision in submitted packet/checkpoint/permanent CR and include it in exact replay/review freshness binding. Never rewrite prior attempts. Reuse is allowed only after existing same-party checks plus exact task final-blob/scope/document/test-input compatibility; otherwise reassess, preserving earlier feedback as context. [[c8]] [[c9]] [[c10]] [[c11]] [[c12]]
- No review-engine fallback, compatibility flag, activation mechanism, new data store, UI or changes to technical retry/activity/approval policy. Keep native/controller behavior identical and preserve all valid historical evidence. [[c1]] [[c5]]
- Existing validateTaskResult(source results.ts) receives TaskResultScope.changes: readonly EffectiveTaskChange[] for pinned execution. A location must match an active final path/span/deletion anchor; findingScope=none never matches, even when segments=[]. This is the deterministic superseded-coordinate guard. Changed-in-revision code is reviewed at its final coordinates; origin coordinates remain evidence only. [[c3]] [[c5]] [[c17]]
- Publication and permanent CR validation use the two-branch FinalScopeSnapshot contract in the saved-attempt data-model entry. Accepted mappings are reconstructed from durable header.acceptedAttribution and validated offline using the separate attributionIdentity; pinned pre-attribution terminal failures publish the explicit unmapped_failure branch with no finding scope or reuse. Shifted/renamed final findings validate from their saved per-task subset. A declared pin never falls back to original coordinates, and completed historical no-pin records keep their original read-only validator. [[c3]] [[c8]] [[c10]] [[c11]] [[c12]] [[c21]]

### 2.6 `taskFinalIdentity / bindTaskFinalIdentities (proposed shared helpers)`

```typescript
taskFinalIdentity(prepared: PreparedReviewPacket, assignment: TaskAssignment): string; bindTaskFinalIdentities(review: AdmittedReview, attribution: readonly TaskAttribution[]): Promise<readonly TaskAssignment[]>
```

**Parameters:**
- `prepared, assignment: PreparedReviewPacket, TaskAssignment` — Host-derived final effective source and accepted task mapping, never a model-supplied digest. [[c3]] [[c8]]
- `review, attribution: AdmittedReview, readonly TaskAttribution[]` — Existing admitted attempt and the complete accepted taskId/changeIndexes/testIndexes mapping, including direct mapping derived by the host. The shared helper validates, derives, binds and atomically persists it for both reviewer routes. [[c3]] [[c8]] [[c9]]

**Returns:** `SHA256 string / Promise<readonly TaskAssignment[]>` — Deterministic task input identity, or validated assignments returned only after their canonical attribution rows and bindings are durable. [[c8]] [[c10]]

**Errors:**
- `TaskReviewInputError` when field=reuse when a source lacks compatible stored identities; field=projection_identity when recomputation or an attempted same-attempt replacement disagrees with the admitted binding. Storage failure is propagated without publishing or dispatching reuse. [[c8]] [[c10]]

**Preconditions:**
- prepareReviewAdmission computes and stores header.finalScopeIdentity from reviewRevision and the normalized original-selection/projection identity before acknowledgement. It is recomputed and compared on pinned resume and publication; old no-pin history does not obtain a synthetic identity. [[c9]] [[c10]] [[c11]]
- New pinned admission sets header.attributionState=pending. After direct derivation or model/controller attribution, bindTaskFinalIdentities validates attribution through deriveTaskAssignments and witness closure, computes exactly one task identity for each selected task, and in ONE awaited checkpoint save sets header.attributionState=accepted plus header.acceptedAttribution, header.taskScopeIdentities and header.attributionIdentity. Do this even when no diagnostic was resolved. No attribution acknowledgement, reuse or task-assessment dispatch occurs until that save succeeds; on failure retain the previous checkpoint state and dispatch nothing. The selected task set is header.selectedTaskIds, ordered by the existing plan task order. [[c3]] [[c8]] [[c9]] [[c10]]

**Postconditions:**
- Per-task digest uses canonical key-sorted JSON of taskId, acceptance checks, ordered final path/full-blob OID/none-scope/final spans and deletion anchors, pinned requirement document content identities and full submitted test details (file, cases, command, result, executionDetails, evidence). Arrays preserve semantic order; derived interval normalization is deterministic. It excludes the raw global revision string, so unrelated revision movement may reuse only if all actual task inputs remain byte-identical. Relevant blob/scope/doc/test differences always change the digest. [[c3]] [[c8]]
- Extend sourceAssessment and reuseAssessment to compare the current task digest and stored sourceAttempt.header.taskScopeIdentities row after existing ordinal/same-party checks, before returning/copying a source result. reviewAssignments reports field=reuse with pointed request to choose reassess for an incompatible candidate. reuseAssessment repeats the guard before copying, then keeps its existing exact-result and current-scope validation. Missing historical identities refuse reuse; they never infer equivalence from prose or a passing status. [[c8]]
- Checkpoint save/load enforces the complete attribution phase/row/binding contract in the saved-attempt data-model entry. Resume/publication recomputes final projection identity from pinned sources and, for accepted state, reconstructs the exact saved change/test mapping and recomputes its full task identities and attribution digest. Completed CR history carries the bounded representation required by its accepted/unmapped branch. Historical no-pin records are not assigned fabricated bindings. [[c9]] [[c10]] [[c11]] [[c12]]
- Publish the admitted final projection as the metadata-only FinalScopeSnapshot after reconstructing and comparing it against the pinned Git objects and accepted task attribution. The snapshot supplies actual per-task finding coordinates to synchronous permanent-history validation; the existing identity fields remain compatibility guards, not a substitute for saved coordinates. [[c9]] [[c10]] [[c11]] [[c12]]
- Persist header.acceptedAttribution as bounded immutable rows {taskId,changeIndexes,testIndexes}, not serialized TaskAssignment blobs. Arrays contain unique in-range integers and preserve their accepted order; task rows are unique and follow selected task order. Every original change and every supplied test has coverage across the selected rows; required replacement-witness closure is validated for each row. A task can have zero or more change/test indexes, as the existing assignment derivation allows; zero changes authorize no findings. On resume/publication reconstruct assignments from these saved rows plus the pinned prepared sources, requirement documents and submitted tests, then recompute full task identities and compare. Never ask a model to rediscover an already accepted mapping or infer it from digests. A resumed partially completed attempt uses the same immutable mapping, including reassessment origins where applicable. [[c3]] [[c8]] [[c9]] [[c10]] [[c11]]
- The separate attributionIdentity is SHA256 of canonical key-sorted JSON {format:"final-attribution-v1",state,finalScopeIdentity,selectedTaskIds,testCount,rows}. For accepted state, rows are [{taskId,changeIndexes,testIndexes,identity}] formed by joining acceptedAttribution with taskScopeIdentities; array order is preserved and testCount equals submitted.tests.length. This binds final task-to-entry/test indexes to the stored full task identities without requiring synchronous history readers to reconstruct acceptance checks or test contents. It is a consistency digest of host-owned state, not a signature against an attacker rewriting every field. Index-only edits with all digest strings unchanged must fail offline recomputation. [[c8]] [[c10]] [[c11]] [[c12]] The canonical hash state is the snapshot discriminator: accepted or unmapped_failure; checkpoint attributionState=failed maps to unmapped_failure. Pending state has no attributionIdentity. [[c10]] [[c12]]

## 3. Data model changes

### 3.1 `ReviewPacket.reviewRevision` — field-add

Required full Git OID on every new submission; optional only in immutable historical storage decoding. The submitter pins it before start, and exact replay includes it. All origin commits must be reachable ancestors/equal. It is a source version, not a generic diff boundary or permission to review unrelated code. [[c2]] [[c3]]

```
StoredPacketSchema adds an optional reviewRevision using the existing OID schema. PacketSchema is rebuilt as a fresh strict TypeBox Object from cloned fields, with reviewRevision supplied as a non-optional field at object creation. Its required array must include reviewRevision; all existing required top-level fields stay required. before is excluded only in the new-submission nested segment schema, without mutating StoredPacketSchema. Replacing only .properties.reviewRevision on CloneType(StoredPacketSchema) is explicitly insufficient because TypeBox already computed required. parsePacket/decodeReview and MCP discovery use this constructed submission schema. Existing historical decode retains the optional field. [[c2]]
```

**Call sites:**
- `src/workflow/code-review/task-review/contracts.ts`
- `src/workflow/code-review/task-review/packet.ts`
- `src/mcp/code-review/schema.ts`

### 3.2 `ReviewProjection and origin relationships` — new

Proposed private prepared-state representation. Packet owns exactly one final revision; it owns 1..10000 original file-selection entries. Each original segment has one disposition with 0..many surviving final spans, 0..many explicit superseded portions, and/or deletion-anchor witnesses. Final spans may have multiple originating selections; origins remain identifiable by stable reviewSet/file/segment indexes. Direction is origin -> final projected scope, never a copied historical result body. Entirely superseded entries stay in attribution with findingScope='none'. Preserve all originals byte-for-byte in submitted history; derived projection is reproducible from their committed objects. [[c3]] New pinned execution deliberately rejects every original file selection with segments=[] (metadata-only, mode-only or non-textual selections) using TaskReviewInputError field=scope_conflict, naming its origin change index and path, before admission or model dispatch. This replaces the current non-error limitations path for new pinned execution. It does not create an OriginRef with a fictional segmentIndex, drop a module, or treat an empty selection as whole-file scope. Historical no-pin records remain readable under their original rules. A fully superseded original with nonempty submitted segments is different: it still has dispositions and may derive findingScope=none. [[c2]] [[c3]] [[c5]] [[c18]]

```
Proposed private TypeScript shapes (all arrays validated against named bounds; no caller JSON projection):
type OriginRef = { readonly changeIndex: number; readonly segmentIndex: number };
type ReviewedSegment = { readonly after: readonly [number,number] } | { readonly deletionAt: number };
interface OriginDisposition {
 readonly source: OriginRef;
 readonly sourcePart: ReviewedSegment;
 readonly kind: 'surviving' | 'superseded' | 'deleted';
 readonly finalSegments: readonly ReviewedSegment[];
 readonly replacementWitnesses: readonly OriginRef[];
}
interface ProjectedEntry {
 readonly originChangeIndex: number;
 readonly commit: string; // equals reviewRevision
 readonly path: string; // verified final path
 readonly after: PinnedBlob | null;
 readonly findingScope: 'selected' | 'none';
 readonly segments: readonly ReviewedSegment[];
}
interface ReviewProjection {
 readonly revision: string;
 readonly entries: readonly ProjectedEntry[];
 readonly dispositions: readonly OriginDisposition[];
 readonly identity: string; // deterministic SHA256 of pin, original selection identities, final blob IDs and normalized projection
}
PreparedReviewPacket retains original validated SelectedChange records separately from this derived projection. Preserve original parent/path/previousPath metadata there; projected finding coordinates never pretend the final revision's immediate parent introduced every selected span.
entries length equals original file-selection count and preserves those stable indexes. A text source interval is partitioned exactly once into disjoint sourcePart intervals by dispositions; original deletion anchors are accounted as boundary singletons. No source portion is lost or double-counted. Surviving dispositions have nonempty finalSegments. A superseded portion has no active historical text and requires nonempty replacementWitnesses pointing to valid later submitted origins whose final scope proves the replacement/deletion; witnesses must follow verified ancestry, never array order. Deletion semantics use explicit verified anchors, including zero at an empty-file boundary. findingScope=none requires segments=[] and forbids findings, never grants whole-file scope. Active selected segments are nonempty final spans or deletion anchors. Normalize/deduplicate final spans without losing origin references. Every path/OID/range/ref/identity is bounded and validated; no raw prior result bodies or model reasoning are added.
Concrete consumer threading (proposed extensions, not existing declarations):
interface EffectiveTaskChange {
 readonly originChangeIndex: number;
 readonly commit: string; // pinned reviewRevision
 readonly path: string; // verified final path
 readonly after: PinnedBlob | null;
 readonly findingScope: 'selected' | 'none';
 readonly segments: readonly ReviewedSegment[];
 readonly origin: SelectedChange; // immutable original commit/parent/path/previousPath/segments
}
PreparedReviewPacket retains originChanges: readonly SelectedChange[], and exposes changes: readonly EffectiveTaskChange[] plus projection: ReviewProjection for new pinned execution. TaskAssignment.changes becomes readonly EffectiveTaskChange[] on that execution path. original changeIndexes still index entries one-for-one. No projected commit/parent pair is presented as if the final revision introduced all selected lines; origin metadata remains explicit.
For each originChangeIndex i, ProjectedEntry.segments is exactly the normalized deduplicated union of finalSegments of its surviving/deleted OriginDispositions. Superseded historical portions contribute no active segments; replacement witness entries supply their own final scope and must be included in the same task's attribution closure. Empty aggregate implies findingScope=none, not unbounded scope. Coalescing preserves all source refs and never merges over unselected gaps.
selectedCode consumes EffectiveTaskChange.after/path/segments and embeds final-version selected blocks with origin references. deriveTaskAssignments validates origin-index completeness and required witness closure, then passes those same effective objects to TaskAssignment. policy.ts assignmentPrompt and codeTaskCommands consume them; native git-show grants include the explicit final commit/path plus origin evidence, never HEAD. result-schema.ts assignmentResultSchema derives allowable paths from active effective entries only. results.ts TaskResultScope.changes takes the effective type, and validateTaskResult checks final path and exact final spans/anchors, explicitly ignoring none-scope entries. It must not fall through to the old empty-segments whole-file rule. Native/controller callers share these types and validators. Historical rendering reads original records without launching an old execution path. [[c3]] [[c5]] [[c8]] [[c16]] [[c17]]
Zero-segment admission rule: OriginRef remains segment-indexed because new pinned execution rejects any original selection with no segments before projection. Every accepted original therefore has a nonempty partitionable source set. Metadata/non-textual historical rows are not converted into none-scope projection rows. [[c3]] [[c18]]
```

**Call sites:**
- `src/workflow/code-review/task-review/packet.ts`
- `src/workflow/code-review/task-review/sources.ts`
- `src/workflow/code-review/task-review/results.ts`
- `src/workflow/code-review/task-review/result-schema.ts`
- `src/workflow/code-review/task-review/policy.ts`
- `src/workflow/code-review/task-review/assessment.ts`
- `src/workflow/code-review/task-review/coordinator.ts`
- `src/workflow/code-review/task-review/controller.ts`

### 3.3 `Projection bounds and failure behavior` — invariant-change

Reuse the 4 MiB packet JSON cap with existing field=input and the existing 10000 file/segment selection caps. Reused Git diff truncation at its 2 MiB cap retains field=changes. New internal projection counters are capped at 10000 distinct object/diff reads, 100000 projected fragments and 64 MiB cumulative decoded source bytes, and emit field=projection_limit before attribution dispatch; coalescing never loses origin IDs. Static serialized projection/unmapped snapshot capacity is checked before attribution. The complete accepted mapping/snapshot budget is checked after attribution but before its atomic acceptance or task-assessment/reuse dispatch; a failed mapping does not replace accepted bindings and has the truthful unmapped-failure path. No error is translated by matching its message, selected data is never truncated, and no hosted/provider call is parallelized. [[c2]] [[c3]] [[c4]] [[c10]] [[c11]] [[c12]]

**Call sites:**
- `src/workflow/code-review/task-review/contracts.ts`
- `src/workflow/code-review/task-review/packet.ts`
- `src/workflow/code-review/task-review/sources.ts`

### 3.4 `Saved attempt and CR version provenance` — field-add

New pinned attempts persist projection provenance and an explicit attribution phase. A successfully accepted mapping is stored atomically with its task bindings and a separately recomputable attributionIdentity, so resume and publication do not depend on reviewer memory. Pinned terminal failures before attribution use an explicit no-finding-scope representation and remain publishable. Completed historical no-pin records preserve their original read-only format. [[c2]] [[c3]] [[c8]] [[c9]] [[c10]] [[c11]] [[c12]] [[c21]]

```
ReviewAttempt.header adds finalScopeIdentity?: SHA256; attributionState?: 'pending' | 'accepted' | 'failed'; acceptedAttribution?: readonly {taskId: text; changeIndexes: readonly number[]; testIndexes: readonly number[]}[]; taskScopeIdentities?: readonly {taskId: text; identity: SHA256}[]; attributionIdentity?: SHA256; attributionFailure?: {code: text; summary: text}. Optional only for decoding historical no-pin attempts. New pinned admission requires finalScopeIdentity and attributionState=pending. Accepted attribution requires acceptedAttribution/taskScopeIdentities/attributionIdentity together and forbids attributionFailure. Pending attribution has none of those accepted bindings. Unmapped terminal failure sets attributionState=failed, attributionFailure and its no-scope attributionIdentity, without inventing acceptedAttribution or taskScopeIdentities. Persist this failure state/digest atomically with its first failure result; later completion saves the remaining selected task outcomes before publication. An attempt whose mapping was accepted stays accepted even if a later task fails.

Persist the same per-task mapping for both reviewer routes: native run and controller scope call the shared async binding helper before acknowledging accepted attribution or executing tasks/reuse. Direct no-model attribution also passes through this save. An earlier durable mapping cannot be replaced within an attempt. Checkpoint save/load validates phase/field co-presence, uniqueness, index bounds, global change/test coverage and per-task witness closure. Bound selected task rows to 10000, each list to the existing 10000 input caps and total references to the existing serialized JSON budget; never truncate.

Permanent final-coordinate representation (proposed host-owned addition):
interface FinalScopeSnapshot {
 readonly revision: string;
 readonly identity: string; // equals header.finalScopeIdentity
 readonly entries: readonly {originChangeIndex: number; path: string; blobOid: string | null; findingScope: 'selected' | 'none'; segments: readonly ReviewedSegment[]}[];
 readonly dispositions: readonly OriginDisposition[];
 readonly selectedTaskIds: readonly string[];
 readonly testCount: number;
 readonly attributionState: 'accepted' | 'unmapped_failure';
 readonly attributionIdentity: string;
 readonly tasks: readonly {taskId: string; changeIndexes: readonly number[]; testIndexes: readonly number[]; identity: string}[];
 readonly attributionFailure?: {code: string; summary: string};
}
CompletedReviewSummary.scope adds reviewRevision?: OID and finalScope?: FinalScopeSnapshot. It also carries finalScopeIdentity and attributionIdentity from the header in both terminal branches; taskScopeIdentities is present only when mapping was accepted. A pinned summary always requires its pin, final projection snapshot and finalScopeIdentity together, then validates exactly one attribution-state branch below. A partial pinned summary or finalScope without a pin is invalid; there is no fallback to original coordinates. No blob text or model-authored coordinates are persisted.

Projection ownership/cardinality: one pinned summary owns one snapshot; each original file selection has one entry with the same stable originChangeIndex; dispositions partition real submitted segments and retain witness references. selected implies nonempty final spans/deletion anchors, none implies segments=[] and no findings. Normalize metadata exactly as the prepared projection, replacing blob bodies with OIDs. Recompute the projection identity from explicit revision, immutable reviewSet selections, normalized final entries and dispositions; exclude redundant identity and attribution fields. No synchronous Git calls are introduced. Existing <=10000 file/selected-task/input-index caps, <=100000 projection fragments and 4 MiB serialized boundaries remain enforced.

Accepted branch: snapshot.attributionState=accepted. Each selected task owns exactly one row and matching taskScopeIdentities binding. Row change/test index lists are the durable header.acceptedAttribution lists, not regenerated model decisions. A task can reference zero or more entries; an entry/test may be shared across tasks, while the union covers every original change/test and each row satisfies witness closure. taskCount, selectedTaskIds and testCount are checked against the pinned input on publication; selected task IDs must exactly equal permanent task result IDs. The snapshot attributionIdentity and summary/header attributionIdentity are equal, and offline readers independently recompute the canonical final-attribution-v1 hash over the state, finalScopeIdentity, selectedTaskIds, testCount and complete ordered rows including task identities. Changing only a row index must therefore fail even when all other identity strings are unchanged. Full task identities remain source-recomputed at resume/publication; offline binding checks do not pretend to rederive their unavailable acceptance/document/test content inputs.

Pre-attribution terminal branch: snapshot.attributionState=unmapped_failure, tasks=[], attributionFailure is required, and summary taskScopeIdentities/accepted mapping are absent. selectedTaskIds contains the admitted task set and testCount is preserved. The attributionIdentity is computed by the SAME canonical function with state=unmapped_failure and rows=[]; persist it in the terminal header/summary while leaving task identities absent. Only terminal failed/incomplete results for exactly the selected tasks are permitted; every result has findings=[], no reuse origins, unverified coverage and its actual error or missing-evidence explanation. Validate each result with changes=[] so neither preserved projection entries nor an empty list grant findings or pass scope. No passed/changes_requested result or invented attribution is allowed. This branch covers attribution inactivity, provider failure and exhausted invalid submissions on BOTH routes, as well as a mapping rejected for its serialized bound before acceptance. Record the precise failure and complete the existing publication flow; after crPublication=complete the ordinary next-attempt gate permits a new explicitly pinned attempt. Do not downgrade an accepted mapping to this branch after task execution.

Publication: publishTaskCheckpoint loads the checkpoint independently, reconstructs the pinned projection with ReviewSources and compares finalScopeIdentity. For accepted state it loads acceptedAttribution from the checkpoint, derives assignments, recomputes task identities and attributionIdentity, then constructs snapshot rows. No memory from the coordinator/controller is needed. For a terminal unmapped failure it verifies the absence of accepted mapping, exact selected failed/incomplete results and no findings/origins, then constructs the no-scope branch. It does not call attribution or any provider. mergeTaskSummary/validateTaskBody/renderTaskReview synchronously use the saved representation: validate schema, projection consistency, attribution-state rules and recomputed attribution digest, then validate findings against ONLY each mapped task's final entry subset, or changes=[] for unmapped failure. No historical previousPath fallback authorizes final findings. Byte-identical publication is idempotent; a changed snapshot conflicts. Historical no-pin summaries keep the original reviewSet-based validator and never authorize model execution/reuse. [[c2]] [[c3]] [[c5]] [[c8]] [[c9]] [[c10]] [[c11]] [[c12]] [[c21]]
```

**Call sites:**
- `src/workflow/code-review/task-review/contracts.ts`
- `src/workflow/code-review/task-review/admission.ts`
- `src/workflow/code-review/task-review/assessment.ts`
- `src/workflow/code-review/task-review/publication.ts`
- `src/workflow/code-review/task-review/record.ts`
- `src/workflow/code-review/task-review/checkpoint.ts`
- `src/workflow/code-review/task-review/coordinator.ts`
- `src/workflow/code-review/task-review/controller.ts`

### 3.5 `Coordination with the other approved code-review fixes` — invariant-change

Process coordination invariant, deliberately documented here because standalone LLDs have no HLD shared-contract identifiers; this entry adds no data entity or storage field. interactionWithShared remains empty because this standalone ISSUE has no HLD shared-contract IDs; the existing field accepts only real scN references. Coordination is explicit here instead. Build/merge order: (1) ISSUE-599f1d0bd42e0c37 final-version scope and identity contracts; (2) ISSUE-2a3c21b73b79ef9c native output/diagnostic reliability; (3) ISSUE-81e68ebf54745c75 rejected-result correction/preservation; (4) ISSUE-860d6e82ab04d314 coverage-assessment classification. Work sequentially in that order; rebase/merge each later implementation onto reviewed predecessors and rerun shared validation tests before its review. No concurrent edits are assumed safe. This fix owns only effective finding-coordinate inputs and identity guards in results.ts/assessment.ts. It leaves native output repair, rejection handling, status normalization, coverage meaning and optional-execution semantics unchanged for their owning issues. The later rejection-recovery fix consumes the final scope/error fields defined here and must not relax them; the classification fix consumes the same results without adding scope expansion. Any later shared-type change requires an explicit design amendment and affected regression checks, not a claim of automatic non-conflict. [[c1]] [[c13]] [[c14]] [[c15]]

**Call sites:**
- `src/workflow/code-review/task-review/results.ts`
- `src/workflow/code-review/task-review/assessment.ts`
- `src/workflow/code-review/task-review/policy.ts`

## 4. Error paths

**Error cases**

- **Missing or invalid final pin** (recoverable)
  - Detection: Fresh strict PacketSchema requires reviewRevision in its constructed required array; decodeReview rejects absence/non-OID values. prepareReviewPacket then resolves a commit object and rejects unavailable/non-commit pins. See §2.1/§3.1 schema construction, not an in-place optional-field mutation. [[c2]] [[c3]]
  - Response: Reject TaskReviewInputError with field=reviewRevision before admission/model dispatch. Never substitute HEAD, a document commit, latest origin commit or the working tree. User resubmits an explicit committed pin. [[c2]] [[c3]]
  - User impact: No accidental review of moving or unrelated code.
- **Origin is not an ancestor of final revision** (recoverable)
  - Detection: Existing committed-object reads and proposed isAncestor return a valid false ancestry result; source errors remain distinct. [[c4]]
  - Response: Reject TaskReviewInputError with field=reviewRevision.ancestry in prepareReviewPacket before projection. Preserve history; the submitter must choose a coherent pin/set. Do not reorder or drop origins. This differs from helper field=scope_conflict for an unprovable final replacement. [[c2]] [[c3]] [[c4]]
  - User impact: No mixed-branch code assembled into a fictitious final state.
- **Selected material overwritten by an unsubmitted change** (recoverable)
  - Detection: Projection finds replaced/deleted selected portions without a final replacement/deletion witness from the submitted origin set. [[c3]]
  - Response: Reject scope_conflict. Do not add replacement lines or ignore the original module. Require a corrected explicit packet or a pin that excludes that interference.
  - User impact: Change scope remains caller-controlled even when unrelated work exists in the same file.
- **Ambiguous mapping, rename or merge resolution** (recoverable)
  - Detection: Partial overlapping changed runs, path collisions, unverified rename links, binary/non-UTF8 source or conflicting merge text cannot form a unique bounded mapping. [[c3]] [[c4]]
  - Response: Reject TaskReviewInputError with field=scope_conflict and the affected original selection identity before admission/model dispatch. No fuzzy matching, whole-file fallback, context-as-scope or partial success. New pinned zero-segment originals are also explicitly rejected at preparation as specified above; no unsupported-evidence pseudo-result is invented. [[c2]] [[c3]] [[c4]]
  - User impact: Uncertain scope cannot produce a false completed review.
- **Projection/resource bounds exceeded** (recoverable)
  - Detection: Separate boundaries: existing decodeReview rejects oversized input with field=input; changedRanges rejects its 2 MiB truncated/tool output with field=changes; projectReviewScope rejects its NEW object-byte/read/fragment counters and serialized projection/snapshot budgets with field=projection_limit. Existing transport/object-integrity errors keep their source fields. [[c2]] [[c3]] [[c4]]
  - Response: Preserve those distinct fields: input for envelope size, changes for reused diff truncation/tool failure, projection_limit only for newly enforced projection/snapshot counters. Do not catch/relabel failures by message text. Static preparation failure dispatches no provider or new checkpoint. Accepted-attribution snapshot-size failure occurs before accepted mapping save/task-assessment dispatch and follows the explicit unmapped-failure publication branch if an attribution review had already begun. Prior bytes/results remain preserved; resize the submitted unit rather than truncate. [[c2]] [[c3]] [[c4]] [[c21]]
  - User impact: Large legitimate scope needs explicit resizing rather than silent omissions.
- **Historical result or replay is incompatible with the final view** (recoverable)
  - Detection: Admission compares exact packet replay including reviewRevision. bindTaskFinalIdentities saves host-computed per-task inputs; sourceAssessment/reuseAssessment compare the source and current stored task identities before copying feedback. Resume/publication recompute header.finalScopeIdentity from pinned sources. Missing identities on historical no-pin execution/reuse do not pass these checks. [[c8]] [[c9]] [[c10]] [[c11]]
  - Response: Conflicting replay uses the existing field=packet; missing pin uses reviewRevision, changed recomputed binding uses projection_identity and incompatible source-result reuse uses reuse. A changed pin requires a new attempt; valid old history stays readable but launches no unpinned model and is not silently promoted. The reviewer may choose reassess through the existing attribution policy. [[c2]] [[c8]] [[c9]]
  - User impact: Prior approvals/results cannot silently apply to different code.
- **Finding uses superseded historical coordinates** (recoverable)
  - Detection: TaskAssignment.changes carries EffectiveTaskChange rows to both assignmentResultSchema and TaskResultScope. validateTaskResult matches active final paths/ranges and rejects none-scope entries before the old empty-segment rule. Historical source locations cannot match through origin metadata. [[c3]] [[c5]] [[c17]]
  - Response: Retain strict scope rejection; point to the pinned final scope. Bounded rejection recovery itself belongs to ISSUE-81e68ebf54745c75, not this fix. Do not auto-relocate the finding or broaden scope.
  - User impact: An obsolete location cannot remain a current blocking finding.
- **Pinned permanent scope snapshot missing or inconsistent** (recoverable)
  - Detection: SummarySchema/validateTaskBody require the all-or-none pinned representation, bounded unique rows and valid ranges/refs, matching task bindings and recomputed canonical projection identity. Publication reconstructs the projection and task attribution using pinned Git evidence before making a summary. [[c11]] [[c12]] Recompute the separate attributionIdentity from saved ordered rows, state, selectedTaskIds, testCount and finalScopeIdentity; compare the recomputed value rather than only two duplicated digest strings. Apply accepted versus unmapped_failure co-presence rules. [[c10]] [[c12]]
  - Response: Reject with field=projection_identity for mismatched projected identity/bindings; structurally malformed stored data uses the existing CR/input schema refusal. Never fall back to original coordinates for a summary that declares reviewRevision. Preserve prior canonical bytes; publication can be retried after evidence is repaired without rerunning the reviewer. [[c2]] [[c10]] [[c11]] [[c12]]
  - User impact: A valid final-coordinate finding survives publication/render/reread; invalid stored scope cannot broaden or relocate it.
- **Attribution fails before any mapping is accepted** (recoverable)
  - Detection: Existing attribution inactivity, provider failure, exhausted corrections or serialized mapping bound leaves no acceptedAttribution/taskScopeIdentities. Both reviewer routes persist attributionState=failed and the actual attributionFailure with terminal task outcomes. [[c3]] [[c21]]
  - Response: Publish a pinned unmapped_failure snapshot with tasks=[] and the admitted selectedTaskIds/testCount, a recomputable attribution digest and only failed/incomplete no-finding/no-reuse results. Preserve failure diagnostics, complete publication, and permit the existing next sequential attempt once publication is complete; never fabricate a mapping merely to make publication pass. [[c9]] [[c10]] [[c11]] [[c12]] [[c21]]
  - User impact: Failure history remains visible and a replacement attempt is not deadlocked by missing attribution.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An early task introduces a defect and a later selected commit fixes it | All tasks see the fixed final version; original selections remain accounted for, and a historical-only defect is not an unresolved finding. Separate genuinely missing current tests still produce findings. [[c1]] |
| Unrelated commits shift lines before a selected function without changing it | Project the selected surviving lines with exact offsets; exclude unrelated added lines and avoid HEAD. [[c3]] |
| A selected function is partially superseded by a later selected edit | Retain surviving subspans plus explicit superseded portions, with final replacement witnesses. Account for both original entries without duplicate model-visible code or silent scope loss. [[c3]] |
| Selected file is renamed or deleted | Verify declared selected path lineage; use final path/deletion anchors and preserved origin references. Entirely superseded rows have no finding scope, never an unconstrained empty selection. [[c3]] |
| Same source region appears in multiple task commits | Coalesce final text spans while retaining all origin IDs and per-task attribution. Multiple tasks may inspect the same final region without seeing obsolete code versions. [[c3]] [[c6]] |
| Final pin equals an origin commit; selected region is unchanged at final | Identical blobs use identity mapping; do not call a diff reader that rejects unchanged files. No whole-file scope is invented. [[c4]] |
| Other code-review issue or another review runs concurrently | Independent review IDs/final pins remain fenced by the existing coordinator. Do not mutate the other review or parallelize its provider calls. Shared implementation edits for the four fixes are sequenced by the coordination section, not treated as concurrent-safe. [[c13]] [[c14]] [[c15]] |
| Original file selection has segments=[] | New pinned execution deliberately rejects every original file selection with segments=[] (metadata-only, mode-only or non-textual selections) using TaskReviewInputError field=scope_conflict, naming its origin change index and path, before admission or model dispatch. This replaces the current non-error limitations path for new pinned execution. It does not create an OriginRef with a fictional segmentIndex, drop a module, or treat an empty selection as whole-file scope. Historical no-pin records remain readable under their original rules. A fully superseded original with nonempty submitted segments is different: it still has dispositions and may derive findingScope=none. [[c2]] [[c3]] [[c5]] [[c18]] |
| A final-coordinate finding moved from origin line 10 to final line 20, including a selected rename | Publish a host-derived FinalScopeSnapshot, then validate/merge/render/reread it without source access using final task-specific coordinates. Tampering with pin/path/ranges/task assignment/identity or omitting the snapshot rejects; another task’s active region does not authorize this task’s finding. Historical no-pin records remain unchanged. [[c11]] [[c12]] |

**Invariants to preserve**

- The submitted change set is the only finding scope; commits are lookup pointers and the final revision is explicit, immutable and never inferred from HEAD. [[c1]]
- All original selections and supplied tests are accounted for; no omitted modules, raw repository dump or context-derived expansion. [[c3]]
- Native and controller reviewers receive identical policy/source identity and remain independent of the author. [[c6]]
- Test-coverage inspection stays mandatory; optional execution is advice, and real unavailable mandatory evidence remains incomplete. [[c5]]
- Existing checkpoints, diagnostics, CR history and build approval semantics remain; no generic review engine, activation flags or direct cloud REST. [[c1]]

## 5. Test strategy

**Test framework:** `Existing node:test + assert and disposable Git repositories; extend task-review fixtures and normal MCP tests. Use synthetic providers for deterministic protocol qualification; label hosted versus synthetic evidence. No installed daemon restart or whole-repository test sweep is required for this scoped fix. [[c7]]`

**Test levels**

- **contract** — Explicit final revision and immutable storage boundary. [[c2]]
  - Subjects: `New packets require a full commit reviewRevision; reject missing/symbolic/unavailable/non-commit pins. Same-attempt replay rejects changed pin; historical completed no-pin records remain readable without granting model execution.`, `Origin selections retain existing parent/hunk/path validation; projected scope is host-derived and cannot be supplied or forged by the caller.`, `Schema-construction regression: missing reviewRevision is rejected by the actual PacketSchema/decodeReview path, PacketSchema.required includes it, and historical StoredPacketSchema still decodes no-pin records. Cloning/replacing an optional property without rebuilding required must not satisfy this test. [[c2]]`
  - Fixtures: `Existing packet/admission/publication fixtures with explicit final pins on all new submissions.`
- **unit** — Bounded final projection and strict result scope. [[c3]] [[c4]] [[c5]]
  - Subjects: `Identity and shifted-line projection preserve only selected surviving text, excluding unrelated insertions and working-tree canaries.`, `Later selected fixes supersede earlier selected defects: final spans and replacement witnesses are used, original entries remain completely accounted for, and historical-only defect coordinates are not finding scope.`, `Partial supersession splits selected intervals correctly; overlapping final spans coalesce while preserving every origin index; ambiguous partial replacements fail explicitly.`, `Selected rename/deletion chains, empty-file line-zero boundaries, wholly superseded entries and deleted files never become unconstrained whole-file scope.`, `Non-ancestor origins, out-of-set overwrites, conflicting merge resolution, unverified renames, binary/non-UTF8 mappings and truncated/budget-exceeded reads refuse preparation without model calls or dropped scope.`, `Final-only finding locations and native schema agree; superseded-only entries allow no code findings while genuine final defects still block.`, `Reuse requires identical final blobs/projected task scope/requirements/test inputs and same reviewer; changed relevant final code forces reassessment while historical feedback remains immutable.`, `EffectiveTaskChange threading: prove final text reaches selectedCode/assignmentPrompt/native grants, the same final paths/spans reach assignmentResultSchema and validateTaskResult, superseded-only rows reject findings, and ProjectedEntry.segments equals the normalized union of its surviving/deleted dispositions. [[c3]] [[c5]] [[c16]] [[c17]]`, `Host reuse binding: both routes persist taskScopeIdentities after direct/model attribution even with no diagnostics; sourceAssessment and reuseAssessment reject a changed relevant final blob, scope, requirement or test input and missing identities. Identical task inputs across unrelated revision movement may reuse; conflicting same-attempt identity writes fail. [[c8]] [[c9]] [[c10]]`, `New pinned zero-segment original selections reject field=scope_conflict before checkpoint replacement or provider dispatch; historical no-pin metadata records remain readable without granting new execution. Nonempty origins that become fully superseded still have complete dispositions and findingScope=none. [[c2]] [[c3]] [[c18]]`, `Permanent final-scope representation validates required pin/snapshot plus the state-specific accepted/unmapped attribution contract, origin-index partitions, witness closure, per-task subsets and canonical projection identity. Reject omitted, oversized, malformed or tampered pin/path/ranges/task rows/digests and findings in another task’s scope; historical no-pin CR bodies remain readable and byte-identical. [[c10]] [[c11]] [[c12]]`, `Durable accepted attribution: atomically persist canonical taskId/changeIndexes/testIndexes rows with state=accepted, taskScopeIdentities and attributionIdentity on native/controller/direct paths, even with no diagnostic repair. Reject bad indexes, duplicate tasks/row indexes, omitted changes/tests, missing witness closure and conflicting replacement; failed save leaves the pending checkpoint unchanged and dispatches no task assessment. [[c3]] [[c8]] [[c9]] [[c10]]`, `Offline attribution binding: mutate ONLY one accepted task changeIndexes/testIndexes list (including adding another task’s valid entry) while preserving all existing digest strings. Recomputed final-attribution-v1 identity must reject the record. Test selectedTaskIds/testCount/state mutations, valid shared entries and empty task scopes, and retain full source-aware task-identity verification on resume/publication. [[c10]] [[c11]] [[c12]]`, `Resource error fields: assert field=input for oversized decoded packet, field=changes for reused truncated Git diff, and field=projection_limit for projection-local read/byte/fragment/snapshot counters. Preserve source/commit/transport-integrity failures; assert no task dispatch and no partially accepted mapping at every budget boundary. [[c2]] [[c3]] [[c4]]`
  - Fixtures: `Small real Git histories with additions, replacement, line shift, selected/unselected commits, rename/delete, merge conflict and restored bytes.`, `Injected object/diff/fragment limits and model-call counters; no fuzzy line matching.`
- **integration** — Working pipeline parity and completion history. [[c6]] [[c7]]
  - Subjects: `Whole-story task A introduces a defect and task B fixes it in the same submitted set: native and controller routes review the fixed final version without a stale blocker, while a separate unresolved final defect still blocks. Reproduce the actual S3 t3/t9 pair: the t3 first-report lookup is fixed by included commit 76d3d899a, and the final reviewed source must not retain its historical blocker. [[c1]]`, `Attribution accounts for every original entry, including superseded entries, and every supplied test; cross-task final source is shared with origin references rather than obsolete embedded versions.`, `Resume, new attempt, publication and BUILD freshness retain the pinned final revision; completed historical no-pin records stay unchanged and cannot be resumed or reused as final-version execution.`, `A task assigned a fully or partly superseded origin must also cover its final replacement/deletion witness entries; omission is an attribution error, not a vacuous pass. Unknown/cyclic/backward-incompatible witness references are rejected.`, `Genuine current test-coverage/provenance defect non-regression: alongside a historical defect fixed later in the packet, deliberately omit a current provenance or requiredReferences test. The final review must still report that demonstrated coverage defect; final-version reconciliation must not suppress it or auto-pass it. [[c1]]`, `Two independent native/controller reviews with different reviewIds and final pins can progress concurrently; changes, bindings, feedback, optional-execution disclosures and completion/cleanup of one never alter or unblock the other. Provider work remains serial within each review and the existing activity/retry policy is unchanged. [[c1]] [[c13]]`, `Publish and reread a shifted and renamed final-coordinate finding through publishTaskCheckpoint -> mergeTaskSummary -> validateTaskBody -> renderTaskReview -> validateTaskBody, with source Git access only before publication. Final line 20 remains valid when origin line 10 was selected; old-coordinate and unassigned-task findings reject. A metadata snapshot is saved without blob text; duplicate publication is byte-idempotent and conflicting snapshots reject. [[c3]] [[c5]] [[c11]] [[c12]]`, `Lose all reviewer memory after accepted attribution in a multi-task review with distinct assigned tests. A fresh publication service loads only the checkpoint and pinned source adapter, reconstructs saved mappings, recomputes task bindings, publishes/renders/rereads the correct final per-task scopes and supports exact resume without a new attribution/model call. [[c3]] [[c8]] [[c9]] [[c10]] [[c11]] [[c12]]`, `Both native/controller routes: attribution timeout, provider failure, exhausted invalid scope submissions and oversized unaccepted mapping publish an unmapped_failure pinned summary with actual diagnostics, no task identities/findings/reuse and no invented mapping. Verify publication completion and successful next-attempt admission; reject passing results, mapped findings, missing selected terminal outcomes and a false downgrade from accepted state. [[c9]] [[c10]] [[c11]] [[c12]] [[c21]]`, `Historical reproduction evidence: construct a labelled synthetic explicit packet from durable CR review 1 t3/t9 scope and immutable commits f0d5da04756e1e96a5043c0063a8891dd2455c7e and 76d3d899a5f144721e2a3328a9933e346be3b600. Preserve the separate genuine provenance-coverage defect; make no assertion that the absent temporary packet/attribution/timing was recovered. [[c19]] [[c20]]`
  - Fixtures: `Existing coordinator/controller/history/route fixtures, scoped current-code regressions and a labelled synthetic packet grounded in the permanent S3 CR and immutable t3/t9 source versions.`
- **smoke** — Normal compiled transport proof. [[c7]]
  - Subjects: `Disposable compiled MCP/IPC review packet pins a final revision over a multi-commit story; task review inspects final blocks, preserves origin provenance, excludes unrelated HEAD/worktree changes and publishes the correct current result.`, `Production build and scoped task-review/MCP tests pass; no direct cloud REST, retired engine or installed-daemon activation is introduced.`
  - Fixtures: `Existing synthetic CLI smoke and isolated temporary owner/socket/project; evidence under /tmp with synthetic labels.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `New packets require a full commit reviewRevision; reject missing/symbolic/unavailable/non-commit pins. Same-attempt replay rejects changed pin; historical completed no-pin records remain readable without granting model execution.`, `Origin selections retain existing parent/hunk/path validation; projected scope is host-derived and cannot be supplied or forged by the caller.`, `Schema-construction regression: missing reviewRevision is rejected by the actual PacketSchema/decodeReview path, PacketSchema.required includes it, and historical StoredPacketSchema still decodes no-pin records. Cloning/replacing an optional property without rebuilding required must not satisfy this test. [[c2]]` |
| `ac2` | `Identity and shifted-line projection preserve only selected surviving text, excluding unrelated insertions and working-tree canaries.`, `Later selected fixes supersede earlier selected defects: final spans and replacement witnesses are used, original entries remain completely accounted for, and historical-only defect coordinates are not finding scope.`, `Partial supersession splits selected intervals correctly; overlapping final spans coalesce while preserving every origin index; ambiguous partial replacements fail explicitly.`, `Whole-story task A introduces a defect and task B fixes it in the same submitted set: native and controller routes review the fixed final version without a stale blocker, while a separate unresolved final defect still blocks. Reproduce the actual S3 t3/t9 pair: the t3 first-report lookup is fixed by included commit 76d3d899a, and the final reviewed source must not retain its historical blocker. [[c1]]` |
| `ac3` | `Selected rename/deletion chains, empty-file line-zero boundaries, wholly superseded entries and deleted files never become unconstrained whole-file scope.`, `Non-ancestor origins, out-of-set overwrites, conflicting merge resolution, unverified renames, binary/non-UTF8 mappings and truncated/budget-exceeded reads refuse preparation without model calls or dropped scope.`, `Final-only finding locations and native schema agree; superseded-only entries allow no code findings while genuine final defects still block.`, `Attribution accounts for every original entry, including superseded entries, and every supplied test; cross-task final source is shared with origin references rather than obsolete embedded versions.`, `A task assigned a fully or partly superseded origin must also cover its final replacement/deletion witness entries; omission is an attribution error, not a vacuous pass. Unknown/cyclic/backward-incompatible witness references are rejected.`, `EffectiveTaskChange threading: prove final text reaches selectedCode/assignmentPrompt/native grants, the same final paths/spans reach assignmentResultSchema and validateTaskResult, superseded-only rows reject findings, and ProjectedEntry.segments equals the normalized union of its surviving/deleted dispositions. [[c3]] [[c5]] [[c16]] [[c17]]`, `Genuine current test-coverage/provenance defect non-regression: alongside a historical defect fixed later in the packet, deliberately omit a current provenance or requiredReferences test. The final review must still report that demonstrated coverage defect; final-version reconciliation must not suppress it or auto-pass it. [[c1]]`, `New pinned zero-segment original selections reject field=scope_conflict before checkpoint replacement or provider dispatch; historical no-pin metadata records remain readable without granting new execution. Nonempty origins that become fully superseded still have complete dispositions and findingScope=none. [[c2]] [[c3]] [[c18]]`, `Permanent final-scope representation validates required pin/snapshot plus the state-specific accepted/unmapped attribution contract, origin-index partitions, witness closure, per-task subsets and canonical projection identity. Reject omitted, oversized, malformed or tampered pin/path/ranges/task rows/digests and findings in another task’s scope; historical no-pin CR bodies remain readable and byte-identical. [[c10]] [[c11]] [[c12]]`, `Durable accepted attribution: atomically persist canonical taskId/changeIndexes/testIndexes rows with state=accepted, taskScopeIdentities and attributionIdentity on native/controller/direct paths, even with no diagnostic repair. Reject bad indexes, duplicate tasks/row indexes, omitted changes/tests, missing witness closure and conflicting replacement; failed save leaves the pending checkpoint unchanged and dispatches no task assessment. [[c3]] [[c8]] [[c9]] [[c10]]`, `Offline attribution binding: mutate ONLY one accepted task changeIndexes/testIndexes list (including adding another task’s valid entry) while preserving all existing digest strings. Recomputed final-attribution-v1 identity must reject the record. Test selectedTaskIds/testCount/state mutations, valid shared entries and empty task scopes, and retain full source-aware task-identity verification on resume/publication. [[c10]] [[c11]] [[c12]]`, `Resource error fields: assert field=input for oversized decoded packet, field=changes for reused truncated Git diff, and field=projection_limit for projection-local read/byte/fragment/snapshot counters. Preserve source/commit/transport-integrity failures; assert no task dispatch and no partially accepted mapping at every budget boundary. [[c2]] [[c3]] [[c4]]` |
| `ac4` | `Reuse requires identical final blobs/projected task scope/requirements/test inputs and same reviewer; changed relevant final code forces reassessment while historical feedback remains immutable.`, `Resume, new attempt, publication and BUILD freshness retain the pinned final revision; completed historical no-pin records stay unchanged and cannot be resumed or reused as final-version execution.`, `Host reuse binding: both routes persist taskScopeIdentities after direct/model attribution even with no diagnostics; sourceAssessment and reuseAssessment reject a changed relevant final blob, scope, requirement or test input and missing identities. Identical task inputs across unrelated revision movement may reuse; conflicting same-attempt identity writes fail. [[c8]] [[c9]] [[c10]]`, `Publish and reread a shifted and renamed final-coordinate finding through publishTaskCheckpoint -> mergeTaskSummary -> validateTaskBody -> renderTaskReview -> validateTaskBody, with source Git access only before publication. Final line 20 remains valid when origin line 10 was selected; old-coordinate and unassigned-task findings reject. A metadata snapshot is saved without blob text; duplicate publication is byte-idempotent and conflicting snapshots reject. [[c3]] [[c5]] [[c11]] [[c12]]`, `Lose all reviewer memory after accepted attribution in a multi-task review with distinct assigned tests. A fresh publication service loads only the checkpoint and pinned source adapter, reconstructs saved mappings, recomputes task bindings, publishes/renders/rereads the correct final per-task scopes and supports exact resume without a new attribution/model call. [[c3]] [[c8]] [[c9]] [[c10]] [[c11]] [[c12]]`, `Both native/controller routes: attribution timeout, provider failure, exhausted invalid scope submissions and oversized unaccepted mapping publish an unmapped_failure pinned summary with actual diagnostics, no task identities/findings/reuse and no invented mapping. Verify publication completion and successful next-attempt admission; reject passing results, mapped findings, missing selected terminal outcomes and a false downgrade from accepted state. [[c9]] [[c10]] [[c11]] [[c12]] [[c21]]` |
| `ac5` | `Whole-story task A introduces a defect and task B fixes it in the same submitted set: native and controller routes review the fixed final version without a stale blocker, while a separate unresolved final defect still blocks. Reproduce the actual S3 t3/t9 pair: the t3 first-report lookup is fixed by included commit 76d3d899a, and the final reviewed source must not retain its historical blocker. [[c1]]`, `Disposable compiled MCP/IPC review packet pins a final revision over a multi-commit story; task review inspects final blocks, preserves origin provenance, excludes unrelated HEAD/worktree changes and publishes the correct current result.`, `Production build and scoped task-review/MCP tests pass; no direct cloud REST, retired engine or installed-daemon activation is introduced.`, `Two independent native/controller reviews with different reviewIds and final pins can progress concurrently; changes, bindings, feedback, optional-execution disclosures and completion/cleanup of one never alter or unblock the other. Provider work remains serial within each review and the existing activity/retry policy is unchanged. [[c1]] [[c13]]`, `Historical reproduction evidence: construct a labelled synthetic explicit packet from durable CR review 1 t3/t9 scope and immutable commits f0d5da04756e1e96a5043c0063a8891dd2455c7e and 76d3d899a5f144721e2a3328a9933e346be3b600. Preserve the separate genuine provenance-coverage defect; make no assertion that the absent temporary packet/attribution/timing was recovered. [[c19]] [[c20]]` |

## 6. Migration

**State before:** s1 profiles and direct source checks show original commit-specific after-blocks feed attribution and task prompts, with no required final revision. Stored attempts and CRs preserve those pinned packets. The observed S3 review consequently retained a historical blocker despite a later included fix. [[c1]] [[c3]] [[c6]]

**State after:** Every new review explicitly pins reviewRevision and uses validated final projected scope for task source and finding coordinates. Original selections, prior attempts and completed historical records remain immutable. No model executes an unpinned historical attempt, and no HEAD default or compatibility engine is available. [[c1]] [[c2]] New pinned starts reject zero-segment originals explicitly, and every pinned permanent summary carries the host-derived final-scope snapshot required for offline history validation. [[c11]] [[c12]] [[c18]] Accepted task change/test attribution is durable and atomically bound; accepted and pre-attribution-failure summaries have explicit distinct validation rules. [[c10]] [[c11]] [[c12]] [[c21]]

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Implement the new schema, final projection, identity readers/guards, producer/MCP/guidance updates and fixtures offline. Run disposable qualification before deployment. No new-format production attempt is admitted in this development step, so source changes can be reverted here. [[c2]] [[c3]] [[c8]] [[c9]] Implement/qualify the final-scope SummarySchema and validateTaskBody/merge/render readers together with publication, and exercise historical no-pin and new zero-segment rejection before deployment. [[c11]] [[c12]] — ↩ rollbackable
2. Coordinate deployment/restart and updated producers as one live transition. Once the updated daemon serves requests, it can immediately admit new pinned attempts; there is no separate activation gate. Conservatively treat this deployment/admission transition as non-rollbackable by blind code downgrade: retain the upgraded reader or plan an explicit operator rollback that preserves new-format state. Prior completed histories are not rewritten. [[c2]] [[c9]] [[c10]] [[c11]] Require the operator to drain or explicitly interrupt active reviews before restarting; preserve all checkpoints for explicit recovery rather than promising in-flight completion across restart. [[c9]] [[c10]] — ✕ non-rollbackable

**Backward compat:** New starts intentionally require the explicit pin and reject old producer input with an actionable validation error. Zero-segment original file selections that today produce a non-error limitations entry are deliberately rejected for new pinned execution with field=scope_conflict; no silent module omission or whole-file fallback replaces them. Historical completed no-pin records retain their original scope/coordinate rules and immutable bytes; they remain read-only and may be republished as historical evidence without a final-pin claim. A declared pin requires the new complete snapshot/binding representation and cannot fall back to historical coordinates. Interrupted unpinned work requires a new explicit pinned attempt. Operator rollout must drain or explicitly interrupt active reviews before coordinated daemon restart and updated-producer deployment; the design does not claim that restart automatically lets existing sessions finish. Deployment and new admission form one transition with no activation flag. After pinned records exist, blind downgrade is unsafe; keep an upgraded reader or plan an explicit state-preserving rollback. [[c2]] [[c9]] [[c10]] [[c11]] [[c12]] [[c18]] Pinned records follow their attribution-state branch: accepted mappings require complete rows/bindings, whereas legitimate pre-attribution failed/incomplete records require the unmapped no-finding representation rather than fabricated task identities. Historical no-pin decode is unchanged. [[c10]] [[c11]] [[c12]] [[c21]]

## 7. Alternatives considered

### 7.1 a1: Pinned final revision with host-validated origin-preserving scope projection — **CHOSEN**

Pin one final code revision and project submitted changed segments into it, preserving their original commit provenance.

Add an explicit final reviewRevision to new packets. Validate submitted origin segments exactly as today, then derive only their surviving final-version spans and justified supersession/deletion markers from bounded committed Git evidence. All reviewer tasks inspect that final view; historical origin records remain traceable and immutable. A later submitted fix supersedes an earlier defective version instead of leaving a historical defect blocking. Refuse ambiguous lineage or interference that cannot be justified within the submitted change set; never add HEAD or unrelated changes. Reuse current packet/source reader, task attribution, policy, result validation, checkpoint and CR mechanisms. Extend those reused mechanisms with required-pin schema construction, host-computed final/task identity bindings and persisted per-task final-scope snapshots for synchronous publication/history validation. This adds bounded metadata and source/scope verification work; reuse is not a claim that their schemas remain unchanged. [[c2]] [[c8]] [[c10]] [[c11]] [[c12]]

### 7.2 a2: Pinned final revision as reviewer-only reconciliation context

Keep historical task versions as finding scope and ask the reviewer to check the final pinned code before filing findings.

Add a pinned final reviewRevision as context, retain current historical selectedCode blocks and validators, and strengthen shared prompts to reconcile later submitted fixes before reporting defects. No host projection changes finding coordinates or scope; the reviewer decides which historical observations remain true at the final revision.

**Rejected because:** Smaller, but retains the cause of the observed stale-version failure and inconsistent coordinates.

## 8. References

- **[[c1]]** `prior-artifact` `.insrc/artifacts/ISSUE-599f1d0bd42e0c37.json`
- **[[c2]]** `code` `src/workflow/code-review/task-review/contracts.ts`
- **[[c3]]** `code` `src/workflow/code-review/task-review/packet.ts`
- **[[c4]]** `code` `src/workflow/code-review/task-review/sources.ts`
- **[[c5]]** `code` `src/workflow/code-review/task-review/results.ts`
- **[[c6]]** `code` `src/workflow/code-review/task-review/policy.ts`
- **[[c7]]** `code` `src/workflow/code-review/task-review/__tests__/selected-code.test.ts`
- **[[c8]]** `code` `src/workflow/code-review/task-review/assessment.ts`
- **[[c9]]** `code` `src/workflow/code-review/task-review/admission.ts`
- **[[c10]]** `code` `src/workflow/code-review/task-review/checkpoint.ts`
- **[[c11]]** `code` `src/workflow/code-review/task-review/publication.ts`
- **[[c12]]** `code` `src/workflow/code-review/task-review/record.ts`
- **[[c16]]** `code` `src/workflow/code-review/task-review/policy.ts`
- **[[c17]]** `code` `src/workflow/code-review/task-review/result-schema.ts`
- **[[c13]]** `prior-artifact` `.insrc/artifacts/ISSUE-81e68ebf54745c75.json`
- **[[c14]]** `prior-artifact` `.insrc/artifacts/ISSUE-2a3c21b73b79ef9c.json`
- **[[c15]]** `prior-artifact` `.insrc/artifacts/ISSUE-860d6e82ab04d314.json`
- **[[c18]]** `doc` `design/task-review-final-revision-decision.md`
- **[[c19]]** `prior-artifact` `.insrc/artifacts/CR-9b04adb36cac716d-s3.json`
- **[[c20]]** `doc` `design/task-review-stale-finding-evidence.md`
- **[[c21]]** `code` `src/workflow/code-review/task-review/execution.ts`

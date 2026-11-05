<!-- insrc:artifact LLD-599f1d0bd42e0c37-s1 -->

# LLD: STORY-599f1d0bd42e0c37-s1

## Summary

**Epic:** `reconcile-later-submitted-fixes-before-reporting`
**HLD base run:** `wf-1793853163874-e2733b`
**HLD effective hash:** `11fe5e0a0004...`

Review each task against one submitter-pinned final code revision while retaining the original commit selections as immutable scope provenance. Derive a bounded final-code view, account explicitly for surviving, superseded and deleted selections, and reject ambiguous or out-of-set changes. Reuse the current review coordinator and source readers; the other three code-review reliability fixes remain separate.

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

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
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
- `TaskReviewInputError` when Missing/unavailable reviewRevision, non-ancestor origin, unverified original selection, unsafe path/rename, projection ambiguity, out-of-set replacement or bounds overflow. Refuse before admission/model dispatch. [[c2]] [[c3]]

**Preconditions:**
- Keep existing strict original hunk/parent/path/document validation. Require each origin commit to be an ancestor of or equal to the pinned final revision. Packet array order never establishes ancestry. Never infer or substitute HEAD. [[c2]] [[c3]] [[c4]]

**Postconditions:**
- Project each explicitly selected original +/- span or deletion anchor using committed path/line lineage into reviewRevision. All resulting finding coordinates and embedded reviewed text refer to that revision. Preserve every origin selection as surviving, superseded or deleted, including partial supersession. Keep one stable preparation entry per original file selection so attribution indexes remain accountable. [[c1]] [[c3]]
- Unchanged text outside selected spans may shift offsets but never becomes selected. Replacement/deletion of selected material is accepted only when covered by other submitted origin selections projected to the same final scope; otherwise reject scope_conflict. Superseded origins carry trace metadata and no historical code as active finding scope. Never silently drop required modules or expand to a whole file because effective spans are empty. [[c1]] [[c3]]
- Validate actual selected rename links with Git objects, preserve previousPath provenance and map to the final path. Refuse ambiguous/colliding/unselected rename paths rather than guessing. Merge-resolution text must be explicitly represented in the submitted review set if it replaces selected text. [[c3]] [[c4]]

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
- `TaskReviewInputError (scope_conflict / projection_limit)` when A final replacement is not justified by submitted origins, a partial changed run cannot be mapped unambiguously, or any explicit byte/range/object bound would be exceeded.

**Preconditions:**
- Operate serially through existing ReviewSources and typed Git tools. Bound work before allocating model context; do not add a generalized graph or dependency service. [[c4]]

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
- `existing source error` when Git tool failure, missing objects, truncated diff or integrity mismatch. No automatic checkout/fetch.

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
- Review actual final requirements, test coverage and acceptance checks. Explain that a historical defect fixed by a later submitted change is not an unresolved final defect; unresolved final defects still block. Other three approved issue fixes remain separate. [[c1]] [[c6]]
- For a task attributed a superseded origin, require the same task's changeIndexes to include the later replacement/deletion witness entries (transitively, with bounded ancestry-ordered closure). Reject an incomplete attribution with pointed missing indexes rather than accepting a vacuous no-finding-scope pass. Cross-task replacement entries remain reusable by multiple tasks; every acceptance check is assessed against active final witness scope. [[c3]] [[c6]]

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
- New starts require the pin. Completed historical records lacking it remain readable/publishable as historical records, without new model execution or a final-version equivalence claim. Old unpinned interrupted work requires a new explicit pinned attempt rather than silently inferring a revision. [[c2]] [[c5]]

**Postconditions:**
- Persist reviewRevision in submitted packet/checkpoint/permanent CR and include it in exact replay/review freshness binding. Never rewrite prior attempts. Reuse is allowed only after existing same-party checks plus exact task final-blob/scope/document/test-input compatibility; otherwise reassess, preserving earlier feedback as context. [[c5]]
- No review-engine fallback, compatibility flag, activation mechanism, new data store, UI or changes to technical retry/activity/approval policy. Keep native/controller behavior identical and preserve all valid historical evidence. [[c1]] [[c5]]

## 3. Data model changes

### 3.1 `ReviewPacket.reviewRevision` — field-add

Required full Git OID on every new submission; optional only in immutable historical storage decoding. The submitter pins it before start, and exact replay includes it. All origin commits must be reachable ancestors/equal. It is a source version, not a generic diff boundary or permission to review unrelated code. [[c2]] [[c3]]

```
PacketSchema adds required reviewRevision: existing oid schema; StoredPacketSchema retains optional reviewRevision for historical reads. ReviewPacket type represents both; preparation explicitly narrows new execution to a required pin. No caller-supplied final projection is accepted.
```

**Call sites:**
- `src/workflow/code-review/task-review/contracts.ts`
- `src/workflow/code-review/task-review/packet.ts`
- `src/mcp/code-review/schema.ts`

### 3.2 `ReviewProjection and origin relationships` — new

Proposed private prepared-state representation. Packet owns exactly one final revision; it owns 1..10000 original file-selection entries. Each original segment has one disposition with 0..many surviving final spans, 0..many explicit superseded portions, and/or deletion-anchor witnesses. Final spans may have multiple originating selections; origins remain identifiable by stable reviewSet/file/segment indexes. Direction is origin -> final projected scope, never a copied historical result body. Entirely superseded entries stay in attribution with findingScope='none'. Preserve all originals byte-for-byte in submitted history; derived projection is reproducible from their committed objects. [[c3]]

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
```

**Call sites:**
- `src/workflow/code-review/task-review/packet.ts`
- `src/workflow/code-review/task-review/sources.ts`
- `src/workflow/code-review/task-review/results.ts`
- `src/workflow/code-review/task-review/result-schema.ts`

### 3.3 `Projection bounds and failure behavior` — invariant-change

Reuse 4 MiB packet JSON cap, existing 10000 file/segment selection caps and 2 MiB per Git diff cap. Add named internal budgets capped at 10000 distinct object/diff reads and 100000 projected fragments per preparation; fragments coalesced without losing origin IDs. Bound decoded source bytes cumulatively to 64 MiB before prompts; failures explicitly refuse preparation with no model dispatch, checkpoint replacement or truncation. No hosted/provider call is parallelized. [[c2]] [[c3]] [[c4]]

**Call sites:**
- `src/workflow/code-review/task-review/contracts.ts`
- `src/workflow/code-review/task-review/packet.ts`
- `src/workflow/code-review/task-review/sources.ts`

### 3.4 `Saved attempt and CR version provenance` — field-add

An attempt owns one immutable submitted reviewRevision, original selection and final-view identity. Permanent records retain the pin and original selection provenance. Old completed no-pin attempts remain historical; no auto-upgrade, mutable origin rewrite or stale result reuse is allowed. Compare final blob IDs and projected task scope with pinned requirements/tests before reusing results across attempts; unrelated revision changes can reuse only when this complete task identity remains equal. [[c5]]

**Call sites:**
- `src/workflow/code-review/task-review/contracts.ts`
- `src/workflow/code-review/task-review/admission.ts`
- `src/workflow/code-review/task-review/assessment.ts`
- `src/workflow/code-review/task-review/publication.ts`
- `src/workflow/code-review/task-review/record.ts`

## 4. Error paths

**Error cases**

- **Missing or invalid final pin** (recoverable)
  - Detection: New PacketSchema omits reviewRevision, uses a symbolic ref, unavailable object or non-commit OID. [[c2]] [[c4]]
  - Response: Reject before admission/model dispatch. Never substitute HEAD, a document commit, latest origin commit or the working tree. User resubmits an explicit committed pin.
  - User impact: No accidental review of moving or unrelated code.
- **Origin is not an ancestor of final revision** (recoverable)
  - Detection: Existing committed-object reads and proposed isAncestor return a valid false ancestry result; source errors remain distinct. [[c4]]
  - Response: Reject scope_conflict and retain stored history. The submitter must choose a coherent revision and review set; do not reorder commits or silently drop the conflicting origin.
  - User impact: No mixed-branch code assembled into a fictitious final state.
- **Selected material overwritten by an unsubmitted change** (recoverable)
  - Detection: Projection finds replaced/deleted selected portions without a final replacement/deletion witness from the submitted origin set. [[c3]]
  - Response: Reject scope_conflict. Do not add replacement lines or ignore the original module. Require a corrected explicit packet or a pin that excludes that interference.
  - User impact: Change scope remains caller-controlled even when unrelated work exists in the same file.
- **Ambiguous mapping, rename or merge resolution** (recoverable)
  - Detection: Partial overlapping changed runs, path collisions, unverified rename links, binary/non-UTF8 source or conflicting merge text cannot form a unique bounded mapping. [[c3]] [[c4]]
  - Response: Fail preparation explicitly with the affected original selection identity. No fuzzy matching, whole-file fallback, context-as-scope or partial success. Non-textual selections keep explicit unsupported mandatory evidence instead of invented textual scope.
  - User impact: Uncertain scope cannot produce a false completed review.
- **Projection/resource bounds exceeded** (recoverable)
  - Detection: Packet, object-byte, diff, read-count or fragment budget would be exceeded; Git tool reports truncation. [[c2]] [[c3]] [[c4]]
  - Response: Reject projection_limit before model execution or checkpoint replacement, preserving all prior bytes. Submitter may provide a smaller explicit review unit. Never truncate selected code or provenance.
  - User impact: Large legitimate scope needs explicit resizing rather than silent omissions.
- **Historical result or replay is incompatible with the final view** (recoverable)
  - Detection: Pin changes on an exact replay, no-pin execution/resume is requested, or reused results have different final blobs/projected scope/documents/tests. [[c2]] [[c5]]
  - Response: Conflicting replay is rejected; a changed pin requires a new attempt. No-pin history remains readable but cannot launch a model or claim final-version equivalence. New attempts reassess incompatible tasks and preserve earlier feedback.
  - User impact: Prior approvals/results cannot silently apply to different code.
- **Finding uses superseded historical coordinates** (recoverable)
  - Detection: Result scope validation compares locations only to active final projected spans/deletion anchors, never superseded-only rows. [[c5]]
  - Response: Retain strict scope rejection; point to the pinned final scope. Bounded rejection recovery itself belongs to ISSUE-81e68ebf54745c75, not this fix. Do not auto-relocate the finding or broaden scope.
  - User impact: An obsolete location cannot remain a current blocking finding.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An early task introduces a defect and a later selected commit fixes it | All tasks see the fixed final version; original selections remain accounted for, and a historical-only defect is not an unresolved finding. Separate genuinely missing current tests still produce findings. [[c1]] |
| Unrelated commits shift lines before a selected function without changing it | Project the selected surviving lines with exact offsets; exclude unrelated added lines and avoid HEAD. [[c3]] |
| A selected function is partially superseded by a later selected edit | Retain surviving subspans plus explicit superseded portions, with final replacement witnesses. Account for both original entries without duplicate model-visible code or silent scope loss. [[c3]] |
| Selected file is renamed or deleted | Verify declared selected path lineage; use final path/deletion anchors and preserved origin references. Entirely superseded rows have no finding scope, never an unconstrained empty selection. [[c3]] |
| Same source region appears in multiple task commits | Coalesce final text spans while retaining all origin IDs and per-task attribution. Multiple tasks may inspect the same final region without seeing obsolete code versions. [[c3]] [[c6]] |
| Final pin equals an origin commit; selected region is unchanged at final | Identical blobs use identity mapping; do not call a diff reader that rejects unchanged files. No whole-file scope is invented. [[c4]] |
| Other code-review issue or another review runs concurrently | Use the existing per-review fences and serial provider calls; do not change retry/activity policy or another review's state. Separate approved issues stay out of this design. [[c1]] |

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
  - Subjects: `New packets require a full commit reviewRevision; reject missing/symbolic/unavailable/non-commit pins. Same-attempt replay rejects changed pin; historical completed no-pin records remain readable without granting model execution.`, `Origin selections retain existing parent/hunk/path validation; projected scope is host-derived and cannot be supplied or forged by the caller.`
  - Fixtures: `Existing packet/admission/publication fixtures with explicit final pins on all new submissions.`
- **unit** — Bounded final projection and strict result scope. [[c3]] [[c4]] [[c5]]
  - Subjects: `Identity and shifted-line projection preserve only selected surviving text, excluding unrelated insertions and working-tree canaries.`, `Later selected fixes supersede earlier selected defects: final spans and replacement witnesses are used, original entries remain completely accounted for, and historical-only defect coordinates are not finding scope.`, `Partial supersession splits selected intervals correctly; overlapping final spans coalesce while preserving every origin index; ambiguous partial replacements fail explicitly.`, `Selected rename/deletion chains, empty-file line-zero boundaries, wholly superseded entries and deleted files never become unconstrained whole-file scope.`, `Non-ancestor origins, out-of-set overwrites, conflicting merge resolution, unverified renames, binary/non-UTF8 mappings and truncated/budget-exceeded reads refuse preparation without model calls or dropped scope.`, `Final-only finding locations and native schema agree; superseded-only entries allow no code findings while genuine final defects still block.`, `Reuse requires identical final blobs/projected task scope/requirements/test inputs and same reviewer; changed relevant final code forces reassessment while historical feedback remains immutable.`
  - Fixtures: `Small real Git histories with additions, replacement, line shift, selected/unselected commits, rename/delete, merge conflict and restored bytes.`, `Injected object/diff/fragment limits and model-call counters; no fuzzy line matching.`
- **integration** — Working pipeline parity and completion history. [[c6]] [[c7]]
  - Subjects: `Whole-story task A introduces a defect and task B fixes it in the same submitted set: native and controller routes review the fixed final version without a stale blocker, while a separate unresolved final defect still blocks.`, `Attribution accounts for every original entry, including superseded entries, and every supplied test; cross-task final source is shared with origin references rather than obsolete embedded versions.`, `Resume, new attempt, publication and BUILD freshness retain the pinned final revision; completed historical no-pin records stay unchanged and cannot be resumed or reused as final-version execution.`, `A task assigned a fully or partly superseded origin must also cover its final replacement/deletion witness entries; omission is an attribution error, not a vacuous pass. Unknown/cyclic/backward-incompatible witness references are rejected.`
  - Fixtures: `Existing coordinator/controller/history/route fixtures, scoped current-code regressions and a captured S3-style stale-version reproduction.`
- **smoke** — Normal compiled transport proof. [[c7]]
  - Subjects: `Disposable compiled MCP/IPC review packet pins a final revision over a multi-commit story; task review inspects final blocks, preserves origin provenance, excludes unrelated HEAD/worktree changes and publishes the correct current result.`, `Production build and scoped task-review/MCP tests pass; no direct cloud REST, retired engine or installed-daemon activation is introduced.`
  - Fixtures: `Existing synthetic CLI smoke and isolated temporary owner/socket/project; evidence under /tmp with synthetic labels.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `New packets require a full commit reviewRevision; reject missing/symbolic/unavailable/non-commit pins. Same-attempt replay rejects changed pin; historical completed no-pin records remain readable without granting model execution.`, `Origin selections retain existing parent/hunk/path validation; projected scope is host-derived and cannot be supplied or forged by the caller.` |
| `ac2` | `Identity and shifted-line projection preserve only selected surviving text, excluding unrelated insertions and working-tree canaries.`, `Later selected fixes supersede earlier selected defects: final spans and replacement witnesses are used, original entries remain completely accounted for, and historical-only defect coordinates are not finding scope.`, `Partial supersession splits selected intervals correctly; overlapping final spans coalesce while preserving every origin index; ambiguous partial replacements fail explicitly.`, `Whole-story task A introduces a defect and task B fixes it in the same submitted set: native and controller routes review the fixed final version without a stale blocker, while a separate unresolved final defect still blocks.` |
| `ac3` | `Selected rename/deletion chains, empty-file line-zero boundaries, wholly superseded entries and deleted files never become unconstrained whole-file scope.`, `Non-ancestor origins, out-of-set overwrites, conflicting merge resolution, unverified renames, binary/non-UTF8 mappings and truncated/budget-exceeded reads refuse preparation without model calls or dropped scope.`, `Final-only finding locations and native schema agree; superseded-only entries allow no code findings while genuine final defects still block.`, `Attribution accounts for every original entry, including superseded entries, and every supplied test; cross-task final source is shared with origin references rather than obsolete embedded versions.`, `A task assigned a fully or partly superseded origin must also cover its final replacement/deletion witness entries; omission is an attribution error, not a vacuous pass. Unknown/cyclic/backward-incompatible witness references are rejected.` |
| `ac4` | `Reuse requires identical final blobs/projected task scope/requirements/test inputs and same reviewer; changed relevant final code forces reassessment while historical feedback remains immutable.`, `Resume, new attempt, publication and BUILD freshness retain the pinned final revision; completed historical no-pin records stay unchanged and cannot be resumed or reused as final-version execution.` |
| `ac5` | `Whole-story task A introduces a defect and task B fixes it in the same submitted set: native and controller routes review the fixed final version without a stale blocker, while a separate unresolved final defect still blocks.`, `Disposable compiled MCP/IPC review packet pins a final revision over a multi-commit story; task review inspects final blocks, preserves origin provenance, excludes unrelated HEAD/worktree changes and publishes the correct current result.`, `Production build and scoped task-review/MCP tests pass; no direct cloud REST, retired engine or installed-daemon activation is introduced.` |

## 6. Migration

**State before:** s1 profiles and direct source checks show original commit-specific after-blocks feed attribution and task prompts, with no required final revision. Stored attempts and CRs preserve those pinned packets. The observed S3 review consequently retained a historical blocker despite a later included fix. [[c1]] [[c3]] [[c6]]

**State after:** Every new review explicitly pins reviewRevision and uses validated final projected scope for task source and finding coordinates. Original selections, prior attempts and completed historical records remain immutable. No model executes an unpinned historical attempt, and no HEAD default or compatibility engine is available. [[c1]] [[c2]]

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Extend contract/preparation and readers with explicit pin plus derived final-scope metadata, keeping old completed history readable. Update new-packet fixtures, producers, MCP schema and guidance together. Before any newly formatted attempt is admitted this source change can be reverted. — ↩ rollbackable
2. Qualify origin projection, stale-version reproduction, routes, historical reads, freshness and negative boundaries using disposable fixtures. Ship daemon and packet producer updates as one coordinated version change; do not introduce a runtime activation or compatibility flag. — ↩ rollbackable
3. Admit new explicitly pinned attempts only after the updated daemon is deployed. Preserve all previous records without backfill. After new-format state exists, a blind downgrade is unsafe because old strict readers may reject the added fields; retain the updated reader or use an explicitly planned operator rollback without deleting/reinterpreting records. — ✕ non-rollbackable

**Backward compat:** New starts intentionally require the explicit pin and reject old producer input with an actionable validation error. Existing completed attempts remain read-only historical evidence and can be republished without rewriting or claiming a final-version pin. Interrupted unpinned work requires a new explicit pinned attempt; no silent migration, old execution fallback, compatibility flag or automatic history rewrite. Existing in-flight sessions finish on their original daemon before coordinated restart; new semantics apply only to newly admitted pinned attempts.

## 7. Alternatives considered

### 7.1 a1: Pinned final revision with host-validated origin-preserving scope projection — **CHOSEN**

Pin one final code revision and project submitted changed segments into it, preserving their original commit provenance.

Add an explicit final reviewRevision to new packets. Validate submitted origin segments exactly as today, then derive only their surviving final-version spans and justified supersession/deletion markers from bounded committed Git evidence. All reviewer tasks inspect that final view; historical origin records remain traceable and immutable. A later submitted fix supersedes an earlier defective version instead of leaving a historical defect blocking. Refuse ambiguous lineage or interference that cannot be justified within the submitted change set; never add HEAD or unrelated changes. Reuse current packet/source reader, task attribution, policy, result validation, checkpoint and CR mechanisms.

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

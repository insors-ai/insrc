<!-- insrc:artifact LLD-2ff0dfdadb1c8d1c-s1 -->

# LLD: E202610072ff0dfda:S001

## Summary

**Epic:** `e1-delivery-read-model-daemon-from`
**HLD base run:** `wf-1791360301609-41fijn`
**HLD effective hash:** `215b5fd4f60f...`

This story builds the foundation every other delivery pass reads: a loader that reads the artifact store once into an immutable record set, and a pure builder that turns that record set into one graph of epics, stories, tasks and issues under the framework's existing canonical identity. It also fixes the single notice shape and attention table that every pass uses to report missing, ambiguous or unresolved evidence. Nothing here writes to the store or decides a stage.

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

**Rollout phase:** Phase A — record set, work-item graph and notices
**Owns:** `sc1` (ArtifactRecordSet), `sc2` (WorkItemGraph), `sc3` (DeliveryNotice)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Private to s2: the mapping from a work item's recorded route fields to a DeliveryRoute, read in this order of precedence: ISSUE meta.magnitude for an issue and for every fix story whose work-item hash is that issue's hash (small-bugfix or sized-bugfix, ahead of any BUILD stamp such as 'trivial'); the story's LLD meta.sizeClass; the standalone BUILD record's meta.sizeClass (the only place a trivial route is recorded); and, for a story under a non-standalone epic with none of these, the full chain; including treating any value that is not a SizeClass member (such as a scope letter 'M') or a missing stamp as unknown; a non-standalone BUILD's sizeClass is never read; the first-match-wins precedence that picks the stage; which gate counts as the ready gate for each route; and the wording of stage reasons. It reads approval state only through sc1 and never consults gate or currency annotations. Its LLD maps each of s2 ac1-ac7 to a named test over fabricated records. — owns `sc4`
- `s3`: Private to s3: reading each artifact's recorded review per kind (meta.review for design artifacts; body.verdict, body.counts and meta.reviewedBy for code-review records) and its recorded override; deciding when a block is still blocking, by reusing effectiveReviewVerdict over meta.review and meta.reviewResolutions and then requiring the artifact to be unapproved with no meta.reviewOverride; reading build task results from body.tasks[].passed and matching them to planned tasks; detecting the approved-with-failed-tasks conflict; and the attention rule itself, including the confirmed policy that a pending artifact stops counting once a downstream gate on the same work item is approved. It never changes a stage. Its LLD maps each of s3 ac1-ac7 to a named test, including ac7 against the confirmed attention policy. A build task recorded under the story's own id is the story-level result, never an unplanned task. A failed story-level result on an approved build raises the validation conflict and the validation-failed reason exactly as a failed task does; s3's LLD tests this with the shape of BUILD-0855311b6b32eb72-S001. — owns `sc5`
- `s4`: Private to s4: deciding review currency only from recorded fields (for example the framework's existing story-design staleness against its high-level design) and reporting unknown otherwise, never from file modification time; comparing accepted extension records with their epic framing; and detecting expected-but-missing fields, such as an artifact with no title. It never decides route-dependent gaps, which need s2's route. It reports through notices and never adds or removes work items. Also private: deriving each epic's amendments, and any story design's staleness against its high-level design, from the AMD, HLD and LLD records already in sc1, reusing only pure helpers such as computeHldEffectiveHash and never the amendments module's disk-reading listers, so the pass adds no second read and one malformed amendment cannot fail the snapshot. Staleness hashes the epic's approved amendments in rising approvedAt order, the order the existing scanner uses, which is separate from sc6's presentation sort by amendmentId. Its LLD maps each of s4 ac1-ac5 to a named test, including ac5 asserting that no file in the store changes. Its ac4 test covers the missing-field half (an artifact with no title); the build-without-plan half is tested in s5. — owns `sc6`
- `s5`: Private to s5: running the load, graph and three annotation passes in order for one request; joining annotations onto items; deciding needsAttention as any sc5 attention reason or any notice with attention true; computing counts over the full item set; the deterministic sort of items and notices; choosing openWith from whether an artifact's markdown carries its marker; the two daemon handler-map entries and their repo resolution and error mapping; the artifact-id validation that keeps evidence reads inside the artifact store; and the 1,000-artifact performance fixture. Also private: the error-path mapping (absent store is an empty snapshot; unreadable store, invalid or unknown evidence id is { error }). Also private: the determinism test (two snapshots over the same fixture are identical) and the regression check that the existing workflow.pending and workflow.artifactContent tests pass unchanged. Its LLD maps each of s5 ac1-ac6 to a named test: ac1 asserts the store is byte-identical after a request, ac3 reads a marker-less BUILD through workflow.deliveryEvidence, and ac6 is a type-level check that the VS Code plugin compiles against the published types plus a fixture the JetBrains mirror parses. Also private: the one route-dependent completeness check, raising an 'incomplete-evidence' notice for a story whose sc4 route requires a plan (full-chain, feature, sized-bugfix) but which has a build and no plan; small and small-bugfix routes never get it. Its LLD also owns the test for the build-without-plan half of s4 ac4: a full-chain story with a build and no plan gets the incomplete-evidence notice, and small and small-bugfix stories with a build and no plan do not. — owns `sc7`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `loadArtifactRecordSet`

```typescript
function loadArtifactRecordSet(repoPath: string, fs?: ReadonlyStoreFs, now?: () => string): ArtifactRecordSet
```

**Parameters:**
- `repoPath: string` — Absolute path of the registered repository whose artifact store (ARTIFACTS_DIR) is read.
- `fs: ReadonlyStoreFs` _(optional)_ — Read-only filesystem port (exists, listDir, readFile); defaults to node:fs reads. Lets tests use a temporary directory and proves there is no write path.
- `now: () => string` _(optional)_ — Clock for readAt; defaults to new Date().toISOString().

**Returns:** `ArtifactRecordSet` — sc1: every *.json file under the store lifted per kind into an ArtifactRecord, or recorded as a RecordLoadFailure; records sorted by artifactId, failures by fileName. An absent store yields empty records and failures.

**Errors:**
- `DeliveryStoreUnreadableError` when The artifact store directory exists but cannot be listed. A single unreadable or malformed file is never an error; it becomes a RecordLoadFailure.

**Preconditions:**
- repoPath is an absolute path.

**Postconditions:**
- No file under repoPath is created, modified or deleted.
- Each *.json file in the store appears exactly once, either in records or in failures.
- AMD files are lifted from their flat shape; every other kind from { meta, body }.
- storyOrdinal is storyIdToOrdinal(storyIdRaw) when it parses, otherwise null; the call never throws for a bad id.

### 2.2 `buildWorkItemGraph`

```typescript
function buildWorkItemGraph(recordSet: ArtifactRecordSet): WorkItemGraph
```

**Parameters:**
- `recordSet: ArtifactRecordSet` — The sc1 value from loadArtifactRecordSet (or a fabricated one in tests).

**Returns:** `WorkItemGraph` — sc2: each epic, story, task and issue once under its canonical id, with parent/child links, source ids, evidence artifact ids, planned task ids, corrected-parent and seeding links, plus identity notices (sc3).

**Preconditions:**
- recordSet.records is sorted by artifactId.

**Postconditions:**
- Pure: the same recordSet always yields an identical graph (same ids, same order of every list).
- Every record with a work-item key is evidence of exactly one item, or is named in a notice.
- Every story and task id is minted through safeCanonical over storyWorkflowId / taskWorkflowId from the item's anchor date and equals deriveWorkItemIdentity's canonical form for the same inputs; a mint that would throw falls back to the H-form or ':R(<raw>)' form with a notice, so the function never throws.
- No item is given a parent that the records do not name.

### 2.3 `groupRecordsByWorkItem`

```typescript
function groupRecordsByWorkItem(recordSet: ArtifactRecordSet): ReadonlyMap<string, readonly ArtifactRecord[]>
```

**Parameters:**
- `recordSet: ArtifactRecordSet` — The sc1 record set.

**Returns:** `ReadonlyMap<string, readonly ArtifactRecord[]>` — Records keyed by '<workItemHash>|<key>' where <key> is the storyOrdinal when storyIdRaw parses, 'R(<storyIdRaw>)' when a storyIdRaw is present but unparseable (matching the ':R(<raw>)' story item), and empty for epic-level records with no storyIdRaw and for pending or rejected EXT records (which attach to their epic, not a story); each list sorted by artifactId; records with no work-item hash, and SPEC records (which attach by seededFromSpec, not by hash), are omitted. Exported so s2-s4 do not each re-index sc1.

**Postconditions:**
- Pure and order-stable.
- Every story-level key ('<hash>|<ordinal>' or '<hash>|R(<raw>)') matches exactly one story item. An epic-level key ('<hash>|') matches the epic or issue item for that hash when a DEF or ISSUE head exists; under a hash with no head it matches no item, and those records are reported by an 'unresolved-parent' notice. Consumers map a record to its item through WorkItemNode.evidenceArtifactIds, never by assuming a key has an item.

### 2.4 `makeNotice`

```typescript
function makeNotice(code: NoticeCode, message: string, refs: { readonly itemIds?: readonly string[]; readonly artifactIds?: readonly string[]; readonly fileNames?: readonly string[] }): DeliveryNotice
```

**Parameters:**
- `code: NoticeCode` — One of the sc3 notice codes.
- `message: string` — Human-readable explanation naming the evidence.
- `refs: { itemIds?, artifactIds?, fileNames? }` — Items, artifacts and unreadable files the notice concerns.

**Returns:** `DeliveryNotice` — sc3 notice with sorted, de-duplicated id lists and attention taken from NOTICE_ATTENTION[code]; callers cannot set attention themselves.

**Postconditions:**
- attention === NOTICE_ATTENTION[code].

### 2.5 `sortNotices`

```typescript
function sortNotices(notices: readonly DeliveryNotice[]): readonly DeliveryNotice[]
```

**Parameters:**
- `notices: readonly DeliveryNotice[]` — Notices from any pass.

**Returns:** `readonly DeliveryNotice[]` — Notices ordered by code, then artifactIds, then itemIds, then fileNames, then message; exact duplicates removed.

**Postconditions:**
- Deterministic total order (k7).

### 2.6 `NOTICE_ATTENTION`

```typescript
const NOTICE_ATTENTION: Readonly<Record<NoticeCode, boolean>>
```

**Returns:** `Readonly<Record<NoticeCode, boolean>>` — The fixed attention table from sc3: true for record-unreadable, identity-ambiguous, unresolved-parent, validation-conflict; false for every other code.

**Postconditions:**
- Exhaustive over NoticeCode; a new code fails to compile until it is given a value.

## 3. Data model changes

### 3.1 `ArtifactRecord / RecordLoadFailure / ArtifactRecordSet (sc1)` — new

New types in src/workflow/delivery/types.ts with the exact fields of HLD sc1 and the DeliveryArtifactKind and ApprovalState unions. Lift rules: kind from the file-name prefix; workItemHash from meta.epicHash, meta.issueHash (ISSUE), meta.specHash (SPEC) or top-level epicHash (AMD); storyIdRaw from meta.storyId; approval from meta.approvedAt / meta.rejectedAt (AMD: top-level approvedAt / rejectedAt, and status 'approved' / 'rejected' when the timestamps are absent); createdAt from meta.createdAt (AMD: proposedAt); epicCreatedAt from meta.epicCreatedAt. A file whose prefix is not a DeliveryArtifactKind is an 'unknown-kind' failure.

**Call sites:**
- `src/workflow/id.ts::storyIdToOrdinal`
- `src/workflow/storage.ts::ARTIFACTS_DIR`

### 3.2 `WorkItemNode / WorkItemGraph (sc2)` — new

New types with the exact fields of HLD sc2. Construction rules: (1) definition heads: each DEF-<hash> is an epic node and each ISSUE-<hash> an issue node, id = safeCanonical(() => epicWorkflowId(hash, head.createdAt)), falling back to 'H<hash>' with an 'identity-anchor-missing' notice when it returns undefined; epic title = meta.epicSlug, issue title = body.title. (2) Story groups: records grouped by workItemHash + storyOrdinal; anchor date follows buildRecordFolderArgs (storage.ts:405-425) so ids match the existing folders: for an epic story, the DEF's createdAt; for a standalone story, the story's LLD workItemAnchorCreatedAt (epicCreatedAt ?? createdAt), else the definition head's (ISSUE) createdAt, else the earliest BUILD's createdAt (trivial route); id = safeCanonical(() => storyWorkflowId(hash, anchor, storyIdRaw)) (id.ts:185); every mint in the builder goes through safeCanonical, so a malformed createdAt, a non-hex hash or an unparseable id never throws. When the mint returns undefined the item id falls back to 'H<workItemHash>[:S<nnn>]' with an 'identity-anchor-missing' notice; a story whose storyIdRaw does not parse gets the id '<epic or H-form>:R(<storyIdRaw>)', a form no canonical id can take. standalone follows the same precedence as inheritedStoryStandalone (storage.ts:252), re-implemented over the sc1 records already in memory (the builder never calls that helper, which reads the disk): the definition head's meta.standalone, else the story's LLD meta.standalone, else, only when the group has neither a head nor an LLD (the trivial route, where buildRecordFolderArgs also falls back to the BUILD's own createdAt), the BUILD's meta.standalone. When a head or LLD exists, a BUILD's, PLAN's or CR's standalone and epicSlug are never read for identity, because BUILD records are known to carry a wrong standalone flag in that case (storage.ts:242-247). Story membership of an epic = DEF body.stories ids ∪ approved EXT body.addedStory ids ∪ any story group under that hash formed by records other than EXT; a pending or rejected EXT never creates a story item and is attached as evidence of its epic instead; story title from the DEF story entry or EXT addedStory, else meta.epicSlug for a standalone story. Fix stories share the issue's hash and become its children. (3) Tasks: from PLAN body.tasks[] and BUILD body.tasks[] ids matching t<n>, id = safeCanonical(() => taskWorkflowId(hash, anchor, storyIdRaw, taskId)); when that returns undefined (the parent story has an H-form or ':R(<raw>)' id) the task id is '<parent story item id>:T<nnn>' with nnn from taskIdToOrdinal, title from the PLAN task; a BUILD task id equal to the story's own id creates no task. plannedTaskIds = PLAN task ids. (4) Evidence: LLD, PLAN, BUILD, CR and story-scoped EXT records attach to their story; HLD and AMD records to their epic; an ISSUE to its issue node; a SPEC to the item whose meta.seededFromSpec names its hash. (5) correctsRef from ISSUE meta.parentRef, resolved by epicHash, else by parentRef.slug in each of its stored forms: an epicSlug label (matched against other work items' meta.epicSlug), a bare 16-hex work-item hash (matched against work-item hashes), or a hierarchical slug or canonical id (parsed with parseWorkflowId and matched on hash8 and date, its story segment used when present); records with the issue's own hash are always excluded; a parentRef naming only the issue itself gives correctsRef null. When the matched work item is found and parentRef also names a storyId, resolvedItemId is that story's item (storyId compared by ordinal); if that story does not exist under the matched work item, resolvedItemId is the work item itself and an 'unresolved-parent' notice names the missing story. When a slug matches records under more than one work-item hash, resolvedItemId is null and an 'identity-ambiguous' notice names the issue and every candidate; no candidate is chosen. (6) rootIds = epics, issues, and stories with no epic or issue parent, sorted.

**Call sites:**
- `src/workflow/id.ts::epicWorkflowId`
- `src/workflow/id.ts::parseWorkflowId`
- `src/workflow/id.ts::safeCanonical`
- `src/workflow/id.ts::storyWorkflowId`
- `src/workflow/id.ts::taskIdToOrdinal`
- `src/workflow/id.ts::taskWorkflowId`
- `src/workflow/id.ts::toCanonical`
- `src/workflow/storage.ts::workItemAnchorCreatedAt`

### 3.3 `NoticeCode / DeliveryNotice (sc3)` — new

New union and interface with the exact members and fields of HLD sc3, plus NOTICE_ATTENTION. s1 itself raises: record-unreadable (one per RecordLoadFailure, store-level, fileNames set), identity-ambiguous (a record whose storyIdRaw is present but does not parse under the canonical rule; it keeps its own ':R(<raw>)' item and the notice names it and the other story items under the same hash. Disagreeing meta.standalone or meta.epicSlug values between a story's records are NOT ambiguity: standalone comes from the head, else the LLD, and BUILD/PLAN/CR values are ignored), unresolved-parent (a story-scoped record whose hash has no definition head and is not standalone, or an ISSUE whose outward parentRef matches no work item), identity-anchor-missing (no createdAt anywhere in a group) and unattached-spec (a SPEC no item names).


### 3.4 `ReadonlyStoreFs` — new

Port with exactly three read operations: exists(path): boolean, listDir(path): readonly string[], readFile(path): string. The default implementation wraps node:fs existsSync, readdirSync and readFileSync; there is no write method on the type.


## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | loadArtifactRecordSet produces ArtifactRecordSet exactly as sketched in HLD sc1, including the per-kind AMD lift and the four RecordLoadFailure reasons. |
| `sc2` | implements | buildWorkItemGraph produces the WorkItemGraph shape of HLD sc2, reusing id.ts minters and storage.ts's anchor helper; groupRecordsByWorkItem is the shared read-only index over sc1. Two refinements of sc2's anchor comment, both required by sc2's own rule that ids equal the existing path-scheme folder: (1) for a standalone story the anchor is the LLD's workItemAnchorCreatedAt before the ISSUE head's createdAt, the order buildRecordFolderArgs uses (storage.ts:405-425); epic stories still anchor on the DEF; (2) the H-form id also covers a createdAt or hash that safeCanonical cannot mint, not only a missing createdAt. Consumers must read ids as opaque and never re-derive them from sc2's comment. |
| `sc3` | implements | notice.ts defines NoticeCode and DeliveryNotice exactly as sketched in HLD sc3, owns NOTICE_ATTENTION (the fixed attention table) and the deterministic sort; makeNotice is the only constructor, so no pass can set attention itself. |

## 5. Error paths

**Error cases**

- **The artifact store directory exists but cannot be listed (permissions, I/O error).** (recoverable)
  - Detection: ReadonlyStoreFs.listDir throws for the store path after exists() returned true.
  - Response: loadArtifactRecordSet throws DeliveryStoreUnreadableError carrying the path and the underlying message; s5 maps it to { error }.
  - User impact: The client shows the store as unavailable instead of an empty board.
- **One file in the store cannot be read.** (recoverable)
  - Detection: ReadonlyStoreFs.readFile throws for that file.
  - Response: A RecordLoadFailure with reason 'unreadable' is recorded; loading continues with the next file. The graph builder raises one 'record-unreadable' notice (attention true) naming the file.
  - User impact: Every other work item is still shown; the notice tells the reader coverage is incomplete.
- **A file is not valid JSON.** (recoverable)
  - Detection: JSON.parse throws.
  - Response: RecordLoadFailure with reason 'invalid-json' and the parser message; loading continues.
  - User impact: As above: one notice, everything else present.
- **A non-AMD file parses but has no object meta.** (recoverable)
  - Detection: The parsed value has no meta property, or meta is not a plain object.
  - Response: RecordLoadFailure with reason 'missing-meta'; no ArtifactRecord is produced for it.
  - User impact: The record is reported, not silently dropped.
- **A *.json file whose name prefix is not a known artifact kind.** (recoverable)
  - Detection: The prefix before the first '-' is not in DeliveryArtifactKind.
  - Response: RecordLoadFailure with reason 'unknown-kind'.
  - User impact: Reported as unreadable coverage, not mistaken for a work item.
- **A record's meta.storyId is present but does not parse under the canonical rule.** (recoverable)
  - Detection: storyIdToOrdinal throws; the loader catches it and stores storyOrdinal null with storyIdRaw kept.
  - Response: The graph builder gives that record its own story item keyed by the raw id and raises 'identity-ambiguous' naming it and any story group under the same hash.
  - User impact: The record stays visible and is flagged rather than merged into the wrong story.
- **A record's createdAt is present but not a valid ISO date, or its work-item hash is not >=8-char lowercase hex.** (recoverable)
  - Detection: safeCanonical returns undefined because utcDate or hash8Of throws inside the minter (id.ts:91-106).
  - Response: The item id falls back to the 'H<workItemHash>[:S<nnn>]' form and an 'identity-anchor-missing' notice names the record.
  - User impact: The work item is still shown, flagged as having no usable identity date.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| No artifact store directory exists for the repository. | An ArtifactRecordSet with empty records and failures and a readAt; the graph is empty with no notices. |
| Records for the same story written as s1 (LLD) and S001 (BUILD). | One story item; sourceIds ['S001', 's1']; both records in its evidence. |
| A standalone LLD with no DEF or ISSUE head and no meta.epicCreatedAt, e.g. LLD-d88062a6e63aa312-S001. | Story id dated from that LLD's own createdAt, matching its existing docs/standalone folder segment; the story is a root; no notice. |
| A BUILD with no epicCreatedAt whose own createdAt is a different day from its epic's DEF. | The BUILD joins the story under the DEF's anchor date; it never mints a second story id. |
| An ISSUE whose parentRef slug equals its own epicSlug (e.g. ISSUE-0855311b6b32eb72). | correctsRef is null and no unresolved-parent notice is raised. |
| An ISSUE whose parentRef slug names another work item (e.g. ISSUE-2d9e9e694a94116b naming vs-code-editor-dev-chat-ui). | correctsRef.resolvedItemId is that work item's id. |
| An ISSUE whose outward parentRef matches no work item in the store. | The issue is present, correctsRef.resolvedItemId is null, and an 'unresolved-parent' notice names the issue. |
| An issue with two fix stories S001 and S002 under its hash. | The issue node has both as distinct children, each with its own tasks and evidence. |
| Two stories in different epics each with a planned task t1. | Two task items with different canonical ids (each under its own story id). |
| A BUILD whose body.tasks contains only { id: 'S001', passed: false }. | No task item is created and no notice is raised; the record remains in the story's evidence for s3. |
| A flat AMD record with status 'approved' and approvedAt set. | ArtifactRecord kind AMD, approval approved, attached as evidence of its epic. |
| A SPEC whose hash appears in a DEF's meta.seededFromSpec. | The SPEC is in that epic's evidence and seededFromSpecId is 'SPEC-<hash>'. |
| A SPEC no item names. | A store-level 'unattached-spec' notice with attention false. |
| An approved EXT adds story s6 that the DEF's story list does not yet contain. | Story s6 is present under the epic, titled from body.addedStory. |
| An LLD whose epic hash has no DEF and which is not marked standalone. | The story is a root with an 'unresolved-parent' notice; no epic is invented. |
| LLD-d88062a6e63aa312-S001 has standalone true while BUILD-d88062a6e63aa312-S001 has standalone false; likewise the dfc0371b7200f5b5 S001 pair. | One story item each, standalone true (from the LLD), and no identity-ambiguous notice. |
| An LLD with an unparseable storyId 'x' under an epic hash that also has a DEF and an HLD. | groupRecordsByWorkItem puts the LLD under '<hash>\|R(x)' and the DEF and HLD under '<hash>\|'; the graph has a matching ':R(x)' story item. |
| An HLD or AMD record under a work-item hash that has no DEF or ISSUE head. | The record is keyed '<hash>\|' in groupRecordsByWorkItem, attaches to no item, and is named by an 'unresolved-parent' notice. |
| A trivial-route story whose only records are BUILD-d5a433047dc3439f-S001 (meta.standalone true, sizeClass 'trivial') and its CR, with no DEF, ISSUE or LLD. | A root story item with standalone true, dated from the BUILD's createdAt, with no unresolved-parent notice. |
| ISSUE-57446545909fe95c with parentRef { slug: 'add-daemon-driven-code-review-stage', storyId: 's1' }. | correctsRef.resolvedItemId is the S001 story item of that epic. |
| An ISSUE whose parentRef names an existing epic by slug and a storyId that epic does not have. | correctsRef.resolvedItemId is the epic item, and an 'unresolved-parent' notice names the missing story. |
| An ISSUE whose parentRef slug matches records under two different work-item hashes. | correctsRef.resolvedItemId is null and an 'identity-ambiguous' notice names the issue and both candidates. |
| A pending EXT and a rejected EXT under an epic, each naming a story id the DEF does not list. | Neither creates a story item; both appear in the epic's evidence. |
| ISSUE-095906bac5bbacaf whose parentRef.slug is the bare hash 'd5a433047dc3439f' with storyId 's1'. | correctsRef.resolvedItemId is the S001 story of work item d5a433047dc3439f (its BUILD and CR records); no unresolved-parent notice. |
| An ISSUE whose parentRef.slug is a hierarchical slug such as 'E20260804d88062a6-S001'. | parseWorkflowId resolves it to the S001 story whose hash8 and anchor date match. |
| A task t2 under a story whose storyId is the unparseable 'x', and a task under a story whose only createdAt is invalid. | Task ids '<parent story item id>:T002'; buildWorkItemGraph does not throw. |
| A rejected EXT naming story s9 that no DEF entry or other record names. | groupRecordsByWorkItem keys it '<hash>\|' (epic level), no s9 story item exists, and the EXT is in the epic's evidence. |

**Invariants to preserve**

- Artifact files are written by tmp-then-rename (writeAtomic), so each file is read either before or after a write, never half-written. [[c18]]
- Approval state is read from the approvedAt / rejectedAt stamps the approve and reject paths write. [[c4]]
- Story ids compare by ordinal: s1, S1 and S001 name the same story. [[c6]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run via npx tsx --test (the convention of src/workflow/__tests__/pending.test.ts and chain.test.ts)`

**Test levels**

- **unit** — Prove the graph builder's identity, nesting, linking and notice rules over fabricated in-memory record sets, with no filesystem.
  - Subjects: `buildWorkItemGraph`, `groupRecordsByWorkItem`, `makeNotice`, `sortNotices`, `NOTICE_ATTENTION`
  - Fixtures: `A record-set builder helper that fabricates ArtifactRecords per kind, in the style of pending.test.ts's pendingLld`, `Real-shape fixtures copied from the store: the S001/s001 pair in epic dfc0371b, ISSUE-0855311b6b32eb72 (self-slug parentRef), ISSUE-2d9e9e694a94116b (outward slug), LLD-d88062a6e63aa312-S001 (standalone, no head, no epicCreatedAt), BUILD-0855311b6b32eb72-S001 (story-level task id), one flat AMD record`, `Records with an invalid createdAt and with a non-hex work-item hash, asserting the H-form id and an identity-anchor-missing notice`, `An LLD with storyId 'x' alongside its epic's DEF, asserting groupRecordsByWorkItem keys it '<hash>|R(x)', not the epic bucket`, `A SPEC record named by a DEF's seededFromSpec, plus an HLD under a hash with no DEF, asserting the SPEC is absent from groupRecordsByWorkItem and the head-less HLD key maps to no item and carries an unresolved-parent notice`
- **integration** — Prove the loader against a temporary artifact store on disk: per-kind lift, load failures, absent and unreadable store, and that nothing is written.
  - Subjects: `loadArtifactRecordSet`, `ReadonlyStoreFs default implementation`
  - Fixtures: `mkdtemp repository with .insrc/artifacts containing valid DEF/LLD/PLAN/BUILD/CR/ISSUE/SPEC/EXT/AMD files, one invalid-JSON file, one file without meta, one unknown-prefix file`, `A ReadonlyStoreFs stub whose listDir throws, for the unreadable-store case`
- **contract** — Prove minted ids equal deriveWorkItemIdentity's canonical form over the work item's anchor inputs and the work item's existing path-scheme folder segment. workflow.pending mints each record's id from that record's own epicCreatedAt ?? createdAt (pending.ts:161-170), so its per-record id can differ from the delivery view's for a record dated on another day than its anchor; that is a known divergence and no test asserts agreement with workflow.pending. It includes a sized-bugfix story whose LLD has no epicCreatedAt and a createdAt on a different day from its ISSUE, asserting the id follows the LLD as buildRecordFolderArgs does.
  - Subjects: `buildWorkItemGraph ids versus deriveWorkItemIdentity / toCanonical`
  - Fixtures: `Epic, standalone and issue groups whose expected ids are computed with deriveWorkItemIdentity and compared to literals pinned in the test`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `graph.test.ts: 'a story with LLD, PLAN, BUILD and CR is one item with all four as evidence'`, `graph.test.ts: 'pending and rejected EXT records create no story item and appear as epic evidence'`, `graph.test.ts: 'a rejected EXT whose story nothing else names is keyed epic-level and creates no story key'` |
| `ac2` | `graph.test.ts: 's1 and S001 records join one story and both raw ids are kept in sourceIds'`, `graph.test.ts: 'the real S001/s001 pair from epic dfc0371b yields one story'` |
| `ac3` | `graph.test.ts: 'an unparseable storyId keeps its own :R(<raw>) item and raises identity-ambiguous naming the sibling story items'`, `graph.test.ts: 'LLD standalone true with BUILD standalone false (real d88062a6 and dfc0371b shapes) is one item with no notice'`, `graph.test.ts: 'a parentRef slug matching two hashes resolves to nothing and raises identity-ambiguous naming both'` |
| `ac4` | `graph.test.ts: 'an issue with fix stories S001 and S002 has two distinct story children with their own tasks and evidence'` |
| `ac5` | `graph.test.ts: 'an issue whose outward parentRef matches nothing is present with an unresolved-parent notice'`, `graph.test.ts: 'a self-slug parentRef gives correctsRef null and no notice'`, `graph.test.ts: 'a standalone story with no head is a root with no invented epic, dated from its own LLD'`, `graph.test.ts: 'a trivial story with only a BUILD (standalone true) and a CR is a standalone root with no unresolved-parent notice'`, `graph.test.ts: 'a parentRef with slug and storyId (ISSUE-57446545909fe95c shape) resolves to the named story'`, `graph.test.ts: 'a parentRef naming an existing epic and a storyId it lacks resolves to the epic with an unresolved-parent notice naming the missing story'`, `graph.test.ts: 'a bare-hash parentRef slug (ISSUE-095906bac5bbacaf shape) resolves to the existing story without a notice'` |
| `ac6` | `graph.test.ts: 'task t1 in two stories of different epics gets two distinct canonical ids'`, `graph.test.ts: 'a BUILD task id equal to the story id creates no task item and no notice'`, `graph.test.ts: 'tasks under an :R(x) story and under a story with an invalid createdAt get <story id>:T<nnn> ids and the builder does not throw'` |

## 7. Alternatives considered

### 7.1 a1: Separate loader and pure graph builder over a flat record set — **CHOSEN**

One function reads the store into the sc1 record set through an injected read-only filesystem port; a second, pure function turns that record set into the sc2 graph in fixed sub-passes; a small notice module fixes the sc3 shape and the attention table.

The loader takes the repository path and a read-only filesystem port (list a directory, read a file) and returns the sc1 ArtifactRecordSet: every JSON file under the artifact store is parsed, lifted per kind (AMD flat, everything else meta/body) and either becomes an ArtifactRecord or a RecordLoadFailure; both lists are sorted. It never throws for a bad file and touches nothing outside the store directory. The record set is a plain immutable value, so s2-s4 receive exactly what s1 produced.

The graph builder is a pure function of the record set. It runs fixed sub-passes in order: group records by work-item hash and story ordinal; choose each group's anchor date (definition head, else the earliest design head's epicCreatedAt-or-createdAt) and mint canonical ids with the existing id.ts minters; create epic, story, task and issue nodes; source epic story membership from the Define's story list and accepted EXT records; nest tasks from t<n> plan and build ids; link fix stories to issues by shared hash, resolve parentRef (excluding the issue's own hash) and attach SPECs by seededFromSpec; then collect identity notices. A notice module exports the sc3 types, a constructor that applies the fixed attention-by-code table, and a deterministic sort. A read-only helper that groups records by work-item key is exported so later passes do not each re-index the record set.

### 7.2 a2: Single read-and-build entry point

One function reads the store and returns the graph directly, keeping the record set internal.

A single readWorkItemGraph(repo) lists and parses the store, lifts each record, and builds the graph in the same traversal, returning the graph plus the record set as a by-product. The record set is not a separately constructed value: it is whatever the traversal accumulated.

Callers make one call and get both structures. Identity notices and load failures are folded into the graph's notice list.

**Rejected because:** Produces the same graph but merges the loader and builder, so identity rules can only be tested through the filesystem and sc1's failure list is blurred into sc2's notices.

### 7.3 a3: Mutable graph builder that later passes extend

s1 exposes a builder object that s2-s4 register hooks on, so each pass decorates nodes in place.

s1 provides a GraphBuilder class that loads records and builds nodes; later stories register visitor hooks that run during the build and attach their annotations directly onto nodes. The final graph carries identity, stage, gates and currency together.

The builder owns traversal order, and each pass contributes a visitor.

**Rejected because:** Breaks the HLD's independence of s2-s4 and the immutability the determinism constraint relies on; s1 would have to know later stories' hook signatures.

## 8. References

- **[[c1]]** `prior-artifact` `docs/epics/e1-delivery-read-model-daemon-from-E202610072ff0dfda/HLD.md (HLD-2ff0dfda, approved 2026-10-07) :: sc1, sc2, sc3 and the s1 story boundary` — "Records are grouped by workItemHash + storyOrdinal BEFORE the id is minted."
- **[[c2]]** `analyze-bundle` `design.story/s1 code how-does-it-work over src/workflow/id.ts, storage.ts and path-scheme.ts` — "Identity is minted by epicWorkflowId, storyWorkflowId and taskWorkflowId (src/workflow/id.ts:146-167), serialized by toCanonical (:173)."
- **[[c4]]** `code` `src/workflow/pending.ts:126-128 (pending = neither stamp); written at src/workflow/gates.ts:606 (approvedAt) and :954 (rejectedAt)` — "// Pending = neither stamped: the SAME fields approve/reject write (k5)."
- **[[c5]]** `code` `src/workflow/storage.ts:263 (readEpicCreatedAt), :357 (readEpicDefinitionCore), :363-372 (buildRecordFolderArgs)` — "the parent Epic's define for an epic build, or the standalone LLD for a standalone build ... falling back to the record's own createdAt"
- **[[c6]]** `code` `src/workflow/id.ts:119 (storyIdToOrdinal)` — "The ordinal is what matters — 's1', 'S1' and 'S001' all yield 1."
- **[[c7]]** `prior-artifact` `docs/epics/restructure-docs-artifact-markdown-from-flat-E20260915599a9b50/HLD.md :: sc1: Uniform work-item identity` — "One canonical, both-way identity for every work item and story — epic-parented or standalone — so identity can serve as the folder key and lookup key the whole layout hangs on."
- **[[c8]]** `step-output` `design.story/s1 direct reads of .insrc/artifacts on 2026-10-07` — "PLAN task ids: 865 of form t<n>; BUILD task ids: 220 t<n>, 20 S<n>; EXT body carries addedStory and amendmentId; titles: DEF meta.epicSlug, ISSUE body.title."
- **[[c9]]** `code` `src/workflow/__tests__/pending.test.ts:53 (pendingLld fixture builder); src/workflow/__tests__/folder-identity-regression.test.ts` — "node:test fixtures built in-memory and pinned literal paths for folder identity."
- **[[c10]]** `code` `src/workflow/artifacts/define.ts:64-73 (DefineStory)` — "readonly id: string; // 's1', 's2', ...  readonly title: string;"
- **[[c18]]** `code` `src/workflow/storage.ts:77-87 (writeAtomic)` — "export function writeAtomic(absPath: string, content: string): void { ... renameSync(tmp, absPath);"
- **[[c11]]** `code` `src/workflow/id.ts:91-106 (utcDate, hash8Of throw), :185 (safeCanonical); src/workflow/storage.ts:242-262 (inheritedStoryStandalone precedence: head, then LLD; it reads the disk and is not called); src/workflow/pending.ts:161-170 (per-record workItemId)` — "export function safeCanonical(mint: () => WorkflowId): string | undefined { try { return toCanonical(mint()); } catch { return undefined; } }"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 13 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-07T09:16:37.665Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._

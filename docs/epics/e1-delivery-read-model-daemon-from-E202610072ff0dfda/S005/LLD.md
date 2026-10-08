<!-- insrc:artifact LLD-2ff0dfdadb1c8d1c-s5 -->

# LLD: E202610082ff0dfda:S005

## Summary

**Epic:** `e1-delivery-read-model-daemon-from`
**HLD base run:** `wf-1791360301609-41fijn`
**HLD effective hash:** `215b5fd4f60f...`

This Story publishes the delivery read model. One workflow.delivery request reads the artifact store once, runs the graph, stage, gate and currency passes, and returns one timestamped snapshot: every work item with its stage, evidence, task results, amendments, notices and a single needs-attention flag, plus store-level notices and counts, in a fixed order. workflow.deliveryEvidence returns any one record's metadata, body and rendered markdown through the daemon, including records whose markdown the review view cannot open. Both are new daemon handler entries; no existing handler changes, and the response types are fixed for the VS Code plugin, the JetBrains plugin and the insrc-ide fork.

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

**Rollout phase:** Phase C — snapshot assembly and the two IPC methods
**Owns:** `sc7` (Delivery IPC contract (workflow.delivery, workflow.deliveryEvidence))
**Consumes:** `sc1` (ArtifactRecordSet), `sc2` (WorkItemGraph), `sc3` (DeliveryNotice), `sc4` (StageAnnotation), `sc5` (GateAnnotation), `sc6` (CurrencyAnnotation)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Private to s1: how the store directory is listed and each file parsed; how a record's kind, work-item hash and raw story id are lifted from its file name and meta; the use of the canonical ordinal rule to join s1/S1/S001 and the decision of when two records are ambiguous rather than the same; sourcing story membership from the Define's story list and from accepted extension records; attaching fix stories to an issue through the shared work-item hash and resolving meta.parentRef; nesting tasks by plan and build task ids; and the sort order of records, failures and child lists. No other story reads the files or re-derives identity. Also private: the per-kind lift, including reading flat amendment records; the anchor-date rule for minting canonical ids after grouping by hash and ordinal, which must reproduce deriveWorkItemIdentity and the existing path-scheme folder for every work item those can identify; attaching each SPEC to the item that names it in meta.seededFromSpec; resolving a slug-only parentRef through records' meta.epicSlug. Its LLD maps each of s1 ac1-ac6 to a named test, including ac3 (an ambiguity notice naming the other record), ac4 (two fix stories under one issue) and ac6 (colliding short task ids in two stories). Task items are minted only from t<n> build and plan task ids; a build task id equal to the story's id is left for s3 as a story-level result, with a fixture of that shape. Slug resolution of an issue's parentRef excludes records sharing the issue's own hash; a parentRef that names only the issue itself yields no corrected parent and no notice. Fixtures cover both real shapes: a self-slug parentRef (for example ISSUE-0855311b6b32eb72) and an outward slug (for example ISSUE-2d9e9e694a94116b). — owns `sc1`, `sc2`, `sc3`
- `s2`: Private to s2: the mapping from a work item's recorded route fields to a DeliveryRoute, read in this order of precedence: ISSUE meta.magnitude for an issue and for every fix story whose work-item hash is that issue's hash (small-bugfix or sized-bugfix, ahead of any BUILD stamp such as 'trivial'); the story's LLD meta.sizeClass; the standalone BUILD record's meta.sizeClass (the only place a trivial route is recorded); and, for a story under a non-standalone epic with none of these, the full chain; including treating any value that is not a SizeClass member (such as a scope letter 'M') or a missing stamp as unknown; a non-standalone BUILD's sizeClass is never read; the first-match-wins precedence that picks the stage; which gate counts as the ready gate for each route; and the wording of stage reasons. It reads approval state only through sc1 and never consults gate or currency annotations. Its LLD maps each of s2 ac1-ac7 to a named test over fabricated records. — owns `sc4`
- `s3`: Private to s3: reading each artifact's recorded review per kind (meta.review for design artifacts; body.verdict, body.counts and meta.reviewedBy for code-review records) and its recorded override; deciding when a block is still blocking, by reusing effectiveReviewVerdict over meta.review and meta.reviewResolutions and then requiring the artifact to be unapproved with no meta.reviewOverride; reading build task results from body.tasks[].passed and matching them to planned tasks; detecting the approved-with-failed-tasks conflict; and the attention rule itself, including the confirmed policy that a pending artifact stops counting once a downstream gate on the same work item is approved. It never changes a stage. Its LLD maps each of s3 ac1-ac7 to a named test, including ac7 against the confirmed attention policy. A build task recorded under the story's own id is the story-level result, never an unplanned task. A failed story-level result on an approved build raises the validation conflict and the validation-failed reason exactly as a failed task does; s3's LLD tests this with the shape of BUILD-0855311b6b32eb72-S001. — owns `sc5`
- `s4`: Private to s4: deciding review currency only from recorded fields (for example the framework's existing story-design staleness against its high-level design) and reporting unknown otherwise, never from file modification time; comparing accepted extension records with their epic framing; and detecting expected-but-missing fields, such as an artifact with no title. It never decides route-dependent gaps, which need s2's route. It reports through notices and never adds or removes work items. Also private: deriving each epic's amendments, and any story design's staleness against its high-level design, from the AMD, HLD and LLD records already in sc1, reusing only pure helpers such as computeHldEffectiveHash and never the amendments module's disk-reading listers, so the pass adds no second read and one malformed amendment cannot fail the snapshot. Staleness hashes the epic's approved amendments in rising approvedAt order, the order the existing scanner uses, which is separate from sc6's presentation sort by amendmentId. Its LLD maps each of s4 ac1-ac5 to a named test, including ac5 asserting that no file in the store changes. Its ac4 test covers the missing-field half (an artifact with no title); the build-without-plan half is tested in s5. — owns `sc6`

## 2. Contract details

**Surface level:** public

### 2.1 `workflow.delivery (DeliverySnapshotRequest -> DeliverySnapshotResponse)`

```typescript
export function handleDelivery(params: DeliverySnapshotRequest | undefined, repoEnv: string | undefined, deps?: DeliveryDeps): DeliverySnapshotResponse
```

**Parameters:**
- `params: DeliverySnapshotRequest | undefined` _(optional)_ — { repo? }; the repository to read.
- `repoEnv: string | undefined` — process.env['INSRC_REPO'], the fallback when params.repo is absent or empty, as handleWorkflowPending takes it.
- `deps: DeliveryDeps` _(optional)_ — { fs?: ReadonlyStoreFs; now?: () => string; markdown?: DeliveryMarkdownPort } for tests; defaults read the real store and docs/ tree.

**Returns:** `DeliverySnapshotResponse` — repo = params.repo when a non-empty string, else repoEnv; neither gives { error: 'workflow.delivery: `repo` is required' }. One loadArtifactRecordSet over the repo (an absent store directory gives an empty record set and so a snapshot with recordCount 0 and no items), then buildWorkItemGraph, deriveStages, deriveGates and deriveCurrency over that one record set, then assembleSnapshot with createMarkdownPort(repo, graph). A DeliveryStoreUnreadableError, or any other error thrown on the way, maps to { error: 'workflow.delivery: <message>' }; the handler never throws. One info log line per request names the repo, record count, unreadable count, item count, notice count by code and elapsed milliseconds.

**Postconditions:**
- Read-only: no file under the repo, its artifact store, docs/ or .git is written.
- No LLM provider is called.

### 2.2 `DeliverySnapshot (assembleSnapshot)`

```typescript
export function assembleSnapshot(recordSet: ArtifactRecordSet, graph: WorkItemGraph, stages: StagePassResult, gates: GatePassResult, currency: CurrencyPassResult, markdown: DeliveryMarkdownPort): DeliverySnapshot
```

**Parameters:**
- `recordSet: ArtifactRecordSet` — sc1, read once for this request.
- `graph: WorkItemGraph` — sc2 over recordSet.
- `stages: StagePassResult` — sc4.
- `gates: GatePassResult` — sc5.
- `currency: CurrencyPassResult` — sc6.
- `markdown: DeliveryMarkdownPort` — Reports each record's rendered markdown path and whether it starts with that record's marker.

**Returns:** `DeliverySnapshot` — schemaVersion 1; repo and takenAt = recordSet.repo and recordSet.readAt; recordCount and unreadableCount = the record and failure counts. items: one DeliveryItem per graph item of every kind, sorted by id. Each item: id, kind, title, standalone, sourceIds, parentId, childIds and correctsRef from the graph; stage = the item's sc4 annotation (stories and issues), null for epics and tasks; evidence = one DeliveryEvidenceEntry per evidence id that has a record, sorted by artifactId, with approval and review from the sc5 ArtifactGate, reviewCurrency from sc6, and mdPath / openWith from the markdown port (mdPath null and openWith 'evidence-read' when the port finds no file; openWith 'review-view' only when the file's first line is exactly '<!-- insrc:artifact <artifactId> -->'); tasks, validation, storyLevelResult and conflict from the sc5 ItemGates for stories (tasks [], validation null, storyLevelResult null, conflict null otherwise); amendments = the sc6 list for an epic, [] otherwise; notices = every notice from the graph and the three passes, plus this step's completeness notices, whose itemIds include the item, sorted with sortNotices; needsAttention = the item has an sc5 attention reason or a notice with attention true; attentionReasons = the sc5 reasons in their declared order, then, in code order, the codes of the item's attention-true notices that are not already in the list, so each entry appears once ('validation-conflict' is both an sc5 reason and an attention-true notice code and is listed once). Completeness (the build-without-plan half of the s4 criterion): a story whose sc4 route is full-chain, feature or sized-bugfix and that holds a BUILD and no PLAN gets one incomplete-evidence notice naming the story and its BUILDs; small, small-bugfix, trivial and unknown routes never do. rootIds from the graph. notices = every notice with no itemIds, sorted with sortNotices. counts.items per item kind (all four keys present), counts.byStage per stage over stories and issues (all six keys present), counts.needsAttention = items with needsAttention. attentionRule = one fixed sentence stating that an item needs attention when it has a gate attention reason (a pending decision, a rejection, a blocking review, a failed validation or a validation conflict, a pending record no longer counting once a later gate on its item is approved) or a notice whose code is marked for attention.

**Preconditions:**
- graph and the three annotations were derived from recordSet.

**Postconditions:**
- Pure and deterministic given its inputs: the same inputs give a deep-equal snapshot, whatever the record timestamps.
- Plain JSON: arrays and objects only, no Map, Set or undefined.

### 2.3 `DeliveryMarkdownPort`

```typescript
interface DeliveryMarkdownPort { markdownOf(record: ArtifactRecord): { readonly mdPath: string; readonly hasMarker: boolean } | null }; export function createMarkdownPort(repoPath: string, graph: WorkItemGraph): DeliveryMarkdownPort
```

**Returns:** `DeliveryMarkdownPort` — The default port is created once per request from the repo and the graph. It lists the work-item folders once with path-scheme listWorkItems (docs/epics and docs/standalone, each folder named <slug>-<epicSegment>) and locates a record's markdown from the graph, not from the record's own meta, because most BUILD and CR records stamp no epicSlug or epicCreatedAt (BUILD-2ff0dfdadb1c8d1c-s1 has only epicHash, storyId and createdAt): the item that holds the record (a story for LLD, PLAN, BUILD, CR and EXT; the epic or issue for SPEC, DEF, HLD and ISSUE) gives the epic segment (the canonical id before any ':') and, for a story, its S<nnn> folder; the folder whose name ends in '-<epicSegment>' is the root, and the path is <root>/[S<nnn>/]<KIND>.md, absolute, as workflow.pending reports mdPath. Only when no folder matches (for example an H-form id) does it fall back to deriveMdPath from the record's meta, exported from pending.ts with its kind parameter widened to path-scheme's ArtifactKind, mapping '' to null. AMD records give null. It returns null when the file does not exist or does not resolve, lexically and by realpath, under the repo's docs/ tree; otherwise it reads at most the first 512 bytes and sets hasMarker when the first line is '<!-- insrc:artifact <artifactId> -->'. A read error gives null. It never writes.

### 2.4 `workflow.deliveryEvidence (DeliveryEvidenceRequest -> DeliveryEvidenceResponse)`

```typescript
export function handleDeliveryEvidence(params: DeliveryEvidenceRequest | undefined, repoEnv: string | undefined, deps?: DeliveryDeps): DeliveryEvidenceResponse
```

**Parameters:**
- `params: DeliveryEvidenceRequest | undefined` _(optional)_ — { repo?, artifactId }.
- `repoEnv: string | undefined` — The INSRC_REPO fallback.
- `deps: DeliveryDeps` _(optional)_ — Test seams, as for handleDelivery.

**Returns:** `DeliveryEvidenceResponse` — repo resolved as for handleDelivery, else { error: 'workflow.deliveryEvidence: `repo` is required' }. artifactId must be a string matching ^(SPEC|DEF|HLD|LLD|PLAN|BUILD|CR|ISSUE|EXT|AMD)-[0-9a-f]{16}(-[A-Za-z0-9]+)?$, else { error: 'invalid artifact id' }. The file <artifactId>.json is joined under the repo's artifact store; a path that does not exist gives { error: 'not found' }, and one whose realpath falls outside the store's realpath gives { error: 'invalid artifact id' }. The file is parsed and lifted with load.ts liftStoreFile, so an AMD reads as meta (every top-level field except amendment) and body (the amendment); a file that cannot be read, parsed or lifted gives { error: 'workflow.deliveryEvidence: <artifactId> cannot be read: <detail>' }. renderedMarkdown is the markdown the default port (createMarkdownPort over a graph built from one store read) locates for the record, read through the same docs/ containment rule as workflow.artifactContent (resolveDocsMarkdown, shared with it), or null when there is none; a marker-less file is still returned. kind from the lifted record. Never throws, never writes.

**Postconditions:**
- Only files under the repo's artifact store and docs/ tree are read.

### 2.5 `DeliveryItem / DeliveryEvidenceEntry / DeliveryEvidenceRecord / DeliveryError (the sc7 types)`

```typescript
type DeliverySnapshotResponse = DeliverySnapshot | DeliveryError; type DeliveryEvidenceResponse = DeliveryEvidenceRecord | DeliveryError
```

**Returns:** `sc7` — Exactly the HLD sc7 sketch: DeliverySnapshotRequest, DeliveryEvidenceEntry, DeliveryItem, DeliverySnapshot, DeliveryEvidenceRequest, DeliveryEvidenceRecord, DeliveryError and the two response unions, in src/workflow/delivery/types.ts, which stays type-only apart from DeliveryStoreUnreadableError so the VS Code plugin imports it as it imports pending.ts. The mirror: vscode-plugin/src/delivery/delivery-contract.ts imports these types by relative path and is compiled by vscode-plugin/tsconfig.delivery-contract.json (extending the plugin's tsconfig, including only that file); src/workflow/delivery/__tests__/fixtures/delivery-snapshot.sample.json is a plain-JSON snapshot the JetBrains plugin's Gson parser reads by field name and the insrc-ide fork can copy; a test keeps the sample equal to what assembleSnapshot produces from its fixture. The Kotlin parse test itself belongs to the JetBrains client epic (E3).

**Postconditions:**
- schemaVersion is 1; a breaking change to the shape raises it.

## 3. Data model changes

### 3.1 `DeliverySnapshotRequest, DeliveryEvidenceEntry, DeliveryItem, DeliverySnapshot, DeliveryEvidenceRequest, DeliveryEvidenceRecord, DeliveryError, DeliverySnapshotResponse, DeliveryEvidenceResponse, DeliveryMarkdownPort, DeliveryDeps` — new

The sc7 types and the two seams, added to src/workflow/delivery/types.ts beside sc1-sc6.

**Call sites:**
- `src/workflow/delivery/types.ts`

### 3.2 `assembleSnapshot, handleDelivery, handleDeliveryEvidence, createMarkdownPort` — new

New modules src/workflow/delivery/snapshot.ts (the pure assembler) and src/workflow/delivery/handlers.ts (the two handlers, createMarkdownPort and the request log line through getLogger('delivery')). They import loadArtifactRecordSet / liftStoreFile, buildWorkItemGraph, deriveStages, deriveGates, deriveCurrency, makeNotice / sortNotices, listWorkItems from path-scheme.ts, deriveMdPath from pending.ts and resolveDocsMarkdown from artifact-content.ts.


### 3.3 `deriveMdPath (pending.ts), resolveDocsMarkdown (artifact-content.ts)` — new

Additive exports so the delivery handlers reuse, not copy, the md-path derivation and the docs/ containment rule. deriveMdPath is the existing private function, exported with its kind parameter widened from PendingKind to path-scheme's ArtifactKind (an additive change: every PendingKind is an ArtifactKind, so workflow.pending's calls are unchanged); the delivery port uses it only as a fallback. resolveDocsMarkdown is the lexical-plus-realpath containment check now inside handleArtifactContent, extracted into an exported helper that handleArtifactContent calls with the same error messages, so workflow.pending and workflow.artifactContent behave exactly as before.

**Call sites:**
- `src/workflow/pending.ts`
- `src/workflow/artifact-content.ts`

### 3.4 `'workflow.delivery' and 'workflow.deliveryEvidence' handler entries` — new

Two entries in the daemon handler map in src/daemon/index.ts, beside 'workflow.pending', each lazy-importing ../workflow/delivery/handlers.js and passing (params, process.env['INSRC_REPO']). No existing entry changes.

**Call sites:**
- `src/daemon/index.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc7` | implements | Defines and serves both IPC methods and their types. |
| `sc1` | consumes | Reads the store once per snapshot request through loadArtifactRecordSet; lifts one evidence file with liftStoreFile. |
| `sc2` | consumes | Items, root ids, evidence and graph notices. |
| `sc3` | consumes | Merges and sorts every pass's notices and raises the completeness incomplete-evidence notice through makeNotice. |
| `sc4` | consumes | Each story's and issue's stage and route; the route decides the completeness check. |
| `sc5` | consumes | Per-record approval and review, per-item task results, conflict and attention reasons. |
| `sc6` | consumes | Per-record review currency and each epic's amendments. |

## 5. Error paths

**Error cases**

- **Neither params.repo nor INSRC_REPO names a repository.** (recoverable)
  - Detection: The resolved repo string is empty.
  - Response: { error: 'workflow.delivery: `repo` is required' } (or the workflow.deliveryEvidence equivalent).
  - User impact: The client shows the daemon's message, as for workflow.pending.
- **The artifact store directory exists but cannot be listed.** (recoverable)
  - Detection: loadArtifactRecordSet throws DeliveryStoreUnreadableError.
  - Response: { error: 'workflow.delivery: <message>' } naming the store path; never an empty snapshot.
  - User impact: The view says the store cannot be read instead of showing nothing.
- **A pass or the assembler throws unexpectedly.** (recoverable)
  - Detection: A try/catch around the whole request in handleDelivery.
  - Response: { error: 'workflow.delivery: <message>' }; the handler never throws to the socket.
  - User impact: A structured error instead of a dropped connection.
- **workflow.deliveryEvidence receives an id that is not a string, does not match the artifact-id pattern, or contains path separators or '..'.** (recoverable)
  - Detection: The anchored pattern test before any path is built.
  - Response: { error: 'invalid artifact id' }; no file is opened.
  - User impact: No path outside the store can be named.
- **A matching id whose JSON does not exist, or whose realpath leaves the store (a symlink).** (recoverable)
  - Detection: realpathSync throws ENOENT, or the realpath is not under the store's realpath.
  - Response: { error: 'not found' } for a missing file; { error: 'invalid artifact id' } for an escape.
  - User impact: The client can tell a missing record from a refused one.
- **The evidence JSON cannot be read, parsed or lifted.** (recoverable)
  - Detection: readFileSync / JSON.parse throws, or liftStoreFile returns a RecordLoadFailure.
  - Response: { error: 'workflow.deliveryEvidence: <artifactId> cannot be read: <detail>' }.
  - User impact: The client shows why the record cannot be opened.
- **A record's markdown is missing, unreadable, or resolves outside docs/.** (recoverable)
  - Detection: The port's existence, lexical and realpath containment checks, and a caught read error.
  - Response: The snapshot entry gets mdPath null and openWith 'evidence-read'; deliveryEvidence returns renderedMarkdown null with the record.
  - User impact: The record is still readable through deliveryEvidence; nothing invented.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repo whose artifact store directory does not exist. | A snapshot with recordCount 0, unreadableCount 0, no items, all count keys present with 0. |
| The same store requested twice with the same now, including two work items whose records share one createdAt. | Deep-equal snapshots: same items in the same order, same notices, same counts. |
| A BUILD whose BUILD.md has no insrc:artifact marker (the older shape). | Its evidence entry has openWith 'evidence-read' and its mdPath; deliveryEvidence returns its meta, body and the marker-less markdown. |
| A record whose markdown first line is the marker of a different artifact. | openWith 'evidence-read'. |
| An AMD record. | mdPath null, openWith 'evidence-read'; deliveryEvidence returns the flat record lifted as meta and body. |
| A full-chain (or feature, or sized-bugfix) story with a BUILD and no PLAN. | One incomplete-evidence notice on the story naming its BUILD. |
| A small, small-bugfix or trivial story with a BUILD and no PLAN. | No completeness notice. |
| A notice naming two items. | It appears in both items' notices; a notice naming no item appears only in the snapshot's store-level notices. |
| An item whose only attention signal is an identity-ambiguous notice naming it (record-unreadable is store-level and names no item). | needsAttention true; attentionReasons ['identity-ambiguous']. |
| A task item. | stage null, tasks [], validation null; needsAttention only from notices naming it. |
| A store of 1,000 records forming 500 work items. | handleDelivery with the real markdown port returns within 500 ms (best of three runs). |
| A real-shaped BUILD record with only epicHash, storyId and createdAt (no epicSlug, no epicCreatedAt) under an epic whose folder is docs/epics/<slug>-E<date><hash8>/. | Its mdPath is <folder>/S<nnn>/BUILD.md, found through the graph and listWorkItems; deliveryEvidence returns that file's markdown. |
| A story with an approved BUILD and a failed task (an sc5 validation-conflict reason and a validation-conflict notice naming it). | attentionReasons ['validation-failed', 'validation-conflict'], each once. |

## 6. Test strategy

**Test framework:** `node:test via `npx tsx --test` (node:assert/strict), over fabricated records from src/workflow/delivery/__tests__/fixtures.ts and real temporary repositories`

**Test levels**

- **unit** — The pure assembler.
  - Subjects: `snapshot.test.ts: 'every work item is joined with its stage, evidence, gates, currency and notices'`, `snapshot.test.ts: 'two snapshots of the same store, with equal timestamps, are identical in order and counts'`, `snapshot.test.ts: 'needsAttention comes from a gate reason or an attention notice, each reason listed once, and store-level notices stay off items'`, `snapshot.test.ts: 'a full-chain, feature or sized-bugfix story with a build and no plan gets incomplete-evidence, and small, small-bugfix and trivial stories do not'`
- **integration** — The two handlers over real temporary repositories.
  - Subjects: `handlers.test.ts: 'workflow.delivery returns one timestamped snapshot and leaves the store, docs and git untouched'`, `handlers.test.ts: 'workflow.deliveryEvidence reads a marker-less build record through the daemon'`, `handlers.test.ts: 'workflow.deliveryEvidence refuses an invalid or escaping id and reports a missing one'`, `handlers.test.ts: 'an unresolved repo or an unreadable store is an error and an absent store is an empty snapshot'`, `handlers.test.ts: 'a 1,000-record store forming 500 work items is served within 500 ms'`, `artifact-content.test.ts and pending.test.ts: the existing workflow.artifactContent and workflow.pending tests, unchanged`, `handlers.test.ts: 'resolveDocsMarkdown keeps workflow.artifactContent's containment errors word for word'`, `handlers.test.ts: 'a build record that stamps no epic slug or date is located through its work item's folder'`
  - Fixtures: `A temporary git repository with an artifact store, rendered markdown under docs/ (one BUILD.md without a marker) and one commit, snapshotted by path, size, mtime and content hash, including .git, before and after a request.`, `A generated store, read through the real markdown port, of 100 epics (DEF and HLD) with four stories each (LLD and an empty-task PLAN): 1,000 records, 500 work items.`
- **contract** — The published shape for the client mirrors.
  - Subjects: `contract.test.ts: 'the VS Code plugin type-checks against the published delivery types'`, `contract.test.ts: 'the JetBrains sample snapshot is plain JSON and equals what the assembler produces'`
  - Fixtures: `vscode-plugin/src/delivery/delivery-contract.ts and vscode-plugin/tsconfig.delivery-contract.json, compiled with npx tsc -p.`, `src/workflow/delivery/__tests__/fixtures/delivery-snapshot.sample.json, assembled from fixed records, a fixed time and a fixed markdown port.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `handlers.test.ts: 'workflow.delivery returns one timestamped snapshot and leaves the store, docs and git untouched'`, `snapshot.test.ts: 'every work item is joined with its stage, evidence, gates, currency and notices'` |
| `ac2` | `snapshot.test.ts: 'two snapshots of the same store, with equal timestamps, are identical in order and counts'` |
| `ac3` | `handlers.test.ts: 'workflow.deliveryEvidence reads a marker-less build record through the daemon'`, `handlers.test.ts: 'a build record that stamps no epic slug or date is located through its work item's folder'` |
| `ac4` | `handlers.test.ts: 'a 1,000-record store forming 500 work items is served within 500 ms'` |
| `ac5` | `artifact-content.test.ts and pending.test.ts: the existing workflow.artifactContent and workflow.pending tests, unchanged`, `handlers.test.ts: 'resolveDocsMarkdown keeps workflow.artifactContent's containment errors word for word'` |
| `ac6` | `contract.test.ts: 'the VS Code plugin type-checks against the published delivery types'`, `contract.test.ts: 'the JetBrains sample snapshot is plain JSON and equals what the assembler produces'` |

## 7. Alternatives considered

### 7.1 a1: Pure snapshot assembler plus two thin handlers — **CHOSEN**

A pure assembleSnapshot joins the record set, graph and three annotations; handleDelivery and handleDeliveryEvidence resolve the repo, read the store once, map errors, and are registered as two lazy-import handler-map entries.

The sc7 types join types.ts. A new src/workflow/delivery/snapshot.ts exports assembleSnapshot(recordSet, graph, stages, gates, currency, markdown): DeliverySnapshot, where markdown is a read-only port that maps an artifact to its rendered .md path and says whether the file starts with its insrc:artifact marker. It joins annotations onto every item, adds the route-dependent incomplete-evidence notice (full-chain / feature / sized-bugfix story with a BUILD and no PLAN), decides needsAttention from sc5 reasons and attention-true notices, counts, and sorts. A new src/workflow/delivery/handlers.ts exports handleDelivery(params, repoEnv) and handleDeliveryEvidence(params, repoEnv) following handleWorkflowPending: repo from params else INSRC_REPO, one loadArtifactRecordSet, the four passes, the assembler, a log line, and { error } for an unresolved repo or an unreadable store; the evidence handler validates the id pattern, realpath-checks the JSON under the store, and reads the markdown through the same docs/ containment rule as workflow.artifactContent. Two entries in src/daemon/index.ts lazy-import handlers.ts. The ac6 mirror is a type-only consumer file under vscode-plugin/src compiled by its existing tsc build, and a JSON snapshot fixture the JetBrains plugin can parse.

### 7.2 a2: Inline handlers in the daemon

Assemble the snapshot directly inside the two daemon handler entries.

Put repo resolution, the passes and the join inside the 'workflow.delivery' and 'workflow.deliveryEvidence' closures in src/daemon/index.ts.

**Rejected because:** Untestable outside the daemon; departs from the named idiom.

### 7.3 a3: Cached snapshot invalidated by the file watcher

Keep the last snapshot per repo and rebuild it when the artifact store changes.

Hold a per-repo snapshot in daemon memory and invalidate it from the existing file watcher on writes under .insrc/artifacts.

**Rejected because:** Violates the HLD durability rule (nothing cached).

## 8. References

- **[[c1]]** `code` `src/workflow/pending.ts` — "export function handleWorkflowPending("
- **[[c2]]** `code` `src/workflow/artifact-content.ts` — "export function handleArtifactContent("
- **[[c3]]** `code` `src/daemon/index.ts` — "'workflow.pending': async (params) => {"
- **[[c4]]** `code` `src/workflow/delivery/load.ts` — "export function loadArtifactRecordSet("
- **[[c5]]** `code` `src/workflow/path-scheme.ts` — "export function resolveArtifactMdPath("
- **[[c6]]** `code` `vscode-plugin/src/chat/docs-review-client.ts` — "import type { PendingArtifact } from '../../../src/workflow/pending.js';"
- **[[c7]]** `prior-artifact` `HLD-2ff0dfdadb1c8d1c sc7 Delivery IPC contract and the s5 story boundary`
- **[[c8]]** `code` `src/workflow/path-scheme.ts` — "export function listWorkItems(repoPath: string): readonly WorkItemLocation[] {"
- **[[c9]]** `code` `.insrc/artifacts/BUILD-2ff0dfdadb1c8d1c-s1.json` — ""storyId": "s1""

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 1 could not be verified · 15 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-08T16:16:58.718Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| tests | The 500 ms budget for ac4 can be met with the real markdown port (one listWorkItems plus up to 1,000 realpath + 512-byte reads) on the reference environment. | No benchmark of loadArtifactRecordSet + the four passes + per-record realpath/read exists in the repo to compare against; the DEF says only 'the agreed time budget', and I did not find where 500 ms was agreed. Timing depends on the machine running the test. | Confirm 500 ms is the agreed k6 budget, and keep the best-of-three timing so the test is not flaky on slow CI. |

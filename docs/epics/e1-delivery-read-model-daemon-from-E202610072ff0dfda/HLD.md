<!-- insrc:artifact HLD-2ff0dfdadb1c8d1c -->

# HLD: e1-delivery-read-model-daemon-from

## Summary

The delivery view is computed fresh by the daemon on every request: it reads the whole artifact store once, builds one graph of work items from it, and lets three independent passes add each item's stage, its approval/review/validation signals, and its record-currency and data-quality notices. A final step assembles those into one ordered, timestamped snapshot that clients fetch over a single read-only IPC method, with a second method to read any one evidence record. Nothing is cached or written, so every response describes exactly one reading of the store.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Diagrams](#4-diagrams)
5. [Shared contracts](#5-shared-contracts)
6. [Story boundaries](#6-story-boundaries)
7. [Non-functional targets](#7-non-functional-targets)
8. [Rollout](#8-rollout)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)

## 1. Problem context

> See **DEF-2ff0dfdadb1c8d1c** § 1. Problem

## 2. Framework summary

A stateless, read-only projection pipeline in a new src/workflow/delivery module, beside pending.ts and artifact-content.ts. One request performs one read of every JSON record under the artifact store into an immutable record set (sc1), keeping unreadable files as load failures instead of throwing. The identity pass (s1) turns that record set into a work-item graph (sc2) of epics, stories, tasks and issues under the canonical work-item identity, with every item's evidence records attached. Three passes then run independently over the same graph and record set, each producing an annotation keyed by work-item or artifact id: route-aware stage with its reason (s2, sc4), gate signals and the gate-based attention reasons (s3, sc5), and record currency, amendment/extension checks and data-quality notices (s4, sc6). All three report problems through the one notice shape s1 owns (sc3). The snapshot step (s5) merges graph and annotations into the published response (sc7), computes counts and the final Needs-attention flag, sorts everything deterministically, and stamps the read time. The daemon exposes it as two new handler-map entries that lazy-import the module, following the workflow.pending idiom; no existing handler changes.

## 3. Architecture shape

Data flows one way through four layers. Layer 1, load (s1): list the artifact store directory, parse each JSON record, and lift the facts every later pass needs into a uniform record (artifact id and kind, the raw work-item keys, the approval state, createdAt and epicCreatedAt, and the untouched meta and body). The lift is per kind: every kind is read as { meta, body } except amendment records, which are flat and carry their own status and approval timestamps at the top level. Layer 2, graph (s1): group records into work items by work-item hash and story ordinal first, then mint each item's canonical id from the work item's anchor date (the definition head's createdAt, else a recorded epicCreatedAt), so records written on different days never split one story; source story membership from the Define's stories and from accepted extension records, attach issues' fix stories through the shared work-item hash and issues' corrected parent through meta.parentRef, nest tasks under their story by plan and build task ids, and flag what identity cannot settle. Layer 3, annotate (s2, s3, s4 in parallel branches of the story graph): each pass reads only sc1 and sc2, never the disk, and returns its own annotation map plus notices; none reads another's output, so they can be built and tested independently. Layer 4, assemble (s5): join annotations onto items, fold notices into per-item and store-level lists, decide needsAttention as any gate attention reason from sc5 or any notice marked attention, compute stage and attention counts over the full item set, sort items by canonical id and notices by code then artifact id, and return the snapshot with its read timestamp.

The IPC surface is two additive methods. workflow.delivery returns the whole snapshot for a repository. workflow.deliveryEvidence returns one evidence record, by artifact id, as its structured meta and body plus its rendered markdown when one exists; the id is validated against the artifact-id pattern and resolved only inside the artifact store, so clients never pass paths. Both handlers resolve the repository from params or the workspace fallback and return a structured { error } on failure, never an empty success. A repository with no artifact store yet returns an empty snapshot, as workflow.pending does; an unreadable store, an invalid evidence id or an unknown evidence id returns { error }. The response types live in one type-only file, named with a Delivery prefix (DeliveryArtifactKind, DeliveryItemKind) so they never collide with path-scheme.ts's existing ArtifactKind and WorkItemKind; the VS Code plugin imports them directly, and the JetBrains plugin and the insrc-ide fork mirror them field for field.

## 4. Diagrams

- [ER model](docs/epics/e1-delivery-read-model-daemon-from-E202610072ff0dfda/er-model.html)

## 5. Shared contracts

### 5.1 sc1: ArtifactRecordSet

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** One immutable reading of the artifact store: every parsed record with the facts all passes share, plus every file that could not be read. The single source every later layer reads, so no pass re-reads the disk and all passes see the same records.

**Interface sketch (type-level):**

```
type DeliveryArtifactKind = 'SPEC' | 'DEF' | 'HLD' | 'LLD' | 'PLAN' | 'BUILD' | 'CR' | 'ISSUE' | 'EXT' | 'AMD';

type ApprovalState = 'approved' | 'rejected' | 'pending';

interface ArtifactRecord {
  readonly artifactId: string;              // file stem, e.g. 'LLD-<hash>-s1'
  readonly kind: DeliveryArtifactKind;
  readonly workItemHash: string | null;     // meta.epicHash; meta.issueHash for an ISSUE; meta.specHash for a SPEC; top-level epicHash for an AMD
  readonly storyIdRaw: string | null;       // meta.storyId exactly as written
  readonly storyOrdinal: number | null;     // canonical ordinal of storyIdRaw, null when absent or unparseable
  readonly approval: { readonly state: ApprovalState; readonly approvedAt: string | null; readonly rejectedAt: string | null };
                                            // meta.approvedAt / meta.rejectedAt; for an AMD, top-level approvedAt / rejectedAt / status
  readonly createdAt: string | null;        // meta.createdAt; top-level proposedAt for an AMD
  readonly epicCreatedAt: string | null;    // meta.epicCreatedAt when stamped
  readonly meta: Readonly<Record<string, unknown>>;   // the record's meta; for a flat AMD, every top-level field except `amendment`
  readonly body: unknown;                             // the record's body; for a flat AMD, its `amendment` object
}

// Per-kind lift: every kind except AMD is read as { meta, body }; AMD records are flat
// ({ id, epicHash, amendment, status, approvedAt?, rejectedAt?, ... }) and are lifted as described above.
// A non-AMD file without meta is a 'missing-meta' load failure.

interface RecordLoadFailure {
  readonly fileName: string;
  readonly reason: 'unreadable' | 'invalid-json' | 'missing-meta' | 'unknown-kind';
  readonly detail: string;
}

interface ArtifactRecordSet {
  readonly repo: string;
  readonly readAt: string;                  // ISO time the directory was listed
  readonly records: readonly ArtifactRecord[];   // sorted by artifactId
  readonly failures: readonly RecordLoadFailure[]; // sorted by fileName
}
```

**Assumptions cited:** [[c18]] [[c4]]

### 5.2 sc2: WorkItemGraph

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** The identity and hierarchy of all work: each epic, story, task and issue exactly once under its canonical id, with parent/child links, the source ids it was joined from, and the artifacts that are its evidence.

**Interface sketch (type-level):**

```
type DeliveryItemKind = 'epic' | 'story' | 'task' | 'issue';

interface WorkItemNode {
  readonly id: string;                      // canonical work-item id, e.g. 'E20261007<hash8>:S001', ':T002' for tasks; issue id for an issue
                                            // Records are grouped by workItemHash + storyOrdinal BEFORE the id is minted. The id's date segment
                                            // is the work item's anchor date: the definition head's (DEF-/ISSUE-<hash>) createdAt when one exists;
                                            // otherwise workItemAnchorCreatedAt (meta.epicCreatedAt ?? meta.createdAt, storage.ts:181) of the
                                            // group's earliest-created design head (LLD, else SPEC or BUILD for routes without one). The minted id
                                            // must equal deriveWorkItemIdentity's output and the work item's existing path-scheme folder whenever
                                            // those can be derived. Only when no record of the group has any createdAt is the id
                                            // 'H<workItemHash>[:S<nnn>]', with an 'identity-anchor-missing' notice.
  readonly kind: DeliveryItemKind;
  readonly title: string | null;            // null when no record names it
  readonly workItemHash: string | null;
  readonly standalone: boolean;
  readonly sourceIds: readonly string[];    // every raw id joined into this item, e.g. ['s1', 'S001']
  readonly parentId: string | null;
  readonly childIds: readonly string[];     // sorted
  readonly evidenceArtifactIds: readonly string[]; // sorted; artifacts whose identity resolves to this item
  readonly plannedTaskIds: readonly string[];      // stories only: task ids from the PLAN
                                                   // Task items are minted only from t<n> ids (taskIdToOrdinal); a build task id equal to the
                                                   // story's own id is a story-level result, creates no task item and raises no notice
  readonly correctsRef: { readonly epicHash?: string; readonly storyId?: string; readonly slug?: string; readonly resolvedItemId: string | null } | null;
                                            // issues only, from meta.parentRef; resolved by epicHash, else by slug against records' meta.epicSlug,
                                            // EXCLUDING records that share the issue's own hash (the issue and its fix stories). A parentRef that
                                            // names only the issue itself means 'no corrected parent': correctsRef is null and no notice is raised.
  readonly seededFromSpecId: string | null; // 'SPEC-' + meta.seededFromSpec (which holds the bare 16-char spec hash); matched against
                                            // the SPEC record's artifactId, and that SPEC is then in this item's evidence
}

interface WorkItemGraph {
  readonly items: ReadonlyMap<string, WorkItemNode>;
  readonly rootIds: readonly string[];      // epics, standalone stories, issues; sorted
  readonly notices: readonly DeliveryNotice[];  // identity notices (sc3)
}
```

**Assumptions cited:** [[c6]] [[c7]]

### 5.3 sc3: DeliveryNotice

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** The one shape every pass uses to report missing, malformed, ambiguous or contradictory evidence, so notices from identity, stage, gate and currency passes can be merged, sorted and counted uniformly. Owned at the root story because s2, s3 and s4 sit on separate branches and all emit notices.

**Interface sketch (type-level):**

```
type NoticeCode =
  | 'record-unreadable'          // s1: a file in the store could not be loaded
  | 'identity-ambiguous'         // s1: records the canonical rule cannot settle as same or different
  | 'unresolved-parent'          // s1: an issue's corrected parent, or a record's epic, is not in the store
  | 'identity-anchor-missing'    // s1: no recorded date at all to mint the canonical id; hash form used
  | 'unattached-spec'            // s1: a SPEC that no work item names as its seededFromSpec (store-level, attention false)
  | 'unknown-route'              // s2: no recorded route for an item that needs one
  | 'review-without-build'       // s2: a code review exists with no build record
  | 'unplanned-task'             // s3: a build task with no matching planned task
  | 'validation-conflict'        // s3: completion approved while a task failed
  | 'incomplete-evidence'        // s4 (missing fields), s5 (a plan missing on a route that requires one): expected evidence absent
  | 'review-currency-unknown'    // s4: no recorded field settles whether a review is current
  | 'base-predates-extension';   // s4: an accepted extension is newer than the epic framing

interface DeliveryNotice {
  readonly code: NoticeCode;
  readonly message: string;
  readonly itemIds: readonly string[];      // sorted; empty for store-level notices
  readonly artifactIds: readonly string[];  // sorted
  readonly fileNames: readonly string[];    // sorted; for unreadable files that have no artifact id
  readonly attention: boolean;              // true when this notice alone makes an item need attention
}

// attention by code (fixed): true for 'record-unreadable', 'identity-ambiguous', 'unresolved-parent', 'validation-conflict';
// false for 'identity-anchor-missing', 'unattached-spec', 'unknown-route', 'review-without-build', 'unplanned-task',
// 'incomplete-evidence', 'review-currency-unknown', 'base-predates-extension'. Unresolved references therefore count toward
// Needs attention (S003:FR005); informational notices stay visible without flooding the filter.
```

### 5.4 sc4: StageAnnotation

**Owner Story:** `s2`
**Consumed by:** `s5`

**Purpose:** Each story's and issue's derived stage, the route that decided its ready gate, and the reason naming the evidence behind it.

**Interface sketch (type-level):**

```
type DeliveryStage =
  | 'scoped'
  | 'design-plan'
  | 'ready-design-approved'
  | 'ready-plan-approved'
  | 'build-recorded'
  | 'complete';

type DeliveryRoute = 'full-chain' | 'feature' | 'small' | 'small-bugfix' | 'sized-bugfix' | 'trivial' | 'unknown';

interface StageAnnotation {
  readonly itemId: string;
  readonly stage: DeliveryStage;
  readonly route: DeliveryRoute;
  readonly reason: { readonly text: string; readonly artifactIds: readonly string[] };
}

interface StagePassResult {
  readonly stages: ReadonlyMap<string, StageAnnotation>;  // keyed by itemId; stories and issues only
  readonly notices: readonly DeliveryNotice[];
}
```

**Assumptions cited:** [[c12]]

### 5.5 sc5: GateAnnotation

**Owner Story:** `s3`
**Consumed by:** `s5`

**Purpose:** Per-artifact approval and review facts, per-task validation results, the approved-but-failed conflict, and the gate-based attention reasons with the attention rule that was applied.

**Interface sketch (type-level):**

```
type ReviewVerdict = 'pass' | 'warn' | 'block';

// Per-kind review read: DEF/HLD/LLD/PLAN/SPEC/ISSUE/EXT use meta.review (+ meta.reviewResolutions, meta.reviewOverride);
// a CR record is itself a review and uses body.verdict, body.counts and meta.reviewedBy. A CR is its own evidence entry
// on its story; a BUILD's entry does not absorb the CR verdict.
interface ArtifactGate {
  readonly artifactId: string;
  readonly approval: { readonly state: 'approved' | 'rejected' | 'pending'; readonly at: string | null };
  readonly review: {
    readonly verdict: ReviewVerdict;
    readonly reviewedAt: string;          // meta.review.reviewedAt for design artifacts; meta.createdAt for a CR record
    readonly reviewedBy: 'controller' | 'daemon' | null;
    readonly counts: { readonly high: number; readonly med: number; readonly low: number };
    readonly override: { readonly reason: string; readonly at: string | null } | null;   // meta.reviewOverride
    readonly resolvedFindings: number;    // HIGH/MED findings with an entry in meta.reviewResolutions
    readonly effectiveVerdict: ReviewVerdict;  // design artifacts: 'block' when effectiveReviewVerdict(meta.review, meta.reviewResolutions)
                                               //   (review/resolve.ts) returns 'block', otherwise the recorded meta.review.verdict, so a recorded
                                               //   'warn' stays 'warn'; CR records: body.verdict (no per-finding resolutions)
    readonly blocking: boolean;           // effectiveVerdict === 'block' AND artifact unapproved AND no override
  } | null;
}

type TaskResult = 'passed' | 'failed' | 'unrecorded';

interface TaskValidation {
  readonly taskItemId: string;
  readonly result: TaskResult;
  readonly planned: boolean;               // false for a build-only task
}

type AttentionReason = 'pending-decision' | 'rejected' | 'review-blocked' | 'validation-failed' | 'validation-conflict';
// 'validation-failed' is raised by a failed task result or a failed storyLevelResult alike.

interface ItemGates {
  readonly itemId: string;
  readonly tasks: readonly TaskValidation[];     // sorted by taskItemId
  readonly validation: { readonly passed: number; readonly failed: number; readonly unrecorded: number; readonly unplanned: number };
  readonly storyLevelResult: TaskResult | null;  // a build result recorded against the story itself (body.tasks[].id equal to the
                                                 //   story id, as standalone builds without a plan record it); not a task, not unplanned
  readonly conflict: { readonly failedTaskItemIds: readonly string[]; readonly storyLevelFailed: boolean } | null;
                                                 // set when the BUILD is approved and any task result OR the storyLevelResult is 'failed'
  readonly attentionReasons: readonly AttentionReason[];
  readonly attentionRule: string;          // the rule applied, e.g. superseded pending artifacts excluded
}

interface GatePassResult {
  readonly artifacts: ReadonlyMap<string, ArtifactGate>;   // keyed by artifactId
  readonly items: ReadonlyMap<string, ItemGates>;          // keyed by itemId
  readonly notices: readonly DeliveryNotice[];
}
```

**Assumptions cited:** [[c4]] [[c13]]

### 5.6 sc6: CurrencyAnnotation

**Owner Story:** `s4`
**Consumed by:** `s5`

**Purpose:** Whether each recorded review is known to still match its artifact, which record applies where several could, each epic's amendments with their status and whether they count toward the effective HLD, and the data-quality notices for missing evidence and extensions newer than their epic framing.

**Interface sketch (type-level):**

```
type ReviewCurrency = 'current' | 'stale' | 'unknown';

interface ArtifactCurrency {
  readonly artifactId: string;
  readonly reviewCurrency: ReviewCurrency | null;   // null when the artifact has no review
  readonly basis: string | null;                    // the recorded field that settled it, null when unknown
}

interface EffectiveAmendment {
  readonly amendmentId: string;                     // e.g. 'AMD-<hash>-1'
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly type: string | null;                     // the amendment's recorded type, e.g. 'storyBoundary.addStory'
  readonly storyId: string | null;
  readonly appliesToHld: boolean;                   // approved and counted in the epic's effective HLD
}

interface CurrencyPassResult {
  readonly artifacts: ReadonlyMap<string, ArtifactCurrency>;  // keyed by artifactId
  readonly amendments: ReadonlyMap<string, readonly EffectiveAmendment[]>;  // keyed by epic itemId; sorted by amendmentId
  readonly notices: readonly DeliveryNotice[];
}
```

**Assumptions cited:** [[c23]]

### 5.7 sc7: Delivery IPC contract (workflow.delivery, workflow.deliveryEvidence)

**Owner Story:** `s5`

**Purpose:** The published, mirrored request and response shapes for the snapshot and for reading one evidence record. This is the shape E2 and E3 depend on; it is fixed here and versioned by schemaVersion.

**Interface sketch (type-level):**

```
// method 'workflow.delivery'
interface DeliverySnapshotRequest { readonly repo?: string }

interface DeliveryEvidenceEntry {
  readonly artifactId: string;
  readonly kind: DeliveryArtifactKind;
  readonly mdPath: string | null;           // rendered markdown under docs/ when one exists
  readonly openWith: 'review-view' | 'evidence-read';  // review-view when the markdown carries the artifact marker
  readonly approval: { readonly state: 'approved' | 'rejected' | 'pending'; readonly at: string | null };
  readonly review: ArtifactGate['review'];
  readonly reviewCurrency: ReviewCurrency | null;
}

interface DeliveryItem {
  readonly id: string;
  readonly kind: DeliveryItemKind;
  readonly title: string | null;
  readonly standalone: boolean;
  readonly sourceIds: readonly string[];
  readonly parentId: string | null;
  readonly childIds: readonly string[];
  readonly stage: { readonly stage: DeliveryStage; readonly route: DeliveryRoute; readonly reason: { readonly text: string; readonly artifactIds: readonly string[] } } | null; // null for epics and tasks
  readonly evidence: readonly DeliveryEvidenceEntry[];   // sorted by artifactId
  readonly tasks: readonly TaskValidation[];             // stories only
  readonly validation: ItemGates['validation'] | null;
  readonly storyLevelResult: ItemGates['storyLevelResult'];
  readonly conflict: ItemGates['conflict'];
  readonly correctsRef: WorkItemNode['correctsRef'];
  readonly amendments: readonly EffectiveAmendment[];    // epics only; empty otherwise
  readonly notices: readonly DeliveryNotice[];
  readonly needsAttention: boolean;
  readonly attentionReasons: readonly (AttentionReason | NoticeCode)[];
}

interface DeliverySnapshot {
  readonly schemaVersion: 1;
  readonly repo: string;
  readonly takenAt: string;                 // ISO time the store was read
  readonly recordCount: number;
  readonly unreadableCount: number;
  readonly items: readonly DeliveryItem[];  // sorted by id
  readonly rootIds: readonly string[];
  readonly notices: readonly DeliveryNotice[];  // store-level, sorted by code then artifactIds
  readonly counts: {
    readonly items: Readonly<Record<DeliveryItemKind, number>>;
    readonly byStage: Readonly<Record<DeliveryStage, number>>;
    readonly needsAttention: number;
  };
  readonly attentionRule: string;
}

// method 'workflow.deliveryEvidence'
interface DeliveryEvidenceRequest { readonly repo?: string; readonly artifactId: string }

interface DeliveryEvidenceRecord {
  readonly artifactId: string;
  readonly kind: DeliveryArtifactKind;
  readonly meta: Readonly<Record<string, unknown>>;
  readonly body: unknown;
  readonly renderedMarkdown: string | null;
}

interface DeliveryError { readonly error: string }

// Error paths:
//   repo unresolved                       -> { error }
//   artifact store directory absent       -> a snapshot with recordCount 0 and no items (success, as workflow.pending treats an absent store)
//   artifact store present but unreadable -> { error }
//   deliveryEvidence: id not matching ^(SPEC|DEF|HLD|LLD|PLAN|BUILD|CR|ISSUE|EXT|AMD)-[0-9a-f]{16}(-[A-Za-z0-9]+)?$
//                     -> { error: 'invalid artifact id' }; a matching id is joined under the artifact store and must still
//                     realpath-resolve inside it, else the same error
//   deliveryEvidence: well-formed id with no record           -> { error: 'not found' }

type DeliverySnapshotResponse = DeliverySnapshot | DeliveryError;
type DeliveryEvidenceResponse = DeliveryEvidenceRecord | DeliveryError;
```

**Assumptions cited:** [[c19]] [[c20]] [[c21]]

## 6. Story boundaries

### 6.1 Story E202610072ff0dfda:S001

**Owns:** `sc1`, `sc2`, `sc3`

Private to s1: how the store directory is listed and each file parsed; how a record's kind, work-item hash and raw story id are lifted from its file name and meta; the use of the canonical ordinal rule to join s1/S1/S001 and the decision of when two records are ambiguous rather than the same; sourcing story membership from the Define's story list and from accepted extension records; attaching fix stories to an issue through the shared work-item hash and resolving meta.parentRef; nesting tasks by plan and build task ids; and the sort order of records, failures and child lists. No other story reads the files or re-derives identity. Also private: the per-kind lift, including reading flat amendment records; the anchor-date rule for minting canonical ids after grouping by hash and ordinal, which must reproduce deriveWorkItemIdentity and the existing path-scheme folder for every work item those can identify; attaching each SPEC to the item that names it in meta.seededFromSpec; resolving a slug-only parentRef through records' meta.epicSlug. Its LLD maps each of s1 ac1-ac6 to a named test, including ac3 (an ambiguity notice naming the other record), ac4 (two fix stories under one issue) and ac6 (colliding short task ids in two stories). Task items are minted only from t<n> build and plan task ids; a build task id equal to the story's id is left for s3 as a story-level result, with a fixture of that shape. Slug resolution of an issue's parentRef excludes records sharing the issue's own hash; a parentRef that names only the issue itself yields no corrected parent and no notice. Fixtures cover both real shapes: a self-slug parentRef (for example ISSUE-0855311b6b32eb72) and an outward slug (for example ISSUE-2d9e9e694a94116b).

### 6.2 Story E202610072ff0dfda:S002

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

Private to s2: the mapping from a work item's recorded route fields to a DeliveryRoute, read in this order of precedence: ISSUE meta.magnitude for an issue and for every fix story whose work-item hash is that issue's hash (small-bugfix or sized-bugfix, ahead of any BUILD stamp such as 'trivial'); the story's LLD meta.sizeClass; the standalone BUILD record's meta.sizeClass (the only place a trivial route is recorded); and, for a story under a non-standalone epic with none of these, the full chain; including treating any value that is not a SizeClass member (such as a scope letter 'M') or a missing stamp as unknown; a non-standalone BUILD's sizeClass is never read; the first-match-wins precedence that picks the stage; which gate counts as the ready gate for each route; and the wording of stage reasons. It reads approval state only through sc1 and never consults gate or currency annotations. Its LLD maps each of s2 ac1-ac7 to a named test over fabricated records.

### 6.3 Story E202610072ff0dfda:S003

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`, `sc3`

Private to s3: reading each artifact's recorded review per kind (meta.review for design artifacts; body.verdict, body.counts and meta.reviewedBy for code-review records) and its recorded override; deciding when a block is still blocking, by reusing effectiveReviewVerdict over meta.review and meta.reviewResolutions and then requiring the artifact to be unapproved with no meta.reviewOverride; reading build task results from body.tasks[].passed and matching them to planned tasks; detecting the approved-with-failed-tasks conflict; and the attention rule itself, including the confirmed policy that a pending artifact stops counting once a downstream gate on the same work item is approved. It never changes a stage. Its LLD maps each of s3 ac1-ac7 to a named test, including ac7 against the confirmed attention policy. A build task recorded under the story's own id is the story-level result, never an unplanned task. A failed story-level result on an approved build raises the validation conflict and the validation-failed reason exactly as a failed task does; s3's LLD tests this with the shape of BUILD-0855311b6b32eb72-S001.

### 6.4 Story E202610072ff0dfda:S004

**Owns:** `sc6`
**Depends on:** `sc1`, `sc2`, `sc3`

Private to s4: deciding review currency only from recorded fields (for example the framework's existing story-design staleness against its high-level design) and reporting unknown otherwise, never from file modification time; comparing accepted extension records with their epic framing; and detecting expected-but-missing fields, such as an artifact with no title. It never decides route-dependent gaps, which need s2's route. It reports through notices and never adds or removes work items. Also private: deriving each epic's amendments, and any story design's staleness against its high-level design, from the AMD, HLD and LLD records already in sc1, reusing only pure helpers such as computeHldEffectiveHash and never the amendments module's disk-reading listers, so the pass adds no second read and one malformed amendment cannot fail the snapshot. Staleness hashes the epic's approved amendments in rising approvedAt order, the order the existing scanner uses, which is separate from sc6's presentation sort by amendmentId. Its LLD maps each of s4 ac1-ac5 to a named test, including ac5 asserting that no file in the store changes. Its ac4 test covers the missing-field half (an artifact with no title); the build-without-plan half is tested in s5.

### 6.5 Story E202610072ff0dfda:S005

**Owns:** `sc7`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`

Private to s5: running the load, graph and three annotation passes in order for one request; joining annotations onto items; deciding needsAttention as any sc5 attention reason or any notice with attention true; computing counts over the full item set; the deterministic sort of items and notices; choosing openWith from whether an artifact's markdown carries its marker; the two daemon handler-map entries and their repo resolution and error mapping; the artifact-id validation that keeps evidence reads inside the artifact store; and the 1,000-artifact performance fixture. Also private: the error-path mapping (absent store is an empty snapshot; unreadable store, invalid or unknown evidence id is { error }). Also private: the determinism test (two snapshots over the same fixture are identical) and the regression check that the existing workflow.pending and workflow.artifactContent tests pass unchanged. Its LLD maps each of s5 ac1-ac6 to a named test: ac1 asserts the store is byte-identical after a request, ac3 reads a marker-less BUILD through workflow.deliveryEvidence, and ac6 is a type-level check that the VS Code plugin compiles against the published types plus a fixture the JetBrains mirror parses. Also private: the one route-dependent completeness check, raising an 'incomplete-evidence' notice for a story whose sc4 route requires a plan (full-chain, feature, sized-bugfix) but which has a build and no plan; small and small-bugfix routes never get it. Its LLD also owns the test for the build-without-plan half of s4 ac4: a full-chain story with a build and no plan gets the incomplete-evidence notice, and small and small-bugfix stories with a build and no plan do not.

## 7. Non-functional targets

- **Performance:** workflow.delivery returns a full snapshot for a fixture of 1,000 artifact records forming 500 work items within 500 ms of daemon-side time on the reference environment, leaving the client its PRD budget of one second to first render. The store is read once per request; passes are linear in records plus items. No LLM provider is called anywhere in the pipeline.
- **Security:** Read-only by construction: the module opens files for reading only and has no write path. workflow.deliveryEvidence accepts an artifact id, never a path; the id must match the artifact-id pattern and resolve inside the artifact store, and rendered markdown is read only through the existing docs/ containment rule. Artifact content is returned as data and never evaluated. Clients never read the store themselves.
- **Observability:** Each request logs, through the module's own logger, the repository, record count, unreadable count, item count, notice count by code, and elapsed time. Unreadable records appear both in the log and as notices in the response, so a thin view is never silent.
- **Durability:** Nothing is persisted or cached. Artifact files are written by tmp-then-rename, so a concurrent read sees each file either before or after a write, never half-written; a work item whose JSON and markdown are mid-update is reported from its JSON and marked openWith 'evidence-read' if the markdown cannot be resolved.

## 8. Rollout

**Phase A — record set, work-item graph and notices**

**Stories:** `s1`

s1 owns sc1, sc2 and sc3, which every other story consumes; nothing else can be built or tested until the record set, the graph and the notice shape exist.

**Backward compat:** Adds a new module only. No existing reader (chain.ts, pending.ts, artifact-content.ts, ownership.ts) or IPC handler changes; the canonical identity helpers in id.ts are consumed, not modified.

**Phase B — stage, gate and currency passes**

**Stories:** `s2`, `s3`, `s4`

s2, s3 and s4 each depend only on s1 and consume only sc1-sc3, so they can be designed, built and tested in parallel against the same fixtures; each owns one annotation contract (sc4, sc5, sc6) that s5 needs.

**Backward compat:** Pure passes over in-memory data; no IPC surface yet, so no client can observe partial behaviour.

**Phase C — snapshot assembly and the two IPC methods**

**Stories:** `s5`

s5 depends on s1-s4 and consumes all six contracts; it publishes sc7, the shape E2 waits for, and runs the 1,000-artifact performance fixture over the full pipeline.

**Backward compat:** workflow.delivery and workflow.deliveryEvidence are new handler-map entries; every existing handler, including workflow.pending and workflow.artifactContent, keeps its exact behaviour (k8). The daemon must be rebuilt and restarted for clients to see the new methods.

**Ordering rationale:** The order follows the Epic story graph exactly: s1 has no dependencies and owns the three contracts every later story reads; s2, s3 and s4 each depend only on s1 and share no contracts with each other, so they form one parallel phase; s5 depends on all four and owns the published IPC contract, so it lands last. No contract is consumed before the phase that owns it.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Identity joins across real records (s1) | The store mixes s1 and S001 story ids, standalone items, issues whose fix stories share the issue's hash, and older records missing route or parent stamps; a wrong join merges or splits cards and corrupts every count downstream. | Build s1's fixtures from the real conflict shapes measured on 2026-10-07 (the S001/s001 pair in epic dfc0371b, the 11 issue-hashed fix LLDs, the 7 unstamped standalone LLDs and the unstamped ISSUE) and assert one item per canonical id with both source ids retained; ambiguous cases become notices, never merges. Also assert that every minted id equals deriveWorkItemIdentity's output and the existing docs/ folder identity, including standalone stories with no definition head (for example LLD-d88062a6e63aa312-S001). |
| Contract churn after E2 starts (s5, sc7) | The VS Code plugin imports the response types directly and the JetBrains plugin and insrc-ide fork mirror them; changing sc7 after E2 begins breaks three clients. | Fix sc7 in this HLD, version it with schemaVersion, and allow only additive optional fields after approval; any breaking change goes through an HLD amendment before E2 consumes it. |
| Full-store read per request (s5 performance) | a1 re-reads every record on each request, so latency grows with the store; if the 500 ms budget fails, the board's one-second first render fails too. | s5's 1,000-artifact / 500-item fixture measures the whole pipeline before release; if it fails, add a cache behind the same sc7 shape keyed on the store directory listing, without changing the contract. |

## 9. Alternatives considered

### 9.1 a1: Stateless snapshot projection: one store read, a fixed pipeline of pure passes, one read-only IPC method — **CHOSEN**

Every request reads the whole artifact store once into an immutable record set and runs identity, stage, signal and data-quality passes over it to return one snapshot.

A new read-only module beside pending.ts and artifact-content.ts in src/workflow owns the projection. A request first loads every JSON record under the artifact store into an immutable in-memory record set, keeping parse failures as data rather than throwing. A fixed sequence of pure passes then runs over that set: identity and hierarchy (reusing the canonical work-item identity and the per-kind id helpers), route-aware stage derivation, gate signals and the attention rule, and revision, amendment and data-quality notices. The result is one ordered snapshot stamped with the time it was taken. Nothing is cached between requests, so each response is a complete, coherent view of one read of the store.

The daemon exposes this through one new handler-map entry that lazy-imports the module, following the workflow.pending idiom: resolve the repo from params or the workspace fallback, return the snapshot or a structured error, never a silent empty result. The request and response types live in their own type-only file so the VS Code plugin can import them as it already imports pending.ts types, and the JetBrains plugin and the insrc-ide fork mirror them. A second, narrow read entry returns a structured, readable view of one evidence record by artifact id, so build records without a usable markdown marker can still be opened, and existing methods stay untouched.

**Pros:**
- One read of the store per request makes every response internally consistent: there is no cache to drift, so two clients asking at the same moment get the same answer (s5 ac2).
- Pure passes over an in-memory record set are unit-testable with fabricated fixtures and no daemon, matching how handleWorkflowPending is tested.
- Adds exactly two new IPC entries and changes no existing handler, satisfying k8 by construction.
- Reading about 731 JSON files is a bounded local filesystem scan; the 1,000-artifact fixture tests the full path directly rather than a warm cache.

**Cons:**
- Every request re-reads and re-parses the whole store, so response time grows linearly with the number of artifact records.
- Two requests seconds apart repeat the same work; there is no incremental update when one artifact changes.
- A very large store would eventually need caching, which this shape defers rather than designs.

**Cost estimate:** M

### 9.2 a2: Resident projection kept current by a file watcher

The daemon builds the projection once, keeps it in memory, and updates it when the artifact store changes on disk.

The daemon builds the same work-item projection at start-up and holds it in memory for each registered repository. A watcher on the artifact store marks affected work items dirty when a record is added, changed or removed, and the projection recomputes those items (or, on any doubt, the whole repository) before the next request is served. The IPC method then returns the resident snapshot immediately, with the time of the last rebuild as its freshness stamp.

Because the projection is resident, the daemon could later stream change notifications to clients over a long-lived request, giving the IDE boards near-live updates without polling. The read-only contract is unchanged: the watcher only reads, and the projection is never persisted.

**Pros:**
- Requests after the first are served from memory, so latency stays flat as the store grows.
- Sets up a later push channel: a long-lived streamed request could carry change notifications from the resident projection.

**Cons:**
- Correctness depends on invalidation: a missed watch event or a burst of writes leaves a stale view, which contradicts k6's rule that the view reports what the records say.
- Artifact JSON and markdown are written as two separate atomic writes, so a watcher can observe a work item between them and must debounce or re-check, adding timing-dependent behaviour that is hard to test deterministically (k7).
- Adds per-repository resident state and lifecycle to the daemon for a first increment whose refresh is manual by decision.
- The freshness stamp reports the last rebuild, not the moment the store was read, so a client cannot tell a stale view from a current one without extra machinery.

**Cost estimate:** L

**Rejected because:** Meets the ownership, read-only, contract and approval constraints, but its correctness rests on watch-event invalidation across two non-atomic file writes, so k6 and k7 are only partly met and its freshness stamp cannot show whether the view is current.

### 9.3 a3: Grow the existing per-epic chain report into the delivery model

Extend the chain report that already derives per-epic framing, HLD and LLD state to cover plans, builds, code reviews and issues, and expose it per epic over IPC.

The chain report already reads an epic's framing, high-level design and per-story designs and computes approval and staleness for each story. This alternative widens that report: each story entry gains plan, build and code-review state, task results and the derived stage, and the report gains an issue section. A new IPC method returns one epic's report; a second returns the list of epics so a client can fetch them in turn.

Standalone stories and issues, which have no epic framing, would be represented as single-story pseudo-epics keyed by their own hash so the same per-epic report can carry them. The terminal tool keeps using the widened report for its existing chain view.

**Pros:**
- Reuses an existing reader that already handles per-story approval and LLD staleness, so that slice is not rewritten.
- The terminal tool's chain view would gain plan, build and review state for free.

**Cons:**
- The report is shaped per epic, so a client must issue one request per epic and merge the results itself; counts, ordering and the attention filter would then be computed client-side, breaking k1's rule that the daemon owns interpretation and k7's single-snapshot determinism.
- Standalone stories and issues do not have an epic framing; forcing them into pseudo-epics invents a parent, which s1 ac5 forbids.
- Widening a structure the terminal tool already renders changes an existing consumer's output, risking k8's no-behaviour-change rule for current users of the chain view.
- Per-epic requests cannot form one coherent snapshot: artifacts can change between the requests for different epics.

**Cost estimate:** M

**Rejected because:** Violates k1 and k7 because a per-epic report forces clients to merge, count and filter across epics themselves, and only partly meets k8 because it widens a structure the terminal tool already renders. It also forces standalone work into invented parents, contrary to s1 ac5.

## 10. References

- **[[c3]]** `code` `src/workflow/chain.ts:30-65 (ChainReport), :84 (buildChainReport)` — "ChainReport covers define, hld, per-story LLD state, amendments and tracker only — no PLAN, BUILD, CR or ISSUE field."
- **[[c4]]** `code` `src/workflow/pending.ts:126-128 (pending = neither stamp), :67-81 (handleWorkflowPending), :42-50 (PendingArtifact)` — "// Pending = neither stamped: the SAME fields approve/reject write (k5)."
- **[[c5]]** `code` `src/workflow/storage.ts:53 (ARTIFACTS_DIR), :148-173 (per-kind artifact ids), :475 (ARTIFACT_ID_MARKER_RE)` — "export const ARTIFACTS_DIR = '.insrc/artifacts';"
- **[[c6]]** `code` `src/workflow/id.ts:119 (storyIdToOrdinal), :202 (deriveWorkItemIdentity)` — "The ordinal is what matters — 's1', 'S1' and 'S001' all yield 1."
- **[[c7]]** `prior-artifact` `docs/epics/restructure-docs-artifact-markdown-from-flat-E20260915599a9b50/HLD.md :: sc1: Uniform work-item identity` — "One canonical, both-way identity for every work item and story — epic-parented or standalone — so identity can serve as the folder key and lookup key the whole layout hangs on."
- **[[c8]]** `prior-artifact` `docs/epics/e1-delivery-read-model-daemon-from-E202610072ff0dfda/DEF.md (DEF-2ff0dfda, approved 2026-10-07)` — "Clients obtain the whole view as one coherent, read-only snapshot that states when it was taken, and the same snapshot always yields the same order and counts."
- **[[c12]]** `code` `src/workflow/types.ts:401 (meta.sizeClass), :412 (meta.magnitude), :417 (meta.parentRef); SizeClass at src/workflow/triage/types.ts:17` — "readonly sizeClass?:   SizeClass;  /  readonly magnitude?:   BugfixMagnitude;  /  readonly parentRef?:   WorkItemRef | null;"
- **[[c13]]** `stakeholder` `Stakeholder decision 2026-10-07 (DEF-2ff0dfda open question q17f993e9)` — "A pending artifact stops counting toward Needs attention once a downstream gate on the same work item is approved."
- **[[c16]]** `code` `src/cli/services/workflow.ts:126 (listEpics) and :145 (chain)` — "listEpics: const dir = join(repoPath, ARTIFACTS_DIR);  /  chain: return buildChainReport(repoPath, epicHash);"
- **[[c17]]** `step-output` `Measured 2026-10-07 from .insrc/artifacts/*.json (DEF-2ff0dfda c17)` — "731 JSON records; 80 BUILD, 29 approved with a task passed:false; 148 CR, 73 without a BUILD; 39 LLDs without a PLAN; 31 meta.reviewOverride; 11 LLDs carrying an ISSUE's hash."
- **[[c18]]** `code` `src/workflow/storage.ts:77-87 (writeAtomic)` — "export function writeAtomic(absPath: string, content: string): void { ... renameSync(tmp, absPath);"
- **[[c19]]** `code` `src/daemon/server.ts:59-60, 164-242 (request and stream handling)` — "Stream mode: request with "stream": true gets multiple IpcStreamMessages until the handler resolves (stream:done) or throws (stream:error)."
- **[[c20]]** `code` `vscode-plugin/src/chat/docs-review-client.ts:18; jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:31` — "import type { PendingArtifact } from '../../../src/workflow/pending.js';  /  data class PendingArtifactDto("
- **[[c21]]** `code` `src/workflow/artifact-content.ts:101 (handleArtifactContent), :119-125 (docs/ containment), :156-162 (metadata via the in-file insrc:artifact marker)` — "// The sibling hash-flat .json (meta + body) via the in-file insrc:artifact marker."
- **[[c23]]** `code` `src/workflow/review/types.ts:144-160 (ReviewReport); src/workflow/amendments/staleness.ts:60 (scanLldStaleness, LLD-vs-HLD only)` — "ReviewReport { artifact; stage; verdict; findings; counts; template?; reviewedAt; model; reviewedBy? } — no revision or content-hash field."
- **[[c24]]** `analyze-bundle` `design.epic/s1 code capability-discovery over the artifact-store readers` — "0 clear-match, 1 partial-match (src/workflow — chain.ts derives per-epic DEF/HLD/LLD approval, artifact-content.ts serves review views), 4 unrelated."
- **[[c25]]** `analyze-bundle` `design.epic/s1 docs prose-retrieval over prior designs` — "Reusable prior work is sc1 (uniform work-item identity) from Epic 599a9b50, built on the canonical WorkflowId so s1 and S001 canonicalize the same way."
- **[[c26]]** `analyze-bundle` `design.epic/s1 code structural-map of src/workflow` — "Read-only handlers are daemon handler-map entries that lazy-import a pure module: 'workflow.pending' (index.ts:686) imports handleWorkflowPending from ../workflow/pending.js (:687), 'workflow.artifact"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.epic (design.epic)

**0 do not hold · 0 could not be verified · 14 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-07T08:41:32.484Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._

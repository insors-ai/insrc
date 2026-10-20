<!-- insrc:artifact LLD-2f27754d4ad00b8e-s2 -->

# LLD: E202610202f27754d:S002

## Summary

**Epic:** `one-common-model-every-artifact`
**HLD base run:** `wf-1792406752203-whj6zi`
**HLD effective hash:** `07908de0d965...`

This Story gives every stored artifact one shape and one reader and writer. An Artifact carries an identity from the s1 id module, a description, an optional parent, references, the lifecycle and tracker binding shapes the HLD already approved (declared here unchanged, with their behaviour left to s3 and s6), attachments and its own payload. One synchronous decoder reads a head; ArtifactStore.read wraps it, readWithHistory adds the change log and feedback, and the old Define, HLD, LLD and Plan readers delegate to it. A write prepares the head so the authoritative revision and a recoverable operation id are known, stages it in a required write journal, records it in the change log, then replaces the head. A repository version marker lets the new tools refuse an unconverted repository.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)
11. [Open questions](#11-open-questions)

## 1. HLD context

> See **HLD-2f27754d4ad00b8e** § 2. Framework summary

**Rollout phase:** Phase A — identity and the common model
**Owns:** `sc2` (ArtifactEnvelope), `sc3` (HistoryRecords), `sc8` (RepoSchemaVersion)
**Consumes:** `sc1` (ArtifactIdScheme)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The id module and its removal of the second scheme: the folder-name formatter moved into the path scheme, the date source fixed to the epic's creation time, the functional-requirement id helpers and their callers moved with stored FR ids staying valid, issue titles switched to the artifact id, and the delivery module's ordinals. The old issue-body marker is not read. Private to this Story are the exact text of the issue title and the relocation of the helpers. — owns `sc1`
- `s3`: The lifecycle rules: status transitions, the revision and content-hash computation, the staleness record, the completion roll-up and the integrity check against the log tail on approve, review and complete. Private to this Story are the hash canonicalisation and how a roll-up is cached or recomputed. — owns `sc4`
- `s4`: The physical sidecar storage: file layout, the merge attributes for the line files, per-artifact filtering, read-time ordering and de-duplication, and the write order of log entry before head with the repair of a log that is ahead of its head. Private to this Story are the line format and the file naming beside a head. — owns `sc5`
- `s5`: People-facing feedback: adding feedback and replies from a client, listing open feedback, the addresses rule at revision time, and the per-user identity declaration with alias linking. Private to this Story are the identity file format and the display of linked identities.
- `s6`: The typed binding and attachments, the tracker port additions implemented for GitHub, the retry of pending links and posts, and the switch of unit-issue bookkeeping to the binding. Private to this Story are the permalink construction and the retry bookkeeping. — owns `sc6`
- `s7`: Task artifacts: creation of the Tasks file and the Task issues at plan approval, direct edits of a Task's own content with local re-approval, refusal of structural edits, and the re-plan reconciliation. Private to this Story are the diff of a Task against the new plan and the build-round recording in a Task's history. — owns `sc7`
- `s8`: Comment sync: reading human comments into feedback at implement, validate or on request, classifying a revision request or a suggestion from the first line, and posting feedback once. Private to this Story are the first-line commands, the derived since point and the filter for the framework's own posts.
- `s9`: The conversion command: previews, repeats, back-fills history, renames standalone S001 to s1 rewriting the references it can with no alias, creates Epic, Story and Task artifacts for what exists, verifies through the delivery reader, and sets the repository version. Private to this Story are the per-type conversion mappings and the verification report.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `ArtifactStore.read`

```typescript
read(id: string): Promise<Artifact<unknown>>
```

**Parameters:**
- `id: string` — An artifact id that ArtifactIds.parse accepts, for example LLD-<h16>-s1.

**Returns:** `Promise<Artifact<unknown>>` — The envelope with every part filled from the head by the shared decoder: id, description, parent, references, lifecycle, binding, attachments and the payload decoded by the codec of the id's kind.

**Errors:**
- `InvalidArtifactKeyError` when the id is not an artifact id in the s1 strict form (including an upper-case story)
- `ArtifactNotFoundError` when no head file exists for the id
- `ArtifactShapeError` when the head is not valid JSON, or has no meta and body objects (an unconverted amendment fails here with a message that names the s9 conversion)
- `UnknownArtifactKindError` when no codec is registered for the id's kind

**Preconditions:**
- reading does not call RepoSchemaGate; the caller that needs the converted layout does

**Postconditions:**
- an artifact type with no use for a lifecycle part reads an empty lifecycle part (draft, revision from meta.revision or 0, no approval, no review, no signoffs, no stale record) and nothing fails (ac5)
- the parent is read from the head, never derived from stored children (ac6)
- a read writes nothing and calls no History method

### 2.2 `ArtifactStore.readWithHistory`

```typescript
readWithHistory(id: string): Promise<Artifact<unknown> & { changeLog: ChangeLogEntry[]; feedback: Feedback[] }>
```

**Parameters:**
- `id: string` — An artifact id that ArtifactIds.parse accepts.

**Returns:** `Promise<Artifact<unknown> & { changeLog: ChangeLogEntry[]; feedback: Feedback[] }>` — The result of read plus the artifact's change log and all its feedback, in reader order.

**Errors:**
- `InvalidArtifactKeyError` when as for read
- `ArtifactNotFoundError` when as for read
- `ArtifactShapeError` when as for read
- `HistoryReadError` when the sidecar reader fails or a line is not a SidecarRecord

**Postconditions:**
- one shape exposes identity, description, parent, references, change log, feedback and lifecycle (ac4)
- an artifact with no sidecar lines returns empty arrays

### 2.3 `ArtifactStore.write`

```typescript
write(a: Artifact<unknown>, by: Actor): Promise<void>
```

**Parameters:**
- `a: Artifact<unknown>` — The whole envelope to store. Its lifecycle is persisted as supplied except lifecycle.revision.number, which the store sets from the prepared write; transitions and the content hash are s3's.
- `by: Actor` — The actor recorded on the change log entry.

**Returns:** `Promise<void>` — Resolves once the head is replaced; a failure to clear the journal afterwards is logged and does not fail the write.

**Errors:**
- `InvalidArtifactKeyError` when a.id is not a valid artifact id
- `UnknownArtifactKindError` when no codec for the kind
- `ArtifactShapeError` when the codec rejects the payload, the parent is not an artifact id matching ArtifactIds.parentOf, or a reference whose type is an artifact type names an invalid artifact id

**Preconditions:**
- by is an Actor with a namespaced non-empty id
- the store was built with a WriteJournal (only the explicitly non-durable test constructor omits it)

**Postconditions:**
- any pending operation the journal reports for this id is completed first: if the head already equals the staged bytes the journal is only cleared, otherwise the staged bytes are written under the SAME operation id; only then is the new write accepted
- the head is prepared by the pure prepareArtifactWrite, so the revision and the exact bytes are known before any file changes
- the kind is content when the payload (body or citations) or the description changed, and meta-only when only references, parent, attachments, binding or lifecycle changed, so only a content change moves the revision (k3)
- the operation id is a hash of the artifact id, the prior revision number and the prepared bytes; the journal records { operationId, priorRevision, bytes } so a retry reuses it even after the head moved on
- the order is stage in the journal, append the change log entry with that id and the authoritative revision, replace the head, clear the journal
- meta.lifecycle.revision.number and the log entry's revision carry the number the prepare step returned
- the merged meta keeps the prior head's meta and replaces only meta.envelope, meta.lifecycle and meta.revision; on create the kind's codec supplies the identity meta
- children are not stored on the parent

### 2.4 `ArtifactStore.childrenOf`

```typescript
childrenOf(id: string): Promise<string[]>
```

**Parameters:**
- `id: string` — The parent artifact id.

**Returns:** `Promise<string[]>` — The ids of every artifact whose parent reference names id, sorted by id.

**Errors:**
- `InvalidArtifactKeyError` when id is not a valid artifact id

**Postconditions:**
- derived by reading the parent link of each head once; nothing about children is stored on the parent
- an unreadable head and an unconverted amendment are skipped and logged, they do not fail the call

### 2.5 `readDefineArtifact`

```typescript
readDefineArtifact(repoPath: string, epicHash: string): DefineArtifact
```

**Parameters:**
- `repoPath: string` — The repository path.
- `epicHash: string` — The Epic hash.

**Returns:** `DefineArtifact` — The stored artifact in its current shape.

**Errors:**
- `ArtifactMissingError` when no head exists, as today
- `ArtifactShapeError` when the head fails the shared decoder

**Postconditions:**
- stays synchronous: it passes the file text to the shared synchronous decoder and returns the stored artifact, so no caller becomes asynchronous
- return shape and messages are unchanged for a well-formed head

### 2.6 `readHldArtifact`

```typescript
readHldArtifact(repoPath: string, epicHash: string): HldArtifact
```

**Parameters:**
- `repoPath: string` — The repository path.
- `epicHash: string` — The Epic hash.

**Returns:** `HldArtifact` — The stored artifact in its current shape.

**Errors:**
- `ArtifactMissingError` when no head exists, as today
- `ArtifactShapeError` when the head fails the shared decoder

**Postconditions:**
- delegates to the shared synchronous decoder; unchanged return shape

### 2.7 `readLldArtifact`

```typescript
readLldArtifact(repoPath: string, epicHash: string, storyId: string): LldArtifact
```

**Parameters:**
- `repoPath: string` — The repository path.
- `epicHash: string` — The Epic hash.
- `storyId: string` — The s<n> story id.

**Returns:** `LldArtifact` — The stored artifact in its current shape.

**Errors:**
- `ArtifactMissingError` when no head exists, as today
- `ArtifactShapeError` when the head fails the shared decoder

**Postconditions:**
- delegates to the shared synchronous decoder; unchanged return shape

### 2.8 `readPlanArtifact`

```typescript
readPlanArtifact(repoPath: string, epicHash: string, storyId: string): PlanArtifact
```

**Parameters:**
- `repoPath: string` — The repository path.
- `epicHash: string` — The Epic hash.
- `storyId: string` — The s<n> story id.

**Returns:** `PlanArtifact` — The stored artifact in its current shape.

**Errors:**
- `ArtifactMissingError` when no head exists, as today
- `ArtifactShapeError` when the head fails the shared decoder

**Postconditions:**
- delegates to the shared synchronous decoder; unchanged return shape

### 2.9 `History.appendLog`

```typescript
appendLog(id: string, e: ChangeLogEntry): Promise<void>
```

**Parameters:**
- `id: string` — The owning artifact id.
- `e: ChangeLogEntry` — The entry; its own id is its de-duplication key.

**Returns:** `Promise<void>` — Resolves after the sidecar line is written.

**Errors:**
- `InvalidArtifactKeyError` when id is not a valid artifact id
- `HistoryEntryError` when the entry has no id, actor, timestamp or operation, or names an unknown operation

**Postconditions:**
- one line { artifactId, entry } is appended through appendSidecarLine to the path the SidecarStore names
- appending the same (artifactId, entry id) twice is harmless: readers de-duplicate

### 2.10 `History.appendFeedback`

```typescript
appendFeedback(id: string, f: Feedback): Promise<void>
```

**Parameters:**
- `id: string` — The owning artifact id.
- `f: Feedback` — The feedback entry, immutable once written (k4). Replies are the entries in f.feedback.

**Returns:** `Promise<void>` — Resolves after the sidecar line is written.

**Errors:**
- `InvalidArtifactKeyError` when id is not a valid artifact id
- `HistoryEntryError` when text is empty, kind is unknown, or the anchor breaks its limits (quote over 500, prefix or suffix over 40 characters, lines not an ordered pair)

**Postconditions:**
- the anchor keeps quote, prefix, suffix, section and lines as given
- there is no way to edit or delete an entry

### 2.11 `History.log`

```typescript
log(id: string): Promise<ChangeLogEntry[]>
```

**Parameters:**
- `id: string` — The artifact id.

**Returns:** `Promise<ChangeLogEntry[]>` — The artifact's log entries as the SidecarStore reader returns them (filtered, ordered and de-duplicated, which is s4's).

**Errors:**
- `HistoryReadError` when the reader fails or a line is not a SidecarRecord; the line number is named

**Postconditions:**
- an artifact with no log returns an empty array

### 2.12 `History.logTail`

```typescript
logTail(id: string): Promise<ChangeLogEntry | undefined>
```

**Parameters:**
- `id: string` — The artifact id.

**Returns:** `Promise<ChangeLogEntry | undefined>` — The last entry in reader order, or undefined when the log is empty.

**Errors:**
- `HistoryReadError` when as for log

### 2.13 `History.feedback`

```typescript
feedback(id: string): Promise<Feedback[]>
```

**Parameters:**
- `id: string` — The artifact id.

**Returns:** `Promise<Feedback[]>` — All feedback entries of the artifact in reader order.

**Errors:**
- `HistoryReadError` when as for log

### 2.14 `History.openFeedback`

```typescript
openFeedback(id: string): Promise<Feedback[]>
```

**Parameters:**
- `id: string` — The artifact id.

**Returns:** `Promise<Feedback[]>` — The feedback entries no later change log entry addresses.

**Errors:**
- `HistoryReadError` when as for log

**Postconditions:**
- an entry is open when no log entry after it in reader order lists its id in addresses or has addresses 'all'
- feedback carries no state of its own: openness is computed on every call (k4)

### 2.15 `RepoSchemaGate.read`

```typescript
read(repo: string): RepoSchema
```

**Parameters:**
- `repo: string` — Absolute repository path.

**Returns:** `RepoSchema` — The version marker; a repository with no marker file reads as version 1, unconverted.

**Errors:**
- `RepoSchemaError` when the marker file exists but is not valid JSON with an integer version of at least 1

**Postconditions:**
- the call writes nothing

### 2.16 `RepoSchemaGate.require`

```typescript
require(repo: string, atLeast: number): { ok: true } | { ok: false; message: string }
```

**Parameters:**
- `repo: string` — Absolute repository path.
- `atLeast: number` — The least version the caller can work with.

**Returns:** `{ ok: true } | { ok: false; message: string }` — ok when the repository version is at least atLeast; otherwise a message naming the version found, the one needed and that the s9 conversion has to run.

**Errors:**
- `RepoSchemaError` when the marker file is unreadable, as for read

**Postconditions:**
- an unconverted repository is refused with a message, never treated as converted

### 2.17 `writeArtifact`

```typescript
writeArtifact(path: string, next: unknown, kind: WriteKind, opts?: { replaceUnreadable?: boolean }): number
```

**Parameters:**
- `path: string` — Absolute path of the head file.
- `next: unknown` — The artifact object with a meta object; unchanged from today.
- `kind: WriteKind` — content or meta-only; unchanged.
- `opts: { replaceUnreadable?: boolean }` _(optional)_ — Unchanged.

**Returns:** `number` — The meta.revision now on disk, as today.

**Errors:**
- `TypeError` when next is not an object with a meta object, as today

**Postconditions:**
- behaviour is byte-for-byte what it is today: it now calls the pure prepareArtifactWrite and then writeAtomic with the prepared bytes
- an existing writeArtifact test passes unchanged

### 2.18 `scanWriters`

```typescript
scanWriters(source: string): WriterScan
```

**Parameters:**
- `source: string` — A TypeScript source file's text.

**Returns:** `WriterScan` — The writers the file calls, passes on as values or aliases, now including appendFileSync, appendSidecarLine and a write on the ArtifactStore.

**Postconditions:**
- appendFileSync and appendSidecarLine are detected under the same alias, rename, namespace and value rules as the existing names
- a file that imports the store module and calls a member named write is reported as an ArtifactStore.write call; this import-based rule is how an instance call is recognised without type information
- the existing writers are detected exactly as before

### 2.19 `checkInventoryEntry`

```typescript
checkInventoryEntry(source: string, entry: InventoryEntry | undefined): string[]
```

**Parameters:**
- `source: string` — The file's text.
- `entry: InventoryEntry | undefined` — The file's inventory entry.

**Returns:** `string[]` — The problems found; empty when the file is correctly inventoried.

**Postconditions:**
- a file that appends or calls the store's write with no inventory entry is reported
- every file the new detector newly flags (src/daemon/fatal.ts, src/daemon/shutdown.ts, the analyze-step, build-step, workflow-step and review-step handlers, src/config/feedback.ts and src/workflow/storage.ts appendRunLog) has an entry in the same change

## 3. Data model changes

### 3.1 `Artifact<P>` — new

The envelope: { id, description, parent?, references, lifecycle, binding?, attachments, payload }. Stored in the head under meta.envelope (description, parent, references, binding, attachments) and meta.lifecycle, beside the existing identity and anchor meta; the payload is body plus citations. The outer { meta, body, citations } shape is kept so writeArtifact and every raw reader keep working. Kind-specific payload shapes stay in src/workflow/artifacts and are reached through the codec registry.

```
meta.envelope = { description: string; parent?: Reference; references: Reference[]; binding?: TrackerBinding; attachments: Attachment[] }; meta.lifecycle = Lifecycle
```

**Call sites:**
- `src/workflow/types.ts`
- `src/workflow/storage.ts:134-185`

### 3.2 `decodeArtifactHead` — new

A pure synchronous function decodeArtifactHead(id, raw) in src/workflow/artifact-core that parses the head text, selects the codec by the kind ArtifactIds.parse returns, and returns the Artifact plus the parsed head. ArtifactStore.read is an asynchronous wrapper over it and the four gates readers call it, so there is one decoder. A head with no meta.envelope or meta.lifecycle decodes with empty parts.

**Call sites:**
- `src/workflow/gates.ts:141-151`
- `src/workflow/gates.ts:236-245`
- `src/workflow/gates.ts:281-289`
- `src/workflow/gates.ts:377-385`

### 3.3 `Lifecycle family (Status, Revision, Approval, Review, Signoff, Staleness, Lifecycle)` — new

Declared in src/workflow/artifact-core/types.ts exactly as HLD sc4 (owned by s3) defines them: Status draft | pending-review | approved | in-signoff | changes-requested | signed-off | rejected | completed | withdrawn | superseded; Revision { number, contentHash, at, by }; Approval { revision, by, at, override? }; Review { revision, reviewer, party, verdict, counts, at, report? }; Signoff { revision, request, state, actors, at }; Staleness { upstream, upstreamRevision, since }; Lifecycle { status, revision, approval?, review?, signoffs, stale? }. s2 stores and reads the shape; transitions, the content hash and the roll-up are s3's. An empty lifecycle is { status: draft, revision: { number: 0, contentHash: '', at: '', by: <system actor> }, signoffs: [] }.

**Call sites:**
- `src/workflow/types.ts`
- `src/workflow/gates.ts:141-151`

### 3.4 `TrackerBinding and Attachment` — new

Declared exactly as HLD sc6 (owned by s6) defines them: TrackerBinding { reference, createdAtRevision, posted[], pendingLink? } and Attachment { target, revision, at, externalId? }. s2 validates only that references are well formed; their behaviour is s6's. A tracker issue is never an artifact (k6): the binding points at it.

**Call sites:**
- `src/workflow/tracker/refs.ts`

### 3.5 `Actor and Reference` — new

Actor { id, kind, name?, properties } with a namespaced lower-case id (github:alice, insrc:daemon); Reference { entityId, type, relation, fragment?, quote? } where type is the target's type and relation says why the link exists. entityId is an artifact id or an external id (owner/repo#N, a code path, a URL) with a namespaced type, as Gap 7 allows; ArtifactIds.parse checks it only when type is an artifact type. The parent is a Reference with relation derived-from whose entityId must be an artifact id equal to ArtifactIds.parentOf of the artifact's own key, so the Epic, Story and Task chain is given by each artifact's parent (ac6).

**Call sites:**
- `src/workflow/artifact-ids.ts`

### 3.6 `ChangeLogEntry (artifact operation log)` — new

As in HLD sc3: { id, actor, timestamp, operation, revision?, status?, outcome?, references?, addresses? } with the seventeen operations. It is a new type in src/workflow/artifact-core/types.ts and is distinct from the build file-change entry.

**Call sites:**
- `src/workflow/artifacts/provenance/types.ts`

### 3.7 `FileChangeEntry (renamed build change-log entry)` — field-modify

The existing provenance ChangeLogEntry { target, summary?, author, timestamp } and ChangeLog are used by the BUILD record's file-level change log, so they are kept and renamed FileChangeEntry and FileChangeLog to avoid a clash with the artifact operation log. Consumers are updated: collectBuildChangeLog, StandaloneBuildRecord.body.changeLog and changeLogBodyLines. Stored data is unchanged because only the TypeScript names move.

```
ChangeLogEntry -> FileChangeEntry; ChangeLog -> FileChangeLog (type names only)
```

**Call sites:**
- `src/workflow/artifacts/provenance/types.ts`
- `src/workflow/runners/build/changed-files.ts`
- `src/workflow/runners/build/standalone-record.ts`
- `src/workflow/artifacts/format/bindings.ts`

### 3.8 `Feedback and its legacy conversion` — new

{ id, text, actor, timestamp, feedback (replies), kind: comment | suggestion | revision-request, anchor?, revision?, source?, batchId? }. The anchor is { quote?, prefix?, suffix?, section?, lines? } (binding requirement 5): prefix and suffix are kept, limits stay 500 for the quote and 40 for prefix and suffix, section carries the nearest heading slug. A pure function converts a stored FeedbackEntry for s9: comment becomes text; author becomes Actor { id: unknown:<author>, kind: person, properties: {} } because the legacy string has no namespace; an absent kind becomes comment, feedback and comment become comment, suggestion stays suggestion; quote, prefix and suffix copy across; sectionSlug becomes section with the same value; target.segment becomes anchor.lines; target.version, when it is an integer revision, becomes revision, and any other value is reported in the conversion result as unmapped rather than dropped; target.file is dropped when it is the owning artifact's own document and reported otherwise; batchId copies; decision is not a Feedback field and becomes the approve, reject or feedback outcome of the change log entry of that batch.

```
FeedbackAnchor.sectionSlug -> Feedback.anchor.section; FeedbackEntry.comment -> Feedback.text; FeedbackEntry.kind (optional) -> Feedback.kind (required, default comment)
```

**Call sites:**
- `src/workflow/artifacts/provenance/types.ts`
- `src/workflow/artifacts/provenance/writer.ts`

### 3.9 `PreparedWrite and prepareArtifactWrite` — new

A pure function in src/workflow/storage.ts that takes the same inputs as writeArtifact and returns { bytes, revision, changed } without touching the file system except to read the prior head. writeArtifact is rewritten as prepare then writeAtomic, so the revision rule has one implementation.

**Call sites:**
- `src/workflow/storage.ts:134-185`

### 3.10 `WriteJournal port` — new

{ stage(id, op: { operationId, priorRevision, bytes }): Promise<void>; pending(id): Promise<{ operationId, priorRevision, bytes } | undefined>; clear(id, operationId): Promise<void> }. The store requires one; s2 ships an in-memory implementation for tests and for an explicitly named non-durable constructor, and s4 implements the durable pending-head file and the start-up recovery. pending lets a retry find the staged operation and reuse its operation id and bytes, including after the head was already replaced.

**Call sites:**
- `src/workflow/storage.ts:134-185`

### 3.11 `Kind codec and its context` — new

Each kind registers a codec { decode(head), encode(payload, ctx) } over the { meta, body, citations } head. encode returns { meta, body, citations }; on create the codec builds the kind's identity meta from ctx (epicHash, epicSlug, createdAt, epicCreatedAt obtained through the s1 stampRootAnchor and resolveEpicAnchor helpers, standalone, sizeClass and the other fields the existing readers use), and on update the prior head's meta is kept. The store merges the prior meta first and replaces only meta.envelope, meta.lifecycle and meta.revision, so workItemAnchorCreatedAt and the path and renderer code keep reading the same fields. The AMD codec requires the converted head and refuses a flat amendment with a pointer to the s9 conversion.

**Call sites:**
- `src/workflow/storage.ts:207-225`
- `src/workflow/artifacts/define.ts`
- `src/workflow/amendments/store.ts`

### 3.12 `SidecarRecord and the append primitive` — new

{ artifactId, entry } is one line of a sidecar file. s2 provides appendSidecarLine(path, record), the one function that appends a JSON line with appendFileSync to the path it is given, and an in-memory reader and appender for tests. Which path, the line format beyond a JSON object per line, ordering, de-duplication and repair are s4's through sc5's SidecarStore.

**Call sites:**
- `src/workflow/artifact-write-inventory.ts:125-282`

### 3.13 `RepoSchema` — new

{ version: number; convertedAt?: string } stored in .insrc/schema.json. Absent means version 1 (unconverted). The version s9 sets is 2. s2 only reads and requires; s9 writes.

**Call sites:**
- `src/workflow/storage.ts:134-185`

### 3.14 `WRITER_NAMES in the write inventory` — field-modify

WRITER_NAMES gains appendFileSync and appendSidecarLine, and a store-write rule is added. The detector keeps recognising the existing five writers exactly as before (invariant from bundle 4). Negative controls cover a raw, an aliased, a renamed, a namespace and an injected appendFileSync, and a store write with no entry. The store file's inventory entry is added in the same task as the store file, because the inventory test rejects an entry whose file does not exist.

**Call sites:**
- `src/workflow/artifact-write-inventory.ts:125-282`
- `src/workflow/__tests__/artifact-write-inventory.test.ts`

## 4. Diagrams

- [ER model](docs/epics/one-common-model-every-artifact-E202610192f27754d/S002/er-model.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | Implements the Artifact types, ArtifactStore (read, write, childrenOf), the shared decoder and codec registry and the head layout; the head is written through the unchanged writeArtifact rule via the pure prepare step. readWithHistory is recorded by the sc2 methodAdd amendment already filed. |
| `sc3` | implements | Implements the ChangeLogEntry, Feedback and SidecarRecord shapes, the History API and the append primitive. The anchor keeps prefix and suffix; section replaces sectionSlug with the stated conversion. |
| `sc8` | implements | Implements RepoSchemaGate.read and require over .insrc/schema.json; s9 sets and checks the version. |
| `sc1` | consumes | Uses ArtifactIds.parse for every id the store receives and ArtifactIds.parentOf for the parent reference; adds no id rule. |
| `sc4` | consumes | Declares the Lifecycle family exactly as sc4 defines it and stores it; the rules that move it are s3's. |
| `sc6` | consumes | Declares TrackerBinding and Attachment exactly as sc6 defines them and stores them; their behaviour is s6's. |

## 6. Error paths

**Error cases**

- **The head file is not valid JSON, or has no meta or body object** (recoverable)
  - Detection: The shared decoder parses the text and checks that meta and body are plain objects; a parse error or a failed check raises ArtifactShapeError naming the id and path
  - Response: Throw ArtifactShapeError from ArtifactStore.read or from the delegating Define, HLD, LLD or Plan reader; no part is guessed and nothing is written
  - User impact: The artifact cannot be read until the file is repaired by hand; other artifacts are unaffected
- **An unconverted amendment (a flat AMD file with no meta and body) is read through the store** (recoverable)
  - Detection: The AMD codec finds no meta object in the parsed file
  - Response: Throw ArtifactShapeError whose message names the s9 amendment conversion; childrenOf skips it and logs
  - User impact: Amendments cannot be read through the store until s9 converts them; the existing amendment commands are unaffected until then
- **A read or write names an id the s1 module does not accept, for example LLD-<h16>-S001** (recoverable)
  - Detection: ArtifactIds.parse returns undefined for the id
  - Response: Throw InvalidArtifactKeyError; the message points to the s9 conversion for an upper-case story
  - User impact: Old upper-case artifacts fail until the conversion runs
- **No head exists for the id on read** (recoverable)
  - Detection: existsSync on the head path is false
  - Response: Throw ArtifactNotFoundError for the store, or ArtifactMissingError for the gates readers, as today
  - User impact: A caller that expected the artifact sees a clear not-found error
- **A kind has no registered payload codec** (recoverable)
  - Detection: The codec registry lookup by ArtifactIds.parse(id).kind finds nothing
  - Response: Throw UnknownArtifactKindError; the store never passes a payload through untyped
  - User impact: A new artifact kind cannot be stored until its codec is registered
- **The parent is not an artifact id, or differs from ArtifactIds.parentOf of the artifact's own key, or a reference whose type is an artifact type names an invalid artifact id** (recoverable)
  - Detection: ArtifactStore.write checks the parent with ArtifactIds.parse and parentOf, and checks each reference's entityId with ArtifactIds.parse only when its type is an artifact type
  - Response: Throw ArtifactShapeError naming the reference; an external reference (owner/repo#N, a code path, a URL) is accepted without a check
  - User impact: A malformed parent or artifact link is refused before anything is written; valid tracker and code references are never blocked
- **Preparing the head fails (unreadable prior head, a codec rejecting the payload)** (recoverable)
  - Detection: prepareArtifactWrite throws before any file is touched
  - Response: Throw the error; no journal entry, no log line and no head change exist
  - User impact: The write fails cleanly with nothing to repair
- **Staging the prepared head in the WriteJournal fails** (recoverable)
  - Detection: WriteJournal.stage rejects
  - Response: Rethrow before the log append, so nothing is logged and the head is unchanged
  - User impact: The write fails visibly and can be retried
- **The log append fails after the head was staged** (recoverable)
  - Detection: appendSidecarLine or History.appendLog throws (disk full, permission)
  - Response: Rethrow; the staged operation stays in the journal and the head file is unchanged; the next write for this id finds it through pending and completes it under the same operation id
  - User impact: The write is reported failed; a retry reuses the staged operation id
- **The head replace fails or the process stops after the log append** (recoverable)
  - Detection: writeAtomic throws, or WriteJournal.pending still reports the operation at the next write or start
  - Response: Rethrow and log the artifact id and operation id at warn; the next write replays the staged bytes under the same operation id, which readers de-duplicate
  - User impact: The log never names a revision the head cannot reach, and no second entry is made for the same write
- **The head was replaced but clearing the journal failed** (recoverable)
  - Detection: WriteJournal.clear rejects after writeAtomic succeeded
  - Response: Log the failure at warn and let the write succeed; the next write finds the pending operation, sees the head already equals the staged bytes and only clears it, reusing the staged operation id
  - User impact: The caller sees success; the leftover journal entry is cleaned on the next write
- **A write is made while a different operation is pending for the same id** (recoverable)
  - Detection: WriteJournal.pending returns an operation whose bytes are neither the current head nor the new write
  - Response: Complete the pending operation first, then run the new write against the resulting head
  - User impact: Unrelated writes cannot overtake a staged one, so the log stays in order
- **A feedback entry has an empty text, an unknown kind or an anchor over its limits** (recoverable)
  - Detection: History.appendFeedback validates the entry before the append
  - Response: Throw HistoryEntryError naming the field; nothing is appended
  - User impact: The caller learns exactly what to fix
- **A sidecar line is not a valid SidecarRecord when read** (recoverable)
  - Detection: The reader port or History.log fails to parse a line or finds a missing artifactId or entry
  - Response: Throw HistoryReadError with the line number; no partial list is returned
  - User impact: History for that artifact is unavailable until the line is fixed
- **The repository marker file exists but holds invalid JSON or a non-integer version** (recoverable)
  - Detection: RepoSchemaGate.read validates the parsed value
  - Response: Throw RepoSchemaError naming the file; require rethrows rather than treating it as unconverted
  - User impact: The new tools refuse to run until the marker is fixed
- **The repository is unconverted (no marker, version 1) when a tool needs the common model** (recoverable)
  - Detection: RepoSchemaGate.require(repo, 2) returns ok:false
  - Response: Return a message naming the found version, the needed one and the s9 conversion; the caller stops
  - User impact: The tool refuses with an actionable message instead of reading old shapes wrongly
- **A legacy feedback entry cannot be mapped completely (a non-numeric target.version, or a target.file other than the artifact's own document)** (recoverable)
  - Detection: The conversion function checks those fields and records each unmapped one in its result
  - Response: Return the converted Feedback plus a report entry for the unmapped field; nothing is silently dropped
  - User impact: s9's report lists what could not be carried over so a person can decide

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A head with no meta.envelope and no meta.lifecycle (every artifact today) | the shared decoder returns description '', no parent, no references, an empty lifecycle (draft, revision from meta.revision or 0, no approval or review, no signoffs, no stale record), no binding, no attachments, and does not fail (ac5); the gates readers keep returning the stored artifact |
| write where only the description changed | the kind is content, so the revision moves by one |
| write where only references, attachments, the binding or the parent changed | the kind is meta-only, the revision does not move, and a log entry with operation update is still appended |
| write of identical content twice | the second prepare keeps the revision and produces the same bytes, so the operation id is the same only if the prior revision is the same; an exact replay of a staged write reuses the staged id |
| write of an artifact that has no head yet | the operation is create, revision 1; the codec supplies the identity meta from the context including epicCreatedAt; the entry is appended before the head is written |
| write of an existing artifact | the prior head's identity meta (epicHash, epicSlug, epicCreatedAt, createdAt, standalone and the rest) is kept and only meta.envelope, meta.lifecycle and meta.revision are replaced, so workItemAnchorCreatedAt and the Define renderer still read the stored head |
| A store built without a journal | it can only be built through the explicitly named non-durable test constructor; the production constructor requires a journal |
| childrenOf an id with no children, or with an unreadable head in the directory | an empty array, or the readable children only, with the unreadable head logged |
| The same ChangeLogEntry id appended twice for one artifact | both lines may exist; every reader returns it once |
| A feedback anchor with a quote of exactly 500 characters and a 40 character prefix | accepted; 501 or 41 is HistoryEntryError |
| A feedback anchor with only a quote, or with only lines | accepted; every anchor field is optional |
| A legacy feedback entry with no kind | converted with kind comment |
| A legacy feedback author such as Subho Ghosh | the actor id is unknown:Subho Ghosh with kind person, never an unnamespaced id |
| openFeedback when a later log entry has addresses 'all', or lists one feedback id | all earlier feedback, or only the listed one, is closed; feedback written after that entry is open |
| A repository with no .insrc/schema.json | read returns version 1 and require(repo, 1) is ok |
| A reference to owner/repo#12 with type github:issue, to a code path, or to a URL | accepted on a reference; only an artifact-typed reference is checked with ArtifactIds |
| appendFileSync imported under another name, called as fs.appendFileSync, or passed as a default parameter; a file that imports the store module and calls write | the inventory detector reports each as a writer, and the files it newly flags already have entries |

**Invariants to preserve**

- writeArtifact mints meta.revision on content writes only, keeps it for an identical rewrite and copies it on a meta-only write; its signature and result are unchanged by the prepare split [[c1]]
- A content write carries the whole prior meta.tracker block; the envelope's binding does not drop meta.tracker [[c1]]
- workItemAnchorCreatedAt requires meta.epicCreatedAt, so a store write keeps the head's identity meta and never drops it [[c1]]
- The head keeps the { meta, body, citations } outer shape and is replaced atomically with writeAtomic [[c1]]
- The Lifecycle, TrackerBinding and Attachment shapes are exactly the ones HLD sc4 and sc6 define, and a Reference may name an artifact or an external id [[c2]]
- The build change log keeps its stored shape: only the TypeScript names of ChangeLogEntry and ChangeLog move [[c3]]
- Feedback quote is at most 500 characters and prefix and suffix at most 40, and the anchor keeps its prefix and suffix [[c3]]
- The detector recognises writeArtifact, writeRecordFile, writeAtomic, writeFileSync and renameSync exactly as before, and every writer file has an inventory entry [[c4]]
- Amendment files keep their flat stored shape until the s9 conversion [[c5]]
- readDefineArtifact, readHldArtifact, readLldArtifact and readPlanArtifact stay synchronous and keep their return shapes and missing-file errors [[c6]]
- Artifact ids are the strict s1 form and the parent chain comes from ArtifactIds.parentOf; the delivery loader reads each artifact once [[c7]]

## 7. Test strategy

**Test framework:** `node:test via npx tsx --test, with node:assert/strict; tests live beside the code in __tests__ directories`

**Test levels**

- **unit** — Prove the prepare step, the shared decoder, the envelope read and write rules, History validation, the gate and the legacy feedback conversion in isolation over temporary directories and in-memory ports.
  - Subjects: `prepareArtifactWrite returns the same bytes and revision that writeArtifact writes for content, meta-only, identical and first writes, and writeArtifact keeps its existing results`, `decodeArtifactHead fills every envelope part from a head with and without meta.envelope and meta.lifecycle, and rejects a malformed head, an unknown kind and an unconverted amendment`, `ArtifactStore.write chooses content for a payload or description change and meta-only for references, parent, attachments, binding or lifecycle changes`, `reference validation: an artifact-typed reference with a bad id and a parent that differs from ArtifactIds.parentOf are refused; github:issue, code-path and URL references are accepted`, `the operation id is the same for a replayed staged write and different when the prior revision or the bytes differ`, `History.appendFeedback validation of text, kind and the anchor limits, and that prefix, suffix, section and lines survive a round trip`, `History.openFeedback closing by addresses 'all' and by listed ids`, `RepoSchemaGate.read and require over no marker, a valid marker and an invalid marker`, `the legacy feedback conversion: absent kind, namespaced unknown: actor, sectionSlug to section, segment to lines, integer and non-integer target.version, foreign target.file, decision to the batch log outcome`
  - Fixtures: `a temporary repository with .insrc/artifacts`, `heads written with and without the envelope parts`, `a flat amendment file`, `an in-memory SidecarStore reader and appender and an in-memory WriteJournal`
- **integration** — Prove the store, the journal order, the append primitive and the delegating readers together on real files, and the inventory gate over the real source tree.
  - Subjects: `write then read round trip for each registered kind keeps the revision rule: identical rewrite keeps it, a reference change keeps it, a description change moves it, a payload change moves it by one`, `a store write followed by workItemAnchorCreatedAt and the Define renderer over the stored head returns the same anchor and markdown as before the write`, `retry BEFORE replacement: a failure injected at stage, at the log append and at the head replace leaves the documented state and the next write completes the staged operation under the same operation id with the log showing it once`, `retry AFTER replacement: the head replace succeeds and clear fails, the write still resolves, and the next write finds the pending operation, only clears it and appends no second entry`, `an unrelated write while an operation is pending completes the pending one first`, `a fresh store over the same directory and a persisted journal replays a staged write after a simulated restart`, `readWithHistory returns a non-empty change log and non-empty feedback together with the lifecycle for an artifact that has both`, `readDefineArtifact, readHldArtifact, readLldArtifact and readPlanArtifact return the same artifact and the same missing-file error as before, synchronously, for a head with no envelope parts`, `appendSidecarLine appends one JSON line per call to a path it is given`, `the write inventory test over the real src tree: every file the new detector flags has an entry, the store and primitive files have entries, and the negative controls for raw, aliased, renamed, namespace, injected appendFileSync and a store write with no entry are reported`, `the build change log tests pass unchanged apart from the renamed type names`
  - Fixtures: `a temporary repository`, `a fault-injecting head writer and journal that throw once at a chosen boundary`, `a copy of the real inventory input list`
- **contract** — Pin the shapes other Stories build on: the exported types and the stored head layout.
  - Subjects: `the Lifecycle, Revision, Approval, Review, Signoff, Staleness, TrackerBinding and Attachment types accept the sc4 and sc6 sketches exactly`, `the Artifact, ChangeLogEntry, Feedback and SidecarRecord types accept the sc2 and sc3 sketches plus the stated anchor extension`, `the stored head keeps { meta, body, citations } with envelope parts only under meta.envelope and meta.lifecycle`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac4` | `src/workflow/artifact-core/__tests__/store-read.test.ts: readWithHistory exposes identity, description, parent, references, change log, feedback and lifecycle in one shape for an artifact with non-empty history and feedback`, `src/workflow/artifact-core/__tests__/store-write.test.ts: write then read round trip keeps the revision rule for every registered kind`, `src/workflow/artifact-core/__tests__/store-read.test.ts: the gates readers and the store read the same head through one decoder` |
| `ac5` | `src/workflow/artifact-core/__tests__/store-read.test.ts: a head with no envelope or lifecycle part reads an empty part and does not fail` |
| `ac6` | `src/workflow/artifact-core/__tests__/store-read.test.ts: a reference names its target, type and relation, external targets are accepted, and the parent chain is given by the parent link`, `src/workflow/artifact-core/__tests__/store-children.test.ts: children are derived from the parent link and are never stored on the parent` |

## 8. Migration

**State before:** Each artifact type keeps cross-cutting facts as loose optional meta fields and its feedback inside body.feedback. writeArtifact builds and writes the head in one function and returns the revision only after the write. gates.ts readDefineArtifact, readHldArtifact, readLldArtifact and readPlanArtifact each parse the head JSON themselves and are synchronous. The write inventory recognises five writers and several existing files call appendFileSync unseen. The build change log uses ChangeLogEntry and ChangeLog from the provenance types. Amendments are flat files. (bundles c1 to c6)

**State after:** src/workflow/artifact-core holds the envelope types (including the sc4 and sc6 shapes unchanged), the shared synchronous decoder, the codec registry, ArtifactStore with readWithHistory and a required WriteJournal, History, appendSidecarLine and RepoSchemaGate. storage.ts has a pure prepareArtifactWrite and writeArtifact is prepare then write. The four gates readers delegate to the shared decoder and stay synchronous. The build change log types are renamed FileChangeEntry and FileChangeLog. The inventory detector knows appendFileSync, appendSidecarLine and the store write, with negative controls, and every file it newly flags has an entry. No stored data is converted: s3 to s8 build on the store and s9 converts, including amendments.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add src/workflow/artifact-core/types.ts declaring the envelope, Actor, Reference, ChangeLogEntry, Feedback, SidecarRecord, RepoSchema, the errors, and the sc4 Lifecycle family and sc6 TrackerBinding and Attachment exactly as the HLD defines them. Rename the provenance ChangeLogEntry and ChangeLog to FileChangeEntry and FileChangeLog and update collectBuildChangeLog, StandaloneBuildRecord and changeLogBodyLines. Stored data does not change. — ↩ rollbackable
2. Split writeArtifact in src/workflow/storage.ts into a pure prepareArtifactWrite returning the bytes, the revision and whether content changed, and a writeArtifact that calls it and then writeAtomic. Its signature and results stay identical; the existing writeArtifact tests must pass unchanged. — ↩ rollbackable
3. Add src/workflow/artifact-core/sidecar.ts with appendSidecarLine and the in-memory reader and appender, and src/workflow/artifact-core/history.ts implementing History with entry validation including the anchor limits. In the same change extend the inventory detector for appendFileSync and appendSidecarLine, add the negative controls, give an inventory entry to the sidecar file, and add entries for every existing file the detector newly flags (src/daemon/fatal.ts, src/daemon/shutdown.ts, the analyze-step, build-step, workflow-step and review-step handlers, src/config/feedback.ts, and the appendRunLog call in src/workflow/storage.ts). The inventory test must pass at the end of this step. — ↩ rollbackable _(needs: `step 1`)_
4. Add the kind codec registry and a codec for each existing kind except AMD, each owning encode(payload, ctx) and the kind's identity meta, plus the pure synchronous decodeArtifactHead. The AMD codec requires the converted head and throws a pointer to the s9 conversion for a flat amendment. — ↩ rollbackable _(needs: `step 1`)_
5. Delegate readDefineArtifact, readHldArtifact, readLldArtifact and readPlanArtifact in src/workflow/gates.ts to decodeArtifactHead. They stay synchronous, keep their return shapes and their missing-file errors, and a head without envelope parts decodes with empty parts, so the delegation is safe before the conversion. The existing gates tests must pass unchanged. — ↩ rollbackable _(needs: `step 4`)_
6. Add src/workflow/artifact-core/store.ts with ArtifactStore (read, readWithHistory, write, childrenOf) and the WriteJournal port with pending, using prepareArtifactWrite, the codecs and History in the order: complete any pending operation, stage, append log, replace head, clear. Extend the inventory detector with the store-write rule and add the store file's inventory entry in this same step, since the inventory test rejects an entry for a file that does not exist. — ↩ rollbackable _(needs: `step 2`, `step 3`, `step 4`)_
7. Add RepoSchemaGate over .insrc/schema.json: read (absent means version 1) and require. — ↩ rollbackable
8. Add the pure legacy feedback conversion with its report of unmapped fields so s9 can run it. — ↩ rollbackable _(needs: `step 1`)_
9. Record for s9 in docs/plans/core-data-model.md: convert every flat amendment to the enveloped head; add meta.envelope and meta.lifecycle to every head (moving approvedAt, rejectedAt, rejectReason, review, reviewOverride, reviewResolutions and the staleness comparisons into the lifecycle and tracker into the binding); turn body.feedback entries into sidecar feedback lines through step 8; set the repository marker to version 2. None of this runs in this Story. — ✕ non-rollbackable _(needs: `s9`)_

**Backward compat:** None is kept, by the owner's ruling. The changes to existing modules are internal: writeArtifact is split with identical behaviour, the four gates readers delegate to the shared decoder with unchanged return shapes and errors, the build change log types are renamed (type names only, stored data unchanged), and the detector gains writers. The store and ports are additive. A repository that has not been converted reads as schema version 1 and the new tools refuse it through RepoSchemaGate.require, and an unconverted amendment is refused by the store with a pointer to s9 while the existing amendment commands keep working.

## 9. Alternatives considered

### 9.1 a1: Store with a required journal, a recoverable operation id, a shared synchronous decoder and codec-owned metadata — **CHOSEN**

ArtifactStore over a pure prepare step with a REQUIRED WriteJournal whose pending(id) lets a retry reuse the staged operation id; one synchronous decodeArtifactHead that the async read and the gates readers share; codecs own the kind's identity meta; sc4 and sc6 shapes declared unchanged.

New module group src/workflow/artifact-core. types.ts declares the envelope, Actor, Reference, ChangeLogEntry, Feedback, SidecarRecord, RepoSchema and, unchanged from the HLD, the sc4 Lifecycle family and the sc6 TrackerBinding and Attachment. storage.ts splits writeArtifact into a pure prepareArtifactWrite and writeArtifact calls it then writeAtomic. decodeArtifactHead(id, raw) is a pure synchronous decoder over the { meta, body, citations } head; ArtifactStore.read and readWithHistory wrap it, and readDefineArtifact, readHldArtifact, readLldArtifact and readPlanArtifact in gates.ts call it and keep returning the stored artifact in their current shapes, so no caller becomes asynchronous; a head with no envelope parts decodes with empty parts, so this is safe before the conversion. ArtifactStore is built with a required WriteJournal (a journal-free store exists only through an explicitly named non-durable test constructor). write(): first completes any pending operation the journal reports for the id (head already equal to the staged bytes: clear only; otherwise replay the staged bytes under the SAME operation id); then chooses the kind (content when the payload or the description changed, meta-only otherwise), prepares the head, derives the operation id from the artifact id, the prior revision and the prepared bytes, stages { operationId, priorRevision, bytes } in the journal, appends the change log entry with that id and the authoritative revision, replaces the head, and clears the journal; a clear failure after a successful replace is logged and does not fail the write. Each kind's codec owns encode(payload, ctx) and supplies the kind's identity meta from ctx on create (epicHash, epicSlug, epicCreatedAt through the s1 anchor helpers, createdAt, standalone and the other fields existing readers use) and takes it from the prior head on update; the store merges the prior meta first and replaces only meta.envelope, meta.lifecycle and meta.revision. A Reference target is checked with ArtifactIds only when its type is an artifact type; external targets are allowed; only the parent must be an artifact id. readWithHistory adds the change log and feedback (already filed as an sc2 methodAdd). The AMD codec refuses an unconverted flat amendment. The provenance ChangeLogEntry is renamed FileChangeEntry. The inventory detector adds appendFileSync, appendSidecarLine and an import-based store-write rule, and every existing appender it newly flags gets an entry.

### 9.2 a2: Same store with an optional journal and re-derived operation id

As a1 but the journal is optional and the operation id is re-derived on every attempt.

ArtifactStore.write appends the log entry and replaces the head; a WriteJournal may be supplied; the operation id is recomputed from the prior revision and bytes each attempt; gates readers are left as they are.

**Rejected because:** Smaller but fails binding requirement 3 and leaves the second reader.

### 9.3 a3: Store plus a real file-backed sidecar and journal inside s2

As a1 but s2 also implements the sidecar files, ordering and the durable pending head itself.

The a1 store with History over fixed file names beside each head, read-time filtering and de-duplication, and a durable pending-head file with replay at startup, all in s2.

**Rejected because:** Complete but crosses into s4's boundary.

## 10. References

- **[[c1]]** `analyze-bundle` `write path and revision rule: src/workflow/storage.ts writeArtifact and workItemAnchorCreatedAt`
- **[[c2]]** `analyze-bundle` `HLD sc4, sc5, sc6 contracts and Gap 7: .insrc/artifacts/HLD-2f27754d4ad00b8e.json and docs/plans/core-data-model.md`
- **[[c3]]** `analyze-bundle` `provenance types in use: src/workflow/artifacts/provenance/types.ts and the build change log`
- **[[c4]]** `analyze-bundle` `write inventory and existing appenders: src/workflow/artifact-write-inventory.ts`
- **[[c5]]** `analyze-bundle` `flat amendment files: src/workflow/amendments/store.ts`
- **[[c6]]** `analyze-bundle` `gates readers: src/workflow/gates.ts readDefineArtifact, readHldArtifact, readLldArtifact, readPlanArtifact`
- **[[c7]]** `analyze-bundle` `s1 identity module and the tests the model extends: src/workflow/artifact-ids.ts`
- **[[c8]]** `doc` `docs/plans/core-data-model.md#binding-requirement-7-the-s2-lld-carries-the-er-definition-2026-10-19`
- **[[c9]]** `prior-artifact` `HLD-2f27754d4ad00b8e sc2 ArtifactEnvelope, sc3 HistoryRecords, sc8 RepoSchemaVersion`

## 11. Open questions

- dm1: new entities under src/workflow/artifact-core cite the nearest existing module as a call site because the new files do not exist yet; confirm this is acceptable
- sbdry3: the WriteJournal port and the Feedback anchor prefix and suffix extension are additions with no HLD amendment; readWithHistory is filed as AMD-7; confirm whether the journal port and the anchor change need amendments too
- sbdry5: s2 defines the WriteJournal port and the appendSidecarLine primitive because binding requirements 1 and 3 touch the write path, while s4 implements the durable journal, layout, ordering, de-duplication and repair; confirm this edge with s4

## Resolved questions

- `qabbd384a` — dm1: new entities under src/workflow/artifact-core cite the nearest existing module as a call site because the new files do not exist yet; confirm this is acceptable
  - **resolved**: Mark as provisional — The new files do not exist yet; the plan names the planned paths and the build replaces them with real call sites. _(2026-10-20T16:36:51.614Z)_
- `qbc16ec4c` — sbdry5: s2 defines the WriteJournal port and the appendSidecarLine primitive because binding requirements 1 and 3 touch the write path, while s4 implements the durable journal, layout, ordering, de-duplication and repair; confirm this edge with s4
  - **resolved**: s2 contracts; s4 durability — Keeps the stated split: s2 defines the WriteJournal port and appendSidecarLine; s4 implements durability against them. Confirm with s4 when its LLD is written. _(2026-10-20T16:37:20.539Z)_

## Citations

- **[[c1]]** `analyze-bundle` `write path and revision rule: src/workflow/storage.ts writeArtifact and workItemAnchorCreatedAt`
- **[[c2]]** `analyze-bundle` `HLD sc4, sc5, sc6 contracts and Gap 7: .insrc/artifacts/HLD-2f27754d4ad00b8e.json and docs/plans/core-data-model.md`
- **[[c3]]** `analyze-bundle` `provenance types in use: src/workflow/artifacts/provenance/types.ts and the build change log`
- **[[c4]]** `analyze-bundle` `write inventory and existing appenders: src/workflow/artifact-write-inventory.ts`
- **[[c5]]** `analyze-bundle` `flat amendment files: src/workflow/amendments/store.ts`
- **[[c6]]** `analyze-bundle` `gates readers: src/workflow/gates.ts readDefineArtifact, readHldArtifact, readLldArtifact, readPlanArtifact`
- **[[c7]]** `analyze-bundle` `s1 identity module and the tests the model extends: src/workflow/artifact-ids.ts`
- **[[c8]]** `doc` `docs/plans/core-data-model.md#binding-requirement-7-the-s2-lld-carries-the-er-definition-2026-10-19`
- **[[c9]]** `prior-artifact` `HLD-2f27754d4ad00b8e sc2 ArtifactEnvelope, sc3 HistoryRecords, sc8 RepoSchemaVersion`

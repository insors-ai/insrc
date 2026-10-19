<!-- insrc:artifact HLD-2f27754d4ad00b8e -->

# HLD: one-common-model-every-artifact

## Summary

Every thing insrc stores becomes an artifact with the same envelope: an identity, a description, a parent, references, a lifecycle and a binding to its tracker issue, with its history and feedback kept beside it in append-only files that merge across clones. Each artifact type keeps only its own content and its renderer. One module names things, one reader and writer handle storage, and a one-time conversion moves a repository to the new shape.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Shared contracts](#4-shared-contracts)
5. [Story boundaries](#5-story-boundaries)
6. [Non-functional targets](#6-non-functional-targets)
7. [Rollout](#7-rollout)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. Problem context

> See **DEF-2f27754d4ad00b8e** § 1. Problem

## 2. Framework summary

Chosen framework (a1): a shared artifact envelope with typed payloads, stored as a head file plus two append-only sidecar files, behind a single identity module and a repository version gate, with one upfront conversion. The envelope carries identity, description, parent, references, a typed lifecycle (revision, approval, review, signoffs, staleness, status) and a tracker binding or attachments; the change log and feedback are separate append-only line files; each existing artifact type shrinks to a payload codec and a renderer.

## 3. Architecture shape

A new artifact core under src/workflow (proposed new modules, not existing ones) holds the envelope model, the identity module that replaces the second id scheme, the reader and writer for the head and the two sidecars, the lifecycle rules and the repository version check. The existing per-type modules in src/workflow/artifacts keep their payload shapes and renderers, and the per-type read functions in src/workflow/gates.ts become thin calls to the one reader. The delivery loader, the gates, the tracker code and the team gate read and write only through that core, and the artifact-write inventory test keeps listing every production file that writes.

The tracker side gains a comment read and an attach operation on the existing port in src/workflow/tracker/port.ts, a typed binding in place of meta.tracker, and a sync that turns human comments into feedback and posts feedback once. Tasks become a Tasks file per plan created when the plan is approved. A conversion command, guarded by a repository version, converts every existing artifact in one commit, back-fills the change log, creates Epic, Story and Task artifacts, and verifies the result through the delivery reader. The work is built behind the version gate in the order of the Story graph, with the conversion last.

## 4. Shared contracts

### 4.1 sc1: ArtifactIdScheme

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s6`, `s7`, `s8`, `s9`

**Purpose:** The single place artifact ids are made and recognised: the existing hierarchical typed ids extended for Epic, Story, Task, the Tasks file and diagrams, one story and task form, and the folder-name date source.

**Interface sketch (type-level):**

```
type ArtifactKind = 'DEF'|'HLD'|'LLD'|'PLAN'|'BUILD'|'CR'|'TESTS'|'EXT'|'AMD'|'SPEC'|'ISSUE'|'EPIC'|'STORY'|'TASK'|'TASKS'|'DIAG';
interface ArtifactKey { kind: ArtifactKind; epicHash: string; story?: string; task?: string; seq?: number }
interface ArtifactIds { make(key: ArtifactKey): string; parse(id: string): ArtifactKey | undefined; parentOf(key: ArtifactKey): ArtifactKey | undefined }
```

**Assumptions cited:** [[c1]]

### 4.2 sc2: ArtifactEnvelope

**Owner Story:** `s2`
**Consumed by:** `s3`, `s4`, `s5`, `s6`, `s7`, `s8`, `s9`

**Purpose:** The common shape of every stored entity and the one reader and writer for it, with References and namespaced Actors.

**Interface sketch (type-level):**

```
interface Actor { id: string; kind: 'person'|'agent'|'system'; name?: string; properties: Record<string, unknown> }
interface Reference { entityId: string; type: string; relation: 'derived-from'|'depends-on'|'tracked-by'|'supersedes'|'documents'|'implements'|'cites'|'reviews'; fragment?: string; quote?: string }
interface Artifact<P> { id: string; description: string; parent?: Reference; references: Reference[]; lifecycle: Lifecycle; binding?: TrackerBinding; attachments: Attachment[]; payload: P }
interface ArtifactStore { read(id: string): Promise<Artifact<unknown>>; write(a: Artifact<unknown>, by: Actor): Promise<void>; childrenOf(id: string): Promise<string[]> }
```

**Assumptions cited:** [[c1]]

### 4.3 sc3: HistoryRecords

**Owner Story:** `s2`
**Consumed by:** `s3`, `s4`, `s5`, `s6`, `s7`, `s8`, `s9`

**Purpose:** The change log entry and the Feedback entry shapes and the append and read API, including how an update says which feedback it addressed.

**Interface sketch (type-level):**

```
type Operation = 'create'|'update'|'delete'|'reparent'|'request-review'|'review'|'approve'|'reject'|'open-signoff'|'signoff-changes'|'signed-off'|'complete'|'reopen'|'withdraw'|'supersede'|'mark-stale'|'ack-stale';
interface ChangeLogEntry { id: string; actor: Actor; timestamp: string; operation: Operation; revision?: { number: number; contentHash: string }; status?: { from: string; to: string }; outcome?: { result: string; summary: string; data?: unknown }; references?: Reference[]; addresses?: 'all' | string[] }
interface Feedback { id: string; text: string; actor: Actor; timestamp: string; feedback: Feedback[]; kind: 'comment'|'suggestion'|'revision-request'; anchor?: { quote?: string; section?: string; lines?: [number, number] }; revision?: number; source?: { system: string; externalId: string; url?: string }; batchId?: string }
interface History { appendLog(id: string, e: ChangeLogEntry): Promise<void>; appendFeedback(id: string, f: Feedback): Promise<void>; log(id: string): Promise<ChangeLogEntry[]>; feedback(id: string): Promise<Feedback[]>; openFeedback(id: string): Promise<Feedback[]> }
```

**Assumptions cited:** [[c1]]

### 4.4 sc4: Lifecycle

**Owner Story:** `s3`
**Consumed by:** `s6`, `s7`, `s8`, `s9`

**Purpose:** The typed lifecycle structures, the ten statuses and their transitions, the revision and content-hash rule, the completion roll-up and the conflict check.

**Interface sketch (type-level):**

```
type Status = 'draft'|'pending-review'|'approved'|'in-signoff'|'changes-requested'|'signed-off'|'rejected'|'completed'|'withdrawn'|'superseded';
interface Revision { number: number; contentHash: string; at: string; by: Actor }
interface Approval { revision: number; by: Actor; at: string; override?: { reason: string } }
interface Review { revision: number; reviewer: Actor; party: 'controller'|'daemon'; verdict: 'pass'|'warn'|'block'; counts: Record<string, number>; at: string; report?: Reference }
interface Signoff { revision: number; request: Reference; state: 'open'|'changes-requested'|'completed'; actors: Actor[]; at: string }
interface Staleness { upstream: Reference; upstreamRevision: number; since: string }
interface Lifecycle { status: Status; revision: Revision; approval?: Approval; review?: Review; signoffs: Signoff[]; stale?: Staleness }
interface LifecycleRules { transition(a: Artifact<unknown>, op: Operation, by: Actor): Promise<Lifecycle>; isConflict(a: Artifact<unknown>): boolean; rollUp(id: string): Promise<Status | undefined> }
```

**Assumptions cited:** [[c1]]

### 4.5 sc5: SidecarStorage

**Owner Story:** `s4`
**Consumed by:** `s5`, `s9`

**Purpose:** How an artifact is stored: the head file and the two append-only line files, their location, the merge rule and the read-time ordering and de-duplication.

**Interface sketch (type-level):**

```
interface ArtifactFiles { head: string; log: string; feedback: string }
interface SidecarStore { filesOf(id: string): ArtifactFiles; appendLine(file: string, line: unknown): Promise<void>; readLines<T>(file: string): Promise<T[]>; mergeAttributes(): string[] }
```

**Assumptions cited:** [[c1]]

### 4.6 sc6: TrackerBinding

**Owner Story:** `s6`
**Consumed by:** `s7`, `s8`, `s9`

**Purpose:** The typed binding between a lifecycle artifact and its tracker issue, the attachments of supporting artifacts, and the tracker port operations to read comments and attach.

**Interface sketch (type-level):**

```
interface TrackerBinding { reference: Reference; createdAtRevision: number; posted: { kind: 'milestone'|'task-list'|'design'|'review'|'plan'; at: string; externalId?: string }[]; pendingLink?: { parent: Reference; child?: Reference; childId?: number } }
interface Attachment { target: Reference; revision: number; at: string; externalId?: string }
interface TrackerPortAdditions { listComments(issue: string, since?: string): PortResult<{ externalId: string; author: string; text: string; at: string; url?: string }[]>; attach(issue: string, artifact: Reference, link: string): PortResult<{ externalId?: string }> }
```

**Assumptions cited:** [[c6]]

### 4.7 sc7: TaskSet

**Owner Story:** `s7`
**Consumed by:** `s8`, `s9`

**Purpose:** The Tasks file of a plan: the Task artifacts, their ids, and how a re-plan is brought into line without reusing an id.

**Interface sketch (type-level):**

```
interface TaskPayload { title: string; summary: string; size: 'S'|'M'|'L'; order: number; acceptanceChecks: string[]; tests: { level: string; name: string }[] }
interface TaskSet { id: string; tasks: Artifact<TaskPayload>[] }
interface TaskSets { createFromPlan(planId: string): Promise<TaskSet>; reconcile(planId: string): Promise<{ changed: string[]; withdrawn: string[]; added: string[] }>; edit(taskId: string, patch: Partial<TaskPayload>, by: Actor): Promise<void> }
```

**Assumptions cited:** [[c1]]

### 4.8 sc8: RepoSchemaVersion

**Owner Story:** `s2`
**Consumed by:** `s9`

**Purpose:** The repository-level marker that says whether a repository has been converted, and the check every tool makes before it reads or writes artifacts.

**Interface sketch (type-level):**

```
interface RepoSchema { version: number; convertedAt?: string }
interface RepoSchemaGate { read(repo: string): RepoSchema; require(repo: string, atLeast: number): { ok: true } | { ok: false; message: string } }
```

**Assumptions cited:** [[c7]]

## 5. Story boundaries

### 5.1 Story E202610192f27754d:S001

**Owns:** `sc1`

The id module and its removal of the second scheme: the folder-name formatter moved into the path scheme, the date source fixed to the epic's creation time, issue titles and the body marker switched to the artifact id with both forms read during the transition, and the delivery module's ordinals. Private to this Story are the exact text of the issue title and the transition reader of the old body marker.

### 5.2 Story E202610192f27754d:S002

**Owns:** `sc2`, `sc3`, `sc8`
**Depends on:** `sc1`

The envelope model, the one reader and writer, the History API over the sidecars as a contract, and the repository version marker. Private to this Story are the head-file schema, the per-type payload codec registry and how the old per-type read functions delegate to the reader.

### 5.3 Story E202610192f27754d:S003

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

The lifecycle rules: status transitions, the revision and content-hash computation, the staleness record, the completion roll-up and the conflict check. Private to this Story are the hash canonicalisation and how a roll-up is cached or recomputed.

### 5.4 Story E202610192f27754d:S004

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`, `sc3`

The physical sidecar storage: file layout, the merge attributes for the line files, read-time ordering and de-duplication, and the check that a merge did not silently combine two heads. Private to this Story are the line format and the file naming beside a head.

### 5.5 Story E202610192f27754d:S005

**Depends on:** `sc1`, `sc2`, `sc3`, `sc5`

People-facing feedback: adding feedback and replies from a client, listing open feedback, the addresses rule at revision time, and the per-user identity declaration with alias linking. Private to this Story are the identity file format and the display of linked identities.

### 5.6 Story E202610192f27754d:S006

**Owns:** `sc6`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`

The typed binding and attachments, the tracker port additions, the per-tracker attach behaviour, the retry of pending links and posts, and the switch of unit-issue bookkeeping to the binding. Private to this Story are the permalink construction per host and the retry bookkeeping.

### 5.7 Story E202610192f27754d:S007

**Owns:** `sc7`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc6`

Task artifacts: creation of the Tasks file and the Task issues at plan approval, direct edits of a Task's own content with local re-approval, refusal of structural edits, and the re-plan reconciliation. Private to this Story are the diff of a Task against the new plan and the build-round recording in a Task's history.

### 5.8 Story E202610192f27754d:S008

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc6`, `sc7`

Comment sync: reading human comments into feedback at implement, validate or on request, classifying a revision request or a suggestion from the first line, and posting feedback once. Private to this Story are the first-line commands, the derived since point and the filter for the framework's own posts.

### 5.9 Story E202610192f27754d:S009

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`, `sc7`, `sc8`

The conversion command: previews, repeats, back-fills history, creates Epic, Story and Task artifacts for what exists, verifies through the delivery reader, and sets the repository version. Private to this Story are the per-type conversion mappings and the verification report.

## 6. Non-functional targets

- **Performance:** Reading an artifact reads its head and, only when asked, its two line files; counts, open feedback and status are computed on read, and the delivery loader still reads each artifact once. A repository of about a thousand artifacts must load in the same order of time as today.
- **Security:** Gates use the live tracker identity only; declared aliases are never trusted for a decision. The identity file is local and read for attribution. Tracker comments are read through the existing gh and glab command paths, with no new credential and no direct REST call.
- **Observability:** Every state change appends a change log entry with actor, operation and, where relevant, revision and status; a conflict, a failed attach and a pending link are logged and surfaced in the unit's result, not hidden.
- **Durability:** Heads are rewritten atomically as today; line files are append-only and de-duplicated by entry id so a repeated append is harmless; the conversion is one commit, repeatable, and reverts with one git revert.

## 7. Rollout

**Phase A — identity and the common model**

**Stories:** `s1`, `s2`

s1 owns sc1 and s2 owns sc2, sc3 and sc8, which every later Story consumes; s2 depends on s1, so they land first, in that order.

**Backward compat:** Existing artifact ids and file names stay; issues already on the tracker keep their titles and are still found by their unit label; the old body marker is still read.

**Phase B — lifecycle and sidecar storage**

**Stories:** `s3`, `s4`
**Flag:** `repoSchemaVersion`

s3 owns sc4 and s4 owns sc5; both depend only on s2, so they can proceed once Phase A is done, and the rest depend on them.

**Backward compat:** The new lifecycle and sidecars exist behind the repository version gate; a repository that has not been converted keeps its old files and is not read by the new code.

**Phase C — feedback and tracker binding**

**Stories:** `s5`, `s6`
**Flag:** `repoSchemaVersion`

s5 consumes sc5 (from s4) and s6 consumes sc4 (from s3) and owns sc6; both depend on Phase B.

**Backward compat:** meta.tracker keeps being read until the conversion replaces it with the binding; the tracker port additions are additive.

**Phase D — Tasks and tracker comment sync**

**Stories:** `s7`, `s8`
**Flag:** `repoSchemaVersion`

s7 depends on s6 for sc6 and owns sc7; s8 depends on s5, s6 and s7, so it follows.

**Backward compat:** A plan's task rows stay readable until the conversion creates Task artifacts for them; plan approval gains the Tasks file only on converted repositories.

**Phase E — conversion and cutover**

**Stories:** `s9`
**Flag:** `repoSchemaVersion`

s9 consumes every contract and depends on s1 to s7, so it is last; it converts the repository, creates Epic, Story and Task artifacts and sets the repository version.

**Backward compat:** The conversion is one commit, can be previewed and repeated, and reverts with one git revert; clones with older tools get a clear message once the commit merges.

**Ordering rationale:** The order follows the Story graph and contract ownership: sc1 (s1) and sc2, sc3, sc8 (s2) first, then sc4 (s3) and sc5 (s4) which depend only on s2, then sc6 (s6) and the people-facing feedback (s5), then sc7 (s7) and comment sync (s8), and the conversion (s9) last because it needs all eight contracts. Phases B to E are built behind the repository version gate so nothing reads a half-built model.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| All-or-nothing cutover | Every reader and writer of the artifact store changes at once per repository, and every clone must upgrade together after the conversion commit merges. | A repository version check with a clear message in both directions, a preview mode, a repeatable conversion and a verification that reads the result back through the delivery reader before the commit is made. |
| Lossy back-fill of history | The change log for existing artifacts is rebuilt from timestamps and names already in the files, which are incomplete for actors and for earlier rounds. | Mark every back-filled entry as migrated, record an unknown-namespace actor where the source is only a name, and never invent an entry the artifact does not support. |
| Breadth of the change | Defining the envelope touches every artifact type, the gates, the delivery loader, the tracker code and the team gate, and a missed writer would bypass the lifecycle and the log. | Route every write through one writer, keep the artifact-write inventory test as a gate, and build behind the version gate in the order of the Story graph. |

## 8. Alternatives considered

### 8.1 a1: Shared envelope with typed payloads, head plus sidecar files, one cutover — **CHOSEN**

A single artifact module owns the common envelope (identity, parent, references, lifecycle, binding) and the append-only log and feedback sidecars; each artifact type keeps only its payload codec and renderer; one upfront conversion moves the repository to it.

A new artifact module defines the Artifact envelope as one TypeScript model and one reader and writer pair. The head file holds identity, description, parent, references, lifecycle, binding or attachments and the payload; the change log and feedback live in two append-only line files beside it. The existing per-type modules (define, hld, lld, plan, spec, issue, extend) shrink to a payload codec and a renderer, and the per-type read functions in gates.ts become thin calls to the one reader. One ID module replaces the two schemes, the Tasks file is one more artifact kind, and the tracker port gains listComments and attach.

The repository moves to the new shape in a single conversion command guarded by a repo-level version, so every reader (the delivery loader, the gates, the tracker code) sees only the new model and carries no adapter. The model is built behind the version gate in dependency order, and the conversion is the last story. This gives the uniform shape the Epic asks for and removes the duplicated fields, at the cost of touching every artifact type and every reader.

**Pros:**
- One reader and one writer for every artifact type, so the delivery loader and the gates stop knowing each type
- No read-through adapter: after conversion there is exactly one shape in the repository
- The lifecycle, change log and feedback are implemented once and shared by every type, including Tasks and diagrams
- Append-only sidecars merge cleanly across clones, and a hash check turns a silent merge into a reported conflict

**Cons:**
- Touches every artifact type, every reader of the artifact store and the tracker code in one release line, and the cutover is all-or-nothing per repository
- A team must upgrade every clone together after the conversion commit merges
- Needs the conversion to back-fill history from what artifacts already record, which is lossy for actors and timestamps

**Cost estimate:** L

### 8.2 a2: Read-through overlay on the existing artifact files

Keep every artifact type's file shape and add a view layer that presents the common model on read, with new data (change log, feedback, binding) in sidecars.

The per-type files stay exactly as they are, with their own meta and body. A view layer maps each type's meta and body onto the common shape on read (approval, review, revision and staleness from meta, references from citations and tracker meta), and the sidecars hold only what does not exist today: the change log, the feedback entries, Task artifacts and tracker attachments. Writers continue to go through the per-type paths and also append to the log.

Nothing has to be converted, so there is no cutover and no version gate, and old and new clones keep working. The delivery loader and the gates read through the view. The cost is that two shapes live in the repository for good, every new field has to be mapped by a per-type adapter, and the loose fields the Epic wants to remove remain the stored truth.

**Pros:**
- No conversion command and no cutover; older clones keep reading the repository
- Smallest change to existing writers and renderers
- New sidecar data can ship type by type

**Cons:**
- Two representations of the same facts exist for good: the stored per-type fields and the view built from them, which can disagree
- Every new lifecycle structure needs a mapper per artifact type, which is the per-type knowledge the Epic is meant to remove
- The upfront-conversion decision and the delivery board's need for one consistent shape are not met, and a mixed repository is the normal state

**Cost estimate:** M

**Rejected because:** Satisfies k2, k4, k5, k7 and k9 but only partly k1, k3, k6 and k8, and it leaves a mixed repository as the normal state, which the delivery board cannot read as one shape.

### 8.3 a3: Log-derived state: the change log as the only source of truth

Every artifact is an append-only log of operations; the head file is a cache rebuilt by replaying the log.

Each artifact is stored as its change log, with content snapshots at content operations. Status, revision, approval, review, signoffs, binding and completion are all folded from the log by one replay function, and the head file is only a cache that can be deleted and rebuilt. Feedback and tracker posts are also log entries.

This makes history complete and gives one place to look for any fact, and the union merge applies to the whole artifact. The price is that every reader must replay or trust a cache, content snapshots in a line file are large, the ordering of concurrent entries from two clones needs a defined rule, and the current per-type renderers and the delivery loader would all need a rebuilt head to read.

**Pros:**
- History is complete by construction and nothing can disagree with the log
- The whole artifact merges as append-only lines

**Cons:**
- Concurrent entries from two clones need an ordering rule, and a wrong fold can change the status silently
- Content snapshots make line files large and slow to replay without a cache
- A much larger departure from the current files than the Epic asks for, and every reader depends on a replay or a cache that can go stale

**Cost estimate:** L

**Rejected because:** Satisfies most constraints but is partial on k3 and k8 because correctness depends on how concurrent entries from two clones are ordered, and it is the largest departure from the current files.

## 9. References

- **[[c1]]** `doc` `docs/plans/core-data-model.md` — "All twelve gaps are settled"
- **[[c2]]** `code` `src/workflow/storage.ts`
- **[[c3]]** `code` `src/workflow/id.ts`
- **[[c4]]** `code` `src/workflow/artifacts/provenance/types.ts`
- **[[c5]]** `code` `src/workflow/delivery/graph.ts`
- **[[c6]]** `code` `src/workflow/tracker/port.ts`
- **[[c7]]** `stakeholder` `owner rulings in chat, 2026-10-19 (Subho Ghosh)`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.epic (design.epic)

**7 do not hold · 1 could not be verified · 3 hold** · template `design-spec` · model `cli-codex:gpt-6-astra` · reviewed 2026-10-19T10:33:35.246Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| coverage-of-intent | HIGH | The shared history contracts support the upstream requirement that Tasks share sidecars while retaining separate histories. | Core-data-model Gap 11 requires sidecars 'shared by the file, each line keyed by the Task id'. HLD sc3's ChangeLogEntry and Feedback contain an entry id but no owning artifact id; sc5 persists arbitrary lines without specifying an ownership wrapper. Once several Tasks share a file, the declared stored records cannot identify whose history or feedback each entry belongs to. [files: docs/plans/core-data-model.md, docs/epics/one-common-model-every-artifact-E202610192f27754d/HLD.md] | Define a persisted sidecar record containing the owning artifact id and entry, and specify per-Task filtering and deduplication across the shared files. |
| current-behaviour | HIGH | GitLab comment sync can reuse an existing glab command path. | loadTracker unconditionally constructs createGithubTracker after target resolution. strictEntry rejects any configured type other than github or none with 'unsupported tracker type'. Searching production src found no glab implementation. GitLab support therefore cannot be delivered merely by adding operations to the existing adapter. [files: src/workflow/tracker/github-adapter.ts, src/workflow/config/github.ts, src/workflow/tracker/port.ts] | Assign implementation of the GitLab adapter, command execution and target selection explicitly, and likewise account for the promised Jira attachment support. |
| change-sites | HIGH | The identity replacement inventory covers the responsibilities needed to remove src/workflow/id.ts. | Beyond folder and work-item identities, id.ts implements mintFrId, parseFrId and isFrId. assembleFunctionalDefinition calls mintFrId for both document and Story requirements; validateFunctionalDefinition imports isFrId and rejects identifiers it does not recognize. HLD s1 and sc1 provide no replacement or preservation contract for these functional-requirement identifiers. [files: src/workflow/id.ts, src/workflow/orchestrator.ts, src/workflow/artifacts/functional-definition.ts, src/workflow/__tests__/fr-id.test.ts] | Include functional-requirement identity helpers and their callers in s1, preserving stored FR ids and validation while relocating their implementation. |
| data-compatibility | HIGH | The proposed repository marker makes existing older tools reject converted repositories with a clear upgrade message. | readDefineArtifact directly returns 'JSON.parse(raw) as DefineArtifact' without a repository-version check. The delivery loader similarly reads files directly; liftStoreFile returns 'record has no meta object' for a new envelope and 'unknown-kind' for new prefixes. A marker introduced only in the new implementation cannot make these older readers issue the promised upgrade refusal. [files: src/workflow/gates.ts, src/workflow/delivery/load.ts, docs/epics/one-common-model-every-artifact-E202610192f27754d/HLD.md] | Require a compatibility release with an upper-version guard before conversion, identify the minimum supported old version, and explicitly handle clients predating that guard. |
| data-compatibility | HIGH | Keeping all existing ids and filenames is compatible with normalizing standalone S001 to s1 without a legacy-id mechanism. | Existing records include LLD-1f7ade1a889013da-S001.json with 'storyId': 'S001'. Core-data-model Gap 12 explicitly requires the standalone normalization to keep the old id as 'legacyIds'. The HLD instead promises unchanged ids and filenames while requiring one Story form, and its envelope and conversion contract omit alias resolution. [files: .insrc/artifacts/LLD-1f7ade1a889013da-S001.json, docs/plans/core-data-model.md, docs/epics/one-common-model-every-artifact-E202610192f27754d/HLD.md] | Specify the standalone exception, persist legacy ids, and define how old references and filenames resolve after normalization. |
| error-paths | HIGH | Reading sidecars only when requested satisfies the required read-time revision-fork detection. | Core-data-model Gap 10 requires 'on every read' that the head hash match both payload plus description and 'the last content entry in the log'. HLD §6 instead reads the head and 'only when asked' the sidecars. Its isConflict(a) receives an Artifact containing no log evidence. A head-only check cannot detect a valid-looking head that disagrees with the merged content history. [files: docs/plans/core-data-model.md, docs/epics/one-common-model-every-artifact-E202610192f27754d/HLD.md, src/workflow/storage.ts] | Require log validation on every authoritative read or define an equally strong integrity mechanism; make approval, review and completion refuse failed validation. |
| tests | MED | Every upstream acceptance criterion maps to a test in this design. | The DEF defines ac1 through ac29. The HLD names only the artifact-write inventory test and conversion verification, with no acceptance-to-test mapping. The existing inventory test scans production writer calls and checks their classification; it does not verify lifecycle transitions, merged sidecars, Task reconciliation, tracker deduplication or old-client rejection. [files: docs/epics/one-common-model-every-artifact-E202610192f27754d/DEF.md, docs/epics/one-common-model-every-artifact-E202610192f27754d/HLD.md, src/workflow/__tests__/artifact-write-inventory.test.ts, src/workflow/artifact-write-inventory.ts] | Add an ac1–ac29 test matrix assigning each scenario to an owning Story and test level, including merge, partial-failure and compatibility cases. |

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| error-paths | The new writer can recover consistently from a failure between replacing a head and appending its history. | I read writeAtomic and writeArtifact: current atomicity covers one file replacement only. The HLD introduces separate head and history writes but specifies neither their ordering nor recovery after one succeeds and the other fails. No transaction or recovery protocol is provided by sc2, sc3 or sc5. [files: src/workflow/storage.ts, docs/epics/one-common-model-every-artifact-E202610192f27754d/HLD.md] | Define write ordering, retry identity and recovery for partial writes, including how callers distinguish a committed operation from one requiring repair. |

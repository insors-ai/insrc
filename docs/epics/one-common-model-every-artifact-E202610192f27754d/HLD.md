<!-- insrc:artifact HLD-2f27754d4ad00b8e -->

# HLD: one-common-model-every-artifact

## Summary

Every thing insrc stores becomes an artifact with the same envelope: an identity, a description, a parent, references, a lifecycle and a binding to its tracker issue, with its history and feedback kept beside it in append-only files that merge across clones. Each artifact type keeps only its own content and its renderer. One module names things, one reader and writer handle storage, and a one-time conversion moves a repository to the new shape. Nothing is kept for older data or older tools.

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

Chosen framework (a1): a shared artifact envelope with typed payloads, stored as a head file plus two append-only sidecar files whose lines carry the owning artifact id, behind a single identity module, with one upfront conversion and no compatibility code. The envelope carries identity, description, parent, references, a typed lifecycle (revision, approval, review, signoffs, staleness, status) and a tracker binding or attachments; the change log and feedback are separate append-only line files; each existing artifact type shrinks to a payload codec and a renderer. Tracker comment reading and attaching are added to the port and implemented for the GitHub adapter only.

## 3. Architecture shape

A new artifact core under src/workflow (proposed new modules, not existing ones) holds the envelope model, the identity module that replaces the second id scheme and takes over the functional-requirement id helpers now in src/workflow/id.ts, the reader and writer for the head and the two sidecars, and the lifecycle rules. The existing per-type modules in src/workflow/artifacts keep their payload shapes and renderers, and the per-type read functions in src/workflow/gates.ts become thin calls to the one reader. The delivery loader, the gates, the tracker code and the team gate read and write only through that core, and the artifact-write inventory test keeps listing every production file that writes. Sidecar lines are records of the form { artifactId, entry }, so several Tasks can share one pair of files; a reader filters by artifact id and drops duplicates by (artifactId, entry id).

A write appends its change log entry first (a repeat is harmless because entries are de-duplicated by id) and then replaces the head atomically. A log whose last content entry names a newer revision than the head is a repairable gap, and the next write completes it; a head newer than its log, or a head whose content hash differs from the last content entry in the log, is a conflict. Approve, review and complete read the log tail on every call and refuse a conflict; ordinary reads need only the head. The tracker side gains listComments and attach on the existing port in src/workflow/tracker/port.ts, implemented in the GitHub adapter (the only adapter that exists; GitLab and Jira adapters are a later epic), a typed binding in place of meta.tracker, and a sync that turns human comments into feedback and posts feedback once. Tasks become a Tasks file per plan created when the plan is approved. The conversion command converts every existing artifact in one commit, renames standalone S001 to s1 with the references it can rewrite and no alias, back-fills the change log, creates Epic, Story and Task artifacts, sets a repository version, and verifies the result through the delivery reader; new tools refuse an unconverted repository. Older clones, unconverted artifacts and the old issue-body marker are not supported on this branch.

Acceptance-to-test matrix (owning Story, level): ac1 s1 integration (existing artifacts and the FR id helpers load through the one id module); ac2 s1 integration (new issue titles, with a fake tracker); ac3 s1 unit (folder date source); ac4 s2 integration (the reader over every artifact type); ac5 s2 unit (empty lifecycle parts); ac6 s2 unit (reference shape and parent chain); ac7 and ac8 s3 unit (revision moves only on a content hash change); ac9 s3 integration (roll-up through Tasks, Stories and the Epic); ac10 s3 integration (conflict from the log tail refuses approve, review and complete); ac11 s4 integration (two real clones merge sidecars); ac12 s4 integration (a round's outcome in the log); ac13 s4 integration (a real head conflict); ac14 to ac16 s5 integration (feedback, addressed rule, namespaced actors); ac17 to ac19 s6 integration (binding, GitHub permalink attach through a fake gh, retried pending work); ac20 to ac23 s7 integration (Tasks file at plan approval, direct edits, refused structural edits, re-plan); ac24 to ac26 s8 integration (comment sync with a fake tracker); ac27 and ac28 s9 integration (conversion, preview, repeat and verification on a fixture repository); ac29 s9 integration (new tools refuse an unconverted repository).

## 4. Shared contracts

### 4.1 sc1: ArtifactIdScheme

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s6`, `s7`, `s8`, `s9`

**Purpose:** The single place artifact ids are made and recognised: the existing hierarchical typed ids extended for Epic, Story, Task, the Tasks file and diagrams, one story and task form, the folder-name date source, and the functional-requirement id helpers that live in id.ts today.

**Interface sketch (type-level):**

```
type ArtifactKind = 'DEF'|'HLD'|'LLD'|'PLAN'|'BUILD'|'CR'|'TESTS'|'EXT'|'AMD'|'SPEC'|'ISSUE'|'EPIC'|'STORY'|'TASK'|'TASKS'|'DIAG';
interface ArtifactKey { kind: ArtifactKind; epicHash: string; story?: string; task?: string; seq?: number }
interface ArtifactIds { make(key: ArtifactKey): string; parse(id: string): ArtifactKey | undefined; parentOf(key: ArtifactKey): ArtifactKey | undefined }
interface RequirementIds { mint(epicHash: string, createdAt: string, ordinal: number, storyId?: string): string; parse(id: string): { epicHash: string; ordinal: number; storyId?: string } | undefined; isRequirementId(s: string): boolean }
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

**Purpose:** The change log entry and the Feedback entry shapes, the persisted sidecar record that carries the owning artifact id, and the append and read API, including how an update says which feedback it addressed.

**Interface sketch (type-level):**

```
type Operation = 'create'|'update'|'delete'|'reparent'|'request-review'|'review'|'approve'|'reject'|'open-signoff'|'signoff-changes'|'signed-off'|'complete'|'reopen'|'withdraw'|'supersede'|'mark-stale'|'ack-stale';
interface ChangeLogEntry { id: string; actor: Actor; timestamp: string; operation: Operation; revision?: { number: number; contentHash: string }; status?: { from: string; to: string }; outcome?: { result: string; summary: string; data?: unknown }; references?: Reference[]; addresses?: 'all' | string[] }
interface Feedback { id: string; text: string; actor: Actor; timestamp: string; feedback: Feedback[]; kind: 'comment'|'suggestion'|'revision-request'; anchor?: { quote?: string; section?: string; lines?: [number, number] }; revision?: number; source?: { system: string; externalId: string; url?: string }; batchId?: string }
interface SidecarRecord<E> { artifactId: string; entry: E }
interface History { appendLog(id: string, e: ChangeLogEntry): Promise<void>; appendFeedback(id: string, f: Feedback): Promise<void>; log(id: string): Promise<ChangeLogEntry[]>; logTail(id: string): Promise<ChangeLogEntry | undefined>; feedback(id: string): Promise<Feedback[]>; openFeedback(id: string): Promise<Feedback[]> }
```

**Assumptions cited:** [[c1]]

### 4.4 sc4: Lifecycle

**Owner Story:** `s3`
**Consumed by:** `s6`, `s7`, `s8`, `s9`

**Purpose:** The typed lifecycle structures, the ten statuses and their transitions, the revision and content-hash rule, the completion roll-up and the conflict check against the log tail.

**Interface sketch (type-level):**

```
type Status = 'draft'|'pending-review'|'approved'|'in-signoff'|'changes-requested'|'signed-off'|'rejected'|'completed'|'withdrawn'|'superseded';
interface Revision { number: number; contentHash: string; at: string; by: Actor }
interface Approval { revision: number; by: Actor; at: string; override?: { reason: string } }
interface Review { revision: number; reviewer: Actor; party: 'controller'|'daemon'; verdict: 'pass'|'warn'|'block'; counts: Record<string, number>; at: string; report?: Reference }
interface Signoff { revision: number; request: Reference; state: 'open'|'changes-requested'|'completed'; actors: Actor[]; at: string }
interface Staleness { upstream: Reference; upstreamRevision: number; since: string }
interface Lifecycle { status: Status; revision: Revision; approval?: Approval; review?: Review; signoffs: Signoff[]; stale?: Staleness }
type Integrity = { ok: true } | { ok: false; reason: 'hash-mismatch'|'head-ahead-of-log'|'log-ahead-of-head' }
interface LifecycleRules { transition(a: Artifact<unknown>, op: Operation, by: Actor): Promise<Lifecycle>; checkIntegrity(a: Artifact<unknown>, logTail: ChangeLogEntry | undefined): Integrity; rollUp(id: string): Promise<Status | undefined> }
```

**Assumptions cited:** [[c1]]

### 4.5 sc5: SidecarStorage

**Owner Story:** `s4`
**Consumed by:** `s5`, `s9`

**Purpose:** How an artifact is stored: the head file and the two append-only line files shared by a Tasks file, their location, the merge rule, the per-artifact filtering and the read-time ordering and de-duplication.

**Interface sketch (type-level):**

```
interface ArtifactFiles { head: string; log: string; feedback: string }
interface SidecarStore { filesOf(id: string): ArtifactFiles; appendRecord<E>(file: string, record: SidecarRecord<E>): Promise<void>; readRecords<E>(file: string, artifactId: string): Promise<E[]>; mergeAttributes(): string[] }
```

**Assumptions cited:** [[c1]]

### 4.6 sc6: TrackerBinding

**Owner Story:** `s6`
**Consumed by:** `s7`, `s8`, `s9`

**Purpose:** The typed binding between a lifecycle artifact and its tracker issue, the attachments of supporting artifacts, and the tracker port operations to read comments and attach, implemented for the GitHub adapter.

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

**Purpose:** The repository-level marker that records whether a repository has been converted, so the conversion is repeatable and the new tools refuse an unconverted repository.

**Interface sketch (type-level):**

```
interface RepoSchema { version: number; convertedAt?: string }
interface RepoSchemaGate { read(repo: string): RepoSchema; require(repo: string, atLeast: number): { ok: true } | { ok: false; message: string } }
```

**Assumptions cited:** [[c7]]

## 5. Story boundaries

### 5.1 Story E202610192f27754d:S001

**Owns:** `sc1`

The id module and its removal of the second scheme: the folder-name formatter moved into the path scheme, the date source fixed to the epic's creation time, the functional-requirement id helpers and their callers moved with stored FR ids staying valid, issue titles switched to the artifact id, and the delivery module's ordinals. The old issue-body marker is not read. Private to this Story are the exact text of the issue title and the relocation of the helpers.

### 5.2 Story E202610192f27754d:S002

**Owns:** `sc2`, `sc3`, `sc8`
**Depends on:** `sc1`

The envelope model, the one reader and writer, the History API and the sidecar record shape as a contract, and the repository version marker. Private to this Story are the head-file schema, the per-type payload codec registry and how the old per-type read functions delegate to the reader.

### 5.3 Story E202610192f27754d:S003

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

The lifecycle rules: status transitions, the revision and content-hash computation, the staleness record, the completion roll-up and the integrity check against the log tail on approve, review and complete. Private to this Story are the hash canonicalisation and how a roll-up is cached or recomputed.

### 5.4 Story E202610192f27754d:S004

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`, `sc3`

The physical sidecar storage: file layout, the merge attributes for the line files, per-artifact filtering, read-time ordering and de-duplication, and the write order of log entry before head with the repair of a log that is ahead of its head. Private to this Story are the line format and the file naming beside a head.

### 5.5 Story E202610192f27754d:S005

**Depends on:** `sc1`, `sc2`, `sc3`, `sc5`

People-facing feedback: adding feedback and replies from a client, listing open feedback, the addresses rule at revision time, and the per-user identity declaration with alias linking. Private to this Story are the identity file format and the display of linked identities.

### 5.6 Story E202610192f27754d:S006

**Owns:** `sc6`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`

The typed binding and attachments, the tracker port additions implemented for GitHub, the retry of pending links and posts, and the switch of unit-issue bookkeeping to the binding. Private to this Story are the permalink construction and the retry bookkeeping.

### 5.7 Story E202610192f27754d:S007

**Owns:** `sc7`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc6`

Task artifacts: creation of the Tasks file and the Task issues at plan approval, direct edits of a Task's own content with local re-approval, refusal of structural edits, and the re-plan reconciliation. Private to this Story are the diff of a Task against the new plan and the build-round recording in a Task's history.

### 5.8 Story E202610192f27754d:S008

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc6`, `sc7`

Comment sync: reading human comments into feedback at implement, validate or on request, classifying a revision request or a suggestion from the first line, and posting feedback once. Private to this Story are the first-line commands, the derived since point and the filter for the framework's own posts.

### 5.9 Story E202610192f27754d:S009

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`, `sc7`, `sc8`

The conversion command: previews, repeats, back-fills history, renames standalone S001 to s1 rewriting the references it can with no alias, creates Epic, Story and Task artifacts for what exists, verifies through the delivery reader, and sets the repository version. Private to this Story are the per-type conversion mappings and the verification report.

## 6. Non-functional targets

- **Performance:** Reading an artifact reads its head; the log tail is read only on approve, review and complete, and counts, open feedback and status are computed on read. The delivery loader still reads each artifact once. Loading a repository of about a thousand artifacts must stay within twice today's load time on the same machine.
- **Security:** Gates use the live tracker identity only; declared aliases are never trusted for a decision. The identity file is local and read for attribution. Tracker comments are read through the existing gh path of the GitHub adapter, with no new credential and no direct REST call.
- **Observability:** Every state change appends a change log entry with actor, operation and, where relevant, revision and status; a conflict, a log-ahead-of-head repair, a failed attach and a pending link are logged and surfaced in the unit's result, not hidden.
- **Durability:** Heads are replaced atomically as today; sidecar lines are append-only and de-duplicated by (artifactId, entry id) so a repeated append is harmless; a write appends its log entry before it replaces the head so a failure between the two leaves a detectable, repairable gap; the conversion is one commit, repeatable, and reverts with one git revert.

## 7. Rollout

**Phase A — identity and the common model**

**Stories:** `s1`, `s2`

s1 owns sc1 and s2 owns sc2, sc3 and sc8, which every later Story consumes; s2 depends on s1, so they land first, in that order.

**Backward compat:** No compatibility is kept: the old body marker is not read and no alias is kept for renamed ids; issues already on the tracker keep their titles and are still found by their unit label.

**Phase B — lifecycle and sidecar storage**

**Stories:** `s3`, `s4`
**Flag:** `repoSchemaVersion`

s3 owns sc4 and s4 owns sc5; both depend only on s2, so they can proceed once Phase A is done, and the rest depend on them.

**Backward compat:** The new lifecycle and sidecars are used only on a converted repository; an unconverted repository is refused by the new tools.

**Phase C — feedback and tracker binding**

**Stories:** `s5`, `s6`
**Flag:** `repoSchemaVersion`

s5 consumes sc5 (from s4) and s6 consumes sc4 (from s3) and owns sc6; both depend on Phase B.

**Backward compat:** The tracker port additions are additive; meta.tracker is replaced by the binding at the conversion, with no reader kept for the old form.

**Phase D — Tasks and tracker comment sync**

**Stories:** `s7`, `s8`
**Flag:** `repoSchemaVersion`

s7 depends on s6 for sc6 and owns sc7; s8 depends on s5, s6 and s7, so it follows.

**Backward compat:** Plan approval creates the Tasks file only on converted repositories.

**Phase E — conversion and cutover**

**Stories:** `s9`
**Flag:** `repoSchemaVersion`

s9 consumes every contract and depends on s1 to s7, so it is last; it converts the repository, creates Epic, Story and Task artifacts, renames standalone S001 to s1 and sets the repository version.

**Backward compat:** The conversion is one commit, can be previewed and repeated, and reverts with one git revert; older clones and unconverted artifacts are not supported.

**Ordering rationale:** The order follows the Story graph and contract ownership: sc1 (s1) and sc2, sc3, sc8 (s2) first, then sc4 (s3) and sc5 (s4) which depend only on s2, then sc6 (s6) and the people-facing feedback (s5), then sc7 (s7) and comment sync (s8), and the conversion (s9) last because it needs all eight contracts. Phases B to E are built behind the repository version gate so nothing reads a half-built model.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| All-or-nothing cutover | Every reader and writer of the artifact store changes at once per repository, and nothing is kept for older clones or unconverted data. | A preview mode, a repeatable conversion, a verification that reads the result back through the delivery reader before the commit is made, and a conversion that is one commit and reverts with one git revert. |
| Lossy back-fill of history | The change log for existing artifacts is rebuilt from timestamps and names already in the files, which are incomplete for actors and for earlier rounds. | Mark every back-filled entry as migrated, record an unknown-namespace actor where the source is only a name, and never invent an entry the artifact does not support. |
| Breadth of the change | The envelope touches every artifact type, the gates, the delivery loader, the tracker code and the team gate, and a missed writer would bypass the lifecycle and the log; the head and its log entry are also written separately. | Route every write through one writer that appends the log entry before replacing the head, keep the artifact-write inventory test as a gate, and build behind the version gate in the order of the Story graph. |

## 8. Alternatives considered

### 8.1 a1: Shared envelope with typed payloads, head plus sidecar files, one cutover, no compatibility code — **CHOSEN**

A single artifact module owns the common envelope and the append-only log and feedback sidecars; each artifact type keeps only its payload codec and renderer; one upfront conversion moves the repository, and nothing is kept for older data or older tools.

A new artifact module defines the Artifact envelope as one TypeScript model and one reader and writer pair. The head file holds identity, description, parent, references, lifecycle, binding or attachments and the payload; the change log and feedback live in two append-only line files beside it, each line carrying the id of the artifact it belongs to so several Tasks can share one file. The existing per-type modules shrink to a payload codec and a renderer, the per-type read functions in gates.ts become thin calls to the one reader, and the functional-requirement id helpers in id.ts move with the single id module. The tracker port gains listComments and attach, implemented for the existing GitHub adapter only.

The repository moves to the new shape in a single conversion command; the new tools require a converted repository and the conversion is the last story. There is no read-through adapter, no alias for renamed ids, no reader for the old issue-body marker and no guard release for older clones: on the v2 branch things may break and artifacts are handled manually. Every authoritative read (approve, review, complete) checks the head's content hash against the last content entry in the log, and a head is written only after its log entry so a failure between the two is detectable and repairable.

**Pros:**
- One reader and one writer for every artifact type, so the delivery loader and the gates stop knowing each type
- After the conversion there is exactly one shape and no compatibility code to maintain
- The lifecycle, change log and feedback are implemented once and shared by every type, including Tasks and diagrams
- Append-only sidecars keyed by artifact id merge cleanly across clones, and the log-tail check turns a silent merge into a reported conflict

**Cons:**
- Touches every artifact type, every reader of the artifact store and the tracker code, and the cutover is all-or-nothing per repository
- Older clones and artifacts that are not converted break, which the owner has accepted for this branch
- The conversion back-fills history from what artifacts already record, which is lossy for actors and timestamps

**Cost estimate:** L

### 8.2 a2: Read-through overlay on the existing artifact files

Keep every artifact type's file shape and add a view layer that presents the common model on read, with new data in sidecars.

The per-type files stay exactly as they are, with their own meta and body. A view layer maps each type's meta and body onto the common shape on read, and the sidecars hold only what does not exist today: the change log, the feedback entries, Task artifacts and tracker attachments. Writers continue to go through the per-type paths and also append to the log.

Nothing has to be converted, so there is no cutover and old and new clones keep working. The delivery loader and the gates read through the view. The cost is that two shapes live in the repository for good, every new field needs a per-type mapper, and the loose fields the Epic wants to remove remain the stored truth. It is also exactly the compatibility layer the owner has ruled out.

**Pros:**
- No conversion command and no cutover; older clones keep reading the repository
- Smallest change to existing writers and renderers
- New sidecar data can ship type by type

**Cons:**
- Two representations of the same facts exist for good, which can disagree
- Every new lifecycle structure needs a mapper per artifact type, which is the per-type knowledge the Epic is meant to remove
- A permanent compatibility layer, which the owner has ruled out, and a mixed repository the delivery board cannot read as one shape

**Cost estimate:** M

**Rejected because:** Satisfies k2, k4, k5, k7 and k9 but only partly k1, k3, k6 and k8, and it is a permanent compatibility layer the owner has ruled out.

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

**6 do not hold · 0 could not be verified · 5 hold** · template `design-spec` · model `cli-codex:gpt-6-astra` · reviewed 2026-10-19T10:49:03.425Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| change-sites | HIGH | Keeping the existing writer-inventory test is sufficient to detect every new artifact writer. | The detector's WRITER_NAMES is exactly ['writeArtifact', 'writeRecordFile', 'writeAtomic', 'writeFileSync', 'renameSync']. It does not recognize appendFileSync, appendRecord, or the proposed store.write. Merely keeping the test would allow new sidecar write paths to bypass its inventory checks. [files: src/workflow/artifact-write-inventory.ts, src/workflow/__tests__/artifact-write-inventory.test.ts] | Assign an owner to extend the detector and negative controls for the new writer APIs and append primitives. |
| data-compatibility | HIGH | The proposed RequirementIds.parse contract can preserve existing FR IDs while returning their epicHash. | mintFrId stores only `E${utcDate(createdAtISO)}${hash8Of(epicHash)}`; hash8Of truncates to eight characters. parseFrId returns { date, hash8, story?, fr }, not a full epicHash. A pure parse(id) cannot recover the missing eight hash characters required by the proposed contract. [files: src/workflow/id.ts, src/workflow/artifacts/functional-definition.ts, src/workflow/orchestrator.ts] | Preserve date and hash8 in the parsed FR type, or introduce an explicit repository-backed resolver with ambiguity handling. Keep existing FR strings valid. |
| error-paths | HIGH | A log-ahead-of-head gap can always be completed by the next write using the specified records. | sc3 records a revision number and content hash but no required content snapshot or replayable patch. Existing writeAtomic stores only the replacement bytes in a temporary file; it provides no durable recovery journal. If the process dies after appending the log and before writing the new head, the promised replacement content need not exist anywhere. A later unrelated write cannot reconstruct it from a hash. [files: src/workflow/storage.ts, docs/plans/core-data-model.md, .insrc/artifacts/HLD-2f27754d4ad00b8e.json] | Persist recoverable pending head content before committing the log, or require replay of the identical operation and refuse unrelated writes until recovery. Define crash handling at every write boundary. |
| error-paths | HIGH | The specified feedback and tracker contracts support durable, once-only outbound posting. | IssueOps.comment returns PortResult<void>; ghComment discards output. The HLD adds listComments and attach but no posting receipt or idempotency contract. Feedback is immutable and duplicate IDs are dropped, so appending the same feedback ID with a newly populated source does not define a durable update. A successful remote post followed by a crash before local recording can be posted again. [files: src/workflow/tracker/port.ts, src/workflow/tracker/github.ts, docs/plans/core-data-model.md, .insrc/artifacts/HLD-2f27754d4ad00b8e.json] | Define a durable append-only posting receipt keyed by feedback ID, a stable marker in outbound comments, and reconciliation through listComments before retrying an uncertain post. |
| data-compatibility | MED | The proposed feedback shape can preserve existing inline anchors during conversion. | Existing FeedbackAnchor includes quote, sectionSlug, prefix and suffix. The settled Gap 5 also includes prefix and suffix, but sc3 omits both. Conversion into that contract loses the context used to relocate a quote after edits. [files: src/workflow/artifacts/provenance/types.ts, docs/plans/core-data-model.md] | Retain prefix and suffix in sc3 and specify the sectionSlug-to-section conversion. |
| tests | MED | The acceptance-to-test matrix covers all behavior required by ac7. | The DEF's ac7 requires revision advancement, return to draft, and retention of the previous approval and review against the older revision. The HLD maps ac7 and ac8 only to 'revision moves only on a content hash change'. Existing writeArtifact handles numeric revision minting but does not implement those new lifecycle semantics, so revision-only assertions cannot verify ac7. [files: .insrc/artifacts/DEF-2f27754d4ad00b8e.json, .insrc/artifacts/HLD-2f27754d4ad00b8e.json, src/workflow/storage.ts] | Expand the ac7 test mapping to assert draft status and preservation of prior decision records with their original revision bindings. |

#### Could not verify (does not block)

_None._

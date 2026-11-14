<!-- insrc:artifact LLD-470a1f61b26b12c6-s1 -->

# LLD: STORY-470a1f61b26b12c6-s1 — Rework review preparation and context lifecycle end to end

## Summary

**Epic:** `rework-review-preparation-context-lifecycle-end`
**HLD base run:** `wf-1794655838217-bnsgsk`
**HLD effective hash:** `f2e6e79848fc...`

Preparation becomes one lifecycle-wide responsibility for both code and design review. Complete qualified context is reused under a private daemon-owned generation, while author, workflow and artifact freshness remain independently checked. Pinned input/feedback history stays in the review checkpoint; bounded live process/progress state moves out of the large history file, removing per-command rewrite amplification. Cold recovery, cancellation and publication use the same authority and durability rules as normal execution.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `prepareReviewAdmission`

```typescript
prepareReviewAdmission(project: string, reviewId: string, attempt: number, input: unknown, reviewer: ReviewerParty, sources: ReviewSources, context?: ReviewAdmissionContext): Promise<AdmittedReview>
```

**Parameters:**
- `project: string` — Canonical registered project
- `reviewId: string` — Existing exact review identity
- `attempt: number` — Pinned sequential attempt
- `input: unknown` — Complete submitted packet or pinned resume input
- `reviewer: ReviewerParty` — Host-resolved independent party
- `sources: ReviewSources` — Session-scoped verified/batched source interface
- `context: ReviewAdmissionContext` _(optional)_ — Existing route/recovery context plus private preparation-session capability

**Returns:** `Promise<AdmittedReview>` — Complete qualified admission and a private context binding; no selected task inventory before qualification.

**Errors:**
- `TaskReviewInputError` when Typed family input/context validation rejects identity, scope, capability, capacity or freshness; unknown wire input is intentional and must pass exact decoding.
- `CheckpointSaveError | Error` when Existing code atomic writer reports a definitive/uncertain save outcome; design/host/native adapters preserve their concrete Error subclasses and pointed reason, never convert unavailable proof into success.

**Preconditions:**
- The approved issue is the implementation scope; existing source, route, history, attribution and capacity checks remain mandatory.
- The host owns the exact review/attempt and has durably acknowledged input plus runtime initialization.

**Postconditions:**
- One preparation session covers historical and current source requests; each immutable query is physically fetched once per session unless a bounded retry is explicitly recorded.
- Already qualified immutable generations may be consumed through a current host receipt; mutable author/route/BUILD/permanent-history checks run anew.
- No native work or reviewer invocation is authorized by a disk manifest alone.

### 2.2 `prepareReviewPacket`

```typescript
prepareReviewPacket(input: unknown, sources: ReviewSources, historical?: boolean, route?: StoryRoute, stored?: StoredDerived): Promise<PreparedReviewPacket>
```

**Parameters:**
- `input: unknown` — Exact packet; selected after-segments/deletion anchors remain sole scope
- `sources: ReviewSources` — One admission source session with bounded query planning, batching and memoized verified results
- `historical: boolean` _(optional)_ — Existing historical input interpretation
- `route: StoryRoute` _(optional)_ — Current host-derived workflow route
- `stored: StoredDerived` _(optional)_ — Existing derived-scope evidence

**Returns:** `Promise<PreparedReviewPacket>` — The existing full projection, tasks, committed route documents and tests, represented by an immutable prepared generation.

**Errors:**
- `TaskReviewInputError` when Typed family input/context validation rejects identity, scope, capability, capacity or freshness; unknown wire input is intentional and must pass exact decoding.
- `CheckpointSaveError | Error` when Existing code atomic writer reports a definitive/uncertain save outcome; design/host/native adapters preserve their concrete Error subclasses and pointed reason, never convert unavailable proof into success.

**Preconditions:**
- Every requested object/ref is explicit and pinned; no HEAD/generic diff fallback.
- Historical packets retain original submitted spelling and commit provenance.

**Postconditions:**
- Current projection identity, selected spans, replacement witnesses, rename/delete lineage and test bytes match the existing correctness oracle.
- Logical per-packet projection budgets are charged even on physical cache hits; batching does not relax scope or byte limits.

### 2.3 `prepareDesignSubject`

```typescript
prepareDesignSubject(repo: string, artifactPath: string): PreparedDesignSubject
```

**Parameters:**
- `repo: string` — Canonical registered project
- `artifactPath: string` — Current canonical target artifact/document locator

**Returns:** `PreparedDesignSubject` — Fresh subject, current workflow/author resolution, baseline and inventory; any immutable reuse is subordinate to this capture.

**Errors:**
- `DesignReviewError` when Typed family input/context validation rejects identity, scope, capability, capacity or freshness; unknown wire input is intentional and must pass exact decoding.
- `CheckpointSaveError | Error` when Existing code atomic writer reports a definitive/uncertain save outcome; design/host/native adapters preserve their concrete Error subclasses and pointed reason, never convert unavailable proof into success.

**Preconditions:**
- Read latest canonical artifact and document and required ancestry for the target route.
- Do not import code-review commit pin semantics into design review.

**Postconditions:**
- Target canonical/document changes invalidate the active attempt and require the existing human-approved restart.
- Relevant author/route/ancestry changes invalidate the context binding. Unrelated repository changes do not invalidate the target or create restart loops.

### 2.4 `ReviewWorkers`

```typescript
class ReviewWorkers { /* proposed additions to this existing class */ cancel(identity: ReviewWorkerIdentity, attempt: number, reason: string, context: TrustedRpcContext): Promise<ReviewCancellationReceipt>; }
```

**Parameters:**
- `identity: ReviewWorkerIdentity` — Private exact project/family/review/worker identity
- `attempt: number` — Current attempt only
- `reason: string` — Bounded user/controller cancellation explanation
- `context: TrustedRpcContext` — Current authorized controlling connection

**Returns:** `Promise<ReviewCancellationReceipt>` — A cancellation receipt distinguishing accepted/cancelling, stopped, and stopped-with-resource-fence; never a fabricated assessment result.

**Errors:**
- `Error` when Typed family input/context validation rejects identity, scope, capability, capacity or freshness; unknown wire input is intentional and must pass exact decoding.
- `CheckpointSaveError | Error` when Existing code atomic writer reports a definitive/uncertain save outcome; design/host/native adapters preserve their concrete Error subclasses and pointed reason, never convert unavailable proof into success.

**Preconditions:**
- Resolve control authority on the main host; reject foreign connections, attempts and identities. No caller-supplied PID or clearance receipt.
- Cancel is an explicit supported operation for each family; resource clearance remains a separate existing broker action.

**Postconditions:**
- Durably record cancellation intent in compact runtime state, prevent further native admissions, abort only the selected native owner and terminate/reclaim its worker.
- Report stopped only after worker exit; report fully disposed only after confirmed native closure and durable closure writes.
- Persist/interpolate interrupted observation without changing submitted packets or prior feedback. Missing disposal confirmation retains the guard and requires explicit recovery; no auto-resume/new attempt.

### 2.5 `runReviewWorker`

```typescript
runReviewWorker(init: ReviewWorkerInit, deps?: {readonly code?: TaskReviewDeps | undefined; readonly design?: DesignCoordinatorDeps | undefined}): Promise<void>
```

**Parameters:**
- `init: ReviewWorkerInit` — Host-issued review/attempt/runtime/context capabilities
- `deps: {readonly code?: TaskReviewDeps | undefined; readonly design?: DesignCoordinatorDeps | undefined}` _(optional)_ — Existing family/source/provider adapters plus private preparation/runtime adapters

**Returns:** `Promise<void>` — One isolated family coordinator with context acquisition and compact progress publication.

**Errors:**
- `Error` when Typed family input/context validation rejects identity, scope, capability, capacity or freshness; unknown wire input is intentional and must pass exact decoding.
- `CheckpointSaveError | Error` when Existing code atomic writer reports a definitive/uncertain save outcome; design/host/native adapters preserve their concrete Error subclasses and pointed reason, never convert unavailable proof into success.

**Preconditions:**
- Worker remains dedicated to one review; main host owns native leases and compact runtime writes.
- Source preparation/qualification remains worker work; main retains only bounded registry metadata, not large source graphs.

**Postconditions:**
- Acquire a matching context generation before judging and retain a borrow through model/native reads.
- Release execution worker and native resources independently from retention of immutable prepared context.
- Publish actual preparation substage, counters and cancellation state through the existing review progress path.

### 2.6 `updateStoredCodeCheckpoint`

```typescript
updateStoredCodeCheckpoint(path: string, mutate: (current: StoredReviewCheckpoint | undefined) => StoredReviewCheckpoint | Promise<StoredReviewCheckpoint>): Promise<StoredReviewCheckpoint>
```

**Parameters:**
- `path: string` — Canonical bounded review history file
- `mutate: typed callback` — Admission/input, accepted scope, result or publication boundary mutation

**Returns:** `Promise<StoredReviewCheckpoint>` — Atomic full history commit at semantic boundaries, not a native-lease write.

**Errors:**
- `TaskReviewInputError` when Typed family input/context validation rejects identity, scope, capability, capacity or freshness; unknown wire input is intentional and must pass exact decoding.
- `CheckpointSaveError | Error` when Existing code atomic writer reports a definitive/uncertain save outcome; design/host/native adapters preserve their concrete Error subclasses and pointed reason, never convert unavailable proof into success.

**Preconditions:**
- Existing serialized writer, no-follow checks and definitive replaced/not-replaced/uncertain outcomes remain.
- Native hot-state readers/writers use the separate compact runtime authority after format cutover.

**Postconditions:**
- Each attempt retains complete metadata, submitted packet and daemon response; prior pinned history is immutable.
- History changes are source-stamp/digest guarded and invalidate affected preparation bindings; progress/native updates cannot overwrite feedback.

### 2.7 `updateStoredDesignCheckpoint`

```typescript
updateStoredDesignCheckpoint(project: string, reviewId: string, mutate: (current: StoredDesignCheckpoint | undefined) => StoredDesignCheckpoint | Promise<StoredDesignCheckpoint>, hostConfirmedClosures?: readonly ReviewResourceGuard['openLeases'][number][], authorizedClearance?: ReviewAuthorizedClearance): Promise<StoredDesignCheckpoint>
```

**Parameters:**
- `project: string` — Canonical project
- `reviewId: string` — Existing literal review id
- `mutate: (current: StoredDesignCheckpoint | undefined) => StoredDesignCheckpoint | Promise<StoredDesignCheckpoint>` — Attempt/chunk/feedback/action semantic boundary
- `hostConfirmedClosures: readonly Lease[]` _(optional)_ — Historical-format normalization only; new hot closures belong to compact runtime
- `authorizedClearance: ReviewAuthorizedClearance` _(optional)_ — Existing host-verified broker clearance semantics

**Returns:** `Promise<StoredDesignCheckpoint>` — Serialized design-history commit preserving accepted chunks, actions and publication identity.

**Errors:**
- `DesignReviewError` when Typed family input/context validation rejects identity, scope, capability, capacity or freshness; unknown wire input is intentional and must pass exact decoding.
- `CheckpointSaveError | Error` when Existing code atomic writer reports a definitive/uncertain save outcome; design/host/native adapters preserve their concrete Error subclasses and pointed reason, never convert unavailable proof into success.

**Preconditions:**
- Preserve exact full/impact retry and immutable action rules.
- All resource-proof consumers agree on legacy embedded versus new runtime format; no interpretation as an empty guard.

**Postconditions:**
- A native open/close or progress update does not rewrite reviewed canonical/document bytes.
- Target changes still invalidate; technical retry limits and explicit user recovery decisions remain unchanged.

### 2.8 `publishTaskCheckpoint`

```typescript
publishTaskCheckpoint(project: string, epicHash: string, reviewId: string, deps: PublicationDeps): Promise<{path: string; jsonPath: string; status: string}>
```

**Parameters:**
- `project: string` — Registered project
- `epicHash: string` — Tracked subject root
- `reviewId: string` — Pinned review identity
- `deps: PublicationDeps` — Existing writer/sources plus private context/runtime reader

**Returns:** `Promise<{path:string;jsonPath:string;status:string}>` — Permanent CR built from preserved terminal feedback and qualified context.

**Errors:**
- `TaskReviewInputError` when Typed family input/context validation rejects identity, scope, capability, capacity or freshness; unknown wire input is intentional and must pass exact decoding.
- `CheckpointSaveError | Error` when Existing code atomic writer reports a definitive/uncertain save outcome; design/host/native adapters preserve their concrete Error subclasses and pointed reason, never convert unavailable proof into success.

**Preconditions:**
- Validate supported permanent CR capability/version and all saved origins/results.
- Obtain a matching context binding or perform one cold bounded qualification; refresh current BUILD/author/publication authority.

**Postconditions:**
- No provider is called by publication retry.
- No separate repeated packet/history reconstruction occurs once the operation owns qualified context.
- Permanent history is self-contained after temp cleanup; ephemeral context receipt is not a cross-restart approval credential.

### 2.9 `publishDesignReview`

```typescript
publishDesignReview(input: StoredDesignCheckpoint, deps?: DesignPublicationDeps): Promise<DesignPublication>
```

**Parameters:**
- `input: StoredDesignCheckpoint` — Terminal accepted design history
- `deps: DesignPublicationDeps` _(optional)_ — Existing round writer plus private context/runtime reader

**Returns:** `Promise<DesignPublication>` — Versioned complete design history preserving report, actions, failures and context identity.

**Errors:**
- `DesignReviewError` when Typed family input/context validation rejects identity, scope, capability, capacity or freshness; unknown wire input is intentional and must pass exact decoding.
- `CheckpointSaveError | Error` when Existing code atomic writer reports a definitive/uncertain save outcome; design/host/native adapters preserve their concrete Error subclasses and pointed reason, never convert unavailable proof into success.

**Preconditions:**
- Recheck latest canonical target, author/route and owned bookkeeping changes separately.
- No cached generation overrides subject invalidation or missing preserved feedback.

**Postconditions:**
- Publication-only retry does not change assessment identity or dispatch a reviewer.
- History supports later permanent reads without temporary context files; cleanup still requires approval and complete preservation.

### 2.10 `cleanupStoryCheckpoints`

```typescript
cleanupStoryCheckpoints(project: string, hash: string, story: string, deps: {sources: ReviewSources; unlink?: typeof unlink; onDeleted?: (id:string)=>void; ownerReviewId?: string; preparation?: PreparationAccess}): Promise<CleanupResult>
```

**Parameters:**
- `project: string` — Registered project
- `hash: string` — Tracked root
- `story: string` — Canonical story/task completion scope
- `deps: {sources: ReviewSources; unlink?: typeof unlink; onDeleted?: (id:string)=>void; ownerReviewId?: string; preparation?: PreparationAccess}` — Existing sources plus common context/runtime authority

**Returns:** `Promise<CleanupResult>` — Deleted/retained/error lists for only the approved scope.

**Errors:**
- `TaskReviewInputError` when Typed family input/context validation rejects identity, scope, capability, capacity or freshness; unknown wire input is intentional and must pass exact decoding.
- `CheckpointSaveError | Error` when Existing code atomic writer reports a definitive/uncertain save outcome; design/host/native adapters preserve their concrete Error subclasses and pointed reason, never convert unavailable proof into success.

**Preconditions:**
- Confirm actual BUILD approval, current independent completion evidence and supported permanent history.
- Join context/runtime owner checks with the existing subject cleanup fence; no native/CLI/borrowed-context work may remain.

**Postconditions:**
- Validate saved feedback, scope and capability through one qualified operation; reuse immutable context instead of independently walking all source again.
- Remove temp history, unborrowed context and runtime only after permanent preservation and confirmed resource disposal.
- Unknown/malformed/missing required state is retained with a pointed reason; no silent deletion or model call.

### 2.11 `cleanupDesignArtifact`

```typescript
cleanupDesignArtifact(projectInput: string, artifactId: string, deps?: DesignCleanupDeps): Promise<CleanupResult>
```

**Parameters:**
- `projectInput: string` — Canonical project
- `artifactId: string` — Approved DEF/HLD/LLD target
- `deps: DesignCleanupDeps` _(optional)_ — Existing lifecycle plus shared context/runtime authority

**Returns:** `Promise<CleanupResult>` — Targeted cleanup using current approval, preserved history and the same runtime proof as execution.

**Errors:**
- `DesignReviewError` when Typed family input/context validation rejects identity, scope, capability, capacity or freshness; unknown wire input is intentional and must pass exact decoding.
- `CheckpointSaveError | Error` when Existing code atomic writer reports a definitive/uncertain save outcome; design/host/native adapters preserve their concrete Error subclasses and pointed reason, never convert unavailable proof into success.

**Preconditions:**
- Target approval and preserved current independent review must hold.
- No active owner, context borrow or uncertain native lease for the target.

**Postconditions:**
- Latest artifact checks remain distinct from immutable evidence reuse.
- Delete derived temp state only after complete permanent preservation; unrelated targets/reviews remain unaffected.

## 3. Data model changes

### 3.1 `Review preparation lifecycle and scope matrix` — invariant-change

IR1-IR8 derive from approved ISSUE-470a1f61b26b12c6. Stages are: durable input admission; validate current authority; inventory required evidence; fetch/qualify unique sources; construct complete task/chunk views; publish ready context; assess; preserve result; publish CR; approve; clean temp state. Every entrypoint uses this same preparation owner, not its own reconstruction loop. Code matrix: epic planned story pins DEF/story+LLD+PLAN where produced; standalone planned story pins LLD+PLAN; LLD-only story pins LLD; issue-only fix pins ISSUE; trivial/no-document scope uses tracked BUILD focus. Existing route resolver remains the authority. Story review retains all tasks; task review selects the exact task and dependencies without granting findings outside selected source. Design matrix: DEF, HLD and LLD resolve latest target/ancestry under their actual epic/standalone/issue route; no artificial HLD/DEF requirement for standalone/issues. Both daemon and controller reviewers consume equivalent prepared scope. Index impact data may augment analysis but never defines source scope or permits omission. All code refs remain committed/pinned; design target edits invalidate and require the existing user-approved restart, while unrelated repository edits are ignored.

**Call sites:**
- `src/workflow/code-review/task-review/admission.ts`
- `src/workflow/code-review/task-review/packet.ts`
- `src/workflow/review/design-review/subject.ts`
- `src/workflow/code-review/task-review/coordinator.ts`
- `src/workflow/review/design-review/coordinator.ts`

### 3.2 `Prepared context generation (proposed)` — new

Stable source generation identity binds canonical project/family/review, pinned attempt input, validator version, route, selected scope, source revision or captured latest-design identity, projection, tests and documents. Accepted feedback is excluded from this source key. Current authority/freshness remains independently checked. Exact source/input/subject changes require a new immutable generation. A separate immutable HistoryBindingV1 binds generationId, priorBindingDigest, semanticSequence, validated historyPrefixDigest, attribution/actions/results and evidenceManifestDigest. Initial qualification validates the complete prefix. Each accepted result validates new feedback/origins and any new evidence, then creates a successor history binding reusing already qualified source evidence. New evidence extends immutable evidence storage without mutating existing manifests. Earlier-history changes revoke descendant bindings and require explicit revalidation. All required projection/witness/test bytes remain complete. Storage stays in .insrc/tmp/review-context/<family>/<review-id>/ with staged-to-ready atomic publication; files alone grant no authority. Design prompts retain canonical document links rather than copied bodies.

```
PreparedContextManifestV1 {key,generationId,inputDigest,validatorVersion,sourceIdentity,manifestDigest,objects[],views[],byteTotals}; HistoryBindingV1 {generationId,priorBindingDigest,semanticSequence,historyPrefixDigest,evidenceManifestDigest,bindingDigest}. Checkpoints reference stable source generation plus current immutable history binding.
```

**Call sites:**
- `src/workflow/code-review/task-review/packet.ts`
- `src/workflow/code-review/task-review/sources.ts`
- `src/workflow/review/design-review/subject.ts`
- `src/daemon/threads/review-worker-runtime.ts`

### 3.3 `Private qualification receipt and context borrow (proposed)` — new

Main host retains only compact process-local metadata binding an exact manifest digest/generation to the qualifying registered worker incarnation and daemon epoch. A ready receipt is accepted only over the private worker channel after current input/subject reservation checks; caller/model JSON can never supply one. Its referenced immutable bytes are verified against this expected digest when reopened. A new authorized phase worker can borrow matching context after fresh authority checks without retaining a finished execution worker. Borrow ownership is exact review/phase/incarnation; active model/native readers retain a borrow until process disposal, not merely until candidate feedback arrives. Warm reuse checks validator version, packet/history/source/route binding and immutable file identity; missing or corrupted files revoke the receipt and require controlled rebuild or a pointed failure. On daemon restart all receipts are lost: disk manifests are untrusted hints and cold qualification recomputes correctness from authoritative inputs using the batched source session. No persistent signature, HMAC, trust key or stored digest alone confers trust. An LRU/byte-cap eviction may remove only unborrowed derived context; it never deletes review inputs/results or clears resources. Same-context acquisition coalesces under one review owner; other reviews have independent context authority. Receipts separately bind stable source generation and validated history binding. Accepted result progression and publication bookkeeping advance the latter without source requalification. Fresh author/route/approval checks remain mandatory; history tampering revokes descendant bindings. Cold receipts still require qualification, never disk-digest trust.

**Call sites:**
- `src/daemon/threads/review-workers.ts`
- `src/daemon/threads/review-worker-runtime.ts`
- `src/workflow/code-review/task-review/admission.ts`

### 3.4 `Verified source session (proposed)` — new

A bounded source session spans all prior/current packets and reference checks required by one preparation operation. Keys include canonical project/Git identity and the complete immutable operation arguments: commit OID; commit:path; ancestor pair; diff origin/parent/exact paths/options; full-history path interval. Only successfully verified results are cached; retry/absence/error semantics are explicit, and no mutable HEAD/ref name is accepted as a reusable key. Concurrent duplicate requests coalesce, but no Promise.all is used for provider calls. Plan object reads across the inventory and use existing git_cat_file revs batches; batch independent diff/path/ancestry work only where the current validators can preserve exactly the same proof. Keep complete merge/path/delete/rename/replacement witnesses; no first-parent or lossy lineage shortcut. Discovery can add bounded queries to the plan; total stays unknown until determined. Share raw verified reads across packets; retain independent logical source/fragment/byte accounting for each packet so reuse never bypasses existing ProjectionBudget or scope checks. Query output order and error field attribution remain deterministic. Configuration is limited to review.preparation batchMaxObjects(default256), batchMaxBytes(default4MiB), memoryMaxBytes(default64MiB) and cacheMaxBytes(default256MiB), all validated positive safe bounds and clamped by existing per-object/tool/projection limits; configurable lower values may split work or cause explicit capacity failure, never truncate evidence. A single valid object above a batch target is read alone within existing object/remaining-total limits. Existing review.maxJsonBytes continues governing JSON envelopes. Source work stays isolated/read-only through existing host authorization; pooling does not create a worker-local native bypass. Per-session retention: successfully verified query results are durably staged with an exact query index and immutable payload before memory eviction. Memory LRU drops decoded bytes only; subsequent consumers verify/reopen retained staging, never refetch Git. Pin all evidence needed by unfinished packet consumers against disk eviction. Session staging, manifests, ready context and temporary duplicate bytes all count against cacheMaxBytes; decoded bytes count against memoryMaxBytes. A serialized per-project capacity allocator accounts concurrent sessions, reserves bounded space before each batch and grows reservations incrementally for unknown inventory; it may evict only inactive unborrowed generations. If pinned evidence plus next batch cannot fit, fail precisely before discarding evidence or spawning the batch. No indefinite capacity wait, silent refetch, truncation or implicit limit increase. Release abandoned staging only after exact owned readers/resources are disposed. This makes the zero-duplicate guarantee hold under memory pressure.

**Call sites:**
- `src/workflow/code-review/task-review/sources.ts`
- `src/workflow/code-review/task-review/packet.ts`
- `src/workflow/code-review/task-review/admission.ts`
- `src/daemon/threads/review-native-host.ts`
- `src/daemon/threads/review-processes.ts`

### 3.5 `Review history and compact runtime state (proposed)` — invariant-change

Retain full per-attempt header, submitted packet and review response in existing project checkpoint paths. Introduce checkpoint format3 for each family with runtime/context references; new executions write only the new format after reader cutover. Main host is the sole authoritative writer of a proposed compact .insrc/tmp/review-runtime/<family>/<review-id>.json record. RuntimeV1 binds project/family/review/attempt, runtimeId, daemon/worker incarnation, acknowledged checkpoint/input digest and sequence, lifecycle state, bounded open leases/clearance, current progress/cancellation, and durable result/publication boundary references. Maximum encoded runtime size is256KiB, checked against bounded field/lease counts; no input packet, source blob, complete history or full review response is allowed there. Critical lease/cancel/result-boundary updates are serialized and atomically synchronized; observational progress is coalesced at250ms and flushed at phase boundaries. Full checkpoint writes occur at admission, accepted plan/scope, task/chunk result and publication/approval semantic boundaries, not every source operation. Progress reads use compact runtime and immutable counts; full history is decoded only when a new semantic generation or requested result requires it. Controlled file stamps plus content binding detect external checkpoint replacement and revoke affected authority; native admission/phase boundaries cannot continue on changed pinned input. Never cache mutable author, approval, route or artifact freshness. checkpointBinding distinguishes stable source/input identity from the current validated semantic history binding. Normal accepted feedback advances only the history binding; runtime completion references that exact successor.

```
Proposed ReviewRuntimeV1 {key, attempt, runtimeId, daemonEpoch, workerIncarnation, checkpointBinding, sequence, state, resourceGuard, preparation, progress, cancellation?, committedResultBoundary?, publicationBoundary?}; schema exact, no arbitrary paths/PIDs from clients. Runtime reference is a derived canonical locator, not a caller-selected file.
```

**Call sites:**
- `src/workflow/code-review/task-review/checkpoint.ts`
- `src/workflow/review/design-review/checkpoint.ts`
- `src/daemon/threads/review-worker-resources.ts`
- `src/daemon/threads/review-worker-runtime.ts`
- `src/daemon/threads/review-workers.ts`

### 3.6 `Cross-store commit and native durability ordering` — invariant-change

Initialization order: create an initializing empty runtime record under the host's exact scope reservation; durably append full attempt input plus matching runtime reference to the checkpoint; bind that confirmed checkpoint/input receipt and activate runtime; acknowledge admission; schedule preparation. An orphan initializing runtime cannot spawn; a checkpoint with incomplete/mismatched runtime cannot execute and requires explicit initialization recovery. Resolve uncertain writes using the existing definitive atomic-write outcomes, never by assuming rollback. For each native command: durably add its exact open intent to compact runtime BEFORE spawn authorization; only after host-confirmed process/group disposal may a durable close remove that lease. No asynchronous fire-and-forget durability. Result order: checkpoint contains complete accepted feedback first; runtime advances its committed result boundary afterward. A crash between these writes is reconciled from validated checkpoint evidence without rerunning a completed task; runtime never independently asserts a result absent from history. Publication follows the analogous permanent-CR commit then durable publication boundary. Context ready order: complete/verify immutable files, atomically publish ready manifest, receive private qualification receipt, then expose a usable handle. Cancellation revokes admission before draining native work and worker exit. These transitions share per-review serialization with cleanup; no global review lock or shared daemon-thread LLM work. For result commits, validate feedback/origins and new evidence, stage the immutable successor history binding, atomically commit feedback plus its binding reference in the checkpoint, then advance runtime. Unreferenced staged bindings grant no authority. Reconcile a committed referenced binding by validating its history delta against the prior binding; never rerun a model solely for this reconciliation.

**Call sites:**
- `src/daemon/threads/review-worker-resources.ts`
- `src/daemon/threads/review-native-host.ts`
- `src/daemon/threads/review-processes.ts`
- `src/workflow/code-review/task-review/checkpoint.ts`
- `src/workflow/review/design-review/checkpoint.ts`

### 3.7 `Preparation progress and public cancellation contract` — field-add

Keep existing status enums and phase meaning; expose preparation details as bounded optional progress fields with a typed stage(validate_input, inspect_history, source_inventory, fetch_sources, qualify_scope, build_views, commit_context), logical/physical completed counts, cache hits, bytes, elapsed time and a nullable known total. Do not invent percentages or selected task/chunk counts before qualification. Real completed validation/native work updates meaningful activity; waiting for a long-running tool remains explicitly tracked, and timer-only heartbeat does not masquerade as progress. Target progress observation gap<=2s under the controlled qualification workload. Add explicit cancel phases to code/design review MCP schemas and corresponding registered daemon operations with repo/reviewId/attempt/reason only. Host derives control ownership; return accepted/cancelling promptly and publish stopped/resource_fenced only after observed outcomes. Old request fields remain rejected; no caller-supplied source context authority, PID or approval receipt. Align shared IPC/DTO validation for the current VS Code and JetBrains clients and MCP consumers; no new IDE layout/button or deprecated insrc-ide integration is included. New progress/format capability is advertised at reconnect; unsupported required formats fail clearly rather than silently entering an old engine.

**Call sites:**
- `src/workflow/code-review/task-review/progress.ts`
- `src/workflow/code-review/task-review/contracts.ts`
- `src/workflow/review/design-review/contracts.ts`
- `src/daemon/threads/review-worker-runtime.ts`
- `src/daemon/threads/review-workers.ts`
- `src/daemon/review-service.ts`

### 3.8 `Ownership, retention and cleanup relationships` — invariant-change

One ReviewSession owns one full checkpoint with1..N immutable numbered attempts and at most1 active runtime writer/worker incarnation. Each attempt may reference0..1 stable ready source generation and, once qualified,1..N immutable successor history bindings; no ready context is required before unverified admission. One generation contains1..N bounded immutable evidence objects/views and may have0..N phase borrows. A daemon receipt references exactly1 generation/digest and is not persisted as an authorization credential. Current runtime references exactly1 current attempt; resource leases are owned by its exact worker incarnation and may outlive worker loss as a recovery fence. Context retention does not retain subject admission exclusions or terminal execution workers. Cleanup first acquires the existing target scope fence and checks approval/permanent preservation, no active owner/borrow/publication and no uncertain leases. It then releases receipt/borrows, removes inactive derived files and runtime after required audit preservation, and deletes working checkpoints last; failed partial cleanup is idempotently retriable with retained diagnostics. Permanent CR must retain complete submitted scopes, feedback, origins and admission/technical failures and bounded final operational audit, not references to deletable temp bytes. Proposed code CR format4 and design CR format3 carry the new runtime audit/binding capability; historical supported CR formats remain read-only. Post-cleanup progress reads permanent history with explicit locator and no model/rebuild. Completion of this correction's BUILD does not complete or approve BUILD-e4af63128c7cbec2-s1. The existing committed worker implementation is a dependency under qualification, not declared independently approved. After deployment, an explicitly authorized next attempt must use a newly committed packet/current source pin if sources changed, including relevant selected replacement witnesses; the canceled attempt4 input remains immutable. These explicit cardinalities are normative. The optional ER rendering is omitted because the current companion renderer draws required-many edges as optional-many despite source minima; the sequence and component views plus this complete ownership/cardinality contract are sufficient to assess the model without a misleading ER view. Cleanup requires a durable CleanupClaimV1 before deleting any runtime/context/checkpoint file, extending existing design private claims to both families. Under the target fence, first preserve exact closed resource audit and cleanup eligibility in permanent history; atomically persist/sync the claim binding project/family/review, checkpoint digest/file identity, runtimeId/closed-audit digest, source/history bindings, approval revision, permanent preservation receipt/digest and bounded exact deletion inventory. Claim ownership permits cleanup only, never execution/admission. Delete disposable context/runtime and then claimed checkpoint last, syncing affected directories; delete the claim last. After a crash an explicit cleanup retry validates current approval, permanent preservation and claim, then finishes only its exact remaining deletions without source/model calls. Missing runtime is accepted exclusively in this cleanup-only path with matching claim and permanent closed audit; normal execution/recovery still fences missing runtime. Replaced/mismatched files are retained. A crash after checkpoint deletion is recoverable from claim plus permanent record. No new trust keys/event store.

**Call sites:**
- `src/workflow/code-review/task-review/publication.ts`
- `src/workflow/review/design-review/publication.ts`
- `src/workflow/code-review/task-review/cleanup.ts`
- `src/workflow/review/design-review/cleanup.ts`
- `src/daemon/threads/review-workers.ts`

### 3.9 `Performance and correctness qualification contract` — invariant-change

Release gates are measurements, not runtime deadlines. On the retained171-file/four-attempt workload, three controlled runs under the supported Node/native build must show cold full managed preparation median<=120s and warm matching-context handoff/phase preparation median<=10s, with no scope/provenance/coverage loss. Record hardware, load, baseline, cache state, timings for history validation/source acquisition/projection/context writes/runtime persistence separately, native command count and bytes written. Unique query accounting must demonstrate no physical duplicate across the preparation session; full checkpoint writes per native command must be0; operational write size is bounded independently of history growth. Warm matching publication/cleanup must use the context contract without source reconstruction; a cold restart is explicitly labelled and performs bounded requalification. Two concurrent reviews must preserve independent progress/cancel/recovery and admit/cancel acknowledgement<=2s in the controlled fixture; no performance check may be made to pass by dropping modules, ancestry, selected blocks, tests, validation or honest errors. These targets need implementation measurements and are not claimed achieved. If they fail, do not resume the blocked worker-isolation qualification or substitute a higher timeout; revise the same holistic design/plan.

**Call sites:**
- `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts`
- `src/workflow/code-review/task-review/__tests__/route-admission.test.ts`
- `src/daemon/threads/__tests__/review-worker-isolation.test.ts`
- `src/daemon/threads/__tests__/review-worker-recovery.test.ts`
- `src/daemon/threads/__tests__/review-worker-publication.test.ts`
- `src/daemon/threads/__tests__/review-worker-cleanup.test.ts`

### 3.10 `Private preparation access and cancellation receipt (proposed)` — new

PreparationAccess is a private serializable capability reference issued by the main host: capabilityId, daemonEpoch and optional expectedGenerationId. It is resolved only through the owning private worker connection and is never accepted from public input; no closure or large source graph crosses the port. ReviewAdmissionContext, family publication/cleanup dependencies and worker bootstrap data carry this reference, with no behavioral legacy fallback: absent private reuse authority takes the same cold qualification path. ReviewCancellationReceipt contains exact reviewId/attempt/action identity and operationState(cancelling|stopped|resource_fenced), plus durable observation/remaining-resource metadata. The review's existing status enum is unchanged; operational cancellation state is separate. Runtime for a later attempt may replace only an inactive prior runtime after its exact final closed audit is committed in history; unresolved earlier leases prohibit replacement. Root runtime files remain bounded while older closed audit summaries live at semantic history boundaries.

**Call sites:**
- `src/daemon/threads/review-workers.ts`
- `src/daemon/threads/review-worker-runtime.ts`
- `src/workflow/code-review/task-review/admission.ts`
- `src/workflow/code-review/task-review/publication.ts`
- `src/workflow/review/design-review/publication.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/rework-review-preparation-context-lifecycle-end-E20261114470a1f61/S001/sequence-diagram.html)
- [Component dependencies](docs/standalone/rework-review-preparation-context-lifecycle-end-E20261114470a1f61/S001/component-dependency.html)

## 5. Error paths

**Error cases**

- **Changed or foreign submitted input/review identity** (recoverable)
  - Detection: Compare canonical project, family, reviewId, sequential attempt, runtimeId, packet digest and current context owner against acknowledged checkpoint binding; observe file identity/content changes.
  - Response: Reject with a pointed input/binding error; revoke stale context/worker capability and retain input/history. Do not overwrite a pinned attempt or auto-start another.
  - User impact: The caller sees which input/identity changed and must explicitly submit or recover the correct attempt.
- **Disk context masquerades as qualification after restart** (recoverable)
  - Detection: A manifest has no matching process-local receipt for the current daemon epoch, or a receipt comes from client/model JSON rather than the exact registered worker channel.
  - Response: Treat disk bytes as untrusted cache hints. Perform cold qualification once through the common source session before granting a handle; reject forged authority.
  - User impact: Cold preparation is visible and may take longer; no silent trust downgrade or extra model call.
- **Corrupted/missing derived context** (recoverable)
  - Detection: No-follow/containment checks, format/byte bounds, expected manifest digest, referenced object digests or immutable identity checks fail.
  - Response: A normal pre-use miss triggers bounded reconstruction from authoritative inputs; corrupt active borrowed evidence revokes the handle and fails the affected phase under existing explicit recovery rules. Never silently patch accepted feedback.
  - User impact: Pointed cache/phase diagnostics; original packet and valid feedback remain intact.
- **Unknown required runtime or context format** (recoverable)
  - Detection: Exact decoder or capability/version correspondence rejects the stored format.
  - Response: Fail before source/model/native execution and before cleanup. Retain all evidence and require compatible readers; no old-engine fallback.
  - User impact: Explicit upgrade/format error rather than an empty successful scope.
- **Current author or review party changed** (recoverable)
  - Detection: Read current tracked author and route at acquisition and phase/native-CLI boundaries; compare to required independent party, not an incumbent cached scope.
  - Response: Keep immutable source cache separate, revoke affected phase authority and require the existing appropriate explicit restart/new attempt. Never reuse the old reviewer reservation.
  - User impact: Correct independent reviewer is required; cached context cannot bypass authorship.
- **Latest design target or required ancestry changed** (recoverable)
  - Detection: Fresh canonical/document and relevant route/ancestry fingerprints disagree with the captured subject binding; monitor observes target replacement/removal.
  - Response: Invalidate the attempt using existing design semantics; notify user and await approved full restart. Do not restart automatically. Ignore unrelated external repository changes.
  - User impact: No review of a silently stale or shifting artifact.
- **Immutable Git evidence unavailable or scope cannot be proved** (recoverable)
  - Detection: Object hash/type/framing verification, pinned commit/path resolution, full-history lineage, selected replacement/deletion witnesses or projection equality fails.
  - Response: Return the existing precise qualification error, keep admission unqualified/failed as appropriate, and preserve history. Never reduce selected modules or use HEAD/first-parent/approximate matching.
  - User impact: A source failure remains distinguishable from an LLM or test-execution failure.
- **Preparation, object or runtime capacity exhausted** (recoverable)
  - Detection: Validated logical packet budgets, unique-source plan bounds, byte/fragment limits, configured memory/cache/batch bounds or256KiB runtime encoder bound is exceeded.
  - Response: Split a batch within configured limits or evict only unborrowed derived data. If the complete proof still cannot fit, fail explicitly with stage/size/bound; no truncation, skipped checks or implicit limit increase.
  - User impact: Clear bounded failure and explicit configuration/design decision; no fabricated completeness.
- **Runtime initialization interrupted between stores** (recoverable)
  - Detection: Runtime is initializing without committed matching checkpoint input, or checkpoint runtime reference lacks matching activated runtime/binding.
  - Response: Permit no native spawn. Preserve the orphan/incomplete pair for idempotent explicit initialization recovery under the review fence. Do not treat a missing runtime as zero leases.
  - User impact: Admission is visibly incomplete and recoverable without duplicate reviewer work.
- **Open-intent persistence fails** (recoverable)
  - Detection: Atomic runtime write reports not-replaced/uncertain or its returned exact lease/binding receipt cannot be verified.
  - Response: Do not authorize native spawn. Keep uncertainty fenced and record a technical preparation failure, retaining the previous proven state.
  - User impact: No untracked subprocess; explicit retry/recovery is needed.
- **Process disposal or close-intent persistence is uncertain** (recoverable)
  - Detection: Host cannot positively confirm process/group disposal, or durable close write fails or has unknown outcome.
  - Response: Retain exact lease and block affected review reuse/cleanup. Stopped worker is not reported as fully disposed. Existing local broker clearance is the only exceptional release path.
  - User impact: Review remains resource-fenced; other reviews continue.
- **Checkpoint result commit fails** (recoverable)
  - Detection: Family writer reports definitive not-replaced/uncertain and the accepted feedback cannot be established in the authoritative history.
  - Response: Runtime does not advance committed result count or approval eligibility; retain candidate/diagnostics under existing writer recovery semantics. Do not claim completion.
  - User impact: No false completed task and no unnecessary rerun of a result later proved committed.
- **Crash after result commit but before runtime boundary** (recoverable)
  - Detection: On recovery, validated full checkpoint contains a later accepted result digest than compact runtime's committed boundary.
  - Response: Reconcile the compact boundary from preserved feedback after current authority/identity validation. Never trust the reverse claim or invoke a model solely to repair bookkeeping.
  - User impact: Previously committed review effort is preserved.
- **Duplicate or racing preparation/phase acquisition** (recoverable)
  - Detection: Per-review ownership, generation keys, single-writer phase fence and borrow records show an existing owner or conflicting immutable inputs.
  - Response: Coalesce exact same-input acquisition or return busy/conflict. Different review identities remain independent; do not hold a global lock through Git/model work.
  - User impact: No duplicate qualification and no cross-session blockage.
- **Cancellation races with spawn, candidate, publication or cleanup** (recoverable)
  - Detection: Durable cancellation state and exact worker/attempt fence are checked before new native work, result acceptance and phase commit.
  - Response: Revoke further work, drain only exact resources, then persist interrupted/stopped observation. A result already durably committed is retained; a late candidate is not accepted. After a publication/approval commit is already definitive, cancellation cannot rewrite it and reports that boundary honestly.
  - User impact: Effective targeted stop with honest partial completion, not synthetic rollback.
- **Cleanup encounters active, corrupt or unpreserved state** (recoverable)
  - Detection: Current approval, permanent CR capability/version, result preservation, runtime closure, private borrows and target cleanup fence do not all agree.
  - Response: Return retained/error with exact reason and leave checkpoint bytes/evidence unchanged. Partial prior deletions of disposable cache are idempotent; permanent history is never deleted.
  - User impact: Safe explicit cleanup retry; no lost failure history.
- **Historical embedded guard migration conflicts or fails** (recoverable)
  - Detection: Exclusive migration compares source file stamp/input digest, all old attempts and guard daemon/incarnation/leases; new runtime/checkpoint writes lack a proven common committed binding.
  - Response: Refuse new execution until explicit compatible migration or existing broker resource clearance succeeds. Preserve original submissions/results/actions and migration recovery evidence; do not dual-write live guard authorities.
  - User impact: No upgrade that erases unresolved resources or resumes canceled work.
- **Progress storage/observer fails** (recoverable)
  - Detection: Compact progress update/sequence or observer delivery fails while critical resource/history state remains independently known.
  - Response: Expose stale/unavailable progress and a pointed diagnostic; do not fabricate activity. Critical state write failures fence work; an observer disconnect does not by itself restart or cancel daemon-authored review execution.
  - User impact: Accurate degraded visibility and preserved review effort.
- **Crash during multi-file cleanup** (recoverable)
  - Detection: Exact durable CleanupClaimV1 remains with partially removed deletion inventory.
  - Response: Validate current approval, permanent preservation and closed audit; finish only claimed deletions. Missing runtime without this cleanup-only proof remains fenced. Retain changed/foreign files.
  - User impact: Explicit cleanup retry completes without source or model requalification.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Many attempts repeat exactly the same immutable packet and historical references. | Share unique verified reads across the preparation session and warm context generations; still validate each attempt's distinct feedback, attribution, origins, format and history prefix. |
| Epic, standalone, issue-only, LLD-only, planned and no-document code routes; task versus whole-story scope. | Use the current route resolver and exact selected changes/tests without adding missing upstream documents or widening to generic HEAD diff. |
| Design review of DEF/HLD/LLD under epic, standalone or issue workflows. | Capture latest target and actual ancestry, retain chunking/impact policy and target-change invalidation; no code pin requirement. |
| A valid single object is above a configured batch target but below existing object/projection limits. | Read it alone within the existing safety envelope; batching must not create a new lower silent scope cutoff. |
| A source query returns a valid immutable absence. | Cache the exact verified query result within the qualified operation; distinguish legitimate absence from tool/truncation/error and retain existing validators' interpretation. |
| Two reviews on the same subject at different workflow phases, or different subjects in the same project. | Respect existing subject/cleanup exclusions for active work and independent review IDs; context retention alone does not keep an execution owner or a global subject lock. |
| A terminal execution worker exits while context awaits publication or human approval. | Release worker/native resources; keep only bounded unborrowed immutable context and a compact private receipt. Eviction remains safe and can cause visible cold requalification later. |
| Same cancellation action replayed after the worker has stopped. | Return the saved stopped/resource-fenced state idempotently without touching another incarnation or inventing a completed review. |
| Repeated publication-only recovery, including supported old qualified formats. | No model call and no mutation of assessment/preservation identity; use compatible context and runtime readers, and do not inject new review actions into historical evidence. |
| Permanent history is read after successful temp cleanup. | Read preserved CR with explicit subject locator and supported capability checks; no temp context, source reconstruction or provider required. |
| The stopped worker-isolation attempt4 has a pending checkpoint and retained old open guard. | Keep it stopped. This feature does not infer disposal, auto-clear its guard, resume it or submit another attempt; later explicit recovery must resolve that exact legacy fence. |
| Host load makes preparation slower than the controlled qualification SLO. | Expose real progress and tool activity; SLOs do not become fixed runtime deadlines. Retain existing inactivity/long-tool policy and correctness checks. |
| Normal new feedback changes history while source evidence is unchanged. | Validate delta/origins and new evidence, commit successor immutable history binding; preserve source qualification and warm publication/cleanup. |
| Working set exceeds memory but fits reserved disk capacity. | Evict decoded memory only, reopen verified staged results with zero duplicate physical source queries; insufficient pinned disk capacity fails before next batch. |

**Invariants to preserve**

- Exact committed code change-set scope, pinned final projection, full rename/deletion/replacement witnesses and mandatory test-coverage review remain authoritative; commits are pointers, not whole-commit scope. [[c1]]
- Design uses latest target/ancestry capture and explicit user-approved restart on target change; unrelated repository mutations are not restart triggers. [[c1]]
- Review work remains independent from the author, isolated by review identity and separate from chat-session scheduling. [[c2]]
- Durable native intent precedes spawn and host-confirmed disposal precedes durable closure; old or uncertain leases cannot be silently cleared. [[c2]]
- Full per-attempt input, metadata and feedback stay pinned; failed/incomplete attempts and existing explicit recovery/re-review rules are preserved. [[c3]]
- Only actual committed feedback advances completion; approval remains a human gate and cleanup requires permanent complete preservation. [[c1]]
- Existing provider abstraction and local CLI cloud access remain; no REST calls, new trust keys, activation flags or retired review-engine fallback. [[c2]]
- The incident's microbenchmarks are evidence of overhead, not a complete attribution or a claim that the new performance targets already pass. [[c4]]
- Approved ISSUE-470a1f61b26b12c6 takes priority; no review restart or implementation approval is implied by issue approval. [[c5]]

## 6. Test strategy

**Test framework:** `Node node:test and node:assert/strict executed with tsx, as confirmed by direct inspection of existing workflow/worker tests after the broad graph test.locate returned off-topic IDE methods. Use the repository's supported Node22/native build and current TypeScript strict settings; keep current VS Code/JetBrains wire fixture conventions for affected DTO checks. ac1-ac8 below are local design acceptance labels corresponding respectively to IR1-IR8 from the approved issue; the standalone upstream has no Epic acceptance list. No live hosted model is required to qualify preparation performance: use real isolated Git/native process paths and deterministic provider stubs, asserting provider calls remain0 until ready.`

**Test levels**

- **unit** — Prove immutable query reuse, complete scope/evidence equivalence, valid identities, budgets and pure state transitions without mirroring incidental implementation.
  - Subjects: `Existing projection/lineage oracle: unchanged code scope identities, after-segments, deletion/rename/merge/replacement witnesses and test/document bytes across baseline and new preparation.`, `Counting ReviewSources fixture: exact query keys, all prior/current packets in one session, duplicate coalescing, deterministic error attribution and no negative/error poisoning.`, `Stable source generation excludes accepted feedback; immutable successor history binding validates new results/origins. Tampering with old feedback revokes descendants; input/source changes invalidate source qualification.`, `Logical ProjectionBudget read/byte/fragment limits apply independently per packet even when physical reads are reused.`, `Exact runtime and checkpoint decoders: foreign identity, oversized fields, missing/unknown capabilities, forbidden paths, stale sequences and impossible completion states.`
  - Fixtures: `Retained171-file/four-packet fixture descriptor with all selected modules, plus small synthetic rename/delete/merge/binary/Unicode cases.`, `Proposed tests colocated under existing src/workflow/review/ preparation area; extend existing src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts and route-admission.test.ts. New test paths in the build plan must be labelled proposed.`
- **contract** — Prove the API/storage boundary agrees across both families, MCP and supported IDE consumers.
  - Subjects: `Code story/task and epic/standalone/issue/no-document route matrix; design DEF/HLD/LLD latest-subject matrix.`, `Full checkpoint input/feedback remains pinned while compact runtime is sole new hot resource authority.`, `Client/model-supplied qualification handles, PIDs, native closure claims and approval receipts are rejected.`, `Cancel and preparation progress wire fixtures preserve enum/status meaning, nullable unknown totals and actual counters; no invented task inventory or percentage.`, `Supported historical checkpoint/CR readers and explicit new-format capability mismatch refusals before cleanup or execution.`
  - Fixtures: `Existing src/workflow/code-review/task-review/__tests__/route-documents.test.ts and src/daemon/threads/__tests__/review-worker-progress.test.ts.`, `Current MCP schema golden fixtures plus affected shared VS Code/JetBrains DTO fixture tests; no deprecated insrc-ide gate.`
- **integration** — Exercise actual production ownership, native subprocesses and persistence—not only a prepared-context helper.
  - Subjects: `ProductionReviews through registered MCP/IPC routes acquires context, runs each family with a deterministic reviewer, preserves full feedback, publishes, approves under fixture authority and cleans only approved inactive targets.`, `Real Git batch output, object hash/type/framing, read-only isolation, exact missing-object semantics and byte limits through ReviewNativeHost/ReviewProcessLeases.`, `Warm handoff to a new authorized publication/cleanup worker reuses a private receipt after terminal execution-worker reclamation; cold daemon restart invalidates all receipts and requalifies through authoritative sources once.`, `Author changes before restart use fresh production scope, not a test-only resolver; latest design target edits invalidate and wait for human-approved restart; unrelated external edits do not loop.`, `Two review sessions retain separate ownership, progress, cancellation and resource fences; cancel one during preparation, assessment and publication-boundary races without affecting the other.`, `Observe actual runtime/history writer bytes and commit ordering: native open/close writes0 full history records, result commit precedes counted completion, and open intent precedes subprocess spawn.`, `Multiple accepted task/chunk results plus publication bookkeeping preserve source receipt and use zero repeated Git qualification; new evidence is fetched once and bound to exact successor history.`
  - Fixtures: `Extend src/daemon/__tests__/review-worker-routing.test.ts, src/daemon/threads/__tests__/review-worker-isolation.test.ts, src/daemon/threads/__tests__/review-worker-recovery.test.ts, src/daemon/threads/__tests__/review-worker-publication.test.ts and src/daemon/threads/__tests__/review-worker-cleanup.test.ts.`, `Disposable registered projects, isolated sockets/native broker and fake CLI candidates; tests must not open the user's daemon DB/socket or use live model quotas.`
- **integration** — Prove crash, tamper, uncertainty and migration paths preserve authority and work.
  - Subjects: `Fault injection at every runtime-initialize/checkpoint-bind/activate, manifest-ready/receipt, native-open/spawn/disposal/close, result-history/runtime-boundary and CR/publication-boundary transition.`, `Worker loss and whole-daemon crash with open tools; no automatic clearance or empty-runtime recreation. Confirmed disposal plus failed close persistence remains fenced.`, `Cold manifest/object tampering, stale validator versions, replaced checkpoint/runtime files, invalid capability metadata and cleanup races retain evidence and reject false approval.`, `Definitive checkpoint replaced/not-replaced/uncertain outcomes recover committed feedback without model rerun; failed/incomplete attempts still require the existing new-attempt rule.`, `Supported v1/v2 historical migration preserves exact submitted aliases, prior results/actions/failures and unresolved legacy guards; interrupted migration and rollback never activate dual writers.`, `The actual stopped attempt4 remains untouched by feature qualification and cannot be automatically resumed or cleared.`, `Crash after every cleanup claim/rename/unlink/directory sync, including runtime removal and checkpoint removal: explicit retry completes from exact permanent closed audit/claim without Git or model calls; arbitrary missing runtime remains fenced.`
  - Fixtures: `Existing checkpoint-outcomes, pending-failure-history, design checkpoint/recovery/subject-monitor suites; literal file-byte preservation assertions.`, `Detached fake native process groups and injected synchronization outcomes; full CLI/process inventory limited to disposable owned fixtures.`
- **integration** — Release-blocking preparation performance and scaling qualification on the managed pipeline.
  - Subjects: `Capture three cold runs of the complete171-file/four-attempt workload: median preparation<=120s with every source, scope, origin, test and history check retained; report each run and host/load metadata.`, `Warm matching-context lifecycle handoff/phase preparation median<=10s; matching publication/cleanup performs0 source reconstructions while current mutable checks still run.`, `Growing valid history at1,4 and maximum supported attempts: physical repeated queries per session0, immutable source work proportional to distinct evidence plus history validation, not repeated packet count.`, `Full checkpoint writes per native command0; compact runtime encoder<=256KiB and write size does not grow with history/source size. Report native command counts, total bytes written and stage timings separately.`, `Two concurrent reviews admit/cancel acknowledgement<=2s and preparation observation gap<=2s on the controlled supported-host fixture; cancellation reaches an honest stopped or resource-fenced result without another model call.`, `No timing assertion is a fixed runtime task deadline. If a release gate fails, report the measured failure; do not skip tests, widen timeouts/limits, shrink scope or claim the microbenchmark substitutes for this evidence.`, `Working set above memoryMaxBytes but below reserved disk capacity retains query payloads in staging and yields zero physical duplicates. Insufficient aggregate disk capacity fails before next batch; concurrent sessions cannot over-reserve or evict pinned evidence.`
  - Fixtures: `Retain a durable reproducible fixture manifest derived from design/review-worker-isolation-e4af6312.packet.json and /tmp/review-preparation-profile.json before temp evidence can expire.`, `Isolated built-package source-free fixture, managed real Git and deterministic model stub, cold/warm cache control, filesystem write counters and monotonic timing instrumentation.`
- **smoke** — After independent BUILD review/human approval and coordinated deployment, verify the real operational path before resuming the blocked story.
  - Subjects: `Update/restart only after the normal approval/publish sequence and coordination with other active reviews; reconnect MCP and validate advertised formats/cancel schema.`, `Small code and design review demonstrate incremental preparation progress, targeted cancellation and explicit recovery with complete CR history.`, `Only then explicitly resolve the original retained fence and ask to retrigger the stopped worker-isolation review with an appropriate immutable attempt; do not reuse a canceled execution implicitly.`
  - Fixtures: `Recorded post-deployment smoke evidence; not a pre-BUILD-approval deployment prerequisite.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Exact scope/projection/evidence equivalence oracle over all171files and selected after/deletion spans.`, `Pinned code versus latest-design capture/target-monitor matrix; fresh independence/route checks despite warm context.` |
| `ac2` | `Production lifecycle from admission through assessment, retry/resume, publication, approval and cleanup consumes one context contract.`, `Every code story/task and workflow route and every design artifact route is exercised; repeated publication uses saved feedback with0modelcalls.` |
| `ac3` | `Counting source plan proves physical duplicate count0 across historical/current inputs; batched Git verifies identical object/projection witnesses.`, `Budget hits, batch splitting, per-object oversize and missing refs fail precisely without omitted scope;1/4/max supported history scaling.`, `Memory-pressure/disk-reservation and interleaved-session retention fixtures.` |
| `ac4` | `Writer instrumentation proves0full-historywrites per nativecommand, bounded runtime bytes, and complete checkpoint writes at result boundaries.`, `Crash injection proves durable open-before-spawn and confirmed-disposal-before-close without asynchronous durability shortcuts.` |
| `ac5` | `Two independent production review sessions: cancel one and prove the other's worker/resources/history unchanged.`, `Cold restart/tamper/migration and all cross-store commit windows retain uncertain guards and avoid duplicate completed review work.` |
| `ac6` | `Preparation counters change only with actual work; totals remain null until known and zero assessed tasks is not shown as completion.`, `Controlled native workload observation gap and admit/cancel acknowledgement<=2s; lost observers/storage show stale/unavailable honestly.` |
| `ac7` | `Full per-attempt packet/actions/feedback round-trip unchanged across migration, publication and cleanup; unsupported capabilities retain working evidence.`, `After terminal worker reclamation, private receipt permits authorized warm handoff; after daemon restart disk cache grants no authority and cold qualification is required.`, `Successor history binding and durable cleanup-claim crash matrices.` |
| `ac8` | `Three controlled full native cold runs median<=120s and warm phase handoff median<=10s with detailed stage/operation/write metrics and identical required scope.`, `Build/package and both-family production smoke remain separate from optional model-driven test execution and post-deployment original-story retry.` |

## 7. Migration

**State before:** As established by s1.analyzeBundles[0]-[2], code admission/publication/cleanup reconstruct historical source packets, design preparation captures latest target/ancestry, and native resource mutations use full family checkpoint writers. Existing stored code/design formats include qualified v1 and admission-aware v2 with embedded guards; permanent CR capability readers distinguish supported history versions. Progress stays at scope_preparation while source work executes. s1.analyzeBundles[3] records the actual stopped attempt4 and measured overhead. That stopped checkpoint and all other review histories must remain intact.

**State after:** New executions use one preparation/context lifecycle and new family checkpoint format3, bounded RuntimeV1 and derived PreparedContextManifestV1. The main host owns compact runtime writes and private current-epoch qualification receipts; immutable files alone grant no trust. Existing coordinators, complete pinned input/response history, code scope proof, latest-design invalidation, process-intent durability and human approval remain. Supported old formats are read-only inputs to explicit migration/qualification, not another execution engine. Permanent publication uses explicit new code CR4/design CR3 capability records when new runtime audit/binding data is present; old completed records remain unchanged. Stable source qualification is separate from successor history bindings; per-session disk staging retains verified queries under memory pressure; durable CleanupClaimV1 permits cleanup-only crash reconciliation.

**Zero downtime:** no — **Data rewrite:** yes

**Steps**

1. Retain a reproducible controlled fixture manifest and baseline measurements from the171-file/four-attempt workload and approved issue before relying on temporary profiling files. Inventory supported checkpoint/CR variants, current live owners and exact unresolved guards. Do not restart the stopped worker-isolation review. — ↩ rollbackable
2. Deliver exact versioned decoders, common operational-proof reads and context authority contracts before enabling new writes in the same final cutover. Preserve existing supported historical records and reject unknown/mismatched capabilities. Add production-route, byte-preservation and fault-window fixtures; no compatibility execution engine or feature/activation flag. — ↩ rollbackable
3. Implement unified source/context acquisition, compact runtime durability, lifecycle consumers and supported cancel/progress surfaces together in the tracked build sequence. During development validate new behavior in isolated source/compiled fixtures; do not partially deploy cache-only or writer-only changes to the user's daemon. Include successor history binding, aggregate disk reservation/staging retention, and both-family durable cleanup claims in the same cutover; no feedback-key or missing-runtime cleanup fallback. — ↩ rollbackable
4. Qualify exact scope equivalence and all failure/route matrices, then the managed native cold/warm/history-growth/concurrent performance gates. Complete the required independent code review and human BUILD approval before publishing. A failed performance or correctness gate blocks returning to worker-isolation qualification. — ↩ rollbackable
5. Coordinate other active reviews and retain their checkpoints before the explicit approved daemon update/restart. Update daemon and required MCP/IPC/IDE DTO readers together and reconnect consumers; advertise supported new preparation/runtime/cancel capabilities. This needs a coordinated restart and does not promise zero downtime or in-flight completion. — ↩ rollbackable
6. On explicit use of a supported old inactive review, acquire its exact owner/target fence, validate old input/history and all embedded resource guards, create an initializing RuntimeV1, commit the upgraded format3 reference preserving submitted/results/actions byte values, then activate only a proven common binding. Preserve original migration evidence until successful completion/cleanup. Any unresolved old/native guard or uncertain write blocks activation and requires existing explicit resource recovery; never replace it with an empty guard. No automatic bulk rewrite of completed permanent CRs. — ↩ rollbackable
7. At cold daemon startup invalidate private qualification receipts. Treat retained manifests as untrusted hints; first authorized phase reconstructs/qualifies required immutable evidence once through the bounded source session and refreshes current authority/content. Reconcile a committed result/publication boundary from preserved checkpoint/CR evidence without invoking a model solely for bookkeeping. No automatic resume or new attempt. — ↩ rollbackable
8. Perform post-deployment controlled code/design smoke: preparation progress, cancel one review while another proceeds, resource fence/recovery, publication and approved cleanup. Then explicitly resolve the stopped worker-isolation review's retained guard through supported recovery and obtain the user decision to retrigger the appropriate attempt; do not count its canceled run as a completed review. If code/input changed, submit a newly committed packet and new pinned attempt; never mutate canceled attempt4. This fix's approval does not automatically complete the older BUILD. — ↩ rollbackable
9. Rollback before new-format emission can restore the previous binary. After format3/runtime/new-CR records exist, do not run old-only readers or reverse-transform live records: roll forward or use a state-preserving rollback build that retains new readers and leaves incomplete reviews explicitly interrupted. Permanent approved history is never rewritten as rollback; deleting unborrowed derived cache is safe but may require cold requalification. — ✕ non-rollbackable

**Backward compat:** Historical supported checkpoint/CR data stays readable and immutable unless an explicit inactive-checkpoint migration is required for new execution. New code/design cancel phases and optional preparation progress fields are additive for discovery-capable consumers; required new storage/runtime authority must be understood end to end. Unknown required format/capability fails clearly, never masquerades as an empty guard or older engine. Maintain aligned supported VS Code/JetBrains IPC DTOs and MCP schemas; no deprecated insrc-ide requirement. Keep full per-attempt packets and accepted feedback exactly; aliases and old action/publication history are not normalized away. No new trust keys, compatibility flags or parallel legacy execution path. A raw persisted manifest/hash is not a cross-restart qualification credential. Once new runtime/CR formats are emitted, old-only reader rollback is unsupported.

## 8. Alternatives considered

### 8.1 a1: Operation-scoped context with compact runtime state

A unified preparation API builds reusable context for one lifecycle operation, with separate small durable process/progress state.

Reuse current source/projection/coordinator interfaces behind one preparation contract for admission, resume, assessment, publication and cleanup. Each operation owns its verified immutable query set and bounded batched source reads; mutable authority is checked independently. Full submitted input and feedback remain in the per-attempt checkpoint, while leases and progress use a small versioned runtime record. No prepared evidence survives operation ownership.

**Rejected because:** Minimal comparison baseline, but central lifecycle-wide reuse remains partial.

### 8.2 a2: Qualified context with separate history and runtime state — **CHOSEN**

Separate immutable prepared evidence, pinned review history and compact operational state, with one preparation contract across the complete lifecycle.

Reuse current review workers, coordinators, source/projection validators and native process ownership. A single context interface exposes complete qualified code scope or latest-design subject through an opaque generation-bound handle. Large derived bytes are immutable and bounded; the main daemon retains only compact private qualification receipts so subsequent authorized phase owners can reuse them after an execution worker is reclaimed. Full input/response history remains in the existing project checkpoint. A small durable runtime record owns live leases, cancellation and progress. Fresh author/route/content/approval checks remain separate from immutable reuse. Source queries are planned across history/current input and batched within existing isolation guarantees. Cold daemon restart invalidates private receipts and performs one bounded qualification from authoritative inputs; disk cache is never self-authenticating.

### 8.3 a3: Unified append-only review event store

Persist submissions, context, feedback, leases and progress as typed events, with checkpoint and runtime views derived from the event stream.

Replace hot whole-checkpoint mutation with an append-only project review event contract. The visible per-attempt checkpoint becomes a derived view; immutable context is referenced by generation, and recovery reconstructs current ownership and phase from events. Existing source/freshness validators and judges remain consumers of the rebuilt state. Publication and approval bind to explicit event sequence boundaries.

**Rejected because:** More persistent event-store and recovery complexity than the reproduced defect requires.

## 9. References

- **[[c1]]** `step-output` `s1.analyzeBundles[0]` — "Completed workflow-scope analyze pass locates prepareReviewAdmission, prepareReviewPacket, prepareDesignSubject, assertDesignSubjectUnchanged, both checkpoint writers, both publishers and cleanup func"
- **[[c2]]** `step-output` `s1.analyzeBundles[1]` — "Native-scope analyze pass locates ReviewWorkers, ReviewNativeHost, ReviewProcessLeases, runReviewWorker and updateReviewWorkerResource; graph connects runtime to resource updater. Source confirms open"
- **[[c3]]** `step-output` `s1.analyzeBundles[2]` — "Third analyze pass locates PreparedReviewPacket, ReviewSources, StoredReviewCheckpoint, DesignReviewCheckpoint, PreparedDesignSubject, both coordinators and ReviewProgressTracker. data-model.trace res"
- **[[c4]]** `step-output` `s1.analyzeBundles[3]` — "Approved ISSUE-470a1f61b26b12c6 is the defect authority. Packet has171 distinct files across40 selected commits. Four packet reconstructions issue13031 physical source queries,5052 distinct,7979duplic"
- **[[c5]]** `prior-artifact` `.insrc/artifacts/ISSUE-470a1f61b26b12c6.json`
- **[[c6]]** `code` `src/workflow/code-review/task-review/admission.ts`
- **[[c7]]** `code` `src/workflow/code-review/task-review/packet.ts`
- **[[c8]]** `code` `src/workflow/code-review/task-review/worker-checkpoint.ts`
- **[[c9]]** `code` `src/workflow/code-review/task-review/publication.ts`
- **[[c10]]** `code` `src/workflow/code-review/task-review/cleanup.ts`
- **[[c11]]** `code` `src/workflow/review/design-review/subject.ts`
- **[[c12]]** `code` `src/workflow/review/design-review/approval.ts`
- **[[c13]]** `code` `src/workflow/review/design-review/publication.ts`
- **[[c14]]** `code` `src/workflow/review/design-review/cleanup.ts`
- **[[c15]]** `code` `src/daemon/threads/review-workers.ts`
- **[[c16]]** `code` `src/daemon/threads/review-native-host.ts`
- **[[c17]]** `code` `src/daemon/threads/review-processes.ts`
- **[[c18]]** `code` `src/daemon/threads/review-worker-resources.ts`
- **[[c19]]** `code` `src/daemon/threads/review-worker-runtime.ts`
- **[[c20]]** `code` `src/shared/review-process-bridge.ts`
- **[[c21]]** `code` `src/daemon/review-service.ts`
- **[[c22]]** `code` `src/workflow/code-review/task-review/contracts.ts`
- **[[c23]]** `code` `src/workflow/code-review/task-review/sources.ts`
- **[[c24]]** `code` `src/workflow/code-review/task-review/coordinator.ts`
- **[[c25]]** `code` `src/workflow/code-review/task-review/progress.ts`
- **[[c26]]** `code` `src/workflow/code-review/task-review/checkpoint.ts`
- **[[c27]]** `code` `src/workflow/review/design-review/contracts.ts`
- **[[c28]]** `code` `src/workflow/review/design-review/coordinator.ts`
- **[[c29]]** `code` `src/workflow/review/design-review/checkpoint.ts`
- **[[c30]]** `code` `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts`
- **[[c31]]** `code` `src/workflow/code-review/task-review/__tests__/route-admission.test.ts`
- **[[c32]]** `code` `src/workflow/code-review/task-review/__tests__/checkpoint-outcomes.test.ts`
- **[[c33]]** `code` `src/daemon/threads/__tests__/review-worker-isolation.test.ts`
- **[[c34]]** `code` `src/daemon/threads/__tests__/review-worker-recovery.test.ts`
- **[[c35]]** `code` `src/daemon/threads/__tests__/review-worker-publication.test.ts`
- **[[c36]]** `code` `src/daemon/threads/__tests__/review-worker-cleanup.test.ts`
- **[[c37]]** `code` `src/workflow/review/design-review/__tests__/subject-monitor.test.ts`
- **[[c38]]** `prior-artifact` `.insrc/artifacts/ISSUE-470a1f61b26b12c6.json`
- **[[c39]]** `prior-artifact` `.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- **[[c40]]** `prior-artifact` `.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- **[[c41]]** `code` `design/review-worker-isolation-e4af6312.packet.json`
- **[[c42]]** `doc` `/tmp/review-preparation-profile.json`
- **[[c43]]** `doc` `/tmp/profile-review-admission.mts`

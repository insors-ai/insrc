<!-- insrc:artifact LLD-470a1f61b26b12c6-s1 -->

# LLD: STORY-470a1f61b26b12c6-s1 — Rework review preparation and context lifecycle end to end

## Summary

**Epic:** `rework-review-preparation-context-lifecycle-end`
**HLD base run:** `wf-1794817146336-3c95t8`
**HLD effective hash:** `ccb16f2a6299...`

This Story retains the existing end-to-end review lifecycle—admission, isolated execution, compact durability, cancellation, progress, publication, approval cleanup, historical compatibility, and measured qualification—while replacing only code-review source ownership. Code review durably stores exact locators and immutable identities, transiently supplies selected pinned after blocks, and exposes relevant files from each applicable commit parent through an attempt-owned sealed workspace; design review remains latest-document based. The duplicate ISSUE/LLD lineage is explicitly superseded without deleting history.

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

**Surface level:** internal

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

**Returns:** `Promise<AdmittedReview>` — Complete qualified admission bound to source-light code descriptors and baseline manifests, or to the latest captured design subject; no selected task inventory before qualification.

**Errors:**
- `TaskReviewInputError` when Typed family input/context validation rejects identity, scope, capability, capacity or freshness; unknown wire input is intentional and must pass exact decoding.
- `CheckpointSaveError | Error` when Existing code atomic writer reports a definitive/uncertain save outcome; design/host/native adapters preserve their concrete Error subclasses and pointed reason, never convert unavailable proof into success.

**Preconditions:**
- The approved issue is the implementation scope; existing source, route, history, attribution and capacity checks remain mandatory.
- The host owns the exact review/attempt and has durably acknowledged input plus runtime initialization.

**Postconditions:**
- One preparation session covers only the submitted historical/current source requests; each relevant immutable query is physically fetched once unless a bounded retry is recorded.
- Code preparation persists exact locators and manifests rather than aggregate source bodies; current authority, author, route, BUILD and permanent-history checks run anew.
- No native work or reviewer invocation is authorized by a disk manifest alone.

### 2.2 `prepareReviewPacket`

```typescript
prepareReviewPacket<Blob extends BlobIdentity = PinnedBlob>(input: unknown, sources: ReviewSources<Blob>, historical?: boolean, route?: StoryRoute, stored?: StoredDerived, access?: ReviewPacketAccess<Blob>): Promise<PreparedReviewPacket<Blob>>
```

**Parameters:**
- `input: unknown` — Submitted review packet at an untrusted validation boundary.
- `sources: ReviewSources<Blob>` — Pinned review sources and resolvers.
- `historical: boolean` _(optional)_ — Historical compatibility mode.
- `route: StoryRoute` _(optional)_ — Resolved Story route.
- `stored: StoredDerived` _(optional)_ — Previously derived checkpoint data.
- `access: ReviewPacketAccess<Blob>` _(optional)_ — Blob access seam.

**Returns:** `Promise<PreparedReviewPacket<Blob>>` — A validated source-light packet whose code scope is exact and pinned.

**Errors:**
- `ReviewError` when Submitted changes, commits, parents, or pinned objects are missing or inconsistent.

**Preconditions:**
- Every selected change belongs to one of the submitted commits.

**Postconditions:**
- No aggregate source body is persisted in the prepared packet.
- Selected object identities and exact locators are stable for the attempt.

### 2.3 `selectedCode`

```typescript
selectedCode<Blob extends BlobIdentity>(change: ReviewChange<Blob>): SelectedCode
```

**Parameters:**
- `change: ReviewChange<Blob>` — One pinned selected change.

**Returns:** `SelectedCode` — Only the submitted after ranges or blocks decoded transiently from the pinned after object.

**Errors:**
- `ReviewError` when The pinned after object or requested range cannot be read exactly.

**Preconditions:**
- The change has passed scope and object qualification.

**Postconditions:**
- No unrelated line is returned.
- Decoded bytes are not retained after reviewer input construction.

### 2.4 `prepareDesignSubject`

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

### 2.5 `ReviewWorkers`

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

### 2.6 `runReviewWorker`

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

### 2.7 `updateStoredCodeCheckpoint`

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

### 2.8 `updateStoredDesignCheckpoint`

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

### 2.9 `publishTaskCheckpoint`

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

### 2.10 `publishDesignReview`

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

### 2.11 `cleanupStoryCheckpoints`

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

### 2.12 `cleanupDesignArtifact`

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

### 2.13 `CodePreparation`

```typescript
class CodePreparation
```

**Returns:** `PreparedCodeContext` — Coordinates exact code qualification, locator persistence, baseline workspace ownership, and transient selected after-block delivery.

**Errors:**
- `ReviewPreparationError` when Qualification or workspace materialization fails.

**Preconditions:**
- The task has a submitted review packet and isolated worker context.

**Postconditions:**
- Durable state is source-light.
- Owned temporary resources are registered for cleanup.

### 2.14 `StagedPacketConstruction`

```typescript
class StagedPacketConstruction
```

**Returns:** `PreparedReviewPacket` — Constructs the qualified packet in lifecycle stages without broad source hydration.

**Errors:**
- `ReviewPreparationError` when A lifecycle stage cannot validate or persist its source-light output.

**Preconditions:**
- The attempt lifecycle is active.

**Postconditions:**
- Checkpoints contain locators, identities, manifests, and progress only.

### 2.15 `StagedPacketSources`

```typescript
class StagedPacketSources
```

**Returns:** `ReviewSources` — Supplies immutable object reads and parent workspace access to staged packet construction.

**Errors:**
- `ReviewPreparationError` when Pinned objects or applicable parents are unavailable.

**Preconditions:**
- Selected commits are pinned.

**Postconditions:**
- Only relevant parent files are materialized.
- Design artifacts continue through their latest-document path.

## 3. Data model changes

### 3.1 `Review preparation lifecycle and scope matrix` — invariant-change

IR1-IR8 derive from approved ISSUE-470a1f61b26b12c6. Stages are: durable input admission; validate current authority; inventory required evidence; fetch/qualify unique sources; construct complete source-light task/task-chunk descriptors and applicable-parent baseline manifests; publish ready context; assess; preserve result; publish CR; approve; clean temp state. Every entrypoint uses this same preparation owner, not its own reconstruction loop. Code matrix: epic planned story pins DEF/story+LLD+PLAN where produced; standalone planned story pins LLD+PLAN; LLD-only story pins LLD; issue-only fix pins ISSUE; trivial/no-document scope uses tracked BUILD focus. Existing route resolver remains the authority. Story review retains all tasks; task review selects the exact task and dependencies without granting findings outside selected source. Design matrix: DEF, HLD and LLD resolve latest target/ancestry under their actual epic/standalone/issue route; no artificial HLD/DEF requirement for standalone/issues. Both daemon and controller reviewers consume equivalent prepared scope. Index impact data may augment analysis but never defines source scope or permits omission. All code refs remain committed/pinned; design target edits invalidate and require the existing user-approved restart, while unrelated repository edits are ignored.

**Call sites:**
- `src/workflow/code-review/task-review/admission.ts`
- `src/workflow/code-review/task-review/packet.ts`
- `src/workflow/review/design-review/subject.ts`
- `src/workflow/code-review/task-review/coordinator.ts`
- `src/workflow/review/design-review/coordinator.ts`

### 3.2 `Private qualification receipt and context borrow (proposed)` — new

Main host retains only compact process-local metadata binding an exact manifest digest/generation to the qualifying registered worker incarnation and daemon epoch. A ready receipt is accepted only over the private worker channel after current input/subject reservation checks; caller/model JSON can never supply one. Its referenced locator, descriptor, baseline-manifest and relevant workspace-file identities are verified against this expected digest when reopened. A new authorized phase worker can borrow matching context after fresh authority checks without retaining a finished execution worker. Borrow ownership is exact review/phase/incarnation; active model/native readers retain a borrow until process disposal, not merely until candidate feedback arrives. Warm reuse checks validator version, packet/history/source/route binding and immutable file identity; missing or corrupted files revoke the receipt and require controlled rebuild or a pointed failure. On daemon restart all receipts are lost: disk manifests are untrusted hints and cold qualification recomputes correctness from authoritative inputs using the batched source session. No persistent signature, HMAC, trust key or stored digest alone confers trust. An LRU/byte-cap eviction may remove only unborrowed derived context; it never deletes review inputs/results or clears resources. Same-context acquisition coalesces under one review owner; other reviews have independent context authority. Receipts separately bind stable source generation and validated history binding. Accepted result progression and publication bookkeeping advance the latter without source requalification. Fresh author/route/approval checks remain mandatory; history tampering revokes descendant bindings. Cold receipts still require qualification, never disk-digest trust.

**Call sites:**
- `src/daemon/threads/review-workers.ts`
- `src/daemon/threads/review-worker-runtime.ts`
- `src/workflow/code-review/task-review/admission.ts`

### 3.3 `Review history and compact runtime state (proposed)` — invariant-change

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

### 3.4 `Cross-store commit and native durability ordering` — invariant-change

Initialization order: create an initializing empty runtime record under the host's exact scope reservation; durably append full attempt input plus matching runtime reference to the checkpoint; bind that confirmed checkpoint/input receipt and activate runtime; acknowledge admission; schedule preparation. An orphan initializing runtime cannot spawn; a checkpoint with incomplete/mismatched runtime cannot execute and requires explicit initialization recovery. Resolve uncertain writes using the existing definitive atomic-write outcomes, never by assuming rollback. For each native command: durably add its exact open intent to compact runtime BEFORE spawn authorization; only after host-confirmed process/group disposal may a durable close remove that lease. No asynchronous fire-and-forget durability. Result order: checkpoint contains complete accepted feedback first; runtime advances its committed result boundary afterward. A crash between these writes is reconciled from validated checkpoint evidence without rerunning a completed task; runtime never independently asserts a result absent from history. Publication follows the analogous permanent-CR commit then durable publication boundary. Context ready order: complete/verify immutable files, atomically publish ready manifest, receive private qualification receipt, then expose a usable handle. Cancellation revokes admission before draining native work and worker exit. These transitions share per-review serialization with cleanup; no global review lock or shared daemon-thread LLM work. For result commits, validate feedback/origins and new evidence, stage the immutable successor history binding, atomically commit feedback plus its binding reference in the checkpoint, then advance runtime. Unreferenced staged bindings grant no authority. Reconcile a committed referenced binding by validating its history delta against the prior binding; never rerun a model solely for this reconciliation.

**Call sites:**
- `src/daemon/threads/review-worker-resources.ts`
- `src/daemon/threads/review-native-host.ts`
- `src/daemon/threads/review-processes.ts`
- `src/workflow/code-review/task-review/checkpoint.ts`
- `src/workflow/review/design-review/checkpoint.ts`

### 3.5 `Preparation progress and public cancellation contract` — field-add

Keep existing status enums and phase meaning; expose preparation details as bounded optional progress fields with a typed stage(validate_input, inspect_history, source_inventory, fetch_sources, qualify_scope, build_views, commit_context), logical/physical completed counts, cache hits, bytes, elapsed time and a nullable known total. Do not invent percentages or selected task/chunk counts before qualification. Real completed validation/native work updates meaningful activity; waiting for a long-running tool remains explicitly tracked, and timer-only heartbeat does not masquerade as progress. Target progress observation gap<=2s under the controlled qualification workload. Add explicit cancel phases to code/design review MCP schemas and corresponding registered daemon operations with repo/reviewId/attempt/reason only. Host derives control ownership; return accepted/cancelling promptly and publish stopped/resource_fenced only after observed outcomes. Old request fields remain rejected; no caller-supplied source context authority, PID or approval receipt. Align shared IPC/DTO validation for the current VS Code and JetBrains clients and MCP consumers; no new IDE layout/button or deprecated insrc-ide integration is included. New progress/format capability is advertised at reconnect; unsupported required formats fail clearly rather than silently entering an old engine.

**Call sites:**
- `src/workflow/code-review/task-review/progress.ts`
- `src/workflow/code-review/task-review/contracts.ts`
- `src/workflow/review/design-review/contracts.ts`
- `src/daemon/threads/review-worker-runtime.ts`
- `src/daemon/threads/review-workers.ts`
- `src/daemon/review-service.ts`

### 3.6 `Ownership, retention and cleanup relationships` — invariant-change

One ReviewSession owns one full checkpoint with1..N immutable numbered attempts and at most1 active runtime writer/worker incarnation. Each attempt may reference0..1 stable ready source generation and, once qualified,1..N immutable successor history bindings; no ready context is required before unverified admission. One generation contains1..N bounded immutable locator/manifest records and attempt-owned relevant baseline files and may have0..N phase borrows. A daemon receipt references exactly1 generation/digest and is not persisted as an authorization credential. Current runtime references exactly1 current attempt; resource leases are owned by its exact worker incarnation and may outlive worker loss as a recovery fence. Context retention does not retain subject admission exclusions or terminal execution workers. Cleanup first acquires the existing target scope fence and checks approval/permanent preservation, no active owner/borrow/publication and no uncertain leases. It then releases receipt/borrows, removes inactive derived files and runtime after required audit preservation, and deletes working checkpoints last; failed partial cleanup is idempotently retriable with retained diagnostics. Permanent CR must retain complete submitted scopes, feedback, origins and admission/technical failures and bounded final operational audit, not references to deletable temp bytes. Proposed code CR format4 and design CR format3 carry the new runtime audit/binding capability; historical supported CR formats remain read-only. Post-cleanup progress reads permanent history with explicit locator and no model/rebuild. Completion of this correction's BUILD does not complete or approve BUILD-e4af63128c7cbec2-s1. The existing committed worker implementation is a dependency under qualification, not declared independently approved. After deployment, an explicitly authorized next attempt must use a newly committed packet/current source pin if sources changed, including relevant selected replacement witnesses; the canceled attempt4 input remains immutable. These explicit cardinalities are normative. The optional ER rendering is omitted because the current companion renderer draws required-many edges as optional-many despite source minima; the sequence and component views plus this complete ownership/cardinality contract are sufficient to assess the model without a misleading ER view. Cleanup requires a durable CleanupClaimV1 before deleting any runtime/context/checkpoint file, extending existing design private claims to both families. Under the target fence, first preserve exact closed resource audit and cleanup eligibility in permanent history; atomically persist/sync the claim binding project/family/review, checkpoint digest/file identity, runtimeId/closed-audit digest, source/history bindings, approval revision, permanent preservation receipt/digest and bounded exact deletion inventory. Claim ownership permits cleanup only, never execution/admission. Delete disposable context/runtime and then claimed checkpoint last, syncing affected directories; delete the claim last. After a crash an explicit cleanup retry validates current approval, permanent preservation and claim, then finishes only its exact remaining deletions without source/model calls. Missing runtime is accepted exclusively in this cleanup-only path with matching claim and permanent closed audit; normal execution/recovery still fences missing runtime. Replaced/mismatched files are retained. A crash after checkpoint deletion is recoverable from claim plus permanent record. No new trust keys/event store.

**Call sites:**
- `src/workflow/code-review/task-review/publication.ts`
- `src/workflow/review/design-review/publication.ts`
- `src/workflow/code-review/task-review/cleanup.ts`
- `src/workflow/review/design-review/cleanup.ts`
- `src/daemon/threads/review-workers.ts`

### 3.7 `Performance and correctness qualification contract` — invariant-change

Release gates are measurements, not runtime deadlines. On the retained171-file/four-attempt workload, three controlled runs under the supported Node/native build must show cold full managed preparation median<=120s and warm matching-context handoff/phase preparation median<=10s, with no scope/provenance/coverage loss. Record hardware, load, baseline, cache state, timings for history validation/source acquisition/projection/context writes/runtime persistence separately, native command count and bytes written. Unique query accounting must demonstrate no physical duplicate across the preparation session; full checkpoint writes per native command must be0; operational write size is bounded independently of history growth. Warm matching publication/cleanup must use the context contract without source reconstruction; a cold restart is explicitly labelled and performs bounded requalification. Two concurrent reviews must preserve independent progress/cancel/recovery and admit/cancel acknowledgement<=2s in the controlled fixture; no performance check may be made to pass by dropping modules, ancestry, selected blocks, tests, validation or honest errors. These targets need implementation measurements and are not claimed achieved. If they fail, do not resume the blocked worker-isolation qualification or substitute a higher timeout; revise the same holistic design/plan.

**Call sites:**
- `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts`
- `src/workflow/code-review/task-review/__tests__/route-admission.test.ts`
- `src/daemon/threads/__tests__/review-worker-isolation.test.ts`
- `src/daemon/threads/__tests__/review-worker-recovery.test.ts`
- `src/daemon/threads/__tests__/review-worker-publication.test.ts`
- `src/daemon/threads/__tests__/review-worker-cleanup.test.ts`

### 3.8 `Private preparation access and cancellation receipt (proposed)` — new

PreparationAccess is a private serializable capability reference issued by the main host: capabilityId, daemonEpoch and optional expectedGenerationId. It is resolved only through the owning private worker connection and is never accepted from public input; no closure or large source graph crosses the port. ReviewAdmissionContext, family publication/cleanup dependencies and worker bootstrap data carry this reference, with no behavioral legacy fallback: absent private reuse authority takes the same cold qualification path. ReviewCancellationReceipt contains exact reviewId/attempt/action identity and operationState(cancelling|stopped|resource_fenced), plus durable observation/remaining-resource metadata. The review's existing status enum is unchanged; operational cancellation state is separate. Runtime for a later attempt may replace only an inactive prior runtime after its exact final closed audit is committed in history; unresolved earlier leases prohibit replacement. Root runtime files remain bounded while older closed audit summaries live at semantic history boundaries.

**Call sites:**
- `src/daemon/threads/review-workers.ts`
- `src/daemon/threads/review-worker-runtime.ts`
- `src/workflow/code-review/task-review/admission.ts`
- `src/workflow/code-review/task-review/publication.ts`
- `src/workflow/review/design-review/publication.ts`

### 3.9 `Measured admission latency and durable acknowledgement (revision)` — invariant-change

The2831ms observed admission exceeds2s but does not establish cause. Instrument monotonic segments for public request parsing/registration, stored guard inventory, route/author scope, worker startup, checkpoint/runtime bind, activation and acknowledgement; capture cold/warm overhead separately. Keep exact current owner/author/input fencing and durable input+active runtime before ack. Source acquisition/projection/history qualification occurs asynchronously in the dedicated registered review worker after ack, never the main daemon or chat-session thread; unavoidable pre-ack recovery checks use existing registered metadata workers and bounded DTOs. Optimize the measured slow segment with equivalent checks; no provisional success response, skipped guard checks, duplicate worker, detached unowned work or deferred durability. Pre-ack cancel races retain exact attempt/action ownership. Re-run supported-host controlled admission/cancel<=2s and progress-gap<=2s under two independent reviews. If the preserved bound cannot be met, report and stop rather than widen it.

**Call sites:**
- `src/daemon/review-service.ts`
- `src/daemon/threads/review-workers.ts`
- `src/daemon/threads/review-worker-bootstrap.ts`
- `src/daemon/threads/review-runtime-store.ts`

### 3.10 `Prepared code review context` — invariant-change

Replace eager or aggregate source-body ownership with exact selected-change locators, pinned after-object identities, a sealed baseline-workspace manifest, test details, and existing lifecycle metadata. Design-review prepared subjects remain latest-document references.

**Call sites:**
- `src/workflow/review/code-preparation.ts:23-124`
- `src/workflow/review/staged-packet-construction.ts:23-97`

### 3.11 `SelectedChangeLocator` — new

Identifies one submitted file and its after ranges or blocks, selected commit/object identity, applicable parent identity, rename/delete metadata, and ordering. It contains no source body.

**Call sites:**
- `src/workflow/code-review/task-review/packet.ts:144-262`
- `src/daemon/threads/__tests__/review-preparation-baseline.test.ts`

### 3.12 `BaselineWorkspaceManifest` — new

Records an attempt-owned sealed temporary directory, applicable parent identities, materialized relevant paths, integrity metadata, and cleanup state. One attempt owns one manifest; files are derived from each change's actual commit parent, not origin by default.

**Call sites:**
- `src/daemon/threads/__tests__/review-preparation-baseline.test.ts`
- `src/daemon/threads/__tests__/review-worker-isolation.test.ts`

### 3.13 `Duplicate artifact reconciliation` — invariant-change

Explicitly transition ISSUE-163e7bc3d6f0ccba and its unapproved LLD to lifecycle superseded, record their replacement by the primary issue/LLD lineage, preserve logs, and verify they are non-routable. Do not rely on delivery-chain automatic supersession because ISSUE records are excluded.

**Call sites:**
- `src/workflow/storage.ts:185`
- `src/workflow/delivery/gate.ts:223`
- `src/workflow/delivery/graph.ts:410-443`

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
- **Prepared-view construction or consumer window exceeds memory/disk reservation** (recoverable)
  - Detection: Account source cache, descriptors, decoded leaves, strings and transient copies before allocation; verify staged content/digests and borrowed ownership at every window.
  - Response: Release unborrowed decoded data or split the semantic traversal without dropping witnesses; retain complete staged evidence. If an atomic unit cannot be bounded, fail with stage/chargedBytes/limit before allocation. Partial generation never becomes ready; canceled/fenced consumers release exact reservations only after disposal.
  - User impact: Pointed capacity failure instead of large JSON allocation or false complete scope; no provider call before readiness.
- **A selected file/range is not contained in any submitted commit.** (recoverable)
  - Detection: Qualification resolves each locator against the submitted commit packet and finds no matching pinned after object or range.
  - Response: Reject preparation before workspace creation and persist a concise scope error.
  - User impact: The review does not start until the packet is corrected.
- **A pinned commit, after object, or applicable parent disappears or is rewritten.** (recoverable)
  - Detection: Git object verification fails for the stored immutable identity or returns content with a mismatched object id.
  - Response: Fail the attempt without falling back to workspace HEAD or origin; require a new attempt.
  - User impact: The attempt stops with reproducibility preserved.
- **Baseline workspace materialization conflicts or is partially written.** (recoverable)
  - Detection: Manifest sealing detects duplicate ownership, unexpected existing paths, missing files, or integrity mismatch.
  - Response: Quarantine and clean the attempt workspace, leave the checkpoint recoverable, and require retry or a new attempt according to lifecycle state.
  - User impact: Review is delayed; no mixed baseline reaches the reviewer.
- **Explicit duplicate lifecycle reconciliation fails.** (recoverable)
  - Detection: Post-transition readback shows the duplicate ISSUE or LLD is not superseded, remains routable, or lacks replacement provenance.
  - Response: Stop before PLAN/build migration and retain both histories for operator correction.
  - User impact: Primary work cannot proceed until duplicate routing is unambiguous.

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
| One packet's JSON.stringify numeric-byte expansion exceeds64MiB while valid staged content fits reserved disk; four attempts share most evidence. | Binary content is encoded once as bytes, staged before further work, and traversed by bounded windows. Cold/warm/history/publication never hydrate all packets or all leaves. All selected scope and history checks execute; staged byte growth and charged memory are measured independently. |
| Admission takes2831ms on the controlled host. | Attribute time by monotonic admission segment, correct the measured cause and retain durable input/runtime activation before ack; do not assume Git/model work caused delay or relax2s gate. |
| A newly added file has no parent blob. | Represent the baseline as absent; provide selected after blocks only. |
| A deleted file has no after blob. | Materialize the parent file and carry deletion metadata; selected after content is empty. |
| A rename spans different old and new paths. | Materialize the old path from the applicable parent and deliver only selected ranges from the pinned new path. |
| Selected commits are stacked and not yet on origin. | Resolve each change against its actual selected commit and that commit's parent, never origin by default. |
| A design review runs concurrently. | It continues to read the latest artifact document and does not use the code baseline workspace. |
| Two code reviews run concurrently. | Each attempt owns a disjoint workspace, manifest, checkpoint, transient bytes, and cleanup lifecycle. |

**Invariants to preserve**

- Exact committed code change-set scope, pinned final projection, full rename/deletion/replacement witnesses and mandatory test-coverage review remain authoritative; commits are pointers, not whole-commit scope. [[c1]]
- Design uses latest target/ancestry capture and explicit user-approved restart on target change; unrelated repository mutations are not restart triggers. [[c1]]
- Review work remains independent from the author, isolated by review identity and separate from chat-session scheduling. [[c5]]
- Durable native intent precedes spawn and host-confirmed disposal precedes durable closure; old or uncertain leases cannot be silently cleared. [[c5]]
- Full per-attempt input, metadata and feedback stay pinned; failed/incomplete attempts and existing explicit recovery/re-review rules are preserved. [[c5]]
- Only actual committed feedback advances completion; approval remains a human gate and cleanup requires permanent complete preservation. [[c5]]
- Existing provider abstraction and local CLI cloud access remain; no REST calls, new trust keys, activation flags or retired review-engine fallback. [[c5]]
- The incident's microbenchmarks are evidence of overhead, not a complete attribution or a claim that the new performance targets already pass. [[c5]]
- Approved ISSUE-470a1f61b26b12c6 takes priority; no review restart or implementation approval is implied by issue approval. [[c5]]
- Full171-file/four-attempt workload and64MiB memory,256MiB cache,4MiB batch defaults remain; no JSON expansion estimate substitutes for actual budget ownership or permission to remove a guard. [[c5]]
- prepareReviewPacket and selectedCode retain their generic blob contracts while the three preparation classes remain non-generic. [[c1]]
- Existing review preparation tests remain the extension points for checkpoint, migration, progress, isolation, recovery, and cleanup behavior. [[c4]]
- Superseded lifecycle records remain preserved as history and excluded from active downstream views. [[c3]]
- Design-review latest-document behavior remains unchanged by the code-review preparation correction. [[c4]]

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
- **integration** — Close the measured t14 source-light preparation and admission gaps before re-running release qualification.
  - Subjects: `Single-packet and four-attempt histories larger than the decoded memory budget but within reserved disk qualify with exact scope, provenance, tests, feedback, selected after blocks, and applicable parent workspaces; cold and warm lifecycle consumers never build an aggregate packet body.`, `Instrument reserve-before-allocation and ownership high-water across locator validation, Git object verification, parent-file materialization, manifest sealing, transient selected-block decoding, prompt/test traversal, publication, and cleanup. No full-packet JSON stringify or whole-history source clone is reachable in production.`, `Versioned locator and BaselineWorkspaceManifest round-trip ordered scope, Unicode paths, add/delete/rename/replacement/merge/binary metadata, selected object ids, applicable parent ids, and integrity fields. Missing, tampered, cross-attempt, or stale manifests fail before reviewer use; old eager derived state triggers cold requalification.`, `New files produce an absent parent baseline; deletions expose the parent file and empty after content; renames expose the old parent path and selected new after blocks; stacked unpushed commits resolve against each selected commit's actual parent rather than origin.`, `Memory and aggregate disk pressure with two attempts, cancellation during workspace materialization or transient block use, interrupted seal/reopen/cleanup, and restart retain correct ownership, reservations, fences, and cleanup claims without pinned eviction or duplicate Git reads.`, `Monotonic admission segment traces distinguish request, guard, route/scope, worker startup, runtime binding, and acknowledgement. Source qualification runs in the isolated review worker after durable admission; independent sessions retain exact authority while controlled admit/cancel acknowledgement remains within the existing bound.`, `Re-run the retained 171-file/four-attempt cold x3, warm, and history 1/4/max gates with no hosted models; report locator count, unique Git reads, workspace bytes, transient charged-memory high-water, heap/external/RSS, stage durations, and writer counters. A failed run blocks release and cannot be hidden by higher limits or reduced scope.`
  - Fixtures: `Extend src/daemon/threads/__tests__/review-preparation-performance.test.ts, src/daemon/threads/__tests__/review-preparation-baseline.test.ts, and the existing performance worker fixture.`, `Extend source-light preparation, checkpoint, migration, isolation, cleanup, and production-route tests under src/workflow/review/__tests__/ and src/daemon/threads/__tests__/.`
- **unit** — Prove locator validation, exact after selection, parent resolution, manifest sealing, and duplicate transition rules.
  - Subjects: `prepareReviewPacket`, `selectedCode`, `SelectedChangeLocator`, `BaselineWorkspaceManifest`, `artifact lifecycle reconciliation`
  - Fixtures: `Pinned commit graphs`, `renames, deletions, and new files`, `stacked local commits`, `missing objects`
- **integration** — Prove production preparation through isolated workers and existing lifecycle facilities.
  - Subjects: `CodePreparation`, `StagedPacketConstruction`, `StagedPacketSources`, `checkpoint, recovery, progress, cleanup, and publication`, `unchanged design-review preparation`
  - Fixtures: `Temporary Git repositories`, `attempt workspaces`, `concurrent code and design reviews`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Exact scope/projection/evidence equivalence oracle over all171files and selected after/deletion spans.`, `Pinned code versus latest-design capture/target-monitor matrix; fresh independence/route checks despite warm context.`, `Exact submitted files, ranges, and blocks are selected from pinned commits and unrelated committed changes are excluded.` |
| `ac2` | `Production lifecycle from admission through assessment, retry/resume, publication, approval and cleanup consumes one context contract.`, `Every code story/task and workflow route and every design artifact route is exercised; repeated publication uses saved feedback with0modelcalls.`, `Code review provides selected after blocks plus immutable parent workspace paths; design review still resolves the latest artifact document.` |
| `ac3` | `Counting source plan proves physical duplicate count0 across historical/current inputs; batched Git verifies identical object/projection witnesses.`, `Budget hits, batch splitting, per-object oversize and missing refs fail precisely without omitted scope;1/4/max supported history scaling.`, `Memory-pressure/disk-reservation and interleaved-session retention fixtures.`, `Construction, staged packet inventory and every warm/cold lifecycle consumer obey the combined memory reservation high-water; no aggregate hydration.`, `Retained-workload instrumentation proves no aggregate source-body retention and no duplicate blob fetches.` |
| `ac4` | `Writer instrumentation proves0full-historywrites per nativecommand, bounded runtime bytes, and complete checkpoint writes at result boundaries.`, `Crash injection proves durable open-before-spawn and confirmed-disposal-before-close without asynchronous durability shortcuts.`, `Checkpoint and recovery tests prove source bodies are absent from durable state and bounded execution remains recoverable.` |
| `ac5` | `Two independent production review sessions: cancel one and prove the other's worker/resources/history unchanged.`, `Cold restart/tamper/migration and all cross-store commit windows retain uncertain guards and avoid duplicate completed review work.`, `Concurrent review, cancellation, retry, and cleanup tests prove attempt isolation and no workspace reuse.` |
| `ac6` | `Preparation counters change only with actual work; totals remain null until known and zero assessed tasks is not shown as completion.`, `Controlled native workload observation gap and admit/cancel acknowledgement<=2s; lost observers/storage show stale/unavailable honestly.`, `Admission per-segment trace and durable-ack race matrix with controlled<=2s acknowledgements.`, `Progress events expose qualification, workspace materialization, reviewer execution, and terminal state without source payloads.` |
| `ac7` | `Full per-attempt packet/actions/feedback round-trip unchanged across migration, publication and cleanup; unsupported capabilities retain working evidence.`, `After terminal worker reclamation, private receipt permits authorized warm handoff; after daemon restart disk cache grants no authority and cold qualification is required.`, `Successor history binding and durable cleanup-claim crash matrices.`, `Historical records remain readable; duplicate ISSUE and LLD are explicitly superseded, linked to the primary lineage, and non-routable.` |
| `ac8` | `Three controlled full native cold runs median<=120s and warm phase handoff median<=10s with detailed stage/operation/write metrics and identical required scope.`, `Build/package and both-family production smoke remain separate from optional model-driven test execution and post-deployment original-story retry.`, `Delta tasks execute before retained qualification; independent code review and human approval gate activation.` |

## 7. Migration

**State before:** As grounded by c1-c5 and the retained revision-4 design, code admission, publication, and cleanup reconstruct source packets; design captures latest target and ancestry; the main host owns compact operational durability; and the stopped attempt plus completed task evidence remain preserved. The t14 retained workload exposed aggregate prepared-view memory and admission gaps. Revision 6 corrected source ownership but accidentally dropped valid lifecycle, persistence, cancellation, publication, cleanup, performance, and compatibility design. The duplicate ISSUE is not automatically superseded by delivery-chain precedence.

**State after:** The holistic lifecycle remains intact: exact admission, isolated workers, compact runtime/checkpoint durability, cancellation and progress, publication, approval cleanup, historical readers, native fencing, and measured release qualification. Code preparation now persists exact locators and immutable identities, transiently supplies only selected pinned after blocks, and materializes only relevant files from each change's applicable commit parent in an attempt-owned sealed workspace; no aggregate code source body or eager whole-packet view is durable. Design review remains latest-document based. The duplicate ISSUE/LLD lineage is explicitly superseded and non-routable, completed task evidence is retained, and delta work runs before t14.

**Zero downtime:** no — **Data rewrite:** yes

**Steps**

1. Retain the reproducible 171-file/four-attempt fixture, revision-4 holistic design baseline, completed task/build evidence, historical records, current owners, and unresolved guards; do not restart the stopped review. — ↩ rollbackable
2. Explicitly transition ISSUE-163e7bc3d6f0ccba and LLD-163e7bc3d6f0ccba-s1 to lifecycle superseded, bind replacement provenance to the primary ISSUE/LLD lineage, and verify both are preserved but non-routable; stop if readback fails. — ✕ non-rollbackable
3. Finalize versioned source-light selected-change locators, applicable-parent baseline-workspace manifests, historical readers, common operational-proof reads, and context authority contracts before enabling new writes; reject unknown capabilities. — ↩ rollbackable
4. Implement the existing unified admission/context, compact runtime durability, lifecycle consumers, cancellation and progress surfaces together with transient exact pinned after-block extraction and attempt-owned relevant parent-file workspaces; retain design latest-document capture. — ↩ rollbackable
5. Revise the PLAN with only delta contract, implementation, migration, and regression tasks before retained t14; preserve t1-t13 and t15-t20 identities and evidence, and keep t14 incomplete until the corrections pass. — ↩ rollbackable
6. Cut over the source-light locator/manifest writer and every cold/warm code consumer together in isolated fixtures. Remove eager aggregate code packet/source-body views; preserve exact history, runtime authority, feedback, provenance, tests, recovery, publication, and cleanup semantics. — ↩ rollbackable
7. Qualify exact scope and evidence equivalence, add/delete/rename/stacked-parent behavior, both-family route matrices, retained workload memory/query/write amplification, concurrency, cancellation, cleanup, recovery, progress, and admission attribution. Then require independent code review and human BUILD approval. — ↩ rollbackable
8. Coordinate active reviews, publish approved changes, update or restart the daemon and current MCP/IDE DTO readers together, and advertise supported source-light preparation/runtime/cancel capabilities; do not promise zero downtime. — ↩ rollbackable
9. For an explicitly resumed supported old inactive review, acquire its exact owner and target fence, validate old input/history and guards, create initializing runtime state, preserve submitted/results/actions bytes, and activate only a proven binding. Never replace an unresolved guard with an empty one. — ↩ rollbackable
10. At cold startup invalidate private qualification receipts. Treat retained locator/workspace manifests only as untrusted hints; the first authorized phase verifies required immutable objects and applicable parents once, refreshes mutable authority, and never auto-resumes or creates an attempt. — ↩ rollbackable
11. Run authorized post-deployment code and design smoke covering preparation progress, concurrent reviews, targeted cancellation, resource fencing/recovery, publication, approval cleanup, and workspace deletion. Only then seek explicit user direction for the stopped worker-isolation review. — ↩ rollbackable
12. Before new-format emission rollback may restore the previous binary. After new runtime, locator/manifest, or CR capability records exist, roll forward or use a state-preserving reader build; never reverse-transform permanent history. Disposable unborrowed workspace/derived state may be cleaned and cold-requalified. — ✕ non-rollbackable

**Backward compat:** Preserve existing public MCP/IPC status and progress semantics, generic prepareReviewPacket/selectedCode helper surfaces, non-generic preparation classes, exact per-attempt packets and feedback, supported checkpoint/CR readers, native fencing, current VS Code and JetBrains DTOs, and latest-document design-review invalidation. New code attempts use only source-light locators/manifests and transient selected blocks; old eager derived views are untrusted disposable inputs to cold requalification, not a fallback engine. Unknown or ambiguous required state fails explicitly. No new trust keys, feature flags, direct REST provider, or deprecated insrc-ide requirement.

## 8. Alternatives considered

### 8.1 a1: Holistic lifecycle with source-light code delta — **CHOSEN**

Retain the established end-to-end lifecycle and replace only eager code-source ownership with exact locators, transient selected after blocks, and commit-parent baseline workspaces.

Merge the source-light correction into admission, worker, durability, cancellation, progress, publication, cleanup, compatibility, and qualification design. Explicitly supersede duplicate artifacts and insert delta tasks before t14.

### 8.2 a2: Replace both review families

Rebuild code and design review around one shared source workspace.

Route code and design preparation through a common materialization contract, replacing established latest-document design capture and much of the lifecycle design.

**Rejected because:** Replaces valid lifecycle and latest-document design contracts while broadening scope.

### 8.3 a3: Compress existing hydration

Keep eager prepared source bodies and add compression or spill.

Retain broad prepared views and mitigate memory through compression, eviction, or disk spill while leaving source ownership unchanged.

**Rejected because:** Retains aggregate source ownership and does not meet exact commit-parent workspace requirements.

## 9. References

- **[[c1]]** `analyze-bundle` `symbol.locate: current review preparation declarations and signatures`
- **[[c2]]** `analyze-bundle` `usage.example: preparation admission and packet usage`
- **[[c3]]** `analyze-bundle` `search.text: artifact superseded lifecycle and delivery behavior`
- **[[c4]]** `analyze-bundle` `test.locate: preparation, durability, performance, isolation, recovery, cleanup, and publication suites`
- **[[c5]]** `prior-artifact` `LLD-470a1f61b26b12c6-s1 revision 4 holistic lifecycle baseline plus approved ISSUE-470a1f61b26b12c6 and stakeholder source-light correction`

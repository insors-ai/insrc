<!-- insrc:artifact LLD-17123b6d304af2a2-s3 -->

# LLD: E2026110317123b6d:S003

## Summary

**Epic:** `share-project-memory-across-agents-applications`
**HLD base run:** `wf-1793536573467-3p0dt6`
**HLD effective hash:** `18ac1fc6f9d6...`

S3 adds the standalone module's authoritative memory store in a dedicated memory.lance directory. One qualified table mutation publishes memory transitions, provenance, replay/deletion protection, a receipt and generation together; retries reconcile that receipt before reapplying effects. Scoped reads use a pinned committed version and a final freshness check. Native crash durability and cross-platform behavior are mandatory build gates; the recorded macOS normal-exit probe establishes only basic SDK compatibility.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

> See **HLD-17123b6d304af2a2** § 2. Framework summary

**Rollout phase:** A — Independent durable foundation
**Owns:** `sc4` (Single-writer atomic memory commit)
**Consumes:** `sc1` (Host ports and package lifecycle), `sc2` (Application service and domain wire types), `sc3` (Durable ingestion and replay)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Private lifecycle state machine, directory canonicalization and OS ownership guard. Public v1 types describe the final service; incremental builds must report unsupported/not-ready behavior explicitly rather than accept unimplemented work. Module-local model dispatch serialization is private to this foundation and covers all callers, including read embeddings. — owns `sc1`, `sc2`
- `s2`: Private segment framing, append/fsync scheduling, checkpoint replacement, tail recovery and disk accounting. Producer source keys are retained through authoritative store receipts; queue recycling alone never authorizes forgetting retry identity. — owns `sc3`
- `s4`: Private bounded source-context expansion, slot normalization, candidate retrieval, authority and equivalence classification, fidelity checks and serial model scheduling. No normalization result becomes active before the guarded store commit. — owns `sc5`
- `s5`: Private exact/lexical/vector ranking, mandatory-directive selection, generation-keyed caches and budget packing. Inspect and search share project binding and deletion filters. — owns `sc6`
- `s6`: Private local-socket framing, connection limits, version handshake, transport cancellation and process signal handling in the executable only. Embedded API import installs no handlers. Remote client disconnect never stops the server. — owns `sc7`
- `s7`: Private insrc registry binding, temporary-execution refusal, host provider translation and managed turn ownership. VS Code/JetBrains/MCP remain IPC clients; backend integration does not expose index/LMDB handles to the package. This story owns the explicit host admission/coordination design for daemon and memory model work; no existing global scheduler is assumed. — owns `sc8`
- `s8`: Private CLI-version qualification, trusted hook bootstrap, incremental transcript parser, local spool qualification and capability reporting. Adapter installation requires explicit host configuration; user approval and tool transcripts are not promoted to standing directives. — owns `sc9`
- `s9`: Private retention planning, purge accounting, Lance version cleanup, migrations, source-qualified lesson proposals and corpus evaluation orchestration. No maintenance timer writes outside the command/worker path. — owns `sc10`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `MemoryStore.commit`

```typescript
commit(plan: CommitPlan): Promise<OperationReceipt>;
```

**Parameters:**
- `plan: CommitPlan` — Immutable bounded private plan containing operationId, scope, expectedGeneration, admitted QueueFrame provenance/epoch/hash, per-target revision preconditions, a terminal disposition and validated domain rows. Store generates receipt/control rows; caller cannot supply those.

**Returns:** `Promise<OperationReceipt>` — Existing identical terminal receipt or a complete committed disposition. Invalid plans throw without partial effects; uncertain native writes fence the writer until reopen/reconciliation.

**Errors:**
- `MemoryError(INVALID_REQUEST)` when Unsafe/oversized plan, duplicate rowId, illegal kind or caller-supplied control/receipt, missing revision precondition or invalid references/vector.
- `MemoryError(REVISION_CONFLICT)` when Identity/hash/scope/epoch conflict, stale generation/revision or deleted/superseded target.
- `MemoryError(STORE_UNAVAILABLE)` when Uncertain write/manifest/receipt mismatch; fence and require reopen, never blindly retry effects.
- `MemoryError(BACKPRESSURE)` when Bounded pending-call/row/byte ownership exhausted before mutation.

**Preconditions:**
- Caller is the module's sole private writer capability; future S4/S9 use it only through admitted queue frames, never IPC/raw user rows.
- S1 canonical ownership is held; schema/store UUID/embedding metadata match; frame identity and canonical payload hash are recomputed using S2 codecs.
- Native LanceDB0.40.0 standard-path single-table commit is qualified on supported Node22/APFS/ext4 before production wiring.

**Postconditions:**
- Within the writer lane, refresh latest, validate identity receipt first, then expected generation/revisions/tombstones and references, freeze all outgoing rows, and issue exactly one mergeInsert on rowId with update/insert and no blanket delete or LSM mode.
- Exact committed retry returns original receipt before stale-generation handling and adds no rows/version. Conflicting receipt cannot mask a retained accepted identity (S2's invariant remains enforced).
- One global control generation advances with effects+receipt; a no-effect terminal failure/quarantine still atomically records its outcome. Cleanup-pending means logical completion only.
- Writer lane is released before any queue.markResolved. The store never calls the queue; the future worker/test harness performs acknowledgement afterward.

### 2.2 `MemoryStore.receipt`

```typescript
receipt(scope: Scope, operationId: string): Promise<OperationReceipt | null>;
```

**Parameters:**
- `scope: Scope` — Validated requested project/session/branch/environment visibility and current binding epoch.
- `operationId: string` — Domain-separated stable event operation identifier.

**Returns:** `Promise<OperationReceipt | null>` — Minimal authorized terminal receipt or verified absence. Unavailable storage/proof is an error, never absence.

**Errors:**
- `MemoryError(INVALID_REQUEST)` when Malformed request or hidden/unknown operation; outward status handling keeps hidden and missing indistinguishable.
- `MemoryError(STORE_UNAVAILABLE)` when Unreadable/duplicate/corrupt receipt rows.

**Preconditions:**
- Read through the store facade; no raw Table/Connection escapes.
- Scope is bound under current HostPolicy; exact receipt identity/hash/epoch data remains internally available for queue verification.

**Postconditions:**
- No payload/current-memory text leaks via status.
- Receipt lookup is usable before inference and after a lost commit/queue acknowledgement; failure does not authorize repeated semantic effects.

### 2.3 `MemoryStore.snapshot`

```typescript
snapshot(scope: Scope): Promise<CommittedSnapshot>;
```

**Parameters:**
- `scope: Scope` — Bind scope and epoch for a read-only lease.

**Returns:** `Promise<CommittedSnapshot>` — Opaque in-process lease containing version/generation plus bound scope digest, epoch and eligibility time. Registered read handle is distinct from the writer.

**Errors:**
- `MemoryError(BACKPRESSURE)` when Private read-lease limit reached.
- `MemoryError(NOT_READY)` when Closing/fenced/unqualified store.

**Preconditions:**
- Acquire latest version and generation together, then pin that exact version on a fresh table handle; never checkout the shared writer.

**Postconditions:**
- Copying/forging/cross-instance reuse of a snapshot does not acquire authority; store validates its private lease registration.
- Lease expiry/release closes its handle. Proposed private limits:16 concurrent leases and30s lifetime; measure before production and expose no new public option.

### 2.4 `MemoryStore.current`

```typescript
current(scope: Scope, snapshot: CommittedSnapshot): Promise<readonly MemoryView[]>;
```

**Parameters:**
- `scope: Scope` — Must match the lease's qualified scope/binding.
- `snapshot: CommittedSnapshot` — Registered pinned view; consumed/released after this projection or explicit private lifecycle release.

**Returns:** `Promise<readonly MemoryView[]>` — Validated current eligible views from one version, with mandatory scope/tombstone/lifecycle/time filters and deterministic id ordering. No semantic ranking or context packing.

**Errors:**
- `MemoryError(REVISION_CONFLICT)` when Generation or binding changed before final read linearization check; retry on a new snapshot.
- `MemoryError(CONTEXT_OVERFLOW)` when Private result bound exceeded; never silently truncate.
- `MemoryError(DEADLINE_EXCEEDED)` when Lease elapsed; close and retry.

**Preconditions:**
- Validate epoch before query and at return; apply project/qualifier visibility before collecting candidates.
- Use pinned-version current/revision/evidence/source/tombstone data; exclude any record derived from a forgotten/expired source before returning a view.

**Postconditions:**
- Final latest-generation/epoch check linearizes the read. A deletion completed before that check prevents an old snapshot from returning deleted content.
- Re-evaluate validity at current time even when generation is unchanged; publish earliest validity boundary to future S5 read facade/cache integration.
- Bound output to4096 rows for this enumeration API; future S5 uses bounded store read predicates/projections, not an unbounded full-store dump.

### 2.5 `ReceiptVerifier`

```typescript
byIdentity(identity: StableIdentity): Promise<ReceiptLookup>; byOperation(operationId: string, requestedScope: Scope): Promise<ReceiptLookup>; confirmRetirement(reference: RetirementReference): Promise<boolean>;
```

**Parameters:**
- `identity/requestedScope/reference: StableIdentity | Scope | RetirementReference` — Existing S2 proof-port inputs, unchanged.

**Returns:** `Promise<ReceiptLookup | boolean>` — Minimal authoritative proof with operation/identity/hash/scope/epoch/generation/event receipt and queueTerminal, or distinguished absence/unavailability. Retirement confirmation returns only a matching boolean.

**Errors:**
- `ReceiptUnavailableError` when Storage/validation cannot prove the requested disposition.

**Preconditions:**
- Facade is created by S3 and passed to S2 at host composition; queue never imports store implementation.
- All reads wait behind active store commits as needed; no callback from the store into the held queue lane.

**Postconditions:**
- A retained terminal receipt remains verifiable after queue segment unlink and after logical forget.
- Receipt/tombstone compaction and producer replay-watermark policy remain S9 obligations; S3 exposes no unsafe deletion shortcut.

### 2.6 `MemoryStore.close`

```typescript
close(): Promise<void>;
```

**Returns:** `Promise<void>` — All admitted store work/read leases settled and owned table/connection handles closed.

**Errors:**
- `MemoryError(STORE_UNAVAILABLE)` when Native write or resource release remains unverified; S1 ownership must remain held.

**Preconditions:**
- Host stops admission before store/queue release; no global timer or process handler installed by import.

**Postconditions:**
- Never closes host model/policy/logger ports. Native in-flight cancellation does not grant another writer until actual settlement.

## 3. Data model changes

### 3.1 `PhysicalRow` — new

Proposed packages/project-memory/src/store/codec.ts owns explicit Arrow schema: rowId:utf8 non-null; rowKind:utf8 non-null; projectId:utf8 non-null; namespaceKey:utf8 non-null; scopeEpoch:utf8 non-null; sessionId/branch/environment:utf8 nullable; entityId/revisionId/sourceId/operationId/payloadHash/identityDigest/generation:utf8 nullable; status:utf8 nullable; validFrom/validUntil timestamps nullable with validated safe millisecond values; payload:utf8 canonical typed JSON non-null; embedding:FixedSizeList<Float32,D> nullable. Validate envelope/payload agreement and finite exactly-D vectors. Persist integers/identities/generation as bounded decimal/hex strings; canonical payload preserves -0/Unicode. No implicit schema inference, remote URI, RTE/LSM write spec or embedding callback. Package pins @lancedb/lancedb0.40.0 and apache-arrow18.1.0 independently; root backend modules are not dependencies. MemoryStore owns exactly one table named records under canonical dataDirectory/memory.lance.

**Call sites:**
- `packages/project-memory/src/types.ts`
- `packages/project-memory/src/ownership.ts`

### 3.2 `CommitPlan` — new

Own sc4 refinement keeps operationId/scope/expectedGeneration/rows and adds immutable admitted QueueFrame provenance, scopeEpoch, commandHash, per-current expectedRevision map and disposition. Generated receipt/control rows are never accepted from callers; domain IDs use kind-prefixed SHA256 of qualified namespace and logical keys, with exact duplicate rowIds rejected. All writes are serialized; uniqueness is application-enforced because Lance primary keys are unenforced. Refresh writer before guards; targeted duplicate-count checks plus bounded streaming metadata/ID validation at open fail closed. Proposed private safety caps:64 pending calls,4096 effect rows and min(64MiB,8*maxEventBytes) canonical batch bytes, with measured native RSS/allocation limits disclosed. Over-limit plans fail before mutation; no partial chunked event commits. Future worker can explicitly terminalize an invalid plan via a separate validated no-effect failure disposition for the same admitted event, not by bypassing guards.

**Call sites:**
- `packages/project-memory/src/queue/types.ts`
- `packages/project-memory/src/queue/file-queue.ts`

### 3.3 `CurrentMemory` — new

Exactly one current row per qualified memory key; rowId includes project/epoch/scope and memoryId. Payload holds kind/text/status, revision and provenance links. Update requires snapshot generation plus per-target expected revision; frame.command.expectedRevision, when supplied, must also match. S4 supplies semantics/slot selection; S3 only validates exact keys, transitions, allowed scope and references. No implicit scope broadening: promotion requires a newly authorized command at the intended scope. Current -> revision is 1:1; memory -> immutable revisions is 1:many. Supersession links validated same namespace; no cycles or dangling active references.

**Call sites:**
- `packages/project-memory/src/types.ts`

### 3.4 `RevisionSourceEvidence` — new

Immutable Revision rows belong to one qualified Memory; SourceSpan rows identify admitted source occurrences/version; Evidence rows join exactly one revision and one source span (many-to-many through evidence). Stable rowId/domain prefixes avoid collisions. Reject reference rewrites, scope/epoch mismatch, missing or tombstoned dependencies. Source payload retention and policy redaction are explicit; forgetting hides dependent current/provenance/derived rows without claiming physical removal of old versions. Arbitrary evidence inference/resolution is S4, not this store.

**Call sites:**
- `packages/project-memory/src/queue/types.ts`

### 3.5 `ProcessingReceipt` — new

One immutable authoritative receipt per stable project-producer-event identity, containing identityDigest, full admitted-command hash, complete visibility scope/epoch, operationId/eventId, terminal state, generation and queueTerminal. Store generates it in the same mutation as effects and control. Correcting/forgetting a memory never rewrites an old event receipt; exact replay returns that outcome without reactivating content. Store unavailable is not absent. No raw transcript in routine logs; producer identities may need retention beyond queue recycling and cannot be falsely claimed physically erased.

**Call sites:**
- `packages/project-memory/src/queue/receipts.ts`
- `packages/project-memory/src/queue/file-queue.ts`
- `packages/project-memory/src/queue/retirement.ts`

### 3.6 `Tombstone` — new

Minimal monotone protection row for a qualified memory/source/subject lifecycle and delete generation. A source tombstone invalidates any current/revision/evidence/derived view referencing that source; exact scalar scope and reference checks must execute before ranking/limits or projection. Deleted logical identifiers are never resurrected by a different delayed event; new activity requires a new authorized lifecycle identifier under explicit policy, not tombstone removal. Supersession/correction creates immutable lineage with current-pointer change atomically; expiry uses validity intervals and current-time filtering. Physical purge/version retention/migrations are S9; no optimize/prune/drop/reset API is exposed by S3.

**Call sites:**
- `packages/project-memory/src/types.ts`
- `packages/project-memory/src/queue/retirement.ts`

### 3.7 `StoreControlAndSnapshot` — new

Store-generated root control row owns schema version, store UUID, embedding model/dimension and monotonically increasing uint64 generation. Namespace epoch controls are scoped. One global generation is deliberately conservative: any commit invalidates outstanding current-read tokens/caches, including other projects. CommittedSnapshot pins a distinct read handle at version plus generation, scope digest and current epoch; handles are process-owned leases, not serializable authorization. A final head-generation/epoch check rejects stale snapshot results, while eligibility time is re-evaluated without a write. Sorted rowId streaming at open uses SDK orderBy with small batches to identify duplicate IDs without a JS full-database map; benchmark native sort/scan memory/time before release.

**Call sites:**
- `packages/project-memory/src/ownership.ts`
- `packages/project-memory/src/queue/types.ts`

### 3.8 `DeliveryRow` — new

Reserve rowKind delivery and qualified storage envelope/reference fields, but no capture/delivery handshake, success reporting or protocol semantics are introduced. S8 owns its domain schema; unsupported delivery writes/read projections remain NOT_READY until that schema is supplied and qualified. S3 defines only that future derived references are scope/epoch qualified and subject to tombstone/validity checks, and that any eventual delivery effect uses the same writer.

**Call sites:**
- `packages/project-memory/src/types.ts`

### 3.9 `NodeHostComposition` — invariant-change

Proposed store files are packages/project-memory/src/store/types.ts, packages/project-memory/src/store/codec.ts, packages/project-memory/src/store/guards.ts, packages/project-memory/src/store/lance-store.ts, packages/project-memory/src/store/writer.ts, packages/project-memory/src/store/reads.ts, packages/project-memory/src/store/receipts.ts; packages/project-memory/src/host-node.ts composes under existing DirectoryOwnership. Import stays pure/lazy. Fresh initialization is allowed only when the owned root contains solely recognized S1 layout/lock metadata: persist a private S3 store-format.json initialization intent with UUID/schema/embedding metadata, create one local memory.lance/records table and root control generation0, then durably mark ready before queue creation/service readiness. This marker is format/init evidence, never an alternate memory/receipt authority. Existing matching S3 marker+database is reopened and validated; interrupted generation0 initialization is resumed only when provably recognized, without deleting unknown files. A missing/corrupt store in any non-pristine root, including an existing S2 queue-only directory, returns NOT_READY/STORE_UNAVAILABLE and preserves queue bytes; no automatic empty-store upgrade or sidecar deletion fallback is permitted. S9 owns an explicitly reviewed additive migration for such development directories. Normal open order is S1 owner -> qualified S3 store -> queue with receipt facade -> queue recovery -> service. Store never opens or acknowledges the queue itself. Close drains all owned reads/writes and retains S1 guard if settlement/cleanup is uncertain. S3 adds no semantic worker/public context: submit remains accepted, operation can reconcile receipts, context/search/inspect remain NOT_READY until S5. No remote URI, backend singleton, index path or reset API; private directory identity/permissions are checked before and after native operations.

**Call sites:**
- `packages/project-memory/src/ownership.ts`
- `packages/project-memory/src/queue/types.ts`

### 3.10 `ReadEligibility` — new

S3 owns validated scalar eligibility, not ranking. Read scopes enumerate at most eight allowed namespace hashes (stored qualifiers absent or equal to requested qualifiers); predicates are built from validated internal hex IDs, never caller SQL. Effect scopes must be within the admitted command's scope authority (same or narrower, never broader); explicit project/source forget selectors are constrained to that authorized namespace subtree. The private read facade resolves scope/epoch/status/validity and tombstoned source/revision dependencies before any vector top-k limit. It can supply eligible IDs/projections to future S5 without exposing a native Table. Bound the entire eligibility/dependency work set (proposed4096 current rows and16384 dependency/tombstone references); if it cannot prove eligibility within those limits return CONTEXT_OVERFLOW rather than post-filtering a truncated ANN result. Embedding dimension is an explicit matched metadata value with proposed safety range1..8192, not inferred from data. Measure these private bounds before release; no production SLO is claimed.

**Call sites:**
- `packages/project-memory/src/types.ts`
- `packages/project-memory/src/queue/types.ts`

## 4. Diagrams

- [ER model](docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/er-model.html)
- [Sequence diagram](docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Keep public options/ports/lifecycle and OS ownership unchanged. Bind a dedicated private store under the owned canonical directory; failed cleanup retains ownership. Declare/pin native SDK dependencies in the standalone package and prove pure imports/isolated tarball behavior. |
| `sc2` | consumes | Keep v1 wire/domain types. The store never accepts direct public mutations; it consumes trusted private plans tied to admitted commands. Failures distinguish unavailable/absent and logical cleanup-pending/physical purge. No unimplemented public read reports empty success. |
| `sc3` | consumes | Implement ReceiptVerifier through an adapter with unchanged strict proof fields. S2 retains authority over append/framing/recovery/retirement. Queue recovery opens only after receipt store availability is established. No store-to-queue callbacks; release store lane before queue ACK, preserving lost-response reconciliation and the manual S2 retained-frame invariant. |
| `sc4` | implements | One authoritative typed table, one mutation lane and no shared backend connection. Qualify mixed nullable vectors, standard merge atomicity, receipt/control coherence, scoped snapshot reads and commit-before-queue-ack crashes on real Node22/APFS/ext4. The small recorded 0.40.0 macOS normal-exit probe passes basic compatibility only; failed platform atomicity requires a reviewed HLD amendment rather than a multi-table or second-store fallback. |

## 6. Error paths

**Error cases**

- **Incomplete/corrupt or absent store under an existing module root** (recoverable)
  - Detection: Recognized S3 marker UUID/schema/embedding metadata fails to match the Lance control row, table is missing/corrupt, or a non-pristine root lacks the complete S3 initialization evidence.
  - Response: STORE_UNAVAILABLE/NOT_READY; preserve all native and queue bytes, never create an empty replacement, downgrade receipts to absent, or auto-delete old files. This supersedes the provisional s4 auto-upgrade phrase: existing S2 queue-only roots require explicit S9-owned migration.
  - User impact: Previously accepted work is preserved, but readiness requires repair/migration.
- **Native single-table atomicity or nullable-vector qualification fails** (recoverable)
  - Detection: Actual Node22/APFS/ext4 fault tests expose mixed generations/effects without receipt, incompatible null-vector/schema behavior or inability to pin coherent versions.
  - Response: Block S3 build/release and return to a reviewed HLD amendment. Do not split state/receipts across tables or add LMDB as a hidden authority.
  - User impact: Feature remains unavailable rather than losing correctness.
- **Same event identity with changed content/scope/epoch** (recoverable)
  - Detection: Recomputed frame identity/hash and any stored receipt or retained queue proof disagree; scoped exact lookup finds duplicate logical rows.
  - Response: REVISION_CONFLICT for a legitimate conflicting retry; corruption/duplicate storage keys fence as STORE_UNAVAILABLE. Do not rewrite the prior receipt or apply effects.
  - User impact: Producer must keep exact retry identity or submit a new authorized event.
- **Stale revision or generation after planning** (recoverable)
  - Detection: Fresh root generation/current revisions in the writer lane differ from expectedGeneration/per-target expectations or frame.expectedRevision.
  - Response: Reject REVISION_CONFLICT before native mutation; future S4 owns bounded recomputation/causal scheduling. Exact already-committed replay is reconciled first.
  - User impact: No stale corrective effect replaces newer state.
- **Attempted resurrection or hidden provenance** (recoverable)
  - Detection: Qualified tombstone/lifecycle/source eligibility checks match the target or any derived reference at the pinned/current generation.
  - Response: Reject new effects against a deleted lifecycle; current/read projections hide dependent content. A replayed already-committed receipt may be returned without reactivating memory.
  - User impact: Forget/correction boundaries survive replay and reconnect.
- **Malformed/oversized/malicious plan or vector** (recoverable)
  - Detection: Bounded canonical copy/row codec detects duplicate/illegal IDs, scope broadening, reserved receipt/control kinds, dangling or cyclic links, incompatible D/model metadata, nonfinite vector, row/byte/call limit.
  - Response: INVALID_REQUEST/BACKPRESSURE before mutation. Deterministic terminal rejection uses an explicit validated no-effect disposition; no partial batch split or silent dropping of evidence.
  - User impact: Accepted queue entry remains recoverable until a qualified terminal outcome is recorded.
- **Merge promise rejects, times out or reply is lost** (recoverable)
  - Detection: Native mutation cannot be confirmed together with the expected receipt/control/effects and version; cancellation may leave native work outstanding.
  - Response: Fence writer, stop new commits and retain ownership until native settlement. Reopen/refresh and reconcile exact receipt; never reuse prior row plan or infer absence from an unavailable read.
  - User impact: Retry gets an explicit unavailable state while accepted work remains durable.
- **Crash after store commit and before queue ACK** (recoverable)
  - Detection: On restart the immutable terminal receipt exists but queue frame remains pending.
  - Response: Return the same qualified outcome, release store lane, then let future worker/test harness repair markResolved. No repeated inference/effects; prove this with a real child process and OS lock.
  - User impact: Exactly-once committed effects under at-least-once queue replay.
- **Old snapshot or eligibility change during read** (recoverable)
  - Detection: Final head generation/current host binding differs from lease, lease expired, or validity interval elapsed even without a write.
  - Response: REVISION_CONFLICT/DEADLINE_EXCEEDED with handle release; remove expired/ineligible results and retry on a fresh view. Never serve a deleted row from a stale cache/snapshot.
  - User impact: Read may retry instead of returning stale instructions.
- **Directory identity replacement or unverified cleanup** (recoverable)
  - Detection: S1 ownership check, private store path/type/UID/permissions/UUID validation or native handle release fails.
  - Response: Stop readiness/mutations, preserve files, retain ownership until cleanup is verified; do not touch sibling queue/index directories.
  - User impact: Another host cannot become writer while old work may still be active.
- **Queue/store lock-order inversion** (terminal)
  - Detection: Test holds an admission in receipt lookup while a store commit settles and attempts later queue ACK; a watchdog identifies any circular dependency.
  - Response: Store methods have no queue callbacks and return/release their lane before ACK. Treat any violation as a blocking test failure, not a larger timeout.
  - User impact: No hidden close/admission deadlock.
- **Unknown schema/model/delivery payload version** (recoverable)
  - Detection: Store metadata/row discriminator/owned schema version fails exact compatibility validation.
  - Response: UNSUPPORTED_VERSION/NOT_READY without automatic re-embedding, schema change or S8 delivery interpretation. Maintenance/migration is S9-owned.
  - User impact: Explicit upgrade required; existing state preserved.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Exact committed duplicate with a stale expectedGeneration | Return original matching receipt before generation validation, with unchanged table version and no new inference/effects. |
| Fresh/pristine module versus existing S2 queue-only directory | Only pristine S1 layout/lock root can initialize S3. S2 data is preserved and readiness refuses until explicit owned migration; no queue file schema is parsed by S3. |
| Receipt/source/control rows with null embeddings and valid current rows with D-dimensional vectors | Explicit nullable Arrow schema round-trips; scalar rows remain queryable and vector queries never return them as accidental candidates. |
| Snapshot pinned before a concurrent forget or unrelated project commit | One coherent version internally; final global generation check rejects stale current() result, even if that conservatively retries an unrelated-project read. |
| Source-scoped forgetting with many dependent memories | One monotone selector tombstone plus receipt/control atomically hides all dependent views. No unbounded partial rewrite; every projection resolves bounded dependency validity or fails overflow. |
| Clean no-effect failure/quarantine or logical delete awaiting physical purge | Atomic terminal receipt/control still distinguish failed/quarantined/cleanup-pending; pending failures/timeouts are never terminal without explicit durable disposition. |
| Read/commit limit, integer generation/version exhaustion or ignored native cancellation | Explicit typed failure before overflow/mutation where possible; do not wrap counters or release the sole writer early. Measure logical and native resource use separately. |

**Invariants to preserve**

- All authoritative current/provenance/protection/outcome/generation effects of an event publish in one qualified table mutation. [[c1]]
- sc1/sc2 public v1 signatures, S1 ownership and S2 frame/checkpoint/receipt semantics remain unchanged. [[c2]]
- No public mutation bypasses the persisted queue; only the context-builder's private store writer capability commits. [[c1]]
- Store never calls queue methods while holding its lane; ACK follows committed receipt and store-lane release. [[c2]]
- Receipts/tombstones outlive queue recycling until S9 proves compaction safe; no second persistent store or backend singleton. [[c1]]
- Deletion/scope/epoch/time filters precede results, with final read generation validation and no raw payload routine logging. [[c1]]
- Memory and index storage paths/cleanup are independent; no S3 migration or reset touches queue/index directories. [[c1]]

## 7. Test strategy

**Test framework:** `Existing node:test with node:assert/strict, tsx and the package's nativeTest/node22 fixtures. Analyzer test.locate was broad; concrete existing queue-receipts/queue-retirement/queue-crash/packed test files verify this convention. New native tests must run real Node>=22.22.1<23, never count skipped/unsupported hosts as qualified.`

**Test levels**

- **unit** — Validate codecs, exact row identity/authority and monotone transitions before mutation.
  - Subjects: `store-row-codec-and-effect-reservations`, `store-scope-epoch-predicate-escaping`, `store-revision-tombstone-reference-guards`
  - Fixtures: `Canonical -0/Unicode/unsafe getters/depth/byte cases`, `Duplicate IDs/reserved kinds, qualifier injection strings, changed epoch/model/vector dimension`, `Valid current/revision/source/evidence/failure disposition fixtures with exact before/after expectations`
- **contract** — Qualify exact installed SDK/native/package interfaces and preserve consumed public/queue contracts.
  - Subjects: `store-runtime-package-qualification`, `store-proof-port-retained-and-recycled`
  - Fixtures: `Pinned @lancedb/lancedb0.40.0 and apache-arrow18.1.0`, `Mixed nullable vector schema with metadata dimension2 and production-like1024, range boundary8192`, `Real S2 queue and source-backed immutable receipts; retain the conflicting retry regression`
- **integration** — Prove one-table event outcomes, concurrency, deletion freshness and recovery with actual Lance and real ownership.
  - Subjects: `store-one-mutation-effects-receipt-generation`, `store-null-vectors-version-pinned-reads`, `store-generation-revision-conflicts-and-exact-retry`, `store-replay-forget-no-resurrection-scoped`, `store-reader-expiry-delete-race`, `store-directory-separation-and-no-empty-replacement`, `store-no-lane-inversion-drain-ownership`, `store-native-uncertain-writes-fence`, `store-commit-kill-before-after-receipt-ack`
  - Fixtures: `New temp APFS/ext4 owned module directory and independent index sentinel directory`, `Concurrent calls to one writer plus independent read handles (never independent native writers)`, `Observable child barriers before execute/after native commit/before reply/before queue ACK/during recovery; require SIGKILL signal and parent-observed receipts`, `Failure injection around native calls plus real process crashes; distinguish simulated failure from platform durability evidence`, `Failing plan and proof tampering without changing trusted host policy`
- **smoke** — Qualify standalone packaging, platform parity and measured safety bounds after all code tasks.
  - Subjects: `store-standalone-packed-node22-consumer`, `store-macos-apfs-linux-ext4-qualification`, `store-resource-and-latency-study`
  - Fixtures: `npm-pack tarball installed in a minimal external app with no backend source, daemon or index DB`, `macOS/arm64 APFS and Linux/x64 ext4 Node22 with exact dependency/lockfile/source fingerprints`, `Named hardware/corpus: empty,1k/10k current records,large history/tombstones,4096 effect rows,64MiB safety edge,16 read leases and eligibility overflow; record p50/p95 commit/current/open, physical store/control bytes, observed native/JS RSS and heap`, `No production default/latency or hardware power-loss claim from this study`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `store-one-mutation-effects-receipt-generation`, `store-commit-kill-before-after-receipt-ack`, `store-generation-revision-conflicts-and-exact-retry`, `store-native-uncertain-writes-fence`, `store-proof-port-retained-and-recycled`, `store-macos-apfs-linux-ext4-qualification` |
| `ac2` | `store-revision-tombstone-reference-guards`, `store-replay-forget-no-resurrection-scoped`, `store-reader-expiry-delete-race`, `store-scope-epoch-predicate-escaping`, `store-null-vectors-version-pinned-reads`, `store-no-lane-inversion-drain-ownership` |
| `ac3` | `store-directory-separation-and-no-empty-replacement`, `store-standalone-packed-node22-consumer`, `store-runtime-package-qualification` |

## 8. Alternatives considered

### 8.1 a1: Tagged rows with canonical typed JSON payloads — **CHOSEN**

One explicit Arrow table, small shared scalar envelope, validated per-kind payloads and nullable embeddings.

Refine sc4 inside the standalone package. One current row per qualified memory key, immutable revision/source/evidence rows, minimal receipts/tombstones/control/delivery rows share records.lance. Runtime codecs validate the discriminated domain payload before serializing canonical JSON; common scope/identity/revision/lifecycle columns support safe predicates. The sole store writer prepares a complete event batch and performs one standard-path mergeInsert, including its generated receipt and generation. Separate per-read handles pin a committed table version; no second authoritative index or backend connection.

### 8.2 a2: Wide Arrow schema with per-kind typed structures

The same single-table atomic contract with Arrow struct columns for every row kind.

Keep one table and single writer, but encode current/revision/source/evidence/receipt/tombstone/control/delivery payloads as nullable Arrow structs with a rowKind discriminator. One batch merge contains all effects and generated receipt/control rows; version-pinned reads use the same contract. Arrow checks physical types, while store guards still enforce identity, scope, expected revision, lifecycle and deletion. No multi-table or backend store is introduced.

**Rejected because:** Conceptually valid but wider schema and migration coupling are unnecessary.

## 9. References

- **[[c1]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/HLD.md`
- **[[c2]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S002/LLD.md`
- **[[c3]]** `code` `packages/project-memory/src/types.ts`
- **[[c4]]** `code` `packages/project-memory/src/ownership.ts`
- **[[c5]]** `code` `packages/project-memory/src/queue/types.ts`
- **[[c6]]** `code` `packages/project-memory/src/queue/receipts.ts`
- **[[c7]]** `code` `packages/project-memory/src/queue/file-queue.ts`
- **[[c8]]** `code` `packages/project-memory/src/queue/retirement.ts`
- **[[c9]]** `doc` `https://lancedb.github.io/lancedb/js/classes/Table/`
- **[[c10]]** `doc` `https://lancedb.github.io/lancedb/js/classes/MergeInsertBuilder/`
- **[[c11]]** `doc` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/qualification-probe.json`
- **[[c12]]** `code` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/lance-probe.mjs`
- **[[c13]]** `doc` `https://lance.org/format/table/transaction/`

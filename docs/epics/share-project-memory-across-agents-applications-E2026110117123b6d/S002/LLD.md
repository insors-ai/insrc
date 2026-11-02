<!-- insrc:artifact LLD-17123b6d304af2a2-s2 -->

# LLD: E2026110117123b6d:S002

## Summary

**Epic:** `share-project-memory-across-agents-applications`
**HLD base run:** `wf-1793536573467-3p0dt6`
**HLD effective hash:** `18ac1fc6f9d6...`

S2 makes eligible submissions durable before returning accepted, using a separate bounded, rotating file journal inside the standalone memory package. Recovery preserves accepted identities and order, explicitly isolates incomplete unaccepted tails, and stops on corruption instead of skipping accepted data. Semantic processing and authoritative receipts remain with S3/S4; S2 never equates queue acceptance with canonical memory activation. [[c1]] [[c2]]

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
**Owns:** `sc3` (Durable ingestion and replay)
**Consumes:** `sc1` (Host ports and package lifecycle), `sc2` (Application service and domain wire types)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Private lifecycle state machine, directory canonicalization and OS ownership guard. Public v1 types describe the final service; incremental builds must report unsupported/not-ready behavior explicitly rather than accept unimplemented work. Module-local model dispatch serialization is private to this foundation and covers all callers, including read embeddings. — owns `sc1`, `sc2`
- `s3`: Private Arrow/Lance physical row encoding, receipt lookup, single-table commit, current generation, revision checks and tombstone matching. No other story obtains a direct mutation handle. — owns `sc4`
- `s4`: Private bounded source-context expansion, slot normalization, candidate retrieval, authority and equivalence classification, fidelity checks and serial model scheduling. No normalization result becomes active before the guarded store commit. — owns `sc5`
- `s5`: Private exact/lexical/vector ranking, mandatory-directive selection, generation-keyed caches and budget packing. Inspect and search share project binding and deletion filters. — owns `sc6`
- `s6`: Private local-socket framing, connection limits, version handshake, transport cancellation and process signal handling in the executable only. Embedded API import installs no handlers. Remote client disconnect never stops the server. — owns `sc7`
- `s7`: Private insrc registry binding, temporary-execution refusal, host provider translation and managed turn ownership. VS Code/JetBrains/MCP remain IPC clients; backend integration does not expose index/LMDB handles to the package. This story owns the explicit host admission/coordination design for daemon and memory model work; no existing global scheduler is assumed. — owns `sc8`
- `s8`: Private CLI-version qualification, trusted hook bootstrap, incremental transcript parser, local spool qualification and capability reporting. Adapter installation requires explicit host configuration; user approval and tool transcripts are not promoted to standing directives. — owns `sc9`
- `s9`: Private retention planning, purge accounting, Lance version cleanup, migrations, source-qualified lesson proposals and corpus evaluation orchestration. No maintenance timer writes outside the command/worker path. — owns `sc10`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `DurableQueue`

```typescript
interface DurableQueue { append(command: MemoryCommand): Promise<OperationReceipt>; replay(): AsyncIterable<QueueFrame>; markResolved(operationId: string, generation: string): Promise<void>; stats(): QueueStats; seal(): Promise<void>; recycleResolvedSegments(): Promise<void>; close(): Promise<void>; }
```

**Parameters:**
- `command: MemoryCommand` — append: immutable v1 envelope, validated and admitted through the same policy path as MemoryService.submit.
- `operationId: string` — markResolved: previously accepted deterministic operation identity, never an arbitrary cursor.
- `generation: string` — markResolved: committed generation which the receipt verifier must corroborate.

**Returns:** `Promise<OperationReceipt> | AsyncIterable<QueueFrame> | QueueStats | Promise<void>` — New appends return accepted only after event and frontier durability. Exact retries return the existing receipt (accepted in queue-only S2; an authoritative terminal state only from the verifier). replay yields pinned pending frames in sequence. Queue bookkeeping never proves a store mutation.

**Errors:**
- `MemoryError(INVALID_REQUEST|UNSUPPORTED_VERSION)` when Malformed/oversized/non-JSON command, unsupported frame/schema version, unsafe queue path or noncanonical encoding.
- `MemoryError(UNBOUND_PROJECT|POLICY_DENIED|NOT_READY)` when Binding/eligibility refusal, unavailable policy, closed admission, absent required receipt capability or unsupported incremental capability.
- `MemoryError(REVISION_CONFLICT)` when The project/producer/event identity is reused with different admitted command content or binding epoch.
- `MemoryError(BACKPRESSURE)` when RAM admission, frame-count, segment-count or retained-journal-byte budget would be exceeded; existing accepted work is retained.
- `MemoryError(STORE_UNAVAILABLE)` when Uncertain write/sync outcome, unsafe ownership change, corrupt accepted data, invalid published checkpoint, receipt lookup failure or unverified cleanup.

**Preconditions:**
- Existing sc1 ownership guard is held throughout queue startup, mutation, recovery and close; no competing writer is opened.
- Queue lives only at dataDirectory/queue; no backend/global storage helper is imported.
- The queue-owned receipt-verification port is mandatory before terminal acknowledgement/recycling and after the durable receipt barrier has been installed.

**Postconditions:**
- No accepted acknowledgement precedes data sync and durable publication of the accepted frontier.
- All queue mutations share one FIFO; no failed or timed-out wrapper permits overlapping file mutation.
- A sealed segment is removed only after durable terminal proof, retirement publication, and reader-pin release.
- Caller retries retain stable identity; identical accepted submissions do not append another logical event.

### 2.2 `MemoryService`

```typescript
interface MemoryService extends MemoryLifecycle { submit(command: MemoryCommand): Promise<OperationReceipt>; operation(request: OperationRequest): Promise<OperationReceipt>; context(request: ReadRequest): Promise<ContextResult>; search(request: SearchRequest): Promise<ContextResult>; inspect(request: InspectRequest): Promise<Json>; }
```

**Parameters:**
- `command: MemoryCommand` — submit: eligible source/control command to persist, not a canonical-memory write.
- `request: OperationRequest` — operation: bound scope and stable operation ID for side-effect-free status lookup.

**Returns:** `Promise<OperationReceipt>` — S2 submit returns accepted for durable pending work. S2 operation returns accepted for an authorized retained event; future verified terminal state comes only from the receipt port. Context/search/inspect continue to reject NOT_READY until their owning stories exist.

**Errors:**
- `MemoryError` when Uses the unchanged sc2 codes and sanitized messages from durable ingress; unknown operation in an unrecycled queue is INVALID_REQUEST, unavailable required receipt lookup is NOT_READY/STORE_UNAVAILABLE rather than fabricated absence.

**Preconditions:**
- S1 options validation, dedicated directory ownership and queue recovery have completed.
- Binding and eligibility run before persistence; operation rebinds and checks requested scope before any receipt is returned. There is no implicit permissive policy.

**Postconditions:**
- Admission cannot change project/source identity, scope qualifiers, kind, version or expectedRevision; policy may redact payload, after which the complete returned command is revalidated.
- No provider inference, semantic extraction, Lance connection or canonical-memory success is introduced in S2.
- Shutdown stops new append admission, finishes or safely fences in-flight work, leaves accepted backlog replayable, closes queue resources, then releases sc1 ownership.

### 2.3 `QueueFrame`

```typescript
interface QueueFrame { readonly formatVersion: 1; readonly recordType: 'event'; readonly sequence: string; readonly operationId: string; readonly command: MemoryCommand; readonly checksum: string; readonly payloadHash: string; readonly queueId: string; readonly admittedAtMs: number; readonly scopeEpoch: string; }
```

**Returns:** `QueueFrame` — Owned sc3 frame extends the HLD sketch with required provenance for recovery and later revalidation. Every frame belongs to exactly one segment; command is the immutable admitted sc2 envelope.

**Errors:**
- `MemoryError(STORE_UNAVAILABLE|UNSUPPORTED_VERSION)` when Checksum/length/queue ID/sequence/canonical-byte mismatch or unsupported on-disk version.

**Preconditions:**
- Decode bounded bytes before JSON parsing; verify the full envelope and exact canonical re-encoding.

**Postconditions:**
- Sequence is canonical unsigned-64 decimal, starting at 1; no Number conversion or wrap/reset.
- payloadHash is SHA-256 of the canonical admitted command; checksum covers the entire remaining frame body including provenance.
- The public receipt shape and source occurrence-time evidence remain unchanged; admittedAtMs is arrival time only.

## 3. Data model changes

### 3.1 `Queue format, files and safety boundaries` — new

Proposed implementation files: packages/project-memory/src/queue/types.ts; packages/project-memory/src/queue/codec.ts; packages/project-memory/src/queue/io.ts; packages/project-memory/src/queue/checkpoint.ts; packages/project-memory/src/queue/recovery.ts; packages/project-memory/src/queue/file-queue.ts; packages/project-memory/src/queue/admission.ts. These are proposals, not existing helpers. Modify the existing host/runtime only to compose this owned participant and ingress. Disk layout: queue/format.json (immutable version/queue UUID), queue/segments/<20-digit-segment-id>.jsonl, queue/checkpoint.json, queue/checkpoint.prev, queue/checkpoint.next, queue/checkpoint.prev.next, and bounded queue/recovery.json or queue/fault.json. receipt-barrier.json is a write-once requirement marker installed before first retirement. There is no Lance/LMDB/receipt database here. Directory and files are owned-uid, private, regular/single-link, no-follow; queue directory cannot be a symlink. Assert sc1 ownership before mutations; verify file/directory identity around publication. Recycle uses verified basenames and unlink only, never recursive parent cleanup. Unknown nonempty queue content is refused. Initial empty queue creation fsyncs new children and parent entries before readiness; recognized interrupted bootstrap with no published checkpoint may recover only header-only/temporary files, never discard event-bearing files. [[c1]] [[c2]]

**Call sites:**
- `packages/project-memory/src/host-node.ts`
- `packages/project-memory/src/ownership.ts`
- `packages/project-memory/src/configuration.ts`

### 3.2 `Admission snapshot and stable retry identity` — new

Validate/copy caller input at invocation, not after awaiting policy. Accept only bounded acyclic JSON data, plain own data properties, dense arrays and finite numbers; reject accessors, unsupported prototypes, malformed Unicode, symbols and unknown envelope fields. No raw object/string is logged. Canonical encoding sorts object keys by fixed UTF-16 order, preserves arrays/string content without Unicode/path normalization, and uses deterministic JSON number encoding (including explicit -0 preservation). Validate the complete sc2 v1 envelope and kind set; strings used as identities are nonempty and bounded, with <=512 UTF-8 bytes per identity/qualifier and <=256 for sourceVersion/scopeEpoch. maxEventBytes bounds both raw snapshot and policy-returned command; nesting <=32 and nodes <=65536. HostPolicy.bind(projectId, scope.sessionId) must return the same project and valid root/epoch; HostPolicy.admit receives the bound complete command before durable writes. Revalidate its JSON output; only payload redaction is allowed, not identity/scope/kind/version/revision changes. Typed policy refusal maps to UNBOUND_PROJECT/POLICY_DENIED; unknown host failures are sanitized NOT_READY. No permissive default. Calls are processed in invocation FIFO, including policy awaits. A policy promise that never settles blocks the lane and causes drain deadlines to report incomplete; it is never treated as accepted. Identity key = canonical {version:1, projectId, producerId, eventId}; operationId = SHA256(domain-separator plus key), not queue cursor/random nonce. Compare payloadHash plus recorded scopeEpoch for retries. Same key/content/epoch returns the stable accepted receipt; changed content or epoch is REVISION_CONFLICT without overwriting the first event. Perform dedup lookup before physical-budget refusal so an exact retry needs no new journal space. Append retries rebind and re-admit. Operation status rebinds the requested project/session. Every qualifier present on the stored Scope must be present and equal on the request; omitting a stored session/branch/environment qualifier does not broaden access. A project-global event can be queried from an authorized narrower context. SourceIdentity.sessionId is provenance, distinct from Scope.sessionId visibility. A mismatch is indistinguishable from unknown. Host admission must verify producer/event namespace ownership. Status never persists or invokes payload-redaction as a mutation. [[c1]] [[c2]] types.ts is a read-only import/source reference in this change-site list, not an edit target: S2 leaves its sc1/sc2 declarations unchanged. All new private admission, framing and receipt-proof types live under the proposed queue/types.ts.

**Call sites:**
- `packages/project-memory/src/types.ts`
- `packages/project-memory/src/runtime.ts`
- `packages/project-memory/src/host-node.ts`

### 3.3 `Framed JSONL codec and bounded resource accounting` — new

Each physical line is canonical JSON {bytes:<body UTF-8 length>, checksum:<64 lower-case SHA256 hex>, frame:<body without checksum>} followed by LF. This is JSONL with explicit framing metadata, not newline-only durability. The initial segment-header line uses the same envelope with formatVersion=1, recordType='segment', queueId, segmentId and firstSequence; event bodies carry QueueFrame fields except checksum, with recordType='event'. Verify exact bytes/length/checksum/version, field allowlists, strict UTF-8, canonical representation and contiguous sequence before use. No JSON.parse or allocation from an untrusted length precedes a cap check; stream bounded chunks and reject overlong lines. Event commands are capped by caller maxEventBytes; qualify maxEventBytes <=16 MiB as a supported implementation ceiling, no new default. Allow at most maxEventBytes + 4096 physical bytes per event frame; metadata bounds above make this envelope overhead finite. maxPendingBytes counts actual retained segment bytes (headers and resolved prefixes included) plus reserved in-flight append bytes, not only payload sizes. Never evict accepted events. segmentBytes is a target: rotate before adding a frame that would cross it; a single valid frame larger than the target gets a dedicated bounded segment, still subject to maxPendingBytes. This preserves the S1 option relationship without pretending envelope overhead is zero. Private caps: 64 admitted/in-flight calls, 65536 indexed frames and 65536 segments; ingress accounting <=min(64 MiB, maxPendingBytes, 4*maxEventBytes), with incremental encoded-byte/key/node charges reserved before copying each item and refunded on failure. This is a bounded logical quota, not a promise about V8 RSS; the caller's existing heap and hostile JavaScript execution are outside the module sandbox. Exceeding any cap is explicit BACKPRESSURE. Checkpoint decoding <=32 MiB, with bounded per-frame retry/retirement metadata; control files are outside maxPendingBytes but separately bounded to at most four checkpoint-sized files plus small markers/reports. Report that physical overhead; maxPendingBytes is not a promise that total directory size equals that value. Release gates measure actual resource use; no arbitrary production segment/event default is selected. To guarantee future control-state transitions fit, reserve checkpoint capacity before acknowledging each frame/segment: 64 KiB fixed allowance plus 2048 bytes per retained frame and 512 per segment must fit the 32 MiB checkpoint cap. Codec tests must prove every allowed retry/terminal/retirement representation fits that allowance; metadata-cap backpressure may occur before the outer 65536-entry ceiling. Generation and machine error-code strings are <=128 UTF-8 bytes; scope fields retain the earlier <=512-byte identity/qualifier and <=256-byte epoch limits. Identity/checksum digests have fixed lengths. Lookup proof scope is transient authorization metadata, not a second persisted receipt copy. Retire one segment at a time, so transition state is bounded. These are implementation safety ceilings, not operational defaults or measured performance claims. Queue-specific limit validation is pure and occurs before acquiring sc1 ownership: maxEventBytes <=16 MiB and maxPendingBytes >=512 bytes (the qualified empty-segment header upper bound). No operational default is added. The segment target may be below header/frame size, but actual encoded bytes always count toward the retained-byte budget. A <=512-byte header bound and per-entry reservation bounds are proving tests, not assumptions. [[c1]] [[c2]]

**Call sites:**
- `packages/project-memory/src/types.ts`
- `packages/project-memory/src/configuration.ts`

### 3.4 `Serialized append and durable acceptance frontier` — new

All append, retry bookkeeping, seal, checkpoint and retirement mutations use one bounded FIFO. After policy/dedup, reserve full encoded bytes and private index capacity, validate ownership/file identity, then loop FileHandle.write until every byte is written (zero progress/short-write errors fail). Sync the segment; new-file creation also syncs its parent. Publish a checkpoint containing segment durable byte offsets/counts, last accepted sequence and pending identity/status metadata after data sync. Only after checkpoint replacement plus required directory sync succeeds may accepted be returned. A lost reply does not undo the frame. Any write/sync/rename uncertainty fences further mutations: return retryable STORE_UNAVAILABLE with deterministic operationId when available, wait for all underlying I/O to settle, and require close/reopen recovery. Do not append again after a failed partial write in the same live instance. Group commit is not implemented initially. Node FileHandle.write/sync API semantics are supported by https://nodejs.org/download/release/v22.22.1/docs/api/fs.html; directory durability is a distinct step per https://man7.org/linux/man-pages/man2/fsync.2.html. These references motivate the proposed protocol, not a claim that it has already passed crash qualification. [[c1]] [[c2]]

**Call sites:**
- `packages/project-memory/src/runtime.ts`
- `packages/project-memory/src/ownership.ts`

### 3.5 `Checkpoint publication and segment rotation` — new

Checkpoint v1 contains queueId, canonical decimal generation, active segment, referenced segments with accepted offsets/counts/first-last sequences and sealed/retiring state, terminal bitmaps, bounded retry records, last accepted sequence, and receipt-barrier requirement. It never proves a store mutation committed. Each serialized replacement first writes the prior validated current bytes to checkpoint.prev.next, loops writes, syncs, renames to checkpoint.prev and syncs queue directory; then writes/syncs checkpoint.next, renames over checkpoint.json and syncs directory. Retain previous valid bytes through publication. Published invalid current metadata is fail-closed corruption, not permission to roll acceptance back to an older checkpoint; previous remains for explicit repair/inspection. Unpublished .next data is never an accepted frontier. Filesystem rename atomicity is distinct from durability (https://man7.org/linux/man-pages/man2/rename.2.html). Rotation does not rename active data files: segment identity/filename stays fixed and checkpoint marks sealed/active. Sync the old segment, create/sync a successor header and its directory entry, publish old sealed/new empty active, then append. Header-only orphan successor at exactly the expected next ID may be removed/reused by qualified recovery; an event-bearing unreferenced segment or an unknown name is a fault. Never overwrite a referenced segment. Initial bootstrap has no accepted event until a valid checkpoint exists; a missing checkpoint after event-bearing history is not reset to empty. [[c1]] [[c2]]

**Call sites:**
- `packages/project-memory/src/configuration.ts`
- `packages/project-memory/src/ownership.ts`

### 3.6 `Recovery, reader snapshots and retry bookkeeping` — new

Startup under ownership validates format/IDs/paths and all published checkpoint metadata before readiness. Stream every referenced sealed segment strictly to expected end; validate active bytes through its durable accepted frontier. Missing/truncated/checksum-invalid content at or before that frontier, bad published metadata, sequence gaps, or any duplicate physical identity (even if hashes agree) is explicit STORE_UNAVAILABLE: preserve bytes in place, write bounded fault metadata if possible, quarantine the queue logically and do not expose partial success. Beyond the accepted active frontier, recover complete canonical valid contiguous frames as possibly-unacknowledged events; sync and publish their recovered frontier before exposing them. Only a final unterminated partial frame starting beyond the frontier may be removed: publish a bounded recovery intent/report with original size, truncate offset and suffix hash (no payload), then truncate/sync and publish state; recovery can resume this intent idempotently. Any complete corrupt line, sealed corruption or unreferenced event-bearing file is never skipped. Rebuild identity index from validated retained frames, not a second authoritative database. replay snapshots only durable pending entries, yields ascending sequence, and pins referenced segments against recycling until iterator return/finally. One context-builder replay consumer is supported; future S4 may schedule unrelated scopes, but S2 assigns total ingress order and never reorders itself. Private recordRetry metadata persists attempt count/nextEligibleAt/error code through the same checkpoint lane; S4 owns retry/backoff/causal scheduling decisions. Retry state does not mark an event resolved, and a poison event remains retained until a verified durable terminal disposition. oldestPendingMs uses saved admission wall time for diagnostics only; sequence defines ordering. [[c1]] [[c2]]

**Call sites:**
- `packages/project-memory/src/runtime.ts`
- `packages/project-memory/src/__tests__/ownership.test.ts`
- `packages/project-memory/src/__tests__/runtime.test.ts`

### 3.7 `Store-backed terminal proof and recycling` — new

Proposed private sc3-owned ReceiptVerifier port (in queue/types.ts) performs side-effect-free lookup by stable identity and lookup by operationId; results distinguish absent from unavailable and return minimal {operationId, identityDigest, payloadHash, scope: Scope, scopeEpoch, generation, receipt, queueTerminal:true}. S3 implements this port from authoritative retained receipts/tombstones; A verified receipt may report committed, durably terminal failed/quarantined, or cleanup-pending when logical processing is complete; the explicit queueTerminal flag, matching generation and identity are required. Cleanup-pending is not a claim that physical purge is complete, and a transient failed attempt is not terminal. S2 does not import sc4/store code or design its physical schema. Lookup by operation receives the requested Scope; both callback and queue validate the returned scope before exposing status, including recycled identities. Missing/insufficient scope proof is unavailable, never assumed project-global. Every future store-backed append consults the verifier first, even for retained events, so a lost queue acknowledgement cannot hide a known terminal receipt; only verified absence permits queue-index/new-event handling. markResolved verifies a durable logical-processing terminal receipt matching accepted identity/hash/epoch and requested generation, then durably checkpoints terminal bookkeeping. An arbitrary generation string, processing flag, timeout or retry counter cannot resolve an event. S2 queue-only mode has no verifier: it can accept/replay pending commands but cannot mark terminal or recycle. Before first retirement, durably create the write-once receipt-barrier.json marker; a queue requiring that capability cannot be reopened for queue-only admission without it. This prevents downgrade/recycle from losing retry barriers. Pick only sealed, fully proven terminal segments with zero reader pins. Publish a retiring checkpoint with bounded identity/generation references before any unlink; unlink exact verified files and fsync segments directory, then publish final removal while retaining receipt-barrier requirement. If interrupted, recovery finishes the recorded retirement or stops on unavailable proof; it never replays an intentionally retired missing file. The final queue checkpoint drops retired frame identities; S3 receipts remain authoritative for duplicate/forget replay boundaries beyond recycling. S9 owns when receipt/tombstone compaction is safe. No second permanent queue receipt store or invented producer-watermark protocol is introduced. [[c1]] [[c2]]

**Call sites:**
- `packages/project-memory/src/runtime.ts`
- `packages/project-memory/src/types.ts`

### 3.8 `S2 service composition and incremental capability` — invariant-change

Consume sc1/sc2 without signature changes. The host first validates options and acquires S1 ownership, constructs a private queue owner with tracked partial-startup resources, awaits queue recovery, and only then returns a service with an ingress delegate and queue OwnedWork participant. Queue startup/close failures are awaited; the factory releases ownership only after all queue I/O/handles are verified quiescent. Failure to verify cleanup retains ownership and reports STORE_UNAVAILABLE. Queue never closes the host's provider/policy/logger or ownership guard itself. submit is now real durable acceptance only; operation is an authorized read of retained queue status, never a new writer. context/search/inspect remain NOT_READY. With no S3/S4 processor, events remain accepted and replayable; this is explicitly queue readiness, not semantic availability. stopAdmission disables new public appends/status calls and new replay snapshots, while already admitted readers drain; it permits already-owned internal resolution bookkeeping until worker quiescence in later composition. Queue drain waits for admitted calls and I/O/snapshot leases, not for durable pending backlog to become semantic memory; backlog remains on disk at close. Deadline counts active owned work separately from QueueStats.pendingEvents. Close seals/syncs and closes queue handles only after the lane and readers settle; an ignored host-policy promise or unreturned internal replay iterator can make drain incomplete and close wait, retaining ownership safely. Later S3/S4 composition drains producers/worker before queue release. New tests must distinguish participant work.drain from service.drain; they are not a recursive service call. [[c1]] [[c2]]

**Call sites:**
- `packages/project-memory/src/host-node.ts`
- `packages/project-memory/src/runtime.ts`
- `packages/project-memory/src/types.ts`
- `packages/project-memory/src/__tests__/runtime.test.ts`

## 4. Diagrams

- [ER model](docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S002/er-model.html)
- [Sequence diagram](docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S002/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Use unchanged S1 options, ownership guard, explicit data directory, supplied host resources, lifecycle and serialized model dispatcher. S2 performs no model calls, adds no process handlers or backend imports, and composes queue work through private lifecycle participants. |
| `sc2` | consumes | Use unchanged command/source/scope/receipt/failure types. Implement durable accepted submission and authorized queue status only; validate host-policy output before persistence. No committed/empty-read success is fabricated. |
| `sc3` | implements | Own frame/cursor/stats, serialization, fsync frontier, checkpoint/rotation/recovery, retry bookkeeping and receipt-verified retirement. Internal verifier port is owned here and implemented later by S3, avoiding reverse dependency or a second authoritative store. |

## 6. Error paths

**Error cases**

- **Malformed, mutable or oversized command** (recoverable)
  - Detection: The bounded snapshot/canonical encoder checks own-data fields, prototype/array shape, cycles, depth/node/UTF-8 caps, v1 enum/required fields and identities before policy/I/O.
  - Response: Reject INVALID_REQUEST before persisting; release RAM reservation and never log payload.
  - User impact: No acceptance is reported.
- **Unbound/denied or invalid host-policy result** (recoverable)
  - Detection: Binding result project/root/epoch validation, typed policy refusal, or immutable envelope comparison after admit fails.
  - Response: Return UNBOUND_PROJECT/POLICY_DENIED; unknown port failure is sanitized NOT_READY. No queue write; a never-settling callback keeps its lane/ownership and drain reports incomplete.
  - User impact: Prohibited source never reaches queue, telemetry or models.
- **Retry identity reused with changed admitted content or epoch** (recoverable)
  - Detection: Index/receipt lookup finds same project-producer-event key with different canonical payload hash or recorded scope epoch.
  - Response: REVISION_CONFLICT; preserve original event and receipt. Same content returns the existing state without another append.
  - User impact: No silent overwrite or duplicate logical event.
- **Ingress, journal or metadata capacity exhausted** (recoverable)
  - Detection: Reservation checks include snapshot bytes/call count, full encoded frame/header bytes, retained physical segments and worst-case checkpoint growth.
  - Response: BACKPRESSURE before mutation; allow exact dedup retry after policy even when journal space is full. Pending events are not evicted.
  - User impact: Producer gets visible retry/defer signal.
- **Partial write, zero-progress write, ENOSPC or sync failure** (recoverable)
  - Detection: writeAll observes byte counts/errors; sync/rename/directory-sync promises reject or ownership/identity checks fail.
  - Response: No accepted reply. Fence the mutation lane, settle underlying I/O, return STORE_UNAVAILABLE with operationId when known, and recover on close/reopen. Failed/uncertain submissions may later be found durable; error does not promise absence.
  - User impact: Caller queries/retries stable identity, never blindly assigns a new one.
- **Crash after full append but before acceptance-frontier publication or reply** (recoverable)
  - Detection: Recovery sees valid contiguous complete suffix frames beyond a verified checkpoint frontier.
  - Response: Sync and publish the recovered frontier before exposing those events. Caller retry returns same operation identity. An incomplete EOF suffix is treated separately.
  - User impact: Complete possibly-unacknowledged work is recoverable; no duplicate logical event.
- **Provably incomplete unaccepted EOF suffix** (recoverable)
  - Detection: Active file ends without a complete canonical LF-terminated frame, and its start is strictly at/after the verified accepted offset; all prior accepted bytes validate.
  - Response: Persist bounded recovery intent/hash/offset, truncate only that suffix and sync; finish intent idempotently after restart. Never truncate within the accepted frontier.
  - User impact: Only unaccepted incomplete bytes are isolated; complete accepted events remain.
- **Corrupt accepted data, complete bad line, missing referenced file or sequence gap** (terminal)
  - Detection: Bounded decoder/checkpoint validation detects checksum/length/queue-ID/canonical-byte/sequence/count/offset mismatch, including corruption inside a published frontier or sealed file.
  - Response: Fail readiness/admission with STORE_UNAVAILABLE, preserve original bytes and logically quarantine; write only bounded fault metadata if possible. No skip-to-next-line or automatic reset.
  - User impact: Operator sees explicit unavailable/recovery-required state rather than partial success.
- **Uncertain/invalid published checkpoint or unsupported format** (terminal)
  - Detection: Current/previous canonical checkpoint validation fails or published generation/version/state references are inconsistent. Temporary next files are distinguished by exact names.
  - Response: UNSUPPORTED_VERSION or STORE_UNAVAILABLE. Do not roll an accepted frontier back merely because an older file parses; retain prior bytes for explicit inspection/repair.
  - User impact: No acknowledged event is silently reclassified as discardable tail.
- **Receipt absent, pending, mismatched or unavailable during terminal marking** (recoverable)
  - Detection: Verifier distinguishes absent/unavailable, validates receipt generation, key/hash/epoch and queueTerminal=true against the accepted event.
  - Response: Unavailable -> STORE_UNAVAILABLE; nonterminal -> NOT_READY; mismatch -> REVISION_CONFLICT. No terminal bit, retirement or deletion. No verifier in S2 means no terminal marking/recycling.
  - User impact: Canonical commit is never inferred from a queue cursor or supplied generation string.
- **Crash during segment retirement or missing receipt capability on reopen** (recoverable)
  - Detection: Recovery reads a durable receipt-barrier marker and retiring checkpoint with exact bounded segment/operation references.
  - Response: Require the verifier, complete only the recorded retirement after proof/reader checks, sync unlink directory, then publish final removal. Without capability return NOT_READY; do not reset or reinterpret missing retired files as new work.
  - User impact: Recycled identity history remains protected by S3 receipts.
- **Ownership changed, close failure, ignored policy promise or abandoned replay iterator** (recoverable)
  - Detection: sc1 assertOwned/file identity fails, handle close rejects, or lifecycle deadline expires with active lane/leases.
  - Response: Stop admission, retain ownership until quiescence and queue handle cleanup are verified; drain returns completed:false/pending>0 for deadlines. Never close host ports or release lock early.
  - User impact: Safe failure may require host intervention; accepted backlog stays replayable.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A canonical valid event frame exceeds segmentBytes but fits maxEventBytes and retained-byte budget. | Use a dedicated bounded segment; segmentBytes is a rotation target, not a promise that envelope overhead vanishes. |
| Exact retry when the queue byte budget is full. | After binding/policy, find matching index/receipt first and return existing receipt without disk growth. |
| Two producers submit simultaneously; one fails eligibility. | Invocation FIFO serializes policy and append; sequence is assigned only to durable candidate frames. Invalid work does not reserve a permanent sequence. |
| Another source field changes while reusing producer/event ID. | Full admitted-command hash detects the change and rejects; identity namespace is project+producer+event. |
| Another process owns the same directory or an alias. | Existing S1 ownership refusal applies; no queue writer is opened. |
| Same source identity reused in a different project. | A different scoped key/operationId; project binding must authorize it independently. |
| Wall clock goes backward or forward. | Saved admission time is diagnostics only; clamp negative oldest age to zero and preserve sequence ordering. Source occurrence evidence is untouched. |
| Shutdown with thousands of accepted events but no semantic worker yet. | Drain flushes active admission/I/O, not the durable backlog; close leaves pending frames for later replay. |
| A replay reader is paused while a sealed segment becomes terminal. | Keep the segment pinned; recycling waits for iterator return/finally. Lifecycle reports incomplete if an owned reader never releases. |
| Poison event blocks its subject while unrelated work completes later. | replay exposes total sequence; S4 owns causal scheduling. Queue permits out-of-order verified terminal acknowledgements, retains unresolved holes and cannot recycle a mixed pending segment. |
| A logical forget receipt is cleanup-pending. | Only explicit verified queueTerminal=true permits queue acknowledgement; physical purge remains pending and is not reported complete by S2. |
| A later version has recycled events, but an older queue-only host opens the directory. | The durable receipt-barrier requirement prevents admission without authoritative identity lookup; no second permanent receipt ledger is invented. |
| Maximum uint64 sequence/segment/checkpoint generation is reached. | Fence/reject further mutation explicitly; never wrap/reset identifiers. A later reviewed format/migration is required. |
| Complete unknown schema/version frame appears after the accepted active frontier. | Do not assume it is disposable tail; fail closed as unsupported/corrupt content. |

**Invariants to preserve**

- Public sc1/sc2 signatures, pure import, explicit directory selection and host-owned supplied resources remain unchanged. [[c3]]
- One canonical directory has one OS-held owner; no file is recycled while work can still use it. [[c4]]
- Accepted is distinct from canonical commit; authoritative receipt/deletion state belongs to S3, beyond queue recycling. [[c1]]
- Privacy and eligibility precede durable enqueue; no raw payload routine logging or provider calls in this story. [[c2]]

## 7. Test strategy

**Test framework:** `node:test with strict TypeScript/ESM via node --import tsx --test, as verified in the package source and package.json after test.locate returned off-topic JetBrains hits. Reuse the S1 Node22 subprocess fixture and real native ownership/process fixtures; no real LLM is required.`

**Test levels**

- **unit** — Deterministic codec, limits and identity behavior without claiming filesystem durability.
  - Subjects: `canonical-json-frame-length-checksum-and-bounded-decoding`, `immutable-policy-snapshot-before-persistence`, `scoped-identity-exact-retry-and-conflicting-reuse`, `retained-byte-and-worst-case-metadata-reservations`, `checkpoint-schema-generation-and-retry-state-validation`
  - Fixtures: `Adversarial cyclic/accessor/prototype/Unicode/NaN/depth/node-count inputs and valid equivalent key orderings.`, `Exact UTF-8 command/frame/header byte measurements at each limit; malformed lengths and very large declared lengths.`, `Bounded index/checkpoint/retirement metadata sizing corpus; no parser allocation based on an untrusted length.`
- **integration** — Qualify real queue I/O and failure ordering under the existing S1 ownership guard.
  - Subjects: `concurrent-admission-fifo-and-idempotent-retry`, `accepted-set-survives-process-kill-at-every-boundary`, `recovery-frontier-complete-suffix-and-unaccepted-partial-tail`, `published-checkpoint-and-sealed-corruption-fail-closed`, `rotation-orphan-successor-and-checkpoint-replacement-matrix`, `write-sync-rename-unlink-failure-fences-the-lane`, `verified-terminal-ack-retirement-and-reader-pins`, `recycled-identity-requires-authoritative-receipt-capability`, `retry-holes-do-not-authorize-mixed-segment-deletion`, `drain-close-startup-failure-preserve-backlog-and-ownership`, `macos-apfs-linux-ext4-node22-queue-qualification`
  - Fixtures: `Real temporary APFS/macOS and ext4/Linux roots under Node >=22.22.1 <23, using actual fs-ext owner guard; unsupported or skipped runs never count as qualified.`, `Child barrier protocol around each write/sync/checkpoint backup/rename/directory sync/rotation/retire/unlink; parent records actual accepted responses as the recovery oracle.`, `Private I/O test seam forwards real filesystem operations and injects short/zero writes and errors before/after each boundary; no production fault option.`, `Durably persisted test-only fake receipt verifier outside queue files, simulating S3 outcomes including absent/unavailable/nonterminal/cleanup-pending and mismatched generation; this is not Lance atomicity evidence.`, `Changed/hardlinked/symlinked metadata and queue directories, missing referenced segments, corrupt published checkpoint, stale temp files, event-bearing orphan and oversized/unterminated lines.`, `Force-killed versus stopped live owner, duplicate package/worker/process attempts, ignored policy promise and paused replay iterator.`
- **contract** — Preserve sc1/sc2 and define the sc3/S3 seam without implementing another story's store.
  - Subjects: `public-service-accepted-status-and-unavailable-semantic-capabilities`, `sc3-receipt-verifier-proof-and-causal-order-contract`, `privacy-binding-and-scope-status-isolation-before-enqueue`
  - Fixtures: `Fake policy/model/logger ports with invocation counters: no model calls, no payload logging, denied/unbound input produces no journal event.`, `Caller mutation while policy is paused; policy identity/scope mutation; invalid policy output; repeated policy refusal for retries.`, `Authorized operation queries versus wrong project/session/branch/environment, unknown operation, and unavailable required verifier.`, `S3 integration obligation: receipt-before-inference/commit-before-ack and deletion barriers must later pass against actual Lance; fake-port tests do not satisfy that future lead-story evidence.`, `Operation lookup after recycling must verify authoritative proof.scope: project-only requests cannot reveal session/branch/environment-scoped receipts by omitting qualifiers; authorized narrower requests may see project-global events. Missing proof scope is unavailable, not fabricated broad access.`
- **smoke** — Prove independent consumption and honest incremental behavior after S2.
  - Subjects: `packed-external-submit-crash-reopen-and-operation`, `pure-import-and-no-daemon-or-backend-storage-dependency`, `package-suite-root-build-and-current-source-ci-evidence`
  - Fixtures: `Normally installed tarball and declared dependencies in isolated Node22 TS/ESM consumer, no NODE_PATH/workspace symlink/backend config; explicit policy and dedicated directory.`, `Submit accepted, kill/reopen, retry stable identity, query accepted; search/context/inspect remain NOT_READY; natural process exit after close.`, `Focused package checks and root build once after integrated changes; each build task runs only relevant tests, broader feature sweep stays with S9.`
- **integration** — Close OD-02 with measured format/resource evidence and explicit unresolved operational SLOs, not invented latency claims.
  - Subjects: `queue-resource-and-fsync-cost-measurement`
  - Fixtures: `Named hardware/OS/Node/filesystem corpus of 1 KiB, 64 KiB and 1 MiB commands plus 16 MiB safety ceiling; empty, 1k and metadata-cap backlog profiles.`, `Record p50/p95 accepted latency separately from semantic commit (not implemented), cold recovery time, actual segment/control bytes, RSS/heap and private admission counters.`, `No production event/segment defaults or acceptance-latency SLO is approved here. Publish measurements with actual durability steps enabled; release may not claim unmeasured performance. Hardware power-loss durability is not established by SIGKILL/injected-I/O tests.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `concurrent-admission-fifo-and-idempotent-retry`, `accepted-set-survives-process-kill-at-every-boundary`, `recovery-frontier-complete-suffix-and-unaccepted-partial-tail`, `scoped-identity-exact-retry-and-conflicting-reuse`, `packed-external-submit-crash-reopen-and-operation` |
| `ac2` | `retained-byte-and-worst-case-metadata-reservations`, `published-checkpoint-and-sealed-corruption-fail-closed`, `rotation-orphan-successor-and-checkpoint-replacement-matrix`, `verified-terminal-ack-retirement-and-reader-pins`, `write-sync-rename-unlink-failure-fences-the-lane`, `macos-apfs-linux-ext4-node22-queue-qualification` |

## 8. Alternatives considered

### 8.1 a1: Framed JSONL segments with a durable acceptance frontier — **CHOSEN**

One serialized journal lane, bounded event frames and a small versioned checkpoint protocol using Node filesystem primitives.

Consume sc1/sc2 unchanged; implement sc3 inside the independent package. A bounded canonical JSONL envelope carries command, scoped identity, byte length, sequence and checksum. Durable append publishes a checkpoint frontier after data sync before acknowledging. Recovery validates the frontier and scans complete unacknowledged suffixes; only proven incomplete suffixes beyond it may be truncated. Terminal bookkeeping and segment recycling consume a queue-owned receipt-verification port implemented later by s3; queue-only s2 never invents store commits. No backend helper is imported. This is the smallest shape meeting recorded segmented-JSONL direction; bounded discovery found no qualified standalone helper.

### 8.2 a2: Segmented JSONL with append-only acceptance/control journal

Separate data segments and a second append-only control log whose committed records define admission, resolution and retirement.

Preserve sc3 and S1 contracts; frame JSONL data independently and publish accepted/resolved/retiring control records in a separate checksummed serialized log after data sync. A compact checkpoint accelerates replay of the control log. Store receipts remain authoritative and must verify terminal outcomes; the second log is queue bookkeeping only. It fits the same library architecture but adds its own rotation, compaction and crash-order protocol.

**Rejected because:** Meets the same logical contract but introduces a second rotating control journal and its compaction lifecycle without demonstrated need.

### 8.3 a3: Fixed-size preallocated JSONL segment slots

Use bounded frame slots and durable slot/frontier metadata to avoid variable-tail ambiguity.

Keep line-framed versioned JSON records in fixed-sized slots in each independent queue segment; serialize allocation, data sync and durable frontier publication. Sc3 hides slot addressing. Every public event still uses stable identity and store-backed terminal proof. This remains a segmented file queue, but frame maximum determines physical allocation instead of actual payload size.

**Rejected because:** Can meet durability but fixed-slot amplification is a partial fit to configurable pending-byte budgets and the narrow JSONL direction.

## 9. References

- **[[c1]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/HLD.md`
- **[[c2]]** `doc` `docs/reqs/shared-project-memory.html#queue`
- **[[c3]]** `code` `packages/project-memory/src/types.ts`
- **[[c4]]** `code` `packages/project-memory/src/ownership.ts`
- **[[c5]]** `code` `packages/project-memory/src/runtime.ts`
- **[[c6]]** `code` `packages/project-memory/src/host-node.ts`
- **[[c7]]** `convention` `packages/project-memory/package.json`
- **[[c8]]** `doc` `https://nodejs.org/download/release/v22.22.1/docs/api/fs.html`
- **[[c9]]** `doc` `https://man7.org/linux/man-pages/man2/fsync.2.html`
- **[[c10]]** `doc` `https://man7.org/linux/man-pages/man2/rename.2.html`
- **[[c11]]** `code` `packages/project-memory/src/__tests__/ownership.test.ts`
- **[[c12]]** `code` `packages/project-memory/src/__tests__/packed.test.ts`
- **[[c13]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/DEF.md`
- **[[c14]]** `doc` `docs/reqs/shared-project-memory.html#P-03`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 15 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-11-02T06:11:40.567Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._

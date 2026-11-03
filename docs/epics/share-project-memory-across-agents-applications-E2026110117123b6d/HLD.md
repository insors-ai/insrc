<!-- insrc:artifact HLD-17123b6d304af2a2 -->

# HLD: share-project-memory-across-agents-applications

## Summary

One independently consumable memory package provides the complete ingestion, reconciliation, lifecycle and recall service. A host can run it in process or expose the same service through a private local IPC endpoint. insrc contributes adapters for its registered projects, providers and clients; it does not own the core package's runtime.

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

> See **DEF-17123b6d304af2a2** § 1. Problem

## 2. Framework summary

Choose a1: ports-and-adapters library with optional local service host. The library owns one queue, one context-builder processing loop and one dedicated Lance connection per resolved data directory. Admission, project policy and source identity are common to both hosts. Standalone and embedded execution must pass the same behavioral and failure suite. [[c1]] [[c2]]

## 3. Architecture shape

## Proposed package and hosting boundary
All package names and paths in this section are proposed, not existing code. Add an independently built ESM package at packages/project-memory with its own package.json, tsconfig, emitted types, packaged schema/prompt assets, focused tests and distribution smoke test. Proposed import name @insrc/project-memory exports the embedded factory and public types; @insrc/project-memory/ipc exports a lightweight client which does not import or open Lance. A node-host entry supplies queue and dedicated Lance adapters. The insrc-memory executable is separately exported by that package and owns process-level handlers only when invoked. Do not import src/daemon, src/config, src/db connection singletons or global insrc PATHS from this package. Node and native Lance compatibility are checked against the actual supported package runtime before release; dependency counts and footprint include Lance rather than describing the entire feature as tiny.
A trusted local bootstrap adapter supplies ModelPort, project policy, limits and logging for standalone operation (explicit config/adapter module, never loaded from IPC input). Ship a documented independent local-provider example and external consumer fixture; no running daemon, index or registry is required. In insrc, an adapter outside the package translates the existing LLMProvider, role policy, registered repos and privacy restrictions. A host may embed one instance or connect to a standalone instance, but must not accidentally run both over the same directory. Both modes use the same application service; no mandatory child process in embedded mode.


## Package build and backend consumption
The current root package.json has no workspace declaration and tsconfig.json compiles only src. The proposed s1 integration is a minimal npm workspace for packages/project-memory, with its own package.json, strict NodeNext tsconfig, public exports/types, scripts and packaged prompt/schema assets. No additional monorepo build framework is required. Root package.json and package-lock.json become explicit s1 change sites: npm installation links the workspace, and the root build orchestrates the package build before the existing backend tsc/model-definition/copy-assets pipeline. Backend adapters consume the package export, not its TypeScript sources; rootDir remains src. The package declares its own runtime dependencies and build/test commands and must pass npm pack plus installation in a separate minimal Node application without backend source or node_modules. s1's LLD defines exact scripts, dependency versions and native-module packaging evidence; the architectural choice is npm workspace orchestration plus independently consumable package output, not an implicit unresolved toolchain.

## Dependency and relationship directions
External application -> embedded MemoryService (many callers to one hosting instance). Remote clients -> IPC transport -> the same MemoryService (many clients to one instance). Service -> queue ingress (one serialized appender) -> context-builder worker (one store mutation owner) -> dedicated Lance connection (one memory database). Recall -> qualified committed snapshots (many side-effect-free reads). Core -> injected model/policy/logging ports; insrc adapter -> core, never the reverse. Multiple directories are independent instances with separate locks/queues/connections. Ownership is an OS-held process guard for the canonical existing directory, not merely a PID file; aliases/symlinks are resolved, parent containment with index and queue cleanup paths is validated and dead-process recovery never steals a live lock. Exact lock primitive and cross-platform support are qualification gates for s1.
Lifecycle: import performs no I/O; open validates binding/config, acquires ownership and recovers queue/store before readiness. Stop closes admission, drains to a deadline, leaves unfinished accepted events replayable, closes owned handles and releases ownership. A remote disconnect affects only that client. A timeout/cancellation cannot erase a durably accepted command; clients query its stable operation identity.

## Admission and queue contract
Host policy runs before durable persistence; deny private/temporary input and unbound scope. Assign string sequence numbers, scoped operation identity, source version and payload hash; same identity with different content is a conflict. A JSONL frame carries bounded payload, checksum and format version. Serialized append must finish writes, fsync the file, and synchronize new file/rename directory entries as qualified before returning accepted. Group commit is permitted only if every acknowledged frame is included in that sync. Size seals a segment; unresolved work is never evicted for disk limits. Backpressure is visible.
Checkpoint/manifest replacement uses a compatible atomic-file helper or the qualified native temp/fsync/rename sequence, including required directory sync. It is an accelerator, not authority for whether inference/store mutation committed. Recover only a demonstrably incomplete final frame by truncating to the last verified boundary; non-tail corruption is isolated and fails closed with explicit affected-operation status rather than silently skipped. Recycle a sealed file only when all contained events have durably resolved outcomes. Quarantine payloads, retries, retention and backups remain privacy-governed.

## Processing, consistency and mutable memory
One serialized context-builder execution path schedules extraction, local embedding, reconciliation, commit and maintenance. The package must provide a module-local serialized model dispatcher covering worker, read/query embedding and maintenance requests; serial awaits in one worker alone do not prevent concurrent read calls from overlapping. No reusable global model-concurrency scheduler is established by the current grounding. insrc per-role routing selects models; its serial-await convention is not a runtime mutex. The s7 LLD must explicitly design and qualify host-side admission/coordination with existing daemon model work before enabling that integration, without assuming an existing scheduling component. This can require a new adapter-level gate or cooperation with existing job lanes; a module-local dispatcher alone cannot prove cross-host non-overlap. All coordination remains outside the reusable core's daemon dependency boundary. Slow model work holds no database transaction. Bounded retries expose failure/quarantine; unrelated scopes may proceed, but corrections/forgetting cannot pass earlier same-scope or source-dependent work unsafely.
Keep sources separate from canonical memory. Normalize atomic type, scope, conditions, polarity, identifiers, authority and evidence before scoped exact/hash/lexical/semantic candidate comparison. Classify equivalent, expanded, corrected, superseded, conflicted, related or new; nearest-neighbor similarity alone never merges. Validate compression against original typed facts, retain uncertainty and reject lossy activation. Structured explicit instructions bypass extraction only, preserving policy, guards and receipt processing. Reported tool output or recalled approval cannot become a new authorizing instruction.
The proposed physical commit unit is a single typed Lance table: current, revision, source, evidence, receipt, tombstone, control/generation and delivery rows with stable IDs, nullable embedding fields where qualified. Prepare one event's full row set and apply it with one qualified table mutation, including receipt and generation. Single writer validates expected revisions, duplicate keys and subject lifecycle before commit. No general multi-table transaction is assumed. After a lost response, inspect the committed receipt before repeating inference; after commit repair queue completion rather than reapply effects. If installed Lance cannot meet the documented atomicity, nullable-vector and read consistency contract, stop s3 for a reviewed design amendment rather than split authority across stores.
Read context from one committed version; multi-query assembly pins a qualified table version or retries on generation change. Cache by project/scope/policy/provider budget and generation. Re-evaluate time eligibility on reads and expire cached bundles at the earliest applicable validity boundary, even when no new commit changes the generation. Invalidate on any relevant commit, correction or forgetting. Directives use scalar/current snapshots; hybrid recall returns authoritative content in the same query, with scope/lifecycle filters applied before ranking limits. Pending after-operation barriers wait to deadline or report a typed result, never return stale success.

## Forgetting, evidence and compatibility
A project owns many sessions/memories/events; a session owns admitted spans; a memory owns revisions; evidence joins revisions to spans many-to-many. Event identity maps to at most one committed receipt; retain replay barriers beyond queue recycling. Logical deletion atomically hides current/derived content and publishes minimal tombstones; source-scoped forgetting invalidates dependent memories, summaries, caches and future replay. Physical purge accounts separately for old Lance versions, queue segments/quarantine, native transcripts and backups. Never claim removal outside the module's control. Receipts/tombstones cannot be compacted until producer replay watermarks or explicit stale-event rejection make it safe.
Version public API, IPC, frame/schema, normalizer and embedding metadata. No silent import of existing transcript/vector stores. A migration/re-embedding command is resumable through the same writer and preserves source identity, deletion guards and reader freshness. Full command payload schemas, Arrow fields and migration compatibility belong to the owning LLD before implementation.

## Local IPC and integration
Use bounded versioned JSON-RPC framing over an OS-private local endpoint; same-host single-user scope, no TCP listener or implied multi-user security. Unix sockets require protected directory/endpoint permissions; Windows support, if shipped, requires named-pipe ACL qualification and parity, otherwise declare the release's supported platforms explicitly. Reject oversized/unknown/version-mismatched requests, cap connections and in-flight work and propagate deadlines. Idempotent retries retain command identity; transport request IDs are not operation IDs. Admin drain/stop belongs to explicit host management, not an unauthenticated per-client close method.
Managed session adapters own capture for managed runs; native hooks do not recapture them. Native adapters own independent CLI deltas; MCP explicit capture is not proof of automatic per-turn capture or mandatory context delivery. Capability matrix is installed-version-specific. No transcript/schema/hook support is asserted until live qualified. Inspector/edit/forget UI layout is deferred to s7's LLD with necessary UX definitions; this HLD introduces no panel layout. Existing VS Code/JetBrains and CLI/MCP consume insrc adapters through IPC, never by opening memory storage.

## Qualification and traceability
The authoritative requirements input is docs/reqs/shared-project-memory.html (all numbered requirements and AC-01 through AC-32), constrained by the approved DEF. Owning LLDs must trace their cases to these requirements. Foundation public contracts are owned by s1 so later stories never force reverse dependencies. Later interfaces remain private to their owner unless named below. s1 demonstrates external package import/lifecycle; complete functional service parity is evaluated after s6, not claimed from foundation scaffolding. All open implementation decisions OD-01 through OD-11 require evidence in their owning LLD; no benchmark, hook or atomicity claim is established by this HLD.

## Requirements acceptance ownership
Each requirements-document AC has exactly one lead story accountable for its final integrated test and evidence. Supporting stories supply focused component evidence; they do not replace the lead owner. Every story also retains its own approved DEF ac1/ac2/ac3 criteria. Foundation s1 owns the external-consumer harness, import/lifecycle, package isolation and ownership primitives; complete consumer and cross-mode cases necessarily finish after their downstream capabilities exist, under s5/s6. s9 reruns the full matrix at the release sweep without claiming all these integrated cases passed during s1. LLDs must preserve this allocation and enumerate concrete positive/failure tests; build records must link their actual results.

| Requirements case | Lead story | Supporting stories | Test responsibility |
| --- | --- | --- | --- |
| AC-01 | s7 | s4, s5, s6 | Managed Claude/Codex/Vibe/Ollama handoff |
| AC-02 | s4 | s3, s5 | Canonical paraphrase/evidence deduplication |
| AC-03 | s4 | s3 | Fact/directive/product-decision separation |
| AC-04 | s4 | s3 | Qualifier and negation fidelity |
| AC-05 | s4 | s3, s5 | Explicit supersession and lineage |
| AC-06 | s4 | s3, s5 | Inspectable unsettled conflicts |
| AC-07 | s4 | s3 | Exact duplicate identity beyond ANN candidates |
| AC-08 | s4 | s3 | Bounded reference resolution |
| AC-09 | s4 | s2, s3 | Occurrence-time normalization |
| AC-10 | s5 | s3, s4 | Exact identifier/path retrieval |
| AC-11 | s5 | s1, s3, s7 | Scope isolation across candidates/evidence/context |
| AC-12 | s7 | s4, s8 | No captured-context or assistant-authority feedback loop |
| AC-13 | s4 | s2, s3 | Malformed inference/embedding failure outcomes |
| AC-14 | s3 | s1, s2, s6 | Queue/store crash boundaries and idempotent committed effects |
| AC-15 | s2 | s1, s3 | Segment rotation/tail/corruption recovery |
| AC-16 | s2 | s1 | Backpressure without pending-event eviction |
| AC-17 | s5 | s3, s4 | Revision/deletion read and cache freshness |
| AC-18 | s5 | s3, s9 | Time-based expiry without a generation-changing write |
| AC-19 | s3 | s2, s4, s5, s9 | Replay-safe forgetting and derived-context invalidation |
| AC-20 | s9 | s2, s3, s5 | Logical deletion and honest physical-purge accounting |
| AC-21 | s2 | s1, s3, s6 | Ownership guard and concurrent ingress |
| AC-22 | s7 | s2, s6, s8 | Source rotation/detach/reconnect identity and durability |
| AC-23 | s8 | s6, s7 | Version-qualified native hook/resume/compaction behavior |
| AC-24 | s5 | s7, s8 | Mandatory-directive overflow and actual invocation budget |
| AC-25 | s7 | s1, s2, s4, s8 | Pre-persistence temporary/private-execution refusal |
| AC-26 | s9 | s3, s4, s5 | Deletion-preserving model/schema/embedding migration |
| AC-27 | s4 | s1, s3 | Structured command bypasses extraction, not guards |
| AC-28 | s5 | s1, s3, s6 | Store unavailable versus valid empty result |
| AC-29 | s3 | s1, s9 | Independent store/cleanup paths |
| AC-30 | s5 | s1, s2, s3, s4 | Complete external embedded consumer flow |
| AC-31 | s6 | s1, s2, s3, s4, s5 | Daemon-stopped IPC and complete embedded/IPC parity |
| AC-32 | s6 | s1, s2, s3 | Cross-mode ownership, import and shutdown lifecycle |


## 4. Diagrams

- [ER model](docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/er-model.html)
- [Sequence diagram](docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/sequence-diagram.html)
- [Component dependencies](docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/component-dependency.html)

## 5. Shared contracts

### 5.1 sc1: Host ports and package lifecycle

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s6`, `s7`, `s8`, `s9`

**Purpose:** Versioned dependency boundary for independent embedded execution; no backend imports, implicit globals or ownership of supplied providers. All module model requests use a module-local dispatcher; supplied ports do not imply an existing daemon-wide scheduler.

**Interface sketch (type-level):**

```
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface ProjectBinding { projectId: string; root: string; scopeEpoch: string; }
interface ModelRequest { role: 'normalize' | 'reconcile' | 'compress' | 'validate'; input: Json; schema: Json; signal: AbortSignal; }
interface ModelPort { complete(request: ModelRequest): Promise<Json>; embed(text: string, signal: AbortSignal): Promise<readonly number[]>; readonly embeddingModel: string; readonly embeddingDimension: number; }
interface HostPolicy { bind(projectId: string, sessionId?: string): Promise<ProjectBinding>; admit(binding: ProjectBinding, event: Json): Promise<Json>; }
interface MemoryOptions { dataDirectory: string; models: ModelPort; policy: HostPolicy; logger: MemoryLogger; limits: MemoryLimits; }
interface MemoryLogger { write(level: 'debug' | 'info' | 'warn' | 'error', event: string, fields: Record<string, string | number | boolean>): void; }
interface MemoryLimits { maxEventBytes: number; maxPendingBytes: number; segmentBytes: number; modelTimeoutMs: number; }
interface MemoryLifecycle { ready(): Promise<void>; drain(deadlineMs: number): Promise<DrainResult>; close(): Promise<void>; }
interface DrainResult { completed: boolean; pending: number; }
interface MemoryFactory { open(options: MemoryOptions): Promise<MemoryService>; }
```

### 5.2 sc2: Application service and domain wire types

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s6`, `s7`, `s8`, `s9`

**Purpose:** One versioned typed command/query model shared by embedded, IPC and insrc adapters; all mutation paths enqueue.

**Interface sketch (type-level):**

```
type OperationState = 'accepted' | 'processing' | 'committed' | 'failed' | 'quarantined' | 'cleanup-pending';
interface Scope { projectId: string; sessionId?: string; branch?: string; environment?: string; }
interface SourceIdentity { producerId: string; eventId: string; sessionId: string; turnId: string; sourceVersion: string; }
interface MemoryCommand { version: 1; scope: Scope; source: SourceIdentity; kind: 'capture' | 'correct' | 'forget' | 'resolve' | 'maintenance' | 'delivery'; payload: Json; expectedRevision?: string; }
interface OperationReceipt { operationId: string; eventId: string; state: OperationState; generation?: string; errorCode?: string; }
interface ReadRequest { scope: Scope; budgetTokens: number; afterOperationId?: string; deadlineMs?: number; }
interface SearchRequest extends ReadRequest { query: string; limit: number; }
interface InspectRequest { scope: Scope; memoryId: string; }
interface ContextResult { generation: string; items: readonly MemoryView[]; overflow: boolean; degraded: boolean; }
interface MemoryView { id: string; revision: string; kind: string; text: string; status: string; sourceIds: readonly string[]; }
interface OperationRequest { scope: Scope; operationId: string; }
interface MemoryService extends MemoryLifecycle { submit(command: MemoryCommand): Promise<OperationReceipt>; context(request: ReadRequest): Promise<ContextResult>; search(request: SearchRequest): Promise<ContextResult>; inspect(request: InspectRequest): Promise<Json>; operation(request: OperationRequest): Promise<OperationReceipt>; }
interface MemoryFailure { code: 'INVALID_REQUEST' | 'UNBOUND_PROJECT' | 'POLICY_DENIED' | 'BACKPRESSURE' | 'NOT_READY' | 'UNSUPPORTED_VERSION' | 'OWNERSHIP_CONFLICT' | 'REVISION_CONFLICT' | 'STORE_UNAVAILABLE' | 'CONTEXT_OVERFLOW' | 'DEADLINE_EXCEEDED'; retryable: boolean; operationId?: string; }
```

### 5.3 sc3: Durable ingestion and replay

**Owner Story:** `s2`
**Consumed by:** `s3`, `s4`, `s5`, `s6`, `s7`, `s8`, `s9`

**Purpose:** Serialize admission, expose durable event identity and safely recycle only fully resolved segments.

**Interface sketch (type-level):**

```
interface QueueFrame { formatVersion: 1; sequence: string; operationId: string; command: MemoryCommand; checksum: string; payloadHash: string; }
interface QueueCursor { segmentId: string; byteOffset: string; }
interface QueueStats { pendingBytes: number; oldestPendingMs: number; pendingEvents: number; }
interface DurableQueue { append(command: MemoryCommand): Promise<OperationReceipt>; replay(): AsyncIterable<QueueFrame>; markResolved(operationId: string, generation: string): Promise<void>; stats(): QueueStats; seal(): Promise<void>; recycleResolvedSegments(): Promise<void>; close(): Promise<void>; }
```

### 5.4 sc4: Single-writer atomic memory commit

**Owner Story:** `s3`
**Consumed by:** `s4`, `s5`, `s6`, `s7`, `s8`, `s9`

**Purpose:** Bind canonical transitions, provenance, generation, deletion protection and processing outcome in a qualified single-table commit.

**Interface sketch (type-level):**

```
interface CommitPlan { operationId: string; scope: Scope; expectedGeneration: string; rows: readonly TypedMemoryRow[]; }
interface TypedMemoryRow { rowId: string; rowKind: 'current' | 'revision' | 'source' | 'evidence' | 'receipt' | 'tombstone' | 'control' | 'delivery'; projectId: string; payload: Json; embedding?: readonly number[]; }
interface CommittedSnapshot { version: string; generation: string; }
interface MemoryStore { receipt(scope: Scope, operationId: string): Promise<OperationReceipt | null>; snapshot(scope: Scope): Promise<CommittedSnapshot>; commit(plan: CommitPlan): Promise<OperationReceipt>; current(scope: Scope, snapshot: CommittedSnapshot): Promise<readonly MemoryView[]>; close(): Promise<void>; }
```

### 5.5 sc5: Semantic reconciliation and fidelity validation

**Owner Story:** `s4`
**Consumed by:** `s5`, `s6`, `s7`, `s8`, `s9`

**Purpose:** Produce meaning-preserving canonical changes; structured commands bypass extraction but never validation or commit guards.

**Interface sketch (type-level):**

```
type Reconciliation = 'equivalent' | 'expand' | 'correct' | 'supersede' | 'conflict' | 'related' | 'new' | 'incomplete';
interface Candidate { kind: string; text: string; scope: Scope; polarity: string; conditions: readonly string[]; authority: string; sourceIds: readonly string[]; }
interface ReconciledCandidate { candidate: Candidate; relation: Reconciliation; targetId?: string; validation: 'faithful' | 'uncertain' | 'rejected'; }
interface SemanticProcessor { process(frame: QueueFrame, snapshot: CommittedSnapshot, signal: AbortSignal): Promise<readonly ReconciledCandidate[]>; }
```

### 5.6 sc6: Scoped recall and generation-aware context

**Owner Story:** `s5`
**Consumed by:** `s6`, `s7`, `s8`, `s9`

**Purpose:** Return bounded current directives, handoff and traceable deep recall with explicit freshness and overflow outcomes.

**Interface sketch (type-level):**

```
interface RecallService { context(request: ReadRequest): Promise<ContextResult>; search(request: SearchRequest): Promise<ContextResult>; inspect(request: InspectRequest): Promise<Json>; invalidate(projectId: string, committedGeneration: string): void; }
```

### 5.7 sc7: Independent local IPC service and client

**Owner Story:** `s6`
**Consumed by:** `s7`, `s8`, `s9`

**Purpose:** Transport-neutral semantic parity with bounded versioned framing, private endpoint and reconnect-safe idempotency.

**Interface sketch (type-level):**

```
interface IpcRequest { protocolVersion: 1; requestId: string; method: 'submit' | 'context' | 'search' | 'inspect' | 'operation' | 'status'; params: Json; }
interface IpcResponse { protocolVersion: 1; requestId: string; result?: Json; error?: MemoryFailure; }
interface IpcHostOptions { endpoint: string; maxFrameBytes: number; maxInFlight: number; requestTimeoutMs: number; }
interface MemoryIpcHost { listen(service: MemoryService, options: IpcHostOptions): Promise<void>; close(): Promise<void>; }
interface MemoryIpcClient { connect(options: IpcHostOptions): Promise<MemoryServiceClient>; }
interface MemoryServiceClient { submit(command: MemoryCommand): Promise<OperationReceipt>; context(request: ReadRequest): Promise<ContextResult>; search(request: SearchRequest): Promise<ContextResult>; inspect(request: InspectRequest): Promise<Json>; operation(request: OperationRequest): Promise<OperationReceipt>; disconnect(): Promise<void>; }
```

### 5.8 sc8: insrc-managed capture and context adapter

**Owner Story:** `s7`
**Consumed by:** `s8`, `s9`

**Purpose:** Bind existing registered repo/session policy and provider abstraction to the standalone module without reversing dependency direction. The owning s7 LLD must define and qualify coordination with daemon model work; role selection and serial-await conventions are not a runtime scheduling gate.

**Interface sketch (type-level):**

```
interface ManagedTurnBinding { scope: Scope; source: SourceIdentity; persistence: 'durable' | 'prohibited'; captureOwner: 'managed' | 'native'; }
interface DeliveryOutcome { state: 'prepared' | 'delivered' | 'failed' | 'unsupported'; generation?: string; reasonCode?: string; }
interface ManagedMemoryAdapter { capture(binding: ManagedTurnBinding, delta: Json): Promise<OperationReceipt>; prepare(binding: ManagedTurnBinding, budgetTokens: number): Promise<ContextResult>; recordDelivery(binding: ManagedTurnBinding, outcome: DeliveryOutcome): Promise<OperationReceipt>; }
```

### 5.9 sc9: Native agent capability and capture ownership

**Owner Story:** `s8`
**Consumed by:** `s9`

**Purpose:** Qualify per-agent installed-version capture and context delivery without inferring unsupported automatic hooks from MCP availability.

**Interface sketch (type-level):**

```
interface AgentCapability { agent: 'claude' | 'codex' | 'vibe'; version: string; capture: 'hook' | 'explicit' | 'unsupported'; context: 'hook' | 'explicit' | 'unsupported'; transcriptVersion?: string; }
interface NativeMemoryAdapter { capabilities(): Promise<AgentCapability>; capture(source: SourceIdentity, scope: Scope, delta: Json): Promise<OperationReceipt>; prepare(request: ReadRequest): Promise<DeliveryOutcome>; }
```

### 5.10 sc10: Maintenance and quality evidence

**Owner Story:** `s9`

**Purpose:** Deletion-safe retention, migration and duplicate review through the same worker; measured release criteria for the complete feature.

**Interface sketch (type-level):**

```
interface MaintenanceRequest { kind: 'expire' | 'purge' | 'reembed' | 'compact' | 'reconcile-duplicates' | 'migrate'; scope: Scope; expectedGeneration: string; options: Json; }
interface MaintenanceResult { operationId: string; logicalComplete: boolean; physicalComplete: boolean; backupLimitations: readonly string[]; }
interface QualityEvidence { suiteVersion: string; fidelityFailures: number; falseAuthoritativeMerges: number; scopeLeaks: number; acceptedEventsLost: number; }
```

## 6. Story boundaries

### 6.1 Story E2026110117123b6d:S001

**Owns:** `sc1`, `sc2`

Private lifecycle state machine, directory canonicalization and OS ownership guard. Public v1 types describe the final service; incremental builds must report unsupported/not-ready behavior explicitly rather than accept unimplemented work. Module-local model dispatch serialization is private to this foundation and covers all callers, including read embeddings.

### 6.2 Story E2026110117123b6d:S002

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

Private segment framing, append/fsync scheduling, checkpoint replacement, tail recovery and disk accounting. Producer source keys are retained through authoritative store receipts; queue recycling alone never authorizes forgetting retry identity.

### 6.3 Story E2026110117123b6d:S003

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

Private Arrow/Lance physical row encoding, receipt lookup, single-table commit, current generation, revision checks and tombstone matching. No other story obtains a direct mutation handle.

### 6.4 Story E2026110117123b6d:S004

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`

Private bounded source-context expansion, slot normalization, candidate retrieval, authority and equivalence classification, fidelity checks and serial model scheduling. No normalization result becomes active before the guarded store commit.

### 6.5 Story E2026110117123b6d:S005

**Owns:** `sc6`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`

Private exact/lexical/vector ranking, mandatory-directive selection, generation-keyed caches and budget packing. Inspect and search share project binding and deletion filters.

### 6.6 Story E2026110117123b6d:S006

**Owns:** `sc7`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`

Private local-socket framing, connection limits, version handshake, transport cancellation and process signal handling in the executable only. Embedded API import installs no handlers. Remote client disconnect never stops the server.

### 6.7 Story E2026110117123b6d:S007

**Owns:** `sc8`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`, `sc7`

Private insrc registry binding, temporary-execution refusal, host provider translation and managed turn ownership. VS Code/JetBrains/MCP remain IPC clients; backend integration does not expose index/LMDB handles to the package. This story owns the explicit host admission/coordination design for daemon and memory model work; no existing global scheduler is assumed.

### 6.8 Story E2026110117123b6d:S008

**Owns:** `sc9`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`, `sc7`, `sc8`

Private CLI-version qualification, trusted hook bootstrap, incremental transcript parser, local spool qualification and capability reporting. Adapter installation requires explicit host configuration; user approval and tool transcripts are not promoted to standing directives.

### 6.9 Story E2026110117123b6d:S009

**Owns:** `sc10`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`, `sc7`, `sc8`, `sc9`

Private retention planning, purge accounting, Lance version cleanup, migrations, source-qualified lesson proposals and corpus evaluation orchestration. No maintenance timer writes outside the command/worker path.

## 7. Non-functional targets

- **Performance:** Bound source expansion, event size, pending disk bytes, candidate counts, model timeouts, IPC frames and context token budgets. Queue acceptance latency measures append+fsync separately from semantic commit latency. Initial target is bounded memory and nonblocking request handling; p50/p95 acceptance, commit, recall and cold-open thresholds must be measured on named hardware/corpus in LLDs before release. Accuracy takes precedence over throughput. Embedding/model calls are serial; cached reads perform no inference.
- **Security:** Project/session binding and eligibility before enqueue; per-request scope validation and local endpoint access restrictions. No raw prompts/queue content in routine logs. Memory is subordinate context; no hidden reasoning, credentials or automatic cloud REST. Different projects and directories remain isolated. Temp/session-memory execution restrictions remain enforced in insrc and explicit equivalent policy is required of other hosts.
- **Observability:** Bounded metadata: operation/event identity, project pseudonym, queue backlog/oldest age, processing stage/retries, generation, duration, privacy-safe failure code and capture/delivery capability state. Distinguish unavailable/empty, accepted/committed, prepared/delivered, logical delete/physical cleanup. Provide explicit inspection rather than routine payload logging.
- **Durability:** No acknowledged event loss in the supported crash model; at-least-once replay with idempotent committed effects. OS process death, partial writes, fsync failure, lost IPC replies, commit-before-ack, ownership contention and shutdown require fault-injection evidence. Disk/controller failure outside the qualified fsync contract and external native transcript/backups have explicit limits. Lance atomicity/reader freshness are mandatory s3 evidence gates, not assumptions.

## 8. Rollout

**A — Independent durable foundation**

**Stories:** `s1`, `s2`, `s3`

Establish package/host contracts and ownership before durable admission and qualified atomic replay. Demonstrate external consumption without insrc first; foundation alone does not claim semantic functionality.

**Backward compat:** Existing index stores, conversation persistence and daemon IPC contracts remain intact; memory data directory is distinct. No implicit historical import.

**B — Canonical meaning and recall**

**Stories:** `s4`, `s5`

Guarded store and receipt contracts precede semantic activation, correction/forgetting and generation-consistent context. Evaluate all meaning-preservation cases before enabling automatic capture.

**Backward compat:** Provider identity is provenance rather than a memory partition. Native authentication/execution loops remain unchanged; no stale context fallback.

**C — Standalone service and managed integration**

**Stories:** `s6`, `s7`

Prove complete embedded/IPC parity and service independence, then connect managed insrc sessions and its current IDE/CLI/MCP clients.

**Backward compat:** Integration adds a memory adapter without giving clients storage handles or changing indexer registration semantics. Failed/missing memory is explicit; mandatory context failures cannot be hidden.

**D — Qualified native adapters**

**Stories:** `s8`

Native hooks depend on stable capture, delivery and transport ownership contracts already exercised by managed sessions.

**Backward compat:** Version-qualified hooks coexist with native session history; MCP fallback remains explicit. No global/private history import or duplicate managed capture.

**E — Lifecycle and release evidence**

**Stories:** `s9`

Maintenance preserves earlier deletion/replay guarantees and collects full release-quality evidence after all integrations exist.

**Backward compat:** Migration and cleanup never reset external transcript/index stores. Existing tombstones/receipts stay effective across rebuild, re-embedding and backup restore.

**Ordering rationale:** Follow the approved linear s1→s9 dependency graph. Foundation sc1/sc2 precede all consumers; queue/store and semantic/recall contracts precede transports and adapters. No story boundary is amended. Per-task relevant tests run during build; the agreed full sweep follows completion of planned feature tasks, while each public hosting increment has focused external-consumer and fault tests.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Durable commit and process ownership | Single writer alone does not guarantee atomic receipt publication, uniqueness or reader freshness, and Node filesystem operations have platform-dependent durability. | Qualify OS ownership, partial-write/fsync/rename recovery and installed Lance single-table mutation/reader semantics in s1–s3 before automatic semantic work. If a mandatory invariant fails, stop for a reviewed design amendment. |
| False equivalence, compression and privacy | Semantically similar instructions can differ in negation, scope, condition or authority; source deletion can be defeated by derived context or replay. | Typed-slot and semantic fidelity evaluation with adversarial pairs; reject uncertain activation; pre-enqueue privacy gate; deletion closure over sources/derived records/caches; retain minimal replay protection with explicit purge limits. |
| Package independence and agent delivery | Backend imports can silently pull daemon globals into the package, and hook availability differs by installed CLI version. | Packed-package external application test, import graph boundary check, daemon-stopped IPC tests, shared parity suite, and a capability matrix with live lifecycle tests before declaring agent support. |

## 9. Alternatives considered

### 9.1 a1: Ports-and-adapters library with optional local service host — **CHOSEN**

A reusable in-process application service with injected dependencies, wrapped by an independent IPC host when needed.

A versioned package owns ingestion, processing, storage, recall and lifecycle behind explicit ports. It can be instantiated inside any compatible Node host using supplied project policy, providers, paths and logging. The daemon integrates through an adapter and does not become a core dependency.

A thin executable and IPC client expose the same service semantics out of process. Ownership is enforced by resolved data directory across both modes; every memory mutation follows one queue and one writer. Package core, storage/queue adapters and transport are independently testable boundaries rather than separate competing owners.

**Pros:**
- Supports true embedded execution with no required child process or daemon startup.
- A single application-service implementation allows one behavioral contract suite to test embedded and IPC modes.
- Explicit host ports keep insrc registry, provider configuration and index connection out of the reusable package.

**Cons:**
- Public dependency interfaces and transport serialization require deliberate versioning and compatibility tests.
- Independent package build, asset packaging and native Lance runtime must be qualified outside the monorepo.

**Cost estimate:** L

### 9.2 a2: Process-isolated service with an embedded client facade

Every consumer talks to a local worker process, even when its API looks embedded.

A local service always owns memory storage and model processing. Applications embed only a client facade that starts or connects to that process, with the daemon treated as another client.

This centralizes process ownership and resource isolation, but makes process spawning and IPC mandatory. True same-process embedding is unavailable, and consumer lifecycle becomes coupled to a child-service deployment.

**Pros:**
- A single physical service boundary simplifies ensuring that all clients use the same writer.
- A processing failure is isolated from the consumer application's process.

**Cons:**
- Does not satisfy the requested true embedded mode; consumers must permit a background process.
- Every operation incurs transport and child-process lifecycle behavior even for local library use.

**Cost estimate:** L

**Rejected because:** Fails the explicit embedded hosting requirement even though its process service can satisfy most data invariants.

### 9.3 a3: Extract existing daemon services into a shared runtime

Make daemon infrastructure a reusable runtime and host memory on that extracted stack.

Refactor configuration, provider dispatch, IPC, project binding and storage ownership from the existing backend into common infrastructure. Both the existing daemon and a memory-only host consume that runtime.

Memory inherits extracted conventions and transports, but the extraction crosses mature storage and runtime boundaries before delivering the memory feature. It must remove global configuration, registry and index assumptions throughout the shared runtime to become independently consumable.

**Pros:**
- Could reduce duplicated infrastructure if several future standalone features share the extracted runtime.
- Existing provider and IPC behavior can remain under common ownership once extraction is complete.

**Cons:**
- Broader cross-cutting changes risk existing daemon/indexer behavior unrelated to memory.
- Independent delivery is blocked on extracting existing configuration/path/ownership dependencies identified in the grounding.

**Cost estimate:** L

**Rejected because:** Could meet the final contracts but requires unrelated runtime extraction before independence is established.

## 10. References

- **[[c1]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/DEF.md` — "Deliver one self-contained Node/TypeScript module with embedded and standalone IPC modes, public versioned interfaces, injected host dependencies and independent build/test consumption; insrc daemon i"
- **[[c2]]** `doc` `docs/reqs/shared-project-memory.html` — "The same core MUST run embedded in a host process or in an independent process accessed through IPC."
- **[[c3]]** `analyze-bundle` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/hld-context-evidence.json`

- **[[c4]]** `code` `package.json` — Current backend package/build scripts; adding a minimal workspace is proposed s1 work.
- **[[c5]]** `code` `tsconfig.json` — Current strict NodeNext root build includes src only; package output requires separate compilation.

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.epic (design.epic)

**0 do not hold · 0 could not be verified · 9 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-11-01T13:00:25.134Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._

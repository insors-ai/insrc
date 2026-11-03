<!-- insrc:artifact LLD-17123b6d304af2a2-s1 -->

# LLD: E2026110117123b6d:S001

## Summary

**Epic:** `share-project-memory-across-agents-applications`
**HLD base run:** `wf-1793536573467-3p0dt6`
**HLD effective hash:** `18ac1fc6f9d6...`

S1 creates the independently consumable package, its public host/service types and its embedded runtime foundation. Explicit open acquires exclusive directory ownership; shutdown releases only module-owned resources. Later stories supply durable ingestion, memory storage and recall, so this foundation reports those capabilities unavailable rather than pretending to save or return memory.

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
**Owns:** `sc1` (Host ports and package lifecycle), `sc2` (Application service and domain wire types)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Private segment framing, append/fsync scheduling, checkpoint replacement, tail recovery and disk accounting. Producer source keys are retained through authoritative store receipts; queue recycling alone never authorizes forgetting retry identity. — owns `sc3`
- `s3`: Private Arrow/Lance physical row encoding, receipt lookup, single-table commit, current generation, revision checks and tombstone matching. No other story obtains a direct mutation handle. — owns `sc4`
- `s4`: Private bounded source-context expansion, slot normalization, candidate retrieval, authority and equivalence classification, fidelity checks and serial model scheduling. No normalization result becomes active before the guarded store commit. — owns `sc5`
- `s5`: Private exact/lexical/vector ranking, mandatory-directive selection, generation-keyed caches and budget packing. Inspect and search share project binding and deletion filters. — owns `sc6`
- `s6`: Private local-socket framing, connection limits, version handshake, transport cancellation and process signal handling in the executable only. Embedded API import installs no handlers. Remote client disconnect never stops the server. — owns `sc7`
- `s7`: Private insrc registry binding, temporary-execution refusal, host provider translation and managed turn ownership. VS Code/JetBrains/MCP remain IPC clients; backend integration does not expose index/LMDB handles to the package. This story owns the explicit host admission/coordination design for daemon and memory model work; no existing global scheduler is assumed. — owns `sc8`
- `s8`: Private CLI-version qualification, trusted hook bootstrap, incremental transcript parser, local spool qualification and capability reporting. Adapter installation requires explicit host configuration; user approval and tool transcripts are not promoted to standing directives. — owns `sc9`
- `s9`: Private retention planning, purge accounting, Lance version cleanup, migrations, source-qualified lesson proposals and corpus evaluation orchestration. No maintenance timer writes outside the command/worker path. — owns `sc10`

## 2. Contract details

**Surface level:** public

### 2.1 `MemoryFactory.open`

```typescript
open(options: MemoryOptions): Promise<MemoryService>;
```

**Parameters:**
- `options: MemoryOptions` — Explicit host ports, memory root and resource limits; no implicit insrc configuration.

**Returns:** `Promise<MemoryService>` — Resolves after foundation validation and exclusive ownership acquisition. The S1 facade's data methods remain NOT_READY until owning downstream capabilities exist.

**Errors:**
- `MemoryFailure(INVALID_REQUEST)` when Invalid options, unsupported runtime/platform/filesystem or unrecognized/unsafe root.
- `MemoryFailure(OWNERSHIP_CONFLICT)` when Another instance owns the canonical directory.
- `MemoryFailure(NOT_READY)` when Native ownership binding is missing/incompatible.
- `MemoryFailure(STORE_UNAVAILABLE)` when Ownership/directory I/O or safe initialization failure.

**Preconditions:**
- Host has explicitly selected an isolated local memory root that does not overlap its other stores or their cleanup roots.
- Supported initial runtime is Node 22 >=22.22.1 on qualified local APFS/macOS or ext4/Linux; qualification is a build gate, not asserted from documentation.

**Postconditions:**
- No native addon, file, worker or global handler is touched by importing the public entry; only explicit open performs I/O.
- Every instance uses its own opened lock descriptor, including copies of the package and worker-thread instances.
- Failed open closes every resource it acquired; no usable service escapes an unsuccessful acquisition.

### 2.2 `MemoryLifecycle.ready`

```typescript
ready(): Promise<void>;
```

**Returns:** `Promise<void>` — Same stable readiness result for the initialized foundation; later queue/store startup is composed before readiness by its owner.

**Errors:**
- `MemoryFailure(NOT_READY)` when Startup did not complete or service is no longer available.

**Preconditions:**
- Called on an instance returned by open.

**Postconditions:**
- S1 readiness does not assert s2-s6 memory functionality; no accepted event or empty recall is fabricated.

### 2.3 `MemoryLifecycle.drain`

```typescript
drain(deadlineMs: number): Promise<DrainResult>;
```

**Parameters:**
- `deadlineMs: number` — Finite positive wall duration in milliseconds from method entry; measured using monotonic time.

**Returns:** `Promise<DrainResult>` — Closes admission and waits up to deadline for owned tracked work; completed=false and pending>0 means work/ownership remains.

**Errors:**
- `MemoryFailure(INVALID_REQUEST)` when Invalid duration.
- `MemoryFailure(STORE_UNAVAILABLE)` when Owned work cannot be safely drained.

**Preconditions:**
- Service is ready or already draining.

**Postconditions:**
- Drain does not reopen admission or release ownership.
- The S1 facade has no accepted memory commands; future queue/store participants contribute real work without inventing completed results.

### 2.4 `MemoryLifecycle.close`

```typescript
close(): Promise<void>;
```

**Returns:** `Promise<void>` — Idempotent shared close result after admission stops, owned work is quiescent and handles close safely.

**Errors:**
- `MemoryFailure(STORE_UNAVAILABLE)` when A module-owned handle cannot be verified closed; ownership must not be released while owned work can still write.

**Preconditions:**
- May be called repeatedly or concurrently; no caller can force unsafe resource release.

**Postconditions:**
- Does not call dispose/close on supplied model, policy or logger objects and installs no process signal handlers.
- Uncooperative model requests are aborted but do not permit ownership release while a continuation or owned writer can still act; close remains pending until safe quiescence or reports a qualified failure.
- Closing a service never unlinks its lock file. OS process exit releases its descriptor-held lock.

### 2.5 `MemoryService.submit`

```typescript
submit(request: MemoryCommand): Promise<OperationReceipt>;
```

**Parameters:**
- `request: MemoryCommand` — Public v1 type defined by sc2; owning downstream stories supply full payload/behavior validation.

**Returns:** `Promise<OperationReceipt>` — S1 always rejects with NOT_READY. No mutation, provider call, accepted receipt, operation existence or empty successful read is reported.

**Errors:**
- `MemoryFailure(NOT_READY)` when Capability belongs to a later story or lifecycle has stopped admission.

**Preconditions:**
- S1 declares the compatible surface but does not implement semantic/durable capabilities.

**Postconditions:**
- No queue/Lance/backend storage is opened by the placeholder path.

### 2.6 `MemoryService.context`

```typescript
context(request: ReadRequest): Promise<ContextResult>;
```

**Parameters:**
- `request: ReadRequest` — Public v1 type defined by sc2; owning downstream stories supply full payload/behavior validation.

**Returns:** `Promise<ContextResult>` — S1 always rejects with NOT_READY. No mutation, provider call, accepted receipt, operation existence or empty successful read is reported.

**Errors:**
- `MemoryFailure(NOT_READY)` when Capability belongs to a later story or lifecycle has stopped admission.

**Preconditions:**
- S1 declares the compatible surface but does not implement semantic/durable capabilities.

**Postconditions:**
- No queue/Lance/backend storage is opened by the placeholder path.

### 2.7 `MemoryService.search`

```typescript
search(request: SearchRequest): Promise<ContextResult>;
```

**Parameters:**
- `request: SearchRequest` — Public v1 type defined by sc2; owning downstream stories supply full payload/behavior validation.

**Returns:** `Promise<ContextResult>` — S1 always rejects with NOT_READY. No mutation, provider call, accepted receipt, operation existence or empty successful read is reported.

**Errors:**
- `MemoryFailure(NOT_READY)` when Capability belongs to a later story or lifecycle has stopped admission.

**Preconditions:**
- S1 declares the compatible surface but does not implement semantic/durable capabilities.

**Postconditions:**
- No queue/Lance/backend storage is opened by the placeholder path.

### 2.8 `MemoryService.inspect`

```typescript
inspect(request: InspectRequest): Promise<Json>;
```

**Parameters:**
- `request: InspectRequest` — Public v1 type defined by sc2; owning downstream stories supply full payload/behavior validation.

**Returns:** `Promise<Json>` — S1 always rejects with NOT_READY. No mutation, provider call, accepted receipt, operation existence or empty successful read is reported.

**Errors:**
- `MemoryFailure(NOT_READY)` when Capability belongs to a later story or lifecycle has stopped admission.

**Preconditions:**
- S1 declares the compatible surface but does not implement semantic/durable capabilities.

**Postconditions:**
- No queue/Lance/backend storage is opened by the placeholder path.

### 2.9 `MemoryService.operation`

```typescript
operation(request: OperationRequest): Promise<OperationReceipt>;
```

**Parameters:**
- `request: OperationRequest` — Public v1 type defined by sc2; owning downstream stories supply full payload/behavior validation.

**Returns:** `Promise<OperationReceipt>` — S1 always rejects with NOT_READY. No mutation, provider call, accepted receipt, operation existence or empty successful read is reported.

**Errors:**
- `MemoryFailure(NOT_READY)` when Capability belongs to a later story or lifecycle has stopped admission.

**Preconditions:**
- S1 declares the compatible surface but does not implement semantic/durable capabilities.

**Postconditions:**
- No queue/Lance/backend storage is opened by the placeholder path.

### 2.10 `ModelPort`

```typescript
interface ModelPort { complete(request: ModelRequest): Promise<Json>; embed(text: string, signal: AbortSignal): Promise<readonly number[]>; readonly embeddingModel: string; readonly embeddingDimension: number; }
```

**Returns:** `ModelPort` — Host-owned structural interface; no SDK/provider factory types leak into public core.

**Errors:**
- `MemoryFailure(NOT_READY)` when A runtime model request is cancelled or its provider is unavailable.

**Preconditions:**
- Complete and embed are callable; metadata identifies a local embedding implementation with positive safe-integer dimension.
- Host adapters retain provider ownership and comply with the CLI-only cloud/local embedding policy.

**Postconditions:**
- All module invocations pass through one private serial dispatcher across processing, query embedding and maintenance.
- Cancellation of queued work removes it before invocation; an active request holds the dispatch lane until its underlying promise settles, even if timeout/abort has already been reported.

## 3. Data model changes

### 3.1 `Package manifest and build boundary` — new

Proposed new package paths: packages/project-memory/package.json, packages/project-memory/tsconfig.json, packages/project-memory/src/index.ts, packages/project-memory/src/types.ts, packages/project-memory/src/host-node.ts, packages/project-memory/src/runtime.ts, packages/project-memory/src/ownership.ts, packages/project-memory/src/model-dispatcher.ts, packages/project-memory/src/__tests__/ and packages/project-memory/scripts/verify-pack.mjs. Root package.json/package-lock.json add a minimal npm workspace and root dependency linked by its matching 0.1.0 workspace version. Preserve root tsconfig.json rootDir=src. Proposed package exports '.' -> dist/index.js + dist/index.d.ts and './node' -> dist/host-node.js + declarations; root exposes the same MemoryFactory.open entry via a lazy dynamic import, with no top-level fs-ext/Lance imports. Do not export unfinished './ipc' or an executable placeholder; s6 adds those actual exports. No imports/reexports from backend src are permitted in the emitted package dependency closure. Build with an independent strict NodeNext config, .js specifiers, import type and explicit '| undefined' for optional properties. Package runtime owns fs-ext pinned 2.1.1 as its only S1 runtime dependency; lock resolved transitive dependencies in root lockfile. Lance/Arrow arrive in s3, not unused S1 dependencies. Types for the narrow native wrapper remain private. No root package lock/reformat beyond workspace dependency resolution is intended.


### 3.2 `Build and packed consumption` — new

Package scripts: build runs tsc with rootDir src/outDir dist plus asset copying only when assets exist; test runs its own node:test TS suites using workspace dev tools; prepack runs package build; verify:pack performs an isolated tarball-install consumer test. Root build runs the package workspace build before the existing backend tsc/model-definition/asset pipeline, preserving its existing steps and root output paths. Add an explicit focused workspace-test command; do not silently replace the root full-sweep script with a subset. Pack allowlist includes dist, README, LICENSE and future runtime assets, excluding source/tests/fixtures, native binaries built for another runtime, root configuration and backend files. Isolated consumer installs with normal package dependency lifecycle scripts, has no NODE_PATH/workspace symlink/backend source, imports via public exports, typechecks and runs lifecycle tests with Node 22. Native compilation prerequisites and supported filesystem/runtime matrix are documented; optional skip cannot satisfy a required native gate. No publishing is performed by build or tests.

**Call sites:**
- `package.json`
- `tsconfig.json`

### 3.3 `MemoryOptions and v1 types` — new

Implement all sc1/sc2 type declarations as one versioned package-owned source; no SDK types. Use readonly fields where external mutation would affect ownership. Optional fields retain explicit '| undefined' and JSON serialization omits absent optional values. MemoryCommand payload remains Json at this shared foundation layer; exact per-command semantic schemas are supplied by the owning later story before its implementation. Validate required configuration before creating directories: explicit nonempty absolute dataDirectory; callable policy.bind/admit and logger.write; callable models.complete/embed with nonempty embeddingModel and safe positive embeddingDimension; all four MemoryLimits values finite positive safe integers with maxEventBytes<=segmentBytes<=maxPendingBytes. No provider/model call occurs during open validation. Do not invent default paths, model IDs, credentials or registration. Root limits remain supplied by the host, not undocumented S1 defaults. Bad logger callbacks must not prevent cleanup or expose payloads.


### 3.4 `Directory identity and exclusive ownership` — new

A successful host open owns one canonical existing directory identified by realpath plus device/inode. Create an explicit missing root with private permissions only after options pass; resolve aliases before claiming ownership. Existing nonempty roots must be recognized as memory layout rather than adopted from an index or arbitrary directory. Persist only layout/ownership metadata, not memory content; no Lance/queue files or authoritative memory store are created by S1. Reserve root/.owner.lock as a regular single-link private file, opened without following a final symlink, then acquire fs-ext flock(fd,'exnb') on a descriptor opened specifically for this instance; set close-on-exec and verify file/directory identities. Keep that descriptor reachable until safe close. Never use PID/mtime/lease timeout to confer ownership and never unlink/recreate the lock file on normal close or crash recovery. Lock contention returns OWNERSHIP_CONFLICT; no waiting ownership queue. Duplicate paths, symlink aliases, repeated package instances and worker threads each contend on the same underlying lock file. Invalid/moved/replaced lock/root identity fences further work and reports STORE_UNAVAILABLE; the protocol assumes cooperating hosts do not externally delete/rename a live memory directory. Host-specific cross-store cleanup containment is a required caller/adapter precondition (insrc integration owns its index paths); core cannot infer unknown external cleanup roots. Own queue/lance child layout remains reserved for s2/s3.


### 3.5 `Platform and ownership qualification` — new

Initial adapter supports only Node 22 >=22.22.1 with local APFS on macOS and local ext4 on Linux after actual qualification; other runtimes/platforms/filesystems fail INVALID_REQUEST before readiness rather than degrade to a lease lock. Use fs.statfs to enforce the initial filesystem allowlist; implementation constants must be verified against target OS headers/primary docs. Do not advertise Windows, NFS/CIFS, tmpfs or overlayfs support from a passing macOS probe. A Python fcntl probe on this Mac confirmed separate-descriptor exclusion and close release only; it did not test the Node binding, threads or process crash. Active shell Node is 26.5.1 and a separate Node 22.23.2 binary is available; build/test evidence must identify actual runtime/header ABI, not infer compatibility from engines metadata.


### 3.6 `Lifecycle and private composition` — new

Private states opening -> ready -> draining -> closing -> closed, with failed startup/cleanup states explicit. Public open resolves only after initialized ownership; ready is stable/idempotent, not proof of unavailable downstream features. Concurrent close calls share a terminal promise and do not double-close a reused descriptor. Private composition tracks module-owned participants added by later stories without a public plugin registry: stop admission, drain/abort tracked work, await quiescence, close writer/store/queue resources in dependency-safe order, then close ownership descriptor. A nonblocking native lock callback must finish before any cancellation cleanup closes its fd, preventing a late callback from acting on a reused fd. Drain deadline is monotonic and returns incomplete without releasing ownership. S1 service data methods reject NOT_READY; s2/s3/s5 replace these paths within their owned scope and readiness becomes contingent on their real startup. No child process, signal handler, timer heartbeat or process.exit is installed by public import/open. Host retains lifecycle control.


### 3.7 `Module-local model dispatcher` — new

A private per-instance FIFO is shared by complete and embed, not one queue per method/consumer. At most one underlying provider promise runs; queued cancellations never invoke the provider. Timeout/abort requests abort the supplied controller but do not release the execution lane or ownership merely because Promise.race returns; wait for underlying settlement and prevent any late continuation from committing. Rejection advances the next queued item after settlement. No Promise.all reaches model providers. Queue depth and request timeout are bounded by validated host limits/owned configuration, with explicit overload errors. This does not serialize other daemon work or other independent instances: s7 owns host-level coordination and no existing global scheduler is assumed. Tests use controllable providers and record maximum underlying concurrency rather than only resolved wrapper counts.


## 4. Diagrams

- [Sequence diagram](docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | Owns public host types, factory/lifecycle, independent package integration, private directory guard and module-local model serialization. No globally shared daemon lock block or configuration is imported. Public signature names follow the HLD; pure import and supplied-resource ownership are preserved. |
| `sc2` | implements | Owns versioned public service/domain types and safe fixed errors. Foundation unavailable methods return NOT_READY, never fake success. Downstream owners implement payload semantics through this surface without importing storage in callers. Readiness/lifecycle and command acceptance remain distinct. |

## 6. Error paths

**Error cases**

- **Invalid options or runtime** (recoverable)
  - Detection: Check exact required configuration shapes, finite positive safe-integer limits, callable ports, absolute root and supported Node/platform/filesystem before readiness; configuration validation precedes mkdir/native work.
  - Response: Reject INVALID_REQUEST with a fixed safe code/message; no usable instance and no provider calls.
  - User impact: Caller corrects explicit configuration or uses a supported runtime; no silent fallback.
- **Native binding absent/incompatible** (recoverable)
  - Detection: Explicit open's dynamic import/load or native operation fails; runtime/ABI and module load error are classified without leaking paths or payloads.
  - Response: Reject NOT_READY, close any acquired descriptor and retain no active instance; never substitute a heartbeat/PID lock.
  - User impact: Required native dependency must build for the runtime before memory is enabled.
- **Second instance owns directory** (recoverable)
  - Detection: flock exclusive/nonblocking reports EWOULDBLOCK/EAGAIN after canonical realpath and safe lockfile open.
  - Response: Reject OWNERSHIP_CONFLICT and close only contender's fd. Never unlink, unlock another descriptor or wait for ownership.
  - User impact: Caller connects to the existing service or waits until it safely closes.
- **Unrecognized or replaced root/lock inode** (recoverable)
  - Detection: Directory listing/layout marker validation and fd/path dev+inode, regular-file/link-count checks disagree; final lock path is a symlink or an opened root is moved/replaced.
  - Response: Fail closed with INVALID_REQUEST for unsafe initial selection or STORE_UNAVAILABLE for changed ownership identity. Fence writes and keep ownership until owned work stops.
  - User impact: Requires explicit root correction or operator recovery; no adoption of an index/arbitrary directory.
- **Startup fails after native acquisition** (recoverable)
  - Detection: Any post-acquisition initialization step rejects, including metadata write or readiness setup.
  - Response: Unwind owned resources in reverse dependency order after native callback completion. Reject open and expose cleanup failure if ownership release cannot be verified.
  - User impact: No half-ready facade escapes; retry only after safe cleanup or process exit.
- **Drain deadline or ignored model cancellation** (recoverable)
  - Detection: Monotonic deadline expires while private tracked work/underlying provider promise remains active.
  - Response: Drain reports incomplete without releasing descriptor ownership. Abort active request and cancel queued work; close waits for actual quiescence instead of treating wrapper timeout as completion.
  - User impact: A stuck host provider can delay close; caller may terminate its own process, which OS lock lifetime handles.
- **Logger callback throws or cleanup I/O fails** (recoverable)
  - Detection: Catch supplied logger exceptions separately; await each owned handle close and preserve the first cleanup failure with bounded diagnostic codes.
  - Response: Logger failure cannot interrupt cleanup. Unverified close reports STORE_UNAVAILABLE and does not manufacture a successful unlocked state.
  - User impact: Host logging can be repaired independently; unsafe handle cleanup remains visible.
- **Foundation data method called** (recoverable)
  - Detection: Facade routes submit/context/search/inspect/operation to an explicit capability-unavailable path until the owning later story wires it.
  - Response: Reject NOT_READY; never return accepted, committed, empty context or missing-operation success.
  - User impact: S1 proves foundation only; complete memory requires downstream stories.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Two differently spelled or symlinked paths resolve to the same data directory. | Canonical file identity yields one ownership winner; each contender owns a separate descriptor and closes only its own resources. |
| Two distinct nonoverlapping directories use the same host providers. | Ownership is independent. Serialization is per instance; the host is responsible for any required coordination across its instances/work, and no global scheduler is claimed. |
| Two copies of the package or two worker threads open the same root. | Do not rely on module-local JS singleton maps; OS descriptor-lock contention remains authoritative. |
| Concurrent close and drain calls or repeated close after success. | Admission closes once; all close callers observe a shared safe terminal outcome with no double-close or unlock of a reused fd. |
| Process crashes with only .owner.lock or an initialization temp file present. | A persistent lock pathname alone is not ownership. Recognized incomplete bootstrap metadata is recovered only after acquiring the same persistent lock; never unlink the lock to recover. |
| Empty/new root and no downstream memory capabilities yet. | Initialize only versioned layout/ownership metadata. Accept an existing nonempty root only if its recognized marker/layout is valid; no queue/Lance data or memory rows are invented. |
| Queued model request is cancelled; active request later rejects or ignores abort briefly. | Queued request never calls provider. Lane remains occupied until the active underlying call settles; rejection does not permanently poison later work. |

**Invariants to preserve**

- Existing backend build steps and root src-to-out compilation remain intact; package builds first and does not widen rootDir or move backend outputs. [[c1]]
- sc1/sc2 remain package-owned and independent of daemon, registry, provider factory and index storage. S1 does not implement sibling story semantics. [[c2]]
- Host-owned providers/policy/logging are never closed by the module; no direct cloud REST or parallel provider dispatch is introduced. [[c2]]

## 7. Test strategy

**Test framework:** `node:test with node:assert/strict, executed through tsx for TypeScript; existing exact lock test files use this pattern. Native ownership and packed-consumer gates run under an identified Node 22 binary, not the current Node 26 shell by accident.`

**Test levels**

- **contract** — Freeze sc1/sc2 compatibility and keep the package independent.
  - Subjects: `Public API typecheck under strict NodeNext/exactOptionalPropertyTypes including explicit undefined optional fields and no SDK imports.`, `No backend src/config/daemon/db or workspace-root runtime files in emitted import/declaration closure or tarball.`, `Import in a clean child process changes no selected temp-root files, listener counts or active native/provider state; negative test verifies an eager addon/daemon import would be caught.`, `S1 unsupported methods consistently reject NOT_READY without policy/model calls, accepted receipts or successful empty reads.`
  - Fixtures: `Minimal external TS/ESM consumer using only public exports.`, `Fake host policy/logger/model ports with call counters; no live LLM required.`
- **unit** — Prove lifecycle and model concurrency safety independently of disk persistence semantics.
  - Subjects: `Option shape/range failures occur before I/O; required ports and supplied-resource ownership are checked.`, `Concurrent close/drain and startup failure unwind once; injected logger failures cannot break cleanup.`, `Controllable complete+embed calls across several simulated consumers never exceed one underlying call, including queued cancellation, rejection, timeout and a provider ignoring abort.`, `An aborted wrapper does not admit the next provider call until the first underlying promise settles; close/drain do not report safe quiescence early.`, `Bounded dispatcher overload returns explicit BACKPRESSURE rather than growing without limit; monotonic drain deadline is tested with controlled timing.`
  - Fixtures: `Deferred provider promises recording start/settle and maximum active count.`, `Private lifecycle-participant doubles that simulate stuck/failed cleanup without importing s2/s3 implementations.`
- **integration** — Qualify real descriptor ownership and recovery on each advertised runtime/filesystem.
  - Subjects: `Two real instances in one process, two separately loaded package copies, two worker threads and two processes compete for the same root; exactly one succeeds.`, `Canonical path aliases contend; distinct nonoverlapping directories can coexist; symlink/hardlink lockfile or replaced inode is refused.`, `Force-kill an owning child and reacquire the persistent lock without deleting it; stop/resume a live owner and verify no timeout-based takeover.`, `Failed initialization/native callback ordering cannot close a reused fd or leak an owner; concurrent reopen stays excluded until safe close.`, `Bootstrap interruption before/after marker write recovers recognized incomplete layout only under ownership; arbitrary/index-like nonempty directories are refused.`, `Runtime/filesystem gate refuses unsupported configurations and reports unavailable native binding honestly.`
  - Fixtures: `Child-process and worker-thread fixture protocols with explicit READY/HOLD/RELEASE barriers rather than sleep-based races.`, `Dedicated local APFS/macOS and ext4/Linux CI roots, Node 22 >=22.22.1, native build toolchain.`, `Fault-injected native/fs adapter for precise failure timing plus real binding tests; fakes alone do not satisfy qualification.`
- **smoke** — Prove independent packed package consumption and preserve backend build integration.
  - Subjects: `Build package independently; npm pack; install tarball and its declared runtime deps in an isolated directory outside repository resolution; import/typecheck/open/drain/close using public entry.`, `Run packed import with native package deliberately unavailable: import stays pure; explicit open fails NOT_READY.`, `The isolated consumer has no backend source, NODE_PATH override, workspace node_modules or inherited backend config; supplied host provider remains usable after close.`, `Root build runs package first and retains backend tsc/model checks/copy-assets and existing output paths. No npm publish or full sweep is triggered by packaging.`
  - Fixtures: `Disposable clean consumer manifest/lock with actual install log and runtime/ABI report.`, `Filesystem snapshots and child process exit checks to prove cleanup/no daemon startup.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Packed external consumer import/typecheck/open/drain/close under Node 22 with no backend files or daemon.`, `Import side-effect checks and NOT_READY behavior for foundation data methods.`, `Root build order and public dependency closure/exports tests.` |
| `ac2` | `Real same-process/package-copy/thread/process ownership contention and alias tests.`, `Distinct-root independence and host-resource preservation after close.`, `Forced owner death versus stopped live owner; incomplete drain and concurrent close safety.` |

## 8. Alternatives considered

### 8.1 a1: Fixed Node host with fs-ext descriptor ownership — **CHOSEN**

Use a small existing native flock binding inside a private Node-host adapter, keeping public host/service contracts independent of it.

Keep sc1/sc2 public ESM types free of native bindings and backend imports. Opening a Node-host instance dynamically loads the qualified fs-ext binding and acquires a nonblocking exclusive lock on a persistent private lock file in the canonical data directory. Each instance opens a distinct descriptor, including in worker threads; release closes only that instance's descriptor after its owned work has stopped.

Initial supported storage is local macOS/Linux filesystems whose descriptor-lock semantics pass qualification; unsupported platforms/filesystems fail explicitly. No lease expiry, PID-file ownership or lock-file deletion is used to steal a live owner. The package supplies this one implementation rather than requiring every embedding application to invent ownership.

### 8.2 a2: Package-owned Node-API descriptor-lock binding

Keep the same contracts and descriptor ownership semantics but implement and maintain a minimal native binding in the memory package.

The private Node host owns a minimal Node-API addon exposing nonblocking descriptor flock and close/release operations. Public sc1/sc2, lifecycle states, directory canonicalization and module-local model dispatch remain the same.

This avoids reliance on the existing addon dependency but makes the feature responsible for native code, build tooling, ABI packaging and platform qualification. Local macOS/Linux support still needs the same exclusion and crash tests; Node-API alone does not supply Windows or network-filesystem ownership semantics.

**Rejected because:** Can meet the same contracts but adds native implementation scope without additional user value.

## 9. References

- **[[c1]]** `code` `package.json`
- **[[c2]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/HLD.md`
- **[[c3]]** `analyze-bundle` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/context-evidence.json`
- **[[c4]]** `doc` `docs/reqs/shared-project-memory.html`
- **[[c5]]** `doc` `https://github.com/baudehlo/node-fs-ext`
- **[[c6]]** `doc` `https://man7.org/linux/man-pages/man2/flock.2.html`
- **[[c7]]** `doc` `https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/flock.2.html`
- **[[c8]]** `doc` `https://docs.npmjs.com/cli/v11/using-npm/workspaces/`
- **[[c9]]** `code` `tsconfig.json`
- **[[c10]]** `code` `src/shared/locks/lock-manager.ts`
- **[[c11]]** `code` `src/shared/locks/__tests__/lock-manager-threads.test.ts`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 15 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-11-01T15:31:44.224Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._

<!-- insrc:artifact HLD-484fcef7efaf229e -->

# HLD: manage-saved-temporary-data-connections

> **Current client scope — 29 October 2026:** The user confirmed that insrc-ide is deprecated. Only `vscode-plugin/` and `jetbrains-plugin/` are delivery targets. [Scope correction](CLIENT-SCOPE-UPDATE.html) supersedes all fork-specific work and release gates in the historical approved text below; backend contracts remain unchanged.

## Summary

One daemon service will give saved and temporary connections the same safe editing and truthful outcome rules. Saved connections retain the existing local registry; temporary connections belong to the workbench session and remain in memory. Both clients use a versioned management contract, while analysis receives only daemon-validated access to its session’s sources.

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
10. [UX](#10-ux)
11. [References](#11-references)

## 1. Problem context

> See **DEF-484fcef7efaf229e** § 1. Problem

## 2. Framework summary

Choose a daemon-owned application service over the existing repository JSON registry and driver implementations. Separate saved commit, runtime activation and client refresh; use immutable credential generations and atomic JSON replacement rather than pretending the filesystem and keychain share a transaction. Temporary configurations remain in daemon memory under a workbench lease. All descriptions below are proposed architecture, not assertions of current implementation.

## 3. Architecture shape

Existing anchors: src/daemon/db-rpc.ts owns connection adapters; src/daemon/db/config.ts owns the canonical JSON location; src/daemon/db/secrets.ts wraps keychain references; src/daemon/db/pool-cache.ts and src/daemon/db/pool.ts serve driver consumers. Proposed service responsibilities live behind these adapters, with shared wire types under src/shared. Proposed new files will be selected by Story LLDs, not assumed to exist.

Saved commit: serialize every writer per canonical registered repository, including legacy adapters and delete. Validate registry readability (missing file alone means empty), supported driver/family, public patch and expected connection revision before touching credentials. Revisions are opaque random generation IDs, never reused after delete/recreate; a registry content digest catches manual JSON edits. Atomic rename into the same directory, fsync file and parent, and compare the precommit digest; unsupported external concurrent writers are detected where possible, and overlapping manual edits remain a documented offline-only operation. Preserve unknown supported fields in the daemon without exposing arbitrary options to the renderer. Add optional versioned management metadata to the same JSON document for revisions and bounded operation receipts; do not add another persistent connection registry.

Secret consistency: use new immutable keychain references per committed credential generation. Keep reads the currently referenced value; Replace stages a new generation; Clear removes the URL reference. Never overwrite the live secret before commit. An atomic JSON commit selects the new config, revision and receipt together. A secret-free preparation journal records only operation IDs, owned reference names and commit marker to recover unreferenced staging after crash. Precommit failure leaves existing registry and effective credentials unchanged, removes staged secrets, and blocks further mutation with recovery-required if cleanup cannot finish. Startup recovery compares commit receipts before deciding whether staging is orphaned; never delete a referenced generation. Postcommit old-generation cleanup is retryable and explicitly reported, not mislabeled as rollback. Remove completion distinguishes registration removal from credential cleanup; cleanup-pending is a committed partial outcome with retry, not a precommit failure that pretends the row still exists.

Idempotency: each client creates one UUID operation ID before submitting a mutation. A receipt is committed in the registry metadata with target identity, result and a keyed HMAC of the canonical full request (including credential intent); its key is keychain-owned, never returned. Reusing an ID with a changed request is rejected. Unknown responses reconcile via status or same-ID replay; retained receipts give the identical committed result across daemon restart. Tickets expire 30 days after issuance. Retain a receipt at least through its ticket expiry and while cleanup is pending; prune only after that bound. If a receipt exists, status reports committed truth. Without a receipt, an unexpired valid ticket can be not-seen only after preparation-journal/inflight recovery excludes pending work. An expired valid ticket without a retained receipt is reconciliation-required and mutation replay is refused; an unsigned UUID is never sufficient to report not-seen. This age distinction survives restart because ticket expiry is signed, not inferred from a pruned UUID. Temporary tickets use the session memory key and cannot outlive its lease. No plaintext secrets appear in receipts or journals. Temporary receipts and HMAC context are memory-only and expire with the session. Commit success survives activation failure; activation retry identifies a committed revision and performs no persistence.

Session ownership: a new workbench lifetime identity is distinct from chat session IDs, panels and analyzer run IDs. A daemon-issued random session capability is held in client memory and validated against the daemon epoch and registered repository. Issue/resume/end uses trusted IPC connection context, extending src/daemon/server.ts handler context additively; no global mutable current session and no authorization from self-reported client labels/PIDs. A dedicated control channel heartbeats every 30 seconds; explicit workbench disposal ends the session immediately, and three missed heartbeats expire it after 90 seconds. Transient reconnect within that lease preserves temporary state with the same in-memory capability; daemon restart changes epoch and invalidates all capabilities. UI declares this lifetime. Closing the manager or switching repositories does not end the session.

Session propagation: extend the execution context, including src/daemon/tools/types.ts ToolDeps and src/analyze/executor/types.ts runtime context, with a daemon-validated connection access context supplied out of band. Thread it through src/analyze/runtimes/data/_shared.ts, connection-scope lookup, discovery, ordinary db tools, schema-drift and every acquirePool/registerEphemeral caller found during LLD enumeration. A workbench-spawned MCP child receives its capability through a private inherited environment/control channel, strips it from logs, and never places it in prompts, plans, artifacts or checkpoints. Unattached CLI/MCP consumers get saved sources only. Resume of analysis after daemon restart fails temporary resolution explicitly, with re-add guidance; it must not fall back to a same-named saved source. New temporary sources require a live session; saved registration rejects IDs reserved by active temporary overlays, and temporary registration rejects saved IDs, avoiding newly introduced shadowing. IDs may repeat across isolated temporary sessions.

Runtime leases: retain one saved driver pool per repo and a separate ephemeral overlay per repo/session, merged only by a context-bound resolver. Never register user temporary connections into the shared saved pool. A centralized withConnection/withConnections lease boundary holds active counts through complete driver use and multi-call analysis. Under the same serialized mutation gate, removal rejects any outstanding lease; after removal starts no new leases resolve that revision. Session expiry stops new access, cancels its runs and drains/closes their drivers. Replacing a saved connection while busy is rejected too, avoiding premature close. Legacy acquire call sites must migrate to tracked scopes before management removal is enabled.

Draft tests: a shared daemon patch/materialization path prepares the exact effective config for both test and mutation, with identical expected-revision handling and credential actions. Resolve stored credentials internally. Run transient driver construction/probe in a dedicated short-lived child process supplied config only over private IPC, never argv, environment or disk; scrub logs and sanitize driver exceptions. The parent enforces a 10-second total deadline and terminates then forcibly reaps the process on timeout/cancel, so non-abortable factories cannot retain resources. A successful child reports reachability and duration, not schema completeness; no draft config or credential is committed. Client requestId/draftRevision/repo/session guards suppress stale completion even if transport cancellation races.

Protocol and UI: add a capability/version handshake and a v2 management namespace with typed result codes; keep existing method names and success projections for old clients via adapters into the same invariant-enforcing service. Legacy add/upsert may atomically preserve old upsert intent but cannot bypass failed-read protection, busy gates or corruption checks; revision-aware editing is offered only by v2. A new client against an old daemon shows upgrade-required and disables mutation/temporary controls rather than falling back to unsafe upsert. Driver descriptors from the daemon identify URL/path dialect, safe editable fields and secret-bearing slots for every registered kind; family is server-derived for new connections; updates preserve the existing saved family, including explicitly pinned legacy mismatches, rather than silently normalizing it. Password replacement is masked and separate from a password-free endpoint. Retain unknown config only server-side; if a kind has secret-bearing options, its profile must extract/preserve them or mark that field unsupported for editing before release. The Settings manager lists, filters, edits, tests and removes; Save is allowed without testing. Saved success, added-for-session, activation-failed, refresh-failed, conflict, cleanup-pending and unknown-outcome are distinct UI states. The PRD mock is the UX baseline; its synthetic outcome controls do not ship.

External IDE integration discovery is completed at HLD level and recorded below. S005 owns implementation and end-to-end execution against those identified surfaces; it does not defer contract discovery. Backend-only success does not satisfy S005. No edits to the separate checkout occur until its tracked build scope and filesystem access are established.

File-conversion foundation (S001; consumed by S002 and S003): src/daemon/db/converter-cache.ts currently keys persistent cache directories by connection ID, records sourcePath in sidecars/logs and matches freshness by mtime/size. src/daemon/db/drivers/duckdb-file.ts currently calls that cache and has no ownership cleanup in close. Both are explicit S001 foundational change sites, as are the converters under src/daemon/db/drivers/converters and their DuckDB runtime. Temporary mode MUST bypass persistent conversion cache, sidecars and file/path logs. Convert Avro/BSON/fixed-width/XLSX into bounded in-memory rows/Arrow batches and register them only in a private in-memory DuckDB session. Native and converted temporary queries disable spill/temp-directory writes and persistent query/path logging. If a format or query cannot remain in memory, return an actionable resource-limit/unsupported-temporary error before writing anything; never silently use a disk fallback. In-memory table, conversion and inflight identities include canonical scope root, workbench session, connection ID, config revision, source identity and converter options; same IDs in different sessions cannot share data. Session end/discard/driver.close drops owned memory tables/batches, cancels conversion and releases the private DuckDB context. Memory budget is explicitly bounded and reported; LLD chooses a tested default and exposes a safe error rather than truncating data. S001 must deliver the shared sc8 memory-only conversion and private DuckDB lifecycle before either branch is complete. Draft test workers in S002 use this S001-owned memory-only conversion mode so a test cannot create persistent cache sidecars. Saved conversion may retain its existing disk cache, but key it by canonical scope root plus connection ID/revision and compare full source identity, converter/options and content fingerprint before reuse; prevent cross-repository same-ID collisions. Invalidation/removal only cleans the owned cache generation, never source files.

Legacy lookup compatibility (S001/S003): management uses only canonical registered repositories, but saved-only analysis is a distinct read-resolution lane. Preserve src/analyze/runtimes/data/_shared.ts dataScopeOf exactly: repo/workspace/manifest-dir use scope.value as poolPath even when unregistered or nested inside another repo; a connection scope uses its resolved declaring root and enforces its selected connection. The new context therefore carries lookupRoot separately from optional managementRepoRoot. Never redirect a nested manifest registry to its containing registered repo, never require registration merely to read an existing scope-local saved registry, and never attach a temporary overlay to an unrelated lookupRoot. Analyzer leases and saved-cache identity use this same canonical lookupRoot without granting management rights. No directory-registry migration or removal is part of this Epic. Existing data-runtimes.test.ts own-directory cases remain regression gates.

Legacy pinned-family compatibility (S001): loadConnections retains its current user-pinned family and warning. Safe read reports declaredFamily, registeredFamily and effectiveFamily with a mismatch warning; a new create derives family from its registered driver. An update preserves the existing pinned family and unknown supported fields unless the user explicitly chooses a separately designed normalization flow, which is outside this release. V2 input cannot change family, ID or kind. Activation/Test materialize the existing effective family; they report existing factory/validation failures without mutating or normalizing the registry. If the driver profile cannot safely edit that legacy shape, show it read-only with explicit compatibility guidance and retain Delete with confirmation. Rollback restores prior registry bytes/reference generations and retains pinned values. Test that list, label-only edit, failed activation/test and rollback never silently normalize a mismatched record.

Planned acceptance-to-test mapping (each is a test obligation, not an implemented test):
- S001/ac1 — owner s1; CM-S1-A: safe editable read, every registered driver profile, duplicate create, fixed ID/kind, unknown-field retention, all Keep/Replace/Clear paths, cancel byte/credential equality and legacy pinned-family cases.
- S001/ac2 — owner s1; CM-S1-B: simultaneous same-ID creates, stale/deleted revisions, registry read/parse failure, fault injection at secret staging/JSON commit/recovery and unchanged prior registry/effective credentials.
- S001/ac3 — owner s1; CM-S1-C: lost replies, same-ticket replay across restart, signed-ticket target/expiry checks after receipt pruning, activation-only retry, refresh failure and cleanup-pending truth with no repeated create.
- S002/ac1 — owner s2; CM-S2-A: identical Test/Save materialized config, reachability-only result, sanitized errors, elapsed duration and zero draft config/secret/cache writes for SQL/KV/native and converted file fixtures.
- S002/ac2 — owner s2; CM-S2-B: edit/switch/close races and late replies, repeated-click suppression, 10-second deadline, cancellation and forced worker cleanup with no retained resources.
- S003/ac1 — owner s3; CM-S3-A: two workbenches and two repositories, MCP/analyzer/tool discovery and resolution isolation, cross-scope duplicate rules, and converted files with same ID/name/size/mtime but different contents; assert correct data and no temporary cache, sidecar, spill or path logs.
- S003/ac2 — owner s3; CM-S3-B: retain on panel close/repo switch, control-channel reconnect, end/90-second expiry/daemon restart, stale capability refusal, lifecycle copy before add, cancellation and zero residual in-memory tables/converter work.
- S004/ac1 — owner s4; CM-S4-A: correct Delete/Discard ID+scope confirmation, cancellation, expected revision, credential generation/cache ownership, idle cleanup and source-file/database preservation.
- S004/ac2 — owner s4; CM-S4-B: active-analysis lease refusal, stale row/error retention, lost removal response and same-ticket reconciliation, committed cleanup-pending retry, plus new lookup rejection after successful removal.
- S005/ac1 — owner s5; CM-S5-A: Settings search/manage action, retained repo and explicit multi-root selection, descriptor-driven driver choices and palette/editor route equivalence in extension and external IDE.
- S005/ac2 — owner s5; CM-S5-B: All/Saved/Temporary badges/counts, each loading/empty/filter/read-error/offline state, reveal after create, dirty discard/cancel and preservation of directory-scoped legacy saved lookup.
- S005/ac3 — owner s5; CM-S5-C: keyboard labels/focus, dark/light themes, masked replacements, error draft retention, new-client/old-daemon upgrade gate and old-client/new-daemon projections, mirrored external IDE contracts. Both-client execution is mandatory before release.


Shared foundation ownership correction: S001 owns all driver/converter/cache-policy implementation required by sc8, including in-memory native/converted reads, spill/log suppression, private DuckDB lifecycle and saved-cache identity isolation. S002 consumes it for transient probes. S003 consumes it for session-owned queries and supplies session identity/expiry, without owning or blocking the reusable conversion/probe foundation. S001 acceptance includes native and converted fixture parity plus same-ID/root/revision isolation of the shared execution boundary; S002 and S003 add their test-worker and session scenarios. Neither branch depends on the other.


External IDE integration findings and chosen plan (verified during this HLD):
- Existing pane and entry route: /Users/subhagho/work/projects/insors/insrc-ide/src/vs/workbench/contrib/insrc/browser/insrc.contribution.ts:91 imports the pane and :94 the connection actions; :96 registers Data Sources with DbDriversInput. /Users/subhagho/work/projects/insors/insrc-ide/src/vs/workbench/contrib/insrc/browser/dbDrivers/dbDriversCommands.ts:18 registers insrc.openDataSources and opens DbDriversInput. Preserve that editor identity and command. Extend its command arguments to carry a selected registered repo and pending action; the Settings Manage Connections link and old entry point both open the same editor state.
- Pane behavior to replace: /Users/subhagho/work/projects/insors/insrc-ide/src/vs/workbench/contrib/insrc/browser/dbDrivers/dbDriversPane.ts:149 awaits dbService.list; :166 interprets zero rows as no connections; add/test/remove buttons dispatch palette commands with repoRoot/id and re-render. Replace the v2 pane path with sc7 explicit loading/read-error/offline/empty/filter states, repository selection, scope filtering and the shared draft/removal state machines. Rendering must catch structured service failures as error states; never reinterpret a failed request as an empty connection list. Preserve theme-token styling and editor lifecycle, but own session lifetime above the panel.
- Service behavior to replace: /Users/subhagho/work/projects/insors/insrc-ide/src/vs/workbench/contrib/insrc/browser/dbDrivers/insrcDbConnectionsServiceImpl.ts:34 calls db.listConnections and catches every exception to return []; its listDriverKinds repeats that pattern. save/remove/test call legacy methods and inspect legacy error objects. Add explicit v2 capability, list/read/driver-descriptor, operation-ticket/mutate/status/activation, draft-test/cancel and session methods. On the v2 path, list failure and malformed response are typed failures, not []. Safe server messages only enter UI/logs. Preserve separate legacy adapter projections for old consumers; the v2 manager never calls swallowed-error legacy methods or falls back to them. New-client/old-daemon shows upgrade-required and blocks mutation.
- Mirrored types: /Users/subhagho/work/projects/insors/insrc-ide/src/vs/workbench/contrib/insrc/common/dbConnectionsService.ts:21 defines legacy id/kind/family/label summaries; its DbConnectionInput admits a full url/options and save returns wrotePath. Mirror sc1-sc8 v2 declarations separately and validate discriminated payloads at IPC boundaries. Do not overload the legacy array return type with a success-or-error union that old code treats as []. Keep legacy signatures only as adapters. Carry session capability solely in trusted in-memory client context, not writable Settings or a renderer-provided client label.
- Palette action migration: /Users/subhagho/work/projects/insors/insrc-ide/src/vs/workbench/contrib/insrc/browser/dbDrivers/dbConnectionCommands.ts:218 and :260 register add/edit; the file also registers remove/test. Their current quick-input flows call legacy save/remove/test, with edit relying on summary metadata. Retain all action IDs but route v2-enabled add/edit to the common manager draft with safe config read, explicit create/update and fixed identity, test to sc4, and removal to sc6 confirmation. Pass repoRoot/id as selection hints only; obtain revision and ticket afresh from the daemon. Menu and pane invocations share the same manager handlers. When v2 is unavailable these actions expose the upgrade gate instead of unsafe v2-style editing through upsert.
- Settings wiring: /Users/subhagho/work/projects/insors/insrc-ide/src/vs/workbench/contrib/insrc/common/insrcConfiguration.ts contains native configuration registrations. Add the Data Connections discovery group/action link there; keep native User/Workspace scopes distinct from connection lifetime. The standalone extension implements equivalent routing from vscode-plugin/package.json and its activation/command services, using the same protocol and state semantics.
- S005 execution gate: verify each changed external pane/action/service/type/configuration surface against the synchronized daemon before release. Exercise failed list and malformed descriptor responses, no-repo/multi-root selection, retained repo, scope filtering, dirty guards, unknown saves, temporary session expiry and mixed versions in both clients. HLD discovery identifies required changes; LLD specifies exact files/method edits and tests rather than re-deciding the integration architecture.

Initial lease/session migration inventory and enablement gate: this is a bounded source inspection inventory, not a claim of exhaustive graph coverage. Source calls found at src/analyze/runtimes/data/_shared.ts (pool alias/test seam), discovery-connections.ts, discovery-objects.ts and schema-table.ts; src/analyze/measure.ts (acquireDataPool and direct pool.acquire); src/analyze/explore/db-connections-list.ts, db-tables-list.ts and db-table-describe.ts (injected pool-acquisition aliases); src/daemon/tools/builtins/db/index.ts (discovery, config lookups and full driver use), src/daemon/tools/builtins/data/schema-drift.ts; src/daemon/db/pool-cache.ts and src/daemon/db/pool.ts (construction/factory/ephemeral lifecycle); src/daemon/db-rpc.ts (direct transient factory calls). Driver-internal connection pools, such as the MSSQL library pool, are not themselves the management DriverPool but must stay within the outer lease's full operation lifetime. S001/S003 LLDs must enumerate production direct/import-aliased/injected factory, acquirePool/acquireDataPool/acquire/registerEphemeral paths, scoped discovery and all driver-use lifetimes, with old-to-new owner and regression test for each. Zero unclassified production consumers is a hard prerequisite for enabling removal or temporary visibility. Include analyzer measurement/exploration, not just runtime templates; retain scope-local saved lookup. The gate is evidence-backed completion of the inventory and lease tests, never a guessed caller count.


## 4. Diagrams

- [Sequence diagram](docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/sequence-diagram.html)
- [Component dependencies](docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/component-dependency.html)

## 5. Shared contracts

### 5.1 sc1: Connection management protocol and driver descriptors

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** One safe wire contract and compatibility boundary for all consumers.

**Interface sketch (type-level):**

```
type ConnectionScope = 'saved' | 'temporary'; interface ConnectionKey { repoRoot: string; scope: ConnectionScope; id: string } interface SafeConnection { key: ConnectionKey; revision: string; kind: string; family: 'rdbms'|'kv'|'file'; label?: string | undefined; publicConfig: Readonly<Record<string, unknown>>; declaredFamily?: string | undefined; registeredFamily?: string | undefined; effectiveFamily: string; compatibilityWarning?: string | undefined; credentialPresence: Readonly<Record<string, boolean>> } type CredentialPatch = { action: 'keep' } | { action: 'replace'; value: string } | { action: 'clear' }; interface DriverDescriptor { kind: string; family: 'rdbms'|'kv'|'file'; publicInputSchema: Readonly<Record<string, unknown>>; secretSlots: readonly string[] } interface ManagementCapabilities { version: 2; daemonEpoch: string; features: readonly string[]; receiptRetentionDays: 30 }
```

### 5.2 sc2: Revision-checked mutation and recovery outcomes

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** Make persistence and retries truthful across registry and credential boundaries.

**Interface sketch (type-level):**

```
interface OperationTicket { operationId: string; lookupRoot: string; scope: ConnectionScope; connectionId: string; mode: "create"|"update"|"remove"; issuedAt: string; expiresAt: string; signature: string } interface OperationStatusRequest { ticket: OperationTicket } interface MutationRequest { ticket: OperationTicket; operationId: string; key: ConnectionKey; mode: 'create'|'update'|'remove'; expectedRevision?: string | undefined; publicPatch?: Readonly<Record<string, unknown>> | undefined; credentials?: Readonly<Record<string, CredentialPatch>> | undefined } type ManagementErrorCode = 'invalid-input'|'duplicate-id'|'conflict'|'not-found'|'busy'|'registry-unreadable'|'secret-unavailable'|'recovery-required'|'session-expired'|'upgrade-required'|'operation-mismatch'|'reconciliation-required'; interface CommittedOutcome { operationId: string; revision: string; registration: 'persisted'|'session-added'|'removed'; activation: 'active'|'pending'|'failed'|'not-applicable'; credentialCleanup: 'complete'|'pending' } type MutationOutcome = { status: 'committed'; value: CommittedOutcome } | { status: 'rejected'; code: ManagementErrorCode; message: string }; type OperationStatus = { status:'committed'; value:CommittedOutcome } | { status:'pending'|'not-seen'|'reconciliation-required' }; interface ActivationRetry { key: ConnectionKey; committedRevision: string }
```

### 5.3 sc3: Validated connection access context and driver leases

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** A foundational extension point for session isolation and busy-use correctness across dependency branches.

**Interface sketch (type-level):**

```
interface ConnectionAccessContext { lookupRoot: string; managementRepoRoot?: string | undefined; daemonEpoch: string; sessionHandle?: string | undefined } interface ConnectionLease { key: ConnectionKey; revision: string; release(): Promise<void> } interface ConnectionResolver { list(context: ConnectionAccessContext): Promise<readonly SafeConnection[]>; lease(context: ConnectionAccessContext, id: string): Promise<ConnectionLease> } interface ManagementRequestContext { connectionIdentity: string; access: ConnectionAccessContext }
```

### 5.4 sc4: Transient draft test contract

**Owner Story:** `s2`
**Consumed by:** `s5`

**Purpose:** Test the same draft as Save with bounded lifetime and stale-result identity.

**Interface sketch (type-level):**

```
interface DraftTestRequest { requestId: string; draftRevision: number; key: ConnectionKey; expectedRevision?: string | undefined; publicPatch: Readonly<Record<string, unknown>>; credentials: Readonly<Record<string, CredentialPatch>> } interface DraftTestResult { requestId: string; draftRevision: number; repoRoot: string; daemonEpoch: string; status: 'reachable'|'failed'|'timeout'|'canceled'; tookMs: number; safeMessage?: string | undefined } interface TestCancellation { requestId: string }
```

### 5.5 sc5: Workbench session registration and ephemeral overlay

**Owner Story:** `s3`
**Consumed by:** `s4`, `s5`

**Purpose:** Memory-only temporary state independent from panels and chat sessions.

**Interface sketch (type-level):**

```
interface OpenConnectionSessionResult { sessionHandle: string; capability: string; daemonEpoch: string; heartbeatMs: 30000; leaseMs: 90000 } interface SessionResume { sessionHandle: string; capability: string; daemonEpoch: string } interface TemporaryConnectionStore { register(context: ConnectionAccessContext, request: MutationRequest): Promise<MutationOutcome>; end(sessionHandle: string): Promise<void> }
```

### 5.6 sc6: Safe removal and cleanup presentation

**Owner Story:** `s4`
**Consumed by:** `s5`

**Purpose:** Treat saved Delete and temporary Discard consistently without touching source data.

**Interface sketch (type-level):**

```
interface RemoveConnectionRequest { ticket: OperationTicket; operationId: string; key: ConnectionKey; expectedRevision: string } interface RemovalState { key: ConnectionKey; operationId: string; state: 'confirming'|'removing'|'busy'|'conflict'|'unknown'|'removed-cleanup-pending'|'removed'; safeMessage?: string | undefined }
```

### 5.7 sc7: Manager state and scope filter

**Owner Story:** `s5`

**Purpose:** Preserve the PRD interaction across the two client implementations.

**Interface sketch (type-level):**

```
type ScopeFilter = 'all'|'saved'|'temporary'; type ConnectionListState = 'loading'|'ready'|'empty-registry'|'empty-filter'|'read-error'|'offline'|'no-repository'|'upgrade-required'; interface ConnectionManagerState { repoRoot?: string | undefined; filter: ScopeFilter; listState: ConnectionListState; draftRevision: number; dirty: boolean; mutationOperationId?: string | undefined; refreshError?: string | undefined }
```

### 5.8 sc8: Memory-only file execution and conversion policy

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`

**Purpose:** A shared file-driver foundation for transient tests and temporary sessions without reversing branch dependencies.

**Interface sketch (type-level):**

```
interface FileExecutionIdentity { lookupRoot: string; ownerId: string; connectionId: string; revision: string; sourceIdentity: string; converterOptionsDigest: string } interface FileExecutionPolicy { identity: FileExecutionIdentity; persistence: 'saved-cache'|'memory-only'; memoryBudgetBytes: number; allowSpill: false } interface FileExecutionResource { close(): Promise<void> } interface FileExecutionFactory { open(policy: FileExecutionPolicy): Promise<FileExecutionResource> }
```

## 6. Story boundaries

### 6.1 Story E20261021484fcef7:S001

**Owns:** `sc1`, `sc2`, `sc3`, `sc8`

Safe saved-config read/patch, canonical repo validation, driver profiles, registry metadata/receipts and crash recovery, immutable secret generation staging, compatibility adapters and lease accounting foundation. Does not own temporary storage or rich manager layout. Preserve saved-only scope-local lookup and legacy pinned-family values; signed operation tickets make expiry/replay decidable after receipt pruning. Own the shared memory-only conversion/probe driver foundation, converter-cache policy/identity changes and private DuckDB lifecycle (sc8), completed before the S002/S003 branches.

### 6.2 Story E20261021484fcef7:S002

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc8`

Transient process probe transport, deadline/cancellation and sanitization. Uses foundational context slots without depending on s3’s session implementation.

### 6.3 Story E20261021484fcef7:S003

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc8`

Session open/resume/heartbeat/end, memory-only temporary overlays and receipts, trusted execution-context propagation through analyzer/tool/MCP call paths, expiry and saved/temporary collision rules. Bind the S001-owned sc8 file execution policy to session identity and expiry; S001 owns conversion, cache-policy isolation and private DuckDB lifecycle. Every native/converted kind uses that foundation rather than a branch-local converter.

### 6.4 Story E20261021484fcef7:S004

**Owns:** `sc6`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc5`

Removal coordination for both scopes, busy/revision enforcement, confirmation state, postcommit credential cleanup retry and operation-status recovery. Never invokes source data deletion.

### 6.5 Story E20261021484fcef7:S005

**Owns:** `sc7`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`

Settings contributions and shared command routing, themed editor/forms, filters, dirty guards, stale-test suppression and truthful feedback in extension and external IDE. HLD has inspected the external pane, actions, service, mirrored types and Settings registrations; S005 implements the recorded plan and validates its mirrored contract before integration acceptance.

## 7. Non-functional targets

- **Performance:** Draft tests have a 10-second parent-enforced deadline, with forced child reap if graceful termination fails. Workbench heartbeat is 30 seconds and expiry 90 seconds after last valid heartbeat. Mutations serialize per repo; list/filter work does not perform driver probes. LLD load tests must verify no leaked children, leases or session entries after cancellation/expiry.
- **Security:** Daemon owns every saved/temporary config and credential decision; client labels/PIDs are not authorization. Registered-root eligibility gates management and temporary operations; saved-only analysis preserves canonical scope-local lookup without gaining mutation rights. Safe read responses return a profile allowlist and presence booleans only. Secrets, capabilities and full requests never enter logs, receipts, prompts, artifacts, telemetry or checkpoints. Temporary inputs never reach disk or keychain. A test worker receives config via private IPC and may not emit raw driver errors. Temporary file conversion, query spill and metadata/logging are part of the no-persistence boundary, including test workers.
- **Observability:** Use getLogger with operation ID, safe code, repo ID, scope, revision and phase only; timing and counters for commit, activation, recovery, timeout, busy refusal and session expiry. No raw exceptions or endpoint/options. Operation status exposes committed truth even when response delivery or activation failed. Recovery-required and cleanup-pending are visible and actionable.
- **Durability:** Saved JSON remains authoritative. Same-directory atomic rename/fsync commits registry, revisions and receipts together; immutable keychain generations preserve previous effective credentials until commit. Recover preparation records before enabling mutation. Issue signed 30-day operation tickets; preserve receipts through ticket expiry and pending cleanup, and distinguish expired-unreceipted from valid-not-seen after restart. Temporary state and receipts expire on explicit session end, 90-second lease loss or daemon epoch change.

## 8. Rollout

**A — saved foundation**

**Stories:** `s1`
**Flag:** `connections.managementV2`

Land shared protocol, safe mutation/recovery and resolver/lease foundation before any consumer. Include sc8 in-memory file conversion/probe foundation and saved-cache identity changes so both later branches have a complete shared execution boundary.

**Backward compat:** Preserve legacy method names and success projections via adapters. Existing saved JSON remains readable; preserve unknown top-level fields and metadata. Backup registry before first management-metadata write; disable new mutations if a concurrent old daemon/writer is detected. New manager stays hidden until v2 handshake succeeds.

**B — tests and temporary scope**

**Stories:** `s2`, `s3`
**Flag:** `connections.managementV2`

Both depend only on s1; enforce serial provider calls if any are involved. Deliver bounded draft probes and workbench context propagation without exposing incomplete management controls. S002 and S003 both consume S001/sc8; neither owns a foundation required by the other.

**Backward compat:** Saved-only calls without a connection context continue to work. Existing ephemeral producers must migrate to a run/workbench context or remain explicitly isolated; never expose their records through a shared repo pool. New clients against old daemons display upgrade-required.

**C — safe removal**

**Stories:** `s4`
**Flag:** `connections.managementV2`

Removal requires the foundation and both saved and temporary ownership semantics.

**Backward compat:** Old delete commands enter the same busy/revision-safe service; do not enable removal while untracked pool consumers remain. Postcommit cleanup-pending is preserved through reconciliation and clearly distinguished from rejection.

**D — manager integration**

**Stories:** `s5`
**Flag:** `connections.managementV2`

Expose complete Settings behavior only after backend contracts and lifecycle paths are available and independently verified in both clients.

**Backward compat:** Keep existing palette and editor entry points. Implement the external pane/service/action/type/configuration changes recorded by this HLD and execute both-client/mixed-version tests before declaring S005 complete. Rollback hides v2 UI and blocks temporary creation while allowing cleanup; do not downgrade to binaries that discard receipt metadata or cannot read new secret references.

**Ordering rationale:** s1 owns sc1-sc3 and is a prerequisite of every other story; s2 and s3 are independent branches. s4 follows s1+s3, then s5 consumes all contracts. Every approved story appears exactly once; no Epic dependency is amended.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Filesystem/keychain crash consistency | There is no transaction spanning JSON rename, keychain writes and response delivery. | Immutable secret generations, secret-free preparation records, atomic JSON receipts, recovery-before-mutation, failure injection around every boundary, and explicit cleanup-pending/recovery-required outcomes. Keep verified backups and refuse unsafe downgrade. |
| Session context and busy-use coverage | Current pools are repo keyed and analyzer/tool paths can acquire drivers independently, so partial migration would leak temporary visibility or close a busy driver. | Enumerate all acquirePool/registerEphemeral/driver acquisition call sites in LLD, enforce one resolver/lease boundary, exercise two workbenches plus MCP/analyzer paths, crash/reconnect/expiry, and refuse management enablement until every consumer is accounted for. Include converter-cache and DuckDB/converted-driver lifecycle boundaries, same-ID source identity tests, and existing directory-scope regression cases. |
| Two clients and varied driver auth | The separate IDE fork must mirror evolving contracts, and arbitrary options may carry secrets beyond URL passwords. | Gate manager on a version handshake, use the HLD-recorded external integration findings and verify exact edits in its LLD/build, use daemon driver-specific safe profiles, verify all registered kinds against profile coverage, and test mixed versions plus SQL/KV/file end-to-end fixtures without production data. |

## 9. Alternatives considered

### 9.1 a1: Daemon-owned application service with atomic JSON commits and session overlays — **CHOSEN**

Keep the registry authoritative and coordinate mutations, credentials, driver leases and session resolution in one daemon boundary.

A daemon application service owns every management command and routes existing adapters through the same invariant checks. Saved state stays in the repository JSON registry; immutable credential generations and atomic registry replacement establish a recoverable commit boundary with operation receipts.

Temporary state lives in a workbench-session overlay and is joined with saved sources only when a daemon-validated session capability accompanies analysis. Both clients consume the same versioned management protocol and explicit state machine.

**Pros:**
- Preserves the approved canonical registry location without introducing a second persistent connection registry.
- Centralizes revision, duplicate-ID, secret, busy-use and idempotency rules across UI and legacy clients.
- Session overlays can expire without writing temporary endpoints or credentials to disk.

**Cons:**
- Requires coordinated changes to tool/analyzer consumers so removal leases and session context cannot be bypassed.
- Atomic filesystem commit and keychain generation cleanup require explicit crash-recovery handling.

**Cost estimate:** L

### 9.2 a2: Transactional database as canonical connection store with JSON projection

Move connection metadata and operation receipts into a transactional store, projecting the legacy JSON for consumers.

A transactional store owns saved metadata, revision checks and operation receipts; an exporter maintains JSON for existing consumers. Session overlays and protected credentials remain daemon-owned.

Clients use the same versioned service, but old readers see a projection rather than the canonical registry. Migration and reconciliation determine which representation wins when users edit JSON.

**Pros:**
- Metadata revisions and operation receipts can commit in one native database transaction.
- Queries for operation status and conflict detection have a single transactional metadata source.

**Cons:**
- Violates the approved release constraint to retain the existing JSON registry without a second persistent registry unless upstream scope is amended.
- Projection failures introduce a new divergence state for existing JSON consumers.
- Still cannot transact atomically with the OS keychain, so generation-based secret handling remains necessary.

**Cost estimate:** L

**Rejected because:** Strong metadata transactions but requires changing the approved persistence boundary.

### 9.3 a3: Client-owned connection documents with direct legacy RPC reuse

Let each manager merge drafts and temporary state while calling existing save/test/delete operations.

Each client owns form merging, conflict hints and temporary connection records, with the daemon continuing to expose existing operations. Analysis receives temporary configuration from client request context.

Saved credentials remain server-side, but clients must coordinate read-modify-write behavior and duplicate checks themselves. Each client implements its own version adaptation and lifecycle cleanup.

**Pros:**
- Reuses existing RPC method shapes with fewer shared daemon management interfaces.
- Form state and filtering can be developed independently in the two client surfaces.

**Cons:**
- Client duplicate checks cannot guarantee exactly one success for simultaneous creates.
- Independent client merges cannot protect registry and keychain state across daemon failures.
- Temporary configuration sent through plan/request payloads risks persistence in analysis checkpoints and inconsistent session isolation.

**Cost estimate:** M

**Rejected because:** Cannot establish concurrency and session-isolation invariants across clients.

## 10. UX

- [UX mock](docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/ux-mock.html)

## 11. References

- **[[c1]]** `prior-artifact` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/DEF.md`
- **[[c2]]** `analyze-bundle` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/evidence/hld-context.json`
- **[[c3]]** `doc` `docs/connection-management-prd.html`
- **[[c4]]** `code` `src/daemon/server.ts:235`
- **[[c5]]** `code` `src/daemon/tools/types.ts:50`
- **[[c6]]** `code` `src/analyze/executor/types.ts:75`
- **[[c7]]** `code` `src/analyze/runtimes/data/_shared.ts:122`
- **[[c8]]** `code` `src/daemon/db/converter-cache.ts:64`
- **[[c9]]** `code` `src/daemon/db/drivers/duckdb-file.ts:610`
- **[[c10]]** `code` `src/analyze/runtimes/data/_shared.ts:53`
- **[[c11]]** `code` `src/analyze/runtimes/data/__tests__/data-runtimes.test.ts:185`
- **[[c12]]** `code` `src/daemon/db/__tests__/config.test.ts:95`
- **[[c13]]** `doc` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/evidence/ide-hld-inspection.json`

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.epic (design.epic)

**0 do not hold · 1 could not be verified · 10 hold** · template `design-spec` · model `cli-codex:gpt-6-astra` · reviewed 2026-10-21T08:30:10.235Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| data-compatibility | Rollout can detect a concurrent old daemon/writer before it discards newly introduced management metadata. | The existing save/delete adapters reconstruct `{ connections: ... }`, dropping other document fields, and saveConnections performs an unconditional writeFile. The HLD requires detection and mutation blocking but does not specify a cross-process exclusion or detection mechanism. A content-digest comparison cannot establish that a legacy writer will not write afterward. The analyzer also failed during planning with an invalid response-schema error. [files: src/daemon/db-rpc.ts, src/daemon/db/config.ts, src/daemon/server.ts] | Specify the rollout exclusion mechanism and a test with a legacy writer that overwrites the registry after the new service's digest check. |

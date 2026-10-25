<!-- insrc:artifact LLD-484fcef7efaf229e-s1 -->

# LLD: E20261021484fcef7:S001

## Summary

**Epic:** `manage-saved-temporary-data-connections`
**HLD base run:** `wf-1792569414548-dvzndd`
**HLD effective hash:** `dc1a3f91a768...`

S001 supplies safe saved-connection editing and the shared foundations used by later stories. It preserves current connection records while adding versioned revisions and recoverable outcomes, protects live credentials until commit, and makes driver use and memory-only file execution explicit. UI, temporary session storage and test-worker orchestration remain in their owning stories.

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

## 1. HLD context

> See **HLD-484fcef7efaf229e** § 2. Framework summary

**Rollout phase:** A — saved foundation
**Owns:** `sc1` (Connection management protocol and driver descriptors), `sc2` (Revision-checked mutation and recovery outcomes), `sc3` (Validated connection access context and driver leases), `sc8` (Memory-only file execution and conversion policy)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Transient process probe transport, deadline/cancellation and sanitization. Uses foundational context slots without depending on s3’s session implementation. — owns `sc4`
- `s3`: Session open/resume/heartbeat/end, memory-only temporary overlays and receipts, trusted execution-context propagation through analyzer/tool/MCP call paths, expiry and saved/temporary collision rules. Bind the S001-owned sc8 file execution policy to session identity and expiry; S001 owns conversion, cache-policy isolation and private DuckDB lifecycle. Every native/converted kind uses that foundation rather than a branch-local converter. — owns `sc5`
- `s4`: Removal coordination for both scopes, busy/revision enforcement, confirmation state, postcommit credential cleanup retry and operation-status recovery. Never invokes source data deletion. — owns `sc6`
- `s5`: Settings contributions and shared command routing, themed editor/forms, filters, dirty guards, stale-test suppression and truthful feedback in extension and external IDE. HLD has inspected the external pane, actions, service, mirrored types and Settings registrations; S005 implements the recorded plan and validates its mirrored contract before integration acceptance. — owns `sc7`

## 2. Contract details

**Surface level:** public

### 2.1 `saveConnectionRpc`

```typescript
saveConnectionRpc(params: LegacySaveParams | V2SavedMutationParams, context?: ManagementRequestContext | undefined): Promise<SaveConnectionResult | MutationOutcome | SafeLegacyError>
```

**Parameters:**
- `params: LegacySaveParams | V2SavedMutationParams` — Legacy config upsert or v2 ticketed create/update; wire routes remain separate.
- `context: ManagementRequestContext` _(optional)_ — Server-supplied request identity and validated access; never accepted from request JSON.

**Returns:** `SaveConnectionResult | MutationOutcome | SafeLegacyError` — Legacy success projection on db.saveConnection; v2 committed/rejected result on proposed db.connections.v2.mutate. Persistence and activation are separate; client list refresh is a read.

**Errors:**
- `ManagementErrorCode` when Unreadable registry, unsupported driver/profile, duplicate ID, stale revision, busy lease, invalid/expired ticket, unavailable secret or recovery/fence failure.

**Preconditions:**
- Management root is a canonical registered repo; preserve scope-local reads as a separate lane.
- v2 capability is enabled only after maintenance handoff and write-fence proof.
- Full persisted config is merged and validated server-side; incoming identity/kind/family changes are rejected on update.

**Postconditions:**
- Create never updates an existing ID; update requires exact non-reused revision; legacy upsert remains atomic inside the gate but cannot bypass safety.
- A rejected precommit mutation preserves registry bytes and all live credential references; any staged ref is removed or quarantined with recovery-required.
- Success commits config/revisions/receipt together on a new read-only inode; no stored secret is returned. Failed activation yields committed+failed, not rollback.

### 2.2 `loadConnections`

```typescript
loadConnections(lookupRoot: string): Promise<LoadedConnections>
```

**Parameters:**
- `lookupRoot: string` — Existing canonical scope-local registry root, including unregistered directory-scoped analysis.

**Returns:** `LoadedConnections` — Internal raw config plus warnings, retaining explicit pinned family and unknown supported fields. Not a renderer response.

**Errors:**
- `registry-unreadable` when Any non-ENOENT read error or invalid config; never silently [].
- `recovery-required` when Managed envelope missing, generation regressed or file fencing was lost after adoption.

**Preconditions:**
- Saved-only analysis preserves dataScopeOf’s own-directory semantics; read access does not establish management eligibility.
- Raw URL/options remain daemon-internal; v2 read maps through the profile allowlist.

**Postconditions:**
- Only an absent unmanaged file is empty; managed-file disappearance requires recovery.
- Legacy pinned family remains effective with warning; no implicit normalization.

### 2.3 `saveConnections`

```typescript
saveConnections(repoPath: string, file: ConnectionsFile, commit?: ManagedCommit | undefined): Promise<string>
```

**Parameters:**
- `repoPath: string` — Canonical management repo root.
- `file: ConnectionsFile` — Complete server-built document; retains untouched records and unknown top-level fields.
- `commit: ManagedCommit` _(optional)_ — Unforgeable internal gate proof plus expected generation/digest, receipt, mode and preparation ID.

**Returns:** `string` — Same canonical path; managed commits use exclusive same-directory temp creation, sync, read-only chmod, rename and parent sync.

**Errors:**
- `recovery-required` when Missing managed proof, lease/fence mismatch, unexpected generation or uncertain rename/fsync result.

**Preconditions:**
- Public callers cannot construct ManagedCommit; one serialized service owns all writes.
- Unmanaged legacy writer compatibility is allowed only before adoption; a managed root rejects direct saveConnections without proof.
- Do not chmod the live registry writable; use a new temporary inode.

**Postconditions:**
- The managed path remains owner-read-only after replacement; old writeFile(path,...) fails rather than truncating management metadata.
- On uncertain durability, return reconciliation-required and recover the committed marker before another write; never assume rename failed.

### 2.4 `ConnectionResolver.list`

```typescript
list(context: ConnectionAccessContext): Promise<readonly SafeConnection[]>
```

**Parameters:**
- `context: ConnectionAccessContext` — lookupRoot plus optional management root/session extension; injected by daemon.

**Returns:** `readonly SafeConnection[]` — Profile-projected saved view in S001; a typed extension port admits S003 overlays later without importing its store.

**Errors:**
- `registry-unreadable` when Saved config cannot be read/validated.
- `session-expired` when A supplied future session extension rejects access; no fallback to same-named saved source.

**Preconditions:**
- lookupRoot defines saved reads; optional managementRepoRoot only grants mutation when separately validated.

**Postconditions:**
- No arbitrary config options, raw URL passwords or secret references appear in safe DTOs; only presence flags and non-secret fields.
- Metadata lists use immutable config snapshots; callers cannot mutate the underlying registry.

### 2.5 `ConnectionResolver.lease`

```typescript
lease(context: ConnectionAccessContext, id: string): Promise<ConnectionLease>
```

**Parameters:**
- `context: ConnectionAccessContext` — Trusted lookup identity and optional validated overlay extension.
- `id: string` — Connection ID constrained by resolved scope.

**Returns:** `ConnectionLease` — Opaque revision-pinned lease used by a daemon-internal withConnection helper; underlying Driver never escapes the lifetime callback.

**Errors:**
- `not-found | busy | conflict` when Missing source, mutation barrier or incompatible revision.

**Preconditions:**
- Acquire and mutation-barrier checks share the per-root gate; no direct production pool.acquire bypass remains.

**Postconditions:**
- Full operation lifetime, including streaming/iteration, stays leased until finally-release; nested borrowed leases retain reference counts.
- Updates cannot close an active driver; cleanup/close occurs only after all related leases drain.

### 2.6 `FileExecutionFactory.open`

```typescript
open(policy: FileExecutionPolicy): Promise<FileExecutionResource>
```

**Parameters:**
- `policy: FileExecutionPolicy` — HLD sc8 root/owner/id/revision/source/options identity and saved-cache versus memory-only policy.

**Returns:** `FileExecutionResource` — Private file execution boundary shared by later test workers and temporary sessions; close is idempotent.

**Errors:**
- `resource-limit | unsupported-temporary | invalid-input` when Memory budget exhausted, safe in-memory execution unavailable, invalid converter options or file escape.

**Preconditions:**
- Memory-only mode forbids persistent converter, spill, sidecar, query/profile/path logs and external extension installation.
- Use bundled/local preinstalled reader dependencies only; no installing an extension as a side effect of a draft or temporary request.

**Postconditions:**
- Avro/BSON/fixed-width/XLSX conversion shares row/type-normalization code with saved mode but never invokes a destination-path writer in memory-only mode.
- Native and converted execution release private DuckDB instance, batches, iterators and handles on close; never truncate inputs to fit budget.

### 2.7 `ManagementCapabilities`

```typescript
interface ManagementCapabilities { version: 2; daemonEpoch: string; features: readonly string[]; receiptRetentionDays: 30 }
```

**Returns:** `ManagementCapabilities` — Proposed db.connections.v2.capabilities handshake; mutation unavailable until all writer/lease/profile/file-mode gates pass.

**Preconditions:**
- Older daemons may return unknown-method; clients treat that as upgrade-required, never unsafe mutation fallback.

**Postconditions:**
- Expose runtime driver descriptors and safe-read via db.connections.v2.drivers/read/list; ticket/status/activate routes use sc2 declarations. S002/S003 later add their owned methods.

## 3. Data model changes

### 3.1 `ConnectionsFile management envelope` — field-add

Existing connections[] records remain unchanged. Merge unknown fields at document and untouched-entry level. revision is random per successful update and never reused after delete/recreate. Metadata contains no plaintext configs or credentials beyond the canonical connections[] entries. Proposed implementation modules: src/shared/connection-management.ts (sc1/sc2/sc3/sc8 types), src/daemon/db/management.ts (serialized application service), src/daemon/db/managed-store.ts (atomic writer/recovery/fence), src/daemon/db/driver-profiles.ts (public/secret validation). These are NEW files to be created, not existing code anchors.

```
interface ManagedConnectionsFile extends ConnectionsFile { _management?: { version: 2; registryId: string; generation: string; revisions: Readonly<Record<string,string>>; receipts: Readonly<Record<string,CommittedReceipt>> } | undefined } interface CommittedReceipt { ticket: OperationTicket; requestMac: string; outcome: CommittedOutcome; cleanupRefs: readonly string[] }
```

**Call sites:**
- `src/shared/db-driver.ts`
- `src/daemon/db/config.ts`
- `src/daemon/db-rpc.ts`

### 3.2 `Draft projection and driver profile` — new

One materialization path drives safe read, saved mutation and future tests. Profiles cover every registered kind and all currently used driver options; derive from real driver reads, not family alone. New/create input accepts only profile-known fields. Existing unexposed supported fields stay in server snapshots across basic edits, not round-tripped through renderer. Potential secret-bearing unknown fields block new persistence until profile classification, while safe read remains redacted; never claim arbitrary option secrecy. Existing pinned-family mismatch is preserved; safe compatible edits succeed or show read-only guidance when that shape cannot be safely materialized.

```
interface DriverProfile { kind: string; publicKeys: readonly string[]; secretSlots: readonly string[]; publicSchema: Readonly<Record<string,unknown>> } interface EffectiveDraft { config: ConnectionConfig; expectedRevision?: string | undefined; credentialActions: Readonly<Record<string,CredentialPatch>> }
```

**Call sites:**
- `src/shared/db-driver.ts`
- `src/daemon/db-rpc.ts`
- `src/daemon/db/secrets.ts`

### 3.3 `Immutable secret generations and preparation metadata` — invariant-change

New reference names include repo ID, connection ID and random generation; never overwrite legacy fixed db:<repoId>:<id> values during ordinary mutation. Before keychain staging, fsync an exclusive preparation record under the repo’s management recovery directory containing only owned reference names and operation metadata. Stage replacements, write/verify new JSON with receipt, then cleanup old refs after commit. Recovery rereads canonical JSON and its receipt before classifying staged refs; it never deletes anything currently referenced. In-memory plaintext is not written to journal/logs. Keep retains current ref; Clear removes its reference only at commit. Missing HMAC/ticket key on an adopted registry is recovery-required, not key rotation that invalidates outstanding requests.

```
interface PreparationRecord { operationId: string; registryId: string; expectedGeneration: string; ownedStagedRefs: readonly string[]; phase: 'prepared'|'commit-uncertain'|'cleanup-pending' }
```

**Call sites:**
- `src/daemon/db/secrets.ts`
- `src/shared/keystore.ts`
- `src/daemon/db/config.ts`

### 3.4 `Signed operation ticket and replay` — new

Issue a 30-day ticket only on a registered management root; sign normalized target, mode and timestamps with persistent daemon keychain key. Validate signature, target, ticket age and operationId equality before any effect. Request fingerprint is a keyed HMAC of canonical full mutation, including credential intent, never an unkeyed low-entropy password hash. Before expiry, same-ID/same-MAC replay returns committed outcome; mismatch rejects. A missing receipt means not-seen only after no matching recovery/inflight state. Expired-unreceipted signed tickets yield reconciliation-required; replay refused. Retain receipts through expiry and incomplete cleanup. Concurrent ticket replay joins one in-flight operation rather than staging two secrets.

```
interface OperationTicket { operationId: string; lookupRoot: string; scope: ConnectionScope; connectionId: string; mode: 'create'|'update'|'remove'; issuedAt: string; expiresAt: string; signature: string }
```

**Call sites:**
- `src/daemon/db-rpc.ts`
- `src/daemon/db/config.ts`
- `src/shared/keystore.ts`

### 3.5 `Lease-aware saved resolver and extension ports` — invariant-change

Management eligibility is distinct from saved read scope. Canonical lookupRoot keys pool/cache/lease maps and preserves directory-local dataScopeOf. S001 supplies extension interfaces but no session state. It moves full-use lifetimes into a callback/lease boundary, including db tool streaming and schema-drift, all analyze/explore listing/table/describe helpers, data runtimes, and analyze/measure acquisition. Bind injected pool aliases and test seams to the resolver, not raw factory access. New lease after a barrier fails; finally-release is idempotent; idle timer does not close active use. Future S004 consumes the barrier without owning this accounting. Persist a source-backed migration checklist for every direct and imported alias before feature enablement; a source scan with no unclassified production consumers plus behavioral tests is required, never a graph-count assertion.

Source-backed current consumer migration map (declarations/imports classified alongside executable uses; build scan must reject new unclassified aliases):
- src/analyze/runtimes/data/_shared.ts:122 — pool alias/test seam; replacement/extent: Replace PoolSource/acquireDataPool with context-bound resolver port; test seams cannot bypass validation. Proving test: CM-S1-L/M.
- src/analyze/runtimes/data/discovery-connections.ts:69 — metadata listing; replacement/extent: Safe config snapshot only; no driver needed; preserve own-directory scope. Proving test: CM-S1-L/M.
- src/analyze/runtimes/data/discovery-objects.ts:87 — driver acquire and list; replacement/extent: Hold lease through complete enumeration and async result consumption. Proving test: CM-S1-L/M.
- src/analyze/runtimes/data/schema-table.ts:71 — driver acquire/describe; replacement/extent: Hold revision lease through all schema/shape operations. Proving test: CM-S1-L/M.
- src/analyze/measure.ts:665 — pool lookup and direct acquire; replacement/extent: Metadata measure remains safe snapshot; driver-based measures hold lease through all target probes. Proving test: CM-S1-L/M.
- src/analyze/explore/db-connections-list.ts:42 — injected acquire alias; replacement/extent: Inject safe list port, preserve deterministic exploration output. Proving test: CM-S1-L/M.
- src/analyze/explore/db-tables-list.ts:78 — injected acquire alias and driver use; replacement/extent: Use injected resolver lease callback across table discovery. Proving test: CM-S1-L/M.
- src/analyze/explore/db-table-describe.ts:58 — injected acquire alias and driver use; replacement/extent: Use injected resolver lease callback across describe. Proving test: CM-S1-L/M.
- src/daemon/tools/builtins/db/index.ts:140 — access-policy metadata, discovery, acquireDriver, file listing; replacement/extent: Separate metadata-only snapshot from leased Driver callbacks; migrate all acquireDriver consumers, including async iteration. Proving test: CM-S1-L/M.
- src/daemon/tools/builtins/data/schema-drift.ts:144 — direct acquire and long probe; replacement/extent: Hold lease across whole drift collection, release on error/cancel. Proving test: CM-S1-L/M.
- src/daemon/db/pool-cache.ts:28 — DriverPool construction/cache; replacement/extent: Keep canonical lookupRoot cache; no user temporary registration into shared saved cache. Proving test: CM-S1-L/M.
- src/daemon/db/pool.ts:159 — factory, idle close, registerEphemeral; replacement/extent: Internal construction covered by lease; idle close respects active counts; ephemeral entry point requires future validated overlay or test-only/private owner, never shared user state. Proving test: CM-S1-L/M.
- src/daemon/db-rpc.ts:257 — direct transient factory; replacement/extent: S001 exposes bounded private resource/materialization port; S002 later replaces test orchestration. Legacy test must use safe memory-only policy immediately. Proving test: CM-S1-L/M.
- src/daemon/db/index.ts:39 — barrel re-export; replacement/extent: Do not let old acquirePool barrel imports bypass tracked resolver; restrict raw pool entry points to internal audited callers. Proving test: CM-S1-L/M.
- src/daemon/db/registry.ts:46 — factory registry; replacement/extent: Metadata registration only; getFactory consumers above are audited construction boundaries. Proving test: CM-S1-L/M.
- src/daemon/db/drivers/mssql.ts:445 — driver-internal pool.acquire; replacement/extent: Library pool use, not management DriverPool; entire operation remains inside outer connection lease. Proving test: CM-S1-L/M.
Special lifetime at src/analyze/measure.ts: withinLimit deliberately returns before underlying work settles. The lease belongs to reachAndList/pendingListings.work, acquired before factory/listing work and released in that work’s finally after its actual promise settles, NOT in the timeout/canceled waiter. Shared pending listings own one lease; timed-out waiters leave that lease active, and update/remove remain busy until underlying work is truly canceled and settled or completes. Late rejection handling and pendingListings deletion must retain their current semantics. Never release because only Promise.race/withinLimit completed. Tests timeout/cancel the waiter, hold the driver operation pending, assert active lease and busy refusal, then settle/reject underlying work and assert exactly one release. Schema-drift’s lease spans live describe through its use of that driver result; db tool streams retain leases through generator completion/return/throw, and injected explore callbacks cannot return raw Driver outside the callback. This map is the current source-backed design classification; static coverage and runtime assertions remain build proof obligations, not an unsupported completeness claim.

```
interface ConnectionAccessContext { lookupRoot: string; managementRepoRoot?: string | undefined; daemonEpoch: string; sessionHandle?: string | undefined } interface LeaseState { active: number; revision: string; barrier: 'none'|'update'|'remove' }
```

**Call sites:**
- `src/daemon/db/pool-cache.ts`
- `src/daemon/db/pool.ts`
- `src/daemon/db-rpc.ts`

### 3.6 `File execution resource and converter row source` — new

Proposed new src/daemon/db/file-execution.ts owns sc8. Refactor existing converter files to share decoding/normalization between destination-path saved writers and bounded MemoryRowSource. No saved output-format regression; differential tests compare full values/types/null/nested behavior. Use private in-memory DuckDB instances, appending typed batches via the supported Node appender interface verified against the installed dependency in implementation; avoid source paths in table names or SQL logs. Budget defaults to 256 MiB decoded batches per resource, plus host DuckDB cap; fail explicitly when either limit is exceeded. For memory-only execution set spill allowance to zero, deny arbitrary SQL/ATTACH/COPY/export and extension installs, allow only validated source reads, and run no persistent cache/sidecar path. Saved cache key uses canonical root+ID+revision+source identity+converter/options digest; freshness includes source content fingerprint, not mtime/size alone. close cancels reading, drops tables and closes private DB, including partial failures. Explicit integration changes: src/daemon/db/drivers/duckdb-file.ts makeFactory must receive a daemon-internal FileExecutionPolicy through the factory construction port (not a renderer options field) and construct DuckDBFileDriver with one FileExecutionResource. All existing describe/sample/scan/aggregate/metadata query paths replace the global withConnection import with resource-owned connection callbacks; nested async iteration retains the resource lease. readerPath dispatches memory-only conversion to MemoryRowSource, never ensureCached. readerExpr binds generated private table names, not path-bearing SQL. close cancels active operations, clears schemaCache and closes that owned resource; it is no longer a no-op. src/daemon/db/duckdb-pool.ts keeps the legacy saved singleton API but adds the private execution factory and connection close/cancel path; memory-only creation never calls INSTALL arrow and may load only already available local readers, otherwise unsupported-temporary. Existing saved singleton behavior remains separate from the private path. src/daemon/db/converter-cache.ts cacheDirFor/destForSource/ensureCached and their callers accept a typed SavedCacheIdentity containing canonical root, ID, revision, canonical source identity, converter version and options digest. Cache destination and inflight keys derive from that entire identity; sidecar freshness compares identity plus content fingerprint. Source paths/logs are prohibited for memory-only paths, which never invoke these functions. Saved cleanup targets only its exact identity generation.

Decoder admission is before bulk decoding, not only emitted-batch accounting. Memory-only execution forbids BSON readDocs/readFile-all and XLSX new Workbook/readFile. Use bounded streams with reserved input chunks of at most 64 KiB; charge retained input, parser state, normalized cells/shared strings and emitted batches to one 256 MiB resource budget before retaining or allocating the admitted unit. BSON reads and validates the 4-byte document length first, checks it against remaining allowance and an 8 MiB document ceiling, and structurally checks depth/field/string bounds before object materialization; an oversized declared length must fail before allocating its payload. Release raw document buffers after consuming their batch. Avro framing validates header/schema/metadata and block sizes before decoding, and compressed blocks pass through a bounded inflater with an 8 MiB expanded-block ceiling; charge output chunks before accumulation and abort without collecting an over-limit block. Fixed-width decoding splits bytes incrementally, validates total declared record width, and rejects a record over 64 KiB rather than allowing an unbounded readline buffer. XLSX uses ZIP-entry and streaming XML/worksheet readers rather than a complete Workbook: validate central-directory entry count (at most 1024) and metadata allowance, enforce both declared and actual inflated-byte limits (8 MiB per entry, 64 MiB total), bound XML text/cell units to 64 KiB, and budget shared-string/style tables before retaining entries. Reject expansion-limit, ZIP64/unsupported encoding or parser-unit cases that cannot be safely bounded instead of falling back to full-workbook parsing. Streaming shared-string handling must preserve references and existing value normalization, not ignore them. Build must demonstrate decoder-level retained-state accounting and stop before admitting an over-budget buffer/object; batch byteSize alone is insufficient. Native DuckDB memory is separately capped by the resource policy with spill disabled. All admission errors cancel streams/inflaters/parser state, close tables/DB and yield resource-limit or unsupported-temporary with no source path in error text. Tests use huge BSON length headers without payload, single over-limit documents/lines/Avro blocks, compressed XLSX expansion, large shared-string tables, and cumulative retained parser state; instrument allocations/retained-unit counters before and after rejection, not only process memory after emission.
Schema and target channel: each MemoryRowSource exposes a target catalog and ordered typed columns before table creation. The columns carry the same logical type/nullability/normalization selected by the saved converter (including Avro explicit field types, BSON date-to-milliseconds normalization and each worksheet’s separately inferred schema), plus physical type for the private DuckDB appender. ConvertedBatch identifies targetId and schemaVersion; batches cannot silently infer/reinfer types from row values. Preserve empty/all-null columns using the saved converter’s explicit fallback; an empty XLSX sheet retains the existing nullable UTF8 _empty stub with zero data rows. Build the private typed table from the descriptor even when no batch exists. A batch with incompatible schemaVersion fails rather than coercing silently. Reuse the saved inference sample size and normalization rules with bounded two-pass source streaming when inference precedes row materialization; seekable source handles are closed/reopened with identity checks, not staged to disk. If source identity changes between passes, fail/retry explicitly.
For a single XLSX file, the target catalog records raw worksheet name and the legacy slugifySheetName-compatible slug. Pass every Driver describe/sample/scan/aggregate target through MemoryRowSource.describe/batches. A nonempty target selects the same legacy slug; unknown target gives a clear not-found error, never a different sheet. Without target, combine worksheet tables using the same schema compatibility/union behavior as the current Parquet glob, including clear failure where legacy schemas diverge. Directory-of-XLSX retains the current all-sheets behavior and does not silently invent target selection not supported by the legacy path. Schema cache is keyed by target and source revision (or disabled for target-specific reads), not one global schema per workbook. Preserve header order, fallback names, nullability, and saved empty-row handling. Differential tests compare full declared schema, values and selected worksheet between saved and memory-only modes, including empty workbook, empty sheet, all-null typed columns and differing per-sheet schemas.

```
interface ConvertedColumn { name: string; logicalType: string; physicalType: string; nullable: boolean; normalization: string } interface ConvertedTarget { targetId: string; sourceIdentity: string; worksheetName?: string | undefined; worksheetSlug?: string | undefined; columns: readonly ConvertedColumn[] } interface ConvertedBatch { targetId: string; schemaVersion: string; rows: readonly Readonly<Record<string,unknown>>[]; byteSize: number } interface MemoryRowSource { targets(): Promise<readonly ConvertedTarget[]>; describe(target?: string | undefined): Promise<readonly ConvertedTarget[]>; batches(target?: string | undefined, signal?: AbortSignal | undefined): AsyncIterable<ConvertedBatch>; close(): Promise<void> }
```

**Call sites:**
- `src/daemon/db/drivers/converters/types.ts`
- `src/daemon/db/drivers/converters/avro.ts`
- `src/daemon/db/drivers/converters/bson.ts`
- `src/daemon/db/drivers/converters/fixed-width.ts`
- `src/daemon/db/drivers/converters/xlsx.ts`
- `src/daemon/db/drivers/duckdb-file.ts`
- `src/daemon/db/duckdb-pool.ts`
- `src/daemon/db/converter-cache.ts`

### 3.7 `Writer adoption fence and recovery generation` — new

A content digest alone does not exclude the old unconditional writeFile writer. Adoption runs only in maintenance after the managed daemon is stopped through existing lifecycle control and the identified old daemon PID is verified gone. Do not signal unrelated processes. New daemon holds an exclusive O_EXCL owner lease for each root, with live-owner verification before stale-lease reclaim. Legacy code does not honor that lease: the physical fence is an atomic replacement of the live path with a new owner-read-only (0400) regular inode in a private 0700 directory. Every managed commit uses a 0600 exclusive temp, fsync, fchmod(0400), rename and directory fsync. The service never makes the live inode writable. Thus a legacy saveConnections writeFile(path) opened after the fence receives EACCES; a pre-opened descriptor still points at the detached old inode after replacement. Migrate active legacy secret refs to fresh generation refs before enabling v2 so late legacy fixed-ref writes cannot change effective credentials. The initial handoff requires old writers quiesced; do not promise lossless concurrent adoption. Keep a protected known-good pre-adoption snapshot until handoff completes. Prove the fence with a same-UID subprocess using the actual old writeFile recipe after the new service’s digest check; disable adoption on root-privileged runtimes, non-POSIX/non-enforcing filesystems or failed proof. Arbitrary same-user chmod/rename/manual writers are outside this supported coexistence model; unexpected inode/mode/envelope/generation drift after adoption enters recovery-required and blocks mutation. Do not auto-replay an unreceipted operation after drift. Safe downgrade is an explicit stopped-daemon restore procedure, never chmod-to-writable in normal operation. The existing safe stop control is src/cli/services/daemon.ts stopDaemon/stopDaemonWith; src/daemon/lifecycle.ts supplies PID bookkeeping, not the stop/drain implementation. A temporary-directory same-UID macOS experiment in evidence/s001-fence-experiment.json observed EACCES for late legacy writeFile and unchanged managed content after old-fd write. This verifies only this host experiment; target filesystem proof and old-PID exit remain runtime adoption gates.

```
interface AdoptionState { registryId: string; generation: string; fence: 'unmanaged'|'adopting'|'managed-readonly'|'recovery-required'; snapshotDigest: string }
```

**Call sites:**
- `src/daemon/db/config.ts`
- `src/daemon/db-rpc.ts`
- `src/daemon/lifecycle.ts`

## 4. Diagrams

- [ER model](docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S001/er-model.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | Runtime protocol validation, safe descriptors/DTOs and legacy success projections. No client manager wiring. |
| `sc2` | implements | Saved create/update, tickets/receipts/recovery and activation-only retry; provide removal persistence/barrier primitives to S004 without implementing its UI or session discard. |
| `sc3` | implements | Validated server request context, canonical scope-local saved resolution, tracked full-use leases and future overlay extension. S003 later owns capability/session storage. |
| `sc8` | implements | Memory-only file conversion and private DuckDB policy/lifecycle; saved cache isolation. S002 owns worker orchestration; S003 owns binding resources to sessions. |

## 6. Error paths

**Error cases**

- **Registry read/parse failure** (recoverable)
  - Detection: Read returns non-ENOENT error or parser/shape validator rejects; adopted root without expected envelope/generation is drift.
  - Response: Reject registry-unreadable or recovery-required before ticket effects, keychain reads/writes or JSON replacement; retain exact live bytes.
  - User impact: Saved editing is unavailable until repaired; never display empty.
- **Duplicate create, stale/deleted update or active lease** (recoverable)
  - Detection: Serialized gate compares IDs and opaque expected revision and checks active revision-pinned leases before staging.
  - Response: Reject duplicate-id/conflict/busy; no secret generation or registry write.
  - User impact: Draft remains available to future UI; refresh/retry after active use completes.
- **Secret staging failure or crash** (recoverable)
  - Detection: Keychain operation rejects or recovery sees a prepared record without matching committed receipt.
  - Response: Discard only owned unreferenced staging; if cleanup fails, retain recovery metadata and block new writes. Never remove currently referenced generations.
  - User impact: Existing effective credentials remain usable; explicit recovery guidance.
- **Rename/fsync uncertainty or lost response** (recoverable)
  - Detection: Writer cannot establish durable completion, or client requests status after missing reply; inspect canonical generation/receipt and preparation record.
  - Response: Return reconciliation-required until commit truth is established. Same valid ticket/MAC returns one committed outcome; no new-ID replay.
  - User impact: No misleading retry-as-create or false save failure.
- **Expired, wrong-target, tampered or reused ticket** (recoverable)
  - Detection: Verify signature and timestamp/target/mode against request, then compare receipt requestMac; inspect inflight/recovery state for missing receipts.
  - Response: Reject invalid-input/operation-mismatch/reconciliation-required without any config or credential effect.
  - User impact: Client must reconcile or obtain a new intended operation, never replay a stale operation blindly.
- **Activation or old-reference cleanup fails after commit** (recoverable)
  - Detection: Activation driver error or cleanup of a proven obsolete owned reference rejects after the receipt is durable.
  - Response: Return committed with activation failed and/or credentialCleanup pending; retry only that phase using committed revision/operation ID.
  - User impact: Saved truth is preserved; source may be unavailable until activation succeeds.
- **Legacy writer or manual drift during adoption/managed mode** (recoverable)
  - Detection: Maintenance cannot prove prior daemon stopped, filesystem fence proof fails, expected mode/inode/envelope/generation changes, or old code attempts writeFile.
  - Response: Leave management disabled before adoption; post-adoption drift is recovery-required with no automatic replay. Actual legacy writeFile after read-only commit must fail EACCES. Arbitrary owner chmod/rename is unsupported and prompts stopped-daemon recovery.
  - User impact: No claim of online coexistence with uncooperative arbitrary writers; saved-read degradation is visible.
- **Memory-only converter/query would persist, spill, install or exceed budget** (recoverable)
  - Detection: Policy-specific resource opens only safe row-source readers and private DB; deny disk-output routes, inspect extension availability and track decoded batch bytes. Validate framing/ZIP actual expansion and per-decoder retained-state admission before bulk allocation; no readFile-all/full Workbook fallback.
  - Response: Abort with unsupported-temporary/resource-limit, release iterators/tables/DB; no destination-path fallback, no row truncation.
  - User impact: User may choose an explicitly saved connection or smaller source; temporary config/data paths never silently persist.
- **Driver profile or legacy family cannot be safely edited** (recoverable)
  - Detection: Descriptor-set consistency check and profile validator cannot classify requested secret field or supported legacy shape.
  - Response: Reject unsafe mutation before persistence; safe redacted read and explicit compatibility warning remain; preserve pinned family.
  - User impact: No silent family normalization or secret disclosure.
- **Untracked driver consumer at feature enablement** (recoverable)
  - Detection: Static import/alias/factory inventory and behavioral lease probes find a production route not classified as metadata-only, tracked-use or private bounded probe.
  - Response: Keep v2 mutation/temporary/removal feature disabled until inventory and tests cover it.
  - User impact: No premature busy-use safety claim; existing legacy saved-only read behavior remains.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Missing unmanaged registry | Valid empty internal read; create only after registered-root checks and safe adoption. Missing adopted registry is recovery, not empty. |
| Unregistered directory or nested manifest saved-only analysis | Use its own canonical lookupRoot; never redirect to containing repo. Do not grant management rights or overlay access. |
| Pinned family differs from registered driver | Preserve saved effective family and warning; never silently normalize on read/edit/activation/rollback. New creates derive family. |
| Identical ticket/request replay during first operation | Join one inflight result; one revision/receipt and one credential generation; same ID with changed payload rejects. |
| Successful commit with client list refresh failure | Client retries only the safe list read; no second mutation; returned receipt remains committed. |
| Unknown supported options and immutable ID/kind on label-only edit | Merge only allowlisted patch in daemon; retain unexposed supported options; reject ID/kind/family patch rather than changing connection identity. |
| Two roots or owner contexts use same file connection ID/name/size/mtime | No cross-root/cache execution sharing; source content identity and revision distinguish saved data, memory-only instances are private. |
| Old process held a writable descriptor before inode replacement | Maintenance stops known old daemons first; fault test deliberately retaining an old fd demonstrates writes target detached inode, not new managed file. |

**Invariants to preserve**

- Existing ConnectionConfig records, explicit family warnings and per-root JSON location remain readable; only management metadata is additive. [[c2]]
- Saved-only data scope keeps its own-directory pool lookup, including nested manifest and unregistered directories; management eligibility remains a separate gate. [[c3]]
- Existing driver decoding/normalization results remain equivalent in saved mode; memory-only execution changes storage/lifecycle, never silently drops rows or lowers precision. [[c2]]
- Existing method names and legacy success projections remain behind invariant-enforcing adapters; no direct REST LLM calls or client DB access is introduced. [[c1]]

## 7. Test strategy

**Test framework:** `Node.js built-in node:test and node:assert/strict, TypeScript via node --import tsx --test (same *.test.ts layout as existing db tests); no generic db test discovery result is claimed.`

**Test levels**

- **unit** — Validate deterministic trust-boundary DTOs, patch merging, metadata/ticket and ownership rules without network services.
  - Subjects: `CM-S1-A: per-driver profile matrix covers every listRegisteredKinds entry and preserves unexposed supported config.`, `CM-S1-B: create/update identity/revision/duplicate/busy validation occurs before secret or writer ports.`, `CM-S1-C: Keep/Replace/Clear, pinned-family preservation, request HMAC/signature/expiry and exact response sanitization.`, `CM-S1-P: create/edit materialization and safe read followed by cancel/abandon before mutate leave registry bytes, revision/receipt map and every keychain value unchanged; no writer or keychain-write call. This tests the foundation boundary, not S005 UI.`
  - Fixtures: `Synthetic canonical registry documents, fake keychain, deterministic UUID/clock/signing key and driver descriptors; no real credentials.`
- **integration** — Prove commit/recovery, old-writer fence and actual file-execution lifecycle at process/filesystem boundaries.
  - Subjects: `CM-S1-D: same-repo concurrent mutations/replays, separate-root independence and deleted-ID revision reuse refusal.`, `CM-S1-E: crash/failure injection before/after preparation sync, keychain stage, temp sync/chmod, rename, parent sync and obsolete-ref cleanup; restart/reconcile to exact committed truth.`, `CM-S1-F: POSIX same-UID old writeFile recipe attempts overwrite AFTER the new digest check and read-only commit; expect EACCES and preserved management envelope. Also old pre-opened-fd writes only detached inode. Failed proof/privileged process/unsupported filesystem must disable adoption.`, `CM-S1-G: reject post-adoption chmod/rename/envelope drift; no automatic replay of missing receipt after drift; maintenance requires old identified PID gone.`, `CM-S1-H: native and converted fixtures exercise private DuckDB memory-only mode; watch allowed filesystem roots/logs and inspect cache/temp directories for zero sidecar/spill/config/path leakage; close/partial failure releases all owned resources.`, `CM-S1-I: two roots/owners same ID/file name/size/mtime with different content return correct complete rows; saved cache freshness verifies content/source/options; converted values match saved normalization, not a lossy sample.`, `CM-S1-Q: successful commit with failed activation then activation-only retry preserves exact config bytes, revision, receipt and credential generation; writer/keychain-stage call count remains zero during retry.`, `CM-S1-R: successful commit followed by injected safe-list/refresh failure retries only list; assert no mutation request, new ticket, writer call, credential stage, revision bump or receipt duplication.`, `CM-S1-S: instrument decoder admission for oversized BSON headers/documents, Avro expansion blocks, giant fixed-width records and XLSX ZIP/shared-string expansion; abort before retaining an over-budget unit, then prove streams, inflater/parser state, tables and DB are cleaned.`, `CM-S1-T: every DuckDBFileDriver query path uses its owned FileExecutionResource, readerPath cannot invoke ensureCached in memory-only mode, close disposes the resource and private initialization never calls INSTALL. Saved-cache callers use full root/revision/source/options identity.`, `CM-S1-U: through BOTH legacy saveConnectionRpc and v2 mutation dispatch, attempt a save against (1) malformed JSON, (2) invalid registry shape, (3) injected non-ENOENT EACCES/EPERM/EIO read failures. Snapshot exact registry bytes and all fake keychain values first; assert byte/value equality after rejection, zero secret-staging calls, zero writer/rename calls and a non-empty sanitized registry-unreadable error rather than []/success. Include a replacement-password draft to prove extraction cannot occur before the failed read. ENOENT is a separate valid-unmanaged-empty control, never conflated with these failures.`, `CM-S1-V: measure.ts timeout/cancellation while underlying reachAndList remains pending keeps its one shared lease and update/remove busy; late settle/reject releases once and clears pendingListings. Injected exploration aliases and db async iterators cannot release early or leak a raw driver.`, `CM-S1-W: saved versus memory-only full typed schema/nullability/value parity for Avro, BSON dates/large numeric normalization and XLSX worksheet target/slug selection; empty/all-null schema, zero-row _empty sheet, incompatible union and unknown-target behavior; target-specific schema cache never crosses sheets.`
  - Fixtures: `Temporary registered roots and nested unregistered/manifest fixtures; synthetic crash worker with fake keychain adapter; real same-UID legacy writer child on supported POSIX host.`, `CSV/TSV/JSON/JSONL/NDJSON/Parquet/Arrow/Feather plus Avro/BSON/fixed-width/XLSX synthetic fixtures including null/nested/date/large-number cases; no production data.`
- **contract** — Check backward compatibility and prohibit lease bypass across all found production consumers.
  - Subjects: `CM-S1-J: legacy success shapes versus v2 structured errors; malformed requests, unknown ticket fields, wrong root/target and no stored-secret return.`, `CM-S1-K: run existing own-directory data runtime cases and pinned-family config tests without redirecting roots or normalizing records.`, `CM-S1-L: static TypeScript import/alias/factory/acquire inventory with zero unclassified production sites; each classified use has metadata-only, full-use lease or bounded-private-probe rationale.`, `CM-S1-M: full-use lease spans asynchronous iteration and nested calls; update barrier rejects busy; release-on-error and cancellation; no idle close while leased. Session overlay stub is injectable but no S003 store implemented.`
  - Fixtures: `Actual legacy reply fixtures; proposed v2 schemas; migration-inventory allowlist checked against production AST/source paths; fake resolver extension.`
- **smoke** — Demonstrate shared foundation without implementing adjacent stories' UI/session/test-worker flows.
  - Subjects: `CM-S1-N: adopt a registered fixture root, create, safe read, label update, activation failure, lost response/restart/status and one same-ticket replay; inspect canonical registry and fake keychain generations.`, `CM-S1-O: start on a managed read-only registry and refuse unsafe downgrade/direct legacy write; older clients can use safe adapter projections through new service.`
  - Fixtures: `Isolated daemon/socket and test-owned root; no writes to developer's real registry/keychain.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `CM-S1-A`, `CM-S1-C`, `CM-S1-J`, `CM-S1-K`, `CM-S1-N`, `CM-S1-P` |
| `ac2` | `CM-S1-B`, `CM-S1-D`, `CM-S1-E`, `CM-S1-F`, `CM-S1-G`, `CM-S1-L`, `CM-S1-M`, `CM-S1-U` |
| `ac3` | `CM-S1-C`, `CM-S1-E`, `CM-S1-J`, `CM-S1-N`, `CM-S1-O`, `CM-S1-Q`, `CM-S1-R` |

## 8. Migration

**State before:** Current signatures and writer behavior are grounded by the S001 analysis bundle [[c2]] and direct source anchors: src/daemon/db/config.ts writes canonical JSON with unconditional writeFile; src/daemon/db-rpc.ts upserts by ID and uses fixed keychain refs; src/daemon/db/pool-cache.ts shares repo pools; file converters write destination paths. No management envelope, signed ticket, physical writer fence or full-use lease requirement exists yet.

**State after:** The same canonical JSON contains unchanged connection records plus a v2 envelope/revisions/receipts, with active credentials on immutable generation refs. Every managed inode is owner-read-only and changed only through the new serialized atomic writer. Saved-only directory reads and pinned family remain compatible; sc1/sc2/sc3/sc8 are available to later stories, whose UI/session/worker orchestration is not enabled by this migration alone.

**Zero downtime:** no — **Data rewrite:** yes

**Steps**

1. Keep connections.managementV2 disabled. Capture the actual source/alias/driver-use inventory and descriptor coverage, verify all required native/converted memory-only fixtures and supported-filesystem fence proof. Do not migrate any developer's real root during tests. Stop the managed old daemon using existing safe lifecycle controls and verify its identified PID exited; refuse adoption if stop cannot be established. — ↩ rollbackable
2. Acquire a new-service owner lease for the canonical registered root; reject live competing new-service owner and verify stale lease identity before reclaim. Read and validate the quiesced registry without treating errors as empty. Create protected pre-adoption registry snapshot and keychain rollback-generation copies with a secret-free manifest. If preflight classification finds unprofiled possible secrets, stop before enabling writes; do not rewrite unknown fields. — ↩ rollbackable
3. Copy currently referenced legacy secrets to immutable live generation refs without overwriting old refs. Prepare one adopted JSON document with registry ID/generation, preserved unknown fields and initial non-reused entry revisions. Replace the live file atomically with a synced 0400 inode in the existing private root directory, sync its parent and verify the same-UID legacy writer cannot overwrite the new inode. A held pre-replacement descriptor must write only its detached inode. On unsupported permission semantics or a privileged daemon, leave v2 disabled and restore quiesced baseline through the recovery procedure. — ↩ rollbackable
4. Recover pending preparation metadata before making mutation routes available. Verify generation/mode/metadata, signing/HMAC keys and journal ownership; refuse adoption drift rather than recreating an empty envelope. Route old methods through safe service projections, keeping unsafe direct writers fenced. Require zero unclassified production lease/factory/metadata paths and passing regression suites before advertising v2 mutation features. — ↩ rollbackable _(needs: `connections.managementV2`)_
5. For explicit downgrade, stop/drain the new daemon and all tracked leases; never chmod a live managed file writable online. Reconcile committed operations and pending credential cleanup first. Restore a chosen consistent registry snapshot and its matching keychain values from rollback generations only after showing which newer committed changes that snapshot would omit. Preserve receipts/recovery evidence in a protected export for manual unknown-outcome reconciliation; old binaries cannot promise v2 replay. Restart the selected old daemon only after the stopped migration completes. — ✕ non-rollbackable

**Backward compat:** Legacy method names and success projections remain, but unsafe writes receive explicit errors rather than corrupting metadata. Old clients connecting to the new daemon use those adapters. Old daemons writing directly cannot modify the adopted read-only inode through their existing writeFile recipe; arbitrary chmod/rename writers remain unsupported and detected as drift. Saved-only unregistered/nested directory reads remain at their scope-local roots and are not silently adopted. Preserve pinned family and unknown supported config. New file policy is internal and versioned; no UI/session contract from adjacent stories is implemented.

## 9. Alternatives considered

### 9.1 a1: Top-level management envelope with thin legacy projections — **CHOSEN**

Preserve ConnectionConfig records and add one versioned metadata envelope plus a serialized application-service API.

Keep connections[] in its existing form. Add a top-level management envelope containing format version, registry generation, connection revisions and ticketed receipts; build safe editable DTOs from driver profiles and merge patches server-side. Shared leases and file-execution policies are foundational APIs with no UI or session-store ownership.

The registry write port atomically replaces an owner-read-only inode, while a maintenance handoff and generation-specific keychain refs fence the actual legacy writeFile/fixed-secret pattern. Recovery journals contain preparation metadata only. Existing method projections adapt to the same service; arbitrary manual replacement is an unsupported drift condition that disables mutation rather than an alleged lock guarantee.

### 9.2 a2: Per-entry management metadata with aggregate operation index

Attach revision and lifecycle metadata to each connection record and retain a separate top-level receipt index.

Extend each connection record with a namespaced management subrecord while storing operation receipts at document level. Safe DTOs and server-side patch merging still preserve legacy fields; atomic commits and immutable keychain generations follow the approved HLD.

Leases and file execution remain shared S001 services. The same maintenance handoff and physical write fence are necessary because old serializers can drop both entry and top-level metadata; distributing metadata does not remove that risk.

**Rejected because:** Adds per-entry management data in addition to an aggregate index without eliminating coordination; a1 meets all criteria with unchanged driver records.

## 10. References

- **[[c1]]** `prior-artifact` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/HLD.md`
- **[[c2]]** `analyze-bundle` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/evidence/s001-context.json`
- **[[c3]]** `code` `src/analyze/runtimes/data/_shared.ts:53`
- **[[c4]]** `code` `src/daemon/db/config.ts:148`
- **[[c5]]** `code` `src/daemon/db-rpc.ts:131`
- **[[c6]]** `doc` `docs/connection-management-prd.html`
- **[[c7]]** `code` `src/daemon/db/drivers/duckdb-file.ts:329`
- **[[c8]]** `code` `src/daemon/db/converter-cache.ts:64`
- **[[c9]]** `code` `src/daemon/db/duckdb-pool.ts:71`
- **[[c10]]** `doc` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/evidence/s001-fence-experiment.json`
- **[[c11]]** `code` `src/cli/services/daemon.ts:169`

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 2 could not be verified · 9 hold** · template `design-spec` · model `cli-codex:gpt-6-astra` · reviewed 2026-10-21T09:04:13.223Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| change-sites | Driver profiles have a sufficiently specified field classification to cover every supported configuration without exposing secrets. | The registry currently exposes only kind/family pairs, not public-field schemas or secret classifications. DuckDBFileDriver additionally consumes top-level recursive/partitioning fields and converter options. The LLD provides a generic DriverProfile shape and a future coverage test, but no per-kind classification matrix to verify against these reads. Analyzer planning failed with shaper-llm-unavailable caused by an invalid response schema; direct source inspection cannot supply the missing design decisions. [files: src/daemon/db/registry.ts, src/shared/db-driver.ts, src/daemon/db/drivers/duckdb-file.ts, src/daemon/db-rpc.ts] | Add a source-backed per-kind field matrix specifying public fields, credential slots, retained-only fields and rejected legacy shapes before implementing projection/materialization. |
| error-paths | The deployment filesystem will enforce the proposed legacy-writer fence. | The recorded experiment reports sameUid=true, platform=darwin, legacyWriteError=EACCES and detachedFdDidNotChangeManagedFile=true, explicitly limited to one temporary directory. The actual legacy writer uses writeFile, matching the experiment's stated target. No target-filesystem adoption proof was available or executed in this read-only review. The LLD correctly treats that proof and old-PID exit as runtime prerequisites. [files: docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/evidence/s001-fence-experiment.json, src/daemon/db/config.ts, src/cli/services/daemon.ts] | Keep adoption disabled until the actual target-filesystem proof and identified old-process exit checks succeed. |

<!-- insrc:artifact LLD-484fcef7efaf229e-s2 -->

# LLD: E20261024484fcef7:S002

## Summary

**Epic:** `manage-saved-temporary-data-connections`
**HLD base run:** `wf-1792569414548-dvzndd`
**HLD effective hash:** `dc1a3f91a768...`

Run each connection test in a disposable child process, using the same effective draft and credential rules as Save. The daemon enforces a ten-second deadline, cancels obsolete requests and returns only a safe reachability result after worker cleanup. This story supplies the backend contract; form layout and client stale-result handling remain S005.

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

**Rollout phase:** B — tests and temporary scope
**Owns:** `sc4` (Transient draft test contract)
**Consumes:** `sc1` (Connection management protocol and driver descriptors), `sc2` (Revision-checked mutation and recovery outcomes), `sc3` (Validated connection access context and driver leases), `sc8` (Memory-only file execution and conversion policy)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Safe saved-config read/patch, canonical repo validation, driver profiles, registry metadata/receipts and crash recovery, immutable secret generation staging, compatibility adapters and lease accounting foundation. Does not own temporary storage or rich manager layout. Preserve saved-only scope-local lookup and legacy pinned-family values; signed operation tickets make expiry/replay decidable after receipt pruning. Own the shared memory-only conversion/probe driver foundation, converter-cache policy/identity changes and private DuckDB lifecycle (sc8), completed before the S002/S003 branches. — owns `sc1`, `sc2`, `sc3`, `sc8`
- `s3`: Session open/resume/heartbeat/end, memory-only temporary overlays and receipts, trusted execution-context propagation through analyzer/tool/MCP call paths, expiry and saved/temporary collision rules. Bind the S001-owned sc8 file execution policy to session identity and expiry; S001 owns conversion, cache-policy isolation and private DuckDB lifecycle. Every native/converted kind uses that foundation rather than a branch-local converter. — owns `sc5`
- `s4`: Removal coordination for both scopes, busy/revision enforcement, confirmation state, postcommit credential cleanup retry and operation-status recovery. Never invokes source data deletion. — owns `sc6`
- `s5`: Settings contributions and shared command routing, themed editor/forms, filters, dirty guards, stale-test suppression and truthful feedback in extension and external IDE. HLD has inspected the external pane, actions, service, mirrored types and Settings registrations; S005 implements the recorded plan and validates its mirrored contract before integration acceptance. — owns `sc7`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `DraftTestRequest`

```typescript
interface DraftTestRequest { requestId: string; draftRevision: number; key: ConnectionKey; expectedRevision?: string | undefined; publicPatch: Readonly<Record<string, unknown>>; credentials: Readonly<Record<string, CredentialPatch>> }
```

**Parameters:**
- `request: DraftTestRequest` — Strict db.connections.v2.test payload bound to trusted socket/epoch context.

**Returns:** `DraftTestResult | { status: 'rejected'; code: ManagementErrorCode; message: string }` — Reachability only, never schema completeness; admission errors use existing safe management projection.

**Errors:**
- `invalid-input` when Unknown fields, malformed identity, invalid draft, duplicate pending request.
- `conflict` when expectedRevision mismatches selected owned snapshot.
- `upgrade-required` when Uninstalled/release-disabled foundation or temporary-edit resolver unavailable.
- `busy` when One active per transport or global four-worker cap, including workers being reaped.

**Preconditions:**
- RequestId UUID, nonnegative safe integer draftRevision, strict total serialized input cap256KiB, canonical registered root matched to trusted access.
- Start monotonic deadline before asynchronous root/read/credential materialization; late preparation may not spawn after terminal state.
- No expectedRevision means create; existing target rejects duplicate-id. expectedRevision means edit owned saved snapshot; not-found/conflict fail before secrets/spawn.
- Use materializeDraft unchanged with readonly owner-aware credential port; no signing tickets, receipts, secret writes, pool activation or cache writes.
- Temporary creates with supplied fields require registered root; temporary edits require injected S003 snapshot resolver and fail upgrade-required until installed.

**Postconditions:**
- Result echoes requestId/draftRevision/canonical root/server epoch, status reachable|failed|timeout|canceled, monotonic tookMs and fixed optional safeMessage.
- Save revalidates independently; test success grants no authority or guarantee.
- Parent validates child message shape and nonce/request correlation, ignores unknown/late/duplicate messages. raw worker error never forwarded.

### 2.2 `TestCancellation`

```typescript
interface TestCancellation { requestId: string }
```

**Parameters:**
- `request: TestCancellation` — db.connections.v2.cancelTest; authenticated by same trusted transport identity and daemon epoch.

**Returns:** `{ canceled: boolean }` — True only for own pending request; false for unknown, completed or other-owner requests without disclosure.

**Errors:**
- `invalid-input` when Malformed/unknown fields.

**Preconditions:**
- No caller supplied owner/PID/epoch is trusted.

**Postconditions:**
- Cancellation and disconnect mark terminal once; no late success can replace it.
- One parent operation owns zero or one child; no reusable workers. Global limit4, one outstanding per transport; keep capacity until actual child close. Drop request records/timers/listeners and plaintext references after exit.
- At deadline/cancel send cancel over private IPC, allow250ms graceful cleanup then SIGKILL owned child and await close; result timeout/canceled may return at10s while capped reaper owns capacity until close. A stuck reap cannot enable unbounded retries.
- Normal success withheld until child disposes driver/resource and exits. Failed/hung close leads timeout, not reachable.

### 2.3 `testConnectionRpc`

```typescript
testConnectionRpc(params: { readonly repoRoot?: unknown; readonly config?: unknown }, context?: TrustedRpcContext): Promise<TestConnectionResult | { error: string }>
```

**Parameters:**
- `params: {repoRoot?:unknown;config?:unknown}` — Existing legacy test adapter.
- `context: TrustedRpcContext | undefined` _(optional)_ — Server-owned identity, epoch and unary AbortSignal; legacy callers without trusted context fail closed for supervised runtime calls.

**Returns:** `TestConnectionResult | {error:string}` — Preserve successful legacy fields; safely map worker failures and timeout/canceled.

**Errors:**
- `sanitized legacy error` when Existing legacy admission failures or unavailable test service.

**Preconditions:**
- Retain legacy saved-only scope-local lookup and read-only materialization behavior. Route actual driver work to same bounded supervisor; no new management write authority.

**Postconditions:**
- No raw nonfile exception return; legacy calls share global capacity/deadline and cleanup semantics.
- No new UI/session store/removal implementation.

## 3. Data model changes

### 3.1 `DraftTestRequest / DraftTestResult / TestCancellation` — new

Implement sc4 in shared types/wire validators. Extend method catalog by test/cancelTest and classify both main-daemon routes. Result identity is correlation, not authority; immutable snapshot is request-local memory, never persisted.

**Call sites:**
- `src/shared/connection-management.ts`
- `src/daemon/handler-runtime.ts`
- `src/daemon/connection-management-rpc.ts`

### 3.2 `PendingProbe` — new

Daemon transport identity -> 0..1 pending operation; operation ->0..1 owned child, plus bounded reaping state. operation owns timer, IPC nonce, abort cleanup and ephemeral effective config. Child ->exactly1 disposable driver ->0..1 private file resource. No parent pool registration. Future S003 only supplies readonly snapshot callback. Proposed new supervisor src/daemon/db/draft-test.ts and isolated entry src/bin/insrc-connection-test.ts; private messages validate config and return fixed codes only. Fork inherits no credentials or INSRC logging configuration: minimal platform/runtime environment, ignored stdio and silent worker logger initialized before driver imports; no argv/env config, runfiles, shell, keychain/registry/graph imports or IPC daemon access. Worker uses imported factory and sc8 memory-only policy. Source/compiled entry resolution tested; startup crash and broken IPC safely fail. File factories disable persistent DuckDB install/cache/spill per sc8. Construction alone is insufficient. Await the explicit registered-kind probeReachability operation described below; never return schema completeness. DynamoDB is an explicit exception to config-only IPC: parent-prepared runtimeAuth travels only in private worker start message as detailed below; worker still inherits no credential environment.

**Call sites:**
- `src/daemon/db-rpc.ts`
- `src/daemon/db/file-execution.ts`
- `src/daemon/db/driver-profiles.ts`

### 3.3 `Explicit awaited reachability probes (S002-internal contract)` — new

Factory construction NEVER implies reachable. Add S002-only DraftProbe interface { probeReachability(): Promise<void>; close(): Promise<void> } in proposed src/daemon/db/draft-probe.ts. Concrete driver classes implement this extra internal method without changing shared BaseDriver, registry factory signatures or sc1/sc8. Worker uses exact registered-kind allowlist and checks method presence; absence fails unsupported, never reachable. Driver probes: postgres/cockroachdb SELECT 1 through pg; mysql/mariadb pooled SELECT 1; sqlite read-only open then SELECT 1 (missing file must not be created); mssql SELECT 1; oracle SELECT 1 FROM DUAL; clickhouse SELECT 1; redis/valkey/keydb explicitly connect lazy client then PING; mongodb admin ping; cassandra client connect then SELECT release_version FROM system.local; nats connected flush; dynamodb authenticated ListTables Limit1 without exposing names; etcd authenticated bounded range limit1; memcached version. No writes or schema enumeration. File kinds csv/tsv/json/jsonl/ndjson/parquet/arrow/feather/avro/bson/fixed-width/xlsx explicitly call private readerPath under memory-only policy and issue a bounded SELECT on the selected local target; parse/load errors fail; empty valid input can succeed; xlsx must select real sheet, not fake fallback. No completeness claim. Add methods at src/daemon/db/drivers/pg.ts, mysql.ts, sqlite.ts, mssql.ts, oracle.ts, clickhouse.ts, redis.ts, mongodb.ts, cassandra.ts, nats.ts, dynamodb.ts, etcd.ts, memcached.ts, duckdb-file.ts (each name resolved under src/daemon/db/drivers/). Add exact29-kind coverage assertion, actual unreachable/bad-auth/malformed-file negatives and lazy factory success/probe failure tests. S002 owns these test-specific operations; no sc8 converter redesign.

**Call sites:**
- `src/shared/db-driver.ts`
- `src/daemon/db-rpc.ts`

### 3.4 `Worker-safe shared logger bootstrap` — invariant-change

src/shared/logger.ts must remove top-level mkdirSync and defer mkdir/config reads/transports to non-worker logger creation. Add explicit internal probe-worker mode selected via fixed nonsecret bootstrap environment before first module import; worker fork overwrites INSRC_MODE to probe-worker, filters all inherited logger/Node injection variables, and uses dynamic driver imports only after selecting mode. In probe-worker getRoot returns disabled pino with in-memory no-op destination; it must never call resolveLevel/read config, mkdir, pino transport, pino-roll or stdout/stderr sink. Guard top-level path imports for side effects. Existing daemon/cli/mcp modes preserve current lazy creation and transport behavior. Verify fresh compiled and tsx processes, isolated HOME/TMP and actual PATHS.logDir, spies on fs mkdir/read config and recursive filesystem watches plus path/password canaries on startup/init/error/close; ignoring stdio alone is not evidence.

**Call sites:**
- `src/daemon/db-rpc.ts`

### 3.5 `Unary transport lifetime` — field-add

Add readonly signal?: AbortSignal | undefined to server-created TrustedRpcContext in src/daemon/request-context.ts. src/daemon/server.ts directDispatch creates per-unary-request AbortController and passes the signal with trusted identity/epoch; returns abort callback. IMPORTANT: cancellation MUST NOT suppress internal completion delivery. After unary handler settles directDispatch emits exactly one internal reply (fixed failure projection when needed), even if signal aborted; IpcServer alone discards socket delivery on closed/canceled request using its existing settled/socket guard. This supersedes the earlier instruction to suppress directDispatch delivery. Thus wrappers can observe handler completion after disconnect. src/daemon/threads/maintenance-entry.ts holdingForward keeps the unary maintenance hold until internal reply (not cancel), uses idempotent release, drops only external delivery after cancellation, and handles cancel-before-admission without starting handler. src/daemon/threads/router.ts uses once-only ended callback for unary reply/error, not unary cancel; preserves internal completion delivery to maintenance wrapper while suppressing client writes at outer server. Keep existing stream cancellation behavior unchanged and once-only. Pending routed unary handlers not owned by this story retain current completion semantics; test/cancel/legacy methods are classified main-daemon in src/daemon/threads/method-class.ts. src/daemon/handler-runtime.ts forwards trusted context to optional second testConnectionRpc parameter and v2 supervisor, never serializes AbortSignal into worker threads. A handler ignoring optional signal still emits completion and cannot strand holds/activity. src/daemon/index.ts stops supervisor admission and drains owned child/preparation work during shutdown; child grace250ms then SIGKILL only owned PIDs. Tests use real IPC disconnect with maintenance locking and router onRequest activity enabled: cancel during preparation/init/close, completion after disconnect, error, unknown method, and pre-admission cancel must return counters/holds exactly once to baseline; no socket late reply and no early maintenance admission while actual handler work is running. Supervisor response terminal state and reaper capacity remain distinct; parent-owned cleanup continues tracked after timeout, without suppressing internal reply or leaking request bookkeeping. Completion/hold release here is subject to the separate RequestLifetime drain protocol below: an internal reply alone MUST NOT release maintenance or activity when registered work remains.

**Call sites:**
- `src/daemon/handler-runtime.ts`
- `src/daemon/connection-management-rpc.ts`
- `src/daemon/db-rpc.ts`

### 3.6 `Saved owner readonly prepareDraft boundary` — new

Add SavedConnectionManagement.prepareDraft(context: ManagementRequestContext, request: Pick<DraftTestRequest, 'key' | 'expectedRevision' | 'publicPatch' | 'credentials'>, signal?: AbortSignal): Promise<EffectiveDraft> in src/daemon/db/management.ts. Under existing per-root serialized gate validate context/root, metadata-only owner/registration/recovery state through probeMetadataReady() (NOT current() or enabled()), snapshot config and revision, infer create/update, enforce existence/expectedRevision, then call shared materializeDraft with readonly owned reference reader. Never list(), apply(), pool.reload(), mutate(), stage/activate, tickets or receipts. Owner-aware reader only accepts refs enumerated from selected snapshot after revision checks; create cannot resolve arbitrary supplied refs. Hold gate through readonly credential materialization so concurrent mutation/cleanup cannot delete Keep generation while it is read; release immediately after immutable plaintext snapshot built, not for network test. Check signal after every await and before returns; hanging preparation retains bounded supervisor slot and queued aborted gate callback must not read secrets/spawn when eventually admitted. No late spawn after deadline. No raw snapshot returned to client or child beyond effective config. Tests snapshot exact registry/keychain and spy zero pool reload/staging/writers; concurrent saved update/delete cannot race Keep acquisition. Future temporary resolver uses equivalent readonly owner contract, no S003 store implementation. After shared materializeDraft, call prepareRuntimeConfig before handing config to worker; S002 supervisor resolves Dynamo runtime identity separately via readonly daemon helper, never persisted in effective config.

**Call sites:**
- `src/daemon/db/driver-profiles.ts`
- `src/daemon/connection-management-rpc.ts`

### 3.7 `Runtime path preparation shared with activation` — new

Extract resolveConfigPath and resolveAndCheckRepoPath from src/daemon/db/pool.ts into proposed src/daemon/db/runtime-config.ts as side-effect-free exported prepareRuntimeConfig(config: ConnectionConfig, canonicalRoot: string, signal?: AbortSignal): Promise<ConnectionConfig>. Both pool activation and S002 prepareDraft/legacy preparation call it after materializeDraft and before factory/IPC. Select path policy by registered kind/familyOf(kind), never pinned family. Preserve existing lexical repo-root containment and readable-path checks and schemaSource.path resolution; never cwd-relative resolution. File paths become absolute. Normalize SQLite effective path using existing path-over-url precedence from sqlite.ts: accept path, plain URL path or decoded local file URL, reject remote file URL authorities and non-file schemes; resolve relative path against canonical root, check containment/readability, put result in config.path so factory opens that exact readonly path. Never create a missing SQLite file or write normalized runtime paths back to saved JSON. Existing file/schemaSource paths follow same shared helper for activation, legacy and v2; source URI and pinned-family regression fixtures prevent divergence. Before any filesystem await validate signal; after await check again and no late IPC on timeout. Shared helper extracts existing behavior, with explicit SQLite URL normalization correction applied equally to activation and tests rather than a probe-only interpretation. No cache/converter redesign. Test daemon cwd different from repository with a decoy same-name file, relative/absolute in-root file and SQLite paths and file URLs, outside-root ../ and absolute inputs, schemaSource.path, missing/unreadable files, percent encoding and pinned family conflicts. Assert selected absolute file and contents match actual activation, and saved bytes unchanged. No implicit permission widening or acceptance of out-of-root paths.

**Call sites:**
- `src/daemon/db/pool.ts`
- `src/daemon/db-rpc.ts`
- `src/daemon/db/driver-profiles.ts`
- `src/daemon/db/drivers/sqlite.ts`

### 3.8 `DynamoDB authentication snapshot for private worker IPC` — new

Activation and probes share a readonly resolveDynamoIdentity(config, signal) helper in proposed src/daemon/db/dynamo-identity.ts; src/daemon/db/drivers/dynamodb.ts uses the same provider selection. Explicit options.profile uses fromIni({profile}) exactly as activation today; otherwise use installed fromNodeProviderChain() with daemon process credential environment/default-chain context. Resolve once in parent during bounded preparation, preserving accessKeyId, secretAccessKey, optional sessionToken and expiration; never fall back to another identity after a selected provider fails, and never ask stripped worker environment/profile files to resolve credentials again. The same helper builds activation credentials provider so provider selection is single-sourced without storing credentials in ConnectionConfig or changing profile slots. Private WorkerStart carries optional runtimeAuth:{type:'aws-v1',accessKeyId:string,secretAccessKey:string,sessionToken?:string,expiration?:string} only for dynamodb; validate exact fields, nonempty strings/size/ISO expiration at both ends. Do not place this field on public DraftTestRequest, config/options, artifact, log, environment or command line; reject any client runtimeAuth field. In child construct DynamoDriver through explicit internal factory overload/options carrying supplied static credential identity to DynamoDBClient({credentials:...}); never registry mutation or global credentials override, no fromIni/default chain in worker. Clear parent snapshot refs after send/cancel and child refs on close. Bound provider waiting by same10s parent deadline; a late provider resolution is dropped and cannot fork/send; keep preparation slots bounded until provider drains. Existing provider process/file reads belong to parent identity resolution, not worker; no draft/config/keychain writes, SDK caches must not be introduced. Avoid new arbitrary subprocess invocation, selection exactly matches existing activated provider. Readonly current AWS profile/SSO chain resolution may fail safely (expired/interactive auth required) but never silently substitute another principal. Test environment-only keys plus session token, explicitly selected profile despite env credentials, default chain selected profile, absent/expired credentials, assumed-role/session expiration, provider rejection/deadline and malformed worker auth. Compare identity at fake signed request boundary with activation under same resolver; actual local DynamoDB HTTP fixture checks signing access key and session token without sending credentials externally. Snapshot worker environment/argv/log/files for canaries; explicit runtimeAuth missing in Dynamo worker fails rather than invoking a credential fallback.

**Call sites:**
- `src/daemon/db/drivers/dynamodb.ts`
- `src/daemon/db/driver-profiles.ts`
- `src/daemon/db-rpc.ts`

### 3.9 `Metadata-only draft admission before credential readiness` — new

This supersedes prepareDraft's earlier instruction to call current() first. Do NOT call current(), enabled(), service.list(), pool reload, tickets.assertAvailable or generations.assertReady before selected existence/revision admission: production enabled reads every connection credential. Refactor src/daemon/db/management-startup.ts to expose a NEW internal probeMetadataReady():Promise<RegistrySnapshot> callback in SavedManagementPorts, alongside unchanged enabled() for existing mutation/list behavior. probeMetadataReady checks owner lease, protected currentStore.inspect(), already-authenticated state's current() inode/digest, parent mode/inode, signed checkpoint committed anchor, running release fingerprint and canonical registration only; all are metadata reads and cached authenticated state, no signing-key or credential getKey, no recover/reconcile. At startup full enabled validation remains unchanged before service installation. prepareDraft under per-root gate validates trusted context, obtains probeMetadataReady snapshot, parses/enforces registry envelope metadata with the shared metadata validator extracted from current() without calling enabled, and selects requested ID/revision. If missing/stale/duplicate return existing sanitized code before ANY keychain call. After admission, recheck abort, validate signing authority availability if required, selected profile and generation ownership, then materialize only selected config with owned-reference reader. Never scan unrelated connection credentials in this probe-only path. Failure in metadata fence returns recovery-required/upgrade-required before secrets; missing signing key after valid admission still fails. Immutable selected snapshot held under same root gate through readonly selected credential read, runtime paths and completion; no mutation, no generation cleanup. This is an internal adapter implementing consumed sc1/sc2/sc3, not a change to public wire or weakened mutation readiness. Test through openManagedRoot's actual production callback with injected fake keystore, not always-true service fixture: reset keychain counters AFTER startup, then missing/stale/duplicate draft must issue zero getKey calls (including signing keys), zero stages/writes/spawn, while valid target reads only signing key plus selected owned credentials, never unrelated credential canary; missing key and registry/owner drift remain refused. Name management-startup.ts and management.ts explicitly as change sites.

**Call sites:**
- `src/daemon/db/management-startup.ts`
- `src/daemon/db/management.ts`

### 3.10 `Separate unary response and operation-drain lifetimes` — new

Introduce internal RequestLifetime in src/daemon/request-context.ts, created server-side in src/daemon/server.ts BEFORE forwarding unary request. API registerDrain(work:Promise<void>):void, seal():void, drained:Promise<void>; registerDrain accepts only before seal, uses all-settled work completion, never settles drained until sealed AND every registered work item settled. Expose only registerDrain on TrustedRpcContext, lifetime owned by internal RequestEnvelope; none is deserialized from client params or serialized to worker-thread wire. draft-test supervisor synchronously registers its whole operation-drain promise before first await; drain encompasses root-gate queue, pending root/keychain/AWS preparation, asynchronous spawn, child close/reap, and all cleanup/listener/timer releases, including work continuing after timeout result. Terminal response promise settles at deadline independently. directDispatch seals request lifetime in its unary handler finally and still delivers exactly one INTERNAL reply after result settles; IpcServer drops only external canceled socket delivery. holdingForward in src/daemon/threads/maintenance-entry.ts resolves its held callback only when (reply delivered internally OR pre-admission canceled) AND request.lifetime.drained settles; keep hold through timed-out hanging preparation and through reaping. No early release on cancel or reply for work registered in lifetime. Router in src/daemon/threads/router.ts similarly calls once-only ended() after internal unary reply AND drained; no late socket write. For unrelated unary handlers with zero registered work drained resolves immediately at seal, preserving previous behavior. All relevant test methods remain main-daemon classified; on remote unary routes lacking a local lifetime use existing reply completion, do not serialize promises/functions. Ensure wrappers propagate the SAME lifetime object, including holdingForward's queued entry; if cancellation before forward admission, seal empty lifetime and release once. If synchronous handler throws, seal and internal reply; if supervisor preparation never settles, terminal client timeout still returned but slot/maintenance hold/activity remain truthfully held until drain; never fabricate cleanup. This intentionally prevents compaction/restart from racing unresolved store access and caps leaks to four admitted operations. Shutdown cancels operations, reaps children and waits registered drains; a still-unresolved noncancelable preparation is reported pending rather than releasing live resource ownership. Real-lock integration test: install production server/router/holdingForward with maintenance lock enabled, hold fake credential preparation deferred, reach real or injected deadline and receive timeout, attempt exclusive maintenance and assert denied while pending; repeat after socket disconnect and while child ignores cancel; settle preparation/reap then assert exclusive maintenance admitted and activity/holds/listeners zero exactly once. Register-before-await, rejection, queued-cancel, reply/cancel race and ignored AbortSignal coverage mandatory.

**Call sites:**
- `src/daemon/request-context.ts`
- `src/daemon/server.ts`
- `src/daemon/threads/maintenance-entry.ts`
- `src/daemon/threads/router.ts`
- `src/shared/locks/maintenance-lock.ts`

## 4. Diagrams

- [Sequence diagram](docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S002/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Reuse strict key/profile descriptors, allowlisted errors and capability handshake; add draft-test feature only behind verified S001 gates. |
| `sc2` | consumes | Use owned revision snapshot and existing materializeDraft Keep/Replace/Clear; no mutations/receipts. |
| `sc3` | consumes | Trust server-minted transport identity; registered roots and readonly snapshot adapter; no S003 store or reconnect semantics. |
| `sc8` | consumes | Use memory-only FileExecutionPolicy and owned close exactly as S001; never add converters/cache policy. |
| `sc4` | implements | Strict request/result/cancel types and transport-bound one-shot disposable process supervisor; deadline, sanitized errors and stale correlation available to S005. |

## 6. Error paths

**Error cases**

- **Malformed, excessive or forged request** (recoverable)
  - Detection: Strict key/type/size checks and canonical registered-root/transport gate before materialization
  - Response: Fixed invalid-input or upgrade-required; no worker, no secret read
  - User impact: Correct draft or upgrade
- **Saved drift or credential unavailable** (recoverable)
  - Detection: Owned snapshot revision comparison and readonly materializeDraft error code
  - Response: Fixed conflict/not-found/registry-unreadable/secret-unavailable; no raw exception or spawn
  - User impact: Refresh draft or replace credential
- **Worker error/crash/malformed IPC** (recoverable)
  - Detection: Spawn error, child exit, disconnect or strict message validation
  - Response: Fixed failed result, terminate/reap owned child; sanitize even unknown codes
  - User impact: Retry after correcting connection
- **Deadline, cancellation or client disconnect** (recoverable)
  - Detection: Parent monotonic10s timer, matching owner cancellation or transport AbortSignal
  - Response: Single terminal timeout/canceled; suppress late preparation/results, graceful cancel250ms then SIGKILL and reap
  - User impact: Retry after cleanup capacity available
- **Native conversion cannot stay memory-only** (recoverable)
  - Detection: sc8 resource-limit/unsupported-temporary code
  - Response: Fixed actionable safeMessage without path/config
  - User impact: Use smaller input or saved connection

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Same request ID on different sockets or epoch | No cross-owner cancellation or result disclosure; parent keys identity+epoch+request. |
| Result races deadline/cancel and duplicate completion | First terminal state wins; reachable only after successful close/exit before deadline. |
| Keychain or root read hangs past deadline | Parent settles timeout; aborted operation cannot later spawn. Bound preparation capacity and keep it occupied until pending work drains. |
| Temporary create before S003 installation | Standalone fully supplied draft can probe with no session storage; Keep with no owned snapshot rejects. Temporary edit unavailable until readonly resolver installed. |
| Pinned family differs registered driver family | Use same materializeDraft preservation as Save; actual factory/file policy selected by registered kind. |

**Invariants to preserve**

- Profile materialization preserves owned credentials and read-only transient operation; analyze e1/e3 and supplemental source. [[c1]]
- File probes use S001 memory-only execution and awaited resource cleanup; analyze e1/e3. [[c2]]
- Legacy successful response shapes remain compatible; testConnectionRpc anchor in analyze e1. [[c3]]

## 7. Test strategy

**Test framework:** `node:test with node:assert/strict, *.test.ts and Node22 via tsx; meaningful actual-child integration alongside deterministic unit clocks. Relevant tests per build task, full sweep only once all S002 tasks built; no live daemon stop/adoption.`

**Test levels**

- **unit** — CM-S2-A: exact wire validators and materialization parity with Save, Keep/Replace/Clear, revision and safe outcomes.
  - Subjects: `Unknown-field/type/size rejection; request/result owner identities; pinned family; missing/foreign secret refusal; parent fixed messages for SQL/KV/file errors`
  - Fixtures: `Fake readonly keystore and snapshots; no real credential access`
- **integration** — CM-S2-A: actual disposable child probes SQL/KV/native/converted files with no draft persistence and sanitized logs.
  - Subjects: `SQL/KV loopback fixtures; native CSV/JSON/JSONL/Parquet and BSON/Avro/fixed-width/XLSX; optional Arrow explicitly reports unsupported if absent`, `Snapshot registry bytes/keychain values and watch isolated HOME/TMP/cache/log directories before/after all success/error paths`, `Capture stdout/stderr/daemon logs with credential/path canaries; worker receives config solely by IPC; no INSTALL or persistent files`
  - Fixtures: `Node22 compiled worker and tsx development worker; fake secrets; readonly local file fixtures; isolated environment; local SQL/KV fixtures, live suites explicitly labeled if unavailable`
- **integration** — CM-S2-B: deterministic race/cancel/deadline and real process forced cleanup.
  - Subjects: `10-second production deadline including hanging prepare/spawn/init/close; cancellation250ms grace then owned PID absent; retries capacity bounded`, `Duplicate clicks busy, per-owner isolation, global cap4 including reaping, reconnect epoch, root switch/form close simulation via cancel and late result identity; UI presentation remains S005`, `Child never replies, ignores cancel, sends malformed/duplicate/wrong nonce messages, exits early; same-time success/cancel deadline; transport disconnect/shutdown drain; zero child/resource/timer/listener residuals`
  - Fixtures: `Injected monotonic clock for unit races plus real child ignoring termination for smoke; only fixture PIDs may be signaled`
- **contract** — Legacy and v2 actual route compatibility and capability gates.
  - Subjects: `handler-runtime test dispatch and cancel main-daemon classification; trusted socket context; feature disabled until prerequisites verified; missing old-daemon method handshake`, `Legacy saved-only test returns existing successful fields and bounded sanitized failure; no regression to memory-only file behavior`
  - Fixtures: `Real IPC transport harness; isolated registry/keystore`
- **integration** — CM-S2-D: prove explicit probes, zero-write logger bootstrap, readonly preparation and transport lifetime.
  - Subjects: `Factory construction NEVER implies reachable. Add S002-only DraftProbe interface { probeReachability(): Promise<void>; close(): Promise<void> } in proposed src/daemon/db/draft-probe.ts. Concrete driver classes implement this extra internal method without changing shared BaseDriver, registry factory signatures or sc1/sc8. Worker uses exact registered-kind allowlist and checks method presence; absence fails unsupported, never reachable. Driver probes: postgres/cockroachdb SELECT 1 through pg; mysql/mariadb pooled SELECT 1; sqlite read-only open then SELECT 1 (missing file must not be created); mssql SELECT 1; oracle SELECT 1 FROM DUAL; clickhouse SELECT 1; redis/valkey/keydb explicitly connect lazy client then PING; mongodb admin ping; cassandra client connect then SELECT release_version FROM system.local; nats connected flush; dynamodb authenticated ListTables Limit1 without exposing names; etcd authenticated bounded range limit1; memcached version. No writes or schema enumeration. File kinds csv/tsv/json/jsonl/ndjson/parquet/arrow/feather/avro/bson/fixed-width/xlsx explicitly call private readerPath under memory-only policy and issue a bounded SELECT on the selected local target; parse/load errors fail; empty valid input can succeed; xlsx must select real sheet, not fake fallback. No completeness claim. Add methods at src/daemon/db/drivers/pg.ts, mysql.ts, sqlite.ts, mssql.ts, oracle.ts, clickhouse.ts, redis.ts, mongodb.ts, cassandra.ts, nats.ts, dynamodb.ts, etcd.ts, memcached.ts, duckdb-file.ts (each name resolved under src/daemon/db/drivers/). Add exact29-kind coverage assertion, actual unreachable/bad-auth/malformed-file negatives and lazy factory success/probe failure tests. S002 owns these test-specific operations; no sc8 converter redesign.`, `src/shared/logger.ts must remove top-level mkdirSync and defer mkdir/config reads/transports to non-worker logger creation. Add explicit internal probe-worker mode selected via fixed nonsecret bootstrap environment before first module import; worker fork overwrites INSRC_MODE to probe-worker, filters all inherited logger/Node injection variables, and uses dynamic driver imports only after selecting mode. In probe-worker getRoot returns disabled pino with in-memory no-op destination; it must never call resolveLevel/read config, mkdir, pino transport, pino-roll or stdout/stderr sink. Guard top-level path imports for side effects. Existing daemon/cli/mcp modes preserve current lazy creation and transport behavior. Verify fresh compiled and tsx processes, isolated HOME/TMP and actual PATHS.logDir, spies on fs mkdir/read config and recursive filesystem watches plus path/password canaries on startup/init/error/close; ignoring stdio alone is not evidence.`, `Add readonly signal?: AbortSignal | undefined to server-created TrustedRpcContext in src/daemon/request-context.ts. src/daemon/server.ts directDispatch creates a per-unary-request AbortController, merges signal with existing trusted identity/epoch, returns abort callback and suppresses response delivery after abort. Socket close calls registered cancel as today. Other unary handlers may ignore optional signal unchanged. src/daemon/handler-runtime.ts must pass trusted context to legacy testConnectionRpc via additive optional second parameter; v2 adapter forwards signal to supervisor. src/daemon/threads/method-class.ts classifies test/cancel/legacy db.testConnection in main daemon, never serializes signal into worker threads. Supervisor shutdown hook in src/daemon/index.ts stops admission, aborts all owned operations, sends child cancel and escalates after250ms, awaiting owned close before daemon teardown; no unrelated PIDs signaled. Real IPC disconnect tests prove child exits and no late reply; legacy and v2 share owner/capacity.`, `Add SavedConnectionManagement.prepareDraft(context: ManagementRequestContext, request: Pick<DraftTestRequest, 'key' | 'expectedRevision' | 'publicPatch' | 'credentials'>, signal?: AbortSignal): Promise<EffectiveDraft> in src/daemon/db/management.ts. Under existing per-root serialized gate validate context/root, enabled/registration/recovery state through current(), snapshot config and revision, infer create/update, enforce existence/expectedRevision, then call shared materializeDraft with readonly owned reference reader. Never list(), apply(), pool.reload(), mutate(), stage/activate, tickets or receipts. Owner-aware reader only accepts refs enumerated from selected snapshot after revision checks; create cannot resolve arbitrary supplied refs. Hold gate through readonly credential materialization so concurrent mutation/cleanup cannot delete Keep generation while it is read; release immediately after immutable plaintext snapshot built, not for network test. Check signal after every await and before returns; hanging preparation retains bounded supervisor slot and queued aborted gate callback must not read secrets/spawn when eventually admitted. No late spawn after deadline. No raw snapshot returned to client or child beyond effective config. Tests snapshot exact registry/keychain and spy zero pool reload/staging/writers; concurrent saved update/delete cannot race Keep acquisition. Future temporary resolver uses equivalent readonly owner contract, no S003 store implementation.`
  - Fixtures: `Actual lazy driver failure fixtures; compiled fresh worker; real IPC disconnect; fake keychain and pool/writer spies`
- **integration** — CM-S2-E: resolve new-cycle runtime path, cancellation bookkeeping and Dynamo identity blockers.
  - Subjects: `Extract resolveConfigPath and resolveAndCheckRepoPath from src/daemon/db/pool.ts into proposed src/daemon/db/runtime-config.ts as side-effect-free exported prepareRuntimeConfig(config: ConnectionConfig, canonicalRoot: string, signal?: AbortSignal): Promise<ConnectionConfig>. Both pool activation and S002 prepareDraft/legacy preparation call it after materializeDraft and before factory/IPC. Select path policy by registered kind/familyOf(kind), never pinned family. Preserve existing lexical repo-root containment and readable-path checks and schemaSource.path resolution; never cwd-relative resolution. File paths become absolute. Normalize SQLite effective path using existing path-over-url precedence from sqlite.ts: accept path, plain URL path or decoded local file URL, reject remote file URL authorities and non-file schemes; resolve relative path against canonical root, check containment/readability, put result in config.path so factory opens that exact readonly path. Never create a missing SQLite file or write normalized runtime paths back to saved JSON. Existing file/schemaSource paths follow same shared helper for activation, legacy and v2; source URI and pinned-family regression fixtures prevent divergence. Before any filesystem await validate signal; after await check again and no late IPC on timeout. Shared helper extracts existing behavior, with explicit SQLite URL normalization correction applied equally to activation and tests rather than a probe-only interpretation. No cache/converter redesign. Test daemon cwd different from repository with a decoy same-name file, relative/absolute in-root file and SQLite paths and file URLs, outside-root ../ and absolute inputs, schemaSource.path, missing/unreadable files, percent encoding and pinned family conflicts. Assert selected absolute file and contents match actual activation, and saved bytes unchanged. No implicit permission widening or acceptance of out-of-root paths.`, `Activation and probes share a readonly resolveDynamoIdentity(config, signal) helper in proposed src/daemon/db/dynamo-identity.ts; src/daemon/db/drivers/dynamodb.ts uses the same provider selection. Explicit options.profile uses fromIni({profile}) exactly as activation today; otherwise use installed fromNodeProviderChain() with daemon process credential environment/default-chain context. Resolve once in parent during bounded preparation, preserving accessKeyId, secretAccessKey, optional sessionToken and expiration; never fall back to another identity after a selected provider fails, and never ask stripped worker environment/profile files to resolve credentials again. The same helper builds activation credentials provider so provider selection is single-sourced without storing credentials in ConnectionConfig or changing profile slots. Private WorkerStart carries optional runtimeAuth:{type:'aws-v1',accessKeyId:string,secretAccessKey:string,sessionToken?:string,expiration?:string} only for dynamodb; validate exact fields, nonempty strings/size/ISO expiration at both ends. Do not place this field on public DraftTestRequest, config/options, artifact, log, environment or command line; reject any client runtimeAuth field. In child construct DynamoDriver through explicit internal factory overload/options carrying supplied static credential identity to DynamoDBClient({credentials:...}); never registry mutation or global credentials override, no fromIni/default chain in worker. Clear parent snapshot refs after send/cancel and child refs on close. Bound provider waiting by same10s parent deadline; a late provider resolution is dropped and cannot fork/send; keep preparation slots bounded until provider drains. Existing provider process/file reads belong to parent identity resolution, not worker; no draft/config/keychain writes, SDK caches must not be introduced. Avoid new arbitrary subprocess invocation, selection exactly matches existing activated provider. Readonly current AWS profile/SSO chain resolution may fail safely (expired/interactive auth required) but never silently substitute another principal. Test environment-only keys plus session token, explicitly selected profile despite env credentials, default chain selected profile, absent/expired credentials, assumed-role/session expiration, provider rejection/deadline and malformed worker auth. Compare identity at fake signed request boundary with activation under same resolver; actual local DynamoDB HTTP fixture checks signing access key and session token without sending credentials externally. Snapshot worker environment/argv/log/files for canaries; explicit runtimeAuth missing in Dynamo worker fails rather than invoking a credential fallback.`, `Add readonly signal?: AbortSignal | undefined to server-created TrustedRpcContext in src/daemon/request-context.ts. src/daemon/server.ts directDispatch creates per-unary-request AbortController and passes the signal with trusted identity/epoch; returns abort callback. IMPORTANT: cancellation MUST NOT suppress internal completion delivery. After unary handler settles directDispatch emits exactly one internal reply (fixed failure projection when needed), even if signal aborted; IpcServer alone discards socket delivery on closed/canceled request using its existing settled/socket guard. This supersedes the earlier instruction to suppress directDispatch delivery. Thus wrappers can observe handler completion after disconnect. src/daemon/threads/maintenance-entry.ts holdingForward keeps the unary maintenance hold until internal reply (not cancel), uses idempotent release, drops only external delivery after cancellation, and handles cancel-before-admission without starting handler. src/daemon/threads/router.ts uses once-only ended callback for unary reply/error, not unary cancel; preserves internal completion delivery to maintenance wrapper while suppressing client writes at outer server. Keep existing stream cancellation behavior unchanged and once-only. Pending routed unary handlers not owned by this story retain current completion semantics; test/cancel/legacy methods are classified main-daemon in src/daemon/threads/method-class.ts. src/daemon/handler-runtime.ts forwards trusted context to optional second testConnectionRpc parameter and v2 supervisor, never serializes AbortSignal into worker threads. A handler ignoring optional signal still emits completion and cannot strand holds/activity. src/daemon/index.ts stops supervisor admission and drains owned child/preparation work during shutdown; child grace250ms then SIGKILL only owned PIDs. Tests use real IPC disconnect with maintenance locking and router onRequest activity enabled: cancel during preparation/init/close, completion after disconnect, error, unknown method, and pre-admission cancel must return counters/holds exactly once to baseline; no socket late reply and no early maintenance admission while actual handler work is running. Supervisor response terminal state and reaper capacity remain distinct; parent-owned cleanup continues tracked after timeout, without suppressing internal reply or leaking request bookkeeping.`
  - Fixtures: `Different cwd and decoy relative files; read-only SQLite fixtures; real server/router maintenance-lock harness; local Dynamo signing fixture and injected AWS providers; fake credential store only`
- **integration** — CM-S2-F: production metadata-only admission and real maintenance exclusion after timeout.
  - Subjects: `This supersedes prepareDraft's earlier instruction to call current() first. Do NOT call current(), enabled(), service.list(), pool reload, tickets.assertAvailable or generations.assertReady before selected existence/revision admission: production enabled reads every connection credential. Refactor src/daemon/db/management-startup.ts to expose a NEW internal probeMetadataReady():Promise<RegistrySnapshot> callback in SavedManagementPorts, alongside unchanged enabled() for existing mutation/list behavior. probeMetadataReady checks owner lease, protected currentStore.inspect(), already-authenticated state's current() inode/digest, parent mode/inode, signed checkpoint committed anchor, running release fingerprint and canonical registration only; all are metadata reads and cached authenticated state, no signing-key or credential getKey, no recover/reconcile. At startup full enabled validation remains unchanged before service installation. prepareDraft under per-root gate validates trusted context, obtains probeMetadataReady snapshot, parses/enforces registry envelope metadata with the shared metadata validator extracted from current() without calling enabled, and selects requested ID/revision. If missing/stale/duplicate return existing sanitized code before ANY keychain call. After admission, recheck abort, validate signing authority availability if required, selected profile and generation ownership, then materialize only selected config with owned-reference reader. Never scan unrelated connection credentials in this probe-only path. Failure in metadata fence returns recovery-required/upgrade-required before secrets; missing signing key after valid admission still fails. Immutable selected snapshot held under same root gate through readonly selected credential read, runtime paths and completion; no mutation, no generation cleanup. This is an internal adapter implementing consumed sc1/sc2/sc3, not a change to public wire or weakened mutation readiness. Test through openManagedRoot's actual production callback with injected fake keystore, not always-true service fixture: reset keychain counters AFTER startup, then missing/stale/duplicate draft must issue zero getKey calls (including signing keys), zero stages/writes/spawn, while valid target reads only signing key plus selected owned credentials, never unrelated credential canary; missing key and registry/owner drift remain refused. Name management-startup.ts and management.ts explicitly as change sites.`, `Introduce internal RequestLifetime in src/daemon/request-context.ts, created server-side in src/daemon/server.ts BEFORE forwarding unary request. API registerDrain(work:Promise<void>):void, seal():void, drained:Promise<void>; registerDrain accepts only before seal, uses all-settled work completion, never settles drained until sealed AND every registered work item settled. Expose only registerDrain on TrustedRpcContext, lifetime owned by internal RequestEnvelope; none is deserialized from client params or serialized to worker-thread wire. draft-test supervisor synchronously registers its whole operation-drain promise before first await; drain encompasses root-gate queue, pending root/keychain/AWS preparation, asynchronous spawn, child close/reap, and all cleanup/listener/timer releases, including work continuing after timeout result. Terminal response promise settles at deadline independently. directDispatch seals request lifetime in its unary handler finally and still delivers exactly one INTERNAL reply after result settles; IpcServer drops only external canceled socket delivery. holdingForward in src/daemon/threads/maintenance-entry.ts resolves its held callback only when (reply delivered internally OR pre-admission canceled) AND request.lifetime.drained settles; keep hold through timed-out hanging preparation and through reaping. No early release on cancel or reply for work registered in lifetime. Router in src/daemon/threads/router.ts similarly calls once-only ended() after internal unary reply AND drained; no late socket write. For unrelated unary handlers with zero registered work drained resolves immediately at seal, preserving previous behavior. All relevant test methods remain main-daemon classified; on remote unary routes lacking a local lifetime use existing reply completion, do not serialize promises/functions. Ensure wrappers propagate the SAME lifetime object, including holdingForward's queued entry; if cancellation before forward admission, seal empty lifetime and release once. If synchronous handler throws, seal and internal reply; if supervisor preparation never settles, terminal client timeout still returned but slot/maintenance hold/activity remain truthfully held until drain; never fabricate cleanup. This intentionally prevents compaction/restart from racing unresolved store access and caps leaks to four admitted operations. Shutdown cancels operations, reaps children and waits registered drains; a still-unresolved noncancelable preparation is reported pending rather than releasing live resource ownership. Real-lock integration test: install production server/router/holdingForward with maintenance lock enabled, hold fake credential preparation deferred, reach real or injected deadline and receive timeout, attempt exclusive maintenance and assert denied while pending; repeat after socket disconnect and while child ignores cancel; settle preparation/reap then assert exclusive maintenance admitted and activity/holds/listeners zero exactly once. Register-before-await, rejection, queued-cancel, reply/cancel race and ignored AbortSignal coverage mandatory.`
  - Fixtures: `openManagedRoot production readiness closure with instrumented fake keystore; real lock manager and server/router; deferred preparation, clock and owned stubborn child`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `CM-S2-A: same merged draft as Save, fixed reachability-only result, sanitized errors/duration, zero draft registry/keychain/cache writes for SQL/KV/native/converted fixtures.`, `CM-S2-C: actual legacy/v2 routing, private worker IPC and release capability gating.` |
| `ac2` | `CM-S2-B: stale identities and cancel races, repeated-click suppression, production10s deadline, forced reaping and bounded retry with zero retained resources.` |

## 8. Migration

**State before:** Analyze e1/e3 and supplemental src/daemon/db-rpc.ts show in-process transient factory initialization with memory-only file probes and awaited close; nonfile error messages returned directly. S001 review remains pending and release gates disabled.

**State after:** One bounded parent supervisor owns disposable test children for both v2 and legacy actual probe execution. No connection data migration, no persistent test state; S005 consumes correlation and cancellation contract later.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add shared sc4 types and strict validators, parent supervisor and private compiled/development child entry; keep draft-test capability disabled. — ↩ rollbackable
2. Wire main-daemon v2 test/cancel routes and existing legacy adapter to the supervisor; use current profiles and read-only snapshot materialization, no S003 store. — ↩ rollbackable
3. Complete focused task tests, then full sweep and independent S002 review. Advertise draft-test only when S001 prerequisites and S002 evidence are verified; never modify S001 approval state or run maintenance during build. — ↩ rollbackable _(needs: `connections.managementV2`, `verified-S001-foundation`, `verified-S002-probes`)_

**Backward compat:** Retain legacy method name, saved-only scope-local lookup and successful fields. Timeout/canceled/failures are fixed sanitized projections. New clients detect absent draft-test support as upgrade-required; no fallback to unbounded in-process execution. Downgrade requires no draft data rewrite; no live downgrade or restart performed by this story.

## 9. Alternatives considered

### 9.1 a1: One disposable child per admitted request — **CHOSEN**



Parent materializes shared effective draft; isolated one-shot IPC worker with bounded lifetime. Selected smallest complete sc4 implementation.

### 9.2 a2: Reusable supervised child pool



Retain/reset idle workers across requests.

**Rejected because:** Unnecessary reset/scheduling complexity and credential retention risk; partial ac1 until reset verified.

## 10. References

- **[[c1]]** `analyze-bundle` `S002 context.assemble: e1/e3 and supplemental src/daemon/db/driver-profiles.ts materializeDraft; src/daemon/db-rpc.ts transient materialization`
- **[[c2]]** `analyze-bundle` `S002 context.assemble e1/e3: src/daemon/db/file-execution.ts and src/daemon/db/__tests__/owned-file-driver.test.ts`
- **[[c3]]** `analyze-bundle` `S002 context.assemble e1/e3: src/daemon/db-rpc.ts testConnectionRpc; src/daemon/handler-runtime.ts legacy dispatch`
- **[[c4]]** `prior-artifact` `HLD-484fcef7efaf229e shared contracts sc1/sc2/sc3/sc4/sc8 and S002 boundary`
- **[[c5]]** `stakeholder` `User explicitly deferred S001 independent review and requested next story; relevant tests per task, full sweep after all tasks built.`
- **[[c6]]** `code` `src/shared/logger.ts; src/daemon/request-context.ts; src/daemon/server.ts; src/daemon/db/management.ts; src/daemon/db/drivers/index.ts; src/daemon/db/drivers/redis.ts; src/daemon/db/drivers/mysql.ts` — "Review-grounded correction: lazy construction is not reachability, logger import creates directory, unary cancel is no-op, saved owner ports are private."
- **[[c7]]** `code` `src/daemon/db/pool.ts:304; src/daemon/db/drivers/sqlite.ts; src/daemon/threads/maintenance-entry.ts:27; src/daemon/threads/router.ts:94; src/daemon/db/drivers/dynamodb.ts; node_modules/@aws-sdk/credential-providers/dist-types/index.d.ts` — "Review blockers: private resolveConfigPath boundary; unary wrappers require internal reply for completion; Dynamo default chain consumes environment identity."

## Citations

- **[[c1]]** `analyze-bundle` `S002 context.assemble: e1/e3 and supplemental src/daemon/db/driver-profiles.ts materializeDraft; src/daemon/db-rpc.ts transient materialization`
- **[[c2]]** `analyze-bundle` `S002 context.assemble e1/e3: src/daemon/db/file-execution.ts and src/daemon/db/__tests__/owned-file-driver.test.ts`
- **[[c3]]** `analyze-bundle` `S002 context.assemble e1/e3: src/daemon/db-rpc.ts testConnectionRpc; src/daemon/handler-runtime.ts legacy dispatch`
- **[[c4]]** `prior-artifact` `HLD-484fcef7efaf229e shared contracts sc1/sc2/sc3/sc4/sc8 and S002 boundary`
- **[[c5]]** `stakeholder` `User explicitly deferred S001 independent review and requested next story; relevant tests per task, full sweep after all tasks built.`
- **[[c6]]** `code` `src/shared/logger.ts; src/daemon/request-context.ts; src/daemon/server.ts; src/daemon/db/management.ts; src/daemon/db/drivers/index.ts; src/daemon/db/drivers/redis.ts; src/daemon/db/drivers/mysql.ts` — "Review-grounded correction: lazy construction is not reachability, logger import creates directory, unary cancel is no-op, saved owner ports are private."
- **[[c7]]** `code` `src/daemon/db/pool.ts:304; src/daemon/db/drivers/sqlite.ts; src/daemon/threads/maintenance-entry.ts:27; src/daemon/threads/router.ts:94; src/daemon/db/drivers/dynamodb.ts; node_modules/@aws-sdk/credential-providers/dist-types/index.d.ts` — "Review blockers: private resolveConfigPath boundary; unary wrappers require internal reply for completion; Dynamo default chain consumes environment identity."

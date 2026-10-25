<!-- insrc:artifact LLD-484fcef7efaf229e-s3 -->

# LLD: E20261025484fcef7:S003

## Summary

**Epic:** `manage-saved-temporary-data-connections`
**HLD base run:** `wf-1792569414548-dvzndd`
**HLD effective hash:** `dc1a3f91a768...`

Temporary connections belong to a workbench session and a selected repository, so one-off files and other sources can be analyzed without saving connection configuration or credentials. Closing the panel or switching repositories preserves them; ending the workbench, losing its 90-second lease or restarting the daemon expires them. This story supplies the daemon session protocol and execution isolation; S005 supplies the lifetime explanation and manager UI.

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
**Owns:** `sc5` (Workbench session registration and ephemeral overlay)
**Consumes:** `sc1` (Connection management protocol and driver descriptors), `sc2` (Revision-checked mutation and recovery outcomes), `sc3` (Validated connection access context and driver leases), `sc8` (Memory-only file execution and conversion policy)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Safe saved-config read/patch, canonical repo validation, driver profiles, registry metadata/receipts and crash recovery, immutable secret generation staging, compatibility adapters and lease accounting foundation. Does not own temporary storage or rich manager layout. Preserve saved-only scope-local lookup and legacy pinned-family values; signed operation tickets make expiry/replay decidable after receipt pruning. Own the shared memory-only conversion/probe driver foundation, converter-cache policy/identity changes and private DuckDB lifecycle (sc8), completed before the S002/S003 branches. — owns `sc1`, `sc2`, `sc3`, `sc8`
- `s2`: Transient process probe transport, deadline/cancellation and sanitization. Uses foundational context slots without depending on s3’s session implementation. — owns `sc4`
- `s4`: Removal coordination for both scopes, busy/revision enforcement, confirmation state, postcommit credential cleanup retry and operation-status recovery. Never invokes source data deletion. — owns `sc6`
- `s5`: Settings contributions and shared command routing, themed editor/forms, filters, dirty guards, stale-test suppression and truthful feedback in extension and external IDE. HLD has inspected the external pane, actions, service, mirrored types and Settings registrations; S005 implements the recorded plan and validates its mirrored contract before integration acceptance. — owns `sc7`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `TemporaryConnectionStore`

```typescript
interface TemporaryConnectionStore { open(context: TrustedRpcContext, request: { repoRoot: string }): Promise<OpenConnectionSessionResult>; resume(context: TrustedRpcContext, request: SessionResume): Promise<OpenConnectionSessionResult>; heartbeat(context: TrustedRpcContext): Promise<{ status: 'active'; leaseMs: 90000 }>; register(context: ConnectionAccessContext, request: MutationRequest): Promise<MutationOutcome>; end(sessionHandle: string): Promise<void>; }
```

**Parameters:**
- `context: TrustedRpcContext | ConnectionAccessContext` — Daemon-minted transport identity or derived validated access, never client-deserialized authority.
- `request: { repoRoot: string } | SessionResume | MutationRequest` _(optional)_ — Strict session bootstrap/resume or existing revision-checked mutation input; capability accepted only on dedicated session control/attach endpoint.
- `sessionHandle: string` _(optional)_ — Internal owner lifecycle identifier; wire end first validates transport attachment and can end only its bound session.

**Returns:** `Promise<OpenConnectionSessionResult | MutationOutcome | { status: 'active'; leaseMs: 90000 } | void>` — Session handle and capability returned only at authenticated bootstrap/resume; temporary mutation uses session-added commit truth and separate activation outcome.

**Errors:**
- `session-expired` when Wrong epoch, missing/invalid capability, unattached execution context or ended/expired session.
- `invalid-input` when Malformed/excess-size input or noncanonical/unregistered management root.
- `duplicate-id | conflict | busy | operation-mismatch | reconciliation-required` when Existing contract rules for collisions, revisions, active use, nonidentical retries and expired/unverifiable tickets.

**Preconditions:**
- sc5 methods are proposed additions, not existing support. Use a fixed private RPC family db.connections.v2.session.open/resume/attach/heartbeat/end. End by handle is an internal function; public end accepts no arbitrary handle and derives it from the authenticated transport.
- Open creates a random256-bit handle, separate random256-bit bearer capability and random session-memory HMAC key; only capability digest is retained for constant-time verification. Dedicated control transport attachment survives transient reconnect through resume; data/MCP transports use attach and cannot renew the lease.
- Canonical registered-root eligibility is required for each temporary management operation and overlay. One session may own overlays for multiple eligible roots; panel/repo switch never ends it. No authorization from PID/client label/chat ID.
- Session methods and all session-bound data work route to main daemon, not worker-thread stores. A daemon-owned immutable access context is bound to request lifetime and validated again after awaits.

**Postconditions:**
- Open/resume returns heartbeatMs30000/leaseMs90000. Heartbeat is accepted only on current control generation; resume atomically increments generation and detaches the old control transport. An exactly-at-deadline request expires before authorization; only a valid pre-deadline heartbeat extends the monotonic deadline.
- Temporary create/update/status/ticket/read/list/activation bind existing sc1/sc2 keys and schema; ticket signature binds session via its private memory key, request HMAC covers full canonical payload, and receipts contain only safe outcomes. Same-ID changed-payload replay rejects. Session expiry invalidates all tickets/receipts regardless of wall clock.
- register resolves Keep only from selected immutable in-memory generation; Replace/Clear update private data only. Never call resolveConfigSecrets/keychain/list/load/adoption or any registry writer for temporary state. Paths use existing prepareRuntimeConfig. New ID/kind/family immutable per existing profile rules.
- Create/update commits memory entry + revision + receipt atomically under the same root gate as saved ID reservation. Activation is afterward; failure does not erase committed truth. Existing active leases refuse update; no user remove workflow in S003.
- End/lease expiry first closes admission and detaches every transport; cancels owned runs/probes/conversion and synchronously prevents further resolution; drops capabilities/receipts/config secret references, then awaits active operations and owned close. Failures leave a closed cleanup record with only owned runtime handles and safe counters; no success reported while a child/resource remains. Daemon shutdown awaits drains; process restart has no recoverable temporary state.
- Limit64 live sessions,64 connections/session,8MiB cumulative serialized config/session and16384 receipts/session; return existing busy on quota before committing, never evict live receipts silently. Per temporary file resource uses existing sc8 memoryBudgetBytes256MiB/allowSpillfalse; file source/data/config/capability material never goes to temp/cache/logs. Budgets are fixed internal limits, not a UI option. JS garbage collection limits mean logical erasure rather than guaranteed physical zeroization.

### 2.2 `createConnectionResolver`

```typescript
createConnectionResolver(ports?: ResolverPorts): ConnectionResolver
```

**Parameters:**
- `ports: ResolverPorts` _(optional)_ — Install the sc5 memory owner as existing sessionOverlay provider while retaining saved pool source.

**Returns:** `ConnectionResolver` — Saved-only resolution when context has no session; otherwise saved plus only the validated session overlay matching exact canonical lookupRoot.

**Errors:**
- `session-expired` when Presented session context is stale/wrong-owner/wrong-root; do not retry through saved-only fallback.
- `duplicate-id` when Any unexpected overlap between saved and visible temporary entries; resolution must not silently shadow.

**Preconditions:**
- Consume sc3 without redefining leases or saved root semantics. Context comes from validated transport/execution carrier, never serialized analyzer focus/plan/tool args.
- Saved reservation must reject an ID held in any active overlay at that root, including another workbench; temporary create rejects saved IDs but same temporary ID may exist in different isolated sessions. One root-serialized coordinator performs both checks and commit while holding the shared root gate.
- Unattached CLI/MCP and scope-local unregistered/nested saved lookup remain saved-only exactly as before; temporary lookup requires matching eligible root. Context with a session but incompatible root must reject session-expired, never attach a nearby root.

**Postconditions:**
- Session overlay returns safe projection only; credentials and HMAC/capability never leave owner. Every list/lease/withConnection revalidates state; no global current session or ambient AsyncLocalStorage persisted state.
- All current data consumers receive explicit immutable access context via ToolDeps and analyzer runtime/exploration/measure context. Request/run registry holds owner/run IDs and cancellation only in daemon memory. Wire thread projection has no capability; session work stays main-daemon and no handle/capability enters checkpoint/telemetry/prompt/artifact serialization.
- MCP child initial capability arrives on a private inherited control pipe, never argv/settings/config/log; child attaches its RPC data transport then discards raw bootstrap buffer and clears environment fallback. Unattached MCP remains saved-only. Reconnect requires explicit resume; an old run with lost temporary context rejects session-expired instead of saved fallback.
- Session lifetime cancellation is registered through S002 RequestLifetime drains and propagated through full analyzer/tool driver callback lifetime. Existing callback leases prevent premature release; do not reconstruct lease counters in consumers.

### 2.3 `ConnectionTestPorts`

```typescript
interface ConnectionTestPorts { readonly prepareTemporary?: ((request: DraftTestRequest, context: TrustedRpcContext, signal: AbortSignal) => Promise<EffectiveDraft>) | undefined; }
```

**Parameters:**
- `prepareTemporary: (request: DraftTestRequest, context: TrustedRpcContext, signal: AbortSignal) => Promise<EffectiveDraft>` _(optional)_ — Install readonly temporary edit preparation using selected session-memory config/revision and owned credential generation.

**Returns:** `Promise<EffectiveDraft>` — Same immutable effective config as register/update would use, with zero writes and abort checks.

**Errors:**
- `session-expired | not-found | conflict | invalid-input` when Owner/context expiry, missing ID, stale revision or malformed patch before any probe spawn.

**Preconditions:**
- Consume S002 worker supervisor and current injectable port; do not alter private IPC or child cancellation protocol.
- Temporary new-draft tests require registered root and may remain sessionless per S002; editing existing temporary rows requires authenticated live owner.

**Postconditions:**
- Abort/expiry after any await prevents late secret use/spawn; end cancels admitted temporary probes and retains drain until child close.
- No draft test creates a session entry, memory receipt, keychain entry or saved registry change. Existing draft-test sanitization remains authoritative.

### 2.4 `StreamHandler`

```typescript
type StreamHandler = (params: unknown, send: (msg: IpcStreamMessage) => void, signal: AbortSignal, context?: TrustedRpcContext | undefined) => Promise<void>;
```

**Parameters:**
- `params: unknown` — Existing untrusted wire input; kept unknown until a bounded strict per-method decoder validates it.
- `send: (msg: IpcStreamMessage) => void` — Existing response stream emitter; delivery errors cannot strand internal completion/drain.
- `signal: AbortSignal` — Combined transport/request and session-lifetime cancellation.
- `context: TrustedRpcContext` _(optional)_ — New optional fourth argument minted by server; includes owner-validated out-of-band carrier and registerDrain.

**Returns:** `Promise<void>` — Existing stream result shape; full admitted work may remain tracked by drain after terminal response.

**Errors:**
- `session-expired` when Lost, expired or wrong-owner binding detected before dispatch or cache/continuation reuse.

**Preconditions:**
- Additive optional fourth argument preserves old three-argument streaming handlers. directDispatch supplies frozen trusted context on both unary and stream paths, not caller params.
- Session-bound stream uses RequestLifetime completion/seal/drain in finally even on send failure. Router activity/maintenance hold lasts through stream completion AND owned drain. Owner abort affects only bound work.

**Postconditions:**
- createStepCallHandler accepts the new fourth context, derives caller cwd/envRepo/client separately, and merges validated carrier only from server context. StepToolRunner gains an optional fourth internal context argument; StepCallContext gains readonly connectionAccess/executionPolicy fields set by the host.
- forwardStep attaches EVERY fresh socket before step.call. No bootstrap capability in rawArgs, serialized caller context or environment. Attach acknowledgement must match current daemon epoch; failure rejects instead of dispatching saved-only.
- Session-authenticated routing is decided before worker selection for stream/unary traffic. Only session management/safe metadata, draft probes, read-only db tools and analyze calls are admitted in session-memory mode. Session-bound workflow/build/review/tracker or other unclassified persistence-capable methods return upgrade-required before executing; they are not silently downgraded.
- Any session-bound persisted run/status/continuation lookup validates owner BEFORE loading outputs. Owner-derived memory policy remains sticky through one-shot, multi-turn, nested task and provider calls; missing policy/binding fails closed.

## 3. Data model changes

### 3.1 `WorkbenchConnectionSession` — new

Proposed daemon-memory aggregate: random handle, capability digest, epoch, monotonic leaseDeadline, current control identity/generation, authenticated data attachments, per-root overlays, memory signing key and owned run cancellations. Direction/cardinality: session owns0..many repo overlays and transport attachments; overlay belongs exactly1 session and1 canonical root; session owns no saved pool. Logical ACTIVE→CLOSING→CLOSED state is irreversible. Reconnect can rebind while active, never revive expired session. Unfinished cleanup retains only closed resource handles, not retrievable configs/credentials. No session data is stored in DB/JSON/keychain.

**Call sites:**
- `src/daemon/server.ts`
- `src/daemon/request-context.ts`
- `src/daemon/threads/channel.ts`
- `src/daemon/connection-management-rpc.ts`

### 3.2 `TemporaryOverlayEntry` — new

Each (session,canonical root,id) owns one current immutable config/credential generation and revision plus active callback leases, construction/close promise and memory-only file execution resource. Different sessions may reuse IDs without sharing drivers/tables. Shared root mutation gate excludes saved-vs-temporary ID races; saved creates query all active reservations. Existing saved registry generation and unknown fields untouched. Config/read responses go through driver-profile safe allowlist; parent memory-only runtime construction bypasses keychain. Dynamic logs never contain source/options/URL/secrets; SDK logging policy must also be quiet for temporary operations.

**Call sites:**
- `src/daemon/db/pool-cache.ts`
- `src/daemon/db/pool.ts`
- `src/daemon/db/__tests__/connection-leases.test.ts`
- `src/daemon/db/__tests__/owned-file-driver.test.ts`

### 3.3 `TemporaryOperationReceipt` — new

Session+repo+operation ID indexes canonical keyed request HMAC and sc2 safe committed outcome; no plaintext patch or credentials. Receipt belongs exactly1 session and1 overlay/root; multiple receipts may refer to an entry revision. TicketexpiresAt=min(now+90000ms,current signed lease expiry); heartbeat extends session life but not previously issued tickets. Committed receipt remains queryable for entire session, even expired ticket; expired ticket with no receipt returns reconciliation-required; epoch/session loss always session-expired. Concurrent same-ID calls share in-flight result. Capacity refuses new ticket/commit before state change rather than discarding live history.

**Call sites:**
- `src/shared/connection-management.ts`
- `src/daemon/connection-management-rpc.ts`

### 3.4 `ConnectionAccessContext` — invariant-change

No sc3 wire shape change: optional sessionHandle is only a daemon-validated authority reference. Add an out-of-band execution-context carrier to ToolDeps, analyzer runtime/exploration/measure and MCP handler lifetimes. No raw capability/session metadata in prompt/tool args/analyze opaque state/checkpoint/artifacts. Maintain daemon-memory continuation binding so a temporary run whose process/context is lost fails explicitly rather than reconstructing saved-only authority. Saved-only consumers still use their exact own-directory lookupRoot; attach never grants management eligibility.

**Call sites:**
- `src/analyze/connection-access.ts`
- `src/analyze/runtimes/data/_shared.ts`
- `src/analyze/measure.ts`
- `src/analyze/explore/db-tables-list.ts`
- `src/analyze/explore/db-table-describe.ts`
- `src/daemon/tools/builtins/db/index.ts`
- `src/daemon/tools/builtins/data/schema-drift.ts`

### 3.5 `SessionExecutionPolicyAndMigrationInventory` — invariant-change

Review correction: all session-attached execution is conservatively session-memory, including saved-only steps within that execution and every dependent plan/report/error result. This is a daemon-derived sticky policy, never an input flag. Validate active owner/root and every previously used connection revision before executing, serving prior state or consulting any memory result. First admission forbids all shared/persistent cache reads AND writes; there is no cross-call memory result cache in this design. Existing opaque continuation results remain only in session-owned memory and are invalidated on any used revision change, session end or epoch loss. A revision change returns conflict/restart guidance rather than reusing stale outputs. Scope selection is validated before any cache optimization. [[c12]]

No getCachedExploration/putCachedExploration for either executePlan or stepPlan, including narrow resume, parameter substitution and dependency outputs. No readBundle/writeBundle, shaper tool-result dump, planner attempt/feedback/final plan, task record, orchestrator run record, analyze trace, chat/tool history, artifact/checkpoint, LMDB/Lance or telemetry output containing session-derived input/output is read/written by a session-memory run. There is no output persistence followed by cleanup: writes are prevented before the sink. Existing saved-only calls retain existing caching. A future caller that cannot propagate the sticky policy must reject before executing a temporary operation; a persisted record may contain no reusable session authority or output. [[c12]]

S003 also routes session-derived provider requests only through a provider mode whose local history/cache/trace behavior has been proven nonpersistent; a provider/CLI path that cannot meet this boundary returns unsupported-temporary before sending source data. No cloud SDK or direct REST provider is added. Configs/secrets/capabilities never enter prompts regardless of provider. Normal saved runs retain their behavior. Resource budget is the production sc8 default256MiB, not the test helper's64MiB override. [[c13]]

Proposed additive internal carrier (not a wire schema): readonly connectionAccess?: ConnectionAccessContext; readonly executionPolicy?: { readonly mode: 'saved' | 'session-memory'; readonly bindingId: string }; bindingId is an opaque daemon-memory owner/run lookup, never trusted from params and never persisted. ShapeOpts/RunShaperArgs, ExecutePlanArgs, ExplorationRunnerContext, TemplateExecuteArgs, RunExecutorArgs, ToolDeps and StepCallContext inherit the same carrier. Any session-memory call without a live binding fails session-expired. Main-daemon owner records hold cancellation/drain and used-revision vector; callbacks pass the carrier explicitly, not a global mutable current session.

Concrete migration inventory (proposed changes; existing behavior established by supplemental analyzer plus direct reads and the current TypeScript-resolved source inventory). Rows grouping files require the named proving test to exercise EACH listed site and every runtime branch, not just a helper. [[c12]] [[c14]]

| Production site | Current owner/behavior | Proposed owner/change | Required regression |
| --- | --- | --- | --- |
| src/daemon/server.ts | StreamHandler currently receives params/send/signal only; directDispatch stream branch makes separate controller. | Add optional fourth TrustedRpcContext, built from server-minted identity + request/session lifetime; complete streams in finally and retain registered drains after response/disconnect. | CM-S3-STREAM |
| src/daemon/request-context.ts | RequestLifetime and unary trusted authority exist. | Owner installs immutable validated connectionAccess on local context; combined request+session abort and synchronous drain admission. | CM-S3-STREAM |
| src/daemon/threads/router.ts; src/daemon/threads/method-class.ts; src/daemon/threads/channel.ts | Router may select a session worker and channel projects only connectionIdentity/epoch. | Force every authenticated session-bound request and session bootstrap/attach/heartbeat/end to main before worker selection, including step.call/analyze.run.start/tools; detach/disconnect completes same lifetime. Never clone capability/signal/drain. | CM-S3-STREAM |
| src/mcp/forward-step.ts | Fresh socket per forwardStep; caller context serialized as cwd/envRepo/client. | For every new socket, send private session.attach and await success before step.call on that SAME socket; bootstrap is read from inherited pipe and held only in forwarder memory, never rawArgs/context/env. Attach failure aborts without dispatch; no retry as unattached. Leave saved-only forwarding unchanged. | CM-S3-MCP |
| src/daemon/steps/host.ts; src/shared/step-context.ts | createStepCallHandler builds StepCallContext solely from p.context; StepToolRunner accepts args/signal/progress. | Accept trusted fourth stream context; sanitize caller cwd/envRepo/client separately, then supply out-of-band validated connectionAccess + executionPolicy + drain through StepCallContext and optional fourth StepToolRunner argument. Reject forged context fields. AsyncLocalStorage remains per-call plumbing, not a global session. | CM-S3-MCP |
| src/daemon/steps/analyze-oneshot.ts; src/daemon/steps/analyze-step/handler.ts; src/daemon/steps/analyze-step/phases/start.ts; src/daemon/steps/analyze-step/phases/plan.ts; src/daemon/steps/analyze-step/phases/narrow.ts; src/daemon/steps/analyze-step/phases/bundle.ts | One-shot/step dispatch currently derives options from inputs; step trace may append full input/output. | Take validated access/policy from host and pass explicitly to every context/measure/explore execution. Disable trace for the entire session-bound call. No input field can downgrade policy or change owner. | CM-S3-CONTEXT |
| src/daemon/steps/analyze-step/state.ts; src/daemon/steps/analyze-step/state-store.ts; src/daemon/threads/step-state.ts | Opaque token references server-memory continuation; token alone is not session authority. | Keep owner/root/revision-vector/policy binding in daemon-only state; validate authenticated attachment and session/revision BEFORE loading/serving prior outputs or advancing token. Expiry removes tokens/outputs; loss returns session-expired; tokens may not be replayed across sessions. | CM-S3-CACHE |
| src/daemon/handler-runtime.ts; src/daemon/analyze-rpc.ts | analyze.run.start wrapper discards trusted context; run/status/resume use durable run records. | Forward trusted fourth context and policy through runStart and run registry; session runs use owner-bound memory records/results/status only. Status/cancel/resume require same authenticated owner. Add no durable run.json or worker-store mirror for session run. | CM-S3-CONTEXT |
| src/analyze/connection-access.ts | analysisConnectionContext creates synthetic saved-analysis context. | Add optional validated ConnectionAccessContext argument; exact lookupRoot must match; preserve original saved-only default only for unattached policy. Missing authority under session-memory policy throws session-expired. | CM-S3-COMPAT |
| src/analyze/explore/types.ts; src/analyze/explore/executor.ts | ExplorationRunnerContext/ExecutePlanArgs lack owner policy; executePlan/stepPlan read cache before runner. | Add optional validated access/policy to args and runner context. Under session-memory policy bypass every getCachedExploration/putCachedExploration branch, including narrow results and dependent outputs; authorize before previous-state output reuse. | CM-S3-CACHE |
| src/db/exploration-cache.ts | Repo/index/params key; entire output persisted to LMDB. | Saved-only implementation remains; execute paths never call it for session-memory work. Optional internal policy guard refuses session writes if a future caller bypasses dispatch. Do not add a session key to persistent LMDB as a fix. | CM-S3-CACHE |
| src/analyze/context/driver.ts; src/analyze/context/cache.ts | runShaper reads/writes bundle cache and may write shaper tool-result files. | RunShaperArgs gains inherited immutable execution policy; session-memory bypasses readBundle/writeBundle and tool-result dumps on success/error/retry paths. No context cache read even for pure-code substeps of the same run. | CM-S3-CACHE |
| src/analyze/planner/driver.ts; src/analyze/planner/cache.ts | Planner attempts/feedback/final plan use disk. | Pass policy through recursive planner calls; session-memory keeps attempts, feedback and plans only in bounded owner-memory run records and never reads prior persisted plans. | CM-S3-CACHE |
| src/analyze/executor/types.ts; src/analyze/executor/walker.ts; src/analyze/executor/cache.ts; src/analyze/orchestrator/persistence.ts | Task records and orchestrator run records persist full outputs/run metadata. | TemplateExecuteArgs/RunExecutorArgs gain optional validated access/policy propagated to child plans; skip every task/run disk read/write. Whole run memory-only is sticky across dependencies, failed results, reports and retries; no per-task downgrade. | CM-S3-CACHE |
| src/analyze/runtimes/data/_shared.ts | Injected acquireDataPool and createConnectionResolver have no sessionOverlay. | Install owner overlay provider; acquireDataPool remains saved-only implementation/test seam. dataScopeOf retains exact own-directory lookup. Bound context and selected connection flow to all data callbacks. | CM-S3-ISOLATION |
| src/analyze/runtimes/data/discovery-connections.ts; src/analyze/runtimes/data/discovery-objects.ts; src/analyze/runtimes/data/schema-table.ts | Data resolver consumers build saved analysis access. | Use inherited context, list and complete callback leases; pin selected ID/revision across multistep use and reject wrong root. | CM-S3-ISOLATION |
| src/analyze/explore/db-connections-list.ts; src/analyze/explore/db-tables-list.ts; src/analyze/explore/db-table-describe.ts | Each has injected pool alias/createConnectionResolver. | Retain injected saved pool ports and add sessionOverlay + validated context; never fall back to raw acquire; authorization precedes cache hits in executor. | CM-S3-ISOLATION |
| src/analyze/measure.ts | acquireDataPool alias and resolver used in connection size measurement. | Use validated execution access and callback lifetime during measurement as well as main runner; suppress persistent measurements for session run. | CM-S3-ISOLATION |
| src/daemon/tools/types.ts; src/daemon/tools/executor.ts | ToolDeps has chat sessionId, repoPath and optional signal, not workbench access. | Add readonly connectionAccess and executionPolicy optional internal fields; fill from daemon execution owner only, not tool JSON. Inherit session abort+drain through nested tools; chat sessionId never authorizes. | CM-S3-CONTEXT |
| src/daemon/tools/builtins/db/index.ts; src/daemon/tools/builtins/data/schema-drift.ts | Direct savedConnectionResolver sites for discovery, config validation, pin and full callback. | Replace each production site with installed context-bound resolver and ToolDeps-derived access; pin remains full-use. Data/config results inherit session-memory policy and cannot be persisted by tool-result history. | CM-S3-ISOLATION |
| src/daemon/connection-management-rpc.ts | Existing v2 method catalog/saved resolver and S002 prepareTemporary edit hook. | Add strict sc5 session methods and temporary ticket/status/mutate/read/activate adapters. New temporary draft tests keep S002 sessionless-create semantics; existing-row edits use session owner through prepareTemporary. Reject removal; S004 owns it. | CM-S3-AUTH |
| src/daemon/db/management.ts; src/daemon/db/management-startup.ts; src/daemon/db/management-adoption.ts | withSavedRootGate, saved owner/pool acquisition and maintenance lock. | Consume existing withSavedRootGate for temporary commit/reservation; inject active-overlay ID check into saved create under the SAME gate. Saved startup/adoption stay saved-only and never enumerate temporary credentials/resources. | CM-S3-COLLISION |
| src/daemon/db/pool-cache.ts; src/daemon/db/pool.ts | Saved cache, createConnectionResolver/sessionOverlay port, repo registerEphemeral/build. | Install owner overlay in context-aware resolver only; shared saved pool and legacy registerEphemeral remain excluded from user temporary registration. Add collision check before choosing session vs saved; keep saved root compatibility. | CM-S3-ISOLATION |
| src/daemon/db/registry.ts; src/daemon/db/index.ts; src/shared/db-driver.ts; src/shared/connection-management.ts | Factory/type exports and shared resolver/lease/file policy contracts. | No factory redesign: overlay consumes getFactory/materializeDraft/lease-gate; temporary construction passes explicit memory-only authority and never resolveConfigSecrets. Shared protocol additions only, no public BaseDriver change. | CM-S3-LEASE |
| src/bin/insrc-connection-test.ts; src/daemon/db/draft-test.ts | S002 probe worker factory and drain owner. | Excluded from S003 redesign; owner cancellation uses existing S002 supervisor and readonly prepareTemporary. Keep child private IPC/10s/250ms reap unchanged. | CM-S3-EXPIRY |
| src/daemon/db/drivers/mssql.ts; src/db/store-guard.ts; src/shared/locks/lock-manager.ts | Inventory acquire-call matches are SDK pool or storage/lock primitives. | Classified exclusions: not management DriverPool consumers. MSSQL SDK lifetime remains enclosed by outer callback lease; storage/lock APIs never receive session connection authority. | CM-S3-INVENTORY |
| src/daemon/index.ts; src/daemon/db/management-enablement.ts | Daemon shutdown and source/compiled capability gate. | Stop sc5 admission before shutdown; abort/drain owner runs and owned resources before stores close. Require complete consumer+serializer inventory evidence for temporary advertisement; keep existing disabled prerequisites intact. | CM-S3-GATE |
| src/daemon/db/__tests__/connection-source-inventory.ts; src/analyze/__tests__/connection-consumers.test.ts | Current inventory resolves driver/resolver aliases, not transport or persistence APIs. | Extend inventories with explicit stream host/forwarder/state/cache/planner/task/run/trace sink families and exported aliases. Compare current production site set to this table; unknown new site blocks enablement. This table is present design discovery, not discovery deferred to BUILD. | CM-S3-INVENTORY |

**Call sites:**
- `src/analyze/explore/executor.ts`
- `src/db/exploration-cache.ts`
- `src/analyze/context/driver.ts`
- `src/analyze/context/cache.ts`
- `src/analyze/executor/cache.ts`
- `src/analyze/executor/walker.ts`
- `src/analyze/planner/cache.ts`
- `src/analyze/orchestrator/persistence.ts`
- `src/mcp/forward-step.ts`
- `src/daemon/steps/host.ts`
- `src/daemon/server.ts`
- `src/shared/step-context.ts`

## 4. Diagrams

- [ER model](docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S003/er-model.html)
- [Sequence diagram](docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S003/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc5` | implements | Implement the chosen memory owner, authenticated control/data attachment lifecycle, heartbeat/expiry, overlay+receipt identity, cancellation/drain and explicit sc5 integration ports consumed by S004/S005. |
| `sc1` | consumes | Strict additive session RPC methods; use existing connection key/scope/schema, safe descriptor/projection and error codes. Capabilities advertise session support only after existing release gate and session propagation evidence; no v2 method silently changes legacy return shapes. |
| `sc2` | consumes | Reuse MutationRequest, signed OperationTicket shape, safe MutationOutcome and canonical request HMAC primitives with session-local ephemeral key/receipts. Existing saved coordinator gains only an active-ID reservation callback under its root gate; no saved commit/recovery redesign. |
| `sc3` | consumes | Use sessionOverlay and callback lease contract; propagate trusted context additively to all inventoried consumers, and invalidate on owner expiry. Export an internal drain/lease port to S004 without implementing removal UI/coordination. |
| `sc8` | consumes | Use existing memory-only execution/conversion at root/session/id/revision identity,256MiB/resource,allowSpillfalse. All native and converted readers use shared implementation; if absent/overbudget reject explicitly before persistent writes. No converter redesign. |

## 6. Error paths

**Error cases**

- **Forged/stale capability, epoch or attachment** (recoverable)
  - Detection: Strict bounded decoder rejects extra fields; constant-time digest comparison, current control generation, daemon epoch and monotonic active-state checks fail before lookup or credential access.
  - Response: Fixed session-expired; zero driver creation/registry/keychain access; never fallback to saved or log the rejected token.
  - User impact: Reconnect with still-live private capability or re-add temporary connections after expiry.
- **Root is unregistered, canonical mismatch or overlay belongs to another lookupRoot** (recoverable)
  - Detection: realpath+registered-root eligibility check and exact overlay root comparison run at admission and after awaits.
  - Response: invalid-input for malformed/unregistered management root; session-expired for unauthorized attachment/root context. Saved-only scope-local reads remain unchanged.
  - User impact: Select the intended registered repository; saved sources can still be read through the legacy lane.
- **Saved/temporary creation races or update during full-use lease** (recoverable)
  - Detection: Inside existing root mutation coordinator check saved IDs and all live overlay reservations atomically with commit; verify expected revision and foundational active/barrier counts.
  - Response: duplicate-id, conflict or busy with no partial memory commit or persistent changes.
  - User impact: Choose another ID or retry after current use; never silently replace/shadow a source.
- **Lost response or changed payload reuses operation ID** (recoverable)
  - Detection: Session-memory ticket signature/epoch/root/key/mode/expiry checks and canonical payload HMAC compare against in-flight/receipt entry.
  - Response: Identical replay/status returns same committed result; changed body operation-mismatch. Expired ticket with no receipt reconciliation-required. Missing session always session-expired, not not-seen.
  - User impact: Client can distinguish committed addition from a retry that must not happen.
- **Expiry/end races with preparation, construction, activation, callback or temporary draft probe** (recoverable)
  - Detection: Registry marks CLOSING synchronously, invalidates attachments/entry generation, aborts run signals, and checks generation after every awaited operation before publication.
  - Response: Reject new work session-expired; late built resources immediately enter owned close; no late entry resurrection. Preserve safe already-committed receipt only while session remains active. End acknowledges only after drain; transport lifetime retains cleanup even if response disappears.
  - User impact: Current temporary operation is canceled; re-add in a new session when needed.
- **Temporary runtime, conversion or disposal fails** (recoverable)
  - Detection: Owned construction/probe/close promises reject; sc8 reports unsupported-temporary/resource-limit before persistence, and parent counters detect non-drained resources.
  - Response: Safe fixed activation failed/pending outcome after memory commit; no false rollback or source deletion. CLOSING remains inaccessible and retains retryable cleanup handles/counters; close failure is not swallowed. Reuse S002 force-reap only for its own probe children, never arbitrary PIDs.
  - User impact: Row may be session-added but activation failed; safe guidance permits revision-scoped activation retry. End may report pending cleanup without reviving the row.
- **Quota exhaustion or attempt to persist temporary authority/config** (recoverable)
  - Detection: Admission compares fixed memory/session/receipt limits before commit; production serialization inventory and allowlists reject sessionHandle/capability/effective config in durable request/run artifacts and telemetry.
  - Response: busy without evicting live state; deny persistence path and return fixed safe failure. Drop raw SDK errors and suppress credential/source-bearing logs.
  - User impact: User can end unused sessions or use saved scope deliberately; no automatic save/cache fallback.
- **Persistent cache hit or continuation attempts to bypass owner resolution** (recoverable)
  - Detection: At run admission and before any prior-output reuse, validate live daemon binding and used-revision vector. Sticky session-memory policy prevents every shared cache read/write, including error/retry branches; spy tests check sink calls, not only final files.
  - Response: No persistent read/write; recompute under current owner. Revision change yields conflict; owner loss yields session-expired. Never trust a cached same-ID saved result. Reject unsupported persistence-capable methods/providers before executing.
  - User impact: Temporary results stay isolated; caller restarts stale work instead of seeing another session data.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Same temporary ID in sessions A and B at the same root | Allowed; separate immutable generations, credentials, resources, receipts and leases. Saved create with that ID is blocked until both reservations are gone. |
| Panel close or repository A→B→A switch | No lifecycle event; same session retains both root overlays. Only current exact-root access resolves each overlay; control heartbeats continue independently. |
| Control disconnect followed by resume within90seconds | Data remains in memory; resume with same capability/epoch transfers control generation. Old control heartbeat/end cannot affect new generation. A disconnected data request cancels only its owned work, not the whole session. |
| Heartbeat arrives exactly at deadline or wall clock moves | Expire before authenticating at >=monotonic deadline. Wall-clock ticket time remains bounded by signed issued expiry; it never authorizes an expired monotonic session. |
| Unattached CLI/MCP or legacy directory-scoped saved analysis | Saved-only lookup with exact original scope root, including unregistered/nested saved registries. No implicit management eligibility or auto-created session. |
| An analysis continuation/checkpoint survives daemon epoch change | Continuation with temporary-use marker requires a live daemon-memory binding; if absent reject session-expired with re-add guidance. Never reconstruct temporary authority from checkpoint or reuse same-named saved source. |
| Header-only file or unavailable Arrow/Feather reader | Retain sc8 truth: valid empty input may succeed; missing local reader reports unsupported-temporary before any INSTALL/temp/cache write. S003 does not silently enable absent readers. |
| Capability-gated release still disabled or mixed-version client | No temporary features advertised and no session mutation admitted. Existing saved reads remain available; return upgrade-required for unsupported session methods. |

**Invariants to preserve**

- sc1/sc3 safe keys/access and callback leases remain authoritative; discovery bundle symbol.locate and manual pool-cache read establish current signatures. [[c1]]
- Legacy repo-pool registerEphemeral must not become a user session store; usage.example graph was incomplete and manual inventory confirms the existing definition only. [[c3]]
- Server-minted identity/epoch and main-daemon request lifetime remain unforgeable; consume S002 prepareTemporary and private worker lifecycle rather than redesign it. [[c4]]
- Existing resolver/owned-file/context tests stay regression gates; session work extends them with actual production wiring and zero-persistence evidence. [[c5]]

## 7. Test strategy

**Test framework:** `Existing node:test + node:assert/strict TypeScript tests executed with Node22 and tsx, as located in src/daemon/db/__tests__/connection-leases.test.ts, src/daemon/__tests__/connection-request-context.test.ts, src/analyze/__tests__/connection-consumers.test.ts and src/daemon/db/__tests__/owned-file-driver.test.ts. Fake/isolated local service fixtures; relevant suites per task and final full sweep after all implementation tasks. No claim that S003 tests have run during design.`

**Test levels**

- **unit** — Pure protocol bounds, state transitions, signed ticket/HMAC and fixed capacity checks with deterministic monotonic clock; not a substitute for production lifecycle wiring.
  - Subjects: `CM-S3-AUTH: real IPC sessions reject forged tokens epochs roots and stale control generations; data attachments cannot heartbeat or end another session.`, `CM-S3-REPLAY: identical concurrent mutations and lost replies reconcile once; changed payloads expired tickets quotas and expired sessions never fabricate not-seen or partial commits.`
  - Fixtures: `Fake monotonic clock and wall clock with forward/backward jumps; deterministic scheduler; fake credentials only.`
- **integration** — Exercise actual socket handlers, root coordinator, memory owner, production resolver/leases, SDK-backed local protocol fixtures and process cancellation; assertions use exact canary snapshots and positive controls.
  - Subjects: `CM-S3-MEMORY: production temporary create update list activation and replay keep exact registry/keychain/filesystem/log snapshots unchanged while safe results omit config and credential canaries.`, `CM-S3-ISOLATION: real SQL KV and native/converted file callbacks resolve only their session and exact root; identical IDs never share credentials resources or rows.`, `CM-S3-COLLISION: concurrent saved and temporary creation shares the real root gate and permits one winner; duplicates across visible scopes reject without shadowing.`, `CM-S3-LEASE: revision pin spans the full multi-call callback and failed construction; concurrent update returns busy and resources close only after use drains.`, `CM-S3-EXPIRY: end heartbeat loss exact deadline and restart forbid new resolution, abort real operations and probes, await late construction/close and leave zero session entries children leases and resource counters.`, `CM-S3-RECONNECT: control reconnect within90seconds preserves overlays while panel close and root switches do not end session; old control generation cannot renew or end resumed session.`, `CM-S3-CONTEXT: production analyzer runtime exploration measurement db tools schema-drift and MCP consume only validated out-of-band access; missing or lost binding never falls back from temporary to saved.`, `CM-S3-FILES: every native and converted temporary reader uses existing memory-only sc8 policy with session/root/revision identity; unsupported and overbudget inputs fail before writes or INSTALL.`, `CM-S3-COMPAT: unattached and nested/unregistered saved scope lookup pinned families strict legacy results and S002 draft probe cancellation remain unchanged.`, `CM-S3-CACHE: real executePlan stepPlan context planner task and run paths bypass all persistent reads/writes under session authority; warm saved and sessionA caches never satisfy sessionB, revisions or expired bindings.`, `CM-S3-STREAM: real unary and streaming directDispatch plus Router propagate server-minted access and drains; forged params cannot attach authority and disconnect/send failure retain cleanup and maintenance exclusion.`, `CM-S3-MCP: each fresh forwardStep socket attaches before step.call; trusted host context and owner-bound continuations survive valid reconnect while wrong-session replay and lost bootstrap fail closed.`
  - Fixtures: `Two workbench control sockets plus data sockets, two roots and a nested unregistered saved directory; exact fake keychain and saved metadata bytes.`, `Existing PostgreSQL and Dynamo local protocol servers with distinct credentials/rows per session; actual source and compiled S002 probe workers.`, `Valid native csv/tsv/json/jsonl/ndjson/parquet and converted avro/bson/fixed-width/xlsx; Arrow/Feather explicitly unsupported when reader absent, never a green skip.`, `Delayed real driver use/build/close, captured child/stdout/stderr and normal daemon logs; recursive isolated HOME/TMP/cache watches and positive auth/row controls.`, `Private inherited MCP bootstrap pipe and actual MCP↔daemon request lifecycle, nested analysis sessions and overlapping jobs; no real cloud/LLM providers needed.`, `Prewarm real saved exploration LMDB/bundle/planner/task caches with source canaries; run session A then B with identical IDs/params, update revisions and expire bindings. Assert actual cache getters/setters not called for session work and recursive file/LMDB/Lance/history/trace snapshots unchanged. Use positive controls proving saved cache hits still work.`, `Actual fresh-socket MCP forwarder attaches on every invocation; real StreamHandler fourth trusted context and request drain under Router/maintenance owner; replay continuation token across sessions before any output load.`
- **contract** — Prove trusted-context/serialization closure and mixed-version gating in production, supplementing incomplete graph with TypeScript-resolved full source inventory.
  - Subjects: `CM-S3-INVENTORY: type-resolved production source inventory classifies every alias injected resolver factory driver-use and serializer path; no unclassified consumer or authority persistence remains.`, `CM-S3-GATE: temporary capability fails closed for missing stale source/compiled evidence or incomplete inventory and never enables deferred foundation or SQL Server prerequisites.`
  - Fixtures: `Extend existing connection-source-inventory and connection-consumers tests to resolve aliases/injected methods; explicit allow/exclusion rationale per production site.`, `Real analyzer continuation and checkpoint/telemetry serializers with config/capability canaries, daemon-memory temporary-use marker and absent-binding negative.`, `Source and compiled release-evidence manifests; actual client-shaped requests reject unsupported methods and malformed bounded JSON.`
- **smoke** — Final regression evidence after implementation; focused tests per task, full suite only after every S003 implementation task.
  - Subjects: `CM-S3-SWEEP: after all implementation tasks run final build and one full regression sweep; record actual failures skips and timeouts and keep release disabled for unresolved prerequisites.`
  - Fixtures: `Node22 native ABI, npm run build, node --import tsx --test suites; live LLM suites disabled and skips/timeouts reported explicitly.`, `No user daemon restart, real registry adoption, real credential migration or enabling release; MSSQL actual-service coverage remains separately pending Linux x64 CI.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `CM-S3-AUTH: real IPC sessions reject forged tokens epochs roots and stale control generations; data attachments cannot heartbeat or end another session.`, `CM-S3-MEMORY: production temporary create update list activation and replay keep exact registry/keychain/filesystem/log snapshots unchanged while safe results omit config and credential canaries.`, `CM-S3-ISOLATION: real SQL KV and native/converted file callbacks resolve only their session and exact root; identical IDs never share credentials resources or rows.`, `CM-S3-COLLISION: concurrent saved and temporary creation shares the real root gate and permits one winner; duplicates across visible scopes reject without shadowing.`, `CM-S3-LEASE: revision pin spans the full multi-call callback and failed construction; concurrent update returns busy and resources close only after use drains.`, `CM-S3-REPLAY: identical concurrent mutations and lost replies reconcile once; changed payloads expired tickets quotas and expired sessions never fabricate not-seen or partial commits.`, `CM-S3-CONTEXT: production analyzer runtime exploration measurement db tools schema-drift and MCP consume only validated out-of-band access; missing or lost binding never falls back from temporary to saved.`, `CM-S3-INVENTORY: type-resolved production source inventory classifies every alias injected resolver factory driver-use and serializer path; no unclassified consumer or authority persistence remains.`, `CM-S3-FILES: every native and converted temporary reader uses existing memory-only sc8 policy with session/root/revision identity; unsupported and overbudget inputs fail before writes or INSTALL.`, `CM-S3-COMPAT: unattached and nested/unregistered saved scope lookup pinned families strict legacy results and S002 draft probe cancellation remain unchanged.`, `CM-S3-GATE: temporary capability fails closed for missing stale source/compiled evidence or incomplete inventory and never enables deferred foundation or SQL Server prerequisites.`, `CM-S3-CACHE: real executePlan stepPlan context planner task and run paths bypass all persistent reads/writes under session authority; warm saved and sessionA caches never satisfy sessionB, revisions or expired bindings.`, `CM-S3-STREAM: real unary and streaming directDispatch plus Router propagate server-minted access and drains; forged params cannot attach authority and disconnect/send failure retain cleanup and maintenance exclusion.`, `CM-S3-MCP: each fresh forwardStep socket attaches before step.call; trusted host context and owner-bound continuations survive valid reconnect while wrong-session replay and lost bootstrap fail closed.` |
| `ac2` | `CM-S3-EXPIRY: end heartbeat loss exact deadline and restart forbid new resolution, abort real operations and probes, await late construction/close and leave zero session entries children leases and resource counters.`, `CM-S3-RECONNECT: control reconnect within90seconds preserves overlays while panel close and root switches do not end session; old control generation cannot renew or end resumed session.`, `CM-S3-CONTEXT: production analyzer runtime exploration measurement db tools schema-drift and MCP consume only validated out-of-band access; missing or lost binding never falls back from temporary to saved.`, `CM-S3-MEMORY: production temporary create update list activation and replay keep exact registry/keychain/filesystem/log snapshots unchanged while safe results omit config and credential canaries.`, `CM-S3-GATE: temporary capability fails closed for missing stale source/compiled evidence or incomplete inventory and never enables deferred foundation or SQL Server prerequisites.`, `CM-S3-SWEEP: after all implementation tasks run final build and one full regression sweep; record actual failures skips and timeouts and keep release disabled for unresolved prerequisites.`, `CM-S3-CACHE: real executePlan stepPlan context planner task and run paths bypass all persistent reads/writes under session authority; warm saved and sessionA caches never satisfy sessionB, revisions or expired bindings.`, `CM-S3-STREAM: real unary and streaming directDispatch plus Router propagate server-minted access and drains; forged params cannot attach authority and disconnect/send failure retain cleanup and maintenance exclusion.`, `CM-S3-MCP: each fresh forwardStep socket attaches before step.call; trusted host context and owner-bound continuations survive valid reconnect while wrong-session replay and lost bootstrap fail closed.` |

## 8. Migration

**State before:** S1 bundles symbol.locate and search.text plus manual src/daemon/db/pool-cache.ts reads establish a saved resolver with fail-closed optional sessionOverlay; src/analyze/connection-access.ts and toolAccess in src/daemon/tools/builtins/db/index.ts currently construct saved-only contexts. The repo pool has registerEphemeral but no demonstrated workbench session owner. S002 BUILD is approved with MSSQL actual-service coverage pending and one full-sweep warning; S001 review is deferred, and the shipped gate is disabled.

**State after:** Proposed: sc5 memory owner and strict session lifecycle methods supply isolated per-session/per-root temporary entries, receipts and resources through existing sc3 resolver hooks. Every inventoried analyzer/tool/MCP consumer carries daemon-validated context out of band; legacy/unattached saved-only paths keep their current lookup rules. No JSON/keychain/graph/vector migration, saved registry rewrite or existing connection adoption.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add additive bounded session protocol and daemon-memory owner behind disabled existing capability gate; keep saved APIs and all persisted formats unchanged. Add root coordinator reservation hook as a consumer of saved coordinator; no automatic registry adoption. — ↩ rollbackable _(needs: `existing connection management gate remains disabled`)_
2. Install owner lifecycle and overlay resolver hooks with memory-only credentials/resources. Add attach/control generation and shutdown drain, leaving user remove and UI to S004/S005. Build isolated real-IPC tests before any capability advertisement. — ↩ rollbackable
3. Propagate explicit trusted context through the complete analyzer/tool/MCP inventory and private bootstrap pipe. Keep session-bound calls main-daemon; attach no capability to serialized state and reject lost temporary continuations. Regenerate inventory as callers move; no production site left unclassified. — ↩ rollbackable
4. Run each task's relevant suite, then final build/full sweep after all tasks. Review source/compiled gate evidence and exact no-persistence/cancellation tests. Keep feature disabled until foundation review, session inventory and both client integration prerequisites are independently verified; do not treat pending SQL Server coverage as green. — ↩ rollbackable _(needs: `independent S001 review and foundation gates`, `zero-unclassified session consumer/serializer inventory`, `S003 isolation/expiry/no-persistence checks`, `S005 client integration evidence before user release`)_
5. On deliberate rollback disable session advertisement/admission first, expire and drain only owned temporary sessions/resources, then remove overlay/context wiring. Communicate temporary session loss as the documented ephemeral lifetime; saved registrations and keychain data are untouched. No live restart is part of design validation. — ↩ rollbackable

**Backward compat:** All session protocol changes are additive; legacy list/save/test return shapes and S001 safe-read/profiles remain. Missing session context means saved-only only for a genuinely unattached new request. A request/continuation known to have used temporary state rejects if its binding is absent, with no same-name saved fallback. Exact nested/unregistered directory saved lookups and pinned legacy families are regression gates. Rollback intentionally loses ephemeral sessions, not saved data; old daemon/client combinations get upgrade-required rather than a fake empty list.

## 9. Alternatives considered

### 9.1 a1: Session registry with owned in-memory entries — **CHOSEN**

One daemon session registry owns separate per-repository overlays of immutable temporary entries.

Smallest complete sc5 shape: daemon issues workbench handle/capability and keeps a memory-only session record with repo overlays, credentials and receipts. Each overlay implements the existing ConnectionResolver callback contract using the foundational lease gate, driver factories, materializeDraft and sc8 memory-only resource policy; it never registers into the saved pool. Trusted transport attachment and an explicit execution-context carrier provide access without changing wire MutationRequest/ConnectionKey semantics. Saved ID reservation and temporary commit share the existing per-root mutation coordinator. S004 consumes an internal lifecycle/removal port and S005 consumes the session protocol; no UI, converter or saved persistence redesign.

### 9.2 a2: One injected DriverPool per session and repository

Each overlay delegates runtime entries to a pool whose configuration and secret providers are entirely in memory.

Keep the same sc5 session/capability protocol and sc1/sc2/sc3/sc8 contracts, but add explicit configuration-source and credential-source ports to DriverPool; instantiate one isolated temporary pool per session/repository. The saved default providers retain existing behavior, while the temporary providers have no disk/keychain capability. Memory-only policy identity uses session/repo/revision and session end closes the owned pool. Registry/tickets/receipts remain in the sc5 memory owner. This is an additive integration at the S001 pool port, requiring owner compatibility review rather than redesign of saved contracts.

**Rejected because:** Protocol is compatible, but memory-only and lifecycle safety depend on broader changes to saved-pool internals; not the smallest complete integration.

## 10. References

- **[[c1]]** `analyze-bundle` `S003 context.assemble: symbol.locate e1 and manual src/shared/connection-management.ts; src/daemon/db/pool-cache.ts`
- **[[c2]]** `analyze-bundle` `S003 context.assemble: data-model.trace e2; src/shared/db-driver.ts and manual src/daemon/db/pool.ts`
- **[[c3]]** `analyze-bundle` `S003 context.assemble: usage.example e3/e7 and manual src/daemon/db/__tests__/connection-source-inventory.ts`
- **[[c4]]** `analyze-bundle` `S003 context.assemble: search.text e4 and manual src/daemon/server.ts; src/daemon/request-context.ts; src/daemon/threads/channel.ts; src/daemon/connection-management-rpc.ts; src/analyze/connection-access.ts; src/daemon/tools/builtins/db/index.ts`
- **[[c5]]** `analyze-bundle` `S003 context.assemble: test.locate e5/e6 and manual src/daemon/db/__tests__/connection-leases.test.ts; src/daemon/db/__tests__/owned-file-driver.test.ts; src/analyze/__tests__/connection-consumers.test.ts`
- **[[c6]]** `prior-artifact` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/HLD.md`
- **[[c7]]** `prior-artifact` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/DEF.md#63-e20261021484fcef7s003--use-temporary-connections-within-a-workbench-session`
- **[[c8]]** `prior-artifact` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S002/BUILD.md`
- **[[c9]]** `doc` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S002/LIVE_DATABASE_FIXTURES.md`
- **[[c10]]** `step-output` `S003 design.story s2 alternatives.enumerate and s3 alternatives.judge (a1 winner)`
- **[[c11]]** `step-output` `S003 design.story s4 contract.detail, s5 error.paths, s6 test.strategy, s7 migration.write and s8 checklist.verify`
- **[[c12]]** `analyze-bundle` `S003 supplemental context: cache/stream symbol.locate and usage.example; direct reads of src/analyze/explore/executor.ts, src/db/exploration-cache.ts, src/analyze/context/driver.ts, src/analyze/context/cache.ts, src/analyze/executor/walker.ts, src/analyze/executor/cache.ts, src/analyze/planner/cache.ts, src/analyze/orchestrator/persistence.ts, src/daemon/steps/host.ts, src/daemon/server.ts and src/mcp/forward-step.ts`
- **[[c13]]** `code` `src/daemon/db/file-policy.ts:17` — "memoryBudgetBytes: 256 * 1024 * 1024"
- **[[c14]]** `code` `src/daemon/db/__tests__/connection-source-inventory.ts:16`

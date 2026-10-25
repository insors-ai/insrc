<!-- insrc:artifact PLAN-484fcef7efaf229e-s3 -->

# Plan: E20261025484fcef7:S003

## Summary

**Epic:** `manage-saved-temporary-data-connections`
**LLD run:** `wf-1792918270874-eo27nk`
**LLD effective hash:** `dc1a3f91a768...`

Build daemon-owned temporary connections with workbench lifetime, isolated in-memory credentials/resources and truthful revision/replay outcomes. Carry trusted ownership and memory-only policy through transport, analysis, tools and every diagnostic/persistence boundary; unsupported provider, retrieval and unverified MCP modes fail before data use. Run focused tests for each implementation task, then one full build and regression sweep after all implementation work. S005 lifetime-copy acceptance, actual-service evidence and unresolved foundation gates remain explicitly pending; release stays disabled.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Inventory production consumers and install fail-closed internal execution contracts | M | — | integration: CM-S3-INVENTORY: TypeScript-resolved alias/injection/factory/serializer baseline and missing-policy fail-closed tests | [[c1]] [[c2]] [[c7]] |
| 2 | **`t2`** Implement in-memory session lifecycle and control ownership | M | `t1` | unit: CM-S3-AUTH: monotonic exact-deadline control lifecycle and session quota; integration: CM-S3-RECONNECT: real socket generation rollover preserves overlays | [[c1]] [[c3]] [[c4]] |
| 3 | **`t3`** Implement data-only root and audience delegations | M | `t2` | unit: CM-S3-AUTH: role/root/audience token confusion,32-token quota and revocation; integration: CM-S3-AUTH: data sockets cannot call control RPCs | [[c1]] [[c3]] [[c4]] |
| 4 | **`t4`** Register bounded session RPC and main-daemon routing | M | `t3` | integration: CM-S3-AUTH: bounded strict RPC/unknown method decoding and main-daemon routing | [[c1]] [[c2]] [[c4]] |
| 5 | **`t5`** Propagate trusted stream context and real request drains | M | `t4` | integration: CM-S3-STREAM: real server/router/maintenance terminal frame, disconnect, throwing delivery and delayed completion+drain | [[c1]] [[c2]] [[c4]] |
| 6 | **`t6`** Implement memory-only temporary entries and credential generations | M | `t2`, `t4` | integration: CM-S3-MEMORY: effective keep/replace/clear config, safe projection and exact saved/keychain snapshots; unit: CM-S3-REPLAY: entry/config quota refusal leaves no partial state | [[c1]] [[c3]] [[c4]] |
| 7 | **`t7`** Implement session tickets, receipts and replay reconciliation | M | `t6` | unit: CM-S3-REPLAY: same/changed payload, HMAC, ticket/receipt quotas and expiry truth; integration: CM-S3-REPLAY: concurrent real mutation and lost socket reply reconciliation | [[c1]] [[c3]] [[c4]] |
| 8 | **`t8`** Close canonical saved/temporary reservation races and alias writes | M | `t6`, `t7` | integration: CM-S3-COLLISION: canonical managed/unmanaged adopted/unadopted save races in both orders; integration: CM-S3-NAMESPACE: actual alias/relative/trailing-slash upsert refusal and preexisting distinct-target isolation | [[c1]] [[c3]] [[c4]] |
| 9 | **`t9`** Construct private temporary drivers and resolver callback leases | M | `t6`, `t7`, `t8` | integration: CM-S3-LEASE: full multi-call callback, busy update, delayed/failed construction; integration: CM-S3-ISOLATION: private owner/root/revision drivers with distinct credentials/rows | [[c1]] [[c2]] [[c3]] [[c4]] |
| 10 | **`t10`** Install immutable temporary factory logging authority | M | `t1`, `t9` | unit: CM-S3-DRIVER-LOGS: immutable owner-only factory quiet authority, alias completeness and constructor refusal | [[c1]] [[c2]] [[c4]] [[c7]] |
| 11 | **`t11`** Migrate concrete SDK/event diagnostics and prove quiet resources | M | `t1`, `t9`, `t10` | integration: CM-S3-DRIVER-LOGS: actual normal daemon PG/Redis/SDK idle/reconnect/error/disposal canaries and saved marker | [[c1]] [[c2]] [[c4]] [[c7]] |
| 12 | **`t12`** Bind native and converted file resources to session ownership | M | `t9`, `t11` | integration: CM-S3-FILES: native/converted resource identity,256MiB budget, zero spill/cache/INSTALL and cancellation | [[c1]] [[c4]] [[c6]] |
| 13 | **`t13`** Connect temporary edit probing to the S002 preparation seam | M | `t5`, `t6`, `t9` | integration: CM-S3-COMPAT: prepareTemporary edit/new draft source and compiled probe cancellation, zero commit writes | [[c1]] [[c3]] [[c4]] |
| 14 | **`t14`** Thread trusted context through step host and private MCP bootstrap | M | `t3`, `t4`, `t5` | integration: CM-S3-MCP: private pipe bootstrap, every fresh socket attach, trusted fourth host argument and epoch/root mismatch | [[c1]] [[c2]] [[c4]] |
| 15 | **`t15`** Enforce unverified-client egress refusal at every analysis phase | M | `t14` | integration: CM-S3-CLIENT-EGRESS: real forwardStep all analysis phases/one-shot deny before state/provider/output; all channels captured | [[c1]] [[c3]] [[c4]] |
| 16 | **`t16`** Carry owner resolver context through tools and data runtimes | M | `t9`, `t14`, `t15` | integration: CM-S3-CONTEXT: actual db/data tools, schema-drift, runtime and exploration resolver callbacks with saved positive controls | [[c1]] [[c2]] [[c4]] [[c7]] |
| 17 | **`t17`** Make classifier and every scope-selection path root-bound | M | `t9`, `t14`, `t15`, `t16` | integration: CM-S3-SCOPE: classifier/targetHint/prepareScope/stepScope/task-scope rootA temporary versus rootB saved ambiguity | [[c1]] [[c2]] [[c4]] [[c7]] |
| 18 | **`t18`** Isolate measurement work and retain late-operation drain | M | `t5`, `t9`, `t17` | integration: CM-S3-CONTEXT: owner-private measurement slot, both branches and saved pending map compatibility; integration: CM-S3-LEASE: measure timeout/late rejection retains actual work and drain | [[c1]] [[c2]] [[c3]] [[c4]] |
| 19 | **`t19`** Close freeform and tool-loop authority relays | M | `t17`, `t18` | integration: CM-S3-FREEFORM: explicit/forced fallback, requestSize variants, direct/task loops and same tuple at every relay | [[c1]] [[c2]] [[c3]] [[c4]] |
| 20 | **`t20`** Bypass exploration and context persistent caches before access | M | `t17`, `t19` | integration: CM-S3-CACHE: warm exploration/context saved/A/B caches, revision/owner/expiry denial before persistent get/set | [[c1]] [[c2]] [[c3]] [[c4]] |
| 21 | **`t21`** Keep root orchestrator lifecycle and repair in session memory | M | `t19`, `t20` | integration: CM-S3-RECURSION: root runStages/completeRun/repair success and failures, same runId two owners, no run record IO | [[c1]] [[c2]] [[c3]] [[c4]] |
| 22 | **`t22`** Propagate owner memory policy through recursive planning | M | `t19`, `t20`, `t21` | integration: CM-S3-RECURSION: nested planner measure/execute/aggregate/resume and no attempt/feedback/final-plan IO | [[c1]] [[c2]] [[c3]] [[c4]] |
| 23 | **`t23`** Close task, report and serializer persistence sinks | M | `t20`, `t22` | integration: CM-S3-CACHE: task/report/checkpoint/history/trace/Lance canaries, error repair, saved positive persistence | [[c1]] [[c2]] [[c3]] [[c4]] [[c7]] |
| 24 | **`t24`** Implement provider admission and per-attempt privacy guards | L | `t19`, `t22` | integration: CM-S3-PROVIDER: actual factory/direct/injected/cache/loop/aggregate pre-send denial and expiry guards; live: CM-S3-PROVIDER: actual admitted local Ollama no-persistence smoke; unavailable evidence is pending and admission stays refused | [[c1]] [[c2]] [[c3]] [[c4]] |
| 25 | **`t25`** Quiet admitted provider and structured retry diagnostics | M | `t24` | integration: CM-S3-PROVIDER: structured retry inner authority guard and nonretryable refusal; integration: CM-S3-CONSUMER-LOGS: actual provider prompt/retry/late-stream trace sink and saved control | [[c1]] [[c3]] [[c4]] |
| 26 | **`t26`** Deny unsupported query embeddings, retrieval and lineage | M | `t17`, `t24` | integration: CM-S3-EMBED-DENY: docs/vector/hybrid/lineage/graph routes zero Ollama/ONNX/injected/SDK query calls and no fallback success | [[c1]] [[c2]] [[c3]] [[c4]] [[c7]] |
| 27 | **`t27`** Close adherence topic constraint record persistence | M | `t22`, `t24`, `t26` | integration: CM-S3-ADHERENCE-CACHE: warm topic record denied before read/write/enumeration; in-memory constraints positive path | [[c1]] [[c2]] [[c3]] [[c4]] |
| 28 | **`t28`** Quiet analysis runtime and late-operation diagnostics at source | M | `t18`, `t19`, `t23`, `t25`, `t27` | integration: CM-S3-CONSUMER-LOGS: runtime/exploration/task/measure success/raw/late errors, lazy formatters and normal trace sink | [[c1]] [[c2]] [[c3]] [[c4]] [[c7]] |
| 29 | **`t29`** Quiet daemon tool/RPC sinks and sanitize result envelopes | M | `t18`, `t19`, `t23`, `t25`, `t27`, `t28` | integration: CM-S3-CONSUMER-LOGS: tool/RPC/progress/error/throwing-delivery envelopes and normal sink, saved concurrent marker | [[c1]] [[c2]] [[c3]] [[c4]] [[c7]] |
| 30 | **`t30`** Finish session expiry, cancellation and owned cleanup orchestration | M | `t5`, `t9`, `t11`, `t12`, `t13`, `t23`, `t29` | integration: CM-S3-EXPIRY: actual end/exact deadline/restart during use/construction/probe/conversion/close failure; zero leaked handles; integration: CM-S3-RECONNECT: before-deadline resume preserves entries and cancels revoked-generation work | [[c1]] [[c3]] [[c4]] |
| 31 | **`t31`** Prove actual SQL/KV and socket owner isolation end to end | M | `t8`, `t12`, `t13`, `t15`, `t20`, `t23`, `t26`, `t27`, `t29`, `t30` | integration: CM-S3-ISOLATION: two real workbenches/roots SQL+KV positive rows, replay and full route canary snapshots | [[c1]] [[c4]] [[c6]] |
| 32 | **`t32`** Prove native and converted file session isolation matrix | M | `t8`, `t12`, `t13`, `t15`, `t20`, `t23`, `t26`, `t27`, `t29`, `t30`, `t31` | integration: CM-S3-FILES: native and converted actual source/compiled matrix, distinct rows, overbudget/unsupported negative controls | [[c1]] [[c4]] [[c6]] |
| 33 | **`t33`** Finalize inventory, compatibility and disabled capability evidence | M | `t32` | integration: CM-S3-INVENTORY: final resolved production site audit and saved compatibility regressions; integration: CM-S3-GATE: stale/missing/mixed source+compiled evidence fails closed and release stays disabled; live: CM-S5-LIFETIME-COPY: external S005 both-client pre-add copy evidence recorded pending only; this task does not implement or claim client acceptance | [[c1]] [[c4]] [[c5]] [[c6]] [[c7]] |
| 34 | **`t34`** Run final build and one full regression sweep after all implementation | M | `t33` | smoke: CM-S3-SWEEP: final Node22 build then one full regression sweep after t1-t33; report failures/skips/timeouts/TODO and pending gates | [[c4]] [[c5]] [[c6]] |

### 1.1 E20261025484fcef7:S003:T001 — Inventory production consumers and install fail-closed internal execution contracts

Extend src/daemon/db/__tests__/connection-source-inventory.ts using TypeScript-resolved aliases/factories/serializers and the two S003 evidence inventories. Add immutable normalized internal authority/root/revision/policy/provider/diagnostic/lifetime interfaces at src/shared/step-context.ts and consuming context type boundaries. Saved entry uses explicit saved tuple; session mode unavailable until all gates verified.

**Acceptance checks:**
- No unclassified resolver, provider, diagnostic or serialization site remains; exclusions have reasons.
- Existing saved consumers compile without enabling temporary capability; missing session policy never defaults saved.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.2 E20261025484fcef7:S003:T002 — Implement in-memory session lifecycle and control ownership

Add proposed daemon-owned session module alongside src/daemon/db/management.ts. Implement open/resume/current control generation/heartbeat with injected monotonic clock, random256-bit handle/capability, digest verification,30s heartbeat and90s lease; root eligibility consumes S001 canonical validation.

**Acceptance checks:**
- Exact deadline expires first; panel/root switch preserves overlays; stale generation cannot heartbeat/end.
- 64-session bound enforced before allocation; restart has no session recovery or disk/keychain writes.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.3 E20261025484fcef7:S003:T003 — Implement data-only root and audience delegations

Extend session owner with at most32 server-held root/control-generation-bound data delegations, distinct from control token. Bind workbench-ui/mcp-unverified audience to server state and multiple data socket attachments.

**Acceptance checks:**
- Data tokens cannot resume/heartbeat/end/delegate; control tokens cannot attach as data.
- Resume revokes old data generation and cancels its admitted work; forged labels cannot promote audience.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.4 E20261025484fcef7:S003:T004 — Register bounded session RPC and main-daemon routing

Extend src/shared/connection-management.ts, src/daemon/connection-management-rpc.ts, src/daemon/request-context.ts, src/daemon/server.ts and src/daemon/threads/method-class.ts with strict open/resume/attach/delegate/heartbeat/end decoders and trusted attachment. Enforce method allowlist before worker dispatch, including all owner mutations and unattached legacy writers.

**Acceptance checks:**
- Malformed/oversize/wrong-root/wrong-epoch calls refuse before runner/store access.
- Session persistence-capable workflow/build/review/tracker methods refuse; ordinary saved-only methods retain compatibility.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.5 E20261025484fcef7:S003:T005 — Propagate trusted stream context and real request drains

Extend StreamHandler/directDispatch in src/daemon/server.ts, RequestLifetime integration and src/daemon/threads/maintenance-entry.ts/router.ts/channel.ts so streams receive additive fourth trusted context. Maintenance hold covers handler completion AND registered drains after terminal frame, disconnect or delivery failure.

**Acceptance checks:**
- Server mints authority independently of params; unary and stream cancellation preserve all registered drains.
- Exclusive maintenance cannot begin after done/error or disconnect while real handler/cleanup still runs.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.6 E20261025484fcef7:S003:T006 — Implement memory-only temporary entries and credential generations

Add owner overlay (session,canonical root,id), immutable config/credential generation and safe profile projection using existing S001 runtime preparation. No saved pool or keychain fallback;64 entries/8MiB cumulative config per session,256MiB file policy retained.

**Acceptance checks:**
- Keep/replace/clear select only owner's prior generation; safe reads omit private material.
- Create/update/list snapshots show zero registry/keychain/journal/cache writes; limits refuse without partial mutation.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.7 E20261025484fcef7:S003:T007 — Implement session tickets, receipts and replay reconciliation

Use existing sc2 wire contracts with session-private signing/HMAC keys, atomic in-memory entry/revision/receipt commit and separate activation outcome. Cap16384 receipts; expiry=min90s/current signed lease, with no eviction of live history.

**Acceptance checks:**
- Identical concurrent/lost-response replay commits once; changed payload rejects; expired unreceipted is reconciliation-required.
- Expired ticket with committed receipt remains reconcilable while session lives; session/epoch loss always expires it.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.8 E20261025484fcef7:S003:T008 — Close canonical saved/temporary reservation races and alias writes

Install same-root reservation check in adopted legacyUpsert and unmanaged saveConnectionRpc before credentials/writes, integrated through src/daemon/db/management-startup.ts/managed-store.ts/db-rpc.ts. Noncanonical alias/relative/trailing-slash upserts resolving to enrolled root refuse before target access; old exact-path saved targets remain separate.

**Acceptance checks:**
- Canonical saved create and temporary create race both orders in adopted/unadopted and unattached legacy paths; loser makes zero secret/registry writes.
- Preexisting alias-saved-first stays readable only at alias; canonical overlay neither imports nor shadows it; no implicit migration.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.9 E20261025484fcef7:S003:T009 — Construct private temporary drivers and resolver callback leases

Install sessionOverlay in src/daemon/db/pool-cache.ts using owned entries and existing callback lease primitives, not saved DriverPool internals. Pin revision across construction/full callbacks and isolate source/credentials/resources by session/root/revision.

**Acceptance checks:**
- Saved+own overlay list rejects unexpected overlap; wrong/stale binding never falls back saved.
- Active use prevents update, failed/late construction cannot publish after closing, identical IDs across sessions remain independent.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.10 E20261025484fcef7:S003:T010 — Install immutable temporary factory logging authority

Extend DriverFactoryContext in src/shared/db-driver.ts and src/daemon/db/registry.ts with owner-only temporary-quiet authority; add resource-local lazy helper and pass immutable context to every built-in factory/alias. No input config may select authority; unsupported sink support refuses before construction.

**Acceptance checks:**
- All14 concrete driver modules/29 aliases accept owner context; no global logger/env/console mutation.
- Missing policy/support fails before constructor; normal saved construction remains unchanged.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.11 E20261025484fcef7:S003:T011 — Migrate concrete SDK/event diagnostics and prove quiet resources

Apply the installed immutable helper to all concrete drivers/SDKs including PG/Redis listeners, ClickHouse per-client OFF and Memcached logging through idle/reconnect/late event/disposal. Audit every async sink with normal pino-roll daemon child and concurrent saved positive marker.

**Acceptance checks:**
- Actual trace files/stdout/stderr contain no temporary endpoint/data/error canaries even outside callbacks and during drain.
- Saved log marker remains visible; quiet state outlives expiry until owned close, no process-wide silencing.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.12 E20261025484fcef7:S003:T012 — Bind native and converted file resources to session ownership

Consume existing sc8 from src/daemon/db/file-policy.ts and runtime-config.ts for all native/converted readers; identity includes owner/root/id/revision. Prove private memory execution, no spill/cache/INSTALL, cancellation and resource close without redesigning converters.

**Acceptance checks:**
- CSV/TSV/JSON/JSONL/NDJSON/Parquet and converted Avro/BSON/fixed-width/XLSX use production256MiB policy and distinct rows per owner.
- Unsupported Arrow/Feather reader and overbudget input fail explicitly before writes; no green skips or source deletion.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.13 E20261025484fcef7:S003:T013 — Connect temporary edit probing to the S002 preparation seam

Install ConnectionTestPorts.prepareTemporary in src/daemon/connection-management-rpc.ts using owner revision/config generation. Preserve sessionless new draft behavior and unchanged S002 process deadline/cancellation transport.

**Acceptance checks:**
- Temporary edit validates owner/revision before secret preparation or spawn; expiry/abort after awaits prevents late spawn.
- Actual source/compiled probe workers cancel and drain on end; tests do not create entries/receipts or change saved state.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.14 E20261025484fcef7:S003:T014 — Thread trusted context through step host and private MCP bootstrap

Extend src/daemon/steps/host.ts, src/shared/step-context.ts and src/mcp/forward-step.ts: private inherited pipe carries only data token, every new socket attaches before step.call, fourth out-of-band runner context carries normalized tuple. No capability in argv/env/rawArgs/state.

**Acceptance checks:**
- Fresh socket requires epoch/root/audience matching attachment; lost bootstrap refuses without saved fallback.
- Unattached saved MCP remains unchanged; control authority never enters child; caller context cannot forge owner.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.15 E20261025484fcef7:S003:T015 — Enforce unverified-client egress refusal at every analysis phase

Guard src/daemon/steps/analyze-step/handler.ts and answer-turn/phases plan/narrow/bundle plus one-shot entry before runner/continuation/prompt/result/progress/error evidence. Admit supported UI daemon data route only; temporary unverified MCP returns fixed safe refusal.

**Acceptance checks:**
- Actual forwardStep→host all phases and one-shot make zero state/output/provider reads before refusal.
- All response channels contain no data/config canaries; saved-only MCP and admitted UI controls still work.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.16 E20261025484fcef7:S003:T016 — Carry owner resolver context through tools and data runtimes

Update src/analyze/connection-access.ts, runtimes/data/_shared.ts and inventory-listed data/exploration sites plus src/daemon/tools/builtins/db/index.ts and data/schema-drift.ts. ToolDeps and runtime/exploration carriers pass immutable tuple directly; no serialized current-session flag. Required integration surface also includes src/analyze/explore/executor.ts and src/analyze/executor/walker.ts tuple forwarding; src/daemon/db/pool-cache.ts and src/daemon/connection-session-rpc.ts owner checks and actual-work drains for saved substeps; src/daemon/db/session-entries.ts and the additive ConnectionLease.retainWork hook in src/shared/connection-management.ts for metadata filesystem callback retention through abort/end; and src/daemon/tools/executor.ts early/later trusted ToolDeps checks. These are narrow sc5 integrations over existing sc3 lease/guard primitives, preserving saved-only semantics and sc8 resource behavior, not a redesign of adjacent owned contracts.

**Acceptance checks:**
- Each tool/runtime resolves only validated exact-root session overlay and retains callback lease.
- Same ID in other root/session never wins; absent/stale binding rejects, ordinary saved-only/nested scopes retain behavior.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.17 E20261025484fcef7:S003:T017 — Make classifier and every scope-selection path root-bound

Update src/analyze/context/scope.ts, classifier/driver.ts/validate.ts and runtimes/shared/task-scope.ts with same trusted resolver context through classifier/targetHint/prepareScope/stepScope/task-scope. Remove session-path global saved enumeration without changing unattached saved semantics.

**Acceptance checks:**
- Temporary-only ID at attached root succeeds in each production scope path; same-name saved rootB is excluded.
- Unattached saved ambiguity and nested/unregistered scope lookup remain exact; forged target cannot grant root access.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.18 E20261025484fcef7:S003:T018 — Isolate measurement work and retain late-operation drain

Update src/analyze/measure.ts to use context resolver for declared kind, saved-only shared pending map and owner-private active slot by root/id/revision. Duplicate same-owner active measure returns safe busy/undetermined without cross-call cache. Capture real work/drain beyond timeout waiter.

**Acceptance checks:**
- Distinct owners never share listings/credentials/results or cancellation; same-owner concurrent slot bounded.
- Timeout/expiry does not release lease/drain before actual work settles; late errors remain quiet.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.19 E20261025484fcef7:S003:T019 — Close freeform and tool-loop authority relays

Make RunShaperToolLoopArgs and ExplorationRunnerContext carry required normalized tuple at src/analyze/context/driver.ts, explore/types.ts/executor.ts/freeform-probe.ts. Forward SAME tuple through explicit/forced freeform, both measureOwnRequest branches, direct/task legacy loop, tools/providers/final emit.

**Acceptance checks:**
- Missing/expired authority never defaults saved or triggers fallback; saved callers supply explicit normalized saved mode.
- Actual requestSize absent/present and scope variants retain owner/policy/signal/registerDrain/diagnostics through full loop.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.20 E20261025484fcef7:S003:T020 — Bypass exploration and context persistent caches before access

Update src/analyze/explore/executor.ts, src/db/exploration-cache.ts, context/driver.ts/cache.ts and continuation boundaries with sticky session-memory policy. Owner/revision validation precedes any in-memory continuation result reuse; saved cache behavior unchanged.

**Acceptance checks:**
- Session execution never calls persistent cache getters OR setters; warm saved/sessionA never satisfies sessionB.
- Same params after revision change, wrong owner or expiry reject before cached output load; no session material in opaque serialized state.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.21 E20261025484fcef7:S003:T021 — Keep root orchestrator lifecycle and repair in session memory

Update src/analyze/orchestrator/driver.ts/types.ts/live-runs.ts/persistence.ts so runAnalyze/runStages/completeRun/outer error repair carry trusted tuple and avoid durable run records. In-memory continuation is owner/root/revision-bound before lookup; same runId separate across sessions.

**Acceptance checks:**
- Success plus classifier/measure/planner/aggregate failures and repair never access durable run records for session work.
- Owner loss/resume validates before result reuse; saved run records continue ordinary behavior.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.22 E20261025484fcef7:S003:T022 — Propagate owner memory policy through recursive planning

Update src/analyze/planner/recursive.ts/types.ts/cache.ts and child walk handoffs with same normalized authority/policy/lifetime tuple; planner attempts/feedback/final plans stay memory-only. No child can reconstruct saved authority or lose provider admission.

**Acceptance checks:**
- Actual nested planning/measurement/execution/aggregation and cache-resume paths never call persistent planner stores.
- Wrong-owner/stale revision child continuation rejects before load; saved recursive cache behavior remains compatible.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.23 E20261025484fcef7:S003:T023 — Close task, report and serializer persistence sinks

Update src/analyze/executor/walker.ts/cache.ts and inventory-listed task/history/trace/checkpoint/artifact/Lance serialization sites. Carry memory-only results and cancellation end-to-end; session runs cannot dispatch persistence-capable tasks.

**Acceptance checks:**
- Actual task execution/report completion and error repair perform no durable output/cache/history/trace operations.
- Canaries absent from recursive filesystem/LMDB/Lance snapshots and serialized state; saved positive controls still persist normally.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.24 E20261025484fcef7:S003:T024 — Implement provider admission and per-attempt privacy guards

Update src/analyze/context/shaper-provider.ts/role-router.ts, runtimes/shared/aggregator.ts, src/agent/read-only-tool-loop.ts and direct/injected provider paths. Exact selected model/coreFloor preserved. Verified local Ollama-only memory mode; CLI unsupported before prompt/schema/error-file/send/spawn; no weaker fallback.

**Acceptance checks:**
- Injected/spoofed/cached/stale-evidence provider paths and expiry between retries refuse with zero provider/send/spawn/file calls.
- Actual local service privacy smoke is required before production admission; unavailable evidence remains pending and mode refuses.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.25 E20261025484fcef7:S003:T025 — Quiet admitted provider and structured retry diagnostics

Extend src/agent/providers/ollama.ts and structured-output.ts with immutable execution-local quiet diagnostics and nonretryable typed authority/refusal handling. Guard each inner attempt; do not log prompts/raw errors/validation replies for session work.

**Acceptance checks:**
- Actual normal daemon sink excludes request/response/error canaries across retries/late stream failures.
- Concurrent saved provider logging remains visible; expiry/refusal is not converted to structured retry or model fallback.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.26 E20261025484fcef7:S003:T026 — Deny unsupported query embeddings, retrieval and lineage

Guard src/analyze/docs-retrieval.ts, src/indexer/embedder.ts, src/agent/providers/onnx-embedder.ts, src/daemon/tools/builtins/docs/index.ts, data/lineage.ts, graph/index.ts and handler-runtime.ts before session data reaches SDK/ONNX/injected/global embedding paths.

**Acceptance checks:**
- Zero backend/query/log calls for session docs/vector/hybrid/graph/lineage modes under each backend.
- Typed denial survives all catches; no empty-vector/lexical-success fallback; saved retrieval control remains functional.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.27 E20261025484fcef7:S003:T027 — Close adherence topic constraint record persistence

Guard src/analyze/runtimes/shared/adherence-topic-constraints.ts and adherence.ts before filesystem record read/write or nested document enumeration for data/mixed session topics. Explicit in-memory constraints retain admitted provider tuple.

**Acceptance checks:**
- Prewarmed record with canaries is never read/written for session topic route; typed refusal preserved.
- Explicit in-memory constraints execute without record cache; saved topic behavior remains compatible.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.28 E20261025484fcef7:S003:T028 — Quiet analysis runtime and late-operation diagnostics at source

Migrate analysis-side candidates in63-file consumer-diagnostic inventory, including successful schema-table extraction, optional-index failures, measure late callbacks and exploration/task/walker wrappers. Capture immutable lazy quiet sink before formatting; retain it through expiry/abandonment.

**Acceptance checks:**
- Normal trace daemon sink excludes table/query/endpoint/raw-error canaries on analysis success and all late failures.
- Quiet lazy formatter spies remain zero; simultaneous saved diagnostic marker remains visible.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.29 E20261025484fcef7:S003:T029 — Quiet daemon tool/RPC sinks and sanitize result envelopes

Migrate src/daemon/tools/executor.ts, analyze-rpc.ts and remaining inventory-listed RPC/trace/error mapping sites. Prevent raw SDK error strings entering model/tool/error output and logging; preserve fixed typed refusal and request drain through delivery failure.

**Acceptance checks:**
- Actual tool failure and RPC progress/final/error/delivery paths contain no private canaries in logs or envelopes.
- No raw source-bearing formatting happens before quiet check; saved concurrent output/log controls preserve compatibility.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.30 E20261025484fcef7:S003:T030 — Finish session expiry, cancellation and owned cleanup orchestration

Connect ACTIVE→CLOSING→CLOSED owner to admitted runs/probes/drivers/conversions and daemon shutdown. Invalidate authority synchronously, abort only owned work, retain reservations through late construction/use, await actual close/drain; closed cleanup-pending holds safe handles only.

**Acceptance checks:**
- End/heartbeat deadline/restart reject new access immediately and leave zero entries/children/leases/resources after successful cleanup.
- Delayed construction/close failure never yields false success or source deletion; old callbacks cannot republish; reconnect before expiry preserves overlays.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.31 E20261025484fcef7:S003:T031 — Prove actual SQL/KV and socket owner isolation end to end

Use two workbenches/two roots/nested saved directory with real local SQL/KV protocol servers, actual socket/bootstrap/host/stream routes and compiled S002 worker. Execute mutation/replay/list/analysis/expiry with distinct positive credentials/rows and recursive durable sink snapshots.

**Acceptance checks:**
- Production-route owner/root/revision isolation, no-persistence, reconnection and drain proofs pass with positive rows and zero private material in captured sinks.
- Actual provider-service privacy proof recorded pass/fail/pending; S005 and deferred foundation/MSSQL evidence remain pending.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.32 E20261025484fcef7:S003:T032 — Prove native and converted file session isolation matrix

Run actual native CSV/TSV/JSON/JSONL/NDJSON/Parquet and converted Avro/BSON/fixed-width/XLSX session cases against sc8, normal daemon log/filesystem/cache snapshots and compiled probe path. Use distinct source files/rows/owners and delayed conversion/close; no converter redesign.

**Acceptance checks:**
- Session/root/id/revision resource identity and256MiB no-spill policy hold across supported reader matrix, expiry and failed construction.
- Unsupported readers and overbudget input fail explicitly before writes; zero source deletion/cache/INSTALL, no false passing skips.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.33 E20261025484fcef7:S003:T033 — Finalize inventory, compatibility and disabled capability evidence

Re-run TypeScript-resolved full consumer/factory/serializer/sink inventory against completed source; update src/assets/connection-management-gates.json and source/compiled evidence validation without enabling release. Preserve generated relationship docs if implementation matches; regenerate if required.

**Acceptance checks:**
- All CM-S3 proof labels mapped to real evidence; stale/missing/mixed-version evidence fails closed.
- Old saved/nested/alias scopes, pinned families, strict legacy returns and S002 probe tests pass focused regression; diagrams retain rendering-unverified if browser unavailable.
- S001 deferred review, S002 SQL Server/full-sweep issues and S005 copy evidence cannot be silently cleared.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

### 1.34 E20261025484fcef7:S003:T034 — Run final build and one full regression sweep after all implementation

After t1-t28 built and their relevant tests run, use Node22 native ABI, final npm run build and full test sweep. Record exact pass/fail/skip/timeout/TODO results and distinguish unresolved preexisting failures. No repeated broad sweep without new fixes justifying it; do not restart user daemon or enable gate.

**Acceptance checks:**
- Build and one full sweep execute only after all implementation tasks complete; failures documented truthfully, relevant regressions repaired before any justified rerun.
- Final evidence retains external/provider/foundation pending items and release disabled; hand off BUILD for mandatory independent code review and explicit approval.
- Run only relevant focused tests for this task; preserve a passing build and disabled temporary release capability at this intermediate boundary.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| CM-S3-AUTH: real IPC sessions reject forged tokens epochs roots and stale control generations; data attachments cannot heartbeat or end another session. | `t2`, `t3`, `t4` |
| CM-S3-REPLAY: identical concurrent mutations and lost replies reconcile once; changed payloads expired tickets quotas and expired sessions never fabricate not-seen or partial commits. | `t6`, `t7` |
| CM-S3-MEMORY: production temporary create update list activation and replay keep exact registry/keychain/source/cache snapshots unchanged; safe projections and captured durable/stdout/stderr logs omit private config credential and data canaries. | `t6`, `t7`, `t31`, `t32` |
| CM-S3-ISOLATION: real SQL KV and native/converted file callbacks resolve only their session and exact root; identical IDs never share credentials resources or rows. | `t9`, `t31`, `t32` |
| CM-S3-COLLISION: real managed v2 and adopted/unadopted legacy saves from unattached sockets race temporary registration under canonical root gate; one wins and rejected calls perform zero credential or registry writes. | `t8`, `t31` |
| CM-S3-LEASE: revision pin spans the full multi-call callback and failed construction; concurrent update returns busy and resources close only after use drains. | `t5`, `t9`, `t18`, `t30` |
| CM-S3-EXPIRY: end heartbeat loss exact deadline and restart forbid new resolution, abort real operations and probes, await late construction/close and leave zero session entries children leases and resource counters. | `t2`, `t13`, `t30` |
| CM-S3-RECONNECT: control reconnect within90seconds preserves overlays while panel close and root switches do not end session; old control generation cannot renew or end resumed session. | `t2`, `t3`, `t30` |
| CM-S3-CONTEXT: production analyzer runtime exploration measurement db tools schema-drift and MCP consume only validated out-of-band access; missing or lost binding never falls back from temporary to saved. | `t14`, `t16`, `t17`, `t18`, `t19` |
| CM-S3-FILES: every native and converted temporary reader uses existing memory-only sc8 policy with session/root/revision identity; unsupported and overbudget inputs fail before writes or INSTALL. | `t12`, `t32` |
| CM-S3-COMPAT: unattached and nested/unregistered saved scope lookup pinned families strict legacy results and S002 draft probe cancellation remain unchanged. | `t8`, `t13`, `t16`, `t33` |
| CM-S3-CACHE: real executePlan stepPlan context planner task and run paths bypass all persistent reads/writes under session authority; warm saved and sessionA caches never satisfy sessionB, revisions or expired bindings. | `t20`, `t21`, `t22`, `t23`, `t27` |
| CM-S3-STREAM: real unary and streaming directDispatch plus Router propagate server-minted access and drains; forged params cannot attach authority and disconnect/send failure retain cleanup and maintenance exclusion. | `t5`, `t30` |
| CM-S3-MCP: every fresh forwardStep socket attaches its restricted reasoning audience before fixed session-memory refusal; saved-only MCP stays compatible and no temporary continuation/output is exported. | `t14`, `t15` |
| CM-S3-SCOPE: real classifier target-hint prepareScope measure stepScope and task scopes accept a temporary-only ID only at its attached root; same-name saved ID in another root never wins; unattached saved ambiguity and nested roots remain unchanged. | `t17`, `t18` |
| CM-S3-RECURSION: actual runAnalyze runStages completeRun outer error repair and recursive walk retain owner policy through child measurement planning execution aggregation and resume; no durable record read or write occurs on any session branch. | `t21`, `t22`, `t23` |
| CM-S3-PROVIDER: production factory direct injected role-cache tool-loop and aggregation provider paths admit only verified local memory mode; denial precedes send spawn schema/error-file writes and every retry revalidates owner without model downgrade. | `t24`, `t25` |
| CM-S3-ADHERENCE-CACHE: actual data/mixed adherence topic path denies before filesystem constraint-record read/write or nested document enumeration; explicit memory constraints avoid the cache and preserve owner/provider policy. | `t27` |
| CM-S3-EMBED-DENY: real document probes docs_retrieve graph search lineage and embedding RPC paths refuse session data before direct SDK ONNX injected-vector or global embedQuery calls; typed denial never becomes empty-vector fallback. | `t26` |
| CM-S3-CLIENT-EGRESS: actual forwardStep host and every analyze-step phase deny session-bound unverified MCP before state/results/prompts/provider work; no terminal progress or error data escapes, saved-only MCP and admitted UI daemon controls still work. | `t15` |
| CM-S3-DRIVER-LOGS: actual per-resource factory/SDK paths remain quiet through PG/Redis asynchronous errors and disposal in the normal daemon sink; temporary canaries absent while concurrent saved logging control remains visible. | `t10`, `t11` |
| CM-S3-FREEFORM: actual explicit and forced freeform relay forwards one normalized authority policy lifetime and diagnostic tuple through both measurement branches legacy loop tools provider admission and final emit; missing or expired policy never defaults to saved. | `t19` |
| CM-S3-CONSUMER-LOGS: normal daemon sink remains free of successful source metadata and raw rejected/late driver errors across runtime measurement exploration task tool and RPC wrappers; immutable quiet diagnostics outlive expiry while saved logging control remains visible. | `t25`, `t28`, `t29` |
| CM-S3-NAMESPACE: canonical management rejects new alias upserts before access or writes; preexisting exact-path saved-only alias targets stay isolated and never merge or shadow canonical saved/session overlays. | `t8` |
| CM-S3-INVENTORY: type-resolved production source inventory classifies every alias injected resolver factory driver-use and serializer path; no unclassified consumer or authority persistence remains. | `t1`, `t33` |
| CM-S3-GATE: temporary capability fails closed for missing stale source/compiled evidence or incomplete inventory and never enables deferred foundation or SQL Server prerequisites. | `t33` |
| CM-S3-SWEEP: after all implementation tasks run final build and one full regression sweep; record actual failures skips and timeouts and keep release disabled for unresolved prerequisites. | `t34` |
| CM-S5-LIFETIME-COPY: both clients show accurate temporary lifetime explanation before add submission, including retain-on-panel/root-switch and expiry-on-workbench-end lease-loss or daemon-restart; external S005 release evidence pending. | `t33` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S003/LLD.md#2-contract-details`
- **[[c2]]** `prior-artifact` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S003/LLD.md#3-data-model-changes`
- **[[c3]]** `prior-artifact` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S003/LLD.md#6-error-paths`
- **[[c4]]** `prior-artifact` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S003/LLD.md#7-test-strategy`
- **[[c5]]** `prior-artifact` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S003/LLD.md#8-migration`
- **[[c6]]** `prior-artifact` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/HLD.md`
- **[[c7]]** `analyze-bundle` `S003 PLAN context.assemble: approved-design c1-c27 grounding, TypeScript-resolved production inventory in docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S003/evidence/consumer-sites-before.json and diagnostic inventory in docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S003/evidence/consumer-diagnostic-sites-before.json`

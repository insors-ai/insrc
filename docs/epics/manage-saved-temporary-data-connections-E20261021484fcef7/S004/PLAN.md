<!-- insrc:artifact PLAN-484fcef7efaf229e-s4 -->

# Plan: E20261029484fcef7:S004

## Summary

**Epic:** `manage-saved-temporary-data-connections`
**LLD run:** `wf-1793262797285-5ymi1h`
**LLD effective hash:** `dc1a3f91a768...`

Build safe Saved Delete and temporary Discard by extending the existing mutation owners, with atomic receipts, revision/lease barriers and separately retriable resource and credential cleanup. The 24 ordered tasks keep removal capabilities disabled, preserve source data, and make missing service, worker-affinity and S005 client evidence explicit. Run only relevant tests with each task, then a fresh Node22 build and full repository sweep after all implementation is complete. [[c1]]

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define additive sc6 types and strict ticket-only decoders | S | — | unit: CM-S4-INPUT: extend src/shared/__tests__/connection-management.test.ts for exact cleanup/status decoders, wrong mode/target and unchanged receipt keys. | [[c1]] |
| 2 | **`t2`** Implement pure confirmation and removal-state projection | S | `t1` | unit: CM-S4-CONFIRM/STATE: proposed pure-state tests for exact repository/ID/scope, zero-effect cancellation, unknown outcomes and independent cleanup phases. | [[c1]] |
| 3 | **`t3`** Reserve bounded cleanup ownership before removal | M | `t1` | unit: CM-S4-RETIRE: proposed private retirement-owner tests for exact tokens, 64/65 root and 256/257 daemon capacity, cancellation and already-owned shutdown drains. | [[c1]] |
| 4 | **`t4`** Add strict Saved DriverPool retirement ports | M | `t3` | integration: CM-S4-RETIRE/INVALIDATE: extend src/daemon/db/__tests__/connection-leases.test.ts with paused/failed SDK close, late construction, exact revision detachment and retained retry handles. | [[c1]] |
| 5 | **`t5`** Add temporary resource retirement with shared quota retention | M | `t3` | integration: CM-S4-RETIRE/TEMP: extend src/daemon/db/__tests__/session-resources.test.ts and src/daemon/db/__tests__/session-cleanup.test.ts for retained resource slots, cross-root pressure and expiry drains. | [[c1]] |
| 6 | **`t6`** Prepare removal through existing credential journal | M | `t1` | integration: CM-S4-CREDENTIALS: extend src/daemon/db/__tests__/credential-generations.test.ts with empty-staging removal, own/foreign/shared/live references and journal/finalization failures. | [[c1]] |
| 7 | **`t7`** Implement atomic saved removal and canonical replay | M | `t4`, `t6` | integration: CM-S4-SAVED/REPLAY: extend src/daemon/db/__tests__/saved-management.test.ts for atomic row/revision/receipt removal, exact replay and unrelated-document preservation. | [[c1]] |
| 8 | **`t8`** Reconcile ambiguous saved commits without reopening old revision | M | `t7` | integration: CM-S4-REPLAY/RACES: saved-management and credential crash/restart fixtures for rename/fsync ambiguity, response loss, held barriers, receipt expiry/pruning and same-ID recreation. | [[c1]] |
| 9 | **`t9`** Project saved removal state and retry independent cleanup | M | `t2`, `t8` | integration: CM-S4-STATE/CREDENTIALS/RETIRE: saved owner state/retry tests for independent phases, authenticated same-ticket cleanup and restart journal recovery. | [[c1]] |
| 10 | **`t10`** Extend existing SessionOperationLedger for remove receipts | M | `t1` | integration: CM-S4-TEMP-REPLAY: extend src/daemon/db/__tests__/session-ledger.test.ts for remove admission, no fabricated row, 16384-record boundaries and atomic callback/receipt behavior. | [[c1]] |
| 11 | **`t11`** Commit exact temporary overlay removal and quotas | M | `t5`, `t10` | integration: CM-S4-TEMP/INVALIDATE: extend src/daemon/db/__tests__/session-entries.test.ts for exact owner/root/revision, atomic budgets, opaque tokens, stale CAS and retained-ID reservations. | [[c1]] |
| 12 | **`t12`** Project temporary removal and lifecycle cleanup retries | M | `t2`, `t11` | integration: CM-S4-TEMP-REPLAY/NO-PERSIST/STATE: extend src/daemon/db/__tests__/session-owner.test.ts and src/daemon/db/__tests__/session-cleanup.test.ts for retry, expiry/end/resume/restart and zero persistent-port access. | [[c1]] |
| 13 | **`t13`** Wire authenticated saved and temporary removal adapters | M | `t9`, `t12` | integration: CM-S4-INPUT/RPC: extend src/daemon/db/__tests__/connection-management-rpc.test.ts and src/daemon/db/__tests__/connection-session-rpc.test.ts for both scopes, malformed requests, unverified MCP and explicit-saved downgrade refusal. | [[c1]] |
| 14 | **`t14`** Register main-daemon routing and existing owner composition | M | `t13` | integration: CM-S4-RPC/GATE: extend src/daemon/threads/__tests__/method-class.test.ts and actual socket fixtures for handler/allowlist/main routing, old-feature refusal and compiled/source agreement. | [[c1]] |
| 15 | **`t15`** Hold existing-row edit-probe lease through child drain | M | `t4`, `t11` | integration: CM-S4-BUSY: extend src/daemon/db/__tests__/draft-preparation.test.ts and src/daemon/db/__tests__/probe-disposal.test.ts for full edit-probe lease lifetime through child cancellation/timeout/drain. | [[c1]] |
| 16 | **`t16`** Prove owner races and postcommit invalidation | M | `t14`, `t15` | integration: CM-S4-BUSY/INVALIDATE/RETIRE/RACES: controlled callback/iterator/constructor and both-owner interleavings; use explicit fixture barriers and TAP child reporting. | [[c1]] |
| 17 | **`t17`** Verify real SQL and KV source preservation | M | `t16` | live: CM-S4-SOURCE: extend src/daemon/db/__tests__/session-service-isolation.test.ts and existing disposable service fixtures for real PostgreSQL/Redis data preservation and actual connection closure; unavailable prerequisites remain pending. | [[c1]] |
| 18 | **`t18`** Verify native and converted file preservation | M | `t16` | live: CM-S4-FILES/NO-PERSIST: extend src/daemon/db/__tests__/session-file-matrix.test.ts and src/daemon/db/__tests__/session-file-resources.test.ts for actual native/converted source hashes, private runtime cleanup and filesystem canaries. | [[c1]] |
| 19 | **`t19`** Verify production consumer lease affinity or fail closed | M | `t16` | live: CM-S4-AFFINITY: production analysis/tool/probe owner-affinity acceptance in single-thread and threads-enabled modes, or explicit pre-use refusal; unsupported architecture remains pending. | [[c1]] |
| 20 | **`t20`** Verify secret, capability and temporary persistence boundaries | M | `t14`, `t16` | integration: CM-S4-PRIVACY/NO-PERSIST: extend src/daemon/db/__tests__/session-driver-logs.test.ts and src/daemon/db/__tests__/composed-probe-logs.test.ts with fixed SDK/journal canaries and poisoned persistence ports. | [[c1]] |
| 21 | **`t21`** Run focused compatibility regressions for existing consumers | M | `t17`, `t18`, `t19`, `t20` | integration: CM-S4-COMPAT: relevant existing shared wire, saved-management, connection-reservations, session-ledger/entries/owner, draft-preparation and probe-disposal regression files only; explicit TAP for parsed child output. | [[c1]] |
| 22 | **`t22`** Update removal source/compiled inventory without release activation | M | `t21` | integration: CM-S4-GATE: extend src/daemon/db/__tests__/session-release-gate.test.ts and src/daemon/db/__tests__/session-source-inventory.test.ts for private matching-build positives and stale/mixed/missing negatives; shipped prerequisites stay disabled. | [[c1]] |
| 23 | **`t23`** Maintain S004 artifacts and S005 consumer handoff | S | `t22` | smoke: CM-S4-CLIENT: verify backend contract/handoff fixtures against approved sc6 states and generated source artifacts; record both-client rendering/keyboard acceptance pending S005, not a backend pass. | [[c1]] |
| 24 | **`t24`** Run final Node22 build and complete repository test sweep | M | `t23` | smoke: CM-S4-SWEEP: fresh npm run build under /opt/homebrew/opt/node@22/bin/node, then npx tsx --test 'src/**/__tests__/*.test.ts' with Node22 on PATH after all implementation tasks; complete manifests/logs/outcomes and LLD evidence matrix. | [[c1]] |

### 1.1 E20261029484fcef7:S004:T001 — Define additive sc6 types and strict ticket-only decoders

Extend only the new RemovalState and cleanup/status request surfaces in src/shared/connection-management.ts and src/shared/connection-management-wire.ts; shared remove modes, existing tickets/receipts and protocol version remain unchanged. [[c1]] Implements LLD §2.1–2.2; migration step 1.

**Acceptance checks:**
- Exact ticket-only input rejects excess fields and non-remove tickets; independent credentialCleanup/resourceCleanup remain sc6 projections. [[c1]]
- Existing create/update/remove decoder fixtures and persisted receipt keys remain unchanged; sc6 capability is disabled. [[c1]]

### 1.2 E20261029484fcef7:S004:T002 — Implement pure confirmation and removal-state projection

Add a proposed pure daemon/shared state helper, using the approved RemovalState contract, with no UI layout or side effects. [[c1]] Implements LLD §2.1–2.2; CM-S4-CONFIRM/STATE.

**Acceptance checks:**
- Confirmation identifies exact repository, ID and scope, promises source-data preservation and cancels before ticket issuance. [[c1]]
- Absent row or not-seen never means removed; independent pending phases, unknown, stale and busy map to fixed safe states. [[c1]]

### 1.3 E20261029484fcef7:S004:T003 — Reserve bounded cleanup ownership before removal

Add a proposed private retirement-capacity helper consumed by current pool/overlay owners, rather than new transaction/signing/lease authorities. [[c1]] Implements LLD §2.3/2.6; retirement bounds.

**Acceptance checks:**
- Reserve 64 explicit-removal records per canonical root and 256 daemon-wide before commit; reject capacity exhaustion without eviction or registration effects. [[c1]]
- Opaque operation/revision-bound tokens prevent fabricated/cross-owner use; cancellation releases only uncommitted reservations; shutdown drains already-owned handles without new quota admission. [[c1]]
- Exercise 64/65-per-root and 256/257-daemon admission, cross-root/session resource pressure, cancellation and idempotent cleanup; capacity failure changes no registration. [[c1]]

### 1.4 E20261029484fcef7:S004:T004 — Add strict Saved DriverPool retirement ports

Extend src/daemon/db/pool.ts with prepareRemoval/commitRemoval/cancelRemoval, consuming src/daemon/db/lease-gate.ts rather than new counters. [[c1]] Implements LLD §2.6; CM-S4-RETIRE/INVALIDATE.

**Acceptance checks:**
- Detachment and old-revision invalidation are synchronous before cleanup awaits; list/lease/acquire cannot resolve the retired generation. [[c1]]
- Strict close retains exact failed SDK/build handles for retry; existing swallowed closeEntry errors cannot imply success; late construction and cancellation preserve ownership. [[c1]]

### 1.5 E20261029484fcef7:S004:T005 — Add temporary resource retirement with shared quota retention

Extend src/daemon/db/session-resources.ts and the existing session resource-budget ports, consuming S001 runtime/file cleanup unchanged. [[c1]] Implements LLD §2.5; temporary resource retirement/budgets.

**Acceptance checks:**
- Retired temporary handles stay memory-only and reserve one existing session resource slot until close completes across roots. [[c1]]
- Failed closes retain exact handles; session end/expiry/shutdown cancel/drain owned resources without fresh admission or arbitrary source cleanup. [[c1]]

### 1.6 E20261029484fcef7:S004:T006 — Prepare removal through existing credential journal

Add the narrow removal-preparation port to CredentialGenerations in src/daemon/db/secrets.ts and its existing journal collaborator; do not invent another journal/schema. [[c1]] Implements LLD §2.3; CM-S4-CREDENTIALS.

**Acceptance checks:**
- Journal empty ownedStagedRefs with registry generation before commit; no plaintext secret read or new credential generation. [[c1]]
- Cleanup targets only app-owned obsolete refs unreferenced by every remaining row; foreign/shared/live refs survive and failures remain recoverable. [[c1]]

### 1.7 E20261029484fcef7:S004:T007 — Implement atomic saved removal and canonical replay

Implement the remove branch in src/daemon/db/management.ts using the existing ManagedRegistry apply/receipt transaction in src/daemon/db/managed-store.ts. [[c1]] Implements LLD §2.1/2.3; CM-S4-SAVED/REPLAY.

**Acceptance checks:**
- Receipt/MAC replay precedes absent/current-row checks, including same-ID recreation; changed payload fails and concurrent identical operation shares one outcome. [[c1]]
- Under existing root/revision gate remove selected row/revision and publish exact-shaped removed receipt with fresh operation revision; busy/stale rejection preserves unrelated rows, fields, pinned families and credentials. [[c1]]
- Detach runtime generation synchronously at known commit before releasing barrier; never delete configured files or remote data. [[c1]]

### 1.8 E20261029484fcef7:S004:T008 — Reconcile ambiguous saved commits without reopening old revision

Extend saved owner recovery/status at existing preparation/receipt boundaries for rename/fsync and response-loss ambiguity. [[c1]] Implements LLD §2.3; CM-S4-REPLAY/RACES.

**Acceptance checks:**
- Possibly committed failures retain preparation token, remove barrier and cleanup ownership until canonical receipt establishes commit or noncommit. [[c1]]
- Same-ticket reconciliation detaches on proven commit or cancels reservation on proven noncommit; no generic finally reopens an unresolved old driver. [[c1]]
- Restart, expiry and pruning use existing ticket/receipt rules; new same-ID row never becomes an old-operation cleanup target. [[c1]]

### 1.9 E20261029484fcef7:S004:T009 — Project saved removal state and retry independent cleanup

Implement proposed SavedConnectionManagement.removalState/retryRemovalCleanup using existing credential recovery and strict pool retirement. [[c1]] Implements LLD §2.2/2.3; CM-S4-STATE/CREDENTIALS/RETIRE.

**Acceptance checks:**
- Authenticate root and remove ticket before lookup; only exact operation/revision cleanup is retried and committed removal never reruns or rolls back. [[c1]]
- SDK cleanup and credential cleanup report independently; pending survives close/finalization failures and removed requires both complete. [[c1]]
- After restart old-process runtime handles are gone while durable credential recovery may remain pending; safe fixed errors reveal no payload. [[c1]]

### 1.10 E20261029484fcef7:S004:T010 — Extend existing SessionOperationLedger for remove receipts

Widen issue/inspect/mutate remove admission in src/daemon/db/session-ledger.ts and refactor internal commit callback to return revision rather than fabricated SafeConnection. [[c1]] Implements LLD §2.4; CM-S4-TEMP-REPLAY.

**Acceptance checks:**
- Derive removed/not-applicable/credentialCleanup complete from validated request mode; wire callers cannot choose outcome phases. [[c1]]
- Synchronous publication and private receipt form one non-awaiting commit, preserving the 16384-record quota, in-flight replay/MAC identity and unexpired retention. [[c1]]
- Owner expiry wins across awaits; no temporary tombstone or alternate ledger persists. [[c1]]

### 1.11 E20261029484fcef7:S004:T011 — Commit exact temporary overlay removal and quotas

Add opaque prepareRemoval/commitRemoval ports to src/daemon/db/session-entries.ts using the existing root/revision mutation barrier and exact session owner. [[c1]] Implements LLD §2.5; CM-S4-TEMP/INVALIDATE.

**Acceptance checks:**
- Delete only selected root/id/revision with config-byte budget release and private receipt in one turn; unaffected roots, owners, entries and delegations survive. [[c1]]
- Busy/stale/expired attempts have no effects; prepared edits fail revision CAS after discard; old generation stops resolving before close. [[c1]]
- Pending runtime cleanup retains session resource slot and removed-ID reservation until completion; fresh same-ID generation cannot be targeted by stale tokens. [[c1]]

### 1.12 E20261029484fcef7:S004:T012 — Project temporary removal and lifecycle cleanup retries

Extend src/daemon/db/session-management.ts and current session owners with operation-bound state/cleanup retry over the existing private ledger/resource ownership. [[c1]] Implements LLD §2.2/2.4–2.5; CM-S4-TEMP-REPLAY/NO-PERSIST.

**Acceptance checks:**
- Temporary retries touch only exact memory handles; registry/keychain ports remain untouched and never reconstruct configuration. [[c1]]
- Session end/expiry/epoch change revokes receipt/capability truth; status then fails session-expired, even for unexpired ticket. [[c1]]
- Cleanup completion releases reservations exactly once; activation retry cannot reopen removed or recreated revisions. [[c1]]

### 1.13 E20261029484fcef7:S004:T013 — Wire authenticated saved and temporary removal adapters

Extend src/daemon/connection-management-rpc.ts and src/daemon/connection-session-rpc.ts to admit gated remove and the two new sc6 ticket-only endpoints. [[c1]] Implements LLD §2.1–2.2; CM-S4-INPUT/RPC.

**Acceptance checks:**
- Authorize before receipt/cleanup lookup; temporary requests require current workbench-ui owner/root/generation; unverified MCP is denied. [[c1]]
- Explicit saved channel never strips a presented session to downgrade authority; noncanonical/unregistered roots fail closed. [[c1]]
- Missing sc6 capabilities return upgrade-required before ticket issue; no unknown-method or legacy-delete fallback. [[c1]]

### 1.14 E20261029484fcef7:S004:T014 — Register main-daemon routing and existing owner composition

Register endpoints in the existing handler table, main-daemon connection-method set and session allowlist together; wire current installed owners without duplicating pools or stores. [[c1]] Implements LLD interactionWithShared sc1/sc3/sc5; CM-S4-RPC/GATE.

**Acceptance checks:**
- Both scopes and state/cleanup methods route to main; source/compiled method classifications agree and unsupported worker routes refuse. [[c1]]
- Existing startup/maintenance enablement remains authoritative; sc6 stays unadvertised and no daemon/global config is silently changed. [[c1]]
- Actual IPC fixtures prove exact shapes, unchanged v2 status and absent-feature behavior. [[c1]]

### 1.15 E20261029484fcef7:S004:T015 — Hold existing-row edit-probe lease through child drain

Use the existing sc3 lease in src/daemon/db/draft-probe.ts and its current preparation/transport callers through full stored-revision edit-probe child lifetime. [[c1]] Implements LLD §2.3; CM-S4-BUSY.

**Acceptance checks:**
- Existing-row probes block removal until actual child close/drain, including timeout, cancellation, spawn/constructor failure and late completion. [[c1]]
- Release exactly once after drain; unsaved draft probes never gain fictitious stored-revision ownership; S002 probe transport semantics remain unchanged. [[c1]]

### 1.16 E20261029484fcef7:S004:T016 — Prove owner races and postcommit invalidation

Add controlled interleaving regression coverage around both existing owners and strict cleanup, using barriers rather than timing assumptions. [[c1]] Implements CM-S4-BUSY/INVALIDATE/RETIRE/RACES.

**Acceptance checks:**
- Cover remove/remove, remove/update, remove/acquire and cleanup/create with callback/iterator/constructor/probe lifetimes. [[c1]]
- No list/lease/acquire resolves old revision after commit while close is paused; old cleanup never closes a recreated generation. [[c1]]
- Counter/receipt/budget ownership remains exact across failed and repeated cleanup and ambiguous Saved classification. [[c1]]

### 1.17 E20261029484fcef7:S004:T017 — Verify real SQL and KV source preservation

Extend existing service fixtures for actual PostgreSQL and Redis removal lifecycle acceptance; use test-owned resources and recorded prerequisites. [[c1]] Implements CM-S4-SOURCE; migration prerequisite preservation.

**Acceptance checks:**
- Seed source rows/keys, remove registration and verify data survives while app-owned connections really close. [[c1]]
- Cover cleanup failure/retry and same-ID recreation without fake drivers substituting for actual lifecycle evidence. [[c1]]
- Unavailable real prerequisites are recorded pending with exact reason; SQL Server/provider gaps are not marked complete or silently skipped. [[c1]]
- Unavailable actual-service prerequisites leave the source-preservation proof pending and cannot be replaced with mocks or a passing coverage claim. [[c1]]

### 1.18 E20261029484fcef7:S004:T018 — Verify native and converted file preservation

Extend existing session file matrix and private runtime fixtures for supported native/converted kinds, consuming unchanged S001 conversion/cache policy. [[c1]] Implements CM-S4-FILES/NO-PERSIST; sc8 consumption.

**Acceptance checks:**
- Hash actual source bytes/directories before and after both scopes' removal; no unlink/truncate/source-directory removal. [[c1]]
- Private DuckDB/conversion handles close or remain truthfully pending; only explicitly app-owned runtime/cache metadata may be retired. [[c1]]
- Temporary inputs and conversion/query spill/log paths remain memory-only; filesystem/canary probes substantiate the no-persistence claim. [[c1]]

### 1.19 E20261029484fcef7:S004:T019 — Verify production consumer lease affinity or fail closed

Exercise threads-enabled and single-thread production analysis/tool/probe routes against the exact management owner, without implementing the separately deferred worker-crossing redesign. [[c1]] Implements CM-S4-AFFINITY; LLD sc3 release prerequisite.

**Acceptance checks:**
- Cover stored-revision analysis, tools, iterators, constructors and edit probes; main-only unit success is insufficient for global busy claims. [[c1]]
- Every admitted route shares exact lease authority; unsupported routes must refuse before use and stay release-blocking. [[c1]]
- Record unresolved all-consumer proof as pending in release evidence; no architecture expansion or false sc3 completion. [[c1]]

### 1.20 E20261029484fcef7:S004:T020 — Verify secret, capability and temporary persistence boundaries

Add canary and poisoned-port tests across status/error/progress/retry paths and temporary removal, using existing privacy instrumentation. [[c1]] Implements CM-S4-PRIVACY/NO-PERSIST.

**Acceptance checks:**
- No raw endpoint/options/source contents/credentials/refs/session capabilities enter wire replies, logs, prompts, receipts, telemetry, checkpoints or artifacts. [[c1]]
- Temporary discard/state/retry performs zero registry/keychain/persistent-cache access; owner loss cannot recover temporary state. [[c1]]
- Errors are bounded fixed safe messages, including underlying SDK close and journal failures. [[c1]]

### 1.21 E20261029484fcef7:S004:T021 — Run focused compatibility regressions for existing consumers

Run relevant create/update, legacy saved, profile/pinned-family, alias/nested read and S002/S003 lifecycle regression files after removal integration. [[c1]] Implements CM-S4-COMPAT; LLD migration.backwardCompat.

**Acceptance checks:**
- Existing signed ticket/receipt/OperationStatus exact shapes, default saved lookup, credential patch behavior and strict legacy semantics remain compatible. [[c1]]
- No managed remove falls back to legacy delete; prior session/probe cancellation/expiry and supported file-kind behavior stay intact. [[c1]]
- Run only this task's focused regression set, preserve failures and raw output; no full repository sweep yet. [[c1]]

### 1.22 E20261029484fcef7:S004:T022 — Update removal source/compiled inventory without release activation

Classify S004 changed sources and consumers in the existing gate evidence; extend only private matching-build verifier fixtures and negative cases. [[c1]] Implements CM-S4-GATE; migration steps 1/3/6.

**Acceptance checks:**
- Matching private fixtures are positive; stale/mixed/missing source, compiled maps, inventories or evidence refuse. [[c1]]
- Do not automatically refresh shipped hashes into a released state; all pending external/foundation/affinity/client prerequisites remain explicit. [[c1]]
- No saved-remove/temporary-remove/sc6 capability is advertised or global enablement changed by this Story. [[c1]]

### 1.23 E20261029484fcef7:S004:T023 — Maintain S004 artifacts and S005 consumer handoff

Keep approved definitions/companions consistent with implemented relationships/flows and document exact sc6 confirmation/state/cleanup contract for S005. [[c1]] Implements CM-S4-CLIENT; LLD diagrams/migration/adjacent boundaries.

**Acceptance checks:**
- Record migration/drain/downgrade behavior, no data rewrite, nonrollbackable user removal and restart cleanup truth; no automatic config/credential resurrection. [[c1]]
- Supply contract fixtures for Delete/Discard, cancel, busy/conflict, unknown and cleanup-pending; both-client rendering/keyboard acceptance is explicitly pending S005. [[c1]]
- Preserve historical S003 full-sweep failures/reruns, SQL Server/provider gaps, release prerequisites and actual diagram verification limits; no frontend implementation here. [[c1]]

### 1.24 E20261029484fcef7:S004:T024 — Run final Node22 build and complete repository test sweep

After every implementation and focused-validation task is complete, freeze the source/test manifest, run a fresh Node22 npm build and the full repository test command once; retain complete raw evidence. [[c1]] Implements CM-S4-SWEEP; migration step 5.

**Acceptance checks:**
- Record exact tested commit/tree and source manifest with no drift; capture build and every discovered test file using Node22, preserving normal live-service gates. [[c1]]
- Preserve original pass/fail/skip/TODO counts and known worker-store/file-refusal/shutdown-under-load findings; isolated diagnostic reruns never replace original totals. [[c1]]
- Report unresolved prerequisites and failures honestly; no t34/S003 relabeling, release activation or automated code-review invocation. Any later implementation change requires its relevant retest and justified final revalidation. [[c1]]
- Produce a final LLD acceptance matrix marking every CM-S4 subject proved, failed or pending; S005 client acceptance, unsupported affinity and SQL Server/provider limitations remain explicit. Planned coverage is never completed evidence. [[c1]]

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| CM-S4-CONFIRM: exact ID/scope/repository copy and source-data guarantee; cancel causes zero ticket/mutation/credential/cleanup calls | `t2`, `t23` |
| CM-S4-INPUT: signed remove target and expected revision; reject extra patch/credentials, changed payload, scope/mode/root mismatch and malformed cleanup ticket | `t1`, `t13` |
| CM-S4-STATE: committed removal and independent credential/resource phases project correctly; absent row/not-seen is never removed | `t2`, `t9`, `t12` |
| CM-S4-SAVED: atomic selected-row/revision removal plus exact receipt; preserve unrelated document bytes/semantics, pinned families and all other rows | `t7` |
| CM-S4-REPLAY: same-operation concurrent replay and changed-payload refusal; lost response, rename/fsync ambiguity, expiry, receipt pruning and same-ID recreation | `t7`, `t8` |
| CM-S4-CREDENTIALS: only obsolete app-owned refs retire; preserve foreign/shared/live refs; deletion and finalization failures remain pending and recover after restart | `t6`, `t9` |
| CM-S4-TEMP: exact owner/root/revision discard and quota changes atomic with memory receipt; unaffected roots, owners and delegations survive | `t5`, `t11` |
| CM-S4-TEMP-REPLAY: concurrent replay, stale staged edit, new same-ID revision, expiry/end/resume/restart and receipt-capacity boundaries | `t10`, `t12` |
| CM-S4-NO-PERSIST: poison registry/keychain/cache/checkpoint/log/telemetry ports; assert zero access and no config/capability/canary persistence | `t12`, `t18`, `t20` |
| CM-S4-BUSY: callback/iterator/constructor and existing-row edit-probe use blocks remove, with exactly-once lease/drain release | `t15`, `t16` |
| CM-S4-INVALIDATE: no new list/lease/acquire resolves removed generation before cleanup finishes; late staged writes fail CAS | `t4`, `t11`, `t16` |
| CM-S4-RETIRE: unused, late-building, idle and close-failing resources retain exact cleanup ownership; retry never selects a new same-ID generation | `t3`, `t4`, `t5`, `t9`, `t16` |
| CM-S4-RACES: controlled root-gate ordering for remove/remove, remove/update, remove/acquire and cleanup/create; no timing-based Promise.all ordering assumptions | `t8`, `t16` |
| CM-S4-SOURCE: real PostgreSQL and Redis rows remain intact after removal, while app connections/owned handles really close | `t17` |
| CM-S4-FILES: actual supported native/converted file bytes and directories remain intact; only owned sc8 runtime/cache metadata may close | `t18` |
| CM-S4-AFFINITY: threads-enabled and single-thread production analysis/tool/probe routes share exact management lease authority, or are refused before unsupported use; main-only unit tests cannot satisfy global busy acceptance | `t19` |
| CM-S4-RPC: both scopes route new sc6 state/cleanup methods to main; old/missing feature refuses; unverified MCP denied before lookup; explicit saved channel never strips a presented session | `t13`, `t14` |
| CM-S4-COMPAT: create/update, strict legacy shapes, read-only nested/alias targets, descriptor/pinned-family behavior and S002/S003 lifetime tests remain green | `t21` |
| CM-S4-PRIVACY: fixed safe status/error/progress/retry output; no endpoint/config/source contents/credential refs or capabilities emitted | `t20` |
| CM-S4-GATE: mixed/stale/missing source+compiled/inventory/evidence refuses; private positive verifier fixture uses matching current build maps, never relabels shipped prerequisites | `t14`, `t22` |
| CM-S4-CLIENT: S005 consumes exact Delete/Discard confirmation, cancel, busy/stale, unknown and cleanup-pending models in both clients; external client rendering/keyboard acceptance remains pending until S005 proves it | `t23` |
| CM-S4-SWEEP: each task runs relevant tests; after all implementation run fresh Node22 build and one full sweep, preserve exact outcomes and existing worker-store/file-refusal/shutdown-under-load findings | `t24` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s4 contractDetails, dataModelChanges, interactionWithShared, errorPaths, testStrategy, migration, erDefinition and sequenceDefinition` — "Approved LLD-484fcef7efaf229e-s4; review pass and user approval recorded before planning."

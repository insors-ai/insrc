<!-- insrc:artifact PLAN-c32aa60534232f36-s4 -->

# Plan: STORY-c32aa60534232f36-s4

## Summary

**Epic:** `review-planned-changes-through-agent-investigation`
**LLD run:** `wf-1793260444044-b8iv7o`
**LLD effective hash:** `12565b4b7f9e...`

Build a durable recovery layer around the existing per-block review protocol, with verified replay and one current owner. Prove crash handling early, preserve execution and usage accounting through interruptions, then validate the integrated path with deterministic providers. Production review routing remains unchanged until Story 6.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define recovery contracts and prove crash-test infrastructure | M | — | — | unit: Recovery contract shapes, version and identity refusal; integration: Bounded child-worker handshake kill and reopen feasibility | [[c1]] [[c2]] |
| 2 | **`t2`** Implement private immutable storage and durable journal | M | — | `t1` | unit: Private run paths, canonical immutable values and symlink escape refusal; integration: Blob-before-event durability and append sync fault matrix | [[c1]] [[c3]] |
| 3 | **`t3`** Reconstruct and validate accepted block state | L | — | `t2` | unit: Verified replay recomputes sc2 deltas and rejects forged candidates and corrupt closure; integration: Per-block checkpoint ACK, uncertain receipt replay and snapshot reconstruction | [[c1]] [[c3]] |
| 4 | **`t4`** Fence owners and validate resume compatibility | M | — | `t3` | unit: Resume compatibility, unsupported legacy state and clock rollback; integration: Concurrent owner claims, generation takeover and lost process guard fencing | [[c1]] [[c4]] |
| 5 | **`t5`** Persist attempt reservations and recovery accounting | M | — | `t4` | unit: Reservation settlement, inactive pause and audited extension accounting; integration: Issued-before-dispatch retry identities and uncertain attempt recovery | [[c1]] [[c5]] |
| 6 | **`t6`** Add durable usage observation outbox | M | — | `t5` | unit: Usage identity, null quality counters and conflicting observation refusal; integration: Durable pending-before-write outbox and lost receipt deduplication | [[c1]] [[c6]] |
| 7 | **`t7`** Exclude generated recovery state from source processing | S | — | `t1` | integration: Runtime namespace excluded from Git scope, index and review manifests | [[c1]] [[c3]] |
| 8 | **`t8`** Verify crash recovery and publish internal composition boundary | M | — | `t6`, `t7` | integration: Two-block sc3 session crash resume preserves accepted work and accounting; integration: Source-only and indexed-impact recovery with legacy routing unchanged; smoke: Focused investigation and legacy compatibility suites plus production build | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] [[c6]] |

### 1.1 TASK-c32aa60534232f36-s4-t1 — Define recovery contracts and prove crash-test infrastructure

Add recovery-types.ts exact sc4 projections, internal manifest/event/error types and validation boundaries. Add new recovery-fixtures.ts/recovery-worker.ts child fixture with temporary project root and deterministic fault handshakes; prove parent can stop worker at a known boundary and reopen files. Treat existing s2/s3 contracts as consumed.

**Acceptance checks:**
- ReviewRecoveryV1 and ResumeCompatibilityV1 match approved sc4; strict version/identity/error validation rejects malformed input.
- Child-process fixture reaches deterministic handshake, is killed and reopens the same temporary runtime root; test has bounded timeout and cleanup.
- No shared sc1/sc2/sc3/sc6 signature, MCP or default engine changes.

### 1.2 TASK-c32aa60534232f36-s4-t2 — Implement private immutable storage and durable journal

Add recovery-journal.ts under project/.insrc/review-runs/investigation-v1/<runId> with bounded canonical immutable blobs, no-overwrite installation, file/directory sync and framed hash-chained events. Bind all writes to trusted process guard and root-scoped serialized store registry.

**Acceptance checks:**
- 0700 directories/0600 files; traversal, symlink and cross-run reference escape refused.
- Blob durability precedes event references and event fsync precedes successful append acknowledgment; fail injection yields no false success.
- Event ordinal separate from accepted-block sequence; malformed complete frames fail closed; torn final frame handled only under exclusive owner.

### 1.3 TASK-c32aa60534232f36-s4-t3 — Reconstruct and validate accepted block state

Add recovery-replay.ts and durable staging/append ports in recovery-store.ts. Validate staged block closure, recompute sc2 deltas, preserve basis/trusted receipts and reconstruct accepted ledger/checkpoint/outstanding work. Rebuild snapshots from journal and resolve uncertain ACK idempotently.

**Acceptance checks:**
- Unchanged sc3 coordinator accepts two blocks in one session; journal records each before ACK, independent of final reply.
- Replay verifies all reachable blobs, identities, predecessor and recomputed candidate ledger; forged candidates and missing/corrupt closure refuse.
- Identical progress returns original receipt without sequence or usage increment; conflicting payload refuses.
- Missing/stale/corrupt snapshot rebuilds only from verified journal; prior findings and unresolved impact work cannot disappear.

### 1.4 TASK-c32aa60534232f36-s4-t4 — Fence owners and validate resume compatibility

Complete recovery-store.ts lifecycle: claim/renew/release lease, persistent generation fencing, serialized state changes, restart reconciliation, compatibility and terminal receipt storage. Consume trusted process guard; terminal eligibility/publication remain s5.

**Acceptance checks:**
- Concurrent session claims yield one current owner; expiry/takeover strictly increases generation and late callbacks cannot mutate.
- Lost process ownership, backward wall clock or stale lease refuses writes; restart does not trust old owner.
- Pinned subject/contracts/policy/evidence/tool/provider mismatch reports stale/unsupported with reasons; legacy runs explicitly non-resumable.
- Terminal receipt storage idempotent with conflicting receipt refusal; no completion eligibility or canonical CR authoring added.

### 1.5 TASK-c32aa60534232f36-s4-t5 — Persist attempt reservations and recovery accounting

Add recovery-attempts.ts guarded execution wrapper journaling each dispatch including sc3 retry. Reserve continuation/capped active time before backend call, settle using monotonic actual duration, reconcile interruption as uncertain, preserve accepted blocks and support explicit audited allowance extensions.

**Acceptance checks:**
- Issued identity/request digest and budget reservation durable before every execute; internal retry receives distinct linked attempt record.
- Crash leaves uncertain attempt with consumed continuation and conservative time reservation; accepted blocks retained.
- Settlement replaces only its reservation without double-counting cumulative onState; replay isn't a new call and inactive pause time is uncharged.
- Exhausted allowance pauses with extensionRequired; explicit extension audited; late stale-owner settlement refused.

### 1.6 TASK-c32aa60534232f36-s4-t6 — Add durable usage observation outbox

Add recovery-usage.ts implementing recordAttemptUsage behind existing sc6 type. Persist pending observations before invoking existing usage writer, qualify stable deduplication, record delivery receipts and replay pending work without manufacturing actual usage.

**Acceptance checks:**
- Stable observation identity/digest and issued-attempt attribution validated; conflicting replay refuses.
- Pending entry durable before writer; crash after writer success reuses same deduplication key; unqualified writer remains pending.
- Reported/estimated/unavailable counters remain distinct; null unknowns and native provenance survive restart; allowances never become usage.
- Current owner may record accounting-only usage of cancelled issued attempt; no stale progress authority or new warehouse schema.

### 1.7 TASK-c32aa60534232f36-s4-t7 — Exclude generated recovery state from source processing

Verify and, where necessary, extend existing exclusions for project/.insrc/review-runs/investigation-v1/** across Git attribution, indexing and review manifests. Keep metadata-only legacy diagnostic paths and external registrations unchanged.

**Acceptance checks:**
- Generated runtime blobs/journal/snapshots never enter selected review packets, index entities or review source manifests.
- Existing review diagnostics and legitimate tracked source files retain current behavior; do not broaden exclusion beyond approved runtime namespace unnecessarily.

### 1.8 TASK-c32aa60534232f36-s4-t8 — Verify crash recovery and publish internal composition boundary

Integrate recovery store, guarded backend and unchanged sc3 coordinator with deterministic providers. Test real process crash matrix, indexed/source equivalence, concurrent ownership and combined usage/budget restoration. Export internal recovery surface for s5/s6 and maintain relevant diagrams without activating production routing.

**Acceptance checks:**
- Crash before/after stage, commit sync and ACK restores only verified accepted progress; two accepted blocks survive uncertain enclosing request and only unresolved work redispatched.
- Source-only and indexed-impact replay preserve same subject packets; stale/empty impact remains explicit.
- End-to-end resume preserves findings, evidence, receipt provenance, attempt consumption and pending/unknown usage.
- Focused recovery/investigation and legacy compatibility suites plus production build pass; no live LLM calls or whole repository test sweep.
- Internal exports documented; legacy entrypoints/default selection and sibling-owned MCP/provider/completion behavior remain unchanged.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| recovery journal integrity and snapshots | `t2`, `t3` |
| lease generation and state transitions | `t4` |
| attempt reservation and settlement | `t5` |
| usage outbox idempotency and compatibility | `t6` |
| per-block acceptance survives process restart | `t1`, `t3`, `t8` |
| uncertain append receipt recovery | `t3`, `t8` |
| two-session owner race and stale callback fencing | `t4`, `t8` |
| sc3 execution wrapper journals internal retry attempts | `t5`, `t8` |
| usage delivery crash and replay | `t6`, `t8` |
| missing/corrupt closure fail-closed | `t2`, `t3` |
| ReviewRecoveryV1 and ResumeCompatibilityV1 exact HLD shape | `t1` |
| ReviewRuntimePortsV1 durable implementation with unchanged sc3 coordinator | `t3`, `t8` |
| source-only and indexed basis replay | `t3`, `t8` |
| legacy non-resumable refusal and no production engine activation | `t4`, `t7`, `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/S004/LLD.md#2-contract-details`
- **[[c2]]** `prior-artifact` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/S004/LLD.md#7-test-strategy`
- **[[c3]]** `prior-artifact` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/S004/LLD.md#3-data-model-changes` — "Recovery journal event; BlockProgressTransitionV1; runtime namespace exclusion."
- **[[c4]]** `prior-artifact` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/S004/LLD.md#6-error-paths` — "Concurrent resume or late worker; stale compatibility and lost ownership."
- **[[c5]]** `prior-artifact` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/S004/LLD.md#3-data-model-changes` — "Attempt recovery and budget reservation."
- **[[c6]]** `prior-artifact` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/S004/LLD.md#3-data-model-changes` — "Usage outbox."

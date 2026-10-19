<!-- insrc:artifact PLAN-670419c4ad8bea8e-s1 -->

# Plan: E20261017670419c4:S001

## Summary

**Epic:** `understand-changes-before-committing`
**LLD run:** `wf-1792240611397-p3t0ur`
**LLD effective hash:** `0b18f1868092...`

Build the daemon foundation that keeps personal understanding checks recoverable and private. Reuse existing storage, transport and lifecycle infrastructure, with strict identity, revision and deletion checks. Verify provider identity sources explicitly and deliver tested contracts for the later assessment and editor stories.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Resolve learner identity and verify adapter sources | M | — | unit: Identity source precedence, authority separation and no automatic merge; integration: Provider source matrix and available/disconnected/missing/failed adapters; Git/OS fallback | [[c1]] |
| 2 | **`t2`** Define validated assessment and transport contracts | M | `t1` | unit: Scope fingerprint full-field vectors and strict schemas; unit: sc4 confidence fidelity and public projection key exclusion | [[c2]] |
| 3 | **`t3`** Add assessment storage namespaces | M | `t2` | integration: Open complete namespace inventory fresh and existing; retain old data; integration: Reject missing/corrupt/future schema; owner-index pagination | [[c3]] |
| 4 | **`t4`** Implement atomic mutations and resumable records | M | `t3` | integration: Concurrent CAS, exact replay, request conflict and transaction rollback; integration: Immutable original and assisted attempts resume after reopen | [[c4]] |
| 5 | **`t5`** Implement recovery, deletion and local privacy | M | `t4` | integration: Interrupted job recovery and late completion rejected; integration: Deletion races, owner isolation, permission checks and log redaction | [[c5]] |
| 6 | **`t6`** Expose daemon RPC and watch protocol | M | `t5` | integration: RPC forged-input rejection and typed revision-conflict result; integration: Real watch framing, snapshot race, reconnect, terminal and abort fixtures | [[c6]] |
| 7 | **`t7`** Integrate startup, shutdown and reasoning roles | M | `t6` | unit: Five understanding roles critical/core and missing-role failure; integration: Healthy shutdown frame flush and bounded failure paths; integration: Preserve locks-lost exit and existing daemon shutdown regressions | [[c7]] |
| 8 | **`t8`** Verify story acceptance and publish consumer fixtures | M | `t7` | integration: All three ACs: durability, unchanged delivery and no false pass; smoke: Build and affected storage, server, shutdown and role regression suites | [[c8]] |

### 1.1 E20261017670419c4:S001:T001 — Resolve learner identity and verify adapter sources

Implement approved identity resolver and local principal binding; document each GitHub/GitLab/Jira adapter's actual module, authenticated metadata source, stable-ID field and unavailable behavior. Reuse existing connections; no login flow or account inference from remote ownership.

**Acceptance checks:**
- Single connected identity wins; multiple use repository Git email; no usable provider/Git identity falls back to OS
- No automatic identity merge, case folding, agent/commit-author substitution or raw identity logging
- Missing adapter is explicit; an available authenticated identity is discovered rather than silently ignored
- Add and pass focused tests for this task before proceeding.
- Source matrix names actual module/source/stable-ID field per provider, or evidence of missing integration; fixtures distinguish disconnected, unavailable lookup and missing adapter.

### 1.2 E20261017670419c4:S001:T002 — Define validated assessment and transport contracts

Implement sc1/sc2 types, runtime schemas, canonical scope tuple and safe public projections; private payload validation is extended by sibling-owned domain schemas.

**Acceptance checks:**
- Fingerprint includes every exact sc1 field, commitMode and ordered parents
- Retain sc4 unsure/low/medium/high confidence; distinguish unanswered drafts
- Malformed fields, forged authority, unsupported versions and missing domain handlers fail closed
- Add and pass focused tests for this task before proceeding.

### 1.3 E20261017670419c4:S001:T003 — Add assessment storage namespaces

Add eight GraphStore namespaces and typed access layer, raise MAX_DBS to64; initialize independent assessment schema version1 without rewriting existing data.

**Acceptance checks:**
- All35 named databases open on fresh and existing stores
- Collision-free keys, owner/scope indexes and bounded pagination
- Malformed/newer/missing schema with existing data never resets or passes
- Add and pass focused tests for this task before proceeding.

### 1.4 E20261017670419c4:S001:T004 — Implement atomic mutations and resumable records

Implement prepare/resume/cancel and internal validated mutation boundary with immutable attempts/audit and request deduplication; sibling authorization unavailable.

**Acceptance checks:**
- Current/history/index/request updates atomic, acknowledged only after commit
- Stale revision conflicts return owner projection; exact replay no duplicate attempt; changed payload conflicts
- No delivery mutation, LLM call, pass or receipt from foundation alone
- Add and pass focused tests for this task before proceeding.

### 1.5 E20261017670419c4:S001:T005 — Implement recovery, deletion and local privacy

Recover interrupted jobs; enforce owner-only access and local filesystem permissions; delete all record families and invalidate late callbacks and in-memory state.

**Acceptance checks:**
- Restart retains attempts but revokes uncertain authorizations
- Delete races/retries cannot resurrect history; no automatic TTL/sharing
- Different owners cannot read/list/delete/watch; permissions fail closed; logs omit answers and identity
- Add and pass focused tests for this task before proceeding.

### 1.6 E20261017670419c4:S001:T006 — Expose daemon RPC and watch protocol

Register proposed understanding routes with typed success/error results and full redacted projections in existing progress stream frames.

**Acceptance checks:**
- Input validation, owner checks and current revision applied before mutation/replay
- Watch subscribes before snapshot; monotonic coalesced revisions and reconnect refresh
- Explicit done/error terminal, request-ID correlation, abort cleanup; no hidden answer keys
- Add and pass focused tests for this task before proceeding.

### 1.7 E20261017670419c4:S001:T007 — Integrate startup, shutdown and reasoning roles

Register five understanding roles critical/core; startup recovery before requests; service stop hook and bounded socket-write flush before stores close.

**Acceptance checks:**
- Missing role descriptor unavailable, no fallback to mid
- Healthy shutdown emits unavailable/done then flushes for at most1000ms
- Existing20s backstop and locks-lost exit remain authoritative; no wait on failed store
- Add and pass focused tests for this task before proceeding.

### 1.8 E20261017670419c4:S001:T008 — Verify story acceptance and publish consumer fixtures

Run cross-task integration and regression checks after task-local tests; supply versioned result/event fixtures for s5 and document adapter findings and sibling seams.

**Acceptance checks:**
- All three story ACs proven against temporary isolated LMDB and sockets
- Real crash/reopen/concurrency/delete and delivery-nonmutation evidence
- Build and affected storage/server/shutdown/role tests pass; no live learner data or cloud calls

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Single/multiple/zero providers; repo Git-email and OS fallback; whitespace/case/authority collisions; no automatic merge | `t1` |
| Every scope field affects fingerprint; ordered parents, null base and SHA format validation | `t2` |
| Malformed/newer/missing schema; unknown transition and role missing fail closed | `t7` |
| All five roles critical/default core and existing core-floor routing | `t7` |
| Canonical fingerprint vectors: changing only commitMode changes hash; exact stagedTreeOid and ordered parentOids preserved; explicit null and SHA256 UTF-8 tuple encoding | `t2` |
| Submitted confidence round-trips all sc4 values unsure/low/medium/high unchanged; unanswered draft distinct from submission | `t2` |
| Persist original/assisted attempts and confidence, close/reopen daemon store, compare all records and associations | `t3`, `t4`, `t8` |
| Concurrent revision writes only one succeeds; duplicate request no extra attempt/audit; payload mismatch rejected | `t3`, `t4`, `t8` |
| Fault before transaction commit rolls back current/history/request/indexes together | `t3`, `t4`, `t8` |
| Startup interrupted-job recovery and late callback discard; no pass or receipt | `t5` |
| Learner deletion removes every key family/cache, races restart and retry without resurrection | `t5` |
| Different owner cannot list/read/delete/watch; permission failure refuses activation | `t5` |
| Completed delivery artifacts byte-identical after prepare/cancel/failure/resume/delete | `t5` |
| Complete 35-database inventory opens within MAX_DBS=64 for fresh and existing stores; existing rows survive reopen and new namespace initialization | `t3` |
| Typed revision-conflict delivered inside result with owner-only projection | `t2`, `t6`, `t8` |
| Unknown fields, forged learner/grade/eligibility, oversized and unsafe numeric inputs rejected | `t2`, `t6`, `t8` |
| Snapshot subscription race, coalescing and reconnect full refresh; no stale Ready | `t2`, `t6`, `t8` |
| Public projection whitelist excludes rubric/answer keys/private job payloads | `t2`, `t6`, `t8` |
| Missing s2/s6/s7 modules return unavailable; override intent never grants permission | `t2`, `t6`, `t8` |
| Actual IpcStreamMessage progress/data framing, substituted request ID, explicit done/error terminal, unsubscribe on abort and no post-terminal events | `t2`, `t6`, `t8` |
| Healthy daemon shutdown with active watch: stop hook before store close, final unavailable/done flushed; 1000ms bounded flush and disconnect/locks-lost paths never hang or imply pass | `t6`, `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 LearnerIdentity and resolved identity precedence (§3.1)`
- **[[c2]]** `prior-artifact` `LLD s1 AssessmentScope, sc1/sc2 and confidence/projection contracts (§2, §3.2–3.3)`
- **[[c3]]** `prior-artifact` `LLD s1 AssessmentRecord namespaces and schema version (§3.3, §3.7)`
- **[[c4]]** `prior-artifact` `LLD s1 CommandEnvelope, transactions and error paths (§3.4, §6)`
- **[[c5]]** `prior-artifact` `LLD s1 Deletion/privacy and interrupted recovery (§3.6, §6)`
- **[[c6]]** `prior-artifact` `LLD s1 RPC result and observation protocol (§3.5)`
- **[[c7]]** `prior-artifact` `LLD s1 Shutdown integration and critical roles (§3.5, §3.7)`
- **[[c8]]** `prior-artifact` `LLD s1 Test strategy and AC mapping (§7)`

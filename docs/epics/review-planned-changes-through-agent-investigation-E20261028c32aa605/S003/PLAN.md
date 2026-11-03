<!-- insrc:artifact PLAN-c32aa60534232f36-s3 -->

# Plan: STORY-c32aa60534232f36-s3

## Summary

**Epic:** `review-planned-changes-through-agent-investigation`
**LLD run:** `wf-1793255741363-9i7il5`
**LLD effective hash:** `12565b4b7f9e...`

Build the bounded reviewer coordinator around the completed pinned subject and evidence ledger. Accept each block through the shared transition ports before acknowledgment, retain explicit pauses and usage, and keep caller impact separate from changed scope. Qualify execution capabilities explicitly; production provider bridges and durable storage remain downstream work.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define sc3 bindings, backend qualification and inclusive policy | M | — | — | unit: sc3 bindings, backend qualification and inclusive continuation policy | [[c1]] [[c2]] |
| 2 | **`t2`** Accept per-block progress before returning acknowledgment | L | — | `t1` | unit: Per-block append-before-ACK, replay and uncertain acceptance | [[c1]] [[c3]] |
| 3 | **`t3`** Mediate pinned navigation and optional changed-entity impact | M | — | `t1`, `t2` | unit: Pinned navigation and changed-entity impact scope parity | [[c1]] [[c4]] |
| 4 | **`t4`** Run serial bounded continuations with retry and cancellation | L | — | `t1`, `t2`, `t3` | unit: Grouped continuation execution, bounded retries and cancellation | [[c1]] [[c5]] |
| 5 | **`t5`** Emit idempotent usage and retained pause accounting | M | — | `t1`, `t4` | unit: Idempotent usage observations and retained active allowance | [[c1]] [[c6]] |
| 6 | **`t6`** Prove end-to-end sc1/sc2/sc3 coordination and compatibility | M | — | `t1`, `t2`, `t3`, `t4`, `t5` | integration: Pinned source-ledger-progress integration and legacy compatibility | [[c1]] [[c7]] |

### 1.1 TASK-c32aa60534232f36-s3-t1 — Define sc3 bindings, backend qualification and inclusive policy

Add exact sc3 types and internal coordinator/backend context. Validate immutable turn/subject/policy/party/critical-role bindings, backend capability mode and inclusive request/time admission using existing budget helpers.

**Acceptance checks:**
- Exact sc3 values retained; consume sc1/sc2/sc6 types and trusted role/provider context without changing existing interfaces.
- Unsupported opaque native or mutable/unmediated source capability refuses before dispatch; qualification is trusted composition, not model assertion.
- Inclusive admission covers history/schema/tool manifest/reserves; effective attempt cap min300s/remaining allowance/provider limit;120active-minute/24attempt defaults only pause, never set checkpoint cadence.
- Focused binding, qualification, budget and fake-clock tests pass; no direct cloud REST, production activation or MCP schema change.

### 1.2 TASK-c32aa60534232f36-s3-t2 — Accept per-block progress before returning acknowledgment

Implement progress.ts over sc2 pure candidate validation and sc6 object staging/transition append. Bind progress identities, expected sequence, block ownership, receipt replay and uncertainty without implementing durable storage.

**Acceptance checks:**
- Authenticate every progress binding and selected block; reject unsupported evidence, wrong sequence/generation/attempt and conflicting payload identity.
- Stage object-valued candidate/transition and append through sc6 before advancing accepted ledger/sequence or returning ACK.
- Identical accepted progress returns authoritative prior receipt without reapplying or recharging; missing/lost acceptance stays explicitly uncertain.
- Append failure prevents next block assessment; needs-followup/unverified and large-block partial progress retain outstanding work.
- Focused delayed-append, lost-ACK, conflict and immutable-state tests pass with test-only in-memory ports.

### 1.3 TASK-c32aa60534232f36-s3-t3 — Mediate pinned navigation and optional changed-entity impact

Add narrow sc3 source/impact wrappers over s1 reads and s2 trusted receipt admission. Keep identical subject seeds in both modes; only indexed mode receives validated daemon-owned changed-entity caller capability.

**Acceptance checks:**
- Source reads stay pinned, bounded and read-only; trusted inspection receipts support later ledger deltas, not backend-claimed file access.
- Caller queries require exact entity membership in selected packet source; ambiguous mapping, stale/missing/partial/empty index results remain explicit unresolved impact.
- Impact evidence is context-only with matching native receipt metadata and limits; no additional commits, packets or changed blocks.
- Use injected closure-scoped daemon capability, with no DB access in clients or new analyzer recipe; focused source/mode/impact tests pass.

### 1.4 TASK-c32aa60534232f36-s3-t4 — Run serial bounded continuations with retry and cancellation

Implement continuation.ts to seed navigation-oriented requests, run qualified backend through its bound LLMProvider, expose narrow source/impact/progress tools and return validated replies referencing accepted block receipts.

**Acceptance checks:**
- One compatible backend session can inspect related obligations and ACK several blocks; no mandatory call per clause/block or eager whole-source packet.
- Serialize provider work; enforce accepted-progress barrier before next block assessment and preserve earlier accepted receipts on enclosing-call failure.
- At most one immediate transient retry with new attempt identity and retained consumption, provider internalRetry:false; non-transient binding/schema/permission/budget/stale failures do not auto-retry.
- Abort provider/tools promptly, fence late callbacks and pause before pending backlog; final reply cannot silently reapply accepted deltas or publish a verdict.
- Focused grouped-session, block-yield, unsupported-backend, retry/cancel/deadline and final-reply tests pass.

### 1.5 TASK-c32aa60534232f36-s3-t5 — Emit idempotent usage and retained pause accounting

Wire attempt usage observer and consumed active-time/attempt accounting into coordinator transitions through existing sc6 recordAttemptUsage. Preserve actual/estimated/unavailable provenance and pending writer state.

**Acceptance checks:**
- Usage observations retain stable observation/attempt/provider/model IDs, existing five nullable counters, quality/granularity and native references.
- Allowance/reserves/tool counts never become measured usage; unsupported native observation is unavailable and accepted replay emits no new charge.
- Consumed active time/attempts survive yields, retries, cancellation and transport detach; pending/unavailable accounting state is visible for s4 outbox recovery.
- No new usage warehouse, artifact JSON collection or storage backend; deterministic observer/clock/replay tests pass.

### 1.6 TASK-c32aa60534232f36-s3-t6 — Prove end-to-end sc1/sc2/sc3 coordination and compatibility

Complete real pinned source-to-ledger-to-stage/append/ACK fixtures with deterministic backend/providers and explicitly test-only ports. Verify approved LLD coverage, existing focused regressions, production build and generated sequence consistency.

**Acceptance checks:**
- All five Story ACs and all12 LLD test subjects map to concrete passing tests without routine live provider suites.
- Two blocks ACK within one session; cancellation after ACK preserves accepted state, uncertain in-flight work stays explicit and source/indexed modes keep identical scope.
- Qualified block-yield and unsupported native paths explicit; legacy provider/tool-loop/MCP/controller interfaces unchanged and no production activation.
- Focused inclusive-budget/read-only-loop/s1/s2 regression checks and production build pass; keep structured sequence artifact aligned with actual behavior.
- Record task/build/test evidence and run one required independent code review; no automatic repeated review rounds.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| review-s3-ac1 grouped investigation: several block progress/ACK exchanges inside one compatible backend session, same subject seed in both modes, no call-per-clause plan | `t2`, `t4`, `t6` |
| review-s3-ac2 inclusive budget covers history/schema/tools/reserves; deadline min300s/remaining allowance; overflow yields without dropping evidence; run ceilings never set checkpoint cadence | `t1`, `t4`, `t6` |
| review-s3-ac3 cancel/repeated transient failure pauses promptly, at most one retry, internalRetry disabled, consumed allowances retained and late callbacks fenced | `t4`, `t5`, `t6` |
| review-s3-ac4 wrong party/tier/context/capability or mutable/unmediated reads refuse before dispatch; tools cannot alter source/policy/scope and provider calls are serial | `t1`, `t3`, `t4`, `t6` |
| review-s3-ac5 changed-entity mapping gates caller query; stale/missing/partial/empty results retain unresolved impact and never add commits | `t3`, `t6` |
| Progress validation rejects foreign block/generation/attempt/sequence, uninspected evidence and conflicting progress digest; identical accepted replay returns prior receipt | `t2`, `t6` |
| Append failure/uncertainty sends no ACK, preserves accepted ledger, and prevents next block assessment; final reply does not reapply accepted deltas | `t2`, `t4`, `t6` |
| Usage observations retain provider/model/native quality/granularity and stable IDs; absent counters unknown, pending writer explicit, replay does not recharge | `t5`, `t6` |
| Real pinned source receipt -> sc2 candidate -> stage object -> append accepted transition -> block ACK, including two blocks before final session reply | `t2`, `t3`, `t4`, `t6` |
| Crash/cancel after an acknowledged block but before enclosing reply preserves earlier accepted state; uncertain in-flight block remains explicit (durable restart is s4 test obligation) | `t2`, `t4`, `t6` |
| Qualified block-yield path and unsupported opaque native path are explicit; no MCP registration, legacy/provider signature changes or production activation | `t1`, `t4`, `t6` |
| Existing inclusive-budget, read-only loop and s1/s2 focused fixtures remain compatible | `t1`, `t3`, `t4`, `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 contractDetails and owned sc3/consumed sc1-sc2-sc6 boundary`
- **[[c2]]** `prior-artifact` `LLD s3 backend qualification and inclusive admission/pause policy`
- **[[c3]]** `prior-artifact` `LLD s3 per-block progress transition, append-before-ACK and replay`
- **[[c4]]** `prior-artifact` `LLD s3 pinned navigation and changed-entity caller impact`
- **[[c5]]** `prior-artifact` `LLD s3 serial continuation, retry/cancel and final-reply semantics`
- **[[c6]]** `prior-artifact` `LLD s3 usage observation and active allowance accounting`
- **[[c7]]** `prior-artifact` `LLD s3 testStrategy, additive migration and sequenceDefinition`

<!-- insrc:artifact PLAN-c32aa60534232f36-s5 -->

# Plan: STORY-c32aa60534232f36-s5

## Summary

**Epic:** `review-planned-changes-through-agent-investigation`
**LLD run:** `wf-1793269677017-7ohwmg`
**LLD effective hash:** `12565b4b7f9e...`

Build accountable completion checks and a canonical review publisher on the completed recovery layer. Preserve evidence, independent-party and verdict rules while making publication idempotent across crashes and concurrent requests. Deliver the internal S5 capability without activating the new engine or repeating model judging.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Validate accountable completion at one accepted checkpoint | M | — | — | unit: Completion validates every required row block evidence and independent party; unit: Completion rejects stale conflicting and unsupported coverage without canonical writes | [[c1]] [[c2]] |
| 2 | **`t2`** Adapt accepted findings to versioned canonical review records | M | — | `t1` | unit: Canonical investigation adaptation preserves finding identity severity and confidence; unit: Investigation mode parity and legacy full degraded verdict compatibility | [[c1]] [[c3]] |
| 3 | **`t3`** Freeze one immutable publication intent and coverage snapshot | M | — | `t2` | unit: Immutable publication intent binds candidate coverage target and expected revision; integration: Completed sc4 fence freezes original intent and refuses conflicts without duplicate recovery | [[c1]] [[c4]] |
| 4 | **`t4`** Publish through the canonical artifact queue with revision checks | M | — | `t3` | integration: Canonical artifact queue creates or updates only the frozen expected revision; integration: Owner freshness and canonical identity checks refuse concurrent or edited heads | [[c1]] [[c5]] |
| 5 | **`t5`** Reconcile canonical writes and persist terminal completion receipts | M | — | `t4` | integration: Lost canonical write acknowledgment reconciles one revision and terminal receipt; integration: Terminal replay conflict and revoked callback authority cannot manufacture completion | [[c1]] [[c4]] [[c5]] |
| 6 | **`t6`** Render canonical investigation reviews and preserve approval compatibility | M | — | `t2`, `t5` | unit: Canonical investigation rendering regenerates without another content revision; integration: Legacy records independent approval overrides and unsupported versions retain explicit behavior | [[c3]] [[c5]] [[c6]] |
| 7 | **`t7`** Verify complete publication across crashes and concurrent requests | M | — | `t6` | integration: Completion crash concurrency and stale pin matrix converges to one canonical result; integration: Complete blocked warned and incomplete review outcomes preserve mode and coverage semantics; smoke: Focused completion recovery canonical lifecycle compatibility suites and production build | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] [[c6]] |

### 1.1 TASK-c32aa60534232f36-s5-t1 — Validate accountable completion at one accepted checkpoint

Add completion-types.ts and completion-assessment.ts with exact sc5 assessment/receipt types and fail-closed coverage checks. Consume verified sc2/sc4 state and current approved pins/party records; do not execute reviewers or accept new final deltas.

**Acceptance checks:**
- Exact CompletionAssessmentV1 and ReviewCompletionReceiptV1 shapes match approved sc5.
- Every required task/check/design/change/criterion/impact row and latest selected block disposition is checked against pinned basis and trusted receipt closure.
- Missing/pending/unverified rows, unfinished blocks or outstanding work return incomplete; unsupported satisfaction/applicability refuses.
- Unplanned changed scope remains required; conflicting expectations or unknown/same author-reviewer return conflict without weakening requirements.
- Stale source/BUILD/contract/policy compatibility returns stale with reasons; findings can form accountable completed WARN/BLOCK.

### 1.2 TASK-c32aa60534232f36-s5-t2 — Adapt accepted findings to versioned canonical review records

Add completion-artifact.ts and extend canonical CodeReviewBody with investigation grounding and compact versioned linkage. Reuse or extract runner count/verdict/build validation without invoking judges; update necessary internal type guards while retaining legacy full/degraded behavior.

**Acceptance checks:**
- All accepted findings retain criterion, severity, confidence, evidence/expectation identity and accountable locations; unknown or unmappable dimensions refuse rather than drop.
- HIGH yields block, MED warn and LOW pass under existing code-review fold; source-only/indexed investigation inputs have the same verdict policy.
- New investigation records require version/sourceMode/run/subject/policy/checkpoint/coverage/operation linkage; legacy records remain readable with their existing degraded warn cap.
- Metadata records authenticated reviewer and reviewed BUILD fingerprint/revision; no raw ledger/evidence collection embedded in artifact JSON.
- No judge rerun, automatic approval or external tool registration.

### 1.3 TASK-c32aa60534232f36-s5-t3 — Freeze one immutable publication intent and coverage snapshot

Add completion-publication.ts to stage validated coverage and candidate references plus deterministic operation identity, expected canonical revision/absence and trusted pins. Enter completed sc4 withPublicationFence and reuse its frozen reference on retries.

**Acceptance checks:**
- Intent binds run/subject/policy/terminal checkpoint, candidate/coverage digests, canonical target, expected prior revision or explicit absence, BUILD and party provenance.
- Coverage snapshot retains basis/ledger/trusted receipt references outside artifact JSON; staged-but-unaccepted values are not publication authority.
- No active attempt or non-publishable assessment enters publication; completed status resolves existing receipt without new mutating callback.
- Identical retry reuses original frozen intent; conflicting checkpoint/intent is refused by consumed sc4 capability.
- Do not change sc4 journal/private events, deadline/fencing or recovery semantics.

### 1.4 TASK-c32aa60534232f36-s5-t4 — Publish through the canonical artifact queue with revision checks

Add completion-publisher.ts guarded persistence using the daemon-owned ArtifactStore/History/LifecycleService. Support explicit absent-head creation and expected-revision update under the existing canonical queue, with fresh ownership/pin checks inside the mutation boundary.

**Acceptance checks:**
- Canonical mutation compares frozen expected absence/revision atomically under the existing artifact queue; no check-then-write race or direct JSON overwrite.
- Same operation plus exact subject/checkpoint/content returns existing revision with no new write/logged round.
- Different/newer/human-edited canonical head returns conflict and is not overwritten.
- Recheck current-owner assertion, independent party and pinned source/BUILD/contracts immediately before canonical mutation.
- Validate adapted record in memory and verify persisted head/revision after lifecycle write; two stores are treated as recoverable commits, not one atomic transaction.

### 1.5 TASK-c32aa60534232f36-s5-t5 — Reconcile canonical writes and persist terminal completion receipts

Complete publisher retry/recovery: reconcile frozen operation against canonical head/history after lost ACK, create immutable sc5 receipt, and record it through sc4 only after the publication callback queue releases.

**Acceptance checks:**
- Crash after canonical write but before terminal receipt resolves the same operation/revision without rerunning judges or appending a duplicate CR.
- Receipt binds run/subject/terminal checkpoint/canonical ID and revision/verdict/coverageRef and is durable before success returns.
- Identical terminal replay returns original receipt read-only; mismatching head/content/receipt reports conflict.
- Owner/freshness loss or callback timeout cannot become completion; respect sc4 revoked guard and non-reentrant queue contract.
- Partial/failed execution never produces a passing CR; accepted findings and usage limitations remain intact.

### 1.6 TASK-c32aa60534232f36-s5-t6 — Render canonical investigation reviews and preserve approval compatibility

Update canonical CR rendering and existing completion-evidence readers for versioned investigation records, with deterministic view regeneration. Preserve legacy record, independent review and explicit override behavior; keep new engine activation capability-gated for S6.

**Acceptance checks:**
- Canonical view exposes compact subject/checkpoint/coverage linkage and explicit source mode without raw evidence dumps.
- Rendering failure after valid canonical persistence is repairable without a second artifact revision or lost result.
- Existing full/degraded records, severity/confidence and human BUILD approval/override semantics remain unchanged.
- Unsupported investigation versions/modes refuse explicitly; older strict consumers are not claimed automatically compatible.
- No production engine selection, new MCP phases, tracker messaging or user approval performed.

### 1.7 TASK-c32aa60534232f36-s5-t7 — Verify complete publication across crashes and concurrent requests

Integrate complete/incomplete ledgers, real canonical lifecycle store and completed sc4 fence with bounded crash/fault fixtures. Prove coverage, fresh ownership, canonical CAS, receipt replay and mode/legacy parity; export only the internal S5 composition boundary.

**Acceptance checks:**
- All missing evidence/coverage/block cases and conflicting or non-independent inputs produce no successful canonical publication.
- Real crash/lost-ACK tests around intent, canonical commit and terminal receipt converge to one operation/revision/receipt.
- Concurrent completion and edited/newer heads cannot duplicate or overwrite canonical result; stale pins/owner between assessment and CAS refuse.
- Identical source/index accepted state produces equal verdict and explicit impact limitations; pending usage never becomes invented coverage or tokens.
- Focused completion/recovery/canonical-lifecycle/legacy compatibility suites and production build pass without live LLM or whole-repo sweep; one required code review after build.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Required coverage and latest selected-block completeness | `t1`, `t7` |
| Trusted evidence, conflict and party validation | `t1`, `t7` |
| Canonical severity/confidence and dimension adaptation | `t2`, `t7` |
| Versioned investigation linkage and mode parity | `t2`, `t6`, `t7` |
| Frozen intent and expected-revision canonical CAS | `t3`, `t4` |
| Lost ACK and crash reconciliation around canonical commit and terminal receipt | `t4`, `t5`, `t7` |
| Concurrent completion, stale owner and edited canonical head refusal | `t4`, `t5`, `t7` |
| Freshness recheck between assessment and publication | `t1`, `t4`, `t7` |
| Regenerable rendered document and terminal receipt replay | `t5`, `t6` |
| Exact sc5 assessment and receipt shapes | `t1`, `t5` |
| Legacy CR readers, independent approval and override semantics | `t2`, `t6`, `t7` |
| No judge rerun, autoapproval or production registration | `t2`, `t3`, `t5`, `t6`, `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/S005/LLD.md#2-contract-details`
- **[[c2]]** `prior-artifact` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/S005/LLD.md#3-data-model-changes` — "CompletionAssessmentV1; validated required coverage and independent party."
- **[[c3]]** `prior-artifact` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/S005/LLD.md#3-data-model-changes` — "Canonical CodeReviewArtifact investigation linkage."
- **[[c4]]** `prior-artifact` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/S005/LLD.md#3-data-model-changes` — "Frozen publication intent and completed sc4 prerequisite consumption."
- **[[c5]]** `prior-artifact` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/S005/LLD.md#3-data-model-changes` — "Canonical publication protocol and recoverable receipts."
- **[[c6]]** `prior-artifact` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/S005/LLD.md#7-test-strategy`

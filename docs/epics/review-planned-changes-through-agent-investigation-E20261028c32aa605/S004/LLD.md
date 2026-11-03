<!-- insrc:artifact LLD-c32aa60534232f36-s4 -->

# LLD: STORY-c32aa60534232f36-s4

## Summary

**Epic:** `review-planned-changes-through-agent-investigation`
**HLD base run:** `wf-1793173650139-u4mcad`
**HLD effective hash:** `12565b4b7f9e...`

Persist each accepted review block before acknowledging it, then reconstruct evidence, coverage and remaining work after interruption. Fence concurrent sessions and late workers with one daemon-owned run lease. Preserve uncertain attempts and usage records without treating an interrupted call as free or completed.

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

> See **HLD-c32aa60534232f36** § 2. Framework summary

**Rollout phase:** D — durable accepted-state recovery
**Owns:** `sc4` (DurableReviewRecoveryV1)
**Consumes:** `sc1` (ImmutableReviewSubjectV1), `sc2` (EvidenceCoverageV1), `sc3` (InvestigationContinuationV1), `sc6` (ReviewRuntimePortsV1)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Own subject preparation, attribution ambiguity detection, exact Git commit/blob/block navigation and frozen context binding. Define foundational runtime-port types only; do not implement task investigation, a recovery store or new accounting storage. No generic HEAD/working-tree diff may select scope. — owns `sc1`, `sc6`
- `s2`: Own required-row enumeration, evidence identity/provenance and coverage relationships/dispositions. Reuse subject inputs and runtime ports. Keep ledger validation helpers private; do not execute reviewer turns or publish CRs. — owns `sc2`
- `s3`: Own independent read-only task-directed continuation behavior, on-demand source navigation, optional indexed caller/impact enrichment, budget admission, bounded retry/pause and attempt usage emission through foundational ports. In-memory ports are test scaffolding while production selection remains disabled until s4/s6; no durable storage implementation or terminal approval logic. Publish and acknowledge incremental block progress within continuations, with partial cross-block assessments recorded rather than lost. Domain progress contracts only; no competing MCP phase/schema ownership. External registration belongs to s6. — owns `sc3`
- `s5`: Own completion coverage/freshness/party validation, canonical CR adaptation and idempotent terminal publication receipts. Reuse existing lifecycle and severity/confidence policy. Do not let a completion request, missing evidence or a failed run masquerade as a completed verdict. — owns `sc5`
- `s6`: Own production composition, equivalent MCP/daemon/controller start/status/resume/cancel adapters, status/usage presentation fields, explicit engine rollout/rollback, legacy compatibility and evaluation fixtures. No client opens stores directly; no client-specific board UI or design-review replacement. Sole new-engine MCP adapter/schema owner; reconcile 8315a11f/S005 legacy sc7 as specified in the architecture and record code-only supersession before opt-in. Verify routing partitions across both installation orders. — owns `sc7`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `ReviewRecoveryV1`

```typescript
interface ReviewRecoveryV1 { readonly schemaVersion: 1; readonly runId: string; readonly subjectDigest: string; readonly policyDigest: string; readonly state: 'prepared' | 'running' | 'paused' | 'completion-requested' | 'completed' | 'cancelled' | 'stale'; readonly journalSequence: number; readonly acceptedCheckpointDigest: string; readonly owner: { readonly leaseId: string; readonly generation: number; readonly expiresAt: string } | null; readonly attempts: readonly { readonly attemptId: string; readonly requestDigest: string; readonly state: 'issued' | 'partially-accepted' | 'accepted' | 'failed' | 'uncertain' | 'cancelled'; readonly acceptedSequence: number | null; readonly usageReceipt: string | null }[]; readonly activeMsConsumed: number; readonly continuationsConsumed: number; readonly blockCheckpoints: readonly { readonly blockId: string; readonly progressId: string; readonly sequence: number; readonly checkpointDigest: string }[]; readonly outstandingWork: readonly string[]; readonly completionReceipt: string | null; }
```

**Returns:** `ReviewRecoveryV1` — Validated replay-derived status projection; no mutable client authority.

**Errors:**
- `RecoveryError` when Malformed, corrupt, unsupported, stale or unauthorized run.

**Preconditions:**
- One trusted daemon writer owns the runtime root; callers cannot open runtime storage directly.

**Postconditions:**
- Every acknowledged block is recoverable independently of enclosing attempt outcome.

### 2.2 `ResumeCompatibilityV1`

```typescript
interface ResumeCompatibilityV1 { readonly kind: 'compatible' | 'stale' | 'unsupported'; readonly invalidatedEvidenceIds: readonly string[]; readonly reasons: readonly string[]; readonly extensionRequired: boolean; }
```

**Returns:** `ResumeCompatibilityV1` — Explicit compatibility and remaining-allowance decision; never silently rebind old evidence.

**Preconditions:**
- Pinned subject, contracts, policy and tool/provider/evidence versions supplied by trusted composition.

**Postconditions:**
- Incompatible runs retain forensic state but cannot dispatch or publish; legacy logs explicitly unsupported.

### 2.3 `ReviewRuntimePortsV1`

```typescript
interface ReviewRuntimePortsV1 { readonly readEvidence: (subjectId: string, reference: string) => Promise<ReviewReadReceiptV1>; readonly stageImmutableValue: (runId: string, value: Readonly<Record<string, unknown>> | string) => Promise<{ readonly reference: string; readonly digest: string }>; readonly appendTransition: (runId: string, generation: number, expectedSequence: number, transitionRef: string) => Promise<{ readonly sequence: number; readonly checkpointDigest: string }>; readonly recordAttemptUsage: (observation: ReviewUsageObservationV1) => Promise<{ readonly state: 'recorded' | 'pending' | 'unavailable'; readonly receiptRef: string | null }>; }
```

**Returns:** `ReviewRuntimePortsV1` — Owner-bound durable implementation of sc6; read delegates to sc1 pinned reader.

**Errors:**
- `ReviewRuntimePortError` when Invalid identity/value, stale generation, sequence conflict or unknown reference.
- `RecoveryError` when Storage uncertain, corrupt or unavailable; no acknowledgment.

**Preconditions:**
- Factory binds run, lease identity, generation and process-owner guard; no lease token accepted from model arguments.
- append validates staged transition and complete referenced closure under serialized run queue.

**Postconditions:**
- Content-addressed immutable blob file sync and directory sync precede event commit.
- Append is replay-idempotent by progressId and payload digest; conflicts refused; fsync precedes receipt.

## 3. Data model changes

### 3.1 `ReviewRecoveryV1` — new

Stored under private daemon runtime root <project>/.insrc/review-runs/investigation-v1/<validated runId>/, outside artifact JSON and Git scope. Directories 0700/files0600; reject symlink traversal, invalid run IDs and foreign-root references. manifest pins subject, initial ledger/basis, policy, evidence format, engine version, provider qualification/tool policy compatibility and initial outstanding requirements. Runtime root requires exclusive trusted daemon process ownership; all store mutations assert that ownership and serialize per run, with a root-scoped singleton store registry. Production process guard is supplied by s6 using existing daemon ownership infrastructure; a standalone unguarded production store must refuse. No multi-host/shared-filesystem support. Lease expiry permits a new session within the same daemon to claim a strictly greater persistent generation; old lease/generation callbacks cannot mutate. Restart obtains exclusive daemon ownership, replays, and marks old owner inactive before claiming. Clock rollback pauses rather than extends authority. Each run owns many events/blobs/attempts; events point to immutable blobs; snapshots are disposable projections, not independent authority. New implementation files: src/workflow/code-review/investigation/recovery-types.ts defines sc4 projections and RecoveryError (codes invalid-input, corrupt, unsupported, stale, ownership-lost, storage-unavailable, uncertain-append, budget-exhausted); src/workflow/code-review/investigation/recovery-store.ts owns the serialized run lifecycle and owner-bound ports. These are proposed new files, not existing call sites. The runtime subtree must be explicitly excluded from Git attribution, indexing and review manifests as required by HLD.

**Call sites:**
- `src/workflow/code-review/investigation/progress.ts`

### 3.2 `Recovery journal event` — new

Internal versioned framed canonical JSON records contain eventOrdinal, previousEventDigest, eventId, run/subject/policy identity, generation, kind, payloadRef and digest. Separate monotonically increasing eventOrdinal counts lease/attempt/usage/state controls; sc4 journalSequence and sc3 expectedSequence count accepted block transitions only, preserving existing coordinator semantics. Block checkpoint digest hashes prior block checkpoint plus canonical block commit identity; control records cannot alter it. Durable complete append is authority; torn final unterminated frame is quarantined/truncated only under exclusive owner after verifying valid prefix, with explicit diagnostic. Any complete invalid frame, broken hash/sequence or missing/corrupt reachable blob refuses writable recovery. Snapshots bind eventOrdinal and event hash; missing/stale/corrupt snapshot is rebuilt from valid journal, never used to bypass corruption. Stage immutable canonical objects/strings once with digest verification and bounded sizes; atomic no-overwrite install, file sync and parent-directory sync. Unreferenced staging blobs are harmless and not accepted work; no automatic garbage collection in this story. New implementation file: src/workflow/code-review/investigation/recovery-journal.ts owns immutable blobs, framing, durable append and replay; src/workflow/code-review/investigation/recovery-replay.ts validates the projection and referenced closure. Existing Call sites remain consumers, not implementation homes.

**Call sites:**
- `src/workflow/code-review/investigation/progress.ts`

### 3.3 `BlockProgressTransitionV1` — invariant-change

Consume unchanged sc3 shape. At append and replay validate progress run/subject/attempt/generation, expectedSequence and predecessor checkpoint; resolve and hash-check candidate ledger, basis and trusted receipt blobs. Recompute sc2 delta from prior ledger with verified native receipt provenance and compare candidate digest, rather than trusting arbitrary staged candidate JSON. New basis may only add valid packet-bound impact requirements; subject, criteria and existing requirements immutable. Accumulate earlier trusted receipt closure across checkpoints. Reconstruct accepted progress receipt history and outstanding work from requirements/coverage plus explicit retained work; never drop prior unresolved work based solely on provider list. Identical progress replay returns original receipt even after uncertain ACK; conflicting payload refuses. Old generation cannot add new progress. Receipt retrieval for an already accepted identity is read-only through recovery, distinct from allowing an old worker to append.

**Call sites:**
- `src/workflow/code-review/investigation/progress.ts`
- `src/workflow/code-review/investigation/continuation-types.ts`

### 3.4 `Attempt recovery and budget reservation` — new

Before backend dispatch, owner-bound execution wrapper durably records issued attemptId/requestDigest and reserves one continuation plus capped active-time allowance. Wrapper encloses every execute call, including sc3 internal retry, without changing sc3 domain interfaces; s6 composes it. Reservations prevent a crash from resetting consumed budgets. Settled attempt replaces its own time reservation with validated monotonic elapsed duration, never double-counts block replays or the onState cumulative view. Unknown interrupted attempt conservatively retains reservation and state uncertain, with accepted block receipts retained and missing usage explicitly unknown. Inactive pause time consumes nothing; wall-clock timestamps never reconstruct active duration. Lost response/append ACK does not imply no external model execution. Retry is new attempt identity explicitly linked to prior uncertain attempt. Remaining limit exhaustion pauses with extensionRequired; extensions are explicit audited allowance changes, not policy/criteria changes. sc3 onState is a cache hint, never durable accounting authority; durable wrapper settles in finally and ignores stale-generation callbacks. New implementation file: src/workflow/code-review/investigation/recovery-attempts.ts owns the guarded backend wrapper and reservation/settlement transitions.

**Call sites:**
- `src/workflow/code-review/investigation/continuation-types.ts`

### 3.5 `Usage outbox` — new

Each run owns zero or more immutable observations keyed observationId plus digest; observation references its issued attempt. Persist pending event before calling existing usage writer; stable idempotency key required at writer boundary. Durable receipt event marks recorded; writer failure remains pending. Crash after external write but before receipt replays same key, never a new model call. If writer cannot guarantee deduplication, retain pending/uncertain and refuse automatic resend rather than promise exactly-once. Unknown counters remain null and quality unavailable; reservations are never usage. Conflicting observation replay refuses. Provider usage may be accepted for an already issued cancelled attempt as accounting-only under current owner, never progress authority. No usage warehouse/schema change. New implementation file: src/workflow/code-review/investigation/recovery-usage.ts owns pending observations and idempotent delivery receipts.

**Call sites:**
- `src/workflow/code-review/investigation/types.ts`

## 4. Diagrams

- [ER model](docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/S004/er-model.html)
- [Sequence diagram](docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/S004/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | Own durable recovery projections, lease/generation fencing, compatibility, conservative interrupted budget accounting and reconstructible block checkpoints; expose owner-bound internal lifecycle commands to s5/s6. Terminal receipt recording is idempotent storage only; s5 decides completion eligibility and canonical publication. |
| `sc1` | consumes | Reuse exact subject digest and pinned read/freshness checks; never select HEAD diff or widen packets. |
| `sc2` | consumes | Replay and validate ledger deltas/provenance with existing sc2 helpers; do not change criteria or findings semantics. |
| `sc3` | consumes | Persist unchanged staged block transitions and hydrate InvestigationState; supply guarded ports/backend wrapper; accepted blocks survive uncertain enclosing attempts. |
| `sc6` | consumes | Implement durable immutable staging, append and usage outbox behind unchanged foundational interfaces; production composition and external registration remain s6. |

## 6. Error paths

**Error cases**

- **Crash during blob staging or journal append.** (recoverable)
  - Detection: Replay verifies framing, hashes, event sequence and complete referenced closure; append failure leaves durability uncertain.
  - Response: No ACK on failed append. Quarantine torn final tail under exclusive writer, replay committed prefix, resolve progress identity before retry. Complete corruption refuses writable recovery.
  - User impact: Only unaccepted work may repeat; accepted blocks remain visible.
- **Concurrent resume or late worker.** (recoverable)
  - Detection: Serialized owner-bound mutation checks leaseId, persisted generation, expiry and daemon process guard immediately before commit.
  - Response: One claimant obtains next generation; foreign/expired generation cannot append, settle or publish. Read-only receipt lookup may resolve prior acceptance.
  - User impact: No competing accepted histories.
- **Stale subject, contract, policy or compatibility version.** (terminal)
  - Detection: Compare manifest fingerprints and invoke pinned freshness check; verify all persisted receipt/source bindings.
  - Response: Return stale or unsupported with reasons and affected evidence IDs; retain history but refuse dispatch/publication. Do not mutate old evidence into a new subject.
  - User impact: New run required when semantic inputs differ.
- **Provider interrupted after possible execution.** (recoverable)
  - Detection: Issued attempt has no durable settlement at recovery, regardless of provider session availability.
  - Response: Mark uncertain, retain accepted blocks, keep capped active reservation and one consumed continuation; unknown usage explicit. New dispatch records new linked attempt.
  - User impact: Possible duplicate external execution is disclosed; progress not discarded.
- **Storage unavailable or missing reachable value.** (recoverable)
  - Detection: File sync/read error, digest mismatch or absent referenced blob during replay.
  - Response: Fail closed with storage/corruption reason and no success receipt; never rebuild from unverified snapshot.
  - User impact: Review paused until storage is restored or a new run chosen.
- **Usage writer unavailable or ACK lost.** (recoverable)
  - Detection: Pending observation has no durable delivery receipt; writer error/timeout or incompatible deduplication contract.
  - Response: Keep durable pending observation; resend same idempotency key only with qualified writer; preserve unknown values and refuse conflicting observation payload.
  - User impact: Usage delivery status stays separate from token quality and review status.
- **Remaining allowance exhausted or clock rolls backward.** (recoverable)
  - Detection: Replayed settled plus reserved consumption reaches limits, or wall-clock owner validation detects regression.
  - Response: Pause, mark extensionRequired when applicable; require explicit audited extension; inactive time never resets allowance.
  - User impact: No silent restart of execution budgets.
- **Forged staged progress or path traversal.** (terminal)
  - Detection: Validate run-scoped reference syntax/digests and sc2 recomputed delta against trusted receipt closure and immutable subject.
  - Response: Refuse before append; no model-supplied filesystem path or claimed receipt is authority.
  - User impact: Invalid submission cannot alter accepted work.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Two blocks accepted within one still-running provider request. | Each independently commits and ACKs; process loss retains both even if final attempt uncertain. |
| Identical progress replay after append succeeded but ACK was lost. | Return original receipt by identity/digest; no new block sequence, model call or usage event. |
| Stale or missing snapshot with valid journal. | Rebuild projection and verify all referenced blobs; snapshot cache is optional. |
| Legacy review without recovery manifest. | Explicit unsupported/non-resumable result; do not invent checkpoint or usage. |
| Clean pause followed by long offline interval. | No inactive time charged; previous consumption and unresolved work preserved. |
| Empty/stale caller graph result or multiple impact checkpoints for a block. | Replay retained impact obligations and provenance without interpreting absence as no impact. |

**Invariants to preserve**

- Block append precedes receipt/owner-state publication; accepted blocks are independent of provider final reply. Grounded in first context bundle and src/workflow/code-review/investigation/progress.ts. [[c1]]
- Keep runtime recovery separate from canonical artifact staged-head journal and lifecycle. Grounded in second context bundle and src/workflow/artifact-core/journal.ts. [[c2]]

## 7. Test strategy

**Test framework:** `node:test and node:assert/strict via tsx; *.test.ts in __tests__, extending existing investigation and artifact journal fixtures.`

**Test levels**

- **unit** — Validate canonical framing, immutable references, deterministic replay, compatibility and accounting without model calls.
  - Subjects: `recovery journal integrity and snapshots`, `lease generation and state transitions`, `attempt reservation and settlement`, `usage outbox idempotency and compatibility`
  - Fixtures: `temporary private runtime directories`, `fake monotonic/wall clocks`, `injected write/sync fault points`, `deterministic subject and ledger fixtures`
- **integration** — Prove crash boundaries and concurrency using the real filesystem and sc3 coordinator with deterministic backend.
  - Subjects: `per-block acceptance survives process restart`, `uncertain append receipt recovery`, `two-session owner race and stale callback fencing`, `sc3 execution wrapper journals internal retry attempts`, `usage delivery crash and replay`, `missing/corrupt closure fail-closed`
  - Fixtures: `child-process crash harness at stage/append/sync/ACK boundaries`, `two clients of one daemon store`, `fake idempotent usage writer`, `two-block deterministic review backend`, `New src/workflow/code-review/investigation/__tests__/recovery-worker.ts child-process fixture and recovery-fixtures.ts shared temporary-root helpers; prove fork/kill feasibility first during build, not an existing tested capability.`
- **contract** — Preserve unchanged sc1/sc2/sc3/sc6 surfaces and sibling ownership.
  - Subjects: `ReviewRecoveryV1 and ResumeCompatibilityV1 exact HLD shape`, `ReviewRuntimePortsV1 durable implementation with unchanged sc3 coordinator`, `source-only and indexed basis replay`, `legacy non-resumable refusal and no production engine activation`
  - Fixtures: `source-only and indexed-impact fixtures`, `legacy log fixture`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Crash after block fsync before ACK and after ACK: restore ledger/evidence/basis/receipts and dispatch only unresolved blocks.`, `Accept two blocks inside one provider request then kill worker before final reply; both survive.`, `Legacy logs explicitly unsupported; stale/missing snapshots reconstruct from journal.` |
| `ac2` | `Crash after issued attempt before result or settlement: uncertain identity retained, active reservation and unknown usage preserved.`, `Identical uncertain progress retry resolves original receipt; conflicting payload refuses.` |
| `ac3` | `Concurrent owner claims yield one valid generation; expired owner and late backend callback cannot append or settle.`, `Attempt duplicate publication receipt recording is idempotent; s5 eligibility remains external.`, `Lost daemon process guard refuses all writes even with valid run lease.` |
| `ac4` | `Changed subject/contracts/policy/tool/evidence compatibility yields explicit stale/unsupported reasons.`, `Corrupt full frame/hash/blob refuses; torn final frame recovers only verified prefix under exclusive writer.`, `Pause interval uncharged; uncertain reservation retained; exhausted limit requires explicit audited extension; backward clock pauses.` |
| `ac5` | `Identical replay does not increment attempt/model usage; actual retries get distinct linked identity.`, `Crash after usage writer success before receipt resends stable key once through deduplication; unqualified writer remains pending.`, `Unavailable counters remain null, estimates separate; budget reservation never reported as measured usage.` |

## 8. Migration

**State before:** Context bundle c1: sc3 stages candidate ledger/basis/receipts and consumes injected append ports; durable implementation is absent from its scope. Context bundle c2: canonical artifact journal recovers staged artifact heads, not investigation execution. Existing legacy reviews remain active.

**State after:** Internal sc4 recovery implementation available to s5/s6 behind unchanged sc6 ports, with private versioned runtime files. Production review engine unchanged until s6 composes guarded adapters and enables explicit rollout.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add isolated versioned recovery types, strict validators and private file journal; exclude runtime path from source scope. No existing artifact rewrite. — ↩ rollbackable
2. Add owner-bound durable ports, reconstructible projection, attempt accounting and usage outbox; exercise only deterministic fixtures. — ↩ rollbackable
3. Export internal recovery composition boundary for downstream s5/s6; retain old entrypoints and engine selection unchanged. — ↩ rollbackable
4. At eventual s6 opt-in, create only new-engine manifests; mark legacy review runs unsupported for resume. Rollback selection leaves existing journals intact and pauses new-engine work rather than importing into legacy. — ↩ rollbackable

**Backward compat:** No current public IPC/MCP/provider interface or default engine changes. sc1/sc2/sc3/sc6 shared types unchanged. Runtime schema unknown to an older binary is refused, never overwritten. Canonical CR publication remains s5 and external registration s6.

## 9. Alternatives considered

### 9.1 a1: Per-run immutable blobs and chained event journal — **CHOSEN**

Implement sc4/sc6 with one serialized daemon-owned run store and reconstructible snapshots.

Store content-addressed immutable values, append hash-chained validated events with durable sync before acknowledgment, and derive ReviewRecoveryV1 plus InvestigationState by replay. Use an exclusive daemon process lock and per-run serialized lease/generation checks. Snapshots accelerate loading but never replace the journal authority. Usage observations form a replayable outbox to the existing usage writer.

### 9.2 a2: Transactional embedded run store with event table

Put events, immutable values and owner state in a daemon-owned transactional KV database.

Implement the same sc4/sc6 contracts using an embedded transactional KV namespace, atomically committing event sequence, lease fencing and blob references. Preserve append-only event history and reconstructible projections, with pending usage records in the same transaction.

**Rejected because:** Correct but adds database ownership and migration coupling without a required capability gain over a single daemon journal.

## 10. References

- **[[c1]]** `code` `src/workflow/code-review/investigation/progress.ts` — "Durable append, idempotent storage and generation fencing are sc4/sc6 responsibilities."
- **[[c2]]** `code` `src/workflow/artifact-core/journal.ts` — "The write journal port (sc2)."
- **[[c3]]** `code` `src/workflow/code-review/investigation/continuation-types.ts`
- **[[c4]]** `prior-artifact` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/HLD.md`
- **[[c5]]** `step-output` `design.story/s1-s8: c32aa60534232f36/s4`

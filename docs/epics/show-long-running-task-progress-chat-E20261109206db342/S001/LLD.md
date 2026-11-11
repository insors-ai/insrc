<!-- insrc:artifact LLD-206db3426ffd4428-s1 -->

# LLD: STORY-206db3426ffd4428-s1 — Track long-running work consistently across executors

## Summary

**Epic:** `show-long-running-task-progress-chat`
**HLD base run:** `wf-1794211533808-ghbhlu`
**HLD effective hash:** `48a6a5468b45...`
**Tracker:** [insors-ai/insrc#147](https://github.com/insors-ai/insrc/issues/147)

The daemon foundation keeps each task tied to its verified executor and originating conversation. It stores bounded observations, exposes one authorized snapshot model, and recovers state after restart. Executor activity and optional polling run on separate schedules.

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

> See **HLD-206db3426ffd4428** § 2. Framework summary

**Rollout phase:** Phase A — daemon observation foundation
**Owns:** `sc1` (Task identity and delegate observation), `sc2` (Scoped snapshots, subscriptions and observation control), `sc3` (Execution-owned activity and chat retention)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Own adapters for existing workflow and analyze producer signals and terminal/owner evidence. Existing stream shape and command semantics remain compatible. — owns `sc4`
- `s3`: Own DesignReviewDelegate and CodeReviewDelegate and mappings from checkpoint progress and execution ownership. Review results, admission, retries and publication remain under the existing engines. — owns `sc5`
- `s4`: Own TestDelegate and managed reporter interpretation, including suite/case identity, provisional counts and abnormal exit. Keep test orchestration and exit semantics unchanged. — owns `sc6`
- `s5`: Own typed VS Code reader and transcript row, current status projection and bindings to the session owner. Render durable snapshots by origin across turns and multiple windows without executing or polling models.
- `s6`: Own MCP adapter, capability qualification, explicit opt-in disclosure and connection to the coordinator's fallback lease. No vendor-specific process changes or assumptions about session identity.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `TaskProgressDelegate`

```typescript
interface TaskProgressDelegate<D extends { readonly kind: ProgressKind }> { progress(task: TaskRef): Promise<DelegateMeasurement<D> | null>; }
type OwnerLifecycle = 'queued' | 'running' | 'waiting' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
type OwnerEvidence = { readonly sequence: number; readonly state: Exclude<OwnerLifecycle, 'completed' | 'failed' | 'cancelled' | 'interrupted'> }
  | { readonly sequence: number; readonly state: 'completed' | 'failed' | 'cancelled' | 'interrupted'; readonly outcome: VerifiedOutcome };
type ProducerAdmission =
  | { readonly kind: 'new'; readonly invocation: TrustedLaunch; readonly producerKey: string }
  | { readonly kind: 'next-attempt'; readonly current: TaskRef; readonly decision: TrustedRetry }
  | { readonly kind: 'revalidate'; readonly current: TaskRef; readonly proof: TrustedSurvival };
type AdmissionResult = { readonly kind: 'admitted'; readonly task: TaskRef; readonly owner: OwnerHandle }
  | { readonly kind: 'refused'; readonly reason: 'capacity' | 'invalid-origin' | 'conflict' | 'expired' };
interface ProgressProducerPort<D extends { readonly kind: ProgressKind }> {
  register(input: ProducerAdmission, delegate: TaskProgressDelegate<D>): Promise<AdmissionResult>;
  signalMeasurement(owner: OwnerHandle, sequence: number): void;
  recordLifecycle(owner: OwnerHandle, evidence: OwnerEvidence): Promise<'recorded' | 'replay' | 'rejected'>;
  renewActivity(owner: OwnerHandle, sequence: number): Promise<'renewed' | 'rejected'>;
}
interface ExecutorCancellation {
  requestCancel(owner: OwnerHandle, requestId: string): Promise<'accepted' | 'unsupported'>;
}
```

**Parameters:**
- `task: TaskRef` — Server-issued project, invocation, task and attempt tuple.

**Returns:** `Promise<DelegateMeasurement<D> | null>` — Bounded producer details or unavailable.

**Errors:**
- `invalid-source` when Measurement fails validation or source is unreachable.
- `owner-fenced` when Owner handle, current attempt, epoch or authoritative sequence does not match.
- `admission-refused` when Capacity, bad origin, conflicting admission or expired recovery record.

**Preconditions:**
- Bind a delegate and runtime-only owner handle to the registered invocation before detaching.
- The daemon execution host alone supplies opaque TrustedLaunch, TrustedRetry and TrustedSurvival values through an in-process port. None are deserialized from IPC. TrustedLaunch binds the registered project, an already verified origin and a server-issued invocation. The producer key is stable only inside that invocation.
- A daemon composition root registers one producer port per ProgressKind with a strict validator and projection of its detail schema and, where supported, a cancellation hook. The coordinator rejects duplicate registration for a different port. Concrete owner adapters remain in s2–s4.
- A next attempt requires an explicit trusted executor retry decision and either a verified terminal predecessor or authority revoked before rollover. Revalidation requires evidence from the actual execution owner of the same surviving or resumed attempt. A client reconnect or a producer-supplied identifier is insufficient.

**Postconditions:**
- No execution, model, cancellation or lease side effects.
- Read results are revalidated against current attempt and epoch after await.
- Successful admission commits identity and reservation before returning a daemon-created runtime-only owner handle. Matching duplicate admission returns the same handle while it remains current. Conflicting replay refuses without altering the original.
- Lifecycle, measurement signals and renewals use one owner-scoped monotonically increasing sequence. The host checks the opaque handle, attempt and epoch before every mutation. Duplicate identical lifecycle evidence is idempotent, conflicting equal-sequence evidence is rejected, and terminal state is immutable.
- Lifecycle evidence supplies authoritative state independently of progress measurements. A terminal outcome includes verified executor disposition and an optional result locator resolved to a scoped opaque reference. The coordinator validates outcome kind and commits before delivery. No delegate read creates a terminal outcome.
- Refresh signalling is coalesced. Capture a refresh generation, then recheck current owner, attempt, lifecycle and measurement revision after asynchronous progress(). A heartbeat does not invalidate a valid newer measurement from the same owner, but an old refresh cannot overwrite one already accepted.
- The cancellation hook receives an idempotency key and the current owner handle. Acceptance means request received. Verified terminal evidence alone establishes cancellation. The coordinator never dispatches a stored pending request on restart.

### 2.2 `ProgressSnapshot`

```typescript
type ProgressSnapshot<D extends { readonly kind: ProgressKind }> = Readonly<{ task: TaskRef; cursor: string; state: TaskState; freshness: ProgressFreshness; measurement: DeliveredMeasurement<D> | null; lastOwnerActivityAt: string | null; workerHealth: 'alive' | 'lost' | 'unknown'; cancellation: 'none' | 'pending'; resultRef?: string }>
type ObservationPermission = 'observe' | 'details' | 'cancel' | 'fallback';
interface ObserverBinding {
  readonly observerId: string;
  readonly task: TaskRef;
  readonly purpose: 'conversation' | 'project-history';
}
interface ProgressObservationPort<D extends { readonly kind: ProgressKind }> {
  attach(grant: ObservationGrant, cursor?: string): Promise<ObserverBinding>;
  read(binding: ObserverBinding, cursor?: string): Promise<ObservationReply<D>>;
  subscribe(binding: ObserverBinding, cursor?: string): AsyncIterable<ObservationReply<D>>;
  detach(binding: ObserverBinding): void;
}
```

**Parameters:**
- `task: TaskRef` — Task identity looked up through the caller’s authorized binding.

**Returns:** `ProgressSnapshot<D>` — One validated projection shared by reads and subscriptions.

**Errors:**
- `task-unavailable` when Task missing, unauthorized or expired.
- `binding-invalid` when Missing, expired, revoked or wrong-purpose grant, or a different socket used the binding. Return the same task-unavailable response externally.

**Preconditions:**
- IPC handler validates server-bound peer/session/project, capability and origin tuple. A matching request tuple alone grants nothing.
- IPC dispatch creates connection identity from the accepted socket. The daemon execution host creates or resolves the originating invocation through an authorized launch and the registry’s canonical project identity. Caller-supplied cwd, labels, PIDs, chat IDs and task tuples are selectors only. An unbound ordinary IPC caller cannot mint or renew a grant.
- The coordinator issues an opaque random 256-bit scoped grant only to the trusted launching connection or a verified adapter acting for that invocation. Store only its digest, task/attempt, purpose, allowed operations, expiry and revocation generation in daemon-owned state. Deliver the secret on the authorized transport and keep it out of logs, snapshots, cursors and model input. Clients retain it only in their trusted runtime or existing secure storage.

**Postconditions:**
- Public snapshot omits internal owner, epoch, transport credentials, session IDs and raw log paths.
- Cursor covers snapshot order while measurement revision covers progress change. Heartbeat, as-of reads and reconnect do not increment measurement revision.
- The attach handler checks the grant against the durable digest and generation, registered project, requested purpose, current attempt and expiry, then binds the observer to the current TrustedRpcContext connection identity. Each read, subscription, scheduler operation and control rechecks that binding and permission. Disconnect removes the live binding. Reconnect or daemon restart requires presenting the still-valid grant again and receives a new binding. Cursor alone never authenticates.
- The trusted execution host or authorized owner of the corresponding conversation can revoke the grant. Revoke durably before acknowledgement, invalidate bindings and pending delivery, and terminate the matching subscription. Registry removal invalidates all grants for that project. Prior-attempt grants cannot observe or cancel a replacement attempt.
- Issue the separate task-scoped project-history grant to the trusted originating project adapter at admission, with observe/details only and a bounded retention expiry. Conversation removal revokes conversation-scoped grants and releases only their associations. The project-history holder can reattach to surviving task state after removal, with no conversation access, lease renewal or cancellation. A bare registered project path never authorizes browsing another task.
- Attempt rollover issues fresh grants only to the verified origin adapter. The adapter can update the same stable task row after authorized reattachment. No prior-attempt grant can follow the rollover by itself.

### 2.3 `ObservationReply`

```typescript
interface ObservationReply<D extends { readonly kind: ProgressKind }> { readonly snapshot: ProgressSnapshot<D>; readonly disposition: 'changed' | 'unchanged' | 'resync'; readonly schedule: 'native' | 'scheduled' | 'suspended' | 'stopped'; readonly nextPollNotBefore?: string; }
type FallbackLease = { readonly leaseId: string; readonly generation: number; readonly expiresAt: string };
type PollSlot = { readonly leaseId: string; readonly generation: number; readonly slot: number };
interface FallbackObservationPort<D extends { readonly kind: ProgressKind }> {
  claim(binding: ObserverBinding, optIn: VerifiedFallbackOptIn): Promise<FallbackLease>;
  renew(binding: ObserverBinding, lease: FallbackLease): Promise<FallbackLease>;
  poll(binding: ObserverBinding, lease: FallbackLease, cursor?: string): Promise<ObservationReply<D>>;
  release(binding: ObserverBinding, lease: FallbackLease): void;
}
```

**Parameters:**
- `task: TaskRef` — Authorized target.
- `cursor: string` _(optional)_ — Last applied scope-bound cursor.
- `observer: ObserverBinding` — Server-owned transport association and explicit fallback opt-in.

**Returns:** `ObservationReply<D>` — Typed reply with compact details, change state and optional schedule hint.

**Errors:**
- `schedule-unavailable` when Client has no scheduler or fallback lease is not owned.
- `task-unavailable` when Caller cannot observe the attempt.
- `lease-held` when Another bound holder owns the current unexpired scheduler generation.
- `stale-lease` when Wrong holder, stale generation, revoked binding or expired scheduler lease.
- `too-early` when Current monotonic time precedes the next eligible cadence slot.
- `slot-in-flight` when An accepted slot has not settled or reached its deadline.
- `schedule-suspended` when No healthy authorized scheduler can claim this slot.

**Preconditions:**
- For fallback, coordinator admits one fenced lease per stable task. Subscribers without the lease can read the cached shared view but cannot claim a poll slot.
- A bound observer needs explicit opt-in, the fallback permission and a verified scheduler capability. The coordinator issues a lease to one connection-bound holder. Claim and renew are atomic against that stable task. Lease and slot generations are allocated by the daemon, never chosen by the caller.

**Postconditions:**
- Initial snapshot then one slot each 60 seconds on monotonic cadence, with no overlapping calls or catch-up bursts. Use wall time only for guidance. Transfer retains anchor, watermark and cursor. On process restart suspend fallback until fresh authorized opt-in and ownership are verified.
- Replay serves cached last result. Unknown/foreign cursor cannot read another task; an expired authorized cursor receives resync.
- Initial claim returns the existing current snapshot through read and sets a monotonic cadence anchor if absent. The scheduler lease lasts 120 seconds and is renewed by the holder at or before each healthy 60-second slot. Disconnect, explicit release, expiry, revocation or terminal state revokes its generation. A successor receives the existing anchor, last consumed slot and observation cursor. Transfer does not emit another scheduled poll.
- A poll atomically claims the current slot or returns too-early, slot-in-flight or a cached response for an already completed slot. Each in-flight slot holds the lease generation and a deadline before the next cadence boundary. Deadline or revoke cancels its observation signal. Finalization rechecks the live generation and slot before updating the cached response or watermark. A late completion returns stale-lease without delivery, cursor advance or task mutation.
- While a revoked slot is still draining, keep its bounded in-flight reservation until it settles or reaches its deadline. A replacement holder uses the next eligible slot after that reservation, skipping unavailable slots. Retain the consumed watermark across handoff. Suspension reports its cause and next eligible time; recovery resumes anchored 60-second slots without catch-up. Terminal transition revokes the scheduler and closes further polling with the authorized cached terminal snapshot.
- A cached slot reply is scoped to its authorized task, attempt and scheduler generation. Use the requesting binding and cursor to derive changed, unchanged or resync from the cached projection. No replay invokes progress() again.

### 2.4 `ObservationControl`

```typescript
interface ObservationControl { readonly task: TaskRef; readonly action: 'stop-observation' | 'cancel-execution'; readonly requestId: string; }
```

**Parameters:**
- `request: ObservationControl` — Explicit user-derived action with bounded idempotency key.

**Returns:** `Promise<'stopped' | 'pending' | 'unsupported'>` — Observation detached, cancellation requested or unsupported.

**Errors:**
- `conflicting-request` when Same scoped request ID with different action or attempt.
- `task-unavailable` when Caller lacks target or action authorization.

**Preconditions:**
- Stop observation is scoped to the caller’s observer and releases its fallback lease. Cancel requires current attempt, supported control and executor cancellation capability.

**Postconditions:**
- Persist cancel-pending before dispatch, key by task/attempt/requestId, and require idempotent owner request. Replays return the durable pending/outcome without a second dispatch. Restart surfaces pending for owner reconciliation and never replays it automatically.
- Only verified termination can become cancelled. A race with normal completion keeps the executor’s verified terminal outcome.

### 2.5 `TaskActivityLease`

```typescript
interface TaskActivityLease { readonly task: TaskRef; readonly origin: TaskOrigin; readonly fence: TaskOwnerFence; readonly renewedAt: string; readonly expiresAt: string; }
```

**Parameters:**
- `event: VerifiedOwnerActivity` — Runtime-only owner handle, matching epoch and strictly advancing owner sequence.

**Returns:** `TaskActivityLease | null` — One live association with the verified conversation, or none for an unbound task.

**Errors:**
- `stale-owner` when Expired epoch, stale sequence or terminal attempt.

**Preconditions:**
- Admission verifies originating association before detach. A replacement owner proves the executor still owns or actually resumed the execution.

**Postconditions:**
- Runtime renewal every 30 seconds, lease expiry at 120 seconds; use monotonic time in process. No observer can grant activity or renew a lease. Release affects only this attempt.

## 3. Data model changes

### 3.1 `Task record and ownership` — new

One registered project owns many invocation scopes. A verified invocation owns zero or more tasks. A task owns one current attempt and zero or more retained prior attempt summaries, and an attempt has at most one verified live owner epoch. The optional conversation binding belongs to one invocation and identifies one insrc conversation, which can own many invocations. Native and daemon session IDs are separately verified bindings and remain private. Reserve a fixed encoded record budget before returning observation admitted. Serialize mutations per stable task and arbitrate the reservation ledger globally, outside the per-task lock; never await delegate reads, transport sends or process cancellation under the lock. Reject unmatched duplicate registrations and make exact same-owner replays idempotent.

```
Versioned envelope: trusted origin, stable task key, current attempt and epoch, owner watermark, snapshot revision and meaningful revision, latest bounded snapshot, prior attempt summaries, terminal pointer and cancellation receipt.
```

**Call sites:**
- `src/daemon/server.ts`
- `src/daemon/steps/host.ts`
- `src/daemon/threads/registry.ts`

### 3.2 `Durable observation and bounded replay` — new

Daemon-only directory under its state root, keyed by a hash of trusted project, invocation and task. Use mode 0700 on the directory and 0600 files, reject symlinks, use an exclusive temporary file on the same filesystem, flush file then rename then flush the directory before acknowledging durable transitions. Reuse the existing atomic-replacement pattern where it provides those guarantees, and add the missing flush and security steps at this boundary. Active state and milestones coalesce at one update per second per task, while owner admission, attempt rollover and terminal snapshots commit before publication. Compact snapshots to 8 KiB, cap milestones and prior summaries at 32 total, cap observer queues at 16 and reserve a terminal slot. Reserve enough disk for atomic replacement, cap 128 active and 1,024 retained terminal observations per project and 128 MiB globally. At capacity, evict eligible terminal records only and otherwise refuse observation visibly. Executor work continues. Terminal retention is seven days subject to bounded capacity. Persist neither raw reporter output nor unvalidated labels. Validate version, bounds and owner identity before adoption; quarantine corrupt records within the storage budget. On startup or verified owner loss, transfer unrevalidated work to a recovery state for at most 120 seconds from the first durable owner-loss timestamp. Preserve that original deadline across restarts. During grace it retains the original reservation. At expiry, persist an explicit unknown/expired observation tombstone, drop detailed payload and invalidate owner and live-observer credentials. A still-valid read-only history grant can read the compact expired status, release active capacity and the activity lease, and fence the old epoch. The compact tombstone enters the bounded inactive pool, sharing the 1,024 per-project inactive record cap and global disk cap with terminal records but remaining explicitly nonterminal. It is reclaimable under pressure and expires at seven days at most. If the tombstone cannot be retained, delete the inactive record after fencing, make the old task unavailable, and never recreate it from an old callback. A late owner can only enter through a new trusted admission and fresh identity after expiry. A storage fault fails observation closed and remains visible while the expiry transition retries. Grant records have bounded count and encoded size within the same per-task reservation, with expiration and revocation garbage-collected before minting replacements.

```
Cursor binds to task, attempt and committed observation revision. In-memory bounded feed resumes at the cursor when available; after gaps or restart use the latest snapshot and explicit resync. Durable milestones record measured changes rather than heartbeat events. Recovery deadline, inactive disposition, expiry reason, scoped grant digests/revocation generation and reserved bytes are persisted. Raw grant secrets and runtime handles never enter the record.
```

**Call sites:**
- `src/workflow/storage.ts`
- `src/daemon/steps/__tests__/fixtures/task-persistence.ts`

### 3.3 `Runtime activity and fallback observer leases` — new

An active attempt can hold at most one activity association to its originating insrc chat, and one chat can hold many associations. Only verified owner activity renews it. The current chat owner can read the scoped retention projection; the adapter and existing client status projection remain s5. Separately, a stable task has at most one fallback scheduling lease across attempts and any number of bounded native observers. Use monotonic slot and lease deadlines while alive and suspend fallback at daemon restart. Persist no scheduler credentials. On restart emit interrupted or unknown until the actual owner revalidates, mint a new owner epoch before accepting further events, and never auto-start work. Persisted terminal state remains authoritative. Conversation removal releases only that association and retains authorized project-scoped results. A lease is valid only while the same current attempt owns its verified runtime epoch. Renewal after 120-second expiry requires new trusted revalidation and a fresh epoch within the recovery window. A 30-second heartbeat is scheduling intent and grants no right to renew from a reader. Fallback leases have a separate 120-second holder lifetime and slot fence. Their live credentials and monotonic timestamps are process-local.

```
Lease epoch, holder binding, monotonic schedule anchor, last slot, in-flight slot and cursor. Retention projection exposes task and expiry, not owner credentials.
```

**Call sites:**
- `src/daemon/chat-sessions.ts`
- `src/daemon/server.ts`

## 4. Diagrams

- [Sequence diagram](docs/epics/show-long-running-task-progress-chat-E20261109206db342/S001/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | Provide the common generic delegate, task identity and verified owner-fence invariants. Concrete executors and their detail schemas remain sibling-owned. Predecessor traceability deliverable for ac5: July S001 / #42 → s1 and s2. Common daemon progress, compatible IPC and workflow/analyze producer measurements. July S002 / #43 → s6. MCP progress-token gating, native CLI qualification and optional observation. July S003 / #44 → s5. Typed IDE consumption and terminal progress in current VS Code chat. Each original issue and local story record remains traceable. This crosswalk records coverage only. Tracker linkage and retirement remain a separate decision. |
| `sc2` | implements | Normalize, persist and authorize snapshots, subscription cursors, fallback schedule and explicit control. Additive IPC routing and authorization belong here; MCP/VS Code presentation belong to their own stories. |
| `sc3` | implements | Provide verified owner renewal and the read-only association projection. Native clients and the extension session adapter remain outside this story. |

## 6. Error paths

**Error cases**

- **Foreign or revoked observation** (terminal)
  - Detection: Trusted server binding fails project, invocation and current-attempt permission checks.
  - Response: Return task-unavailable with identical missing/unauthorized shape. Do not consult delegate or emit detail.
  - User impact: No cross-chat or cross-project disclosure.
- **Old owner or malformed measurement** (recoverable)
  - Detection: Owner handle, epoch, sequence, detail schema or serialized-size check fails, including after asynchronous refresh.
  - Response: Drop stale writes and preserve last verified measurement with stale or unavailable freshness if source is invalid. Never advance ownership or progress.
  - User impact: Last trusted state remains readable.
- **Disk commit or capacity reservation fails** (recoverable)
  - Detection: Write, fsync, rename, validation or reserved-budget check fails.
  - Response: Do not publish an uncommitted terminal result. Mark observation degraded, preserve the old committed record, and reconcile against the same owner after recovery. Distinguish failures after rename by re-reading and verifying the durable record before retry.
  - User impact: Execution continues and can be inspected through its existing result path where available.
- **Daemon restarts with active records** (recoverable)
  - Detection: Startup rehydrates valid envelopes with an owner epoch from a prior process.
  - Response: Retain the last verified measurement, mark interrupted or unknown, and fence previous callbacks. Resume observation only after owner proves survival or actual resumption. Preserve terminal state and reconcile pending cancellation without auto-dispatch.
  - User impact: A restart does not imply completion or relaunch.
- **Fallback transport loss or contention** (recoverable)
  - Detection: Rate limit, expired lease, duplicate slot or disconnected holder.
  - Response: Publish suspended observation and preserve the shared cadence anchor when a supported holder recovers. Honor retry-after as degraded behavior and avoid overlapping calls or replay bursts.
  - User impact: Progress may be delayed and is visibly degraded.
- **Owner never returns after restart** (recoverable)
  - Detection: The persisted recovery deadline expires without trusted survival evidence.
  - Response: Persist an expired observation, release its active reservation and retention, reject old epoch, and reclaim the bounded tombstone on pressure or TTL.
  - User impact: Capacity becomes available while the execution outcome remains unknown.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Heartbeat or repeated reads with equal measured progress | Only owner activity and freshness can change. Keep the same meaningful revision and original measurement age. |
| Two authorized viewers, a lagged cursor, and terminal outcome during a full queue | One fallback scheduler at most. Coalesce and explicitly resync lagged observers. Terminal delivery uses reserved capacity and has one stable outcome. |
| Older owner callback arrives after a newer attempt or task terminal | Reject by attempt and epoch, never resurrect retention or overwrite a terminal state. |
| Stop updates races with cancel or normal completion | Detach only the observer. Explicit cancellation is pending until the verified outcome, and request replay cannot duplicate the side effect. |
| Fallback holder disconnects during an accepted poll and a new observer claims the lease | The old generation cannot deliver or advance the cursor. The successor inherits the cadence anchor and slot watermark, with no overlapping admission or catch-up. |

**Invariants to preserve**

- Daemon owns state and scope. Keep typed Unix IPC and existing terminal execution semantics. [[c2]]
- Existing review trackers and session pool remain authoritative for their own evidence. Observation does not invoke models, alter workflows or imply native-session activity. [[c3]]

## 7. Test strategy

**Test framework:** `Node.js node:test with tsx, strict assertions, injected clocks and daemon IPC fixtures.`

**Test levels**

- **unit** — Exercise ordering, scheduler ownership and controls with deterministic clocks.
  - Subjects: `Fence async refresh, duplicate registration and old attempt callbacks`, `Verify monotonic 60-second fallback, transfer, suspension and unchanged suppression`, `Check stop, cancel replay and verified completion races`, `Verify 30-second owner renewal and 120-second expiry with no observers, separate tasks in one chat, removal, and stale callbacks`, `Fence scheduler claim, renew, release, duplicate slots and late replies across transfer with deterministic 60-second cadence and 120-second expiry`
  - Fixtures: `Two fake owners and observers, clock control and delayed delegate reads.`
- **integration** — Prove persisted terminal ordering and scope safety through normal daemon entry points.
  - Subjects: `Recover bounded snapshots across storage failure, restart and owner revalidation`, `Reject cross-project and cross-conversation reads, controls and raw details`, `Saturate per-project active/inactive and global reservations, coalesce full observer queues, and preserve terminal delivery and running execution`, `Restart repeatedly without owners, preserve the recovery deadline, release expired reservations and refuse stale revalidation without inventing termination`, `Verify trusted launch, denial of forged ordinary IPC scopes, grants across reconnect and restart, revocation and scoped project-history access after removal`
  - Fixtures: `Temporary daemon state directory, injectable write fault points, two registered fixture repos and an IPC client.`, `Configurable bounded quotas, restartable owner fixture, disconnected observer, secure grant fixture, and full subscriber queue.`
- **contract** — Preserve scope handoff and evidence from predecessor stories.
  - Subjects: `Verify S001/#42 to s1–s2, S002/#43 to s6 and S003/#44 to s5 from local predecessor records and successor scope`
  - Fixtures: `Consolidated DEF and HLD, July DEF and all three July story LLDs with individual tracker references.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Fence async refresh, duplicate registration and old attempt callbacks`, `Verify monotonic 60-second fallback, transfer, suspension and unchanged suppression`, `Verify 30-second owner renewal and 120-second expiry with no observers, separate tasks in one chat, removal, and stale callbacks`, `Fence scheduler claim, renew, release, duplicate slots and late replies across transfer with deterministic 60-second cadence and 120-second expiry` |
| `ac2` | `Recover bounded snapshots across storage failure, restart and owner revalidation`, `Saturate per-project active/inactive and global reservations, coalesce full observer queues, and preserve terminal delivery and running execution`, `Restart repeatedly without owners, preserve the recovery deadline, release expired reservations and refuse stale revalidation without inventing termination` |
| `ac3` | `Check stop, cancel replay and verified completion races`, `Verify 30-second owner renewal and 120-second expiry with no observers, separate tasks in one chat, removal, and stale callbacks`, `Restart repeatedly without owners, preserve the recovery deadline, release expired reservations and refuse stale revalidation without inventing termination` |
| `ac4` | `Reject cross-project and cross-conversation reads, controls and raw details`, `Verify trusted launch, denial of forged ordinary IPC scopes, grants across reconnect and restart, revocation and scoped project-history access after removal` |
| `ac5` | `Verify S001/#42 to s1–s2, S002/#43 to s6 and S003/#44 to s5 from local predecessor records and successor scope` |
| `ac6` | `Fence async refresh, duplicate registration and old attempt callbacks`, `Recover bounded snapshots across storage failure, restart and owner revalidation`, `Restart repeatedly without owners, preserve the recovery deadline, release expired reservations and refuse stale revalidation without inventing termination`, `Saturate per-project active/inactive and global reservations, coalesce full observer queues, and preserve terminal delivery and running execution`, `Verify trusted launch, denial of forged ordinary IPC scopes, grants across reconnect and restart, revocation and scoped project-history access after removal` |

## 8. Migration

**State before:** Existing IPC dispatch, review checkpoints and ChatSessionPool remain separate sources, as grounded in s1 context. There is no shared durable progress record.

**State after:** Daemon owns an additive bounded progress record and authorized observation contract. Existing executors and clients continue to work before sibling adapters are connected.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Initialize the private versioned observation namespace on first daemon start. Existing state remains untouched. — ↩ rollbackable
2. Expose the additive foundation to registered consumers and validate recovery, lease fencing and fail-open execution using fixtures. — ↩ rollbackable
3. On rollback remove the additive observation surface and leave its bounded records inert for a later compatible upgrade. Existing executor results and session records remain authoritative. — ↩ rollbackable

**Backward compat:** The Unix IPC protocol, current review checkpoints, executor outcomes and native session ownership are preserved. Old clients can ignore the additive surface.

## 9. Alternatives considered

### 9.1 a1: Atomic bounded record per task — **CHOSEN**

One per-task record is the recovery authority for observation state.

Store one versioned envelope per task under the daemon state root, with a reserved bounded record budget. Serialize updates for a task, commit terminal state before publication, and rebuild in-memory cursors and expiry queues from the persisted records on startup.

### 9.2 a2: Split snapshot and bounded milestone journal

Maintain separate bounded checkpoint and milestone files per task.

Keep a compact current snapshot file plus a capped append journal for meaningful milestones. A shared revision lets recovery discard a journal suffix that was not committed with the snapshot.

**Rejected because:** A split journal needs an additional recovery protocol to keep the snapshot and history consistent.

## 10. References

- **[[c1]]** `prior-artifact` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/HLD.md`
- **[[c2]]** `analyze-bundle` `s1 structural map of IpcServer, TargetRegistry and trusted request scope`
- **[[c3]]** `analyze-bundle` `s1 structural map of ChatSessionPool and review checkpoint ownership`
- **[[c4]]** `prior-artifact` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/DEF.md`
- **[[c5]]** `doc` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/er-model.html`
- **[[c6]]** `code` `src/daemon/server.ts`
- **[[c7]]** `code` `src/daemon/threads/registry.ts`
- **[[c8]]** `code` `src/daemon/steps/host.ts`
- **[[c9]]** `code` `src/daemon/chat-sessions.ts`
- **[[c10]]** `code` `src/workflow/storage.ts`
- **[[c11]]** `code` `src/daemon/steps/__tests__/fixtures/task-persistence.ts`
- **[[c12]]** `code` `src/workflow/code-review/task-review/progress.ts`
- **[[c13]]** `code` `src/workflow/review/design-review/progress.ts`
- **[[c14]]** `code` `src/shared/types.ts`
- **[[c15]]** `prior-artifact` `docs/epics/stream-incremental-progress-from-daemon-calling-E202607196d6cfaf9/S001/LLD.md` — "Tracker insors-ai/insrc#42"
- **[[c16]]** `prior-artifact` `docs/epics/stream-incremental-progress-from-daemon-calling-E202607196d6cfaf9/S002/LLD.md` — "Tracker insors-ai/insrc#43"
- **[[c17]]** `prior-artifact` `docs/epics/stream-incremental-progress-from-daemon-calling-E202607196d6cfaf9/S003/LLD.md` — "Tracker insors-ai/insrc#44"

## Citations

- **[[c1]]** `prior-artifact` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/HLD.md`
- **[[c2]]** `analyze-bundle` `s1 structural map of IpcServer, TargetRegistry and trusted request scope`
- **[[c3]]** `analyze-bundle` `s1 structural map of ChatSessionPool and review checkpoint ownership`
- **[[c4]]** `prior-artifact` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/DEF.md`
- **[[c5]]** `doc` `docs/epics/show-long-running-task-progress-chat-E20261109206db342/er-model.html`
- **[[c6]]** `code` `src/daemon/server.ts`
- **[[c7]]** `code` `src/daemon/threads/registry.ts`
- **[[c8]]** `code` `src/daemon/steps/host.ts`
- **[[c9]]** `code` `src/daemon/chat-sessions.ts`
- **[[c10]]** `code` `src/workflow/storage.ts`
- **[[c11]]** `code` `src/daemon/steps/__tests__/fixtures/task-persistence.ts`
- **[[c12]]** `code` `src/workflow/code-review/task-review/progress.ts`
- **[[c13]]** `code` `src/workflow/review/design-review/progress.ts`
- **[[c14]]** `code` `src/shared/types.ts`
- **[[c15]]** `prior-artifact` `docs/epics/stream-incremental-progress-from-daemon-calling-E202607196d6cfaf9/S001/LLD.md` — "Tracker insors-ai/insrc#42"
- **[[c16]]** `prior-artifact` `docs/epics/stream-incremental-progress-from-daemon-calling-E202607196d6cfaf9/S002/LLD.md` — "Tracker insors-ai/insrc#43"
- **[[c17]]** `prior-artifact` `docs/epics/stream-incremental-progress-from-daemon-calling-E202607196d6cfaf9/S003/LLD.md` — "Tracker insors-ai/insrc#44"

<!-- insrc:artifact LLD-d8b2fe8e08f1d1be-s1 -->

# LLD: STORY-d8b2fe8e08f1d1be-s1

## Summary

**Epic:** `allow-independent-turns-concurrent-vs-code`
**HLD base run:** `wf-1794119119166-t2qxd2`
**HLD effective hash:** `93b55be1c269...`

Run two chats in the same repository independently, including when one waits for an approval. Switching back restores the running chat’s progress and elapsed time. The queue still preserves message order within each chat and keeps Stop and decisions scoped to that chat. This standalone design follows approved ISSUE-d8b2fe8e08f1d1be. The header’s Epic and HLD fields are generated workflow identifiers.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [UX](#9-ux)
10. [References](#10-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `createChatQueueStore`

```typescript
createChatQueueStore(deps: ChatQueueStoreDeps): ChatQueueStore & ChatQueueLeases
```

**Parameters:**
- `deps: ChatQueueStoreDeps` — Existing repository database and clock

**Returns:** `ChatQueueStore & ChatQueueLeases` — Atomic eligible-session admission and fenced per-session ownership

**Errors:**
- `StoreUnavailable` when Newer schema or unsafe/inconsistent legacy state

**Preconditions:**
- All windows sharing this database must run a compatible plugin before the schema changes.

**Postconditions:**
- Acknowledgement atomically leases the oldest due head eligible for its window and marks it processing, preserving attempts. At most one active lease per session and two per repository. An ineligible head in another session does not block an eligible session.
- Heartbeat, spawn registration, waiting update, finish, transfer, and release compare session, sequence and owner epoch in the same transaction. Completion and lease release are atomic.

### 2.2 `createChatQueueWorker`

```typescript
createChatQueueWorker(deps: ChatQueueWorkerDeps): ChatQueueWorker
```

**Parameters:**
- `deps: ChatQueueWorkerDeps` — Existing store, runner and window identity

**Returns:** `ChatQueueWorker` — Schedules eligible session heads and observes each lease independently

**Errors:**
- `StoreBusy` when Another writer holds the SQLite write transaction beyond its timeout

**Preconditions:**
- Worker owns its window presence and starts only messages for that window.

**Postconditions:**
- Pending retry, missing owner, waiting input and detached recovery are evaluated per session. A waiting or detached live lease consumes its slot until verified ended or safely transferred.
- Order eligible heads by sequence. A same-session older queued or retrying row blocks younger rows for that session, including across windows. Future retries and closed-window heads do not block other sessions.

### 2.3 `createChatPanelHost`

```typescript
createChatPanelHost(deps: ChatPanelHostDeps): ChatPanelHost
```

**Parameters:**
- `deps: ChatPanelHostDeps` — Existing provider, store, view and runtime seams

**Returns:** `ChatPanelHost` — Routes each session runtime to the selected webview

**Errors:**
- `stale-session-action` when The action’s session, active turn or request identity is stale

**Preconditions:**
- Session locks remain the final guard against duplicate CLI execution.

**Postconditions:**
- Selection changes only which session renders. Stop, permission, selection, transcript and diff operations target the intended session or turn. Background completion cannot reset the current chat.
- Restore sends current progress with the transcript. Subsequent updates are keyed by session and turn and rejected when stale.

### 2.4 `ChatQueueStore`

```typescript
head(windowKey: string, now: number): QueuedMessage | undefined; acknowledge(seq: number, claim: LeaseClaim): LeaseToken | undefined; finish(token: LeaseToken, outcome: TurnOutcome): FinishResult; markWaiting(token: LeaseToken, on: WaitingOn): boolean; markNotDeliveredIfHead(seq: number): boolean
```

**Parameters:**
- `token: LeaseToken` — Original sessionId, seq and owner epoch returned by admission or reclaim
- `claim: LeaseClaim` — Originating window and verified process identity
- `outcome: TurnOutcome` — Existing classified result

**Returns:** `Typed internal contract` — Acknowledgement returns immutable ownership; finish returns {kind:'applied', row?:QueuedMessage} or {kind:'stale'}.

**Errors:**
- `StoreBusy` when SQLite write transaction times out

**Preconditions:**
- Queue stores phase eligibility and ownership in the repository transaction.

**Postconditions:**
- Admission rechecks due time, session FIFO, window, capacity and active session lease in the write transaction. Expired presence alone is insufficient to mark not delivered.
- Preserve attempts on acknowledgement. Increment only when finish schedules an existing eligible pre-action infrastructure retry, using the prior count for 10s, 60s, 300s delays. Retry-now preserves attempts. Finish transitions the row and releases the matching lease atomically.
- Every callback retains its original token. A stale finish is a no-op and is never retried using a fresh lease.

### 2.5 `ChatQueueLeases`

```typescript
lease(sessionId: string): RepoLease | undefined; leases(): readonly RepoLease[]; heartbeat(token: LeaseToken): boolean; attachCli(token: LeaseToken, cli: CliIdentity): boolean; reclaim(expected: LeaseToken, owner: LeaseClaim, proof: OwnerExitProof): LeaseToken | undefined; takeOver(expected: LeaseToken, owner: LeaseClaim, proof: TurnExitProof): boolean
```

**Parameters:**
- `expected: LeaseToken` — Lease observed before checking liveness
- `owner: LeaseClaim` — Replacing window and verified process identity
- `proof: OwnerExitProof | TurnExitProof` — Typed positive evidence of the recorded writer’s departure, plus positive evidence for the CLI when terminal recovery requires it

**Returns:** `Typed internal contract` — Recovery returns a new token for a positively departed writer, or false/undefined for stale or unverified ownership.

**Errors:**
- `StoreBusy` when SQLite contention prevents a fenced transition

**Preconditions:**
- Detached live CLI occupies capacity. A missing CLI identity is unresolved until session-lock and output evidence exclude a live child.

**Postconditions:**
- Compare original token under transaction before any mutation. Admission and reclaim mint a new unique epoch. Same-window live CLI reclaim follows existing lease grace and liveness rules. Other dead-window recovery finalizes only after both old writer and CLI are verified gone.
- Remove standalone release from normal worker callbacks. A matching terminal transaction releases its own lease, and unknown liveness retains the slot.
- The process probe used by queue setup and worker returns a tagged observation: present with verified start time, absent with a definitive OS no-process result, or unknown for permission errors, timeout or unreadable identity. A present PID with a known start time different from the recorded start time proves replacement. A present PID with the same start time, a missing recorded start time, or unavailable current start time cannot prove departure. Only definitive absence or verified replacement authorizes old-owner recovery. Unknown evidence retains the lease and defers migration. Recheck the observed lease token in the transaction after probing.

### 2.6 `WebviewToHost`

```typescript
type SessionActionTarget = { sessionId: string; turnId: string; viewGeneration: number }; type PendingDecisionTarget = SessionActionTarget & { requestId: string }
```

**Parameters:**
- `target: SessionActionTarget | PendingDecisionTarget` — Captured from the rendered control and carried unchanged with Stop, permission, selection or edit decisions

**Returns:** `Typed internal contract` — Resolve actions against the targeted session runtime and current view generation.

**Errors:**
- `stale-session-action` when View generation, session, turn or pending request no longer matches

**Preconditions:**
- The host assigns a new view generation on session switch or reload and includes it in the restore frame.

**Postconditions:**
- Stop requires a matching current active turn. Approval and selection use session, origin turn and request ID to resolve an unresolved persisted request, including a request whose original turn ended before its continuation. A valid ended request cannot be applied to a different current turn. Edit decisions additionally carry the target path and reject an invalidated baseline.
- A stale action never falls back to the selected session. Keep the existing action payload and add the identity fields, and reject missing or stale identity on newly rendered controls.

### 2.7 `HostToWebview`

```typescript
type SessionProjectionTarget = { sessionId: string; turnId?: string; viewGeneration: number }; type SessionProgress = { turnId: string; startedAt?: number; phase: ActivePhase; label?: string }
```

**Parameters:**
- `target: SessionProjectionTarget` — Identity for progress, transcript, running, completion and diff projections
- `progress: SessionProgress | undefined` — Current active state in the same session-restored frame as the transcript

**Returns:** `Typed internal contract` — Restore provides a single coherent selection snapshot and ongoing events for the same view.

**Errors:**
- `stale-projection` when Event belongs to a previous view generation, session or superseded turn

**Preconditions:**
- Per-session persistence happens before any view delivery.

**Postconditions:**
- The webview accepts session-restored only for the latest generation. A later terminal for another turn cannot clear the selected chat. Transcript row projections include owning turn when there is one. Filter active turn projections by turn identity and display snapshot with original elapsed time, or no elapsed time if unknown.

### 2.8 `projectOutbox`

```typescript
projectOutbox(rows: readonly QueuedMessage[], sessionId: string, ctx: OutboxContext): OutboxView
```

**Parameters:**
- `rows: readonly QueuedMessage[]` — Durable rows in seq order
- `sessionId: string` — Visible chat
- `ctx: OutboxContext` — Consistent queue eligibility snapshot with time, lease occupancy and owner availability

**Returns:** `Typed internal contract` — Session rows with a typed wait reason, plus running-session summaries and repository slot usage.

**Errors:**
- `stale-snapshot` when Queue state changes between projection and click

**Preconditions:**
- Use the same eligibility predicate and snapshot as store admission. Outbox actions still revalidate the row in its transaction.

**Postconditions:**
- Replace global 'runs next' position, aheadFromOtherChats, singleton runningChat and blockedBy with per-session position, activeTurns, capacity and optional waitReason. Render no block reason for an eligible row with free capacity.
- Wait reason precedence for a waiting row: earlier same-session message or active same-session lease, retry delay, unavailable originating window, then repository capacity. A processing row displays its own wait state. Only report another chat waiting as a capacity contributor when slots are full. Idle drafts without a queued row show no blocked message.

### 2.9 `StreamAdapter`

```typescript
resume(req: ResumeRequest, opts?: ResumeOptions): AsyncIterable<TurnEvent>; TurnProcess.stopVerified(): Promise<boolean>
```

**Parameters:**
- `req: ResumeRequest` — Persisted cursor, PID and recorded process start time for this turn
- `opts: ResumeOptions` _(optional)_ — Existing attach, checkpoint, drain and abort hooks

**Returns:** `AsyncIterable<TurnEvent> / Promise<boolean>` — Resumed output events and a positive Stop result only when process exit is verified.

**Errors:**
- `observation-failed` when Output cannot establish completion and process identity is unknown

**Preconditions:**
- Queue, adapter, foreground follower and detached observer use the same tagged process observation. A missing PID or missing current or recorded start time for a present PID yields unknown identity. A definitive no-process result or a verified PID reuse proves the recorded process departed.

**Postconditions:**
- Use positive departure proof for the resumed handle’s exit promise and for the tail reader’s finished predicate. Unknown identity keeps the tail eligible to receive real output. Abort or follower teardown releases polling resources without resolving process exit. No synthetic terminal or verified exit follows an unknown observation.
- Real provider terminal output completes the matching logical turn after the existing drain contract. If the tail closes without terminal evidence and process departure is unverified, emit an observationFailure event. A bare segment end or transport error does not prove process exit. Keep the existing cursor, pin, pending decisions, lease, original start time and last progress. Schedule re-observation through existing bounded retry paths.
- A resumed handle signals only the positively matched recorded process using the existing guarded signal path. For unknown identity, Stop sends no signal and returns unverified. A missing handle with retained live metadata also returns unverified. Neither a no-op signal, a follower abort, nor an observation failure can fulfill stopVerified. A later positive exit proof or trusted child exit can certify the stop.
- Stop stays scoped to the requested session and turn. On unverified Stop, show that exit could not be confirmed, keep the session active with its last known progress and reattach observation. Resume and observer projection treat observationFailure as nonterminal. Queue capacity changes only on a matching verified terminal transition or fenced departure recovery.

## 3. Data model changes

### 3.1 `Repository queue lease` — invariant-change

Repository database owns zero to two live leases. Each lease belongs to exactly one session and references exactly one processing message by seq; unique session_id and seq. A unique opaque owner epoch fences stale writes. Window key and PID/start time retain ownership provenance. Detached running CLI retains its slot. Only verified terminal state or verified death allows release or an explicit fenced recovery.

```
Replace singleton lease id=1 with session_id primary key and unique message seq; add owner epoch and session/sequence index for message eligibility. Bump queue schema from 2 to 3.
```

**Call sites:**
- `vscode-plugin/src/chat/chat-queue-store.ts`
- `vscode-plugin/src/chat/chat-queue-worker.ts`

### 3.2 `QueuedMessage` — invariant-change

One repository owns many queued rows; each row belongs to exactly one session and originating window. Rows and sequence survive migration. A session owns many messages ordered by seq, with at most one processing row. Retry and resends preserve existing idempotency and retain the originating session.

**Call sites:**
- `vscode-plugin/src/chat/chat-queue-store.ts`
- `vscode-plugin/src/chat/chat-queue-worker.ts`

### 3.3 `ChatSession progress` — field-add

Each session may own one current turn progress snapshot: turn ID, turn epoch, start timestamp, phase (starting, working, waiting approval or choice), optional latest safe status label. Persist transitions with the owning live-turn checkpoint, coalesce repeated identical updates, and do not append progress to transcript. Clear only on verified terminal or Stop completion for the same turn. Idle is derived when no active turn exists. Legacy missing snapshot derives a running or waiting state from verified live metadata and pending requests; omit elapsed time when the start timestamp is unknown.

**Call sites:**
- `vscode-plugin/src/chat/session-store.ts`
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/turn-lifecycle.ts`

### 3.4 `Host session runtime` — invariant-change

Each session owns one runtime containing its current queued run, lifecycle, approval/choice state, diff scope and progress. Reuse existing runtime contracts; reclaim only when no live turn, pending request, or follow remains. A selected-view generation gates projection and never owns execution. In queue-disabled test seams maintain existing single-session behavior.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/turn-lifecycle.ts`

## 4. Diagrams

- [ER model](docs/standalone/allow-independent-turns-concurrent-vs-code-E20261108d8b2fe8e/S001/er-model.html)
- [Sequence diagram](docs/standalone/allow-independent-turns-concurrent-vs-code-E20261108d8b2fe8e/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **Queue ownership changes during a callback** (recoverable)
  - Detection: Atomic update matches no row for the expected session, sequence and owner epoch.
  - Response: Drop the stale callback and stop the obsolete observer. Preserve the replacement lease and its progress.
  - User impact: A reloaded window resumes its own session without duplicating work.
- **SQLite contention or interrupted upgrade** (recoverable)
  - Detection: Existing SQLite busy error or failed schema transaction.
  - Response: Retry contention through existing queue backoff. Roll back upgrade atomically and report invalid rows without dropping messages.
  - User impact: Messages remain recoverable and the store can reopen after the contention resolves.
- **Old client still attached during migration** (recoverable)
  - Detection: A current or legacy extension host has a live presence or queue lease owner. An unconfirmed identity is treated as live.
  - Response: Defer migration until old windows are closed or reloaded and their queue owners are positively gone. A still-live detached CLI is adopted as an occupied slot, only after its old writer is gone.
  - User impact: The upgrade waits for a safe cutover and retains queued and detached work.
- **Progress observer loses output while CLI is live** (recoverable)
  - Detection: Existing lifecycle classifies the failure as observation-failed with no verified terminal.
  - Response: Retain last known progress and the lease. Reattach using existing cursor recovery.
  - User impact: The bar continues to show the last known activity during recovery.
- **Concurrent turns can affect the same worktree path** (recoverable)
  - Detection: A repository has overlapping active turns or another turn/external edit has invalidated a rollback baseline.
  - Response: Scope diff ownership and follow-up to the originating turn. Fail closed for automated reject/revert for any baseline exposed to parallel work unless exclusive path ownership and unchanged after-image are verifiable. Offer manual diff inspection.
  - User impact: Chats share the working tree. Automatic undo may be unavailable for overlapping edits, so another chat’s changes are preserved.
- **PID is present but its start time cannot be read** (recoverable)
  - Detection: Queue setup receives an unknown process observation instead of a verified identity. The existing boolean helper can return false for this case.
  - Response: Keep capacity occupied. Use a definitive no-process result or a verified mismatch of recorded and observed start times to form departure proof. Do not convert an unknown observation into a recovery proof.
  - User impact: The affected chat keeps its queue slot until its process state can be verified.
- **A resumed live PID’s current start time is unreadable** (recoverable)
  - Detection: The shared process observation reports unknown while the recorded cursor has no valid terminal event.
  - Response: Preserve liveTurn, decoder/cursor checkpoint, output retention, progress and queue ownership. Resume may still consume genuine terminal output. A Stop request without positive process identity returns unverified and resumes observation without sending a signal. Only definitive absence, confirmed PID reuse or a trusted child exit may prove process exit.
  - User impact: The chat shows its last known progress and an unverified Stop result until the turn genuinely completes or its exit can be confirmed.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A awaits a choice while B and C submit. | B uses the second slot. C waits for capacity. The outbox explains actual capacity or same-chat ordering. |
| Switch A to B to A during a quiet interval. | A immediately shows its last active phase and original elapsed time without requiring another provider event. |
| Terminal callback arrives from A while B is selected. | Only A’s runtime and status complete. B’s progress, Stop control and pending cards stay intact. |
| A legacy live session lacks a start time. | Render a verified active or waiting phase immediately, with elapsed time absent until a known start is available. |

**Invariants to preserve**

- At most one CLI per chat across windows, and never replay a turn merely because a view switched. [[c3]]
- Unresolved approval and selection requests remain actionable through their existing owning turn. [[c4]]
- Process identity checks, detached observation and output cursor retention continue to guard recovery. [[c3]]

## 6. Test strategy

**Test framework:** `Node test runner through tsx, existing fake clocks, fake webview DOM, fake providers and real temporary SQLite.`

**Test levels**

- **integration** — Prove durable queue scheduling and recovery with real SQLite and two owners.
  - Subjects: `Queue admits A and B while preserving FIFO in each session and capacity two across windows.`, `A waiting on input or retry does not block B when a slot is available.`, `Fenced finish, heartbeat, transfer and terminal handling cannot touch a newer lease.`, `Version 2 SQLite upgrade preserves pending messages and an orphaned live lease; concurrent old owner defers upgrade; interrupted transaction rolls back.`, `First claim preserves attempts and pre-action failures retry after 10s, 60s and 300s before exhausting the original budget.`, `Confirmed absent or replaced PID permits fenced recovery, while a missing start time, permission error or unknown process observation retains the lease and defers migration.`
- **integration** — Execute the panel script and host transport with independent turn streams.
  - Subjects: `A → B → A shows the last progress and original elapsed time before the next event.`, `Late A events, Stop, approval and choice stay scoped to A when B is selected.`, `Reload during a detached turn restores progress and the original start time.`, `Parallel edit rollback refuses when the baseline is exposed to another turn.`, `Delayed Stop and repeated request IDs are fenced by session, view generation and originating turn. An ended request remains actionable only while its own continuation is pending.`, `Outbox reasons match admission for free capacity, full capacity, same-chat FIFO, future retry and unavailable owner.`, `Reload a running session with a live PID, recorded start time, unreadable current identity and no terminal output. Restore active progress and controls, retain the lease and cursor, and reject Stop without signaling or certifying exit. Switching to B still uses the second slot. A later genuine terminal or verified departure releases only A’s lease.`
- **smoke** — Confirm the visible two-chat flow in VS Code.
  - Subjects: `Start A and B in the same repo, return to A while B progresses, and stop A without affecting B.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Queue admits A and B while preserving FIFO in each session and capacity two across windows.`, `A waiting on input or retry does not block B when a slot is available.`, `Outbox reasons match admission for free capacity, full capacity, same-chat FIFO, future retry and unavailable owner.` |
| `ac2` | `A → B → A shows the last progress and original elapsed time before the next event.`, `Reload during a detached turn restores progress and the original start time.`, `Reload a running session with a live PID, recorded start time, unreadable current identity and no terminal output. Restore active progress and controls, retain the lease and cursor, and reject Stop without signaling or certifying exit. Switching to B still uses the second slot. A later genuine terminal or verified departure releases only A’s lease.` |
| `ac3` | `Late A events, Stop, approval and choice stay scoped to A when B is selected.`, `Parallel edit rollback refuses when the baseline is exposed to another turn.`, `Delayed Stop and repeated request IDs are fenced by session, view generation and originating turn. An ended request remains actionable only while its own continuation is pending.`, `Reload a running session with a live PID, recorded start time, unreadable current identity and no terminal output. Restore active progress and controls, retain the lease and cursor, and reject Stop without signaling or certifying exit. Switching to B still uses the second slot. A later genuine terminal or verified departure releases only A’s lease.` |
| `ac4` | `Fenced finish, heartbeat, transfer and terminal handling cannot touch a newer lease.`, `Version 2 SQLite upgrade preserves pending messages and an orphaned live lease; concurrent old owner defers upgrade; interrupted transaction rolls back.`, `First claim preserves attempts and pre-action failures retry after 10s, 60s and 300s before exhausting the original budget.`, `Confirmed absent or replaced PID permits fenced recovery, while a missing start time, permission error or unknown process observation retains the lease and defers migration.`, `Reload a running session with a live PID, recorded start time, unreadable current identity and no terminal output. Restore active progress and controls, retain the lease and cursor, and reject Stop without signaling or certifying exit. Switching to B still uses the second slot. A later genuine terminal or verified departure releases only A’s lease.` |

## 7. Migration

**State before:** The s1 queue bundle identifies a single repository lease in the version 2 SQLite database. The s1 session bundle identifies optional persisted live-turn metadata, while progress status is transient in the selected webview.

**State after:** Version 3 queue retains message sequences, retry state, presence and any recoverable live CLI identity. Session heads may carry additive progress snapshots, and two different sessions may run at once.

**Zero downtime:** no — **Data rewrite:** yes

**Steps**

1. Close or reload every window using the older extension. Confirm no live legacy database writer before attempting upgrade. Preserve a consistent offline SQLite backup including WAL state using the SQLite backup mechanism. — ↩ rollbackable
2. Within one write transaction validate existing rows, create session leases, translate any singleton lease through its processing message’s session ID and preserve owner/CLI identity, rebuild indexes, then set version 3. Inconsistent ownership aborts transaction. — ↩ rollbackable
3. Open compatible windows. Recover per-session leases with the existing process identity checks. Derive missing progress on first reattach and persist it only when its ownership is established. — ✕ non-rollbackable

**Backward compat:** Old windows are closed during cutover. An older extension reopening the database refuses the newer version. A failed upgrade leaves version 2 intact. An offline backup can restore version 2 before new writes. After any version 3 work is accepted, reverting to that backup would discard newer messages, so stop and reconcile that work before downgrade. Session heads tolerate absent progress and keep existing transcript fields.

## 8. Alternatives considered

### 8.1 a1: Shared queue with session leases — **CHOSEN**

Retain repository SQLite coordination and schedule independent session heads.

Replace the singleton lease with one fenced lease per session, cap concurrent leases per repository, and bind progress to each session and turn in the host.

### 8.2 a2: Separate queue files per session

Use the existing one-turn queue independently for each session.

Allocate each session a separate queue database and coordinate a shared admission limit and recovery across files. Keep session progress separate from foreground selection.

**Rejected because:** Introduces additional state stores and coordination for the same user-visible result.

## 9. UX

- [UX mock](docs/standalone/allow-independent-turns-concurrent-vs-code-E20261108d8b2fe8e/S001/ux-mock.html)

## 10. References

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-queue-store.ts`
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-queue-worker.ts`
- **[[c3]]** `code` `vscode-plugin/src/chat/turn-lifecycle.ts`
- **[[c4]]** `code` `vscode-plugin/src/chat/chat-panel.ts`
- **[[c5]]** `code` `vscode-plugin/src/chat/session-store.ts`
- **[[c6]]** `code` `vscode-plugin/src/chat/chat-outbox.ts`
- **[[c7]]** `prior-artifact` `docs/standalone/allow-independent-turns-concurrent-vs-code-E20261108d8b2fe8e/ISSUE.md`
- **[[c8]]** `code` `vscode-plugin/src/chat/protocol.ts`
- **[[c9]]** `prior-artifact` `docs/epics/per-repo-chat-turn-queue-outbox-E20261014613abdb3/S001/LLD.md`
- **[[c10]]** `code` `vscode-plugin/src/chat/chat-queue-setup.ts`
- **[[c11]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1484`
- **[[c12]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1607`
- **[[c13]]** `code` `vscode-plugin/src/chat/turn-lifecycle.ts:614`

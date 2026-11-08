<!-- insrc:artifact PLAN-d8b2fe8e08f1d1be-s1 -->

# Plan: STORY-d8b2fe8e08f1d1be-s1

## Summary

**Epic:** `allow-independent-turns-concurrent-vs-code`
**LLD run:** `wf-1794119119166-t2qxd2`
**LLD effective hash:** `93b55be1c269...`

Build the session runtime and durable queue changes before enabling two simultaneous turns in the same repository. Restore each chat’s progress when it becomes visible and keep recovery, Stop and decisions tied to the originating turn. Run focused checks per task and the full VS Code extension sweep after all functional changes are in place.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Preserve unknown process identity through resume and Stop | M | — | — | integration: vscode-plugin/src/chat/__tests__/cli-adapter.test.ts: resume with unknown identity retains output observation and cannot verify Stop; integration: vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts: unverified resumed Stop preserves the saved cursor and reattaches; integration: vscode-plugin/src/chat/__tests__/chat-queue-setup.test.ts: process observation distinguishes absence, reuse and unknown identity | [[c1]] [[c5]] |
| 2 | **`t2`** Add session progress snapshots and targeted webview frames | M | — | `t1` | integration: vscode-plugin/src/chat/__tests__/session-file-store.test.ts: session progress persists and a stale checkpoint cannot overwrite a newer turn; integration: vscode-plugin/src/chat/__tests__/protocol.test.ts: restore and targeted action frames preserve session, turn and generation identity; integration: vscode-plugin/src/chat/__tests__/chat-shell.test.ts: session restore uses stored phase and elapsed time without another provider event | [[c2]] [[c5]] |
| 3 | **`t3`** Separate per-session execution and action ownership | L | — | `t1`, `t2` | integration: vscode-plugin/src/chat/__tests__/chat-panel.test.ts: A to B to A restores progress and rejects cross-session terminal and stale actions; integration: vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts: ended requests and duplicate IDs resolve only their originating continuation; integration: vscode-plugin/src/chat/__tests__/chat-panel.test.ts: concurrent edits invalidate unsafe rollback baselines | [[c2]] [[c3]] [[c5]] |
| 4 | **`t4`** Build fenced session leases and the SQLite upgrade | L | — | `t1` | integration: vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts: two connections enforce session FIFO, two slots and immutable lease fencing; integration: vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts: initial claim preserves attempts and all three retry delays; integration: vscode-plugin/src/chat/__tests__/chat-queue-fault-injection.test.ts: v2 migration preserves records, defers live owners and rolls back atomically | [[c1]] [[c4]] [[c5]] |
| 5 | **`t5`** Schedule independent session heads and recover each owner | L | — | `t3`, `t4` | integration: vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts: two window owners schedule eligible session heads and recover only the matching lease; integration: vscode-plugin/src/chat/__tests__/chat-queue-routing.test.ts: waiting approval or retry in A allows B and full capacity queues C | [[c1]] [[c3]] [[c4]] [[c5]] |
| 6 | **`t6`** Project queue waits and enable concurrent admission | M | — | `t5` | integration: vscode-plugin/src/chat/__tests__/chat-outbox.test.ts: wait reason uses shared eligibility for FIFO, retries, origin and capacity; integration: vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts: compatible v3 cutover and idle drafts with no unrelated blocker | [[c3]] [[c4]] [[c5]] |
| 7 | **`t7`** Verify the complete concurrent-chat flow | M | — | `t6` | integration: vscode-plugin/src/chat/__tests__/chat-panel.test.ts: two same-repo turns retain separate progress, decisions and verified Stop; integration: Complete VS Code extension test suite and TypeScript check after all functional tasks; smoke: Start A and B in the same repo, return to A while B progresses, and stop A without affecting B. | [[c5]] [[c6]] |

### 1.1 TASK-d8b2fe8e08f1d1be-s1-t1 — Preserve unknown process identity through resume and Stop

Extend the shared process observation used by queue setup, the resumed adapter, lifecycle and detached observer. Separate logical terminal output from positive process departure. Preserve live state and resume observation after unverified Stop.

**Acceptance checks:**
- Only definitive absence, confirmed replacement or trusted child exit certifies the recorded process departed.
- A live PID with unreadable identity retains cursor, pin, progress and pending decisions. Stop sends no signal and does not certify completion. Follower abort disposes polls without settling exit.

### 1.2 TASK-d8b2fe8e08f1d1be-s1-t2 — Add session progress snapshots and targeted webview frames

Add optional turn progress to stored session heads with ownership-aware merges. Define restore, update and action payloads carrying session, turn and view generation. Keep protocol and both ends compatible at each step.

**Acceptance checks:**
- Restore carries current progress with the transcript and uses the original start timestamp. A legacy live turn without a known start omits elapsed time.
- Old generation, session or turn updates cannot clear the selected view. Status changes do not become transcript rows.

### 1.3 TASK-d8b2fe8e08f1d1be-s1-t3 — Separate per-session execution and action ownership

Move queued run, follow state, pending decisions and diff ownership into session runtimes. Wire the targeted actions and progress snapshots to the current view without ending the previous runtime.

**Acceptance checks:**
- Switch A → B → A without a new provider event and restore A’s phase and time. Late A terminal or transcript output cannot affect B.
- Stop, approval, choice and edit decisions validate session, turn, view generation and relevant request/path. An ended turn’s pending continuation remains actionable only for its original request.
- Reject automated rollback when overlapping changes invalidate proof of exclusive ownership.
- Delayed Stop and decisions with repeated request IDs cannot act on another session. A valid pending continuation remains actionable after its originating provider turn ended.

### 1.4 TASK-d8b2fe8e08f1d1be-s1-t4 — Build fenced session leases and the SQLite upgrade

Add and test the v3 schema migration and transactional store operations for per-session claims, recovery and completion. Stage the new path behind internal construction until the worker, runtime and view are wired.

**Acceptance checks:**
- Two store connections enforce repository capacity two and one lease per session. Per-chat FIFO and the 10s, 60s, 300s retry schedule remain intact.
- Stale ownership tokens cannot mutate or release replacement leases. Finish transitions and releases atomically.
- Upgrade preserves messages, order, retries and recoverable CLI identity. Live or unknown legacy ownership defers the upgrade. A failed transaction leaves v2 intact.

### 1.5 TASK-d8b2fe8e08f1d1be-s1-t5 — Schedule independent session heads and recover each owner

Wire the new worker scheduling path to fenced leases and session runtimes. Exercise it with two SQLite connections and distinct window owners. Keep production admission on the existing path until the outbox and cutover task.

**Acceptance checks:**
- A waiting on approval or a future retry does not block eligible B when a slot is free. C waits when two slots are occupied.
- Window ownership, retry time, same-session FIFO and repository capacity are revalidated in the claim transaction.
- Reload, detached turns, missing CLI identity and stale callbacks preserve or release only the appropriate slot. Repeated recovery cannot duplicate the CLI.

### 1.6 TASK-d8b2fe8e08f1d1be-s1-t6 — Project queue waits and enable concurrent admission

Wire the admission-based outbox into the host and webview, then enable the v3 queue path with its compatible worker and runtime. Preserve existing queue recovery affordances and enforce the upgrade preflight.

**Acceptance checks:**
- Visible rows explain same-chat order, retry delay, unavailable origin and full capacity using the same eligibility snapshot as admission. Free capacity and idle drafts show no unrelated blocking message.
- No window can keep using the old singleton schema after cutover. Incompatible reopen and unsafe migration fail closed with a recoverable notice.

### 1.7 TASK-d8b2fe8e08f1d1be-s1-t7 — Verify the complete concurrent-chat flow

Run the full VS Code extension test sweep and typecheck once after every prior task passes its focused checks. Record manual VS Code validation as pending until performed, with an exact reproduction checklist and expected outcomes.

**Acceptance checks:**
- End-to-end tests show two same-repo turns, independent progress on switches, and Stop in one chat without affecting the other.
- The full plugin sweep and TypeScript check pass, with any existing failures identified separately. Record the real manual smoke outcome when run.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Queue admits A and B while preserving FIFO in each session and capacity two across windows. | `t4`, `t5` |
| A waiting on input or retry does not block B when a slot is available. | `t5` |
| Fenced finish, heartbeat, transfer and terminal handling cannot touch a newer lease. | `t4`, `t5` |
| Version 2 SQLite upgrade preserves pending messages and an orphaned live lease; concurrent old owner defers upgrade; interrupted transaction rolls back. | `t4`, `t6` |
| First claim preserves attempts and pre-action failures retry after 10s, 60s and 300s before exhausting the original budget. | `t4` |
| Confirmed absent or replaced PID permits fenced recovery, while a missing start time, permission error or unknown process observation retains the lease and defers migration. | `t1`, `t4`, `t5` |
| A → B → A shows the last progress and original elapsed time before the next event. | `t2`, `t3` |
| Late A events, Stop, approval and choice stay scoped to A when B is selected. | `t3`, `t7` |
| Reload during a detached turn restores progress and the original start time. | `t2`, `t3` |
| Parallel edit rollback refuses when the baseline is exposed to another turn. | `t3` |
| Delayed Stop and repeated request IDs are fenced by session, view generation and originating turn. An ended request remains actionable only while its own continuation is pending. | `t3` |
| Outbox reasons match admission for free capacity, full capacity, same-chat FIFO, future retry and unavailable owner. | `t6` |
| Reload a running session with a live PID, recorded start time, unreadable current identity and no terminal output. Restore active progress and controls, retain the lease and cursor, and reject Stop without signaling or certifying exit. Switching to B still uses the second slot. A later genuine terminal or verified departure releases only A’s lease. | `t1`, `t2`, `t3`, `t5`, `t7` |
| Start A and B in the same repo, return to A while B progresses, and stop A without affecting B. | `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/standalone/allow-independent-turns-concurrent-vs-code-E20261108d8b2fe8e/S001/LLD.md#2-contract-details`
- **[[c2]]** `prior-artifact` `docs/standalone/allow-independent-turns-concurrent-vs-code-E20261108d8b2fe8e/S001/LLD.md#3-data-model-changes`
- **[[c3]]** `prior-artifact` `docs/standalone/allow-independent-turns-concurrent-vs-code-E20261108d8b2fe8e/S001/LLD.md#5-error-paths`
- **[[c4]]** `prior-artifact` `docs/standalone/allow-independent-turns-concurrent-vs-code-E20261108d8b2fe8e/S001/LLD.md#7-migration`
- **[[c5]]** `prior-artifact` `docs/standalone/allow-independent-turns-concurrent-vs-code-E20261108d8b2fe8e/S001/LLD.md#6-test-strategy`
- **[[c6]]** `prior-artifact` `docs/standalone/allow-independent-turns-concurrent-vs-code-E20261108d8b2fe8e/S001/LLD.md#6-test-strategy`

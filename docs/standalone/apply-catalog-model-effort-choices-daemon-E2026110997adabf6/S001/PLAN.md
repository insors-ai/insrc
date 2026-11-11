<!-- insrc:artifact PLAN-97adabf6bd47b036-s1 -->

# Plan: STORY-97adabf6bd47b036-s1

## Summary

**Epic:** `apply-catalog-model-effort-choices-daemon`
**LLD run:** `wf-1794244063610-bypsg8`
**LLD effective hash:** `ea720fa2f14e...`

Share verified Vibe session selection between the daemon and the VS Code adapter. Guard retry boundaries against duplicate prompts and update the chat picker in place when catalog definitions recover. Validate each task with focused tests, then qualify the installed CLI and run the full sweep.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Verify Vibe session settings before dispatch | M | — | — | integration: Scripted Vibe handshake, new and resumed preflight, unsupported aliases and settings read-back | [[c1]] [[c2]] |
| 2 | **`t7`** Own Vibe turn dispatch, events and cleanup | M | — | `t1` | integration: Scripted Vibe turn acknowledgement loss, bounded events, cancellation and cleanup | [[c1]] [[c2]] |
| 3 | **`t2`** Apply verified selection in daemon execution | M | — | `t7` | integration: Daemon CliProvider Vibe completion, edit, review and structured retries never replay uncertain turns; integration: Vibe structured schema correction remains enabled for received invalid output | [[c1]] [[c2]] [[c3]] |
| 4 | **`t3`** Apply verified selection in VS Code Vibe turns | M | — | `t7` | integration: VS Code Vibe adapter preserves resume identity, attachments, permissions, streaming and cancellation | [[c1]] [[c4]] |
| 5 | **`t4`** Reconcile model and effort together | M | — | — | unit: Provider and model changes, history restore and turn dispatch reconcile effort | [[c1]] [[c5]] |
| 6 | **`t5`** Recover the chat catalog without reloading | M | — | `t4` | integration: Drive the actual webview picker intent and ready handshake through catalog failure and recovery; unit: Catalog cache, refresh coalescing, disposal and stale-generation handling | [[c1]] [[c5]] [[c6]] |
| 7 | **`t6`** Qualify installed Vibe and verify the integrated build | S | — | `t2`, `t3`, `t5` | smoke: Installed Vibe changes fixture alias and effort for one isolated session with config bytes unchanged; smoke: Daemon build and extension packaging include the shared Vibe execution path | [[c1]] [[c2]] [[c4]] [[c7]] |

### 1.1 TASK-97adabf6bd47b036-s1-t1 — Verify Vibe session settings before dispatch

Add the shared local app-server handshake and open or resume a session without a prompt. Resolve the catalog alias and effort, apply session-only settings and verify runtime read-back. Release a failed preflight process and preserve the headless default path.

**Acceptance checks:**
- Unsupported or mismatched selections stop before a prompt is sent
- New and resumed sessions confirm the effective model and effort
- Cancellation or error during setup releases the local child

### 1.2 TASK-97adabf6bd47b036-s1-t7 — Own Vibe turn dispatch, events and cleanup

Extend the verified session path with bounded turn dispatch and events. Track not-sent, possibly-sent and accepted states before writes and preserve them through loss, timeouts, cancellation and child cleanup. Preserve text, reasoning, tool events, native identity and terminal outcome for both adapters.

**Acceptance checks:**
- The verified session submits turn/start once
- Lost acknowledgement and accepted failures preserve dispatch certainty
- Cancellation closes the owned turn and child and keeps partial output and identity

### 1.3 TASK-97adabf6bd47b036-s1-t2 — Apply verified selection in daemon execution

Wire the existing daemon completion, structured completion, edit and review callers to shared explicit selection. Preserve prompt, policy, working directory, limits and output shape. Propagate possibly-sent and accepted failures through transient and structured retry paths. Keep schema correction for received invalid output.

**Acceptance checks:**
- Each daemon entry point dispatches at most once on lost acknowledgement or post-acceptance transport failure
- Structured completion still corrects invalid responses and honors cancellation and retry budgets
- Default runs and non-Vibe providers retain current behavior

### 1.4 TASK-97adabf6bd47b036-s1-t3 — Apply verified selection in VS Code Vibe turns

Wire the existing Vibe adapter to shared explicit selection. Preserve native resume identity, working directory, attachments, approvals, text and reasoning events, cancellation, terminal state and lease cleanup. Ensure the shared module is included in the extension bundle.

**Acceptance checks:**
- New and resumed turns confirm the requested selection and retain chat event behavior
- Unsupported selection or uncertain dispatch releases the lease without automatic replay
- The normal extension bundle includes the shared Vibe code

### 1.5 TASK-97adabf6bd47b036-s1-t4 — Reconcile model and effort together

Use the selected provider's catalog models and efforts for new chat, updates, restores and pre-turn validation. Persist one compatible selection. Preserve stored values while definitions are unavailable, and keep provider and model changes consistent with the existing session rules.

**Acceptance checks:**
- Switching to an incompatible model or provider resets effort to default
- An unavailable catalog preserves restored choices and prevents unsupported edits
- A validated run receives one coherent provider, model and effort selection

### 1.6 TASK-97adabf6bd47b036-s1-t5 — Recover the chat catalog without reloading

Add host-owned single-flight refresh, cache, generation, reachability recovery and picker-open intent. Publish the catalog snapshot after the ready handshake and update controls in place. Preserve the transcript, selection and active turn and stop recovery on success or disposal.

**Acceptance checks:**
- Initial failure and reconnect recover through actual host and webview messages
- Concurrent and stale responses cannot replace newer picker state
- The view and in-flight turn survive catalog updates without a reload

### 1.7 TASK-97adabf6bd47b036-s1-t6 — Qualify installed Vibe and verify the integrated build

Run the isolated no-prompt Vibe smoke probe and retain sanitized effective selection and unchanged-config evidence. After all tasks pass their focused tests, run the affected builds and full sweep. Record release instructions and manual VS Code checks, including native resume and catalog recovery. Use two local fixture aliases to verify a model change as well as an effort change.

**Acceptance checks:**
- The installed CLI confirms a different fixture alias and effort without a config rewrite or cloud prompt
- The daemon and VS Code artifacts build and the full sweep runs only after task validation
- Evidence distinguishes fixture verification from end-to-end manual checks

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Chat recovers from a failed catalog request without losing session state | `t5` |
| Chat validates effort on model switch and session restore | `t4` |
| Daemon and chat apply verified Vibe model and effort to new and resumed turns | `t1`, `t2`, `t3` |
| Vibe preflight failures never submit or replay the prompt | `t1`, `t7` |
| Vibe protocol path preserves caller permissions, attachments, and terminal output | `t7`, `t2`, `t3` |
| Lost turn/start acknowledgement and post-acknowledgement transport errors each dispatch once through daemon complete, structured completion, edit and review | `t2` |
| Real picker intent and ready handshake recover from initial catalog failure and reconnect without replacing the view or interrupting the turn | `t5` |
| Structured Vibe completion retains schema correction when a received response fails validation | `t2` |
| Installed Vibe confirms a session-only model and effort without changing saved configuration | `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/standalone/apply-catalog-model-effort-choices-daemon-E2026110997adabf6/S001/LLD.md#2-contract-details`
- **[[c2]]** `prior-artifact` `docs/standalone/apply-catalog-model-effort-choices-daemon-E2026110997adabf6/S001/LLD.md#5-error-paths`
- **[[c3]]** `prior-artifact` `docs/standalone/apply-catalog-model-effort-choices-daemon-E2026110997adabf6/S001/LLD.md#6-test-strategy`
- **[[c4]]** `prior-artifact` `docs/standalone/apply-catalog-model-effort-choices-daemon-E2026110997adabf6/S001/LLD.md#21-vibe-session-launch`
- **[[c5]]** `prior-artifact` `docs/standalone/apply-catalog-model-effort-choices-daemon-E2026110997adabf6/S001/LLD.md#22-chat-catalog-refresh-and-selection`
- **[[c6]]** `prior-artifact` `docs/standalone/apply-catalog-model-effort-choices-daemon-E2026110997adabf6/S001/LLD.md#32-vs-code-chat-run-configuration--invariant-change`
- **[[c7]]** `prior-artifact` `docs/standalone/apply-catalog-model-effort-choices-daemon-E2026110997adabf6/S001/LLD.md#7-migration`

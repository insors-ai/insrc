<!-- insrc:artifact EXT-206db3426ffd4428-s7 -->

# Extend: show-long-running-task-progress-chat — Launch a long-running command as a daemon-owned task that outlives the chat turn

> **Extends Epic `show-long-running-task-progress-chat`** — this builds on existing docs + code; no new Epic was created.

**Scope:** L   ·   **New Story:** `s7`

Extends Epic `show-long-running-task-progress-chat` (EPIC-206db3426ffd4428, #146), building on its DEF/HLD and the daemon task-progress layer src/daemon/task-progress (ProgressCoordinator, store, executor relay).

## Added Story

### s7: Launch a long-running command as a daemon-owned task that outlives the chat turn

**User value:** A user or agent in a chat can start a long-running command or test run as a daemon-owned task, end the turn, and still see its progress and final result in the originating chat, without the chat's session lock being held by a pending background process.

**Acceptance criteria:**
- **ac1:** Given A chat launches an authorized long-running command (for example a 40-minute live test run or a test sweep) through the daemon, when The launching turn ends and the chat process exits, then The command keeps running under the daemon, the chat's session lock is released at the turn end, and the next message in the chat is not delayed by the running command..
- **ac2:** Given A daemon-owned command task was launched from chat A, when The user starts another turn, switches chats or reconnects, then One existing message in chat A shows the task's latest measured state and its terminal result (exit status, a bounded output tail and the log location) without extra model calls, and no event reaches chat B..
- **ac3:** Given A command is launched as a daemon task, when It is registered, then It runs only inside the registered repository with the caller's authorization, is limited to commands the daemon accepts under its approval policy, and is not an attachment to an arbitrary pre-existing process..
- **ac4:** Given A daemon-owned command task is running, when The user cancels it or the daemon restarts, then Cancellation stays pending until the daemon verifies the process ended, and after a restart the task is reported as lost or finished rather than shown as still running..
- **ac5:** Given The epic's non-goals exclude general job scheduling and arbitrary process attachment, when This story is added, then The non-goal is narrowed in the Define to state exactly what stays excluded (scheduling, recurring jobs, attaching to existing processes, automatic restart) while launching an authorized one-shot command as a task is in scope..

## Building on

- `doc` docs/epics/show-long-running-task-progress-chat-E20261109206db342/DEF.md — General job scheduling, arbitrary process attachment or automatic task restart
- `code` src/daemon/task-progress/coordinator.ts
- `code` vscode-plugin/src/chat/session-lock.ts

## Next

Proposed HLD amendment `AMD-206db3426ffd4428-1` (pending approval — it adds the new Story's boundary).

Approve the HLD amendment (`AMD-206db3426ffd4428-1`) and the updated Epic, then run `design.story` for the new Story `s7` to produce its LLD.

```
insrc_workflow_step phase=start workflow=design.story params={"epicHash":"206db3426ffd4428","storyId":"s7"}
```

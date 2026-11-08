<!-- insrc:artifact ISSUE-d8b2fe8e08f1d1be -->

# Allow independent turns in concurrent VS Code chats

## Reproduction

In a VS Code workspace, submit a long-running prompt in chat A. While A is running, open a new chat B in the same repository and submit a prompt. B reports the active session and its turn waits behind A. Repeat with A awaiting a choice or approval. Expected: B can run independently while A keeps its own status and controls.

While A is still running, switch to B and then back to A using the active chats or history dropdown. A’s progress bar loses its previous progress and shows “Idle...” even though the turn is still running. Expected: returning to A immediately restores its current progress and continues displaying its updates.

## Root cause

The queue is keyed by repository (vscode-plugin/src/chat/chat-queue-setup.ts). Its store rejects acknowledgement when any repository lease exists (vscode-plugin/src/chat/chat-queue-store.ts:437), and the worker dispatches only the queue head (vscode-plugin/src/chat/chat-queue-worker.ts). The outbox projects the other chat's running or waiting state into the current view (vscode-plugin/src/chat/chat-outbox.ts). The prior concurrent-chat story added navigation, status and detachment, while the queue's original design explicitly serializes all turns in a repository.

The webview resets the progress indicator to idle when it receives session-restored. The open-chat handler restores the transcript and follows the live turn, but the restore message carries no session-specific progress snapshot. The exact event sequence that leaves the bar idle still needs runtime reproduction (vscode-plugin/src/chat/chat-panel.ts:2515, vscode-plugin/src/chat/chat-panel.ts:3100).

## Fix intent

Permit independent chat sessions in the same repository to make progress simultaneously, including while one awaits input. Preserve ordering within each chat, recovery across reloads, and session-specific Stop and decision routing. Define safe concurrency, admission, lease recovery and outbox semantics in the design and verify them across sessions and windows. Keep progress scoped to its session. On reselecting a running or waiting chat, restore its current progress and elapsed time, continue receiving updates for that turn, and show idle when the session has no active turn. Cover the A → B → A switch while A keeps running.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-queue-setup.ts`
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-queue-store.ts:437`
- **[[c3]]** `code` `vscode-plugin/src/chat/chat-queue-worker.ts`
- **[[c4]]** `code` `vscode-plugin/src/chat/chat-outbox.ts`
- **[[c5]]** `prior-artifact` `docs/standalone/multiple-concurrent-chats-chat-panel-active-E202611031bd72813/S001/LLD.md`
- **[[c6]]** `prior-artifact` `docs/epics/per-repo-chat-turn-queue-outbox-E20261014613abdb3/S001/LLD.md:328`
- **[[c7]]** `stakeholder` `User report: new chat blocked while an existing chat is running.`
- **[[c8]]** `code` `vscode-plugin/src/chat/chat-panel.ts:2515`
- **[[c9]]** `code` `vscode-plugin/src/chat/chat-panel.ts:3100`
- **[[c10]]** `stakeholder` `User report: switching back to a running session loses progress and shows “Idle...” in the progress bar.`

<!-- insrc:artifact TESTS-d6a4bc79bece9d1f-s1 -->

# Tests: d6a4bc79bece9d1f s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 21 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-10T15:41:15.706Z on commit `d6c67ff8`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: session-lock.test.ts: one lease per session; a second acquire waits until the holder's process exits, then is granted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | one lease per session; a second acquire waits until the holder's process exits, then is granted | `vscode-plugin/src/chat/__tests__/session-lock.test.ts` |
| pass | a lease released without a process grants the waiter; release is idempotent | `vscode-plugin/src/chat/__tests__/session-lock.test.ts` |

**unit: session-lock.test.ts: past the timeout the holder is stopped (SIGTERM, then SIGKILL after the grace period), its exit is awaited, then the lease is granted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | past the timeout the holder is stopped (SIGTERM, then SIGKILL after the grace period), its exit is awaited, then the lease is granted | `vscode-plugin/src/chat/__tests__/session-lock.test.ts` |
| pass | stopProcess reports whether the exit was confirmed | `vscode-plugin/src/chat/__tests__/session-lock.test.ts` |

**unit: session-lock.test.ts: an aborted wait is cancelled without stopping anything, and a newer waiter replaces an older one**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an aborted wait is cancelled without stopping anything, and a newer waiter replaces an older one | `vscode-plugin/src/chat/__tests__/session-lock.test.ts` |
| pass | a process that exits by itself grants the waiter at once, without any stop | `vscode-plugin/src/chat/__tests__/session-lock.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/session-lock.test.ts` | 0 | 6 | 0.7 s |  |

## t2

Run at 2026-10-10T15:44:20.037Z on commit `64b9bab6`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: session-lock.test.ts: a lock file from another window is honoured while its pid is alive, and a stale file (dead pid or mismatched start time) is replaced**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a lock file from another window is honoured while its pid is alive, and a stale file (dead pid or mismatched start time) is replaced | `vscode-plugin/src/chat/__tests__/session-lock.test.ts` |

**unit: session-lock.test.ts: on timeout a cross-window holder's group is stopped only when its start time matches**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | on timeout a cross-window holder's group is stopped only when its start time matches | `vscode-plugin/src/chat/__tests__/session-lock.test.ts` |

**unit: session-lock.test.ts: an unwritable lock directory falls back to memory**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an unwritable lock directory falls back to memory | `vscode-plugin/src/chat/__tests__/session-lock.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/session-lock.test.ts` | 0 | 9 | 0.9 s |  |

## t3

Run at 2026-10-10T15:48:24.151Z on commit `dae3426f`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: cli-adapter.test.ts: run() ends at the first done event without killing the process, and onSpawn hands over pid, exit and stop**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | run() ends at the first done event without killing the process, and onSpawn hands over pid, exit and stop | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | abandoning the stream early kills the subprocess (no orphan) | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**unit: cli-adapter.test.ts: cancel() stops the process group and resolves only after the exit; the real spawner starts the CLI detached in its own group**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cancel() stops the process group and resolves only after the exit; the real spawner starts the CLI detached in its own group | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | cancel(): kills the in-flight subprocess and yields a terminal done(ok:false) | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**unit: cli-adapter.test.ts: after run() returns at done, decide() still reaches the live process, and the live entry is dropped only when the exit settles**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | after run() returns at done, decide() still reaches the live process, and the live entry is dropped only when the exit settles | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 68 | 0.4 s |  |

## t4

Run at 2026-10-10T15:50:07.879Z on commit `69f3dab9`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: markers.test.ts: phase 'waiting' maps to 'Waiting for the previous turn to finish' in both markerFor and the webview mirror**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | phase 'waiting' maps to 'Waiting for the previous turn to finish' in both markerFor and the webview mirror | `vscode-plugin/src/chat/__tests__/markers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/markers.test.ts` | 0 | 12 | 0.3 s |  |

## t5

Run at 2026-10-10T15:59:36.021Z on commit `702eaa71`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: chat-panel.test.ts: a message sent while the previous CLI process is still alive after its answer waits, shows 'Waiting for the previous turn to finish', and starts only after that process exits**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a message sent while the previous CLI process is still alive after its answer waits, shows 'Waiting for the previous turn to finish', and starts only after that process exits | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | single-in-flight: a second submit supersedes the first — no interleave; it waits for the first instead of killing it (H1/M2) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: chat-panel.test.ts: with a short timeout, the still-running holder is stopped and the new turn starts after its exit is confirmed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with a short timeout, the still-running holder is stopped and the new turn starts after its exit is confirmed | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: chat-panel.test.ts: Stop ends the running process at once and cancels a waiting message; the generation guard still keeps superseded events out of the transcript**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Stop ends the running process at once and cancels a waiting message; the generation guard still keeps superseded events out of the transcript | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 94 | 1.2 s |  |

## t6

Run at 2026-10-10T16:03:41.079Z on commit `f6728b04`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: extension-chat-wiring.test.ts: the extension passes a file-backed lock registry and the turnLockTimeoutMs setting**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the extension passes a file-backed lock registry and the turnLockTimeoutMs setting | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |

**integration: extension-chat-wiring.test.ts: package.json contributes insrc.chat.turnLockTimeoutMs (number, default 600000, minimum 1000)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | package.json contributes insrc.chat.turnLockTimeoutMs (number, default 600000, minimum 1000) | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` | 0 | 18 | 0.3 s |  |

<!-- insrc:artifact TESTS-613abdb351c2c738-s3 -->

# Tests: 613abdb351c2c738 s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 25 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-14T15:08:25.833Z on commit `cf1e8215`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: chat-queue-store.test.ts: presenceOf returns the row, and undefined when there is none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | presenceOf returns the row, and undefined when there is none | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**integration: chat-queue-store.test.ts: markNotDeliveredIfHead marks the head, the next row becomes the head, and a row acknowledged first by another connection is not marked**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | markNotDeliveredIfHead marks the head, the next row becomes the head, and a row acknowledged first by another connection is not marked | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**integration: chat-queue-store.test.ts: markNotDeliveredIfHead marks a retrying head whose window closed and the next row becomes the head**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | markNotDeliveredIfHead marks a retrying head whose window closed and the next row becomes the head | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` | 0 | 9 | 0.9 s |  |

## t2

Run at 2026-10-14T15:09:54.074Z on commit `5defc475`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: chat-queue-store.test.ts: takeOver takes a stale lease of another windowKey only after LEASE_TAKEOVER_MS and fails its message, and refuses when holderGone is false, absent or the heartbeat is fresh**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | takeOver takes a stale lease of another windowKey only after LEASE_TAKEOVER_MS and fails its message, and refuses when holderGone is false, absent or the heartbeat is fresh | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**integration: chat-queue-store.test.ts: takeOver takes a lease of the claim's own windowKey at once when holderGone is true**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | takeOver takes a lease of the claim's own windowKey at once when holderGone is true | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**integration: chat-queue-store.test.ts: two connections racing takeOver on one stale lease, exactly one returns true**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two connections racing takeOver on one stale lease, exactly one returns true | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**integration: chat-queue-store.test.ts: reclaim rewrites pid and keeps seq and cliPid for the same windowKey, and refuses another windowKey**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reclaim rewrites pid and keeps seq and cliPid for the same windowKey, and refuses another windowKey | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` | 0 | 13 | 1 s |  |

## t3

Run at 2026-10-14T15:11:10.692Z on commit `55f62a81`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chat-queue-worker.test.ts: dispose leaves the presence row in place and windowAlive stays true until PRESENCE_GRACE_MS passes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dispose leaves the presence row in place and windowAlive stays true until PRESENCE_GRACE_MS passes | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**unit: chat-queue-worker.test.ts: the worker (the existing S001 test, its presence assertion inverted to presence kept)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat queue worker: the window whose message is at the front takes the lease, runs it through the runner with onSpawn recording the CLI, heartbeats the lease while it runs, finishes it and releases the lease; another window's message at the front is left alone; a submit in one window is seen by another within one poll; a finish that fails is retried on the next poll before any new message is taken; dispose releases the lease when the turn's CLI has exited and leaves it when it still runs; onChange fires after this window's own submit and after another window's commit | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` | 0 | 5 | 0.5 s |  |

## t4

Run at 2026-10-14T15:13:20.080Z on commit `01bd6767`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chat-queue-worker.test.ts: worker recovery: a reloaded window reclaims a lease whose CLI lives and does not fail the message**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | worker recovery: a reloaded window reclaims a lease whose CLI lives and does not fail the message | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**unit: chat-queue-worker.test.ts: worker recovery: a dead holder and dead CLI of another window is freed only after LEASE_TAKEOVER_MS and the next message runs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | worker recovery: a dead holder and dead CLI of another window is freed only after LEASE_TAKEOVER_MS and the next message runs | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**unit: chat-queue-worker.test.ts: worker recovery: a holder that keeps heartbeating past LEASE_TAKEOVER_MS is never taken over**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | worker recovery: a holder that keeps heartbeating past LEASE_TAKEOVER_MS is never taken over | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` | 0 | 10 | 0.7 s |  |

## t5

Run at 2026-10-14T15:14:02.564Z on commit `01bd6767`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chat-queue-worker.test.ts: a reclaimed lease is heartbeated while the CLI lives, then finished as detached-ended and released when the CLI exits, and the next message runs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a reclaimed lease is heartbeated while the CLI lives, then finished as detached-ended and released when the CLI exits, and the next message runs | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**unit: chat-queue-worker.test.ts: a reclaimed lease lost to another window clears the marker and stops heartbeating**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a reclaimed lease lost to another window clears the marker and stops heartbeating | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` | 0 | 10 | 0.7 s |  |

## t6

Run at 2026-10-14T15:15:55.601Z on commit `4a477cb3`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chat-queue-worker.test.ts: a head whose window stopped refreshing presence and whose pid is dead is marked not-delivered after PRESENCE_GRACE_MS and the next message runs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a head whose window stopped refreshing presence and whose pid is dead is marked not-delivered after PRESENCE_GRACE_MS and the next message runs | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**unit: chat-queue-worker.test.ts: a head whose window has a fresh presence row or a live pid is never marked; no presence row and a message younger than PRESENCE_GRACE_MS is not marked**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a head whose window has a fresh presence row or a live pid is never marked; no presence row and a message younger than PRESENCE_GRACE_MS is not marked | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**unit: chat-queue-worker.test.ts: dispose-and-recreate a worker with the same windowKey while a second window ticks, the head is not marked not-delivered**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dispose-and-recreate a worker with the same windowKey while a second window ticks, the head is not marked not-delivered | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**unit: chat-queue-worker.test.ts: a reload slower than PRESENCE_GRACE_MS ends as not-delivered with a resend and no row is lost**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a reload slower than PRESENCE_GRACE_MS ends as not-delivered with a resend and no row is lost | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**unit: chat-queue-worker.test.ts: a previous-plugin window's dispose deleting its presence row: a head younger than PRESENCE_GRACE_MS is not marked, an older one is marked once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a previous-plugin window's dispose deleting its presence row: a head younger than PRESENCE_GRACE_MS is not marked, an older one is marked once | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` | 0 | 15 | 0.8 s |  |

## t7

Run at 2026-10-14T16:13:06.155Z on commit `8bf26ad9`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: chat-queue-store.test.ts: enqueue and resendFrom at QUEUE_RECORD_BOUND are refused with FULL_NOTE and leave every row**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | enqueue and resendFrom at QUEUE_RECORD_BOUND are refused with FULL_NOTE and leave every row | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**unit: chat-queue-worker.test.ts: submit at the bound returns ok:false reason full**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | submit at the bound returns ok:false reason full | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**live: hand check in two windows: reload mid-turn with the CLI alive, reload with queued messages while a second window ticks, and close a window with queued messages**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | follow takes ownership from a dead host, reports every event, clears the cursor and calls onEnd | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |
| pass | a detached session-file turn is resumed by follow | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |
| pass | after a reload (a new host over the same store) a session with a live cursor is followed from the saved offset, only new events are posted and appended, and the cursor is cleared at the end | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | a second live window that is not the cursor's owner does not follow it; once the owner host is gone it takes over | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

Reported by the builder, not run by the gate: **pass**. Evidence: PARTIAL, not the full three-leg check. Observed by the builder on 2026-10-14 in one window: after a reload with a message queued behind a running turn, the queue file (~/.insrc/chat-queue/e49cade17d555e50.sqlite) showed the new extension host pid holding the lease with a fresh heartbeat, the earlier queued message finished, and no failed or not-delivered row from the reload. Not run, deferred by the owner until the repo path bug that blocks multi-window use is fixed: (1) reload mid-turn with the CLI alive across two windows, (2) reload with a message waiting while a second window ticks, (3) close a window with queued messages. The S001 follow tests mapped here are run by the gate and carry the display half of ac3.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 165 | 5 s |  |
| `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` | 0 | 14 | 1.1 s |  |
| `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` | 0 | 16 | 1.1 s |  |
| `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` | 0 | 32 | 1.8 s |  |

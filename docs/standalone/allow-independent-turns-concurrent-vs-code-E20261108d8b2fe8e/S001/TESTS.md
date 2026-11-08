<!-- insrc:artifact TESTS-d8b2fe8e08f1d1be-s1 -->

# Tests: d8b2fe8e08f1d1be s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 17 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-08T07:09:54.039Z on commit `75c38b70d`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: vscode-plugin/src/chat/__tests__/cli-adapter.test.ts: resume with unknown identity retains output observation and cannot verify Stop**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resume with unknown identity retains output observation and cannot verify Stop | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**integration: vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts: unverified resumed Stop preserves the saved cursor and reattaches**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | unverified resumed Stop preserves the saved cursor and reattaches | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**integration: vscode-plugin/src/chat/__tests__/chat-queue-setup.test.ts: process observation distinguishes absence, reuse and unknown identity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | process observation distinguishes absence, reuse and unknown identity | `vscode-plugin/src/chat/__tests__/chat-queue-setup.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-setup.test.ts` | 0 | 3 | 0.5 s |  |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 100 | 1.8 s |  |
| `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` | 0 | 37 | 2 s |  |

## t2

Run at 2026-11-08T07:17:20.378Z on commit `2e063e224`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: vscode-plugin/src/chat/__tests__/session-file-store.test.ts: session progress persists and a stale checkpoint cannot overwrite a newer turn**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | session progress persists and a stale checkpoint cannot overwrite a newer turn | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**integration: vscode-plugin/src/chat/__tests__/protocol.test.ts: restore and targeted action frames preserve session, turn and generation identity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | restore and targeted action frames preserve session, turn and generation identity | `vscode-plugin/src/chat/__tests__/protocol.test.ts` |

**integration: vscode-plugin/src/chat/__tests__/chat-shell.test.ts: session restore uses stored phase and elapsed time without another provider event**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | session restore uses stored phase and elapsed time without another provider event | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` | 0 | 29 | 0.8 s |  |
| `vscode-plugin/src/chat/__tests__/protocol.test.ts` | 0 | 15 | 0.5 s |  |
| `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` | 0 | 25 | 0.5 s |  |

## t3

Run at 2026-11-08T07:41:41.050Z on commit `b5c077ccd`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: vscode-plugin/src/chat/__tests__/chat-panel.test.ts: A to B to A restores progress and rejects cross-session terminal and stale actions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | A to B to A restores progress and rejects cross-session terminal and stale actions | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts: ended requests and duplicate IDs resolve only their originating continuation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ended requests and duplicate IDs resolve only their originating continuation | `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` |

**integration: vscode-plugin/src/chat/__tests__/chat-panel.test.ts: concurrent edits invalidate unsafe rollback baselines**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | concurrent edits invalidate unsafe rollback baselines | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 226 | 10.6 s |  |
| `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` | 0 | 13 | 1.4 s |  |

## t4

Run at 2026-11-08T07:46:48.077Z on commit `f9614591d`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts: two connections enforce session FIFO, two slots and immutable lease fencing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two connections enforce session FIFO, two slots and immutable lease fencing | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**integration: vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts: initial claim preserves attempts and all three retry delays**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | initial claim preserves attempts and all three retry delays | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**integration: vscode-plugin/src/chat/__tests__/chat-queue-fault-injection.test.ts: v2 migration preserves records, defers live owners and rolls back atomically**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | v2 migration preserves records, defers live owners and rolls back atomically | `vscode-plugin/src/chat/__tests__/chat-queue-fault-injection.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-fault-injection.test.ts` | 0 | 2 | 2.7 s |  |
| `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` | 0 | 20 | 2.2 s |  |

## t5

Run at 2026-11-08T07:54:11.721Z on commit `25210847d`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts: two window owners schedule eligible session heads and recover only the matching lease**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two window owners schedule eligible session heads and recover only the matching lease | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**integration: vscode-plugin/src/chat/__tests__/chat-queue-routing.test.ts: waiting approval or retry in A allows B and full capacity queues C**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | waiting approval or retry in A allows B and full capacity queues C | `vscode-plugin/src/chat/__tests__/chat-queue-routing.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-routing.test.ts` | 0 | 3 | 1.5 s |  |
| `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` | 0 | 21 | 1.5 s |  |

## t6

Run at 2026-11-08T08:00:54.572Z on commit `49cdb870e`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: vscode-plugin/src/chat/__tests__/chat-outbox.test.ts: wait reason uses shared eligibility for FIFO, retries, origin and capacity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | wait reason uses shared eligibility for FIFO, retries, origin and capacity | `vscode-plugin/src/chat/__tests__/chat-outbox.test.ts` |

**integration: vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts: compatible v3 cutover and idle drafts with no unrelated blocker**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | compatible v3 cutover and idle drafts with no unrelated blocker | `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-outbox.test.ts` | 0 | 4 | 0.6 s |  |
| `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` | 0 | 12 | 4.2 s |  |

## t7

Run at 2026-11-08T08:08:26.928Z on commit `bd2d8319a`. Tests check: **failed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

named tests matched no test file: Complete VS Code extension test suite and TypeScript check after all functional tasks; Start A and B in the same repo, return to A while B progresses, and stop A without affecting B. (pass a `tests` mapping at the validate turn: for each named test, the file and title of the test cases that carry it)

**integration: vscode-plugin/src/chat/__tests__/chat-panel.test.ts: two same-repo turns retain separate progress, decisions and verified Stop**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two same-repo turns retain separate progress, decisions and verified Stop | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: Complete VS Code extension test suite and TypeScript check after all functional tasks**

Not mapped: no test case was named for this test, and nothing was run for it.

**smoke: Start A and B in the same repo, return to A while B progresses, and stop A without affecting B.**

Not mapped: no test case was named for this test, and nothing was run for it.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 227 | 10.7 s |  |

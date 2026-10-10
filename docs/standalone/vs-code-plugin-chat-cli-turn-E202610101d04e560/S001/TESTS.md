<!-- insrc:artifact TESTS-1d04e56057b3daba-s1 -->

# Tests: 1d04e56057b3daba s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 23 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-10T17:37:33.094Z on commit `c0fb58e4`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: session-output.test.ts: a turn's segment is the lines between its turn-start and turn-end markers; tail yields only complete CLI lines with the cursor after each, skips marker lines, holds back a half-written line until its newline, and follows growth until the writer finishes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a turn's segment is the lines between its turn-start and turn-end markers; tail yields only complete CLI lines with the cursor after each, skips marker lines, holds back a half-written line until its newline, and follows growth until the writer finishes | `vscode-plugin/src/chat/__tests__/session-output.test.ts` |
| pass | the err log keeps only the current turn, and errTail returns its end | `vscode-plugin/src/chat/__tests__/session-output.test.ts` |

**unit: session-output.test.ts: tailing again from a yielded cursor resumes exactly after that line; a segment without a turn-end marker ends at the next turn-start or once the writer is finished**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tailing again from a yielded cursor resumes exactly after that line; a segment without a turn-end marker ends at the next turn-start or once the writer is finished | `vscode-plugin/src/chat/__tests__/session-output.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/session-output.test.ts` | 0 | 3 | 0.4 s |  |

## t2

Run at 2026-10-10T17:39:15.016Z on commit `4b59ede6`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: session-output.test.ts: the file rolls over at a turn start once past maxBytes, keeping one previous generation, and a cursor in the previous generation is still read from <sessionId>.1.ndjson**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the file rolls over at a turn start once past maxBytes, keeping one previous generation, and a cursor in the previous generation is still read from <sessionId>.1.ndjson | `vscode-plugin/src/chat/__tests__/session-output.test.ts` |

**unit: session-output.test.ts: remove deletes a session's files; sweep removes old files of sessions not in keep and leaves the rest; one session uses one file pair however many turns it runs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | remove deletes a session's files; sweep removes old files of sessions not in keep and leaves the rest; one session uses one file pair however many turns it runs | `vscode-plugin/src/chat/__tests__/session-output.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/session-output.test.ts` | 0 | 5 | 0.4 s |  |

## t3

Run at 2026-10-10T17:41:21.422Z on commit `501e78ee`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: cli-adapter.test.ts: the real spawner appends the CLI's stdout to the session file inside its turn segment and stderr to the err log, and lines() yields every line including those written after the result line**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the real spawner appends the CLI's stdout to the session file inside its turn segment and stderr to the err log, and lines() yields every line including those written after the result line | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**unit: cli-adapter.test.ts: marker lines reaching a mapper produce no events**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | marker lines reaching a mapper produce no events | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 70 | 0.7 s |  |

## t4

Run at 2026-10-10T17:43:49.679Z on commit `940a9dcb`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: cli-adapter.test.ts: run() yields the same events from the output file as from a pipe, reports progress offsets, and writes the turn-end marker after the process exits**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | run() yields the same events from the output file as from a pipe, reports progress offsets, and writes the turn-end marker after the process exits | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**integration: cli-adapter.test.ts: a beginTurn failure falls back to the pipe with one logged error**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a beginTurn failure falls back to the pipe with one logged error | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 72 | 1 s |  |

## t5

Run at 2026-10-10T17:46:14.647Z on commit `fa6039a7`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: cli-adapter.test.ts: resume() from a saved offset yields only the later events, ends at the terminal event, and ends with an error when the process is gone without one**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resume() from a saved offset yields only the later events, ends at the terminal event, and ends with an error when the process is gone without one | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**integration: cli-adapter.test.ts: resume()'s handed-over process stops the recorded pid's group only while its start time matches**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resume()'s handed-over process stops the recorded pid's group only while its start time matches | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 74 | 1 s |  |

## t6

Run at 2026-10-10T17:48:11.793Z on commit `aa9cef44`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: session-lock.test.ts: the lock record carries the holder's session file and turn after attach**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the lock record carries the holder's session file and turn after attach | `vscode-plugin/src/chat/__tests__/session-lock.test.ts` |

**unit: session-store.test.ts: liveTurn round-trips through the store, a session without it loads unchanged, and eviction calls onEvict with the evicted id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | liveTurn round-trips through the store, a session without it loads unchanged, and eviction calls onEvict with the evicted id | `vscode-plugin/src/chat/__tests__/session-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/session-lock.test.ts` | 0 | 16 | 1.1 s |  |
| `vscode-plugin/src/chat/__tests__/session-store.test.ts` | 0 | 25 | 0.3 s |  |

## t7

Run at 2026-10-10T17:50:25.154Z on commit `bde7033f`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: chat-panel.test.ts: a turn records its cursor on the session as lines are handled and clears it at the terminal event**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a turn records its cursor on the session as lines are handled and clears it at the terminal event | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 97 | 1.3 s |  |

## t8

Run at 2026-10-10T17:52:42.587Z on commit `acd8b332`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: chat-panel.test.ts: after a reload (a new host over the same store) a session with a live cursor is followed from the saved offset, only new events are posted and appended, and the cursor is cleared at the end**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | after a reload (a new host over the same store) a session with a live cursor is followed from the saved offset, only new events are posted and appended, and the cursor is cleared at the end | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: chat-panel.test.ts: a cursor whose generation is gone (rolled over twice) is cleared without resuming**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a cursor whose generation is gone (rolled over twice) is cleared without resuming | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | resume() from a saved offset yields only the later events, ends at the terminal event, and ends with an error when the process is gone without one | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**integration: chat-panel.test.ts: a second live window that is not the cursor's owner does not follow it; once the owner host is gone it takes over**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a second live window that is not the cursor's owner does not follow it; once the owner host is gone it takes over | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 100 | 1.3 s |  |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 74 | 1 s |  |

## t9

Run at 2026-10-10T17:55:36.531Z on commit `ab64a21c`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: chat-panel.test.ts: switching chat or closing the panel stops following a turn writing to the session file without stopping its process, and showing the session again resumes it; a turn without one is still stopped**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | switching chat or closing the panel stops following a turn writing to the session file without stopping its process, and showing the session again resumes it; a turn without one is still stopped | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S005 switching chat mid-stream cancels the in-flight turn (single-in-flight preserved) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | onDidDispose cancels the active turn and stops posting further | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: chat-panel.test.ts: Stop ends a resumed turn's process through the handle resume() hands over**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Stop ends a resumed turn's process through the handle resume() hands over | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 102 | 1.4 s |  |

## t10

Run at 2026-10-10T17:57:34.617Z on commit `c196a0ab`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: extension-chat-wiring.test.ts: the extension builds a session output on ~/.insrc/chat-output, passes it to the provider registry, and wires onEvict and the start-up sweep**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the extension builds a session output on ~/.insrc/chat-output, passes it to the provider registry, and wires onEvict and the start-up sweep | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` | 0 | 19 | 0.3 s |  |

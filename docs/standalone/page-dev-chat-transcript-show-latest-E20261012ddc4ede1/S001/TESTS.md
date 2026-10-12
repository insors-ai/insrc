<!-- insrc:artifact TESTS-ddc4ede1dbf84626-S001 -->

# Tests: ddc4ede1dbf84626 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 15 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-12T07:35:29.855Z on commit `f14226ea`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: latestWindow: a transcript no longer than one page is returned whole with firstIndex 0**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | latestWindow: a transcript no longer than one page is returned whole with firstIndex 0 | `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` |

**unit: latestWindow: a long transcript returns its last page, moved back to the start of the turn when a user row is within one more page, and never more than two pages of rows**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | latestWindow: a long transcript returns its last page, moved back to the start of the turn when a user row is within one more page, and never more than two pages of rows | `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` |

**unit: latestWindow and pageBefore: with no user row within reach the cut is the plain page; consecutive pages cover every row exactly once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | latestWindow and pageBefore: with no user row within reach the cut is the plain page; consecutive pages cover every row exactly once | `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` |

**unit: pageBefore: before is clamped to 0..length; at 0 it returns no rows and firstIndex 0**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | pageBefore: before is clamped to 0..length; at 0 it returns no rows and firstIndex 0 | `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` |

**unit: walking pageBefore from the latest window down to 0 reproduces the whole transcript in order with no row skipped or repeated**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | walking pageBefore from the latest window down to 0 reproduces the whole transcript in order with no row skipped or repeated | `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` | 0 | 5 | 0.3 s |  |

## t2

Run at 2026-10-12T07:36:33.075Z on commit `c995dd34`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: WEBVIEW_TO_HOST_TYPES includes 'load-older' and HOST_TO_WEBVIEW_TYPES includes 'transcript-page', alongside every prior kind**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | WEBVIEW_TO_HOST_TYPES includes 'load-older' and HOST_TO_WEBVIEW_TYPES includes 'transcript-page', alongside every prior kind | `vscode-plugin/src/chat/__tests__/protocol.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/protocol.test.ts` | 0 | 8 | 0.3 s |  |

## t3

Run at 2026-10-12T07:55:35.663Z on commit `72fc12d2`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: live rows carry rowIndex from all five writers: assistant, marker and tool-result events, the user-row, a permission outcome and a selection outcome are each posted with the absolute index of the row already written; status and approval-request carry none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | live rows carry rowIndex from all five writers: assistant, marker and tool-result events, the user-row, a permission outcome and a selection outcome are each posted with the absolute index of the row already written; status and approval-request carry none | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: write-then-post order: when each live row is posted, the transcript already holds it at that index**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | write-then-post order: when each live row is posted, the transcript already holds it at that index | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: a followed turn writes each row before posting it; after a chat switch the follow stops, posting and writing nothing more; the write is outside the shown-session guard**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a followed turn writes each row before posting it; after a chat switch the follow stops, posting and writing nothing more; the write is outside the shown-session guard | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: load-older for the active session answers one transcript-page whose rows end just before `before`; repeated requests walk back to index 0**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | load-older for the active session answers one transcript-page whose rows end just before `before`; repeated requests walk back to index 0 | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: load-older for another session id, or with a malformed before or sessionId, posts nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | load-older for another session id, or with a malformed before or sessionId, posts nothing | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: session-restored carries firstIndex 0 and total while the whole transcript is still sent**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | session-restored carries firstIndex 0 and total while the whole transcript is still sent | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 128 | 1.9 s |  |

## t4

Run at 2026-10-12T07:57:44.563Z on commit `2884a6f5`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: registry forgetKeysBefore drops only the r<n> keys below the index; withIsolatedPending runs a render with an empty pending-tool list and restores the live list afterwards**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | registry forgetKeysBefore drops only the r<n> keys below the index; withIsolatedPending runs a render with an empty pending-tool list and restores the live list afterwards | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |

**unit: registry forgetPendingIn drops the pending tool entries whose node is given, and a later result for one renders as its own row**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | registry forgetPendingIn drops the pending tool entries whose node is given, and a later result for one renders as its own row | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |

**unit: fake-dom nodes carry scrollTop, scrollHeight and clientHeight**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | fake-dom nodes carry scrollTop, scrollHeight and clientHeight | `vscode-plugin/src/chat/__tests__/fake-dom.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/fake-dom.test.ts` | 0 | 3 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/render-registry.test.ts` | 0 | 70 | 0.3 s |  |

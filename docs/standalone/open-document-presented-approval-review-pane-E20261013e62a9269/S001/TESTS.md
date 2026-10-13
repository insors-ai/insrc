<!-- insrc:artifact TESTS-e62a9269a7cb9550-S001 -->

# Tests: e62a9269a7cb9550 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 10 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## S001

Run at 2026-10-13T19:24:37.284Z on commit `bd3a9e47`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

**unit: review presenter: a tool result that carries a pendingApproval path opens the pending document with that absolute path once; the same path again in the turn does not; a path that is not pending, a result with no such block and one that is not JSON open nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review presenter: a tool result that carries a pendingApproval path opens the pending document with that absolute path once; the same path again in the turn does not; a path that is not pending, a result with no such block and one that is not JSON open nothing | `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` |

**unit: review presenter: at the end of a turn each document that became pending during the turn and was not opened yet is opened; a document pending before the turn is not; a failed pending read opens nothing and is logged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review presenter: at the end of a turn each document that became pending during the turn and was not opened yet is opened; a document pending before the turn is not; a failed pending read opens nothing and is logged | `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` |

**unit: review presenter: a later turn opens a document again when it is presented again; several documents in one turn are opened in order, so the last presented is the one on show**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review presenter: a later turn opens a document again when it is presented again; several documents in one turn are opened in order, so the last presented is the one on show | `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` |

**unit: review presenter: a turn begun while the one before it has not ended takes over that turn's start list and what it opened; the earlier turn's end then opens nothing and the later turn's end opens what became pending since the earlier one began**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review presenter: a turn begun while the one before it has not ended takes over that turn's start list and what it opened; the earlier turn's end then opens nothing and the later turn's end opens what became pending since the earlier one began | `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` |

**unit: docs review client: pendingDocuments returns each pending document's id and path and skips one with no path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review client: pendingDocuments returns each pending document's id and path and skips one with no path | `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` |

**integration: chat host: a run turn begins a presenter turn just before it starts, passes each tool result that is not an error, and ends it once when the run is over, also for a turn that failed, was stopped or was superseded; a message refused before any run begins none; a presenter that throws does not disturb the turn**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host: a run turn begins a presenter turn just before it starts, passes each tool result that is not an error, and ends it once when the run is over, also for a turn that failed, was stopped or was superseded; a message refused before any run begins none; a presenter that throws does not disturb the turn | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: chat host: a followed turn begins a presenter turn on its first event, not when the follow is asked for, passes its tool results and ends it when the follow ended; a ready message during a run turn begins nothing, and the run turn's end still opens a newly pending document**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host: a followed turn begins a presenter turn on its first event, not when the follow is asked for, passes its tool results and ends it when the follow ended; a ready message during a run turn begins nothing, and the run turn's end still opens a newly pending document | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: extension wiring: the chat host's presenter opens a document through the review host's openArtifact with the pending list's id and path and quiet set; createPanel creates the pane in the active column without quiet and beside without focus with it; there is no presenter when the review pane is not created**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | extension wiring: the chat host's presenter opens a document through the review host's openArtifact with the pending list's id and path and quiet set; createPanel creates the pane in the active column without quiet and beside without focus with it; there is no presenter when the review pane is not created | `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` |

**integration: docs review host: openArtifact with quiet creates the pane with quiet when there is none and reveals an existing one without taking focus; without quiet both are as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review host: openArtifact with quiet creates the pane with quiet when there is none and reveals an existing one without taking focus; without quiet both are as before | `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` |

**integration: chat host: a superseded turn's later tool results are not passed to the presenter, and a document it writes afterwards is opened at the end of the turn that superseded it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host: a superseded turn's later tool results are not passed to the presenter, and a document it writes afterwards is opened at the end of the turn that superseded it | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**smoke: The plugin's whole test suite and typecheck pass apart from failures that exist before this Story**

Reported by the builder, not run by the gate: **pass**. Evidence: Plugin suite after the build: 1270 tests, 1260 pass, 2 fail (the two manifest-catalog failures that exist before this Story); npx tsc --noEmit -p vscode-plugin clean

**smoke: By hand in VS Code: a workflow run in the chat that writes a document awaiting approval opens the review pane on that document without any action, once, with the cursor left in the chat; a second document in a later turn replaces it**

Reported by the builder, not run by the gate: **pass**. Evidence: Checked by the user in VS Code with the installed plugin 0.5.14. 2026-10-13: a turn that made a code review record pending opened the review pane by itself ('yes, pane opened with the right doc'). 2026-10-14: asked item by item whether the cursor stayed in the chat when the pane opened, whether it opened once, and whether a later document replaced the earlier one, the user answered 'yes for the 3 earlier stories'

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 164 | 4.8 s |  |
| `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` | 0 | 16 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` | 0 | 5 | 1 s |  |
| `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` | 0 | 4 | 0.3 s |  |

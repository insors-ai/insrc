<!-- insrc:artifact TESTS-cb09a32ccdc4ed2b-s1 -->

# Tests: cb09a32ccdc4ed2b S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 6 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## S001

Run at 2026-10-13T18:12:18.675Z on commit `5ab1fd97`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

**unit: board state: an epic's board carries the epic's own records, built as a story's are, whatever the search and the needs-attention filter; a list screen carries none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | board state: an epic's board carries the epic's own records, built as a story's are, whatever the search and the needs-attention filter; a list screen carries none | `vscode-plugin/src/delivery/__tests__/epic-records.test.ts` |

**unit: board state: the record owner is the item of an item screen and the epic of an epic's board, and nothing on a list screen**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | board state: the record owner is the item of an item screen and the epic of an epic's board, and nothing on a list screen | `vscode-plugin/src/delivery/__tests__/epic-records.test.ts` |

**unit: board state: a story's screen and the list screens are built exactly as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | board state: a story's screen and the list screens are built exactly as before | `vscode-plugin/src/delivery/__tests__/epic-records.test.ts` |

**integration: details memory: with an epic selected, one of its records opens in the review pane when it has a path and is read and kept otherwise; a record of another item is refused; no plan is read for an epic**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | details memory: with an epic selected, one of its records opens in the review pane when it has a path and is read and kept otherwise; a record of another item is refused; no plan is read for an epic | `vscode-plugin/src/delivery/__tests__/epic-records.test.ts` |

**integration: board webview: an epic's board shows its records table above the totals, also when no story matches; a row's button sends open-evidence with the epic's id; an opened read-only record is shown under the table; an epic with no records says so; record text is set as text**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | board webview: an epic's board shows its records table above the totals, also when no story matches; a row's button sends open-evidence with the epic's id; an opened read-only record is shown under the table; an epic with no records says so; record text is set as text | `vscode-plugin/src/delivery/__tests__/epic-records.test.ts` |

**integration: board host: on an epic's board open-evidence for the epic's HLD opens the review pane with its path, and for an amendment reads it and re-renders the board with its text; moving to a story or back to a list clears the opened record**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | board host: on an epic's board open-evidence for the epic's HLD opens the review pane with its path, and for an amendment reads it and re-renders the board with its text; moving to a story or back to a list clears the opened record | `vscode-plugin/src/delivery/__tests__/epic-records.test.ts` |

**smoke: The plugin's whole test suite and typecheck pass apart from failures that exist before this Story**

Reported by the builder, not run by the gate: **pass**. Evidence: Plugin suite after the build: 1276 tests, 1266 pass, 2 fail (the two manifest-catalog failures that exist before this Story); npx tsc --noEmit -p vscode-plugin clean

**smoke: By hand in VS Code: on an Epic's board the Records table lists its DEF, HLD and amendments; Open in review on the HLD shows it in the review pane with its HTML tabs; Open read-only on an amendment shows its text under the table**

Reported by the builder, not run by the gate: **pass**. Evidence: Checked by the user in VS Code on 2026-10-13 with the installed plugin 0.5.14: 'epic board changes work'

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/epic-records.test.ts` | 0 | 6 | 0.4 s |  |

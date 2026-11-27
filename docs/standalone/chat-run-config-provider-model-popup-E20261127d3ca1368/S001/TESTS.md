<!-- insrc:artifact TESTS-d3ca1368b1f4cccd-s1 -->

# Tests: d3ca1368b1f4cccd s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## s1

Run at 2026-11-27T10:51:22.799Z on commit `8a26ef27d`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chat-panel.ts updatePickers/renderProvPane/rlabel/pickModel/rb.onclick**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ISSUE-d3ca1368b1f4cccd ac2: opening the run popup with an already-ready catalog does not fire a catalog refresh | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | ISSUE-d3ca1368b1f4cccd ac1: duplicate run-config and run-catalog echoes do not rebuild an open popup or the button label | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | ISSUE-d3ca1368b1f4cccd ac3: picking a different provider posts new-chat AND closes the popup (no open popup left for the host echo to rebuild) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | ISSUE-d3ca1368b1f4cccd ac4: a genuine run-config change re-renders the open popup and the button label exactly once | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 289 | 10.3 s |  |

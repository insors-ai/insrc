<!-- insrc:artifact TESTS-0184df38314415ae-s1 -->

# Tests: 0184df38314415ae S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 15 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## S001

Run at 2026-10-11T09:34:09.996Z on commit `924f9410`. Tests check: **passed**. 15 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: taskRows gives each row its short id (last ':' segment; the whole id when there is none)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a task's short id is the last ':' segment of its item id, or the whole id without one | `vscode-plugin/src/delivery/__tests__/board-details.test.ts` |
| pass | planned tasks show their dependencies and checks with Passed, Failed or Unrecorded, a build-only task is unplanned, and unrecorded tasks are counted apart | `vscode-plugin/src/delivery/__tests__/board-details.test.ts` |

**unit: taskRows gives each dependency its task item's short id and title, and the raw PLAN id for both when no task item joins**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | planned tasks show their dependencies and checks with Passed, Failed or Unrecorded, a build-only task is unplanned, and unrecorded tasks are counted apart | `vscode-plugin/src/delivery/__tests__/board-details.test.ts` |
| pass | a task row with no title shows its id, as the same task does among the dependencies | `vscode-plugin/src/delivery/__tests__/board-details.test.ts` |

**unit: dependsOn and acceptanceChecks stay null while the PLAN is loading or failed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | planned tasks show their dependencies and checks with Passed, Failed or Unrecorded, a build-only task is unplanned, and unrecorded tasks are counted apart | `vscode-plugin/src/delivery/__tests__/board-details.test.ts` |
| pass | opening a story reads its plan once per snapshot and shows the dependencies when it arrives | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: the Planned tasks section renders table.records.tasks with ID, Task, Result, Depends on and Checks headers and one row per task**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a story's planned tasks are a table: short id, title, result pill, dependency chips with the title on hover, and a checks count | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: a row shows the short id, the title (or the task item id), the result pill with its tone, and dependency chips with the full title as their hover title, or a dash**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a story's planned tasks are a table: short id, title, result pill, dependency chips with the title on hover, and a checks count | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |
| pass | a task row with no title shows its id, as the same task does among the dependencies | `vscode-plugin/src/delivery/__tests__/board-details.test.ts` |

**integration: the checks toggle reads '<n> checks' or '1 check', starts closed, opens a row listing the checks as plain lines with no bullet or checkbox glyph, and its aria-expanded follows**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a task's checks toggle opens them as a plain list under its row, and the open choice survives a re-render | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |
| pass | a story's planned tasks are a table: short id, title, result pill, dependency chips with the title on hover, and a checks count | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: an open checks row stays open across a re-render (openOf under the screen entry)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a task's checks toggle opens them as a plain list under its row, and the open choice survives a re-render | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: no task plan: 'No task plan recorded yet.' and no table; the plan notice still renders**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a task with no checks, or a plan still loading, shows a dash and no checks row; a story with no plan has no table | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |
| pass | a failed, malformed or stale plan read leaves the details standing with a notice | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: the evidence tab still shows no task rows**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the story tabs post set-item-tab; overview shows the conflict first, tasks, why and chain; evidence is a records table with open buttons | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/board-details.test.ts` | 0 | 15 | 0.3 s |  |
| `vscode-plugin/src/delivery/__tests__/board-host.test.ts` | 0 | 46 | 0.5 s |  |

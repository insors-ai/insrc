<!-- insrc:artifact TESTS-7b6a5fa936278e5d-S001 -->

# Tests: 7b6a5fa936278e5d S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## S001

Run at 2026-10-31T14:48:14.193Z on commit `f4f6bb29e`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: vscode-plugin/src/panels/webview-host.ts showStatusMenu()**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | showStatusMenu offers EXACTLY five items, including Manage Connections and Delivery Board, and routes each choice to the matching panel | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |

**unit: vscode-plugin/src/panels/webview-host.ts openDeliveryBoard()**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | openDeliveryBoard(): unwired onOpenDeliveryBoard logs a warning and opens nothing (no throw) | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |
| pass | openDeliveryBoard(): a synchronous throw from a wired onOpenDeliveryBoard fake is caught and logged, matching the onOpenConnections sink precedent | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |

**unit: vscode-plugin/src/panels/webview-host.ts MENU_ITEMS**

Not mapped: no test case was named for this test, and nothing was run for it.

**unit: vscode-plugin/src/delivery/__tests__/board-icon.test.ts:42**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the insrc.delivery.openBoard command declares the light/dark icon pair | `vscode-plugin/src/delivery/__tests__/board-icon.test.ts` |

**unit: vscode-plugin/src/delivery/__tests__/board-wiring.test.ts:75-77,144-145**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | extension.ts registers insrc.delivery.openBoard outside the chat gate with a warn-and-error logger and a repo-scoped delivery client | `vscode-plugin/src/delivery/__tests__/board-wiring.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/board-icon.test.ts` | 0 | 3 | 0.5 s |  |
| `vscode-plugin/src/delivery/__tests__/board-wiring.test.ts` | 0 | 3 | 0.5 s |  |
| `vscode-plugin/src/panels/__tests__/webview-host.test.ts` | 0 | 39 | 0.5 s |  |

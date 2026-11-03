<!-- insrc:artifact TESTS-2ab0484d51a0556c-S001 -->

# Tests: 2ab0484d51a0556c S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## S001

Run at 2026-10-30T16:57:07.771Z on commit `88b18069d`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: webview-host.ts MENU_ITEMS**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | showStatusMenu offers EXACTLY four items, including Manage Connections, and routes each choice to the matching panel | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |

**unit: webview-host.ts showStatusMenu**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | showStatusMenu offers EXACTLY four items, including Manage Connections, and routes each choice to the matching panel | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |

**unit: webview-host.ts openConnections**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | openConnections(): unwired onOpenConnections logs a warning and opens nothing (no throw) | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |
| pass | openConnections(): a synchronous throw from a wired onOpenConnections fake is caught and logged, matching the onDetailAction/onRepoConfigWrite/onRepoRegisterProviders/onModelTiersWrite sink precedent | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/panels/__tests__/webview-host.test.ts` | 0 | 37 | 0.5 s |  |

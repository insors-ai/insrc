<!-- insrc:artifact TESTS-e4ce70ad1ae43d31-s1 -->

# Tests: e4ce70ad1ae43d31 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## s1

Run at 2026-11-11T13:22:59.471Z on commit `91298c050`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: vscode-plugin/src/chat/render-registry.ts (host toViewModel :116-194 + webview inline mirror :464-490 + webview renderer string whoRow :406-411 / msgRow :416-439)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | who-row shows span.insrc-when with the formatted time for a user row (span is the FIRST child — left end) | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |
| pass | who-row shows span.insrc-when for an assistant row (span is the LAST child — right end via margin-left:auto) | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |
| pass | NAMED live-row test — a live user-row entry ({role:user,text,at}) via toViewModel renders span.insrc-when (webview user-row path) | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |
| pass | NAMED live-row test — a live assistant-delta TurnEvent (no at) through the delta branch stamps at=now() and renders span.insrc-when | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |
| pass | a replayed stored row keeps its `at` and renders the who-row time span | `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts` |

**unit: vscode-plugin/src/chat/__tests__/render-registry.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | invalid/empty `at` renders no span.insrc-when and the who-row markup is unchanged (fallback test) | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |
| pass | far-future `at` (e.g. 9999-12-31) renders no span — the future-window bound (d <= now+60s) suppresses it | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |
| pass | parity: host toViewModel meta.at === webview toViewModel meta.at, including the delta branch | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |
| pass | .insrc-when CSS present in RENDER_REGISTRY_STYLE, smaller than .insrc-who | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |
| pass | non-message rows (marker / tool-result / permission-outcome / diff) render no time span | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |

**integration: vscode-plugin/src/chat/transcript-pager.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a replayed stored row keeps its `at` and renders the who-row time span | `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts` |

**integration: vscode-plugin/src/chat/__tests__/transcript-pager.test.ts**

Not mapped: no test case was named for this test, and nothing was run for it.

**integration: vscode-plugin/src/chat/chat-panel.ts:2898-2905 (live user-row post, now with at)**

Not mapped: no test case was named for this test, and nothing was run for it.

**integration: vscode-plugin/src/chat/chat-panel.ts:2677 (webview user-row consume with at)**

Not mapped: no test case was named for this test, and nothing was run for it.

**integration: vscode-plugin/src/chat/chat-panel.ts:2651-2663 (live turn-event render path)**

Not mapped: no test case was named for this test, and nothing was run for it.

**integration: vscode-plugin/src/chat/chat-panel.ts:2889, :3178 (persisted creation sites, unchanged — regression only)**

Not mapped: no test case was named for this test, and nothing was run for it.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/render-registry.test.ts` | 0 | 84 | 0.9 s |  |
| `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts` | 0 | 23 | 1.5 s |  |

<!-- insrc:artifact CR-b2e8109f42afc0dd-S001 -->

# Code review: b2e8109f42afc0dd:S001

✅ **PASS** — HIGH 0 · MED 0 · LOW 8 · model `claude:opus`

**Changed files:** 29

## adherence — 0 finding(s)

_No findings._

## conventions — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/session-store.ts | `createInMemoryChatSessionStore(deps?: { now?: () => string; genId?: () => string; maxSessions?: number })` declares three optional properties without the explicit `\| undefined` the rule requires under exactOptionalPropertyTypes. Sibling signatures in the same changed set do carry it (e.g. `deriveChatTitle` opts `timeoutMs?: number \| undefined`, `runTurn` opts, `attachHarness` opts). Line number not available: I judged from the symbol summary only (signature of entity 98509), and could not confirm whether this Story introduced the signature or it predates it. |
| LOW | vscode-plugin/src/chat/__tests__/session-file-store.test.ts | Test helper `makeStore(over: { fake?: FakeSessionFs; warns?: string[] } = {})` declares optional properties without `\| undefined`. Other test helpers in the changed set follow the rule (`runShell(opts: { attach?: boolean \| undefined })`, `harness(opts?: { gitAvailable?: boolean \| undefined; diffView?: DiffView \| undefined })`, `fake(..., opts?: { indexExists?: boolean \| undefined })`). Line number not available (symbol summary only, entity 98546); may predate this Story. |
| LOW | vscode-plugin/src/chat/__tests__/cli-adapter.test.ts | Test helpers `toolCall(events): { tool: string; command?: string; mcp?: unknown } \| undefined` and `toolResult(events): { output: string; command?: string; exitCode?: number } \| undefined` declare optional properties in their return types without `\| undefined`. Line numbers not available (symbol summaries only, entities 98458 and 98459); may predate this Story. |

## coverage — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/__tests__/live-cli.test.ts:166 | Present but unverified: both promised live tests exist (lines 166 and 194) but are gated on INSRC_LIVE_TESTS plus an installed claude/codex binary, and were skipped in my run of the plugin suite (8 skipped). Their pass-state cannot be confirmed here; the claude editPath result and the codex applied file-edit mapping are otherwise covered by the passing unit tests in cli-adapter.test.ts:1467 and :1501. |
| LOW | vscode-plugin/src/chat/chat-panel.ts:1 | Unverified: the promised by-hand VS Code smoke (one widget per section, folded to 8 lines, updated in place, latest form after a window reload) has no automated counterpart and no build record attests it was performed. The same behaviour is exercised piecewise by passing tests (render-registry.test.ts:1160/:1210, chat-shell.test.ts:386/:458, chat-panel.test.ts:877/:1082), but the end-to-end manual check itself cannot be confirmed. |
| LOW | vscode-plugin/src/chat/__tests__/chat-panel.test.ts:1 | Present but not fully met as worded: running the whole plugin suite (`npx tsx --test 'src/**/__tests__/*.test.ts'` in vscode-plugin) gave 1206 tests, 1191 pass, 2 fail, 5 cancelled, 8 skipped. The 2 failures are the two expected manifest-catalog tests. The 5 cancelled are all in src/__tests__/activation.test.ts (tests 2-6, 'Promise resolution is still pending but the event loop has already resolved'), reproducible when that file runs alone. That file and src/activation.ts were last touched on 2026-09-24 and are outside this Story's changed set, so this is not a regression from the Story, but the suite is not clean 'apart from the two manifest-catalog tests'. Every chat test this Story promised is present by its exact name and passed in this run. Caveat on grounding: the graph's testsReaching edges only record named helper functions, not the anonymous test() callbacks, so the empty edges on symbols such as parsePatch internals, reconcileSections, runCheck, settlePath, endDiffTurn and latestDiffVersions are a hollow-grounding artefact, not coverage gaps; I judged coverage from the run instead and raise no finding from those empty edges. |

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/__tests__/session-file-store.test.ts:805 | The test helper `diff(over: Record<string, unknown>): TranscriptEntry` builds a diff transcript row from overrides, and the same builder with the same signature exists in transcript-window.test.ts:95 (also as `diffRow` in render-registry.test.ts:1152 and `diffRowMsg` in chat-shell.test.ts:381). Four independent copies of the diff-row shape can drift when the row's fields change; a single builder in `__tests__/fixtures.ts`, next to the already-shared `patchOf`, would remove that. Test-only duplication, so it does not block. |
| LOW | vscode-plugin/src/chat/chat-panel.ts:1121 | `runTurn` now carries the diff-turn lifecycle (openDiffTurn, pushMarker, pathLine, settlePath, settleHeld, endDiffTurn, warnGovernor) on top of streaming, approvals, titling and persistence — 16 distinct callees inside the `createChatPanelHost` closure, which itself has 57. The summaries show `endDiffTurn` reached from four exit paths (runTurn, handleMessage, wireChannel, the host), so the 'diff state ended on every exit' guarantee depends on each path remembering the call. Judged from the call edges only, not the body; no defect is shown, this is a maintainability observation. |

## diagram — 0 finding(s)

_No findings._


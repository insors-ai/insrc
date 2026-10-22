<!-- insrc:artifact CR-ddc4ede1dbf84626-s1 -->

# Code review: ddc4ede1dbf84626:S001

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 3 · model `claude:opus`

**Changed files:** 13

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | vscode-plugin/src/chat/__tests__/chat-panel.test.ts:3309 | Present but unverified: all 32 promised tests exist by exact title (5 in transcript-window.test.ts, 1 in protocol.test.ts:83, 1 in fake-dom.test.ts:113, 2 in render-registry.test.ts:940/980, 12 in transcript-pager.test.ts:109-346, 11 in chat-panel.test.ts:3309-3667), but no build record was supplied, so none of them can be confirmed passing. I did not run the suite. This is not a missing-test finding; run `npx tsx --test` over vscode-plugin/src/chat/__tests__ to confirm the pass-state before completing the Story. |
| LOW | vscode-plugin/src/chat/transcript-window.ts:1 | The testsReaching edges are hollow for the changed production symbols (pageStart, latestWindow, pageBefore, transcriptPagerWebviewSource, postRestored, postLive, appendEvent, followLiveTurn, handleMessage, envelope), because the graph records no edge from anonymous top-level `test(...)` callbacks. I am not reporting these as HIGH not-exercised gaps: a title and import check shows each has tests aimed at it — transcript-window.test.ts has five latestWindow/pageBefore tests, transcript-pager.test.ts:81 evaluates transcriptPagerWebviewSource(), chat-panel.test.ts:3515 asserts the pager is embedded once in the shell, and chat-panel.test.ts:3309-3667 covers the rowIndex writers, load-older handling and the windowed restore. The empty edges are an indexing limit, not evidence of missing coverage; I matched tests by title and import only, without reading the test bodies. |

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/__tests__/render-registry.test.ts | Duplication (test scaffolding): this file keeps its own fake DOM (`FakeNode`, `makeNode(tag)`, `fakeDocument`) while the shared `fake-dom.ts` in the same directory already provides a fake node factory that chat-shell.test.ts and transcript-pager.test.ts use. Two fake DOMs can drift, so a registry behaviour could pass against one and fail against the other. Judged from symbol summaries only: no line number is available and the bodies were not compared. |
| LOW | vscode-plugin/src/chat/__tests__/transcript-pager.test.ts | Duplication (test scaffolding): the local helpers `line(s, cls?)`, `maxTop()` and the `Registry` interface repeat same-named helpers in sibling tests (`line` and `Registry` in render-registry.test.ts, `maxTop` in chat-shell.test.ts). They could move into the shared `fake-dom.ts`. Not a production risk. Judged from symbol summaries only: no line number is available and the bodies were not compared. |

## diagram — 0 finding(s)

_No findings._


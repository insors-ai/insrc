<!-- insrc:artifact CR-1f74c81f507dbe78-s1 -->

# Code review: 1f74c81f507dbe78:S001

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 5 · model `claude:opus`

**Changed files:** 30

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts:1 | Present but unverified: there is no build record, so the promised whole-suite and typecheck smoke has no recorded result. I ran only the five test files that hold this Story's promised tests (review-icon, review-wiring, docs-review-client, docs-review-decision, docs-review-panel): 263 passed, 0 failed, 0 skipped. I did not run the rest of the plugin suite or the typecheck. |
| LOW | vscode-plugin/src/extension.ts:1 | Unverified: the by-hand VS Code smoke (tab icon in light and dark themes, paging/search/type filter over the real pending list, in-place reload of a document edited on disk) is manual and no build record shows it was done. The automated tests for the same behaviour exist and passed when I ran them, but they do not replace the check in a real VS Code window. |
| LOW | vscode-plugin/src/chat/docs-review-panel.ts:1 | Unverified: no build record shows the headless Chrome render of the list view with 240 rows was run, and I did not look for a test or script that does it. The nearest automated test ('the list view's table is its own scrolling region, the toolbar and pager are outside it…', docs-review-panel.test.ts:7022) is present and passed, but it runs against a stubbed DOM, not a real browser layout. |
| LOW | vscode-plugin/src/chat/docs-review-panel.ts:1 | Grounding caveat, not a coverage breach: the graph's testsReaching edges are hollow for this change set. They record only helper-to-helper calls inside test files and miss the anonymous test() callbacks, so nearly every production symbol shows an empty testsReaching even where tests clearly reach it. I therefore raised no HIGH not-exercised findings from empty edges. Instead I checked coverage directly: all 16 promised unit and integration tests are present by exact title in review-icon.test.ts, review-wiring.test.ts, docs-review-client.test.ts, docs-review-decision.test.ts and docs-review-panel.test.ts, and all passed in my run. Per-symbol coverage of the other changed files in the set (src/workflow/pending.ts, vscode-plugin/src/delivery/*, chat-panel.ts, review-presenter.ts) was not checked this way. |

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/docs-review-panel.ts:2491 | `errText(err)` is a third copy of the same one-line error-to-string helper (`err instanceof Error ? err.message : String(err)`). The identical `errorText` already exists in the changed `review-presenter.ts` (line 74) and is the one `board-host.ts` uses. Three copies of the same normalisation can drift; importing the shared one would remove the copy. Low risk: the bodies are identical today. |
| LOW | vscode-plugin/src/chat/docs-review-panel.ts:2429 | A module-local `plural(n, word)` re-implements count pluralisation with a different contract (appends 's') from the `plural(n, one, many)` already used by `chat-panel.ts` (line 342) and by the delivery modules (`board-state.ts`, `board-model.ts`). Two same-named helpers with incompatible signatures in sibling files are easy to mis-call, and the 's'-suffix form is wrong for any irregular noun. Reusing the (n, one, many) form would remove the divergence. |


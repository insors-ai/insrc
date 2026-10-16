<!-- insrc:artifact CR-f52996c2709dba81-S001 -->

# Code review: f52996c2709dba81:S001

⚠️ **WARN** — HIGH 0 · MED 4 · LOW 2 · model `claude:opus`

**Changed files:** 11

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 5 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts:82 | Present but unverified: all 9 promised code-ref-script tests are declared with the exact titles the plan uses (lines 82, 91, 100, 108, 120, 128, 143, 216, 241). The file also has 3 extra tests from the code-review fix (lines 153, 170, 182). No build record was available, so whether they pass could not be confirmed. |
| MED | vscode-plugin/src/chat/__tests__/review-frame-message.test.ts:84 | Present but unverified: all 4 promised review-frame-message tests are declared with the plan's titles (lines 84, 93, 104, 116). No build record was available, so whether they pass could not be confirmed. |
| MED | src/docgen/extract/__tests__/call-sequence-label.test.ts:30 | Present but unverified: all 3 promised call-sequence-label tests are declared with the plan's titles (lines 30, 40, 51). No build record was available, so whether they pass could not be confirmed. |
| MED | src/docgen/__tests__/code-ref-grammar-pin.test.ts:54 | Present but unverified: the promised grammar-pin test is declared with the plan's title (line 54). No build record was available, so whether it passes could not be confirmed. |
| LOW | src/docgen/extract/call-sequence.ts:1 | The test-reaching data is empty for every production symbol this Story changed, including those named tests clearly call: frameLabel and buildCallSequenceIR (call-sequence-label tests); code-ref-script.ts, renderCompanionPage, buildHtml and assembleFallbackShell (code-ref-script page tests); and createDocsReviewHost's frame-message path (review-frame-message tests). Tests that are present and call these symbols contradict the empty data, so it reads as a gap in the graph's test edges for newly added test files, not as missing coverage. It is not reported as a HIGH not-exercised breach. Re-check after re-indexing, or confirm by running the four test files. Many listed symbols in fallback.ts, shell.ts and docs-review-panel.ts are untouched neighbours in changed files and are out of scope. |

## quality — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/docgen/render/fallback.ts:190 | escapeHtml here has the same body as escapeHtml in src/docgen/render/shell.ts:183: both escape only &, < and >. Two renderer shells now keep their own copy, so a fix to one (for example also escaping quotes for attribute contexts) can miss the other. Move it into one shared docgen render helper. |


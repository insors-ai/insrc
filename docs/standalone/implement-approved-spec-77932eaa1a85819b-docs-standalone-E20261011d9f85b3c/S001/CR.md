<!-- insrc:artifact CR-d9f85b3cc8cc966b-s1 -->

# Code review: d9f85b3cc8cc966b:S001

⚠️ **WARN** — HIGH 0 · MED 2 · LOW 3 · model `claude:opus`

**Changed files:** 50

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/artifacts/companion/sequence.ts:257 | t10 / migration step 6 require removing the companion IR lowerings and the old UX page wrapper, but sequenceDefinitionToIr (sequence.ts:257, plus sequenceNarratedSections), erDefinitionToIr (er.ts:287, plus erNarratedSections) and renderUxMockDocument (ux.ts:476, plus uxNarratedSections) are all still exported. removed-paths.test.ts:33-40 deliberately checks that they still exist, saying the VS Code plugin's parity tests import them. That is a reasonable reason, but the approved LLD/PLAN does not record it as an exception; the backwardCompat section says the plugin only reads definitions and links companion files. Either amend the LLD/PLAN to keep these exports or remove them as planned. |

## conventions — 0 finding(s)

_No findings._

## coverage — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/__tests__/companion-browser.live.test.ts:1 | Present but unverified: the headless-Chrome smoke test exists (chromeBinary/loadInChrome helpers) but is gated behind INSRC_LIVE_TESTS=1 plus an installed Chrome, and it reported '# SKIP' when the companion subsets were run. No build record confirms it ever passed, so whether each generated page draws, applies fit-on-load and logs no console error is unverified. This is not a missing test. |
| LOW | src/workflow/artifacts/companion/render.ts:1 | The graph grounding is hollow for this Story's new files. Every changed symbol except resolveCompanionHeader has an empty testsReaching list, even where a dedicated test file exists that drives the symbol (panzoom.test.ts calls insrcPanZoom.init, completeness.test.ts calls completenessFindings, plus er-page, sequence-component-page, ux-page, shell, header, companion-context-finalize, diagram-handlers and ux dimension tests). No not-exercised HIGHs were raised from the empty edges. Instead, coverage was judged by running the suites: companion + finalize + code-review subsets ran 369 tests, 367 passed, 0 failed, 2 skipped (the Chrome live smoke and a pre-existing grounding IPC live test). Every other promised test maps to a present, passing test file. 'tsc --noEmit' and the docgen pipeline tests were not re-run in this review. |

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/artifacts/companion/component.ts:128 | The same one-line HIGH-breach DimensionFinding factory is copied into component.ts, er.ts:183, sequence.ts:166, ux.ts:189 and code-review/dimensions/ux/index.ts:82. Only the DIMENSION constant differs between the copies. One shared helper, breach(dimension, location, message), would stop the severity and confidence shape from drifting between modules. Each copy is trivial, so this is not a real risk. |
| LOW | src/workflow/artifacts/companion/ux.ts:521 | shortText (cuts at 60 characters, collapses whitespace) and truncate at ux.ts:230 (cuts at 40, keeps whitespace as is) are two ellipsis truncators in the same module. Their limits and whitespace handling differ, so one label can render differently in the Elements section and in the key-element table. One parameterised helper would be clearer. This is a matter of taste. |


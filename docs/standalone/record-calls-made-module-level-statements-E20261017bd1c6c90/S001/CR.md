<!-- insrc:artifact CR-bd1c6c9005ff6390-S001 -->

# Code review: bd1c6c9005ff6390:S001

⛔ **BLOCK** — HIGH 53 · MED 0 · LOW 0 · model `codex:gpt-6-astra`

**Changed files:** 5

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 53 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/indexer/__tests__/test-callers-reach-grounding.test.ts | The changed file entity has empty testsReaching; the passing test record does not establish reachability for this symbol. |
| HIGH | src/indexer/parser/__tests__/typescript-module-level-calls.test.ts | The changed file entity has empty testsReaching; the passing test record does not establish reachability for this symbol. |
| HIGH | src/indexer/parser/__tests__/typescript-module-level-calls.test.ts | Changed symbol parse has empty testsReaching and is not exercised according to the supplied grounding. |
| HIGH | src/indexer/parser/typescript.ts | The changed file entity has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol SyntaxNode has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol _fieldText has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol _hasAncestor has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol isNodeExported has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol TypeScriptParser has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed method parse has empty testsReaching. Passing parser tests do not override the supplied reachability edges. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol walkNode has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol ownedElsewhere has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol extractFunction has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol extractClass has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol extractClassHeritage has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol extractMethod has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol extractInterface has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol extractTypeAlias has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol extractArrowFunction has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol extractImport has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol extractCalls has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol collectClassHttpFields has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol collectPatternIdentifiers has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol AxiosScope has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol collectScopeFrame has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol isProvenAxios has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol collectTsImportSpecifiers has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol extractTsTopicExpr has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol walkForCalls has empty testsReaching. |
| HIGH | src/indexer/parser/typescript.ts | Changed symbol resolveCalleeName has empty testsReaching. |
| HIGH | src/workflow/code-review/__tests__/grounding.test.ts | The changed file entity has empty testsReaching; the passing test record does not establish reachability for this symbol. |
| HIGH | src/workflow/code-review/grounding.ts | The changed file entity has empty testsReaching. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol GroundedEntity has empty testsReaching. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol GroundingDeps has empty testsReaching. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol isTestFile has empty testsReaching. Its promised test is present and passing, but does not supply a reaching edge in this grounding. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol assembleCodeReviewGrounding has empty testsReaching. Passing grounding tests do not override the supplied reachability edges. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol realGroundingDeps has empty testsReaching. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol toGrounded has empty testsReaching. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol rowById has empty testsReaching. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol DiffResult has empty testsReaching. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol DiffUnavailableError has empty testsReaching. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol DiffGroundingDeps has empty testsReaching. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol DiffGroundingOptions has empty testsReaching. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol assembleDiffCodeReviewGrounding has empty testsReaching. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol sequence has empty testsReaching. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol buildDiffSymbols has empty testsReaching. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol splitDiffByFile has empty testsReaching. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol extractDiffBody has empty testsReaching. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol runDiff has empty testsReaching. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol excludeInput has empty testsReaching. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol storyRangeDiff has empty testsReaching. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol collect has empty testsReaching. |
| HIGH | src/workflow/code-review/grounding.ts | Changed symbol realDiffGroundingDeps has empty testsReaching. |

## quality — 0 finding(s)

_No findings._


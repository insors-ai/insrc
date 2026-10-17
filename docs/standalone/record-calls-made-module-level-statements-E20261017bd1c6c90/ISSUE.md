<!-- insrc:artifact ISSUE-bd1c6c9005ff6390 -->

# Record calls made in module-level statements, so tests reach the code they call

## Reproduction

Index a TypeScript repository and ask for the callers of a function that is only called from tests. Observed on 2026-10-17 in this repository, with indexing complete (queue 0): none of the 200 changed source symbols of ISSUE-1102dc71 S001 had a test caller, although their test files call them directly. For example readStoryBuildRecord, computeCodeReviewFreshness and codeReviewRequestParams had no callers at all, while testRecordView, called from the named function testRecordSection in another file, did list its caller. The code review's coverage dimension then raised 24 HIGH findings for empty testsReaching. Expected: a call inside a test('title', () => { ... }) body, or any other module-level statement, is recorded with a caller that says where it is.

## Root cause

The TypeScript parser extracts calls only from three kinds of enclosing entity: function declarations (src/indexer/parser/typescript.ts:259), class methods (src/indexer/parser/typescript.ts:419) and arrow or function expressions assigned to a variable (src/indexer/parser/typescript.ts:552). Each passes its own entity id to extractCalls (src/indexer/parser/typescript.ts:631), and walkForCalls credits nested callbacks to that entity. A call in a module-level expression statement belongs to none of these, so extractCalls is never run over it and no CALLS relation is emitted. Every test body is such a statement, as test('...', () => { ... }) is a top-level call whose callback is anonymous, so the graph holds no edge from any test file to the code it exercises. The code-review grounding derives testsReaching from callers whose file is a test file (src/workflow/code-review/grounding.ts:81), so it is empty for every symbol. The other language parsers in src/indexer/parser/ have not been checked for the same gap.

## Fix intent

Calls made in module-level statements are recorded with a caller that identifies where they are: for a test callback, the test it belongs to, or at least its file, so that a test file's calls reach the symbols they exercise and the code review's testsReaching reflects real tests. The same is checked, and fixed where it applies, for the other language parsers.

## Citations

- **[[c1]]** `code` `src/indexer/parser/typescript.ts:259` — "extractCalls(body, id, repo, filePath, relations);"
- **[[c2]]** `code` `src/indexer/parser/typescript.ts:419` — "extractCalls(methodBody, id, repo, filePath, relations);"
- **[[c3]]** `code` `src/indexer/parser/typescript.ts:552` — "extractCalls(arrowBody, id, repo, filePath, relations);"
- **[[c4]]** `code` `src/indexer/parser/typescript.ts:631` — "function extractCalls("
- **[[c5]]** `code` `src/workflow/code-review/grounding.ts:81` — "const testsReaching = callers.filter(c => isTestFile(c.file));"

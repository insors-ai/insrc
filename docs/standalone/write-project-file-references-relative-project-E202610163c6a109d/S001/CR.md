<!-- insrc:artifact CR-3c6a109dffcde0c1-s1 -->

# Code review: 3c6a109dffcde0c1:S001

⚠️ **WARN** — HIGH 0 · MED 2 · LOW 5 · model `claude:opus`

**Changed files:** 14

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/synthesizer.ts:238 | pathFormProblem refuses a ref equal to the project root itself (`ref === root`), as well as a path under it. The approved design says the check matches the project root only as a prefix followed by a slash, and lists "the project root itself" as not detected (a known limit). The code is stricter than the approved contract. Either update the LLD edge case and postcondition to describe this behaviour, or drop the `ref === root` arm. |

## conventions — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/orchestrator.ts:2344 | finalizeStandaloneLld's `citations` parameter is typed with an inline `import('./types.js').Citation`, and the same pattern appears at lines 2478 and 2490. The rest of the module brings its types in through top-level `import type` declarations. This is not a verbatimModuleSyntax breach, because an inline type import is erased at compile time. It does depart from the module's import style; a top-level `import type { Citation } from './types.js'` would match it. |

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/synthesizer.ts | The graph grounding has no test edges: every production symbol in the changed set (synthesizer.ts, orchestrator.ts, runner schemas and prompts) shows an empty testsReaching. This looks like an indexing gap, not missing coverage, so it is not reported as HIGH. To check, I ran the suites directly. src/workflow/__tests__/path-forms.test.ts ran 17 tests and all 17 passed; that includes all 12 tests the plan promised, with the exact titles, plus 5 added during the code-review fixes. These tests call checkPathForms and validateBodyAndCitations directly. The other changed test files (lld-artifact, amendments-e2e, design-story-e2e, questions-gate-e2e) ran 52 tests and all 52 passed. No build record confirms these results; the evidence is the reviewer's own run. |

## quality — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/synthesizer.ts:224 | PROJECT_PATH_RE accepts any token without whitespace, '/', ':' or '#' as a project file, so a bare symbol or word used as a code/doc citation ref (e.g. `finalizeArtifact`, `TODO`) or as a call site passes checkPathForms as a well-formed path. The check exists to refuse refs that are not file references, but a symbol name with no path and no ':' gets through. SYMBOL_SUFFIX_RE only catches the `path:Symbol` form. One way to close the gap: require at least one '/' or a file extension, or refuse a single segment that looks like an identifier. |
| MED | src/workflow/synthesizer.ts:222 | The doc comment says PROJECT_PATH_RE matches 'the forms the chat page links (CREF_CORE in vscode-plugin/src/chat/link-markup.ts)', but the two regexes disagree. CREF_CORE allows only [A-Za-z0-9_.@-] in a segment and needs a known extension (CREF_EXT). PROJECT_PATH_RE accepts brackets, parentheses, other punctuation and names with no extension. So refs like `app/[id]/page.tsx`, `Makefile` or `docs/notes(v2).md` pass validation, yet the chat page will not render them as links. Either line the two grammars up or correct the comment so nobody relies on that guarantee. |
| LOW | src/workflow/synthesizer.ts:237 | The repoPath prefix check is a plain string comparison: it only strips trailing slashes and does not normalise the path. If meta.repoPath is stored in a different form from the one the model writes (a symlinked path, a `~` path, or a Windows path with backslashes or different drive-letter case), an absolute path inside the project falls through to EXTERNAL_REF_RE and is accepted as an external file. When repoPath is undefined, every absolute path is accepted. That case is documented, but it means the 'absolute path inside the project' rule only works when a repoPath is stamped. |
| LOW | src/daemon/steps/workflow-step/__tests__/questions-gate-e2e.test.ts:1 | The `Envelope` interface, `payload(env)` helper and `seed(repo, …)` fixture (which calls stampOtherPartyReview / approveArtifactByJsonPath / defineArtifactPaths / hldArtifactPaths) are copied, with small variations, across three e2e test files. Fixture changes in this Story had to be made three times. A shared test helper module would stop the copies drifting apart. This is test code only, so it carries no runtime risk. |


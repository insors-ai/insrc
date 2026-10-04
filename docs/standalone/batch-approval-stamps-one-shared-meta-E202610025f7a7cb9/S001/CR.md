<!-- insrc:artifact CR-5f7a7cb95b643ae5-S001 -->

# Code review: 5f7a7cb95b643ae5:S001

⚠️ **WARN** — HIGH 0 · MED 2 · LOW 8 · model `claude:opus`

**Changed files:** 18

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/runners/build/range-base.ts:111 | The build-start reader `readBuildStart` is exported and called directly from two test files (range-base.test.ts `assertSkipped`, build-start.test.ts `stampedBase`), whereas the approved design specifies it as a private reader shared only by the resolver and the stamper. Behaviour is unaffected (both production callers do go through the one reader), but the module's public surface is wider than approved. Everything else checked adheres: the four ledger globs, the exact-path exclusion in both BUILD writers, stamping before the Trivial record write, the three-attempt subject fallback, the base + globs passed from beginDiffOnlyReview, and no runtime import of gates.ts. |

## conventions — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/mcp/build-step/phases/validate.ts:142 | The `ident.standalone` parameter type of runValidateSession declares its inner optional properties as `readonly sizeClass?: string; readonly triageRationale?: string` without the explicit `\| undefined`, while the enclosing `standalone?: {...} \| undefined` on the same line and the sibling `version?: string \| undefined` / `base?: string \| undefined` / `exclude?: readonly string[] \| undefined` in collectBuildChangeLog's ctx follow the documented form. Under exactOptionalPropertyTypes a caller forwarding a possibly-undefined sizeClass/triageRationale cannot pass it through directly. |
| LOW | src/workflow/code-review/grounding.ts:338 | excludeInput returns `{ exclude?: string[] }` — an optional property declared without `\| undefined`. This is probably deliberate (a spread-in fragment that omits the key so no `exclude: undefined` reaches the git_diff tool input), so it is reported as an idiom departure from the documented `\| undefined` form rather than a firm breach. |

## coverage — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/mcp/build-step/__tests__/build-start.test.ts:159 | Present but unverified. Every one of the 50 promised tests has a matching test title in the changed test files (T1-T21 in range-base.test.ts, T22-T25 in diff.test.ts, T26-T29 in changed-files.test.ts, T30-T38 plus the Trivial-route and fail-open tests in build-start.test.ts, T39-T43 in subject.test.ts, T44-T47 in diff-grounding.test.ts, T48 in handler.test.ts). None is missing. Their pass-state is not confirmed: there is no build record, and my attempts to run the seven test files in this review were refused by the permission gate, so no test was executed. The empty testsReaching edges on the changed production symbols (handleImplement, runValidateSession, changedFiles, resolveStoryRangeBase, assembleDiffCodeReviewGrounding, ensureBuildRecordOnCompletion, git_diff helpers) are not reported as gaps: the graph has no edges from the top-level test() callbacks, and the test files call these symbols directly (e.g. handleBuildStep and ensureBuildRecordOnCompletion are referenced 12 times in build-start.test.ts). Run the seven files under Node 22 before treating coverage as green. |
| LOW | src/mcp/build-step/__tests__/build-start.test.ts:357 | Present but weaker than promised. The plan promises 'Trivial route stamps before its record write and keeps the stamp on a second call'. The test asserts that after the first implement both the stamp (at HEAD) and the task-less record exist, and that the second implement leaves the stamp bytes unchanged. It does not assert the ORDER of stamp versus record write: a task-less record still permits a stamp (the T15 rule), so an implementation that wrote the record first and stamped second would pass this test unchanged. The 'before' half of the promise is not exercised. |

## quality — 5 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/runners/build/completion-record.ts:72 | Duplication: the change-log derivation for a BUILD record (resolveStoryRangeBase -> exclude [own.json, own.md, buildStartRelPath(...)] -> collectBuildChangeLog -> persistBuildRecord, with inheritedStoryStandalone / buildRecordPathsFor) is written out twice, once here and once in runValidateSession (validate.ts:248-254). The two copies must agree on the range base and the exclude list for the two write paths to produce the same change log; a future edit to one (e.g. a new self-authored file to exclude) silently diverges the other. Extract one shared helper that returns the change-log context. |
| LOW | src/workflow/runners/build/completion-record.ts:36 | Correctness risk (narrow): the injectable `listChanged` seam is typed `(repoPath) => Promise<readonly string[]>`, narrower than the `(repoPath, opts?: ChangedFilesOptions)` seam collectBuildChangeLog accepts. Any injected lister therefore cannot see the `base` / `exclude` this function computes at lines 72-75, so a test driving this path through the seam cannot observe (or falsify) the range-base and self-exclusion behaviour the Story adds; only the default git path honours them. Widen the parameter type to match collectBuildChangeLog's. |
| LOW | src/workflow/runners/build/changed-files.ts:122 | Duplication: the 'forward `exclude` to git_diff only when the glob list is non-empty' guard is re-implemented inline here and again in assembleDiffCodeReviewGrounding (grounding.ts:233), while grounding.ts already has a helper for exactly this (excludeInput, grounding.ts:338). Three spellings of one rule; share the helper. |
| LOW | src/mcp/build-step/phases/implement.ts:101 | Error path: noteBuildStart returns void and wraps stampBuildStart, so a StampOutcome of skipped/failed (e.g. headFullSha unresolvable, unwritable stamp file) never reaches handleImplement's caller. The build proceeds unstamped and resolveStoryRangeBase later falls back to the upstream-artifact/introducing-commit base, which can widen the Story's change log and review range without any signal in the implement response. If best-effort is intended, surface the non-stamped outcome in the response rather than only in the log. |
| LOW | src/mcp/build-step/phases/validate.ts:328 | Duplication (minor): `err(code, message): BuildStepError` is defined identically in validate.ts and implement.ts (implement.ts:173). Taste-level; could live beside the BuildStepError type. |


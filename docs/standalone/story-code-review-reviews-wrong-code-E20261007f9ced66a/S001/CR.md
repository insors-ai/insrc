<!-- insrc:artifact CR-f9ced66a0e8835b8-s1 -->

# Code review: f9ced66a0e8835b8:s1

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 6 · model `claude:opus`

**Changed files:** 23

## adherence — 0 finding(s)

_No findings._

## conventions — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/mcp/build-step/phases/validate.ts:227 | In the inline type of runValidateSession's `ident.standalone`, `sizeClass?: string` and `triageRationale?: string` are optional properties without `\| undefined`. The outer `standalone?: {...} \| undefined` on the same line does include it. Under exactOptionalPropertyTypes the documented convention is to declare optional props as `?: T \| undefined`. |
| LOW | src/workflow/code-review/dimensions/coverage.ts:84 | promisedTestsOf's return type `{ level?: string; name: string }[]` declares the optional `level` without `\| undefined`. The same shape is repeated at lines 89–90. This breaks the documented optional-property convention. |
| LOW | src/workflow/code-review/__tests__/diff-grounding.test.ts:195 | The test helpers' option types declare optional props without `\| undefined`. Examples: `range?: (base, globs) => DiffResult` in recordingDeps, and `working?: DiffResult` in fakeDeps at line 47. Other changed tests use `?: T \| undefined`, for example runImplementThenValidate's `summary?: string \| undefined` in build-step.test.ts. |

## coverage — 0 finding(s)

_No findings._

## quality — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/runners/build/story-commits.ts:84 | storyChangeSet treats every non-merge commit on the first-parent line of base..HEAD as the Story's own. If upstream comes in by fast-forward or rebase (`git pull --rebase`, or a ff `git merge`) instead of a merge commit, those upstream commits land on the first-parent line as ordinary commits. Their paths then go into `paths` and their hunks into storyRangeDiff, so the reviewer judges code the Story did not write, which is the defect ISSUE-f9ced66a set out to fix. The implement prompt's merge rule reduces this risk but nothing in the code checks for it. Either detect commits whose author or committer falls outside the build window, or record the limit in the module comment and in mergeInProgressError guidance. |
| LOW | src/workflow/runners/build/story-commits.ts:69 | The private `git` helper turns every git failure (bad base ref, missing binary, a merge-tree crash) into NoBuildChangesError. Callers such as realDiffGroundingDeps.rangeDiff re-wrap it as DiffUnavailableError, but changedFiles gets a 'no build changes' error type for what is really an environment or ref failure. That can mislead whoever reads or branches on the error class. A neutral error type, or keeping the original cause, would make failures easier to diagnose. |
| LOW | src/workflow/code-review/dimensions/quality.ts:114 | `fileOf(location)` is defined identically, as a private helper, in all five dimension modules (adherence, conventions, coverage, functional-coverage, quality). A fix to how `file:line` locations are parsed, such as Windows drive letters or paths containing colons, would have to be made five times. Move it into one shared helper. |
| LOW | src/mcp/build-step/phases/validate.ts:386 | The private `err(code, message): BuildStepError` constructor is duplicated in implement.ts and validate.ts, and render.ts now also builds a BuildStepError (mergeInProgressError). That makes three places that build the same error shape. This is taste-level: they could share one constructor. |


<!-- insrc:artifact ISSUE-91640defac1b5816 -->

# Run a trivial build's tests from its whole range, not the HEAD commit

## Reproduction

Implement a trivial standalone build and commit its code and test, then commit anything else (the build's records, or another Story's change), then run insrc_build_step validate for the build. Observed on 2026-10-17: the gate of ISSUE-e48e33ae6af03720 S001, whose test is src/agent/providers/__tests__/cli-codex-strict-schema.test.ts, ran ISSUE-ae2d83c6ab06c595's test files (render.test.ts and build-start.test.ts), because the latter's commit was HEAD. With a records-only commit at HEAD, the gate runs no tests at all and reports "no tests named for a trivial build", which passes the tests check. Expected: the gate runs the test files the build touched across its own range.

## Root cause

trivialCheckPlan (src/daemon/steps/build-step/validation-checks.ts:323-338) lists the test files to run with `git show --name-only HEAD`: only the last commit's files. The standalone validate calls it with nothing but the repository path (src/daemon/steps/build-step/phases/validate.ts:348). Everything else in the same validate run uses the Story's range: the typecheck projects (src/daemon/steps/build-step/phases/validate.ts:389) and the BUILD change log (src/daemon/steps/build-step/phases/validate.ts:571) both take the base from resolveStoryRangeBase (src/workflow/runners/build/range-base.ts:327), which reads the build-start stamp written when the build began. So the tests run disagree with the change set the record and the judge see whenever HEAD is not the build's only commit.

## Fix intent

A trivial build's gate runs the test files touched across the build's range, from the same range base the change log and typecheck use, and falls back to the HEAD commit only when no range base resolves. Tests show that a test file committed earlier in the range is run when a later commit is HEAD, and that the HEAD fallback still applies with no base.

## Citations

- **[[c1]]** `code` `src/daemon/steps/build-step/validation-checks.ts:323-338` — "touched = execFileSync('git', ['show', '--name-only', '--diff-filter=d', '--format=', 'HEAD'], { cwd: repoPath, encoding: 'utf8' })"
- **[[c2]]** `code` `src/daemon/steps/build-step/phases/validate.ts:348` — "checks = trivialCheckPlan(repoPath);"
- **[[c3]]** `code` `src/daemon/steps/build-step/phases/validate.ts:389` — "const planned = withTypecheckProjects(repoPath, checks, resolveStoryRangeBase(repoPath, ident.epicHash, ident.storyId));"
- **[[c4]]** `code` `src/daemon/steps/build-step/phases/validate.ts:571` — "const base = resolveStoryRangeBase(repoPath, epicHash, storyId);"
- **[[c5]]** `code` `src/workflow/runners/build/range-base.ts:327` — "export function resolveStoryRangeBase(repoPath: string, epicHash: string, storyId: string): string | undefined {"

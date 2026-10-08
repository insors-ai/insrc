<!-- insrc:artifact CR-f1bf0fb3085c629c-s1 -->

# Code review: f1bf0fb3085c629c:s1

⚠️ **WARN** — HIGH 0 · MED 3 · LOW 10 · model `claude:opus`

**Changed files:** 23

## adherence — 0 finding(s)

_No findings._

## conventions — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/mcp/build-step/phases/validate.ts:223 | In runValidateSession's `ident` parameter type, the optional properties `sizeClass?: string` and `triageRationale?: string` (inside `standalone`) are not declared `\| undefined`. The documented rule says optional properties must spell out `\| undefined`. The outer `standalone?` on the same line does follow it, so the line is inconsistent with itself. Severity is LOW because the codebase is mixed on this rule: about 161 non-test `readonly x?: string;` declarations vs 136 that include `\| undefined`. |
| LOW | src/workflow/review/__tests__/template-review.test.ts:52 | Test helper option types declare optional properties without `\| undefined`: `fakeProvider(opts: { takesMs?: number; withSession?: boolean })` at line 52 and `designRepo(opts: { issue?: boolean; def?: boolean })` at line 275. This is test-only code, but the documented rule applies to it too. Elsewhere in the same Story, `runImplementThenValidate(opts?: { readonly summary?: string \| undefined })` in build-step.test.ts does follow the rule. |
| LOW | src/mcp/build-step/__tests__/validation-checks.test.ts:51 | The same `isAlive(pid: number): boolean` helper is defined separately in three test files: src/agent/providers/__tests__/cli-subprocess.test.ts:55, src/agent/providers/__tests__/cli-subprocess.live.test.ts:32, and here. The test helpers `judgeVerdict` and `git` are also duplicated between build-start.test.ts and build-step.test.ts. Per-file test helpers are a common local idiom, so this is not a breach. Because the process-group kill semantics are new in this Story, a shared test helper next to src/shared/process-group.ts may be worth considering. |

## coverage — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/mcp/build-step/__tests__/build-step.test.ts:1329 | Present but unverified. All 22 promised tests are in the tree under their exact names: cli-subprocess.test.ts:74/84, cli-subprocess.live.test.ts:41, cli-review-session.test.ts:71 (the reviewer no-edit assertion at :79) and :199, validation-checks.test.ts:68/82/91/124/136/154/171/184, render.test.ts:55/73, and build-step.test.ts:1329/1354/1373/1387/1411/1429/1444. There is no build record, and running the suite was not permitted in this review session, so none of them can be confirmed as passing. Run `npx tsx --test src/agent/providers/__tests__/cli-subprocess.test.ts src/agent/providers/__tests__/cli-review-session.test.ts 'src/mcp/build-step/__tests__/*.test.ts'` before approving the BUILD record. |
| LOW | src/agent/providers/__tests__/cli-subprocess.live.test.ts:41 | Present but gated. The live test that kills a backgrounded command from a real claude session is skipped unless the live-test gate is set (INSRC_LIVE_TESTS). A normal run reports it as skipped, not passed, so it only counts as verified if someone runs it with the gate on. |
| LOW | src/mcp/build-step/phases/validate.ts:1 | The graph grounding is hollow: changed production symbols (handleValidate, runValidateSession, runValidationChecks, resolveTaskTestFiles, runInProcessGroup, runSubprocess/spawnOnce, and others) show empty testsReaching even though test files import and call them. Checked directly instead: build-step.test.ts drives handleValidate/runValidateSession through handleBuildStep; validation-checks.test.ts covers resolveTaskTestFiles, the three check-plan builders and runValidationChecks with the default runInProcessGroup; cli-subprocess.test.ts reaches runInProcessGroup through CliProvider.runSubprocess. No not-exercised breach is reported, because an empty edge set is not evidence of missing tests. Some files in the changed set (config-catalog.ts, workflow/review/template.ts, code-review-rpc.ts, server.ts, review-step/phases/start.ts) were touched by an unrelated merged commit, 'triple every review time limit', so they are outside this Story's coverage scope. |

## quality — 7 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/mcp/build-step/validation-checks.ts:156 | trivialCheckPlan takes test files from `git show --name-only HEAD` without `--diff-filter=d`, so a test file the build commit DELETED is still listed. The test runner is then given a file that no longer exists and fails, which marks a correct trivial build as testsPassed=false. Filter out deletions (e.g. `--diff-filter=d`) or skip files that don't exist on disk. |
| MED | src/mcp/build-step/validation-checks.ts:115 | resolveTaskTestFiles matches tests by base name only, so a Task naming `handler.test.ts:` runs EVERY tracked `__tests__/handler.test.ts` in the repo, including ones in unrelated modules. A failure in one of those files fails this Task's tests check, and the extra files lengthen the run under the 600 s limit. Prefer the match nearest the Task's changed files, or use a path-qualified name when one is given. |
| LOW | src/shared/process-group.ts:85 | stdout and stderr are added to in-memory strings with no size limit for the whole run (up to 600 s of test output). The only caller that needs bounded output (runOne) trims it to 4,000 chars afterwards. A very chatty or runaway test run can grow daemon memory without limit. Consider keeping only a rolling tail, or capping the buffer inside the runner. |
| LOW | src/mcp/build-step/phases/validate.ts:250 | The judge failure is classified by matching /structured_output\|JSON\|parse/i against free-text error messages. Any unrelated CLI error whose text contains 'JSON' or 'parse' (for example a config-parse failure) is reported as 'unparseable-verdict' instead of 'verdict-session-failed'. Typed errors from reviewSessionOnce would make this classification reliable. |
| LOW | src/mcp/build-step/phases/validate.ts:122 | The resolveValidateProvider doc comment and the warn text at line 136 still say this is an 'edit-session' provider and that 'edit sessions require a CLI'. Validate now runs a read-only runReviewSession judge, so the comment misdescribes the role. |
| LOW | src/mcp/build-step/__tests__/validation-checks.test.ts:1 | The test helper isAlive(pid) is written out again in three test files (validation-checks.test.ts, cli-subprocess.test.ts, cli-subprocess.live.test.ts). It is small test-only duplication; a shared test util would keep the liveness probe consistent. |
| LOW | src/mcp/build-step/__tests__/build-start.test.ts:1 | The judgeVerdict fixture builder and the git(...) helper are duplicated between build-start.test.ts and build-step.test.ts. This is test-only duplication of the canned judge verdict shape, so a future change to JUDGE_VERDICT_SCHEMA has to be made in two places. |


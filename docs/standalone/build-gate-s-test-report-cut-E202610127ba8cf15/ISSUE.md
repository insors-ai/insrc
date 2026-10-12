<!-- insrc:artifact ISSUE-7ba8cf154db36204 -->

# The build gate's test report is cut short, so passing tests are recorded as not found

## Reproduction

From the repo root, run the gate's exact test command against a file with many tests: `npx tsx --test --test-force-exit --test-reporter=tap vscode-plugin/src/chat/__tests__/render-registry.test.ts`. Repeat it a few times. Observed: the TAP summary reports 28 to 67 of the file's 68 tests, a different number each run, and the run still exits 0. Expected: all 68 tests are reported every run. Effect on a build: during validate, a test case mapped to the Task that falls after the cut is recorded 'not found', and the Task fails even though its test passes. This happened to ISSUE-6a811b8a S001/t7 for the case "approval renderer: with position/total and total > 1 the card shows '1 of 3'; without them it renders exactly as before". Without --test-force-exit, or with the file run in the same process, all 68 are reported every time on Node 22.22.1 and Node 24.21.0.

## Root cause

TEST_RUNNER_ARGV is `npx tsx --test --test-force-exit` (validation-checks.ts:34), and the gate runs it once per file with `--test-reporter=tap` and the file appended (validation-checks.ts:346). With `--test`, Node runs each test file in a child process and the parent re-reports the TAP stream the child writes to a pipe. `--test-force-exit` (added for ISSUE-b544025d, so a file that keeps its process alive still ends) makes the child exit as soon as its tests finish, before all of its piped output has been flushed. The parent therefore sees a truncated stream, summarises only the tests it received, and the gate's per-title reader (parseTapRun / resultOfTitle) cannot find the missing titles. The cut depends on timing, which is why the count varies from run to run.

## Fix intent

Run each gate test file in the gate's own process instead of in a child, so the whole report is read before the process exits, while keeping force-exit so a file that would stay alive still ends (ISSUE-b544025d). This must work on the Node version the daemon is pinned to (22.22.1): `--test-isolation=none` is not an accepted option there. A failing test must still make the command exit non-zero. Add a regression test that pins the runner command and checks a many-test file is reported in full.

## Citations

- **[[c1]]** `code` `src/mcp/build-step/validation-checks.ts` — "export const TEST_RUNNER_ARGV: readonly string[] = ['npx', 'tsx', '--test', '--test-force-exit'];"
- **[[c2]]** `code` `src/mcp/build-step/validation-checks.ts` — "const argv = [...plan.testCommand, TAP_REPORTER_ARG, file];"
- **[[c3]]** `code` `src/mcp/build-step/__tests__/validation-checks.test.ts` — "assert.deepEqual(planDriven.testCommand, TEST_RUNNER_ARGV);"
- **[[c4]]** `code` `vscode-plugin/src/chat/__tests__/render-registry.test.ts`
- **[[c5]]** `prior-artifact` `docs/standalone/bug-vs-code-dev-chat-approvals-E202610046a811b8a/S001/TESTS.md` — "not found: 'approval renderer: with position/total and total > 1 the card shows '1 of 3'; without them it renders exactly as before'"

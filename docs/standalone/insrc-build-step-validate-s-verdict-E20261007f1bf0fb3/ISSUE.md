<!-- insrc:artifact ISSUE-f1bf0fb3085c629c -->

# Build validate's verdict session cannot reliably run the tests it judges, and leaves orphaned test processes behind

## Reproduction

Call `insrc_build_step({ phase: 'validate', target: 's1/t1', epicHash: '2ff0dfdadb1c8d1c' })` in this repo. (a) With the repo's `.claude/settings.local.json` allowing only `Read(...)`, the verdict comes back `passed: false` twice in a row with the evidence '`npx tsc --noEmit` was declined at the permission prompt' — the session never ran the typecheck or tests. (b) After allow-listing `Bash(npx tsc:*)` and `Bash(npx tsx --test:*)`, the call fails instead with `claude exited with -9` once the session's time cap is reached, because the full sweep it runs does not finish in time. (c) About 80 minutes later the sweep that session launched (`npm exec tsx --test src/**/__tests__/*.test.ts`, re-parented to the user's systemd) was still running and holding resources that made other test runs hang until it was killed by hand. Expected: validate runs the task's checks within its time budget, reports a real verdict, and leaves no processes behind.

## Root cause

Three code sites combine. (1) runValidateSession in src/mcp/build-step/phases/validate.ts runs the verdict through CliProvider.runEditSession, and runEditSession in src/agent/providers/cli-provider.ts launches claude with `--print --output-format json --permission-mode acceptEdits`; that mode auto-accepts file edits but not shell commands, and a non-interactive print session declines any command that the repo's own Claude settings do not allow-list, so the test and typecheck commands validate depends on are refused unless each repo happens to pre-authorise them. (2) The rendered validate prompt always asks for the repository-wide test sweep (`npx tsx --test 'src/**/__tests__/*.test.ts'`) in addition to the task's named tests, inside the provider's per-session time cap; in this repo that sweep runs for well over the cap, so the session is killed before it can emit a verdict. (3) runSubprocess in cli-provider.ts spawns the CLI as an ordinary child and, on timeout, calls `child.kill('SIGKILL')` on that one process only; commands the CLI started are not in a group that gets signalled, so they are orphaned and keep running after the verdict call has already failed.

## Fix intent

Make the validate verdict session able to run exactly the checks it is asked to judge without depending on per-repo permission setup and without widening what other CLI sessions may do; bound validate's test work so a verdict is produced within its time budget while still covering the task's tests and the typecheck; and make a timed-out CLI session's whole process tree stop, so no test process outlives the call. Other CliProvider sessions (one-shot completions, the read-only reviewer session) keep their current permissions and behaviour.

## Citations

- **[[c1]]** `code` `src/agent/providers/cli-provider.ts` — "const args = ['--print', '--output-format', 'json', '--permission-mode', 'acceptEdits', ...this.modelArgs()];"
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts` — "const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);"
- **[[c3]]** `code` `src/mcp/build-step/phases/validate.ts` — "const response = await provider.runEditSession(prompt, { cwd: repoPath });"
- **[[c4]]** `code` `src/mcp/build-step/render.ts` — "const TEST_CMD      = `npx tsx --test 'src/**/__tests__/*.test.ts'`;"
- **[[c5]]** `analyze-bundle` `insrc_analyze_step: validate verdict session (runValidateSession d78b9f97bfb68c9aa83f6f17a2514b8e, resolveValidateProvider a52c65c150f21b7b39454500314a8ec6, CliProvider.runEditSession bff4dfc742feabe996e6e2d4f53da48c, runSubprocess eab7803ac8623b05780b674f3acec600; validate.ts:155 the only non-test caller)`
- **[[c6]]** `step-output` `Observed: two validate verdicts failing on 'declined at the permission prompt'; a third call failing 'claude exited with -9'; the orphaned `npm exec tsx --test` tree (parent systemd --user) running ~80 minutes until killed.`

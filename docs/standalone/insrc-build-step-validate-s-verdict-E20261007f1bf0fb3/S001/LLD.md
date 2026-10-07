<!-- insrc:artifact LLD-f1bf0fb3085c629c-s1 -->

# LLD: E20261007f1bf0fb3:S001

## Summary

**Epic:** `insrc-build-step-validate-s-verdict`
**HLD base run:** `wf-1791382104075-4akr8i`
**HLD effective hash:** `fb672e7482d6...`

Build validate stops asking a model to run the tests. The daemon itself runs the typecheck and the Task's own test files, each in its own process group with a time limit, and records their exit codes as facts. A read-only reviewer session then judges the acceptance checks and scope against that evidence, and the verdict passes only when the model's judgement and the daemon's exit codes both say so. Every CLI subprocess is also started in its own process group, so a session or command that times out is stopped together with everything it launched.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `runValidateSession`

```typescript
async function runValidateSession(repoPath: string, prompt: string, ident: { readonly epicHash: string; readonly storyId: string; readonly taskId: string; readonly standalone?: { readonly sizeClass?: string; readonly triageRationale?: string } | undefined }, summary?: string, checks?: ValidationCheckPlan): Promise<BuildStepDone | BuildStepError>
```

**Parameters:**
- `repoPath: string` — The reviewed repository; working directory of every check and of the judge session.
- `prompt: string` — The rendered validate prompt; the check results are appended as an evidence section before the session runs.
- `ident: { epicHash; storyId; taskId; standalone? }` — The BUILD ledger identity, unchanged.
- `summary: string` _(optional)_ — The implementer's narrative, unchanged.
- `checks: ValidationCheckPlan` _(optional)_ — The typecheck and the resolved test files to run; the plan-driven and standalone branches each build one.

**Returns:** `Promise<BuildStepDone | BuildStepError>` — done with the verdict: the six existing fields { taskId, passed, testsPassed, typecheckClean, scopeRespected, reason } plus the additive checks[] and evidence { typecheck, tests }. testsPassed and typecheckClean are set from the daemon's own check results, and passed is true only when the judge's passed and both check results are true. error only for an unusable judge response.

**Errors:**
- `BuildStepError('unparseable-verdict')` when The judge's returned object fails runValidateSession's own check against the verdict schema (for example `passed` missing or not a boolean, `checks` not an array), or runReviewSession throws because the CLI returned no structured output or unparseable JSON. runReviewSession itself does not validate the shape, so validate does.
- `BuildStepError('verdict-session-timeout')` when runReviewSession throws ReviewSessionTimeoutError; no verdict is recorded.
- `BuildStepError('verdict-session-failed')` when runReviewSession throws any other error (a non-transient CLI failure such as an unknown option or a rate limit); the message carries the CLI error. Never an unhandled rejection.

**Preconditions:**
- repoPath is the registered, reviewed repository (not the daemon's install).

**Postconditions:**
- The typecheck and every resolved test file were run by the daemon before the judge session started.
- verdict.testsPassed and verdict.typecheckClean equal the daemon's check results, whatever the session said.
- passed === (judge passed && testsPassed && typecheckClean).
- No process started by a check or by the session is alive when the call returns.
- Every error thrown by runReviewSession is caught and mapped to one of the three named BuildStepErrors.
- The checks run through the check-runner override when one is installed (_setBuildValidateCheckRunnerForTests), else through runValidationChecks.

### 2.2 `ValidateProvider`

```typescript
interface ValidateProvider { runReviewSession<T>(prompt: string, schema: StructuredSchema, opts: ReviewSessionOpts): Promise<T> }
```

**Parameters:**
- `prompt: string` — Validate prompt with the check evidence.
- `schema: StructuredSchema` — The judge's verdict schema: { taskId, passed, checks[], scopeRespected, reason }. The judge does not report testsPassed or typecheckClean; the daemon adds both from its own check results, so the returned verdict keeps all six existing fields plus checks[] and evidence.
- `opts: ReviewSessionOpts` — { cwd: repoPath, deadlineMs }.

**Returns:** `Promise<T>` — The judge's structured verdict.

**Errors:**
- `ReviewSessionTimeoutError` when The deadline passes.

**Postconditions:**
- The validate judge runs with read-only tools only (CliProvider.runReviewSession: Read, Grep, Glob and the insrc analyze tools); it can neither edit files nor run shell commands.

### 2.3 `runSubprocess`

```typescript
async function runSubprocess(command: string, args: readonly string[], stdin: string, timeoutMs: number, cwd?: string): Promise<SubprocessResult>
```

**Parameters:**
- `command: string` — The CLI binary, unchanged.
- `args: readonly string[]` — Unchanged.
- `stdin: string` — Unchanged.
- `timeoutMs: number` — Unchanged.
- `cwd: string` _(optional)_ — Unchanged.

**Returns:** `Promise<SubprocessResult>` — Unchanged shape; exitCode -9 still means the timeout fired.

**Postconditions:**
- The child runs as the leader of its own process group.
- On timeout the whole group is sent SIGKILL, not only the direct child, and the result reports exitCode -9.
- On the child's 'exit' event (not 'close'), any process still in its group is sent SIGKILL, ignoring ESRCH. Node fires 'close' only after every stdio pipe closes, and a leftover background process holds those pipes open, so sweeping on 'exit' is what lets 'close' then fire and resolve with the child's real exit code instead of waiting for the timer.

### 2.4 `runValidationChecks`

```typescript
async function runValidationChecks(repoPath: string, plan: ValidationCheckPlan, deps?: CheckRunnerDeps): Promise<ValidationCheckResults>
```

**Parameters:**
- `repoPath: string` — Working directory of every command.
- `plan: ValidationCheckPlan` — The typecheck command, the test files and any test names that did not resolve to a file.
- `deps: CheckRunnerDeps` _(optional)_ — Test seam for spawning commands.

**Returns:** `Promise<ValidationCheckResults>` — { typecheck: CheckResult; tests: CheckResult } where CheckResult is { ok, command, exitCode, timedOut, durationMs, outputTail, note? }; tests.ok is false when any named test is unresolved.

**Preconditions:**
- Commands run serially, never in parallel.

**Postconditions:**
- Each command runs in its own process group under its own time limit and is stopped with its whole group on timeout.
- Like runSubprocess, the group is swept on each command's 'exit' event so a background process it left behind cannot hold its pipes open and turn a finished command into a timeout.
- The test runner is invoked with --test-force-exit, so a test file whose process would otherwise stay alive after its tests finish still exits.
- Never throws; a spawn failure is a failed CheckResult.

### 2.5 `_setBuildValidateCheckRunnerForTests`

```typescript
function _setBuildValidateCheckRunnerForTests(runner: ((repoPath: string, plan: ValidationCheckPlan) => Promise<ValidationCheckResults>) | undefined): void
```

**Parameters:**
- `runner: ((repoPath: string, plan: ValidationCheckPlan) => Promise<ValidationCheckResults>) | undefined` — A fake check runner for tests; undefined restores runValidationChecks.

**Returns:** `void` — Installs or clears the override.

**Preconditions:**
- Test-only seam, exported from src/mcp/build-step/phases/validate.ts beside _setBuildValidateProviderForTests.

**Postconditions:**
- While set, runValidateSession calls this runner instead of runValidationChecks, so no test spawns a real typecheck or test runner.
- The plan it receives is the one validate built, so tests can assert which test files and typecheck were chosen.

### 2.6 `resolveTaskTestFiles`

```typescript
function resolveTaskTestFiles(repoPath: string, testNames: readonly string[]): { readonly files: readonly string[]; readonly unresolved: readonly string[] }
```

**Parameters:**
- `repoPath: string` — Repository whose tracked files are searched.
- `testNames: readonly string[]` — PlanTask.tests[].name values ('notice.test.ts: ...') or test names from a standalone LLD's test strategy.

**Returns:** `{ files; unresolved }` — Repo-relative test files named by the inputs, sorted and de-duplicated, and the names that could not be mapped to a file.

**Postconditions:**
- Only a LEADING '<base>.test.ts:' prefix names a test file (the convention plans use, e.g. "notice.test.ts: 'makeNotice sorts ...'"); the file is every tracked file with that base name under a __tests__ directory.
- A '*.test.ts' token anywhere else in a name (e.g. '(mirrors chain.test.ts ...)') is NOT treated as the file under test.
- A name with no leading prefix, or whose prefix matches no tracked file, is listed in unresolved, which fails the verdict with a note naming it. Plans written before the prefix convention therefore fail validate with that note until the plan names its test files or the user records an override.

### 2.7 `renderValidatePrompt`

```typescript
function renderValidatePrompt(repoPath: string, ref: ResolvedTask): string
```

**Parameters:**
- `repoPath: string` — Unchanged.
- `ref: ResolvedTask` — Unchanged.

**Returns:** `string` — The judge prompt: inspect the change, judge each acceptance check and scope against the repository and the daemon's check evidence. It no longer tells the session to run any command.

**Postconditions:**
- The prompt contains no instruction to run the repo-wide sweep or any shell command.

### 2.8 `renderStandaloneValidatePrompt`

```typescript
function renderStandaloneValidatePrompt(spec: StandaloneValidateSpec): string
```

**Parameters:**
- `spec: StandaloneValidateSpec` — Unchanged.

**Returns:** `string` — Same judge-only prompt for a standalone build.

**Postconditions:**
- Same as renderValidatePrompt.

## 3. Data model changes

### 3.1 `ValidationCheckPlan / ValidationCheckResults` — new

ValidationCheckPlan { typecheck: string[] (argv); testFiles: string[]; unresolvedTests: string[]; typecheckTimeoutMs; testTimeoutMs }. ValidationCheckResults { typecheck: CheckResult; tests: CheckResult }. Plan-driven: testFiles from resolveTaskTestFiles(ref.task.tests names). Small standalone: from the LLD's test strategy names. Trivial standalone (no LLD): the *.test.ts files the build commit touched, possibly none, in which case tests is ok with note 'no tests named'.

**Call sites:**
- `src/mcp/build-step/phases/validate.ts`

### 3.2 `ValidateProvider` — field-modify

runEditSession(prompt, { cwd, timeoutMs }) is replaced by runReviewSession<T>(prompt, schema, { cwd, deadlineMs }); resolveValidateProvider still returns a CliProvider, which already implements runReviewSession. Every test that installs a validate provider through _setBuildValidateProviderForTests (build-step.test.ts and build-start.test.ts, whose validate() helper fakes runEditSession at :122, :381 and :451) switches to a fake runReviewSession and also installs a passing check runner through _setBuildValidateCheckRunnerForTests, so no test spawns a real typecheck or test runner in its fixture repo.

**Call sites:**
- `src/mcp/build-step/phases/validate.ts`
- `src/mcp/build-step/__tests__/build-step.test.ts`
- `src/mcp/build-step/__tests__/build-start.test.ts`

### 3.3 `Build verdict (testsPassed / typecheckClean)` — invariant-change

The returned verdict keeps its six existing fields { taskId, passed, testsPassed, typecheckClean, scopeRespected, reason } and gains two additive fields: checks[] (the judge's per-acceptance-check results { check, satisfied, evidence }, as the prompts already ask for) and evidence: { typecheck: CheckResult; tests: CheckResult } (the daemon's commands, exit codes, timedOut flags and output tails). testsPassed and typecheckClean now come from evidence, and passed = judge passed && testsPassed && typecheckClean. The BUILD record still persists only tasks[].passed, which follows the combined passed.

**Call sites:**
- `src/mcp/build-step/phases/validate.ts`

## 4. Error paths

**Error cases**

- **The typecheck or the test runner exceeds its time limit.** (recoverable)
  - Detection: runValidationChecks' timer fires before the child exits; the child's process group is sent SIGKILL and the result is recorded timedOut: true.
  - Response: That CheckResult is ok: false with a note naming the limit; the judge still runs on the evidence, and passed is false.
  - User impact: A real verdict ('tests timed out after N s') instead of an error, and no test process left running.
- **A named test does not resolve to any tracked test file.** (recoverable)
  - Detection: resolveTaskTestFiles finds no leading '<base>.test.ts:' prefix in the name, or no tracked file under a __tests__ directory with that base name.
  - Response: The name is listed in unresolvedTests; tests.ok is false with a note listing each unresolved name; the resolved files still run.
  - User impact: The verdict fails and says which planned test is missing, rather than passing on fewer tests than planned.
- **A check command cannot be spawned (npx missing, cwd gone).** (recoverable)
  - Detection: The child emits 'error' before 'close', or exits -1.
  - Response: CheckResult ok: false with the spawn error in outputTail; runValidationChecks never throws.
  - User impact: Validate fails with the environment error visible in the verdict.
- **The judge session passes its deadline.** (recoverable)
  - Detection: runReviewSession throws ReviewSessionTimeoutError (it maps the subprocess's -9 exit to that error).
  - Response: runValidateSession returns BuildStepError('verdict-session-timeout'); no BUILD record is written; the session's process group has already been killed by runSubprocess.
  - User impact: A clear timeout error naming the deadline, no orphaned processes.
- **The judge returns no object matching the verdict schema.** (recoverable)
  - Detection: runValidateSession checks the returned object itself (boolean passed, array checks, string reason); runReviewSession throws for missing structured output or unparseable JSON.
  - Response: BuildStepError('unparseable-verdict') naming the field that failed or the CLI error.
  - User impact: Unchanged from today's behaviour for a malformed verdict.
- **A process in a CLI child's group is still running after the child exits normally.** (recoverable)
  - Detection: The child's 'exit' event fires; runSubprocess and runValidationChecks then signal the negative pid without waiting for 'close'.
  - Response: The group is sent SIGKILL (ESRCH ignored); the inherited pipes close, 'close' fires, and the call resolves with the child's real exit code.
  - User impact: No background process outlives any CLI call.
- **The judge session fails for a reason other than a timeout (unknown CLI option, rate limit, auth).** (recoverable)
  - Detection: runReviewSession throws an Error that is not a ReviewSessionTimeoutError.
  - Response: BuildStepError('verdict-session-failed') with the CLI message; no BUILD record is written.
  - User impact: A named error instead of an unhandled rejection.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A plan task whose tests all name one file, e.g. three cases in 'graph.test.ts'. | One test file runs once; the three names map to it. |
| A test base name that exists under two __tests__ directories (e.g. driver-unit.test.ts in analyze/context and analyze/planner). | Both files run; running more of the named file's tests is safe and keeps accuracy. |
| A trivial standalone build with no LLD whose commit touched no test file. | Only the typecheck runs; tests is ok with note 'no tests named for a trivial build'; the judge still judges scope. |
| A small standalone build whose LLD test strategy names no '*.test.ts' file. | tests is ok: false with note 'the LLD names no test file'; the verdict fails. |
| A test file whose process stays alive after its tests pass (the ISSUE-b544025d logger worker). | --test-force-exit ends it when the tests finish; the run is not counted as a timeout. |
| The judge session says passed: true but the daemon's typecheck failed. | passed is false; typecheckClean is false; the reason records the daemon's result. |
| The judge says testsPassed: false but every daemon check passed. | verdict.testsPassed is overwritten to true; passed follows the judge's own passed field and the checks. |
| A plan test name such as "WorkflowChainReaderTest... (mirrors chain.test.ts hldEffectiveHash)" whose only '*.test.ts' token is not a leading prefix. | The name is unresolved; chain.test.ts is not run; the verdict fails with a note naming the test. |
| A CLI child that exits 0 but leaves a background process holding its stdout. | The exit-time sweep kills the background process; the call resolves with exit code 0, not -9. |
| A command the claude CLI's own Bash tool starts in a new session or process group (setsid), outside the CLI's group. | Group teardown cannot reach it. Validate no longer gives its session a shell, so validate cannot leave one; for other sessions the live test shows whether the CLI keeps its Bash children in its group, and this limit is stated rather than assumed. |

**Invariants to preserve**

- runEditSession keeps its arguments ['--print','--output-format','json','--permission-mode','acceptEdits', ...modelArgs] for claude and ['exec','--json','--full-auto', ...] for codex; complete and completeStructured keep theirs. [[c4]]
- The reviewer session stays read-only: --tools Read,Grep,Glob plus the two insrc analyze tools, no permission mode. [[c1]]
- A timed-out CLI call still reports exitCode -9, which runReviewSession maps to ReviewSessionTimeoutError. [[c2]]
- The verdict's six existing fields { taskId, passed, testsPassed, typecheckClean, scopeRespected, reason } are preserved; checks[] and evidence { typecheck, tests } are additive. The BUILD record persist path (fail-open, keyed by epicHash/storyId/taskId, tasks[].passed only) is unchanged; only how testsPassed, typecheckClean and passed are decided changes. [[c1]]
- The implement prompt keeps citing the repo-wide sweep as the implementer's definition of done; only the validate prompts change. [[c3]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run via npx tsx --test (the convention of src/agent/providers/__tests__/cli-review-session.test.ts and src/mcp/build-step/__tests__/build-step.test.ts)`

**Test levels**

- **unit** — Prove test-name resolution and the check plan for each build route without spawning anything.
  - Subjects: `validation-checks.test.ts: 'resolveTaskTestFiles maps plan test names to tracked __tests__ files, de-duplicates, and lists names with no match as unresolved'`, `validation-checks.test.ts: 'a base name under two __tests__ directories resolves to both files'`, `validation-checks.test.ts: 'the plan-driven, small and trivial routes each build the expected check plan'`, `validation-checks.test.ts: 'a test name whose only *.test.ts token is not a leading prefix is unresolved, and the file it mentions is not run'`
  - Fixtures: `A temporary git repository with tracked __tests__ files, including two files sharing a base name`
- **integration** — Prove the daemon-side check runner against real child processes: exit codes, timeouts, process-group teardown and force-exit.
  - Subjects: `validation-checks.test.ts: 'a passing and a failing command give ok true and ok false with their exit codes and output tails'`, `validation-checks.test.ts: 'a command past its limit is reported timedOut and its whole process group, grandchild included, is gone'`, `validation-checks.test.ts: 'a test file that keeps its process alive after its tests pass still finishes under --test-force-exit'`, `validation-checks.test.ts: 'an unresolved test name makes tests fail with a note naming it'`, `cli-subprocess.test.ts: 'a timed-out CLI child is killed with its process group, so a grandchild it started is gone'`, `cli-subprocess.test.ts: 'a CLI child that exits 0 leaving a background process holding its pipes resolves with exit code 0 and the background process is gone'`
  - Fixtures: `A fake bin script that starts a long-running grandchild (sleep) and records its pid`, `A tiny test file whose process stays alive after its test passes (an un-unref'd timer)`
- **unit** — Prove validate's verdict logic over a fake judge and fake check results.
  - Subjects: `build-step.test.ts: 'validate runs the checks before the judge and overwrites testsPassed and typecheckClean from the daemon results'`, `build-step.test.ts: 'a judge passed:true with a failing typecheck gives passed:false'`, `build-step.test.ts: 'a judge timeout returns verdict-session-timeout and writes no BUILD record'`, `build-step.test.ts: 'the validate judge is called through runReviewSession with the repo as cwd and a verdict schema'`, `render.test.ts: 'the validate prompts no longer instruct running the repo-wide sweep or any shell command, and the implement prompt still cites it'`, `build-step.test.ts: 'a judge object without a boolean passed gives unparseable-verdict'`, `build-step.test.ts: 'a non-timeout judge error gives verdict-session-failed and writes no BUILD record'`
  - Fixtures: `The existing fixture repo with _setBuildValidateProviderForTests (a fake runReviewSession provider) and _setBuildValidateCheckRunnerForTests (a fake check runner returning chosen results)`
- **contract** — Pin that other CLI sessions keep their arguments.
  - Subjects: `cli-review-session.test.ts: 'one-shot calls and the edit session build the same arguments as before' (existing, must stay green)`, `cli-review-session.test.ts: reviewer no-edit args assertion at :79 (existing, must stay green)`
- **live** — Show on a real claude CLI that process-group teardown reaches a command its own Bash tool backgrounds. Gated INSRC_LIVE_TESTS=1, like the other CliProvider live suites.
  - Subjects: `cli-subprocess.live.test.ts: 'a command a real claude session backgrounds through its Bash tool is gone once the timed-out session is killed'`
  - Fixtures: `A temporary repo and a prompt asking claude to background a long sleep and write its pid to a file`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `build-step.test.ts: 'validate runs the checks before the judge and overwrites testsPassed and typecheckClean from the daemon results'`, `build-step.test.ts: 'the validate judge is called through runReviewSession with the repo as cwd and a verdict schema'` |
| `ac2` | `validation-checks.test.ts: 'a command past its limit is reported timedOut and its whole process group, grandchild included, is gone'`, `validation-checks.test.ts: 'a test file that keeps its process alive after its tests pass still finishes under --test-force-exit'`, `render.test.ts: 'the validate prompts no longer instruct running the repo-wide sweep or any shell command, and the implement prompt still cites it'` |
| `ac3` | `cli-subprocess.test.ts: 'a timed-out CLI child is killed with its process group, so a grandchild it started is gone'`, `cli-subprocess.test.ts: 'a CLI child that exits 0 leaving a background process holding its pipes resolves with exit code 0 and the background process is gone'`, `cli-subprocess.live.test.ts: 'a command a real claude session backgrounds through its Bash tool is gone once the timed-out session is killed'` |
| `ac4` | `cli-review-session.test.ts: 'one-shot calls and the edit session build the same arguments as before'` |
| `ac5` | `build-step.test.ts: 'a judge passed:true with a failing typecheck gives passed:false'`, `validation-checks.test.ts: 'an unresolved test name makes tests fail with a note naming it'`, `build-step.test.ts: 'a judge object without a boolean passed gives unparseable-verdict'`, `validation-checks.test.ts: 'a test name whose only *.test.ts token is not a leading prefix is unresolved, and the file it mentions is not run'` |

## 6. Migration

**State before:** Validate runs one CliProvider.runEditSession call (claude --permission-mode acceptEdits, or codex --full-auto) in the repo and asks that session to run the task's tests, the repo-wide sweep and the typecheck itself; testsPassed, typecheckClean and passed are whatever the session reports (validate.ts:155, render.ts:28-29, validate-task.md). Every CLI child is spawned as an ordinary child and only it is SIGKILLed on timeout (cli-provider.ts:598), so commands it launched survive.

**State after:** Validate first runs the typecheck and the task's own test files as daemon-owned commands (own process group, per-command limit, --test-force-exit), then asks a read-only reviewer session (CliProvider.runReviewSession) to judge acceptance checks and scope against that evidence. testsPassed and typecheckClean are the daemon's exit-code facts and passed requires both plus the judge's pass. Every CLI child runs in its own process group, which is killed on timeout and swept after exit.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Start every CLI child as its own process-group leader; on timeout signal the group; on the child's 'exit' event signal any process still in the group (before 'close'). No caller-visible change in results. — ↩ rollbackable
2. Add the daemon-side check runner and test-file resolution beside the build-step validate phase, unused at first. — ↩ rollbackable
3. Rewrite the two validate prompts as judge-only (evidence section, no instruction to run commands); leave the implement prompts unchanged. — ↩ rollbackable
4. Switch validate to run the checks, then call runReviewSession with the verdict schema, and overwrite testsPassed / typecheckClean and combine passed; replace the ValidateProvider seam and update the validate tests' fakes. Update the validate fakes in build-step.test.ts and build-start.test.ts to runReviewSession with a passing check runner. — ↩ rollbackable

**Backward compat:** The insrc_build_step validate input and output shapes are unchanged: every existing verdict field still comes back, with checks[] and evidence added, and the same BUILD record is written. Behaviour changes for callers: a validate that used to fail on a refused command now runs the checks; a task whose planned test names match no file now fails with that reason. runEditSession, complete, completeStructured and runReviewSession keep their arguments. The repo-local .claude/settings.local.json allowlist added as a workaround is no longer needed and can be removed by the user. Plans written before the '<base>.test.ts:' naming convention fail validate with a note naming the unmapped tests until revised or overridden.

## 7. Alternatives considered

### 7.1 a1: Dedicated verdict session with a per-call command allowlist

Add a CliProvider verdict-session call that grants only reads plus the exact shell commands validate names, bound validate to the task's test files and the typecheck, and stop the whole process group on timeout.

CliProvider gains runVerdictSession(prompt, { cwd, allowedCommands, timeoutMs }): for claude it passes --tools Read,Grep,Glob,Bash and --allowedTools with Read/Grep/Glob plus one Bash(<prefix>:*) entry per allowed command prefix, and no edit permission mode, so the session can read and run exactly those commands and nothing else; codex keeps its sandboxed exec. validate.ts calls runVerdictSession instead of runEditSession and passes the commands it renders (the typecheck, the test runner over the task's named test files, and read-only git inspection). The validate prompt names the task's own test files and the typecheck as the required checks and no longer asks for the repo-wide sweep. runSubprocess spawns every CLI child in its own process group and, on timeout, signals the group, then also signals it after a normal exit, so no command a session launched outlives the call. runEditSession, complete, completeStructured and runReviewSession keep their arguments.

**Rejected because:** A sound, cheaper design that fixes all three causes, but the verdict's test and typecheck results stay model-reported and the time budget is only as good as the session's choices.

### 7.2 a2: Widen runEditSession with an optional command allowlist

Keep validate on runEditSession but let callers pass allowedCommands, added as --allowedTools on top of acceptEdits.

EditSessionOpts gains allowedCommands?: readonly string[]; when present, runEditSession appends --allowedTools Bash(<prefix>:*) entries to its existing acceptEdits arguments. validate passes its commands; other callers pass nothing and keep today's arguments. The validate prompt drops the repo-wide sweep as in a1, and runSubprocess gets the same process-group teardown.

**Rejected because:** Cheapest real fix but leaves the validator able to edit the code under judgement.

### 7.3 a3: Bypass permissions for the validate session

Run the validate session with a bypass-permissions mode so every command is allowed.

validate calls a variant of runEditSession that passes --permission-mode bypassPermissions (and codex --full-auto as today). The prompt drops the sweep and runSubprocess kills the process group, as in a1.

**Rejected because:** Violates the no-widening constraint outright.

### 7.4 a4: Daemon runs the checks; the session only judges — **CHOSEN**

The daemon itself runs the typecheck and the task's test files under a process-group timeout and hands the results to a read-only judging session.

Before the session, validate.ts runs the typecheck and the test runner over the task's named test files as daemon-owned subprocesses (own process group, bounded timeout), captures their exit codes and output tails, and renders them into the prompt as evidence; the verdict session is the existing read-only reviewer session (Read/Grep/Glob only) that judges acceptance checks and scope against that evidence. testsPassed and typecheckClean come from the daemon's exit codes, not from the model.

## 8. References

- **[[c1]]** `analyze-bundle` `design.story/s1 symbol.locate: validate verdict session and CLI sessions (src/mcp/build-step/phases/validate.ts, src/agent/providers/cli-provider.ts)` — "calls provider.runEditSession(prompt, { cwd: repoPath }) at :155 with no timeoutMs"
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts:598 (spawnOnce)` — "const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);"
- **[[c3]]** `code` `src/mcp/build-step/render.ts:28-29` — "const TEST_CMD      = `npx tsx --test 'src/**/__tests__/*.test.ts'`;"
- **[[c4]]** `code` `src/agent/providers/__tests__/cli-review-session.test.ts:209` — "assert.deepEqual(edit, ['--print', '--output-format', 'json', '--permission-mode', 'acceptEdits', '--model', 'opus']);"
- **[[c5]]** `prior-artifact` `ISSUE-f1bf0fb3085c629c (approved 2026-10-07)` — "Make the validate verdict session able to run exactly the checks it is asked to judge without depending on per-repo permission setup and without widening what other CLI sessions may do"
- **[[c6]]** `convention` `CLAUDE.md project principles` — "Accuracy is primary; cost is the least priority."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 7 hold** · template `design-issue` · model `cli-claude:opus` · reviewed 2026-10-07T14:20:49.903Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._

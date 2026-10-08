<!-- insrc:artifact PLAN-f1bf0fb3085c629c-s1 -->

# Plan: E20261007f1bf0fb3:S001

## Summary

**Epic:** `insrc-build-step-validate-s-verdict`
**LLD run:** `wf-1791382104075-4akr8i`
**LLD effective hash:** `fb672e7482d6...`

Building this fix means four pieces of work, in order. First one shared helper spawns any command in its own process group and tears the group down on timeout and on exit, and every CLI call moves onto it. Then a daemon-side check runner uses that helper to run the typecheck and the task's own test files. The validate prompts become judge-only. Last, validate itself is rewired to run the checks first and let a read-only session judge the rest.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Process-group spawn helper, used by every CLI child | M | — | integration: cli-subprocess.test.ts: 'a timed-out CLI child is killed with its process group, so a grandchild it started is gone'; integration: cli-subprocess.test.ts: 'a CLI child that exits 0 leaving a background process holding its pipes resolves with exit code 0 and the background process is gone'; live: cli-subprocess.live.test.ts: 'a command a real claude session backgrounds through its Bash tool is gone once the timed-out session is killed'; unit: cli-review-session.test.ts: 'one-shot calls and the edit session build the same arguments as before'; unit: cli-review-session.test.ts: reviewer no-edit args assertion at :79 (existing, must stay green) | [[c1]] [[c5]] |
| 2 | **`t2`** Daemon-side check runner and test-file resolution | M | `t1` | unit: validation-checks.test.ts: 'resolveTaskTestFiles maps plan test names to tracked __tests__ files, de-duplicates, and lists names with no match as unresolved'; unit: validation-checks.test.ts: 'a base name under two __tests__ directories resolves to both files'; unit: validation-checks.test.ts: 'the plan-driven, small and trivial routes each build the expected check plan'; unit: validation-checks.test.ts: 'a test name whose only *.test.ts token is not a leading prefix is unresolved, and the file it mentions is not run'; integration: validation-checks.test.ts: 'a passing and a failing command give ok true and ok false with their exit codes and output tails'; integration: validation-checks.test.ts: 'a command past its limit is reported timedOut and its whole process group, grandchild included, is gone'; integration: validation-checks.test.ts: 'a test file that keeps its process alive after its tests pass still finishes under --test-force-exit'; integration: validation-checks.test.ts: 'an unresolved test name makes tests fail with a note naming it' | [[c2]] [[c5]] |
| 3 | **`t3`** Judge-only validate prompts with a named evidence slot | S | — | unit: render.test.ts: 'the validate prompts no longer instruct running the repo-wide sweep or any shell command, and the implement prompt still cites it'; unit: render.test.ts: 'both validate prompts place the given evidence text in an evidence section and ask for the judge verdict shape' | [[c3]] |
| 4 | **`t4`** Validate runs the checks, then a read-only judge | M | `t2`, `t3` | unit: build-step.test.ts: 'validate runs the checks before the judge and overwrites testsPassed and typecheckClean from the daemon results'; unit: build-step.test.ts: 'a judge passed:true with a failing typecheck gives passed:false'; unit: build-step.test.ts: 'a judge timeout returns verdict-session-timeout and writes no BUILD record'; unit: build-step.test.ts: 'the validate judge is called through runReviewSession with the repo as cwd and a verdict schema'; unit: build-step.test.ts: 'a judge object without a boolean passed gives unparseable-verdict'; unit: build-step.test.ts: 'a non-timeout judge error gives verdict-session-failed and writes no BUILD record'; unit: build-step.test.ts: 'plan-driven and standalone validate each hand the check runner the plan for their route' | [[c4]] [[c5]] |

### 1.1 E20261007f1bf0fb3:S001:T001 — Process-group spawn helper, used by every CLI child

Add src/shared/process-group.ts with one helper that spawns a command as its own process-group leader with piped stdio and a time limit, SIGKILLs the whole group on timeout, SIGKILLs any process left in the group on the child's 'exit' event (ESRCH ignored), and resolves on 'close' with { stdout, stderr, exitCode, timedOut, durationMs }. Switch spawnOnce in src/agent/providers/cli-provider.ts onto it, keeping its result shape and the -9 timeout code. Add cli-subprocess.test.ts over a fake bin that starts a grandchild, and a live-gated test against a real claude Bash background command.

**Acceptance checks:**
- A timed-out CLI child's grandchild is gone after the call returns, and the result's exitCode is -9.
- A CLI child that exits 0 while a background process holds its pipes resolves with exitCode 0 promptly, and the background process is gone.
- spawnOnce has no spawn or kill logic of its own; it calls the shared helper.
- complete, completeStructured, runEditSession and runReviewSession build the same argument lists as before (cli-review-session.test.ts stays green).

### 1.2 E20261007f1bf0fb3:S001:T002 — Daemon-side check runner and test-file resolution

Add src/mcp/build-step/validation-checks.ts with ValidationCheckPlan, CheckResult and ValidationCheckResults; resolveTaskTestFiles (leading '<base>.test.ts:' prefix only, every tracked __tests__ file with that base name, unresolved names listed); the per-route plan builders (plan task tests, a small standalone LLD's test-strategy names, a trivial build's HEAD-commit test files); and runValidationChecks, which runs the typecheck then the test runner with --test-force-exit over the resolved files, serially, each through the t1 process-group helper with its own limit, and never throws.

**Acceptance checks:**
- resolveTaskTestFiles maps only leading '<base>.test.ts:' prefixes to tracked __tests__ files, returns every file sharing a base name, and lists other names as unresolved.
- runValidationChecks reports ok/exitCode/timedOut/outputTail for a passing, a failing and an over-limit command, runs each through the shared process-group helper, and leaves no process of a timed-out command's group alive.
- A test file whose process stays alive after its tests pass finishes under --test-force-exit within its limit.
- An unresolved test name makes tests.ok false with a note naming it; a trivial build with no test files gives tests.ok true with a note.

### 1.3 E20261007f1bf0fb3:S001:T003 — Judge-only validate prompts with a named evidence slot

Rewrite src/prompts/build/validate-task.md and renderStandaloneValidatePrompt (src/mcp/build-step/render.ts) as judge prompts: inspect the change and judge each acceptance check and scope against the repository and the daemon's check evidence, emit { taskId, passed, checks[], scopeRespected, reason }, never run commands. The template carries an {{evidence}} placeholder and the standalone renderer an evidence argument; renderValidatePrompt takes the evidence text. The implement prompts keep citing TEST_CMD and TYPECHECK_CMD.

**Acceptance checks:**
- Neither validate prompt instructs running the repo-wide sweep, the typecheck or any shell command.
- renderValidatePrompt and renderStandaloneValidatePrompt place the evidence text they are given in an evidence section and ask for the judge verdict shape.
- renderImplementPrompt and renderStandaloneImplementPrompt still cite the repo-wide sweep and the typecheck.

### 1.4 E20261007f1bf0fb3:S001:T004 — Validate runs the checks, then a read-only judge

In src/mcp/build-step/phases/validate.ts: change ValidateProvider to runReviewSession; add _setBuildValidateCheckRunnerForTests; have handleValidate and handleStandaloneValidate build their route's check plan and pass it to runValidateSession, which runs the checks (through the override when set), renders the evidence into the prompt, calls runReviewSession with the judge schema and a deadline, validates the returned object, overwrites testsPassed / typecheckClean, sets passed = judge passed && both checks, attaches evidence, and maps ReviewSessionTimeoutError, other thrown errors and bad shapes to verdict-session-timeout, verdict-session-failed and unparseable-verdict. Migrate the validate fakes in build-step.test.ts and build-start.test.ts to runReviewSession plus a passing check runner.

**Acceptance checks:**
- The judge is called through runReviewSession with the repository as cwd and the judge verdict schema, after the checks have run, and the prompt it receives contains the check results.
- handleValidate passes the plan built from the task's tests, and handleStandaloneValidate the plan for its small or trivial route (asserted through the check-runner seam).
- verdict.testsPassed and verdict.typecheckClean equal the check results, and passed is false whenever either check fails, whatever the judge says.
- A judge timeout, any other judge error, and a judge object without a boolean passed return verdict-session-timeout, verdict-session-failed and unparseable-verdict, and write no BUILD record.
- Every existing build-step and build-start test passes with the migrated fakes and spawns no real typecheck or test runner.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| validation-checks.test.ts: 'resolveTaskTestFiles maps plan test names to tracked __tests__ files, de-duplicates, and lists names with no match as unresolved' | `t2` |
| validation-checks.test.ts: 'a base name under two __tests__ directories resolves to both files' | `t2` |
| validation-checks.test.ts: 'the plan-driven, small and trivial routes each build the expected check plan' | `t2` |
| validation-checks.test.ts: 'a test name whose only *.test.ts token is not a leading prefix is unresolved, and the file it mentions is not run' | `t2` |
| validation-checks.test.ts: 'a passing and a failing command give ok true and ok false with their exit codes and output tails' | `t2` |
| validation-checks.test.ts: 'a command past its limit is reported timedOut and its whole process group, grandchild included, is gone' | `t2` |
| validation-checks.test.ts: 'a test file that keeps its process alive after its tests pass still finishes under --test-force-exit' | `t2` |
| validation-checks.test.ts: 'an unresolved test name makes tests fail with a note naming it' | `t2` |
| cli-subprocess.test.ts: 'a timed-out CLI child is killed with its process group, so a grandchild it started is gone' | `t1` |
| cli-subprocess.test.ts: 'a CLI child that exits 0 leaving a background process holding its pipes resolves with exit code 0 and the background process is gone' | `t1` |
| build-step.test.ts: 'validate runs the checks before the judge and overwrites testsPassed and typecheckClean from the daemon results' | `t4` |
| build-step.test.ts: 'a judge passed:true with a failing typecheck gives passed:false' | `t4` |
| build-step.test.ts: 'a judge timeout returns verdict-session-timeout and writes no BUILD record' | `t4` |
| build-step.test.ts: 'the validate judge is called through runReviewSession with the repo as cwd and a verdict schema' | `t4` |
| render.test.ts: 'the validate prompts no longer instruct running the repo-wide sweep or any shell command, and the implement prompt still cites it' | `t3` |
| build-step.test.ts: 'a judge object without a boolean passed gives unparseable-verdict' | `t4` |
| build-step.test.ts: 'a non-timeout judge error gives verdict-session-failed and writes no BUILD record' | `t4` |
| cli-review-session.test.ts: 'one-shot calls and the edit session build the same arguments as before' (existing, must stay green) | `t1` |
| cli-review-session.test.ts: reviewer no-edit args assertion at :79 (existing, must stay green) | `t1` |
| cli-subprocess.live.test.ts: 'a command a real claude session backgrounds through its Bash tool is gone once the timed-out session is killed' | `t1` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 §2 runSubprocess contract (LLD-f1bf0fb3085c629c-s1)` — "On the child's 'exit' event (not 'close'), any process still in its group is sent SIGKILL, ignoring ESRCH."
- **[[c2]]** `prior-artifact` `LLD s1 §2 runValidationChecks + resolveTaskTestFiles contracts and §3 ValidationCheckPlan / ValidationCheckResults` — "Only a LEADING '<base>.test.ts:' prefix names a test file"
- **[[c3]]** `prior-artifact` `LLD s1 §2 renderValidatePrompt + renderStandaloneValidatePrompt contracts` — "The prompt contains no instruction to run the repo-wide sweep or any shell command."
- **[[c4]]** `prior-artifact` `LLD s1 §2 runValidateSession, ValidateProvider and _setBuildValidateCheckRunnerForTests contracts; §3 ValidateProvider and Build verdict changes` — "passed === (judge passed && testsPassed && typecheckClean)."
- **[[c5]]** `prior-artifact` `LLD s1 §4 error paths and §5 test strategy` — "A CLI child that exits 0 but leaves a background process holding its stdout."

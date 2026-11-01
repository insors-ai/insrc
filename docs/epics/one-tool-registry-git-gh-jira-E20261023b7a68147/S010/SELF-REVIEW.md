# Self-review of Story s10 (code), by the controller

**Not a review by the other party.** The controller wrote this code, so the rule "the party that did not write the code reviews it" is not met. The daemon's code review cannot run at this size: `insrc_code_review_step` refused (job 403.5M ms against a 12.5M ms outer allowance), and a direct diff-only run took 1.5 to 3.5 minutes per call and was stopped after about 40 calls in the first of four dimensions. By the user's decision on 2026-11-01 the controller reviews designs and code itself until the review framework works. This record stands in for the code review; the BUILD approval that follows names it as the override reason.

Date: 2026-11-01. Scope: the 65 production files and 107 test files of the commits carrying `Insrc-Story: b7a68147dcf72034/s10` (t1 to t19 and the sweep fix `a8e91b955`). Method: the task gate for each of the 19 tasks (typecheck, mapped tests, a read-only verdict), the full test sweep of 1,160 files compared with a checkout from before s10, the compiler-API scans added in t19, and a read of the highest-risk files (registry-table.ts, github-adapter.ts, approve-pipeline.ts, workflow-approve.ts, team-review-handlers.ts, tracker-setup-handlers.ts, cli/services/workflow.ts and team.ts, commit-and-push-registry.ts, ipc-client.ts).

Verdict: **warn**. No HIGH finding in s10's own code. Two MED findings are about what else sits in the s10 history and in the tests, and one is a behaviour change for callers outside the terminal that was decided in the LLD.

## Adherence (to the approved LLD and plan)

- Every one of the 19 tasks passed its gate with its named tests mapped. Nothing in the LLD is unimplemented, and the migration record (`docs/plans/tool-registry-migration-record.md`) lists all 31 wrapper rows, 11 adapter rows and 8 daemon methods; `site-list.test.ts` checks it against the code.
- The old paths are untouched: `runGit`, `runGitAsync`, `runGh`, `commitAndPushArtifacts`, the wrappers, `createGitRunner` and `_setTrackerExecForTests` are still exported, and the forbidden-spawn scan runs in report mode (`old-paths-unchanged.test.ts`).
- **MED-1 (behaviour change beyond the terminal, by design).** `workflow.approve` and `workflow.reviewDecision` share `approveFollowOn(db, true)` (`src/daemon/handler-runtime.ts`, the helper above `buildHandlerRuntime`). An approval from the MCP tool or the IDE review pane now also publishes to the tracker, commits and pushes the artifacts, and attaches the documents. The LLD says so ("workflow.approve ... gains follow-on entries") and `review-decision.test.ts` asserts the delegation, but the user should know it reaches those callers.
- **LOW-1.** The plan names `handler.test.ts`; the repo has only `handler-runtime.test.ts`. The key-set cases are there (noted in the t16 and t17 gate summaries).
- **LOW-2.** The plan said `config/github-store.ts` makes gh calls; it makes none, so nothing was moved (noted in the t13 gate summary).

## Conventions

- Imports use `.js`, `import type` where type-only; no `console.log`; no `Promise.all` on the new modules (`s10-invariants.test.ts`, k5). Strictness holds: `npx tsc --noEmit` is clean.
- Denial handling follows one rule: a `ToolDenied` is thrown through every catch-all on the call paths and is caught only at a step boundary (`src/daemon/approve-pipeline.ts`, `deniedEntry` and the three catches). Checked by `no-floating-promises.test.ts` (no dropped tracker promise in the production tree) and by the per-site denial tests.
- **LOW-3.** Test seams live in production modules: `_setRegistryTableFactoryForTests` (`src/workflow/tracker/registry-table.ts:192`) and `_setWorkflowToolDepsForTests` (`:51`). The repo does this elsewhere (`_setTrackerExecForTests`, `_setGateDepsForTests`); both go away with the old wrappers in s9.
- **LOW-4.** `run()` registers a tool on first use when the process has not (`registry-table.ts:59`). The daemon registers every builtin at start, so this only affects tests and the terminal process; it is a side effect in a helper and is commented.

## Coverage

- Each acceptance check has a named test that passes (see TESTS.md). The two scans added in t19 (`site-list`, `no-floating-promises`) would catch a missed wrapper caller or a dropped promise; the second has a positive control.
- The client path is covered end to end by fake daemons over a real socket (`cli-services-no-spawn`, `cli-services-daemon-errors`, `workflow-approve-versioning`, `tracker-setup-service`).
- Not covered by a test: a real approval over a real daemon socket with a real `gh` (the stand-in `gh` and the in-process handlers stand in). The registry rows themselves are covered against a stand-in `gh` binary.
- **MED-2 (test state).** The full sweep is not green. 25 files fail the same way on a checkout from before s10 (db, analyze, steps groups, `MCPSection`, `artifact-write-inventory`). 9 review-timeout tests fail because of an edit that is not s10's (below). And `src/daemon/__tests__/handler-runtime.test.ts` now fails its key-set case because another session added `codeReview.task.assignment` and `codeReview.task.publish` to the handler table; s10's own three cases in that file pass.

## Quality

- Small, single-purpose modules; the table keeps the old wrappers' signatures so callers changed only by `await`. The error contract is uniform (`ToolDenied`, `GhCommandError` kinds, `{ error, refusal }` over the socket so the terminal keeps its review-block and team-refusal wording; `approve-adapter` and `daemon-errors` tests).
- **LOW-5.** `followOnTasksSync` (`src/daemon/tasks-sync.ts:98`) is no longer called by production code since the pipeline does the reconciliation and the publication as separate steps; it remains only for two tests. Safe to delete with them in s9.
- **LOW-6.** `createGithubTracker` builds a table object on every call (`github-adapter.ts:81`, `tableOf`); cheap, and it is what lets a test install a table factory after the adapter exists.
- **LOW-7.** `process.cwd()` is the default repo for the adapter and the bugfix deps (`github-adapter.ts:81`, `bugfix/tracker.ts:434`), as the old exec seam ran in the process directory. The gh calls name their repo with `--repo`, so the directory does not matter for them.

## Not s10's, but in its history (for the user to decide)

- **MED-3.** Commit `7a2fef08e` (t16) swept in another session's uncommitted edit that cuts the review work unit from 10 to 5 minutes: `src/shared/review-execution-time.ts`, `src/workflow/review-pipeline/job.ts`, `src/daemon/steps/review-step/phases/start.ts` and two of its tests. It fails 9 review tests (handler.test.ts of code-review-step, budget-continuations, budget-handoff, review-cycle2, review-fixes, review.test, template-review, no-live-store-in-tests, and the review-pipeline job tests it did not update). It is not part of s10 and should be finished or reverted by whoever owns it.
- Commit `1dbfe70fd` ("commit all pending changes") holds 216 files of other work, on the user's instruction.

## Findings state

HIGH: none. MED-1 (decided in the LLD, to be confirmed by the user), MED-2 and MED-3 (outside s10's code; for the user). LOW-1 to LOW-7: accepted, no change.

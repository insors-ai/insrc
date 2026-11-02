# Self-review of the Story s9 LLD (revision 4, redrafted after the tool-registry epic), by the controller

**Not a review by the other party.** The controller authored this LLD through `insrc_workflow_step`, so the rule "the party that did not author the work reviews it" is not met. The design-review engine is unavailable (`insrc_review_step` throws `PENDING REVIEW RE-IMPLEMENTATION`) and the user decided on 2026-11-01 that the controller reviews designs itself until the framework works. Approval therefore needs an `overrideReview` naming this file and the user's explicit yes.

Date: 2026-11-02. Subject: `LLD-315d510cb28100e2-s9`. Method: each claim about code checked against the tree on 2026-11-02 (symbols, signatures, the hook and executor code), and the five open findings of the blocked review of 2026-10-23 taken one by one.

## The five findings of the blocked review

| Finding | State in this revision |
| :--- | :--- |
| ac7 shown for the Define only | `ChainReport.tracker` carries artifact id and revision for the Epic and a `stories` entry (issue, artifact id, revision) for each Story that has an issue |
| The `tracker.sync` workflow is a second GitHub-only path | Left unchanged and outside the acceptance criteria; the chain report's `sync-tracker` next action names the explicit refresh instead (error-path edge case) |
| Tests pin the old values | Obsolete as written: `GH_TIMEOUT_MS` and `runGh` are gone. The capability-set assertions in `port.test.ts` and `github-adapter.test.ts` are named in the unit level of the test strategy |
| No carrier for the warning on the tool result | `registerToolHook` rules: a rule that throws leaves the tool a success and the executor adds `hookFailures` and a line of output (`src/daemon/tools/executor.ts:65-73`) |
| The sign-in check had no timeout | Moot: `ghAuthOk` is a registry row with the tool's own limit; the refresh adds a 120-second budget and the Deadline's signal |

## Checked against the tree

- `syncTracker` is already async over the registry table and rethrows a `ToolDenied` (`src/workflow/tracker/sync.ts`); `tracker.sync` is already a daemon method that the terminal client calls (`src/daemon/tracker-setup-handlers.ts`, `src/cli/services/workflow.ts:308`).
- `registerToolHook` rules run after a tool succeeds for every caller and cannot change its success; no production rule is registered yet (`src/daemon/tools/hooks.ts`).
- `ToolDeps` carries a `signal` (`src/daemon/tools/types.ts:139`) and `workflowToolDeps(repoPath, overrides)` merges overrides, so the refresh can hand its Deadline's signal to the table. Whether every table row passes it on to the gh tool is not verified; it is listed as an open question and the plan checks it first.

## Findings

- **MED-1 (open, decide at the plan stage).** The rules run for every caller of `git_push` and `git_pull`, including the handoff park (`src/workflow/team/handoff.ts`), which pushes from a detached temporary worktree. A rule that called `refreshTrackerStatus(input.cwd)` there would read and patch artifact copies in a worktree that is deleted afterwards, and would make gh calls for nothing. The rule should act only when `input.cwd` is the registered repository root (not a linked worktree) and skip otherwise. The LLD does not say so yet.
- **LOW-1.** `git_pull` and `git_push` take `cwd` as optional (default the daemon's own directory). A rule must skip when `input.cwd` is absent, not refresh the daemon's directory.
- **LOW-2.** The pull tool reports no flag for "integrated something", so the rule refreshes after every non-dry-run success, including "already up to date". That is one extra read per Epic; acceptable.
- **LOW-3.** `int1` of the audit is ambiguous because the HLD slice lists no shared contracts; sc1 (owner s1) and sc3 (owner s4) are consumed. A `sharedContract.methodAdd` amendment for `readIssueStatus` was not authored; the nonFunctional retarget amendment was. The port change should be recorded as an amendment when the plan is approved.
- **LOW-4.** The HLD text still says "synchronous" port and "10-second timeout"; the retarget amendment covers the timeout only.
- **LOW-5.** No sequence diagram for the hook, refresh and executor flow; the contract and error paths state it in words.

## Verdict

warn. No HIGH finding. MED-1 and LOW-1 are one rule in the hook ("only for the repository root, only with a cwd") and belong in the plan's task for the hooks. The design is internally consistent with ac1 to ac8, k4 (overridden for issue creation by the user's decision of 2026-10-23) and k8.

---

# Build self-review of `BUILD-315d510cb28100e2-s9`

Date: 2026-11-02. Reviewer: the controller that wrote the code (the code-review tool is unavailable: `insrc_code_review_step` throws PENDING REVIEW RE-IMPLEMENTATION), so this is a self-review and the approval needs an override reason. Scope: the commits of this Story (trailer `Insrc-Story: 315d510cb28100e2/s9`, t1 to t7 and two follow-up commits), read against the approved LLD (revision 4) and PLAN.

## What was checked

- Every acceptance check of t1 to t7 against the code, by the build gate (all seven passed) and again by reading the diff.
- The three review points carried from the plan: the hooks act only when `input.cwd` is the registered root (`src/workflow/tracker/refresh-hooks.ts`, tested with a symlinked root, an unregistered clone, a missing cwd and a detached worktree); the signal reaches the gh call (tested with a gh that never answers); the sc1 `methodAdd` amendment is recorded, and the implemented signature matches `AMD-315d510cb28100e2-31`.
- A full sweep once, compared by test name with the tree before s9 (see the outcome section of `docs/plans/team-workflow.md`): no new failure.
- A smoke run on a real repository (`subhagho/insrc-test`): the Epic issue created at first draft, `git_pull` through the daemon refreshed `meta.tracker`.

## Findings

- **MED-1 (decide).** The label create of the draft hook is `gh_label` with `force: true`, a destructive-class call that always asks. With no connected client the draft write of a repo with no team policy and the tracker on now ends with "gh_label was denied (no-client)", and with an unanswered prompt "(timed-out)" after 5 minutes. The draft is written either way. Before s9 this reached team repos and the terminal approve only. Found by the smoke run; the fix (create labels without `force`) is outside this Story and should be triaged on its own.
- **MED-2 (accepted, decided by the user in item 3 of the s9 decisions).** The refresh runs inside the git tool's result, so a slow tracker holds `git_pull` and `git_push` for up to the 120-second budget plus one call's own limit.
- **LOW-1.** Fixed during the review: a repo whose tracker setting is none reported a "tracker disabled" warning for every Epic with a bound issue, which would have added a `hookFailures` line to every pull. It now reports nothing (test added).
- **LOW-2.** Deviation from the LLD, recorded: a refresh the Deadline stops writes nothing for that Epic and reports it skipped, instead of a partial `storyStatus`.
- **LOW-3.** Deviation, recorded: an unparseable `github.json` reads as tracker off (as the terminal approve reads it); the not-ready case is `type: github` with no target. The chain report's per-Story artifact id and revision are those of the Story's LLD.
- **LOW-4.** `registerTrackerRefreshHooks` is called in `src/daemon/index.ts` at start-up; no test starts the daemon, so the wiring is covered by the live run only (the smoke), not by a unit test.
- **LOW-5.** Skipped tests were compared by name only for `src/workflow`; in the other chunks the skips are the live and probe suites, not compared one by one. The record of the smoke test in the BUILD test record has a typo in its evidence text (`insors-test` for `insrc-test`).
- **LOW-6.** `AMD-315d510cb28100e2-31` and `-32` are still drafts; `-29` and `-30` are stale duplicates. They are approved in the amendment store at completion, with the user's yes.
- **Process.** Another session's uncommitted work briefly broke `tsc` in `src/workflow/code-review/task-review/`; t4 failed its first validate on that and passed on the rerun. No file of that session was touched.

## Verdict

warn. No HIGH finding. MED-1 is a behaviour found in use that needs its own tracked fix; MED-2 is a decision already taken. The Story meets ac1 to ac8 of the LLD as built.

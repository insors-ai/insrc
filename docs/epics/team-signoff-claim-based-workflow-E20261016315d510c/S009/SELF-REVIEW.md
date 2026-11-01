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

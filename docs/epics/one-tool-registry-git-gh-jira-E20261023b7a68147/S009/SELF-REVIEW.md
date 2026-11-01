# Self-review of the Story s9 LLD (second draft), by the controller

**Not a review by the other party.** The controller authored this LLD through `insrc_workflow_step`, so the rule "the party that did not author the work reviews it" is not met. The design-review engine is unavailable (`insrc_review_step` throws `PENDING REVIEW RE-IMPLEMENTATION`, see CLAUDE.md), and the user decided on 2026-11-01 that the controller reviews designs and code itself until the framework works. The approval of this LLD therefore needs an explicit override reason naming this document.

Date: 2026-11-01. Subject: `LLD-b7a68147dcf72034-s9` revision 2 (`docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/S009/LLD.md`). Method: each claim about code checked against the tree (symbols, signatures, tool inputs), the forbidden-spawn scan (`node scripts/forbidden-spawn-scan.mjs`, 45 sites) and the round-1 findings recorded in `docs/plans/tool-registry.md`.

## Round-1 findings of the first draft

| Finding | State in this draft |
| :--- | :--- |
| `resolveStoryRangeBase` described wrongly | Described from `range-base.ts`: the stamped sha if it still names a commit, else the commit that introduced the upstream artifact |
| Missing async inventory (`resolveCodeReviewSubject`, `readBuildStart`, `stampBuildStart`) | `readBuildStart`, `stampBuildStart` and the readers in `range-base.ts`, `story-commits.ts`, `standalone-record.ts` are listed as async. `resolveCodeReviewSubject` does not exist in the tree (grep finds no definition); the real consumers are `validate.ts`, `standalone-record.ts`, `completion-record.ts` and the code-review subject code, which the compiler finds when the producers become async |
| Corpus reader's `cat-file --batch` adapter | `git_cat_file` with the `revs` array replaces `createGitRunner` and `runGitBinary` |
| Real failure kinds | Denial reasons declined, timed-out, no-client, cancelled arrive as `ToolDenied`; no `cancelled` tool failure kind; `GitRun` has no `timedOut` (mapped from `timed-out` or the deadline signal) |
| Refresh per-call failure handling and the 10 s deadline | `Deadline` gains an `AbortSignal` and `dispose()`, each call takes `timeoutMs` from `remainingMs()`, `REFRESH_DEADLINE_MS` stays 10 s |
| A replacement table with a test per site | The data model carries one row per site; the migration record section is written in the build |

## Findings

- **MED-1 (fixed in the LLD, decision needed).** `story-commits.ts` runs `git diff-tree --root -z`, `git merge-tree --write-tree`, `git hash-object -t tree /dev/null` and `git rev-parse --git-path SQUASH_MSG`. `diff-tree` and `merge-tree` are assigned to s8 in `src/daemon/tools/builtins/git/coverage.ts` and not built; `git_hash_object` takes a path only; `git_rev_parse` has no git-path input. An optional-input extension does not cover them. The LLD now says s9 builds `git_diff_tree` and `git_merge_tree` and the two optional inputs (as s7 did for `git_config`, `git_ls_remote`, `git_update_ref`, `git_rm`), and asks the user to confirm that, or to build s8 first.
- **MED-2 (fixed in the LLD).** The first version of the contract named types that do not exist (`AnchorResult`, `RefreshResult`, `RefreshGit`) and gave `findAnchor` and `refreshPolicy` signatures that differ from `anchor-finder.ts:34` and `policy-refresh.ts:62`. Corrected to `PolicyAnchor`, `PolicyResult<PolicyRefreshOutcome>`, `RefreshOptions`, `findAnchor(repo, trackingRef, budget?)`.
- **LOW-1.** The DEF's ac7 says "the 25 test files that used the seams"; the tree has 32 files that import the exec seam or the legacy table. The LLD uses 32 and the build task counts them again.
- **LOW-2.** `git_status` takes no path filter, so `handoff.ts unitDraftFiles` (status limited to `.insrc/artifacts` and `docs`) needs either the filter as an optional input or filtering the result in the caller; build task t1 decides.
- **LOW-3.** The nine migration steps are written at the level of "move the team module", not tasks; the plan stage does the task breakdown.
- **LOW-4.** No sequence diagram is authored for the refresh deadline flow; the contract and error paths state it in words. Optional.

## Verdict

warn. No HIGH finding. MED-1 needs the user's decision before the plan stage; MED-2 is fixed. The LLD is internally consistent with DEF ac1 to ac8 and with the s10 conventions (ToolDenied thrown and caught only at stage boundaries; ordinary failures keep the site's result).

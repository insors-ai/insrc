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

---

# Self-review of the Story s9 code (BUILD), by the controller

**Not a review by the other party.** The controller wrote this code through `insrc_build_step`, so the rule "the party that did not write the code reviews it" is not met. `insrc_code_review_step` throws `PENDING REVIEW RE-IMPLEMENTATION`, and the user decided on 2026-11-01 that the controller reviews code itself until the framework works. Completing the BUILD therefore needs `overrideReview` naming this document and the user's explicit yes.

Date: 2026-11-01. Subject: the 24 tasks t1 to t24 on branch `v2` (commits `e437559bc` to the commit after `0aa14eb9e`). Method: the daemon's gate for each task (typecheck, the named tests it ran itself, a read-only verdict session that read the code), the full sweep compared by test name with the tree before s9 (`docs/plans/tool-registry.md`, "s9 full sweep"), the forbidden-spawn scan in failing mode, and my own reading of the failures the sweep found. I did not re-read every changed line a second time for this document; the diff is 232 files.

## Adherence (to the LLD and PLAN)

- All 17 files of the replacement table call the registry through `src/workflow/git-calls.ts` (or `callTool` for the diff and the identity lookups). The scan finds no site outside the three exemptions, and `package.json` build runs it with `--fail` (`build-script.test.ts`).
- Denial: `registry-denial-s9.test.ts` runs every moved site for declined, timed-out, no-client and cancelled and expects `ToolDenied`, and checks that a destructive call is never made without asking. Sites with a fail-open catch rethrow `isToolDenied`; I checked this site by site during the build, not by a separate scan.
- Deviations (all recorded in "s9 outcome"): the extra inputs g5 to g12 and two new tools, the park and resume design without `git_rm`, `git_update_ref`, branch delete or forced worktree remove, `_setWorkflowToolDepsForTests` kept, wrapper-only tests deleted, exec-option assertions dropped.

## Conventions

- ESM `.js` imports, `import type`, `exactOptionalPropertyTypes` pass (`tsc --noEmit` clean at every gate). No `console.log`; no `Promise.all` over LLM providers (none touched).
- Test files are not type-checked by `tsc` (tsconfig excludes them); the gate found two synchronous `PolicyReader` fakes this way. I found no others by grep, but a type error in a test file would not be caught by the build.

## Coverage

- Every moved site has a registry test (`migration-record.test.ts` checks the file exists), most also a parity test against fixtures captured from the old implementation before it was deleted (team policy, signoff, handoff, build runners, story commits).
- The full sweep found three real regressions that the task gates did not: `git_status.paths` unclassified for the read-only tool loop, and two gh tool tests that imported the deleted wrappers. All fixed. The sweep ran four files at a time; failures that appeared only in the s9 tree were re-run alone, and four were parallel-only.
- Gap: the exec-option assertions of the old tests (timeout, encoding, stdio) are no longer checked, because the stand-in binaries cannot see them. Timeouts are covered at the git-calls level (`git-calls.test.ts`), not at the gh tracker level.
- Gap: the park and resume path was verified against real temporary repositories and a bare origin, not against GitHub.

## Quality

- Risk: `session-source-inventory.json` was regenerated for the whole tree (35 files added, 22 or more removed by other stories). New files copied a sibling's classification. Nobody reviewed those classifications; the fixture proves only that the tree did not change after regeneration.
- Risk: the park and resume now fetches into `refs/remotes/insrc-handoff/<branch>`; a user who inspects `git branch -r` will see it.
- Not s9's, still open: the review-timeout edit inside the s10 t16 commit, and the handler-runtime key-set drift.

## Verdict

warn. No HIGH finding. The two MEDs of the design self-review (new tools, status path filter) were resolved in t1 and t24. The remaining risks are the unreviewed inventory classifications and the dropped exec-option assertions.

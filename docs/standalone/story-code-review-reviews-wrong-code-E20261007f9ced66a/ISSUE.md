<!-- insrc:artifact ISSUE-f9ced66a0e8835b8 -->

# Story code review reviews merged-in upstream code and the daemon's own checkout instead of the Story's changes

## Reproduction

Build E1 story s1 (epic 2ff0dfdadb1c8d1c): its build-start stamp records rangeBase ea6ed95 (the PLAN approval). Partway through the build, upstream main is merged (merge commit 8a5b2a55, 30 commits of another epic's story, about 6,000 changed lines). Finish the Story's six tasks (commits 88910a7 .. 393e80b, eleven new files under src/workflow/delivery) and call `insrc_code_review_step({ phase: 'start', epicHash: '2ff0dfdadb1c8d1c', storyId: 's1' })`. Observed: verdict block with 1 HIGH, 12 MED, 7 LOW. (a) Ten of the findings are about src/analyze/... and the merged dependency changes — code from the merge, not the Story. (b) All eleven Story files arrive as '[no hunk text …]' because the bounded diff was filled by the merged code, so every coverage finding is 'present but unverified'. (c) The HIGH finding says src/workflow/delivery 'does not exist in the working tree on main (c3c1539)'; c3c1539 is the daemon's own install at ~/.insrc/daemon, not the reviewed repository (whose HEAD is 393e80b and contains those files). Expected: the review covers exactly the Story's own commits, and the reviewer reads the reviewed repository.

## Root cause

Two defects. (1) Change set: the review diffs base..HEAD, where the base is the Story's stamped range base (resolveStoryRangeBase, src/workflow/runners/build/range-base.ts, reading the build-start stamp). The base is fixed when the build starts and is deliberately never moved forward ('the FIRST stamp wins', pinned by src/workflow/__tests__/gates.test.ts). A merge of upstream main made after that point therefore sits inside base..HEAD, so every merged-in commit is counted as the Story's work; assembleDiffCodeReviewGrounding (src/workflow/code-review/grounding.ts) then cuts the diff to a bounded slice, and the merged code crowds out the Story's own files. Nothing in the build flow requires a merge to be committed as its own step before the next round of Story changes, so there is no clean boundary to exclude. (2) Reviewer location: CliProvider.complete (src/agent/providers/cli-provider.ts:169, and the call at :262) invokes runClaude(args, prompt) without an exec override, although runClaude accepts one carrying the working directory. The claude subprocess therefore inherits the daemon process's working directory — /home/subho/.insrc/daemon, the daemon's own clone — and any code the reviewer inspects is the daemon's install, not the repository under review.

## Fix intent

(1) Treat a merge as its own committed step: when upstream changes are merged during a Story's build, the merge is committed immediately and on its own, before the next round of Story changes, and the Story's review change set covers only the Story's own changes — never the content a merge brought in — so the Story's files are always present in full in what the reviewer sees. (2) The reviewer's access to code always points at the git repository being reviewed, never at the daemon's install. Existing range-base guarantees (a stable first stamp) and other CLI callers' behaviour are preserved except where they must use the reviewed repository.

## Citations

- **[[c1]]** `code` `src/workflow/runners/build/range-base.ts` — "const start = readBuildStart(repoPath, epicHash, storyId);
	if (start.kind === 'valid') return start.stamp.rangeBase;"
- **[[c2]]** `code` `src/workflow/__tests__/gates.test.ts` — "test('CR-3: re-approving after the work has landed does NOT move rangeBase forward — the FIRST stamp wins'"
- **[[c3]]** `code` `src/workflow/code-review/grounding.ts` — "const truncNote = diff.truncated ? '\n[diff truncated — reviewed over a bounded slice]' : '';"
- **[[c4]]** `code` `src/agent/providers/cli-provider.ts` — "const { envelope } = await this.runClaude(args, prompt);"
- **[[c5]]** `analyze-bundle` `insrc_analyze_step: code-review change set and reviewer call path (assembleDiffCodeReviewGrounding 8f112759328fb52947f8de6aa050b965, runCodeReview 6c35e42e9bf09b69b75222534d85572f, CliProvider.complete 0cc9c1b1b4daeabae9bd96d181e99e86, runClaude 7977eac8c1768eef33c459ff64fa2861; gates.test.ts first-stamp-wins tests)`
- **[[c6]]** `step-output` `Observed: CR-2ff0dfdadb1c8d1c-s1 verdict block (1 HIGH, 12 MED, 7 LOW) with the HIGH citing c3c1539; build-start rangeBase ea6ed95 is an ancestor of merge 8a5b2a55; daemon pid 107960 cwd /home/subho/.insrc/daemon.`
- **[[c7]]** `stakeholder` `user (2026-10-07)` — "the key issue is that when any merge happens commit should follow immediately before the next round of changes. #2 the code used by the reviewer should point to the git repo not the daemon's code"

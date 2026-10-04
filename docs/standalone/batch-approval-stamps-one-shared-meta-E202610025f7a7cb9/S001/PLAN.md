<!-- insrc:artifact PLAN-5f7a7cb95b643ae5-S001 -->

# Plan: E202610045f7a7cb9:S001

## Summary

**Epic:** `batch-approval-stamps-one-shared-meta`
**LLD run:** `wf-1791123735324-yqq3go`
**LLD effective hash:** `b1168f0c3850...`

The build has three strands. First, the diff tool and the change-set helper learn to leave named paths out inside git. Second, the range-base module gains a per-Story build-start file, a single test for whether a build is finished, and a stamper the implement phase calls; the two BUILD writers stop that file reaching a change log. Third, both code-review paths measure from the Story's base without the workflow's own record files and fall back to today's behaviour if that fails. Every task proves its tests can fail by reverting its own production change.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add an exclude input to the git_diff tool | S | — | unit: T22 git_diff exclude removes a file from both body and file list; unit: T23 git_diff argument vectors are unchanged without exclude or with an empty array; unit: T24 git_diff keeps path as the positive pathspec alongside exclude; unit: T25 git_diff rejects a malformed exclude and its schema declares the field | [[c1]] [[c3]] |
| 2 | **`t2`** Add excludeGlobs to changedFiles and export the ledger globs | S | `t1` | unit: T26 ledger globs keep and drop the exact sets; unit: T27 ledger globs give the same result from a subdirectory; unit: T28 changedFiles with excludeGlobs falls through to the range when only an artifact json is dirty; unit: T29 changedFiles without excludeGlobs sends today's git_diff inputs | [[c1]] [[c4]] |
| 3 | **`t3`** Add the build-start file and read it first in the resolver | S | — | unit: T18 a valid build-start file wins in the resolver, including a hand-written one; unit: T19 invalid build-start files are ignored by the resolver; unit: T20 existing range-base tests pass unchanged with no build-start file | [[c1]] [[c2]] [[c3]] |
| 4 | **`t4`** Add the finished-build test and the stamper | M | `t3` | unit: T1 first stamp writes HEAD and the Story's ids; unit: T2 a valid stamp is kept when HEAD moves; unit: T3 mid-build approval keeps the stamp; unit: T4 an approved record with a failed or unset task keeps the stamp; unit: T5 an approved task-less record keeps the stamp; unit: T6 a finished plan-driven build re-stamps; unit: T7 a finished standalone build re-stamps; unit: T8 a whole-Story task covers a plan and re-stamps; unit: T9 a finished record approved before the stamp keeps it; unit: T10 a malformed plan keeps the stamp; unit: T11 no stamp and an unapproved record with a task is skipped; unit: T12 no stamp and an approved partial record is skipped; unit: T13 no stamp and an approved failed record is skipped; unit: T14 no stamp and a finished record is stamped; unit: T15 no stamp and a task-less record is stamped; unit: T16 not-written for no commits and for an unwritable directory, without throwing; unit: T17 invalid stamps are replaced with no recorded task and skipped with an unfinished record; unit: T21 range-base has no runtime import of gates | [[c1]] [[c2]] [[c3]] |
| 5 | **`t5`** Stamp at build start and keep the build-start file out of change logs | M | `t4` | integration: T30 two Stories approved together each get exactly their own change log; integration: T31 a committed build-start file is absent from the change log; integration: T32 an uncommitted build-start file does not stand in for the Story's work; integration: T33 mid-build approval keeps both tasks' files; integration: T34 mid-build approval with the stamp deleted writes no file and matches the pre-change resolver; integration: T35 a rebuild lists exactly the rebuild's files; integration: T36 implement writes no BUILD record on the plan-driven and Small routes; integration: T37 the completion writer excludes a committed build-start file; integration: T38 no resolvable base and a clean tree gives an empty change log; integration: Trivial route stamps before its record write and keeps the stamp on a second call; integration: a not-written stamp leaves each route's implement result unchanged | [[c1]] [[c2]] [[c4]] [[c5]] |
| 6 | **`t6`** Make the review subject measure from the Story's base without ledger files | S | `t2`, `t3` | integration: T39 review subject is exactly the Story's source files when only an artifact json is dirty; integration: T40 an edited artifact template stays in the review subject; integration: T41 a missing base commit falls back to today's result with one warning; integration: T42 a dep that rejects excludeGlobs reaches the no-option call; integration: T43 a dep that always throws yields no-build-record | [[c1]] [[c3]] [[c4]] |
| 7 | **`t7`** Give the degraded review the same base, exclusions and fallback | M | `t2`, `t3` | integration: T44 source hunks survive a ledger diff larger than the cap; integration: T45 a ledger-only range is empty and does not use the last-commit fallback; integration: T46 failing range and failing exclusions step down to today's sequence; integration: T47 no opts makes today's calls on the deps; integration: T48 the degraded review passes the Story's base and the ledger globs | [[c1]] [[c3]] [[c4]] |

### 1.1 E202610045f7a7cb9:S001:T001 — Add an exclude input to the git_diff tool

Give git_diff an optional `exclude` list of repo-root globs, declared in its closed input schema and validated in the handler. Each glob is passed to git as a `:(top,exclude,glob)` pathspec on both the body and the numstat command; with no `path` the positive pathspec is `:(top)`, with a `path` it stays as given. Absent or empty `exclude` builds exactly today's arguments.

**Acceptance checks:**
- An excluded file is absent from both the diff body and the file list, and a kept file is present in both
- With no `exclude` and with an empty array the body and numstat argument vectors equal today's
- `path` plus `exclude` keeps the path as the positive pathspec
- A non-array or empty-string `exclude` returns invalid-input without running git, and the input schema declares the field
- Each new test was seen to fail with the production change reverted

### 1.2 E202610045f7a7cb9:S001:T002 — Add excludeGlobs to changedFiles and export the ledger globs

Add the optional `excludeGlobs` option to changedFiles, forwarded as git_diff's `exclude` on the unstaged, staged and range diffs, and export LEDGER_EXCLUDE_GLOBS (the four globs) from changed-files.ts. No existing caller passes the option; collectBuildChangeLog is unchanged.

**Acceptance checks:**
- Against real git, the four globs keep and drop exactly the sets listed in the LLD, from the repo root and from a subdirectory
- With excludeGlobs, a tree dirty only with an artifact json falls through to the range
- Without excludeGlobs the git_diff inputs equal today's and collectBuildChangeLog passes none
- Each new test was seen to fail with the production change reverted

### 1.3 E202610045f7a7cb9:S001:T003 — Add the build-start file and read it first in the resolver

In range-base.ts add buildStartRelPath and one private reader for the build-start file that accepts it only when it has the four fields, names this Story, and its commit exists in the repo. Make resolveStoryRangeBase consult a valid build-start file first and leave its existing steps untouched.

**Acceptance checks:**
- A valid build-start file wins over a different approval-time stamp, and a hand-written file with the four fields is accepted
- Malformed, wrong-Story and missing-commit files are ignored with a warning and the approval-time stamp is returned
- With no build-start file every existing range-base test passes unchanged, including the one asserting undefined when nothing resolves
- Each new test was seen to fail with the production change reverted

### 1.4 E202610045f7a7cb9:S001:T004 — Add the finished-build test and the stamper

In range-base.ts add the FINISHED test over the BUILD record and PLAN json, read directly from .insrc/artifacts, and stampBuildStart with its two branches: with a valid stamp, replace it only when the build is finished and approved after the stamp; with no valid stamp, write nothing when the record has a task and is not finished, otherwise stamp. No runtime import of gates.ts.

**Acceptance checks:**
- Valid stamp: kept when there is no record, when a record is approved mid-plan, when a task has passed false or absent, when the record is task-less, when the plan is malformed, and when a finished record was approved before the stamp
- Valid stamp: replaced at the new HEAD for a finished plan-driven build, a finished standalone build, and a planned Story whose record holds a passed whole-Story task, each approved after the stamp
- No stamp: skipped for an unapproved record with a task, an approved record covering part of its plan, and an approved record with a failed task; stamped for no record, a task-less record and a finished record
- An invalid stamp is replaced when no task is recorded and left alone (skipped) when the record is unfinished
- Never throws; returns not-written when HEAD is unresolvable or the file cannot be written
- range-base.ts has no runtime import of gates.ts, type-only imports excluded
- Each new test was seen to fail with the production change reverted

### 1.5 E202610045f7a7cb9:S001:T005 — Stamp at build start and keep the build-start file out of change logs

Call stampBuildStart, fail-open, from the implement phase on each admitted route (plan-driven, Small, and Trivial before its record write). Add buildStartRelPath to the exact-path exclusion list in the validate phase and in the completion writer.

**Acceptance checks:**
- Two Stories approved in one batch and built in turn each get a change log of exactly their own files
- The build-start file never appears in a change log, whether committed with the work, left uncommitted, or untracked, and never stands in for the Story's work; the same holds for the completion writer
- A Story approved mid-build keeps both tasks' files in its change log, with the stamp present and with the stamp deleted before the second task
- A rebuild of a finished, approved Story lists exactly the rebuild's files
- After implement on the plan-driven and Small routes no BUILD record exists, and a batch approval then approves none for the Story
- On the Trivial route the stamp exists before the task-less record is written and a second implement call keeps it
- On each route a stampBuildStart that reports not-written leaves the implement call's result unchanged
- A Story with no resolvable base and a clean tree gets an empty change log
- Each new test was seen to fail with the production change reverted

### 1.6 E202610045f7a7cb9:S001:T006 — Make the review subject measure from the Story's base without ledger files

In resolveCodeReviewSubject, widen the changedFiles seam, add the resolveRangeBase seam, and derive changedFiles by the three attempts: base plus ledger globs, ledger globs only, then today's call with no options, logging a warning at each step down. Only a failure of the last attempt yields no-build-record.

**Acceptance checks:**
- With the Story committed and only an artifact json dirty, changedFiles is exactly the Story's source files
- A Story's edit to .insrc/artifacts/templates stays in changedFiles
- A base naming a missing commit still yields ok with today's result and one warning
- A dep that throws whenever excludeGlobs is passed reaches the no-option call; a dep that always throws yields no-build-record
- Each new test was seen to fail with the production change reverted

### 1.7 E202610045f7a7cb9:S001:T007 — Give the degraded review the same base, exclusions and fallback

Add the opts parameter to assembleDiffCodeReviewGrounding and the rangeDiff dep and optional excludeGlobs parameters to DiffGroundingDeps; sequence working tree, then base..HEAD (its result stands even when empty), then the last-commit fallback, with the same three-step fallback on failure. Pass the Story's base and the ledger globs from beginDiffOnlyReview.

**Acceptance checks:**
- Over a range whose ledger hunks exceed 256 KB and sort first, every source file has non-empty diff text and no ledger path appears; without excludeGlobs the same fixture loses source text
- A base with only ledger changes gives an empty result and does not call the last-commit fallback
- A failing range diff retries without the base, and failing exclusions run today's sequence with no excludeGlobs argument
- With no opts the calls on the deps equal today's and existing diff-grounding tests pass unchanged
- beginDiffOnlyReview passes the resolved base and LEDGER_EXCLUDE_GLOBS
- Each new test was seen to fail with the production change reverted

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| ac1: a Story's BUILD change log lists only that Story's files, even when its plan was approved in the same sweep as its siblings' | `t5` |
| ac2: an unresolvable base yields an empty change set; no range is substituted | `t3`, `t5` |
| ac3: no state in which a Story's record shows unfinished work, approved or not, moves its base forward onto its own work | `t4`, `t5` |
| ac4: no approvable record exists earlier than today, and the build-start file is not approvable and never appears in a change log | `t5` |
| ac5: the code review measures from the same base and does not review ledger files, on both of its paths, including when ledger hunks exceed the diff cap | `t1`, `t2`, `t6`, `t7` |
| ac6: user-authored files under .insrc stay reviewable | `t2`, `t6` |
| ac7: the code review can start in every state in which it can start today, and every caller that passes no new option behaves exactly as today | `t1`, `t2`, `t6`, `t7` |
| T1 stampBuildStart: no stamp, no BUILD record -> `stamped`; file holds HEAD's full sha and the Story's ids | `t4` |
| T2 stampBuildStart: valid stamp, HEAD moved, no BUILD record -> `kept`; file bytes unchanged | `t4` |
| T3 valid stamp, mid-build approval: plan t1,t2,t3; record has t1 passed, approvedAt later than stampedAt -> `kept`; file bytes unchanged | `t4` |
| T4 valid stamp: record approved after the stamp, its one task has passed false -> `kept`; same with passed absent -> `kept` | `t4` |
| T5 valid stamp: record approved after the stamp but task-less -> `kept` | `t4` |
| T6 valid stamp, finished plan-driven build: plan t1,t2; record has both passed, approvedAt later than stampedAt -> `stamped` at the new HEAD | `t4` |
| T7 valid stamp, finished standalone build: no PLAN json; record has one passed task, approvedAt later than stampedAt -> `stamped` | `t4` |
| T8 valid stamp, whole-Story validation of a planned Story: plan t1,t2; record has one passed task whose id is the storyId, approved after the stamp -> `stamped` | `t4` |
| T9 valid stamp: record finished, but approvedAt EARLIER than stampedAt -> `kept` | `t4` |
| T10 valid stamp: PLAN json present but malformed, record otherwise finished -> `kept` | `t4` |
| T11 no stamp: UNAPPROVED record with one task -> `skipped-work-exists`, no file | `t4` |
| T12 no stamp: APPROVED record covering one of three plan tasks -> `skipped-work-exists`, no file | `t4` |
| T13 no stamp: APPROVED record whose one task has passed false -> `skipped-work-exists`, no file | `t4` |
| T14 no stamp: finished record -> `stamped` | `t4` |
| T15 no stamp: task-less record, approved or not -> `stamped` | `t4` |
| T16 repo with no commits -> `not-written`, no file; unwritable directory -> `not-written`, no throw | `t4` |
| T17 invalid stamp (malformed, naming another Story, naming a missing commit) and no recorded tasks -> replaced by a fresh stamp; the same invalid stamps with an unfinished record -> `skipped-work-exists` | `t4` |
| T18 resolveStoryRangeBase: a valid build-start file wins over a different approval-time stamp on the PLAN; a hand-written file with the four fields is accepted | `t3` |
| T19 resolveStoryRangeBase: malformed, wrong-Story and missing-commit files are ignored and the approval-time stamp is returned | `t3` |
| T20 resolveStoryRangeBase: no build-start file -> every existing range-base test passes unchanged, including the one asserting undefined when nothing resolves | `t3` |
| T21 range-base.ts has no runtime import of gates.ts (asserted on the module's import statements, type-only imports excluded) | `t4` |
| T22 git_diff with `exclude`: an excluded file is absent from BOTH the body and the file list; a kept file is present in both | `t1` |
| T23 git_diff with no `exclude` and with an empty array: the git argument vectors equal today's (asserted on the argument builders) | `t1` |
| T24 git_diff with `path` and `exclude` together: the path is still the positive pathspec | `t1` |
| T25 git_diff with a non-array or empty-string `exclude`: invalid-input, git not run; and the tool's input schema declares `exclude` | `t1` |
| T26 LEDGER_EXCLUDE_GLOBS against one commit touching every location: the exact kept set is [.insrc/artifacts/formats/f.md, .insrc/artifacts/templates/t.json, .insrc/conventions/c.md, .insrc/feedback/fb.md, .insrc/templates/tp.md, docs/epics-notes/n.md, src/a.ts] and the exact dropped set is [.insrc/artifacts/LLD-x.json, .insrc/build-start/x-S001.json, docs/epics/e/S001/LLD.md, docs/standalone/s/S001/BUILD.md] | `t2` |
| T27 the same globs when git_diff's cwd is a subdirectory of the repo: identical result | `t2` |
| T28 changedFiles with excludeGlobs: a tree dirty only with an artifact json falls through to the range | `t2` |
| T29 changedFiles without excludeGlobs: the recorded git_diff inputs equal today's; collectBuildChangeLog passes no excludeGlobs | `t2` |
| T30 Two Stories under one epic, plans approved in one batch (the approval rewrite committed). Build and commit Story 1, then implement+commit+validate Story 2: Story 2's BUILD change log is EXACTLY its own files, and Story 1's is exactly its own | `t5` |
| T31 The same flow with the build-start file committed alongside the Story's source: exact-set change log, build-start file absent | `t5` |
| T32 The same flow with the build-start file left uncommitted and nothing else dirty: the range is used, exact-set change log | `t5` |
| T33 Mid-build approval end to end: a plan-driven Story with two tasks implements, commits and validates task 1; a batch approval by epicHash approves its BUILD record; it implements, commits and validates task 2: the change log is EXACTLY the files of task 1 and task 2 | `t5` |
| T34 The same mid-build approval with the build-start file deleted before task 2's implement call: no file is written, and the change log after task 2 equals what the pre-change resolver gives for that Story | `t5` |
| T35 Rebuild: a Story with every task passed has its BUILD approved; implement again (stamp replaced), commit a new file, validate: the change log is exactly the new file | `t5` |
| T36 After an implement call on the plan-driven and Small routes no BUILD record exists for the Story; a batch approval by epicHash at that moment approves no BUILD record for it | `t5` |
| T37 Completion writer with a committed build-start file: exact-set change log | `t5` |
| T38 A Story with no resolvable base and a clean tree: validate writes an empty change log | `t5` |
| T39 resolveCodeReviewSubject, real changedFiles: Story committed, only an approval-stamped artifact json dirty -> changedFiles is exactly the Story's source files | `t6` |
| T40 resolveCodeReviewSubject: a Story that edited .insrc/artifacts/templates/t.json -> that file is in changedFiles | `t6` |
| T41 resolveCodeReviewSubject, real git: the resolved base names a commit that does not exist -> ok is true and changedFiles equals what today's no-option call returns; one warning logged | `t6` |
| T42 resolveCodeReviewSubject with a changedFiles dep that throws whenever excludeGlobs is passed -> the third attempt is called with no options and its result is returned | `t6` |
| T43 resolveCodeReviewSubject with a dep that always throws -> `no-build-record`, as today | `t6` |
| T44 assembleDiffCodeReviewGrounding with real git: a base..HEAD range whose ledger files total more than 256 KB and sort before src/ -> every src file has a pseudo-symbol with non-empty diff text and no ledger path appears; the same fixture WITHOUT excludeGlobs loses src text (shows the test can fail) | `t7` |
| T45 assembleDiffCodeReviewGrounding: base given and only ledger files changed -> empty result; lastCommitDiff not called | `t7` |
| T46 assembleDiffCodeReviewGrounding: rangeDiff throws -> the sequence is retried without the base; exclusions throw too -> today's sequence runs with no excludeGlobs argument | `t7` |
| T47 assembleDiffCodeReviewGrounding: no opts -> the calls made on the deps, including their arguments, equal today's; existing diff-grounding tests pass unchanged | `t7` |
| T48 beginDiffOnlyReview: the grounding dep receives the Story's resolved base and LEDGER_EXCLUDE_GLOBS | `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails`
- **[[c2]]** `prior-artifact` `LLD S001 dataModelChanges`
- **[[c3]]** `prior-artifact` `LLD S001 errorPaths`
- **[[c4]]** `prior-artifact` `LLD S001 testStrategy`
- **[[c5]]** `prior-artifact` `LLD S001 migration`

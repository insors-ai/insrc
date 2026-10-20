<!-- insrc:artifact ISSUE-f431a4420d03374f -->

# Count a commit as the Story's when its Insrc-Story line is in any paragraph

## Reproduction

1. Make Story commits whose message ends with the Story line, a blank line, then a co-author line:

    feat(build): s1/t5 ...

    Insrc-Story: 8315a11f29fd2812/s1

    Co-Authored-By: Name <mail>

2. Run the Story's code review (insrc_code_review_step phase=start).

Observed: the review's change set leaves those commits out. For Epic 8315a11f Story s1 the review covered 11 changed files, those of the four commits whose Story line sat in the final block (t1-t4); the 18 commits for t5-t12 were dropped and 54 of the Story's 65 changed source files were never reviewed. `git log -1 --format='%(trailers:key=Insrc-Story,valueonly)' <commit>` prints nothing for such a commit. Expected: every commit whose message has the line `Insrc-Story: 8315a11f29fd2812/s1` counts as the Story's work, wherever in the message the line is.

## Root cause

scanTrailers in src/workflow/runners/build/story-commits.ts:109 reads the Story key with git's `%(trailers:key=Insrc-Story,valueonly,...)` placeholder (src/workflow/runners/build/story-commits.ts:112). Git parses trailers only from the last paragraph of a message, so a commit whose Insrc-Story line is followed by a blank line and another paragraph (here a Co-Authored-By line) yields no value. The commit is not added to `carrying` (src/workflow/runners/build/story-commits.ts:125-128), so its paths are not part of the Story's change set, and the review silently covers less than the Story.

## Fix intent

Treat a commit as the Story's when any whole line of its message is `Insrc-Story: <storyKey>`, in whichever paragraph it sits, matching the key exactly as today. Commits whose final trailer block carries the key keep counting as before; a commit that merely mentions the key inside other text does not count. A test pins both message shapes and the non-matching ones.

## Citations

- **[[c1]]** `code` `src/workflow/runners/build/story-commits.ts:107-131` — "out = git(repoPath, ['log', '--first-parent', `--format=%H%x1f%h%x1f%s%x1f%(trailers:key=${STORY_TRAILER_KEY},valueonly,separator=%x1f)%x1e`, `${base}..HEAD`]);"
- **[[c2]]** `code` `src/workflow/runners/build/story-commits.ts:125` — "if (values.some(v => v.trim() === storyKey)) {"
- **[[c3]]** `prior-artifact` `docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S001/CR.md` — "**Changed files:** 11"

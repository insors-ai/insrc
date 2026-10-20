<!-- insrc:artifact BUILD-f431a4420d03374f-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-20T12:48:43.063Z

**Commit:** 54c37828

## Scope

Count a commit as the Story's when any whole line of its message is `Insrc-Story: <storyKey>`, in whichever paragraph it sits (ISSUE-f431a4420d03374f): fix scanTrailers in src/workflow/runners/build/story-commits.ts and pin both message shapes and the non-matching ones in a test.

## Triage rationale

bugfix (small): one function in one file reads the Story trailer through git's last-paragraph trailer parser.

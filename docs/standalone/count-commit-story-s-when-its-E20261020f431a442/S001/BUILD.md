<!-- insrc:artifact BUILD-f431a4420d03374f-s1 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-20T12:48:43.063Z  ·  **Updated:** 2026-10-20T12:59:43.045Z

**Commit:** 973fc8bd

## Scope

Count a commit as the Story's when any whole line of its message is `Insrc-Story: <storyKey>`, in whichever paragraph it sits (ISSUE-f431a4420d03374f): fix scanTrailers in src/workflow/runners/build/story-commits.ts and pin both message shapes and the non-matching ones in a test.

## Triage rationale

bugfix (small): one function in one file reads the Story trailer through git's last-paragraph trailer parser.

## Summary

scanTrailers in src/workflow/runners/build/story-commits.ts now reads the full message (%B) instead of git's last-paragraph trailer placeholder; a new storyLines() returns the key of every whole `Insrc-Story: <key>` line. A Story line in any paragraph counts (the shape that dropped Epic 8315a11f s1's t5-t12 commits); a mention inside other text, another Story's key, or a key with a suffix do not. Tests on real git repositories pin both shapes and the non-matching ones; 3 mutations (back to the trailer parser, a mention counting, a prefix key match) each fail a test. Commit 973fc8bd.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-f431a4420d03374f.json` — **insrc-build** (2026-10-20T12:59:43.045Z)
- `docs/standalone/count-commit-story-s-when-its-E20261020f431a442/ISSUE.md` — **insrc-build** (2026-10-20T12:59:43.045Z)
- `src/workflow/runners/build/__tests__/story-commits-trailer.test.ts` — **insrc-build** (2026-10-20T12:59:43.045Z)
- `src/workflow/runners/build/story-commits.ts` — **insrc-build** (2026-10-20T12:59:43.045Z)

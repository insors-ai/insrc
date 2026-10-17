<!-- insrc:artifact BUILD-1102dc7125ad0c07-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-17T06:56:06.405Z  ·  **Updated:** 2026-10-17T06:56:06.405Z

**Commit:** 5a4d776a

## Summary

5a4d776a: CodeReviewSubject.buildRecord is the general BuildRecord and the subject gains testRecord; DEFAULT_DEPS supplies readStoryBuildRecord (null with a warning when absent or misshapen) and readTestRecord. subject-paths.ts unchanged (reads buildRecord.meta, which both types share; subject-paths.test.ts passes). Three falsifying mutations each fail the new test. tsc clean; workflow, daemon/steps and MCP suites 2297 pass, the only failure the pre-existing review-decision /private/var realpath one.

## Tasks validated

- ✗ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/code-review/__tests__/subject.test.ts` — **insrc-build** (2026-10-17T06:56:06.405Z)
- `src/workflow/code-review/subject.ts` — **insrc-build** (2026-10-17T06:56:06.405Z)
- `src/workflow/code-review/types.ts` — **insrc-build** (2026-10-17T06:56:06.405Z)

<!-- insrc:artifact BUILD-1102dc7125ad0c07-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-17T06:56:06.405Z  ·  **Updated:** 2026-10-17T06:57:58.056Z

**Commit:** e52f50e2

## Summary

5a4d776a + e52f50e2: CodeReviewSubject.buildRecord is the general BuildRecord and the subject gains testRecord; DEFAULT_DEPS supplies readStoryBuildRecord and readTestRecord. After the first gate's finding, readStoryBuildRecord requires meta.workflow 'build', this Story's epicHash and storyId, a string createdAt, an object (non-array) body, and tasks (when present) with a string id and boolean-or-absent passed; an absent record is warned about. subject.test.ts covers each misshapen case and the warning; six falsifying mutations (one per check) each fail it, plus the earlier three (no build reader, no test reader, no shape check). tsc clean.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/code-review/__tests__/subject.test.ts` — **insrc-build** (2026-10-17T06:57:58.056Z)
- `src/workflow/code-review/subject.ts` — **insrc-build** (2026-10-17T06:57:58.056Z)
- `src/workflow/code-review/types.ts` — **insrc-build** (2026-10-17T06:57:58.056Z)

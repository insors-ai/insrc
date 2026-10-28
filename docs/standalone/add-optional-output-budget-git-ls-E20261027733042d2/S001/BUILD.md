<!-- insrc:artifact BUILD-733042d2e435fabd-s1 -->

# Build (standalone small) — Story s1

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-10-27T11:56:36.914Z  ·  **Updated:** 2026-10-27T12:55:06.126Z

**Commit:** 2c9fd8c38

## Summary

Scope extension (LLD revision 4, approved): git_rev_parse and git_hash_object read their output through parseOutput, so a cut capture is the one failure 'git output was cut at the byte limit' with no data (commit 2c9fd8c38; src/daemon/tools/builtins/git/rev-parse.ts and hash-object.ts, two small edits). New git-read-cut.test.ts (ac6) covers: rev-parse with 11 MiB of lines fails, hash-object with a cut non-name fails, hash-object with a valid object name followed by 11 MiB of newlines (trimmed it is the name, the old code returned success) fails, and uncut results are as before (a sha, two lines with a blank dropped, empty output, and the 'git printed no object name' message for a non-name). I confirmed that test fails (pass 0, fail 1) on the previous source of those two files and passes on the new. All files of the git test folder pass; tsc clean. The first build (budget option, commits e105150fb and 5e2420e41) is unchanged.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` — **insrc-build** (2026-10-27T13:08:49.988Z)
- `src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts` — **insrc-build** (2026-10-27T13:08:49.988Z)
- `src/daemon/tools/builtins/git/helpers.ts` — **insrc-build** (2026-10-27T13:08:49.988Z)
- `src/daemon/tools/builtins/git/ls-files.ts` — **insrc-build** (2026-10-27T13:08:49.988Z)
- `src/daemon/tools/builtins/git/__tests__/git-read-cut.test.ts` — **insrc-build** (2026-10-27T13:08:49.988Z)
- `src/daemon/tools/builtins/git/hash-object.ts` — **insrc-build** (2026-10-27T13:08:49.988Z)
- `src/daemon/tools/builtins/git/rev-parse.ts` — **insrc-build** (2026-10-27T13:08:49.988Z)

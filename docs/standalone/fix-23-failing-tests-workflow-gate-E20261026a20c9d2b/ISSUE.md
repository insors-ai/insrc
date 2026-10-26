<!-- insrc:artifact ISSUE-a20c9d2b51002bec -->

# Fix the 23 failing tests of the workflow gate, artifact inventory, convert, review limits, build record and LMDB areas

## Reproduction

Run 'npx tsx --test --test-force-exit "src/workflow/**/*.test.ts"': 22 tests fail on the base commit. Run 'npx tsx --test --test-force-exit src/db/graph/__tests__/lock-loss-reproduction.test.ts': 1 test fails (the read throws code 22, the test expects -30775). The 22 are: approve-build-completion (ac1, ac2, ac5, ac6), approve-codereview-gate (ac1, ac3 twice, ac5, ac6), bugfix-orchestration (ac3 twice), other-party-review-gate (T7, 8 tests), artifact-write-inventory (1), convert-repeat (1), review call-limits (1) and build-record t7 (1). Observed: approving a BUILD with a prepared code review returns 'Code review is out of date or incomplete: the code review structure cannot be verified' instead of the completion or 'code review BLOCKS' result the tests expect; the inventory test reports 'src/daemon/handler-runtime.ts: writes artifacts or passes a writer on but has no inventory entry' and 'src/daemon/index.ts: the entry names a file that uses none of writeArtifact...'; convert-repeat differs from an uninterrupted run only in an 'at' timestamp; call-limits fails 'design-session: below the review deadline'; build-record t7 fails with ENOENT on .insrc/artifacts/BUILD-972bf31d13c81a2f-S001.json.

## Root cause

Gate tests (20): the completion gate was tightened on 2026-10-24 (commits 1ed200db1, e0c3e97d5, d7db76538): reviewBuildGap in src/workflow/code-review/build-freshness.ts now refuses a code review whose body has no readable verdict, a changedFiles list, or a buildFingerprint matching the BUILD, so the older test fixtures that write bare code review records are refused with 'the code review structure cannot be verified'; the code follows the newer rule and the fixtures are stale (to be confirmed per test). Inventory (1): src/daemon/handler-runtime.ts writes artifacts or passes a writer on but has no entry in the inventory the test checks, and the entry for src/daemon/index.ts names a file that no longer uses a writer, so the inventory is out of date with the daemon. Convert-repeat (1): the result of an interrupted-then-rerun apply differs from an uninterrupted run only in the 'at' timestamps, so the test compares clock-dependent text. Call-limits (1): the design-session limit is not below the review deadline; whether the limit or the assertion is wrong is not yet determined. Build-record t7 (1): the test reads a BUILD record from the repository's own .insrc/artifacts that does not exist in this checkout; it depends on a file that is not committed. LMDB (1): the installed lmdb-js raises code 22 where the test expects -30775 for a read after the lock files are removed; the test pins library behaviour that differs from the installed version (to be confirmed).

## Fix intent

For each of the 23 tests decide from its root cause whether the code or the test is wrong, and correct that one: bring the stale gate fixtures up to the current freshness rule without loosening the rule; bring the writer inventory in line with the daemon files; make the convert-repeat comparison independent of the clock; settle the design-session limit against the review deadline in whichever of limit or assertion is wrong; make the build-record test independent of an uncommitted file; and make the LMDB test describe the behaviour of the installed library. Leave no test skipped or deleted to make the sweep green.

## Citations

- **[[c1]]** `code` `src/workflow/code-review/build-freshness.ts:22-30` — "return 'the code review structure cannot be verified'"
- **[[c2]]** `code` `src/workflow/__tests__/approve-codereview-gate.test.ts:85`
- **[[c3]]** `code` `src/workflow/__tests__/artifact-write-inventory.test.ts`
- **[[c4]]** `code` `src/workflow/convert/__tests__/convert-repeat.test.ts`
- **[[c5]]** `code` `src/workflow/review/__tests__/call-limits.test.ts`
- **[[c6]]** `code` `src/workflow/runners/build/__tests__/build-record.test.ts`
- **[[c7]]** `code` `src/db/graph/__tests__/lock-loss-reproduction.test.ts:53`

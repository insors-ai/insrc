<!-- insrc:artifact ISSUE-ed920ce9247c9d92 -->

# The daemon test suite can hang when two test runs overlap

## Reproduction

Seen three times during Story s2 of the analyzer epic, not reproduced on demand. The daemon suite hung once in `src/daemon/__tests__/model-catalog.test.ts` and twice in `src/daemon/tools/builtins/code/__tests__/migration-walk.test.ts`. Each time another test run was still going, or the child processes of a run that had timed out were. Both files pass when run alone, and the suite passes when it is the only run. To try it: start the daemon suite, and while it runs start it a second time, or leave the children of a timed-out run alive and start the suite. Observed: one of the two files never finishes. Expected: two test runs on one machine do not block each other, or a run that cannot proceed because of another says so and ends.

## Root cause

Not diagnosed. What is known is the circumstance: every hang came with a second run alive, and none came without one. What the two test files share with another run was not looked for; candidates that were not checked are a file or directory both runs write, a port, and the graph store. A related case is known: a test process left without a parent that holds the live graph store makes other test files abort; that one aborts where this one hangs, and whether they have the same cause is not known.

## Fix intent

What the two test files share with a concurrent run is found and stated. Either the tests no longer share it, so that overlapping runs each finish, or a run that cannot proceed because of another fails with a message that names what it is waiting for, within a bounded time. A hang with no output is no longer a possible outcome of these two files.

## Citations

- **[[c1]]** `doc` `docs/plans/handover-2026-10-10.md` — "The daemon suite can hang when two test runs overlap."
- **[[c2]]** `code` `src/daemon/__tests__/model-catalog.test.ts`
- **[[c3]]** `code` `src/daemon/tools/builtins/code/__tests__/migration-walk.test.ts`

# Code review record: s1 (stop flat amendment heads from blocking every completion roll-up)

**Not a code review by the other party.** The daemon's review `review-3c0b242fcabf01e9-s1-r1` ran but could not be published (GitHub issue #100: start accepts `{lld, plan}`, publication requires `{story, lld, plan}`). This file records what that review reported and the author's own read of the task whose reviewer crashed. The BUILD is approved with an override that names this.

## What the daemon's review reported (2026-11-04, findings kept in `.insrc/tmp/code-review/review-3c0b242fcabf01e9-s1-r1.json`)

| Task | Result | Note |
| :--- | :--- | :--- |
| t1 | failed | `Reviewer failed: Review activity CLI failed`: a process failure, nothing about the code |
| t2 | passed | diff matches the LLD and plan; the file's 5 tests pass |
| t3 | passed | `only` filter is checked before any read or write; `applyConversion`'s call is unchanged |
| t4 | passed | all six acceptance checks met; no regression in the wider convert suite |
| t5 | incomplete | repair evidenced against the real commit diff; the one open item is that the BUILD approval without a move-aside had not yet happened, and the reported smoke test said "pass" while deferring that clause |

On t5 the reviewer is right that the reported `pass` overclaimed: the clause "a BUILD approval succeeds without moving any file aside" was deferred in the same evidence text. It is observed at the approval of this BUILD and recorded in the approval note, not before.

## Author's read of t1 (commit 6315fc633)

- `countedChildren` now throws only for unreadable ids whose id kind equals the counted kind; the status-vanished check and the signature are unchanged, and the function is still unexported.
- An id that does not parse has no kind and is ignored; the store's scan already skips ids that `ArtifactIds.parse` rejects, so nothing that could be a child is dropped.
- A flat Task or Story head still blocks, which is the stated conservative behaviour (the parent link of an unreadable head cannot be read).
- The two new tests go through the exported `rollUp` with the inline `reader` factory; the pre-existing test that an unreadable Task blocks a Story, and an unreadable Story blocks an Epic, still passes.
- Not checked: no test shows a head of a different kind that parses as TASK in another unit blocking this unit's roll-up; that is the accepted edge case in the LLD.

## Test failures that predate this Story

`convert-preview.test.ts`, `completion-evidence.test.ts` and `automated-writers-addresses.test.ts` fail with and without the changes of this Story (checked by running them on the parent commit).

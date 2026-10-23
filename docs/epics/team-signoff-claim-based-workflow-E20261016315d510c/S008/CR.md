<!-- insrc:artifact CR-315d510cb28100e2-s8 -->

# Code review: 315d510cb28100e2:s8

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 5 · model `claude:opus`

**Changed files:** 12

**Reviewed on the diff:** the wait for a fresh index was declined

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/storage.ts:231 | In `lifecycleKeepingSignoffs`, when the next head carries a lifecycle with no signoffs, the prior Signoff entries are copied into it before the content is compared. So a content write with unchanged content, a fresh next lifecycle and a prior head that has Signoff entries now stores those entries. That is a change from today's behaviour. The approved design keeps the carry-over to changed content only when the next head brings its own lifecycle. The t3 tests cover unchanged content with a fresh draft lifecycle only over a prior head with no Signoff entries, so this path is never tested. |

## conventions — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/artifact-core/__tests__/lifecycle-resignoff.test.ts:1 | This is the only new test file in the Story without the header doc comment (what the file covers, the Story id and a 'Run: npx tsx --test <path>' line). It also uses describe/it, while the other new test files use a flat test(). The other five new test files in the changed set all have the header. The idiom is drawn only from the files in this Story, so this is an observation, not a rule breach. |

## coverage — 0 finding(s)

_No findings._

## quality — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/team/signoff.ts:648 | The `since` cutoff is the local `at` stamp of the newest Signoff entry, and that stamp is written by recordOpened only after the files have been pushed (resubmit/openRequest come first). Suppose a reviewer requests changes on the new push in the gap between the push and the recording, or the local clock runs ahead of GitHub's. changesRequestedSince then drops that review, because its submittedAt is at or before since. The heads stay in-signoff, and a later merge can record them as signed-off even though the request for changes was never acted on. Two fixes would close this: take the cutoff from the push itself (the commit time or the PR head-commit time), or subtract a margin for clock skew. |
| LOW | src/workflow/team/signoff.ts:648 | The latest submission time across the group is found by comparing ISO strings as text (`at > latest`). The same commit fixed this in changesRequestedSince because stamps with and without milliseconds sort wrongly as text. If any Signoff entry's `at` comes from a source with a different precision, this pick of the latest entry is wrong in the same way. Compare with Date.parse here too. |
| LOW | src/workflow/team/author-gate.ts:61 | assertHeld builds a second team context and re-reads the holder from the tracker after teamGate has already read it for the same unit. Every 'revise' turn therefore makes extra tracker (gh) calls. The holder can also change between the two reads, so the gate's decision and the holder check can disagree. A cleaner option is to have the gate's outcome report that the unit is unassigned for 'revise', so the holder is read once. |
| LOW | src/workflow/team/signoff.ts:585 | resubmit checks the branch the files were published to only after publishBranch has committed and pushed them. If the two branches differ, the push has already happened, so the 'switch branch' refusal is returned with the files left on the wrong branch. The earlier currentBranch check makes this unlikely, but the after-publish check cannot undo anything; it should say the commit is already on the wrong branch. |


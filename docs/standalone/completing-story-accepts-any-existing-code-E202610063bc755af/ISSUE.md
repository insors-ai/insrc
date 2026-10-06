<!-- insrc:artifact ISSUE-3bc755af91d494a8 -->

# Completing a Story accepts a code review that is older than the build it completes

## Reproduction

Found by reading the gate, raised by the daemon's code review of ISSUE-1716f77b on 2026-10-05; not yet seen in a real run. To trigger it: 1. Build a Story and run its code review, so a code-review record exists for it. 2. Change the Story's code again: rebuild it, or build a later task of the same plan. 3. Approve the Story's BUILD record without running a new code review. Observed (by reading the code): the approval succeeds, because a code-review record for the Story exists and names the other party as reviewer. Expected: completion requires a code review of the build being completed; a review that predates the latest build work does not satisfy it.

## Root cause

The gate check for a BUILD record, otherPartyReviewGap in approveArtifactByJsonPath, reads the code-review record that sits beside the BUILD record and tests two things only: that the record can be read, and that its reviewer party differs from the build's author party. It never compares the review with the build: not the review's creation time against the BUILD record's last update, and not the files the review covered against the build's change log. Before ISSUE-1716f77b a missing code review withheld completion only when enforcement was on; the rule is now unconditional, so the fact that any old record satisfies it matters more.

## Fix intent

The completion rule should be satisfied only by a code review of the build being completed. A review that is older than the latest build work on the Story, or that did not cover it, should withhold approval with a reason that says the review is out of date, and an override reason should still approve past it. Cover it with a test that reviews a Story, changes the build afterwards, and asserts approval is withheld until a new review exists.

## Citations

- **[[c1]]** `code` `src/workflow/gates.ts` — "reviewer = reviewerPartyOf(cr.meta);"
- **[[c2]]** `code` `src/workflow/gates.ts` — "summary: 'completion requires a code review; none was run',"
- **[[c3]]** `prior-artifact` `CR-1716f77ba9ba017b-S001`
- **[[c4]]** `prior-artifact` `LLD-1716f77ba9ba017b-S001`

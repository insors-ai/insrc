# Code self-review of Story a84e610b0a910d49/s1

Reviewer: the controller, which wrote the code. This is **not an independent review**. It exists because the daemon's whole-story review did not pass in its three rounds and the user approved the BUILD with an override on 2026-11-03.

## What the daemon's three rounds established

Review `review-a84e610b0a910d49-s1-r1`, six units (one per Plan task), whole-story scope:

| Round | t1 | t2 | t3 | t4 | t5 | t6 |
|---|---|---|---|---|---|---|
| 1 | passed | passed | passed | failed (finding outside the submitted ranges) | passed | passed |
| 2 | passed | passed | passed | failed (a mangled commit hash in the answer) | passed | passed |
| 3 | passed | passed | passed | incomplete (one MED finding, coverage partial) | passed | passed |

- t1, t2, t3, t5 and t6 passed with verified test coverage in all three rounds. The reviewer re-ran the test files and `tsc --noEmit` itself.
- Round 2's rejected t4 answer carried one valid MED finding: `route-admission.test.ts` did not exercise the BUILD-only route or the DEF-present story role through the real route reader. Fixed in `b1e1d3f03`.
- Round 3 returned a complete t4 assessment: production code "correct and internally consistent with the LLD/plan", one MED finding: the second half of `task-review-plan-path.test.ts` ("skipped when the packet has none") passed whether or not the production change was present. Fixed in `814a8ce0f`.
- No finding concerned production code. Both MED findings were test strength.

## What is not independently reviewed

- `814a8ce0f` (the strengthened plan-path test) was written after round 3 and has had no review by the other party.
- I checked it by running it (it passes), by probing what the request really returns (field `documents`, message "Expected the documents none for this Story's route, got lld"), and by a mutation: putting the older explicit "Expected a plan document" requirement back in `src/daemon/task-review-rpc.ts` makes the test fail; the file was restored from a backup and is byte-identical to the committed one. That is builder evidence, not review.

## Points I checked or want the user to know

1. **The new behaviour has not run in a live review.** The installed daemon and MCP server (`~/.insrc/daemon`, started Nov 2) still have the old code, so this very review was submitted in the old shape (the LLD as the story document). The new code is exercised only by tests: `route-admission.test.ts` runs the real `prepareReviewAdmission` and `readStoryRoute` against on-disk artifacts, and `derived-completion.test.ts` runs the real admission into `inspectTaskCompletion`. Until the clone is updated and the daemon and MCP are restarted, a Story with no Plan still cannot be reviewed.
2. **Plan-driven Stories are unchanged in behaviour.** The 101 task-review tests that existed before the Story pass unchanged. `pinnedTriple` is the old validation moved into a function with the same messages. One narrowing: the story-definition check in the routed path accepts only `body.stories` containing the story (the old fallback on `meta.storyId` is dropped); the daemon reviewer noted this and did not flag it.
3. **Without an `epicHash` there is no route.** `prepareReviewAdmission` builds a route only when `context.epicHash` is set, and falls back to the old story, lld and plan rule otherwise. `startTaskReview` always passes it (it is required there), so production takes the route path; direct callers that omit it, such as older tests, keep the old behaviour.
4. **Two deviations from the approved LLD**, both recorded in the BUILD summaries: the route is built in `prepareReviewAdmission` rather than `startTaskReview` (that branch already holds the project and epic and already reads the BUILD), and `header.derived` was added to the checkpoint schema (additive, optional) because a stored Plan-less review cannot otherwise be re-read without a route. The resume test found the second; it contradicted the LLD's claim that resume reads no route.
5. **A review of an epic Story needs its DEF.** The story role is required exactly when `DEF-<epicHash>.json` exists in `.insrc/artifacts`. If a repository keeps epics elsewhere, the route would call it standalone and refuse a packet that includes the DEF.
6. **The derived unit is thin by design.** Its title and summary are the BUILD focus (or the ISSUE title), and its checks are the LLD acceptance mapping ("Criterion acN is proven by: …"), the ISSUE fix intent, or the BUILD focus. The LLD stores criterion ids and test names, not criterion prose.
7. **Pre-existing failures** are unchanged and recorded in `S001/SWEEP.md`: three daemon code-review files, 17 workflow-gate tests and 22 MCP tests fail identically on the commit before this Story.
8. **Accident during the build:** a `git checkout` used to undo a mutation also reverted an uncommitted `packet.ts` edit once; I re-applied it from the same script before committing t2. No other file was affected.

## Verdict

pass with an override: no known defect, all daemon findings fixed and checked, one test change unreviewed by the other party. Not independent of the author.

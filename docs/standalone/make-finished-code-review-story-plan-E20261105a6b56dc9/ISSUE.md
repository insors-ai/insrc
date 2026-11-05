<!-- insrc:artifact ISSUE-a6b56dc93aa3d2fe -->

# Make a finished code review of a Story with a Plan publishable and resumable

## Reproduction

1. Take a standalone Story whose route has an approved LLD and PLAN but no story document (a bugfix routed issue, design.story, plan, build, or a standalone feature). 2. Call insrc_code_review_step with phase 'start' and packet.documents = { lld, plan }: it is accepted and the review runs. Adding 'story' or 'issue' is refused with "Expected the documents lld, plan for this Story's route". 3. When the review finishes (crPublication pending), call 'publish', 'resume' or a second 'start'. Observed: each fails with "documents: Expected story, lld and plan documents", the findings stay only in .insrc/tmp/code-review/<reviewId>.json, and no CR record is written. Expected: publication and resume accept the same document set the route required at start, and the CR record is written.

## Root cause

Admission validates a new packet against the Story's route (prepareReviewPacket is called with the route, so routedDocuments requires exactly the documents the route produced: lld and plan for a Story with a Plan). But two later paths re-read the stored attempt with no route: publishTaskCheckpoint (publication.ts:25) and the stored-attempt re-read in admission (admission.ts:37). Both pass only attempt.header.derived, and the header keeps derived only for a route WITHOUT a Plan (packet.ts:170, admission.ts:86). For a route with a Plan there is neither a route nor derived, so prepareReviewPacket falls through to pinnedTriple (packet.ts:115), the legacy path from before routes existed, which hard-requires story, lld and plan (packet.ts:49). The stored packet has only lld and plan, so it is refused. The route-aware document check at start and the legacy triple check at re-read disagree for every route that has a Plan and no story document.

## Fix intent

A stored review of a Story with a Plan is re-read against the same document set the route required when it was admitted, so publication and resume succeed for {lld, plan} (and still for the legacy {story, lld, plan} packets already stored). The start-side checks stay as they are: a packet with the wrong document set is still refused. Reviews already written and the stored review format stay readable. The two other items in the GitHub issue (retrying a unit whose reviewer process crashed, and the design review result phase 'Expected union value') are separate defects and are not part of this fix.

## Citations

- **[[c1]]** `code` `src/workflow/code-review/task-review/packet.ts:47-50`
- **[[c2]]** `code` `src/workflow/code-review/task-review/packet.ts:68-73`
- **[[c3]]** `code` `src/workflow/code-review/task-review/packet.ts:113-115`
- **[[c4]]** `code` `src/workflow/code-review/task-review/packet.ts:170-172`
- **[[c5]]** `code` `src/workflow/code-review/task-review/publication.ts:25`
- **[[c6]]** `code` `src/workflow/code-review/task-review/admission.ts:37`
- **[[c7]]** `code` `src/workflow/code-review/task-review/admission.ts:83-86`

<!-- insrc:artifact ISSUE-a84e610b0a910d49 -->

# Make the code review's documents and review units follow the Story's process flow

## Reproduction

Build a small bugfix routed issue then build (no LLD, no Plan), commit it, and call insrc_code_review_step phase start with a packet. There is no Plan or LLD document to pin in documents.lld and documents.plan, and no Story document that carries epicHash (the standalone ISSUE record carries issueHash). Observed on Story 7e0f65fc1a518722/s1, which had an LLD and a Plan: passing the ISSUE record as documents.story was refused with "Document belongs to another epic". For a Story with no LLD and no Plan (32d02eabd856ca2c/s1) the call was not made, because reading the validation shows it cannot succeed: it requires a canonical Plan with tasks and a design.story LLD ("Expected canonical Plan and LLD artifacts"). So no valid packet can be written, no whole-story review can pass, and the BUILD cannot be completed without an override. Expected: a review of the change against the artifacts that route actually produced.

## Root cause

The review is built on a fixed triple. The packet schema requires documents.story, documents.lld and documents.plan (src/workflow/code-review/task-review/contracts.ts:20). prepareReviewPacket loads all three, requires the Plan to be a canonical workflow 'plan' with a storyId and epicHash, requires the LLD to be a workflow 'design.story' for the same story, requires every document to carry the Plan's epicHash, and requires at least one Plan task (src/workflow/code-review/task-review/packet.ts:43-53, 67). Every review unit is a Plan task: admission and publication select and compare task ids from the prepared Plan (src/workflow/code-review/task-review/admission.ts:39-40, 83; src/workflow/code-review/task-review/publication.ts:27-28), and the RPC checks the plan path name (src/daemon/task-review-rpc.ts:43). The completion gate needs a passing whole-story review (src/workflow/code-review/task-review/completion.ts:17). The triage routes trivial (build only), small (LLD then build) and small bugfix (issue then build) produce no Plan, and trivial and bugfix produce no LLD, so none of them can supply the required documents or any review unit. The shape was never made to depend on the route the Story took.

## Fix intent

Make the documents a code review requires, and the units it reviews, depend on the artifacts the Story's route actually produced: a Plan-driven Story still reviews per Plan task against its Story, LLD and Plan; a route without a Plan reviews the build's scope as its unit against whatever design record the route has (the LLD for a small feature, the ISSUE for a bugfix, the build scope for a trivial change). The packet, its validation, assignment, admission, publication, the RPC, the advertised schema and the guide follow the same rule, the whole-story completion gate still demands a passing independent review, and the existing Plan-driven path is unchanged.

## Citations

- **[[c1]]** `code` `src/workflow/code-review/task-review/contracts.ts:20` — "documents: object({ story: DocumentSchema, lld: DocumentSchema, plan: DocumentSchema })"
- **[[c2]]** `code` `src/workflow/code-review/task-review/packet.ts:43-53` — "Expected canonical Plan and LLD artifacts"
- **[[c3]]** `code` `src/workflow/code-review/task-review/packet.ts:67` — "issues.length === 0 && tasks.length > 0"
- **[[c4]]** `code` `src/workflow/code-review/task-review/admission.ts:39-40` — "Saved selected tasks disagree with pinned Plan"
- **[[c5]]** `code` `src/workflow/code-review/task-review/publication.ts:27-28` — "Selected tasks have not all completed"
- **[[c6]]** `code` `src/daemon/task-review-rpc.ts:43` — "Plan identity must match review subject"
- **[[c7]]** `code` `src/workflow/code-review/task-review/completion.ts:17` — "A task-only review does not establish whole-story signoff"

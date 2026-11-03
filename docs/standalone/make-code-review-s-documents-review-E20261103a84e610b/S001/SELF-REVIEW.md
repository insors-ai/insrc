# Self-review of LLD-a84e610b0a910d49-s1

Reviewer: the controller (the session that authored the LLD). Reason: the design review tool (`insrc_review_step`) is a stub, "PENDING REVIEW RE-IMPLEMENTATION", and the code-review guide says design review is unavailable. This is not an independent review; approval needs the user's override reason naming this file.

Reviewed on 2026-11-03 against the code at HEAD. Nothing was executed; every item is a reading of the files named.

## Findings

### F1 (MED): the LLD contradicts itself about where the route is passed

The `startTaskReview` postcondition says the route is passed to `prepareReviewPacket` "on start, resume and publication". The error path for a re-read says resume and publication call it with `historical` true and no route. The code supports the second: `prepareReviewPacket` has three callers, `src/workflow/code-review/task-review/admission.ts:36` (saved attempt, historical), `src/workflow/code-review/task-review/admission.ts:80` (new request) and `src/workflow/code-review/task-review/publication.ts:25` (historical).

Resolution (a plan-stage requirement): only the new-request call at `admission.ts:80` takes a route, so the route must be plumbed from `startTaskReview` through `TaskReviewCoordinator.start` into admission. Resume and publication keep the stored documents and units. The LLD's startTaskReview postcondition is the part to disregard.

### F2 (MED): "exactly the roles that exist" would break the sized-bugfix route

The StoryRoute rule says the required set is "exactly the roles that exist". A sized bugfix (and this very Story) has an ISSUE, an LLD and a PLAN. Read literally, the set would include `issue`. That conflicts with "a Story with a Plan keeps its exact documents" and it would fail validation: the ISSUE record carries `issueHash` and no `epicHash` (checked on `.insrc/artifacts/ISSUE-a84e610b0a910d49.json`), and `prepareReviewPacket` requires every document's `meta.epicHash` to equal the Plan's (`src/workflow/code-review/task-review/packet.ts:49-52`).

Resolution: the `issue` role belongs to the set only for the route with an ISSUE and neither an LLD nor a Plan. The sets are therefore: a Plan exists, then `lld` and `plan`, plus `story` only when a DEF exists for the epicHash; only an LLD exists, then `lld`; only an ISSUE exists, then `issue`; otherwise none. This is also the recommendation for open question 1.

### F3 (LOW): the derived unit's checks from an LLD are criterion ids, not text

The LLD body keeps `testStrategy.acceptanceMapping` entries of `criterionId` and `provingTests` (`src/workflow/artifacts/lld.ts:118-121`); the criterion wording is not in the LLD. The derived unit's acceptance checks for the LLD-only route are therefore of the form "criterion acN is proven by these tests", which is enough for the reviewer but is not prose. Accept.

### F4 (LOW): the advertised packet schema and the guide live in two places

The guide text is in `src/prompts/steering-block.md` (line 330 names "pinned Story/LLD/Plan"), mirrored in the project instructions block. I did not find where the MCP tool's packet schema is advertised (`src/mcp/code-review/handler.ts` does not mention documents); the plan stage has to locate it from the registry before the contract test.

## Checked and found sound

- Downstream of `prepareReviewPacket`, only `prepared.tasks` and `prepared.packet.documents` are used (policy, assessment, admission, publication, record); the new optional roles flow through.
- `inspectTaskCompletion` needs the whole-story review to include every BUILD task id and the BUILD fingerprint; a one-unit derived review with the BUILD's task id satisfies it only on a real pass.
- Old stored packets have story, lld and plan, so the loosened schema still decodes them.
- The four alternatives are complete; rejecting a3 (fabricated Plans) and a4 (changes Plan-driven reviews) is sound.

## Verdict

warn: no HIGH findings; two MED findings (F1, F2) with stated resolutions that the plan stage must carry. Not independent of the author.

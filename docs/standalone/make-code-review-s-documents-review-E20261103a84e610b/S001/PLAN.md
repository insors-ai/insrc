<!-- insrc:artifact PLAN-a84e610b0a910d49-s1 -->

# Plan: STORY-a84e610b0a910d49-s1

## Summary

**Epic:** `make-code-review-s-documents-review`
**LLD run:** `wf-1793696217313-61tmtq`
**LLD effective hash:** `612b71f624f3...`

Building this Story loosens the review packet's stored document shape, teaches the packet validator to require exactly the documents a Story's route produced, derives one review unit for routes that have no Plan, and builds the route from the Story's stored artifacts when a review starts. The guide and the advertised schema then describe the route-dependent set, and an end-to-end case proves a no-Plan Story can complete through the existing gate. Plan-driven reviews and stored history stay exactly as they are.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Make the packet's document roles optional and add the issue role | S | — | — | unit: src/workflow/code-review/task-review/__tests__/packet-documents.test.ts: any subset of the four document roles decodes and a fifth key is refused; unit: src/workflow/code-review/task-review/__tests__/packet-documents.test.ts: a packet, checkpoint and review summary written before the change still decode | [[c1]] [[c2]] |
| 2 | **`t2`** Add the route and require exactly its document set in prepareReviewPacket | M | — | `t1` | unit: src/workflow/code-review/task-review/__tests__/route-documents.test.ts: a Plan route is validated with the same documents, units and messages as without a route; unit: src/workflow/code-review/task-review/__tests__/route-documents.test.ts: an LLD-only, an ISSUE-only and a no-document route accept exactly their set; unit: src/workflow/code-review/task-review/__tests__/route-documents.test.ts: the story role is required only when a DEF exists; unit: src/workflow/code-review/task-review/__tests__/route-documents.test.ts: a document set that differs from the route, or a document of the wrong workflow, epicHash, issueHash or story, is refused | [[c1]] [[c2]] [[c3]] [[c4]] |
| 3 | **`t3`** Derive the single review unit for a route without a Plan | M | — | `t2` | unit: src/workflow/code-review/task-review/__tests__/derived-unit.test.ts: each Plan-less route derives one unit with the BUILD task id and checks from its design record; unit: src/workflow/code-review/task-review/__tests__/derived-unit.test.ts: the unit size follows the number of selected changed files; unit: src/workflow/code-review/task-review/__tests__/derived-unit.test.ts: a Plan-less route with a multi-task BUILD is refused and all changes and tests attribute to the one unit | [[c2]] [[c4]] [[c5]] |
| 4 | **`t4`** Build the route from the Story's stored artifacts when a review starts | M | — | `t3` | integration: src/workflow/code-review/task-review/__tests__/route-admission.test.ts: admission builds the route from the Story's stored artifacts and refuses a packet that does not match it; integration: src/workflow/code-review/task-review/__tests__/route-admission.test.ts: a Story with no BUILD record is refused before anything is admitted; integration: src/workflow/code-review/task-review/__tests__/route-admission.test.ts: resume and publication of a stored review read no route; integration: src/daemon/__tests__/task-review-plan-path.test.ts: the plan-path identity check rejects a wrong plan document and is skipped when the packet has none | [[c2]] [[c5]] [[c6]] |
| 5 | **`t5`** Describe the route-dependent documents in the guide and the advertised schema | S | — | `t4` | unit: src/workflow/code-review/task-review/__tests__/documents-contract.test.ts: the advertised packet schema accepts the four optional roles and matches the stored schema; unit: src/workflow/code-review/task-review/__tests__/documents-contract.test.ts: the guide text states the documents per route | [[c6]] |
| 6 | **`t6`** Prove a no-Plan Story can complete through the existing gate and run the affected suites | M | — | `t4`, `t5` | integration: src/workflow/code-review/task-review/__tests__/derived-completion.test.ts: a passing whole-story review of a derived unit lets inspectTaskCompletion pass; integration: src/workflow/code-review/task-review/__tests__/derived-completion.test.ts: a task-only, non-passing or stale-fingerprint derived-unit review is withheld | [[c1]] [[c4]] [[c5]] |

### 1.1 TASK-a84e610b0a910d49-s1-t1 — Make the packet's document roles optional and add the issue role

Loosen StoredPacketSchema.documents so story, lld, plan and issue are each optional DocumentSchema with no other key allowed, keeping PacketSchema, the checkpoint schema and the review-summary scope in step; parsePacket still checks every present document path.

**Acceptance checks:**
- A packet with any subset of the four roles decodes, a packet with a fifth key is refused, and a packet with story, lld and plan decodes as before
- A checkpoint and a review summary written before the change still decode and validate
- The contracts, compatibility, admission and history tests in src/workflow/code-review/task-review/__tests__ pass unchanged

### 1.2 TASK-a84e610b0a910d49-s1-t2 — Add the route and require exactly its document set in prepareReviewPacket

Add the StoryRoute description (epicHash, storyId, whether a PLAN, LLD, ISSUE and DEF exist, the BUILD's task ids and focus) and make prepareReviewPacket take an optional route: with a route require exactly the set it implies (a Plan: lld and plan, plus story only when a DEF exists; only an LLD: lld; only an ISSUE: issue; otherwise none) and check each document's workflow, epicHash or issueHash and story. With a Plan keep all Plan validation, units and messages. A route without a Plan returns the validated documents and no units until the derived unit is added. Without a route, behave as today.

**Acceptance checks:**
- With a Plan route the documents, units and error messages are exactly those of the existing tests, and without a route prepareReviewPacket re-reads a stored packet as it does today
- An LLD-only, an ISSUE-only and a no-document route each accept exactly their set, and a Plan route whose Story has a DEF requires the story role while a standalone Plan route does not
- A set that differs from the route, a document of the wrong workflow, epicHash, issueHash or story, and an ISSUE role supplied alongside an LLD or Plan are each refused with a message naming the roles or the document

### 1.3 TASK-a84e610b0a910d49-s1-t3 — Derive the single review unit for a route without a Plan

For a route without a Plan make prepareReviewPacket return one unit whose id is the BUILD's task id, with title, summary and acceptance checks taken from the route's design record (the LLD's acceptance mapping, the ISSUE's fix intent, or the BUILD focus) and size from the number of selected changed files (S for one or two, M for three to eight, L above); refuse a Plan-less route whose BUILD has more than one task.

**Acceptance checks:**
- The unit's id is the BUILD task id and its checks come from the LLD acceptance mapping, the ISSUE fix intent or the BUILD focus for the three Plan-less routes
- One or two selected files give size S, three to eight M and nine or more L
- A Plan-less route whose BUILD has more than one task is refused, and every submitted change and test can be attributed to the unit by deriveTaskAssignments

### 1.4 TASK-a84e610b0a910d49-s1-t4 — Build the route from the Story's stored artifacts when a review starts

In the new-request branch of prepareReviewAdmission read the Story's PLAN, LLD, ISSUE, DEF and BUILD records from the project's artifacts with the existing artifact id helpers, build the route and pass it to prepareReviewPacket; refuse a Story with no BUILD record; make the plan-path identity check in startTaskReview run only when the packet carries a plan document. Resume and publication stay historical with no route.

**Acceptance checks:**
- Starting a review for a Story with only a BUILD, only an ISSUE and BUILD, or only an LLD and BUILD admits the matching packet, and a packet that omits a document the Story has or adds one it does not is refused
- The route carries the BUILD's task ids and focus, and a Story with a DEF for its epicHash requires the story role while a standalone Story does not
- A Story with no BUILD record is refused before anything is admitted
- Resume and publication of a stored review do not read the route and behave as before, and the plan-path identity check still rejects a wrong plan document and is skipped when the packet has none

### 1.5 TASK-a84e610b0a910d49-s1-t5 — Describe the route-dependent documents in the guide and the advertised schema

Update the code-review guide text in src/prompts/steering-block.md and its mirror in the project instructions, and the advertised insrc_code_review_step packet schema once found through the schema registry, so they state which documents each route supplies.

**Acceptance checks:**
- The guide and the project instructions describe the documents per route and no longer say every packet needs a Story, an LLD and a Plan
- The advertised packet schema accepts the four optional roles and a contract test fails if it drifts from the stored schema

### 1.6 TASK-a84e610b0a910d49-s1-t6 — Prove a no-Plan Story can complete through the existing gate and run the affected suites

Add the end-to-end case where a derived-unit review of a no-Plan Story reaches a passing whole-story record and inspectTaskCompletion passes, plus the negative cases where it does not; then run the task-review, daemon task-review and workflow-gate suites once, in the foreground by area, and record the result.

**Acceptance checks:**
- A passing whole-story review of a derived unit lets inspectTaskCompletion pass, and a task-only, non-passing or stale-fingerprint review does not
- The task-review, daemon task-review and workflow-gate suites pass, with any failure compared against a clean base checkout

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| prepareReviewPacket with a Plan route: documents, units and error messages unchanged | `t2` |
| prepareReviewPacket with an LLD-only route, an ISSUE-only route and a no-document route: accepted set and the single derived unit | `t2`, `t3` |
| prepareReviewPacket refusing a document set that differs from the route, and a document of the wrong workflow, epicHash or story | `t2` |
| parsePacket and StoredPacketSchema accepting the four optional roles and rejecting any other key, and still decoding a packet written before this change | `t1` |
| startTaskReview reading the Story's stored artifacts to build the route and refusing a missing BUILD | `t4` |
| a full derived-unit review for a no-Plan Story run to a passing whole-story record, then inspectTaskCompletion passing, and failing when the review is not whole-story or the BUILD fingerprint differs | `t6` |
| resume and publication re-reading a stored review without a route | `t4` |
| the insrc_code_review_step packet schema the MCP server advertises | `t5` |
| the code-review guide text | `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 data model: StoredPacketSchema.documents`
- **[[c2]]** `prior-artifact` `LLD s1 contract: prepareReviewPacket and parsePacket`
- **[[c3]]** `prior-artifact` `LLD s1 data model: StoryRoute`
- **[[c4]]** `prior-artifact` `LLD s1 data model: PlanTask derived review unit`
- **[[c5]]** `prior-artifact` `LLD s1 contract: deriveTaskAssignments and inspectTaskCompletion, and the completion error path`
- **[[c6]]** `prior-artifact` `LLD s1 data model: Plan-identity check in startTaskReview, and migration steps 3 and 4`

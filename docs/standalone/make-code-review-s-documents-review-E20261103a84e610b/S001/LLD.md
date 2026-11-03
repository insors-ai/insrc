<!-- insrc:artifact LLD-a84e610b0a910d49-s1 -->

# LLD: STORY-a84e610b0a910d49-s1

## Summary

**Epic:** `make-code-review-s-documents-review`
**HLD base run:** `wf-1793696217313-61tmtq`
**HLD effective hash:** `612b71f624f3...`

The code review stops assuming every Story has a Story document, an LLD and a Plan. The daemon reads which of the Story's artifacts exist (ISSUE, LLD, PLAN, BUILD) and requires the review packet to name exactly those documents. A Story with a Plan is reviewed per Plan task exactly as today; a Story without one is reviewed as a single unit derived from its BUILD task against the design record it does have, so the BUILD can be completed by a passing independent whole-story review on every route.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `prepareReviewPacket`

```typescript
prepareReviewPacket(input: unknown, sources: ReviewSources, historical?: boolean, route?: StoryRoute): Promise<PreparedReviewPacket>
```

**Parameters:**
- `input: unknown` — The submitted packet
- `sources: ReviewSources` — Committed-source reader, unchanged
- `historical: boolean` _(optional)_ — Re-reading a stored packet, unchanged
- `route: StoryRoute` _(optional)_ — The artifacts the Story's route produced, supplied by the daemon from the stored artifacts: epicHash, storyId, which of plan, lld and issue exist, and the BUILD's task ids. Omitted only when re-reading stored history, where the stored documents are the record

**Returns:** `PreparedReviewPacket` — The validated packet, its changes, the review units in tasks and the committed document text; tasks are the Plan's tasks when the route has a Plan and one derived unit otherwise

**Errors:**
- `TaskReviewInputError` when The submitted document set is not exactly the set the route produced, a document is not a committed canonical artifact of the right workflow for this epicHash and story, or the route has a Plan with no tasks

**Preconditions:**
- route comes from the daemon's reading of stored artifacts, never from the packet

**Postconditions:**
- With a Plan: the same documents, validation, units and error messages as today
- Without a Plan: tasks has exactly one unit whose id is the BUILD's task id
- Every submitted change and test can still be attributed to a unit

### 2.2 `parsePacket`

```typescript
parsePacket(input: unknown, historical?: boolean): ReviewPacket
```

**Parameters:**
- `input: unknown` — The submitted or stored packet
- `historical: boolean` _(optional)_ — Accept stored shapes

**Returns:** `ReviewPacket` — The decoded packet whose documents map may hold any of story, lld, plan and issue

**Errors:**
- `TaskReviewInputError` when A document path is not repository-relative, or a key outside the four roles is present

**Postconditions:**
- Every stored packet written before this change still decodes

### 2.3 `startTaskReview`

```typescript
startTaskReview(raw: unknown, trusted?: TrustedRpcContext, deps?: TaskReviewRpcDeps): Promise<unknown>
```

**Parameters:**
- `raw: unknown` — The start or resume request
- `trusted: TrustedRpcContext` _(optional)_ — Unchanged
- `deps: TaskReviewRpcDeps` _(optional)_ — Unchanged

**Returns:** `Promise<unknown>` — The acknowledgement, unchanged

**Errors:**
- `TaskReviewInputError` when The plan-path identity check applies only when the route has a Plan; a missing BUILD for the Story is refused

**Preconditions:**
- epicHash is canonical and the Story's BUILD record exists

**Postconditions:**
- The route is read from the Story's stored artifacts and passed to prepareReviewPacket on start, resume and publication

### 2.4 `deriveTaskAssignments`

```typescript
deriveTaskAssignments(prepared: PreparedReviewPacket, attribution: readonly TaskAttribution[]): readonly TaskAssignment[]
```

**Parameters:**
- `prepared: PreparedReviewPacket` — Carries the units
- `attribution: readonly TaskAttribution[]` — Unchanged

**Returns:** `readonly TaskAssignment[]` — One assignment per unit, unchanged

**Postconditions:**
- Unchanged behaviour: it already works for any prepared.tasks

### 2.5 `inspectTaskCompletion`

```typescript
inspectTaskCompletion(input: unknown, build: unknown, epicHash: string, storyId: string): { counts: { high: number; med: number; low: number }; gap?: string }
```

**Parameters:**
- `input: unknown` — The CR record
- `build: unknown` — The BUILD record
- `epicHash: string` — Identity
- `storyId: string` — Identity

**Returns:** `object` — Counts and the first gap, unchanged

**Postconditions:**
- Unchanged: a derived unit id equal to the BUILD task id satisfies the BUILD-task coverage check only when a whole-story review actually passed

## 3. Data model changes

### 3.1 `StoredPacketSchema.documents` — field-modify

From a required {story, lld, plan} to an object whose keys story, lld, plan and issue are each optional DocumentSchema and no other key is allowed. PacketSchema is cloned from it, so submissions and stored history share the shape. The required set is not in the schema: prepareReviewPacket requires it from the route. Relationship: each document is a pointer {path, commit} to a committed canonical artifact owned by the Story (many documents to one Story; the Story's route fixes which exist). Compatibility: every stored packet has all three of story, lld and plan, so it still decodes, and a stored review summary's scope.documents (a Pick of StoredPacketSchema) and the checkpoint schema follow the same shape.

```
documents: { story: Document, lld: Document, plan: Document }  ->  documents: { story?: Document, lld?: Document, plan?: Document, issue?: Document }
```

**Call sites:**
- `src/workflow/code-review/task-review/contracts.ts:18-21`
- `src/workflow/code-review/task-review/contracts.ts:64-68`
- `src/workflow/code-review/task-review/record.ts:12`
- `src/workflow/code-review/task-review/contracts.ts:105`

### 3.2 `StoryRoute (daemon-supplied, not persisted)` — new

A read-only description of the Story's stored artifacts: epicHash, storyId, whether a PLAN, an LLD and an ISSUE record exist under their artifact ids, and the BUILD record's task ids and focus. It is derived in the daemon from planArtifactId, lldArtifactId, issueArtifactId and buildArtifactId read with artifactJsonPath, so the route follows what was actually produced. The required document set is: story, lld and plan when a PLAN exists (an epic or a standalone sized Story); lld alone when only an LLD exists; issue alone when only an ISSUE exists; none when neither exists (trivial). A PLAN with no LLD, or an LLD and a PLAN with an ISSUE, are handled by the same rule: exactly the roles that exist, with story added only when the Plan route has a Story definition.

**Call sites:**
- `src/daemon/task-review-rpc.ts:25-60`
- `src/workflow/storage.ts:374-391`
- `src/workflow/storage.ts:816`

### 3.3 `PlanTask (derived review unit)` — new

When the route has no Plan, prepared.tasks holds one PlanTask-shaped unit: id equal to the BUILD's task id (so the completion gate's BUILD-task coverage check holds), order 1, a title and summary taken from the design record (ISSUE title, LLD story title, or BUILD focus), acceptanceChecks taken from that record's stated done conditions (the ISSUE's fix intent; the LLD's acceptance criteria with their proving tests; the BUILD focus for a trivial change), size derived from the number of selected changed files, empty dependsOn and derivedFrom and no planned tests. It is never written to disk; it exists only in the prepared packet.

**Call sites:**
- `src/workflow/code-review/task-review/packet.ts:19-20`
- `src/workflow/code-review/task-review/packet.ts:115-131`
- `src/workflow/code-review/task-review/admission.ts:83`
- `src/workflow/code-review/task-review/publication.ts:27-28`

### 3.4 `Plan-identity check in startTaskReview` — invariant-change

The check that documents.plan.path ends with PLAN-<epicHash>-<story>.json or /PLAN.md applies only when the route has a Plan; for other routes the equivalent identity is checked in prepareReviewPacket against the document the route requires (the LLD or ISSUE artifact id for this epicHash and story).

**Call sites:**
- `src/daemon/task-review-rpc.ts:43`

## 4. Error paths

**Error cases**

- **The packet names a document the route did not produce (for example a plan for a Story with only an ISSUE), or omits one it did** (recoverable)
  - Detection: prepareReviewPacket compares the set of keys in packet.documents with the set the StoryRoute requires and throws TaskReviewInputError on documents naming the extra or missing role
  - Response: Refuse the start with the message naming the roles required and the roles supplied; nothing is admitted or written
  - User impact: The controller corrects the packet and calls start again
- **A required document is not a committed canonical artifact of the right workflow for this epicHash and story** (recoverable)
  - Detection: The document loader reads the committed blob and its canonical JSON head, then checks meta.workflow (plan, design.story, issue) and, per role, meta.epicHash or meta.issueHash against the route's epicHash and meta.storyId against the story
  - Response: Refuse with TaskReviewInputError naming documents.<role>
  - User impact: The controller pins the right artifact at a commit that contains it
- **The route has a PLAN record that has no tasks or malformed tasks** (recoverable)
  - Detection: The existing Plan row validation (tasksEnumerateSchema, validatePlanRows, tasks.length > 0) runs whenever the route has a Plan
  - Response: Refuse exactly as today
  - User impact: A broken Plan still blocks review, as it should
- **The Story has no BUILD record, or the BUILD has no task ids** (recoverable)
  - Detection: startTaskReview reads buildArtifactId for the Story via artifactJsonPath and checks body.tasks before building the route
  - Response: Refuse with a message that the BUILD must exist before a review; no derived unit is invented
  - User impact: The review cannot start before the build has been validated
- **A route with no Plan whose BUILD has more than one task id** (terminal)
  - Detection: The route builder counts BUILD body.tasks
  - Response: Refuse: the design derives one unit from a single BUILD task, and a multi-task BUILD without a Plan has no defined units
  - User impact: Such a BUILD would need a Plan; this cannot arise from the current routes
- **A stored packet or checkpoint is re-read after the route's artifacts changed (for example a Plan was added later)** (recoverable)
  - Detection: Resume and publication re-read stored history with historical true and no route, so the stored documents and units are used; admission still compares the saved selected task ids with the prepared ones
  - Response: Keep reviewing against the pinned stored documents; a mismatch between saved and prepared task ids is refused as today
  - User impact: A review started on one route is not silently re-interpreted
- **The completion gate sees a derived-unit review whose unit id is not the BUILD task id** (recoverable)
  - Detection: inspectTaskCompletion already requires every BUILD task id among the whole-story review's task ids
  - Response: Report the gap 'Whole-story review does not cover every current BUILD task' and withhold completion
  - User impact: BUILD approval stays withheld until a correct review exists

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Epic Story with DEF, HLD, LLD and PLAN, packet with story, lld and plan | Validated and reviewed per Plan task exactly as before, with the same error messages |
| Standalone sized Story with LLD and PLAN and no Story definition document | The route has a Plan, so lld and plan are required and story is required only when the Story definition exists as an artifact; the choice is fixed in the LLD's rule for the story role |
| Small feature route: LLD and BUILD only | documents is {lld}; one derived unit with the LLD's acceptance criteria as its checks |
| Small bugfix route: ISSUE and BUILD only | documents is {issue}; the ISSUE's meta.issueHash equals the epicHash; one derived unit with the ISSUE's fix intent as its check |
| Trivial route: BUILD only | documents is {}; one derived unit whose acceptance check is the BUILD focus |
| Re-reading a review stored before this change | It decodes (story, lld and plan are present), validates with historical true and no route, and is displayed and published unchanged |
| Derived unit with a large selected change set | Size L (15 minute timeout) above the file-count thresholds, S at or below the smallest; every selected change and test is attributed to the single unit |

**Invariants to preserve**

- Everything downstream of prepareReviewPacket consumes prepared.tasks and prepared.packet.documents only, so the units' ids are the only coupling between the packet and the admission, publication and completion checks. [[c2]]
- Stored packets, checkpoints and review-summary scopes written before this change must still decode and validate; the documents schema only becomes more permissive. [[c3]]
- A Story with a Plan keeps its exact documents, units, task attribution and error messages. [[c1]]
- BUILD completion requires a passing whole-story review that covers every BUILD task id and carries the BUILD's fingerprint and reviewer provenance; the derived unit must not weaken any of these. [[c4]]
- The route is never taken from the submitted packet; it comes from the Story's stored artifacts, and the daemon chooses the reviewer from the BUILD's author as today. [[c5]]

## 5. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test), tests in src/workflow/code-review/task-review/__tests__ and src/daemon/__tests__`

**Test levels**

- **unit** — Prove the packet validation, the route rule and the derived unit with committed fixtures built in a temporary git repository
  - Subjects: `prepareReviewPacket with a Plan route: documents, units and error messages unchanged`, `prepareReviewPacket with an LLD-only route, an ISSUE-only route and a no-document route: accepted set and the single derived unit`, `prepareReviewPacket refusing a document set that differs from the route, and a document of the wrong workflow, epicHash or story`, `parsePacket and StoredPacketSchema accepting the four optional roles and rejecting any other key, and still decoding a packet written before this change`
  - Fixtures: `a temporary git repository with committed PLAN, LLD, ISSUE and BUILD artifact JSON for each route`, `the existing review-source helper used by the task-review tests`
- **integration** — Prove the daemon builds the route from stored artifacts and that a derived-unit review can complete a BUILD through the existing gate
  - Subjects: `startTaskReview reading the Story's stored artifacts to build the route and refusing a missing BUILD`, `a full derived-unit review for a no-Plan Story run to a passing whole-story record, then inspectTaskCompletion passing, and failing when the review is not whole-story or the BUILD fingerprint differs`, `resume and publication re-reading a stored review without a route`
  - Fixtures: `a stand-in reviewer provider as the existing coordinator tests use`, `a temporary repo with the Story's artifacts under .insrc/artifacts`
- **contract** — Prove the advertised packet schema and the guide describe the route-dependent documents
  - Subjects: `the insrc_code_review_step packet schema the MCP server advertises`, `the code-review guide text`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `a Story with a Plan is validated with the same documents, units and error messages as before`, `a packet stored before this change still decodes and re-validates` |
| `ac2` | `an LLD-only route accepts exactly the lld document and derives one unit from the BUILD task`, `an ISSUE-only route accepts exactly the issue document and derives one unit from the ISSUE fix intent`, `a no-document route derives one unit from the BUILD focus` |
| `ac3` | `a document set that is not exactly the route's set is refused naming the roles`, `the route comes from the stored artifacts and a packet cannot drop a Plan the Story has`, `a document of the wrong workflow, epicHash or story is refused` |
| `ac4` | `resume and publication of a stored review work without a route`, `startTaskReview refuses a Story with no BUILD record or a multi-task BUILD and no Plan` |
| `ac5` | `a passing whole-story review of a derived unit lets inspectTaskCompletion pass`, `a task-only or non-passing or stale-fingerprint derived-unit review is withheld by inspectTaskCompletion` |
| `ac6` | `the advertised insrc_code_review_step packet schema and the guide state the route-dependent documents` |

## 6. Migration

**State before:** The review packet requires documents {story, lld, plan} and prepareReviewPacket takes the epicHash and storyId from the Plan, requires every document to belong to the Plan's epic, and derives all review units from the Plan's tasks. A Story whose route produced no Plan (and, for trivial and bugfix routes, no LLD) cannot submit a valid packet, so it can never obtain the passing whole-story review the BUILD completion gate demands (see the analyze bundles on the packet validation, the Plan-task units and the completion gate).

**State after:** The packet's documents are an object whose story, lld, plan and issue roles are optional in the schema. The daemon reads the Story's stored artifacts to build a route, and prepareReviewPacket requires exactly the roles the route produced. With a Plan the units are the Plan's tasks as before; without a Plan one derived unit carries the BUILD's task id. Stored packets, checkpoints and review records written before the change decode and validate unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Loosen the stored and submitted packet schemas so each document role is optional and an issue role is allowed, keeping additionalProperties false so no other key is accepted; stored history still decodes because every stored packet has story, lld and plan — ↩ rollbackable
2. Teach prepareReviewPacket to take an optional route, require exactly the route's document roles, keep the existing Plan validation when the route has a Plan, and derive one review unit from the BUILD task when it does not — ↩ rollbackable
3. Have the daemon entry read the Story's PLAN, LLD, ISSUE and BUILD records to build the route on start, resume and publication, and apply the Plan-path identity check only when the route has a Plan — ↩ rollbackable
4. Update the advertised packet schema, the code-review guide and the project instructions that describe the three documents so they describe the route-dependent set — ↩ rollbackable
5. Run the Plan-driven review tests unchanged, then the new route tests, before relying on the new routes for a real BUILD — ↩ rollbackable

**Backward compat:** The packet schema only becomes more permissive, so every packet a controller sends today (story, lld and plan) is still accepted and validated by the same rules and messages. Stored checkpoints and published code-review records keep their documents and decode as before. A controller on a no-Plan route that previously could not start a review can now start one. A packet that names a document the route did not produce is now refused with a message naming the roles, which is stricter only for Stories that previously could not pass at all.

## 7. Alternatives considered

### 7.1 a1: Route-derived document set and a derived single review unit — **CHOSEN**

The host works out the Story's route from its stored artifacts, requires exactly the documents that route produced, and for a route without a Plan derives one review unit from the BUILD's task.

The packet's documents become a map of the roles the route produced: story, lld and plan for a Plan-driven Story (unchanged), lld alone for a small feature, issue alone for a small bugfix, none for a trivial change. prepareReviewPacket no longer trusts the submitter on what is required: it reads the Story's stored artifacts (ISSUE, LLD, PLAN, BUILD for the epicHash and storyId) to find the route, then requires the submitted set to equal the set that route produced and each document to be a committed canonical artifact of the right workflow for this story. When there is a Plan its tasks are the units as today. When there is none, prepared.tasks holds one derived unit whose id is the BUILD's task id (s1), whose acceptance checks come from the design record the route has (the LLD's acceptance criteria and test strategy, the ISSUE's fix intent, or the BUILD focus), and whose size is derived from the selected change count. Everything downstream already consumes prepared.tasks and prepared.packet.documents, so it needs no change except the stored shapes, which accept the new keys as optional while old records stay readable.

### 7.2 a2: Explicit route field in the packet, discriminated union

The submitter names the route in the packet and the schema is a union of one shape per route.

The packet gains a route field with the values epic-story, feature, small, trivial, bugfix-small and bugfix-sized, and the schema becomes a discriminated union whose members list the exact documents each route requires. The validator dispatches on route, and the route is cross-checked against the BUILD record's sizeClass and standalone flag. Units and the derived unit work as in a1. The MCP and RPC advertise the union.

**Rejected because:** Works but recreates a route enumeration in the schema and duplicates what the stored artifacts already say.

### 7.3 a3: Generate a minimal Plan for routes without one

Keep the triple but have the build step write a one-task Plan and, where missing, an LLD stub so the review always finds them.

The build stage writes a canonical one-task PLAN record (and an LLD record for the issue-only and build-only routes) alongside the BUILD, so prepareReviewPacket and everything downstream is unchanged and the packet still lists story, lld and plan.

**Rejected because:** Falsifies the ledger to fit the validator, which is the opposite of following the process flow.

### 7.4 a4: Review the BUILD's tasks for every route

Make the BUILD record the only required input and treat the design documents as optional context for all routes.

The review units are always the BUILD's tasks, with acceptance checks taken from the Plan task of the same id when a Plan exists and from the available design record otherwise. All three design documents become optional context, so the validation stops requiring a Plan for any route.

**Rejected because:** Uniform and simple, but it changes Plan-driven reviews and lets a Story omit its Plan.

## 8. References

- **[[c1]]** `code` `src/workflow/code-review/task-review/packet.ts:42-70` — "Expected canonical Plan and LLD artifacts"
- **[[c2]]** `code` `src/workflow/code-review/task-review/packet.ts:115-131` — "deriveTaskAssignments"
- **[[c3]]** `code` `src/workflow/code-review/task-review/record.ts:12` — "scope: Type.Pick(StoredPacketSchema, ['storyId', 'taskId', 'documents', 'reviewSet'])"
- **[[c4]]** `code` `src/workflow/code-review/task-review/completion.ts:8-25` — "Whole-story review does not cover every current BUILD task"
- **[[c5]]** `code` `src/daemon/task-review-rpc.ts:43` — "Plan identity must match review subject"

## 9. Open questions

- Which Story-definition document does a Plan-driven standalone Story pin as documents.story? Recommendation: the story role is required only when a DEF exists for the epicHash (an epic Story, where it is the DEF); a standalone Story has none, so its set is lld and plan, and the plan-path identity check uses the Plan artifact id.
- Should the derived unit's size thresholds be fixed in the LLD? Recommendation: S for one or two changed files, M up to eight, L above, so the unit's timeout is 5, 10 or 15 minutes as the existing size table gives.

## Resolved questions

- `q37e4475d` — Which Story-definition document does a Plan-driven standalone Story pin as documents.story? Recommendation: the story role is required only when a DEF exists for the epicHash (an epic Story, where it is the DEF); a standalone Story has none, so its set is lld and plan, and the plan-path identity check uses the Plan artifact id.
  - **resolved**: Required document set by the Story's stored artifacts: a Plan exists, then lld and plan, plus story only when a DEF exists for the epicHash; only an LLD exists, then lld; only an ISSUE exists (no LLD, no Plan), then issue; otherwise none. The issue role is never part of the set when a Plan or an LLD exists. The plan-path identity check uses the Plan artifact id, and only when the route has a Plan. — User accepted the recommendation with the self-review F2 correction (SELF-REVIEW.md): the issue role applies only to the ISSUE-only route. Also from F1: only the new-request call of prepareReviewPacket (admission.ts:80) takes a route, plumbed from startTaskReview through the coordinator start into admission; resume and publication stay historical with no route, and the LLD's startTaskReview postcondition that says otherwise is superseded. _(2026-11-03T09:10:48.859Z)_
- `qfba5a774` — Should the derived unit's size thresholds be fixed in the LLD? Recommendation: S for one or two changed files, M up to eight, L above, so the unit's timeout is 5, 10 or 15 minutes as the existing size table gives.
  - **resolved**: Derived unit size by selected changed files: S for one or two, M for three to eight, L above eight, giving the existing 5, 10 and 15 minute timeouts. — User accepted the recommendation. _(2026-11-03T09:11:14.379Z)_

## Citations

- **[[c1]]** `code` `src/workflow/code-review/task-review/packet.ts:42-70` — "Expected canonical Plan and LLD artifacts"
- **[[c2]]** `code` `src/workflow/code-review/task-review/packet.ts:115-131` — "deriveTaskAssignments"
- **[[c3]]** `code` `src/workflow/code-review/task-review/record.ts:12` — "scope: Type.Pick(StoredPacketSchema, ['storyId', 'taskId', 'documents', 'reviewSet'])"
- **[[c4]]** `code` `src/workflow/code-review/task-review/completion.ts:8-25` — "Whole-story review does not cover every current BUILD task"
- **[[c5]]** `code` `src/daemon/task-review-rpc.ts:43` — "Plan identity must match review subject"

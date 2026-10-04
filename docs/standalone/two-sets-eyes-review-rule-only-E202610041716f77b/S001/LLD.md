<!-- insrc:artifact LLD-1716f77ba9ba017b-S001 -->

# LLD: E202610041716f77b:S001

## Summary

**Epic:** `two-sets-eyes-review-rule-only`
**HLD base run:** `wf-1791143766097-bxkynw`
**HLD effective hash:** `9c39702f35b7...`

Every review is done by the party that did not write the work. Each artifact and build records who wrote it (the controller or the daemon), each review records who did it, and the two existing review tools send the work to the other side. Approval of a DEF, HLD, LLD or BUILD requires a review by the other party; the user can still override with a reason.

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

### 2.1 `finalizeArtifact`

```typescript
finalizeArtifact(intent, stepOutputs, runId, elapsedMs, llmResponse, model?, attribution?, authoredBy?: 'controller' | 'daemon'): Promise<FinalizeResult>
```

**Parameters:**
- `authoredBy: 'controller' | 'daemon'` _(optional)_ — The party that authored the artifact. The MCP synthesize phase passes `controller`; both daemon workflow-run calls pass `daemon`.

**Returns:** `Promise<FinalizeResult>` — Unchanged, except the artifact's meta carries authoredBy when it was given.

**Postconditions:**
- Omitting authoredBy produces the same output as today.

### 2.2 `persistBuildRecord`

```typescript
persistBuildRecord(repoPath: string, rec: BuildRecord): { md: string; json: string }
```

**Parameters:**
- `rec.meta.authoredBy: 'controller' | 'daemon'` _(optional)_ — The party that wrote the code. The two build-step writers stamp `controller`. The approval-time writer stamps nothing.

**Returns:** `{ md: string; json: string }` — Unchanged. The existing merge keeps an authoredBy already on the record.

### 2.3 `reviewArtifactFile`

```typescript
reviewArtifactFile(opts): Promise<ReviewArtifactResult>
```

**Returns:** `Promise<ReviewArtifactResult>` — Unchanged, except the review it stamps carries reviewedBy `daemon`. The controller loop's verdicts phase stamps reviewedBy `controller`.

### 2.4 `runCodeReview`

```typescript
runCodeReview(subject, provider, opts & { reviewedBy?: 'controller' | 'daemon' }): Promise<CodeReviewOutcome>
```

**Parameters:**
- `reviewedBy: 'controller' | 'daemon'` _(optional)_ — The party running the review. The MCP handler passes `controller`; the daemon's code-review method passes `daemon`.

**Returns:** `Promise<CodeReviewOutcome>` — Unchanged, except the code-review record's meta carries reviewedBy when it was given.

### 2.5 `approveArtifactByJsonPath`

```typescript
approveArtifactByJsonPath(jsonPath: string, opts?: { overrideReview?: string }): ApprovalResult
```

**Returns:** `ApprovalResult` — Unchanged on success.

**Errors:**
- `ReviewBlockedError` when Existing: the review's verdict blocks. New: a DEF, HLD or LLD has no review; or any artifact's review was done by the party that authored it, both parties known. None of these applies when overrideReview is given.

**Postconditions:**
- ISSUE, SPEC and PLAN artifacts need no review and are approved on the user's approval alone.
- An unknown author or an unknown reviewer never withholds approval by itself.
- The override reason is recorded on the artifact, as today.

### 2.6 `approveWorkflowTarget`

```typescript
approveWorkflowTarget(req: WorkflowApproveRequest, opts?): Promise<WorkflowApproveResult>
```

**Returns:** `Promise<WorkflowApproveResult>` — Unchanged shape. A BUILD record is withheld into skipped[] when the Story has no code review, whether or not the enforcement setting is on, and when the code review was done by the party that authored the build, both known. overrideReview approves past either.

**Postconditions:**
- A batch approval skips each withheld artifact with its reason and continues.

## 3. Data model changes

### 3.1 `Party fields` — field-add

Optional `authoredBy` on artifact meta and BUILD record meta; optional `reviewedBy` on the design review stamp and the code-review record. Both take 'controller' or 'daemon'. Two small shared readers return the party: the explicit field when present; otherwise, for older design artifacts and reviews, `controller` when the stored model label is 'client' and `daemon` for any other label; otherwise unknown. An older BUILD record's author is unknown.

**Call sites:**
- `src/workflow/types.ts`
- `src/workflow/orchestrator.ts`
- `src/workflow/runners/build/standalone-record.ts`
- `src/workflow/review/types.ts`
- `src/workflow/code-review/types.ts`

### 3.2 `Daemon request to review an existing design artifact` — new

A new daemon stream method, workflow.review, takes an artifact path and runs reviewArtifactFile with the provider the role router resolves for the `review` role, as the TUI review service does. It refuses an artifact the daemon authored. The MCP server gets one helper to call it and one to call the existing codeReview.run, both built like the existing workflow-run stream helper.

**Call sites:**
- `src/daemon/index.ts`
- `src/daemon/workflow-rpc.ts`
- `src/mcp/daemon-stream.ts`

### 3.3 `Routing inside insrc_review_step and insrc_code_review_step` — invariant-change

On `start`, each tool reads the author party. Daemon-authored: today's controller loop, unchanged. Controller-authored or unknown: the tool asks the daemon to review, waits, and returns `done` with the verdict in the same turn. If the daemon is unreachable, fails, is too old to know the request, or exceeds the wait limit, the tool returns an error saying so; it never falls back to a controller review. The controller-loop phases refuse to stamp a review of controller-authored work.

**Call sites:**
- `src/mcp/review-step/phases/start.ts`
- `src/mcp/review-step/phases/verdicts.ts`
- `src/mcp/code-review-step/handler.ts`
- `src/daemon/code-review-rpc.ts`

### 3.4 `Written rule` — invariant-change

The steering source, the two review tool descriptions and the daemon comments are rewritten to say: the party that did not author the work reviews it, in both directions; the review tools route this themselves; the same model on both sides is acceptable; approval requires the review. The guides and the plugin copy follow from the steering source.

**Call sites:**
- `src/prompts/steering-block.md`
- `src/mcp/server.ts`
- `src/daemon/workflow-rpc.ts`

## 4. Error paths

**Error cases**

- **A review tool asks the daemon to review and the daemon is not running, closes the connection, fails part-way, or does not know the request because it is an older build.** (recoverable)
  - Detection: The MCP stream helper sees a connection error, a close before the final frame, an error frame, or an `unknown method` answer.
  - Response: The tool returns an error naming the cause (and, for an older daemon, telling the user to update it). Nothing is stamped. No controller review is offered.
  - User impact: The artifact has no review, so approval is withheld. The user starts or updates the daemon and retries, or overrides at approval with a reason.
- **The daemon review takes longer than the tool's wait limit.** (recoverable)
  - Detection: A timer in the review tool expires before the final frame arrives.
  - Response: The tool aborts the request and returns a timeout error. Nothing is stamped.
  - User impact: Same as a failed review: retry or override.
- **A party is asked to review its own work: the daemon is asked to review a daemon-authored artifact or build, or the controller submits verdicts or judgements for controller-authored work.** (recoverable)
  - Detection: The reviewer reads the author party before stamping and compares it with its own.
  - Response: The request is refused with a same-party error. Nothing is stamped.
  - User impact: The user is told which party must review instead.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An artifact or review written before this change, with no party field. | It stays readable. A design artifact's and a review's party is inferred from the stored model label; a BUILD record's author is unknown. An unknown party never withholds approval by itself. |
| An unapproved DEF, HLD, LLD or BUILD record that was never reviewed. | Withheld at approval until it is reviewed or the user overrides. Already approved records are not re-examined. |
| An ISSUE, SPEC or PLAN with no review. | Approved on the user's approval alone. |
| A daemon workflow run reviews the artifact it just authored (its opt-in finalize review). | The review is stamped `daemon` on a `daemon`-authored artifact, so approval withholds it as a same-party review until the controller reviews it or the user overrides. |
| A batch approval covers reviewed and unreviewed artifacts. | The unreviewed and same-party ones are listed in skipped[] with a reason; the rest are approved. |

**Invariants to preserve**

- A review whose verdict blocks withholds approval unless overridden, and the override reason is recorded on the artifact. [[c1]]
- Calling finalizeArtifact, persistBuildRecord or runCodeReview without the new argument produces the same output as today. [[c2]]
- The daemon-authored path through both review tools (the controller loop) behaves as it does today. [[c3]]

## 5. Test strategy

**Test framework:** `node:test via `npx tsx --test` under Node 22`

**Test levels**

- **contract** — The Story lists no acceptance criteria, so they are defined here.
  - Subjects: `ac1: controller-authored work is reviewed by the daemon and daemon-authored work by the controller, for design artifacts and for code, through the two existing review tools`, `ac2: new artifacts, BUILD records and reviews record their party; older ones stay readable`, `ac3: approval of a DEF, HLD, LLD or BUILD requires a review by the other party, with the existing override; ISSUE, SPEC and PLAN need none`, `ac4: a failed daemon review is reported and never replaced by a controller review`, `ac5: the steering and both review tool descriptions state the rule in both directions`
- **unit** — Party stamps and readers.
  - Subjects: `T1 the two readers: explicit field wins; model label 'client' reads as controller and any other label as daemon; nothing stored reads as unknown`, `T2 finalizeArtifact stamps the authoredBy it is given and writes the same output as before when given none`, `T3 a BUILD record keeps its authoredBy across a later write that omits it`, `T4 each review path stamps its own party: controller loop, reviewArtifactFile, and runCodeReview with each value`
  - Fixtures: `the existing finalizeArtifact test harness`
- **unit** — The approval gate.
  - Subjects: `T5 a DEF, an HLD and an LLD with no review are withheld and approved with an override; an ISSUE, a SPEC and a PLAN with no review are approved`, `T6 a same-party review withholds; an other-party non-blocking review approves; an unknown author or reviewer does not withhold`, `T7 a BUILD record is withheld with no code review (enforcement off and on) and with a same-party code review; an override approves`, `T8 a batch approval lists withheld artifacts in skipped[] and approves the rest`
  - Fixtures: `the existing gate test fixtures`
- **integration** — Routing in the two review tools, with the daemon faked.
  - Subjects: `T9 insrc_review_step: controller-authored or unknown-author artifact goes to the daemon and returns done with the verdict; daemon-authored runs the controller loop as before`, `T10 insrc_code_review_step: the same two routes`, `T11 daemon unreachable, error frame, `unknown method` and timeout each return an error, stamp nothing and offer no controller loop`, `T12 the daemon refuses to review daemon-authored work, and the controller-loop phases refuse to stamp a review of controller-authored work`
  - Fixtures: `a fake daemon over the stream helper's injected connect`
- **unit** — The written rule.
  - Subjects: `T13 the steering source and both tool descriptions state the rule in both directions and no longer say review is a controller task`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `T9`, `T10`, `T12` |
| `ac2` | `T1`, `T2`, `T3`, `T4` |
| `ac3` | `T5`, `T6`, `T7`, `T8` |
| `ac4` | `T11` |
| `ac5` | `T13` |

## 6. Migration

**State before:** No record says which party authored an artifact or a build. The review tools always run the controller loop. Approval refuses only a blocking review: an unreviewed design artifact is approvable, and an unreviewed BUILD is withheld only under an enforcement setting that is off by default. The steering says review is a controller task.

**State after:** Artifacts, BUILD records and reviews record their party. The two review tools send the work to the party that did not author it. Approval of a DEF, HLD, LLD or BUILD requires a review by the other party, with the existing override. The steering states the rule in both directions.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional party fields and the two readers; stamp the author at artifact finalize and in the build-step BUILD writers; stamp the reviewer in each review path. — ↩ rollbackable
2. Add the daemon request to review an existing artifact and the two MCP stream helpers; make each reviewer refuse its own party's work. — ↩ rollbackable
3. Route inside insrc_review_step and insrc_code_review_step by author party. — ↩ rollbackable
4. Make the approval gate require an other-party review for DEF, HLD, LLD and BUILD, with the existing override. — ↩ rollbackable
5. Rewrite the steering source, the two tool descriptions and the daemon comments. — ↩ rollbackable

**Backward compat:** No stored data is rewritten; the new fields are optional and older records stay readable. Three behaviours change for users: (1) insrc_review_step and insrc_code_review_step on controller-authored work now return the daemon's verdict in one turn instead of handing the controller a review to do; (2) an unapproved DEF, HLD, LLD or BUILD with no review can no longer be approved without a review or an override reason; (3) the daemon and the MCP server must both be on the new build, otherwise the tools report a failed daemon review. Known limit: the daemon cannot run tests, so its code review reports test results as unverified.

## 7. Alternatives considered

### 7.1 a1: Explicit party fields, routing inside the review tools — **CHOSEN**

Record author and reviewer party as explicit fields; the two existing review tools route to the other party; the gate checks the fields.

Add an optional author party to artifact meta and BUILD record meta, and an optional reviewer party to the design review stamp and the code-review record. The writers that know their side stamp it. The existing insrc_review_step and insrc_code_review_step tools read the author and either run today's controller loop (daemon-authored) or ask the daemon to review (controller-authored or unknown). The approval gate requires a review by the other party.

### 7.2 a2: Infer the party from the model label

Add no fields; treat the model label 'client' as the controller and anything else as the daemon.

Derive author and reviewer party from labels already stored (the artifact's attribution and the review's model). Routing and the gate use the derived value.

**Rejected because:** Covers design artifacts but cannot tell who authored a build, so code review cannot be routed or gated. Kept only as the fallback for reading older design artifacts.

### 7.3 a3: Steering only

Rewrite the steering to say who reviews and leave the tools and the gate unchanged.

State the rule in both directions in the steering and tool descriptions and rely on the controller to call the right reviewer. Nothing is recorded or enforced.

**Rejected because:** Enforces nothing and leaves the controller with no way to request a daemon design review; it restates the situation the issue describes.

## 8. References

- **[[c1]]** `code` `src/workflow/gates.ts`
- **[[c2]]** `code` `src/workflow/orchestrator.ts`
- **[[c3]]** `code` `src/mcp/review-step/phases/start.ts`
- **[[c4]]** `prior-artifact` `ISSUE-1716f77ba9ba017b`
- **[[c5]]** `stakeholder` `user, 2026-10-04` — "review artifacts need to be submitted for approval"
- **[[c6]]** `stakeholder` `user, 2026-10-04` — "these 3 don't need review steps, only user approval"

## 9. Open questions

- How long should a review tool wait for the daemon review? On 2026-10-04 a non-controller design review of a 40 KB design took 12 minutes for one pass and 27 minutes with its automatic second pass. A tool call may not be able to wait that long.

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

**Preconditions:**
- Declared at src/workflow/orchestrator.ts:383.

**Postconditions:**
- Omitting authoredBy produces the same output as today.

### 2.2 `persistBuildRecord`

```typescript
persistBuildRecord(repoPath: string, rec: BuildRecord): { md: string; json: string }
```

**Parameters:**
- `rec.meta.authoredBy: 'controller' | 'daemon'` _(optional)_ — The party that wrote the code. The two build-step writers stamp `controller`. The approval-time writer stamps nothing.

**Returns:** `{ md: string; json: string }` — Unchanged. The existing merge (mergeWithPrior, src/workflow/runners/build/standalone-record.ts:346) spreads the stored meta before the new meta, so an authoredBy already on the record is kept.

**Preconditions:**
- Declared at src/workflow/runners/build/standalone-record.ts:270.

### 2.3 `reviewArtifactFile`

```typescript
reviewArtifactFile(opts): Promise<ReviewArtifactResult>
```

**Returns:** `Promise<ReviewArtifactResult>` — Unchanged, except the review it stamps carries reviewedBy `daemon`. This holds for both of its paths: the extract, probe and verify pipeline (a DEF) and the one-session template review (an HLD or LLD). The controller stamps a review in two phases of insrc_review_step, and each stamps reviewedBy `controller`: `verdicts` for a DEF and `findings` for an HLD or LLD.

**Preconditions:**
- Declared at src/workflow/review/run-artifact.ts:68.

### 2.4 `runCodeReview`

```typescript
runCodeReview(subject, provider, opts & { reviewedBy?: 'controller' | 'daemon' }): Promise<CodeReviewOutcome>
```

**Parameters:**
- `reviewedBy: 'controller' | 'daemon'` _(optional)_ — The party running the review. The MCP handler passes `controller`; the daemon's code-review method passes `daemon`.

**Returns:** `Promise<CodeReviewOutcome>` — Unchanged, except the code-review record's meta carries reviewedBy when it was given.

**Preconditions:**
- Declared at src/workflow/code-review/runner.ts:158.

### 2.5 `approveArtifactByJsonPath`

```typescript
approveArtifactByJsonPath(jsonPath: string, opts?: { overrideReview?: string }): ApprovalResult
```

**Returns:** `ApprovalResult` — Unchanged on success.

**Errors:**
- `ReviewBlockedError` when Existing: the review's verdict blocks. New, for a DEF, HLD or LLD: it has no review. New, for a BUILD record: the Story has no code-review record. New, for any artifact: its review (for a BUILD record, its code review) was done by the party that authored it, both parties known. None of the new causes applies when overrideReview is given.

**Preconditions:**
- Declared at src/workflow/gates.ts:562.

**Postconditions:**
- The artifact kinds are the ArtifactKind union at src/workflow/path-scheme.ts:46. A review is required for DEF, HLD and LLD, and a code review for BUILD; every other kind (SPEC, PLAN, ISSUE, CR, EXT) needs none.
- ISSUE, SPEC and PLAN artifacts need no review and are approved on the user's approval alone.
- An unknown author or an unknown reviewer never withholds approval by itself.
- The override reason is recorded on the artifact, as today.
- All of these checks live HERE, because this is the one function every approval goes through. It has two callers: approveWorkflowTarget (src/workflow/gates.ts:759) and the TUI approve service (src/cli/services/workflow.ts:158), which calls it directly for any path. A check placed only in approveWorkflowTarget would be bypassed by the TUI.
- For a BUILD record the Story's code-review record is read from the artifact store beside it (same folder, id from the same epic hash and Story), so no repo path argument is needed.

### 2.6 `approveWorkflowTarget`

```typescript
approveWorkflowTarget(req: WorkflowApproveRequest, opts?): Promise<WorkflowApproveResult>
```

**Returns:** `Promise<WorkflowApproveResult>` — Unchanged shape. It no longer decides the new BUILD rules itself: a BUILD record with no code review, or with a same-party one, is refused by approveArtifactByJsonPath and lands in skipped[] through the existing catch of ReviewBlockedError. Its existing check stays: a code review whose verdict blocks withholds completion under the enforcement setting.

**Preconditions:**
- Declared at src/workflow/gates.ts:713.

**Postconditions:**
- A batch approval skips each withheld artifact with its reason and continues.

## 3. Data model changes

### 3.1 `Party fields` — field-add

Optional `authoredBy` on artifact meta and BUILD record meta; optional `reviewedBy` on the design review stamp and the code-review record. Both take 'controller' or 'daemon'. Two small shared readers return the party: the explicit field when present; otherwise, for older design artifacts and reviews, the stored model label decides. For an artifact's author the label is the `model` of each entry in meta.attribution.outputs (src/workflow/types.ts:286): all 'client' reads as `controller`, none 'client' as `daemon`, a mixture or no entries as unknown. For a design review the label is meta.review.model (src/workflow/review/types.ts:142): 'client' reads as `controller`, any other label as `daemon`. An older BUILD record's author is unknown. The reviewer party is stamped at these places: reviewArtifactFile (src/workflow/review/run-artifact.ts) writes `daemon`; the verdicts phase and the findings phase of insrc_review_step (src/mcp/review-step/phases/findings.ts and phases/verdicts.ts, which today stamp the model label 'client') write `controller`; runCodeReview writes the value it is given. The author party is stamped at these places: the MCP synthesize phase passes `controller` to finalizeArtifact (src/mcp/workflow-step/phases/synthesize.ts); the daemon workflow run passes `daemon` on its first finalize and on its correction retry (src/daemon/workflow-rpc.ts); the two build-step writers stamp `controller` on the BUILD record, the validate phase (src/mcp/build-step/phases/validate.ts) and the Trivial implement write (src/mcp/build-step/phases/implement.ts). standalone-record.ts holds the record type and the merge that keeps the field, not the stamps.

**Call sites:**
- `src/workflow/types.ts`
- `src/workflow/orchestrator.ts`
- `src/workflow/runners/build/standalone-record.ts`
- `src/workflow/review/types.ts`
- `src/workflow/code-review/types.ts`
- `src/workflow/review/run-artifact.ts`
- `src/mcp/review-step/phases/verdicts.ts`
- `src/mcp/review-step/phases/findings.ts`
- `src/workflow/code-review/runner.ts`
- `src/mcp/workflow-step/phases/synthesize.ts`
- `src/daemon/workflow-rpc.ts`
- `src/mcp/build-step/phases/validate.ts`
- `src/mcp/build-step/phases/implement.ts`

### 3.2 `Daemon request to review an existing design artifact` — new

A new daemon stream method, workflow.review, takes an artifact path and runs reviewArtifactFile with the provider the role router resolves for the `review` role, as the TUI review service does. It refuses an artifact the daemon authored. The MCP server gets one helper to call it and one to call the existing codeReview.run, both built like the existing workflow-run stream helper. One difference from that helper is required. For a stream request it has no handler for, the daemon answers with a plain line, `{ id, error: 'unknown method: ...' }`, that has no `stream` field (src/daemon/server.ts:201), and it leaves the socket open. The existing helper acts only on lines whose `stream` is progress, delta, done or error and ignores every other line (src/mcp/daemon-stream.ts:163), so it would wait until the timer fires and report a timeout. The two new helpers treat any line with a top-level `error` and no `stream` field as a final failure, and a line with a top-level `result` and no `stream` field as a protocol error. For an HLD or LLD, reviewArtifactFile runs the one-session template review, which has its own deadline of at most 10 minutes; for a DEF it runs the extract, probe and verify pipeline.

**Call sites:**
- `src/daemon/index.ts`
- `src/daemon/workflow-rpc.ts`
- `src/mcp/daemon-stream.ts`

### 3.3 `Routing inside insrc_review_step and insrc_code_review_step` — invariant-change

On `start`, each tool reads the author party BEFORE it chooses a path. Daemon-authored: today's controller loop, unchanged, which for insrc_review_step is start, claims, verdicts for a DEF and start, findings for an HLD or LLD. Controller-authored or unknown: the tool asks the daemon to review, waits, and returns `done` with the verdict in the same turn. If the daemon is unreachable, fails, is too old to know the request, or exceeds the wait limit, the tool returns an error saying so; it never falls back to a controller review. Every controller phase that stamps a review refuses controller-authored work and stamps nothing: `verdicts` and `findings` in insrc_review_step, and `judgements` in insrc_code_review_step. The code-review tool and the daemon code review read the build's author from the BUILD record's json in the artifact store, not from the review subject they already hold, which does not carry it.

**Call sites:**
- `src/mcp/review-step/phases/start.ts`
- `src/mcp/review-step/phases/verdicts.ts`
- `src/mcp/review-step/phases/findings.ts`
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
  - Detection: The MCP stream helper sees a connection error, a close before the final frame, an error frame, or a plain answer line with a top-level `error` and no `stream` field, which is how an older daemon reports `unknown method`.
  - Response: The tool returns an error naming the cause (and, for an older daemon, telling the user to update it). Nothing is stamped. No controller review is offered.
  - User impact: The artifact has no review, so approval is withheld. The user starts or updates the daemon and retries, or overrides at approval with a reason.
- **The daemon review takes longer than the tool's wait limit.** (recoverable)
  - Detection: A timer in the review tool expires before the final frame arrives. The wait limit is 11 minutes for a design review (the review's own hard cap of 10 minutes plus a margin) and 10 minutes for a DEF review or a code review.
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
| A BUILD record is approved from the TUI, which calls approveArtifactByJsonPath directly. | The same rules apply as through approveWorkflowTarget: withheld with no code review or a same-party one, approved with an override reason. |

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
  - Subjects: `T1 the two readers: explicit field wins; model label 'client' reads as controller and any other label as daemon; nothing stored reads as unknown`, `T2 finalizeArtifact stamps the authoredBy it is given and writes the same output as before when given none`, `T3 a BUILD record keeps its authoredBy across a later write that omits it`, `T4 each review path stamps its own party: the controller's verdicts phase (a DEF) and its findings phase (an LLD and an HLD) write `controller`; reviewArtifactFile writes `daemon` on both its pipeline path and its template path; runCodeReview writes each value it is given`
  - Fixtures: `the existing finalizeArtifact test harness`
- **unit** — The approval gate.
  - Subjects: `T5 a DEF, an HLD and an LLD with no review are withheld and approved with an override; an ISSUE, a SPEC and a PLAN with no review are approved`, `T6 a same-party review withholds; an other-party non-blocking review approves; an unknown author or reviewer does not withhold`, `T7 a BUILD record is withheld with no code review (enforcement off and on) and with a same-party code review; an override approves; the same holds when it is approved through the TUI approve service`, `T8 a batch approval lists withheld artifacts in skipped[] and approves the rest`
  - Fixtures: `the existing gate test fixtures`
- **integration** — Routing in the two review tools, with the daemon faked.
  - Subjects: `T9 insrc_review_step: controller-authored or unknown-author artifact goes to the daemon and returns done with the verdict; daemon-authored runs the controller loop as before`, `T10 insrc_code_review_step: the same two routes`, `T11 daemon unreachable, error frame and timeout each return an error, stamp nothing and offer no controller loop; a fake daemon that answers `{ id, error: 'unknown method: workflow.review' }` with no stream field and keeps the socket open makes the tool fail at once with the update-the-daemon message, not after the wait limit`, `T12 the daemon refuses to review daemon-authored work; the controller's verdicts phase, its findings phase (for an LLD and for an HLD) and its judgements phase each refuse controller-authored work and stamp nothing`, `T14 insrc_review_step on a controller-authored LLD goes to the daemon before the template prompt is ever returned; on a daemon-authored LLD it returns emit_findings as today`
  - Fixtures: `a fake daemon over the stream helper's injected connect`
- **unit** — The written rule.
  - Subjects: `T13 the steering source and both tool descriptions state the rule in both directions and no longer say review is a controller task`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `T9`, `T10`, `T12`, `T14` |
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

**Backward compat:** No stored data is rewritten; the new fields are optional and older records stay readable. Three behaviours change for users: (1) insrc_review_step and insrc_code_review_step on controller-authored work now return the daemon's verdict in one turn instead of handing the controller a review to do; (2) an unapproved DEF, HLD, LLD or BUILD with no review can no longer be approved without a review or an override reason; (3) the daemon and the MCP server must both be on the new build, otherwise the tools report a failed daemon review. A BUILD record approved from the TUI is held to the same rules. Known limit: the daemon cannot run tests, so its code review reports test results as unverified.

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
- **[[c7]]** `code` `src/workflow/path-scheme.ts:46` — "export type ArtifactKind = 'SPEC' | 'DEF' | 'HLD' | 'LLD' | 'PLAN' | 'BUILD' | 'CR' | 'EXT' | 'ISSUE';"
- **[[c8]]** `code` `src/daemon/index.ts:1869`
- **[[c9]]** `code` `src/mcp/review-step/phases/start.ts:63`
- **[[c10]]** `code` `src/mcp/code-review-step/handler.ts:490`
- **[[c11]]** `code` `src/cli/services/workflow.ts:158` — "const approval = approveArtifactByJsonPath(jsonPath, overrideReview !== undefined ? { overrideReview } : undefined);"
- **[[c12]]** `code` `src/daemon/server.ts:201` — "this.send(socket, { id: request.id, error: `unknown method: ${request.method}` });"
- **[[c13]]** `code` `src/mcp/daemon-stream.ts:163` — "// Unknown stream kind — ignore (forward-compatible)."
- **[[c14]]** `prior-artifact` `LLD-f2f08ccf89f8ab25-S001`

## 9. Open questions

- Is 10 minutes the right wait limit for a daemon DEF review? A daemon design review is now bounded (measured on 2026-10-05: 153 s and 166 s, hard cap 10 minutes) and daemon code reviews have taken up to about two and a half minutes, but a daemon review of a DEF still runs the older pipeline, which has no time bound and has not been timed.
- Which party is a review run from the TUI? The TUI authors through the daemon (its `workflow` command starts a daemon workflow run, so the artifact is daemon-authored) and its `review` command runs reviewArtifactFile inside the TUI process, which this design stamps `daemon`. A TUI-only chain of run, review, approve would therefore always be withheld as a same-party review, after spending a full review. Either the TUI review refuses daemon-authored work up front, like the new daemon request, and TUI-only work is approved with an override reason; or a TUI-process review is defined as its own party. Raised by the other-party review of 2026-10-05; needs the user's decision.

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**2 do not hold · 0 could not be verified · 6 hold** · template `design-issue` · model `cli-claude:opus` · reviewed 2026-10-05T08:24:13.255Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| change-sites | MED | The call-site lists in section 3 are complete for the party stamps. | Three files that must change are named in the prose but missing from every call-site list. (1) src/mcp/workflow-step/phases/synthesize.ts:46-52 calls finalizeArtifact with five arguments; it must pass `controller`. (2) src/mcp/build-step/phases/validate.ts:257 `persistBuildRecord(repoPath, {` and (3) src/mcp/build-step/phases/implement.ts:155 `persistStandaloneBuildRecord(repoPath, {` are the 'two build-step writers' that must stamp `controller`; the list names only standalone-record.ts, which holds the type and the merge, not the stamps. Also: reviewArtifactFile is declared at run-artifact.ts:68, not :66. And the code-review tools cannot take the author from the subject they already hold: subject.ts:69-73 DEFAULT_DEPS has no readBuildRecord, so `subject.buildRecord` (subject.ts:140) is always null in production; the design does not say where `start` and `judgements` read the BUILD author from. [files: src/mcp/workflow-step/phases/synthesize.ts, src/mcp/build-step/phases/validate.ts, src/mcp/build-step/phases/implement.ts, src/workflow/review/run-artifact.ts, src/workflow/code-review/subject.ts] | Add synthesize.ts, build-step/phases/validate.ts and build-step/phases/implement.ts to the 3.1 call sites; fix the :66 reference to :68; state in 3.3 that the code-review tools read authoredBy from the BUILD json directly (not from subject.buildRecord). |
| preserved-behaviour | MED | The backward-compat section lists every behaviour that changes for users (three), and stamping `daemon` in reviewArtifactFile is correct for all of its callers. | reviewArtifactFile has two callers, and one is not the daemon: src/cli/services/workflow.ts:241-256 `reviewArtifact` runs it inside the TUI process, reached from the TUI `review` command (src/cli/command.ts:188). The TUI also authors through the daemon (command.ts:180 → runWorkflowStreaming → daemon workflow.run, which will stamp authoredBy `daemon`). So the TUI-only chain run → review → approve yields a `daemon` review on `daemon`-authored work, and approve (command.ts:223, WorkflowsPane.tsx:116 with no override) is withheld as same-party every time. The design places the same-party refusal only in the new daemon method workflow.review, so the TUI review still runs, spends a full review, and stamps a review the gate then rejects. This fourth change is not in the 'Three behaviours change for users' list, and no test covers it. [files: src/cli/services/workflow.ts, src/cli/command.ts, src/cli/panes/WorkflowsPane.tsx, src/workflow/review/run-artifact.ts] | Decide and state the TUI behaviour: either make the TUI review service refuse daemon-authored work up front (same check as workflow.review) and list 'TUI-run artifacts need a controller review or an override' as a fourth behaviour change, or define which party a TUI-process review is. Add a test for the chosen behaviour. |

#### Could not verify (does not block)

_None._

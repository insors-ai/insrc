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

**Errors:**
- `Error` when Same-party review: the artifact was authored by the daemon. Raised before any model call, so no review is spent. reviewArtifactFile has three callers and the refusal applies to all of them: the new daemon request, the TUI review service (src/cli/services/workflow.ts), and the opt-in review at the end of a daemon workflow run (src/daemon/workflow-rpc.ts:346).

**Preconditions:**
- Declared at src/workflow/review/run-artifact.ts:68.

**Postconditions:**
- A review run from the TUI is a `daemon` review: the TUI authors through the daemon and reviews with the same non-controller reviewer. So the TUI review command refuses a daemon-authored artifact up front, with a message saying it needs a controller review (insrc_review_step) or an override reason at approval. This is the intended behaviour, decided by the user on 2026-10-05.
- The opt-in review at the end of a daemon workflow run (`review: true`, src/daemon/workflow-rpc.ts:346) reviews an artifact that same run just authored, so it is always a self-review. The run no longer calls reviewArtifactFile there: it skips the review, reports in its progress that the artifact needs a controller review, and returns no review. It must not rely on the refusal being thrown and caught, which would turn the option into a silent no-op.

### 2.4 `runCodeReview`

```typescript
runCodeReview(subject, provider, opts & { reviewedBy?: 'controller' | 'daemon' }): Promise<CodeReviewOutcome>
```

**Parameters:**
- `reviewedBy: 'controller' | 'daemon'` _(optional)_ — The party running the review. The MCP handler passes `controller`; the daemon's code-review method passes `daemon`.

**Returns:** `Promise<CodeReviewOutcome>` — Unchanged, except the code-review record's meta carries reviewedBy when it was given.

**Preconditions:**
- Declared at src/workflow/code-review/runner.ts:158.

**Postconditions:**
- The existing options groundingMode and capVerdictAtWarn are unchanged; the daemon code-review request now passes them through when the tool asks for a degraded review.

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

A new daemon stream method, workflow.review, takes an artifact path and runs reviewArtifactFile with the provider the role router resolves for the `review` role, as the TUI review service does. An artifact the daemon authored is refused; the refusal lives in reviewArtifactFile itself, so the TUI review service (src/cli/services/workflow.ts), which calls the same function in its own process, refuses it too. The MCP server gets one helper to call it and one to call the existing codeReview.run, both built like the existing workflow-run stream helper. One difference from that helper is required. For a stream request it has no handler for, the daemon answers with a plain line, `{ id, error: 'unknown method: ...' }`, that has no `stream` field (src/daemon/server.ts:201), and it leaves the socket open. The existing helper acts only on lines whose `stream` is progress, delta, done or error and ignores every other line (src/mcp/daemon-stream.ts:163), so it would wait until the timer fires and report a timeout. The two new helpers treat any line with a top-level `error` and no `stream` field as a final failure, and a line with a top-level `result` and no `stream` field as a protocol error. For an HLD or LLD, reviewArtifactFile runs the one-session template review, which has its own deadline of at most 10 minutes; for a DEF it runs the extract, probe and verify pipeline.

**Call sites:**
- `src/daemon/index.ts`
- `src/daemon/workflow-rpc.ts`
- `src/mcp/daemon-stream.ts`
- `src/workflow/review/run-artifact.ts`
- `src/cli/services/workflow.ts`

### 3.3 `Routing inside insrc_review_step and insrc_code_review_step` — invariant-change

On `start`, each tool reads the author party BEFORE it chooses a path. Daemon-authored: today's controller loop, unchanged, which for insrc_review_step is start, claims, verdicts for a DEF and start, findings for an HLD or LLD. Controller-authored or unknown: the tool asks the daemon to review, waits, and returns `done` with the verdict in the same turn. If the daemon is unreachable, fails, is too old to know the request, or exceeds the wait limit, the tool returns an error saying so; it never falls back to a controller review. Every controller phase that stamps a review refuses controller-authored work and stamps nothing: `verdicts` and `findings` in insrc_review_step, and `judgements` in insrc_code_review_step. The code-review tool and the daemon code review read the build's author from the BUILD record's json in the artifact store, not from the review subject they already hold, which does not carry it. The daemon code review must not be weaker than the controller loop it replaces. Today the controller path protects against a stale or empty code graph in three ways that the daemon's codeReview.run does not have (src/daemon/code-review-rpc.ts:93 calls the runner with default settings): it waits for a fresh index before grounding; when the grounding comes back with no symbols it falls back to a review of the diff (src/mcp/code-review-step/handler.ts:312); and a diff-grounded review is stamped `degraded` and its verdict is capped at warn, so it can never record a pass (src/mcp/code-review-step/handler.ts:494). For controller-authored or unknown-author code the tool keeps its `start` phase exactly as it is today, and asks the daemon only at the point where it would have handed the controller the judgements prompt, telling the daemon which grounding mode applies. That phase has four outcomes today and all four stay: (1) the index is stale on the first call: it returns `confirm_wait` with a state token and no review starts, so the tool does NOT always answer in one turn; (2) the user declines the wait (`proceed: false`): a diff review; (3) the user accepts the wait and the index does not become fresh before the time limit: a diff review; (4) the index is fresh but the grounding has no symbols: a diff review; otherwise a full review. In every case that ends in a review, the author is read at that point, including on the resumed call after `confirm_wait`, and the daemon is asked with `full` or `degraded` accordingly. The daemon request takes that mode: with `degraded` it grounds on the diff, stamps the record `degraded` and caps the verdict at warn, the same way the controller path does. Only a freshness check that is UNAVAILABLE returns an error and starts no review, as today.

**Call sites:**
- `src/mcp/review-step/phases/start.ts`
- `src/mcp/review-step/phases/verdicts.ts`
- `src/mcp/review-step/phases/findings.ts`
- `src/mcp/code-review-step/handler.ts`
- `src/daemon/code-review-rpc.ts`
- `src/mcp/review-step/types.ts`
- `src/mcp/code-review-step/types.ts`

### 3.4 `Written rule` — invariant-change

The steering source, the two review tool descriptions and the daemon comments are rewritten to say: the party that did not author the work reviews it, in both directions; the review tools route this themselves; the same model on both sides is acceptable; approval requires the review. The guides and the plugin copy follow from the steering source. The comments in src/daemon/workflow-rpc.ts on the `review` run option and on the finalize step are rewritten to say the option is skipped because a run may not review its own artifact.

**Call sites:**
- `src/prompts/steering-block.md`
- `src/mcp/server.ts`
- `src/daemon/workflow-rpc.ts`

### 3.5 `Existing tests the change breaks` — invariant-change

Today a DEF, HLD or LLD with no review is approvable, and many existing tests rely on that: they write a DEF or HLD fixture and approve it directly to reach the stage they test. About 31 test files call approveArtifactByJsonPath or approveWorkflowTarget, among them src/mcp/workflow-step/__tests__/design-story-e2e.test.ts and src/workflow/__tests__/plan-gate.test.ts, and the plan, design-epic, chain, amendments, build-step and build-completion suites. Under the new rule each such approval is refused. The build updates them in one planned step: one shared test helper stamps an other-party review on a fixture before it is approved, and every such fixture uses it. Tests that are ABOUT the missing-review rule approve without it. The count is from a search for the two function names; not every file was read, so the plan must list the files from that search rather than from this number. A second group breaks for a different reason: the suites of the two review tools write fixtures with no author, and unknown-author work now goes to the daemon instead of the controller loop those suites exercise. They are src/mcp/review-step/__tests__/review-step.test.ts, src/mcp/review-step/__tests__/review-step-findings.test.ts, src/mcp/code-review-step/__tests__/handler.test.ts and src/mcp/code-review-step/__tests__/ux-handler.test.ts. Their fixtures are given a daemon author (an explicit authoredBy on the artifact; for the code-review suites a BUILD record json with authoredBy `daemon`) so they keep exercising the controller loop. The plan lists both groups from searches of the test tree, not from the counts here.

**Call sites:**
- `src/mcp/workflow-step/__tests__/design-story-e2e.test.ts`
- `src/workflow/__tests__/plan-gate.test.ts`
- `src/mcp/review-step/__tests__/review-step.test.ts`
- `src/mcp/review-step/__tests__/review-step-findings.test.ts`
- `src/mcp/code-review-step/__tests__/handler.test.ts`
- `src/mcp/code-review-step/__tests__/ux-handler.test.ts`

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
| A daemon workflow run is started with its opt-in finalize review (`review: true`). | The run skips the review and says so in its progress: the artifact is daemon-authored, so the daemon may not review it. Nothing is stamped. Approval of a DEF, HLD or LLD is then withheld for having no review until a controller reviews it through insrc_review_step or the user overrides. |
| A batch approval covers reviewed and unreviewed artifacts. | The unreviewed and same-party ones are listed in skipped[] with a reason; the rest are approved. |
| A BUILD record is approved from the TUI, which calls approveArtifactByJsonPath directly. | The same rules apply as through approveWorkflowTarget: withheld with no code review or a same-party one, approved with an override reason. |
| A TUI-only chain: the TUI runs a workflow through the daemon, then its review command, then approve. | The review command refuses at once, since the artifact is daemon-authored and a TUI review is a daemon review. Approval of a DEF, HLD or LLD is then withheld for having no review, until a controller reviews it or the user approves with an override reason. |
| The code graph has no symbols for a controller-authored build (for example the files were just created and are not indexed yet). | The tool detects it before asking the daemon. The daemon reviews the diff, the record is stamped `degraded`, and the verdict is warn at best, never pass. |

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
  - Subjects: `T5 a DEF, an HLD and an LLD with no review are withheld and approved with an override; an ISSUE, a SPEC and a PLAN with no review are approved`, `T6 a same-party review withholds; an other-party non-blocking review approves; an unknown author or reviewer does not withhold`, `T7 a BUILD record is withheld with no code review (enforcement off and on) and with a same-party code review; an override approves; the same holds when it is approved through the TUI approve service`, `T8 a batch approval lists withheld artifacts in skipped[] and approves the rest`, `T18 the shared test helper stamps a review by the party that did not author the fixture, and a fixture stamped with it is approved with no override`
  - Fixtures: `the existing gate test fixtures`
- **integration** — Routing in the two review tools, with the daemon faked.
  - Subjects: `T9 insrc_review_step: controller-authored or unknown-author artifact goes to the daemon and returns done with the verdict; daemon-authored runs the controller loop as before`, `T10 insrc_code_review_step: the same two routes`, `T11 daemon unreachable, error frame and timeout each return an error, stamp nothing and offer no controller loop; a fake daemon that answers `{ id, error: 'unknown method: workflow.review' }` with no stream field and keeps the socket open makes the tool fail at once with the update-the-daemon message, not after the wait limit`, `T12 the daemon refuses to review daemon-authored work; the controller's verdicts phase, its findings phase (for an LLD and for an HLD) and its judgements phase each refuse controller-authored work and stamp nothing`, `T14 insrc_review_step on a controller-authored LLD goes to the daemon before the template prompt is ever returned; on a daemon-authored LLD it returns emit_findings as today`, `T15 reviewArtifactFile refuses a daemon-authored artifact before any provider call, for both a DEF and an LLD, and the TUI review service surfaces that refusal; a controller-authored or unknown-author artifact is reviewed`, `T16 a daemon workflow run started with `review: true` makes no review call, emits a progress line saying the artifact needs a controller review, returns no review and leaves the artifact unstamped`, `T17 insrc_code_review_step on controller-authored code keeps its start phase: a stale index returns confirm_wait and asks no daemon; a declined wait, a wait that times out and empty grounding each ask the daemon with the degraded mode, and the record is `degraded` with a verdict no better than warn; fresh grounding with symbols asks with the full mode; an unavailable freshness check returns an error and asks no daemon; the author is read on the resumed call too`
  - Fixtures: `a fake daemon over the stream helper's injected connect`
- **unit** — The written rule.
  - Subjects: `T13 the steering source and both tool descriptions state the rule in both directions and no longer say review is a controller task`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `T9`, `T10`, `T12`, `T14`, `T15`, `T16`, `T17` |
| `ac2` | `T1`, `T2`, `T3`, `T4` |
| `ac3` | `T5`, `T6`, `T7`, `T8`, `T18` |
| `ac4` | `T11` |
| `ac5` | `T13` |

## 6. Migration

**State before:** No record says which party authored an artifact or a build. The review tools always run the controller loop. Approval refuses only a blocking review: an unreviewed design artifact is approvable, and an unreviewed BUILD is withheld only under an enforcement setting that is off by default. The steering says review is a controller task.

**State after:** Artifacts, BUILD records and reviews record their party. The two review tools send the work to the party that did not author it. Approval of a DEF, HLD, LLD or BUILD requires a review by the other party, with the existing override. The steering states the rule in both directions.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional party fields and the two readers; stamp the author at artifact finalize and in the build-step BUILD writers; stamp the reviewer in each review path. — ↩ rollbackable
2. Add the daemon request to review an existing artifact and the two MCP stream helpers; make each reviewer refuse its own party's work. — ↩ rollbackable
3. Route inside insrc_review_step and insrc_code_review_step by author party. In the same step, give the fixtures of the four review-tool suites a daemon author so they keep exercising the controller loop. — ↩ rollbackable
4. Make the approval gate require an other-party review for DEF, HLD, LLD and BUILD, with the existing override. In the same step, add the shared test helper that stamps an other-party review and move every existing test that approves an unreviewed DEF, HLD, LLD or BUILD fixture onto it, so the suites stay green. — ↩ rollbackable
5. Rewrite the steering source, the two tool descriptions and the daemon comments. — ↩ rollbackable

**Backward compat:** No stored data is rewritten; the new fields are optional and older records stay readable. Three behaviours change for users: (1) insrc_review_step and insrc_code_review_step on controller-authored work now return the daemon's verdict in one turn instead of handing the controller a review to do; (2) an unapproved DEF, HLD, LLD or BUILD with no review can no longer be approved without a review or an override reason; (3) the daemon and the MCP server must both be on the new build, otherwise the tools report a failed daemon review. A BUILD record approved from the TUI is held to the same rules. (4) Work run entirely from the TUI is daemon-authored, and the TUI review command now refuses it; such work needs a controller review or an override reason at approval. (5) The `review: true` option of a daemon workflow run no longer produces a review; the run reports that a controller review is needed. Known limit: the daemon cannot run tests, so its code review reports test results as unverified.

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
- **[[c15]]** `stakeholder` `user, 2026-10-05` — "1. yes. works as designed."
- **[[c16]]** `code` `src/daemon/workflow-rpc.ts:346` — "const res = await reviewArtifactFile({"
- **[[c17]]** `code` `src/mcp/code-review-step/handler.ts:312` — "if (g.grounding.symbols.length === 0) {"
- **[[c18]]** `code` `src/mcp/workflow-step/__tests__/design-story-e2e.test.ts` — "approveArtifactByJsonPath(definePath);"

## 9. Open questions

- Is 10 minutes the right wait limit for a daemon DEF review? A daemon design review is now bounded (measured on 2026-10-05: 153 s and 166 s, hard cap 10 minutes) and daemon code reviews have taken up to about two and a half minutes, but a daemon review of a DEF still runs the older pipeline, which has no time bound and has not been timed.

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**1 do not hold · 0 could not be verified · 7 hold** · template `design-issue` · model `cli-claude:opus` · reviewed 2026-10-05T08:40:20.632Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| change-sites | MED | Section 3.5 lists all existing tests the change breaks: the tests that approve unreviewed fixtures. | The count for approval tests is right (31 test files reference approveArtifactByJsonPath or approveWorkflowTarget). But the routing change in 3.3 breaks a second group that 3.5 and migration step 3 do not mention. 3.3 sends 'controller-authored or unknown' work to the daemon, and the existing review-tool fixtures carry no author: src/mcp/review-step/__tests__/review-step-findings.test.ts:41 writes `meta: { workflow: 'design.story', epicHash: 'abcd', storyId: 'S001' }`, and review-step.test.ts:48 writes `meta: { workflow: 'plan' }` and then asserts at :155 `review.model === 'client'`. Neither those two files nor src/mcp/code-review-step/__tests__/handler.test.ts and ux-handler.test.ts contain 'attribution', 'authoredBy' or a BUILD record, yet together they expect emit_claims / emit_findings / emit_judgements 38 times (27 in handler.test.ts, with 23 `phase: 'start'` calls). Under the design every one of those starts would ask the daemon instead of returning the controller prompt. [files: src/mcp/review-step/__tests__/review-step.test.ts, src/mcp/review-step/__tests__/review-step-findings.test.ts, src/mcp/code-review-step/__tests__/handler.test.ts, src/mcp/code-review-step/__tests__/ux-handler.test.ts] | Add these four suites to 3.5 and to migration step 3: give their fixtures a daemon author (an explicit authoredBy on the artifact, and a BUILD record json with authoredBy 'daemon' for the code-review suites) so they keep exercising the controller loop, and have the plan list them from a search for `phase: 'start'` under src/mcp/review-step and src/mcp/code-review-step. |

#### Could not verify (does not block)

_None._

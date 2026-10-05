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

**Returns:** `Promise<ReviewArtifactResult>` — Unchanged, except the review it stamps carries reviewedBy `daemon`. The controller loop's verdicts phase stamps reviewedBy `controller`.

**Preconditions:**
- Declared at src/workflow/review/run-artifact.ts:66.

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
- `ReviewBlockedError` when Existing: the review's verdict blocks. New: a DEF, HLD or LLD has no review; or any artifact's review was done by the party that authored it, both parties known. None of these applies when overrideReview is given.

**Preconditions:**
- Declared at src/workflow/gates.ts:562.

**Postconditions:**
- The artifact kinds are the ArtifactKind union at src/workflow/path-scheme.ts:46. A review is required for DEF, HLD and LLD here and for BUILD in approveWorkflowTarget; every other kind (SPEC, PLAN, ISSUE, CR, EXT) needs none.
- ISSUE, SPEC and PLAN artifacts need no review and are approved on the user's approval alone.
- An unknown author or an unknown reviewer never withholds approval by itself.
- The override reason is recorded on the artifact, as today.

### 2.6 `approveWorkflowTarget`

```typescript
approveWorkflowTarget(req: WorkflowApproveRequest, opts?): Promise<WorkflowApproveResult>
```

**Returns:** `Promise<WorkflowApproveResult>` — Unchanged shape. A BUILD record is withheld into skipped[] when the Story has no code review, whether or not the enforcement setting is on, and when the code review was done by the party that authored the build, both known. overrideReview approves past either.

**Preconditions:**
- Declared at src/workflow/gates.ts:713.

**Postconditions:**
- A batch approval skips each withheld artifact with its reason and continues.

## 3. Data model changes

### 3.1 `Party fields` — field-add

Optional `authoredBy` on artifact meta and BUILD record meta; optional `reviewedBy` on the design review stamp and the code-review record. Both take 'controller' or 'daemon'. Two small shared readers return the party: the explicit field when present; otherwise, for older design artifacts and reviews, the stored model label decides. For an artifact's author the label is the `model` of each entry in meta.attribution.outputs (src/workflow/types.ts:286): all 'client' reads as `controller`, none 'client' as `daemon`, a mixture or no entries as unknown. For a design review the label is meta.review.model (src/workflow/review/types.ts:142): 'client' reads as `controller`, any other label as `daemon`. An older BUILD record's author is unknown.

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
- **[[c7]]** `code` `src/workflow/path-scheme.ts:46` — "export type ArtifactKind = 'SPEC' | 'DEF' | 'HLD' | 'LLD' | 'PLAN' | 'BUILD' | 'CR' | 'EXT' | 'ISSUE';"
- **[[c8]]** `code` `src/daemon/index.ts:1869`
- **[[c9]]** `code` `src/mcp/review-step/phases/start.ts:63`
- **[[c10]]** `code` `src/mcp/code-review-step/handler.ts:490`

## 9. Open questions

- How long should a review tool wait for the daemon review? On 2026-10-04 a non-controller design review of a 40 KB design took 12 minutes for one pass and 27 minutes with its automatic second pass. A tool call may not be able to wait that long.

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**0 HIGH · 10 MED · 6 LOW** · model `cli-claude:opus` · reviewed 2026-10-05T04:29:17.670Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| 2.1 | citation | MED | assisted | finalizeArtifact is declared at src/workflow/orchestrator.ts:383 and its current parameter list ends with (intent, stepOutputs, runId, elapsedMs, llmResponse, model?, attribution?), so authoredBy can be appended as an eighth optional parameter. | The location half of the premise is confirmed: grep /export (async )?function finalizeArtifact/ returned exactly 1 match, `src/workflow/orchestrator.ts:383:export async function finalizeArtifact(`, and the read of src/workflow/orchestrator.ts:383 returned FOUND with the same line. The parameter-list half is not addressed: the evidence stops at the opening parenthesis on line 383, so nothing shows the parameters, their order, whether the list ends with (intent, stepOutputs, runId, elapsedMs, llmResponse, model?, attribution?), or whether `attribution?` is the last and optional parameter. The claim that authoredBy can be appended as an eighth optional parameter (which also depends on the total count being seven) is therefore unverifiable from the gathered evidence. | Re-run the probe with a multi-line read of src/workflow/orchestrator.ts from line 383 through the closing parenthesis of the signature (roughly 383-400). Confirm that the signature has exactly seven parameters, that it ends with `model?` and `attribution?`, and that no rest parameter or required parameter follows. If the tail differs, correct the parameter list and the ordinal "eighth" in section 2.1 before building. Also grep the call sites of finalizeArtifact to confirm none already pass an eighth positional argument. |
| 2.2 | inventory | MED | assisted | persistBuildRecord has exactly three writers: two build-step writers (which will stamp 'controller') and one approval-time writer (which stamps nothing). | UNVERIFIABLE from the gathered evidence. The grep for /persistBuildRecord\\(/ returned 50 matches and was TRUNCATED at the cap. Of those 50, 16 are docs/ prose hits and 33 are test call sites (src/workflow/runners/build/__tests__/build-record-enrichment.test.ts:104-145 and build-record.test.ts:65-653). Only ONE production call site is visible: src/mcp/build-step/phases/validate.ts:257 `persistBuildRecord(repoPath, {`. The listing is path-ordered and cuts off inside src/workflow/runners/build/__tests__/, so every path sorting after it was never reached, including the premise's own anchor src/workflow/runners/build/standalone-record.ts (the definition, plus any delegating writer such as persistStandaloneBuildRecord) and the completion-record.ts writer that docs/epics/complete-generated-artifact-companion-wiring-across-E20260929e2c6705f/S002/PLAN.md:29 describes (`ensureBuildRecordOnCompletion` calling persistBuildRecord). The evidence therefore confirms one build-step writer and neither confirms nor contradicts the claimed second build-step writer, the approval-time writer, or the "exactly three" count. No read of standalone-record.ts was supplied. | Re-run the inventory probe so the cap cannot hide production writers: grep `persistBuildRecord\\(` scoped to src/ with `__tests__` and docs/ excluded (e.g. `rg 'persistBuildRecord\\(' src -g '!**/__tests__/**'`), then enumerate each non-test caller and state in the LLD which file:line is each of the two build-step writers and which is the approval-time writer. If the count is not three, or a writer sits outside build-step / approval (e.g. a persistStandaloneBuildRecord delegate in standalone-record.ts), correct the premise and decide what each extra writer stamps before building. |
| 2.4 | citation | MED | assisted | runCodeReview(subject, provider, opts) is declared at src/workflow/code-review/runner.ts:158 and is called by both the MCP code-review handler and the daemon's code-review method. | Declaration confirmed: the read of src/workflow/code-review/runner.ts:158 returned `export async function runCodeReview(`, and it is the only source match for /export (async )?function runCodeReview/ (the other two are LLD docs). Daemon caller confirmed: src/daemon/code-review-rpc.ts:93 `const outcome = await runCodeReview(resolved.subject, provider, {`. MCP handler caller NOT directly confirmed: none of the 33 /runCodeReview\\(/ matches is in src/mcp/code-review-step/handler.ts. The only handler-side evidence is indirect: S008/PLAN.md:39 describes `CodeReviewStepDeps` as an injectable seam `{ resolveSubject, fetchGrounding, runReview, write }` defaulting to the real impls (including `runCodeReview`), and src/mcp/code-review-step/__tests__/handler.test.ts:411 stubs `runReview: CodeReviewStepDeps['runReview'] = async (s, p, o, d) => { opts.push(o); return runCodeReview(s, p, o, d); }`. That points to the handler reaching the runner through `deps.runReview(...)` rather than a direct `runCodeReview(` call, which is why the grep finds no call site in handler.ts. The handler's source itself was not read, so that half of the premise is unverified rather than contradicted. | Reword the premise to say the MCP handler reaches runCodeReview through the `CodeReviewStepDeps.runReview` seam (default impl), not a direct call, and confirm by reading src/mcp/code-review-step/handler.ts where `runReview` is defaulted and invoked. The prescribed change (extending the runner's `opts` with `reviewedBy`) still holds for both callers, but the LLD should name the handler's `deps.runReview(...)` invocation as the place where the controller-side value is passed, so the build does not look for a direct `runCodeReview(` call in handler.ts. |
| 2.5 | citation | MED | assisted | approveArtifactByJsonPath(jsonPath, opts?: { overrideReview?: string }) is declared at src/workflow/gates.ts:562, throws ReviewBlockedError when the review's verdict blocks, and records the override reason on the artifact when overrideReview is given. | Two of the three clauses are confirmed; the third is not addressed by the gathered evidence.  (1) Declaration: CONFIRMED. `read src/workflow/gates.ts:562` → `export function approveArtifactByJsonPath(jsonPath: string, opts?: { readonly overrideReview?: string }): ApprovalResult {`, and the grep for `export function approveArtifactByJsonPath` has exactly one source match, at src/workflow/gates.ts:562. The only difference from the premise is the `readonly` modifier on `overrideReview`, which is immaterial.  (2) Throws ReviewBlockedError when the review blocks: CONFIRMED by location. The class is declared at src/workflow/gates.ts:84 (`export class ReviewBlockedError extends Error {`) and `throw new ReviewBlockedError(` is at src/workflow/gates.ts:585, 23 lines into the function declared at :562. Tests corroborate it: src/workflow/__tests__/review-gate.test.ts:12 imports both symbols and :37 asserts `e instanceof ReviewBlockedError`; src/workflow/__tests__/spec-review-approve.test.ts:144 asserts `e instanceof ReviewBlockedError && /1 HIGH/.test(...)`.  (3) Records the override reason on the artifact when overrideReview is given: UNVERIFIABLE from this evidence. No read or grep line shows the function body writing the reason into the artifact's meta. The `overrideReview` grep was truncated at its 50-match cap and every returned match is a docs/ file; no src/workflow/gates.ts body line was returned. The docs matches describe override as bypassing the block (e.g. HLD.md:353 "refuses unless overrideRe…"), and the "records the override" wording that does appear refers to the separate code-review gate `enforceCodeReviewGate` (S007/LLD.md:43, :131), not to approveArtifactByJsonPath. | Read the body of approveArtifactByJsonPath (src/workflow/gates.ts:562 to roughly :620) and confirm whether the override branch writes the reason onto the artifact, and under which meta field. If it does, cite that line in the premise. If it only bypasses the block without recording, reword the clause to "bypasses the block when overrideReview is given". Any new no-review or same-party checks this LLD adds that rely on a recorded override would then need the recording added explicitly. The declaration anchor and the ReviewBlockedError clause need no change. |
| 2.6 | semantic | MED | manual | approveWorkflowTarget(req: WorkflowApproveRequest, opts?) is declared at src/workflow/gates.ts:713, is where a BUILD record's code-review gate lives, withholds artifacts into skipped[] with a reason, and today withholds an unreviewed BUILD only when the codeReview.enforce setting is on (off by default). | Partly confirmed, partly unverifiable from the gathered evidence; nothing contradicts the premise.  CONFIRMED (source): `read src/workflow/gates.ts:713` → `export async function approveWorkflowTarget(`, and the declaration grep has exactly one source hit at `src/workflow/gates.ts:713`. The cited anchor is correct and current (older artifacts cite :586, :617 and :636 for the same function).  CORROBORATED (prior artifacts only, not source): - Code-review gate lives here and is conditioned on enforce: `docs/epics/add-bugfix-triage-category-insrc-framework-E202609181703991c/S004/LLD.md:162` — "Completion reuses approveWorkflowTarget(req, { enforce }) UNCHANGED … the exact same BUILD-approval + codeReview.enforce gate … (a block/absent CR withholds completion unless overrideReview)". - Withholds into skipped[]: same LLD `:181` — "A bugfix BUILD under codeReview.enforce with an absent/block CR -> withheld into skipped[], no approvedAt (unless overrideReview)"; and `docs/epics/add-daemon-driven-code-review-stage-E20260803761a43a6/S007/LLD.md:211` — "approveWorkflowTarget:586 (routes a block into skipped[])". - `opts?` second parameter: consistent with the `(req, { enforce })` call shape at S004/LLD.md:162.  NOT ADDRESSED: - Both the `/skipped/` and `/enforce/` greps were TRUNCATED at the 50-match cap and returned only docs/design/README hits, so no line of `src/workflow/gates.ts` shows the skipped[]-with-reason push or the enforce branch. - Only line 713 was read, so the `req: WorkflowApproveRequest, opts?` parameter list is not shown from source. - No evidence shows the default value of `codeReview.enforce` ("off by default"). | No artifact change is indicated: the anchor is correct and the behavioural claims match prior artifacts. Before relying on this premise, re-run the probes scoped to source so they are not swamped by docs: grep `skipped` and `enforce` within `src/workflow/gates.ts`, read `src/workflow/gates.ts:713` onward through the full signature and the BUILD branch, and grep the config catalog for the `codeReview.enforce` default. If those confirm, downgrade to LOW. |
| 3.1 | semantic | MED | assisted | The design review stamp's `model` field (meta.review.model) is declared at src/workflow/review/types.ts:142, and the controller review loop (src/mcp/review-step/phases/verdicts.ts) stamps it with the label 'client' while the daemon review stamps a real model label. | Partly confirmed, partly unverifiable. Confirmed: the read of src/workflow/review/types.ts:142 returns `readonly model: string;`, so a `model` field is declared at the cited line (the read shows only that one line, so the enclosing interface being the review stamp is not itself shown). Not confirmed: the grep for /model: 'client'/ returned 22 matches and none is in src/mcp/review-step/phases/verdicts.ts; every hit is in plans/workflow-implementation.md:896 or in test fixtures. The closest support is src/workflow/__tests__/artifact-content.test.ts:84, a review-shaped fixture (`counts: { high: 1, med: 0, low: 0 }, reviewedAt: ..., model: 'client'`), which shows a review stamp can carry 'client' but not that verdicts.ts writes it. The verdicts.ts file was never read, so it may stamp the label via a constant or a non-literal form the grep misses. No evidence at all addresses the claim that the daemon review stamps a real model label. The /meta\\.review/ grep (50 matches, truncated at cap) only shows docs prose and does not address `meta.review.model`. | Before relying on the 'client' label as the fallback discriminator for older reviews, read src/mcp/review-step/phases/verdicts.ts and the daemon review stamping site to confirm (a) where and with what literal or constant the controller loop sets `model`, and (b) that the daemon path stamps a real model label that is never 'client'. Then anchor the premise to those exact `file:line` sites. The types.ts:142 anchor can stay. |
| 3.2 | external-contract | MED | assisted | The daemon has no existing `workflow.review` method, but does have an existing `codeReview.run` method and a workflow-run stream method registered in src/daemon/index.ts (cited at :1869); the MCP server has an existing workflow-run stream helper in src/mcp/daemon-stream.ts with an injectable connect, and an unknown method is answered with an `unknown method` error. | Four of the five sub-claims are confirmed; the fifth is not addressed by the evidence.  Confirmed: - No existing `workflow.review` method: grep /'workflow\\.review'/ returned 0 matches. - `codeReview.run` is registered: the read of src/daemon/index.ts:1869 is `'codeReview.run': async (params, send, signal) => {`, so the cited anchor resolves to the entity the premise names. - A workflow-run stream method is registered in the same file: src/daemon/index.ts:1859 is `'workflow.run': async (params, send, signal) => {`, and src/daemon/workflow-rpc.ts:472 sends its `stream: 'progress'` frames. - An unknown method is answered with an `unknown method` error: src/daemon/server.ts:173 and :201 both send `error: `unknown method: ${request.method}``.  Not verifiable: - The MCP workflow-run stream helper in src/mcp/daemon-stream.ts with an injectable connect. The grep /connect/ probe was truncated at its 50-match cap, and every returned match is in README.md or camon/ Python files. No line from src/mcp/daemon-stream.ts was returned and no read of that file was made, so neither the file's existence, the helper, nor the injectable connect is shown. | Re-run the probe scoped to the file: read src/mcp/daemon-stream.ts and grep it for `connect`. Confirm that it exports a workflow-run stream helper and that the helper takes an injectable connect parameter the design's tests can use. If the helper or the injection seam is missing or shaped differently, revise section 3.2 and the test plan that depends on it (T9–T11). No change is needed for the other four sub-claims. |
| 3.2 | semantic | MED | assisted | The TUI review service runs reviewArtifactFile with the provider that the role router resolves for the `review` role, so the new daemon method can resolve its provider the same way. | Half of the premise is confirmed and half is unverifiable from the gathered evidence. Confirmed: the TUI service does call reviewArtifactFile (src/cli/services/workflow.ts:248 `return reviewArtifactFile({`), the function is defined at src/workflow/review/run-artifact.ts:66, and a daemon call site already exists at src/daemon/workflow-rpc.ts:346 (`const res = await reviewArtifactFile({`). Unverifiable: nothing shows HOW the provider passed at workflow.ts:248 is resolved. The role-router probe (/'review'\\)\|role: 'review'\|forRole\\('review'/) returned 17 matches, none of which is a role-router resolution: 8 are `getLogger('review')` lines in src/workflow/review/*.ts, the rest are vscode-plugin editMode/'review' permission-mode checks, per-role-engine test fixtures (`roleEntry('review')`), and two unrelated LLD docs. There is no match in src/cli/services/ or src/daemon/ and no RoleRouter symbol in any match, so the claim that the TUI resolves its provider through the role router for the `review` role is not supported by the evidence (nor contradicted by it — the probe pattern may simply not match the real call shape). | Before building on 3.2, read src/cli/services/workflow.ts around line 248 and src/daemon/workflow-rpc.ts around line 346 to establish how each resolves the provider it hands to reviewArtifactFile, then cite the actual resolution call (file:line) in the LLD. If the TUI does not go through the role router for the `review` role, reword 3.2 to name the real mechanism and have the new daemon method follow the existing daemon call site at workflow-rpc.ts:346 instead. Also note in the LLD that a daemon-side reviewArtifactFile call already exists, so the 'new daemon method' should reuse or align with it rather than introduce a second resolution path. |
| 3.3 | citation | MED | assisted | The insrc_review_step start phase at src/mcp/review-step/phases/start.ts:63 and the insrc_code_review_step handler at src/mcp/code-review-step/handler.ts:490 are the points where each tool today always begins the controller loop, with no branch on who authored the work. | Partly confirmed, with one mis-resolved anchor.  - **Confirmed:** `src/mcp/review-step/phases/start.ts:63` reads `next: 'emit_claims',`, which is the start phase handing the controller its first turn. This matches the documented loop in `src/mcp/review-step/handler.ts:10` (`start → emit_claims → claims → emit_verdicts → verdicts → done`). - **Confirmed:** there is no branch on authorship today. The grep for `authoredBy\|reviewedBy` returned 12 matches, all in `docs/standalone/two-sets-eyes-review-rule-only-E202610041716f77b/S001/LLD.md` and none under `src/`. - **Mis-resolved:** `src/mcp/code-review-step/handler.ts:490` reads `const outcome = await deps.runReview(`. That is the judgements turn folding the controller's already-emitted judgements through `runCodeReview`, not the point where the tool begins the controller loop. The loop begins in the start phase, which returns `next:'emit_judgements'`; the evidence gives no line number for that return in `handler.ts`. - **Not addressed:** the third anchor, `src/mcp/review-step/phases/verdicts.ts`, was not read, and its only grep hits are indirect.  Line 490 is still the right place for the LLD's `reviewedBy` stamp (LLD.md:83: "The MCP handler passes `controller`"), so the anchor points at the right handler and concept. It is the wrong line for a loop-entry or routing branch. | Reword premise 3.3 so `src/mcp/code-review-step/handler.ts:490` is described as the judgements-turn `deps.runReview(...)` call, where `reviewedBy: 'controller'` is passed. If the design needs a branch at the point the code-review controller loop begins, re-anchor that to the start-phase return of `next:'emit_judgements'` in `handler.ts`, after reading the file for the real line. A routing branch placed at line 490 would run only after the controller has already produced its judgements. |
| 3.4 | semantic | MED | assisted | The steering source src/prompts/steering-block.md and the two review tool descriptions in src/mcp/server.ts currently state that review is a controller task, and the guides and plugin copy are derived from that steering source rather than maintained separately. | Mostly confirmed, with one part unverifiable from the gathered evidence.  Confirmed: - Steering source: src/prompts/steering-block.md:221 reads "(no independent perspective); `insrc_review_step` moves the review's reasoning". - insrc_review_step description: src/mcp/server.ts:596 ("no independent perspective. This tool moves the review's"), :600 ("Genuine \\"two sets of eyes\\". Stamps meta.review with model='client'.") and :609 (the description string "no independent perspective; this tool moves the review's reasoning into "). - Daemon side: src/daemon/workflow-rpc.ts:398 "Opt-in finalize review (default off — a controller task)", and src/daemon/__tests__/workflow-rpc.test.ts:153 "does NOT review by default (review is a controller task)". - Plugin copy is derived: the same line 221 text appears in vscode-plugin/assets/steering-block.md:221, jetbrains-plugin/build/generated-resources/insrc/steering-block.md:221 and jetbrains-plugin/build/resources/main/insrc/steering-block.md:221. Prior artifacts describe these as copies (JetBrains S004 PLAN.md:21 `bundleSteeringBlock` Copy task from ../src/prompts/steering-block.md; VS Code S006 LLD.md:42 "sync-assets has copied ... steering-block.md into assets/"). - Guides are derived: on-demand-guidance S002 LLD.md:217 and S003 LLD.md:249 say guide.get / guide.list read the whole canonical steering-block.md via readSteeringBlock.  Not confirmed: - The premise says the TWO review tool descriptions in src/mcp/server.ts state this. The only server.ts hits for /controller task\|two sets of eyes\|moves the review/ are lines 596, 600 and 609, all in the insrc_review_step block. No server.ts line was gathered for the insrc_code_review_step description. The nearest hit is src/mcp/code-review-step/types.ts:13 ("genuine \\"two sets of eyes\\" over the code"), which is a type-file comment, not the tool description. - The grep for insrc_code_review_step was truncated at 50 matches, all under docs/, so the server.ts registration text was never shown. | Read the insrc_code_review_step registration in src/mcp/server.ts and confirm what its description actually says before building T13. If it does not carry the one-directional "controller task" wording, reword premise 3.4 and the T13 test subject so the test asserts the new two-direction wording is present, instead of asserting that a phrase which may never have been there is absent.  The prescribed change itself still holds: edit src/prompts/steering-block.md and both tool descriptions. Two additions to the task as written: - Include the src/daemon/workflow-rpc.ts:398 comment and the test title at src/daemon/__tests__/workflow-rpc.test.ts:153 in the wording sweep. - Re-run the plugin asset sync (VS Code sync-assets, JetBrains bundleSteeringBlock) so vscode-plugin/assets/steering-block.md does not go stale after the steering edit. |
| 2.1 | inventory | LOW | manual | finalizeArtifact has exactly three production call sites: one in the MCP synthesize phase (to pass 'controller') and two in the daemon workflow-run path (to pass 'daemon'). | The gathered grep for /finalizeArtifact\\(/ shows exactly three non-test, non-doc call sites: src/mcp/workflow-step/phases/synthesize.ts:46 (`const result = await finalizeArtifact(` — the MCP synthesize phase), src/daemon/workflow-rpc.ts:260 (`const result = await finalizeArtifact(intent, liveStepOutputs, runId, ..., artifactJson, opts.modelLabel, attributionNow())`) and src/daemon/workflow-rpc.ts:283 (`const r2 = await finalizeArtifact(..., corrected, opts.modelLabel, attributionNow())` — the correction retry in the same daemon workflow-run path). The only other src/ non-test match is the declaration at src/workflow/orchestrator.ts:383 (`export async function finalizeArtifact(`); every remaining match is under docs/ or a `__tests__/` directory. Because the handed grep was TRUNCATED at the 50-match cap (it stops at orchestrator.ts:383, so later-sorting production files could have been cut), I re-ran an untruncated grep of src/ excluding __tests__: it returns only synthesize.ts:11 (comment), :19 (import), :46 (call); workflow-rpc.ts:38 (import), :260 (call), :283 (call); orchestrator.ts:383 (declaration), :414 (error-message string); and review/extract.ts:118 (a prompt string mentioning the symbol, not a call). No fourth production call site exists. The count of three and the one-MCP / two-daemon split are both confirmed. | none — verified sound |
| 2.2 | citation | LOW | manual | persistBuildRecord(repoPath, rec) is declared at src/workflow/runners/build/standalone-record.ts:270 and returns { md, json }. | The read of src/workflow/runners/build/standalone-record.ts:270 returned FOUND: `export function persistBuildRecord(repoPath: string, rec: BuildRecord): { md: string; json: string } {`. The grep for /export function persistBuildRecord/ gives exactly one source-tree declaration, at src/workflow/runners/build/standalone-record.ts:270; the other three matches are prose in older LLD docs (two cite the former line 172, one quotes the signature), not competing declarations. The cited file, line, parameter list (repoPath, rec) and return shape { md, json } all match the premise. | none — verified sound |
| 2.2 | semantic | LOW | manual | mergeWithPrior at src/workflow/runners/build/standalone-record.ts:346 spreads the stored (prior) meta before the new meta, so a meta field present on the stored record and absent from the new write is kept. | The anchor resolves to the right entity: the read of src/workflow/runners/build/standalone-record.ts:346 returned `function mergeWithPrior(jsonPath: string, rec: BuildRecord): BuildRecord {`, and it is the only source definition among the 6 grep matches (the other 5 are docs). The grep for `...prior.meta` matches standalone-record.ts:357 (`...prior.meta,`), 11 lines into that function, so the stored meta is spread into the merged meta. The order (prior first, new second) is not shown directly by the source lines gathered, but is corroborated by docs/standalone/mergewithprior-silently-erases-prior-only-meta-E20261002013e8162/S001/CR.md:26, which quotes the spread as `{ ...prior.meta, ...rec.meta }`. Under that form a meta key present on the stored record and absent from the new write is kept, as the premise states. The same CR line notes one caveat that does not contradict the premise: a key supplied with an explicit `undefined` in rec.meta overrides the prior value; "no current writer does this". | none — verified sound |
| 2.3 | citation | LOW | manual | reviewArtifactFile(opts) is declared at src/workflow/review/run-artifact.ts:66, returns Promise<ReviewArtifactResult>, and is the function that stamps meta.review for a daemon-side design review. | The read of src/workflow/review/run-artifact.ts:66 returned `export async function reviewArtifactFile(opts: ReviewArtifactOpts): Promise<ReviewArtifactResult> {`, which confirms the cited line, the name and the return type. The grep for the export found exactly one declaration, so the anchor is unambiguous. The daemon-side use is supported by the call site at src/daemon/workflow-rpc.ts:346 (`const res = await reviewArtifactFile({`); other callers are src/cli/services/workflow.ts:248 and src/workflow/__tests__/spec-review-approve.test.ts:123. Not covered: the probes did not read the function body, so the clause that it stamps meta.review is not directly shown by this evidence. Nothing gathered contradicts it. | none — verified sound. The citation, signature and daemon call site are confirmed. Optionally add a probe for the meta.review write inside run-artifact.ts to ground the stamping clause directly. |
| 2.5 | closed-union | LOW | manual | The ArtifactKind union at src/workflow/path-scheme.ts:46 is exactly 'SPEC' \| 'DEF' \| 'HLD' \| 'LLD' \| 'PLAN' \| 'BUILD' \| 'CR' \| 'EXT' \| 'ISSUE' — nine kinds, so DEF/HLD/LLD/BUILD requiring review and SPEC/PLAN/ISSUE/CR/EXT requiring none covers every kind. | read src/workflow/path-scheme.ts:46 → FOUND: `export type ArtifactKind = 'SPEC' \| 'DEF' \| 'HLD' \| 'LLD' \| 'PLAN' \| 'BUILD' \| 'CR' \| 'EXT' \| 'ISSUE';` — exactly the nine members the premise lists, at the cited line. The premise's partition (DEF/HLD/LLD/BUILD require review = 4; SPEC/PLAN/ISSUE/CR/EXT require none = 5) sums to 9 and covers every member with no overlap or omission. The grep also shows a second, separate `export type ArtifactKind =` declaration at src/shared/artifacts.ts:31 (multi-line, members not included in the evidence); the premise is explicitly anchored to path-scheme.ts:46, so this does not contradict it, but that other union's members were not gathered. | none — verified sound. Optional: when building, confirm the review-requirement map imports ArtifactKind from src/workflow/path-scheme.ts and not the same-named type at src/shared/artifacts.ts:31, whose members were not part of the evidence. |
| 3.1 | semantic | LOW | manual | Artifact meta.attribution.outputs is declared at src/workflow/types.ts:286 and each entry carries a `model` label, with the literal label 'client' written for controller-authored (in-session) output. | `read src/workflow/types.ts:286 → FOUND: readonly model: string;` — the cited line is the `model` field, which is what the artifact's own sentence anchors there (LLD.md:128: "the label is the `model` of each entry in meta.attribution.outputs (src/workflow/types.ts:286)"). The entry shape and the 'client' literal are confirmed by real matches: src/workflow/__tests__/attribution.test.ts:83-86 (`singleModelAttribution('client')` then `a.outputs[0]!.model === 'client'`); src/daemon/__tests__/workflow-rpc.test.ts:111 (`json.meta.attribution.outputs[0]!.model === 'qwen3-test'` with the comment "NOT 'client'", i.e. a daemon run carries the provider label instead); src/workflow/__tests__/adjacent-scope-gate.test.ts:88 and companion-validation-gate.test.ts:144 (in-session callers pass 'client' as finalizeArtifact's model argument); docs/epics/frame-epic-per-role-per-step-E20260725820cc07b/S004/LLD.md:100 (finalizeArtifact declares `model: string = 'client'`). One imprecision in the premise wording only: line 286 is the per-entry `model` field, not the declaration of `outputs` itself; the evidence does not show the enclosing type, but this does not change what the LLD's readers consume. | none — verified sound. The LLD's anchor at src/workflow/types.ts:286 points at the per-entry `model` field its reader depends on, and 'client' is the label written for controller-authored output. |

#### Proposed fixes

- **2.1** (assisted) — The anchor file:line is verified, so no anchor correction is needed. The signature tail and parameter count were not captured by the probe (only the first line of a multi-line declaration was read), so no evidence-derived text edit can be proposed. A wider read is needed before the premise is confirmed or reworded.
  - option: Extend the probe to read the full multi-line signature starting at src/workflow/orchestrator.ts:383 and, if it matches, keep the premise as written.
  - option: If the wider read shows a different parameter tail or count, reword section 2.1 to quote the real signature and restate the ordinal position of authoredBy.
  - option: If the positional list is already long or differs, change the design to pass authoredBy through an options object or the existing attribution parameter instead of a new positional parameter.

- **2.2** (assisted) — The probe was truncated by docs and test hits before reaching the production files that hold the remaining writers, so the count of three cannot be confirmed or corrected from this evidence. No artifact edit is safe until a narrowed probe lists the real non-test call sites.
  - option: Re-run the probe restricted to src/ excluding __tests__ and, if it shows exactly two build-step writers plus one approval-time writer, keep the premise and add the three file:line anchors to the LLD.
  - option: If the narrowed probe shows a different number of production writers, rewrite the premise with the real inventory and specify for each writer whether it stamps 'controller' or nothing.
  - option: Drop the 'exactly three' count and restate the premise as a rule keyed on writer role (build-step writers stamp 'controller'; approval-time writers stamp nothing), with a test that fails if a new unclassified writer appears.

- **2.4** (assisted) — The declaration anchor and the daemon call site are verified. The MCP handler call is only indirectly supported: the evidence shows a `runReview` dependency seam that defaults to runCodeReview, with no direct call in handler.ts. No artifact edit is proposed because the premise's exact wording in the LLD markdown was not in the evidence, so a verbatim unique `find` string cannot be derived safely.
  - option: Reword the premise: runCodeReview is declared at src/workflow/code-review/runner.ts:158, called directly by src/daemon/code-review-rpc.ts:93, and reached by the MCP code-review handler through the CodeReviewStepDeps.runReview seam (which defaults to runCodeReview).
  - option: Keep the wording but add an anchor for the handler's `deps.runReview(...)` invocation line in src/mcp/code-review-step/handler.ts after reading the file to get the exact line.
  - option: Leave the premise as is and record a note that the handler call is indirect via the deps seam, since the prescribed opts change is unaffected.

- **2.5** (assisted) — The anchor and the throw are verified, so what gets built against the signature holds. Only the override-recording clause lacks evidence: the overrideReview grep hit its cap before reaching any gates.ts body line. No artifact edit is safe to emit without that read, so the choice is left to a human after a targeted read.
  - option: Read src/workflow/gates.ts:562-620; if the override reason is written to the artifact's meta, keep the premise and add the exact file:line of that write as an anchor.
  - option: If the read shows override only bypasses the block, reword the clause to 'bypasses the review block when overrideReview is given' and drop the recording claim.
  - option: If the LLD's new checks (no review, same-party review) depend on the override being recorded, add an explicit task to record it instead of assuming existing behaviour.

- **2.6** (manual) — The evidence confirms the file:line anchor and contradicts nothing, so there is no evidence-derived text correction to make. The gap is in the probes, not the artifact: the unscoped `skipped` and `enforce` greps hit the 50-match cap on docs before reaching source.
  - option: Re-probe with greps scoped to src/workflow/gates.ts plus a read of the function body from line 713, then re-judge (expected LOW if confirmed).
  - option: Add a probe for the `codeReview.enforce` default in the config catalog to ground the 'off by default' clause.
  - option: Accept with a note that the gate, skipped[] and enforce claims rest on prior approved artifacts (S004 LLD:162/:181, S007 LLD:211) rather than a direct source read.

- **3.1** (assisted) — The declaration anchor is confirmed, but the two behavioural claims (controller stamps 'client', daemon stamps a real model label) have no supporting match in the gathered evidence. No evidence-derived replacement text exists, so no safe auto-edit is possible; the premise needs a targeted re-probe and then a human-approved re-anchor.
  - option: Re-probe: read src/mcp/review-step/phases/verdicts.ts and grep for the stamp construction (e.g. `reviewedAt` or `model:` in src/mcp/review-step and src/workflow/review), then add the exact file:line of the controller stamping site to the premise.
  - option: Add a second anchor for the daemon review stamping site showing the real model label it writes, so the 'client' vs real-label distinction is grounded on both sides.
  - option: If verdicts.ts turns out not to stamp the literal 'client' (for example it uses a constant or a different label), reword the premise and the dependent fallback reader in the LLD to key on the label actually written.
  - option: Keep the premise as written and record it as an accepted unverified assumption, with a test in the build that asserts the controller review stamp's `model` equals 'client'.

- **3.2** (assisted) — The only gap is a probe that was too broad: an unscoped /connect/ grep hit its cap on unrelated files before reaching src/mcp/daemon-stream.ts. The evidence neither contradicts nor confirms that sub-claim, so no evidence-derived text edit is possible. A scoped re-probe settles it; the prescribed design is unchanged if the helper exists as described.
  - option: Re-probe with a grep for `connect` scoped to src/mcp/daemon-stream.ts plus a read of the helper's signature, and keep the premise as written if the injectable connect is confirmed.
  - option: If the helper exists but connect is not injectable, reword 3.2 to say so and add the injection seam to the LLD's scope as an explicit change.
  - option: If src/mcp/daemon-stream.ts has no workflow-run stream helper, re-anchor 3.2 to the actual MCP-side stream client and update the tests that depend on it (T9–T11).

- **3.2** (assisted) — The evidence confirms the call site but not the provider-resolution mechanism, so no evidence-derived text edit is safe. The author must confirm the mechanism from source and pick the wording; the prescribed change (the daemon method resolves a review provider) likely still holds either way, which is why this is MED rather than HIGH.
  - option: Verify at src/cli/services/workflow.ts:248 that the provider comes from the role router's `review` role, then keep 3.2 and add the exact file:line of the resolution call as its anchor.
  - option: If the TUI resolves the provider some other way (e.g. a config/default provider helper), reword 3.2 to name that mechanism and state explicitly whether the new daemon method mirrors it or deliberately uses the role router instead.
  - option: Re-anchor 3.2 on the existing daemon call site src/daemon/workflow-rpc.ts:346 and specify that the new daemon method resolves its provider the same way that handler does, dropping the TUI comparison.

- **3.3** (assisted) — The evidence shows handler.ts:490 is the runReview call in the judgements turn, not the loop entry. It does not give the line of the start-phase emit_judgements return, so no evidence-derived replacement line exists and a human must choose the intended meaning. No artifactEdits are offered because the premise text is not confirmed to appear verbatim in the artifact markdown.
  - option: Keep handler.ts:490 and reword the premise: it is the judgements-turn deps.runReview(...) call where the handler will pass reviewedBy 'controller', not the point where the loop begins.
  - option: Re-anchor the code-review half to the start-phase return of next:'emit_judgements' in src/mcp/code-review-step/handler.ts (read the file for the exact line) and keep the 'begins the controller loop' wording.
  - option: Cite both: the start-phase emit_judgements return as the loop entry with no authorship branch, and handler.ts:490 as the reviewedBy stamping site.

- **3.4** (assisted) — The evidence confirms the steering source, the insrc_review_step description, and the derived plugin and guide copies. It does not show the insrc_code_review_step description text in server.ts, so the "two tool descriptions" part of the premise is unverified. No verbatim-safe edit can be derived without reading that registration, so only options are offered.
  - option: Read the insrc_code_review_step registration in src/mcp/server.ts; if it carries the one-directional wording, keep premise 3.4 as written and add the server.ts line anchor.
  - option: If that description has no "controller task" wording, reword premise 3.4 to say the steering source and the insrc_review_step description state it, and that the insrc_code_review_step description must gain the two-direction rule; change T13 to assert presence of the new wording in both.
  - option: Widen the premise and task to also cover src/daemon/workflow-rpc.ts:398 and the test title at src/daemon/__tests__/workflow-rpc.test.ts:153, and add an explicit step to re-sync vscode-plugin/assets/steering-block.md and the JetBrains bundled copy.

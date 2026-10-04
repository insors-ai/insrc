<!-- insrc:artifact LLD-1716f77ba9ba017b-S001 -->

# LLD: E202610041716f77b:S001

## Summary

**Epic:** `two-sets-eyes-review-rule-only`
**HLD base run:** `wf-1791133474073-scd3sy`
**HLD effective hash:** `817d768f8340...`

Reviews are meant to be a second pair of eyes, but today the controller writes a design or a change and then reviews it itself. This design records, on every authored record and every review, which party did it (the controller or the daemon), makes the two existing review tools send the review to the other party without the caller having to choose, and makes approval refuse a review done by the party that wrote the work. The same model may run on both sides; what the rule separates is the party.

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

**Surface level:** internal-shared

### 2.1 `ReviewReport`

```typescript
interface ReviewReport { artifact; stage; verdict; findings; counts; reviewedAt; model; reviewedBy?: 'controller' | 'daemon' | undefined }
```

**Parameters:**
- `reviewedBy: 'controller' | 'daemon' | undefined` _(optional)_ — The party that performed the review. Stamped by the path that ran it: the controller loop in src/mcp/review-step writes `controller`; reviewArtifactFile writes `daemon`.

**Returns:** `n/a` — A data shape. `model` keeps its meaning. One new shared reader, reviewerPartyOf, returns the explicit field when present; otherwise `controller` when model is the literal 'client', `daemon` when model is any other non-empty string, and undefined when neither tells.

**Preconditions:**
- The same optional field and the same reader apply to the code-review record's meta, written by runCodeReview from a new run option: the MCP handler passes `controller`, codeReviewRunStart passes `daemon`.

**Postconditions:**
- A review written before this change is still read correctly through the model-label fallback.

### 2.2 `finalizeArtifact`

```typescript
function finalizeArtifact(intent, steps, runId, elapsedMs, emit, model?: string, attribution?: ArtifactModelAttribution, authoredBy?: 'controller' | 'daemon'): Promise<FinalizeResult>
```

**Parameters:**
- `authoredBy: 'controller' | 'daemon' | undefined` _(optional)_ — The party that authored the artifact. The MCP workflow-step synthesize phase passes `controller`; the daemon's workflow.run passes `daemon`.

**Returns:** `Promise<FinalizeResult>` — Unchanged, except that the finalized artifact's meta carries authoredBy when the argument was given. It is stamped in ONE place for every workflow, not once per finalizer.

**Preconditions:**
- Omitting the argument produces byte-identical output to today.

**Postconditions:**
- A new shared reader, authorPartyOf(meta), returns the explicit field when present; otherwise it infers from meta.attribution: `controller` when every output stamp's model is the literal 'client', `daemon` when there are stamps and none is 'client', and undefined for no stamps or a mixture.

### 2.3 `persistBuildRecord`

```typescript
function persistBuildRecord(repoPath: string, rec: BuildRecord): { md: string; json: string }  // BuildRecord.meta gains authoredBy?: 'controller' | 'daemon' | undefined
```

**Parameters:**
- `rec.meta.authoredBy: 'controller' | 'daemon' | undefined` _(optional)_ — The party that wrote the code this record describes. The build-step validate phase and the Trivial implement write stamp `controller`, because the controller is the one editing. The completion-time writer omits it: it runs at approval and cannot know.

**Returns:** `{ md: string; json: string }` — Unchanged. The record merge keeps a prior authoredBy the way it keeps the other identity fields.

**Postconditions:**
- There is no label fallback for code: a BUILD record without the field has an unknown author.

### 2.4 `handleStart`

```typescript
function handleStart(input: ReviewStepInputStart): Promise<ReviewStepEmitClaims | ReviewStepDone | ReviewStepError>  // insrc_review_step, phase 'start'
```

**Parameters:**
- `input.artifact: string` — The artifact to review, as today.

**Returns:** `ReviewStepEmitClaims | ReviewStepDone | ReviewStepError` — Routes by the artifact's author. Author `daemon`: today's response (emit_claims), and the controller runs the review. Author `controller` or unknown: the tool asks the daemon to review the artifact and returns `done` in this same turn, with the verdict, counts, report, applied and pending lists the daemon produced, and reviewedBy `daemon`. Daemon progress is forwarded through the existing MCP progress channel while the call waits.

**Errors:**
- `daemon-review-failed` when The daemon is unreachable, declines, or its review fails. The response names the cause. The tool does NOT fall back to a controller review.
- `daemon-review-timeout` when The daemon does not finish within the tool's wait limit (10 minutes by default). The response says the daemon may still stamp the review and that the artifact should be re-read before retrying.

**Preconditions:**
- An unknown author is routed to the daemon because the caller of this tool is the controller, and in practice the controller is the author of anything it is asking to have reviewed.

**Postconditions:**
- The `verdicts` phase refuses, with error same-party-review, to stamp a controller review onto an artifact whose author is the controller. This closes the path of a state token obtained before the artifact's author was known.
- The tool's name, its `start` input and its `done` shape are unchanged.

### 2.5 `handleCodeReviewStep`

```typescript
function handleCodeReviewStep(input, deps?: CodeReviewStepDeps): Promise<envelope>  // insrc_code_review_step; CodeReviewStepDeps gains runDaemonReview and readBuildAuthor
```

**Parameters:**
- `deps.runDaemonReview: (args: { repo: string; epicHash: string; storyId: string }) => Promise<{ verdict; counts; path; scopeDropped? }>` _(optional)_ — Asks the daemon to run the code review (the existing codeReview.run stream) and resolves with its outcome. A seam so tests do not need a daemon.
- `deps.readBuildAuthor: (repo: string, epicHash: string, storyId: string) => 'controller' | 'daemon' | undefined` _(optional)_ — Reads meta.authoredBy from the Story's BUILD record.

**Returns:** `envelope` — On `start`: BUILD author `daemon` runs today's controller flow unchanged (freshness wait, emit_judgements, degraded path). Author `controller` or unknown asks the daemon to run the review and returns `done` in the same turn with reviewedBy `daemon`.

**Errors:**
- `daemon-review-failed` when The daemon is unreachable, declines the subject, or its run fails. No fallback to a controller review.
- `daemon-review-timeout` when As for the design review.

**Preconditions:**
- No daemon path writes code today, so in practice every code review is run by the daemon after this change.

**Postconditions:**
- The `judgements` phase refuses, with error same-party-review, when the BUILD author is the controller.

### 2.6 `workflow.review`

```typescript
daemon stream method workflow.review(params: { repo?: string; artifactPath: string }) -> progress frames, then done { verdict, counts, report, applied, pending, reviewedBy: 'daemon' } or error
```

**Parameters:**
- `params.artifactPath: string` — The artifact's markdown or json path.
- `params.repo: string` _(optional)_ — Repo root; falls back to INSRC_REPO as the other daemon methods do.

**Returns:** `stream` — New. Runs reviewArtifactFile inside the daemon with the provider the role router resolves for the `review` role, exactly as the TUI's review command does in its own process. A peer of codeReview.run, and like it must be called with stream: true.

**Errors:**
- `same-party-review` when The artifact's author is the daemon. Sent as an error frame; nothing is stamped.
- `artifact-missing` when The path does not resolve to an artifact.

**Postconditions:**
- codeReviewRunStart applies the same refusal when the Story's BUILD author is the daemon.
- src/mcp/daemon-stream.ts gains one helper per review method, alongside runWorkflowStream.

### 2.7 `approveArtifactByJsonPath`

```typescript
function approveArtifactByJsonPath(jsonPath: string, opts?: { readonly overrideReview?: string }): ApprovalResult
```

**Parameters:**
- `opts.overrideReview: string | undefined` _(optional)_ — Unchanged: a reason that approves past the review gate and is recorded on the artifact.

**Returns:** `ApprovalResult` — Unchanged on success.

**Errors:**
- `the existing review-block refusal` when NEW cause: the artifact carries a review whose party equals the artifact's author party, both known, and no override was given. The reason reads that the review was done by the authoring party and names the side that must run it.

**Preconditions:**
- The same-party check runs before the block-verdict check.

**Postconditions:**
- An unknown author or an unknown reviewer never withholds.
- An artifact with no review is approvable exactly as today.

### 2.8 `enforceCodeReviewGate`

```typescript
function enforceCodeReviewGate(...): CodeReviewGateResult  // the union gains { status: 'same-party'; message: string }
```

**Returns:** `CodeReviewGateResult` — Returns the new `same-party` status when the Story's code-review record was written by the same party as its BUILD record's author, both known. approveWorkflowTarget withholds BUILD completion on `same-party` the way it does on `blocked`, unless overrideReview is given.

**Postconditions:**
- The other five statuses, and when each withholds, are unchanged.

## 3. Data model changes

### 3.1 `Design artifact meta (ArtifactMetaBase)` — field-add

Optional authoredBy: 'controller' | 'daemon'. Absent on every existing artifact; inferred from the attribution model label for those.

**Call sites:**
- `src/workflow/types.ts`
- `src/workflow/orchestrator.ts`
- `src/workflow/attribution.ts`

### 3.2 `BUILD record meta (BuildRecord)` — field-add

Optional authoredBy: 'controller' | 'daemon'. No fallback: an older record's author is unknown.

**Call sites:**
- `src/workflow/runners/build/standalone-record.ts`

### 3.3 `Design review stamp (ReviewReport) and code-review record meta` — field-add

Optional reviewedBy: 'controller' | 'daemon' on both. Older stamps are read through the model label.

**Call sites:**
- `src/workflow/review/types.ts`
- `src/workflow/code-review/runner.ts`
- `src/mcp/review-step/phases/verdicts.ts`
- `src/mcp/code-review-step/handler.ts`
- `src/daemon/code-review-rpc.ts`

### 3.4 `Approval gate` — invariant-change

Current behaviour: approval is refused only for a review whose effective verdict is block; who reviewed is never considered, and the code-review gate withholds only on blocked (or on no-review under enforcement). New: a review by the authoring party also withholds, for design artifacts and for BUILD completion, with the existing override.

**Call sites:**
- `src/workflow/gates.ts`
- `src/workflow/code-review/gate.ts`

### 3.5 `Steering source, workflow guides and review tool descriptions` — invariant-change

Current text says a daemon self-review is not independent, so the controller reviews. New text states the rule in both directions: the party that did not author the work reviews it; the review tools route this themselves; the same model on both sides is acceptable; a failed daemon review is reported, never replaced by a self-review.

**Call sites:**
- `src/prompts/steering-block.md`
- `src/mcp/server.ts`
- `src/daemon/workflow-rpc.ts`
- `src/mcp/guide/handler.ts`

## 4. Error paths

**Error cases**

- **The daemon is not running, or closes the connection, when a review tool asks it to review.** (recoverable)
  - Detection: The MCP server's stream helper gets a socket error (ENOENT, ECONNREFUSED) or the socket closes before a terminal frame.
  - Response: The tool returns error daemon-review-failed with the cause and how to start the daemon. No review is stamped and the controller loop is not offered.
  - User impact: The artifact has no review. Approval is not blocked by this (an unreviewed artifact is approvable as today); the user decides whether to start the daemon and retry or to approve without a review.
- **The daemon's review fails part-way (provider error, structured-output failure).** (recoverable)
  - Detection: The daemon sends an error frame on the stream.
  - Response: The tool returns daemon-review-failed with the daemon's message. Nothing is stamped.
  - User impact: Same as above; the daemon's message says what failed.
- **The daemon review takes longer than the tool's wait limit.** (recoverable)
  - Detection: A timer in the MCP tool fires before a terminal frame arrives.
  - Response: The tool stops waiting and returns daemon-review-timeout. It does not abort the daemon's run. The message says the review may still be stamped and to re-read the artifact before retrying.
  - User impact: A slow review looks like a failure to the controller but may complete; a second call can produce a second review, the later of which wins.
- **The controller submits claims or verdicts for an artifact it authored, using a state token from a `start` made before routing existed or against a stale tool.** (recoverable)
  - Detection: The verdicts phase reads the artifact's author party before stamping and finds `controller`.
  - Response: Error same-party-review; nothing is stamped.
  - User impact: The self-review is refused at the point it would have been recorded.
- **The daemon is asked to review an artifact, or a build, that the daemon authored.** (recoverable)
  - Detection: workflow.review reads the artifact's author party; codeReview.run reads the BUILD record's author party; either finds `daemon`.
  - Response: An error frame, same-party-review; nothing is stamped.
  - User impact: The caller is told the controller must review this one.
- **Approval is requested for an artifact whose only review was done by its author's party.** (recoverable)
  - Detection: approveArtifactByJsonPath compares authorPartyOf(meta) with reviewerPartyOf(meta.review); enforceCodeReviewGate compares the BUILD author with the code-review record's reviewer.
  - Response: Approval is withheld with a reason naming the party and the side that must review. With overrideReview the approval proceeds and the reason is recorded as today.
  - User impact: The user sees why and can either get the other party's review or override with a reason.
- **A record carries an authoredBy or reviewedBy value that is neither `controller` nor `daemon`.** (recoverable)
  - Detection: The shared readers accept only the two literals.
  - Response: The value is treated as absent and the label fallback applies; if that also tells nothing, the party is unknown.
  - User impact: None; an unknown party never withholds.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The controller writes an LLD through insrc_workflow_step and calls insrc_review_step start on it. | The LLD carries authoredBy `controller`. The tool has the daemon review it and returns `done` with reviewedBy `daemon`. Approval is not withheld for party reasons. |
| A daemon-driven workflow run writes an artifact and the controller calls insrc_review_step start on it. | authoredBy `daemon`. The tool returns emit_claims as today; the controller's review is stamped with reviewedBy `controller`; approval is not withheld. |
| An artifact written before this change by the controller (attribution model 'client'), carrying a controller review (model 'client'). | Both parties resolve to `controller` through the label fallback, so approval is withheld as a same-party review unless overridden. This applies to artifacts not yet approved; an already approved artifact is not re-examined. |
| An artifact with no attribution stamps, or with a mixture of 'client' and other models. | Author unknown. insrc_review_step routes it to the daemon. Approval is never withheld for party reasons. |
| A Story built through insrc_build_step, then insrc_code_review_step start. | The BUILD record carries authoredBy `controller`. The daemon runs the code review and the record carries reviewedBy `daemon`. |
| A Story whose BUILD record predates this change, with a controller-written code-review record. | The BUILD author is unknown (code has no label fallback), so completion is not withheld for party reasons. A new code review of it is routed to the daemon. |
| The controller and the daemon both run Claude Opus. | Nothing changes: the rule compares parties, not models. |
| The TUI's review command reviews an artifact in its own process. | Stamped reviewedBy `daemon`: it is the non-controller side, run by the person at the terminal rather than by the authoring session. |
| An artifact is approved with no review at all. | Allowed exactly as today. Whether an unreviewed artifact should be approvable is a separate question this Story does not change. |
| An artifact reviewed by the other party with a block verdict. | Withheld by the existing block rule; the party check passes. |
| A controller review is refused as same-party and the user overrides at approval. | Approved, with the override reason recorded on the artifact, as for a block override. |
| The daemon code review cannot run tests in its sandbox. | Its coverage dimension reports the tests as unverified, as observed on 2026-10-04. Declared limitation: the controller's own test run is evidence the user weighs, not a substitute review. |

**Invariants to preserve**

- An artifact with no review is approvable, and a review with a block verdict withholds approval unless overridden. [[c3]]
- The names, start inputs and done shapes of insrc_review_step and insrc_code_review_step are unchanged. [[c4]]
- Omitting the new author argument leaves a finalized artifact byte-identical to today's. [[c1]]
- Existing artifacts and records, which carry neither new field, remain readable and approvable. [[c2]]

## 5. Test strategy

**Test framework:** `node:test run through tsx, node:assert/strict`

**Test levels**

- **contract** — The Story carries no enumerated acceptance criteria, so the criteria the acceptance mapping refers to are defined here.
  - Subjects: `ac1: a design artifact the controller authored is reviewed by the daemon, and one the daemon authored by the controller, through the existing insrc_review_step tool`, `ac2: code built through insrc_build_step is reviewed by the daemon through the existing insrc_code_review_step tool`, `ac3: every newly written artifact, BUILD record, design review and code-review record states its party`, `ac4: approval withholds a review done by the authoring party, for design artifacts and for BUILD completion, and an override approves past it with the reason recorded`, `ac5: a failed, declined or timed-out daemon review is reported as such and is never replaced by a controller review`, `ac6: records with no stated party stay readable and approvable, and omitting the new arguments changes no output`, `ac7: the steering, the review guide and both review tool descriptions state the rule in both directions and say the same model on both sides is acceptable`
- **unit** — The two party readers and the party stamps on each record.
  - Subjects: `T1 authorPartyOf: explicit authoredBy wins over a contradicting attribution label`, `T2 authorPartyOf fallback: every stamp 'client' -> controller; stamps with none 'client' -> daemon; no stamps -> undefined; a mixture -> undefined`, `T3 authorPartyOf: an authoredBy that is not one of the two literals is treated as absent`, `T4 reviewerPartyOf: explicit reviewedBy wins; model 'client' -> controller; another non-empty model -> daemon; empty or absent -> undefined`, `T5 finalizeArtifact with authoredBy 'controller' and with 'daemon': the persisted meta carries it, for at least a design.story, a plan and an issue artifact (one stamping place serves every workflow)`, `T6 finalizeArtifact without the argument: the rendered json is byte-identical to the pre-change output`, `T7 the MCP workflow-step synthesize phase finalizes with authoredBy 'controller'; the daemon workflow.run finalizes with 'daemon'`, `T8 the build-step validate phase and the Trivial implement write persist a BUILD record with authoredBy 'controller'; a later write that omits the field keeps it; the completion-time writer writes none`, `T9 the controller review loop stamps reviewedBy 'controller'; reviewArtifactFile stamps reviewedBy 'daemon'`, `T10 runCodeReview writes the reviewedBy it is given onto the record's meta: 'controller' from the MCP handler, 'daemon' from codeReviewRunStart`
  - Fixtures: `artifact json fixtures with explicit, inferred, mixed and empty attribution`, `the finalizeArtifact harness in src/workflow/__tests__/folder-identity-finalize.test.ts`
- **unit** — The approval gate.
  - Subjects: `T11 approveArtifactByJsonPath: controller-authored artifact with a controller review and a pass verdict -> withheld; the reason names the party and the side that must review`, `T12 the same with overrideReview -> approved, and meta.reviewOverride holds the reason`, `T13 controller-authored with a daemon review, and daemon-authored with a controller review -> approved`, `T14 unknown author, or unknown reviewer -> approved (never withheld for party reasons)`, `T15 no review at all -> approved, exactly as before`, `T16 an other-party review with a block verdict -> withheld by the existing block rule, with the existing message`, `T17 a pre-change artifact (attribution 'client', review model 'client', neither new field) -> withheld through the label fallback; with overrideReview -> approved`, `T18 enforceCodeReviewGate: BUILD authoredBy 'controller' and a code-review record reviewedBy 'controller' -> status same-party; with reviewedBy 'daemon' -> today's status; with a BUILD record lacking authoredBy -> today's status`, `T19 approveWorkflowTarget withholds BUILD completion on same-party and approves it with overrideReview; the other five gate statuses behave as before`
  - Fixtures: `the gate fixtures in src/workflow/__tests__/gates.test.ts`
- **integration** — Routing inside the two review tools and the daemon's refusals, with the daemon seam faked so no daemon is needed.
  - Subjects: `T20 insrc_review_step start on a controller-authored artifact: the daemon review seam is called once with the artifact path; the response is `done` with the daemon's verdict and reviewedBy 'daemon'; no emit_claims is returned`, `T21 insrc_review_step start on a daemon-authored artifact: the daemon seam is NOT called and the response is emit_claims, identical to today's`, `T22 insrc_review_step start on an artifact with unknown author: routed to the daemon`, `T23 insrc_review_step: the daemon seam rejects -> error daemon-review-failed with the cause; the response offers no claims prompt and nothing is stamped on the artifact`, `T24 insrc_review_step: the daemon seam never settles -> error daemon-review-timeout after the (injected, short) wait limit; nothing is stamped`, `T25 insrc_review_step verdicts phase on a controller-authored artifact -> error same-party-review; the artifact json is unchanged on disk`, `T26 insrc_code_review_step start with BUILD authoredBy 'controller', and with no BUILD author: the daemon seam is called; the response is `done` with reviewedBy 'daemon'; neither the freshness seam nor the grounding seam is called`, `T27 insrc_code_review_step start with BUILD authoredBy 'daemon': the daemon seam is NOT called and the existing flow runs; every existing handler test passes with this author`, `T28 insrc_code_review_step: the daemon seam rejects or times out -> daemon-review-failed / daemon-review-timeout; no record is written`, `T29 insrc_code_review_step judgements phase with BUILD authoredBy 'controller' -> error same-party-review; no record is written`, `T30 daemon workflow.review on a daemon-authored artifact -> an error frame same-party-review and an unchanged artifact; on a controller-authored artifact -> a done frame and a stamped review with reviewedBy 'daemon'`, `T31 daemon codeReview.run on a Story whose BUILD author is 'daemon' -> an error frame same-party-review and no record`, `T32 the MCP stream helpers for workflow.review and codeReview.run send `stream: true` and resolve on the done frame, reject on an error frame and on a socket close`
  - Fixtures: `injected deps for both tool handlers`, `a fake socket for the stream helpers, as the existing daemon-stream tests use`, `a fake review provider for the daemon handlers`
- **unit** — The written rule.
  - Subjects: `T33 the steering source states that the party that did not author the work reviews it, names both directions, and says the same model on both sides is acceptable; it no longer says that review is a controller task`, `T34 the insrc_review_step and insrc_code_review_step tool descriptions say the tool routes the review to the other party and may return `done` directly`, `T35 the review guide returned by insrc_guide carries the same rule (it is served from the steering source)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `T20`, `T21`, `T22`, `T30` |
| `ac2` | `T26`, `T27`, `T31` |
| `ac3` | `T5`, `T7`, `T8`, `T9`, `T10` |
| `ac4` | `T11`, `T12`, `T13`, `T17`, `T18`, `T19`, `T25`, `T29` |
| `ac5` | `T23`, `T24`, `T28` |
| `ac6` | `T2`, `T4`, `T6`, `T14`, `T15`, `T16` |
| `ac7` | `T33`, `T34`, `T35` |

## 6. Migration

**State before:** The party that authored a design artifact, and the party that reviewed it, are implied by a model label ('client' for the controller) and stated nowhere; the BUILD record says nothing about who wrote the code (types.ts, attribution.ts, standalone-record.ts, verdicts.ts). The two review tools always run the review in the controller. The daemon can run a code review on request but has no request to review an existing artifact (code-review-rpc.ts, run-artifact.ts). The approval gate refuses only a review with a block verdict and never considers who reviewed (gates.ts, gate.ts). The steering, the tool description and a daemon comment all say the controller reviews because the daemon is the author.

**State after:** Every newly written artifact, BUILD record, design review and code-review record states its party. The two review tools read the author and send the review to the other party: the daemon for controller-authored work, the controller for daemon-authored work. The daemon can review an existing artifact on request and refuses work it authored. Approval withholds a review done by the authoring party, with the existing override. A failed daemon review is reported and never replaced by a self-review. The written rule covers both directions.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the two party readers and the optional party fields to the four record shapes; nothing writes or reads them yet. — ↩ rollbackable
2. Stamp the author party when finalizing an artifact (the controller from the MCP synthesize phase, the daemon from its workflow run) and on the BUILD record from the build-step writers. — ↩ rollbackable
3. Stamp the reviewer party on the design review from both review paths and on the code-review record from both callers. — ↩ rollbackable
4. Add the daemon request to review an existing artifact, its refusal of daemon-authored work, the same refusal in the daemon code review, and the MCP server's helpers for calling both. — ↩ rollbackable
5. Route inside insrc_review_step: daemon review for a controller-authored or unknown-author artifact, today's loop for a daemon-authored one, and refuse a same-party stamp in the verdicts phase. — ↩ rollbackable
6. Route inside insrc_code_review_step the same way, and refuse a same-party record in the judgements phase. — ↩ rollbackable
7. Make the approval gate and the code-review gate withhold a same-party review, with the existing override. — ↩ rollbackable
8. Rewrite the steering source, the two review tool descriptions and the daemon comment to state the rule in both directions; the guides follow from the steering source. — ↩ rollbackable
9. Add the tests in the test strategy; confirm each new assertion fails when its production change is reverted. — ↩ rollbackable

**Backward compat:** All four new fields are optional and absent on every existing record, which stays readable. Omitting the new arguments leaves written output byte-identical. The two tools keep their names, start inputs and done shapes; what changes is that `start` may return `done` directly, which a caller following the `next` field already handles. Behaviour changes a user will notice: (1) reviewing your own work through the tools is no longer possible, and a controller-authored artifact now waits on the daemon, so the daemon must be running and a review call can take minutes; (2) an unapproved artifact written before this change by the controller and carrying a controller review is withheld at approval as a same-party review, until the daemon reviews it or the user overrides; already approved artifacts are not re-examined; (3) the daemon cannot run tests in its sandbox, so its code review reports test results as unverified. The installed daemon and the MCP server must both be on the new build: an older daemon does not know the new review request, and the tool then reports daemon-review-failed rather than falling back. Reverting the code leaves the new fields on disk as inert data.

## 7. Alternatives considered

### 7.1 a1: State the party on the record; the existing review tools route by it; the gate checks it — **CHOSEN**

Every authored thing and every review names its party; insrc_review_step and insrc_code_review_step send the review to the other party automatically; approval withholds on a same-party review.

Add an explicit party (`controller` or `daemon`) to what is authored and to what reviews it: meta.authoredBy on design artifacts and on the BUILD record, reviewedBy on the design review stamp and on the code-review record. Each writer stamps its own side. One shared function answers both questions for a record, reading the explicit field and falling back to today's model label ('client' means controller) for older records, and returning unknown when neither tells. The two existing review tools keep their names and become routers: on start they read the author party and, when the controller is the author, ask the daemon to run the review and return its result in one turn; when the daemon is the author they run today's controller loop. The daemon gains a request to review an existing artifact, beside its existing code-review request. The approval gate withholds an artifact whose review was done by the authoring party, with the existing override; an unknown author or reviewer never withholds.

### 7.2 a2: Infer the party from the existing model labels; no new fields

Treat model 'client' as controller everywhere and route and gate on that.

No record changes. A helper reads meta.attribution and meta.review.model (and the code-review record's model) and treats the literal 'client' as the controller and anything else as the daemon. Routing and the gate are as in a1.

**Rejected because:** Cheaper, but it does not record the parties and cannot cover code.

### 7.3 a3: Separate daemon review tools; the steering chooses

Leave the two controller tools alone and add insrc_daemon_review / insrc_daemon_code_review; the steering says which to call.

Record the parties and gate as in a1, but do not route inside the existing tools. Add two new MCP tools that ask the daemon to review, and rewrite the steering to say: use the daemon tools for work you authored.

**Rejected because:** Same records and gate as a1, but leaves the choice of reviewer to the party being reviewed.

## 8. References

- **[[c1]]** `code` `src/workflow/attribution.ts` — "export function singleModelAttribution(label: string): ArtifactModelAttribution {"
- **[[c2]]** `code` `src/workflow/review/types.ts` — "export interface ReviewReport {"
- **[[c3]]** `code` `src/workflow/gates.ts` — "if (review !== undefined && effectiveReviewVerdict(review, artifact.meta.reviewResolutions) === 'block') {"
- **[[c4]]** `code` `src/mcp/review-step/phases/start.ts` — "export async function handleStart(input: ReviewStepInputStart): Promise<ReviewStepEmitClaims> {"
- **[[c5]]** `code` `src/mcp/review-step/phases/verdicts.ts` — "const REVIEW_MODEL = 'client';"
- **[[c6]]** `code` `src/daemon/code-review-rpc.ts` — "export async function codeReviewRunStart("
- **[[c7]]** `code` `src/workflow/code-review/gate.ts` — "export function enforceCodeReviewGate("
- **[[c8]]** `code` `src/prompts/steering-block.md` — "A daemon self-review runs the SAME model that authored the artifact"
- **[[c9]]** `prior-artifact` `ISSUE-1716f77ba9ba017b`
- **[[c10]]** `stakeholder` `user, 2026-10-04` — "the review has to be done by the other party, if using claude or codex as both parties, so be it."
- **[[c11]]** `step-output` `s1`
- **[[c12]]** `step-output` `s3`

## 9. Open questions

- Should approval require a review at all? Today an artifact with no review is approvable, so after this change a same-party review withholds approval while no review does not. This Story leaves the no-review case as it is; closing it would be a separate change.
- Is a 10 minute wait limit right for a daemon review called from a tool? It is a guess: the daemon code reviews observed on 2026-10-04 took 15 seconds to about two minutes, and no daemon design review has been timed.

<!-- insrc:artifact LLD-e6ddcdcb3d9cf330-s3 -->

# LLD: STORY-e6ddcdcb3d9cf330-s3

## Summary

**Epic:** `review-committed-work-task-checkpoints`
**HLD base run:** `wf-1793386460254-8th2oq`
**HLD effective hash:** `9644e9acbe91...`

Connect normal code-review requests to the working task-review engine and keep independent reviews isolated. Retain completed review summaries permanently, then delete the story’s temporary checkpoint files only after its BUILD is approved. Daemon reviews survive submitter disconnect; controller reviews require explicit retrigger after loss of their live owner.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)

## 1. HLD context

> See **HLD-e6ddcdcb3d9cf330** § 2. Framework summary

**Rollout phase:** C — concurrency and approval lifecycle
**Consumes:** `sc1` (Committed review packet and task assessment), `sc2` (Single checkpoint file and execution lifecycle), `sc3` (Permanent CR projection and story cleanup)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Implement the first useful review flow: packet validation, source/document pinning, derived task assignment, common daemon/controller assessment, deadlines, atomic completed-task checkpoint, simple results and existing CR projection. Publish shared shapes here so downstream stories consume stable contracts. Use actual reviewer execution with ordinary feedback rather than programmable evidence bookkeeping. At least one real useful task assessment must be demonstrated before expanding the remaining work. Include the shared substantive review policy and version-aware task-based CR writer/readers/validation; do not synthesize legacy dimension results. Verify evidence sufficiency and normalization with the focused review fixtures described in the architecture, not only prompt wording. — owns `sc1`, `sc2`, `sc3`
- `s2`: Own interrupted-attempt continuation and history-aware re-review policy. Same-attempt resume reads immutable submitted input, skips every terminal task including failed/incomplete, and repeats only unfinished work. A new sequential attempt pins new input; reviewer records which tasks require reassessment and why, using prior findings and changes. Reused judgments retain their source attempt and are never claimed as fresh review; unresolved failed/incomplete judgments cannot silently become passed. A changed packet on resume is an explicit conflict. Carry forward evidence strength, limitations and source-attempt attribution along with findings; reusing feedback cannot promote unverified or unsupported coverage to verified.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `startTaskReview`

```typescript
startTaskReview(raw: unknown, trusted?: TrustedRpcContext, deps?: TaskReviewRpcDeps): Promise<unknown>
```

**Parameters:**
- `raw: unknown` — Untrusted JSON wire input; existing parsePacket/requireReview validate before execution.
- `trusted: TrustedRpcContext` _(optional)_ — Host-only connection identity and lifetime.
- `deps: TaskReviewRpcDeps` _(optional)_ — Existing provider seam.

**Returns:** `existing acknowledgement/exchange/approval result` — Bounded asynchronous operation result; never claims model completion from an acknowledgement

**Errors:**
- `TaskReviewInputError` when Invalid scope, duplicate review, attempt conflict or wrong reviewer; field/message retains existing error details.
- `Error` when Filesystem persistence or existing lifecycle gate error; preserve original subtype and operation, never fabricate success.

**Preconditions:**
- Canonical registered project and current schema; caller supplies no trusted reviewer identity.

**Postconditions:**
- Normal MCP insrc_code_review_step start/resume requires reviewId, attempt, operation and committed packet on start; no HEAD-derived scope, auto attempt, fallback engine or blocking model wait.
- Expose short progress/publish and controller assignment/scope/activity/result phases through the same named tool; exact native task schemas reused.
- Use one persistent daemon connection per live MCP review owner, closed on MCP session shutdown or controller operation cancellation; reconnect requires explicit resume. Daemon work remains independent of that connection.
- Keep task owner in main daemon for all routed/direct entrypoints; worker and step-host forwarding uses existing trusted bridges and does not create local coordinators.
- Reject duplicate same-id start/resume across sessions; different ids run independently; within each review all provider calls remain serial.

### 2.2 `exchangeControllerTaskReview`

```typescript
exchangeControllerTaskReview(raw: unknown, trusted: TrustedRpcContext | undefined, phase: 'assignment' | 'scope' | 'result' | 'activity'): Promise<unknown>
```

**Parameters:**
- `raw: unknown` — Untrusted exchange JSON validated against assignment and envelope.
- `trusted: TrustedRpcContext | undefined` — Host-supplied authority; missing live owner rejected.
- `phase: 'assignment' | 'scope' | 'result' | 'activity'` — Existing exchange operation.

**Returns:** `existing acknowledgement/exchange/approval result` — Bounded asynchronous operation result; never claims model completion from an acknowledgement

**Errors:**
- `TaskReviewInputError` when Invalid scope, duplicate review, attempt conflict or wrong reviewer; field/message retains existing error details.
- `Error` when Filesystem persistence or existing lifecycle gate error; preserve original subtype and operation, never fabricate success.

**Preconditions:**
- Canonical registered project and current schema; caller supplies no trusted reviewer identity.

**Postconditions:**
- Controller route uses actual connected controller, never spawns a CLI and labels it controller. Preserve phase/execution/sequence fences and activity-v1.
- Carry trusted connection lifetime through existing session/worker transport; do not clone AbortSignals or accept owner tokens from JSON.
- Progress is read-only and can use an observer connection. Tool responses include checkpoint path and required next exchange; do not wait for model completion.

### 2.3 `approveWorkflowTarget`

```typescript
approveWorkflowTarget(req: WorkflowApproveRequest): Promise<WorkflowApproveResult>
```

**Parameters:**
- `req: WorkflowApproveRequest` — Existing typed artifact target, lifecycle and explicitly authorized approval options.

**Returns:** `existing acknowledgement/exchange/approval result` — Bounded asynchronous operation result; never claims model completion from an acknowledgement

**Errors:**
- `TaskReviewInputError` when Invalid scope, duplicate review, attempt conflict or wrong reviewer; field/message retains existing error details.
- `Error` when Filesystem persistence or existing lifecycle gate error; preserve original subtype and operation, never fabricate success.

**Preconditions:**
- Canonical registered project and current schema; caller supplies no trusted reviewer identity.

**Postconditions:**
- Existing reviewed BUILD remains immutable at approval except lifecycle metadata. Retain both new approval bugfixes.
- After each successful BUILD approval, invoke story cleanup through the same task-owner runtime; rejected approval, task validation and CR completion never delete checkpoints. Idempotent repeated approval retries cleanup without re-review.
- Cleanup obtains a short story-level admission fence shared by all review starts/publications; if matching work is active or pending admission, keep all affected files and return explicit retained/retryable cleanup metadata, without revoking approval.
- Under fence enumerate only canonical .insrc/tmp/code-review/<literal-id>.json regular non-symlink files using bounded validated loader. Match canonical project, pinned Plan epic identity and normalized story, not filename prefix. Never accept deletion paths from callers.
- Before deleting a candidate, require every completed attempt summary (including failed/incomplete outcomes, origins, diagnostics-derived required errors/limitations and provenance) to match durable version-2 CR history. Pending publication, unfinished/unrepresented attempt or corrupt/future file is retained with a reason, never silently discarded.
- Delete only safe matching files; individual unlink failure reports retained/errors and is retryable. CR and BUILD survive. Preserve unrelated projects/stories, symlinks, malformed/unknown files and active checkpoints.

## 3. Data model changes

### 3.1 `ReviewCheckpoint -> story BUILD and permanent CR` — invariant-change

Existing one-project/one-story (optionally one-task) checkpoint relationship unchanged. A story has zero or many independent review ids, each owns ordered attempts. One story CR retains many completed review-id/attempt summaries. BUILD approval now permits host deletion of matching temporary history only after durable CR preservation, while a short owner fence excludes starts/publications/cleanup races. No new persistent table, index, checkpoint format or artifact kind. Return CleanupResult deleted/retained/errors as approval follow-on metadata; failed cleanup does not revoke approval. Native diagnostic preview evidence is temporary; preserve pointed required error/summary and limitations in CR, not raw previews or full submitted test details.

**Call sites:**
- `src/daemon/task-review-rpc.ts`
- `src/workflow/code-review/task-review/coordinator.ts`
- `src/workflow/gates.ts`

## 4. Diagrams

- [Sequence diagram](docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/S003/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Normal tool schema reuses deployed after-only committed packet, task result and strict native validation; commits pointers only, complete tests required; static coverage mandatory, execution optional. No contract redesign. |
| `sc2` | consumes | Reuse sequential pinned attempts, exact same-attempt resume and centralized coordinator. Main-daemon owner routes through existing worker/session infrastructure, preserves 30-minute inactivity policy and controller/daemon disconnect distinction. New RPC transports do not create a second execution ledger. |
| `sc3` | consumes | Validate durable version-2 CR and every completed checkpoint attempt before deletion. Story approval only, idempotent safe retry with CleanupResult; no legacy engine reactivation, no design-review behavior change. |

## 6. Error paths

**Error cases**

- **Duplicate active review or cleanup race** (recoverable)
  - Detection: Main-daemon owner reserves project/review-id before awaited admission and checks story fence; cleanup checks in-flight admissions/executions/publications.
  - Response: Existing already-running/conflict error, or cleanup retained/retryable metadata; no duplicate provider or writer.
  - User impact: Explicit retrigger after owner releases; BUILD approval remains successful if cleanup deferred.
- **Controller session closes or request cancels during assessment** (recoverable)
  - Detection: Trusted owner connection signal/worker bridge disconnect notification; existing controller fences revalidate after awaits.
  - Response: Preserve completed tasks, mark interruption and release controller owner; stale submissions rejected. Daemon review continues after observer disconnect.
  - User impact: Controller must explicitly resume; no automatic provider retry.
- **CR publication missing, conflicting or unavailable during cleanup** (recoverable)
  - Detection: Compare every saved completed attempt with validated CR summaries; check pending state and unresolved provenance before unlink.
  - Response: Retain candidate and report exact preservation gap; do not rerun models or silently discard unfinished history.
  - User impact: Approval stands; retry publication/cleanup explicitly.
- **Malformed, symlinked, foreign, oversized or future checkpoint** (recoverable)
  - Detection: Bounded no-follow loader, canonical project/Plan/story identity and schema validation fail.
  - Response: Never unlink; report retained/diagnostic metadata without dumping content.
  - User impact: Unrelated or unsafe files survive for inspection.
- **Unlink fails or process stops mid-cleanup** (recoverable)
  - Detection: Filesystem error or missing candidate on subsequent explicit cleanup.
  - Response: Record per-file deleted/retained/errors; missing files are idempotent; release fence in finally. Permanent CR remains authoritative.
  - User impact: Retry approval cleanup without repeating reviews.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Different review ids from multiple MCP sessions for same story | Independent subprocess activity can overlap; task execution remains serial per review. Permanent CR writes merge through existing lifecycle queue; cleanup defers while any same-story execution/admission/publication is active. |
| Daemon restart or MCP observer reconnect | No automatic resume; checkpoint remains recoverable. Read-only progress can reconnect without starting another review. Controller owner changes require explicit resume and fence stale owner. |
| Story BUILD approved before S3 deployed | Repeated explicit approval retries cleanup for preserved matching history; no new review and no BUILD content regeneration. |
| Only task review passed or current BUILD fingerprint changed | Normal and direct approval remain blocked by existing whole-story completion validator; cleanup never runs. |
| Independent stories in one repo during cleanup | Story fence affects only target identity; unrelated checkpoints/reviews remain usable. |

**Invariants to preserve**

- S1/S2 coordinator remains the sole checkpoint execution writer; new transport cannot accept caller reviewer identity or duplicate active ids. [[c1]]
- Task results, selected scope, pinned history, CR provenance and existing activity/diagnostic semantics are reused unchanged. [[c1]]
- All BUILD approval entrypoints preserve reviewed content and require current whole-story independent review; design review remains disabled/unchanged. [[c1]]

## 7. Test strategy

**Test framework:** `node:test with tsx, following existing task-review publication/recovery/progress-e2e and daemon thread/Unix IPC fixtures; meaningful behavior assertions and actual registration/host routes, not only prompt substring checks. All tasks have static coverage checks; reviewer execution optional. Fake CLI mechanics do not claim hosted review accuracy.`

**Test levels**

- **integration** — Real local transport and worker lifecycle; fake provider outputs test mechanics without hosted model costs.
  - Subjects: `Normal MCP start/progress/publication use committed packets and reject retired or inferred scopes`, `Cross-session and worker/direct duplicate review-id admission starts exactly one execution`, `Different review ids overlap with serial per-review provider calls and merged CR history`, `Daemon observer disconnect survives; controller disconnect fences late results and explicit resume skips durable tasks`
  - Fixtures: `Real Unix socket and existing router/worker harness`, `Two persistent MCP/controller connections and fake native CLI with deterministic activity/results`, `Pinned Git/Plan/code/test packet fixtures`
- **integration** — Approval/CR preservation and bounded deletion under real filesystem failure and concurrency.
  - Subjects: `Successful story BUILD approval removes only matching fully preserved task/story checkpoints`, `Cleanup defers for active admission/execution/publication and excludes concurrent starts under story fence`, `Rejected approval, task validation and CR publication never clean checkpoints; repeated approval retries partial cleanup`, `Cleanup retains malformed/symlink/foreign/future/unrepresented history and reports filesystem failures`
  - Fixtures: `Whole-story and task-id checkpoints sharing canonical story`, `Current task CR and bound BUILD lifecycle store`, `Controlled unlink/publication failures and raced admission`
- **contract** — Normal tool discovery and both parties use same deployed contracts without old engine.
  - Subjects: `Normal controller/daemon routes preserve coverage/status/diagnostic policy, after-only scope and schema/guide parity`
  - Fixtures: `MCP registration/schema/guide snapshots and actual normal handlers`, `Equivalent controller and daemon result fixtures including native failures`
- **smoke** — Verify deployable routing through compiled daemon entrypoint; hosted model review not required for transport mechanics.
  - Subjects: `Production transport and worker routing smoke validates progress, restart/retrigger and design review remains unavailable`
  - Fixtures: `Compiled daemon with existing worker transport and fake CLI`, `Explicit recorded smoke commands/results; no broad project test sweep`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Cross-session and worker/direct duplicate review-id admission starts exactly one execution`, `Cleanup defers for active admission/execution/publication and excludes concurrent starts under story fence` |
| `ac2` | `Different review ids overlap with serial per-review provider calls and merged CR history`, `Daemon observer disconnect survives; controller disconnect fences late results and explicit resume skips durable tasks`, `Production transport and worker routing smoke validates progress, restart/retrigger and design review remains unavailable` |
| `ac3` | `Successful story BUILD approval removes only matching fully preserved task/story checkpoints`, `Cleanup defers for active admission/execution/publication and excludes concurrent starts under story fence`, `Rejected approval, task validation and CR publication never clean checkpoints; repeated approval retries partial cleanup`, `Cleanup retains malformed/symlink/foreign/future/unrepresented history and reports filesystem failures` |
| `ac4` | `Normal MCP start/progress/publication use committed packets and reject retired or inferred scopes`, `Daemon observer disconnect survives; controller disconnect fences late results and explicit resume skips durable tasks`, `Normal controller/daemon routes preserve coverage/status/diagnostic policy, after-only scope and schema/guide parity`, `Production transport and worker routing smoke validates progress, restart/retrigger and design review remains unavailable` |

## 8. Migration

**State before:** Context bundle c1 and source inspection: explicit codeReview.task RPC works with S1/S2/S4; normal insrc_code_review_step and retired codeReview.run remain unavailable; current worker/session transport already exists; approved BUILDs retain checkpoints. Recent approval bugfix preserves reviewed BUILD and recognizes task CR.

**State after:** Normal typed task-review tool and host routing expose existing engine; one main-daemon owner spans worker paths; successful story BUILD approval invokes fenced, preservation-checked cleanup with explicit retries. Existing design review remains unavailable and unchanged.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add normal typed MCP/host transport and route all review ownership to existing main-daemon runtime. Update schema, code-review guide and steering together; reject old invocation shapes explicitly rather than forwarding them to retired engine. Verify controller persistent connections and daemon detached ownership. — ↩ rollbackable
2. Wire post-success BUILD approval cleanup and retry metadata through central owner; validate all saved attempts against permanent CR before deleting only matching safe files. Test active work/approval races and partial failures before deployment. — ↩ rollbackable
3. Build and test compiled normal entrypoints, restart daemon, then explicitly retry approval/cleanup for already-approved S2 as rollout verification. Do not start another S2 model review or auto-resume saved execution. — ✕ non-rollbackable

**Backward compat:** Existing checkpoint and task CR schemas unchanged, including optional origin/diagnostic/progress data. No backfill or stripping history. Old disabled review invocation shapes remain rejected; existing explicit task RPC clients continue using the same coordinator. No compatibility flags or retired engine fallback. Deleted temporary checkpoints cannot be restored by rollback, but permanent required CR summaries remain. Supported older strict-reader limitations continue.

## 9. Alternatives considered

### 9.1 a1: Thin normal entrypoint over daemon-owned task coordinator — **CHOSEN**

Persistent normal MCP transport, one central review admission/cleanup owner.

Reuse current task RPC and trusted connection bridge; no worker-local review state, new scheduler or persistence schema.

### 9.2 a2: Session-worker execution with main admission leases

Worker execution with centrally mediated leases.

Reuse worker infrastructure but add cross-thread execution lease/control messages for admission and cleanup.

**Rejected because:** Same ac1-ac4/sc1-sc3 coverage with unnecessary ownership machinery compared to existing central coordinator.

## 10. References

- **[[c1]]** `analyze-bundle` `S3 context.assemble s1: task RPC/coordinator, session workers, MCP/host and approval source inspection` — "Existing APIs reused; source inspection supplements bounded/incomplete graph."
- **[[c2]]** `prior-artifact` `.insrc/artifacts/HLD-e6ddcdcb3d9cf330.json`
- **[[c3]]** `prior-artifact` `.insrc/artifacts/DEF-e6ddcdcb3d9cf330.json`
- **[[c4]]** `code` `src/daemon/task-review-rpc.ts`
- **[[c5]]** `code` `src/workflow/gates.ts`
- **[[c6]]** `stakeholder` `Current session: after-only change scope, 30-minute inactivity grace, daemon/controller disconnect distinction and retired engine removal supersede old HLD sketches.`

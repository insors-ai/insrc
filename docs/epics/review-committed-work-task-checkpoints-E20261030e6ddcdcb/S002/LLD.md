<!-- insrc:artifact LLD-e6ddcdcb3d9cf330-s2 -->

# LLD: STORY-e6ddcdcb3d9cf330-s2

## Summary

**Epic:** `review-committed-work-task-checkpoints`
**HLD base run:** `wf-1793386460254-8th2oq`
**HLD effective hash:** `68fe25ca25dc...`

Resume an interrupted review explicitly without discarding its completed tasks. Re-review fixes under the same review ID with a new pinned attempt, using prior feedback to decide which tasks need fresh assessment and retaining the provenance and limitations of reused results.

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

**Rollout phase:** B — recover and re-review
**Consumes:** `sc1` (Committed review packet and task assessment), `sc2` (Single checkpoint file and execution lifecycle), `sc3` (Permanent CR projection and story cleanup)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Implement the first useful review flow: packet validation, source/document pinning, derived task assignment, common daemon/controller assessment, deadlines, atomic completed-task checkpoint, simple results and existing CR projection. Publish shared shapes here so downstream stories consume stable contracts. Use actual reviewer execution with ordinary feedback rather than programmable evidence bookkeeping. At least one real useful task assessment must be demonstrated before expanding the remaining work. Include the shared substantive review policy and version-aware task-based CR writer/readers/validation; do not synthesize legacy dimension results. Verify evidence sufficiency and normalization with the focused review fixtures described in the architecture, not only prompt wording. — owns `sc1`, `sc2`, `sc3`
- `s3`: Own normal entrypoint/session integration and concurrency/approval cleanup verification. Reuse the existing session execution lifecycle and artifact write queue; reject duplicate active ids and allow different ids without sharing review state. Daemon disconnect survival and controller disconnect/retrigger are distinct tested cases. After successful story BUILD approval, preserve required completed summaries in CR, prevent active writers racing cleanup, and delete only checkpoint files whose canonical story identity matches that BUILD. Task-level validation or failed approval must not delete files. Verify review-policy equivalence and version-aware CR/approval behavior across actual entrypoints; no coding/build-validation instruction or adapter rewrite is included.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `TaskReviewCoordinator`

```typescript
class TaskReviewCoordinator { start(project: string, reviewId: string, attempt: number, input?: unknown, context?: { operation?: 'start' | 'resume'; epicHash?: string; provider?: () => LLMProvider }): Promise<ReviewAcknowledgement>; startController(project: string, reviewId: string, attempt: number, input: unknown | undefined, owner: ControllerReviewOwner, epicHash?: string, operation?: 'start' | 'resume'): Promise<ControllerFrame>; }
```

**Parameters:**
- `operation: 'start' | 'resume'` _(optional)_ — Explicit admission mode; absent means start for compatibility. Resume uses saved input, start appends only the next sequential attempt.
- `input: ReviewPacket | undefined` _(optional)_ — Mandatory on start; optional on resume, where a supplied packet must equal the normalized saved packet.
- `attempt: number` — Positive safe integer; latest attempt for resume, last+1 for re-review.
- `owner: ControllerReviewOwner` _(optional)_ — Existing trusted connection identity/signal for actual controller review, never supplied by JSON.

**Returns:** `ReviewAcknowledgement | ControllerFrame` — Actual review ID/attempt/party/path/status and completed/pending task IDs; controller receives the next scope/task frame. Admission reserves before awaited reads and schedules daemon work independently of the submitting request.

**Errors:**
- `already-running` when Existing active reservation for this review ID.
- `attempt-conflict` when Changed resume packet, nonlatest resume, skipped/replayed start ordinal, nonterminal prior attempt, conflicting scope/history or corrupt checkpoint.
- `missing-checkpoint` when Resume or start of attempt>1 has no saved history.
- `wrong-reviewer` when Saved party does not match the actual permitted reviewer on resume.

**Preconditions:**
- Validate the stored schema, canonical project/epic/story/task identity, pinned Plan and referenced commits before mutation; derive epic identity from Plan, not local s1 alone.
- Same-attempt resume must select the latest attempt. New start is attempt1 for no file, otherwise exactly latest+1 after prior feedback is terminal and CR publication is complete.
- A new attempt may pin changed documents/commits, but cannot change canonical review scope or rename the selected task identity.
- Use existing active reservation and trusted controller binding; no startup resume scan, lease, signing key or new session framework.

**Postconditions:**
- Resume preserves header identity, submitted packet, createdAt, selected task IDs, all saved terminal results and original buildFingerprint; clear interrupted/running metadata only when restarting unfinished execution.
- All four saved terminal statuses are skipped on resume, including failed and incomplete. Only absent task results may run again. Current unfinished task gets the existing size-based allowance; time accounting changes are deferred.
- If all tasks already have results, explicit resume only repairs pending CR publication and invokes no provider. A fully published terminal attempt can return completion metadata idempotently.
- Fresh sequential start appends one immutable input/header without changing earlier attempts and derives a new buildFingerprint when appropriate. New assessment is serial and checkpointed before advancing.
- Both actual reviewer routes use the same admission/history/decision validation. On controller resume bind a new trusted owner and stop on disconnect; daemon execution remains independent of the submitting connection.

### 2.2 `publishTaskCheckpoint`

```typescript
publishTaskCheckpoint(project: string, epicHash: string, reviewId: string, deps: PublicationDeps): Promise<{ path: string; jsonPath: string; status: string }>
```

**Parameters:**
- `reviewId: string` — Loads latest attempt from the existing derived checkpoint path.

**Returns:** `Promise<{ path: string; jsonPath: string; status: string }>` — Existing CR identity, newly completed attempt summary or identical replay, with source-attempt provenance for any reused task feedback.

**Errors:**
- `attempt-conflict` when Conflicting prior CR summary, invalid reuse ancestry, missing source result, changed prior result or unresolved evidence.

**Preconditions:**
- All selected task results are terminal and validated against the current scope; each reused result is exactly its referenced source result and its evidence/location remains valid under the existing selected-change rules.
- Reuse is permitted only from a prior attempt reviewed by the same actual reviewer party; otherwise require a fresh assessment. Follow strictly decreasing attempt numbers when resolving chained reuse.
- No new model call is made for publication or replay.

**Postconditions:**
- Use the existing store queue and merge key reviewId/attempt; all prior CR summaries remain unchanged, with new attempt appended once.
- Project optional origins and reassessmentSummary into schema2 CR and renderer; legacy records without these fields retain their existing meaning.
- Terminal attempt status follows failed > incomplete > changes_requested > passed and is durable only after CR projection; a reused failed/incomplete result cannot become passed.

## 3. Data model changes

### 3.1 `ReviewCheckpoint` — invariant-change

Checkpoint owns 1..N ordered ReviewAttempt sections for one canonical project/epic/story/task scope. Attempt numbers start at1 and are contiguous; only the latest may be resumed or extended, with at most one active writer through the existing in-process reservation. Earlier attempt input and terminal feedback are immutable. Decode/validate before mutation; honor existing bounded JSON/provider inputs and reject oversized history explicitly rather than truncate or invent another recovery file.

**Call sites:**
- `src/daemon/task-review-rpc.ts`
- `src/workflow/code-review/task-review/coordinator.ts`
- `src/workflow/code-review/task-review/controller.ts`
- `src/workflow/code-review/task-review/publication.ts`

### 3.2 `ReviewAttempt` — field-add

Keep existing header/submitted/review-response ownership. Add optional header.reassessmentSummary and review-response.origins: readonly { taskId: string; sourceAttempt: number; reason: string }[]. Origins exist only for reused terminal tasks; fresh results implicitly belong to the current attempt. One attempt owns 0..N task results and 0..N origins, at most one of each per selected task. Each origin references exactly one earlier attempt's result for the same task in this checkpoint; sourceAttempt is a numeric back-reference, not an embedded attempt or a new evidence ledger. Missing origins on old checkpoints means all stored results were assessed in that attempt.

```
header.reassessmentSummary?: string; 'review-response'.origins?: readonly { taskId: string; sourceAttempt: number; reason: string }[];
```

**Call sites:**
- `src/workflow/code-review/task-review/contracts.ts`
- `src/workflow/code-review/task-review/coordinator.ts`
- `src/workflow/code-review/task-review/controller.ts`
- `src/workflow/code-review/task-review/publication.ts`

### 3.3 `TaskReviewResult` — invariant-change

Ordinary result JSON remains unchanged. For a sequential attempt the existing attribution turn receives pinned current input and the entire prior attempt history and emits task change/test indexes plus action reassess/reuse, reason, and sourceAttempt only for reuse. The host alone copies a referenced result; models cannot rewrite reused findings, evidence, coverage, limitations or execution claims. No source result, cross-party origin, cycle, invalid current scope or conflicting result means explicit refusal, not fallback/self-review. A model may choose fresh review of every task; selection is reviewer judgment, not a submitter-provided delta list. Single-task re-review still needs this history decision, while first-attempt single-task direct assignment stays unchanged.

**Call sites:**
- `src/workflow/code-review/task-review/assessment.ts`
- `src/workflow/code-review/task-review/results.ts`
- `src/workflow/code-review/task-review/policy.ts`
- `src/workflow/code-review/task-review/coordinator.ts`
- `src/workflow/code-review/task-review/controller.ts`

### 3.4 `CompletedReviewSummary` — field-add

Add the same optional origins and reassessmentSummary to the existing schema2 CR summary, not another artifact. Summary owns current task outcomes; an origin points to a preserved earlier summary by same reviewId/attempt/task. Render reused task feedback as reused from its source attempt, resolve ancestry to the actual original reviewer, and never label it a fresh verification. Keep all source summaries and coverage limitations; latest attempt status remains the existing version-aware aggregate.

```
origins?: readonly { taskId: string; sourceAttempt: number; reason: string }[]; reassessmentSummary?: string;
```

**Call sites:**
- `src/workflow/code-review/task-review/contracts.ts`
- `src/workflow/code-review/task-review/record.ts`
- `src/workflow/code-review/task-review/publication.ts`
- `src/workflow/code-review/task-review/completion.ts`

## 4. Diagrams

- [ER model](docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/S002/er-model.html)
- [Sequence diagram](docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/S002/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Retain ReviewPacket and ordinary TaskReviewResult; extend only host/internal attribution decisions for subsequent attempts. Scope remains the supplied changes, commits remain pointers and history is evidence rather than instructions. |
| `sc2` | consumes | Implement the HLD's existing operation start/resume semantics over the single checkpoint; add compact optional origin metadata needed by the existing provenance requirement. Use atomic whole-file replacement and completed-task-only durability. |
| `sc3` | consumes | Publish each terminal attempt through the existing schema2 CR queue/merge/renderer with explicit reused origins. Leave normal workflow/worker integration, cleanup on Story BUILD approval and legacy engine deletion to S3. |

## 6. Error paths

**Error cases**

- **Resume file missing, corrupt, unsupported or bound to another canonical subject** (recoverable)
  - Detection: Derive path from validated review ID, decode the saved bounded schema, resolve canonical project and epic from the pinned Plan, and compare root/header/packet identities and unique selected task/result IDs.
  - Response: Return missing-checkpoint or attempt-conflict before mutation/provider use; preserve the file for diagnosis.
  - User impact: No accidental review against another story or fabricated recovery state.
- **Changed input on resume or invalid new ordinal** (recoverable)
  - Detection: Compare normalized supplied packet with the latest saved packet; require resume ordinal equals latest and new start ordinal equals latest+1, with prior attempt terminal and published.
  - Response: Reject attempt-conflict without overwriting history; caller uses saved input for resume or submits a proper subsequent attempt.
  - User impact: Per-attempt pins and sequential review history stay trustworthy.
- **Concurrent request or wrong reviewer** (recoverable)
  - Detection: Reserve the existing per-project review ID before awaited admission; compare trusted actual reviewer against stored header on resume and BUILD author on new start.
  - Response: Return already-running/wrong-reviewer; release reservations on refused admission without changing persisted attempts.
  - User impact: No duplicate task writer, spoofed party or self-review fallback.
- **Invalid history-aware reuse instruction** (recoverable)
  - Detection: Validate task membership and complete change/test attribution, sourceAttempt<current, source result existence, strictly decreasing ancestry, same reviewer party and exact copied result equality; apply existing committed-reference and current selected-location validation.
  - Response: Refuse the invalid decision rather than silently promote/rewrite/relabel feedback or retry the model. Preserve prior attempts; current affected tasks record a failed decision with actionable error through existing execution handling.
  - User impact: No unsupported claim that old feedback freshly verified changed work.
- **Terminal task requested again during same-attempt continuation** (recoverable)
  - Detection: Compute unfinished selected tasks as selected task IDs minus every saved terminal result, independent of status; validate accepted identical controller replay against saved result.
  - Response: Never schedule that task again. Identical accepted replay returns current metadata; conflicting replay rejects. A later attempt is required to reassess failed/incomplete work.
  - User impact: Completed task effort is retained and retries remain explicit.
- **Persistence or CR publication fails** (recoverable)
  - Detection: Existing atomic save/store/render calls throw; required source commits may be unavailable during revalidation.
  - Response: Stop scheduling after checkpoint save failure. Retain terminal results/publication pending on CR failure; explicit resume can repair publication with zero model calls. Never append a new attempt before prior publication completes.
  - User impact: Durable feedback is not lost or silently duplicated.
- **History cannot fit existing bounded JSON or provider context** (recoverable)
  - Detection: Preflight existing serialization/schema bounds before saving appended history; surface provider context refusal under existing error classification.
  - Response: Explicitly refuse oversized admission or record an honest non-pass execution limitation; do not silently truncate old feedback, autochunk, auto-retry or add another checkpoint collection.
  - User impact: History limits are visible rather than silently weakening review.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Latest attempt header is running after a crash but the new process has no active reservation | Explicit resume loads saved pins, skips terminal tasks and restarts only absent results; no daemon startup scan triggers execution. |
| Last task result saved but process interrupted before CR publication | Resume sees no unfinished tasks and performs only idempotent publication, retaining completedAt/results; provider count remains zero. |
| Published terminal attempt retriggered with operation resume | Return the existing terminal metadata without reviews or mutations; a fresh attempt requires start with latest+1. |
| New attempt contains changes plus reused feedback from a terminal failed/incomplete source | Reviewer can request reassessment or retain that exact unresolved result with origin; retention remains failed/incomplete and cannot establish pass. |
| New pinned Plan adds or removes tasks in a whole-story review | Derive current ordered tasks from new Plan; preserve prior attempts and disallow reuse of a task absent from the current selection. A per-task review cannot switch its selected task under the same review ID. |
| Existing schema1 checkpoint/schema2 CR has no origin fields | Read as all feedback originally assessed in its containing attempt. Preserve version1 CR handling, S1 first attempts, and task result schemas. |
| Actual controller disconnects again during recovery | Retain prior terminal tasks; stop unfinished controller work and require another explicit retrigger. Daemon reviewer work remains independent of submitter lifetime. |

**Invariants to preserve**

- Keep ordinary assessment, conservative evidence normalization and actual author/reviewer routing from the S1 shared-contract discovery. [[c1]]
- Use one atomic checkpoint and save each terminal result before scheduling another task; no partial result is reused. [[c1]]
- Preserve version-aware canonical CR merge, conflict refusal and idempotent publication; no fabricated dimension results. [[c2]]
- Retain explicit controller lifetime binding versus daemon disconnect survival; S3 owns normal session/thread integration and approval cleanup. [[c2]]

## 7. Test strategy

**Test framework:** `node:test with node:assert/strict and TypeScript via tsx, as confirmed by focused reads of src/workflow/code-review/task-review/__tests__/coordinator.test.ts, src/workflow/code-review/task-review/__tests__/controller.test.ts and src/workflow/code-review/task-review/__tests__/publication.test.ts. Analyzer test.locate was off-topic; no claim of graph-proven test completeness.`

**Test levels**

- **unit** — Validate pinned recovery admission, sequential identity, conservative reuse and backward-compatible provenance.
  - Subjects: `recovery admission: saved pins, latest-only resume, contiguous attempts and immutable prior sections`, `reuse decisions: source task/attempt/party validation, acyclic ancestry and unchanged result/evidence strength`, `old checkpoint and CR compatibility: absent origin fields mean containing-attempt assessment`
  - Fixtures: `Existing real-Git task-review publication fixture with three dependency-ordered tasks.`, `Schema1 checkpoints with passed/changes_requested/incomplete/failed terminal results, one absent result and corrupt/conflicting variants.`
- **integration** — Exercise real coordinator/controller/checkpoint/CR boundaries with deterministic reviewer responses and count calls; do not substitute mock results for claimed live model acceptance.
  - Subjects: `interrupted recovery: only absent tasks rerun and terminal failed/incomplete tasks are skipped`, `sequential re-review: full history in attribution, fresh pins and reasoned reassess/reuse across both actual reviewer adapters`, `publication recovery: saved feedback projects once with zero provider calls and conflict-free replay`, `controller recovery: new trusted connection, old-owner refusal, disconnect retention and daemon lifetime distinction`
  - Fixtures: `Production IpcServer on an isolated local socket and real temporary Git repositories; fake provider only for deterministic decision/result outputs.`, `Injected save failures between task result and publication; reload coordinator with empty active map to simulate process loss.`, `Two attempts sharing stable review scope with one changed task, one reused passing task and one unresolved retained task.`
- **smoke** — Preserve build and affected legacy/provider/CR behavior using narrow regressions, not a broad live model benchmark.
  - Subjects: `S2 deployability: production build, shared controller/daemon policy and version-aware CR/approval regression subset`
  - Fixtures: `Retain accepted S1 live evidence as historical adapter evidence; do not rerun it solely for unchanged provider behavior.`, `Use node --import tsx --test with explicit files and a bounded/force-exit runner where production runtime handles otherwise keep tests alive.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `recovery admission: saved pins, latest-only resume, contiguous attempts and immutable prior sections`, `interrupted recovery: only absent tasks rerun and terminal failed/incomplete tasks are skipped`, `controller recovery: new trusted connection, old-owner refusal, disconnect retention and daemon lifetime distinction` |
| `ac2` | `sequential re-review: full history in attribution, fresh pins and reasoned reassess/reuse across both actual reviewer adapters`, `reuse decisions: source task/attempt/party validation, acyclic ancestry and unchanged result/evidence strength` |
| `ac3` | `interrupted recovery: only absent tasks rerun and terminal failed/incomplete tasks are skipped`, `reuse decisions: source task/attempt/party validation, acyclic ancestry and unchanged result/evidence strength` |
| `ac4` | `publication recovery: saved feedback projects once with zero provider calls and conflict-free replay`, `old checkpoint and CR compatibility: absent origin fields mean containing-attempt assessment`, `S2 deployability: production build, shared controller/daemon policy and version-aware CR/approval regression subset` |

## 8. Migration

**State before:** Context bundles c1/c2 and their cited source reads establish S1 fresh-attempt-only coordinator/RPC admission, optional-less schema1 attempt sections and schema2 CR summaries. Terminal results are already saved atomically and publication is already idempotent; controller reconnection currently requires an explicit retrigger but no recovery implementation exists.

**State after:** The explicit task-review route accepts operation start/resume with positive sequential attempt numbers, reads existing attempts without rewriting them, resumes only absent results and appends newly pinned re-review input. Optional host-owned origins/reassessmentSummary identify reused feedback in checkpoint and CR. Normal workflow/MCP entry migration and Story-approved checkpoint cleanup remain S3.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Extend shared internal checkpoint/summary validators and renderers with optional host provenance fields and existing operation semantics. Keep old checkpoint and v2 CR reads valid with implicit original provenance; do not rewrite any history. — ↩ rollbackable
2. Extend current admission and controller/daemon execution to load latest saved input, validate scope/ordinals and skip terminal tasks. Add history-aware attribution decisions and exact host reuse validation; retain first-attempt defaults. — ↩ rollbackable
3. Extend existing CR projection with reused-source labels and verify publication-only recovery, fresh sequential attempts, controller rebind and failure paths on production IPC fixtures. Build the production candidate and deploy through the normal user-managed daemon update/restart only when requested. — ↩ rollbackable
4. Keep the normal entrypoints, legacy routing and cleanup policy unchanged until S3. If reverting S2 after provenance-bearing attempts exist, stop affected reviews and retain their checkpoint/CR history; do not strip fields or fabricate compatibility for an older strict reader. — ↩ rollbackable

**Backward compat:** Existing explicit requests without operation remain first-attempt start. Existing checkpoints and v2 CRs missing optional origin fields remain readable, with feedback attributed to its containing attempt; v1 CR handling is unchanged. New optional fields are an additive forward reader update, not a guarantee that an older strict binary can read provenance-bearing files. Rollback preserves such history and fails explicitly on unsupported data instead of rewriting it. No public normal-workflow endpoint changes are introduced in S2.

## 9. Alternatives considered

### 9.1 a1: Extend the existing checkpoint and attribution turn — **CHOSEN**

Use explicit start/resume admission and extend the existing reviewer attribution with reassess/reuse decisions.

Keep the single schema1 checkpoint and schema2 CR. A resume loads the latest pinned attempt, skips all saved terminal tasks and schedules unfinished work. A sequential new start appends pinned input; the existing task-attribution turn receives prior attempt feedback and chooses reassess/reuse with a reason. The host validates reuse and records only compact source-attempt metadata alongside reused terminal results, projected into CR. Existing source analyzer evidence locates all these S1 seams; no new storage subsystem is needed.

### 9.2 a2: Decide reassessment independently at each task

Each task receives prior history and returns either ordinary fresh feedback or an explicit reuse instruction.

Keep the same checkpoint and start/resume boundary, but replace each subsequent-attempt task response schema with a fresh-result-or-reuse union. Each task decision inspects the full pinned attempt history independently. Host resolves reuse, preserves prior result and source attempt, then publishes through the same CR writer.

**Rejected because:** Functional recovery can work, but sc1 fit is weaker and per-task decision calls/context duplicate existing attribution responsibilities.

## 10. References

- **[[c1]]** `analyze-bundle` `design.story s1.analyzeBundles[0]: Current shared contracts and first-attempt-only execution`
- **[[c2]]** `analyze-bundle` `design.story s1.analyzeBundles[1]: Publication and actual consumers; graph limitations`
- **[[c3]]** `prior-artifact` `.insrc/artifacts/HLD-e6ddcdcb3d9cf330.json`
- **[[c4]]** `prior-artifact` `.insrc/artifacts/DEF-e6ddcdcb3d9cf330.json`
- **[[c5]]** `stakeholder` `User: move on to the next story; permissive progress-based timeouts are logged separately and deferred.`
- **[[c6]]** `code` `src/workflow/code-review/task-review/completion.ts`

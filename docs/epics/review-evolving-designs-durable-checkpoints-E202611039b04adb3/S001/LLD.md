<!-- insrc:artifact LLD-9b04adb36cac716d-s1 -->

# LLD: STORY-9b04adb36cac716d-s1

## Summary

**Epic:** `review-evolving-designs-durable-checkpoints`
**HLD base run:** `wf-1793694252789-heyhey`
**HLD effective hash:** `20a9ee7f3bdf...`

S1 restores a useful design-review entry point for current DEF, HLD and LLD documents. A dedicated daemon owner routes to the independent reviewer, validates a coherent chunk plan, saves each completed result and exposes progress plus a consolidated report. It does not yet add recovery, automatic retries, impact-selected attempts or approval cleanup.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

> See **HLD-9b04adb36cac716d** § 2. Framework summary

**Rollout phase:** A — useful design review
**Owns:** `sc1` (Design review subject, policy and semantic chunk contract), `sc2` (Durable review attempts, feedback and progress)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Own interruption/recovery transitions, reviewed-subject monitoring, cancellation/late-response rejection, the single retry budget and user-decision pause. Native activity integration is private; callers consume recovery state/actions, not process internals. Preserve sc1/sc2 semantics and no external-file invalidation. — owns `sc3`
- `s3`: Own reviewer-led direct/indirect impact assessment, old/new plan mapping, conservative full-review fallback, retained coverage and finding reconciliation. Its document comparison/selection implementation stays private; expose only auditable scope reasoning and provenance, not a generic dependency engine. — owns `sc4`
- `s4`: Own lifecycle version-aware record publication/readers, normal approval integration, history-preserving cleanup, multi-session routing qualification and final compiled/live verification. Keep cleanup fence and publication retries internal. No new review dashboard, activation state or legacy compatibility execution. — owns `sc5`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `DesignReviewRequest`

```typescript
interface DesignReviewRequest { readonly repo: string; readonly artifactPath: string; readonly reviewId: string; readonly attempt: number; }
type DesignReviewPhase = 'start' | 'progress' | 'assignment' | 'plan' | 'activity' | 'result';
interface DesignReviewStart extends DesignReviewRequest { readonly phase: 'start'; }
interface DesignReviewQuery { readonly phase: 'progress' | 'assignment'; readonly repo: string; readonly reviewId: string; readonly attempt: number; readonly afterCompletedChunk?: number | undefined; readonly includeResult?: boolean | undefined; }
```

**Parameters:**
- `repo: string` — Canonical registered project; MCP may resolve it using the existing workspace helper before daemon admission.
- `artifactPath: string` — Canonical artifact JSON or matching docs markdown path; no artifact body, kind, author, commit set or section text supplied.
- `reviewId: string` — Literal project-scoped review identity, 1..128 ASCII letters/digits/underscore/hyphen, initial character alphanumeric.
- `attempt: number` — S1 admits exactly attempt 1; subsequent/recovery operations remain unsupported until their owning stories.

**Returns:** `DesignReviewAcknowledgement` — Short acknowledgement with reviewId, attempt, canonical artifactId, reviewer party, status and checkpoint path. Daemon-native execution continues after requester disconnect; controller direction receives an assignment path.

**Errors:**
- `DesignReviewInputError` when Unknown phase, unsupported artifact kind, invalid identity/path/schema, unknown author, unregistered project or attempt other than 1.
- `DesignReviewConflictError` when Review identity already exists with different subject/input or subject already has active review.
- `DesignReviewPersistenceError` when Initial validated checkpoint cannot be durably saved; no model call is started.

**Preconditions:**
- Canonical registered repo and valid DEF/HLD/LLD head/document identity.
- Existing authorPartyOf resolves one known author; reviewer is otherParty, never caller-chosen.
- Main daemon is the single owner of the coordinator; no task-review packet or database access in MCP.

**Postconditions:**
- Initial state is durable before acknowledgement/model dispatch.
- No old workflow.review streaming request is translated or resurrected; current MCP routes through new short daemon operations.
- A duplicate identical start returns existing status/acknowledgement without another model call; conflicting reuse is rejected.
- Resolve workflow-specific required references before dispatch; missing not-applicable artifacts never cause missing-HLD or missing-PLAN failures.

### 2.2 `DesignChunkPlan`

```typescript
interface DesignChunkPlan { readonly chunks: readonly DesignChunk[]; readonly coverageExplanation: string; readonly finalConsistencyChunkId: string; readonly coverage: readonly { readonly unitId: string; readonly chunkIds: readonly string[]; }[]; }
interface DesignReviewPlanSubmission { readonly phase: 'plan'; readonly repo: string; readonly reviewId: string; readonly attempt: number; readonly executionId: string; readonly sequence: number; readonly plan: DesignChunkPlan; }
```

**Parameters:**
- `plan: DesignChunkPlan` — Reviewer-created coherent assignment map against the host inventory accessible by checkpoint path.
- `executionId: string` — Daemon-issued current planning execution identity, bound to actual controller connection when applicable.
- `sequence: number` — Strict positive response sequence for replay/conflict detection within that execution.

**Returns:** `DesignReviewAssignment | DesignReviewProgress` — Accepted plan is atomically saved before first chunk assignment. Invalid plan receives pointed validation errors; S1 makes no automatic corrective call.

**Errors:**
- `DesignReviewPlanError` when Missing/duplicate/unknown unit or chunk, empty substantive coverage, cycle/order violation, missing final consistency chunk or exceeded bounds.
- `DesignReviewOwnerError` when Wrong reviewer party, stale execution or foreign controller connection.

**Preconditions:**
- Reviewer has guidelines, live document and checkpoint/history paths; artifact body is not copied into the assignment prompt.
- Planning unit is current and only one execution for that review is active.

**Postconditions:**
- Entire reviewable inventory maps to substantive chunks, with exactly one final consistency chunk last and dependent on all substantive chunks.
- A self-reported coverage explanation alone cannot override missing deterministic inventory coverage.
- Final consistency alone cannot substitute for substantive coverage of a unit.

### 2.3 `DesignChunkResult`

```typescript
interface DesignChunkResult { readonly chunkId: string; readonly status: 'passed' | 'changes_requested' | 'incomplete'; readonly summary: string; readonly findings: readonly DesignFinding[]; readonly inspectedReferences: readonly string[]; readonly limitations: readonly string[]; readonly advice: readonly string[]; }
interface DesignReviewResultSubmission { readonly phase: 'result'; readonly repo: string; readonly reviewId: string; readonly attempt: number; readonly executionId: string; readonly sequence: number; readonly result: DesignChunkResult; }
```

**Parameters:**
- `result: DesignChunkResult` — Accepted read-only feedback for the current assigned chunk, including explicit evidence/coverage limits.
- `executionId: string` — Must identify the issued active chunk execution; never accepts late output for another chunk.
- `sequence: number` — Monotonic response sequence; exact duplicate final submissions are idempotent, conflicting payloads rejected.

**Returns:** `DesignReviewProgress | DesignReviewCompleted` — Result is persisted before progressing. Final status/counts are host-derived from accepted results; no extra model call re-verdicts findings.

**Errors:**
- `DesignReviewResultError` when Unknown/missing fields, inconsistent severity/status, absent required coverage evidence, oversized result or result for a non-current chunk.
- `DesignReviewChangedError` when Current subject differs at boundary check; no stale result is accepted or reported passing.

**Preconditions:**
- Current unit is an assigned chunk and supplied chunkId matches it.
- Native/controller response goes through the same strict schema and assessment.

**Postconditions:**
- HIGH/MED requires changes_requested unless required verification remains incomplete; LOW-only can pass only with no mandatory coverage gap.
- incomplete takes precedence over changes_requested, then passed; terminal technical failure remains failed, never a review pass.
- Findings and completed chunk results remain immutable; remaining chunks continue after substantive findings or honest incomplete coverage.

### 2.4 `DesignReviewProgress`

```typescript
interface DesignReviewProgress { readonly status: DesignReviewStatus; readonly phase: 'planning' | 'impact' | 'chunk_review' | 'tool_running' | 'persisting' | 'publishing' | 'complete'; readonly activeChunkId?: string | undefined; readonly completedChunks: number; readonly totalChunks: number; readonly lastMeaningfulActivityAt: string | null; readonly activeToolCount: number; readonly requiresUserInput: boolean; readonly checkpointPath: string; }
interface DesignReviewActivitySubmission { readonly phase: 'activity'; readonly repo: string; readonly reviewId: string; readonly attempt: number; readonly executionId: string; readonly sequence: number; readonly event: ReviewActivityEvent; }
```

**Parameters:**
- `reviewId/attempt: { readonly reviewId: string; readonly attempt: number; }` — Read the requested existing attempt; no start/resume/inference side effect.
- `event: ReviewActivityEvent` _(optional)_ — Controller reviewer reports validated substantive/tool activity on its actual owner connection. Native provider events come directly to the coordinator.

**Returns:** `DesignReviewProgress & { readonly completedResults: readonly DesignChunkResult[]; readonly nextCompletedChunk?: number | undefined; readonly report?: Pick<DesignReviewConsolidated, 'reviewId' | 'attempt' | 'artifactId' | 'status' | 'counts' | 'reviewer' | 'reviewedContentIdentity'> | undefined; }` — Default poll is bounded metadata/counts with available-result cursor and final report metadata/reference. includeResult=true returns at most one <=1MiB completed result after afterCompletedChunk and a next cursor. Full consolidated chunks remain in checkpoint; baseline never appears in poll output.

**Errors:**
- `DesignReviewNotFoundError` when Review/attempt missing, foreign, malformed or unsupported checkpoint.
- `DesignReviewOwnerError` when A controller activity submission is not from the active reviewer connection/execution.

**Preconditions:**
- Progress query is observation only and may run from a different session.
- Only actual reviewing controller may submit planning/activity/results; submitter does not acquire reviewer authority.

**Postconditions:**
- Polling and process-only heartbeats do not renew inactivity or cause model calls.
- Progress includes explicit guidance to wait for full review before corrections, resolving findings or new attempts.
- Native review uses existing activity mode with 30-minute inactivity, active tools separate and internalRetry:false; S1 does not add automatic technical retries.

### 2.5 `DesignReviewCheckpoint`

```typescript
interface DesignReviewCheckpoint { readonly schemaVersion: 1; readonly reviewId: string; readonly artifactId: string; readonly attempts: readonly DesignAttempt[]; }
interface DesignReviewConsolidated { readonly reviewId: string; readonly attempt: number; readonly artifactId: string; readonly status: 'passed' | 'changes_requested' | 'incomplete' | 'failed' | 'invalidated'; readonly counts: { readonly HIGH: number; readonly MED: number; readonly LOW: number; }; readonly chunks: readonly DesignChunkResult[]; readonly limitations: readonly string[]; readonly reviewer: 'daemon' | 'controller'; readonly reviewedContentIdentity: string; }
```

**Parameters:**
- `checkpoint: DesignReviewCheckpoint` — One schema-validated JSON authority at <project>/.insrc/tmp/design-review/<review-id>.json, containing one S1 attempt.

**Returns:** `Promise<void>` — State publication succeeds only after private temp-file write, file fsync, rename and directory durability; no intermediate partial JSON is observable.

**Errors:**
- `DesignReviewPersistenceError` when No-follow load, bounded input, schema, disk or atomic-save operation fails.

**Preconditions:**
- Literal validated review id and canonical repo; directories mode0700 and files mode0600.
- Mutation serialized on this review owner; checkpoint is not a DB connection or a new artifact head.

**Postconditions:**
- Completed result is flushed before next unit, final consolidated report retained inside checkpoint and retrievable without model work.
- No native transcript, raw reasoning or repeated prompt archive; one subject baseline per attempt only.
- S1 never removes checkpoints or stamps lifecycle approval/review. Permanent history and approval cleanup remain S4.

## 3. Data model changes

### 3.1 `DesignReviewSubject and baseline` — new

sc1 subject derives canonical identity/type/author/current document paths from existing artifact marker, ArtifactIds and store readers. JSON path resolves only to that canonical head; markdown is contained in docs via resolveDocsMarkdown and must carry the same marker. Resolve the corresponding generated document from canonical artifact placement, not filename guessing; reject missing or mismatched paired representation. Capture bytes/fingerprints of subject JSON and markdown and one structured body/citations/document baseline privately in sc2. Current native reads use live paths, not this baseline; no git state or commit pointer is admitted. S1 compares at admission completion, before/after planning, before/after each chunk and before consolidation; mismatch yields invalidated/requiresUserInput and discards stale candidate. Continuous watch, immediate cancellation/restart and recovery belong to S2. External references/source are never part of the invalidation set.

**Call sites:**
- `src/workflow/artifact-content.ts`
- `src/workflow/storage.ts`
- `src/workflow/review/party.ts`
- `src/daemon/workflow-review-rpc.ts`

### 3.2 `DesignChunkPlan and host coverage inventory` — new

Host creates a deterministic inventory of reviewable canonical body sections, stable functional requirement/story/contract ids, citations and authored visual definitions/companion links, plus document-only sections if any. Each inventory unit has a stable id, JSON pointer or document heading/range, kind and title; no model-authored analysis is treated as a host fact. Inventory lives in checkpoint and is accessed by path; it is not copied wholesale into prompts. The plan maps every host unit to one or more substantive chunks with named dependencies; all selectors must resolve within current inventory. Final consistency chunk is unique, last, depends on every substantive chunk and checks whole-artifact/upstream coherence. Duplicated shared concern coverage is explicit rather than an excuse for unassigned units. Exactly one accepted plan per attempt; malformed plan is not partially committed. Inventory and final consistency use the workflow-specific matrix; Epic-only sections/contracts are not invented for standalone or issue LLDs.

```
interface CoverageUnit { readonly id: string; readonly selector: string; readonly title: string; readonly kind: 'section' | 'requirement' | 'story' | 'contract' | 'citation' | 'visual'; }
interface DesignReviewInventory { readonly units: readonly CoverageUnit[]; }
interface DesignChunkPlan { readonly chunks: readonly DesignChunk[]; readonly coverageExplanation: string; readonly finalConsistencyChunkId: string; readonly coverage: readonly { readonly unitId: string; readonly chunkIds: readonly string[]; }[]; }
```

**Call sites:**
- `src/workflow/storage.ts`
- `src/workflow/artifact-content.ts`
- `src/mcp/server.ts`

### 3.3 `Artifact-specific read-only policy` — new

One common review policy examines actual document correctness, functional completeness and traceability, scope/non-goals, requirements/acceptance, contracts and data relationships, errors/test coverage where relevant, dependency/order feasibility, citations, internal/cross-document consistency and appropriate diagrams/UX. DEF chunks bind capability requirements, related stories, constraints and acceptance; HLD chunks bind subsystem contracts/ownership/dependencies/interactions; LLD chunks bind responsibility interfaces/logic/errors/test coverage. Shared concerns may be referenced across chunks; size alone cannot define unrelated piles. The final consistency chunk reconciles shared contracts, cross-chunk contradictions, missing requirements and upstream alignment. Native and controller reviewers receive the same immutable policy version, chunk assignment and structural schema at the prompt tail. No fixed chunk token size is imposed; reviewer chooses coherent scope within declared validation bounds. Reviewer inspects referenced companions as needed and distinguishes unavailable verification from a defect or optional advice.

**Call sites:**
- `src/shared/types.ts`
- `src/mcp/server.ts`
- `src/workflow/review/party.ts`

### 3.4 `DesignAttempt and consolidated feedback` — new

Extend the sc2 type sketches into a strict versioned schema: attempt number/status, immutable submitted path metadata, subject baseline and coverage inventory, optional accepted plan, ordered completed chunk results, current unit/execution generation and sequence, reviewer/model provenance, timestamps/pointed technical failure, bounded progress and optional consolidated report. One review owns one artifact and S1 exactly one attempt; plan owns one-or-more chunks; each chunk has zero-or-one accepted result. Controller exchange stores actual trusted connection identity only in memory, not reusable authority in JSON. Chunk and finding IDs are unique within an attempt; evidence references are inspected paths/selectors, limitations identify missing required checks and advice never changes severity counts. Count every finding once; final status derives from chunk results with incomplete precedence, not a separate model-judged summary. Optional consolidation prose can be deterministic from accepted summaries; do not add another hosted review call.

```
type DesignReviewStatus = 'pending' | 'running' | 'interrupted' | 'paused' | 'invalidated' | 'passed' | 'changes_requested' | 'incomplete' | 'failed';
interface DesignUnitAssignment { readonly kind: 'planning' | 'chunk'; readonly executionId: string; readonly sequence: number; readonly chunkId?: string | undefined; readonly prompt: string; readonly schema: StructuredSchema; }
interface DesignReviewAcknowledgement { readonly reviewId: string; readonly attempt: number; readonly artifactId: string; readonly reviewer: 'daemon' | 'controller'; readonly status: DesignReviewStatus; readonly checkpointPath: string; }
```

**Call sites:**
- `src/daemon/steps/host.ts`
- `src/shared/ipc-client.ts`
- `src/mcp/code-review/handler.ts`
- `src/workflow/review/party.ts`

### 3.5 `Private checkpoint persistence and limits` — new

One canonical JSON file per review under .insrc/tmp/design-review, no raw reasoning/prompts/transcripts and no per-chunk copied baseline. Bounded admission: each subject file <=8MiB; checkpoint <=64MiB; <=8192 coverage units; <=128 chunks including consistency; <=256 findings per chunk; each result <=1MiB; individual summary/message/limitation text <=8192 characters and path/reference <=2048. Validate before acceptance; limits cause explicit errors, never truncation or silent omitted scope. Candidate that cannot fit is not committed and no next chunk starts. Atomic save uses private sibling temp then fsync/rename/directory sync; failed save leaves last accepted snapshot intact and reports durable-state failure. Preserve old files on corrupt/unknown version and reject their reuse. After daemon restart, progress reads saved completed data with freshness interrupted, not live; S1 returns recovery_not_supported rather than restarting unfinished inference. S2 adds explicit recovery.

**Call sites:**
- `src/workflow/storage.ts`
- `src/shared/ipc-client.ts`
- `src/daemon/workflow-review-rpc.ts`

### 3.6 `Normal MCP and main-daemon routing` — invariant-change

Register the new strict insrc_review_step schema and guide phases start/progress/assignment/plan/activity/result in the normal MCP server; replace only that tool's unavailable handler. Add a dedicated design-review MCP adapter using generic createPersistentIpcClient. Planning/result/activity require the active trusted controller-review connection; observation may reconnect freely. Route step.call for this tool and new short designReview.* methods to the main daemon owner using existing method-class/router conventions, including repo authorization/audit tables. Keep legacy workflow.review, workflow.reviewArtifact, workflow.resolveFinding and removed stream/helpers throwing PENDING REVIEW RE-IMPLEMENTATION; no shape translation or old claim/judge pipeline. Existing code-review handler/provider contracts are not generalized or modified. Daemon uses review role/core floor through existing router and runReviewSession in activity mode, no codeTaskCommands and internalRetry:false. Existing normal approval behavior stays unchanged until S4 version-aware history integration; S1 report is useful and retrievable but is not fabricated into a legacy gate record.

**Call sites:**
- `src/mcp/server.ts`
- `src/mcp/code-review/handler.ts`
- `src/shared/ipc-client.ts`
- `src/daemon/steps/host.ts`
- `src/daemon/handler-runtime.ts`
- `src/daemon/workflow-review-rpc.ts`

### 3.7 `Proposed implementation placement` — new

Proposed new paths, not existing-source claims: src/workflow/review/design-review/contracts.ts (sc1/sc2 schemas), subject.ts (canonical live subject/inventory), policy.ts (common/type-specific guidelines), checkpoint.ts (validated atomic IO), coordinator.ts (one owner and serial unit dispatch), results.ts (result assessment/consolidation); src/mcp/design-review/schema.ts and handler.ts; src/daemon/design-review-rpc.ts and src/daemon/steps/design-review-step.ts. Keep helpers private to this domain and reuse generic provider/activity/IPC interfaces. Existing integration edits are limited to normal MCP registration/schema discovery/steering, step host, main-thread routing and RPC repo contract registries. No new DB, scheduler, shared review engine, flags or code-review-domain dependency.

**Call sites:**
- `src/mcp/server.ts`
- `src/daemon/steps/host.ts`
- `src/daemon/handler-runtime.ts`

### 3.8 `Workflow-specific subject context and reference requirements` — new

Resolve workflow from canonical root and existing provenance, not filename, hash spelling, standalone flag alone or caller-supplied kind. Existing readEpicDefinitionCore, ArtifactIds and explicit relationships establish root; validate root records before fallback. ISSUE root takes precedence over a standalone storage/layout flag. corrects/parentRef targets are context, not a replacement workflow root. Contradictory or missing required provenance is a context error, never a silent downgrade.

| Workflow / subject | Required current context | Conditional or optional | Not required |
| --- | --- | --- | --- |
| Epic DEF | Current DEF and captured scope | SPEC when explicitly seeded/referenced | HLD, LLD, PLAN, TASKS, BUILD, CR |
| Epic HLD | Current HLD and approved DEF | Declared seed SPEC/linked context | LLD, PLAN, TASKS, BUILD, CR |
| Epic story LLD | Current LLD, approved DEF containing its story, applicable approved HLD | Referenced stories/contracts | Future PLAN/TASKS/BUILD/CR; no separate STORY JSON when story is in DEF |
| Standalone feature/small LLD | Current standalone LLD and captured scope/requirements | SPEC when explicitly seeded/referenced; available repo/design context | DEF, parent HLD, sibling story set, future PLAN/TASKS/BUILD/CR |
| Sized issue LLD | Current LLD and originating approved ISSUE: reproduction, root cause, fix intent, resolved via canonical ISSUE root or explicit provenance | Available corrected-artifact/design references | Synthetic DEF/HLD or correction target's entire Epic chain; future PLAN/TASKS/BUILD/CR |
| Small issue / trivial direct build | No design-review subject on route | Existing references as context | Invented LLD/HLD/DEF or mandatory review of ISSUE/SPEC/PLAN |

A missing declared required reference is a context error; an optional/not-applicable artifact absent by design is not incomplete review. Necessary substantive evidence that cannot be verified remains an honest review limitation. ISSUE/SPEC/PLAN/BUILD are not new review subject kinds. Direct review of an ineligible root returns design_review_not_applicable with no checkpoint/model call, not a fabricated passing review. Caller still supplies only artifactPath; daemon derives kind/root/context. Final consistency checks actual upstream requirements: Epic DEF/HLD, standalone scope or originating ISSUE.

```
type DesignWorkflowKind = 'epic' | 'standalone' | 'issue';
interface DesignWorkflowContext { readonly kind: DesignWorkflowKind; readonly rootArtifactId: string; readonly requiredReferences: readonly { readonly role: string; readonly artifactId: string; readonly path: string; }[]; readonly availableReferences: readonly { readonly role: string; readonly path: string; }[]; readonly notApplicableRoles: readonly string[]; }
interface DesignReviewSubjectContext { readonly subject: DesignReviewSubject; readonly workflow: DesignWorkflowContext; }
```

**Call sites:**
- `src/workflow/storage.ts`
- `src/workflow/runners/design-story/standalone.ts`
- `src/workflow/runners/design-story/index.ts`
- `src/workflow/bugfix/next-after-issue.ts`
- `src/workflow/bugfix/admit.ts`

## 4. Diagrams

- [Sequence diagram](docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S001/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | Own minimal path-based subject request, derive kind/party, common strict chunk plan and artifact-specific policy. Coverage inventory/maps refine the HLD sketch additively without changing its meaning or importing sibling contracts. |
| `sc2` | implements | Own schema-versioned checkpoint, immutable accepted completed feedback, progress and deterministic consolidation. S1 supports initial attempt only; later status names are reserved contract values, not a hidden implementation of sc3/sc4/sc5. No permanent lifecycle stamp/cleanup until S4. |

## 6. Error paths

**Error cases**

- **Unsupported subject, wrong marker, path escape, malformed schema or unknown author** (recoverable)
  - Detection: Canonical path containment/no-follow checks, ArtifactIds parsing, paired document marker comparison, strict request decoding and authorPartyOf fail before admission.
  - Response: Return typed input error and make no checkpoint/model call; never choose a reviewer by guessing.
  - User impact: Caller corrects subject/path or author metadata without paying for a review.
- **Duplicate or conflicting start** (recoverable)
  - Detection: Main owner checks review-id checkpoint and active artifact reservation before provider dispatch.
  - Response: Exact same immutable submitted input returns existing acknowledgement; different input or active overlapping subject returns conflict. No overwritten checkpoint or duplicate call.
  - User impact: Safe transport retry does not repeat model work.
- **Chunk plan omits units, hides them in the final check, duplicates IDs, has cycles or exceeds limits** (terminal)
  - Detection: Strict schema plus host inventory set comparison, selector resolution, DAG/order and final-check validation fail.
  - Response: Do not accept or partially save the plan; surface pointed validation details. S1 technical failure is explicit and does not automatically retry; S2 owns bounded retry behavior.
  - User impact: Incomplete scope is visible and cannot produce a passing report.
- **Required inspection or verification omitted from feedback** (terminal)
  - Detection: Every assigned inventory selector must be represented by inspectedReferences or an explicit unit-named limitation; result normalization checks pass status against limitations and mandatory coverage. Semantic truth remains the reviewer's responsibility.
  - Response: Missing mandatory coverage is an incomplete substantive result, not a clean pass. Save honest incomplete feedback and continue remaining chunks. Reject malformed response shape separately as technical failure.
  - User impact: User sees review limitations and remaining chunks are still reviewed.
- **Provider fails, CLI rejects output or candidate is structurally invalid** (terminal)
  - Detection: Provider throws/exits, structured schema decoding fails or candidate validator identifies wrong chunk/fields/status. Candidate rejection terminates that S1 unit instead of allowing hidden retries.
  - Response: Record concise code/summary, preserve prior completed chunks and mark failed. No automatic retry in S1; no legacy transport fallback or manufactured review findings.
  - User impact: Report distinguishes execution failure from a defect in the artifact.
- **Subject differs at an execution boundary** (terminal)
  - Detection: Re-read current subject JSON/document fingerprint and compare to admitted baseline before/after plan/chunk and before final consolidation.
  - Response: Reject late/stale candidate and mark invalidated with requiresUserInput. Do not restart or re-use completed chunks. Continuous monitoring, immediate cancellation and user-authorized restart mechanics belong to S2.
  - User impact: No known changed design receives a stale passing report.
- **Checkpoint write cannot complete or candidate exceeds storage bounds** (terminal)
  - Detection: Pre-serialization size/schema validation or private-temp write/fsync/rename/directory sync fails.
  - Response: Do not advance to another chunk or acknowledge the candidate as durable. Preserve last valid snapshot, report persistence failure and cleanup only own temporary file. If final failed status itself cannot be saved, expose error in live response/log and never claim it persisted.
  - User impact: Completed durable feedback is retained; state uncertainty is explicit.
- **Foreign, stale or conflicting controller submission** (recoverable)
  - Detection: Trusted connection identity, review/attempt, execution generation, sequence and candidate digest differ from issued assignment or accepted submission.
  - Response: Reject without changing active authority or accepted feedback. Identical replay is idempotent; conflicting replay is an error.
  - User impact: Another observer/session cannot replace the independent reviewer's output.
- **Reviewing controller disconnects or daemon process restarts** (terminal)
  - Detection: Trusted owner connection closes or no live in-memory execution matches saved running state.
  - Response: Preserve completed results and expose interrupted/freshness-not-live. Do not automatically retrigger; S1 reports recovery_not_supported. Native daemon review is unaffected by loss of its submitting/observing connection.
  - User impact: User can retrieve completed work without an accidental rerun.
- **Polling asks for a nonexistent attempt or invalid result cursor** (recoverable)
  - Detection: Checkpoint identity/schema lookup and cursor bounds check fail before any execution path.
  - Response: Return not-found/input error; polling remains model-free and never creates a review.
  - User impact: Observation errors do not spend model work.
- **Missing or contradictory required workflow context** (recoverable)
  - Detection: Canonical root/provenance and reference matrix disagree, required root/upstream cannot be read, or Epic LLD has no valid DEF/HLD/story.
  - Response: Return DesignReviewContextError before provider call with missing role/identity. Do not reinterpret Epic as standalone, infer ISSUE by title or require parent Epic chain from correction links. Ineligible roots return design_review_not_applicable without a pass.
  - User impact: Real missing inputs are named without false requirements from another workflow.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Small artifact fits one coherent substantive chunk | Allow that chunk plus the final consistency chunk; do not force arbitrary extra splits. |
| Large artifact has shared contracts spanning multiple responsibilities | Reviewer creates coherent chunks with explicit shared references and coverage; final consistency checks their integration. No fixed token-size chopping. |
| Many completed chunks or large feedback | Progress defaults to bounded metadata/counts and completed-result availability; optional cursor-based completed feedback pages contain at most one <=1MiB result, with next cursor. This preserves immediate access without retransmitting the entire checkpoint on every poll. The strict progress query admits optional afterCompletedChunk and includeResult fields; no full baseline/prompt content is included. |
| HIGH/MED finding appears early | Persist it, expose it and continue all remaining chunks; controller waits for full review before corrections. |
| LOW-only advice and no verification gaps | Pass with LOW counts as applicable; optional advice is a separate list and does not invent a finding or block. |
| A necessary diagram or upstream requirement cannot be inspected | Name the affected unit and verification limit, mark incomplete where required, continue other chunks and never claim visual verification. |
| Standalone LLD or unusual but registered artifact placement | Resolve through canonical artifact identity/placement and derive upstream references that exist; absent optional context is distinguished from missing required context. |
| Exact replay of accepted plan/result after a response was lost | Return existing accepted state without re-dispatching; replay with changed body is refused. |
| External source/reference changes during review | No invalidation trigger; reviewer uses available current external context and reports limitations if relevant. |
| No model activity but repeated progress polling | Polling does not reset the existing 30-minute inactivity grace; active tool execution is tracked independently. |
| Issue-root LLD is stored as standalone and links to an Epic artifact it corrects | Remain issue via root/provenance; require originating ISSUE and treat correction target as available context, not mandatory full Epic chain. |

**Invariants to preserve**

- Only current insrc_review_step is restored; retired workflow.review and legacy stream/claim/resolve execution remain unavailable. Working task-based code-review schemas and behavior remain intact. [[c1]]
- Cloud review uses existing CLI provider OAuth and model role floor; no direct REST, no code-task shell grants and no new trust/activation system. [[c2]]
- One accepted checkpoint authority, one baseline per attempt, one accepted result per chunk, and one native unit at a time per review. [[c1]]
- S1 does not implement sibling-owned recovery/retry/impact/permanent approval cleanup; these remain explicit unavailable operations until their owning stories land. [[c1]]

## 7. Test strategy

**Test framework:** `node:test and node:assert/strict with tsx, matching directly inspected src/workflow/__tests__/review-unavailable.test.ts, src/mcp/__tests__/task-review.test.ts and provider activity/session fixtures. Analyzer test retrieval was off-topic, so those direct reads ground the choice. Live hosted test is explicit/opt-in and reported separately from deterministic fake sessions.`

**Test levels**

- **unit** — Validate real subject identity, plan coverage, status semantics, prompt boundaries and durable IO.
  - Subjects: `Canonical DEF/HLD/standalone LLD resolution; wrong marker/type/party/path refusal before provider call.`, `Host inventory and semantic plan mapping for all three artifact kinds, missing-unit/final-only/cycle/duplicate rejection.`, `Prompt contains policy, live paths, chunk metadata and trailing output schema but not a unique artifact-body canary or repeated baseline.`, `Accepted result requires assigned inspected references or explicit limitations; HIGH/MED/incomplete precedence, LOW advice separation and count deduplication.`, `Atomic-save fault injection preserves prior checkpoint and prevents next-unit dispatch; unknown/corrupt/oversize state retained.`, `Table-driven required references: DEF without future artifacts; HLD with DEF; Epic LLD with DEF/HLD/story; standalone feature/small LLD with no DEF/HLD; sized issue LLD with ISSUE and no fabricated HLD; no-design-review small issue/trivial route.`, `Negative branch confusion: missing required Epic HLD does not silently become standalone; ISSUE root plus standalone flag/corrects link remains issue; declared missing SPEC differs from optional absent SPEC; LLD review never requires future PLAN/TASKS/BUILD/CR.`
  - Fixtures: `Temporary canonical artifact JSON+markdown pairs for DEF/HLD/LLD with requirements, shared concerns and diagrams.`, `Fault-injectable filesystem write/fsync/rename and fake provider; no model call for validators.`, `Separate Epic-root, LLD-root, ISSUE-root and no-LLD fixtures, including absent legacy standalone flag, contradictory metadata and correction links.`
- **contract** — Prove daemon and controller consume identical policy/schema and reject forged or replay-conflicting submissions.
  - Subjects: `Opposite-party selection for both authors, refusal of unknown author.`, `Controller owner/execution/sequence binding, exact replay idempotence and conflicting replay refusal.`, `Native/controller equivalent chunk feedback produces identical consolidated status/counts.`, `Progress request and bounded result-page request never call a provider or renew inactivity.`, `Native options are activity mode 1800000ms, internalRetry:false and absent codeTaskCommands.`
  - Fixtures: `Trusted connection fixtures and captured assignment/candidate envelopes; same inputs for native/controller paths.`
- **integration** — Exercise actual MCP to step host to main daemon routing, checkpoint updates and observer lifetime.
  - Subjects: `Real local Unix IPC/stdio MCP start acknowledges before delayed fake reviewer completion; independent poll sees saved feedback.`, `One review serializes chunks; duplicate start from another session dispatches no additional planning/chunk work.`, `Submitting MCP disconnect does not abort native review; reviewing-controller disconnect marks interrupted and preserves completed chunks.`, `HIGH/MED first chunk and incomplete second chunk both permit later substantive/final consistency work; no corrective artifact writes.`, `Progress pages expose completed findings without retransmitting baseline; exact failed save prevents advancing.`, `Retired workflow.review/legacy stream and resolver routes still throw exact unavailable exception; code-review normal path remains unchanged.`
  - Fixtures: `Temporary registered repo, isolated daemon socket and fake CLI/provider only for deterministic transport test.`, `Baseline regression fixtures for existing task review without rerunning hosted reviews.`
- **smoke** — Verify compiled shipping entrypoint and normal tool registration without model costs.
  - Subjects: `Build with npm run build; compiled MCP schema discovery exposes only current design phases and correct guide.`, `Compiled daemon/main-thread route starts one fake native review, polls feedback and retrieves completed report.`, `Compiled code-review registration and focused routing regression remain healthy.`
  - Fixtures: `Fake native CLI shim with activity/output records, isolated HOME/socket/config and registered sample artifacts.`
- **live** — Demonstrate one genuinely useful independent design review through the supported interface after deployment.
  - Subjects: `Controller-authored meaningful current DEF/HLD/LLD is reviewed by the daemon via normal insrc_review_step, not internal RPC fallback.`, `Reviewer reads linked artifact/code, returns coherent plan and substantive feedback, all chunks complete and checkpoint/result remain retrievable.`, `Record model identity, review/attempt, timestamps, chunk/status/findings and any optional execution/visual verification limits. No test fixture output is claimed as hosted assessment.`
  - Fixtures: `Explicit hosted-run opt-in and normal installed CLI OAuth/provider routing.`, `Use S1's real LLD or an agreed meaningful current artifact; no unrelated full repository test sweep.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit canonical identity/party refusal tests`, `contract opposite-party and native/controller policy/schema parity`, `prompt canary and live-path assertions`, `Workflow/reference matrix and negative branch-confusion tests across Epic, Standalone and Issue.` |
| `ac2` | `unit DEF/HLD/LLD coherent policy fixtures with host inventory coverage`, `plan rejects missing units, final-only coverage, cycles and duplicate IDs`, `live reviewer plan inspection plus final consistency coverage`, `Final consistency uses actual upstream: Epic DEF/HLD, standalone scope, or ISSUE reproduction/root cause/fix intent.` |
| `ac3` | `real IPC/MCP delayed reviewer acknowledgement and polling test`, `native submitter disconnect with continued execution and durable completed feedback`, `bounded cursor-based completed feedback test with zero provider calls on poll` |
| `ac4` | `integration early HIGH/MED and incomplete feedback continues remaining chunks`, `result assessment verifies mandatory gaps cannot pass and advice stays separate`, `assert artifact content unchanged throughout read-only review` |
| `ac5` | `compiled normal MCP/daemon smoke with fake CLI clearly labeled`, `one meaningful live independent review with retained result evidence`, `focused existing task-review routing/schema/ownership regressions and retired-route exception checks` |

## 8. Alternatives considered

### 8.1 a1: One shared plan/result envelope with artifact-specific review policy — **CHOSEN**

Use one strict subject/checkpoint and chunk/result schema for all three artifact kinds.

Resolve the existing artifact identity from a path and use the same validated request, plan, chunk feedback and progress envelopes for DEF, HLD and LLD. Artifact-specific policy defines coherent grouping and review expectations; host-owned unit inventory and coverage checks enforce complete assignment without embedding document content in prompts.

A single coordinator state snapshot owns all accepted results and derives consolidated status/counts deterministically. Native and controller reviewers use identical assignments and schemas. Baseline content is private checkpoint data for later impact work, not commit-pinned scope or a prompt copy.

### 8.2 a2: Artifact-specific plan and result variants

Use DEF/HLD/LLD-specific response variants inside the common checkpoint.

Keep the same path-based request and single checkpoint, but define separate plan and chunk-feedback variants for each artifact kind. Native/controller assignment schemas select the corresponding variant, with a common projected progress/result view.

Variants explicitly name requirements, architectural contracts or implementation/error/test concerns. They still refer to live document paths, preserve sequential chunk execution and avoid task-review domain contracts, but grow the schema and projection surface before a demonstrated need for distinct payloads.

**Rejected because:** Both satisfy ac1-ac5/sc1/sc2, but three artifact-specific schema variants add parity and projection work without a confirmed outcome benefit.

## 9. References

- **[[c1]]** `prior-artifact` `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/HLD.md`
- **[[c2]]** `convention` `AGENTS.md`
- **[[c3]]** `analyze-bundle` `s1: S1 subject/provider/transport signatures and direct-read test fallback`
- **[[c4]]** `analyze-bundle` `Additional Story-context discovery: Epic, Standalone and Issue workflow requirements`
- **[[c5]]** `code` `src/workflow/runners/design-story/standalone.ts`
- **[[c6]]** `code` `src/workflow/bugfix/next-after-issue.ts`
- **[[c7]]** `code` `src/workflow/storage.ts`
- **[[c8]]** `stakeholder` `Current chat: workflow branches and differing artifact requirements` — "workflow are different for Epics/Standalone/Issues. the artifact requirements are also different."
- **[[c9]]** `prior-artifact` `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/DEF.md`
- **[[c10]]** `code` `src/shared/types.ts`

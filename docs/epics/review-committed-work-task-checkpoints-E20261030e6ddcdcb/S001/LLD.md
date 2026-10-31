<!-- insrc:artifact LLD-e6ddcdcb3d9cf330-s1 -->

# LLD: STORY-e6ddcdcb3d9cf330-s1

## Summary

**Epic:** `review-committed-work-task-checkpoints`
**HLD base run:** `wf-1793386460254-8th2oq`
**HLD effective hash:** `68fe25ca25dc...`

Start a review from the submitted change set, inspect its committed source and tests one task at a time, and save each completed assessment in one JSON file. Keep daemon and controller reviewer behavior aligned while preserving their different disconnect lifetimes. Publish a versioned task-based CR without invoking the old dimension/chunk review engine.

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

**Rollout phase:** A — useful scoped review
**Owns:** `sc1` (Committed review packet and task assessment), `sc2` (Single checkpoint file and execution lifecycle), `sc3` (Permanent CR projection and story cleanup)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Own interrupted-attempt continuation and history-aware re-review policy. Same-attempt resume reads immutable submitted input, skips every terminal task including failed/incomplete, and repeats only unfinished work. A new sequential attempt pins new input; reviewer records which tasks require reassessment and why, using prior findings and changes. Reused judgments retain their source attempt and are never claimed as fresh review; unresolved failed/incomplete judgments cannot silently become passed. A changed packet on resume is an explicit conflict. Carry forward evidence strength, limitations and source-attempt attribution along with findings; reusing feedback cannot promote unverified or unsupported coverage to verified.
- `s3`: Own normal entrypoint/session integration and concurrency/approval cleanup verification. Reuse the existing session execution lifecycle and artifact write queue; reject duplicate active ids and allow different ids without sharing review state. Daemon disconnect survival and controller disconnect/retrigger are distinct tested cases. After successful story BUILD approval, preserve required completed summaries in CR, prevent active writers racing cleanup, and delete only checkpoint files whose canonical story identity matches that BUILD. Task-level validation or failed approval must not delete files. Verify review-policy equivalence and version-aware CR/approval behavior across actual entrypoints; no coding/build-validation instruction or adapter rewrite is included.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `handleCodeReviewStep`

```typescript
handleCodeReviewStep(input: unknown, deps?: CodeReviewStepDeps): Promise<CodeReviewStepMcpEnvelope>
```

**Parameters:**
- `input: unknown` — Proposed explicit task-review start/assignment/result phases carrying ReviewRequest or TaskSubmission; legacy phases remain separately routed.
- `deps: CodeReviewStepDeps` _(optional)_ — Daemon-owned admission, checkpoint, task scheduling and CR publication dependencies.

**Returns:** `Promise<CodeReviewStepMcpEnvelope>` — Short acknowledgement with review-id/attempt/path/status for daemon review; actual controller reviewer additionally receives one task assignment, then the next after submission. Never wait for a whole review.

**Errors:**
- `ReviewError` when Invalid packet, conflicting identity/attempt, active duplicate, missing checkpoint, wrong reviewer, or persistence error.

**Preconditions:**
- Repo and story identities are canonical; other party is derived from BUILD author.
- S1 admits a fresh first attempt; S2 later implements resume and later-attempt selection using the same stored shapes.
- Change set is nonempty and selected segments resolve through the supplied commit pointers; committed document/test references exist.

**Postconditions:**
- Create the sole checkpoint before acknowledging; schedule only after that write succeeds.
- No HEAD/final-commit requirement, generic diff scope, per-commit review jobs or missing-selected-change truncation.
- Daemon work outlives the submitting request; controller work stays in its actual session and stops on disconnect.

### 2.2 `runReviewSession`

```typescript
runReviewSession<T>(prompt: string, schema: StructuredSchema, opts: ReviewSessionOpts): Promise<T>
```

**Parameters:**
- `prompt: string` — Functional task assignment and references to pinned documents, selected change entries, test details, target conventions and ordinary review policy.
- `schema: StructuredSchema` — TaskReviewResult only: no model-generated binding, checkpoint sequence, coverage-row ledger or aliases.
- `opts: ReviewSessionOpts` — Absolute repository context, remaining S/M/L deadline and cancellation; internalRetry=false. A code-task-specific tool policy supports targeted committed reads and permitted test execution without changing design-review defaults.

**Returns:** `Promise<T>` — One task assessment, not a complete-story CR. The host validates status, findings, evidence limits and coverage before saving.

**Errors:**
- `ReviewSessionTimeoutError` when The entire task allowance expires, including exploration, any model turns, test execution and output validation.
- `Error` when Model/transport failure or malformed result produces a failed task and actionable diagnostic; no automatic full-task retry.

**Preconditions:**
- Use the existing high-tier provider selection and CLI-only cloud access.
- Provide focused commit:path/line references rather than broad prepacked repository dumps.
- Native tools may read evidence and run permitted target tests, but may not edit production code. If an adapter cannot safely provide a requested verification route, record unsupported evidence rather than silently relaxing permissions.

**Postconditions:**
- Host supplies task identity and checkpoint fields; model reports ordinary semantic feedback.
- A required unverified behavior prevents passed; missing graph/run evidence does not manufacture HIGH/MED.
- Per-task duration is 300000/600000/900000ms from one task start; no inherited shorter 90/300-second job ceiling, correction loop or fixed story ceiling may cut it short.

### 2.3 `roundWriterFor`

```typescript
roundWriterFor(repoPath: string, actor?: Actor): RoundWriter
```

**Parameters:**
- `repoPath: string` — Owning canonical project.
- `actor: Actor` _(optional)_ — Actual independent reviewer party provenance.

**Returns:** `RoundWriter` — Reuse the existing canonical artifact queue/round-write seam for a schema-version-2 task-based CR; do not pass its body to the legacy dimension validator.

**Errors:**
- `Publication error` when Retain completed task checkpoint and pending CR publication; never rerun tasks merely because publication failed.

**Preconditions:**
- All selected task outcomes are terminal before attempt completion.
- Validate new task-based CR body separately; keep legacy version-1 readers/validation.

**Postconditions:**
- CR retains scope references, actual reviewer, task findings/coverage/limitations/advice and review-id/attempt attribution.
- CR publication is idempotent for the attempt; terminal attempt status is published only after CR succeeds.
- Task-only pass is never automatically interpreted as complete story review.

## 3. Data model changes

### 3.1 `ReviewPacket / sc1` — new

The explicit change set is authoritative; commits are only immutable lookup pointers. Keep the HLD reviewSet grouping as a serialization convenience: each files[].segments[] is a selected change entry, not a request to review the containing commit. Pin each selected before/after reference to its specified commit/parent object; never require a final commit, construct a synthetic review tree, widen selection to other files in those commits, or launch a review per commit. Read surrounding context at an explicit relevant source version and label it as context. If overlapping temporal versions cannot be interpreted confidently, retain the submitted selection and return an evidence limitation rather than silently choose HEAD. Committed Story/LLD/Plan paths and complete tests live once in submitted; the daemon derives task order, sizing and attribution. A selected change may relate to multiple tasks; preserve that attribution rather than drop cross-cutting changes. Uncertain attribution prevents a clean completion. Submitted test results are labeled builder-reported; new executions record actual tested source versions and can support a pinned claim only where those versions match the relevant submitted evidence.

```
interface CommittedDocument { path: string; commit: string; }
interface ReviewCommit { commit: string; parent: string | null; files: readonly { path: string; previousPath?: string; segments: readonly { before?: readonly [number, number]; after?: readonly [number, number] }[] }[]; }
interface ReviewPacket { storyId: string; taskId?: string; functionalSummary: string; documents: { story: CommittedDocument; lld: CommittedDocument; plan: CommittedDocument }; reviewSet: readonly ReviewCommit[]; tests: readonly SubmittedTestDetail[]; }
```

**Call sites:**
- `src/daemon/steps/code-review-step/handler.ts`
- `src/daemon/code-review-rpc.ts`

### 3.2 `ReviewCheckpoint / sc2` — new

Proposed sole execution file: <project>/.insrc/tmp/code-review/<review-id>.json. Canonical project/story/optional task identity belongs to one review; it owns attempts, each with header, submitted and review-response. Identity, source pointers and submitted packet are immutable within an attempt. Status/active-task/publication metadata may change; those writes are not partial-task progress. Host atomically replaces the complete JSON after initial admission and every terminal task; flush file before rename and directory as supported. Do not advance to the next task before the result is durable. S1 uses a daemon-owned active-id registry before launching work; S3 integrates that ownership across actual session workers. Controller submissions go through daemon validation/writes, never arbitrary controller file writes. Persist task results once, reject a conflicting duplicate and acknowledge an identical replay without another model call. A failed write stops scheduling without discarding the last valid file.

```
interface ReviewCheckpoint { schemaVersion: 1; reviewId: string; project: string; storyId: string; taskId?: string; attempts: readonly ReviewAttempt[]; }
interface ReviewAttempt { header: { attempt: number; reviewer: 'daemon' | 'controller'; status: ReviewStatus; createdAt: string; completedAt?: string; activeTaskId?: string; interrupted?: boolean; selectedTaskIds: readonly string[] }; submitted: ReviewPacket; 'review-response': { summary: string; tasks: readonly TaskReviewResult[]; crPath?: string; crPublication: 'pending' | 'complete'; error?: string }; }
```

**Call sites:**
- `src/daemon/steps/code-review-step/handler.ts`
- `src/daemon/lifecycle-registry.ts`

### 3.3 `TaskReviewAssignment / TaskReviewResult / sc1` — new

Derive assignments from the pinned Plan/LLD and current submitted selection, not uncommitted TASKS rows or user-duplicated dependency lists. Topologically order applicable tasks with Plan order as tie-breaker; per-task review narrows to its selected task while dependencies are context. Every selected change must remain accounted for. The model receives only the current task's relevant change/test references plus document paths and can investigate further. Host validates ordinary semantic results: concrete findings and references, coverage strength, evidence limitations and optional advice. A valid pass requires all required checks assessed; an empty findings array alone is insufficient. Required unknown/unsupported verification yields incomplete; supported HIGH/MED findings remain attached and request changes when assessment is otherwise complete. Timeouts yield incomplete, provider/invalid-result errors failed, and remaining tasks continue. Aggregate precedence is failed > incomplete > changes_requested > passed. Keep target naming, encapsulation, separation of concerns, approved/native object model, readability and behavioral coverage in the common prompt/result policy; do not introduce an external framework or fabricate style findings.

```
type ReviewStatus = 'pending' | 'running' | 'passed' | 'changes_requested' | 'incomplete' | 'failed';
interface TaskFinding { severity: 'HIGH' | 'MED' | 'LOW'; location: string; message: string; rationale: string; evidenceReferences: readonly string[]; }
interface TaskReviewResult { taskId: string; status: 'passed' | 'changes_requested' | 'incomplete' | 'failed'; summary: string; findings: readonly TaskFinding[]; testCoverage: { assessment: 'verified' | 'partial' | 'unverified' | 'unsupported'; explanation: string; evidenceReferences: readonly string[] }; limitations: readonly string[]; advice: readonly string[]; inspectedReferences: readonly string[]; executedTests: readonly SubmittedTestDetail[]; error?: string; }
```

**Call sites:**
- `src/agent/providers/cli-provider.ts`
- `src/agent/providers/ollama.ts`
- `src/workflow/code-review/runner.ts`

### 3.4 `Task-based CR / sc3` — new

Keep the existing CR artifact id and canonical queue, add a schemaVersion-2 task-based body, separate validation and rendering, and version-aware gate/readers. Version 1 continues through its existing dimension schema; unsupported versions must not become a no-review/pass result. Version 2 contains completed attempt summaries keyed by review-id/attempt with explicit story/task scope, source references and task results; it has no fabricated DimensionResult array. An incomplete/failed task review cannot silently satisfy story BUILD completion. S1 supplies the version-aware contract/reader and publication path; S3 wires complete story approval/cleanup behavior. The permanent result retains required findings, evidence limitations and source attribution; do not copy full temporary tool transcripts or the entire packet unnecessarily. Stage one usable end-to-end review before more recovery machinery.

```
interface TaskBasedCodeReviewBody { kind: 'code-review'; format: 'task-based'; storyId: string; status: 'passed' | 'changes_requested' | 'incomplete' | 'failed'; reviews: readonly CompletedReviewSummary[]; }
interface TaskBasedCodeReviewRecord { meta: { workflow: 'code-review'; schemaVersion: 2 }; body: TaskBasedCodeReviewBody; }
```

**Call sites:**
- `src/workflow/code-review/types.ts`
- `src/workflow/code-review/runner.ts`
- `src/daemon/lifecycle-registry.ts`

## 4. Diagrams

- [Sequence diagram](docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/S001/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | S1 owns packet/assignment/ordinary result types and common review policy. Latest user clarification resolves the pending context question: change set alone is scope; commits provide pointers, with no final/head commit requirement or independent per-commit reviews. This refines the existing nested files/segments sketch without renaming the shared field or changing downstream ownership. |
| `sc2` | implements | S1 owns initial admission, active-id exclusion, atomic completed-task writes, status and publication state. Keep the attempt collection/immutable submitted input ready for S2; do not implement S2 recovery selection or S3 worker lifecycle/cleanup here. |
| `sc3` | implements | S1 owns the version-2 CR shape, writer/reader and validation contract. Reuse existing canonical artifact queue, not legacy judge execution. S3 consumes this contract to integrate whole-story approval and cleanup. Legacy design-artifact review remains separate. |

## 6. Error paths

**Error cases**

- **Invalid or unresolved submitted scope** (recoverable)
  - Detection: Schema/path validation or Git object/parent lookup shows a selected segment or committed document cannot be resolved, is outside its referenced changed span, or targets another story/task.
  - Response: Return invalid-packet before model execution or checkpoint acknowledgement; identify the offending entry without substituting a HEAD diff.
  - User impact: Submitter corrects the packet; no unrelated review starts.
- **Duplicate active execution or conflicting immutable input** (recoverable)
  - Detection: Daemon active-id registry already owns the review-id, or stored project/story/task/attempt/input differs.
  - Response: Return already-running or attempt-conflict before scheduling or mutating the file.
  - User impact: No double execution or overwritten attempt.
- **Missing checkpoint or wrong reviewer result** (recoverable)
  - Detection: Checkpoint read returns ENOENT for a result/assignment request, or expected independent party/assigned task differs from trusted execution route and submitted result.
  - Response: Return missing-checkpoint or wrong-reviewer; never recreate history from a result, accept a self-declared reviewer, or treat refusal as a review verdict.
  - User impact: Caller receives an actionable request error; existing results remain intact.
- **Task deadline or provider failure** (recoverable)
  - Detection: Single monotonic task deadline expires, provider rejects, or terminal output fails structural/semantic validation.
  - Response: Persist incomplete for timeout, failed for provider/malformed-result error; retain diagnostics and any valid already-saved earlier tasks, then continue remaining tasks. No automatic full-task model retry.
  - User impact: Useful completed work survives; failed/incomplete work is reconsidered only in a subsequent attempt, owned by S2.
- **Evidence cannot establish required behavior or coverage** (recoverable)
  - Detection: Task assessment identifies unavailable source, unmatched execution provenance, absent assertion evidence, ambiguous task attribution or unsupported target verification.
  - Response: Record a concrete limitation and incomplete outcome, retaining any supported findings. Do not normalize missing graph/run records to a defect or empty findings to passed.
  - User impact: Unknown evidence remains visible without manufactured blocking findings.
- **Checkpoint or CR write fails** (recoverable)
  - Detection: Atomic write/flush/rename or canonical round writer throws, including invalid record version/body.
  - Response: Stop scheduling after checkpoint failure; keep the last valid JSON. On CR failure retain all task results and pending publication without a terminal-complete claim. S2 later supplies explicit retry/recovery, without repeating completed review.
  - User impact: Controller sees persistence-failed and retained output; no data is deleted.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A supplied commit also contains unrelated files/segments | Only selected change entries are in scope; other content may be context but cannot silently widen findings. |
| Insertion, deletion, rename, root commit, overlapping versions or no textual content | Represent absent sides explicitly; validate available parent/blob pointers. Preserve selected nontextual or ambiguous evidence as an explicit limitation if the reviewer cannot assess it, never fabricate line ranges or omit the entry. |
| Selected changes relate to multiple Plan tasks | Keep attribution explicit in derived assignments; dependencies are ordered from pinned Plan. Repeated context is not new review scope or a reason to lose selected changes. |
| Per-task review passes but story has other unreviewed tasks | Persist the task-scoped CR result without claiming story completion. New CR readers preserve scope; S3's full approval integration consumes it. |
| Controller disconnects versus submitter disconnecting from daemon review | Stop only controller reviewer execution and retain terminal task results; daemon reviewer continues. Persist interrupted metadata for unfinished controller work without manufacturing failed/incomplete task feedback; explicit recovery remains S2. |
| No applicable external OOP framework or consistent naming pattern | Use native/project constructs and language-appropriate fallback; preserve uncertainty and offer advice without inventing a framework defect. |
| Target tests cannot run under the adapter's existing read/test permissions | Report unsupported execution and inspect supplied tests/results honestly. Do not edit source or relax permissions globally. Code-task-specific provider integration must be exercised before claiming test capability; design-review default tools remain unchanged. |

**Invariants to preserve**

- Existing BUILD author routes the review to the other party; controller and daemon are not interchangeable labels. [[c2]]
- Cloud review uses existing CliProvider rather than REST, with serial task/provider calls and the critical-role floor. [[c2]]
- Existing CR artifact identity and canonical round writer are reused, but old version-1 dimension validation is not applied to new task-based records. [[c2]]
- The change set, not commit status/HEAD or complete commit contents, is the only submitted review scope. [[c3]]
- S2 owns recovery/re-review selection and S3 owns worker/concurrency/approval cleanup integration; S1 does not take over their implementation. [[c1]]

## 7. Test strategy

**Test framework:** `Existing Node node:test/assert TypeScript *.test.ts patterns (tsx loader), supplemented by focused filesystem-discovered backend tests when graph test lookup is off-topic. No new test framework or target-language build adapter.`

**Test levels**

- **unit** — Prove scope, ordinary result policy and checkpoint shapes without models.
  - Subjects: `packet scope: selected segments only, commits as pointers, no final/head commit or generic-diff requirement`, `packet evidence: valid parent/blob ranges, committed documents, root/insertion/deletion/rename and unsupported content`, `task assignment: pinned Plan dependency order, S/M/L sizing, multi-task attribution and no omitted selected changes`, `result policy: required unknown evidence prevents pass; optional advice never becomes changes_requested; supported HIGH/MED retained`, `review evidence fixtures: body-only defect, absent graph/run evidence, unused helper in passing test file, naming/readability/encapsulation and native-framework fallback`
  - Fixtures: `Small committed repository with unrelated changes in the same commits and explicit selected segments`, `Pinned Plan with dependent S/M/L tasks`, `Python/JavaScript/TypeScript/Go/JVM review-input fixtures for conventions and unsupported verification; no new execution adapters`
- **contract** — Keep actual reviewer parties and versioned CR behavior consistent.
  - Subjects: `daemon/controller contract parity: same assignment/result normalization, scope, statuses and independent-party checks`, `provider code-task tools: focused committed reads and permitted target test route, unsupported route explicit, no design-review default permission changes`, `CR compatibility: version-1 unchanged; version-2 task body validated/rendered without legacy dimensions; unknown version refuses`, `controller result replay: identical accepted result is idempotent, conflicting or wrong task/party refuses`
  - Fixtures: `Fake provider and canonical artifact round-writer seam`, `Legacy CR fixtures and version-2 scoped results`
- **integration** — Exercise the first complete host flow and failure handling with deterministic providers.
  - Subjects: `short start: initial JSON is durable before acknowledgement and model work is not awaited`, `per-task checkpoint: atomic result before next task; pollers always parse valid JSON`, `task deadline: 5/10/15-minute clocks include reads/tests/validation; timeout incomplete and provider failure failed; remaining tasks continue without automatic retries`, `first-attempt ownership: same-id duplicate refuses before provider; no source/attempt rewrite`, `publication: one idempotent scoped version-2 CR summary; failure retains terminal task results and pending publication`, `reader/gate compatibility: a task-only pass is not whole-story review; failed/incomplete/unknown version is never a new-format pass`
  - Fixtures: `Injected clock, filesystem fault points and controllable provider`, `Existing backend review/CR reader regression fixtures`
- **live** — Prove an actual useful installed reviewer assessment early, without qualifier/probe bureaucracy or repeated whole-story reviews.
  - Subjects: `installed first useful review: explicit selected committed change with a body-only regression is inspected and produces evidence-backed feedback, a real completed-task JSON checkpoint and task-based CR; unrelated same-commit changes stay outside scope`
  - Fixtures: `One small preselected committed subject with independently recorded expected regression and supplied test details; actual CLI run, not mocked output`
- **smoke** — Confirm deployable focused integration without a full model-driven sweep.
  - Subjects: `production build and affected backend review/provider/CR suites; fresh task-review request uses new path while existing design review and explicitly legacy tokens retain their routes`
  - Fixtures: `Built daemon/MCP output; no automatic live review rounds`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `packet scope: selected segments only, commits as pointers, no final/head commit or generic-diff requirement`, `packet evidence: committed documents and exact changed ranges` |
| `ac2` | `short start: initial JSON durable before acknowledgement`, `daemon/controller contract parity and actual disconnect-lifetime distinction` |
| `ac3` | `task assignment: pinned dependency order and no dropped changes`, `review evidence fixtures and provider read/test capability contract` |
| `ac4` | `per-task checkpoint atomicity`, `5/10/15-minute task deadline with continuation after incomplete/failed` |
| `ac5` | `result policy and aggregate precedence`, `version-2 CR publication and version-aware reader compatibility` |
| `ac6` | `daemon/controller contract parity and independent-party rejection`, `installed first useful review: real evidence-backed feedback and checkpoint before downstream expansion` |

## 8. Migration

**State before:** S1 analysis locates the existing in-session controller and daemon review routes, runReviewSession providers, canonical round writer and version-1 CR schema. The current CR validator requires dimension results; the rolled-back investigation engine is absent. The proposed selected-change packet and per-task checkpoint are new, not already implemented.

**State after:** An explicit task-review entrypoint can produce one useful committed-change assessment, durable per-task JSON and a schema-version-2 CR with common daemon/controller semantics. S2 recovery/history selection and S3 complete worker/approval cleanup integration remain later work.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add S1-owned packet/result/checkpoint contracts and an explicit new task-review route alongside the bound legacy route. Validate that commits retrieve selected changes only; do not require final HEAD or reintroduce old proof/ledger machinery. — ↩ rollbackable
2. Deliver a minimal real task review using ordinary model feedback, exact source/document pointers and completed-task persistence. Exercise one preselected useful live assessment before expanding recovery/integration; preserve any failure and diagnose that same run rather than automatically repeat a full review. — ↩ rollbackable
3. Add version-aware task-based CR publication/readers/rendering with legacy version-1 compatibility; verify affected entrypoint/provider/result-policy regressions. Keep S2 and S3 on their documented shared contracts; do not delete legacy execution or perform story cleanup in S1. — ↩ rollbackable

**Backward compat:** The existing MCP tool remains; new task-review phases/payload are explicit and versioned, not inferred from old tokens. Old CRs retain version-1 dimension interpretation. New task records use version 2 and never fabricate dimensions or downgrade unknown versions to pass. Design-artifact review and separate coding/build-validation behavior are unchanged. No migration of retired engine history or mass artifact rewrite.

## 9. Alternatives considered

### 9.1 a1: Change-set packet and one completed-task response — **CHOSEN**

Keep the explicit change set separate from its commit lookup pointers and persist ordinary task responses in the one checkpoint.

Use one packet containing committed document references, the selected file/segment change set, commit lookup pointers and complete test details. The change set is the only review scope: commits retrieve before/after evidence and surrounding context, but never create additional per-commit reviews or require a final/head commit. The coordinator derives Plan task assignments and accepts one ordinary assessment at a time.

Keep a single host-written JSON with immutable submitted input and completed task results. Reuse existing independent-party routing/providers and CR artifact identity/queue, with a separate version-2 task-based body and validation. No model-facing ledger commands or aliases are needed. Own contracts sc1-sc3 here; S2 later supplies re-review/recovery selection and S3 supplies full worker/concurrency/approval cleanup integration.

### 9.2 a2: Per-task request documents with an aggregate index

Persist a separate input/output document for every task and assemble the review-id checkpoint from them.

Derive task order from the committed Plan and split its evidence into separate task request/result files. A review-id index tracks those files and generates the CR summary from their contents.

This still treats selected changes as scope and can expose the same assessment fields, but adds independently persisted documents and reconciliation between task files and the review-id checkpoint. It is larger than the requested one-file task-checkpoint design and complicates cleanup and recovery.

**Rejected because:** Violates sc2/ac4 single-file authority and adds unrequested task-file/index reconciliation.

## 10. References

- **[[c1]]** `prior-artifact` `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/HLD.md` — "Approved HLD: S1 owns sc1-sc3; S2 owns recovery/history policy and S3 owns full session/approval cleanup integration."
- **[[c2]]** `analyze-bundle` `S1 context.assemble: existing provider, author, daemon/MCP review, CR type and canonical round-writer discovery` — "Located runReviewSession, buildAuthorParty, codeReviewRunStart, handleCodeReviewStep, roundWriterFor and version-1 CodeReviewBody; graph/test results are incomplete and supplemented by source reads."
- **[[c3]]** `stakeholder` `Current conversation: change-set clarification for S1 LLD` — "commits are only change pointers, the actual review set is the change set specified"
- **[[c4]]** `convention` `AGENTS.md` — "Preserve serial provider calls, critical role floor, daemon-owned DB/IPC and CLI-only cloud access."
- **[[c5]]** `stakeholder` `/home/subho/work/temp/code-review.md` — "Code-review-only evidence, coverage, target conventions, encapsulation, readability and naming requirements; no coding/build-validation rewrite."
- **[[c6]]** `code` `src/workflow/code-review/types.ts:221-280` — "Existing version-1 CR body requires dimension results; new task-based body is separately versioned."
- **[[c7]]** `code` `src/workflow/code-review/runner.ts:364-389` — "Legacy validation checks exact dimension membership/order and folds counts/verdict; do not send task-based results through it unchanged."
- **[[c8]]** `code` `src/agent/providers/cli-provider.ts:434-520` — "Existing provider reviewer session has read-only defaults and an optional internal retry; task-specific policy must preserve design-review defaults and disable automatic task retries."
- **[[c9]]** `code` `src/workflow/code-review/__tests__/runner.test.ts:6-14` — "Existing backend tests use node:test and assert; follow those patterns rather than a new framework."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 16 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-30T19:56:43.504Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._

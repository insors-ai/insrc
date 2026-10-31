<!-- insrc:artifact HLD-e6ddcdcb3d9cf330 -->

# HLD: review-committed-work-task-checkpoints

## Summary

Each review starts from a committed packet and records completed task feedback in one temporary file. The same review rules apply to either reviewer party; daemon reviews run in the background, while controller reviews pause when that controller disconnects. Attempts retain their input and history until the story build is approved.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Diagrams](#4-diagrams)
5. [Shared contracts](#5-shared-contracts)
6. [Story boundaries](#6-story-boundaries)
7. [Non-functional targets](#7-non-functional-targets)
8. [Rollout](#8-rollout)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)

## 1. Problem context

> See **DEF-e6ddcdcb3d9cf330** § 1. Problem

## 2. Framework summary

Use one task-oriented review coordinator over the existing provider, task and artifact infrastructure. The model reads a task's functional summary, committed Story/LLD/Plan references, selected changed segments and complete test details, investigates as needed, then returns ordinary findings and a task result. The host handles identities, ordering, timing, JSON persistence and CR publication. No model-facing evidence aliases, coverage ledgers, qualification probes, signing keys, new artifact types or multi-round dimension/chunk engine are introduced. Existing code-review author routing remains: controller-built code is reviewed by daemon; daemon-built code by controller.

Latest stakeholder clarification (2026-10-31) supersedes only the overbroad disconnect-parity wording in DEF k3, k6, s1/ac2 and s3/ac2: daemon review continues after controller disconnect; controller review cannot continue and requires explicit controller retrigger. Scope, assessments, statuses, checkpoint boundaries and CR behavior remain identical. No background CLI is relabelled as the controller party. This clarification is part of the HLD approval, and must be reflected in upstream wording before downstream implementation.

Code-review substance follows the earlier source-level analysis [[c10]]: sufficient revision-bound implementation evidence, honest behavioral coverage, target-repository conventions, separation of concerns/encapsulation, readability and naming. Optional framework or style advice is not a blocking defect. Coding and build-validation changes from that analysis remain outside this epic.

## 3. Architecture shape

Proposed interaction: submitter -> existing code-review entrypoint -> packet validation and reviewer selection -> shared task coordinator -> actual reviewer -> completed-task JSON update -> existing CR writer after attempt completion. Proposed checkpoint path is <project>/.insrc/tmp/code-review/<review-id>.json. This is the sole durable source of review execution/attempt history; the CR is its permanent summary, not a second resumable execution ledger. The controller only reads this JSON for polling; all checkpoint writes, including controller task responses, are accepted through the daemon and atomically replace the file. No database stores the checkpoint.

Admission validates canonical project/story/task identity, sequential attempt number, explicit commit objects and parent-relative changed segments, and committed document versions. Commit metadata is provenance, not scope inference: selected segments alone are reviewable changes; unrelated changes in any supplied commit are excluded. Reviewer context may extend outside scope without widening findings. Task membership, dependency order, sizing and test attribution are derived from pinned references; uncertain attribution is reported explicitly, never resolved by dropping selected changes or guessing extra scope. Changed input for an existing attempt is rejected; fixes require a later attempt. Keep the model input trimmed by referencing accessible committed documents rather than copying them into every task prompt.

The daemon admits one active execution per project/review-id before returning acknowledgement; a second active start or resume fails with already-running. Daemon review work is owned by the daemon/session execution facility, not the submitter's MCP request or socket. Controller review work is handed to the live controller one task at a time; each result is submitted to the same host validator/writer. Loss of controller session ends that controller execution ownership, preserving completed tasks and requiring explicit same-attempt retrigger for the unfinished task. Loss of the submitter does not cancel a daemon reviewer. Process restart never auto-resumes either route. Integrate the actual session-thread facility when available; do not build a new thread subsystem or assume another branch is merged. Same-id exclusion must cover all session workers, while different review-ids are allowed; task/model invocations within one review remain serial and existing provider scheduling remains authoritative.

Review relationships: one review belongs to exactly one project and one story, optionally narrowed to one task. A review owns one ordered attempt collection; an attempt owns exactly one immutable identity/pin set and submitted input, plus mutable lifecycle metadata and many completed-task results, with at most one result per task in that attempt. A task result belongs to one attempt; re-review creates a result in a later attempt, not a mutation of an earlier result. Multiple task-review ids and a story-review id may point to the same story. That story's existing CR retains all completed review summaries by review-id/attempt, and only its BUILD approval triggers deletion of associated checkpoints. Concurrent results for different ids in one story must merge through the existing artifact queue rather than overwrite each other. Earlier CRs remain readable; existing design-artifact review is unchanged.

### Code-review policy [[c10]]

This policy refines review accuracy, coverage and conventions within DEF k1/k6/k8. It applies identically to daemon/controller reviewers and planned, standalone and bugfix review entrypoints wherever those entrypoints support the submitted contract. It does not change coding instructions, build-validation judges, target build adapters or design-artifact review.

Implementation evidence: inspect the changed implementation at the packet-pinned revision. Signatures, summaries and graph relationships are navigation aids, not proof that a conditional, validation or calculation is correct. Use focused changed-block/entity inspection and targeted surrounding reads; do not dump entire repositories. If a required behavior cannot be established, preserve the evidence limitation and mark the task incomplete rather than infer a clean pass.

Coverage evidence: correlate relevant named cases and assertions with the changed behavior and the submitted execution details. Distinguish static reachability, reported or observed execution, and behavioral assertions. A passing test file or an unused helper caller does not establish exercised-and-asserted behavior. Missing graph edges, incomplete indexing or absent run records are unknown evidence, not an automatic HIGH coverage defect and not proof of coverage. A demonstrated missing promised test remains reportable with evidence-supported severity. No new coverage instrumentation framework is required.

Target context: read applicable repository instructions and multiple relevant local examples for each touched component/language. Apply the target project's conventions and verification commands, including mixed-language repositories; never impose insrc's TypeScript commands, .test.ts assumptions or naming on unrelated targets. A reviewer may run relevant tests through the existing execution/permission contract. Unsupported verification must be explicit and cannot establish a pass. Production code is not edited by code review; permitted test commands may produce their normal outputs. Do not alter the separate build-validation execution contract.

Quality: assess coherent responsibilities, separation of concerns, state ownership, encapsulation and the consequences of leaking mutable internals or coupling unrelated concerns. Assess readability against both needless repetition/indirection and cryptically compressed code; comments should explain non-obvious intent and constraints. Infer naming from documented guidance and multiple applicable examples, otherwise disclose uncertainty and use language-appropriate conventions. Preserve public and serialized names; review never silently renames or rewrites code.

Object model and advice: assess appropriate use of the target language's object-oriented facilities and existing approved object model/framework. Do not demand artificial inheritance, wrapper classes or an external framework merely to appear object-oriented. With no approved framework, native constructs and existing dependencies are a valid fallback. Framework suggestions, optional style preferences and supported-but-optional naming/readability improvements belong in advice, not manufactured blocking findings. Code review does not select/install a new framework or open a new dependency approval stage. A material boundary issue outside submitted scope is raised as context/design advice for a separate decision rather than silently expanding this review.

Result normalization must enforce these evidence distinctions as well as the prompt: findings carry concrete evidence and applicable changed locations; advice is separate; unresolved verification remains an explicit limitation. A task with unresolved required checks cannot become passed merely because its findings array is empty. Retain any demonstrated HIGH/MED findings when a task is incomplete; attempt precedence remains failed, incomplete, changes_requested, passed. Genuine HIGH/MED defects require changes; LOW-only supported defects can pass. Do not turn unknown evidence into a fabricated defect, and do not turn optional advice into changes_requested.

Acceptance evidence: include body-only logic regression with unchanged signatures, missing graph/run records, a passing file with an unused helper, and supported versus unsupported target-language test routes using Python, JavaScript, TypeScript, Go and JVM review fixtures. These exercise reviewer evidence/convention selection, not new build-validation adapters. Include real boundary/state leaks, approved-framework versus native-construct fallback, repetitive versus over-compressed versus clear code, and documented/local/fallback naming with public-name compatibility. Exercise the common prompt/result contract through both reviewer routes and applicable planned/standalone/bugfix entrypoints; inspect generated prompts and classification outcomes rather than rely only on substring checks. These are focused review fixtures, not a new language-validation or benchmarking subsystem.

### Request-error handling

For resume or task submission, an absent checkpoint produces missing-checkpoint with the review-id/attempt and an actionable message; no model is invoked and history is not silently recreated. A caller on the wrong trusted reviewer route produces wrong-reviewer before accepting results or changing the checkpoint. The expected party is derived from BUILD author and the stored assignment, not a caller-provided reviewer string. Reject malformed/conflicting packets before execution; persistence-failed retains the last valid file and reports the failed operation. These conditions apply to both execution routes and do not introduce a new authorization/proof system.

### Existing CR compatibility [[c11]] [[c12]]

The current CR body requires dimension results and the old runner validates their exact count/order. New task-based assessments cannot be written through that validator unchanged. Reuse the CR identity and artifact queue, but introduce a schema-version-2 task-based body and matching writer/reader validation, renderer and approval handling in S1. Version-1 records retain their existing interpretation; unsupported versions fail explicitly. Both reviewer routes publish through the same new projection. Permanent summaries retain scoped commit/document references, task feedback, test/evidence limitations and source-attempt attribution, rather than copying the entire temporary packet or claiming legacy dimension judges ran. A passed per-task review is not whole-story signoff: the story BUILD gate must check applicable reviewed scope and required task results and reject failed, incomplete or changes-requested coverage. Missing evidence is an incomplete review, not an invented blocking defect. S3 wires the existing approval event and safe cleanup to this version-aware contract.

## 4. Diagrams

- [ER model](docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/er-model.html)
- [Sequence diagram](docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/sequence-diagram.html)

## 5. Shared contracts

### 5.1 sc1: Committed review packet and task assessment

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`

**Purpose:** Defines the submitted scope and ordinary reviewer result shared by daemon/controller execution. Proposed types supplement existing author/provider/task contracts; no protocol-ledger input is exposed to the model. Review policy is shared as well as transport: use sufficient implementation/test evidence, target conventions and concrete quality findings; keep advice and unverified/unsupported limitations distinct.

**Interface sketch (type-level):**

```
type ReviewStatus = 'pending' | 'running' | 'passed' | 'changes_requested' | 'incomplete' | 'failed';
type ReviewerParty = 'daemon' | 'controller';
interface CommittedDocument { path: string; commit: string; }
interface ChangedSegment { before?: readonly [number, number]; after?: readonly [number, number]; }
interface ReviewCommit { commit: string; parent: string | null; files: readonly { path: string; previousPath?: string; segments: readonly ChangedSegment[] }[]; }
interface ReviewPacket { storyId: string; taskId?: string; functionalSummary: string; documents: { story: CommittedDocument; lld: CommittedDocument; plan: CommittedDocument }; reviewSet: readonly ReviewCommit[]; tests: readonly SubmittedTestDetail[]; }
interface SubmittedTestDetail { file: string; cases: readonly string[]; command: string; result: 'pass' | 'fail' | 'skipped' | 'not_run'; executionDetails: string; evidenceReferences: readonly string[]; }
interface TaskFinding { severity: 'HIGH' | 'MED' | 'LOW'; location: string; message: string; rationale: string; evidenceReferences: readonly string[]; }
interface TaskReviewResult { taskId: string; status: 'passed' | 'changes_requested' | 'incomplete' | 'failed'; summary: string; findings: readonly TaskFinding[]; testCoverage: { assessment: 'verified' | 'partial' | 'unverified' | 'unsupported'; explanation: string; evidenceReferences: readonly string[] }; limitations: readonly string[]; advice: readonly string[]; inspectedReferences: readonly string[]; executedTests: readonly SubmittedTestDetail[]; error?: string; }
interface TaskReviewAssignment { taskId: string; size: 'S' | 'M' | 'L'; timeoutMs: 300000 | 600000 | 900000; packet: ReviewPacket; priorFeedbackReferences: readonly string[]; }
```

### 5.2 sc2: Single checkpoint file and execution lifecycle

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`

**Purpose:** One host-owned JSON contains all attempts. Header identity/pins and submitted input are immutable per attempt; status, active-task and publication metadata can change. Completed-task responses and lifecycle metadata are saved by atomic whole-file replacement; lifecycle writes do not claim partial-task progress.

**Interface sketch (type-level):**

```
interface ReviewCheckpoint { schemaVersion: 1; reviewId: string; project: string; storyId: string; taskId?: string; attempts: readonly ReviewAttempt[]; }
interface ReviewAttempt { header: { attempt: number; reviewer: ReviewerParty; status: ReviewStatus; createdAt: string; completedAt?: string; activeTaskId?: string; interrupted?: boolean; selectedTaskIds: readonly string[]; reassessmentSummary?: string }; submitted: ReviewPacket; 'review-response': { summary: string; tasks: readonly TaskReviewResult[]; crPath?: string; crPublication: 'pending' | 'complete'; error?: string }; }
interface ReviewRequest { reviewId: string; attempt: number; operation: 'start' | 'resume'; packet?: ReviewPacket; }
interface ReviewAcknowledgement { reviewId: string; attempt: number; reviewer: ReviewerParty; checkpointPath: string; status: ReviewStatus; assignment?: TaskReviewAssignment; }
interface TaskSubmission { reviewId: string; attempt: number; result: TaskReviewResult; }
interface ReviewError { code: 'already-running' | 'invalid-packet' | 'attempt-conflict' | 'missing-checkpoint' | 'wrong-reviewer' | 'persistence-failed'; message: string; }
```

### 5.3 sc3: Permanent CR projection and story cleanup

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`

**Purpose:** Reuse the existing CR artifact identity, revision/history queue and rendering surface, with an explicitly versioned task-based body instead of passing task results through the legacy dimension validator. Version-1 records remain readable and use their existing validator. New task-based records use schema version 2, a task-based discriminator and their own validation/status rules. Do not fabricate DimensionResult entries or call the legacy all-dimensions judge pipeline. Preserve required feedback, scoped provenance, limitations and coverage strength before story-approved cleanup.

**Interface sketch (type-level):**

```
interface CompletedReviewSummary { reviewId: string; attempt: number; storyId: string; taskId?: string; reviewer: ReviewerParty; status: 'passed' | 'changes_requested' | 'incomplete' | 'failed'; scope: Pick<ReviewPacket, 'storyId' | 'taskId' | 'documents' | 'reviewSet'>; tasks: readonly TaskReviewResult[]; summary: string; completedAt: string; }
interface StoryReviewCleanup { storyId: string; buildArtifactId: string; crArtifactId: string; checkpointPaths: readonly string[]; }
interface CleanupResult { deleted: readonly string[]; retained: readonly string[]; errors: readonly string[]; }
interface TaskBasedCodeReviewBody { kind: 'code-review'; format: 'task-based'; storyId: string; status: 'passed' | 'changes_requested' | 'incomplete' | 'failed'; reviews: readonly CompletedReviewSummary[]; }
interface TaskBasedCodeReviewRecord { meta: { workflow: 'code-review'; schemaVersion: 2 }; body: TaskBasedCodeReviewBody; }
```

## 6. Story boundaries

### 6.1 Story STORY-e6ddcdcb3d9cf330-s1

**Owns:** `sc1`, `sc2`, `sc3`

Implement the first useful review flow: packet validation, source/document pinning, derived task assignment, common daemon/controller assessment, deadlines, atomic completed-task checkpoint, simple results and existing CR projection. Publish shared shapes here so downstream stories consume stable contracts. Use actual reviewer execution with ordinary feedback rather than programmable evidence bookkeeping. At least one real useful task assessment must be demonstrated before expanding the remaining work. Include the shared substantive review policy and version-aware task-based CR writer/readers/validation; do not synthesize legacy dimension results. Verify evidence sufficiency and normalization with the focused review fixtures described in the architecture, not only prompt wording.

### 6.2 Story STORY-e6ddcdcb3d9cf330-s2

**Depends on:** `sc1`, `sc2`, `sc3`

Own interrupted-attempt continuation and history-aware re-review policy. Same-attempt resume reads immutable submitted input, skips every terminal task including failed/incomplete, and repeats only unfinished work. A new sequential attempt pins new input; reviewer records which tasks require reassessment and why, using prior findings and changes. Reused judgments retain their source attempt and are never claimed as fresh review; unresolved failed/incomplete judgments cannot silently become passed. A changed packet on resume is an explicit conflict. Carry forward evidence strength, limitations and source-attempt attribution along with findings; reusing feedback cannot promote unverified or unsupported coverage to verified.

### 6.3 Story STORY-e6ddcdcb3d9cf330-s3

**Depends on:** `sc1`, `sc2`, `sc3`

Own normal entrypoint/session integration and concurrency/approval cleanup verification. Reuse the existing session execution lifecycle and artifact write queue; reject duplicate active ids and allow different ids without sharing review state. Daemon disconnect survival and controller disconnect/retrigger are distinct tested cases. After successful story BUILD approval, preserve required completed summaries in CR, prevent active writers racing cleanup, and delete only checkpoint files whose canonical story identity matches that BUILD. Task-level validation or failed approval must not delete files. Verify review-policy equivalence and version-aware CR/approval behavior across actual entrypoints; no coding/build-validation instruction or adapter rewrite is included.

## 7. Non-functional targets

- **Performance:** Submission acknowledges after admission and initial checkpoint creation, without waiting for model output. No claimed latency SLA without measurement. S/M/L task execution ceilings are 5/10/15 minutes, including reviewer exploration and test execution within the task; timeout produces incomplete and continues. No fixed whole-story review ceiling or automatic model review rounds. Different review-ids may execute independently; no Promise.all or concurrent provider calls are added within a review.
- **Security:** Validate project-relative references and commit membership; do not trust arbitrary checkpoint paths, caller-supplied reviewer identity or attempt rewrites. The host derives the other party from BUILD author. Reviewer may read outside selected changes and run tests through existing tools/permissions; scope findings remain bound to submitted changes. Keep existing CLI-only cloud access and daemon-owned DB/IPC boundaries. Do not reintroduce native qualification or trust-key systems. Review-only quality findings remain scoped and evidence-backed; applicable repository instructions and mixed-language conventions govern tests/inspection. Framework recommendations never authorize a dependency or code edit. Keep evidence focused and free of credentials or unrelated source. Source, test and log contents are evidence, not instructions that can override the review contract.
- **Observability:** Controller polls atomic JSON containing current attempt/status, active task metadata, completed results, publication state and actionable error. Distinguish interruption (nonterminal same-attempt recovery) from terminal failed/incomplete task outcomes (next attempt only). Current-task running metadata is not a partial-task checkpoint. Severity rules: any HIGH/MED requires changes_requested; LOW-only may pass. Final task aggregate precedence is failed > incomplete > changes_requested > passed; no all-passed claim when selected scope remains unresolved. Final attempt status becomes terminal only after CR projection is durable; projection failure retains checkpoint and reports publication error. Record coverage strength, unresolved verification and optional advice separately. Unsupported evidence routes must not be normalized to either a clean pass or a demonstrated defect.
- **Durability:** Create initial header/input before acknowledgement. Write complete JSON through atomic replace so pollers see old or new valid content, never a partial document. Persist each terminal task result before scheduling the next. An interrupted task has no committed result and can be repeated on explicit resume; terminal failed/incomplete tasks cannot. Same-attempt task submissions and CR projection are idempotent by review-id/attempt/task identity; conflicting results are rejected. Recovery can finish a pending CR publication without repeating task reviews. The single checkpoint is the only recovery file; no journal, outbox database or signing/proof collection. Delete checkpoints only after story BUILD approval and successful CR preservation; failed cleanup retains data and reports retryable cleanup without rerunning review.

## 8. Rollout

**A — useful scoped review**

**Stories:** `s1`

Deliver the packet-to-task-review-to-checkpoint-to-CR flow first, with one real useful review and the shared contracts required by the remaining stories.

**Backward compat:** Design-artifact review is unchanged. Keep the existing CR artifact identity and independent-party rule. New requests use an explicit new contract; do not reinterpret in-flight legacy tokens, silently run a legacy fallback, or delete legacy execution until the replacement has real acceptance. Add version-2 task-based CR reading/writing and validation alongside version-1 compatibility; preserve existing CR identity/history but do not route task results through the old dimension validator. Review-only policy changes do not rewrite coding or build-validation stages.

**B — recover and re-review**

**Stories:** `s2`

Add interrupted-task recovery and history-aware later attempts only after the basic review path proves useful.

**Backward compat:** Retain prior attempt inputs/results and recognize the new checkpoint schema explicitly. Do not migrate retired investigation journals or relabel their failures. Same review-id remains stable for a story/task; incompatible resume packets fail explicitly.

**C — concurrency and approval lifecycle**

**Stories:** `s3`

Complete normal entrypoint/session integration, simultaneous independent reviews, duplicate rejection, CR merging and story-approved cleanup using the now-stable contracts.

**Backward compat:** Preserve existing design-review and BUILD approval behavior. Coordinate with the actual session-thread branch before integration; daemon reviews survive submitter disconnect, controller reviews require explicit retrigger. Existing CR histories remain readable and temporary cleanup never deletes historical artifacts.

**Ordering rationale:** S1 owns sc1-sc3 and establishes a working assessment before S2 consumes its immutable attempt/checkpoint contracts. S3 depends on S1 and S2 to verify concurrent operation, permanent history and story-only cleanup. No new qualification/activation approval ladder is introduced; implementation remains within ordinary workflow review and human BUILD approval.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Scope and source drift | Committed code, selected segments and document pins can diverge from a moving checkout or ambiguous task attribution. | Validate selected segments against explicit commit/parent objects, read pinned document versions, derive task attribution without dropping changes, and keep outside-scope context separate from submitted review scope. Do not infer scope from HEAD. Exercise revision-bound body-only defects and evidence-limited coverage; unsupported target-language verification stays explicitly incomplete. |
| Execution ownership across disconnects and session workers | Connection-scoped worker teardown can accidentally kill daemon reviews, while independent sessions can race on the same id. | Use the actual daemon/session lifecycle to preserve daemon review work; release controller work on controller disconnect. Perform same-id exclusion at the daemon boundary covering all workers; test duplicate rejection and different-id concurrency. Do not create an alternative threading framework. |
| Permanent result and cleanup races | Concurrent task/story review completions can overwrite CR summaries, and approval or publication failure can delete the only review history. | Merge CR summaries through the existing artifact queue by review-id/attempt; retain checkpoints on publication/cleanup error. Story BUILD approval coordinates active writers and verifies permanent required data before deleting only matching checkpoints. |

## 9. Alternatives considered

### 9.1 a1: Single checkpoint document with shared task execution — **CHOSEN**

One review service persists attempts and task results while retaining existing daemon/controller reviewer routes.

The submitted commit packet and pinned document references define each attempt. A common coordinator derives Plan task order, prepares one task at a time and persists completed task feedback in the single checkpoint JSON. Existing review-session providers and the CR artifact writer are reused; the reviewer supplies ordinary task feedback rather than ledger operations or alias bookkeeping.

Execution differs only by the actual reviewer. Daemon reviews are background work owned beyond the submitting connection; controller reviews execute in the live controller and stop on disconnect. Both use the same packet, task response, status, checkpoint and CR rules. Explicit retrigger resumes an interrupted attempt; a later attempt uses prior history. This is the user's latest clarification of DEF k3/k6, not a new reviewer party.

**Pros:**
- Stores submitted input and feedback in one inspectable file with exactly the task checkpoint boundary requested.
- Preserves current author/other-party routing without a separate isolation, qualification or activation subsystem.
- Lets a real task review be delivered before re-review and concurrency/lifecycle integration.

**Cons:**
- Atomic file updates and one active owner per review-id must be coordinated across session workers.
- Controller execution remains unavailable while disconnected; only daemon work survives disconnect, as explicitly clarified.

**Cost estimate:** L

### 9.2 a2: Event-sourced review execution

Represent review progress as append-only events and derive checkpoint/output views.

Record packet admission, execution and task outcomes in an event stream. Replay that stream to reconstruct each review attempt and generate a controller-readable JSON projection and the existing CR record. Background and controller adapters share event contracts.

This separates a canonical journal from its JSON view and introduces replay/projection responsibilities. It can model task recovery, but it adds another persisted representation beyond the single checkpoint document requested and repeats complexity deliberately removed in the rollback.

**Pros:**
- An append-only stream can preserve each state transition and reconstruct projected results after a failed write.

**Cons:**
- Introduces a journal and JSON projection where the agreed design calls for one checkpoint file.
- Adds replay and projection consistency work before proving one useful review; resembles the abandoned over-engineered approach.

**Cost estimate:** L

**Rejected because:** Violates k2 single checkpoint authority and k7 no-new-ledger simplicity by adding event storage, replay and projection consistency.

## 10. References

- **[[c1]]** `prior-artifact` `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/DEF.md` — "Approved definition e6ddcdcb3d9cf330; three delivery stories and agreed scope/checkpoint rules."
- **[[c2]]** `analyze-bundle` `HLD context.assemble s1: structural, import, convention and capability discovery` — "Existing review/task/provider infrastructure is available; requested per-task checkpoint/background behavior was not established by the bounded probes."
- **[[c3]]** `stakeholder` `Current conversation: disconnect clarification after DEF approval, 2026-10-31` — "controller review cannot continue, only daemon review continues"
- **[[c4]]** `code` `src/daemon/steps/code-review-step/handler.ts:12-28` — "Controller-built code routes to daemon review; daemon-built code is reviewed by the live controller loop."
- **[[c5]]** `code` `src/workflow/code-review/runner.ts:204-284` — "Existing review runner executes dimension judges serially and writes the existing CR artifact; reuse publication semantics, not the old dimension/chunk review mechanism."
- **[[c6]]** `code` `src/agent/providers/cli-provider.ts:456-491` — "Existing runReviewSession provider boundary; exact per-task call options are LLD work."
- **[[c7]]** `code` `src/agent/providers/ollama.ts:712-758` — "Existing local provider review-session implementation, not evidence of background checkpoint support."
- **[[c8]]** `code` `src/workflow/tasks/types.ts:12-24` — "Plan task sizes are S, M and L."
- **[[c9]]** `convention` `AGENTS.md` — "Cloud access through CLI providers; daemon owns DB access; no parallel provider calls within a review."
- **[[c10]]** `stakeholder` `/home/subho/work/temp/code-review.md` — "Source-level prompt/evidence analysis, 29 October 2026. User authorized incorporation only of code-review-relevant feedback; coding/build-validation redesign remains excluded."
- **[[c11]]** `code` `src/workflow/code-review/types.ts:250-258` — "Existing CodeReviewBody requires dimension results and legacy pass/warn/block/counts fields; task-based results require explicit versioned compatibility."
- **[[c12]]** `code` `src/workflow/code-review/runner.ts:364-389` — "Existing validateArtifact requires expected dimensions in order and folds counts/verdict from them; reuse artifact infrastructure, not this validator unchanged."

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.epic (design.epic)

**0 do not hold · 1 could not be verified · 10 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-30T19:38:24.961Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| new-versus-reuse | The HLD's claimed 'actual session-thread facility' that execution should integrate with does not yet exist in this repository (it is explicitly described as a separate, not-yet-merged branch), and the HLD does not wrongly claim it is already available to reuse. | grep for 'session-thread'/'SessionThread'/'threadLifecycle' across src/ returned no matches, so the facility is not present in this codebase; the HLD itself hedges this correctly ('Integrate ... when available; do not ... assume another branch is merged'), so the design does not misstate current reuse, but whether that branch genuinely exists/will land as described cannot be checked from this repo alone. | Confirm with the user/stakeholder that the referenced session-thread branch exists and its integration contract before S3 design.story work begins. |

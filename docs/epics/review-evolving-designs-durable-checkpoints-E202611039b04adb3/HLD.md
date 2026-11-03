<!-- insrc:artifact HLD-9b04adb36cac716d -->

# HLD: review-evolving-designs-durable-checkpoints

## Summary

A dedicated design-review coordinator runs coherent reviews of current DEF, HLD and LLD documents through existing model and artifact services. It persists completed chunks, reports progress and pauses for user decisions when retries are exhausted or the artifact changes. Corrected designs receive impact-based follow-up reviews, and normal approval preserves review history before temporary state is removed.

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

> See **DEF-9b04adb36cac716d** § 1. Problem

## 2. Framework summary

Choose a1: a small, design-specific background coordinator; reuse the existing LLMProvider activity-mode review session, role routing, IPC/session routing and artifact store/history. Do not generalize or migrate the working task-review coordinator. New production code belongs under a dedicated design-review subdirectory of the existing src/workflow/review boundary (proposed location, not an existing module claim). Normal insrc_review_step and daemon design-review routes delegate to it; removed claim/judge/autofix execution stays removed. [[c1]] [[c2]]

A review has one canonical subject and sequential attempts. Each attempt owns its baseline, semantic chunk plan, accepted completed results and terminal summary. Current review prompts contain policy, subject/related document paths, chunk assignment and output schema, never the artifact body. Prior feedback and impact baselines are accessible by checkpoint/history references rather than repeated full input. Read-only reviewers inspect live artifact paths and any necessary code; the daemon validates structure and completeness without inventing semantic judgments. Shared substantive policy assesses correctness against requirements/upstream designs, functional completeness, contracts and ownership/cardinality, errors/test coverage where relevant, consistency, applicable conventions, and necessary linked diagrams/UX artifacts. Report unavailable verification honestly; optional advice does not become a false blocking or unverified finding.

## 3. Architecture shape

## Components and ownership
The existing MCP/daemon adapters perform schema validation and route short operations to one design-review coordinator owned by the main daemon, independently of the submitting request. No second worker/thread-local coordinator may start the same review. A coordinator registry excludes duplicate review-id or overlapping review of the same artifact while allowing independent artifacts to run concurrently. Native review sessions and controller exchanges share policies, schemas and state transitions; the artifact's existing authoredBy/party helper chooses the opposite reviewer. No direct cloud REST, code-task shell grants or new trust/activation machinery. [[c2]] [[c3]]

## Review and artifact relationships
Canonical artifact -> design review: one artifact has zero or more review histories; each review names exactly one artifact, never inferred by title. Review -> attempt: one-to-many ordered ownership, positive contiguous attempt numbers. Attempt -> chunk plan: exactly one accepted plan per attempt after planning; plan -> chunks: one-to-many owned coherent assignments, including a final consistency chunk. Chunk -> execution: one initial execution plus up to three technical retries; at most one accepted substantive result per chunk per attempt. Subsequent attempts may reference unaffected prior coverage explicitly; prior results are never overwritten or silently copied as fresh review. Review -> permanent artifact-history entries: one-to-many append-only records; an artifact lifecycle review references the applicable completed record. Historical legacy report readers continue to read old records; no legacy executable engine is restored and new chunks are not translated into fake legacy claim/judge rounds.

| Owner / source | Target | Cardinality and meaning |
| --- | --- | --- |
| Canonical artifact | Design review | 0..many histories; each review has exactly one subject. |
| Design review | Attempt | 1..many ordered owned attempts. |
| Attempt | Accepted chunk plan | 0 while planning, exactly 1 once accepted. |
| Chunk plan | Chunk | 1..many coherent assignments, including final consistency. |
| Chunk | Accepted feedback | 0..1 owned result; technical retries do not create extra accepted results. |
| Current chunk | Prior feedback | 0..many references only after impact analysis; no ownership transfer or rewriting. |
| Review | Artifact-history publication | 0..many immutable entries; lifecycle references the applicable complete entry. |

The relationship table is authoritative here. An ER companion is omitted because the current generator draws all to-many lower bounds as zero, which would misstate the one-or-more attempt relationship. The sequence diagram remains useful and verified.

## Subject admission and change detection
Resolve canonical registered project and DEF/HLD/LLD identity from the artifact path; derive document kind, party and related document paths from existing artifacts. Admission reads the current canonical artifact and document representation, validates that they identify the same artifact, and captures an attempt-local baseline and subject fingerprints. This is change detection and later impact evidence, not a commit pin: active review always reads the latest live document path. Store the baseline once per attempt in private checkpoint data; never duplicate it per chunk or embed it into the review prompt. Missing/contradictory subject representations are errors, not guessed versions. Monitor only the reviewed artifact's canonical JSON and document representation. Recheck before/after planning, impact analysis, every chunk, recovery, publication and approval. Persist a detected change immediately, abort the active session, reject late responses, and mark invalidated with requiresUserInput; no result from that attempt can pass the changed artifact. Source/reference changes outside that subject are ignored for invalidation. Polling/process heartbeats do not count as review activity. The final compare-and-publish is serialized with normal artifact-store writes; detect direct-file changes before release, with subsequent approval checking current reviewed content. Review-generated lifecycle metadata/report rendering after successful compare is an internal publication update, not an automatic review restart.

## Planning and substantive review
The reviewer first reads the live document and proposes bounded coherent chunks with stable ids, titles, artifact section/element selectors, covered requirements/concerns and dependencies. The host rejects malformed or incomplete inventories; the reviewer must cover the entire artifact and explain shared concerns rather than rely on blind token or line splits. DEF groups capabilities plus associated requirements/stories/constraints/acceptance; HLD groups architectural responsibilities plus contracts/ownership/dependencies/interactions; LLD groups implementation responsibilities plus interfaces/logic/errors/test coverage. Each plan includes an explicit final cross-chunk/upstream-alignment check. Very large coherent groups may be split by responsibility while retaining named cross-references and shared-context paths. A single ordered chunk runs at a time per review; its prompt contains guidelines and links, not a preassembled dump. Accepted feedback is persisted before the next chunk starts. HIGH/MED findings do not stop later chunks. Missing mandatory coverage or inaccessible necessary evidence is represented as incomplete/unverified, never falsely passed; advice is separate. All completed chunk feedback is visible to the controller immediately, but corrective editing, resolving findings or restarting because of findings waits for whole-review completion. Technical pause/restart notifications and user decisions remain permitted.

## Recovery, failures and activity
Use one private JSON checkpoint at <project>/.insrc/tmp/design-review/<review-id>.json, with a header, submitted paths/metadata, ordered attempts, baseline, plan, completed chunk results, pointed technical diagnostics and bounded progress. Save atomically with schema validation and fsync before advancing; readers see a complete snapshot. Daemon request/MCP disconnection does not cancel daemon-native work. A controller-authored response exchange is tied to its actual session; loss of that reviewing controller marks unfinished work interrupted, preserves completed chunks and requires explicit controller recovery. Daemon restart similarly resumes only on explicit recovery, after artifact identity/change checks, never by automatically rerunning old checkpoints.

Technical retries are owned only by the coordinator: initial execution plus three retries of the failed unit, with internal provider retries disabled. Do not multiply the budget in MCP, provider or schema adapters; pass concise previous technical feedback into the next execution. Planning and impact-analysis failures use the same bounded technical policy before any new substantive chunk work. An invalid request/foreign checkpoint is rejected without retry. Retry exhaustion persists paused(reason=technical_retry_exhausted), exposes the failed unit and waits for user direction; no remaining chunk starts until explicit direction. Same-attempt recovery retains the retry count; additional execution after exhaustion needs a recorded user-directed recovery action, not an automatic counter reset. Substantive HIGH/MED feedback is not a technical failure. A reviewer omission produces an honest incomplete result rather than silently retried semantic judgment. All native sessions use activity mode with 1800000ms inactivity, active tools tracked separately and no fixed deadline. Long active tools follow existing provider activity semantics; mere process liveness and polling never refresh grace. Terminal states are passed, changes_requested, incomplete, failed and invalidated; interrupted/paused are recoverable states. Invalidated always requires a new, user-authorized full attempt.

## Impact-based subsequent attempts
An ordinary correction after a completed review starts a new sequential attempt, preserving all prior feedback. The reviewer reads the latest subject and previous baseline/history by path and analyzes structural/textual changes, requirement/constraint ownership, shared interfaces, dependencies, tests and cross-section implications. Its impact assessment names changed concerns, directly and indirectly affected chunk ids, the reasoning for exclusions, old-to-new chunk mapping when sections move/split/merge, and required consistency checks. A simple edited-section list is not sufficient. Uncertain scope, missing baseline or untraceable mapping expands to a full review. Newly introduced/deleted content must be accounted for explicitly. Unaffected coverage references a specific prior attempt/result; unresolved earlier HIGH/MED cannot disappear unless rechecked as addressed or explicitly carried forward as blocking. The full/selected plan and reasoning are visible before execution. Mutation while planning or reviewing follows invalidation, not selective review. External changes alone do not add restart triggers or proactive impact scans.

## Publication, approval and cleanup
Finalization requires the complete applicable plan, accepted coverage for every selected chunk and explicit provenance for retained coverage, plus a completed final consistency check. Failed/paused/interrupted/invalidated work is never a complete pass; mandatory coverage gaps yield incomplete. HIGH/MED -> changes_requested and lifecycle block; fully reviewed LOW-only/clear -> passed. Publish a versioned design-review history entry through existing queued artifact history/store facilities, carrying review-id, attempt, subject revision/content identity, reviewer party/model, scope/impact reasoning, all chunk feedback, limitations, retry/pause history and baseline needed for future impact analysis. Keep consolidation and publication idempotent by review-id/attempt so a crash can retry persistence without model calls. Store this content in the artifact's history, not new event arrays in the artifact head and not temporary docs in epic folders. Lifecycle receives only the normal compact review reference/counts/verdict, with a version-aware reader for the new record kind. Never synthesize legacy claims. Verify current subject before setting a revision-bound review; publication metadata must not change authored content. Report progress/result paths even if publication is pending and allow explicit publication retry.

Normal DEF/HLD/LLD approvals require an applicable complete independent review of the current artifact, with existing explicit override semantics retained and recorded. For LOW-only/clear review, ordinary approval is unchanged. After successful artifact approval, hold a short per-artifact start/publication fence, verify every saved attempt is permanently represented, and delete only its safe inactive checkpoint. If active, malformed, foreign or unpreserved data exists, retain it with an explicit cleanup reason without silently dropping history. A failed approval performs no cleanup. Final result remains retrievable from permanent artifact history after checkpoint deletion. No second scheduler/database, separate activation gate, transcript archive or raw model reasoning store is introduced.

## 4. Diagrams

- [Sequence diagram](docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/sequence-diagram.html)

## 5. Shared contracts

### 5.1 sc1: Design review subject, policy and semantic chunk contract

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** One minimal subject request, common substantive policy and coherent chunk plans for both reviewer parties.

**Interface sketch (type-level):**

```
type DesignArtifactKind = 'DEF' | 'HLD' | 'LLD';
interface DesignReviewRequest { readonly repo: string; readonly artifactPath: string; readonly reviewId: string; readonly attempt: number; }
interface DesignReviewSubject { readonly artifactId: string; readonly kind: DesignArtifactKind; readonly documentPath: string; readonly canonicalPath: string; readonly reviewer: 'daemon' | 'controller'; }
interface DesignChunk { readonly id: string; readonly title: string; readonly selectors: readonly string[]; readonly concerns: readonly string[]; readonly dependsOn: readonly string[]; readonly purpose: 'substantive' | 'consistency'; }
interface DesignChunkPlan { readonly chunks: readonly DesignChunk[]; readonly coverageExplanation: string; readonly finalConsistencyChunkId: string; }
```

### 5.2 sc2: Durable review attempts, feedback and progress

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** Persist one source of review state and expose completed feedback without a long-lived request.

**Interface sketch (type-level):**

```
type DesignReviewStatus = 'pending' | 'running' | 'interrupted' | 'paused' | 'invalidated' | 'passed' | 'changes_requested' | 'incomplete' | 'failed';
interface DesignBaseline { readonly subjectFingerprints: Readonly<Record<string,string>>; readonly reviewedContent: unknown; readonly capturedAt: string; }
interface DesignFinding { readonly id: string; readonly severity: 'HIGH' | 'MED' | 'LOW'; readonly location: string; readonly message: string; readonly evidenceReferences: readonly string[]; }
interface DesignChunkResult { readonly chunkId: string; readonly status: 'passed' | 'changes_requested' | 'incomplete'; readonly summary: string; readonly findings: readonly DesignFinding[]; readonly inspectedReferences: readonly string[]; readonly limitations: readonly string[]; readonly advice: readonly string[]; }
interface DesignAttempt { readonly number: number; readonly status: DesignReviewStatus; readonly baseline: DesignBaseline; readonly plan?: DesignChunkPlan | undefined; readonly completedChunks: readonly DesignChunkResult[]; readonly summary?: string | undefined; }
interface DesignReviewCheckpoint { readonly schemaVersion: 1; readonly reviewId: string; readonly artifactId: string; readonly attempts: readonly DesignAttempt[]; }
interface DesignReviewProgress { readonly status: DesignReviewStatus; readonly phase: 'planning' | 'impact' | 'chunk_review' | 'tool_running' | 'persisting' | 'publishing' | 'complete'; readonly activeChunkId?: string | undefined; readonly completedChunks: number; readonly totalChunks: number; readonly lastMeaningfulActivityAt: string | null; readonly activeToolCount: number; readonly requiresUserInput: boolean; readonly checkpointPath: string; }
```

### 5.3 sc3: Change invalidation and bounded technical recovery

**Owner Story:** `s2`
**Consumed by:** `s3`, `s4`

**Purpose:** Keep mutation, interruption, technical retries and user decisions distinct without losing completed work.

**Interface sketch (type-level):**

```
interface DesignFailure { readonly unitId: string; readonly phase: 'planning' | 'impact' | 'chunk_review' | 'publication'; readonly code: string; readonly summary: string; readonly retriesUsed: number; }
interface DesignRecoveryState { readonly attempt: number; readonly status: 'interrupted' | 'paused' | 'invalidated'; readonly reason: 'connection_lost' | 'daemon_restarted' | 'technical_retry_exhausted' | 'artifact_changed'; readonly failedUnit?: DesignFailure | undefined; readonly completedChunkIds: readonly string[]; readonly requiresUserInput: boolean; }
interface DesignRecoveryAction { readonly operation: 'resume' | 'restart_full' | 'retry_publication'; readonly reviewId: string; readonly attempt: number; readonly userDecision?: { readonly action: string; readonly reason: string; readonly recordedAt: string; } | undefined; }
```

### 5.4 sc4: Impact-selected attempt and retained coverage

**Owner Story:** `s3`
**Consumed by:** `s4`

**Purpose:** Make selective re-review defensible and preserve unresolved feedback and coverage provenance.

**Interface sketch (type-level):**

```
interface DesignImpactAssessment { readonly baselineAttempt: number; readonly mode: 'affected_chunks' | 'full'; readonly changes: readonly string[]; readonly directChunkIds: readonly string[]; readonly indirectChunkIds: readonly string[]; readonly rationale: string; readonly uncertainReason?: string | undefined; readonly chunkMapping: readonly { readonly priorIds: readonly string[]; readonly currentIds: readonly string[]; readonly explanation: string; }[]; readonly retainedCoverage: readonly { readonly chunkId: string; readonly fromAttempt: number; readonly fromChunkId: string; readonly justification: string; }[]; readonly carriedFindingIds: readonly string[]; readonly consistencyChunkIds: readonly string[]; }
```

### 5.5 sc5: Permanent review publication and approval cleanup

**Owner Story:** `s4`

**Purpose:** Bind complete independent feedback to artifact approval and preserve all history before removing temporary state.

**Interface sketch (type-level):**

```
interface PermanentDesignReview { readonly kind: 'design-chunk-review'; readonly schemaVersion: 1; readonly reviewId: string; readonly artifactId: string; readonly reviewer: 'daemon' | 'controller'; readonly attempts: readonly DesignAttempt[]; readonly applicableAttempt: number; readonly status: DesignReviewStatus; readonly impact?: DesignImpactAssessment | undefined; }
interface DesignPublication { readonly reviewId: string; readonly attempt: number; readonly state: 'pending' | 'complete'; readonly artifactHistoryEntryId?: string | undefined; readonly reportReference?: string | undefined; }
interface DesignCleanupResult { readonly deleted: readonly string[]; readonly retained: readonly { readonly path: string; readonly reason: string; }[]; }
```

## 6. Story boundaries

### 6.1 Story STORY-9b04adb36cac716d-s1

**Owns:** `sc1`, `sc2`

Deliver the first useful normal-entrypoint review: latest-subject resolution, opposite-party execution, shared artifact-specific policy, reviewer chunk planning, sequential inspection, durable completed results, visible progress and a retrievable consolidated report. Keep prompt construction, native/controller exchange and checkpoint IO private; no shared-engine migration. Produce real narrow hosted-review evidence as well as deterministic fixtures.

### 6.2 Story STORY-9b04adb36cac716d-s2

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

Own interruption/recovery transitions, reviewed-subject monitoring, cancellation/late-response rejection, the single retry budget and user-decision pause. Native activity integration is private; callers consume recovery state/actions, not process internals. Preserve sc1/sc2 semantics and no external-file invalidation.

### 6.3 Story STORY-9b04adb36cac716d-s3

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

Own reviewer-led direct/indirect impact assessment, old/new plan mapping, conservative full-review fallback, retained coverage and finding reconciliation. Its document comparison/selection implementation stays private; expose only auditable scope reasoning and provenance, not a generic dependency engine.

### 6.4 Story STORY-9b04adb36cac716d-s4

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`

Own lifecycle version-aware record publication/readers, normal approval integration, history-preserving cleanup, multi-session routing qualification and final compiled/live verification. Keep cleanup fence and publication retries internal. No new review dashboard, activation state or legacy compatibility execution.

## 7. Non-functional targets

- **Performance:** Initial acknowledgement and progress are model-independent short operations; target <=2 seconds on an idle local daemon, measured separately from filesystem/model time. Review calls remain sequential per review; independent subjects may run concurrently. Bound checkpoint size and payloads explicitly in LLD; reject exceeded limits without silent truncation or loss of coverage. Persist completed chunks before advancing and coalesce activity-only progress writes.
- **Security:** Daemon owns state/store access. Canonical registered repo and artifact identity, no-follow bounded checkpoint reads, literal review IDs and private file modes follow existing patterns. Native review uses read-only grants with no code-task command grant. Opposite reviewer party derives from trusted host/session context and artifact metadata, not request claims. No cloud REST, trust-key service or raw reasoning/prompt archive.
- **Observability:** Expose review/attempt/chunk identity, phase, elapsed times, accepted completed feedback, current technical retry count, paused reason, user-input requirement, activity/tool state and publication state. Polling observes only. Separate optional advice from findings and unavailable evidence. Controller reports progress but does not edit or resolve intermediate findings.
- **Durability:** Atomic validated checkpoint snapshots and completed-chunk flushes; immutable prior attempts and idempotent history publication. Reviewer disconnect, daemon restart, publication interruption and approval cleanup have explicit recovery cases. Permanent history retains baselines/impact/feedback and technical attempt summaries, not native transcripts. Never delete a checkpoint until every attempt is preserved and approval succeeded.

## 8. Rollout

**A — useful design review**

**Stories:** `s1`

Deliver the actual normal-entrypoint read-only review, artifact-specific chunk planning, checkpointed feedback and visible results. Demonstrate at least one useful independent native review before adding resilience features.

**Backward compat:** Keep working code review and historical report readers unchanged; no retired design engine fallback.

**B — controlled recovery**

**Stories:** `s2`

Add explicit interruption recovery, reviewed-artifact invalidation, bounded technical retries and user-input pauses over accepted chunk state.

**Backward compat:** Preserve phase A request/result identities; validate checkpoint schema explicitly and do not silently replay unknown records.

**C — impact-aware corrections**

**Stories:** `s3`

Add auditable direct/indirect impact scope and prior coverage references after recovery/invalidation semantics exist.

**Backward compat:** Existing full-review histories remain usable; missing impact baseline produces explicit full review rather than guessed selective reuse.

**D — approval and closeout**

**Stories:** `s4`

Integrate version-aware permanent publication and approval cleanup, then verify compiled normal MCP/daemon/controller paths and live design review without an additional activation system.

**Backward compat:** Existing artifact lifecycle/approval overrides and historical report data remain readable. No compatibility execution path for retired engines; code-review contracts remain intact.

**Ordering rationale:** s1 -> s2 -> s3 -> s4 exactly follows approved Story dependencies. sc1/sc2 land in s1 before all consumers; sc3 in s2 before s3/s4; sc4 in s3 before s4; sc5 is private publication/cleanup ownership of s4. No contract extraction or activation epic precedes the useful review.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Mutation detection and publication/approval races | Current document reads can span changes, and publication metadata itself must not trigger an invalidation loop or certify changed content. | Watch only the subject, compare before/after each phase, fence queued publication/approval, reject late responses, and test direct edits plus metadata-only self-publication separately. |
| Selective review omits indirect effects or unresolved feedback | Text changes do not reveal all requirement/interface implications; moved chunks and missing baselines can make prior coverage unreliable. | Require explicit reviewer impact reasoning, chunk mapping and carried findings, final consistency checks, and full-review fallback for uncertainty or unavailable baseline. |
| Hidden retries, lost progress or divergent reviewer parties | Provider/MCP retry stacking can exceed the agreed budget, disconnection can repeat completed work, and legacy readers may misinterpret new records. | One coordinator owns retry counters and durable completed states, native internal retries disabled, parity tests for daemon/controller, idempotent versioned history publication and cleanup retained on uncertainty. Test with deterministic failure fixtures and clearly distinguished live evidence. |

## 9. Alternatives considered

### 9.1 a1: Dedicated design-review coordinator over existing provider and artifact services — **CHOSEN**

Own latest-artifact and chunk semantics locally; reuse provider activity and artifact history interfaces.

Use a focused daemon-owned background coordinator for design-review attempts, chunk planning, completed feedback and recovery. It reads current artifact documents, gives independent reviewers policy plus paths, and persists a single checkpoint per review with append-only attempt sections. The provider session interface and normal artifact-store lifecycle/history remain shared services.

MCP and daemon paths delegate to this coordinator, with daemon-native execution or controller exchange using the same policies and validation. Existing code-review coordinator remains a separate consumer of generic services; no task packet, commit pin or BUILD semantics enter design review.

**Pros:**
- No required changes to code-review packet, committed-scope or recovery contracts.
- A single design-review owner handles mutation checks, retries, progress, publication and cleanup.
- Reuses existing provider activity and queued artifact history facilities without a new scheduler or persistence system.

**Cons:**
- Design and code review have separate domain coordinators, so shared policy conventions need parity tests.
- Some small checkpoint/progress orchestration patterns will be similar until proven common utility extraction is justified.

**Cost estimate:** L

### 9.2 a2: Extract a shared review-job engine first

Move both review kinds onto a generalized background job lifecycle with domain adapters.

Generalize existing task-review execution into a reusable job engine that owns scheduling, sessions, progress, retries and persistence. Code and design reviews each implement domain adapters, with the design adapter adding latest-artifact fingerprints, coherent chunks and selective impact analysis.

Both flows migrate to shared lifecycle contracts before or alongside design review. This centralizes orchestration but requires proving that committed task recovery and mutable artifact invalidation remain independent despite shared state transitions.

**Pros:**
- Centralized orchestration can reduce duplicate lifecycle implementation if both domains genuinely share the same transition model.
- Uniform monitoring and checkpoint mechanics can be exercised through shared infrastructure tests.

**Cons:**
- Requires migration and regression qualification of working code review before design-review value is delivered.
- Generalization must accommodate conflicting commit-pinned and latest-artifact recovery rules, increasing contract surface.

**Cost estimate:** L

**Rejected because:** Partial on k11: requires migrating the working code-review engine before design review.

### 9.3 a3: Extend task-review coordinator with design-review variants

Add design payload variants to the working code-review lifecycle.

Add design-review discriminators and chunk variants to the existing task-review coordinator and checkpoint contracts. Design chunks stand in for tasks while additional branches implement current-artifact invalidation and impact-selected attempts.

One coordinator then handles both committed code task reviews and current design artifacts. Provider and routing code are reused directly, but every execution, completion, reuse and cleanup branch must distinguish the two review meanings.

**Pros:**
- Directly reuses the existing in-process owner and controller exchange scaffolding.
- Avoids introducing a second top-level domain coordinator.

**Cons:**
- Introduces design-specific variants throughout task packet admission, task history reuse, BUILD completion and cleanup paths.
- Couples design-review rollout to the tested code-review implementation and makes invalid reuse of committed-task assumptions easier.

**Cost estimate:** L

**Rejected because:** Partial on k2/k8/k10/k11: mixes latest artifact invalidation/impact/cleanup with committed-task semantics.

## 10. References

- **[[c1]]** `prior-artifact` `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/DEF.md`
- **[[c2]]** `analyze-bundle` `s1: Review module inventory and MCP boundary`
- **[[c3]]** `analyze-bundle` `s1: Provider, lifecycle, import and convention discovery`
- **[[c4]]** `prior-artifact` `docs/standalone/review-evolving-designs-durable-checkpoints-E2026110316f49beb/SPEC.md`
- **[[c5]]** `code` `src/shared/types.ts`
- **[[c6]]** `code` `src/workflow/artifact-core/store.ts`
- **[[c7]]** `convention` `AGENTS.md`

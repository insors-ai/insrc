<!-- insrc:artifact LLD-9b04adb36cac716d-s3 -->

# LLD: STORY-9b04adb36cac716d-s3

## Summary

**Epic:** `review-evolving-designs-durable-checkpoints`
**HLD base run:** `wf-1793694252789-heyhey`
**HLD effective hash:** `20a9ee7f3bdf...`

Review corrected designs by assessing direct and indirect impact before selecting chunks. Preserve unaffected prior coverage with explicit provenance, carry unresolved findings forward, and run a fresh consistency check. Fall back to full review whenever safe reuse cannot be established. [[c8]] [[c1]] Citation convention: c1 identifies the HLD requirement for proposed S3 behavior; code citations identify existing contracts or extension points, and do not claim the proposal is implemented. Proposed additions remain design requirements until S3 is built. [[c1]]

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

**Rollout phase:** C — impact-aware corrections
**Owns:** `sc4` (Impact-selected attempt and retained coverage)
**Consumes:** `sc1` (Design review subject, policy and semantic chunk contract), `sc2` (Durable review attempts, feedback and progress), `sc3` (Change invalidation and bounded technical recovery)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Deliver the first useful normal-entrypoint review: latest-subject resolution, opposite-party execution, shared artifact-specific policy, reviewer chunk planning, sequential inspection, durable completed results, visible progress and a retrievable consolidated report. Keep prompt construction, native/controller exchange and checkpoint IO private; no shared-engine migration. Produce real narrow hosted-review evidence as well as deterministic fixtures. — owns `sc1`, `sc2`
- `s2`: Own interruption/recovery transitions, reviewed-subject monitoring, cancellation/late-response rejection, the single retry budget and user-decision pause. Native activity integration is private; callers consume recovery state/actions, not process internals. Preserve sc1/sc2 semantics and no external-file invalidation. — owns `sc3`
- `s4`: Own lifecycle version-aware record publication/readers, normal approval integration, history-preserving cleanup, multi-session routing qualification and final compiled/live verification. Keep cleanup fence and publication retries internal. No new review dashboard, activation state or legacy compatibility execution. — owns `sc5`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `DesignReviewCoordinator`

```typescript
class DesignReviewCoordinator { start(input: unknown, context?: DesignStartContext): Promise<DesignReviewAcknowledgement>; exchange(input: unknown, owner: DesignControllerOwner): Promise<unknown>; }
```

**Parameters:**
- `input: unknown` — Existing untrusted input boundary, decoded with strict DesignRequestSchemas/DesignReviewRequest before use. start decodes the positive-attempt DesignReviewStart; exchange decodes the discriminated DesignReviewRequest including the proposed impact phase. No new request alias type. [[c4]] [[c9]]
- `context: DesignStartContext` _(optional)_ — Existing exported start context: optional provider and owner; no rename or new DesignReviewerContext type. [[c4]]
- `owner: DesignControllerOwner` — Existing exchange-only trusted connection lifetime; authority never comes from request JSON. [[c4]]

**Returns:** `Promise<DesignReviewAcknowledgement | unknown>` — Short durable acknowledgement or existing bounded exchange frame; a correction attempt starts impact analysis in the background. [[c4]]

**Errors:**
- `DesignReviewError` when Noncontiguous attempt, mismatched artifact/project, active subject, untrusted party, invalid impact scope, byte/count bounds or persistence failure. [[c4]] [[c9]]

**Preconditions:**
- Initial attempt1 behaves unchanged. A subsequent start is only latest.number+1 after a terminal complete report (passed, changes_requested or incomplete), not pending/running/interrupted/paused/failed/invalidated. Recovery of an interrupted/paused attempt remains sc3; an invalidated attempt requires user-approved restart_full and never reuses coverage. [[c1]] [[c4]]
- Same review/attempt replay is observe-only; conflicting identity cannot replace pinned admission. Current live subject representations must be valid. No generic Git/HEAD diff defines design scope. [[c4]]
- These are proposed S3 behavioral extensions to existing start/exchange methods, not newly invented public wrapper interfaces. Existing unknown inputs are intentional trust boundaries, not missing schema definitions. [[c4]] [[c9]]
- Admission uses three explicit branches, replacing admit()'s current single saved.submitted.attempt comparison. (1) No checkpoint: require requested attempt=1; create initial full-planning attempt and immutable submitted={artifactPath,attempt:1}. (2) Requested attempt already exists: require the original admitted artifactPath/identity and return only that attempt's saved acknowledgement (active only if it is the active generation); do not append, re-prepare or dispatch. A conflicting identity remains an error. (3) Requested attempt is latest.number+1: require no active job/subject, no uncertain failed save, and latest terminal passed/changes_requested/incomplete with a complete report matching its accepted plan, baseline and results. Reject any other ordinal/status. Crucially, branch 3 does NOT compare requested attempt N to saved.submitted.attempt=1 and never rewrites submitted. [[c4]] [[c3]]

**Postconditions:**
- Append one new baseline/inventory, with prior attempts frozen. Choose the latest complete report as impact baseline only if artifact identity and reviewer party match; otherwise full review with explicit reason, no retained coverage. [[c1]] [[c3]]
- Subsequent impact unit returns {plan,impact}; initial and approved restart_full use ordinary full planning, never impact reuse. Monitoring starts before impact and aborts on subject mutation. No next-attempt admission occurs automatically from polling. [[c1]] [[c4]]
- In the sequential-correction branch, re-prepare current subject/context and trusted reviewer, require same canonical project/artifact identity, append exactly one fresh baseline/inventory attempt with immutable preparationKind=impact, acquire existing subject fence, and persist atomically before launch. Baseline comparison is the immediately preceding complete attempt. Previously admitted attempts, including the immediately preceding one, remain byte-for-byte frozen on this append. Save/admission failure releases the fence and dispatches nothing. Initial admission and approved restart_full set preparationKind=planning; absent preparationKind in existing checkpoints means planning. [[c4]] [[c3]]
- Extend checkEvolution()'s attempt-growth guard with two disjoint allowed cases. Existing invalidated predecessor + approved matching restart_full action still permits only a full preparationKind=planning attempt and no retained coverage; preserve its existing action semantics. New ordinary correction permits a terminal complete predecessor (passed/changes_requested/incomplete) plus exactly number N+1, preparationKind=impact, matching artifact/project and a byte-identical entire prior-attempt prefix. All other growth, changed original submitted metadata, skipped attempts and replacement baselines/results reject. The impact decision itself is not required at admission; it is later accepted with the plan. Freeze preparationKind after admission. [[c3]] [[c4]]
- Extend controller exchange()'s exact phase/kind dispatch table to plan/planning, impact/impact and result/chunk. The new impact request is {phase:impact,repo,reviewId,attempt,executionId,sequence,plan,impact}; define its strict schema in DesignRequestSchemas, include it in DesignRequestSchema and DESIGN_REVIEW_PHASES, and expose it through normal MCP and main-owned daemon routes. Keep owner, current attempt, execution generation, next sequence and subject checks before dispatch exactly as for plan/result. A mismatched phase/kind is invalid_phase with no accepted output. [[c4]] [[c9]]
- For phase impact with kind impact, validate request.plan as a complete current plan, then request.impact against that validated plan, immutable prior history and current inventory using the SAME validator supplied to the native impact output candidate. Persist the accepted {plan,impact} pair and seal its impact reservation atomically before resolving unit.accepted/acknowledging. Exact owner/execution/sequence/input replay returns the same acceptance and never repeats work; conflicting replay rejects. Structurally valid invalid impact output retires that generation and uses sc3 retry/pause; malformed envelopes spend no retry. No plan/result branch may accept impact output. [[c4]] [[c5]] [[c9]]
- Normal transport inventory is explicit: src/mcp/design-review/schema.ts derives the impact phase/input; src/daemon/design-review-rpc.ts handles both step and unary impact; src/daemon/handler-runtime.ts registers designReview.impact; src/daemon/threads/method-class.ts classifies and main-owns it; src/daemon/repo-call-audit.ts marks it modifying with required repo. These are S3 integration extensions, not a provider or threading redesign. [[c11]] [[c12]] The respective additional integration sites are handler-runtime.ts [[c16]], threads/method-class.ts [[c17]] and repo-call-audit.ts [[c18]]; these are proposed route-registration/audit changes.
- Same-attempt writes, separately from the append-growth guard, add preparationKind to checkEvolution()'s enumerated immutable fields: require current.preparationKind === previous.preparationKind on every save of an admitted attempt, including presence/absence. Existing missing-marker checkpoints retain that exact absence; readers treat it as planning, but saves must not backfill or switch it. Add accepted impact to the existing plan-once-set immutability checks; for an impact-kind attempt the plan/impact pair is absent together or accepted together, and neither can later change or disappear. Reject marker drift or half-pair writes with immutable_history/invalid_checkpoint before replacing bytes. [[c3]] [[c9]]

### 2.2 `validateDesignPlan`

```typescript
validateDesignPlan(input: unknown, inventory: DesignReviewInventory): DesignChunkPlan
```

**Parameters:**
- `input: unknown` — Complete current plan proposed with impact output, not a subset plan. [[c1]] [[c5]]
- `inventory: DesignReviewInventory` — Fresh inventory of the current DEF/HLD/LLD including relevant visuals and workflow references. [[c5]]

**Returns:** `DesignChunkPlan` — Existing complete inventory/selector/dependency validation. Selection is a separate sc4 decision. [[c5]] [[c1]]

**Errors:**
- `DesignReviewError` when Unknown, duplicate, omitted or inconsistent units/chunks/dependencies; final consistency absent or not last. [[c5]]

**Preconditions:**
- Validate complete current plan before validating its impact selection. [[c1]] [[c5]]

**Postconditions:**
- Every current inventory unit has substantive coverage; final consistency depends on all substantive chunks, including retained coverage. Changed grouping is represented explicitly, not silently treated as equivalent. [[c1]] [[c5]]

### 2.3 `nextDesignUnit`

```typescript
nextDesignUnit(attempt: DesignAttempt): { kind: 'planning' | 'impact' | 'chunk'; chunk?: DesignChunk | undefined } | undefined
```

**Parameters:**
- `attempt: DesignAttempt` — Current attempt, accepted impact selection and fresh completed results. [[c1]] [[c6]]

**Returns:** `{kind:'planning'|'impact'|'chunk';chunk?:DesignChunk}|undefined` — One unfinished unit. After a plan is accepted, derive executionOrder by filtering the full current plan in its existing dependency order to the validated selected substantive IDs plus every consistency ID. For a full or pre-S3 attempt without impact, executionOrder is the entire plan. Retained IDs never enter this vector. [[c6]] [[c1]] [[c6]] [[c1]]

**Errors:**
- `DesignReviewError` when Corrupt selection, missing provenance or fresh-results order that does not match selected execution order. [[c3]] [[c6]]

**Preconditions:**
- No current plan/decision mutation after acceptance; retained coverage must not appear in completedChunks. [[c1]] [[c3]] [[c6]]
- Validate the complete current plan first; validate selected/retained disjointness and exact coverage by ID. A retained chunk has a resolvable immutable source before it can satisfy a dependency. The full plan is never destructively shortened. [[c5]] [[c6]]
- Use immutable preparationKind to choose the unplanned preparation unit: impact means correction, planning or missing marker means full planning. Do not infer this solely from number>1 because approved restart_full also creates number>1. [[c6]] [[c9]]

**Postconditions:**
- Replace the existing completedChunks-vs-plan positional prefix invariant with completedChunks-vs-executionOrder: every fresh result at position i must have the unique chunkId executionOrder[i].id. Reject duplicates, out-of-order or unknown fresh results. The next work item is executionOrder[completedChunks.length]; exhaustion means fresh execution is complete, not that retained chunks were inspected again. [[c6]]
- Before dispatch, each dependency in the full plan must be satisfied by an earlier accepted fresh result or validated retained-by-ID coverage. Semantic changes_requested/incomplete feedback still permits subsequent chunks as in S1. A retained dependency consumes no reservation and never appears in completedChunks. [[c1]] [[c5]] [[c6]]
- For full plan [keep-A, change-B, keep-C, final], selected executionOrder is [change-B, final]. With completedChunks=[change-B], next work is final; keep-A and keep-C are resolved by provenance. Recovery recomputes the same immutable vector and never repeats change-B or reserves retained chunks. [[c6]]
- Before the accepted plan+impact pair exists, an explicit correction attempt yields kind impact; initial review and approved restart_full yield planning. After acceptance, resume skips the sealed preparation unit and accepted fresh prefix without resetting sc3 counters. [[c1]] [[c6]]

### 2.4 `reserveDesignUnit`

```typescript
reserveDesignUnit(attempt: DesignAttempt, chunk?: DesignChunk, allowExtra?: boolean, recovering?: boolean, preparationKind?: 'planning' | 'impact'): string
```

**Parameters:**
- `attempt: DesignAttempt` — Existing attempt-local durable reservation state. [[c6]]
- `chunk: DesignChunk` _(optional)_ — Fresh selected chunk; absent for planning or impact. [[c1]] [[c6]]
- `allowExtra: boolean` _(optional)_ — Existing user-approved one-dispatch grant after exhaustion. [[c6]]
- `recovering: boolean` _(optional)_ — Existing conservative interrupted reservation handling. [[c6]]
- `preparationKind: 'planning'|'impact'` _(optional)_ — Additive internal discriminator; default planning preserves S1/S2 callers. Impact uses its own unit id/phase. [[c1]] [[c6]]

**Returns:** `string` — Fresh fenced execution generation saved before dispatch. [[c6]] [[c1]]

**Errors:**
- `DesignReviewError` when Sealed unit, exhausted budget without direction, invalid user decision or changed subject. [[c4]] [[c6]]
- `DesignReviewError (invalid_checkpoint)` when With chunk absent, explicit/default preparationKind disagrees with admitted attempt.preparationKind (missing stored marker means planning). This is an internal reservation/context inconsistency, not reviewer output, and is terminal/nonretryable. [[c6]] [[c9]] [[c13]]

**Preconditions:**
- Use existing sc3 initial+three retry policy; no new retry subsystem. [[c6]]
- The explicit preparationKind discriminator must agree with the admitted immutable attempt marker when chunk is absent; mismatches reject rather than reserving a different phase. [[c6]] [[c9]]

**Postconditions:**
- Impact planning failures consume only impact reservations. Controller/native routes share output schema, policy, activity and recovery semantics. No fixed deadline; active tools and real model activity retain S2 behavior. [[c1]] [[c4]] [[c6]]
- Check preparationKind agreement before mutating unit/current, counters, executionId or actions. On mismatch throw invalid_checkpoint, persist no new reservation, dispatch no provider/controller assignment, and stop the owner with a visible failed state using existing sc3 nonretry handling. Never reinterpret an impact unit as planning to recover automatically. [[c4]] [[c6]] [[c13]]
- After the preparation-kind agreement check, assign attempt.current.kind = chunk ? 'chunk' : preparationKind (with an omitted preparationKind defaulting to 'planning'). Thus an admitted impact preparation reservation with no chunk sets current.kind='impact'; it must not use the existing chunk?'chunk':'planning' expression. Store current.executionId from the reserved unit and include chunkId only for a chunk reservation. Apply the same discriminator when matching an interrupted reservation for recovery. This is a proposed extension of the current reservation implementation. [[c1]] [[c6]]

### 2.5 `consolidateDesignReview`

```typescript
consolidateDesignReview(reviewId: string, attempt: number, subject: DesignReviewSubject, contentIdentity: string, plan: DesignChunkPlan, results: readonly DesignChunkResult[], impactContext?: { impact: DesignImpactAssessment; attempts: readonly DesignAttempt[] }): DesignReviewConsolidated
```

**Parameters:**
- `reviewId, attempt, subject, contentIdentity, plan, results: Existing consolidation arguments` — Current complete plan and fresh selected results; old all-fresh calls remain unchanged. [[c1]] [[c5]]
- `impactContext: Impact context with accepted impact assessment and immutable source attempts only` _(optional)_ — Validate retained origins, effective coverage and finding lineage without copying prior feedback as fresh. [[c1]] [[c5]]

**Returns:** `DesignReviewConsolidated` — Counts/status over fresh and retained effective coverage plus carried unresolved findings; exposes provenance and resolved/superseded dispositions. [[c5]] [[c1]]

**Errors:**
- `DesignReviewError` when Missing fresh selected result, unknown/mismatched origin, duplicate effective coverage, unresolved finding omitted, invalid resolution or changed baseline. [[c3]] [[c5]]

**Preconditions:**
- Final consistency is newly reviewed. Every current chunk is exactly fresh or explicitly retained. Known earlier findings, including LOW and incomplete coverage limitations, must be accounted for. [[c1]] [[c5]]
- Retention eligibility is validated when accepting impact and revalidated at consolidation: each referenced effective source chunk, including every backward provenance link, must have status passed or changes_requested and an empty limitations array. An incomplete result is accepted historical feedback but is not reusable verified coverage. Its corresponding current chunk must be selected for fresh review, even if selectors and text are unchanged. A report that is incomplete only because of other chunks does not disqualify a complete source chunk. Do not bypass an incomplete immediately preceding mapped chunk by citing an older passed result. [[c1]] [[c5]] [[c9]]

**Postconditions:**
- No unresolved earlier HIGH/MED disappears by selection, full fallback, rename or omission. Dispositions carry/resolved/superseded name immutable source tuples and evidence; resolving a finding requires fresh selected inspection and final confirmation. [[c1]] [[c5]]
- Optional execution omissions stay advice; mandatory evidence gaps yield incomplete. Reviewer semantics are not replaced by host textual inference. [[c1]] [[c5]]
- Replace the current unconditional results.length === plan.chunks.length check with two explicit branches. Without impactContext, retain the existing all-fresh exact-coverage invariant. With impactContext, define P as all unique chunk IDs in the complete current plan, S as selected substantive IDs plus all consistency IDs, R as retained current chunk IDs, and F as fresh result chunk IDs. Require unique IDs, S intersect R empty, S union R = P, F = S exactly, and fresh results in the selected executionOrder established by nextDesignUnit. Therefore fresh-result count equals selected executionOrder length, not complete plan length. Require one valid retained origin for every R entry; no consistency chunk may be retained. Unknown, duplicate, missing or overlapping coverage rejects consolidation. [[c5]] [[c6]] [[c1]]
- Compute mandatory inventory coverage and effective status/counts from that exact fresh-plus-retained partition and reconciled findings. Do not pad results or report.chunks with copies of retained results: both remain fresh-only, with explicit retained provenance alongside them. Full mode has R empty and S = P, so the same impact branch reduces to the original all-fresh case. [[c5]] [[c1]]
- For plan [keep-A, change-B, keep-C, final], fresh results [change-B, final] plus valid retained origins for keep-A and keep-C complete consolidation. The same fresh results without keep-C provenance reject; a retained change-B overlapping fresh change-B rejects; retained final rejects. A freshly re-reviewed chunk that remains incomplete is accepted feedback but keeps the new report incomplete and cannot become reusable verified coverage in a later attempt. [[c5]] [[c6]]
- Construct report.impact exactly as the DesignReportImpact schema in §3.4: complete coverageOrigins partition, accepted final findingDecisions, and deduplicated unresolved effectiveFindingOrigins. Require every nested field for an impact attempt, exact equality with accepted sc4/final-output source data where applicable, and valid backward source resolution. Without impactContext omit report.impact and preserve the original all-fresh report contract. Never synthesize retained result bodies to satisfy the old chunks-length invariant. [[c1]] [[c3]] [[c5]] [[c9]]
- Derive findingDecisions only from the accepted fresh final consistency DesignChunkResult within results, identified by the validated final chunk ID in plan. impactContext has no independently supplied findingDecisions argument. report.impact.findingDecisions must equal that exact accepted array, or [] when absent under the existing carry-and-incomplete rule. Never obtain dispositions from a second caller-supplied copy. [[c5]] [[c9]]

### 2.6 `validateDesignImpact (proposed sc4-owned internal API)`

```typescript
validateDesignImpact(input: unknown, current: DesignAttempt, history: readonly DesignAttempt[]): { plan: DesignChunkPlan; impact: DesignImpactAssessment }
```

**Parameters:**
- `input: unknown` — Untrusted {plan,impact} native candidate or controller impact response payload; decode strict bounded schemas before semantic/provenance validation. This new private validator implements owned sc4; it is not claimed to exist in current code. [[c1]] [[c9]]
- `current: DesignAttempt` — Admitted impact-kind attempt with fresh inventory/baseline and number; supplies current artifact state without re-reading or choosing a new baseline. [[c1]] [[c3]]
- `history: readonly DesignAttempt[]` — Immutable earlier attempts in this same canonical review, including reviewer metadata and effective coverage. Do not accept history from caller JSON. [[c1]] [[c3]]

**Returns:** `{plan:DesignChunkPlan;impact:DesignImpactAssessment}` — The validated complete current plan and sc4 decision, committed atomically by the existing owner. Pure validation performs no model calls, file edits, persistence or dispatch. [[c1]] [[c5]]

**Errors:**
- `DesignReviewError (invalid_plan / invalid_result / invalid_schema)` when Malformed candidate, unsafe selection/origin/partition, invalid full fallback or declared retention equivalence contradiction. Output failure spends the current impact unit budget, not a new global retry. [[c5]] [[c13]]
- `DesignReviewError (invalid_checkpoint / foreign_checkpoint)` when Trusted attempt history or identity is corrupt/inconsistent; stop rather than retry a model against invalid host state. [[c3]] [[c13]]

**Preconditions:**
- current.preparationKind is impact; current has no accepted plan/impact pair, and its current inventory/baseline and immediately preceding terminal complete comparison attempt are pinned. Historical identity and party are host-owned; no baseline is selected by a model-supplied arbitrary number. [[c1]] [[c3]]
- Decode a strict {plan,impact} envelope; call existing validateDesignPlan(input.plan,current.inventory) before impact validation. DesignImpactSchema in contracts.ts is the strict bounded schema for the owned HLD sc4 fields; the runtime selection/provenance checks below are not replaced by schema decoding. [[c1]] [[c5]] [[c9]]

**Postconditions:**
- Validate baselineAttempt against the immediately preceding admitted comparison attempt. Check every current/prior chunk ID against its corresponding plan; mapping rows explain renames, additions/removals and regrouping. Retention requires a one-to-one substantive mapping, matching selectors/concerns and compatible dependencies; the independent reviewer supplies the semantic justification, and host checks structural claims rather than inventing implicit impact. [[c1]] [[c5]]
- Partition all current substantive IDs into disjoint direct/indirect selected IDs and retained current IDs; every current inventory unit remains covered through the already validated complete plan. consistencyChunkIds equals all current consistency IDs, including final, and none is retained. Validate unique entries, explanations, backward source resolution, same-party/artifact and finding-origin keys. [[c1]] [[c5]] [[c9]]
- Canonical retention eligibility is identical everywhere: source status is passed or changes_requested AND limitations.length === 0. Check every provenance link and the immediately preceding mapped source; incomplete coverage cannot be bypassed through an older passed result. Findings themselves do not make coverage incomplete; unresolved HIGH/MED are carried unless freshly reconciled. [[c1]] [[c5]]
- In full mode require no retained coverage and all substantive plus consistency chunks selected. Missing usable comparison context, party mismatch or declared uncertainty requires explicit full-mode rationale; reject affected_chunks output in these cases so the reviewer corrects it under the existing impact retry budget. The host does not silently truncate or invent a semantic selection. [[c1]] [[c13]]
- Both native impact candidate and controller phase impact/kind impact invoke this exact validator with the same host-owned context. Only its returned pair can be saved; after acceptance plan and impact are immutable. A later consolidation resolves and rechecks these same source/partition invariants, not a weaker ad hoc test. [[c1]] [[c3]] [[c4]]

### 2.7 `assessDesignResult`

```typescript
assessDesignResult(input: unknown, chunk: DesignChunk, previous: readonly DesignChunkResult[], requiredReferences?: readonly string[], impactContext?: { attempt: DesignAttempt; history: readonly DesignAttempt[] }): DesignChunkResult
```

**Parameters:**
- `input: unknown` — Existing untrusted chunk-result boundary decoded against the extended strict DesignResultSchema. [[c5]] [[c9]]
- `chunk: DesignChunk` — Currently assigned selected chunk, with purpose and ID pinned by the owner. [[c5]]
- `previous: readonly DesignChunkResult[]` — Fresh accepted results in selected execution order for uniqueness and decision evidence checks. [[c5]] [[c6]]
- `requiredReferences: readonly string[]` _(optional)_ — Existing mandatory references/selector coverage; omitted references remain explicit incomplete coverage as today. [[c5]]
- `impactContext: {attempt:DesignAttempt;history:readonly DesignAttempt[]}` _(optional)_ — Host-owned accepted impact and immutable history; needed only for impact attempts and finding-decision validation. No caller-provided history is trusted. [[c1]] [[c3]]

**Returns:** `DesignChunkResult` — An accepted structurally valid assessment with honest coverage status. No impactContext preserves initial-review validation; report completion still waits for consolidation. [[c5]]

**Errors:**
- `DesignReviewError (invalid_result / invalid_schema)` when Wrong assigned chunk, duplicate/foreign finding or disposition source, unexpected findingDecisions on a nonfinal chunk, malformed union branch, fabricated superseded finding, or contradictory claimed status. Current-unit output failure follows existing retry rules. [[c5]] [[c9]] [[c13]]
- `DesignReviewError (invalid_checkpoint)` when Trusted accepted plan, result order or historical source state is corrupt; stop without model retry. [[c3]] [[c13]]

**Preconditions:**
- Existing selected chunk/generation and owner fences have already passed. Current plan and impact are accepted and immutable. No result may validate itself against caller-supplied baseline, selection or prior findings. [[c4]] [[c5]]
- The findingDecisions field is allowed only for the fresh finalConsistencyChunkId on an impact attempt; a nonfinal or nonimpact submission carrying this field is invalid_result. Each explicit source tuple must identify a baseline effective finding exactly once; bounded branch-specific fields and evidence references are required as specified in the DesignFindingDecision union. [[c1]] [[c5]] [[c9]]

**Postconditions:**
- For resolved/superseded, validate nonempty reviewedInChunkIds against accepted fresh selected results (or the current final chunk for removed-section consistency), required current evidence, and supersededBy against a current accepted finding. Retained-only chunks cannot provide fresh resolution evidence; those findings carry. Unknown/duplicate origins or invalid branch fields are rejected as invalid_result. [[c1]] [[c5]] [[c9]]
- On an impact final chunk with baseline findings, missing findingDecisions or omitted source decisions is a mandatory coverage gap, not permission to remove findings: append pointed limitations, require/normalize incomplete status under existing status rules, and leave the affected origins unresolved for conservative carry at consolidation. No fabricated resolved decision is synthesized. When no baseline findings exist, absent/empty findingDecisions is valid. [[c1]] [[c5]]
- A structurally valid incomplete assessment (including missing required references or reconciliation evidence) is accepted without technical retry; all unresolved origins remain carried and the report stays incomplete. Other valid findings and advice retain existing semantics; every limitations entry means mandatory unavailable coverage, while optional execution omissions belong in advice. Native and controller chunk validators call this same function. [[c1]] [[c5]] [[c13]]
- Error layering: validateDesignPlan/validateDesignImpact/assessDesignResult and candidate decode retain their documented raw DesignReviewError codes (invalid_plan, invalid_result, invalid_schema, invalid_json, input_too_large). Existing designTechnicalFailure() at the execution boundary normalizes these to DesignTechnicalFailure.code=invalid_output for persisted retry diagnostics. Tests assert the specific raw code at validation and the normalized code only at the execution/diagnostic layer; this does not make malformed incoming controller requests retryable model failures. [[c5]] [[c9]] [[c13]]

### 2.8 `observeDesignCheckpoint`

```typescript
observeDesignCheckpoint(checkpoint: DesignReviewCheckpoint, options?: { active?: boolean; liveProgress?: DesignReviewProgress; afterCompletedChunk?: number; includeResult?: boolean }): DesignObservation
```

**Parameters:**
- `checkpoint: DesignReviewCheckpoint` — Existing validated host-owned snapshot. Derive selective counters from accepted plan/impact and fresh results, not a caller-supplied fraction. [[c3]] [[c14]]
- `options: Existing observation options` _(optional)_ — Existing live/stored metadata choice and fresh-result cursor; no model execution or state mutation. [[c14]]

**Returns:** `DesignObservation` — Bounded existing observation plus optional coverageProgress. completedChunks/totalChunks is the fresh selected fraction; retained coverage is labelled separately. [[c14]]

**Errors:**
- `DesignReviewError (invalid_cursor)` when Cursor is not a safe integer in 0..accepted fresh result count; no change from existing behavior. [[c14]]
- `DesignReviewError (invalid_checkpoint)` when Accepted plan/impact/fresh-result counts cannot form the validated selected/retained partition. Observation refuses inconsistent counts; no model retry. [[c3]] [[c6]] [[c13]] [[c14]]

**Preconditions:**
- No model work or next-attempt admission is triggered by observation. Validate the accepted execution selection and retained origins before deriving counters. [[c1]] [[c6]] [[c14]]

**Postconditions:**
- For complete plan [keep-A, change-B, keep-C, final] and accepted fresh results [change-B, final], return completedChunks=2,totalChunks=2 and coverageProgress={plannedChunks:4,selectedChunks:2,reviewedChunks:2,retainedChunks:2,effectiveCompletedChunks:4}. After only change-B, return 1/2 with effectiveCompletedChunks=3, not 1/4. A full review reports N/N and retained0. [[c6]] [[c14]]
- afterCompletedChunk/nextCompletedChunk page only actual fresh completedResults, one per page as before. Retained result bodies are not copied into those pages or counted as newly inspected; origins remain explicit checkpoint references. The final complete fraction does not override an incomplete/changes_requested status. [[c1]] [[c14]]
- Stored tracker snapshots and live overrides use this same selected-count derivation before persistence/response; observeDesignCheckpoint must replace its current unconditional attempt.plan?.chunks.length assignment with selected executionOrder length. Loading old snapshots without coverageProgress remains valid; observation computes the breakdown if an accepted plan exists. [[c6]] [[c9]] [[c14]]

## 3. Data model changes

### 3.1 `DesignImpactAssessment (sc4)` — new

Attempt owns 0..1 accepted sc4 decision, immutable after acceptance. It records baselineAttempt, mode affected_chunks/full, changes, directChunkIds, indirectChunkIds, rationale, optional uncertainReason, chunkMapping, retainedCoverage, carriedFindingIds and consistencyChunkIds exactly as HLD sc4. The complete current plan is accepted atomically with it. Every substantive current chunk is selected or retained, disjointly; all consistency chunks are selected. Mapping may be many-to-many for explanation, but retaining requires an auditable one-to-one equivalent prior substantive chunk with matching selectors/concerns and compatible dependencies. Split, merged, added, removed, unsupported or ambiguous mappings force affected chunks or full fallback. Host validates structure/coverage/claims, reviewer assesses implicit semantics, ownership, constraints, interfaces, diagrams and workflow-specific requirements. Uncertainty promotes to full with retainedCoverage empty and direct+indirect union covering all current substantive chunks. [[c1]] [[c9]] [[c4]] [[c5]] Retention eligibility also requires source status passed or changes_requested and an empty limitations array at every provenance link. An incomplete source, or any source with limitations, requires fresh selection of its mapped current chunk; structural equivalence alone is insufficient. Reject a proposed impact plan that retains ineligible coverage as invalid_output under the existing impact-unit retry policy. Do not silently drop the chunk, mark it complete or auto-alter the accepted selection. [[c5]] [[c9]] Proposed policy.ts integration: add a new designImpactPrompt alongside the existing designPlanningPrompt/designChunkPrompt and extend final-consistency guidelines to require evidence-backed finding decisions. These prompt additions do not exist yet; the listed file is a future implementation site. [[c15]]

```
Proposed DesignImpactSchema in contracts.ts mirrors every HLD sc4 field: {baselineAttempt:positive; mode:affected_chunks|full; changes:string[]; directChunkIds:id[]; indirectChunkIds:id[]; rationale:nonemptyText; uncertainReason?:nonemptyText; chunkMapping:{priorIds:id[];currentIds:id[];explanation:nonemptyText}[]; retainedCoverage:{chunkId:id;fromAttempt:positive;fromChunkId:id;justification:nonemptyText}[]; carriedFindingIds:string[]; consistencyChunkIds:id[]}. Reject extra fields. Bound chunk/mapping/retained arrays and IDs per mapping to128; apply existing DESIGN_LIMITS units/findings/text and request/checkpoint byte caps to changes/carried keys/text. Empty selection or changes arrays are allowed when semantically justified; the validator still requires complete current coverage, fresh consistency, and each retained origin safe. Semantic/provenance validation is the proposed validateDesignImpact contract, not TypeBox alone. [[c1]] [[c9]]
```

**Call sites:**
- `src/workflow/review/design-review/contracts.ts`
- `src/workflow/review/design-review/coordinator.ts`
- `src/workflow/review/design-review/results.ts`
- `src/workflow/review/design-review/policy.ts`

### 3.2 `DesignAttempt impact execution and origins` — field-add

Proposed optional impact metadata and accepted-plan pair, plus immutable execution selection derived from sc4. completedChunks continues to own only newly accepted results in selected plan order; retainedCoverage holds current chunkId -> exactly one {fromAttempt,fromChunkId,justification} link. A source may link to an earlier retained result; validate strictly decreasing attempt numbers, resolve to an actual accepted substantive result and preserve the chain. No forward links, cross-artifact/reviewer links, cycles, missing source or invalidated-source reuse. Fresh attempts own fresh baseline/inventory; start is sequential and explicit. Existing S1/S2 checkpoints without impact are full plans. Only the new review engine understands new optional fields; no legacy executable fallback is introduced. Admission/checkpoint evolution must explicitly allow appending latest.number+1 after a complete terminal report, while still freezing every prior attempt. Keep the separate existing invalidated+user-approved restart_full branch and require that branch to be full with no retained coverage; never relax the S2 mutation rule. Choose the immediately preceding complete report as comparison baseline, not an older convenient passed report; party mismatch forces full review and explicit reconciliation of known findings. [[c3]] [[c4]] [[c3]] [[c4]] [[c6]] Source resolution checks semantic coverage eligibility in addition to identity/ordering: every linked effective result must be passed/changes_requested with an empty limitations array, and the immediately preceding mapped chunk cannot be incomplete. Incomplete accepted feedback is preserved historically and its mandatory gaps require current fresh inspection, not retained coverage. [[c5]] [[c9]] The existing immutable initial submission remains attempt1 forever. Ordinary correction admission is a new explicit branch, not a replay of that submission; checkpoint evolution separately validates terminal-report sequential append and S2 invalidated+approved-full restart. The preparationKind marker lets nextDesignUnit distinguish an unplanned correction from an unplanned full restart without consulting or rewriting old attempts. [[c3]] [[c4]] [[c6]] On each same-attempt save checkEvolution compares the optional preparationKind field exactly (including absence), checks accepted impact immutability alongside plan, and prevents a partial plan/impact pair for impact-kind attempts. This is a per-field save invariant in addition to the distinct new-attempt growth rules. [[c3]] [[c9]]

```
DesignAttempt += impact?: DesignImpactAssessment; current.kind += 'impact'; DesignUnitAssignment.kind += 'impact'; DesignRequestSchemas.start.attempt := positive integer; controller phases += 'impact' with {plan,impact}; impact preparation outputs use the same strict bounded schema on both routes.; DesignResultSchema += findingDecisions?: readonly DesignFindingDecision[] (allowed only on fresh final-consistency output; required for impact attempts with baseline effective findings). Validated final output persists these decisions in completedChunks and feeds impactContext.findingDecisions into consolidation; no separate mutable decision ledger.; DesignAttempt += preparationKind?: planning | impact (immutable after admission; default planning for old checkpoints). Initial/restart_full=planning; ordinary sequential correction=impact. Schema start.attempt becomes positive and admit() dispatches replay vs sequential append without comparing N to immutable submitted.attempt=1. Controller impact schema has identity/generation/sequence plus separate plan and impact fields; native candidate is the equivalent {plan,impact} object.
```

**Call sites:**
- `src/workflow/review/design-review/contracts.ts`
- `src/workflow/review/design-review/checkpoint.ts`
- `src/workflow/review/design-review/recovery-state.ts`
- `src/workflow/review/design-review/coordinator.ts`

### 3.3 `DesignFindingDecision and effective findings` — new

Use source tuples {attempt,chunkId,findingId}, scoped to this review and canonical artifact. sc4 carriedFindingIds contains canonical JSON tuple strings derived by the host, not assumed globally unique bare ids. Initial impact carries all known effective findings; it cannot resolve them before inspection. A fresh final consistency result supplies bounded decisions carry/resolved/superseded for all baseline effective findings. Resolved/superseded requires current selected inspection references, rationale and evidence; superseded also points to an accepted current finding. Findings in untouched retained coverage cannot be silently resolved: select their owning chunk plus necessary consistency work, otherwise carry. Findings on removed sections still require evidence-backed disposition by the selected consistency/relevant chunk. No valid decision means carry; missing required reconciliation is incomplete rather than an optimistic pass. Counts deduplicate by source tuple, not message text. Prior result bodies and statuses are immutable. The concrete union and result transport below close the prior unspecified schema gap; the proposed type is defined in contracts.ts, used by result validation and consolidation, and persisted only inside the accepted final chunk. [[c9]] [[c5]] [[c1]] [[c5]] [[c9]] Proposed policy.ts integration: add a new designImpactPrompt alongside the existing designPlanningPrompt/designChunkPrompt and extend final-consistency guidelines to require evidence-backed finding decisions. These prompt additions do not exist yet; the listed file is a future implementation site. [[c15]]

```
Proposed strict tagged union in contracts.ts (no existing type is claimed):
interface DesignFindingOrigin { readonly attempt: number; readonly chunkId: string; readonly findingId: string; }
type DesignFindingDecision =
 | { readonly source: DesignFindingOrigin; readonly action: 'carry'; readonly rationale: string; readonly evidenceReferences: readonly string[]; }
 | { readonly source: DesignFindingOrigin; readonly action: 'resolved'; readonly rationale: string; readonly evidenceReferences: readonly string[]; readonly reviewedInChunkIds: readonly string[]; }
 | { readonly source: DesignFindingOrigin; readonly action: 'superseded'; readonly rationale: string; readonly evidenceReferences: readonly string[]; readonly reviewedInChunkIds: readonly string[]; readonly supersededBy: { readonly chunkId: string; readonly findingId: string; }; };
Common bounds: positive attempt, existing bounded IDs/text, nonempty rationale, 1..128 evidence references; resolved/superseded have 1..128 unique reviewedInChunkIds naming accepted fresh chunks in this attempt; supersededBy must resolve to an accepted current finding. Objects reject extra fields. findingDecisions has at most DESIGN_LIMITS.findings entries, each source tuple exactly once, all baseline effective findings accounted for. If effective finding count exceeds this bound, fail explicitly instead of truncating.
Transport: DesignResultSchema/DesignChunkResult adds optional findingDecisions; only fresh final-consistency may supply it. On an impact attempt with prior effective findings this field is mandatory, including explicit carry rows. assessDesignResult validates all source tuples and branch requirements with the attempt context before persistence; final accepted result is the single source for consolidation. Missing decisions or missing evidence prevent a completed/optimistic report; prior unresolved findings remain carried in the visible incomplete result. Initial reviews without impact preserve their existing result envelope. [[c1]] [[c5]] [[c9]]
```

**Call sites:**
- `src/workflow/review/design-review/contracts.ts`
- `src/workflow/review/design-review/results.ts`
- `src/workflow/review/design-review/policy.ts`

### 3.4 `DesignReviewConsolidated provenance` — field-add

Add optional sc4 scope/provenance and finding dispositions; initial all-fresh reports preserve existing fields. report.chunks contains fresh results only on selective attempts and is explicitly accompanied by retainedCoverage references and effective finding/status/coverage summaries. Effective view must cover every current plan chunk and inventory unit exactly as fresh or retained; fresh consistency is mandatory. Progress reports reviewed/retained/selected totals separately, never claims reused chunks were newly inspected. Bounded progress/assignment responses reference checkpoint paths for full history. Checkpoints are the only S3 store; S4 will consume these fields for permanent publication, lifecycle approval and cleanup. [[c3]] [[c5]] [[c6]] The consolidation invariant changes explicitly for selective attempts: complete plan IDs equal the disjoint union of fresh selected result IDs and eligible retained current IDs. No assumption results.length equals plan.chunks.length remains in the selective branch. Without impact, preserve the original all-fresh check. Per-inventory-unit coverage is then validated over this complete partition, while report.chunks stays fresh-only. [[c5]] [[c6]] The concrete report.impact projection is defined below in contracts.ts, validated by consolidation, and persists only as part of the immutable accepted report. Progress metadata remains bounded counts/status plus checkpoint path; it does not inline coverageOrigins or finding bodies. Consumers needing full provenance read the checkpoint report. [[c3]] [[c5]] [[c9]] [[c14]]

```
Proposed report-only projection types in contracts.ts; DesignReportImpact is distinct from the attempt's full sc4 DesignImpactAssessment:
type DesignCoverageOrigin =
 | { readonly chunkId: string; readonly kind: 'fresh'; }
 | { readonly chunkId: string; readonly kind: 'retained'; readonly fromAttempt: number; readonly fromChunkId: string; readonly justification: string; };
interface DesignReportImpact {
 readonly baselineAttempt: number;
 readonly mode: 'affected_chunks' | 'full';
 readonly coverageOrigins: readonly DesignCoverageOrigin[];
 readonly findingDecisions: readonly DesignFindingDecision[];
 readonly effectiveFindingOrigins: readonly DesignFindingOrigin[];
}
DesignReportSchema/DesignReviewConsolidated += impact?: DesignReportImpact;
Every nested object rejects extra fields. baselineAttempt/fromAttempt use positive attempt bounds and must refer backward within this review; IDs/text use existing strict bounded schemas. coverageOrigins has 1..DESIGN_LIMITS.chunks unique current chunk entries. findingDecisions/effectiveFindingOrigins have 0..DESIGN_LIMITS.findings entries, with unique source tuples; evidence and branch bounds reuse the defined DesignFindingDecision union. Exceeding bounds is explicit failure, never truncation. No prior result body or baseline content is copied into this projection.
The entire impact object is required when the current attempt has an accepted sc4 impact (including mode full), and absent for an initial/full-restart or existing pre-S3 attempt without impact. All its nested fields are required when present. baselineAttempt/mode must equal the accepted attempt.impact fields. coverageOrigins must cover the full current plan exactly once: fresh entries match report.chunks/selected executionOrder exactly, and retained entries exactly match accepted sc4 retainedCoverage (including their justification). A consistency chunk is always fresh. report.chunks remains fresh-only.
findingDecisions is the accepted fresh final consistency result's explicit decision array, or [] when omitted under the incomplete-reconciliation rule; it is a derived projection, not independently writable state. effectiveFindingOrigins lists every new current finding plus unresolved carried prior origin exactly once, excluding validly resolved or superseded origins (the replacement current finding remains). Missing required decisions imply unresolved carry AND an incomplete report, never an optimistic pass. Host defaults do not invent resolved decisions. Compute existing counts from the referenced immutable findings' severities; existing report.limitations includes all current mandatory gaps and missing-reconciliation limitations. Follow provenance to the true original finding rather than minting a new ID for reused feedback. [[c1]] [[c3]] [[c5]] [[c9]]
```

**Call sites:**
- `src/workflow/review/design-review/contracts.ts`
- `src/workflow/review/design-review/results.ts`
- `src/workflow/review/design-review/progress.ts`
- `src/workflow/review/design-review/checkpoint.ts`

### 3.5 `Impact relationships, bounds and ownership` — invariant-change

Relationships: review owns ordered attempts 1..128; each attempt owns baseline/inventory exactly1 and plan+impact 0..1 pair for a correction; current plan owns 2..128 chunks; each current substantive chunk has exactly1 coverage origin (fresh current result or referenced prior result); retained edge current chunk -> earlier same-review chunk is many-to-one across attempts but one-to-one for current semantic mapping. Each effective finding has exactly1 origin tuple and 0..1 current disposition. Preserve S1 subject/request/result/checkpoint byte bounds and S2 retry/action limits. Bound mapping rows/retained rows/selected ids to128, prior/current ids per mapping to128, selectors/changes/evidence to existing limits; accept no raw transcript/reasoning or artifact body in impact output. If larger legitimate scope exceeds limits, fail explicitly without truncating coverage or history. Relationship table/prose is sufficient; no new persistent database/entity ownership or UI layout is introduced. [[c1]] [[c9]]

**Call sites:**
- `src/workflow/review/design-review/contracts.ts`
- `src/workflow/review/design-review/checkpoint.ts`

### 3.6 `DesignReviewProgress selective counters` — field-add

Update DesignProgressSchema/DesignReviewProgress with the optional coverageProgress breakdown below and derive existing completedChunks/totalChunks consistently in both stored tracker snapshots and observeDesignCheckpoint, for native and controller routes. completedChunks remains the count of accepted fresh results only. Once plan/impact is accepted, totalChunks is executionOrder.length (selected chunks, including the fresh final consistency chunk), not the complete plan length. coverageProgress shows planned/selected/retained scope separately; effectiveCompletedChunks counts accepted fresh results plus retained origins and never asserts all mandatory evidence is verified. Report status can still be incomplete. Before a plan is accepted, use totalChunks=0 and omit coverageProgress; after a full/no-impact plan, selectedChunks=plannedChunks and retainedChunks=0. Existing checkpoints may omit the field and derive it on observation; do not rewrite old attempts. [[c1]] [[c6]] [[c9]] [[c14]]

```
DesignProgressSchema/DesignReviewProgress += coverageProgress?: { plannedChunks: number; selectedChunks: number; reviewedChunks: number; retainedChunks: number; effectiveCompletedChunks: number }. All counts are integers in 0..DESIGN_LIMITS.chunks; object rejects extra fields. plannedChunks=plan.chunks.length; selectedChunks=validated executionOrder.length; reviewedChunks=attempt.completedChunks.length; retainedChunks=impact?.retainedCoverage.length ?? 0; effectiveCompletedChunks=reviewedChunks+retainedChunks. Require plannedChunks=selectedChunks+retainedChunks, reviewedChunks<=selectedChunks, effectiveCompletedChunks<=plannedChunks; existing completedChunks=reviewedChunks and totalChunks=selectedChunks. A bad persisted/derived partition is invalid_checkpoint, never coerced into a percentage. [[c6]] [[c9]] [[c14]]
```

**Call sites:**
- `src/workflow/review/design-review/contracts.ts`
- `src/workflow/review/design-review/progress.ts`
- `src/workflow/review/design-review/coordinator.ts`

## 4. Diagrams

- [Sequence diagram](docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S003/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | Own impact analysis, mapping, conservative full fallback and retained/finding lineage; one accepted current plan+impact pair drives selective execution. A reviewer must consider implicit dependencies beyond text changes; host validates enumerated coverage and provenance. [[c1]] |
| `sc1` | consumes | Reuse subject resolution and complete artifact-specific chunk policy, including canonical Epic DEF/HLD/Story context versus standalone LLD and ISSUE-rooted LLD. No invented upstream requirements; preserve relevant visuals/citations. Current live paths, not commits, define design content. [[c1]] |
| `sc2` | consumes | Reuse atomic checkpoints, immutable earlier attempts, accepted chunk flushes and bounded progress; add only S3-owned impact/provenance metadata and truthful effective coverage. Reference prior baseline/history paths, never repeat document bodies in prompts. [[c1]] |
| `sc3` | consumes | Schedule impact as an existing supported phase with the same serial technical retries, user-directed pause, activity supervision and generation fencing. Any subject mutation during impact/execution invalidates the attempt; only explicit user-approved full restart may follow, with no retained coverage. External-file changes alone do not invalidate. [[c1]] |

## 6. Error paths

**Error cases**

- **Noncontiguous or overlapping subsequent attempt** (recoverable)
  - Detection: Compare request attempt to latest stored number, terminal complete report, canonical artifact identity and active subject registry. Explicitly distinguish no checkpoint, existing-attempt replay and latest+1 correction; never compare a legitimate new ordinal to the initial submitted.attempt=1. [[c4]] [[c9]]
  - Response: Reject without state replacement; observe exact admitted replays only. Paused/interrupted reviews use existing recovery; invalidated reviews require approved restart_full. [[c4]]
  - User impact: No duplicate review or accidental loss of unfinished work. [[c1]]
- **Impact output omits changed units or proposes invalid reuse** (recoverable)
  - Detection: Validate complete current plan, disjoint selected/retained partition, current inventory coverage, source tuples, same reviewer/artifact, mapping equivalence and fresh consistency selection. Check each retained source and every provenance link for passed/changes_requested status and empty limitations; reject reuse of incomplete coverage even when structural mapping matches. [[c1]] [[c5]]
  - Response: Validators throw raw DesignReviewError codes invalid_plan/invalid_result for malformed semantic output, or invalid_schema/invalid_json/input_too_large at the candidate decode boundary. At the reviewer-execution boundary, existing designTechnicalFailure() normalizes those errors to persisted DesignTechnicalFailure.code=invalid_output; only then apply the impact-unit sc3 retry/pause policy. Validators do not substitute invalid_output for their specific raw errors. Do not silently infer a replacement semantic impact decision. [[c5]] [[c9]] [[c13]]
  - User impact: Explicit technical failure instead of false complete selective review. [[c1]]
- **Impact cannot be bounded confidently** (recoverable)
  - Detection: Reviewer reports uncertainReason or unsupported mapping; host sees missing usable prior baseline or a legitimate mapping that cannot meet safe retention requirements. [[c1]] [[c5]]
  - Response: The reviewer must submit mode=full with explicit rationale, retainedCoverage=[] and every current substantive chunk selected whenever comparison context is unusable or impact is uncertain. A valid full candidate is accepted without spending an output retry. If the reviewer instead submits affected_chunks in that condition, validateDesignImpact throws raw invalid_plan/invalid_result; the execution boundary records invalid_output and consumes the existing current-impact-unit retry budget (initial plus three, then pause). The host never silently rewrites affected_chunks into full or starts another attempt. Known findings still require reconciliation. [[c1]] [[c5]] [[c13]]
  - User impact: More review work, with preserved correctness. [[c1]]
- **Corrupt checkpoint or corrupt trusted provenance state** (terminal)
  - Detection: No-follow bounded load, JSON/schema validation, identity checks or accepted provenance integrity fails for the stored checkpoint/history. This includes corrupt required baseline fields, not merely uncertainty about semantic impact. [[c3]] [[c9]]
  - Response: Preserve the specific terminal raw error: invalid_checkpoint, foreign_checkpoint, result_too_large for an oversized stored result, invalid_checkpoint_path for unsafe directories, invalid_project or invalid_review_id for noncanonical identity, or the existing persistence error. Preserve bytes and stop without model retry or automatic replacement/full review. These stored-state errors are outside designTechnicalFailure() retryable mappings; result_too_large here is distinct from model-candidate input_too_large. Recovery requires external diagnosis/repair and an explicit subsequent request; no reset of counters/history is implied. [[c3]] [[c13]]
  - User impact: A terminal state-integrity error is visible and cannot silently erase prior review or be treated as a successful fallback. [[c1]] [[c3]]
- **Readable history has no usable semantic comparison context** (recoverable)
  - Detection: Checkpoint and required fields are valid, but reviewer-party mismatch or uncertain current/prior semantic mapping prevents confident reuse; this is not JSON/schema corruption. [[c1]] [[c3]]
  - Response: The reviewer must submit mode=full with explicit rationale, retainedCoverage=[] and every current substantive chunk selected whenever comparison context is unusable or impact is uncertain. A valid full candidate is accepted without spending an output retry. If the reviewer instead submits affected_chunks in that condition, validateDesignImpact throws raw invalid_plan/invalid_result; the execution boundary records invalid_output and consumes the existing current-impact-unit retry budget (initial plus three, then pause). The host never silently rewrites affected_chunks into full or starts another attempt. Known findings still require reconciliation. [[c1]] [[c5]] [[c13]]
  - User impact: Correctness is preserved through a full review while genuine state corruption remains a separate terminal failure. [[c1]]
- **Subject changes during impact, selected execution or consolidation** (recoverable)
  - Detection: Existing subject monitor and boundary fingerprint checks compare canonical JSON/document to the new attempt baseline. [[c4]]
  - Response: Persist invalidated, cancel active generation, reject late output; notify user and require approved restart_full. Full restart discards selective reuse and runs all chunks. [[c1]] [[c4]]
  - User impact: No valid result for a moving artifact; explicit user control. [[c1]]
- **Reviewer omits or falsely closes a previous finding** (recoverable)
  - Detection: Enumerate baseline effective finding origin tuples; require disposition for each, fresh selected evidence for resolution, and current replacement finding for supersession. Host checks structure/provenance, not semantic truth. [[c1]] [[c5]]
  - Response: Carry unresolved findings by default; missing mandatory reconciliation evidence makes the final result incomplete. HIGH/MED still block via effective counts. [[c1]] [[c5]]
  - User impact: Earlier problems remain visible despite chunk regrouping or selective scope. [[c1]]
- **Technical failure or interruption of impact work** (recoverable)
  - Detection: Existing provider/controller error classification, trusted generation/sequence and active-tool/inactivity monitor. [[c4]] [[c13]]
  - Response: This case covers only retryable reviewer-execution/output failures and recoverable interruption under existing sc3. Retry only impact initial+three, persist before dispatch, then pause for user direction; interrupted unchanged work requires explicit resume. Preserve accepted plan+impact atomically and skip already accepted fresh chunks. Terminal storage/state failures belong to the separate corrupt-checkpoint, checkpoint-cap and execution-invariant cases; foreign owner/input rejection belongs to the untrusted-owner case and spends no model retry. [[c3]] [[c4]] [[c6]] [[c13]]
  - User impact: No repeated completed work and no automatic budget reset. [[c6]]
- **Reviewer candidate exceeds impact/result schema or payload bounds** (recoverable)
  - Detection: Strict candidate schema counts or decodeDesign UTF-8 request/result-byte limits reject model-produced plan/impact/result output before acceptance. This case excludes checkpoint serialization overflow and malformed incoming transport envelopes. [[c5]] [[c9]]
  - Response: Preserve the raw invalid_schema/input_too_large DesignReviewError from candidate validation/decode. At the reviewer-execution boundary designTechnicalFailure() maps it to persisted DesignTechnicalFailure.code=invalid_output; retry only the current unit within initial+three, then pause for user direction. Do not truncate legitimate findings/coverage or replace prior bytes. A malformed controller request is rejected at the request boundary without spending a model retry. [[c4]] [[c9]] [[c13]]
  - User impact: The failed reviewer unit may correct its bounded output; previously accepted work remains. Legitimate scope that cannot fit requires explicit user direction rather than silent omissions. [[c1]] [[c13]]
- **Checkpoint serialization exceeds the durable storage cap** (terminal)
  - Detection: saveDesignCheckpoint checks full serialized UTF-8 checkpoint against DESIGN_LIMITS.checkpointBytes (64 MiB) and raises checkpoint_too_large before rename. This includes a valid accepted candidate that would exceed total history capacity. [[c3]] [[c9]]
  - Response: Terminal nonretryable state/storage failure: preserve the last durable bytes, dispatch no later unit and expose failed/persistence-uncertain status under existing error handling. Do not retry a model, truncate history or pretend it paused. Existing recover/resume refuses failed attempts and restart_full requires invalidated status; overflow grants neither path. If terminal failure itself cannot be persisted, retain the last durable checkpoint and surface that uncertainty. User-directed diagnosis/storage or scope changes and a separately admitted new review may be needed; no automatic new review or extra retry budget is created. [[c3]] [[c4]] [[c13]]
  - User impact: The current execution cannot complete within the storage cap. All saved history remains available, but there is no claimed same-attempt recovery path for this failure. [[c1]] [[c3]]
- **Untrusted owner or mismatched controller impact response** (recoverable)
  - Detection: Before plan/impact/result dispatch, exchange checks live trusted owner.id, owner signal, current attempt, active generation, next sequence, phase/kind compatibility and saved replay signature. [[c4]] [[c9]]
  - Response: Reject with existing wrong_owner, stale_execution, invalid_sequence, invalid_phase or review_conflict; do not transfer ownership, accept output or consume a technical retry for malformed/foreign transport input. Actual disconnect follows sc3 interruption, not a fabricated retry. [[c4]] [[c13]]
  - User impact: A different session cannot submit or close another reviewer's work; the real owner can use existing recovery when appropriate. [[c1]] [[c4]]
- **Fresh-result order or checkpoint invariant violated during execution** (terminal)
  - Detection: nextDesignUnit/commit compares fresh results to selected executionOrder and checks uniqueness; checkEvolution compares preparationKind, accepted plan/impact, baseline and append-only result history on every save. [[c3]] [[c6]]
  - Response: Reject the invalid save and preserve prior bytes; invalid_checkpoint/immutable_history are hard nonretryable state failures, so stop dispatch and expose failure. A wrong chunk in a new candidate is invalid_result before persistence and follows that unit's existing output-retry policy. [[c3]] [[c5]] [[c13]]
  - User impact: No reordered, duplicated or silently reclassified work can appear complete; durable earlier work remains available. [[c1]] [[c3]]
- **Consolidation cannot prove the exact effective coverage partition** (terminal)
  - Detection: Consolidation recomputes P/S/R/F, verifies F=S, S intersect R empty and S union R=P, then resolves eligible origins and finding dispositions against accepted fresh/history records. [[c1]] [[c5]]
  - Response: Missing accepted selected results yields incomplete_review; corrupt origins/duplicate or overlapping durable coverage yields invalid_checkpoint, with no technical model retry. Leave the report unpublished/incomplete or failed as appropriate and preserve accepted chunks. A malformed proposed impact/result is rejected earlier as invalid_plan/invalid_result; missing reviewer reconciliation evidence is accepted incomplete with unresolved carry as assessDesignResult specifies. [[c3]] [[c5]] [[c13]]
  - User impact: No partial selective report passes approval or hides missing coverage; state errors need diagnosis rather than repeatedly spending model calls. [[c1]] [[c5]]
- **Preparation-kind mismatch before reservation** (terminal)
  - Detection: reserveDesignUnit compares its explicit/default preparationKind to the admitted immutable marker before creating or incrementing a reservation when chunk is absent. [[c6]] [[c9]]
  - Response: Throw invalid_checkpoint; mutate no reservation/counters/generation, start no reviewer call and spend no model retry. Existing owner failure reporting exposes the terminal state; no phase reinterpretation or automatic restart. [[c4]] [[c6]] [[c13]]
  - User impact: An internal scheduling mismatch cannot dispatch the wrong review phase or consume the remaining retry budget. [[c1]] [[c6]]
- **Malformed retained-source candidate** (recoverable)
  - Detection: Before accepting impact, resolve every retained link within the same canonical checkpoint history and reject nondecreasing/forward attempt numbers, cycles, foreign artifact/reviewer sources, nonexistent/malformed source results and invalidated source attempts. Consolidation revalidates accepted origins. [[c1]] [[c3]] [[c5]]
  - Response: This case covers a bad model candidate only: invalid_plan/invalid_result follows the impact-unit output retry budget. Do not silently reuse a different older result, invent missing feedback or remove prior findings. Already accepted corrupt provenance is the separate terminal corrupt-trusted-state case. [[c3]] [[c5]] [[c13]]
  - User impact: Invalid provenance cannot produce apparent verified coverage; valid earlier work stays preserved. [[c1]] [[c3]]
- **Invalid fresh-result cursor** (recoverable)
  - Detection: observeDesignCheckpoint checks cursor is a safe integer in 0..fresh accepted result count. [[c14]]
  - Response: invalid_cursor rejects only that read request without changing state or consuming retries. The caller may correct the cursor. [[c14]]
  - User impact: Pagination remains stable without extra review work. [[c1]] [[c14]]
- **Inconsistent accepted observation counts** (terminal)
  - Detection: observeDesignCheckpoint cannot derive the required selected/retained count equations from accepted state. [[c6]] [[c14]]
  - Response: Terminal invalid_checkpoint; no model retry, state rewrite or fabricated completion fraction. This is distinct from a bad read cursor. [[c3]] [[c13]] [[c14]]
  - User impact: Corrupt progress state cannot claim complete scope; durable evidence remains available for diagnosis. [[c1]] [[c14]]

**Edge cases**

| Input | Expected |
| :--- | :--- |
| No subject changes after a previous passed review | Reviewer may retain justified substantive coverage but must run fresh final consistency; current baseline and origins remain explicit. [[c1]] |
| Textually unchanged chunk depends on a changed shared interface or constraint | Select it indirectly, with rationale and affected upstream/cross-chunk consistency; no text-only exclusion rule. [[c1]] |
| Chunk renamed with equivalent selectors/concerns | Explicit one-to-one mapping may retain it if reviewer justifies semantic equivalence and dependency compatibility. [[c1]] |
| Split/merged/new/removed sections | Review affected regrouped chunks afresh; preserve prior finding lineage including removed sections. Expand to full when impact uncertain. [[c1]] |
| Previous report was semantically incomplete | Incomplete source coverage cannot be retained as verified. Select all chunks with limitations or unresolved mandatory coverage; preserve remaining limitations if current evidence is still unavailable. [[c1]] [[c5]] |
| Different derived independent reviewer party | No reuse across reviewer parties; full review with rationale. No caller-controlled party labels. [[c1]] [[c4]] |
| Referenced source/upstream files change while subject does not | Do not invalidate solely for those changes. Reviewer can voluntarily widen impact after consulting current context; unavailable evidence stays explicit. [[c1]] |
| Multiple correction attempts reference already retained coverage | Resolve strictly backward provenance to actual accepted result, preserve chain and avoid counting a finding twice; no copying as newly reviewed. [[c1]] [[c5]] |
| Concurrent reviews of independent subjects | Keep existing main-owned subject fences; impact analyses are serial per review, independent subjects remain allowed. [[c4]] |

**Invariants to preserve**

- Read latest live subject paths; baseline/history accessible by reference only, not repeated artifact bodies in prompts. [[c1]]
- Use existing serial activity-mode providers; no direct cloud REST, code-task grants, generic engine, activation flags or trust-key system. [[c2]]
- Existing accepted baselines, plans, chunks, unit counters, action outcomes and prior attempts remain immutable; S3 owns only additive impact/provenance semantics. [[c3]]
- S4 alone owns permanent history publication, approval and cleanup; S3 report is checkpoint-visible and makes no lifecycle-completion claim. [[c1]]

## 7. Test strategy

**Test framework:** `Existing TypeScript node:test plus node:assert/strict, run with tsx under Node22. Extend design-review fixture patterns discovered in the module and inspected directly; analyzer's broad test lookup was incomplete/off-topic, so no exhaustive graph-test claim.`

**Test levels**

- **contract** — Strict sc4 and additive attempt/report boundaries, bounded messages and complete source/evidence attribution. [[c8]] [[c10]]
  - Subjects: `Impact {plan,impact} envelope round-trips; missing/extra fields, byte/count limits and positive sequential attempt constraints reject without dispatch.`, `Complete current plan and selected/retained partition: no omitted/duplicate/unknown chunk, all consistency fresh, no unsafe split/merge retention, same artifact/reviewer backward-only sources.`, `Finding tuple identities and explicit dispositions: duplicate IDs across attempts/chunks do not conflate; unknown/resolved/superseded references reject or remain incomplete.`
  - Fixtures: `Existing S1/S2 checkpoint shapes and complete/incomplete report fixtures`, `Current/prior DEF/HLD/LLD inventories with changed ownership/interface/visual selectors`
- **unit** — Reviewer-led selection validation, conservative fallback and truthful effective consolidation. [[c8]] [[c10]]
  - Subjects: `Direct correction selects edited concern and indirect dependent chunks even when their text is unchanged; final consistency always executes.`, `Uncertainty, missing usable baseline, incompatible grouping or reviewer-party change produces explicit full mode without retained results.`, `Retained coverage remains references to immutable accepted source; full report counts include carried HIGH/MED/LOW and unresolved mandatory limits; no copied-as-fresh chunks.`, `Fresh final consistency must account for all prior effective findings; carry by default, evidence-backed resolution and supersession require selected inspection, including removed sections.`, `Atomic accepted plan+impact and prior attempt immutability; failed saves preserve last accepted bytes and dispatch zero further work.`, `Interleaved retention: full plan [keep-A, change-B, keep-C, final], completed fresh [change-B] selects final; out-of-order/duplicate fresh results reject, retained dependencies resolve by ID and receive zero dispatches. [[c6]]`, `Final findingDecisions strict union round-trip, missing/foreign/duplicate origins, branch-specific required fields, nonfinal rejection, unresolved carry on missing evidence, and valid resolved/superseded evidence references. [[c5]] [[c9]]`, `Selective consolidation exact partition: [keep-A, change-B, keep-C, final] accepts fresh [change-B, final] with retained A/C, and rejects absent C, duplicate/unknown origins, fresh/retained overlap or retained final; report.chunks remains fresh-only. Full mode and no-impact calls retain all-fresh behavior. [[c5]] [[c6]]`, `Incomplete retention rejection: a structurally identical prior chunk with status incomplete or nonempty limitations must be selected afresh on native and controller routes; reject bypass via an older passed source or an incomplete provenance link. Complete sibling chunks in an overall-incomplete prior report remain eligible. If fresh review still cannot verify mandatory coverage, keep the new report incomplete. [[c5]] [[c9]]`, `Every same-attempt marker mutation (planning to impact, impact to planning, explicit to absent, absent to explicit) rejects before save; accepted impact rewrite/removal or a half plan/impact pair rejects while previous checkpoint bytes stay unchanged. [[c3]] [[c9]]`, `Native/controller candidates invoke the same proposed validateDesignImpact and extended assessDesignResult contracts; output errors use the failed unit's retry budget, wrong-owner/transport and invalid stored-state errors do not. Missing final reconciliation is incomplete with conservative carry, never a fabricated resolution. [[c4]] [[c5]] [[c13]]`, `Retained-source rejection matrix at validateDesignImpact AND consolidation: reject forward or equal attempt link, a cycle, cross-artifact or cross-reviewer source, missing source attempt, missing/malformed source result, and invalidated source attempt; verify prior bytes unchanged and no false consolidated coverage. Model-candidate errors use impact retries, already accepted corrupt state stops without model retry. [[c1]] [[c3]] [[c5]] [[c13]]`, `Reservation preparationKind mismatch matrix: planning argument on an impact attempt, impact argument on a planning/missing-marker attempt, and omitted default-planning argument on an impact attempt all reject invalid_checkpoint before counters/actions/current change and with zero provider calls. Matching preparation kinds and regular chunk reservations remain valid. [[c6]] [[c9]] [[c13]]`, `Selective progress live/stored/native/controller: plan [keep-A, change-B, keep-C, final] shows fresh 1/2 then 2/2 with retained2, effective3/4 then4/4; full attempts preserve N/N with retained0; pre-plan omits breakdown; count bounds and cursor fresh-only semantics reject bad state/request without a model call. An incomplete final report still shows status incomplete even when all selected assessments returned. [[c6]] [[c9]] [[c14]]`, `Corrupt stored checkpoint JSON/schema is terminal invalid_checkpoint with no rewrite or retry; readable valid history with semantic uncertainty selects a full review only through valid admission. [[c3]] [[c13]]`, `Report.impact strict schema and projection: initial/pre-S3/full-restart report omits it; selective and correction-full reports require every declared field. Verify complete fresh/retained coverageOrigins, matching sc4/final-output fields, effective finding deduplication/counts, resolved/superseded exclusion, and carry+incomplete when reconciliation is missing. Reject partial objects, extra fields, wrong origin/justification, duplicate tuples and bounds overflow without silent truncation. [[c3]] [[c5]] [[c9]]`, `Distinguish reviewer output bound failures (current-unit retries then pause) from a checkpoint serialization cap failure (checkpoint_too_large terminal, zero automatic retries or later dispatch, prior bytes unchanged). Verify failed cannot use recover/resume or restart_full; if terminal persistence fails, uncertainty remains visible. Use disposable deterministic fixtures, not hosted model calls. [[c3]] [[c4]] [[c9]] [[c13]]`, `Round-7 correction cases: impact reservation and interrupted matching use current.kind=impact, while ordinary planning and chunk reservations retain their kinds; mismatches mutate nothing. Assert raw invalid_plan/invalid_result/invalid_schema/invalid_json/input_too_large at validator/decode boundaries and normalized invalid_output at the reviewer-execution diagnostic boundary. Stored-state invalid_checkpoint/foreign_checkpoint/result_too_large/invalid_checkpoint_path/invalid_project/invalid_review_id remain terminal with no model retry, and original bytes remain unchanged. [[c3]] [[c5]] [[c6]] [[c9]] [[c13]]`, `Consolidation has no separate findingDecisions input: extract only the accepted final consistency result array; verify report.impact equality, and omission yields [] with unresolved carry and incomplete. A forged second copy cannot override the accepted final result. [[c5]] [[c9]]`, `Uncertain/unusable comparison context accepts an explicit full-mode candidate without retry, but rejects an affected_chunks candidate with raw invalid_plan/invalid_result normalized to invalid_output and spends only the current impact-unit retry budget. The host never silently transforms candidate scope or creates another attempt. [[c5]] [[c13]]`
  - Fixtures: `Many-to-many changed-plan mapping and equivalent rename fixtures`, `Multi-attempt reference chains and duplicate-local-finding-id cases`
- **integration** — Native/controller behavior and workflow contexts with deterministic providers, no installed-daemon lifecycle changes. [[c8]] [[c10]]
  - Subjects: `Explicit next-attempt admission after terminal complete review; exact replay, conflicting identity, active/paused/invalidated paths and no automatic next attempt.`, `Both reviewer parties use identical impact schema/guidelines; selected units execute in dependency order, retained units make zero model calls, complete final consistency and visible provenance.`, `Impact crash/transport/schema failure preserves accepted work, spends at most initial+three per impact unit, pauses for user direction and resumes with no extra accepted-unit calls.`, `Mutation during blocked impact, selective execution and final save latches invalidation; restoration cannot revive; approved restart_full reviews every chunk without reuse.`, `Epic DEF/HLD/Story LLD versus standalone and ISSUE-rooted LLD resolve correct current context without invented upstream artifacts; external changes do not trigger invalidation.`, `Admission branch matrix: initial attempt1; exact historical replay after later attempts; latest+1 after each terminal complete report; skipped/unknown ordinal, different artifact, active subject, uncertain storage, paused/interrupted/invalidated/failed predecessor rejection. Original submitted.attempt stays1, all prior attempt bytes freeze, current baseline is fresh; save failure dispatches zero. [[c3]] [[c4]]`, `Checkpoint evolution accepts terminal-complete sequential impact append and separately accepts invalidated+approved full restart; cross-branch preparationKind, changed prior prefix, missing report, changed initial submission and skipped attempt reject. [[c3]]`, `Controller/native impact parity: phase impact/kind impact accepts the same complete plan+sc4 decision and commits them together before acknowledgement; plan/impact or impact/planning mismatches, foreign owners, stale generations/sequences, replay conflicts and malformed envelopes reject with the existing retry distinction. Normal MCP phase schema, unary RPC route and main-owner classification/audit stay in lockstep. [[c4]] [[c9]]`
  - Fixtures: `Existing designFixture and trusted controller owner fixtures`, `Virtual activity/tool clocks and injected persistence failures`, `Disposable project/home/socket and fake providers only`
- **smoke** — Compiled normal-entrypoint correction review and regression qualification without broad hosted re-execution. [[c8]] [[c10]]
  - Subjects: `Extend compiled disposable fake-CLI MCP/IPC smoke: full first review, corrected artifact, indirect impact, retained coverage, fresh consistency and auditable finding carry/resolution; inspect recorded call counts/provenance.`, `Typecheck/production build plus scoped design-review/MCP/schema/recovery regressions; existing code-review remains unaffected. S4 owns full approval/permanent-history/live rollout qualification.`
  - Fixtures: `Disposable isolated compiled owner/CLI fixture; do not restart installed daemon`, `Explicit synthetic-versus-hosted evidence labels and logs under /tmp`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Admission branch matrix: initial attempt1; exact historical replay after later attempts; latest+1 after each terminal complete report; skipped/unknown ordinal, different artifact, active subject, uncertain storage, paused/interrupted/invalidated/failed predecessor rejection. Original submitted.attempt stays1, all prior attempt bytes freeze, current baseline is fresh; save failure dispatches zero. [[c3]] [[c4]]`, `Controller/native impact parity: phase impact/kind impact accepts the same complete plan+sc4 decision and commits them together before acknowledgement; plan/impact or impact/planning mismatches, foreign owners, stale generations/sequences, replay conflicts and malformed envelopes reject with the existing retry distinction. Normal MCP phase schema, unary RPC route and main-owner classification/audit stay in lockstep. [[c4]] [[c9]]` |
| `ac2` | `Direct correction selects edited concern and indirect dependent chunks even when their text is unchanged; final consistency always executes.` |
| `ac3` | `Uncertain/unusable comparison context accepts an explicit full-mode candidate without retry, but rejects an affected_chunks candidate with raw invalid_plan/invalid_result normalized to invalid_output and spends only the current impact-unit retry budget. The host never silently transforms candidate scope or creates another attempt. [[c5]] [[c13]]` |
| `ac4` | `Selective consolidation exact partition: [keep-A, change-B, keep-C, final] accepts fresh [change-B, final] with retained A/C, and rejects absent C, duplicate/unknown origins, fresh/retained overlap or retained final; report.chunks remains fresh-only. Full mode and no-impact calls retain all-fresh behavior. [[c5]] [[c6]]`, `Incomplete retention rejection: a structurally identical prior chunk with status incomplete or nonempty limitations must be selected afresh on native and controller routes; reject bypass via an older passed source or an incomplete provenance link. Complete sibling chunks in an overall-incomplete prior report remain eligible. If fresh review still cannot verify mandatory coverage, keep the new report incomplete. [[c5]] [[c9]]`, `Retained-source rejection matrix at validateDesignImpact AND consolidation: reject forward or equal attempt link, a cycle, cross-artifact or cross-reviewer source, missing source attempt, missing/malformed source result, and invalidated source attempt; verify prior bytes unchanged and no false consolidated coverage. Model-candidate errors use impact retries, already accepted corrupt state stops without model retry. [[c1]] [[c3]] [[c5]] [[c13]]`, `Selective progress live/stored/native/controller: plan [keep-A, change-B, keep-C, final] shows fresh 1/2 then 2/2 with retained2, effective3/4 then4/4; full attempts preserve N/N with retained0; pre-plan omits breakdown; count bounds and cursor fresh-only semantics reject bad state/request without a model call. An incomplete final report still shows status incomplete even when all selected assessments returned. [[c6]] [[c9]] [[c14]]`, `Report.impact strict schema and projection: initial/pre-S3/full-restart report omits it; selective and correction-full reports require every declared field. Verify complete fresh/retained coverageOrigins, matching sc4/final-output fields, effective finding deduplication/counts, resolved/superseded exclusion, and carry+incomplete when reconciliation is missing. Reject partial objects, extra fields, wrong origin/justification, duplicate tuples and bounds overflow without silent truncation. [[c3]] [[c5]] [[c9]]`, `Consolidation has no separate findingDecisions input: extract only the accepted final consistency result array; verify report.impact equality, and omission yields [] with unresolved carry and incomplete. A forged second copy cannot override the accepted final result. [[c5]] [[c9]]` |
| `ac5` | `Mutation during blocked impact, selective execution and final save latches invalidation; restoration cannot revive; approved restart_full reviews every chunk without reuse.` |

## 8. Alternatives considered

### 8.1 a1: Attempt-local impact plan with referenced retained coverage — **CHOSEN**

One reviewer output supplies the current complete chunk plan plus sc4 scope; unaffected results remain references to immutable prior attempts.

Extend existing checkpoint attempts with a single accepted impact decision and explicit coverage origins. Subsequent completed-review corrections run one impact unit that reads the current document and prior checkpoint paths, proposes the complete current plan and direct/indirect selection, and records conservative full fallback. Fresh results and retained references stay distinct; final consistency reconciles prior findings. Reuse existing checkpoint, validation, activity and recovery services identified in discovery. [[c7]] [[c1]]

### 8.2 a2: Materialized effective result slots with source labels

Store a current-plan result slot for each chunk, containing fresh feedback or a labelled historical projection.

Use sc4 to record selection and copy retained historical feedback into separate current effective-result slots with immutable source-attempt/chunk labels. Keep fresh completedChunks separate, but persist an effective projection alongside it for readers and final consistency. Preserve original results and unresolved finding lineage while rebuilding the projection after accepted output. [[c7]] [[c1]]

**Rejected because:** Semantically viable but duplicates checkpoint feedback and adds a second effective-state projection without required user value.

## 9. References

- **[[c1]]** `prior-artifact` `.insrc/artifacts/HLD-9b04adb36cac716d.json`
- **[[c2]]** `stakeholder` `Project principles and review-design decisions supplied in this session: local CLI providers, current design paths, subject-only invalidation, explicit user restarts and identical reviewer behavior.`
- **[[c3]]** `code` `src/workflow/review/design-review/checkpoint.ts`
- **[[c4]]** `code` `src/workflow/review/design-review/coordinator.ts`
- **[[c5]]** `code` `src/workflow/review/design-review/results.ts`
- **[[c6]]** `code` `src/workflow/review/design-review/recovery-state.ts`
- **[[c7]]** `step-output` `s2/s3 alternatives generation step outputs, cited only by the two Alternatives considered approach descriptions`
- **[[c8]]** `prior-artifact` `.insrc/artifacts/DEF-9b04adb36cac716d.json`
- **[[c9]]** `code` `src/workflow/review/design-review/contracts.ts`
- **[[c10]]** `code` `src/workflow/review/design-review/__tests__/fixtures.ts`
- **[[c11]]** `code` `src/mcp/design-review/schema.ts`
- **[[c12]]** `code` `src/daemon/design-review-rpc.ts`
- **[[c13]]** `code` `src/workflow/review/design-review/technical-failure.ts`
- **[[c14]]** `code` `src/workflow/review/design-review/progress.ts`
- **[[c15]]** `code` `src/workflow/review/design-review/policy.ts`
- **[[c16]]** `code` `src/daemon/handler-runtime.ts`
- **[[c17]]** `code` `src/daemon/threads/method-class.ts`
- **[[c18]]** `code` `src/daemon/repo-call-audit.ts`

<!-- insrc:artifact LLD-9b04adb36cac716d-s3 -->

# LLD: STORY-9b04adb36cac716d-s3

## Summary

**Epic:** `review-evolving-designs-durable-checkpoints`
**HLD base run:** `wf-1793694252789-heyhey`
**HLD effective hash:** `20a9ee7f3bdf...`

Review corrected designs by assessing direct and indirect impact before selecting chunks. Preserve unaffected prior coverage with explicit provenance, carry unresolved findings forward, and run a fresh consistency check. Fall back to full review whenever safe reuse cannot be established. [[c8]] [[c1]]

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
- `DesignReviewError` when Noncontiguous attempt, mismatched artifact/project, active subject, untrusted party, invalid impact scope, byte/count bounds or persistence failure.

**Preconditions:**
- Initial attempt1 behaves unchanged. A subsequent start is only latest.number+1 after a terminal complete report (passed, changes_requested or incomplete), not pending/running/interrupted/paused/failed/invalidated. Recovery of an interrupted/paused attempt remains sc3; an invalidated attempt requires user-approved restart_full and never reuses coverage.
- Same review/attempt replay is observe-only; conflicting identity cannot replace pinned admission. Current live subject representations must be valid. No generic Git/HEAD diff defines design scope.
- These are proposed S3 behavioral extensions to existing start/exchange methods, not newly invented public wrapper interfaces. Existing unknown inputs are intentional trust boundaries, not missing schema definitions. [[c4]] [[c9]]

**Postconditions:**
- Append one new baseline/inventory, with prior attempts frozen. Choose the latest complete report as impact baseline only if artifact identity and reviewer party match; otherwise full review with explicit reason, no retained coverage.
- Subsequent impact unit returns {plan,impact}; initial and approved restart_full use ordinary full planning, never impact reuse. Monitoring starts before impact and aborts on subject mutation. No next-attempt admission occurs automatically from polling.

### 2.2 `validateDesignPlan`

```typescript
validateDesignPlan(input: unknown, inventory: DesignReviewInventory): DesignChunkPlan
```

**Parameters:**
- `input: unknown` — Complete current plan proposed with impact output, not a subset plan.
- `inventory: DesignReviewInventory` — Fresh inventory of the current DEF/HLD/LLD including relevant visuals and workflow references.

**Returns:** `DesignChunkPlan` — Existing complete inventory/selector/dependency validation. Selection is a separate sc4 decision. [[c5]] [[c1]]

**Errors:**
- `DesignReviewError` when Unknown, duplicate, omitted or inconsistent units/chunks/dependencies; final consistency absent or not last.

**Preconditions:**
- Validate complete current plan before validating its impact selection.

**Postconditions:**
- Every current inventory unit has substantive coverage; final consistency depends on all substantive chunks, including retained coverage. Changed grouping is represented explicitly, not silently treated as equivalent.

### 2.3 `nextDesignUnit`

```typescript
nextDesignUnit(attempt: DesignAttempt): { kind: 'planning' | 'impact' | 'chunk'; chunk?: DesignChunk | undefined } | undefined
```

**Parameters:**
- `attempt: DesignAttempt` — Current attempt, accepted impact selection and fresh completed results.

**Returns:** `{kind:'planning'|'impact'|'chunk';chunk?:DesignChunk}|undefined` — One unfinished unit. After a plan is accepted, derive executionOrder by filtering the full current plan in its existing dependency order to the validated selected substantive IDs plus every consistency ID. For a full or pre-S3 attempt without impact, executionOrder is the entire plan. Retained IDs never enter this vector. [[c6]] [[c1]] [[c6]] [[c1]]

**Errors:**
- `DesignReviewError` when Corrupt selection, missing provenance or fresh-results order that does not match selected execution order.

**Preconditions:**
- No current plan/decision mutation after acceptance; retained coverage must not appear in completedChunks.
- Validate the complete current plan first; validate selected/retained disjointness and exact coverage by ID. A retained chunk has a resolvable immutable source before it can satisfy a dependency. The full plan is never destructively shortened. [[c5]] [[c6]]

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
- `attempt: DesignAttempt` — Existing attempt-local durable reservation state.
- `chunk: DesignChunk` _(optional)_ — Fresh selected chunk; absent for planning or impact.
- `allowExtra: boolean` _(optional)_ — Existing user-approved one-dispatch grant after exhaustion.
- `recovering: boolean` _(optional)_ — Existing conservative interrupted reservation handling.
- `preparationKind: 'planning'|'impact'` _(optional)_ — Additive internal discriminator; default planning preserves S1/S2 callers. Impact uses its own unit id/phase.

**Returns:** `string` — Fresh fenced execution generation saved before dispatch. [[c6]] [[c1]]

**Errors:**
- `DesignReviewError` when Sealed unit, exhausted budget without direction, invalid user decision or changed subject.

**Preconditions:**
- Use existing sc3 initial+three retry policy; no new retry subsystem.

**Postconditions:**
- Impact planning failures consume only impact reservations. Controller/native routes share output schema, policy, activity and recovery semantics. No fixed deadline; active tools and real model activity retain S2 behavior.

### 2.5 `consolidateDesignReview`

```typescript
consolidateDesignReview(reviewId: string, attempt: number, subject: DesignReviewSubject, contentIdentity: string, plan: DesignChunkPlan, results: readonly DesignChunkResult[], impactContext?: { impact: DesignImpactAssessment; attempts: readonly DesignAttempt[]; findingDecisions: readonly DesignFindingDecision[] }): DesignReviewConsolidated
```

**Parameters:**
- `reviewId, attempt, subject, contentIdentity, plan, results: Existing consolidation arguments` — Current complete plan and fresh selected results; old all-fresh calls remain unchanged.
- `impactContext: Impact context with immutable source attempts and final finding dispositions` _(optional)_ — Validate retained origins, effective coverage and finding lineage without copying prior feedback as fresh.

**Returns:** `DesignReviewConsolidated` — Counts/status over fresh and retained effective coverage plus carried unresolved findings; exposes provenance and resolved/superseded dispositions. [[c5]] [[c1]]

**Errors:**
- `DesignReviewError` when Missing fresh selected result, unknown/mismatched origin, duplicate effective coverage, unresolved finding omitted, invalid resolution or changed baseline.

**Preconditions:**
- Final consistency is newly reviewed. Every current chunk is exactly fresh or explicitly retained. Known earlier findings, including LOW and incomplete coverage limitations, must be accounted for.
- Retention eligibility is validated when accepting impact and revalidated at consolidation: each referenced effective source chunk, including every backward provenance link, must have status passed or changes_requested and an empty limitations array. An incomplete result is accepted historical feedback but is not reusable verified coverage. Its corresponding current chunk must be selected for fresh review, even if selectors and text are unchanged. A report that is incomplete only because of other chunks does not disqualify a complete source chunk. Do not bypass an incomplete immediately preceding mapped chunk by citing an older passed result. [[c1]] [[c5]] [[c9]]

**Postconditions:**
- No unresolved earlier HIGH/MED disappears by selection, full fallback, rename or omission. Dispositions carry/resolved/superseded name immutable source tuples and evidence; resolving a finding requires fresh selected inspection and final confirmation.
- Optional execution omissions stay advice; mandatory evidence gaps yield incomplete. Reviewer semantics are not replaced by host textual inference.
- Replace the current unconditional results.length === plan.chunks.length check with two explicit branches. Without impactContext, retain the existing all-fresh exact-coverage invariant. With impactContext, define P as all unique chunk IDs in the complete current plan, S as selected substantive IDs plus all consistency IDs, R as retained current chunk IDs, and F as fresh result chunk IDs. Require unique IDs, S intersect R empty, S union R = P, F = S exactly, and fresh results in the selected executionOrder established by nextDesignUnit. Therefore fresh-result count equals selected executionOrder length, not complete plan length. Require one valid retained origin for every R entry; no consistency chunk may be retained. Unknown, duplicate, missing or overlapping coverage rejects consolidation. [[c5]] [[c6]] [[c1]]
- Compute mandatory inventory coverage and effective status/counts from that exact fresh-plus-retained partition and reconciled findings. Do not pad results or report.chunks with copies of retained results: both remain fresh-only, with explicit retained provenance alongside them. Full mode has R empty and S = P, so the same impact branch reduces to the original all-fresh case. [[c5]] [[c1]]
- For plan [keep-A, change-B, keep-C, final], fresh results [change-B, final] plus valid retained origins for keep-A and keep-C complete consolidation. The same fresh results without keep-C provenance reject; a retained change-B overlapping fresh change-B rejects; retained final rejects. A freshly re-reviewed chunk that remains incomplete is accepted feedback but keeps the new report incomplete and cannot become reusable verified coverage in a later attempt. [[c5]] [[c6]]

## 3. Data model changes

### 3.1 `DesignImpactAssessment (sc4)` — new

Attempt owns 0..1 accepted sc4 decision, immutable after acceptance. It records baselineAttempt, mode affected_chunks/full, changes, directChunkIds, indirectChunkIds, rationale, optional uncertainReason, chunkMapping, retainedCoverage, carriedFindingIds and consistencyChunkIds exactly as HLD sc4. The complete current plan is accepted atomically with it. Every substantive current chunk is selected or retained, disjointly; all consistency chunks are selected. Mapping may be many-to-many for explanation, but retaining requires an auditable one-to-one equivalent prior substantive chunk with matching selectors/concerns and compatible dependencies. Split, merged, added, removed, unsupported or ambiguous mappings force affected chunks or full fallback. Host validates structure/coverage/claims, reviewer assesses implicit semantics, ownership, constraints, interfaces, diagrams and workflow-specific requirements. Uncertainty promotes to full with retainedCoverage empty and direct+indirect union covering all current substantive chunks. [[c1]] [[c9]] [[c4]] [[c5]] Retention eligibility also requires source status passed or changes_requested with no mandatory limitations at every provenance link. An incomplete source, or any source with limitations, requires fresh selection of its mapped current chunk; structural equivalence alone is insufficient. Reject a proposed impact plan that retains ineligible coverage as invalid_output under the existing impact-unit retry policy. Do not silently drop the chunk, mark it complete or auto-alter the accepted selection. [[c5]] [[c9]]

**Call sites:**
- `src/workflow/review/design-review/contracts.ts`
- `src/workflow/review/design-review/coordinator.ts`
- `src/workflow/review/design-review/results.ts`
- `src/workflow/review/design-review/policy.ts`

### 3.2 `DesignAttempt impact execution and origins` — field-add

Proposed optional impact metadata and accepted-plan pair, plus immutable execution selection derived from sc4. completedChunks continues to own only newly accepted results in selected plan order; retainedCoverage holds current chunkId -> exactly one {fromAttempt,fromChunkId,justification} link. A source may link to an earlier retained result; validate strictly decreasing attempt numbers, resolve to an actual accepted substantive result and preserve the chain. No forward links, cross-artifact/reviewer links, cycles, missing source or invalidated-source reuse. Fresh attempts own fresh baseline/inventory; start is sequential and explicit. Existing S1/S2 checkpoints without impact are full plans. Only the new review engine understands new optional fields; no legacy executable fallback is introduced. Admission/checkpoint evolution must explicitly allow appending latest.number+1 after a complete terminal report, while still freezing every prior attempt. Keep the separate existing invalidated+user-approved restart_full branch and require that branch to be full with no retained coverage; never relax the S2 mutation rule. Choose the immediately preceding complete report as comparison baseline, not an older convenient passed report; party mismatch forces full review and explicit reconciliation of known findings. [[c3]] [[c4]] [[c3]] [[c4]] [[c6]] Source resolution checks semantic coverage eligibility in addition to identity/ordering: every linked effective result must be passed/changes_requested with limitations empty, and the immediately preceding mapped chunk cannot be incomplete. Incomplete accepted feedback is preserved historically and its mandatory gaps require current fresh inspection, not retained coverage. [[c5]] [[c9]]

```
DesignAttempt += impact?: DesignImpactAssessment; current.kind += 'impact'; DesignUnitAssignment.kind += 'impact'; DesignRequestSchemas.start.attempt := positive integer; controller phases += 'impact' with {plan,impact}; impact preparation outputs use the same strict bounded schema on both routes.; DesignResultSchema += findingDecisions?: readonly DesignFindingDecision[] (allowed only on fresh final-consistency output; required for impact attempts with baseline effective findings). Validated final output persists these decisions in completedChunks and feeds impactContext.findingDecisions into consolidation; no separate mutable decision ledger.
```

**Call sites:**
- `src/workflow/review/design-review/contracts.ts`
- `src/workflow/review/design-review/checkpoint.ts`
- `src/workflow/review/design-review/recovery-state.ts`
- `src/workflow/review/design-review/coordinator.ts`

### 3.3 `DesignFindingDecision and effective findings` — new

Use source tuples {attempt,chunkId,findingId}, scoped to this review and canonical artifact. sc4 carriedFindingIds contains canonical JSON tuple strings derived by the host, not assumed globally unique bare ids. Initial impact carries all known effective findings; it cannot resolve them before inspection. A fresh final consistency result supplies bounded decisions carry/resolved/superseded for all baseline effective findings. Resolved/superseded requires current selected inspection references, rationale and evidence; superseded also points to an accepted current finding. Findings in untouched retained coverage cannot be silently resolved: select their owning chunk plus necessary consistency work, otherwise carry. Findings on removed sections still require evidence-backed disposition by the selected consistency/relevant chunk. No valid decision means carry; missing required reconciliation is incomplete rather than an optimistic pass. Counts deduplicate by source tuple, not message text. Prior result bodies and statuses are immutable. The concrete union and result transport below close the prior unspecified schema gap; the proposed type is defined in contracts.ts, used by result validation and consolidation, and persisted only inside the accepted final chunk. [[c9]] [[c5]] [[c1]] [[c5]] [[c9]]

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

Add optional sc4 scope/provenance and finding dispositions; initial all-fresh reports preserve existing fields. report.chunks contains fresh results only on selective attempts and is explicitly accompanied by retainedCoverage references and effective finding/status/coverage summaries. Effective view must cover every current plan chunk and inventory unit exactly as fresh or retained; fresh consistency is mandatory. Progress reports reviewed/retained/selected totals separately, never claims reused chunks were newly inspected. Bounded progress/assignment responses reference checkpoint paths for full history. Checkpoints are the only S3 store; S4 will consume these fields for permanent publication, lifecycle approval and cleanup. [[c3]] [[c5]] [[c6]] The consolidation invariant changes explicitly for selective attempts: complete plan IDs equal the disjoint union of fresh selected result IDs and eligible retained current IDs. No assumption results.length equals plan.chunks.length remains in the selective branch. Without impact, preserve the original all-fresh check. Per-inventory-unit coverage is then validated over this complete partition, while report.chunks stays fresh-only. [[c5]] [[c6]]

**Call sites:**
- `src/workflow/review/design-review/results.ts`
- `src/workflow/review/design-review/progress.ts`
- `src/workflow/review/design-review/checkpoint.ts`

### 3.5 `Impact relationships, bounds and ownership` — invariant-change

Relationships: review owns ordered attempts 1..128; each attempt owns baseline/inventory exactly1 and plan+impact 0..1 pair for a correction; current plan owns 2..128 chunks; each current substantive chunk has exactly1 coverage origin (fresh current result or referenced prior result); retained edge current chunk -> earlier same-review chunk is many-to-one across attempts but one-to-one for current semantic mapping. Each effective finding has exactly1 origin tuple and 0..1 current disposition. Preserve S1 subject/request/result/checkpoint byte bounds and S2 retry/action limits. Bound mapping rows/retained rows/selected ids to128, prior/current ids per mapping to128, selectors/changes/evidence to existing limits; accept no raw transcript/reasoning or artifact body in impact output. If larger legitimate scope exceeds limits, fail explicitly without truncating coverage or history. Relationship table/prose is sufficient; no new persistent database/entity ownership or UI layout is introduced. [[c1]] [[c9]]

**Call sites:**
- `src/workflow/review/design-review/contracts.ts`
- `src/workflow/review/design-review/checkpoint.ts`

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
  - Detection: Compare request attempt to latest stored number, terminal complete report, canonical artifact identity and active subject registry.
  - Response: Reject without state replacement; observe exact admitted replays only. Paused/interrupted reviews use existing recovery; invalidated reviews require approved restart_full.
  - User impact: No duplicate review or accidental loss of unfinished work.
- **Impact output omits changed units or proposes invalid reuse** (recoverable)
  - Detection: Validate complete current plan, disjoint selected/retained partition, current inventory coverage, source tuples, same reviewer/artifact, mapping equivalence and fresh consistency selection. Check each retained source and every provenance link for passed/changes_requested status and empty limitations; reject reuse of incomplete coverage even when structural mapping matches.
  - Response: Reject malformed output as invalid_output in the impact unit and apply sc3 retry/pause policy. Do not silently infer a replacement semantic impact decision.
  - User impact: Explicit technical failure instead of false complete selective review.
- **Impact cannot be bounded confidently** (recoverable)
  - Detection: Reviewer reports uncertainReason or unsupported mapping; host sees missing usable prior baseline or a legitimate mapping that cannot meet safe retention requirements.
  - Response: Use full mode with no retained coverage and all current chunks selected. Record why; prior known findings still need reconciliation. Do not claim selective completeness.
  - User impact: More review work, with preserved correctness.
- **Corrupt or missing checkpoint source** (recoverable)
  - Detection: Existing bounded no-follow load and schema/integrity checks fail, or an explicit retained source attempt/result cannot be resolved.
  - Response: Corrupt checkpoint rejects admission without overwrite. A readable history lacking usable baseline information triggers full review, never invented reuse; unresolved known findings with unavailable required evidence remain carried/incomplete. Invalid referenced reuse is rejected.
  - User impact: No silent history loss or unexplained disappearance of prior blockers.
- **Subject changes during impact, selected execution or consolidation** (recoverable)
  - Detection: Existing subject monitor and boundary fingerprint checks compare canonical JSON/document to the new attempt baseline.
  - Response: Persist invalidated, cancel active generation, reject late output; notify user and require approved restart_full. Full restart discards selective reuse and runs all chunks.
  - User impact: No valid result for a moving artifact; explicit user control.
- **Reviewer omits or falsely closes a previous finding** (recoverable)
  - Detection: Enumerate baseline effective finding origin tuples; require disposition for each, fresh selected evidence for resolution, and current replacement finding for supersession. Host checks structure/provenance, not semantic truth.
  - Response: Carry unresolved findings by default; missing mandatory reconciliation evidence makes the final result incomplete. HIGH/MED still block via effective counts.
  - User impact: Earlier problems remain visible despite chunk regrouping or selective scope.
- **Technical failure or interruption of impact work** (recoverable)
  - Detection: Existing provider/controller error classification, trusted generation/sequence and active-tool/inactivity monitor.
  - Response: Retry only impact initial+three, persist before dispatch, then pause for user direction. Resume accepted plan+impact atomically and skip already accepted fresh chunks. Storage/owner/context errors retain existing nonretry behavior.
  - User impact: No repeated completed work and no automatic budget reset.
- **Impact/provenance exceeds bounded storage or payload limits** (recoverable)
  - Detection: Strict schema counts, UTF-8 byte checks and full checkpoint serialization bound before acceptance.
  - Response: Reject explicitly and retain previous checkpoint bytes; never truncate chunks, findings or coverage to fit.
  - User impact: An actionable failure instead of partial work reported as complete.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| No subject changes after a previous passed review | Reviewer may retain justified substantive coverage but must run fresh final consistency; current baseline and origins remain explicit. |
| Textually unchanged chunk depends on a changed shared interface or constraint | Select it indirectly, with rationale and affected upstream/cross-chunk consistency; no text-only exclusion rule. |
| Chunk renamed with equivalent selectors/concerns | Explicit one-to-one mapping may retain it if reviewer justifies semantic equivalence and dependency compatibility. |
| Split/merged/new/removed sections | Review affected regrouped chunks afresh; preserve prior finding lineage including removed sections. Expand to full when impact uncertain. |
| Previous report was semantically incomplete | Incomplete source coverage cannot be retained as verified. Select all chunks with limitations or unresolved mandatory coverage; preserve remaining limitations if current evidence is still unavailable. |
| Different derived independent reviewer party | No reuse across reviewer parties; full review with rationale. No caller-controlled party labels. |
| Referenced source/upstream files change while subject does not | Do not invalidate solely for those changes. Reviewer can voluntarily widen impact after consulting current context; unavailable evidence stays explicit. |
| Multiple correction attempts reference already retained coverage | Resolve strictly backward provenance to actual accepted result, preserve chain and avoid counting a finding twice; no copying as newly reviewed. |
| Concurrent reviews of independent subjects | Keep existing main-owned subject fences; impact analyses are serial per review, independent subjects remain allowed. |

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
  - Subjects: `Direct correction selects edited concern and indirect dependent chunks even when their text is unchanged; final consistency always executes.`, `Uncertainty, missing usable baseline, incompatible grouping or reviewer-party change produces explicit full mode without retained results.`, `Retained coverage remains references to immutable accepted source; full report counts include carried HIGH/MED/LOW and unresolved mandatory limits; no copied-as-fresh chunks.`, `Fresh final consistency must account for all prior effective findings; carry by default, evidence-backed resolution and supersession require selected inspection, including removed sections.`, `Atomic accepted plan+impact and prior attempt immutability; failed saves preserve last accepted bytes and dispatch zero further work.`, `Interleaved retention: full plan [keep-A, change-B, keep-C, final], completed fresh [change-B] selects final; out-of-order/duplicate fresh results reject, retained dependencies resolve by ID and receive zero dispatches. [[c6]]`, `Final findingDecisions strict union round-trip, missing/foreign/duplicate origins, branch-specific required fields, nonfinal rejection, unresolved carry on missing evidence, and valid resolved/superseded evidence references. [[c5]] [[c9]]`, `Selective consolidation exact partition: [keep-A, change-B, keep-C, final] accepts fresh [change-B, final] with retained A/C, and rejects absent C, duplicate/unknown origins, fresh/retained overlap or retained final; report.chunks remains fresh-only. Full mode and no-impact calls retain all-fresh behavior. [[c5]] [[c6]]`, `Incomplete retention rejection: a structurally identical prior chunk with status incomplete or nonempty limitations must be selected afresh on native and controller routes; reject bypass via an older passed source or an incomplete provenance link. Complete sibling chunks in an overall-incomplete prior report remain eligible. If fresh review still cannot verify mandatory coverage, keep the new report incomplete. [[c5]] [[c9]]`
  - Fixtures: `Many-to-many changed-plan mapping and equivalent rename fixtures`, `Multi-attempt reference chains and duplicate-local-finding-id cases`
- **integration** — Native/controller behavior and workflow contexts with deterministic providers, no installed-daemon lifecycle changes. [[c8]] [[c10]]
  - Subjects: `Explicit next-attempt admission after terminal complete review; exact replay, conflicting identity, active/paused/invalidated paths and no automatic next attempt.`, `Both reviewer parties use identical impact schema/guidelines; selected units execute in dependency order, retained units make zero model calls, complete final consistency and visible provenance.`, `Impact crash/transport/schema failure preserves accepted work, spends at most initial+three per impact unit, pauses for user direction and resumes with no extra accepted-unit calls.`, `Mutation during blocked impact, selective execution and final save latches invalidation; restoration cannot revive; approved restart_full reviews every chunk without reuse.`, `Epic DEF/HLD/Story LLD versus standalone and ISSUE-rooted LLD resolve correct current context without invented upstream artifacts; external changes do not trigger invalidation.`
  - Fixtures: `Existing designFixture and trusted controller owner fixtures`, `Virtual activity/tool clocks and injected persistence failures`, `Disposable project/home/socket and fake providers only`
- **smoke** — Compiled normal-entrypoint correction review and regression qualification without broad hosted re-execution. [[c8]] [[c10]]
  - Subjects: `Extend compiled disposable fake-CLI MCP/IPC smoke: full first review, corrected artifact, indirect impact, retained coverage, fresh consistency and auditable finding carry/resolution; inspect recorded call counts/provenance.`, `Typecheck/production build plus scoped design-review/MCP/schema/recovery regressions; existing code-review remains unaffected. S4 owns full approval/permanent-history/live rollout qualification.`
  - Fixtures: `Disposable isolated compiled owner/CLI fixture; do not restart installed daemon`, `Explicit synthetic-versus-hosted evidence labels and logs under /tmp`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Explicit next-attempt admission and direct correction impact; accepted plan+impact reference prior baseline/feedback; unchanged chunks are retained without model calls.` |
| `ac2` | `Unchanged dependent text selected by changed shared interface/constraint; fresh final cross-chunk/upstream consistency and explained scope.` |
| `ac3` | `Uncertainty/missing usable baseline/regrouping triggers full-mode explicit rationale; no invented selective completeness.` |
| `ac4` | `Immutable retained origins, multi-attempt chains, carried blockers, removed sections, duplicate local IDs, disposition evidence and mandatory-coverage limits consolidate truthfully.`, `Exact fresh/retained coverage partition at consolidation and mandatory fresh reselection of incomplete source chunks, including chained/older-source bypass attempts.` |
| `ac5` | `Mutation during impact/execution/final save invalidates, fences late output and restoration; explicit approved full restart uses no retained chunks.` |

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
- **[[c7]]** `step-output` `s4 contract.detail; s5 error.paths; s6 test.strategy; s2/s3 alternatives`
- **[[c8]]** `prior-artifact` `.insrc/artifacts/DEF-9b04adb36cac716d.json`
- **[[c9]]** `code` `src/workflow/review/design-review/contracts.ts`
- **[[c10]]** `code` `src/workflow/review/design-review/__tests__/fixtures.ts`

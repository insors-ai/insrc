<!-- insrc:artifact LLD-a8c4399a90185f7f-s1 -->

# LLD: STORY-a8c4399a90185f7f-s1

## Summary

**Epic:** `enforce-all-inclusive-review-budgets-exclude`
**HLD base run:** `wf-1793077725711-mh0dn5`
**HLD effective hash:** `a8c4399a9018...`

Make the configured128K allowance an inclusive estimated context budget for each review call, so instructions, schemas, native/tool overhead, completion and inspection growth reduce the material that fits. Reuse the existing evidence-preserving splitter and serial driver, exclude generated JSONL histories before review freshness selection, and record content-free per-call outcomes. Native CLI reservations are explicitly estimated, not measured or a proven hard ceiling; the stronger native-ceiling interpretation remains an approval question. Total execution time is10 minutes per current logical work chunk and is recalculated after subdivision, rather than frozen at the initial20-minute allocation.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `createReviewJob`

```typescript
createReviewJob(adapter: ReviewAdapter<unknown>, path: ReviewPath, snapshot: ReviewMaterialSnapshot, limitChars: number, opts: CreateJobOpts & { budgetPolicy: ReviewBudgetPolicy }): ReviewPipelineJob
```

**Parameters:**
- `budgetPolicy: ReviewBudgetPolicy` — Required provider-qualified frozen policy, prepared before job construction at every production entry; never inferred only from configuration.

**Returns:** `ReviewPipelineJob` — Job whose every planned request fits the inclusive policy; same splitter/gather graph and deadline semantics.

**Errors:**
- `ReviewBudgetError` when Invalid policy, unqualified missing overhead profile, mandatory context or indivisible material cannot fit.

**Preconditions:**
- Positive safe cap; execution profile/reserves available; adapter material stable.
- The selected provider/profile or explicitly declared controller-reserved profile is available before any planning measurement.

**Postconditions:**
- Cap is total context allowance, not payload allowance.
- Every candidate includes enveloped messages and wire-schema allowance plus all reserves.
- No required evidence is truncated or silently omitted.

### 2.2 `runReviewJob`

```typescript
runReviewJob(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, provider: LLMProvider, opts?: RunReviewJobOpts): Promise<unknown>
```

**Parameters:**
- `job: ReviewPipelineJob` — Carries frozen inclusive policy and admitted calls.
- `opts: RunReviewJobOpts` _(optional)_ — Existing cancellation/progress hooks; additive completion/failure observation for content-free terminal events.

**Returns:** `Promise<unknown>` — Existing validated review result, with no successful result for refused or aborted execution.

**Errors:**
- `ReviewBudgetError` when Fresh dispatch measurement exceeds the saved cap or cannot qualify.

**Preconditions:**
- Provider preparation/serialization uses the same immutable budget contract.
- Calls remain sequential.

**Postconditions:**
- Preflight before every provider call, including corrections and gather/reduction.
- Exactly one start and one terminal event per issued call.
- No provider invocation after failed admission; no prompt/transcript logging.
- ReviewBudgetError bypasses generic retry and stage partial-result policies; no exception may turn a refused budget into a successful review.

### 2.3 `promptChars`

```typescript
promptChars(messages: readonly LLMMessage[]): number
```

**Parameters:**
- `messages: readonly LLMMessage[]` — Existing exact serialized message text, including system/assistant headings.

**Returns:** `number` — Diagnostic serialized text length only; never alone treated as an inclusive budget.

**Preconditions:**
- Existing valid message input.

**Postconditions:**
- Preserve this helper's text-length meaning for compatibility; replace independent budget comparisons with the shared estimator.

### 2.4 `runReadOnlyToolLoop`

```typescript
runReadOnlyToolLoop(args: ReadOnlyToolLoopArgs & { reviewBudget?: ReviewExecutionBudget }): Promise<ReadOnlyToolLoopResult>
```

**Parameters:**
- `reviewBudget: ReviewExecutionBudget` _(optional)_ — Optional review-only guard for accumulated conversation, actual tool definitions/results, next output allowance and final emission.

**Returns:** `Promise<ReadOnlyToolLoopResult>` — Existing loop result; complete evidence retained; no automatic truncation or fabricated answer when budget runs out.

**Errors:**
- `ReviewBudgetError` when Accumulated conversation/tools plus next output cannot fit.

**Preconditions:**
- Existing read-only allowlist, lifetime, cancellation and deadline checks remain authoritative.

**Postconditions:**
- Re-estimate before every managed model turn; a large tool result can be retained for diagnostics but is never sent over budget.
- Non-review analyzer callers without budget retain existing behavior.

### 2.5 `emitStructuredAnswer`

```typescript
emitStructuredAnswer<T>(args: StructuredAnswerArgs & { reviewBudget?: ReviewExecutionBudget }): Promise<T>
```

**Parameters:**
- `reviewBudget: ReviewExecutionBudget` _(optional)_ — Guard full closing instruction, final schema and accumulated history, not just initial inspection prompt.

**Returns:** `Promise<T>` — Existing validated final answer.

**Errors:**
- `ReviewBudgetError` when Final answer request cannot fit after tool history or normalization.

**Preconditions:**
- Full final wire-schema allowance included.

**Postconditions:**
- No exemption for the final structured answer or provider internal retry.

## 3. Data model changes

### 3.1 `ReviewBudgetPolicy (proposed, in-memory)` — new

One frozen per-job policy owns totalTokens (existing review.chunkTokens, default128000), estimator='chars-per-token-v1' with3 UTF-16 text characters per estimated token, policyVersion, executionKind and explicit reserves. Proposed defaults: native/tool hidden framing16384 tokens, transport margin1024, completion including reasoning8192, plus24576 inspection/history tokens for reviewer sessions (0 for single structured calls). Packer retry headroom remains8000 characters, accounted once. These are engineering reservations, not observed native usage. Planning budget = estimated full enveloped prompt + wire schema + known tool definitions + native/transport/completion/inspection reservations + retry headroom; each inclusive sum <= totalTokens. At128K this leaves75157 estimated tokens before actual prompt/schema/known tools in a reviewer candidate. The exact budgeting choice is proposed for LLD approval; no claim that this estimator bounds actual tokenizer output. Production policy construction MUST receive a provider-qualified wire profile before planning; it cannot infer a provider from review configuration. No missing-provider production default is permitted. A profile is immutable serializable data, not a function in a frozen snapshot.

**Call sites:**
- `src/workflow/review-pipeline/limit.ts`
- `src/workflow/review-pipeline/job.ts`
- `src/workflow/review-pipeline/code-review.ts`
- `src/workflow/review-pipeline/adapters/code-review-gather.ts`
- `src/workflow/review-pipeline/adapters/code-review-duplicates.ts`

### 3.2 `ReviewBudgetBreakdown (proposed)` — new

Immutable numeric fields: limitTokens, promptChars/promptTokens, schemaChars/schemaTokens, declaredToolsChars/declaredToolsTokens, nativeReserveTokens, transportReserveTokens, completionReserveTokens, inspectionReserveTokens, retryHeadroomTokens, estimatedTotalTokens, remainingTokens, estimatorVersion and qualification ('managed-estimate'|'reserved-native'). Do not use the word measured for native reserves. Measure complete provider wire schema or a proven conservative representation including strict-schema/envelope changes; unsupported normalization must refuse. Prompt, schema and tool text are counted once. Planning includes prospective retry headroom; dispatch counts an actual correction in prompt text and consumes, rather than duplicates, that headroom. Existing ReviewCall.chars stays serialized prompt length; add the breakdown separately. Every budget comparison, including gather/relation/duplicates, uses the shared total rather than local sentChars arithmetic.

**Call sites:**
- `src/workflow/review-pipeline/envelope.ts`
- `src/workflow/review-pipeline/types.ts`
- `src/workflow/review-pipeline/job.ts`
- `src/workflow/review-pipeline/driver.ts`

### 3.3 `ReviewExecutionBudget on provider options (proposed)` — field-add

Additive optional reviewBudget to ReviewSessionOpts and review-scoped structured completion options in src/shared/types.ts. Contains immutable policy, admitted breakdown, output allowance, native qualification and call identifiers, never source content. Managed Ollama loops remeasure all actual conversation/tool/schema text before every request and apply the supported output limit. CLI providers recheck final serialized prompt and schema, apply only documented and locally verified invocation controls, and identify their additional internal context as reserved-native. A missing/unsupported reserve profile errors explicitly; native context controls do not automatically upgrade qualification to hard-bounded. No config file rewrites or API credentials. Relationship ownership: one job owns one policy; one job issues0..N immutable calls; each call has exactly one admission breakdown and0..N managed-turn rechecks; providers consume copies, never mutate the job;0..N content-free progress events cite a call ID.

**Call sites:**
- `src/shared/types.ts`
- `src/agent/providers/cli-provider.ts`
- `src/agent/providers/ollama.ts`
- `src/agent/read-only-tool-loop.ts`

### 3.4 `ReviewCall lifecycle event (proposed)` — new

Persist start/success/failure/cancel/refused event metadata through existing getLogger and existing progress callback. Fields: reviewId, dimension, stage, role, callId, chunkId/obligation key where present, attempt, provider/transport label, policy and estimator versions, qualification, budget breakdown, monotonic durationMs and stable outcome/errorCode. Omit prompts, schemas, source/transcript bodies, tool arguments/results, raw error messages and credentials; allowlisted error categories only. A terminal record is emitted in finally/error paths even when the whole dimension has no finished plan. Retain existing prepared/finished logs for compatibility. No new storage database or usage-artifact telemetry schema.

**Call sites:**
- `src/workflow/review-pipeline/driver.ts`
- `src/workflow/review-pipeline/code-review.ts`
- `src/workflow/review-pipeline/types.ts`

### 3.5 `Generated ledger changed-file exclusion` — invariant-change

Extend existing flat .insrc/artifacts/*.json exclusion to flat generated *.jsonl alongside it. Apply before review subject/freshness and both graph/diff material assembly through the existing shared seam. Do not exclude nested .insrc/artifacts/templates/** or formats/**, user code/config, or user-authored nested JSONL. History remains stored and cited as provenance; exclusion only removes generated histories from code-change input and index freshness requirements.

**Call sites:**
- `src/workflow/runners/build/changed-files.ts`
- `src/workflow/code-review/subject.ts`
- `src/workflow/code-review/__tests__/diff-attribution.test.ts`

### 3.6 `Provider wire-budget preparation contract (proposed)` — new

Add an optional pure getReviewBudgetProfile capability to LLMProvider; existing CliProvider/OllamaProvider implementations return a validated serializable ReviewProviderBudgetProfile with providerId/transport/version, schemaDialect, declared tool manifest where observable, native/transport/output/inspection reserve values and explicit managed-estimate or reserved-native qualification. Missing capability is a typed native-budget-unqualified error for a budgeted production review, not an implicit zero-cost profile. Test providers supply explicit synthetic profiles. The profile selects the same pure schema normalizer used by the provider (Codex strict schema via existing codexStrictSchema in structured-output.ts; Claude JSON; Ollama JSON format). The single budget module measures the exact normalized wire-schema representation, not just the logical schema. Native hidden headers/tools remain a disclosed reserve, never hard-measured. Normalize on immutable copies and include the envelope wrapper. Production runDimensionJob in code-review.ts, grounded review in review/review.ts and runTemplateReview in review/template-review.ts all resolve the selected provider profile BEFORE createReviewJob, pass it in the frozen budget policy, and reuse/revalidate it at runReviewJob dispatch. The driver rejects mismatched provider/profile/normalizer versions. Controller step paths without an owned provider require an explicitly declared controller-reserved profile and must not claim to bound the host conversation; a missing profile refuses rather than bypassing admission. No provider SDK types enter shared application contracts.

**Call sites:**
- `src/shared/types.ts`
- `src/agent/providers/cli-provider.ts`
- `src/agent/providers/ollama.ts`
- `src/workflow/review-pipeline/code-review.ts`
- `src/workflow/review/review.ts`
- `src/workflow/review/template-review.ts`
- `src/workflow/review-pipeline/job.ts`
- `src/workflow/review-pipeline/driver.ts`

### 3.7 `Required-neighbour evidence admission (changed existing fallback)` — new

prepare.ts currently drops neighbour summaries using neighbours.slice(0,-1) if a singleton plus required usage evidence exceeds the hard limit. That branch MUST be removed for required call/reference evidence. Optional same-file/directory context may be added only while it fits, but required usage neighbours are never relabelled optional or omitted. If supported atom/relationship batching can preserve the complete required references it may be used; otherwise fail explicitly with required-context-over-budget before any model call. This is a deliberate correction to current behavior, not unchanged splitter reuse. Update the existing pipeline-job omission-expecting test to expect refusal, and separately prove optional context can be omitted without removing required relationship evidence. Preserve all core atoms and obligations; no smaller budget may silently reduce review accuracy.

**Call sites:**
- `src/workflow/review-pipeline/prepare.ts`
- `src/workflow/review-pipeline/job.ts`
- `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts`
- `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts`

### 3.8 `Correction admission and terminal budget errors (changed existing fallbacks)` — new

ReviewBudgetError is a typed Error with stable code, stage/call IDs and numeric breakdown; it contains no prompt/schema/tool body. driver.ts MUST recognize it before generic classify/applyFailure and rethrow it unchanged after one terminal lifecycle event. It must never become transient, stall, record-not-judged or record-observation, even in grounded design-review verify stages. Replanning is allowed only as a deliberate earlier pure packing operation that preserves complete evidence; the driver does not catch a budget failure and quietly retry. In job.ts invalid-answer correction handling MUST replace the existing oversized-correction fallback: never reissue call.prompt without its required correction. Admit the full corrected prompt with consumed retry headroom; if it does not fit, explicitly replan with correction included and fresh call IDs where the stage supports complete evidence preservation, otherwise throw correction-budget-exceeded before a new issue/provider call. No fresh retry is issued from the old uncorrected prompt. Tests must cover both fail-review and record-not-judged/record-observation stage policies and assert no partial-success conversion.

**Call sites:**
- `src/workflow/review-pipeline/job.ts`
- `src/workflow/review-pipeline/driver.ts`
- `src/workflow/review-pipeline/design-review.ts`
- `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts`

### 3.9 `Review-scoped source-safe failure logging (changed existing logs)` — new

Sanitize existing logs as well as new lifecycle events: driver.ts currently logs detail from err.message on failures, and CliProvider.runReviewSession logs err:msg on stall/transient paths before rethrow, even with internalRetry=false. For calls carrying reviewBudget, replace those source-bearing fields with allowlisted errorCode/classification, stage/call/chunk IDs, attempt, duration and numeric budget only. Audit review-scoped downstream subprocess/provider diagnostics for the same content-bearing fields; never forward raw reason arrays or provider/model error text to persistent review logs. Do not change unrelated non-review logging. The sentinel-leak test captures every relevant logger at driver and provider layers, including stalls, transient errors, invalid-answer corrections, refused admission and cancellation, rather than checking only the newly added event sink.

**Call sites:**
- `src/workflow/review-pipeline/driver.ts`
- `src/agent/providers/cli-provider.ts`
- `src/workflow/review-pipeline/job.ts`

### 3.10 `Controller review emission budget and versioned continuation (proposed)` — field-add

Cover BOTH controller implementations. Code review: src/daemon/steps/code-review-step/handler.ts emitJudgementsResult currently returns all dimension prompts plus grounding directly. Design review: src/daemon/steps/review-step/phases/start.ts directly emits buildTemplateReviewPrompt or buildExtractPrompt, while phases/claims.ts emits buildBatchedVerifyPrompt. These are review requests too and MUST NOT bypass inclusive admission. Add an optional reviewBudget declaration to both registered MCP input envelopes and corresponding input types: budgetProtocolVersion, declared hostContextReserveTokens and estimator qualification/profile ID. It is required only on controller-routed start/resume emissions; daemon-routed requests use the selected provider profile. The central policy factory constructs an explicit controller-reserved profile from that declaration, validates safe positive reserves and pins the server cap/version; a caller may lower its available budget but never raise the configured total. Missing, negative, malformed or unsupported declarations return controller-budget-required/unqualified before any prompt is emitted. Host reserve is caller-declared estimated context, not server-measured or proof of a native limit. No implicit zero-cost host or provider fallback. Every new controller input schema documents this qualification. In verified-hard-native mode an unverified external host is ineligible.

**Call sites:**
- `src/daemon/steps/code-review-step/handler.ts`
- `src/daemon/steps/code-review-step/types.ts`
- `src/daemon/steps/code-review-step/state-store.ts`
- `src/daemon/steps/review-step/phases/start.ts`
- `src/daemon/steps/review-step/phases/claims.ts`
- `src/daemon/steps/review-step/types.ts`
- `src/daemon/steps/review-step/state-store.ts`
- `src/workflow/review-pipeline/job.ts`

### 3.11 `Complete controller response accounting and subdivision (proposed)` — invariant-change

Before emitting ANY controller-facing prompt/schema frame, estimate the entire final serialized tool response once, including all prompt blocks, schemas, grounding/metadata and state-token/framing text actually returned, plus declared host/native/output reserves. A response carrying four individually fitting dimension prompts is NOT admitted unless the combined frame fits. Never append an unmeasured whole grounding after admission. When an aggregate response is too large, drive the existing pure review-pipeline createReviewJob/nextCalls/applyOutput stages through versioned controller state and return one admitted pending call per MCP turn, using its actual callId/schema and only assigned material plus required context. Code-review dimensions aggregate only after every required chunk/gather/relation call completes. Controller replies use the new versioned callId/answer envelope in the existing judgements/findings/claims/verdicts outer phases; raw legacy whole-result replies cannot bypass the matching call/policy. Missing/duplicate/mismatched call IDs refuse. For template and extraction/verification design paths, reuse the corresponding existing adapters and evidence/claim-ID validators; perform deterministic evidence gathering only after the required extraction calls complete and retain every claim in verification/gather. An unsupported stage subdivision or indivisible mandatory frame must fail explicitly before emission; do not truncate, drop dimensions/claims or accept a partial completed artifact. Existing outer tool names/phases remain, but new controller continuation payloads are versioned and old controller clients need to supply the declaration/envelope contract.

**Call sites:**
- `src/daemon/steps/code-review-step/handler.ts`
- `src/daemon/steps/review-step/phases/start.ts`
- `src/daemon/steps/review-step/phases/claims.ts`
- `src/workflow/review-pipeline/code-review.ts`
- `src/workflow/review-pipeline/design-review.ts`
- `src/workflow/review-pipeline/job.ts`
- `src/workflow/review/template-review.ts`
- `src/workflow/review/review.ts`

### 3.12 `Controller budget resume validation (actual stores, proposed new state)` — field-add

Persist budget protocol version, frozen server policy/profile, pending call IDs, required evidence snapshot and controller pipeline continuation only in the existing code-review-step and review-step state stores. This is a NEW continuation payload: current daemon pipeline jobs are ephemeral and current controller tokens contain subject/grounding or design intent/claims/evidence, not an already-persisted ReviewPipelineJob. Validate version/profile identity and current declaration before code-review start/confirm_wait/judgements resumes and design-review start/claims/verdicts/findings resumes. A fresh host-context declaration is required before each next emitted frame because the external conversation can grow; it can increase the host reserve or reduce room but cannot mutate the pinned server cap/estimator/native qualification. Pre-upgrade tokens without the new protocol fail review-budget-state-stale. Budget errors precede frame emission or final artifact write, do not trigger generic retry/partial-result policies, and do not consume a successfully reusable state on a mere missing declaration. Completed review artifacts are written only after all pending required obligations are validated; stale or replayed calls cannot complete the review. Existing read/update/release methods are NOT atomic replay protection. Use the new review-scoped main-thread claim/commit contract defined below; do not assume a worker-local mutex or read-then-release is sufficient. The server budgets what it emits plus the declared reserve; it does not know the host model conversation and must never call it measured or a verified128K native ceiling.

**Call sites:**
- `src/daemon/steps/code-review-step/handler.ts`
- `src/daemon/steps/code-review-step/types.ts`
- `src/daemon/steps/code-review-step/state-store.ts`
- `src/daemon/steps/review-step/types.ts`
- `src/daemon/steps/review-step/state-store.ts`
- `src/daemon/steps/review-step/phases/start.ts`
- `src/daemon/steps/review-step/phases/claims.ts`

### 3.13 `Atomic review-state claim and commit (proposed additive store contract)` — field-add

The existing SharedStepStateStore read/update/release operations are independent and provide no replay exclusion. Add review-scoped atomic operations on the MAIN-THREAD LocalStepStateStore and matching HubStepStateStore/stepStateHubHandlers bindings in src/daemon/threads/step-state.ts. Scope them to kind review or code-review; analyze/workflow lifecycle remains unchanged. Proposed typed operations: claimReviewState(kind, token, expectedGeneration, expectedCallId, internalRequestId) returns a structured-cloned payload plus an opaque server-minted claimId; commitReviewState(claimId, expectedGeneration, nextPayloadOrCompletion) validates owner/generation and atomically consumes the call, increments generation and updates/rotates the token according to its kind; releaseReviewClaim leaves state unchanged only when no external side effect has begun; invalidateReviewClaim makes the token terminal/uncertain after cancellation, owner loss or ambiguous persistence. Hub messages perform these transitions centrally, not as independent worker read/update calls. A worker-local lock or lease expiry alone is insufficient. Request/claim IDs are internal, not accepted as ownership assertions from the MCP caller.

**Call sites:**
- `src/daemon/threads/step-state.ts`
- `src/daemon/threads/channel.ts`
- `src/daemon/steps/code-review-step/state-store.ts`
- `src/daemon/steps/review-step/state-store.ts`
- `src/daemon/steps/code-review-step/types.ts`
- `src/daemon/steps/review-step/types.ts`

### 3.14 `Atomic controller submission lifecycle and recovery` — invariant-change

Validate missing/malformed budget declarations and outer input shape before claiming, so a missing declaration does not consume state. A non-consuming read for routing is allowed, but its generation/callId must be rechecked atomically by claim before accepting a reply. Only one request can hold a live claim for a pending call; concurrent duplicate submissions receive review-state-busy/stale with no model work or persistence. Revalidate profile, deadline, callId/answer and existing semantic checks on the claimed immutable snapshot; compute the next state before any write. Invalid reply/declaration detected before side effects releases the claim unchanged so the caller can correct it. For a non-final accepted call, commit pending-call consumption and next continuation atomically before emitting the next frame. For final completion, retain the exclusive claim across all awaited artifact validation/persistence and consume it only after persistence succeeds; no second request may persist concurrently. After success, keep a bounded TTL completion receipt (artifact/run/call IDs and status only) so replay returns already-completed without re-running persistence. If failure/cancel occurs before side effects with an explicit no-write guarantee, release unchanged. If a write may have happened, invalidate with review-state-uncertain and require inspection/fresh start; never automatically regrant or replay uncertain work. Owner worker/request loss signals cancellation and invalidates its claims; late owners are fenced by claimId/generation and cannot advance state. A live claim must not be evicted or made claimable by idle TTL/capacity sweep: pinned claims count toward existing bounds, and mint fails explicitly when all capacity is pinned. No automatic lease regrant while an old owner may still write. Completed receipts are bounded under existing store capacity/TTL and contain no source. Daemon restart still loses ephemeral tokens/claims; canonical artifact history is the recovery evidence, not a new database.

**Call sites:**
- `src/daemon/threads/step-state.ts`
- `src/daemon/threads/channel.ts`
- `src/daemon/steps/code-review-step/handler.ts`
- `src/daemon/steps/code-review-step/state-store.ts`
- `src/daemon/steps/review-step/state-store.ts`
- `src/daemon/steps/review-step/phases/claims.ts`
- `src/daemon/steps/review-step/phases/findings.ts`
- `src/daemon/steps/review-step/phases/verdicts.ts`

### 3.15 `Registered MCP schemas and terminal controller handlers (explicit change sites)` — field-modify

src/mcp/server.ts defines the actual Zod envelopes for insrc_review_step and insrc_code_review_step; add the reviewBudget declaration and the versioned callId/answer reply shapes there as well as the daemon input types. Keep outer phase names; document explicit refusal for legacy controller continuation payloads. src/daemon/steps/review-step/phases/findings.ts handleFindings and phases/verdicts.ts handleVerdicts MUST acquire the atomic claim, decode the new envelope, validate expected callId/generation/profile/deadline and only then hand answer to the existing template/verdict validators. Neither handler may validate/persist raw input.findings/input.verdicts as a bypass. Existing claim-ID completeness, source revision/lifecycle checks and other-party rules remain. Code-review handler judgements and both code-review full/degraded start/confirm_wait resumes use the same contract. review-step handler dispatch, start and claims paths propagate the declaration/state version. All final persistence is under the live claim and requires every pipeline obligation to have completed; no partial request can complete a review.

**Call sites:**
- `src/mcp/server.ts`
- `src/daemon/steps/code-review-step/handler.ts`
- `src/daemon/steps/code-review-step/types.ts`
- `src/daemon/steps/review-step/handler.ts`
- `src/daemon/steps/review-step/types.ts`
- `src/daemon/steps/review-step/phases/start.ts`
- `src/daemon/steps/review-step/phases/claims.ts`
- `src/daemon/steps/review-step/phases/findings.ts`
- `src/daemon/steps/review-step/phases/verdicts.ts`

### 3.16 `Chunk-scaled review execution time (user-approved scope addition)` — invariant-change

Replace the frozen-initial-session-count deadline in job.ts with explicit reviewStartedAt, timeBudgetUnitMs=600000, logical chunk/work-unit identity lineage, currentBudgetChunkCount, totalBudgetMs and deadlineAt. An unsplit model request is one work chunk. A work chunk is a distinct model request partition (source inspection, gather/reduce/obligation/relation or comparison stage) in the review plan, identified by stage/role plus logical chunk/key; a new callId for a retry/correction is NOT a new chunk. In a source-only initial plan,2 chunks mean20 minutes,5 mean50 and7 mean70. Every newly planned downstream model work chunk contributes once, and replacing a chunk on genuine subdivision removes its entitlement and adds its child leaf chunks; both completed leaves and still-pending leaves count. Superseded parents and failed retry attempts do not mint extra time; their elapsed time remains charged. Thus totalBudgetMs=600000*currentBudgetChunkCount, deadlineAt=originalReviewStartedAt+totalBudgetMs. It is NEVER now+newBudget and is not frozen at the first two chunks. Recompute before dispatch and after every source/stage/gather/reduce/relation subdivision and new stage plan; preserve lineage so unchanged/re-issued work cannot be counted twice. New units must correspond to a real admitted evidence partition or required obligation, not arbitrary IDs made to extend time. No-work deterministic-only jobs need no model execution budget. Safe-integer overflow/invalid lineage refuses explicitly. Individual provider attempts are capped at min(selected existing execution limit, remaining job time), with the existing30-minute hard attempt maximum, independently of the larger total. Retries do not restart either clock; cancel/deadline is checked before every call and finalization. Native size refusal may add genuine child chunks and update the total; unbounded repeated repartitioning is still constrained by existing evidence/attempt/size-reduction rules. This covers both reviewer-session and structured review calls and controller-issued work. Different dimensions remain independent jobs, each with this formula; report a sequential Story review total as the sum of its dimension job chunk budgets, never a misleading fixed20-minute whole-Story limit. Freshness/approval waits are separate from the execution budget and are labelled separately. Expired jobs are terminal: check the old live deadline before accepting an answer/failure, registering a subdivision or entering later work; a late response must not revive an expired review by increasing N. The initial zero-work preparation is the only pre-start case. New units planned while still active update the total from the same start epoch. At dispatch the driver arms an attempt timer for min(selected existing execution limit, remainingMs), combines it with cancellation, forwards the signal and races even a provider that ignores timeout options; structured and reviewer-session calls receive the same effective cap. No generation or tool wait may hold the driver past that cap. Controller emissions carry the deadline/remaining time, and late external replies are rejected; the daemon cannot kill an external host model process and must not claim that it did.

**Call sites:**
- `src/workflow/review-pipeline/job.ts`
- `src/workflow/review-pipeline/types.ts`
- `src/workflow/review-pipeline/driver.ts`
- `src/workflow/review-pipeline/code-review.ts`
- `src/workflow/review-pipeline/design-review.ts`
- `src/workflow/review-pipeline/adapters/code-review-gather.ts`
- `src/workflow/review-pipeline/adapters/code-review-duplicates.ts`
- `src/workflow/review/review.ts`
- `src/workflow/review/template-review.ts`
- `src/daemon/steps/code-review-step/handler.ts`
- `src/daemon/steps/review-step/phases/start.ts`

### 3.17 `Deadline reporting and transport qualification` — field-add

Every prepared/replanned/start/terminal event reports currentBudgetChunkCount, timeBudgetUnitMs, totalBudgetMs, elapsedMs and remainingMs with the review/job IDs. The same frozen policy and original server-side execution epoch survive controller continuations; fresh host reserve declarations do not reset time. Timeout errors name the chunk count and derived budget (e.g. five chunks/50 minutes), not a hardcoded20 minutes. Existing per-attempt execution caps remain, clamped by the computed remaining total. Do not rewrite user config or silently substitute a fixed outer ceiling for the computed job budget. If an existing configurable stream ceiling is shorter than an announced computed allocation, report the incompatibility explicitly before more work is dispatched; do not claim the full allocation was available. External MCP transport timeouts (the observed300-second client wait) are distinct from daemon execution time; client disconnect may cancel according to existing cancellation policy, but it must not be reported as successful review or a20-minute job-cap failure. Persist paired outcome events so a lost client response can be diagnosed from the canonical run record. No new async workflow runner or hidden duplicate review is introduced.

**Call sites:**
- `src/workflow/review-pipeline/code-review.ts`
- `src/workflow/review-pipeline/driver.ts`
- `src/workflow/review-pipeline/job.ts`
- `src/daemon/steps/code-review-step/handler.ts`
- `src/daemon/steps/review-step/handler.ts`

### 3.18 `Trusted review-owner binding through actual request/worker lifecycle (proposed)` — field-add

Extend the hub contract in src/daemon/threads/channel.ts to supply a trusted HubRequestContext alongside args for review state operations. It contains a per-connection nonce/worker generation from the main-thread WorkerConnection and a server-assigned active request-owner nonce. Existing generic handlers can ignore the optional context. The worker may identify the currently executing routed request, but cannot choose channel identity: serveHub binds that identity from its MessagePort closure, never msg.args. src/daemon/threads/main-services.ts ThreadServices.connectWorker must bind the per-connection handler context rather than use an ownership-blind shared handler set. src/daemon/threads/router.ts registers the internal request-owner nonce before dispatch and maintains its connection/worker-generation membership while active; claim operations validate both channel binding and active registry membership. A requestId or ownerId supplied in raw MCP inputs is never trusted. The owner nonce travels only in the internal execution envelope/context to the step host. HubStepStateStore forwards that internal nonce and the main thread verifies it against the bound connection before any claim/commit/release. Claims are bound to the trusted request plus connection epoch; another worker cannot commit/release a stolen claim ID or spoof request ownership. Local single-thread execution in src/daemon/steps/host.ts obtains a main-thread registered local owner from the same registry, tied to the server invocation and AbortSignal, and uses identical store checks; no worker-specific assumption is required. Review terminal handlers obtain this trusted execution context from server-controlled dependencies/step context, never from public input. Explicit carrier sites also include channel.ts RequestEnvelope/LocalRequestEnvelope and wireRequest, worker-requests.ts request dispatch/lifetime completion, worker-entry.ts execution-context wiring, daemon/request-context.ts trusted request metadata, and shared/step-context.ts out-of-band StepCallContext propagation into host.ts. Reuse the existing trustedContext/connectionExecution carrier conventions, not caller JSON. Only an opaque review owner nonce and worker generation crosses the worker wire; no session credentials or connectionSession/connectionExecution capabilities are serialized, and existing wireRequest refusal for those capabilities remains. The local host mints/registers its own trusted invocation owner where there is no routed worker; the worker host uses the router-registered nonce from the internal envelope and bound port context. Thread-service owner validation must reject a worker-supplied nonce that is not active on that exact connection. Raw MCP args cannot replace this carrier.

**Call sites:**
- `src/daemon/threads/channel.ts`
- `src/daemon/threads/main-services.ts`
- `src/daemon/threads/router.ts`
- `src/daemon/threads/supervisor.ts`
- `src/daemon/threads/step-state.ts`
- `src/daemon/steps/host.ts`
- `src/daemon/handler-runtime.ts`
- `src/daemon/steps/review-step/handler.ts`
- `src/daemon/steps/code-review-step/handler.ts`
- `src/daemon/threads/worker-requests.ts`
- `src/daemon/threads/worker-entry.ts`
- `src/daemon/request-context.ts`
- `src/shared/step-context.ts`

### 3.19 `Explicit owner-loss invalidation hooks (proposed)` — field-add

In main-services.ts WorkerConnection.disconnect invalidates every owner/claim bound to that connection nonce BEFORE stopping hub service and closing ports; a new connection cannot reuse old ownership even if an OS/thread ID is reused. In supervisor.ts worker exit/detach and replacement call that invalidation hook for the detached worker generation. In router.ts explicit cancellation, failed dispatch, orphaned requests, terminal request completion and routed-request lifetime abort close the registered owner and invalidate its still-uncommitted claims according to the side-effect recovery rule. Current unary socket close intentionally does not cancel work; do not falsely report owner loss there while the request legitimately runs. Its internal owner remains until actual completion/cancel/worker loss. For single-thread steps, host.ts registers/unregisters the owner in try/finally and listens to its server AbortSignal. Normal finalization first commits state/completion receipt, then closes the owner; cleanup does not invalidate an already committed completion. If a request terminates with an uncommitted claim, make its token terminal/uncertain (or explicitly release only when the state machine proves no side effect started); never leave an abandoned pinned claim indefinitely busy and never grant a new owner while a former owner may still write. Reject late messages/commits after connection/request invalidation. Active unexpired owner claims stay pinned against ordinary TTL/capacity eviction, but lifecycle invalidation cleans them and bounded receipts prevent leaks. Tests must exercise these real hooks across local and two worker connections, not only direct store calls.

**Call sites:**
- `src/daemon/threads/main-services.ts`
- `src/daemon/threads/supervisor.ts`
- `src/daemon/threads/router.ts`
- `src/daemon/threads/channel.ts`
- `src/daemon/threads/step-state.ts`
- `src/daemon/steps/host.ts`
- `src/daemon/steps/review-step/phases/findings.ts`
- `src/daemon/steps/review-step/phases/verdicts.ts`

### 3.20 `Exact terminal verdict coverage (deliberate correction to current behavior)` — field-add

handleVerdicts currently loops only over supplied verdicts, silently drops unknown claim IDs, accepts duplicates and can construct/persist a report from an empty or partial array. This MUST change: derive the immutable expected claim-ID set from the completed validated extraction state; for each versioned pending verification call derive its exact assigned subset. Before normalization/persistence require every expected ID exactly once, no unknown ID and no duplicate (including identical duplicates). The per-chunk answer must match its assigned subset, not merely any global claim; final continuation aggregation must equal the full expected set exactly once across all chunks/call IDs. Missing, empty-when-nonempty, duplicate, unknown, wrong-subset or malformed IDs produce verdict-coverage-invalid with zero persistence and no partial-success normalization. Do not log untrusted raw claim IDs/messages; use allowlisted categories and internal references. A genuinely empty expected set is permitted only after all required extraction chunks completed and the aggregate validated that no load-bearing claims exist; an empty reply cannot skip extraction or verification. Apply the analogous full expected-template-item check in findings aggregation before completion, preserving its existing strict validation. This is a new completeness guarantee, not a preserved one. Both registered MCP envelopes, final findings/verdicts handlers, code-review continuation aggregation and lifecycle persistence remain under the atomic owner claim.

**Call sites:**
- `src/daemon/steps/review-step/phases/verdicts.ts`
- `src/daemon/steps/review-step/phases/findings.ts`
- `src/daemon/steps/review-step/phases/claims.ts`
- `src/daemon/steps/review-step/types.ts`
- `src/daemon/steps/review-step/state-store.ts`
- `src/daemon/steps/code-review-step/handler.ts`
- `src/mcp/server.ts`

### 3.21 `Separate attempt limits from new total-time allocation` — field-add

The600000ms chunk unit is a TOTAL-budget multiplier, not a universal pre-existing attempt cap. Existing code-review session defaults are600000ms; design-review template settings currently default to12/18/24 minutes and HARD_REVIEW_DEADLINE_MS is30 minutes. Preserve the selected execution attempt cap from each role/configuration (and existing hard maximum), but give an attempt only min(that cap, chunk-scaled job remaining time). Thus one design chunk has a10-minute total and may be cut off before its old12/18/24-minute ceiling; that is an explicit new overall-budget behavior. Two design chunks have20 minutes total and one attempt can use its selected12/18-minute ceiling while the later attempt receives only what remains. Do not describe every design attempt as historically10 minutes. Update src/workflow/review/template.ts documentation/config-helper semantics: reviewDeadlineMs and existing designReview.timeLimitMs values provide the template attempt ceiling, not the new whole-job allocation. In template-review.ts separate the current limitMs/startedAt/timedOut reporting from the job budget; timedOut/deadlineError must report the live chunk count and derived total rather than closing over the old12/18/24-minute whole-review limit. design-review.ts template adapter and job.ts deadlineError must receive the current timing breakdown. Code and grounded review execution limits remain their existing role caps; all paths apply the new total formula. Keep stored config values and completed records unchanged; document the setting semantic change and update tests that previously assumed a whole-design-review complexity deadline or that source-session attempts always reach30 minutes. Do not silently clamp the whole chunk-scaled budget to the30-minute per-attempt safety maximum.

**Call sites:**
- `src/workflow/review/template.ts`
- `src/workflow/review/template-review.ts`
- `src/workflow/review-pipeline/design-review.ts`
- `src/workflow/review-pipeline/job.ts`
- `src/workflow/review-pipeline/types.ts`
- `src/workflow/review-pipeline/driver.ts`
- `src/config/config-catalog.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/enforce-all-inclusive-review-budgets-exclude-E20261027a8c4399a/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **Mandatory prompts, provider wire schema and reserves already exhaust the cap.** (recoverable)
  - Detection: Shared estimator returns negative remaining material allowance before adapter packing or provider dispatch.
  - Response: Throw ReviewBudgetError with code mandatory-context-over-budget; emit refused metadata; make no provider call and retain all evidence for a fresh review.
  - User impact: Review explicitly cannot fit; no fabricated PASS or silent truncation.
- **An indivisible atom or gather obligation cannot fit after overhead.** (recoverable)
  - Detection: Existing packer requests singleton measurement through the inclusive estimator and receives total above cap.
  - Response: Preserve the existing explicit unsplittable failure with an inclusive breakdown. Existing relation/neighbour batching may split supported units; do not invent lossy truncation.
  - User impact: Names the structural unit category/ID and numeric shortfall without logging content.
- **Correction, provider schema normalization or final closing instruction grows beyond the saved allowance.** (recoverable)
  - Detection: Recompute final serialized request and effective wire-schema allowance at dispatch; compare with the frozen job policy.
  - Response: Do not send an oversized request. Use existing size-refusal/redivision only where evidence can be re-planned; otherwise fail once with dispatch-budget-exceeded. A retry has a fresh callId and same total cap.
  - User impact: No hidden oversized retry; terminal metadata identifies the attempt and budget.
- **Managed inspection tool history or output grows beyond the next-turn budget.** (recoverable)
  - Detection: Re-estimate accumulated conversation, advertised tools, closing schema/output reserve before each managed model request.
  - Response: Fail with inspection-budget-exceeded before sending the next request; retain evidence in memory until normal cancellation/cleanup, never truncate it or issue a partial-success review.
  - User impact: Review is unavailable until scope is split/restarted; diagnostics identify stage/turn without source text.
- **Provider overhead profile is absent, malformed or claims unsupported hard-native guarantees.** (recoverable)
  - Detection: Validate required positive/safe reserve values and qualification at budget construction and provider boundary.
  - Response: Fail with native-budget-unqualified. A reserved-native profile is always labelled an estimate; no context-window/compaction flag alone upgrades it to measured or hard-bounded.
  - User impact: Unqualified providers are not admitted under a false guarantee.
- **Resuming an old controller review token with no declared budget version/profile** (recoverable)
  - Detection: Actual code-review controller state in src/daemon/steps/code-review-step/types.ts and state-store.ts is subject/grounding and a step token, not a persisted ReviewPipelineJob. Add a budget protocol version/profile declaration to new controller state and validate it at the real resume boundary. Missing version in an old controller token is detected before prompts are emitted.
  - Response: Refuse the old controller token with review-budget-state-stale and require a fresh start. Daemon ReviewPipelineJob objects are ephemeral and are reconstructed for each new run; do not invent a persisted pipeline job migration or edit completed histories.
  - User impact: Only pre-upgrade in-flight controller tokens need restarting; fresh daemon jobs obtain the current explicit provider profile.
- **Provider size refusal, stall, timeout, model error or cancellation.** (recoverable)
  - Detection: Existing typed provider/pipeline error classification; cancellation signal and job deadline.
  - Response: Retain existing provider retry/redivision and per-attempt limits, while applying the user-approved10-minutes-per-current-chunk total deadline. Every attempt stays in the inclusive token policy and has one terminal event; budget errors remain fail-closed, and context overflow is never inferred from timeout alone.
  - User impact: Failures remain distinguishable from successful partial review. Existing per-attempt caps are preserved and clamped by remaining total; total time now scales with current logical work chunks as the user requested.
- **Required neighbours or invalid-answer correction cannot fit** (recoverable)
  - Detection: Full inclusive measurement includes every required usage neighbour and the actual correction text; existing omission fallbacks are not allowed.
  - Response: Remove the required-neighbour-dropping and uncorrected-reissue branches. Preserve all supported relationships through pure replanning, or throw required-context-over-budget/correction-budget-exceeded before another model call. Propagate the typed budget error without retry or partial-success conversion.
  - User impact: A review may refuse rather than silently lose correctness evidence.
- **Controller response/frame exceeds the cap or a resume lacks valid budget declaration/version** (recoverable)
  - Detection: At both controller handlers, validate the actual token store state and declared profile, then measure the complete final response before emit_claims/emit_findings/emit_verdicts/emit_judgements, not individual prompt fields alone.
  - Response: Return typed controller-budget-required/unqualified/state-stale errors without leaking prompts. Where adapters support complete subdivision, emit one budgeted pending call per turn with matching callId; otherwise refuse controller-frame-over-budget. No unmeasured grounding, omitted dimensions/claims or partial completed record.
  - User impact: Old controller clients/tokens require the new declaration/continuation contract or a fresh start; externally unverified native context stays explicitly qualified.
- **Concurrent controller submissions or ambiguous final persistence** (recoverable)
  - Detection: Atomic main-thread claim checks token generation, expected pending call and live owner before accepting a response; final handler retains claim through persistence.
  - Response: Only one owner proceeds. Missing declarations/invalid replies before writes preserve state; concurrent replay is busy/stale. After an ambiguous write/cancel/owner failure invalidate rather than regrant. Successful completion leaves a bounded receipt; replay never writes twice.
  - User impact: No duplicate final review from two workers; an uncertain completion requires inspection/fresh start instead of blind retry.
- **Computed chunk-scaled budget expires or conflicts with an outer ceiling** (recoverable)
  - Detection: Compare trusted server execution elapsed time with600000 times current admitted logical chunk count; check each attempt against remaining time. Validate safe arithmetic and announced outer limits.
  - Response: Recalculate on real plan changes without resetting the original start. Stop before another call/final write on expiry. Identify job expiry, per-call expiry, cancellation and MCP transport expiry separately. Surface a shorter outer ceiling as explicit incompatibility rather than silently clipping the promised budget.
  - User impact: Diagnostics show actual chunk count, total and remaining minutes instead of a fixed20-minute message.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Total inclusive estimate exactly equals128000, including separate schema and native/output reserves. | Admission succeeds; one estimated token above it splits or refuses. Positive reserves cannot be rounded down. |
| Two calls have the same material text but different output schemas/execution modes. | Different inclusive budgets are expected. Every comparison is based on the complete request rather than text-only equality. |
| Same job resumes while global configuration changes. | Saved policy is immutable; a fresh job uses new valid settings. Existing reviewLimitChars remains diagnostic gross cap compatibility, not payload allowance. |
| A retry note fits the planning headroom. | Actual note text consumes that headroom once. Planner reserve and dispatch note are never double-counted; zero remaining headroom is explicit. |
| Arbitrary Unicode, escaped schema properties, strict-schema/envelope transformations and multimodal messages. | Preserve the existing estimator's declared units, ceil all token estimates and count full supported serialization. Unknown content kinds or unqualified schema transforms refuse; do not silently count them as zero. |
| Flat generated .insrc/artifacts/*.jsonl versus nested user-authored templates/formats JSONL. | Flat ledger excluded consistently in staged/unstaged/range/attributed diffs and freshness; nested user files stay reviewable. No artifact history is deleted. |
| Provider returns an error string containing prompt fragments or credentials. | Telemetry stores allowlisted outcome categories and IDs only; no raw error message, prompt, schema or tool-result body. |
| Opaque native CLI history exceeds the engineering reserve. | This design's reserved-native accounting is an inclusive admission estimate, not proof of a native hard ceiling; telemetry must say so. If a verified hard ceiling is required by the approval decision, this path is not eligible and alternative a2 applies. |
| Two initial chunks become five logical leaf chunks after evidence-preserving subdivision at minute12. | Total allocation becomes50 minutes from the original execution start, leaving38 minutes; not a new50-minute clock and not the frozen20-minute cap. |
| One five-chunk review has three retries of one chunk. | Still50 minutes total. Retry IDs do not change the logical chunk count; no individual attempt receives more than its selected existing cap or the remaining total time. |
| Two workers concurrently submit the same final findings/verdicts envelope. | One main-thread claim wins and at most one persistReview occurs; the loser cannot pass validation based on an earlier non-consuming read. |
| Final persistence succeeds but the client disconnects before the token transition response. | No regrant of the old active claim; completion receipt or terminal-uncertain response points to canonical evidence. Replay cannot persist a duplicate. |

**Invariants to preserve**

- All LLM work continues through LLMProvider and CLI OAuth/local Ollama; no direct cloud REST and no provider calls in parallel within the review driver. [[c1]]
- Existing envelope IDs, source-read-only tools, graph/diff attribution, evidence-preserving split/gather, retry limits, per-attempt deadlines and abort behavior remain authoritative; total deadlines now follow the explicit user chunk-count rule. [[c2]]
- Managed read-only-loop budget is opt-in for review; analyzer/non-review consumers retain current behavior. [[c3]]
- TU1 usage-domain accounting, other active stories, global configuration, persisted approved histories and existing completed review records are not changed by this dependency fix. [[c4]]

## 6. Test strategy

**Test framework:** `node:test + node:assert/strict executed with the repository's tsx loader; scripted providers/fake CLI subprocesses for deterministic contracts, no live model calls in unit/integration suites.`

**Test levels**

- **unit** — Prove the all-inclusive accounting boundary, rounding, normalization and reserve ownership.
  - Subjects: `Proposed src/workflow/review-pipeline/__tests__/budget.test.ts: exact total cap, one-token overflow, independent schema overhead, native/tool/output/inspection reserves and estimator qualification`, `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: single/chunk admission, retry headroom consumed once, frozen policy and stale state rejection`
  - Fixtures: `Same text with small/large and provider-strict output schemas`, `Unicode/escaped strings and invalid policy values`, `Default128000 policy with full numeric breakdown, and tiny caps for deterministic boundary tests`
- **integration** — Exercise every stage through real planner and dispatch with scripted providers, preserving evidence and never sending over-budget calls.
  - Subjects: `src/workflow/review-pipeline/__tests__/code-review-divided.test.ts: all source atoms/obligations remain represented after inclusive splitting`, `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: neighbours, mandatory context and indivisible atoms use inclusive request measurement`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts and pipeline duplicate suites: reduction, obligation, relation and pair requests use same admission policy`, `src/workflow/review-pipeline/__tests__/code-review-source-inspection.test.ts: preflight, optional review execution budget and unchanged deadline/abort/retry contracts`
  - Fixtures: `Two historical prompt sizes371253/225429 plus output schemas and native/session reserves`, `Scripted provider refuses if total inclusive budget is exceeded; records call IDs without content`, `Second chunk fails/cancels; per-call terminal metadata still exists even without a finished plan`
- **contract** — Qualify provider serialization/limits and dynamic managed history without inventing native guarantees.
  - Subjects: `CLI provider fake-process review-session tests: account logical/strict schema and invocation overrides, reject missing profile, retain reserved-native qualification, no config writes`, `Ollama review-session and read-only tool-loop tests: large tool result, next-turn growth and final structured-answer guard; non-review callers unchanged`, `Optional hard-native mode is unsupported unless an actual verified provider contract test is supplied; no flag-name-only proof`
  - Fixtures: `Fake CLI exposes only declared contract controls and returns captured wire metadata, not live credentials/model text`, `Inspection histories that fit initially and cross the cap before next turn/final answer`, `Error text containing sentinel prompt/credential content to prove telemetry redaction`
- **integration** — Verify generated-input filtering before freshness/material selection and preserve user files.
  - Subjects: `src/workflow/code-review/__tests__/diff-attribution.test.ts: flat JSONL excluded in real git range, staged and unstaged paths`, `Existing changed-file/subject tests: nested templates/formats JSONL remains in subject; only generated flat ledgers skip freshness`
  - Fixtures: `Temporary git repository with flat .json/.log.jsonl/.feedback.jsonl and nested user JSONL; disjoint Story trailers`
- **smoke** — Validate production build and a reduced review without changing global configuration or making token-ceiling claims from timing.
  - Subjects: `npm run build and focused review-pipeline/provider/changed-file regression suites`, `After daemon update/restart, retry pending TU1 review once and inspect per-call start/end/failure breakdowns and absence of flat generated histories`
  - Fixtures: `Installed daemon version/commit and original config snapshot; no persistent config modification`, `Content-free logs kept under /tmp; live failure reported as failure, not waived`
- **integration** — Prove corrections to existing lossy/partial/error-log behavior identified by independent review.
  - Subjects: `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: required-neighbour overflow refuses rather than retaining only summaries that fit; optional context remains separately optional`, `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: oversized invalid-answer correction is never reissued without its correction`, `src/workflow/review-pipeline/__tests__/code-review-source-inspection.test.ts: budget errors bypass transient retry, record-not-judged and record-observation policies`, `src/agent/providers/__tests__/cli-review-session.test.ts: provider profile and exact normalized wire schema reach initial planning and dispatch with matching budget`, `Grounded and template design-review entry tests: selected provider profile resolved before createReviewJob; missing profile makes zero provider calls`, `Code-review controller state tests: pre-version controller token rejected at actual resume boundary, not by fictional pipeline deserialization`, `Capture provider and driver loggers together: no source/credential sentinel appears in any review-scoped failure log`
  - Fixtures: `One atom whose required usage neighbour exceeds remaining allowance`, `Invalid model reply with a required correction too large for a retry`, `Provider errors containing sentinel source/credential strings`, `Codex strict schema that differs from caller schema; controller token missing budget metadata`
- **integration** — Prove both controller routes enforce the all-inclusive emission contract, not only daemon provider dispatch.
  - Subjects: `src/daemon/steps/code-review-step/__tests__/handler.test.ts: full and degraded emitJudgementsResult admission; four individually fitting prompts whose combined frame exceeds cap must split or refuse`, `src/daemon/steps/review-step phases start and claims tests: template, extraction and batched verification emissions use complete-frame admission`, `Both controller state-store/type/schema tests: valid declaration, unknown/negative host reserve, pinned cap, fresh host declaration on each resume, pre-version token, missing/duplicate/mismatched callId and no premature artifact completion`, `Controller multipart integration: every required dimension, claim and cross-chunk obligation reaches final aggregation; no truncated grounding or prompt body is exposed on refusal`
  - Fixtures: `Daemon-authored artifacts to force controller routing`, `Large four-dimension prompt bundle plus separate grounding/schema payload`, `Old state tokens without budget metadata and replayed replies`, `External-host reserve changes between two controller turns; caller cannot increase server cap`
- **integration** — Prove the new atomic state boundary, actual registration/final handler integration and chunk-scaled deadlines.
  - Subjects: `src/daemon/threads/__tests__/step-state.test.ts plus real hub/worker helper: two workers claim the same review/code-review token; one wins; generation/call mismatch refuses; unrelated tokens progress independently`, `Controller findings/verdicts/judgements handlers: concurrent duplicate final replies produce exactly one artifact write; malformed/missing budget declaration preserves usable state; stale/replayed/legacy envelopes never reach semantic validators or persistence`, `State failure recovery: before-write failure releases unchanged; simulated success-before-response, ambiguous persistence, cancellation and worker loss never regrant old work; late claimant commit is fenced; active claims are not TTL/capacity-evicted`, `src/mcp/server.ts schema registration tests: both tools accept the new declaration/envelope shape and reject malformed values; both terminal design handlers decode callId/answer before existing validation`, `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: fake-clock N=1/2/5/7 budgets10/20/50/70 minutes; redivision grows total from original start; retries/corrections do not increase count or reset epoch`, `Review-stage/gather/relation tests: new admitted work chunks count once, replaced parents are not double-counted, structured and source-inspecting calls share timing, deterministic-only review has zero model budget`, `Driver/controller deadline tests: selected role-specific per-attempt cap clamped by remaining total, remaining-time clamp, no dispatch/finalization past deadline, explicit outer-ceiling incompatibility and distinct MCP client-timeout metadata`, `Expired-review fake-clock regressions: late size-refusal/subdivision or controller reply cannot revive expired work; provider ignoring timeout options is bounded by driver abort/race; outer client timeout remains distinct.`
  - Fixtures: `Barrier-controlled two-worker submissions and counters for persistReview calls`, `Fake main-thread state clock, pinned claims and quota/TTL sweep`, `Provider-size refusal that replaces one source chunk with children`, `Transport timeout without a daemon verdict; no live duplicate request`
- **integration** — Prove trusted owner lifecycle, exact verdict coverage and preservation of role-specific attempt ceilings.
  - Subjects: `Real hub/main-services tests: connection-bound owner identity cannot be spoofed in args; cross-connection claim commit/release is rejected`, `Supervisor/router/host integration: worker exit, port disconnect, replacement generation, explicit cancel, failed dispatch and single-thread AbortSignal/finally invalidate uncommitted claims; legitimate uncancelled unary work is not falsely regranted`, `Terminal controller tests: empty, partial, duplicate, unknown and wrong-assigned-subset verdict arrays make zero writes; all expected claims exactly once across chunks permits one completion`, `Late owner completion after invalidation is fenced; no abandoned pinned claim, lease regrant or duplicate finalization; successful committed receipt survives owner cleanup`, `Timing fake clocks: code-review10-minute and design12/18/24-minute attempt ceilings are clamped by remaining10×N total; whole-job budget is not clamped to30 minutes; template timeout messages reflect live total`
  - Fixtures: `Two actual WorkerConnection ports and an active request-owner registry`, `Real worker exit and cancellation signals, not only simulated store method calls`, `Expected claim set of3 and every missing/duplicate/unknown/permutation variant`, `Two-chunk design job with a12-minute first attempt and8-minute remaining total`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `budget.test.ts boundary/complete-component tests; pipeline-job.test.ts admits only inclusive estimates <=cap` |
| `ac2` | `Scripted end-to-end source/chunk/gather/reduce/relation/duplicate/correction tests verify zero oversized provider invocations and preserve evidence` |
| `ac3` | `CLI normalization/profile qualification contracts; managed tool-loop/final-answer growth tests; native estimate never labelled measured` |
| `ac4` | `Real git JSONL exclusion plus nested-user-file inclusion and subject/freshness selection regression` |
| `ac5` | `Two-chunk success/failure/cancel cases assert paired start/terminal IDs, attempt/timing/budget fields and no secret/source sentinel leakage` |
| `ac6` | `Existing retry/deadline/envelope/cancellation suites; non-review analyzer compatibility; build and installed daemon smoke` |
| `ac7` | `Fake-clock10×chunk-count tests across initial planning, stage additions, subdivision and retries, plus truthful timeout/outer-ceiling reporting` |

## 7. Migration

**State before:** Analyzer passes UoQNS4qD-rHZ8Db5Q4Pzww and XLC5M2RvEbVmaSd3EsjEtA locate message-text sizing in shared job/envelope and independent gather/duplicate helpers. Configured128000 currently maps to384000 message characters. Review sessions have no inclusive budget option; managed tool history grows until turn/deadline limits. Flat generated JSONL enters the subject. Logs retain prepared/finished plans but not a terminal record for every call.

**State after:** One immutable inclusive estimated-budget policy governs initial planning, retries, gather/relation stages, dispatch and review-scoped managed turns. The full request and explicit reserves fit within the unchanged configured cap, and native qualification is visible rather than asserted as measured. Flat JSONL histories are retained as provenance but excluded from changed-code/freshness input. Every call has content-free start/terminal telemetry, including failed dimensions. The unresolved native-hard-ceiling preference must be settled before implementation is approved. Existing required-neighbour omission and correction-dropping fallbacks are corrected; typed budget errors bypass generic/partial policies. Profiles are prepared before planning. Existing review error logs are sanitized, not just new events. Atomic main-thread review claims prevent replay across workers; registered schemas and both final-answer handlers validate the new envelope before persistence. Total review execution time scales as10 minutes times current work chunks from one original epoch, including dynamic subdivision.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Record the approved issue and new chunk-scaled time instruction, then settle the native-budget interpretation. Keep TU1 review on hold; do not modify global config or the128K cap. Existing per-attempt caps remain, clamped by remaining total; total job time is10 minutes times current planned logical work chunks. — ↩ rollbackable
2. Introduce explicit provider wire-budget profiles and additive review options. Resolve profiles before job construction at code-review, grounded-review and template-review entry points. Non-review defaults/completed records stay compatible; version actual controller step state and refuse pre-version controller resume tokens. Do not invent a persisted ReviewPipelineJob migration. — ↩ rollbackable
3. Switch all shared code/design review planning and execution paths to inclusive accounting, including provider schema preparation, managed tool turns and final answer. Add generated flat JSONL exclusion and paired content-free call events; run boundary, provider and real-git regressions. Integrate BOTH controller handlers at full/degraded code-review emission and design template/extract/verify emission, including complete-frame sizing, versioned continuation and actual state-store resume checks. Do not ship a daemon-only fix advertised as all-review coverage. Add the main-thread atomic review claim/commit and failure recovery contract, explicit MCP registration/final handler integration, and chunk-scaled time accounting with new fake-clock/concurrent tests before enabling the revised controller protocol. Propagate trusted connection/request ownership through main-services, router/supervisor and single-thread host lifecycle; add exact expected-claim/template-item coverage checks in terminal aggregation; separate template attempt limits from chunk-scaled job limits and their timeout messages. — ↩ rollbackable
4. Build and commit the reviewed fix, then push only its authorized changes so the daemon can update. Restart/update the installed daemon without rewriting user config and record its installed commit. In-flight old reviews must finish or be cancelled through existing lifecycle controls before restart; never edit live histories to fake completion. — ↩ rollbackable
5. Start one fresh TU1 review after the fix is installed. Verify inclusive budget breakdowns, excluded JSONL, call-level outcomes and policy qualification; retain any real failure and keep BUILD unapproved until the independent review succeeds or the user explicitly overrides. — ↩ rollbackable

**Backward compat:** No public IPC method or existing workflow artifact payload is replaced. Review budget options are additive and review-scoped; non-review provider/tool-loop callers retain existing behavior. review.chunkTokens remains the total configured allowance, now all-inclusive; no configuration file migration occurs. Existing ReviewCall.chars remains prompt-text diagnostics, with a separate inclusive breakdown. Completed old reviews remain readable; pre-version controller step tokens require a fresh start; daemon pipeline jobs are ephemeral, not persisted. Generated histories and all approvals remain intact. Controller MCP review inputs gain an optional declaration that is required when the server routes to externally executed prompts. New continuation replies are versioned callId/answer envelopes; old controller clients/tokens are refused explicitly and need updating/restarting. This behavior is not claimed to be transparent backward compatibility. Daemon-routed current callers do not need an external-host declaration. New atomic operations are review/code-review-scoped additions to the shared state store and its hub bindings; analyze/workflow token behavior remains unchanged. The earlier frozen-deadline/no-extension behavior changes only as explicitly authorized by the user. Old deadline tests must be revised, not waved through. The user's10×chunk TOTAL rule changes overall design-review deadline semantics: existing12/18/24-minute settings remain attempt ceilings, while aggregate job time follows the chunk plan. This is documented rather than labelled unchanged. Trusted owner binding is a scoped hub/host lifecycle addition; unary disconnect semantics remain as currently defined unless an actual cancel occurs.

## 8. Alternatives considered

### 8.1 a1: One inclusive estimated-budget contract over the existing pipeline — **CHOSEN**

Reuse the splitter and driver, subtract every declared overhead/reserve from the per-call cap, and expose estimation/qualification explicitly.

A single immutable budget policy and breakdown is consumed by all planning and execution paths. It counts the enveloped prompt and provider wire-schema allowance, plus explicit native/tool, completion and source-inspection reserves. Managed tool-loop turns remeasure their actual accumulated conversation before each call. Native CLI execution is labelled reserved-native, never measured or hard-bounded; unsupported/missing reserve profiles refuse rather than silently assume zero overhead. Generated histories are excluded by the existing flat ledger seam; content-free call events describe admissions and outcomes. No alternate planner or global configuration rewrite.

### 8.2 a2: Verified native-request ceilings with fail-closed provider admission

Permit review only when every internal model request exposes a verified budget gate.

Use the same inclusive budget model but require provider execution to expose or prove bounds for native system/tool metadata, tool-result growth, output/reasoning and every request. Reject autonomous CLI sessions unless their versioned native context contract is actually verified. Managed local calls can be guarded directly. A flag called context window is not by itself sufficient evidence. This is the stronger interpretation of the unresolved native-ceiling preference.

**Rejected because:** Choose this if the user requires a hard bound on every hidden native request. It may block current cloud review providers; no source/docs proof currently establishes that bound.

### 8.3 a3: Independent provider-specific planners and local thresholds

Give each adapter and provider its own context accounting and subdivision rules.

Keep the current pipeline measurement and add separate prompt/schema/tool/output admission rules inside each provider and gather/retry helper. Each stage would independently shrink payload and define error behavior before execution. The current analyzer found multiple existing message-only sizing helpers; this shape would increase their independent policies rather than unify them.

**Rejected because:** Adds fragmented accounting to multiple existing helpers and cannot establish one all-inclusive admission boundary.

## 9. References

- **[[c1]]** `analyze-bundle` `insrc_analyze_step: UoQNS4qD-rHZ8Db5Q4Pzww`
- **[[c2]]** `code` `src/workflow/review-pipeline/driver.ts:42-95`
- **[[c3]]** `analyze-bundle` `insrc_analyze_step: XLC5M2RvEbVmaSd3EsjEtA`
- **[[c4]]** `prior-artifact` `ISSUE-ecf8440c29a6aa99`
- **[[c5]]** `doc` `https://developers.openai.com/api/docs/guides/conversation-state`
- **[[c6]]** `doc` `https://learn.chatgpt.com/docs/config-file/config-reference`
- **[[c7]]** `code` `src/workflow/runners/build/changed-files.ts:44-64`
- **[[c8]]** `doc` `/tmp/review-splitting-investigation.json`
- **[[c9]]** `doc` `/tmp/review-budget-lld-review-round1.md`
- **[[c10]]** `code` `src/workflow/review-pipeline/prepare.ts:98-120`
- **[[c11]]** `code` `src/workflow/review-pipeline/job.ts:300-319`
- **[[c12]]** `doc` `/tmp/review-budget-sequence.png`
- **[[c13]]** `doc` `/tmp/review-budget-lld-review-round2.md`
- **[[c14]]** `doc` `/tmp/review-budget-lld-review-round3.md`
- **[[c15]]** `stakeholder` `user instruction, 2026-10-27` — "the total time budget should also be based on the number of chunks, 10 * #chunk minutes, rather than fixed 20 mins. add this also and go for another round"
- **[[c16]]** `analyze-bundle` `insrc_analyze_step: dVDdGKaqfq2rhYzeeSasjA`
- **[[c17]]** `code` `src/daemon/threads/step-state.ts:45-65`
- **[[c18]]** `doc` `/tmp/review-budget-lld-cycle2-round1.md`
- **[[c19]]** `code` `src/workflow/review/template.ts:62-103`
- **[[c20]]** `code` `src/daemon/steps/review-step/phases/verdicts.ts:57-90`

## 10. Open questions

- Q-native-ceiling: Does the user require the inclusive estimated per-call budget with explicit native/tool/output/inspection reserves (a1, recommended and drafted), or a verified hard ceiling for every hidden native CLI request (a2, which blocks unverified autonomous CLI sessions)? The existing3-char/token estimator and official context/compaction settings do not prove a hard native ceiling. Do not implement until this approval preference is settled.

## Resolved questions

- `qc7ef1d56` — Q-native-ceiling: Does the user require the inclusive estimated per-call budget with explicit native/tool/output/inspection reserves (a1, recommended and drafted), or a verified hard ceiling for every hidden native CLI request (a2, which blocks unverified autonomous CLI sessions)? The existing3-char/token estimator and official context/compaction settings do not prove a hard native ceiling. Do not implement until this approval preference is settled.
  - **resolved**: a1 — inclusive estimated per-call budget with explicit native/tool/output/inspection reserves — The user explicitly approved the presented LLD and recommended inclusive estimated-budget policy with 'yes, approved'; a verified hard ceiling on hidden native CLI requests is not being claimed. Total execution time is10 minutes times current work chunks, retries do not reset time. _(2026-10-27T06:06:10.757Z)_

## Citations

- **[[c1]]** `analyze-bundle` `insrc_analyze_step: UoQNS4qD-rHZ8Db5Q4Pzww`
- **[[c2]]** `code` `src/workflow/review-pipeline/driver.ts:42-95`
- **[[c3]]** `analyze-bundle` `insrc_analyze_step: XLC5M2RvEbVmaSd3EsjEtA`
- **[[c4]]** `prior-artifact` `ISSUE-ecf8440c29a6aa99`
- **[[c5]]** `doc` `https://developers.openai.com/api/docs/guides/conversation-state`
- **[[c6]]** `doc` `https://learn.chatgpt.com/docs/config-file/config-reference`
- **[[c7]]** `code` `src/workflow/runners/build/changed-files.ts:44-64`
- **[[c8]]** `doc` `/tmp/review-splitting-investigation.json`
- **[[c9]]** `doc` `/tmp/review-budget-lld-review-round1.md`
- **[[c10]]** `code` `src/workflow/review-pipeline/prepare.ts:98-120`
- **[[c11]]** `code` `src/workflow/review-pipeline/job.ts:300-319`
- **[[c12]]** `doc` `/tmp/review-budget-sequence.png`
- **[[c13]]** `doc` `/tmp/review-budget-lld-review-round2.md`
- **[[c14]]** `doc` `/tmp/review-budget-lld-review-round3.md`
- **[[c15]]** `stakeholder` `user instruction, 2026-10-27` — "the total time budget should also be based on the number of chunks, 10 * #chunk minutes, rather than fixed 20 mins. add this also and go for another round"
- **[[c16]]** `analyze-bundle` `insrc_analyze_step: dVDdGKaqfq2rhYzeeSasjA`
- **[[c17]]** `code` `src/daemon/threads/step-state.ts:45-65`
- **[[c18]]** `doc` `/tmp/review-budget-lld-cycle2-round1.md`
- **[[c19]]** `code` `src/workflow/review/template.ts:62-103`
- **[[c20]]** `code` `src/daemon/steps/review-step/phases/verdicts.ts:57-90`

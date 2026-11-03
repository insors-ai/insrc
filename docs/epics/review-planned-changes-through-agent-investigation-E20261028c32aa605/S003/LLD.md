<!-- insrc:artifact LLD-c32aa60534232f36-s3 -->

# LLD: STORY-c32aa60534232f36-s3

## Summary

**Epic:** `review-planned-changes-through-agent-investigation`
**HLD base run:** `wf-1793173650139-u4mcad`
**HLD effective hash:** `12565b4b7f9e...`

Let the independent reviewer choose which pinned source and related obligations to investigate next. Save each assessed block through an acknowledgment exchange while allowing several blocks in one compatible session. Bound time, input, retries and cancellation, and disclose incomplete caller-impact evidence without changing review scope.

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

> See **HLD-c32aa60534232f36** § 2. Framework summary

**Rollout phase:** C — bounded agent investigation
**Owns:** `sc3` (InvestigationContinuationV1)
**Consumes:** `sc1` (ImmutableReviewSubjectV1), `sc2` (EvidenceCoverageV1), `sc6` (ReviewRuntimePortsV1)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Own subject preparation, attribution ambiguity detection, exact Git commit/blob/block navigation and frozen context binding. Define foundational runtime-port types only; do not implement task investigation, a recovery store or new accounting storage. No generic HEAD/working-tree diff may select scope. — owns `sc1`, `sc6`
- `s2`: Own required-row enumeration, evidence identity/provenance and coverage relationships/dispositions. Reuse subject inputs and runtime ports. Keep ledger validation helpers private; do not execute reviewer turns or publish CRs. — owns `sc2`
- `s4`: Own durable implementation of foundational acceptance/usage-outbox ports, append/replay/checkpoint integrity, lease/generation fencing, uncertain attempts and compatibility/time recovery. Do not alter review criteria or introduce a usage warehouse. Its recovery implementation is composed by downstream s6 rather than consumed backwards by s3. Persist/replay block-level evidence and assessment receipts independently of final provider-call completion. — owns `sc4`
- `s5`: Own completion coverage/freshness/party validation, canonical CR adaptation and idempotent terminal publication receipts. Reuse existing lifecycle and severity/confidence policy. Do not let a completion request, missing evidence or a failed run masquerade as a completed verdict. — owns `sc5`
- `s6`: Own production composition, equivalent MCP/daemon/controller start/status/resume/cancel adapters, status/usage presentation fields, explicit engine rollout/rollback, legacy compatibility and evaluation fixtures. No client opens stores directly; no client-specific board UI or design-review replacement. Sole new-engine MCP adapter/schema owner; reconcile 8315a11f/S005 legacy sc7 as specified in the architecture and record code-only supersession before opt-in. Verify routing partitions across both installation orders. — owns `sc7`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `InvestigationTurnV1`

```typescript
interface InvestigationTurnV1 {
 readonly runId: string; readonly subjectDigest: string; readonly generation: number;
 readonly attemptId: string; readonly requestDigest: string; readonly policyDigest: string;
 readonly assignment: readonly string[]; readonly navigationRefs: readonly string[];
 readonly unresolvedRefs: readonly string[]; readonly priorAcceptedCheckpoint: string;
 readonly limits: { readonly attemptMs: number; readonly activeMsRemaining: number; readonly continuationsRemaining: number; readonly inclusiveTokenLimit: number };
}
interface InvestigationReplyV1 {
 readonly runId: string; readonly subjectDigest: string; readonly generation: number; readonly attemptId: string;
 readonly acceptedBlockReceiptIds: readonly string[]; readonly lastAcceptedSequence: number;
 readonly inspectedEvidenceIds: readonly string[]; readonly coverageUpdates: readonly CoverageV1[];
 readonly findings: ReviewLedgerV1['findings'];
 readonly next: { readonly kind: 'continue' | 'request-completion' | 'pause'; readonly remainingWork: readonly string[]; readonly reason: string };
}
interface ImpactCapabilityV1 {
 readonly mode: 'source-only' | 'indexed-impact';
 readonly index: { readonly revision: string; readonly freshness: 'compatible' | 'stale' | 'unknown'; readonly completeness: 'partial' | 'unknown' } | null;
 readonly queryChangedEntityCallers: ((entityRef: string) => Promise<readonly EvidenceV1[]>) | null;
}
interface ReviewBlockProgressV1 {
 readonly runId: string; readonly subjectDigest: string; readonly generation: number; readonly attemptId: string;
 readonly progressId: string; readonly expectedSequence: number; readonly blockId: string;
 readonly disposition: 'reviewed' | 'needs-followup' | 'unverified';
 readonly evidenceIds: readonly string[]; readonly notes: string; readonly coverageUpdates: readonly CoverageV1[];
 readonly findings: ReviewLedgerV1['findings']; readonly outstandingWork: readonly string[];
}
interface BlockCheckpointReceiptV1 {
 readonly runId: string; readonly subjectDigest: string; readonly generation: number;
 readonly progressId: string; readonly blockId: string; readonly sequence: number; readonly checkpointDigest: string;
}
```

**Returns:** `InvestigationReplyV1` — One bounded continuation outcome plus references to accepted per-block progress. A request-completion reply is a request to s5, never an approved or published verdict.

**Errors:**
- `InvestigationError` when invalid-binding, unsupported-backend, invalid-progress, acceptance-conflict, budget-refused, cancelled, provider-failed or impact-unavailable; operational failures produce typed pause state preserving accepted receipts.

**Preconditions:**
- Trusted daemon context pins independent reviewer party/role routing, sc1 subject/sc2 basis and ledger, current owner generation, sc6 ports, budget profile, usage observer and backend qualification.
- Backend qualification explicitly states pinned-read-only access and in-session-progress or block-yield behavior. Existing opaque native runReviewSession is not sufficient evidence of either capability.

**Postconditions:**
- Only validated sc2 deltas accepted through sc6 may change accountable progress; each assessed block ACK follows successful appendTransition, before next block assessment.
- No new source scope, storage backend, MCP phase, approval or CR publication. Reuse existing provider abstraction and inclusive budget admission.

## 3. Data model changes

### 3.1 `Continuation coordinator and backend boundary` — new

Proposed investigation/continuation-types.ts exports exact sc3 plus internal typed policy/backend/coordinator context; continuation.ts owns runInvestigationContinuation(turn,context): Promise<InvestigationReplyV1> and serial progress/read handlers. A backend executes one managed request via a trusted LLMProvider binding, receives only an immutable navigation-oriented seed and narrow source/impact/progress capabilities, and returns a typed final reply. It must declare progress mode, provider/profile identity, pinning/read-only enforcement and cancellation support. Unsupported capability refuses before model dispatch. s3 builds the coordinator and capability checks; s6 composes provider/controller bridges and exposes external tools, while s4 implements durable ports. In-memory ports and deterministic backend/provider fixtures are scaffolding, explicitly not production durability. Existing CliProvider/OllamaProvider/runReviewSession/ReadOnlyToolLoop signatures and existing legacy tool catalogs stay unchanged in this Story. Existing native Read/Grep/Glob on a mutable checkout is not qualified pinned evidence. Existing runReadOnlyToolLoop is a reuse candidate only through its current allowed/registered execution and authenticated connectionExecution rules, not a bypass; a qualified integration belongs to s6. A provider without compatible in-session capability may explicitly use block-yield execution, stopping after one assessed block until ACK, or refuse; never silently choose this mode or prescribe one call for every block/requirement. The backend abstraction permits many block progress exchanges within one managed provider session. No native progress bridge is claimed implemented merely by defining this interface. All actual LLM access remains serial LLMProvider/CliProvider, with router-enforced critical review tier and independent party. This is staged domain implementation, not production provider rollout.

```
// Proposed INTERNAL sc3 seams. These do not extend LLMProvider or register MCP phases.
interface InvestigationBackend {
 readonly provider: LLMProvider;
 readonly qualification: { readonly providerId: string; readonly profileDigest: string;
  readonly pinnedReads: true; readonly readOnly: true;
  readonly progressMode: 'in-session-progress' | 'block-yield'; readonly cancellable: true };
 readonly execute: (turn: InvestigationTurnV1, tools: InvestigationTools, signal: AbortSignal) => Promise<InvestigationReplyV1>;
}
interface InvestigationTools {
 readonly read: (reference: string) => Promise<ReviewReadReceiptV1>;
 readonly impact: ImpactCapabilityV1;
 readonly progress: (progress: ReviewBlockProgressV1) => Promise<BlockCheckpointReceiptV1>;
}
// Backend is trusted composition, never a reviewer-supplied capability assertion.
// Its execute closure must use the bound LLMProvider; tests supply deterministic providers.
// Coordinator context supplies sc1 subject, sc2 LedgerBasis/ReviewLedgerV1 and trusted receipts,
// sc6 ports, current ownership generation, authenticated parties/critical role, budget profile,
// monotonic clock/consumed active time, usage observer, prior accepted progress receipts and signal.
// runInvestigationContinuation(turn, context): Promise<InvestigationReplyV1>

```


### 3.2 `Pinned navigation, evidence and indexed impact` — new

The turn binds run/subject/generation/attempt/request/policy digests, assignment refs, unresolved refs and prior accepted checkpoint. Validate against trusted context, verify subject freshness through s1, validate sc2 ledger/basis, and resolve assignment IDs against required rows and selected blocks. Seed detailed task/check IDs, pinned artifact refs, packet/block navigation and outstanding work; do not eagerly copy whole source/contracts or one clause per model call. Read requests go through s1 readReviewSource/sc6 readEvidence and trusted inspection adapters; coordinator admits receipts via sc2 admitLedgerEvidence/applyReviewLedgerDelta, never backend-claimed file access. A backend lacking trustworthy evidence mediation cannot claim substantive coverage. Untrusted source text is returned as data and cannot alter policy, role, allowlist or scope. Source-only and indexed-impact use byte-equivalent subject/task/packet seed and rules; the latter additionally receives ImpactCapabilityV1. Its daemon-owned query validates entity membership in a selected changed method/entity with exact source digest/location; ambiguous old/new symbol mapping yields an unresolved impact obligation. Context helpers and callers are not additional commits or changed blocks. Reuse daemon findCallers through an injected closure-scoped adapter; no DB handles in client/controller or new analyzer recipe. Index revision/freshness and partial/unknown coverage appear on every impact receipt; empty or truncated caller results never prove no impact. Stale/missing data records limitations and unresolved obligations, with source inspection available. Sc2's trusted receipt adapter records index metadata and appendImpactRequirements accounts for discovered questions. No default widening to HEAD or foreign source. Every EvidenceV1 returned by the impact capability must have matching trusted native receipt metadata in the sc2 validation context; model-supplied EvidenceV1 arrays are never sufficient. Global index completeness remains partial/unknown as sc3 declares; independently inspected caller source may be complete textual evidence without claiming exhaustive caller coverage.


### 3.3 `Per-block progress and accepted-state acknowledgment` — new

Proposed progress.ts validates ReviewBlockProgressV1 and converts trusted inspection references to sc2 deltas. One run owns 1..N attempts; an attempt may submit 0..N block progress versions; each progress binds exactly one selected block and one expected accepted sequence. One accepted progress identity yields exactly one reusable receipt; many progress versions may refine the same block. Evidence may support many coverage rows. Validate all bindings, selected block, authenticated attempt, progress disposition, linked evidence/findings, outstanding refs and notes bounds. reviewed means this block was assessed, not that every task is satisfied; cross-block needs remain needs-followup/unverified. Large blocks may save additional partial progress before assessment. Compute sc2 candidate without mutating accepted ledger; stage its transition object through sc6.stageImmutableValue (objects remain objects at this boundary), then appendTransition(runId,generation,expectedSequence,transitionRef). Only after append succeeds may local accepted ledger/sequence and BlockCheckpointReceiptV1 advance and ACK return. Failure sends no ACK, leaves old accepted view and pauses; do not advance another block assessment. The port's journal/lease/idempotence semantics belong to s4. Transition payload includes progressId, canonical payload digest, attempt binding, candidate/delta references, evidence receipts, outstanding work, and predecessor receipt so s4 can recognize duplicate replay. Same progress ID and digest returns prior receipt without reapplying; conflicting digest/sequence refuses. Coordinator reads previously accepted progress receipts from trusted owner context before a resumed/replayed request; it never reconstructs absent state from provider memory. An append whose result is uncertain stays uncertain; no claim of exact-once external execution. Final reply references acceptedBlockReceiptIds/lastAcceptedSequence and must not resubmit accepted deltas; any remaining coverageUpdates/findings need a fresh validated transition, not silent acceptance at return. request-completion can be emitted only as an s5 request; pending/unverified work remains visible. No terminal CR writes.

```
// Versioned payload behind sc6.stageImmutableValue; s4 stores refs, sc3 owns its interpretation.
interface BlockProgressTransitionV1 {
 readonly version: 1; readonly kind: 'block-progress';
 readonly progress: ReviewBlockProgressV1; readonly payloadDigest: string;
 readonly candidateLedgerRef: string; readonly trustedReceiptRefs: readonly string[];
 readonly predecessorCheckpoint: string;
}
// Same progressId + payloadDigest resolves the same accepted receipt from authoritative context.
// A lost ACK may be recovered from accepted transitions; never infer acceptance from model memory.

```


### 3.4 `Inclusive admission, pause controls, failure and usage` — new

Proposed continuation-policy.ts reuses resolveReviewBudgetPolicy/createReviewBudgetPolicy/measureReviewBudget and provider-final wire schema/tools manifest normalization; no replacement token estimator or serializer. Admission covers seed/history, response schema, full capability descriptions, host declarations, native/transport/completion/inspection reserves and correction headroom. Default cap128000 estimated tokens; unsafe indivisible request refuses instead of dropping required evidence. Bounded read results return references/limits; backend must yield before required context would overflow. Profiles for opaque native history stay explicitly reserved/estimated, not a verified hard native ceiling. Effective attempt timeout is min(300000ms, remaining active budget, admitted role/provider limit), with300000ms silence cap only if below total timeout. Default run pause at120active minutes or24managed attempts; a trusted caller may supply explicitly extended allowance. These are pause controls, never checkpoint intervals. Count active provider/tool execution time, carry consumed time/attempts across yields, and do not reset on client disconnect. At most one immediate transient retry, with new attempt identity and consumed allowance preserved; provider internalRetry:false prevents hidden retry multiplication. Authentication, schema/binding, permission, budget and stale errors do not auto-retry. Repeated failure or cancellation pauses promptly before remaining backlog. Abort propagates to provider and tools; serialize all provider calls and fence late callbacks by generation/attempt. Accepted block receipts survive cancellation; unacknowledged work remains unresolved. Record attempt usage through sc6.recordAttemptUsage with stable observationId and all existing nullable counters/provider/model/quality/granularity fields. Backend must supply an actual observer when available; unsupported native usage remains unavailable, not inferred from reserves or tool counts. Idempotent replay does not emit another charge. Pending/unavailable usage state is retained in transition/status for s4 outbox; no new usage store or artifact JSON collection.


## 4. Diagrams

- [Sequence diagram](docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/S003/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Use exact selected packets and freshness-bound navigation; never select additional commits or reinterpret scope. |
| `sc2` | consumes | Reuse ledger catalog, trusted receipt admission and atomic delta validation. Semantic judgment stays independent; missing graph evidence alone is not a code breach. |
| `sc3` | implements | Own bounded continuation and progress/ACK domain behavior, optional impact capability, pause/retry and usage emission; no external MCP registration. |
| `sc6` | consumes | Stage object-valued transitions centrally and append accepted state before ACK; emit usage observations. s4 owns durable implementation, s6 composition. |

## 6. Error paths

**Error cases**

- **Unsupported backend or untrusted reviewer/tool scope** (recoverable)
  - Detection: Compare qualification manifest and trusted role/party/pinning/progress capabilities before dispatch; validate every source/entity request against sc1 and tool allowlist.
  - Response: InvestigationError unsupported-backend/invalid-binding; no model/tool call, no fallback to mutable checkout or legacy protocol.
  - User impact: Use a qualified adapter; s6 integration must supply missing native/controller bridge.
- **Bad progress, conflicting replay or failed/uncertain acceptance** (recoverable)
  - Detection: Validate run/subject/generation/attempt/progress identity, expected sequence, block membership and canonical payload; sc2 rejects unsupported evidence or dangling links; sc6 append reports conflict/failure.
  - Response: No ACK or assessment advance; pause with last known accepted receipt and explicit uncertain work. Same accepted progress digest reuses stored receipt; conflict refuses.
  - User impact: Recover authoritative accepted state through s4; only unfinished/unacknowledged work may repeat.
- **Budget/time exhaustion, cancellation or repeated provider failure** (recoverable)
  - Detection: Inclusive admission fails, active deadline/attempt allowance consumed, AbortSignal fires, or one transient retry has already failed.
  - Response: Typed pause with accepted block IDs, outstanding refs and consumed usage/time. Cancel provider/tools, fence late callbacks, no fabricated complete verdict or backlog sweep.
  - User impact: Explicit extension/retry or corrected backend may resume later.
- **Stale/incomplete index mapping or unavailable usage** (recoverable)
  - Detection: Adapter cannot bind changed entity to packet source or discloses stale/missing caller coverage; usage observer lacks actual counters.
  - Response: Impact remains contextual and unresolved with limitations; source navigation remains available. Usage uses unavailable/pending semantics, never fabricated zero or allowance-as-consumption.
  - User impact: User sees uncertainty and remaining impact questions without changed-scope expansion.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| One backend session assesses several related blocks | Progress/append/ACK repeats inside that session; each block is accepted before next assessment, no mandatory separate call per block. |
| Cross-block reasoning or large-block partial inspection | Checkpoint needs-followup/unverified with outstanding refs; context reads may cross blocks while the assessed-block cursor remains ACK-gated. |
| Append accepted just before transport cancellation but acknowledgment lost | Do not assume failure or success locally; retain uncertain identity. s4 replay can return the same authoritative accepted receipt. |
| Source-only vs indexed mode, empty callers and foreign concurrent edits | Identical packet seed; caller evidence is context-only and empty results do not prove no impact; foreign commits remain excluded. |

**Invariants to preserve**

- Provider execution remains serial through LLMProvider with current read-only/connectionExecution restrictions; no direct REST or registry bypass. Grounded by provider/tool-loop analyze bundle. [[c1]]
- Inclusive budget helpers, pinned source reads and sc2 validation remain authoritative; no new estimator or evidence store. Grounded by budget/source/ledger analyze bundle. [[c2]]

## 7. Test strategy

**Test framework:** `node:test and node:assert/strict via tsx, following completed investigation fixtures and inspected read-only loop/provider tests. Deterministic LLMProvider/backend, fake clock and in-memory sc6 ports; no routine live model tests.`

**Test levels**

- **unit** — Prove bounded coordinator, capability, retry/pause and receipt rules.
  - Subjects: `review-s3-ac1 grouped investigation: several block progress/ACK exchanges inside one compatible backend session, same subject seed in both modes, no call-per-clause plan`, `review-s3-ac2 inclusive budget covers history/schema/tools/reserves; deadline min300s/remaining allowance; overflow yields without dropping evidence; run ceilings never set checkpoint cadence`, `review-s3-ac3 cancel/repeated transient failure pauses promptly, at most one retry, internalRetry disabled, consumed allowances retained and late callbacks fenced`, `review-s3-ac4 wrong party/tier/context/capability or mutable/unmediated reads refuse before dispatch; tools cannot alter source/policy/scope and provider calls are serial`, `review-s3-ac5 changed-entity mapping gates caller query; stale/missing/partial/empty results retain unresolved impact and never add commits`, `Progress validation rejects foreign block/generation/attempt/sequence, uninspected evidence and conflicting progress digest; identical accepted replay returns prior receipt`, `Append failure/uncertainty sends no ACK, preserves accepted ledger, and prevents next block assessment; final reply does not reapply accepted deltas`, `Usage observations retain provider/model/native quality/granularity and stable IDs; absent counters unknown, pending writer explicit, replay does not recharge`
  - Fixtures: `Deterministic compatible backend and unsupported current-native capability fixture`, `Fake active clock/AbortSignal, delayed append/ACK promises, trusted owner/role/source/index/usage contexts`
- **integration** — Compose completed sc1/sc2 with the sc3 domain using in-memory ports while production remains disabled.
  - Subjects: `Real pinned source receipt -> sc2 candidate -> stage object -> append accepted transition -> block ACK, including two blocks before final session reply`, `Crash/cancel after an acknowledged block but before enclosing reply preserves earlier accepted state; uncertain in-flight block remains explicit (durable restart is s4 test obligation)`, `Qualified block-yield path and unsupported opaque native path are explicit; no MCP registration, legacy/provider signature changes or production activation`, `Existing inclusive-budget, read-only loop and s1/s2 focused fixtures remain compatible`
  - Fixtures: `Existing temporary-Git subject/ledger fixtures and deterministic backend executing through fake LLMProvider`, `In-memory acceptance/usage adapters marked test-only, no real DB or network`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `review-s3-ac1 grouped investigation`, `Pinned source/ledger/progress integration with two blocks per session` |
| `ac2` | `review-s3-ac2 inclusive budget and effective deadlines`, `Append-before-ACK and final-delta replay fixtures` |
| `ac3` | `review-s3-ac3 bounded failure/cancel`, `Acknowledged-block preservation and uncertain acceptance fixtures` |
| `ac4` | `review-s3-ac4 trust/party/tool/serial execution`, `Explicit qualified/unsupported backend paths and legacy compatibility` |
| `ac5` | `review-s3-ac5 index/entity limits`, `Both-mode scope parity and empty-caller uncertainty` |

## 8. Migration

**State before:** Analyze bundles locate existing final-answer reviewer sessions and budget/read-only tool-loop helpers, plus completed sc1/sc2. ReviewSessionOpts/native CLI tooling do not expose the required progress/ACK and pinned-evidence bridge. Legacy review execution remains active.

**State after:** Add isolated sc3 domain types/coordinator, qualified backend interface, progress acceptance, policy and impact wrappers. Deterministic compatible backends/in-memory ports demonstrate behavior; current opaque native sessions refuse unsupported qualification. s4 supplies durable backend and s6 qualifies/composes production provider/controller bridges.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add exact sc3 domain values and capability/policy validators, consuming existing sc1/sc2/sc6 and budget helpers. — ↩ rollbackable
2. Add serial coordinator, pinned evidence/progress acceptance and optional impact wrappers, with in-memory ports and deterministic backend tests. — ↩ rollbackable
3. Expose internal sc3 entrypoints for downstream composition; verify compatibility and keep production selection disabled until s4/s6 provide durable/qualified adapters. — ↩ rollbackable

**Backward compat:** No edits to existing LLMProvider/ReviewSessionOpts/native CLI flags/read-only loop contracts, MCP schemas or legacy controller frames in this Story. New engine is not activated. Legacy sibling8315a11f/S005 retains transport ownership; s6 alone registers the versioned new-engine adapter per approved HLD. No persisted artifact rewrite or forced migration of old volatile sessions.

## 9. Alternatives considered

### 9.1 a1: Capability-qualified continuation coordinator — **CHOSEN**

One domain coordinator supports acknowledged in-session progress and explicit block-boundary yields.

Use exact sc3 turn/progress/receipt values over sc1/sc2/sc6. A trusted backend executes through LLMProvider and declares pinned read-only and progress capabilities; coordinator mediates reads, evidence, ledger updates and acceptance before ACK. Compatible backends may assess many blocks in one session; block-yield is an explicit capability mode, not a mandatory per-block request plan. Unqualified native sessions refuse until s6 composition.

### 9.2 a2: Single capability mode for in-session progress

Require every backend to expose bidirectional progress/read callbacks; no block-yield compatibility mode.

Use the same sc3/sc1/sc2/sc6 contracts, but admit only backends with in-session progress. Keep legacy/native sessions unavailable until their bridges are qualified. Coordinator still requires acceptance before each block ACK and reuses existing budget/ledger helpers.

**Rejected because:** Safe but needlessly restricts qualified block-boundary execution.

## 10. References

- **[[c1]]** `analyze-bundle` `s1/analyzeBundles/0` — "Analyzer locates CLI/Ollama runReviewSession and runReadOnlyToolLoop. Source ReviewSessionOpts exposes budget/cwd/deadline/retry/stall/signal, not an incremental progress/tool bridge. CLI native tools"
- **[[c2]]** `analyze-bundle` `s1/analyzeBundles/1` — "Analyzer locates resolveReviewBudgetPolicy/createReviewBudgetPolicy/measureReviewBudget, applyReviewLedgerDelta/readReviewSource and findCallers. Reuse inclusive admission and source/ledger validation"
- **[[c3]]** `analyze-bundle` `s1/analyzeBundles/2` — "Analyzer test.locate was broad/off-topic; direct file lookup locates read-only-tool-loop tests, provider reviewer-session fixtures and completed s1/s2 investigation tests. No live model suite needed f"
- **[[c4]]** `prior-artifact` `.insrc/artifacts/HLD-c32aa60534232f36.json` — "Approved sc3 and s3 boundary; sc1/sc2/sc6 consumed, sc4/sc5/sc7 deferred."
- **[[c5]]** `code` `src/shared/types.ts:248-269` — "Current reviewer session options do not provide an incremental progress bridge."
- **[[c6]]** `code` `src/workflow/review-pipeline/budget.ts:86-148` — "Reuse inclusive budget policy/measurement."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 15 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-29T06:44:26.188Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._

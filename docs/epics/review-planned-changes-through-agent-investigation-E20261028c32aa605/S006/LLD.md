<!-- insrc:artifact LLD-c32aa60534232f36-s6 -->

# LLD: STORY-c32aa60534232f36-s6

## Summary

**Epic:** `review-planned-changes-through-agent-investigation`
**HLD base run:** `wf-1793173650139-u4mcad`
**HLD effective hash:** `7d083bbbc4c1...`

S6 connects the completed investigation engine to daemon and MCP clients through one daemon-owned service. Both reviewer parties and source modes share pinned scope, per-block durable progress, recovery and canonical completion; indexed mode adds only caller discovery. Adoption stays opt-in behind native-tool qualification, compatibility and quality evidence, with a rollback that preserves existing runs and design-review behavior.

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

**Rollout phase:** F — integration and measured adoption
**Owns:** `sc7` (ReviewClientStatusV1)
**Consumes:** `sc1` (ImmutableReviewSubjectV1), `sc2` (EvidenceCoverageV1), `sc3` (InvestigationContinuationV1), `sc4` (DurableReviewRecoveryV1), `sc5` (ReviewCompletionV1), `sc6` (ReviewRuntimePortsV1)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Own subject preparation, attribution ambiguity detection, exact Git commit/blob/block navigation and frozen context binding. Define foundational runtime-port types only; do not implement task investigation, a recovery store or new accounting storage. No generic HEAD/working-tree diff may select scope. — owns `sc1`, `sc6`
- `s2`: Own required-row enumeration, evidence identity/provenance and coverage relationships/dispositions. Reuse subject inputs and runtime ports. Keep ledger validation helpers private; do not execute reviewer turns or publish CRs. — owns `sc2`
- `s3`: Own independent read-only task-directed continuation behavior, on-demand source navigation, optional indexed caller/impact enrichment, budget admission, bounded retry/pause and attempt usage emission through foundational ports. In-memory ports are test scaffolding while production selection remains disabled until s4/s6; no durable storage implementation or terminal approval logic. Publish and acknowledge incremental block progress within continuations, with partial cross-block assessments recorded rather than lost. Domain progress contracts only; no competing MCP phase/schema ownership. External registration belongs to s6. — owns `sc3`
- `s4`: Own durable implementation of foundational acceptance/usage-outbox ports, append/replay/checkpoint integrity, lease/generation fencing, uncertain attempts and compatibility/time recovery. Do not alter review criteria or introduce a usage warehouse. Its recovery implementation is composed by downstream s6 rather than consumed backwards by s3. Persist/replay block-level evidence and assessment receipts independently of final provider-call completion. — owns `sc4`
- `s5`: Own completion coverage/freshness/party validation, canonical CR adaptation and idempotent terminal publication receipts. Reuse existing lifecycle and severity/confidence policy. Do not let a completion request, missing evidence or a failed run masquerade as a completed verdict. — owns `sc5`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `ReviewClientStatusV1`

```typescript
interface ReviewClientStatusV1 { readonly version: 1; readonly engine: 'plan-investigation-v1' | 'legacy'; readonly runId: string; readonly subjectDigest: string; readonly generation: number; readonly state: ReviewRecoveryV1['state']; readonly coverageRef: string; readonly covered: number; readonly required: number; readonly unresolved: readonly string[]; readonly resume: { readonly available: boolean; readonly reason: string | null }; readonly consumption: { readonly reportedRef: string | null; readonly estimatedInputTokens: number | null; readonly unavailableAttempts: number; readonly activeMs: number; readonly continuationCount: number }; readonly receipt: ReviewCompletionReceiptV1 | null; readonly error: { readonly code: string; readonly retryable: boolean } | null; }
```

**Returns:** `ReviewClientStatusV1` — Exact sc7 status projection; additional transport diagnostics live in the versioned reply envelope, not in this interface.

**Errors:**
- `RecoveryError` when Unsupported engine/version or unrecognized run descriptor; no legacy reinterpretation.

**Preconditions:**
- Daemon owns the registered repository and authorizes caller access; status uses verified recovery replay.

**Postconditions:**
- Read-only status and heartbeats do not advance generation, charge time or imply completion.
- New-engine completion receipt comes only from sc5. Legacy diagnostics never create a recovery journal.

### 2.2 `runReviewSession`

```typescript
runReviewSession<T>(prompt: string, schema: StructuredSchema, opts: ReviewSessionOpts & { investigation?: QualifiedInvestigationSessionBinding | undefined }): Promise<T>
```

**Parameters:**
- `prompt: string` — Admitted compact seed, turn and trailing schemas/catalog; no eager source chunks.
- `schema: StructuredSchema` — sc3 final reply; findings/deltas must already be block-accepted.
- `opts: ReviewSessionOpts & { investigation?: QualifiedInvestigationSessionBinding | undefined }` — Proposed optional production binding for isolated, authenticated pinned read/impact/progress callbacks; absent preserves existing design/legacy behavior.

**Returns:** `Promise<T>` — One qualified native continuation result, checked by full schema. This optional binding is proposed S6 provider integration, not an existing capability.

**Errors:**
- `InvestigationError` when Installed adapter cannot prove isolated tool catalogue, pinned-only reads, read-only operation, cancellability, inclusive budgeting or progress ACK within session.

**Preconditions:**
- New-engine path must supply a trusted binding; broad existing reviewer-session capability alone is insufficient.
- No direct REST; existing provider/model tier resolution remains authoritative.

**Postconditions:**
- Calls use the existing LLMProvider/CliProvider abstraction; internalRetry:false, 5-minute maximum and scoped cancellation.
- Legacy calls without binding retain current tools, schemas and behavior.

### 2.3 `runRecoveredContinuation`

```typescript
runRecoveredContinuation(store: RecoveryStore, lease: NonNullable<ReviewRecoveryV1['owner']>, input: InvestigationTurnV1, initial: InvestigationContext): Promise<InvestigationReplyV1>
```

**Parameters:**
- `store: RecoveryStore` — Existing sc4 daemon-owned run store.
- `lease: NonNullable<ReviewRecoveryV1['owner']>` — Current fenced lease; controller and native adapters cannot set generation.
- `input: InvestigationTurnV1` — Server-produced assignment/cursor from accepted state.
- `initial: InvestigationContext` — Production canonical/source/graph/provider/usage adapters and authenticated parties.

**Returns:** `Promise<InvestigationReplyV1>` — Existing sc3/sc4 continuation outcome; no transport-specific coverage or retry rules.

**Errors:**
- `RecoveryError` when Stale/unsupported compatibility, ownership loss, budget exhaustion or invalid progress.

**Preconditions:**
- Verified subject/row basis and authenticated independent reviewer.
- Only one provider request is active at a time in this daemon's investigation scheduler; read-only status may interleave.

**Postconditions:**
- Per-block acceptance before ACK; multiple blocks per session; accepted work survives failed enclosing calls.
- Transport detach is not cancellation, verdict or automatic provider retry.

### 2.4 `completeInvestigationReview`

```typescript
completeInvestigationReview(store: RecoveryStore, leaseId: string, generation: number, intentRef: string | null, context: CompletionValidationContext, deps: CompletionPublisherDeps): Promise<ReviewCompletionReceiptV1>
```

**Parameters:**
- `store: RecoveryStore` — Same sc4 run.
- `leaseId: string` — Current lease.
- `generation: number` — Current fenced generation.
- `intentRef: string | null` — Prepared immutable intent or frozen retry.
- `context: CompletionValidationContext` — Current trusted source/BUILD/party pins.
- `deps: CompletionPublisherDeps` — Existing daemon-owned canonical lifecycle store and fresh readers.

**Returns:** `Promise<ReviewCompletionReceiptV1>` — Existing sc5 canonical completion only, not human BUILD approval.

**Errors:**
- `RecoveryError` when Incomplete/stale/conflicting state, changed canonical head, lost authority or uncertain publication.

**Preconditions:**
- No active attempt and publishable accepted ledger; expected canonical revision/absence captured through canonical queue.

**Postconditions:**
- Reuse frozen intent and receipt on retries; regenerate document separately.
- No automatic approval, tracker post or second review.

## 3. Data model changes

### 3.1 `Production command and routing envelope` — new

Proposed shared types in src/shared/review-investigation.ts and daemon adapters in src/daemon/review-investigation-rpc.ts. Explicit engine:'plan-investigation-v1', version:1, operation start/status/resume/cancel/read/impact/progress/reply; start includes requestId UUID, registered repo identity, root/story/BUILD IDs, sc1 explicit commit/parent/attestation selections and sourceMode. The daemon derives author/reviewer from canonical BUILD and authenticated execution context, never from client fields. start returns accepted descriptor/status and, for controller execution, one sc3 turn with scoped capability. read accepts only a bounded sc1 reference; progress accepts only sc3 ReviewBlockProgressV1 and returns its durable receipt; reply accepts only sc3 InvestigationReplyV1. Existing insrc_code_review_step and codeReview.run route explicit new-engine envelopes before invoking legacy resolution/grounding. Proposed codeReview.investigation command IPC methods are additive. Legacy start/judgements or predecessor emit_calls/answers remain on their own versioned states. No engine field plus existing state always routes to its original adapter; a new explicit engine requires negotiated capability; engine/schema/generation mismatch refuses before dispatch. Never pass a new-engine request into legacy runCodeReview or generic HEAD diff on error.

**Call sites:**
- `src/daemon/code-review-rpc.ts`
- `src/daemon/steps/code-review-step/handler.ts`
- `src/mcp/server.ts`
- `src/mcp/daemon-stream.ts`

### 3.2 `Immutable production descriptor` — new

Proposed src/daemon/review-investigation-service.ts owns one service per registered repo and consumes S1-S5. One start requestId maps to runId=SHA256(canonical repo ID + requestId), with exclusive admission and exact descriptor comparison; same request/scope reuses, conflicting reuse refuses. Store an immutable 0600 descriptor under the private 0700 .insrc/review-runs/production-v1 namespace, referencing sc4 run ID and immutable manifest, approved root/story/BUILD pins, packet selections, policy/profile/compatibility digest, source mode, reviewer party, adapter version and start identity. This is an immutable discovery binding, not a second acceptance journal. Create-before-run crash is a prepared admission orphan recoverable only after exact canonical revalidation; no accepted work or started attempt is inferred. RecoveryStore remains sole owner of accepted evidence, attempts, progress, leases and terminal receipts; do not alter private sc4 events or manifest layout. Caller-controlled paths never select storage; validate run IDs and registered repo realpath. Production descriptor and bridge files are private runtime, excluded from source/index/context like existing .insrc state.

**Call sites:**
- `src/workflow/code-review/investigation/recovery-store.ts`
- `src/workflow/code-review/investigation/recovery-session.ts`
- `src/workflow/code-review/investigation/subject.ts`

### 3.3 `Production evidence and scope adapters` — new

Proposed src/daemon/review-investigation-adapters.ts reads daemon's existing canonical ArtifactStore/History/LifecycleService and registry; project verified work into readApprovedWork then prepareReviewSubject/buildLedgerBasis. Use committed BUILD task/change attribution and explicit selected commit/parent packets; server-generated attestations prove full/exclusive ownership or ask for explicit approved scope evidence when mixed/ambiguous. A Story trailer alone is not block exclusivity. Do not accept client claims of approval or unregistered repos. Planned scope must not bypass a present invalid PLAN; planless scope requires an explicit approved upstream basis with criteria/change rows retained. Canonical artifact evidence reads use pinned immutable revision/history and verified exact rendered text, not mutable markdown. Source reads use sc1 pinned blobs/context; verified TESTS/BUILD results bind to the same source. Source-only has no caller tool; indexed mode resolves changed entities to selected block/path/blob and uses daemon graph findCallers within registry dependency closure with source/index identity, limited rows and stale/partial/unknown markers. Empty/partial discovery cannot prove no impact. Returned caller source is separately inspected through pinned reads; unresolved applicability produces required impact rows/unverified work or accountable findings, never silent omission. No index writes or client DB access.

**Call sites:**
- `src/workflow/code-review/investigation/work.ts`
- `src/workflow/code-review/investigation/subject.ts`
- `src/workflow/code-review/investigation/ledger-catalog.ts`
- `src/workflow/code-review/investigation/continuation-types.ts`

### 3.4 `Qualified native and controller session bindings` — new

Proposed src/agent/providers/investigation-session.ts and src/mcp/review-investigation-bridge.ts provide one scoped read/impact/progress/reply catalogue bound to process epoch, run, subject, attempt, generation, requestDigest, caller role and expiry. A daemon-created capability authenticates the binding; it cannot authorize other repos, raw filesystem/shell/git/network/MCP tools, approval, or arbitrary daemon RPC. Native CLI execution uses a private isolated configuration and only this scoped bridge, with built-in/general tools disabled or denied by an independently verified adapter capability; immutable data is returned only through sc1/sc2-backed callbacks. Qualification must inspect effective tool/config isolation, not trust provider boolean claims or read-only sandbox alone. CLI-specific argument support is implemented/verified per installed adapter version; unsupported binaries refuse before issuing a model request, never fall back to existing broad runReviewSession. OAuth remains the CLI's existing session; no credential copies, direct REST or repository-authored server instructions. Bridge can ACK several blocks before a final response inside one native session. Controller hosts receive the same authorized turn/tool schemas via MCP and fresh declared host budget; server still issues/persists attempts, validates provenance and ACKs progress. Host context estimates are declared, not measured. Capability grants no general artifact write: progress invokes only sc3/sc4 validated acceptance. Disconnect retains accepted state and the bounded active attempt; reconnect may reattach only a still-active authenticated binding. Restart/expiry/cancel revokes old capabilities; resume claims a new generation and reuses accepted work, never legacy volatile state. Cancellation aborts provider/host wait and waits for draining authority before reuse; late callbacks refuse. Effective isolation also excludes inherited user/project MCP servers, plugins/hooks and repository startup instructions as executable authority; no unrestricted repository cwd or writable artifact directory is exposed to the reviewer. Only adapter/version combinations with verified isolation can be selected; deterministic fake-CLI tests alone do not certify an installed binary.

```
interface QualifiedInvestigationSessionBinding { readonly version: 1; readonly bindingId: string; readonly adapterVersion: string; readonly profileDigest: string; readonly catalogDigest: string; readonly tools: InvestigationTools; readonly qualificationRef: string; } // Trusted daemon/provider injection only. qualificationRef identifies verified effective isolation, not a reviewer capability claim.
```

**Call sites:**
- `src/shared/types.ts`
- `src/agent/providers/cli-provider.ts`
- `src/agent/providers/__tests__/cli-review-session.test.ts`
- `src/workflow/code-review/investigation/continuation-types.ts`
- `src/workflow/code-review/investigation/recovery-session.ts`

### 3.5 `Status, progress and usage projection` — new

Exact sc7 ReviewClientStatusV1 is read from verified replay in proposed src/daemon/review-investigation-service.ts. covered counts required ledger rows with satisfied/finding/not-applicable dispositions; required is basis row count; pending/unverified and outstanding references remain unresolved. coverageRef is a private immutable snapshot reference authorized via daemon reads, never an artifact JSON ledger dump. generation and resume availability come from sc4 compatibility/lease/policy and current source; completed receipt is sc5-verified, transport failure is error with no verdict. Additional versioned envelope diagnostics expose latest durable block receipt/checkpoint/outstanding block IDs, provider liveness timestamp separately, usage pending/estimated/unavailable counts and allowance limits/preflight estimate with uncertainty. consumption.activeMs/continuationCount are sc4 accounting; estimatedInputTokens is an admission estimate, not observed spend. reportedRef refers only to deduplicated known observed usage; unknown counters stay null, pending outbox remains pending and cumulative snapshots are not added as model calls. Integrate the existing usage writer only when it guarantees idempotency; otherwise retain sc4 outbox, no new warehouse. MCP/daemon projections share one serializer and bounded heartbeat/status reads, not LLM summaries. Legacy diagnostics use engine:legacy, generation:0, resume unavailable, real observed phases and legacy dimension counts with explicit coverageUnit:legacy-dimension in the outer envelope; diagnostic subject digest binds existing BUILD fingerprint, not sc1 scope authority. Legacy missing identity returns explicit status-unavailable; no fabricated RecoveryStore or resumability.

**Call sites:**
- `src/workflow/code-review/investigation/recovery-store.ts`
- `src/workflow/code-review/investigation/continuation-types.ts`
- `src/mcp/daemon-stream.ts`
- `src/config/config-catalog.ts`

### 3.6 `Adoption evidence and route partition` — new

Proposed codeReview.engine selection defaults to legacy; explicit plan-investigation-v1 starts require daemon/client schema support, reader support for investigation CR v1, qualified backend, approved predecessor code-only supersession record, and passing deterministic evaluation manifest tied to source commit/adapter/policy/fixture versions. A config switch alone cannot bypass readiness. Existing in-flight engine/transport identity is immutable across config changes. Before opt-in, use supported tracked amendment/tracking flow for predecessor S002/S003 code chunk/gather and S005 new CODE-review frames; do not edit approved sibling LLDs or design-review frames. Treat predecessor S005 installed and absent as separate tested partitions, preserve both installation orders and pre-S005 saved-state refusal/continuation semantics. Rollback disables new starts, revokes scheduling of new turns, pauses/drains existing attempts safely, keeps status/export/cancel and compatible frozen publication reconciliation; no silent conversion or loss of usage/receipts. A binary lacking investigation support refuses its resume IDs explicitly. Default replacement and live LLM comparison require separate explicit authorization and measured evidence; deterministic fixtures do not establish real defect recall or actual cloud token savings.

**Call sites:**
- `src/config/config-catalog.ts`
- `src/daemon/code-review-rpc.ts`
- `src/daemon/steps/code-review-step/handler.ts`
- `src/mcp/server.ts`
- `src/workflow/review-pipeline/controller.ts`
- `docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S005/LLD.md`

## 4. Diagrams

- [Sequence diagram](docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/S006/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Consume sc1 through completed public internal APIs. Production adapters supply trusted canonical/source/provider/graph/usage seams without changing ownership, private journal events, ledger rules, budgets, severity or completion policy. |
| `sc2` | consumes | Consume sc2 through completed public internal APIs. Production adapters supply trusted canonical/source/provider/graph/usage seams without changing ownership, private journal events, ledger rules, budgets, severity or completion policy. |
| `sc3` | consumes | Consume sc3 through completed public internal APIs. Production adapters supply trusted canonical/source/provider/graph/usage seams without changing ownership, private journal events, ledger rules, budgets, severity or completion policy. |
| `sc4` | consumes | Consume sc4 through completed public internal APIs. Production adapters supply trusted canonical/source/provider/graph/usage seams without changing ownership, private journal events, ledger rules, budgets, severity or completion policy. |
| `sc5` | consumes | Consume sc5 through completed public internal APIs. Production adapters supply trusted canonical/source/provider/graph/usage seams without changing ownership, private journal events, ledger rules, budgets, severity or completion policy. |
| `sc6` | consumes | Consume sc6 through completed public internal APIs. Production adapters supply trusted canonical/source/provider/graph/usage seams without changing ownership, private journal events, ledger rules, budgets, severity or completion policy. |
| `sc7` | implements | Own exact status and additive versioned external transport routing; one daemon projection, explicit legacy diagnostic semantics, no board-specific UI. |

## 6. Error paths

**Error cases**

- **Mixed or ambiguous commits, missing approved upstream, or changed canonical pins** (recoverable)
  - Detection: sc1 canonical input verification and parent-relative attestation checks fail; freshness comparison observes different source/BUILD/contract revision/digest.
  - Response: Refuse before attempt issuance; return typed scope/stale reason with needed immutable selection. Never derive HEAD/working-tree fallback.
  - User impact: User corrects the approved scope or restarts with current contracts; no CR or model charge is manufactured.
- **Unqualified native bridge or client/daemon schema mismatch** (recoverable)
  - Detection: Capability handshake and effective tool/config catalogue do not match adapter/profile digest; engine/version discriminator or strict reply schema fails.
  - Response: unsupported-backend/unsupported-version with no provider call; never downgrade an explicit investigation request to broad legacy execution.
  - User impact: Legacy can be chosen explicitly for a separate new run; installation qualification or compatible client is needed for investigation.
- **Wrong reviewer, forged capability, cross-run reply or expired generation** (recoverable)
  - Detection: Canonical author versus authenticated reviewer comparison, capability MAC/epoch/expiry and sc3 run/subject/request/attempt/generation validation fail.
  - Response: Reject without invoking evidence or acceptance mutation. Revoke cancelled/old invocation capabilities and preserve accepted prefix.
  - User impact: Must use the independent reviewer party and current binding; late responses cannot corrupt another review.
- **Caller discovery stale, unsupported language, missing changed entity or partial/empty index result** (recoverable)
  - Detection: Graph source identity/registry closure/entity-to-packet mapping cannot be verified, or graph reports limited/unknown coverage.
  - Response: Keep explicit required impact obligation and limitations; require pinned caller inspection/accountable finding or unresolved outcome. Do not interpret empty results as no impact or silently switch modes.
  - User impact: Review can pause pending evidence; source-only remains an explicit separate mode with the same original scope/criteria.
- **Transport detaches, provider times out, cancellation or daemon restarts** (recoverable)
  - Detection: Connection loss is observed independently from owner lease and provider invocation; sc4 replay exposes issued/uncertain attempt and compatibility.
  - Response: Detach alone returns no verdict; retain bounded attempt and per-block ACKs. Timeout/abort drains callback authority and preserves unknown usage; restart claims new generation only through sc4. Same-run resume skips accepted work and never restarts a legacy volatile state.
  - User impact: Status explains actual durable progress and resume reason, not silence as failure/pass; only unfinished work continues.
- **Same start identity reused with different inputs or concurrent resume** (recoverable)
  - Detection: Immutable descriptor comparison differs, or sc4 current owner/generation refuses lease claim.
  - Response: Typed identity/ownership conflict; same exact start retries return original run. No duplicate attempts, separate acceptance log or new subject.
  - User impact: Caller reattaches or chooses a genuinely new requestId, without duplicated review spend.
- **Canonical CR changed, publication ACK lost or callback deadline expires** (recoverable)
  - Detection: sc5 frozen intent expected revision/head digest and canonical history verification detect conflict/uncertainty.
  - Response: Use sc5 reconciliation and frozen intent; no terminal receipt until verified canonical operation. Never rerun judges just for lost publication ACK; rendering retries only regenerate the view.
  - User impact: Stable completed result or explicit conflict/uncertainty; no spurious pass or automatic approval.
- **Usage writer unavailable or legacy diagnostic state lost** (recoverable)
  - Detection: Idempotent writer qualification fails/returns error, or volatile legacy state cannot be found after process restart.
  - Response: Keep sc4 pending usage with null unknown counters. Return explicit legacy status-unavailable/non-resumable; do not fabricate an investigation recovery record.
  - User impact: Consumption uncertainty stays visible; existing canonical CR still readable when present.
- **Rollout evidence missing, predecessor schema overwrites successor route, or rollback binary cannot understand run** (recoverable)
  - Detection: Adoption manifest hash, predecessor reconciliation approval, schema capability/partition tests or descriptor engine/version check is absent/mismatched.
  - Response: Keep opt-in closed; unknown resumes refuse. Rollback pauses/drains new turns but leaves compatible status/export/cancel and frozen publication reconciliation available.
  - User impact: Existing design and legacy review behavior remains isolated; enabling requires explicit validated migration evidence.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A tiny or planless BUILD with approved upstream and unplanned changed blocks | Use sc1 approved-upstream route; criteria and every selected block remain required. Do not synthesize empty PLAN or omit unplanned scope. |
| Several reviewed blocks arrive within one managed native/controller session | Each progress call obtains its own durable sc4 ACK before cursor advancement; final reply references them and has no new final coverage delta. |
| Same invocation final reply or progress ACK is retried after response loss | Exact identity reuses accepted state/receipt; changed content under the same identity refuses. |
| Budgets exhausted while paused or waiting to execute | Queue/idle/paused wall time is not consumed active time; no lease is held solely while waiting in the native execution queue. sc4 allowances require explicit extension and never reset on reconnect. |
| Legacy S005 installed before or after successor | Both routing partitions preserve design-template/premise and valid legacy frames; only new explicit code-review engine routes to investigation. Older unsupported state versions refuse clearly. |
| Legacy status lacks detailed coverage or token observations | Use explicitly labelled legacy-dimension diagnostics and null unavailable estimates, with resume unavailable; no synthetic evidence rows or exact autonomous call prediction. |

**Invariants to preserve**

- S1-S5 own immutable scope, coverage/provenance, per-block ACK, ownership, usage and canonical completion; S6 consumes their exact internal interfaces. [[c1]]
- LLM calls remain behind LLMProvider/CliProvider; existing broad runReviewSession/design behavior remains unchanged unless the new optional qualified binding is supplied. [[c2]]
- Existing legacy/controller frames and independent review/BUILD approval remain distinct from new-engine routing; no automatic approval or tracker message. [[c3]]

## 7. Test strategy

**Test framework:** `node:test with node:assert/strict via tsx (existing backend/provider fixtures; analyzer test lookup was incomplete and direct source verified the framework)`

**Test levels**

- **contract** — Prove exact sc7 and external schema discrimination without changing legacy design contracts.
  - Subjects: `Entry parity across daemon controller source and indexed planned and planless runs`, `Cross engine schema generation and capability replay are rejected`, `Legacy S005 pre S005 design and installation order partitions remain compatible`
  - Fixtures: `Matrix daemon/controller x source-only/indexed-impact x planned/approved-upstream`, `Captured valid pre-S005 and S005 legacy frames plus new engine envelopes`, `Unmodified design template/premise review schema and golden outputs`
- **integration** — Exercise real daemon-owned lifecycle/recovery and production adapters with deterministic subprocess/session fixtures.
  - Subjects: `Qualified native bridge permits multiple durable block ACKs and refuses broad tools`, `Canonical work packet attribution and snapshot evidence adapters reject ambiguous scope`, `Status reconnect progress accounting and pending unknown usage are truthful`, `Crash concurrent resume cancel and frozen publication recover without duplicate execution`, `Opt in readiness and rollback retain status while refusing unsupported resumes`, `Native session isolation budget cancellation and OAuth boundaries remain explicit`
  - Fixtures: `Temporary registered Git repo with explicit relevant commits, unrelated HEAD and mixed-attribution blocks`, `Real ArtifactStore/History/LifecycleService and sc4 journals with crash/fault hooks`, `Fake Claude/Codex CLI binaries that expose/attempt allowed and forbidden tool/config paths; no real model traffic`, `In-session bridge accepting two block ACKs before final response`, `Authenticated controller fixture with reconnect, stale binding, unknown usage, idempotent writer/lost ACK`, `Graph callers fixture with pinned source, incomplete index, excluded dependency and unsupported-language mapping`
- **unit** — Verify status/selection/accounting and evaluation policy deterministically.
  - Subjects: `Adjudicated fixture baseline preserves required defects coverage and labelled efficiency metrics`, `No default quality or savings claim without separately authorized live evidence`
  - Fixtures: `Versioned independently adjudicated defect/coverage oracle and recorded baseline with provenance and hashes`, `Counts/time/repeated-input metrics explicitly marked deterministic, estimated, reported or unavailable`, `Gate tests with absent/failed/live-unauthorized evidence and config switching mid-run`
- **smoke** — Build and run affected domain, daemon/MCP/provider/legacy suites; no hours-long sweep or live model calls.
  - Subjects: `Focused production integration domain legacy provider fixtures and production build`
  - Fixtures: `Node 22 focused test log and production build log under /tmp`, `One required independent code review after implementation; no automatic multiple rounds`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Entry parity across daemon controller source and indexed planned and planless runs`, `Qualified native bridge permits multiple durable block ACKs and refuses broad tools`, `Canonical work packet attribution and snapshot evidence adapters reject ambiguous scope`, `Cross engine schema generation and capability replay are rejected`, `Crash concurrent resume cancel and frozen publication recover without duplicate execution`, `Native session isolation budget cancellation and OAuth boundaries remain explicit` |
| `ac2` | `Status reconnect progress accounting and pending unknown usage are truthful`, `Crash concurrent resume cancel and frozen publication recover without duplicate execution`, `No default quality or savings claim without separately authorized live evidence` |
| `ac3` | `Adjudicated fixture baseline preserves required defects coverage and labelled efficiency metrics`, `No default quality or savings claim without separately authorized live evidence`, `Focused production integration domain legacy provider fixtures and production build` |
| `ac4` | `Legacy S005 pre S005 design and installation order partitions remain compatible`, `Opt in readiness and rollback retain status while refusing unsupported resumes`, `Native session isolation budget cancellation and OAuth boundaries remain explicit`, `Focused production integration domain legacy provider fixtures and production build` |

## 8. Migration

**State before:** Discovery c1: completed S1-S5 provide internal domain/recovery/publication contracts with no production selection. Discovery c2: current provider runReviewSession has broad read tools/final answer only and no qualified scoped progress bridge. Discovery c3: codeReview.run/MCP step and predecessor S005 frames/design paths exist; no investigation engine flag is established.

**State after:** One daemon composition service and exact sc7 status serve explicit versioned investigation starts and recovery through qualified native/controller bridges. Legacy and design paths remain separate. Engine selection stays legacy by default; ready explicit opt-in is possible only after tracked predecessor reconciliation, compatible readers, qualified adapter and deterministic evidence. Real default adoption awaits separately authorized live comparison and user decision.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add additive shared types, daemon composition adapters, immutable descriptor discovery binding and scoped capability bridge with new starts disabled. Extend LLMProvider/CliProvider with the optional qualified investigation binding; absent binding keeps current behavior. Validate production descriptors and effective tool isolation before any model request. — ↩ rollbackable _(needs: `codeReview.engine=legacy`)_
2. Register version-discriminated new-engine IPC/MCP operations behind capability negotiation, keeping all valid original legacy and design frames on original handlers. Run both S005 installation orders, pre-S005 compatibility and cross-engine rejection fixtures. Update insrc_schema/insrc_guide and diagnostics from one authoritative registry. — ↩ rollbackable _(needs: `new-engine-starts-disabled`)_
3. Create the supported tracked predecessor amendment/reconciliation record superseding only S002/S003 code chunk/gather and S005 new CODE-review frames at adoption. Present it for explicit review/approval; do not silently rewrite approved sibling artifacts or touch design-review ownership. Bind readiness to its approved identity/revision. — ↩ rollbackable _(needs: `approved-predecessor-code-only-reconciliation`)_
4. Run deterministic independent-oracle parity, crash/concurrency, native isolation, status/usage and baseline metric fixtures; record source/policy/schema/adapter/fixture hashes and evidence quality. Unknown/live-unmeasured values stay explicit. Install compatible daemon and client together through existing update procedure; restart creates no conversion of old volatile state. — ↩ rollbackable _(needs: `readers-support-investigation-v1`, `qualified-native-or-controller-backend`, `deterministic-evaluation-pass`)_
5. Allow an explicitly chosen plan-investigation-v1 start only when all readiness predicates hold. Existing runs retain original engine/version. Do not flip the default or claim cloud token/defect-quality gains from deterministic tests; authorized live comparison and a later explicit adoption decision are required for any default change. — ↩ rollbackable _(needs: `explicit-user-opt-in`, `approved-reconciliation-and-readiness-evidence`)_
6. Rollback sets selection to legacy and rejects new investigation starts/turns while safely draining or pausing current attempts. Preserve compatible status/export/cancel, usage outbox and frozen completion reconciliation. Re-enabling requires the original pinned descriptor compatibility; unsupported older binaries explicitly refuse resume and retain runtime files for a compatible daemon. — ↩ rollbackable _(needs: `preserve-runtime-and-canonical-records`)_

**Backward compat:** Additive explicit engine/version discrimination; no existing caller is forced onto investigation. Legacy full/degraded CRs and v1 investigation records remain readable by compatible readers. Original legacy/controller states finish only through supported original handlers; lost volatile legacy states stay non-resumable. Design template and premise reviews are unchanged, and installation-order fixtures protect both owners. No ledger migration, native-session-to-domain conversion, automatic BUILD approval, tracker action or default change.

## 9. Alternatives considered

### 9.1 a1: One daemon composition service with versioned adapters — **CHOSEN**

Share one daemon-owned review service and scoped tool bridge across native and controller transports.

Consume S1-S5 unchanged behind a repository-owned service. Version-discriminate legacy calls and plan-investigation-v1 commands; both transports invoke the same read/progress/reply authority. Native sessions require an isolated scoped-tool capability; unqualified providers refuse. A single exact sc7 status projection and explicit opt-in/rollback evidence gate cover all clients.

### 9.2 a2: Daemon service with durable command inbox

Add a durable command inbox in front of the same domain service.

Preserve shared S1-S5 ownership and one status schema, but persist start/read/progress/reply/cancel commands with their own delivery acknowledgments before dispatching to the recovery store. Native and controller transports target the inbox; engine routing and qualification remain explicit.

**Rejected because:** Duplicates sc4 acceptance and recovery with an unnecessary command inbox; it does not remove native qualification or legacy reconciliation requirements.

## 10. References

- **[[c1]]** `analyze-bundle` `s1:c1 Completed S1-S5 domain interfaces`
- **[[c2]]** `analyze-bundle` `s1:c2 Native session qualification gap and caller cross-check`
- **[[c3]]** `analyze-bundle` `s1:c3 Versioned entrypoint, status and legacy ownership`
- **[[c4]]** `prior-artifact` `HLD-c32aa60534232f36`
- **[[c5]]** `code` `src/workflow/code-review/investigation/continuation.ts:31` — "runInvestigationContinuation returns Promise<InvestigationReplyV1>; production wrapper preserves this reply."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 10 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-29T13:08:38.730Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._

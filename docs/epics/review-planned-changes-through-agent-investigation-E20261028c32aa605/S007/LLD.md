<!-- insrc:artifact LLD-c32aa60534232f36-s7 -->

# LLD: STORY-c32aa60534232f36-s7

## Summary

**Epic:** `review-planned-changes-through-agent-investigation`
**HLD base run:** `wf-1793173650139-u4mcad`
**HLD effective hash:** `8d3fcf641c66...`

Make the existing review engine usable through a small native reviewer interface. The host handles identity and coverage bookkeeping, saves assessed work promptly, returns useful incomplete results, and presents one operational activation decision backed by real review evidence. The first rollout proves Claude source-only review and resume while keeping existing safeguards and the durable kernel.

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

**Rollout phase:** <not in any phase>

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Own subject preparation, attribution ambiguity detection, exact Git commit/blob/block navigation and frozen context binding. Define foundational runtime-port types only; do not implement task investigation, a recovery store or new accounting storage. No generic HEAD/working-tree diff may select scope. — owns `sc1`, `sc6`
- `s2`: Own required-row enumeration, evidence identity/provenance and coverage relationships/dispositions. Reuse subject inputs and runtime ports. Keep ledger validation helpers private; do not execute reviewer turns or publish CRs. — owns `sc2`
- `s3`: Own independent read-only task-directed continuation behavior, on-demand source navigation, optional indexed caller/impact enrichment, budget admission, bounded retry/pause and attempt usage emission through foundational ports. In-memory ports are test scaffolding while production selection remains disabled until s4/s6; no durable storage implementation or terminal approval logic. Publish and acknowledge incremental block progress within continuations, with partial cross-block assessments recorded rather than lost. Domain progress contracts only; no competing MCP phase/schema ownership. External registration belongs to s6. — owns `sc3`
- `s4`: Own durable implementation of foundational acceptance/usage-outbox ports, append/replay/checkpoint integrity, lease/generation fencing, uncertain attempts and compatibility/time recovery. Do not alter review criteria or introduce a usage warehouse. Its recovery implementation is composed by downstream s6 rather than consumed backwards by s3. Persist/replay block-level evidence and assessment receipts independently of final provider-call completion. — owns `sc4`
- `s5`: Own completion coverage/freshness/party validation, canonical CR adaptation and idempotent terminal publication receipts. Reuse existing lifecycle and severity/confidence policy. Do not let a completion request, missing evidence or a failed run masquerade as a completed verdict. — owns `sc5`
- `s6`: Own production composition, equivalent MCP/daemon/controller start/status/resume/cancel adapters, status/usage presentation fields, explicit engine rollout/rollback, legacy compatibility and evaluation fixtures. No client opens stores directly; no client-specific board UI or design-review replacement. Sole new-engine MCP adapter/schema owner; reconcile 8315a11f/S005 legacy sc7 as specified in the architecture and record code-only supersession before opt-in. Verify routing partitions across both installation orders. — owns `sc7`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `scopedReviewToolCatalog`

```typescript
scopedReviewToolCatalog(indexed: boolean, protocol?: ReviewModelProtocol): readonly ToolDefinition[]
```

**Parameters:**
- `indexed: boolean` — Expose caller lookup only when the run has that qualified capability.
- `protocol: ReviewModelProtocol` _(optional)_ — Select the existing bound-v1 catalog or the new private compact-v1 native facade; old callers retain their original catalog.

**Returns:** `readonly ToolDefinition[]` — Exact versioned model-facing schemas, used consistently by native launch, budgeting, qualification and the dedicated MCP server.

**Errors:**
- `unsupported-protocol` when Unknown catalog/version or an unqualified mode.

**Preconditions:**
- The host selects the protocol and mode from the admitted backend binding, not repository text.
- Compact tools remain read, optional impact, progress and reply; they do not expose shell, general MCP, writes or arbitrary network tools.

**Postconditions:**
- Model inputs contain semantic read/assessment data only; run/attempt identities and sequence handling remain host-owned.
- The catalog digest changes when the model-facing contract changes; native launch/probe/production use that same digest.

### 2.2 `createScopedReviewMcpServer`

```typescript
createScopedReviewMcpServer(binding: ScopedReviewBinding, indexed: boolean, forward: (command: unknown) => Promise<unknown>, protocol?: ReviewModelProtocol): Server
```

**Parameters:**
- `binding: ScopedReviewBinding` — Private host-issued capability; never supplied by the reviewing model.
- `indexed: boolean` — Select qualified caller capability only.
- `forward: (command: unknown) => Promise<unknown>` — Forward one validated private native request to the owning host.
- `protocol: ReviewModelProtocol` _(optional)_ — Select the strict private compact facade or retained v1 path.

**Returns:** `Server` — Dedicated native MCP server with exact schemas and no normal insrc tool registration.

**Errors:**
- `ReviewToolError` when Malformed/out-of-scope/stale request, missing checkpoint, unavailable capability, expired owner or exhausted allowance.

**Preconditions:**
- The private native bridge configuration pins one protocol; compact requests are not accepted by the public v1 domain-command parser.
- Binding/peer/run/expiry checks precede request translation.

**Postconditions:**
- Safe typed errors preserve a code, corrective hint and operation/reference digest; raw private source, prompts and credentials are excluded from logs.
- Each compact assessment is translated by the host into the existing fully bound domain progress payload and validated by the existing kernel.

### 2.3 `runNativeInvestigationSession`

```typescript
runNativeInvestigationSession(input: NativeInvestigationInvocation): Promise<InvestigationReplyV1>
```

**Parameters:**
- `input: NativeInvestigationInvocation` — Existing qualified invocation plus host-only compact view/translation policy; domain reply stays unchanged.

**Returns:** `Promise<InvestigationReplyV1>` — The host-accepted domain reply, returned only after the scoped reply operation and genuine CLI completion; model acknowledgement alone grants nothing.

**Errors:**
- `InvestigationQualificationError` when Installed boundary/profile/catalog/configuration does not match its current verified qualification.
- `InvestigationError` when Invalid assessment, owner loss, deadline/budget refusal, unavailable evidence or missing accepted reply.

**Preconditions:**
- Cloud work remains through CliProvider/LLMProvider with serial dispatch and no internal retry sweep.
- The new compact native protocol uses a newly versioned adapter and its real paired installation probe; historical v1 evidence cannot qualify the new catalog.
- All time, prompt/schema/tools/history and output/native reserves share existing inclusive limits.

**Postconditions:**
- The model sees detailed approved tasks, exact packet metadata, one suggested pending block, relevant expectation groups and references to other design/source material; full empty coverage rows and protocol hashes are not repeated in the prompt.
- Every tool reply includes remaining time and durable progress state. Assessed blocks are checkpointed before changing focus; other files remain readable as pinned context for cross-file accuracy.
- Normal progress ACKs follow journal commit. Cancellation or native failure retains accepted blocks and never creates an assessment or verdict from a timeout.
- The compact final CLI schema is only an acknowledgement; the accepted bound reply remains recovery/completion authority.

### 2.4 `InvestigationRepository`

```typescript
interface InvestigationRepository { start(input: InvestigationStart, declaration?: ReviewControllerBudgetDeclaration): Promise<InvestigationAccepted>; advance(runId: string, declaration?: ReviewControllerBudgetDeclaration): Promise<Record<string, unknown>>; view(runId: string): Promise<Record<string, unknown>>; cancel(runId: string): Promise<Record<string, unknown>>; }
```

**Parameters:**
- `input: InvestigationStart` — Existing explicit engine, Story/BUILD and exact scope selections; normal start can use the captured canonical BUILD scope manifest.
- `declaration: ReviewControllerBudgetDeclaration` _(optional)_ — Existing controller reservation requirement, unchanged for that execution route.

**Returns:** `Promise<Record<string, unknown>>` — Existing versioned run/status/receipt projection, with an optional additive diagnostic report reference; incomplete work remains paused or running.

**Errors:**
- `SubjectPreparationError` when Missing/ambiguous scope, foreign canonical identity, stale source/contracts or incomplete implementation-task validation.
- `ReviewIntegrationError` when Unavailable/unqualified backend, unsupported protocol or rollout policy refusal.

**Preconditions:**
- sc7 remains S6-owned. S7 consumes it; the proposed local consumer amendment must be approved before build.
- The existing subject, ledger, lease/recovery and complete-CR contracts are consumed unchanged.
- Default entrypoint start routes through the configured engine; old in-flight frames retain their admitted engine. Explicit pilot starts are distinct from changing the default.

**Postconditions:**
- An immutable daemon-written BUILD reviewScope manifest or an existing approved scope reference establishes exact parent-relative packets; missing or mixed/ambiguous ownership is surfaced, never replaced by HEAD or a trailer-only inference.
- A compact assessment may cover multiple explicitly listed expectation aliases with shared evidence/rationale, but the host expands and validates every underlying row; no group defaults missing members to satisfied.
- A finish request with unresolved work produces a useful inconclusive report derived only from accepted state, under /tmp, and a non-completing domain pause. It does not publish a successful complete CR or approve BUILD.
- Only the unchanged completion assessor/publisher can publish a final canonical CR; existing severity and independent-party rules remain authoritative.

### 2.5 `InvestigationAdoptionPolicy`

```typescript
interface InvestigationAdoptionPolicy { assertSelected(): void; evidence(mode: ReviewSourceMode): Promise<VerifiedReviewReadiness>; adapter(repo: string, mode: ReviewSourceMode): Promise<InvestigationDaemonAdapter>; }
```

**Parameters:**
- `mode: ReviewSourceMode` — Check each requested backend/mode independently; an unused mode is not a prerequisite for a source-only pilot.
- `repo: string` — Registered canonical subject repository.

**Returns:** `Promise<VerifiedReviewReadiness | InvestigationDaemonAdapter>` — Mechanically verified current execution boundary plus the applicable pilot/default activation policy; no fixture-labelled quality claim is accepted as a real review result.

**Errors:**
- `not-ready` when Hard-disable, missing actual boundary proof, changed launch/broker/catalog/profile, unsupported mode, or an unapproved default-activation decision.

**Preconditions:**
- One availability/kill switch controls whether new-engine turns may execute; codeReview.engine chooses the default route. Both are checked by the owning daemon.
- A bounded explicit pilot needs normal user-authorized workflow execution, valid scope and actual mechanical qualification; it does not need a chain of separately approved probe/oracle/fixture ISSUEs.
- Default activation consumes one existing-kind canonical activation decision approved by the user, real acceptance evidence and the already-recorded predecessor reconciliation. No signing keys or new artifact kind.

**Postconditions:**
- Native isolation qualification is invalidated by its actual execution-boundary inputs, not every unrelated daemon/workflow implementation edit. Host scope/ownership checks and real subject freshness remain mandatory.
- A changed model catalog, native final schema, launch permissions, bridge/binding checks, CLI/runtime image or isolation policy requires fresh boundary verification. No old proof is relabelled.
- Fixture outputs remain automated test evidence; source-only, indexed and other backends are activated independently.
- Rollback disables new turns, cancels/drains active invocation ownership, restores the legacy default and preserves accepted status, checkpoints, publication reconciliation and historical records.

## 3. Data model changes

### 3.1 `Compact native review request` — new

Private non-durable transport only, versioned separately from the unchanged public/domain engine-v1 commands. review_read accepts a typed target: change(blockId, before|after, optional bounded subrange), context(repo-relative path, inclusive range), artifact(subject artifact id, range), or test(task id). The host supplies all revisions. An absent changed side returns an explicit absence result and no fabricated source receipt; wider source must use context. review_progress accepts blockId, disposition, evidence aliases, explicit expectation assessments/findings, notes and unresolved refs. review_reply accepts finish|yield and a reason, with no new assessment deltas. The child MCP server validates shape; the authenticated parent translates to existing domain operations before any action.

```
type ReviewModelProtocol = 'bound-v1' | 'compact-v1'; type CompactFinalAck = { acknowledged: true }; type ReviewToolError = { code: string; message: string; hint?: string; referenceDigest?: string; retryable: boolean };
```

**Call sites:**
- `src/shared/review-investigation-catalog.ts`
- `src/mcp/review-investigation-bridge.ts`
- `src/mcp/review-investigation-native.ts`
- `src/agent/providers/native-investigation-session.ts`

### 3.2 `Private compact review view` — new

A projection of the existing run basis/state, not a second ledger. Detailed approved tasks/checks remain available; packet metadata covers the full selected scope. The host suggests one pending block and shows its applicable expectation groups. Short evidence/expectation aliases resolve only through the current host binding; identities, subject hashes, generation, sequence, findings IDs and receipt IDs are generated or copied by the host. Grouping changes presentation only: explicit member assessments expand to existing authoritative rows and pass all current provenance/test/applicability validation. Cross-file context reads stay available. Tool results expose remainingMs and accepted progress; at the soft-yield threshold, new focus is refused with a corrective yield instruction while current assessment/finish can still be accepted until the unchanged hard cap. No timer invents a semantic judgment.

**Call sites:**
- `src/daemon/review-investigation-repository.ts`
- `src/agent/providers/native-investigation-session.ts`
- `src/shared/review-investigation-catalog.ts`

### 3.3 `Canonical BUILD review scope and TESTS metadata` — field-add

Reuse the existing canonical BUILD as the normal scope source. A daemon-generated reviewScope records full source commit, exact commit/parent identities, attributed block IDs, task provenance and unresolved ambiguity. It is captured from the existing tracked build change set; trailers alone do not establish exclusive hunk ownership, and mixed/unprovable blocks require explicit selection. The review start selects this exact versioned manifest, which is pinned before dispatch. Existing separately approved ISSUE scope references remain readable. The host rejects arbitrary caller booleans or mutable scope. BUILD/TESTS writes preserve canonical repo identity and history; stored abbreviated Git IDs are uniquely resolved and audited as the same object. Old test evidence remains unknown when it cannot be bound to the reviewed source; metadata repair never turns it into pass. Representation clarification [c7,c8]: unknown is an existing derived review-evidence result, not a new persisted TESTS case outcome. Keep TestCaseResult, TestRecordFile.titles[].result, testsPassed and historical per-Task commit/ranAt/results unchanged. ProductionEvidenceAdapter compares each recorded Task commit with the pinned BUILD source (after unique same-object OID normalization) and uses verifiedTaskResult only for matching source. Otherwise its existing TrustedInspectionReceipt.testResult is unknown, with completeness partial and an explicit source-binding limitation. This receipt is admitted and persisted through the existing evidence/checkpoint kernel; TESTS is not rewritten to unknown and metadata repair cannot upgrade evidence. Missing or foreign canonical TESTS identity/integrity still refuses inspection. No new provenance field or test-result union is required for this behavior.

```
No TestCaseResult or TestRecordFile.titles[].result change. Existing review receipt: TrustedInspectionReceipt.testResult: 'pass' | 'fail' | 'skipped' | 'unknown' | null; ReviewReadReceiptV1.completeness: 'complete' | 'partial' | 'unavailable'; limitations: readonly string[]. TESTS meta.repoPath is additive canonical metadata; retain each Task's commit, ranAt and original results. New BUILD.body.reviewScope is the separate additive scope manifest described above.
```

**Call sites:**
- `src/daemon/review-investigation-work.ts`
- `src/daemon/review-investigation-repository.ts`
- `src/workflow/runners/build/test-record.ts`
- `src/workflow/runners/build/round-writer.ts`

### 3.4 `Execution-boundary qualification` — invariant-change

Keep real installed probe replay, current native policy checks and existing runtime evidence. Separate native boundary identity from broad engine release/source provenance: exact CLI/runtime images, versioned adapter, model-facing catalog/final schema, resolved launch/config/permissions, private bridge/binding/auth code and isolation-policy inputs define the reviewed boundary manifest. Changes to those inputs invalidate proof and require the real paired native probe. Host authorization/provenance negative checks are rerun deterministically against current code. Ordinary orchestration, reporting, grouping or workflow-document changes do not by themselves require another model isolation pair. Reviewed subject source/contracts and run policy/schema compatibility remain pinned separately; inability to establish the narrow boundary fails closed. The first compact adapter requires a new proof; the previous v2 record is historical evidence only.

**Call sites:**
- `src/daemon/review-investigation-adoption.ts`
- `src/agent/providers/native-investigation-session.ts`
- `src/agent/providers/claude-investigation-qualification.ts`

### 3.5 `Consolidated activation decision and result projection` — new

Use one canonical record of an existing supported artifact kind for explicit default-activation signoff, not one approval per probe/oracle/evaluation fixture. It references the actual qualified backend/mode/boundary, completed implementation/test/code-review evidence, actual known-defect/clean/cross-file review results and receipt IDs, recovery/ownership outcomes, limitations and existing predecessor reconciliation. Approval comes from canonical lifecycle history, never an approved:true field. A bounded explicit pilot is authorized by the normal approved workflow/user action and availability switch while the default remains legacy; default use also needs the activation decision. Inconclusive reports are regenerable /tmp projections of accepted checkpoints with findings and unresolved work, not new successful CR artifacts. Run->checkpoint/evidence ownership remains unchanged; one activation decision references one or more independently ready backend/mode capabilities and owns none of their evidence. Default changes and later legacy CODE deletion remain separate explicit decisions.

**Call sites:**
- `src/daemon/review-investigation-adoption.ts`
- `src/daemon/review-investigation-repository.ts`
- `src/workflow/code-review/investigation/completion-assessment.ts`

## 4. Diagrams

- [Sequence diagram](docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/S007/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc7` | consumes | S7 is a private facade and operational integration consumer of the S6-owned entrypoint/status/rollout boundary. It does not implement a replacement shared contract, state machine, evidence ledger, recovery store or publisher. The native private protocol is normalized into unchanged domain commands; incomplete reports are status projections and never bypass sc5 complete-CR validation. A local consumer declaration is proposed because the generated addStory boundary omitted it. |

## 6. Error paths

**Error cases**

- **Invalid, missing or absent-side source reference** (recoverable)
  - Detection: Host checks the typed target against the admitted packet, real side spans and bounded revision contents before reading.
  - Response: Return a safe typed error with a valid target example or context-read hint; absence is explicit, never a fabricated 1–1 range. Log operation, error code and reference digest only.
  - User impact: Reviewer can correct navigation without guessing opaque IDs.
- **Caller attempts unauthorized path, foreign owner or expired binding** (recoverable)
  - Detection: Existing broker peer, binding and scope validators reject the request before translation or IO.
  - Response: Refuse without exposing source or credentials; require the legitimate owner to resume or re-admit through existing sc7.
  - User impact: No evidence from another run is accepted.
- **Two requests race or a progress acknowledgement is lost** (recoverable)
  - Detection: Existing owner fencing, serialized dispatch and durable acceptance sequence detect contention or a previously accepted operation.
  - Response: Return existing typed busy/stale/idempotent outcome. Re-read accepted checkpoint state before resending; never create a parallel reviewer or infer acceptance from a timeout.
  - User impact: Durable work survives reconnect without duplicate coverage.
- **Unprovable commit attribution or stale source/test provenance** (recoverable)
  - Detection: Canonical BUILD scope validation checks exact commit and parent objects, selected blocks and current artifact revisions; TESTS evidence checks its recorded source binding.
  - Response: Block ambiguous review admission and request explicit scope selection. Treat unbound historical tests as unknown, preserving historical results; do not certify them through metadata repair.
  - User impact: Operator sees the precise missing scope or evidence requirement.
- **Execution-boundary qualification missing or stale** (recoverable)
  - Detection: Adoption compares the installed CLI/runtime, compact adapter/catalog/final schema, launch permissions, broker/auth/isolation code and their security-relevant dependency/configuration closure with the qualified manifest.
  - Response: Fail closed for that backend/mode. Requalify that boundary once; unknown closure is not exempted. Ordinary subject source freshness remains checked separately.
  - User impact: Existing qualification cannot silently authorize a changed execution boundary.
- **Reviewer reaches soft yield or hard execution deadline** (recoverable)
  - Detection: Host reports remaining monotonic deadline budget; at 60 seconds remaining it stops offering a new focus block. Existing hard deadline remains authoritative.
  - Response: Allow acknowledgement of the current assessment and explicit yield until the hard cap; then cancel/drain via existing lifecycle. Preserve accepted checkpoints and emit an inconclusive status report. No new 90-second watchdog, invented assessment or automatic full retry.
  - User impact: Partial work is visible and resumable; incomplete work cannot approve a BUILD.
- **Finish requested with unresolved obligations or no accepted reply** (recoverable)
  - Detection: Existing completion assessor finds missing rows, unsupported findings or unfinished blocks; native final acknowledgement lacks a host-accepted terminal reply.
  - Response: Project grouped unresolved obligations to /tmp and retain resumable status; no complete CR or automatic approval. A native zero exit alone is insufficient.
  - User impact: Reviewer/operator receives useful partial results without false success.
- **Default activation requested without canonical user approval** (recoverable)
  - Detection: Existing adoption admission resolves the single activation decision's canonical history and qualified backend/mode, not a caller-provided approved boolean.
  - Response: Refuse default activation. An explicitly requested bounded pilot may run only with availability enabled and all mechanical scope/isolation prerequisites met; default stays legacy.
  - User impact: Real verification is possible before the one final activation decision.
- **Protocol or design dependency mismatch** (recoverable)
  - Detection: Strict private wire-version parsing rejects incompatible compact messages; workflow gate detects an unapproved sc7 consumer amendment or incompatible upstream signature.
  - Response: Keep old admitted runs on their bound protocol and status reader; require supported resume or cancellation. Block S7 build until the local dependency amendment is approved; never coerce old proof into compact-v1.
  - User impact: Compatibility and design ownership remain explicit.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Insertion-only or deletion-only block | Only real side spans are advertised; the absent side is explicit. Wider valid code is available through a pinned context read. |
| A block needs callers or related files outside its focus | Cross-file context reads remain available inside scope/policy; focused presentation does not truncate impact investigation. |
| Several expectations share wording but have different applicability or evidence | Group presentation retains explicit member identities and assessments. Expansion preserves every applicable obligation; no group-wide inferred pass. |
| A valid cancellation arrives immediately after durable acceptance | Accepted checkpoint remains authoritative and is resumed by a single owner; cancellation cannot roll back acknowledged work. |
| Only Claude/source-only is qualified | That mode can be piloted and later explicitly activated independently; indexed mode and Codex remain unavailable until independently qualified. |
| An ordinary reporting change leaves the execution boundary unchanged | Run focused deterministic authorization/provenance regressions on current code; reuse matching isolation qualification, while still checking current subject revisions. |
| All Tasks validated but final Story review has not run | Final Story code review is the next workflow action, outside Task acceptance. Completion approval and activation remain later explicit decisions. |

**Invariants to preserve**

- Keep existing scope, evidence, completion and recovery owners; consume sc7 and do not replace their ledgers or validators. [[c2]]
- Native catalog, launch configuration and real qualification must agree; no general shell, network or broader MCP access. [[c1]]
- Preserve accurate TESTS provenance and historical results when metadata is regenerated. [[c3]]

## 7. Test strategy

**Test framework:** `node:test with node:assert/strict, run through tsx; focused existing backend suites first. Live CliProvider checks are explicitly gated, serial, and recorded separately from deterministic tests.`

**Test levels**

- **unit** — Validate the compact model facade without weakening domain validation.
  - Subjects: `compact target validation: insertion/deletion absent sides, pinned context reads and safe actionable typed errors`, `compact progress expansion: explicit assessments per applicable member, evidence aliases resolved only by host`, `compact native final acknowledgement cannot publish without an accepted reply`, `focus view and 60-second soft yield preserve cross-file reads and current-block acknowledgement`
  - Fixtures: `Small exact-commit repository with insertion/deletion/replacement blocks and two files with a caller relationship`
- **contract** — Keep the existing sc7 integration and domain contracts authoritative.
  - Subjects: `src/mcp/__tests__/review-investigation-bridge.test.ts: binding checks precede compact translation; no alternate ledger writes`, `src/daemon/__tests__/review-investigation-evidence.test.ts: malformed refs, foreign evidence, unsupported assessments and incomplete coverage remain rejected`, `catalog used by launch, budget, native bridge and qualification is identical for a given wire version`
- **integration** — Verify real durable orchestration and metadata compatibility without model calls.
  - Subjects: `src/daemon/__tests__/review-investigation-recovery.test.ts: accepted block survives lost acknowledgement, restart, cancellation and single-owner resume`, `src/daemon/__tests__/review-investigation-adoption.test.ts: bounded pilot admission, default-engine routing, single canonical activation approval and hard-disable rollback`, `canonical BUILD reviewScope is exact and daemon-written; mixed attribution cannot silently widen selection`, `src/workflow/runners/build/__tests__/test-record.test.ts and test-record-revision.test.ts: regeneration preserves repo identity/history and requires actual source binding for test evidence`, `incomplete finish produces regenerable /tmp report and no complete CR or BUILD approval`, `old bound protocol tokens retain their admitted route; new default selection cannot hijack them`, `boundary manifest covers security-relevant launch/adapter/broker dependencies; changed boundary invalidates qualification, ordinary report changes do not`, `workflow ordering permits validated Tasks -> final Story code review -> human BUILD completion, with activation later`
- **live** — Prove useful progress early, then real review quality using installed Claude/source-only; never substitute fixture success for model success.
  - Subjects: `First pilot after compact bridge and mode qualification: real read -> assessment -> durable block ACK before expanding the remaining work`, `Known-defect and clean scoped review: actual independently recorded finding/clean result with complete provenance; clean is not proof that the defect fixture was detected`, `Cross-file defect review: reviewer follows required caller/context evidence rather than receiving preselected answer text`, `Cancellation after a durable ACK and restart/resume: accepted block reused, unfinished work completed without replay of accepted work`, `Two sessions contend for one subject and independent subjects: owner fencing and actual dispatch behavior match configured admission, with no cross-run evidence leakage`, `Hard-disable and default rollback: cancel/drain live work, retain readable checkpoints, require explicit later activation`
  - Fixtures: `Real exact-commit known-defect, clean and cross-file subjects selected before runs; expected outcomes recorded independently of reviewer outputs`, `Fresh installed-CLI compact protocol isolation qualification including active instruction/plugin/hook canaries supported by the collector`, `One canonical existing-kind activation decision draft referencing actual receipts; approval remains pending`
- **smoke** — Confirm deployable build and usable operator status without broad repeated model sweeps.
  - Subjects: `npm run build`, `Normal code-review entrypoint honors configured engine for new runs and bound engine for existing runs`, `Partial/final report distinguishes accepted, unresolved, inconclusive and complete states`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `compact bridge request/response contract and final acknowledgement rejection tests`, `first live block ACK with host-generated identity and sequence` |
| `ac2` | `insertion/deletion target validation and safe typed error unit cases`, `real valid context/cross-file navigation pilot` |
| `ac3` | `lost-ACK/restart/cancel/owner fencing integration`, `60-second soft-yield focus test`, `real cancel/resume and concurrent-session checks` |
| `ac4` | `member-wise grouped-assessment expansion contract`, `incomplete finish emits report but never complete CR`, `real clean and known-defect complete review receipts` |
| `ac5` | `adoption pilot/default/approval/rollback integration`, `qualification boundary change versus ordinary report-change tests` |
| `ac6` | `early installed-Claude/source-only durable ACK`, `real known-defect, clean, cross-file, cancel/resume and concurrency acceptance; other modes not inferred qualified` |
| `ac7` | `workflow ordering integration and historical-failure preservation checks`, `npm run build and focused affected suites`, `final independent Story code review after Task validation, followed by explicit human completion approval outside Task acceptance` |

## 8. Migration

**State before:** s1 bundles c1/c2/c3 locate the existing native catalog and broker, sc7 orchestration with durable kernel, and TESTS writer. The actual failed acceptance performed reads but accepted no block; old qualification is for the existing protocol. Default remains legacy; earlier failed acceptance records remain failed.

**State after:** One compact private reviewer facade consumes unchanged sc7/domain contracts, uses real source targets and host-owned durable acknowledgements, exposes complete or inconclusive results honestly, and has installed-Claude/source-only acceptance evidence. Default activation is available only after one separate explicit approval of a canonical ISSUE decision; legacy code deletion remains later work.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. After LLD and local sc7 consumer amendment approval, implement the minimal compact bridge, typed targets/errors, host-owned assessment translation and focused view. Validate with deterministic bridge/evidence regressions. Keep existing default legacy and existing bound protocol readers. — ↩ rollbackable
2. Add narrow execution-boundary manifest comparison and explicit qualified pilot admission, separating availability from default engine selection. Introduce a versioned compact adapter qualification (proposed claude-scoped-v3; never relabel v2 evidence). Capture fresh installed CLI inventory and active hook/plugin/instruction canary proof once for the changed boundary. Run a serial bounded pilot on an exact canonical subject and require an actual durable block ACK before proceeding. If it fails, diagnose that run and fix this slice rather than building more acceptance bureaucracy. — ↩ rollbackable _(needs: `Availability enabled for explicit pilot only`, `Default engine remains legacy`)_
3. Complete concise member-wise expectation grouping, accepted-state inconclusive reports, canonical BUILD reviewScope capture and TESTS metadata/provenance preservation. Route new normal starts through configured engine; keep existing sessions on their bound engine. Validate exact scope and completion behavior with focused tests. — ↩ rollbackable
4. Integrate existing restart/cancel/ownership/freshness behavior with the facade and prove compatibility, soft yield and hard-disable cancellation/drain. Reuse the existing journal and completion assessor; no replacement recovery framework or proof conversion. — ↩ rollbackable
5. Run serial installed-Claude/source-only known-defect, clean and cross-file reviews plus cancel-after-ACK/resume and concurrent-session acceptance. Reuse accepted checkpoints when supported; do not repeat all live tests absent a changed prerequisite or failed assertion. Record actual outcomes, elapsed time and available usage; unknown model counts/tokens remain unknown. Assemble one canonical ISSUE activation decision draft with evidence references and limitations. Task acceptance excludes final Story review, BUILD approval and activation. — ↩ rollbackable
6. After all implementation Tasks are validated, perform the independent final Story code review and request human BUILD completion approval. Then present the single activation decision for explicit user approval; activate only the evidenced backend/mode. This is post-Task workflow, not an extra Task prerequisite. Retain legacy code until a later explicit deletion decision. — ↩ rollbackable
7. If operator disables availability or rolls back default, refuse new investigation turns, cancel/drain according to existing lifecycle, retain readable checkpoints and final reports, and select legacy for new default reviews. Never resume an old run through a different engine. — ↩ rollbackable

**Backward compat:** Public domain v1, sc7 signatures, existing checkpoint ownership and complete-CR publication remain authoritative. Compact-v1 is a separately validated private native transport; bound-v1 admitted sessions retain their original route and readers. Unsupported native versions fail explicitly with status/cancel available. Existing qualification is historical and cannot qualify the changed catalog/schema. New BUILD scope metadata is additive; older artifacts need a provable explicit scope, not broad HEAD fallback. Preserve historical TESTS results without certifying unbound source evidence. No bulk artifact rewrite, new artifact kind, signing keys or new persistence substrate.

## 9. Alternatives considered

### 9.1 a1: Thin native reviewer facade over the existing host kernel — **CHOSEN**

Keep the native agent session and current durable domain; present compact reads and assessments, with protocol bookkeeping performed by the host.

The dedicated review MCP surface accepts human-sized source requests and block assessments. The existing host integration translates them to current bound read/progress/reply operations and computes identities, sequences, coverage-row expansion and receipts. Accepted checkpoints, leases, scoped source and canonical publication remain the existing kernel's authority. The operator sees one capability/activation decision backed by actual test and native-boundary evidence, with an explicit bounded pilot distinct from changing the default.

### 9.2 a2: Host-driven structured action turns

Use serial structured CLI replies selecting reads or assessments, with the host executing each action against the current scoped kernel.

A host action coordinator asks the existing CLI structured-output provider for the next evidence requests, block assessments or yield. It executes all reads through current pinned adapters, accepts block results through current durable progress, and returns only needed results for the next turn. Related actions can be selected together and global pending coverage remains host-owned; no fixed source chunks or call-per-clause schedule is prescribed. Existing storage and completion remain unchanged, but the native agent/MCP interaction is replaced by a new action envelope.

**Rejected because:** Could meet core guarantees through existing ports, but introduces a second coordinator and more compatibility/provider-turn behavior before validating the current native path.

## 10. References

- **[[c1]]** `analyze-bundle` `design.story/s1#1` — "Located scopedReviewToolCatalog, createScopedReviewMcpServer, startNativeReviewBroker and runNativeInvestigationSession. Catalog consumers include native launch, probe collection/reconstruction, produ"
- **[[c2]]** `analyze-bundle` `design.story/s1#2` — "Located InvestigationRepository, InvestigationAdoptionPolicy, CanonicalReviewWorkAdapter and assessReviewCompletion. Existing sc1-sc7 owners already provide scope, typed evidence, ledger validation, d"
- **[[c3]]** `analyze-bundle` `design.story/s1#3` — "Prior offline replay of the real acceptance manifest reproduced three invalid old-side references for insertion-only spans; the live trace showed serial reads and no progress call. Test lookup was off"
- **[[c4]]** `prior-artifact` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/HLD.md`
- **[[c5]]** `prior-artifact` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/S007/EXT.md`
- **[[c6]]** `stakeholder` `user:review-epic-critical-assessment` — "ok, this review change has gone on for days and still we aren't in a position to enable the new review framework. take a fresh and critical look at the entire epic and see if we are over-engineering"
- **[[c7]]** `code` `src/daemon/review-investigation-evidence.ts:21-74` — "const pinned=task.commit===s.build.sourceCommit,result=pinned?verifiedTaskResult(task):'unknown';"
- **[[c8]]** `code` `src/workflow/code-review/investigation/ledger-types.ts:51` — "readonly testResult: 'pass' | 'fail' | 'skipped' | 'unknown' | null;"

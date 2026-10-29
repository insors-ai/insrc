<!-- insrc:artifact LLD-c32aa60534232f36-s5 -->

# LLD: STORY-c32aa60534232f36-s5

## Summary

**Epic:** `review-planned-changes-through-agent-investigation`
**HLD base run:** `wf-1793173650139-u4mcad`
**HLD effective hash:** `12565b4b7f9e...`

Decide whether accepted review work is complete, then publish one canonical code-review record linked to its exact subject and coverage checkpoint. Missing evidence, conflicting requirements, stale source and a non-independent reviewer prevent publication. Publication is recoverable after interruption and preserves the existing verdict and human approval rules.

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
11. [Open questions](#11-open-questions)

## 1. HLD context

> See **HLD-c32aa60534232f36** § 2. Framework summary

**Rollout phase:** E — complete and publish one canonical review
**Owns:** `sc5` (ReviewCompletionV1)
**Consumes:** `sc1` (ImmutableReviewSubjectV1), `sc2` (EvidenceCoverageV1), `sc3` (InvestigationContinuationV1), `sc4` (DurableReviewRecoveryV1), `sc6` (ReviewRuntimePortsV1)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Own subject preparation, attribution ambiguity detection, exact Git commit/blob/block navigation and frozen context binding. Define foundational runtime-port types only; do not implement task investigation, a recovery store or new accounting storage. No generic HEAD/working-tree diff may select scope. — owns `sc1`, `sc6`
- `s2`: Own required-row enumeration, evidence identity/provenance and coverage relationships/dispositions. Reuse subject inputs and runtime ports. Keep ledger validation helpers private; do not execute reviewer turns or publish CRs. — owns `sc2`
- `s3`: Own independent read-only task-directed continuation behavior, on-demand source navigation, optional indexed caller/impact enrichment, budget admission, bounded retry/pause and attempt usage emission through foundational ports. In-memory ports are test scaffolding while production selection remains disabled until s4/s6; no durable storage implementation or terminal approval logic. Publish and acknowledge incremental block progress within continuations, with partial cross-block assessments recorded rather than lost. Domain progress contracts only; no competing MCP phase/schema ownership. External registration belongs to s6. — owns `sc3`
- `s4`: Own durable implementation of foundational acceptance/usage-outbox ports, append/replay/checkpoint integrity, lease/generation fencing, uncertain attempts and compatibility/time recovery. Do not alter review criteria or introduce a usage warehouse. Its recovery implementation is composed by downstream s6 rather than consumed backwards by s3. Persist/replay block-level evidence and assessment receipts independently of final provider-call completion. — owns `sc4`
- `s6`: Own production composition, equivalent MCP/daemon/controller start/status/resume/cancel adapters, status/usage presentation fields, explicit engine rollout/rollback, legacy compatibility and evaluation fixtures. No client opens stores directly; no client-specific board UI or design-review replacement. Sole new-engine MCP adapter/schema owner; reconcile 8315a11f/S005 legacy sc7 as specified in the architecture and record code-only supersession before opt-in. Verify routing partitions across both installation orders. — owns `sc7`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `CompletionAssessmentV1`

```typescript
interface CompletionAssessmentV1 { readonly runId: string; readonly subjectDigest: string; readonly checkpointDigest: string; readonly outcome: 'publishable' | 'incomplete' | 'stale' | 'conflict'; readonly unresolvedRows: readonly string[]; readonly reasons: readonly string[]; readonly requiredCriteria: readonly string[]; }
```

**Returns:** `CompletionAssessmentV1` — Deterministic assessment of an immutable accepted checkpoint, not a review verdict or human approval.

**Errors:**
- `RecoveryError` when Corrupt, unsupported or foreign recovery state; ownership lost.

**Preconditions:**
- Trusted daemon supplies current registered repo, approved BUILD/contract pins, independent party records and replayed sc4 state.
- No issued/partially-accepted attempt remains active; uncertain/failed enclosing attempts may retain accepted blocks but cannot themselves certify completion.

**Postconditions:**
- Every required task, acceptance, design, change, criterion and applicable impact row has an explicit validated disposition.
- Pending or unverified required rows, outstanding work and unfinished selected blocks produce incomplete; conflicts remain for human resolution; freshness mismatch produces stale.

### 2.2 `ReviewCompletionReceiptV1`

```typescript
interface ReviewCompletionReceiptV1 { readonly receiptId: string; readonly runId: string; readonly subjectDigest: string; readonly terminalCheckpointDigest: string; readonly artifactId: string; readonly artifactRevision: number; readonly verdict: 'pass' | 'warn' | 'block'; readonly coverageRef: string; }
```

**Returns:** `ReviewCompletionReceiptV1` — Verified canonical CR identity/revision and durable accepted coverage link, emitted only after canonical persistence is confirmed.

**Errors:**
- `RecoveryError` when Completion not publishable, stale pins, publication intent conflict, ownership loss or uncertain canonical write.

**Preconditions:**
- Assessment remains publishable at the frozen checkpoint and immediately before canonical CAS.
- sc4 prerequisite provides durable frozen intent, owner-fenced publication and completion-requested lease recovery; not supplied by s5 private-event writes.

**Postconditions:**
- One operation identity maps to one canonical revision; identical replay returns original receipt and does not invoke judges or append another revision.
- Human BUILD approval and override remain separate actions; completed block/warn CR is distinct from incomplete execution.

### 2.3 `RecoveryStore`

```typescript
class RecoveryStore { requestCompletion(leaseId: string, generation: number): Promise<RecoveryView>; recordCompletion(leaseId: string, generation: number, receipt: string): Promise<RecoveryView>; }
```

**Returns:** `RecoveryView` — Consumed existing sc4 transition/receipt boundary; exact inherited types remain unchanged.

**Errors:**
- `RecoveryError` when Stale owner, conflicting terminal receipt or unsupported recovery.

**Preconditions:**
- Consume only sc4 public capabilities; do not author its private event envelopes.

**Postconditions:**
- Only sc4 owns run-state journal and fencing. sc5 owns eligibility and canonical adaptation.

## 3. Data model changes

### 3.1 `CompletionAssessmentV1` — new

Proposed new files: src/workflow/code-review/investigation/completion-types.ts defines exact sc5 types and typed completion errors; src/workflow/code-review/investigation/completion-assessment.ts evaluates one replayed immutable checkpoint. Consume validateReviewLedger and trusted receipt closure. Enumerate required criteria from basis, never reviewer-selected subset; verify exact required row universe and all selected packet/non-text blocks have latest accepted disposition reviewed, with no retained follow-up/outstanding work. Valid findings remain accountable dispositions and can yield a completed blocking verdict. Satisfaction/not-applicable still require sc2 evidence/applicability checks. A requirement marked finding is accountable only if its linked evidence and finding references validate. Changes absent from PLAN remain required change rows and must be independently judged, never silently dropped. Conflicts between approved expectations are supplied as trusted unresolved contract-decision references or evidence-linked reviewer conflicts and return conflict; do not derive semantic contradictions from string matching or silently rewrite expectations. Evidence-scoped unavailable/partial records cannot support a stronger disposition than sc2 permits. Unknown party or same author/reviewer is conflict; re-read canonical BUILD authorPartyOf and authenticated review party, not model-supplied labels. [c1,c2,c3]

**Call sites:**
- `src/workflow/code-review/investigation/ledger.ts`
- `src/workflow/code-review/investigation/recovery-store.ts`

### 3.2 `Frozen publication intent` — new

Proposed new file: src/workflow/code-review/investigation/completion-publication.ts builds/stages an immutable intent containing version, deterministic operationId, run/subject/policy/checkpoint digests, coverageRef and coverage digest, candidate CR content digest, canonical CR id, expected prior revision or explicit absent state, pinned BUILD revision/fingerprint and verified author/reviewer provenance. Operation identity binds run+subject+checkpoint+canonical target; timestamps and model usage are descriptive metadata and cannot create a second logical publication. sc4 owns durable intent acceptance and checkpoint freeze in its runtime namespace; staged-but-unaccepted intent is not authority. Accepted intent cardinality per run is zero or one; it references exactly one immutable coverage snapshot and canonical target revision, while distinct legitimate review runs may create later canonical CR revisions through existing lifecycle rules. One coverage snapshot retains the sc2 ledger, basis and trusted receipt references; runtime data stays out of artifact JSON. Artifact JSON carries compact investigation linkage only. [c1,c2,c4]

**Call sites:**
- `src/workflow/code-review/investigation/recovery-store.ts`
- `src/workflow/code-review/types.ts`

### 3.3 `Canonical CodeReviewArtifact investigation linkage` — field-add

Proposed new file: src/workflow/code-review/investigation/completion-artifact.ts adapts accepted findings to existing DimensionResult and CodeReviewArtifact, preserving criterion/dimension order, severity, confidence, expectation/evidence identities and all findings. Reuse or extract existing runner fold/build/validate helpers without invoking runCodeReview's judge execution. Add optional body.investigation metadata with version, operationId, runId, subjectDigest, policyDigest, checkpointDigest, coverageRef and coverageDigest; old records omit it and remain readable. Keep existing reviewedBy party, BUILD fingerprint and canonical lifecycle content identity. Findings map into their pinned criteria; unknown criterion or unmappable location is a conflict, never silently discarded. Prefer evidence source path/range as finding location and retain structured evidence/expectation refs in additive metadata. Preserve current severity fold exactly: any HIGH block, else MED warn, else pass; confidence remains explicit and existing human approval policy is unchanged. Extend CodeReviewBody.groundingMode with the explicit value investigation for both new-engine modes, and add investigation.sourceMode (source-only or indexed-impact). Do not label new source-only runs degraded or new indexed runs graph-full: legacy full/degraded semantics and warn cap remain unchanged for legacy records. The new investigation mode uses the existing severity fold without a source-mode verdict floor; optional caller discovery is the only mode difference. Update canonical validators, rendering and completion-evidence readers to recognize the versioned mode; enum-strict older readers require s6 capability gating and are not claimed automatically compatible. Unsupported new-mode readers refuse rather than reinterpret the record. [c2,c3,c4]

```
CodeReviewBody.groundingMode: 'full' | 'degraded' | 'investigation'; CodeReviewBody.investigation?: { readonly version: 1; readonly sourceMode: 'source-only' | 'indexed-impact'; readonly operationId: string; readonly runId: string; readonly subjectDigest: string; readonly policyDigest: string; readonly checkpointDigest: string; readonly coverageRef: string; readonly coverageDigest: string; } | undefined;
```

**Call sites:**
- `src/workflow/code-review/types.ts`
- `src/workflow/code-review/runner.ts`

### 3.4 `Canonical publication protocol` — new

Proposed new file: src/workflow/code-review/investigation/completion-publisher.ts consumes the sc4 publication fence and existing ArtifactStore/History/LifecycleService instance owned by the daemon. Build one immutable candidate and coverage snapshot; assess; accept frozen intent through sc4; then under its owner fence enter the canonical artifact queue. Use ArtifactStore.updateAndLog (or lifecycle-equivalent guarded content mutation) to compare current head revision/absence against frozen expected revision, and recheck scope/freshness/party/current owner immediately before mutation. Same operationId plus exact subject/checkpoint/content digest returns existing canonical revision without write. Any mismatching current record/revision is conflict; never overwrite to hide another run or a human-edited record. A lifecycle write and a run journal receipt are two recoverable commits, not one atomic cross-store transaction. After canonical write read back and validate the exact persisted head, then stage immutable ReviewCompletionReceiptV1 and call sc4.recordCompletion. On lost ACK, reconcile by frozen operation identity and canonical content/history; if canonical head has moved incompatibly, report conflict rather than regenerate. Rendered CR document is a regenerable canonical view, never the authority for success; temporary review reports remain /tmp. No direct filesystem artifact overwrite and no automatic approval/tracker message. [c2,c4]

**Call sites:**
- `src/workflow/artifact-core/store.ts`
- `src/workflow/code-review/runner.ts`
- `src/workflow/code-review/investigation/recovery-store.ts`

### 3.5 `sc4 prerequisite back-flow` — invariant-change

The current sc4 implementation rejects lease claims for completion-requested state and has no accepted publication-intent binding. This is owned by s4, not s5. Before s5 PLAN/build, approve and implement the localized sc4-owned HLD amendment: expose an owner-fenced publication operation which durably binds exactly one intentRef and expected checkpoint, freezes further progress, permits restart/takeover while preserving frozen intent, and supplies a current-owner assertion inside the canonical commit callback. Same intent replay is idempotent; changed intent is conflict; a cancelled/stale/completed run cannot acquire new publication authority. Its critical section pins generation against concurrent takeover for a bounded canonical write, with freshness/owner checks immediately before CAS; journal receipt after write stays separately recoverable. sc5 consumes that capability and must not implement sc4 reducer/lease changes as its own task. Open question oq1 blocks PLAN until prerequisite ownership and approval are resolved. [c1,c4] Formal pending proposal: .insrc/artifacts/AMD-c32aa60534232f36-1.json. This is a prerequisite amendment request, not an implemented capability.

**Call sites:**
- `src/workflow/code-review/investigation/recovery-store.ts`
- `src/workflow/code-review/investigation/recovery-lifecycle.ts`

## 4. Diagrams

- [Sequence diagram](docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/S005/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc5` | implements | Own exact assessment/receipt types, accountable completion checks and canonical CR adapter/publisher; no model judging or autoapproval. |
| `sc1` | consumes | Revalidate exact selected packets, frozen context and approved contract/BUILD pins at assessment and canonical CAS; no generic HEAD diff. |
| `sc2` | consumes | Use validated ledger universe and trusted provenance; do not weaken evidence, findings or applicability rules. |
| `sc3` | consumes | A request-completion reply is a trigger only. All final findings/deltas must already be block-checkpoint accepted; no new final reply coverage accepted here. |
| `sc4` | consumes | Use replay, lease/fence, frozen publication intent and terminal receipt. Explicit prerequisite back-flow for missing capability; do not privately implement or forge its state events. |
| `sc6` | consumes | Stage immutable intent/coverage/receipt values through existing runtime ports. Usage observation quality/pending status preserved without making usage availability a false proof of review coverage. |

## 6. Error paths

**Error cases**

- **Required coverage/evidence or selected block assessment missing.** (recoverable)
  - Detection: Revalidate ledger and enumerate required rows, latest block dispositions and outstanding work against pinned basis.
  - Response: Return incomplete with unresolved row IDs/reasons; no canonical CR or terminal success.
  - User impact: Remaining review work stays visible.
- **Conflicting expectations or non-independent/unknown reviewer.** (recoverable)
  - Detection: Compare trusted contract-decision conflicts and canonical authorPartyOf against authenticated reviewer party; refuse unknown/same party.
  - Response: Return conflict for human decision; never silently weaken approved requirements or label same-party result independent.
  - User impact: Human resolves conflicting requirements or chooses independent reviewer.
- **Pinned source/BUILD/contract changed before publication.** (terminal)
  - Detection: assertReviewSubjectFresh plus exact BUILD fingerprint/revision, policy/tool compatibility check at assessment and inside canonical CAS.
  - Response: Return stale without publishing for the new revision; preserve accepted evidence for diagnosis.
  - User impact: Further review required for changed scope.
- **Crash or lost ACK between intent, canonical write and terminal receipt.** (recoverable)
  - Detection: Read frozen sc4 intent, terminal receipt and canonical operationId/content digest under owner fence.
  - Response: Reconcile the same canonical revision; if absent apply expected-revision CAS once; if conflicting preserve conflict. No model rerun or new logical publication.
  - User impact: Resume publication without paying for accepted reasoning again.
- **Concurrent completion or canonical CR changed by another run/person.** (recoverable)
  - Detection: sc4 generation fence and ArtifactStore queue compare expected prior revision plus frozen operation identity.
  - Response: Identical operation returns original receipt; mismatching head or intent returns conflict, no overwrite.
  - User impact: No silent loss of newer review or human edits.
- **Missing sc4 prerequisite or unsupported canonical reader capability.** (recoverable)
  - Detection: Check frozen-intent/publication-fence support and versioned investigation metadata/grounding support before admission.
  - Response: Explicit unsupported/conflict; do not implement private sc4 events or pretend legacy records prove new coverage.
  - User impact: Prerequisite must be approved and delivered before s5 build/rollout.
- **Canonical JSON succeeds but rendered document fails.** (recoverable)
  - Detection: Verified head and operation identity exist while deterministic render reports IO failure.
  - Response: Retain canonical identity and regenerate document idempotently; report rendering limitation, never publish duplicate revision.
  - User impact: Review result survives; view repair pending.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| All coverage accounted for with HIGH/MED findings. | Publish a completed block/warn CR under existing severity policy; do not confuse findings with incomplete execution. |
| Parent provider attempt failed after accepted blocks. | Accepted block assessments remain eligible if all required coverage/provenance is valid and no attempt remains active; failure itself grants no coverage. |
| Empty or stale index caller results. | Applicable unresolved impact rows prevent completion; absence is not proof of no impact. |
| Pending/unavailable token usage with otherwise complete review. | Preserve usage quality/delivery state; do not invent tokens or treat missing usage as review evidence. |
| Source-only vs indexed mode on identical accepted evidence. | Same coverage and verdict rules; only optional impact discovery differs. Legacy grounding labels must not create an artificial mode-specific verdict floor. |

**Invariants to preserve**

- Reuse sc2 provenance, per-block acceptance and current-owner recovery state; request-completion alone cannot create findings or coverage. Context discovery bundle c1. [[c1]]
- Canonical review severity fold and independent party/lifecycle semantics remain distinct from design-review computeVerdict. Context discovery bundle c2. [[c2]]

## 7. Test strategy

**Test framework:** `node:test with node:assert/strict through tsx; extend investigation recovery fixtures and backend canonical artifact lifecycle tests; no live LLM required.`

**Test levels**

- **unit** — Prove deterministic fail-closed completion without model execution.
  - Subjects: `Required coverage and latest selected-block completeness`, `Trusted evidence, conflict and party validation`, `Canonical severity/confidence and dimension adaptation`, `Versioned investigation linkage and mode parity`
  - Fixtures: `complete and incomplete sc2 ledgers`, `known/unknown/same-party records`, `source-only and indexed inputs with identical accepted state`
- **integration** — Prove recoverable one-revision publication through real lifecycle/journal boundaries.
  - Subjects: `Frozen intent and expected-revision canonical CAS`, `Lost ACK and crash reconciliation around canonical commit and terminal receipt`, `Concurrent completion, stale owner and edited canonical head refusal`, `Freshness recheck between assessment and publication`, `Regenerable rendered document and terminal receipt replay`
  - Fixtures: `sc4-owned prerequisite publication-fence adapter`, `real temporary ArtifactStore/History/LifecycleService`, `bounded child-process/fault hooks at intent/CR/receipt boundaries`, `legacy canonical review fixtures`
- **contract** — Keep new completion compatible with shared types and existing human gates.
  - Subjects: `Exact sc5 assessment and receipt shapes`, `Legacy CR readers, independent approval and override semantics`, `No judge rerun, autoapproval or production registration`
  - Fixtures: `existing code-review and completion-evidence fixtures`, `explicit unsupported capability adapter`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Each missing/pending/unverified task/check/design/change/criterion/impact row or unfinished block returns incomplete with no canonical write.`, `Valid evidence-backed findings remain accountable and publish completed WARN/BLOCK.` |
| `ac2` | `Unsupported satisfied/not-applicable claims fail sc2 validation.`, `Unplanned packet blocks remain required; conflicting requirements and unknown/same party return conflict without weakening catalog.` |
| `ac3` | `Crash before/after canonical commit and receipt saves yields exactly one operation/revision and same terminal receipt on retry.`, `Concurrent requests, conflicting intent and newer/human-edited canonical head cannot duplicate or overwrite result.`, `Identical source-only/indexed accepted state yields same verdict under versioned new-engine grounding; partial/failed execution produces no passing CR.` |
| `ac4` | `Change source/contract/BUILD/policy after assessment and before CAS; refuse publication as stale and retain reason.`, `Lost owner/fence refuses canonical mutation; completed receipt replay remains read-only.` |

## 8. Migration

**State before:** Discovery c1: sc4 persists accepted block state and simple completion-requested/completed transitions but cannot yet recover the frozen publication intent. Discovery c2: canonical runner executes judges then uses lifecycle-backed persistence, with legacy full/degraded labels and severity fold.

**State after:** sc5 assessment and versioned canonical adapter consume accepted coverage and an sc4-owned frozen-publication boundary. New engine remains unselected until s6 qualifies readers and transports; existing reviews retain behavior.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Resolve oq1 and approve the localized sc4 amendment; deliver its recovery prerequisite under sc4 ownership before s5 PLAN/build. No s5 private recovery event implementation. — ↩ rollbackable
2. Add sc5 assessment/receipt types and pure validation plus versioned investigation metadata and explicit investigation grounding mode to canonical CR readers/validators. Existing full/degraded records retain original semantics. — ↩ rollbackable
3. Add canonical expected-revision publication adapter using the daemon's existing lifecycle instance and sc4 fence; verify deterministic crash/CAS/mode/approval fixtures without activating production engine. — ↩ rollbackable
4. s6 enables only after all consumers support the new canonical mode/version. Rollback routing preserves canonical records/history and frozen intents; older binaries must refuse unsupported new-mode publication rather than rewrite it as a legacy review. — ↩ rollbackable

**Backward compat:** Existing CR fields, verdict vocabulary, party and human override semantics preserved. New investigation records add compact versioned linkage and require an explicit canonical groundingMode extension for equal source/index verdict treatment; older enum-strict readers are NOT automatically compatible. Reader validation/rendering changes are scoped to canonical CR and must be capability-gated by s6. No conversion of legacy partial logs into resumable coverage, no default routing change or artifact backfill.

## 9. Alternatives considered

### 9.1 a1: Frozen completion intent and canonical compare-and-set — **CHOSEN**

Assess accepted coverage, freeze one publication intent, and reconcile canonical CR by deterministic identity.

Use sc2/sc4 replay for deterministic assessment, stage immutable coverage and candidate CR, persist an owner-fenced sc4 publication intent, then write through the existing ArtifactStore queue with expected-revision and operation-identity checks. Complete sc4 receipt only after verifying canonical content. A restart reuses the same frozen intent and canonical revision rather than running judges again. Requires a localized sc4 recovery prerequisite; s5 consumes it, never writes private sc4 events.

### 9.2 a2: Durable canonical publication outbox

Queue frozen completion payloads for a separate daemon publication worker.

Perform the same coverage/freshness/party assessment and store a frozen sc4 intent, then hand it to a dedicated worker which serially applies canonical artifact CAS and records receipt. Worker revalidates freshness and ownership before writes, with the same sc4 recovery prerequisite.

**Rejected because:** Dedicated publication worker unnecessary for one bounded canonical write and still requires the same recovery protocol.

## 10. References

- **[[c1]]** `code` `src/workflow/code-review/investigation/recovery-store.ts`
- **[[c2]]** `code` `src/workflow/code-review/runner.ts`
- **[[c3]]** `code` `src/workflow/review/party.ts`
- **[[c4]]** `prior-artifact` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/HLD.md`
- **[[c5]]** `code` `src/workflow/artifact-core/store.ts`

## 11. Open questions

- oq1: Approve the localized sc4 withPublicationFence amendment and deliver that sc4-owned prerequisite (durable frozen intent, completion-requested takeover and owner-fenced publication) before s5 PLAN/build. Do not silently implement sc4 private state in s5.

## Resolved questions

- `q3bc6bf0c` — oq1: Approve the localized sc4 withPublicationFence amendment and deliver that sc4-owned prerequisite (durable frozen intent, completion-requested takeover and owner-fenced publication) before s5 PLAN/build. Do not silently implement sc4 private state in s5.
  - **resolved**: Approve the sc4 publication-fence amendment and implement the sc4-owned prerequisite before S5 PLAN/build. — User explicitly approved the LLD and amendment and authorized addressing the prerequisite before S5 planning. AMD-c32aa60534232f36-1 is now approved; implementation will be separately tracked under sc4 ownership. _(2026-10-29T10:44:41.025Z)_

## Citations

- **[[c1]]** `code` `src/workflow/code-review/investigation/recovery-store.ts`
- **[[c2]]** `code` `src/workflow/code-review/runner.ts`
- **[[c3]]** `code` `src/workflow/review/party.ts`
- **[[c4]]** `prior-artifact` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/HLD.md`
- **[[c5]]** `code` `src/workflow/artifact-core/store.ts`

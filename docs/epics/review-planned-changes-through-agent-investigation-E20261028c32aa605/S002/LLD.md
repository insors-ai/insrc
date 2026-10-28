<!-- insrc:artifact LLD-c32aa60534232f36-s2 -->

# LLD: STORY-c32aa60534232f36-s2

## Summary

**Epic:** `review-planned-changes-through-agent-investigation`
**HLD base run:** `wf-1793173650139-u4mcad`
**HLD effective hash:** `12565b4b7f9e...`

Track every approved obligation and scoped change alongside the evidence inspected for it. Shared evidence can support several requirements, while missing evidence, unplanned changes and unresolved findings remain visible. This Story builds the ledger rules; later Stories execute reviewers and persist checkpoints.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

> See **HLD-c32aa60534232f36** § 2. Framework summary

**Rollout phase:** B — evidence and accountable coverage
**Owns:** `sc2` (EvidenceCoverageV1)
**Consumes:** `sc1` (ImmutableReviewSubjectV1), `sc6` (ReviewRuntimePortsV1)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Own subject preparation, attribution ambiguity detection, exact Git commit/blob/block navigation and frozen context binding. Define foundational runtime-port types only; do not implement task investigation, a recovery store or new accounting storage. No generic HEAD/working-tree diff may select scope. — owns `sc1`, `sc6`
- `s3`: Own independent read-only task-directed continuation behavior, on-demand source navigation, optional indexed caller/impact enrichment, budget admission, bounded retry/pause and attempt usage emission through foundational ports. In-memory ports are test scaffolding while production selection remains disabled until s4/s6; no durable storage implementation or terminal approval logic. Publish and acknowledge incremental block progress within continuations, with partial cross-block assessments recorded rather than lost. Domain progress contracts only; no competing MCP phase/schema ownership. External registration belongs to s6. — owns `sc3`
- `s4`: Own durable implementation of foundational acceptance/usage-outbox ports, append/replay/checkpoint integrity, lease/generation fencing, uncertain attempts and compatibility/time recovery. Do not alter review criteria or introduce a usage warehouse. Its recovery implementation is composed by downstream s6 rather than consumed backwards by s3. Persist/replay block-level evidence and assessment receipts independently of final provider-call completion. — owns `sc4`
- `s5`: Own completion coverage/freshness/party validation, canonical CR adaptation and idempotent terminal publication receipts. Reuse existing lifecycle and severity/confidence policy. Do not let a completion request, missing evidence or a failed run masquerade as a completed verdict. — owns `sc5`
- `s6`: Own production composition, equivalent MCP/daemon/controller start/status/resume/cancel adapters, status/usage presentation fields, explicit engine rollout/rollback, legacy compatibility and evaluation fixtures. No client opens stores directly; no client-specific board UI or design-review replacement. Sole new-engine MCP adapter/schema owner; reconcile 8315a11f/S005 legacy sc7 as specified in the architecture and record code-only supersession before opt-in. Verify routing partitions across both installation orders. — owns `sc7`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `ReviewLedgerV1`

```typescript
interface EvidenceV1 {
 readonly evidenceId: string; readonly subjectDigest: string;
 readonly kind: 'changed-block' | 'context-source' | 'artifact' | 'test-result' | 'caller-impact';
 readonly source: { readonly path: string; readonly revision: string; readonly digest: string; readonly lines: readonly [number, number] | null };
 readonly role: 'changed-scope' | 'context-only'; readonly inspectedByAttempt: string;
 readonly completeness: 'complete' | 'partial' | 'unavailable'; readonly limitations: readonly string[];
 readonly contentRef: string;
}
interface CoverageV1 {
 readonly rowId: string; readonly subjectDigest: string; readonly requirementRef: string;
 readonly category: 'task' | 'acceptance' | 'design' | 'change' | 'criterion' | 'impact';
 readonly disposition: 'pending' | 'satisfied' | 'finding' | 'unverified' | 'not-applicable';
 readonly evidenceIds: readonly string[]; readonly findingIds: readonly string[];
 readonly rationale: string; readonly assessedByAttempt: string | null;
}
interface ReviewLedgerV1 {
 readonly runId: string; readonly subjectDigest: string;
 readonly evidence: readonly EvidenceV1[]; readonly coverage: readonly CoverageV1[];
 readonly findings: readonly { readonly findingId: string; readonly criterion: string; readonly severity: 'HIGH' | 'MED' | 'LOW'; readonly confidence: 'breach' | 'observation'; readonly evidenceIds: readonly string[]; readonly expectationRefs: readonly string[]; readonly message: string }[];
}
```

**Returns:** `ReviewLedgerV1` — Frozen run/subject-bound evidence, coverage and findings; sc2 fields match the approved HLD exactly.

**Errors:**
- `ReviewLedgerError` when Named invalid-input, subject-mismatch, provenance-mismatch, unknown-reference, conflicting-replay, unsupported-obligation or resource-limit rejection. Invalid deltas leave prior ledger unchanged.

**Preconditions:**
- Use a verified sc1 subject and a complete pinned requirement/criterion catalog, not reviewer-supplied scope or approval flags.
- Trusted receipt/attempt adapters establish which evidence was actually inspected; callers cannot manufacture read, test, index or storage receipts.

**Postconditions:**
- Never remove required rows or findings via replacement updates; no storage, dispatch, approval or terminal verdict emitted.
- Canonical identities and immutable snapshots reuse existing s1/corpus helpers, with explicit limits; no duplicate serializer.

## 3. Data model changes

### 3.1 `Required-row catalog and CoverageV1` — new

Proposed internal modules: investigation/ledger-types.ts exports exact sc2; ledger.ts owns initializeReviewLedger(subject,basis,runId), applyReviewLedgerDelta(ledger,delta,basis,trustedReceipts), and validateReviewLedger(ledger,basis). These are pure internal sc2 operations, not new MCP protocols. basis is immutable and bound to subjectDigest, pinned artifact digests and versioned criterion policy. Enumerate one row per task, each acceptance check, every applicable design/upstream obligation, each packet block including non-text/unplanned changes, and each criterion; discovered impact rows append without changing packets. Stable row IDs hash subjectDigest/category/namespaced requirementRef. Reject duplicate/conflicting identities; do not deduplicate different revisions or blocks by path/title. Design catalog reuses adherenceObligations and ADHERENCE_LLD_SECTIONS/EXCLUDED in src/workflow/review-pipeline/adapters/code-review-obligations.ts over verified pinned LLD/PLAN projections; call its existing CodeReviewSubject signature unchanged through the new sc2-local read-only projection described below. Map existing clause keys under artifactID@digest namespace; task/check rows remain separately enumerated from sc1. Known excluded LLD sections retain explicit exclusion reasons, and testStrategy/functional requirements/companion obligations get required rows under appropriate criterion/design entries, rather than disappearing through adherence exclusions. Reject unclassified new LLD sections. For supported planless upstream artifacts with no clause adapter, keep the complete pinned contract as a required whole-contract design row; no invented PLAN tasks. Criteria come from trusted versioned review-policy catalog including applicability rationales; no reviewer may omit a dimension. Required rows start pending with empty links/rationale and null attempt. Pending is never complete coverage. Each non-pending assessment requires nonempty rationale and an authenticated current attempt. Satisfied requires inspected complete supporting evidence; finding requires linked validated finding(s) and their evidence. Unverified retains reason and available partial/unavailable evidence. Not-applicable requires explicit criterion/obligation-specific rationale and inspected evidence where the decision depends on source; changed blocks cannot become N/A merely because they are unplanned, deleted or binary. s3 judges substantive adequacy; s2 prevents structurally unsupported assertions. s5 alone decides final completeness/verdict. LEGACY REUSE BOUNDARY [[c6]]: src/workflow/review-pipeline/adapters/code-review-obligations.ts and src/workflow/code-review/types.ts are read-only dependencies, not change sites. Do not narrow, extend or otherwise edit their functions, types, constants, outputs or ownership. The new investigation/ledger-catalog.ts compatibility projection constructs a real typed CodeReviewSubject (no partial cast, fabricated approval or call to legacy subject/diff resolution) from verified pinned LldArtifact/PlanArtifact values, repoPath/root epicHash/storyId from trusted work identity, changedFiles from the exact selected packet old/new paths, and actual pinned BUILD/TESTS records when supplied (otherwise null; this pure helper does not read them). Optional legacy attribution fields are omitted; do not assert story-trailer ownership for block-attested scope. Only call adherenceObligations on this projection, and never feed the projection into a legacy runner, grounding function or dimension judge. It enumerates clauses only; sc1 remains the sole scope authority. Approved contract objects must match sc1 artifact pins before projection. Output keys are namespaced by the pinned artifact digest; no context atoms or whole-source prompts are dispatched. If a legitimate upstream route has no pinned LLD/PLAN, skip this helper and keep the already specified whole-upstream required row. CALL-SITE INVENTORY [[c6]]: legacy src/workflow/code-review/dimensions/adherence.ts calls adherenceObligations(subject) from its obligation callback, and src/workflow/review-pipeline/code-review.ts imports only DimensionObligations and consumes spec.obligations callbacks; it does not directly import/call adherenceObligations. Their existing full CodeReviewSubject objects and field needs, including changedFiles used by adherence prompt construction, are untouched. The helper itself reads approvedLld and approvedPlan; it does not invoke those callers or require changing their other fields. Existing src/workflow/review-pipeline/__tests__/code-review-gather.test.ts fixtures check obligation-section classification and remain regression evidence. Sc2 adds one isolated new caller only. Importing a utility from an older epic does not transfer that epic's controller protocol or execution ownership.


### 3.2 `EvidenceV1 and trusted inspection admission` — new

Evidence records are admitted from verified sc6 read receipts, trusted test-run records or index-impact receipts and an authenticated attempt identity, never arbitrary reviewer citation objects. Source evidence path/revision/digest/range/contentRef and completeness must match the trusted receipt and subject pins. A claimed complete receipt cannot exceed its inspected bounds; unavailable and partial evidence cannot independently satisfy a requirement. Changed-scope evidence must map to an exact selected packet block with matching parent/commit/blob and allowed range; context/unchanged callers remain context-only even when used by multiple requirements. Artifact evidence pins id/revision/content digest; test results pin actual run/result/command/source revision with unknown/skipped/failed states explicit; index-impact records pin index/source identity and disclosed freshness/coverage limitations, never imply no impact from empty callers. No graph queries or test execution in s2. A trusted adapter supplies verified metadata unavailable in sc6's minimal read receipt (e.g. source path/revision) and maps it to the exact immutable reference. Evidence ID hashes subjectDigest, kind, source, role, inspectedByAttempt, completeness, limitations and contentRef; repeated identical evidence is idempotent, same ID with different material is conflict. Content remains behind immutable contentRef, not embedded in ledger. Preserve originating attempt; replay by another attempt does not relabel old inspection. Reuse snapshotValue/freezeValue/digestValue from investigation/identity.ts; ledger limit defaults 1MiB canonical metadata and 10000 rows/evidence/findings each, explicit limit error not truncation.


### 3.3 `Relationships, findings and update semantics` — new

One ledger owns 0..N evidence, 1..N required coverage rows and 0..N findings. A row links 0..N evidence and findings; each evidence may support 0..N rows, each finding 1..N expectationRefs and supporting evidence. Every link resolves within the same run/subject; contentRef references externally owned immutable blobs. These prose cardinalities are normative; no ER diagram is needed for the small value model. Findings retain criterion, severity/confidence and evidence-backed expectation links; no invented semantic verdict or severity rule. Atomic delta admits evidence/findings then row assessments, validates whole candidate, freezes a new value and leaves prior unchanged on error. Existing identical records replay harmlessly; IDs with differing content refuse. Existing findings are never deleted or silently overwritten; updates can refine a row's disposition/rationale while preserving evidence/finding history as unions. A previously found problem cannot become satisfied while its finding is hidden: sc2 retains links and s5 later adjudicates lifecycle. Missing row/evidence, wrong subject, unsupported satisfaction, dangling/foreign finding and row removal refuse. Dynamic impact rows may append from trusted impact catalog, and remain mandatory accountable rows once discovered. sc4 owns generation/sequence fencing and durable acceptance; pure sc2 replay rules do not claim storage atomicity or exactly-once execution. No changes to legacy coverage adapters, controller validation or CR schemas.


## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Use verified immutable subject tasks, checks, packets and contract pins as the unchanged-scope authority. No new diff or artifact approval semantics. |
| `sc2` | implements | Own exact evidence/coverage/ledger value schemas, complete required-row enumeration, provenance checks and atomic pure update validation. |
| `sc6` | consumes | Admit trusted read receipt metadata; serialized immutable content may be staged through central object\|string port by orchestration. Do not implement staging, journaling or usage stores. |

## 5. Error paths

**Error cases**

- **Forged or foreign evidence/assessment** (recoverable)
  - Detection: Compare subject/run/attempt bindings, immutable reference metadata, inspected ranges and completeness against trusted receipts; resolve every ID in candidate ledger.
  - Response: ReviewLedgerError provenance-mismatch/subject-mismatch/unknown-reference; reject entire delta.
  - User impact: Supply verified inspection evidence; prior progress unchanged.
- **Unsupported coverage assertion or missing required catalog entry** (recoverable)
  - Detection: Compare row universe against deterministic task/check/block/catalog enumeration; verify satisfaction evidence, finding links, N/A rules and rationale/attempt requirements.
  - Response: Typed invalid-input/unsupported-obligation; preserve pending/unverified rows rather than assuming success.
  - User impact: Reviewer must inspect evidence or retain an unresolved reason.
- **Conflicting replay, dropped history or limit overflow** (recoverable)
  - Detection: Canonical same-ID value comparison; existing row/finding set inclusion and link checks; metadata byte/count bounds before accepting candidate.
  - Response: Typed conflicting-replay/resource-limit; no partial mutation/truncation.
  - User impact: Retry identical delta or resolve conflict; large runs require explicit future limit decision, not silently lost rows.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Shared source inspection supports several tasks | One evidence identity may link many rows; each row has an independent substantive assessment. |
| Deleted/binary/unplanned change or unavailable source | Required change row persists with assessed finding or unverified reason; no path-based disappearance. |
| Stale caller index or failed/skipped test | Record explicit limitation/result provenance; absence is not proof of no impact and a complete read of a failed test record cannot satisfy a positive test-pass obligation. |
| Same accepted evidence replayed or cross-block partial progress | Idempotent identity reuse, original attempt retained; unresolved rows survive until a later supported assessment. |

**Invariants to preserve**

- sc1 source/pin and completeness semantics remain authoritative; s2 cannot widen changed scope. Grounded in s1 reuse analyze bundle. [[c1]]
- Legacy coverage preparation and controller finding validator remain unchanged; ledger is isolated pending s6 integration. Grounded in legacy coverage analyze bundle. [[c2]]

## 6. Test strategy

**Test framework:** `node:test and node:assert/strict via tsx, matching inspected s1 investigation fixtures. Deterministic fake receipt/catalog adapters; no live LLM calls.`

**Test levels**

- **unit** — Prove required-row completeness and validated many-to-many immutable updates.
  - Subjects: `review-s2-ac1 exact row universe: tasks/checks/pinned design/upstream clauses/all packet blocks/criteria and append-only discovered impacts`, `review-s2-ac2 shared evidence supports several independently assessed rows; note-only/uninspected/partial/unavailable satisfaction rejected`, `review-s2-ac3 delete/binary/unplanned/unavailable changes remain explicit rows across updates`, `Reject wrong subject/run/attempt, forged receipt metadata, dangling links, dropped rows/findings, conflicting IDs and oversized candidates atomically`, `Identical replay preserves original evidence attempt and byte-stable ledger; input mutation cannot change accepted value`, `Known LLD sections reuse existing obligation keys/exclusions; test/FR/companion obligations remain covered and unknown sections refuse`
  - Fixtures: `Pinned sc1 subject and verified artifact bodies, complete criterion catalog, trusted source/test/index receipt fixtures`
- **integration** — Exercise real s1 pinned receipts and existing obligation helpers without changing legacy execution.
  - Subjects: `Read pinned source through s1 then admit evidence, bind multiple rows and preserve partial limits; foreign context cannot become changed scope`, `Approved-plan and planless bases enumerate complete obligation sets; absent plan never invents tasks`, `Existing adherenceObligations signature/callers remain unchanged; sc2 typed projection produces the same clause catalog on pinned inputs; canonical/s1 fixtures stay green`
  - Fixtures: `Existing s1 temporary-Git fixture, approved LLD/PLAN/upstream snapshots, no DB or provider services`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `review-s2-ac1 exact row universe`, `Known LLD section classification and approved-plan/planless integration` |
| `ac2` | `review-s2-ac2 many-to-many evidence and unsupported satisfaction rejection`, `Pinned s1 receipt integration and forged provenance tests` |
| `ac3` | `review-s2-ac3 deleted/binary/unplanned/unavailable retention`, `Atomic rejection and history preservation fixtures` |

## 7. Migration

**State before:** Fresh s1 analyze bundle locates pinned subject/read receipts and legacy coverage validators. Existing legacy dimension evidence is not a run-scoped sc2 ledger; s1 sc1/sc6 implementation is approved and complete.

**State after:** Add isolated sc2 types, catalog projection and pure immutable delta/provenance checks. Later s3/s4/s5/s6 consume them; legacy dispatch remains unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add exact sc2 types and requirement catalog projections, reusing s1 canonical identity and existing adherenceObligations via an sc2-local complete typed projection. All legacy helper signatures, caller sites and outputs remain unchanged. — ↩ rollbackable
2. Add trusted receipt admission and pure atomic evidence/coverage/finding validation with deterministic tests. — ↩ rollbackable
3. Expose internal ledger operations for downstream Stories; verify s1/legacy parity without activating the engine. — ↩ rollbackable

**Backward compat:** No persisted schema rewrite or public MCP/CR change. All existing obligation helpers, types, adapters and call sites are read-only dependencies; no signature narrowing is permitted. Rollback removes only unused new sc2 modules. Durable store migration is s4 responsibility.

## 8. Alternatives considered

### 8.1 a1: Immutable ledger values and validated deltas — **CHOSEN**

Deterministically enumerate requirements and apply validated evidence/coverage deltas as immutable sc2 values.

Use one owned sc2 module for typed requirement catalogs, trusted read-receipt admission, many-to-many bindings and pure ledger transition checks. Reuse s1 canonical snapshot/hash helpers and ports; persistence stays s4. Agent judgments remain s3; no model calls or storage in s2.

### 8.2 a2: Mutable indexed ledger with exported immutable snapshots

Maintain in-memory row/evidence maps and project sc2 snapshots after validation.

A mutable owner keeps keyed maps for rows and evidence while enforcing the same trust validation and relationship rules, exposing only immutable snapshots compatible with HLD sc2. Store lifecycle remains external and no new persistence is introduced.

**Rejected because:** Additional mutable lifecycle without a demonstrated need.

## 9. References

- **[[c1]]** `analyze-bundle` `s1/analyzeBundles/0` — "Analyzer located prepareReviewSubject/readReviewSource/readApprovedWork, plus legacy prepareCoverageGrounding and validateFinding. Read receipts and canonical identity helpers are existing s1 seams; l"
- **[[c2]]** `analyze-bundle` `s1/analyzeBundles/1` — "Analyzer usage.example links prepareCoverageGrounding to existing controller and coverageSpec. Data-model trace empty and test.locate off-topic, so no claim of complete coverage; existing coverage ada"
- **[[c3]]** `prior-artifact` `.insrc/artifacts/HLD-c32aa60534232f36.json` — "Approved sc2 and s2 boundary; consume sc1/sc6."
- **[[c4]]** `code` `src/workflow/review-pipeline/adapters/code-review-obligations.ts` — "Reuse design clause enumeration and explicit exclusions, preserving legacy outputs."
- **[[c5]]** `code` `src/workflow/code-review/investigation/identity.ts` — "Reuse canonical snapshot/hash/freeze helpers; no duplicate serializer."
- **[[c6]]** `code` `src/workflow/code-review/types.ts:176-198` — "Use the full existing CodeReviewSubject shape through a new sc2-local projection. Legacy helper and callers remain untouched."

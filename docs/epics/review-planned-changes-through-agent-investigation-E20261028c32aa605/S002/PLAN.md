<!-- insrc:artifact PLAN-c32aa60534232f36-s2 -->

# Plan: STORY-c32aa60534232f36-s2

## Summary

**Epic:** `review-planned-changes-through-agent-investigation`
**LLD run:** `wf-1793193382852-fg6stx`
**LLD effective hash:** `12565b4b7f9e...`

Build an immutable ledger that accounts for every approved obligation and scoped change, admitting only verified inspection evidence. Validate shared evidence links and updates without losing unresolved work or finding history. Reuse the completed subject layer and existing obligation helpers while leaving legacy execution unchanged.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define sc2 ledger contracts and immutable basis | M | — | — | unit: sc2 contracts, canonical identities and bounded immutable values | [[c1]] [[c2]] |
| 2 | **`t2`** Enumerate every required coverage row from pinned work | L | — | `t1` | unit: review-s2-ac1 complete catalog, legacy projection and planless obligations | [[c1]] [[c3]] |
| 3 | **`t3`** Admit evidence only from verified inspection receipts | L | — | `t1`, `t2` | unit: Trusted receipt admission, provenance, completeness and replay | [[c1]] [[c4]] |
| 4 | **`t4`** Apply atomic immutable coverage and finding deltas | L | — | `t1`, `t2`, `t3` | unit: review-s2-ac2/ac3 atomic many-to-many coverage and history retention | [[c1]] [[c5]] |
| 5 | **`t5`** Validate pinned-source integration and unchanged legacy behavior | M | — | `t1`, `t2`, `t3`, `t4` | integration: Pinned sc1-to-ledger integration and legacy obligation compatibility | [[c1]] [[c6]] |

### 1.1 TASK-c32aa60534232f36-s2-t1 — Define sc2 ledger contracts and immutable basis

Add exact sc2 EvidenceV1/CoverageV1/ReviewLedgerV1 types and typed catalog, trusted-receipt, attempt and delta inputs in ledger-types.ts. Reuse s1 canonical snapshot/hash/freeze helpers and explicit metadata/count limits.

**Acceptance checks:**
- Exact HLD sc2 fields retained; sc1/sc6 imported, never duplicated or redesigned.
- Trusted adapter outputs remain separate from reviewer proposals; named ReviewLedgerError causes and typed limits explicit.
- Canonical IDs bind subject, requirement namespace and provenance; defensive copies/frozen outputs reject invalid or oversized metadata.
- Focused contract/identity tests pass; no store, model, MCP or verdict implementation.

### 1.2 TASK-c32aa60534232f36-s2-t2 — Enumerate every required coverage row from pinned work

Add ledger-catalog.ts and initialization. Enumerate task/check, design/upstream, every selected text/non-text block and versioned criteria; append trusted impact rows without widening packet scope. Reuse unchanged adherenceObligations via complete sc2-local typed CodeReviewSubject projection.

**Acceptance checks:**
- review-s2-ac1: deterministic row universe retains tasks/checks/design/criteria and all selected blocks, including unplanned/deleted/binary work.
- Legacy helper/types/caller files unchanged; only new local projection uses real pinned contract values and exact selected paths, with no partial type cast or legacy resolver call.
- Known LLD exclusions explicit; testStrategy/FR/companion obligations remain accounted for; unclassified sections refuse; legitimate planless upstream gets required whole-contract row without invented tasks.
- Rows start pending with stable identities; duplicate/conflicting catalog identities reject; focused planned/planless/classification tests pass.

### 1.3 TASK-c32aa60534232f36-s2-t3 — Admit evidence only from verified inspection receipts

Add evidence validation/admission helpers for source, artifact, test and index-impact evidence. Bind authenticated attempt, subject pins, immutable content and inspected bounds; preserve completeness and originating attempt.

**Acceptance checks:**
- Reject forged/mismatched source metadata, reference/range/subject/attempt and changed-scope claims; context and caller impact cannot create changed scope.
- Reuse sc1/sc6 receipts; verified adapters supply path/revision or test/index metadata absent from minimal read receipt; no execution or graph query in sc2.
- Complete read of failed/skipped test or stale/incomplete index is not proof of a passing test/no impact; limitations and native result provenance remain explicit.
- Identical evidence replay idempotent, conflicting content under same ID rejected, original attempt retained; focused provenance tests pass.

### 1.4 TASK-c32aa60534232f36-s2-t4 — Apply atomic immutable coverage and finding deltas

Implement ledger.ts pure apply/validate operations: admit evidence/findings then row assessments, resolve all references and validate the complete candidate before returning a frozen new value.

**Acceptance checks:**
- review-s2-ac2: evidence can support many independently assessed rows; note-only/uninspected/partial/unavailable evidence cannot silently satisfy coverage.
- Non-pending assessments require rationale/authenticated attempt; findings have criterion/severity/confidence and evidence/expectation links; pending never implies completion.
- review-s2-ac3: required rows and findings never disappear; row updates preserve linked history; unknown/foreign/dangling references and dropped rows reject atomically.
- Identical replay stable; conflicting IDs reject; discovered impact rows append through trusted catalog; no durable fencing/persistence or terminal approval logic.
- Focused adversarial atomicity, replay, mutation and retention tests pass.

### 1.5 TASK-c32aa60534232f36-s2-t5 — Validate pinned-source integration and unchanged legacy behavior

Complete cross-module sc1 receipt-to-ledger and approved-work catalog integration fixtures; verify all LLD test subjects, focused legacy obligation/canonical/sc1 regressions and production build. Publish internal exports for downstream Stories.

**Acceptance checks:**
- Every LLD subject mapped to concrete test cases; all three ACs proven with deterministic providers/adapters and no live LLM suite.
- Real s1 receipts preserve partial bounds and context role through many-to-many ledger updates; foreign references, unresolved changes and planless basis behave as designed.
- Existing adherenceObligations signature/outputs/callers unchanged; existing code-review-gather and sc1/canonical fixtures pass.
- Production build passes; test/build evidence recorded. No public MCP, CR schema, DB, accounting or production engine changes.
- Run one required independent code review after build; avoid automatic repeated rounds and inspect concrete evidence before requesting more.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| review-s2-ac1 exact row universe: tasks/checks/pinned design/upstream clauses/all packet blocks/criteria and append-only discovered impacts | `t2`, `t4`, `t5` |
| review-s2-ac2 shared evidence supports several independently assessed rows; note-only/uninspected/partial/unavailable satisfaction rejected | `t3`, `t4`, `t5` |
| review-s2-ac3 delete/binary/unplanned/unavailable changes remain explicit rows across updates | `t2`, `t4`, `t5` |
| Reject wrong subject/run/attempt, forged receipt metadata, dangling links, dropped rows/findings, conflicting IDs and oversized candidates atomically | `t1`, `t3`, `t4` |
| Identical replay preserves original evidence attempt and byte-stable ledger; input mutation cannot change accepted value | `t1`, `t3`, `t4` |
| Known LLD sections reuse existing obligation keys/exclusions; test/FR/companion obligations remain covered and unknown sections refuse | `t2`, `t5` |
| Read pinned source through s1 then admit evidence, bind multiple rows and preserve partial limits; foreign context cannot become changed scope | `t3`, `t4`, `t5` |
| Approved-plan and planless bases enumerate complete obligation sets; absent plan never invents tasks | `t2`, `t5` |
| Existing adherenceObligations signature/callers remain unchanged; sc2 typed projection produces the same clause catalog on pinned inputs; canonical/s1 fixtures stay green | `t2`, `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s2 contractDetails and owned sc2 boundary`
- **[[c2]]** `prior-artifact` `LLD s2 immutable identities, trusted inputs and metadata limits`
- **[[c3]]** `prior-artifact` `LLD s2 required-row catalog and unchanged legacy compatibility projection`
- **[[c4]]** `prior-artifact` `LLD s2 evidence admission and provenance rules`
- **[[c5]]** `prior-artifact` `LLD s2 atomic coverage/finding deltas and error paths`
- **[[c6]]** `prior-artifact` `LLD s2 testStrategy and additive migration`

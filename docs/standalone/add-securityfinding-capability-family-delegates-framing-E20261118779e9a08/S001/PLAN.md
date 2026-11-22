<!-- insrc:artifact PLAN-779e9a08142cb057-s1 -->

# Plan: STORY-779e9a08142cb057-s1

## Summary

**Epic:** `add-securityfinding-capability-family-delegates-framing`
**LLD run:** `wf-1794991305269-uesxrz`
**LLD effective hash:** `779e9a08142c...`

Building this Story means adding four small, independent extension-point types to the review framework -- SecurityFinding, SecurityLocator, an EvidenceProvider registry stub, and a VerificationReceipt record -- plus the per-(type,model) JSON Schema transformers the inheritance-heavy shapes need for structured-output safety. Every piece is additive: SecurityFinding and SecurityLocator are plain interfaces extending the now-built sibling Finding/Locator types, VerificationReceipt is a new sibling module mirroring the existing TEST RECORD's TESTS.md-beside-BUILD.md pattern for its own RECEIPTS.md, and EvidenceProvider is a standalone registry shape with no real provider wiring yet. Five small-to-medium Tasks, no changes to any existing exported type, field, or function signature.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add SecurityFinding interface, isSecurityFinding type guard, risk-family verdict representation, and policy-override staleness check | M | — | — | unit: isSecurityFinding type guard (true/false/malformed discriminant); unit: SecurityFinding structural extension of base Finding (all base fields present + security-only fields); unit: overriddenAt vs current Scope revision comparison (stale override rejected); unit: risk-family verdict recorded as informational zero-severity SecurityFinding for not-applicable/uncertain families; integration: reconciliation pass consuming a mixed Finding/SecurityFinding list; integration: docgen review-report render of a round containing SecurityFinding entries | [[c1]] [[c5]] |
| 2 | **`t2`** Add SecurityLocator interface extending Locator | S | — | — | unit: SecurityLocator structural extension of Locator/Pointer (trust-boundary id + taint-path step index fields) | [[c2]] |
| 3 | **`t3`** Add EvidenceProvider interface/registry and SecurityEvidence shape | S | — | `t2` | unit: SecurityEvidence shape (providerCategory + optional SecurityLocator) | [[c3]] [[c2]] |
| 4 | **`t4`** Add VerificationReceipt type and a parallel RECEIPTS.md record module | M | — | — | unit: VerificationReceipt record shape (pass/fail/evidence linkage by id); integration: RECEIPTS.md write for a security review round; integration: approval attempt against a RECEIPTS.md/VerificationReceipt record is refused | [[c4]] |
| 5 | **`t5`** Add per-(type,model) JSON Schema transformers for SecurityFinding and SecurityLocator | S | — | `t1`, `t2` | unit: JSON Schema transformer output for SecurityFinding (kind discriminant + inherited Finding fields); unit: JSON Schema transformer output for SecurityLocator (kind discriminant + inherited Locator/Pointer fields) | [[c5]] [[c6]] |

### 1.1 TASK-779e9a08142cb057-s1-t1 — Add SecurityFinding interface, isSecurityFinding type guard, risk-family verdict representation, and policy-override staleness check

Add `SecurityFinding` as a plain TS interface extending the base `Finding` (src/workflow/review-round/finding.ts) with kind:'security', checkId, violatedPolicyRef, evidence, fixability, confidence, enforcementMode, the revision-anchored override fields overriddenBy/overrideReason/overriddenAt, and receiptId (an optional string id of a corroborating VerificationReceipt -- never the receipt object itself). Add an `isSecurityFinding` type guard checking the `kind` discriminant. Add a risk-family verdict representation modeled as an informational, zero-severity SecurityFinding for applicable/not-applicable/uncertain families. Add the policy-override staleness check comparing overriddenAt against the Scope's current revision.

**Acceptance checks:**
- SecurityFinding structurally extends base Finding -- every Finding field present plus the security-only fields including receiptId
- isSecurityFinding returns true only for an object whose kind discriminant is exactly 'security'
- A risk-family verdict (applicable/not-applicable/uncertain + reason), including not-applicable ones, is representable as an informational, zero-severity SecurityFinding
- A stale override (overriddenAt diverges from the Scope's current revision) is rejected by the staleness check
- The framework's shared reconciliation pass accepts a mixed Finding/SecurityFinding list with zero change to its own logic
- The docgen 'review-report' renderer renders a round containing SecurityFinding entries with zero change to its own type signature

### 1.2 TASK-779e9a08142cb057-s1-t2 — Add SecurityLocator interface extending Locator

Add `SecurityLocator` as a plain TS interface extending the framework's `Locator` (src/workflow/artifact-core/types.ts:271-274) with trustBoundaryId and taintPathStepIndex as first-class optional fields, following the open-Locator-kind extensibility pattern. No change to Locator or Pointer themselves -- a security-graph citation is represented as Pointer{path, section: SecurityLocator, contentHash?}, reusing Pointer unchanged.

**Acceptance checks:**
- SecurityLocator structurally extends Locator -- kind and value fields present plus trustBoundaryId and taintPathStepIndex
- A SecurityLocator instance is assignable to Pointer.section with no change to Pointer's own type

### 1.3 TASK-779e9a08142cb057-s1-t3 — Add EvidenceProvider interface/registry and SecurityEvidence shape

Add the `EvidenceProvider` interface/registry stub for the five deterministic evidence-provider categories (secret scanning, SAST, dependency/SBOM, IaC/container, language-native checks), distinct from the general tool registry, with a common input/output contract. Add `SecurityEvidence` (providerCategory + an optional SecurityLocator) feeding SecurityFinding.evidence uniformly. Extension-point only: no real daemon-IPC wiring or provider implementations in this Story.

**Acceptance checks:**
- EvidenceProvider interface defines a common input/output contract shared by all five provider categories
- SecurityEvidence carries providerCategory and an optional SecurityLocator-typed locator field

### 1.4 TASK-779e9a08142cb057-s1-t4 — Add VerificationReceipt type and a parallel RECEIPTS.md record module

Add `VerificationReceipt` (result, environment, pass/fail outcome) and a new sibling module to src/workflow/runners/build/test-record.ts (e.g. receipt-record.ts) mirroring TestRecordCase/TestRecordReported/persistTestRecordTask/readTestRecord/renderTestRecordMd, reusing the existing writeArtifact/writeAtomic (src/workflow/storage.ts) and storeRound/withStoredModel (src/workflow/runners/build/round-writer.ts) primitives unchanged. Renders RECEIPTS.md beside the review artifact exactly as TESTS.md sits beside BUILD.md: a non-approvable RECORD, written for every sandbox/mutation checkpoint run (pass or fail), referenced by id from a corroborating SecurityFinding.

**Acceptance checks:**
- persistVerificationReceipt's write is unconditional for whatever outcome (pass or fail) it is given -- it takes no SecurityFinding parameter anywhere and is never gated on one, proven directly against the real function; wiring an actual sandbox/mutation checkpoint to call it is this Story's own non-goal (LLD summary: "no ... evidence-provider internals ... are designed here"), tracked separately, not built or testable within this Story's scope
- RECEIPTS.md renders beside the review artifact using the existing writeArtifact/writeAtomic/storeRound/withStoredModel machinery, unmodified
- An approval attempt against a RECEIPTS.md/VerificationReceipt record is refused, matching TESTS.md's own non-approvable-record behavior

### 1.5 TASK-779e9a08142cb057-s1-t5 — Add per-(type,model) JSON Schema transformers for SecurityFinding and SecurityLocator

Add bidirectional JSON Schema transformers (canonical model -> a shape a given (type, target model) pair reliably emits against, and back) for SecurityFinding and SecurityLocator, extending the pattern already used for the codex provider, so the union/inheritance-heavy shapes added by t1/t2 are safely presentable to structured-output LLM calls.

**Acceptance checks:**
- A per-(type,model) JSON Schema transformer exists for SecurityFinding, covering its kind discriminant and inherited Finding fields
- A per-(type,model) JSON Schema transformer exists for SecurityLocator, covering its kind discriminant and inherited Locator fields

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| isSecurityFinding type guard (true/false/malformed discriminant) | `t1` |
| SecurityFinding structural extension of base Finding (all base fields present + security-only fields) | `t1` |
| SecurityLocator structural extension of Locator/Pointer (trust-boundary id + taint-path step index fields) | `t2` |
| VerificationReceipt record shape (pass/fail/evidence linkage by id) | `t4` |
| overriddenAt vs current Scope revision comparison (stale override rejected) | `t1` |
| risk-family verdict recorded as informational zero-severity SecurityFinding for not-applicable/uncertain families | `t1` |
| reconciliation pass consuming a mixed Finding/SecurityFinding list | `t1` |
| docgen review-report render of a round containing SecurityFinding entries | `t1` |
| RECEIPTS.md write for a security review round | `t4` |
| approval attempt against a RECEIPTS.md/VerificationReceipt record is refused | `t4` |
| JSON Schema transformer output for SecurityFinding (kind discriminant + inherited Finding fields) | `t5` |
| JSON Schema transformer output for SecurityLocator (kind discriminant + inherited Locator/Pointer fields) | `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 dataModelChanges.SecurityFinding`
- **[[c2]]** `prior-artifact` `LLD s1 dataModelChanges.SecurityLocator`
- **[[c3]]** `prior-artifact` `LLD s1 dataModelChanges.EvidenceProvider`
- **[[c4]]** `prior-artifact` `LLD s1 dataModelChanges.VerificationReceipt`
- **[[c5]]** `prior-artifact` `LLD s1 errorPaths.invariantsToPreserve`
- **[[c6]]** `prior-artifact` `LLD s1 testStrategy.acceptanceMapping`

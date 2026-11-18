<!-- insrc:artifact LLD-779e9a08142cb057-s1 -->

# LLD: STORY-779e9a08142cb057-s1 — Add SecurityFinding and capability-family DELEGATES framing to the review process

## Summary

**Epic:** `add-securityfinding-capability-family-delegates-framing`
**HLD base run:** `wf-1794991305269-uesxrz`
**HLD effective hash:** `779e9a08142c...`
**Seeded from:** `SPEC-5a5f556b77d7aa31`

This LLD defines the data-model extension points that let a 'security' review type plug into the rebuilt review framework: SecurityFinding (a structural subtype of the framework's base review Finding), SecurityLocator (a structural subtype of Locator/Pointer with trust-boundary/taint-path fields), a dedicated EvidenceProvider registry routed through daemon IPC, and a VerificationReceipt record mirroring the existing Story TEST RECORD pattern. It is extension points only — no risk-family taxonomy, evidence-provider internals, security-graph schema, or policy DSL are designed here.

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

## 3. Data model changes

### 3.1 `SecurityFinding` — new

A structural subtype of the review framework's base review Finding (owned by the sibling review-process Epic 03f4fd3b9102aab8's sc2 contract, Story s2 — not yet built; see openQuestions). Carries kind:'security' as its type discriminant, plus checkId, violatedPolicyRef, evidence: SecurityEvidence[], fixability, confidence ('high'|'medium'|'low'), enforcementMode ('advisory'|'warning'|'blocking'), and the revision-anchored override fields overriddenBy?/overrideReason?/overriddenAt?. Modeled as a plain TS interface extending the base Finding structurally (interface SecurityFinding extends Finding), matching this codebase's own plain-interface convention (baseClassIdioms: [] confirmed in s1 grounding) rather than a class hierarchy. Further subclassed per security subtype (data/endpoint/vulnerability) or risk family with their own discriminant value as needed. A risk-family verdict (applicable/not-applicable/uncertain + reason) for every family, including not-applicable ones, is represented as an informational, zero-severity SecurityFinding for durable audit visibility — not a separate type.

**Call sites:**
- `src/workflow/artifact-core/types.ts`

### 3.2 `SecurityLocator` — new

A structural subtype of the review framework's Locator/Pointer type (owned by the sibling ReviewContext Epic 50cde239426d6e2a's sc1 contract, Story s1 — not yet built; see openQuestions), adding trust-boundary id and taint-path step index as first-class fields, following the same open-Locator-kind extensibility pattern (a string-typed kind field, read structurally rather than via exhaustive switch). Used by SecurityFinding.evidence entries that cite a code location inside the security graph or an evidence provider's output.


### 3.3 `EvidenceProvider` — new

A dedicated interface/registry for the five deterministic evidence-provider categories (secret scanning, SAST, dependency/SBOM, IaC/container, language-native checks), distinct from the general ~110-entry tool registry but still routed through daemon IPC so it stays within the existing tool boundary. Every provider implements a common input/output contract feeding SecurityFinding.evidence uniformly.


### 3.4 `VerificationReceipt` — new

A durable per-security-review-round record (what ran, in what isolated environment, with what outcome) produced by the sandbox-verification/mutation-testing checkpoint for every run, pass or fail, independent of SecurityFinding (a corroborated SecurityFinding references a receipt by id). Mirrors the existing Story TEST RECORD pattern — one entry per unit of work, a RECORD never an approvable artifact (no approval stamps, approval refused), rendered as RECEIPTS.md beside the review artifact exactly as TESTS.md sits beside BUILD.md — reusing the same writeArtifact/writeAtomic/storeRound/withStoredModel machinery TestRecordCase/TestRecordReported already use, rather than inventing new storage primitives.

**Call sites:**
- `src/workflow/runners/build/test-record.ts`
- `src/workflow/storage.ts`
- `src/workflow/runners/build/round-writer.ts`

## 4. Diagrams

- [ER model](docs/standalone/add-securityfinding-capability-family-delegates-framing-E20261118779e9a08/S001/er-model.html)
- [Sequence diagram](docs/standalone/add-securityfinding-capability-family-delegates-framing-E20261118779e9a08/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **A policy-evaluation checkpoint stamps a SecurityFinding's enforcementMode as 'blocking' for a finding whose severity the controller/reviewer judged low.** (recoverable)
  - Detection: The existing severity-driven gate reads only severity to decide block-vs-pass; enforcementMode is orthogonal and carried but not consulted by that gate, so a mismatch is only detectable by a human or a future audit reading both fields on the same record.
  - Response: No gate-level error is raised — accepted consequence of enforcementMode staying orthogonal to severity and riding the existing severity-driven gate rather than a new parallel block path. The mismatch is visible in the rendered review-report since both fields are present on the same SecurityFinding.
  - User impact: A reviewer could see a 'blocking' policy verdict that did not actually block the round, which could read as surprising without the decision's rationale in view.
- **A policy override's overriddenAt revision no longer matches the Scope's current revision when the next round runs.** (recoverable)
  - Detection: The policy-evaluation checkpoint compares SecurityFinding.overriddenAt against the Scope's current revision before trusting the override; a mismatch is a direct string/hash comparison, not an exception.
  - Response: The override is treated as stale/invalid: the checkpoint re-evaluates enforcementMode as if no override existed, forcing a fresh human decision rather than silently carrying forward a stale exemption.
  - User impact: A previously-overridden finding can reappear as blocking after an unrelated code change advances the revision, requiring the override to be re-granted.
- **A VerificationReceipt is written for a round whose sandbox/mutation checkpoint failed to run at all (e.g. the sandbox environment itself could not start).** (recoverable)
  - Detection: The checkpoint's own stage-report records whether it ran; absence of both a receipt and a stage-report success is distinguishable from a receipt recording a genuine pass/fail outcome.
  - Response: No receipt is written for a checkpoint that never ran; the existing per-checkpoint validator mechanism's own failure/skip reporting (unchanged by this Story) is the only record, consistent with VerificationReceipt being recorded 'for every run' — a non-run is not a run.
  - User impact: A reviewer sees the checkpoint's own skip/failure status but no RECEIPTS.md entry for that attempt, which is expected, not a defect.
- **A caller constructs an object with SecurityFinding's fields but an incorrect `kind` discriminant value (e.g. 'Security' or missing).** (recoverable)
  - Detection: The `isSecurityFinding` type-guard function checks `kind === 'security'` exactly; TypeScript's structural typing alone does not prevent a malformed discriminant at compile time, so this is a runtime risk the type guard is specifically responsible for catching.
  - Response: The type guard returns false, and the object is treated as a plain Finding — docgen's dedicated SecurityFinding rendering section and reconciliation's security-specific dedup step (owned separately, out of this Story's scope) are both skipped for it.
  - User impact: A malformed SecurityFinding silently loses its security-specific rendering and dedup treatment rather than raising a visible error, which is the accepted cost noted in a2's own cons list.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A risk-family verdict of 'not-applicable' for every family in a review round. | One informational, zero-severity SecurityFinding per family is still recorded, so the round's RECEIPTS.md/review-report shows every family was considered and explicitly ruled out, even though no true security finding exists. |
| A security review round where risk-family selection marks a family 'uncertain'. | That family's checkpoints still run, and any resulting SecurityFinding carries confidence:'low' or 'medium' rather than being suppressed or silently treated as applicable. |
| A SecurityFinding corroborated by a VerificationReceipt whose sandbox run is still in progress when the round's docgen render is invoked. | This Story does not design the sandbox/mutation checkpoint's own internal timing; it only fixes that a receipt is written once the checkpoint completes (pass or fail) and referenced by id — a render invoked before completion simply has no receipt id to show yet, which is a sequencing concern for the checkpoint implementation, not this Story's data-model contract. |
| Two different SecurityFindings (e.g. from SAST and the security graph) both evidence the same underlying vulnerability. | The security review type's own dedup step (scoped entirely inside its validator, after its own checkpoints, before handoff to the framework's shared reconciliation pass) collapses them to one primary finding with the other referenced as corroborating evidence; this Story's contract only fixes that SecurityFinding's shape supports that linkage, not the dedup algorithm itself. |

**Invariants to preserve**

- The framework's shared reconciliation pass and the docgen 'review-report' renderer must accept a SecurityFinding with zero change to their own type signatures or logic, since it is structurally a Finding (ordinary polymorphism, no unwrap/rehydration step). [[c1]]
- No abstract-base-class/class-hierarchy idiom is introduced; SecurityFinding and SecurityLocator stay plain TypeScript interfaces extending their base types structurally, matching the convention this and the sibling sessions' own grounding confirmed (baseClassIdioms: [] everywhere in src/workflow/). [[c1]]
- VerificationReceipt is recorded for every sandbox/mutation checkpoint run, pass or fail, and persists independently of whether any SecurityFinding corroborates it — mirroring the existing Story TEST RECORD's non-approvable, per-unit-of-work record pattern. [[c2]]

## 6. Test strategy

**Test framework:** `node:test (tsx --test)`

**Test levels**

- **unit** — Verify the new type guards, discriminants and data shapes behave correctly in isolation.
  - Subjects: `isSecurityFinding type guard (true/false/malformed discriminant)`, `SecurityFinding structural extension of base Finding (all base fields present + security-only fields)`, `SecurityLocator structural extension of Locator/Pointer (trust-boundary id + taint-path step index fields)`, `VerificationReceipt record shape (pass/fail/evidence linkage by id)`
  - Fixtures: `sample SecurityFinding objects per enforcementMode value`, `sample SecurityLocator objects`, `sample VerificationReceipt objects for pass/fail outcomes`
- **unit** — Verify the policy-override staleness check and the zero-severity not-applicable/uncertain risk-family verdict representation.
  - Subjects: `overriddenAt vs current Scope revision comparison (stale override rejected)`, `risk-family verdict recorded as informational zero-severity SecurityFinding for not-applicable/uncertain families`
  - Fixtures: `Scope objects at two different revisions`, `risk-family verdict fixtures for applicable/not-applicable/uncertain`
- **integration** — Verify the framework's shared reconciliation pass and docgen review-report renderer accept a SecurityFinding with zero change to their own logic (ordinary polymorphism, no unwrap step).
  - Subjects: `reconciliation pass consuming a mixed Finding/SecurityFinding list`, `docgen review-report render of a round containing SecurityFinding entries`
  - Fixtures: `a review round fixture mixing plain Finding and SecurityFinding entries`
- **integration** — Verify VerificationReceipt reuses the existing TEST RECORD storage machinery (writeArtifact/writeAtomic/storeRound/withStoredModel) and is recorded as a non-approvable RECORD beside the review artifact, mirroring TESTS.md beside BUILD.md.
  - Subjects: `RECEIPTS.md write for a security review round`, `approval attempt against a RECEIPTS.md/VerificationReceipt record is refused`
  - Fixtures: `a stored review round whose checkpoint has completed`
- **contract** — Verify the per-(type,model) JSON Schema transformer requirement holds for the new union/inheritance-heavy types.
  - Subjects: `JSON Schema transformer output for SecurityFinding (kind discriminant + inherited Finding fields)`, `JSON Schema transformer output for SecurityLocator (kind discriminant + inherited Locator/Pointer fields)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `SecurityFinding structural extension of base Finding (all base fields present + security-only fields)`, `reconciliation pass consuming a mixed Finding/SecurityFinding list`, `docgen review-report render of a round containing SecurityFinding entries` |
| `ac2` | `SecurityLocator structural extension of Locator/Pointer (trust-boundary id + taint-path step index fields)` |
| `ac3` | `overriddenAt vs current Scope revision comparison (stale override rejected)`, `risk-family verdict recorded as informational zero-severity SecurityFinding for not-applicable/uncertain families` |
| `ac4` | `RECEIPTS.md write for a security review round`, `approval attempt against a RECEIPTS.md/VerificationReceipt record is refused` |
| `ac5` | `JSON Schema transformer output for SecurityFinding (kind discriminant + inherited Finding fields)`, `JSON Schema transformer output for SecurityLocator (kind discriminant + inherited Locator/Pointer fields)` |

## 7. Migration

**State before:** Per s1's capability-discovery bundle: the codebase has no SecurityFinding, no SecurityLocator, no EvidenceProvider, and no capability-family delegation mechanism anywhere. src/workflow/artifact-core/types.ts exports only a generic Feedback entity with no security specialization; the only existing Finding-shaped taxonomies are the legacy, being-retired review-history/review/types.ts and review-history/code-review/types.ts shapes, which this Story does not touch. Security review rounds, when they run today, have no structured output type and no corroborating verification record.

**State after:** src/workflow/artifact-core/types.ts (or a new sibling module) additionally exports SecurityFinding (interface extending the base Finding from HLD-03f4fd3b9102aab8's sc2, once that sibling Story builds it), SecurityLocator (interface extending Locator/Pointer from HLD-50cde239426d6e2a's sc1, once that sibling Story builds it), and an EvidenceProvider registry interface routed through daemon IPC. src/workflow/runners/build/test-record.ts's storage machinery gains a parallel VerificationReceipt record type, rendered as RECEIPTS.md beside the review artifact using the same writeArtifact/writeAtomic/storeRound/withStoredModel primitives. No existing exported type, field, or function signature is changed or removed.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the SecurityFinding interface (new, additive) once the sibling Epic 03f4fd3b9102aab8 Story s2 Finding type exists to extend; until then this Story's own openQuestion records the dependency rather than inventing a placeholder base. — ↩ rollbackable
2. Add the SecurityLocator interface (new, additive) once the sibling Epic 50cde239426d6e2a Story s1 Locator/Pointer type exists to extend; same dependency-ordering note as step 1. — ↩ rollbackable
3. Add the EvidenceProvider interface/registry (new, additive), routed through the existing daemon IPC tool-call boundary — no change to the IPC transport or the ~110-entry general tool registry. — ↩ rollbackable
4. Add the VerificationReceipt type and extend test-record.ts's storage helpers with a parallel receipts-artifact id/path function and a RECEIPTS.md renderer, mirroring TestRecordCase/TestRecordReported and TESTS.md without modifying their existing behavior. — ↩ rollbackable
5. Wire the security review type's validator to call risk-family selection one capability family at a time (DELEGATES framing) and emit SecurityFinding entries, including one informational zero-severity SecurityFinding per not-applicable/uncertain family, before handing results to the framework's unchanged shared reconciliation pass. — ↩ rollbackable

**Backward compat:** No existing public API, type, or function signature is changed, renamed, or removed — every change in this migration is a strictly additive new type or a new field path on a type that does not exist yet in the codebase. The framework's shared reconciliation pass and docgen review-report renderer require zero code change since SecurityFinding is consumed via ordinary structural polymorphism as a Finding. Backward compatibility is preserved by construction; there is no prior version of these types to be compatible with.

## 8. Alternatives considered

### 8.1 a1: Real TypeScript class hierarchy (abstract class Feedback, class SecurityFinding extends Feedback)

Model the IS-A relationship with actual TS classes and `extends`, matching textbook OOP inheritance literally.

Declare `abstract class Feedback` with the fields the sibling review-process HLD's Finding shape already defines (category, severity), and `class SecurityFinding extends Feedback` adding checkId, violatedPolicyRef, evidence[], fixability, confidence, enforcementMode, and the override fields. Further security subtypes (data/endpoint/vulnerability) extend SecurityFinding again as needed.

The reconciliation pass and docgen renderer would accept `Feedback` instances and rely on `instanceof SecurityFinding` for the type-discriminant check the brainstorm's settled decisions require.

**Rejected because:** Introduces a real TS class hierarchy, a base-class idiom the codebase does not otherwise use anywhere (baseClassIdioms: [] confirmed in s1 grounding), and resists the per-(type,model) JSON Schema transformer requirement since class instances need extra serialization before they are a plain JSON Schema shape.

### 8.2 a2: Interface-based structural extension with a type discriminant (SecurityFinding interface extends Feedback interface + kind field) — **CHOSEN**

Model the IS-A relationship with plain TypeScript interfaces (`interface SecurityFinding extends Feedback`) plus a discriminant field, matching the codebase's existing plain-interface convention with no runtime class.

Declare `interface Feedback { category; severity }` (matching the sibling HLD's sc2 Finding shape) and `interface SecurityFinding extends Feedback { kind: 'security'; checkId; violatedPolicyRef; evidence; fixability; confidence; enforcementMode; overriddenBy?; overrideReason?; overriddenAt? }`. A SecurityFinding IS structurally a Feedback (every Feedback-typed field is present), so reconciliation's and docgen's existing Feedback-typed logic accepts it with zero code change; a narrow type-guard function (`isSecurityFinding(f): f is SecurityFinding`) checking the `kind` discriminant gives the renderer's type-discriminant check.

Further security subtypes (data/endpoint/vulnerability) extend SecurityFinding again with their own discriminant value, following the same pattern. This directly matches the plain-interface, no-base-class-idiom convention both sibling sessions' own grounding confirmed (baseClassIdioms: [] everywhere in src/workflow/), and gives every SecurityFinding a plain JSON-serializable shape that fits naturally into the per-(type,model) transformer pattern this session's decisions require.

### 8.3 a3: Flat Feedback type with optional security-only fields, gated by a kind discriminant

Add the security-specific fields directly onto the base Feedback type as optional fields, with no separate SecurityFinding type at all.

Extend the sibling HLD's Feedback interface itself with optional fields (checkId?, violatedPolicyRef?, evidence?, fixability?, confidence?, enforcementMode?) populated only when a Feedback instance comes from the security review type, discriminated by an optional `kind` tag.

Every consumer (reconciliation, docgen) already sees these fields on the one Feedback type it already knows, with no new type to introduce at all.

**Rejected because:** Directly contradicts the approved SPEC's settled decision and explicit non-goal ruling out extending the base Feedback type itself with security-only optional fields, and pollutes every non-security Feedback instance with always-undefined fields.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 capability-discovery bundle` — "Capability-discovery over 47 candidates in src/workflow/ found no SecurityFinding and no capability-family delegation mechanism anywhere."
- **[[c2]]** `analyze-bundle` `s1 how-does-it-work bundle` — "src/workflow/runners/build/test-record.ts implements the Story TEST RECORD: a per-Task record ... rendered as TESTS.md beside BUILD.md ... It is explicitly a RECORD, not an approvable artifact."
- **[[c3]]** `doc` `docs/standalone/security-review-extension-points-review-framework-E202611175a5f556b/SPEC.md`
- **[[c4]]** `prior-artifact` `docs/epics/review-rounds-reconciliation-recovery-E2026111803f4fd3b/HLD.md`
- **[[c5]]** `prior-artifact` `docs/epics/shared-reviewcontext-data-model-E2026111850cde239/HLD.md`

## 10. Open questions

- Which exact revision of the sibling Stories' types should SecurityFinding/SecurityLocator extend: HLD-03f4fd3b9102aab8's sc2 Finding{category,severity} (Story s2, not yet built) and HLD-50cde239426d6e2a's sc1 Locator/Pointer (Story s1, not yet built)? This LLD assumes those exact shapes per citations c4/c5; build order must sequence this Story's build after both sibling Stories land, and this LLD must be revisited if either sibling Story's actual shape diverges from what its approved HLD currently describes.
- This standalone Story's acceptanceCriteria was empty on entry to design.story — no formal ac-ids were handed down from an upstream stage. body.testStrategy.acceptanceMapping's ac1-ac5 were derived directly from the approved SPEC-5a5f556b77d7aa31's settled decisions rather than from a Story.acceptanceCriteria list, since none existed to map against. Recommend reconciling these five criteria back into the Story record so future stages (plan/build) see them as first-class acceptance criteria rather than LLD-internal inventions.

## Resolved questions

- `q0fb51f3b` — This standalone Story's acceptanceCriteria was empty on entry to design.story — no formal ac-ids were handed down from an upstream stage. body.testStrategy.acceptanceMapping's ac1-ac5 were derived directly from the approved SPEC-5a5f556b77d7aa31's settled decisions rather than from a Story.acceptanceCriteria list, since none existed to map against. Recommend reconciling these five criteria back into the Story record so future stages (plan/build) see them as first-class acceptance criteria rather than LLD-internal inventions.
  - **resolved**: Adopt the five criteria from this LLD's testStrategy.acceptanceMapping as the Story's formal acceptanceCriteria: ac1 SecurityFinding structurally extends base Finding and passes through reconciliation/docgen unchanged; ac2 SecurityLocator structurally extends Locator/Pointer with trust-boundary/taint-path fields; ac3 stale policy overrides are rejected and risk-family verdicts (incl. not-applicable/uncertain) are recorded as informational zero-severity SecurityFindings; ac4 VerificationReceipt is written for every sandbox/mutation checkpoint run as a non-approvable RECEIPTS.md record; ac5 SecurityFinding/SecurityLocator have per-(type,model) JSON Schema transformers. — The Story had no formal acceptanceCriteria on entry to design.story; these five were derived from the approved SPEC's settled decisions during s6 (test.strategy) and are now adopted as the Story's acceptance criteria so plan/build treat them as first-class rather than LLD-internal inventions. _(2026-11-18T08:56:23.361Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1 capability-discovery bundle` — "Capability-discovery over 47 candidates in src/workflow/ found no SecurityFinding and no capability-family delegation mechanism anywhere."
- **[[c2]]** `analyze-bundle` `s1 how-does-it-work bundle` — "src/workflow/runners/build/test-record.ts implements the Story TEST RECORD: a per-Task record ... rendered as TESTS.md beside BUILD.md ... It is explicitly a RECORD, not an approvable artifact."
- **[[c3]]** `doc` `docs/standalone/security-review-extension-points-review-framework-E202611175a5f556b/SPEC.md`
- **[[c4]]** `prior-artifact` `docs/epics/review-rounds-reconciliation-recovery-E2026111803f4fd3b/HLD.md`
- **[[c5]]** `prior-artifact` `docs/epics/shared-reviewcontext-data-model-E2026111850cde239/HLD.md`

<!-- insrc:artifact HLD-50cde239426d6e2a -->

# HLD: shared-reviewcontext-data-model

## Summary

**Tracker:** [insors-ai/insrc#195](https://github.com/insors-ai/insrc/issues/195)

This HLD defines one shared ReviewContext data model that both design review and code review build on: a uniform way to point at content (Pointer/Locator), describe which artifact depth a review attempt covers (Scope), list what changed this round (ReviewTargets), and carry freeform submitter context across rounds (Comments + round). Each piece is typed independently per review type never collapses another's fields into its own, and every review type gets its own validator function and its own LLM-facing transformer, so no single schema is forced on every consumer.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Diagrams](#4-diagrams)
5. [Shared contracts](#5-shared-contracts)
6. [Story boundaries](#6-story-boundaries)
7. [Non-functional targets](#7-non-functional-targets)
8. [Rollout](#8-rollout)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)
11. [Open questions](#11-open-questions)

## 1. Problem context

> See **DEF-50cde239426d6e2a** § 1. Problem

## 2. Framework summary

Alternative a2 wins: one canonical TypeScript type per Story (Pointer/Locator, Scope, ReviewTargets, CommentEntry+round), with per-review-type validator functions running against the canonical type and a thin per-consumer transformer reshaping it for whichever LLM structured-output schema that consumer actually parses reliably, mirroring the existing CliProvider input/output transformer pattern.

## 3. Architecture shape

Four independently-owned type modules land in src/workflow/artifact-core/ alongside the existing shared lifecycle/type files: Locator+Pointer (s1, the shared primitive every other piece builds on), Scope (s2, scopeType/scopeLevel plus named per-artifact-kind Pointer fields), ReviewTargets (s3, a reset-each-round list of Pointer entries), and CommentEntry+the root-level round field (s4). Per the Epic's own Non-Goals, assembling these four pieces into one populated ReviewContext instance and wiring that instance into insrc_review_step/insrc_code_review_step is deferred follow-on work in a later Epic -- this HLD defines only the four field-level types and their validator/staleness contracts, not the assembly logic.

## 4. Diagrams

- [ER model](docs/epics/shared-reviewcontext-data-model-E2026111850cde239/er-model.html)

## 5. Shared contracts

### 5.1 sc1: Locator + Pointer

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`

**Purpose:** The uniform way every Scope and ReviewTargets entry names a piece of content: a Pointer to an existing authored file plus an optional Locator pinning an exact region within it, per k2.

**Interface sketch (type-level):**

```
type LocatorKind = 'symbol' | 'lineRange' | 'docSection'; // known kinds; the set is open, not exhaustive
interface Locator {
  readonly kind: LocatorKind | string; // consumers read `kind` structurally; a future kind is just a new string, never a breaking union member
  readonly value: string; // symbol name, 'startLine-endLine', or doc-section id, per `kind`
}
interface Pointer {
  readonly path: string; // repo-relative path to an existing authored file (DEF.md/HLD.md/LLD.md/source); never a generated extract
  readonly section?: Locator;
  readonly contentHash?: string; // sha256 hex of `path`'s content when this Pointer was built
}
```

**Assumptions cited:** [[c1]]

### 5.2 sc2: Pointer staleness check

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`

**Purpose:** One staleness-detection function signature shared by every Pointer consumer (Scope and ReviewTargets alike), per k5 -- no consumer defines its own.

**Interface sketch (type-level):**

```
interface StalenessResult {
  readonly stale: boolean;
  readonly checkedAt: string; // ISO-8601
}
type PointerStalenessCheck = (pointer: Pointer, currentContentHash: string) => StalenessResult;
```

**Assumptions cited:** [[c1]]

### 5.3 sc3: Scope

**Owner Story:** `s2`

**Purpose:** Describes which review family and chain depth a review attempt covers, self-inclusive at the artifact under review, per k1/lc2.

**Interface sketch (type-level):**

```
type ScopeType = 'design' | 'code';
type ScopeLevel = 'def' | 'hld' | 'lld' | 'plan' | 'task';
interface Scope {
  readonly scopeType: ScopeType;
  readonly scopeLevel: ScopeLevel;
  readonly def?: Pointer;
  readonly hld?: Pointer;
  readonly lld?: Pointer;
  readonly plan?: Pointer;
  readonly tasks?: readonly Pointer[];
  readonly extension?: Pointer;
  readonly amendment?: Pointer;
}
type ScopeValidator = (scope: Scope) => ValidationResult; // one per review type, per k3
interface ValidationResult {
  readonly ok: boolean;
  readonly violations: readonly string[];
}
```

**Assumptions cited:** [[c1]]

### 5.4 sc4: ReviewTargets

**Owner Story:** `s3`

**Purpose:** The submitter-owned, fully-reset-each-round list of content to review this round, per lc3/lc4.

**Interface sketch (type-level):**

```
interface ReviewTargets {
  readonly entries: readonly Pointer[]; // rebuilt fresh every round; never merged with a prior round's entries
}
```

**Assumptions cited:** [[c1]]

### 5.5 sc5: CommentEntry + round

**Owner Story:** `s4`

**Purpose:** The submitter's freeform, provenance-tagged context and the root-level round field, per lc5/lc6/lc7. Per the Epic's Non-Goals this type does not yet embed Scope/ReviewTargets -- the full populated ReviewContext container is assembled by deferred follow-on work.

**Interface sketch (type-level):**

```
type CommentParty = 'submitter' | 'reviewer';
interface CommentEntry {
  readonly round: number;
  readonly party: CommentParty;
  readonly timestamp: string; // ISO-8601
  readonly text: string;
}
interface ReviewContextRound {
  readonly round: number; // the current attempt number, stamped once per new review round
  readonly comments: readonly CommentEntry[]; // same-artifact-only across the chain
}
```

**Assumptions cited:** [[c1]]

## 6. Story boundaries

### 6.1 Story STORY-50cde239426d6e2a-s1

**Owns:** `sc1`, `sc2`

The specific set of currently-known LocatorKind string literals (symbol/lineRange/docSection) is s1's own enumeration; because every consumer treats `Locator.kind` as an opaque string rather than exhaustively switching on a closed union, s1 can add a new literal later without forcing s2/s3/s4 to change, satisfying ac2/lc1.

### 6.2 Story STORY-50cde239426d6e2a-s2

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

Which named artifact-kind fields Scope carries beyond def/hld/lld/plan/tasks (e.g. a future named kind) and the exact per-review-type ScopeValidator implementations are s2's own; no other Story's type depends on Scope, since nothing in the Epic's Story graph consumes s2.

### 6.3 Story STORY-50cde239426d6e2a-s3

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`

ReviewTargets' own reset-on-new-round mechanics (how the entries list is rebuilt rather than merged) stay internal to s3; no other Story's type depends on ReviewTargets.

### 6.4 Story STORY-50cde239426d6e2a-s4

**Owns:** `sc5`

CommentEntry does not reference Pointer/Locator at all, so s4 needs neither sc1 nor sc2. The round-stamping mechanics (how a new attempt's round number is assigned) and the same-artifact-only scoping of Comments across a chain stay internal to s4; the full ReviewContext container embedding Scope and ReviewTargets alongside round/comments is explicitly deferred (Epic Non-Goals), since no Story in this graph depends on all of s2, s3 and s4 together.

## 7. Non-functional targets

- **Performance:** The staleness check (sc2) is a single hash comparison against already-read file content; it adds no I/O beyond the read the controller already performs to populate a Pointer's contentHash.
- **Security:** Pointer.path is repo-relative and must resolve within the registered repo root; validators (k3) reject a Pointer whose path escapes that root, consistent with the repo-registry strict-contract rule elsewhere in this codebase.

## 8. Rollout

**Phase A — foundational Pointer/Locator + staleness contract**

**Stories:** `s1`

s1 owns sc1 (Locator+Pointer) and sc2 (staleness check), which s2 and s3 both depend on per the Epic's dependsOn graph. Nothing else can land before s1.

**Phase B — Scope, ReviewTargets and Comments types**

**Stories:** `s2`, `s3`, `s4`

s2, s3 and s4 each depend only on s1 (already landed in Phase A) and have no dependencies on each other, so they can be built and landed in any order or in parallel once Phase A is done.

**Ordering rationale:** The Epic's Story graph is a single root (s1) with three independent children (s2, s3, s4); the only hard ordering constraint is that s1's sc1/sc2 contracts exist before s2 or s3 can be typed against them. s4 has no contract dependency on s1 at all but is grouped into Phase B anyway since it is equally safe to land alongside s2/s3 and splitting it into its own phase would add no value.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Locator's open-string `kind` field | A consumer that still writes an exhaustive switch over today's known LocatorKind literals (symbol/lineRange/docSection) instead of treating `kind` structurally would break ac2/lc1 the first time a new kind is introduced, even though the type itself stays open. | s1's LLD must show at least one real consumer reading `kind` non-exhaustively (e.g. a lookup by string key, not a switch with no default), and code review for s2/s3's Story checks that their Locator-consuming code follows the same shape. |
| Staleness check reimplemented per consumer instead of reused | k5 requires ONE shared staleness-detection function; if s2's and s3's LLDs each write their own ad hoc contentHash comparison instead of importing sc2's PointerStalenessCheck, the Epic silently ends up with two staleness implementations that can drift (e.g. different hash normalization) and fail the k5 constraint without any test catching it. | s2 and s3's LLDs must cite sc2's concrete file/export directly as what they import, not re-derive their own comparison; code review for both Stories checks for a second staleness implementation. |
| Per-Story types drift from what the deferred assembly Epic will actually need | Because no Story in this graph combines Scope + ReviewTargets + CommentEntry into one ReviewContext container (the assembly is an explicit Non-Goal deferred to a later Epic), a field named or shaped slightly differently across s2/s3/s4's independently-written LLDs could force an awkward adapter layer -- or a breaking rename -- when that later Epic tries to compose them. | Each Story's LLD must use the exact field names and types already fixed in this HLD's sharedContracts (sc3/sc4/sc5) verbatim, not re-derive its own naming, so the later assembly Epic composes them with no adapter. |
| A third Epic's Story (security review extension points) assumes SecurityLocator can extend 'Locator/Pointer' as one combined concept | sc1 deliberately keeps Locator{kind,value} and Pointer{path,section,contentHash} as two separate types with no common shape. STORY-779e9a08142cb057-s1's LLD extends both at once without saying which, found during a cross-design review on 2026-11-18/19, not by this Epic's own Stories. | Resolve explicitly, either in s1's own LLD or back-flowed from STORY-779e9a08142cb057-s1's LLD once its matching open question is answered, before s1's Locator/Pointer types are built; s1's LLD must show which type SecurityLocator actually extends. |
| A third Epic's Story (security review extension points) assumes 'security' plugs into the existing round cycle without a new Scope.scopeType member | sc3's scopeType is closed to 'design'\|'code'. STORY-779e9a08142cb057-s1's LLD never states whether the security reviewer pass runs nested inside the primary round's existing scopeType (reusing s2's Scope as-is) or needs a third enum member added to sc3 -- found during a cross-design review on 2026-11-18/19, not by this Epic's own Stories. | Resolve explicitly, either in s2's own LLD or back-flowed from STORY-779e9a08142cb057-s1's LLD once its matching open question is answered, before s2's Scope type is built; s2's LLD must show which reading it implements. |

## 9. Alternatives considered

### 9.1 a1: Flat discriminated-union wire format

Locator/Pointer/Scope/Comments are plain TS discriminated unions, and the SAME union shape is what every consumer (controller, each review-type validator, and every LLM prompt) is handed verbatim.

Define Locator as a single `{kind: 'symbol'|'lineRange'|'docSection', ...}` tagged union, Pointer as `{path, section?: Locator, contentHash?}`, and Scope/ReviewTargets/Comments as plain interfaces with per-artifact-kind named fields per k1. Every per-review-type validator and every review-type's LLM prompt receives this same union-shaped JSON directly, with no reshaping step in between.

This is the simplest possible implementation: one canonical type, one serialization, no transformer layer. It matches how most of the rest of artifact-core/ (e.g. types.ts) already represents data.

**Pros:**
- Zero extra code: no transformer layer to build, test, or maintain
- Matches the existing artifact-core/ convention.detect finding of plain interfaces with no base-class idiom (baseClassIdioms: [])
- Single source of truth for the shape everywhere -- no risk of two representations drifting apart

**Cons:**
- SPEC-0add47b5b1f72874 explicitly recorded that most LLMs handle unions and inheritance poorly in structured-output mode, and some refuse to parse such schemas -- feeding the raw union straight into every review-type's prompt risks exactly the failure the brainstorm flagged
- No place to apply the per-LLM/per-consumer schema fine-tuning the SPEC called for (mirroring the existing CliProvider transformer pattern) without later having to retrofit a transformer layer anyway

**Cost estimate:** S

**Rejected because:** Ties with a2 on k1-k4 (both satisfies) and k5 (both partial), but hands the raw tagged union straight to every review-type LLM prompt with no reshaping layer -- exactly the failure mode SPEC-0add47b5b1f72874 recorded (most LLMs handle unions/inheritance poorly, some refuse to parse such schemas).

### 9.2 a2: Canonical internal type + per-consumer shaping transformers — **CHOSEN**

Locator/Pointer/Scope/ReviewTargets/Comments are one canonical TS type internally, but each review-type validator and each LLM-facing call site gets its own transformer that reshapes the canonical type into whatever structured-output schema that specific consumer parses reliably.

Keep ONE canonical internal representation (TS discriminated union for Locator, plain interfaces for Pointer/Scope/ReviewTargets/Comments, matching k1-k5) as the single source of truth and the thing every validator function (k3) runs against. Add a small transformer per consumer -- one per review-type's LLM prompt shape, following the same input/output transformer pattern CliProvider already uses for its own structured-output calls -- so a model that chokes on a tagged union sees a flattened or per-type-narrowed schema instead, while the controller/validator logic never sees anything but the canonical type.

This directly satisfies the brainstorm's explicit instruction (captured in backFlowNotes) to handle LLM union/inheritance intolerance at the framework level with a transformer per consumer, the same way CliProvider already does, rather than forcing one schema on every LLM.

**Pros:**
- Directly satisfies the recorded brainstorm decision on LLM union/inheritance intolerance without requiring a second brainstorm round later
- Validator functions (k3) and all internal logic work against one stable canonical type regardless of how many LLM-facing shapes exist
- Follows an established, already-proven pattern in this codebase (CliProvider's own transformer approach) rather than inventing a new one

**Cons:**
- More code than a1: one transformer per LLM/consumer combination that fine-tunes the schema, adding a Story-sized chunk of new surface area
- Requires discipline to keep each transformer's output provably reversible into the canonical type, or validator logic could silently diverge from what was actually sent for review

**Cost estimate:** M

### 9.3 a3: Abstract base-class hierarchy mirroring per-review-type subclasses

Locator, Pointer, Feedback and Scope are abstract base classes with a concrete subclass per locator kind / review type, and per-review-type validators are implemented as subclass-overridden methods.

Introduce abstract classes (e.g. `abstract class Locator`, `abstract class Feedback`) with concrete subclasses per kind (SymbolLocator, LineRangeLocator, DocSectionLocator; SecurityFeedback, etc.), and let each review type's validator live as an overridden method on its own Scope/Feedback subclass rather than as a standalone function per k3.

This mirrors classic OOP extension and is the shape later Epic work (e.g. SecurityFeedback inheriting from Feedback, per the approved security-extension-points SPEC) will eventually want on the output side.

**Pros:**
- Gives output-side Feedback/Finding classes (from the already-approved security-extension-points SPEC) a ready-made inheritance chain to slot into later
- Conventional OOP extension point for genuinely open-ended future locator/feedback kinds

**Cons:**
- Directly contradicts k4 and the DEF's own capability-discovery finding: convention.detect found baseClassIdioms: [] in both review-history/ and artifact-core/ -- there is no existing abstract-base-class idiom anywhere in this part of the codebase to extend, so this alternative introduces a brand-new pattern rather than following one
- Class hierarchies carry exactly the same LLM structured-output parsing risk the brainstorm flagged for discriminated unions (SPEC-0add47b5b1f72874), and this alternative has no transformer layer to mitigate it, so it inherits a1's weakness without a1's simplicity

**Cost estimate:** M

**Rejected because:** Violates k3 (replaces the required standalone validator function per review type with subclass-overridden methods) and violates k4 (introduces a new abstract-base-class idiom the DEF's capability-discovery explicitly found absent, baseClassIdioms: []).

## 10. References

- **[[c1]]** `prior-artifact` `SPEC-0add47b5b1f72874` — "docs/standalone/reviewcontext-data-model-design-code-review-E202611170add47b5/SPEC.md"
- **[[c2]]** `analyze-bundle` `capability-discovery: src/workflow/review-history reuse-check + convention.detect` — "0 clear-match / 5 partial-match across 50 candidates; baseClassIdioms: []"
- **[[c3]]** `analyze-bundle` `structural-map: src/workflow/review-history + src/workflow/artifact-core` — "review-history/ topImportees include src/workflow/artifact-core/types.ts and src/workflow/artifact-core/lifecycle.ts; artifact-core/ convention.detect: baseClassIdioms: []"

## 11. Open questions

- STORY-779e9a08142cb057-s1 ('security review extension points', sibling Epic, standalone) proposes a SecurityLocator that extends 'the review framework's Locator/Pointer type' -- but sc1 defines Locator{kind,value} (a region pin within a file) and Pointer{path,section?:Locator,contentHash?} (a file-level reference, optionally carrying a Locator region) as two distinct, structurally unrelated types; SecurityLocator cannot structurally extend both at once. Found during a cross-design review on 2026-11-18/19. Must resolve before that Story's build: does SecurityLocator extend Locator (adding trustBoundaryId/taintPathStepIndex to the region-pin, used inside a Pointer.section), or does a security-graph citation need a separate SecurityPointer wrapping a Locator-compatible region alongside a file path?
- The same sibling Story frames 'security' as 'ONE new review type' running a 'security reviewer pass' within a round. sc3's Scope.scopeType is closed to 'design'|'code' with no third value. Must resolve: does the security pass run nested inside the primary round's existing scopeType (no enum change), or does scopeType need a third 'security' member? This changes Scope's (s2's) implementation structure, not just the sibling Story's.

## Resolved questions

- `qfc8a811e` — STORY-779e9a08142cb057-s1 ('security review extension points', sibling Epic, standalone) proposes a SecurityLocator that extends 'the review framework's Locator/Pointer type' -- but sc1 defines Locator{kind,value} (a region pin within a file) and Pointer{path,section?:Locator,contentHash?} (a file-level reference, optionally carrying a Locator region) as two distinct, structurally unrelated types; SecurityLocator cannot structurally extend both at once. Found during a cross-design review on 2026-11-18/19. Must resolve before that Story's build: does SecurityLocator extend Locator (adding trustBoundaryId/taintPathStepIndex to the region-pin, used inside a Pointer.section), or does a security-graph citation need a separate SecurityPointer wrapping a Locator-compatible region alongside a file path?
  - **resolved**: Introduce SecurityPointer, as a true structural extension of Pointer (interface SecurityPointer extends Pointer), not a wrapper-by-reference. SecurityPointer carries Pointer's own path/section?/contentHash? fields plus the security-specific trustBoundaryId/taintPathStepIndex fields directly, matching this session's established true-inheritance convention (plain interface extension, no wrapping, no class hierarchy) rather than holding a separate Pointer instance by reference. — User's explicit decision: SecurityPointer, not a wrapper but an extended type -- consistent with the plain-interface structural-extension pattern already used for SecurityFinding (extends Finding) elsewhere in this session's sibling Story. _(2026-11-19T07:12:22.494Z)_

## Citations

- **[[c1]]** `prior-artifact` `SPEC-0add47b5b1f72874` — "docs/standalone/reviewcontext-data-model-design-code-review-E202611170add47b5/SPEC.md"
- **[[c2]]** `analyze-bundle` `capability-discovery: src/workflow/review-history reuse-check + convention.detect` — "0 clear-match / 5 partial-match across 50 candidates; baseClassIdioms: []"
- **[[c3]]** `analyze-bundle` `structural-map: src/workflow/review-history + src/workflow/artifact-core` — "review-history/ topImportees include src/workflow/artifact-core/types.ts and src/workflow/artifact-core/lifecycle.ts; artifact-core/ convention.detect: baseClassIdioms: []"

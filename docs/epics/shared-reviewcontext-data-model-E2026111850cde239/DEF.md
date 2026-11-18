<!-- insrc:artifact DEF-50cde239426d6e2a -->

# Epic: shared-reviewcontext-data-model

## Summary

**Flavor:** new-capability
**Seeded from:** `SPEC-0add47b5b1f72874`
**Tracker:** [insors-ai/insrc#195](https://github.com/insors-ai/insrc/issues/195)

This Epic defines a single shared TypeScript data model, ReviewContext, that both design review and code review use to describe what a review attempt covers: which artifact depth and chain it belongs to, what content is in scope to be checked this round, and any free-form context the submitter wants to flag. Today each review type has its own separate, ad hoc notion of these things, duplicated across design-history and code-history structures with no common contract. This Epic delivers only the type/schema and its per-review-type validators -- not the logic that builds a populated instance or wires it into the review tools, which are deferred, tracked follow-on work in the same eventual Epic.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)

## 1. Problem

insrc's review framework -- design review (DEF/HLD/LLD) and code review -- has no shared way to describe what a given review attempt is reviewing, what content is in scope for that attempt, and what additional context the submitter wants to flag, independent of which review type or review depth is in play. The prior review framework is retired and being rewritten (insrc_review_step/insrc_code_review_step currently raise an exception stating they are being rewritten), and the surviving review-history/ structure (~198 entities) encodes review record-keeping separately per review type -- design-review contracts, code-review task-review contracts -- rather than a single reusable model of a review attempt's scope, targets, and comments. Without a common data model, each review type must separately define and validate its own notion of attempt number, in-scope artifact/ancestor chain, reviewable-content pointers, and submitter context -- confirmed by capability discovery (zero clear-match candidates, zero existing abstract-base-class convention) -- which duplicates structure across review kinds and leaves no single typed contract that either review type, at either an epic-chain depth or a standalone depth, can validate a review attempt against.

## 2. Functional requirements

- **E2026111850cde239:FR001** — Define a root-level round field recording which attempt a ReviewContext instance represents. _(Needed for the 3-round review cap.)_
- **E2026111850cde239:FR002** — Define a Scope section identified by independent scopeType and scopeLevel fields, plus named singular/array pointer fields per artifact kind (def/hld/lld/plan single Pointer; tasks a Pointer array), extensible to further named kinds (extension, amendment, ...). _(The (scopeType, scopeLevel) pair selects the validator; per-kind named fields avoid a generic map and support the self-inclusive depth model.)_
- **E2026111850cde239:FR003** — Define a ReviewTargets section as a list of pointer+locator entries naming the content to review, fully reset on every new review round on the same artifact. _(The real set of targets legitimately changes between rounds; a stale carried-forward list would misdirect the reviewer.)_
- **E2026111850cde239:FR004** — Define a Comments section as a flat list of provenance-tagged ({round, party, timestamp, text}) freeform entries, scoped to the same artifact across rounds only. _(Comments is a catchall for context the rest of the model doesn't structurally handle, not a verdict channel.)_
- **E2026111850cde239:FR005** — Define an open/extensible Locator type (symbol name, line range, doc-section id, future kinds) and a Pointer type ({path, section?, contentHash?}) used uniformly across Scope and ReviewTargets. _(Independent concurrent agents need to pin exact changed regions so a reviewer can correlate overlapping impacts, without closing off future locator kinds.)_
- **E2026111850cde239:FR006** — Define a per-review-type validator contract that checks a populated ReviewContext against its declared (scopeType, scopeLevel) pair. _(Each review type needs to enforce exactly which fields must/must-not be populated for its own depth combinations.)_

**s1:**

- **E2026111850cde239:S001:FR001** — Define a Pointer type carrying { path, section?, contentHash? } that references an existing authored file directly. _(A single shared shape lets Scope and ReviewTargets both name content the same way.)_
- **E2026111850cde239:S001:FR002** — Define an open, extensible Locator type for the Pointer's section field. _(New ways of pinning a region (beyond symbol name, line range, doc-section id) must be addable without breaking existing Pointer consumers.)_
- **E2026111850cde239:S001:FR003** — Define a staleness-detection function that compares a Pointer's recorded contentHash against the referenced file's current content. _(Reviewers and validators need one uniform way to tell whether a referenced piece of content has drifted since the Pointer was recorded.)_

**s2:**

- **E2026111850cde239:S002:FR001** — Define Scope with independent scopeType and scopeLevel fields plus named per-artifact-kind pointer fields (def/hld/lld/plan singular, tasks plural). _(The (scopeType, scopeLevel) pair selects the validator; per-kind named fields avoid a generic map.)_
- **E2026111850cde239:S002:FR002** — Define a validator function per review type that checks a populated Scope against its declared (scopeType, scopeLevel) pair. _(Each review type must enforce exactly which fields must/must-not be populated for its own depth combinations.)_

**s3:**

- **E2026111850cde239:S003:FR001** — Define ReviewTargets as a list of { file, section, contentHash } entries naming the content to review this round. _(A floor set of targets, reset each round, keeps the reviewer grounded on what actually changed without biasing or capping their own investigation.)_

**s4:**

- **E2026111850cde239:S004:FR001** — Define a root-level round field on ReviewContext stating the current attempt number. _(Needed for the 3-round review cap.)_
- **E2026111850cde239:S004:FR002** — Define Comments as a flat list of provenance-tagged entries, scoped to the same artifact's review cycle only. _(Comments is a catchall for context the rest of the model doesn't structurally handle, not a cross-artifact or verdict channel.)_

## 3. Non-goals

- **Building the per-depth construction/population logic that assembles a populated ReviewContext at each review depth (DEF-only, DEF+HLD, DEF+HLD+LLD+PLAN+Task)** — Deferred, tracked follow-on work intended to land in the same eventual Epic, not this data-model Epic.
- **Wiring ReviewContext into insrc_review_step / insrc_code_review_step** — Deferred, tracked follow-on work intended to land in the same eventual Epic, not this data-model Epic.
- **Pre-digesting review content into ready-made analysis for the reviewer** — The reviewer must re-derive findings from the referenced source itself; context sections are pointers, not conclusions.
- **Framework-authored verdict/severity/dimension fields carried over on Comments entries from a prior round** — Any verdict is re-formed fresh by the reviewer each round, never trusted from a prior round's label.

## 4. Assumptions

- `high` The prior review framework (insrc_review_step/insrc_code_review_step) is fully retired/being rewritten, so this ReviewContext model is not required to preserve backward compatibility with its prior invocation shape. [[c1]]
- `high` review-history/'s ~198 surviving entities are legacy per-review-type record-keeping structure, not a shared base type this Epic extends. [[c2]]
- `high` The per-depth construction/population logic and the wiring into insrc_review_step/insrc_code_review_step are tracked as deferred follow-on work within the same eventual Epic as this data model. [[c1]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | Every ReviewContext artifact-kind field (def/hld/lld/plan/tasks, extension/amendment, and future kinds) is independently named and typed; no field is folded into or widens an existing kind's field, and none are genericized into a map. | [[c1]] |
| `k2` | contract | A Pointer carries { path, section?, contentHash? } and references the existing authored file directly (DEF.md/HLD.md/source files); no generated extract/summary file is produced for review consumption. | [[c1]] |
| `k3` | invariant | A dedicated validator function per review type enforces exactly which fields must/must-not be populated for a given (scopeType, scopeLevel) pair; validation happens in the controller/caller before the context is sent for review. | [[c1]] |
| `k4` | convention | No existing abstract-base-class convention exists in review-history/ to extend (baseClassIdioms: []). | [[c2]] |
| `k5` | invariant | A Pointer's optional contentHash, when present, is checked against the referenced file's current content via one staleness-detection function shared by every Pointer consumer (Scope and ReviewTargets alike); a mismatch reports the Pointer stale. | [[c1]] |

## 6. Stories

### 6.1 STORY-50cde239426d6e2a-s1 — Pointer and Locator as the shared building blocks for naming content

**User value:** `size: M`

So that every part of ReviewContext that names a piece of content does so the same way, letting reviewers and validators reason uniformly about staleness and the exact region in play.

**Acceptance criteria:**

- **ac1:** Given a Pointer references an existing authored file (a DEF/HLD/LLD/source file) with an attached section locator, when the Pointer is used to name a piece of content, then it identifies both the file and an exact region without the framework generating any extract or summary file for it. _(operationalizes `k2`)_
- **ac2:** Given a new kind of locator is introduced later (beyond symbol name, line range, or doc-section id), when existing code that consumes a Locator encounters an instance of the new kind, then it is not required to be rewritten, because Locator stays an open, extensible type rather than a closed union. _(operationalizes `lc1`)_
- **ac3:** Given a Pointer carries a contentHash recorded at the time it was built, and the file it names has since changed, when the Pointer's contentHash is compared against the referenced file's current content, then the comparison reports the Pointer stale, uniformly regardless of which section (Scope or ReviewTargets) the Pointer appears in. _(operationalizes `lc8`)_

**Local constraints:**

- `lc1` (invariant) Locator is an open, extensible type (symbol name, line range, doc-section id, and future kinds), not a closed union. [[c1]]
- `lc8` (invariant) A Pointer's optional contentHash, when present, is checked against the referenced file's current content via one staleness-detection function shared by every Pointer consumer (Scope and ReviewTargets alike); a mismatch reports the Pointer stale. [[c1]]

### 6.2 STORY-50cde239426d6e2a-s2 — Scope describes which depth and chain a review attempt belongs to, including the artifact under review itself

**User value:** `size: L`

So that a single validator per review type can check exactly the right fields are populated for the review's actual depth, and the reviewer always knows which artifact is being reviewed, not just its ancestors.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given a review attempt declares its scopeType and scopeLevel, when Scope's artifact-kind fields are populated, then each named kind (def/hld/lld/plan/tasks and any future named kind such as extension or amendment) is independently typed and never folded into another kind's field. _(operationalizes `k1`)_
- **ac2:** Given an HLD review in progress, when Scope is populated for that review, then the hld field names the HLD actually under review, not merely ancestor context, matching the self-inclusive depth model. _(operationalizes `lc2`)_
- **ac3:** Given a populated ReviewContext with a declared (scopeType, scopeLevel) pair, when the controller validates it before sending it for review, then the dedicated validator function for that review type accepts it only if exactly the fields valid for that pair are populated. _(operationalizes `k3`)_

**Local constraints:**

- `lc2` (invariant) Scope's deepest-populated field at a given depth is the artifact under review itself, self-inclusive, not only ancestor context. [[c1]]

### 6.3 STORY-50cde239426d6e2a-s3 — ReviewTargets names the current round's reviewable content, owned solely by the submitter

**User value:** `size: M`

So that the reviewer starts from a concrete, current floor of what changed, while remaining free to dig further, and is never misled by stale targets carried over from an earlier round.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given a new review round starts on the same artifact, when ReviewTargets is built for that round, then it is populated fresh from the current real set of targets with no entries merged or carried forward from the previous round. _(operationalizes `lc3`)_
- **ac2:** Given ReviewTargets lists a floor set of file/section entries, when the reviewer investigates the review, then the reviewer is free to fetch and examine any file or region beyond that list, including unchanged files. _(operationalizes `lc4`)_

**Local constraints:**

- `lc3` (invariant) ReviewTargets is fully reset, not merged or carried forward, on every new review round on the same artifact. [[c1]]
- `lc4` (invariant) ReviewTargets entries carry no origin metadata; the reviewer never adds to the list and is always free to investigate beyond it. [[c1]]

### 6.4 STORY-50cde239426d6e2a-s4 — Comments carries the submitter's freeform context and round tracking across repeated rounds on the same artifact

**User value:** `size: M`

So that the submitter can flag edge cases the rest of the model doesn't structurally handle, and both submitter and reviewer can tell which round produced which comment, without any trusted verdict being carried forward.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given a ReviewContext instance is built for a new review attempt, when the instance is assembled, then its root-level round field states which attempt this instance represents. _(operationalizes `lc5`)_
- **ac2:** Given a Comments entry is added, when it is recorded, then it carries round, party, timestamp and text as first-class fields with no verdict, severity or dimension field. _(operationalizes `lc6`)_
- **ac3:** Given an HLD review follows a DEF review in the same chain, when the HLD review's Comments is populated, then it does not include the DEF review's comments, because Comments is scoped same-artifact-only across the chain. _(operationalizes `lc7`)_

**Local constraints:**

- `lc5` (invariant) ReviewContext carries an explicit root-level round field stamped by the framework for each new attempt. [[c1]]
- `lc6` (invariant) A Comments entry's first-class fields are {round, party, timestamp, text}, with no verdict/severity/dimension carried over from a prior round's output. [[c1]]
- `lc7` (invariant) Comments is scoped same-artifact only across the chain; comments from a different artifact in the same chain do not carry over. [[c1]]

## 7. References

- **[[c1]]** `prior-artifact` `SPEC-0add47b5b1f72874` — "docs/standalone/reviewcontext-data-model-design-code-review-E202611170add47b5/SPEC.md"
- **[[c2]]** `analyze-bundle` `capability-discovery: src/workflow/review-history reuse-check + convention.detect` — "0 clear-match / 5 partial-match across 50 candidates; baseClassIdioms: []"

## Citations

- **[[c1]]** `prior-artifact` `SPEC-0add47b5b1f72874` — "docs/standalone/reviewcontext-data-model-design-code-review-E202611170add47b5/SPEC.md"
- **[[c2]]** `analyze-bundle` `capability-discovery: src/workflow/review-history reuse-check + convention.detect` — "0 clear-match / 5 partial-match across 50 candidates; baseClassIdioms: []"

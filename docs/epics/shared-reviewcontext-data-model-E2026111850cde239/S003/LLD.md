<!-- insrc:artifact LLD-50cde239426d6e2a-s3 -->

# LLD: STORY-50cde239426d6e2a-s3 — ReviewTargets names the current round's reviewable content, owned solely by the submitter

## Summary

**Epic:** `shared-reviewcontext-data-model`
**HLD base run:** `wf-1794984468539-8trvyt`
**HLD effective hash:** `720f2f3adc55...`
**Tracker:** [insors-ai/insrc#199](https://github.com/insors-ai/insrc/issues/199)

This Story defines ReviewTargets, the submitter-owned list naming exactly the content to review this round. It is deliberately minimal: a single readonly list of Pointer entries, rebuilt fresh every round with no builder or merge function of any kind, so there is no API surface that could ever merge or carry forward a prior round's targets.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

> See **HLD-50cde239426d6e2a** § 2. Framework summary

**Rollout phase:** Phase B — Scope, ReviewTargets and Comments types
**Owns:** `sc4` (ReviewTargets)
**Consumes:** `sc1` (Locator + Pointer), `sc2` (Pointer staleness check), `sc6` (Pointer path validation)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The specific set of currently-known LocatorKind string literals (symbol/lineRange/docSection) is s1's own enumeration; because every consumer treats `Locator.kind` as an opaque string rather than exhaustively switching on a closed union, s1 can add a new literal later without forcing s2/s3/s4 to change, satisfying ac2/lc1. — owns `sc1`, `sc2`, `sc6`
- `s2`: Which named artifact-kind fields Scope carries beyond def/hld/lld/plan/tasks (e.g. a future named kind) and the exact per-review-type ScopeValidator implementations are s2's own; no other Story's type depends on Scope, since nothing in the Epic's Story graph consumes s2. — owns `sc3`
- `s4`: CommentEntry does not reference Pointer/Locator at all, so s4 needs neither sc1 nor sc2. The round-stamping mechanics (how a new attempt's round number is assigned) and the same-artifact-only scoping of Comments across a chain stay internal to s4; the full ReviewContext container embedding Scope and ReviewTargets alongside round/comments is explicitly deferred (Epic Non-Goals), since no Story in this graph depends on all of s2, s3 and s4 together. — owns `sc5`

## 2. Contract details

**Surface level:** internal-shared

## 3. Data model changes

### 3.1 `ReviewTargets` — new

interface ReviewTargets { readonly entries: readonly Pointer[] }, exactly as sc4's interfaceSketch. entries is rebuilt fresh every round from that round's real target set; this Story provides no builder, factory or merge function -- a caller constructs a fresh object literal each round. Entries carry no origin metadata beyond what Pointer itself already carries (per lc4), and the reviewer is never restricted to only these entries (per ac2). Lands in src/workflow/artifact-core/types.ts alongside sc1/sc2/sc3's types.

**Call sites:**
- `src/workflow/artifact-core/types.ts`

## 4. Diagrams

- [ER model](docs/epics/shared-reviewcontext-data-model-E2026111850cde239/S003/er-model.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | This Story is sc4's owner; ReviewTargets is implemented exactly as sc4's interfaceSketch, with zero additional API surface. |
| `sc1` | consumes | ReviewTargets.entries is typed as readonly Pointer[] exactly as sc1 publishes Pointer; this Story does not redesign Locator or Pointer. |
| `sc2` | consumes | This Story does not call PointerStalenessCheck itself; it simply ensures entries stays structurally compatible with sc2's PointerStalenessCheck signature for whichever caller later runs that check per-entry. |
| `sc6` | consumes | ReviewTargets carries no validator of its own (a1's deliberate choice); the caller that assembles a ReviewTargets is responsible for running sc6's PointerPathValidator (owned by s1) against each entry before sending it for review, the same caller-invoked pattern this Story already documents for sc2's PointerStalenessCheck. Closes a gap a cross-LLD review found: previously nothing named this responsibility for ReviewTargets' entries at all. |

## 6. Error paths

**Error cases**

- **A caller concatenates or spreads the previous round's ReviewTargets.entries into the new round's array before constructing the new ReviewTargets, instead of building purely from the current round's real target set.** (recoverable)
  - Detection: None exists in this Story's own surface: ReviewTargets' type accepts any readonly Pointer[] value, and there is no field, flag or function that could distinguish a freshly-sourced array from one that includes carried-over entries.
  - Response: Not caught by this Story's contract at all -- lc3/ac1 are enforced entirely by controller discipline outside ReviewTargets' own boundary, since the smallest-shape alternative (a1) deliberately provides no builder or merge-detection mechanism.
  - User impact: A caller that violates lc3 would silently produce a ReviewTargets that looks structurally identical to a correctly-built one; no error surfaces at the type level.
- **A Pointer inside entries names a path that no longer exists (e.g. deleted since this round's target set was computed).** (recoverable)
  - Detection: ReviewTargets performs no I/O and no existence check -- it is a plain data holder with no behavior of its own.
  - Response: Out of this Story's scope: sourcing entries correctly from 'the current real set of targets' is the caller's responsibility; any resulting file-read failure surfaces wherever a consumer later reads that Pointer's path, not inside ReviewTargets.
  - User impact: None directly from this Story's types.
- **A Pointer inside entries carries a path that would resolve outside the registered repo root (e.g. containing '..' segments).** (recoverable)
  - Detection: ReviewTargets itself performs no check (it is a plain data holder); detection is the caller's responsibility, by running sc6's PointerPathValidator against each entry before sending the ReviewTargets for review -- the same caller-invoked pattern this Story already uses for sc2's PointerStalenessCheck.
  - Response: Not caught by ReviewTargets' own type, by design (mirrors sc2's caller-invoked pattern). Closes a gap a cross-LLD review found: previously no Story's LLD named this responsibility for ReviewTargets' entries at all; the caller must now call sc6's PointerPathValidator per entry, exactly as it is expected to call sc2's PointerStalenessCheck per entry.
  - User impact: A caller that skips running PointerPathValidator on ReviewTargets' entries could still send an escaping Pointer for review; the Story's own contract makes this an explicit caller responsibility rather than silently unaddressed.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| entries is an empty array (e.g. a round where no files actually changed, such as a metadata-only edit). | Valid -- ReviewTargets with zero entries is structurally fine; ac2 still lets the reviewer investigate any file or region freely regardless of how many entries the floor set names. |
| entries contains the same Pointer (same path and section) listed twice. | Accepted without special-casing -- sc4's interfaceSketch does not forbid duplicate entries, and this Story introduces no deduplication logic. |
| entries mixes whole-file Pointers (no section) with region-pinned Pointers (section populated). | Both accepted -- Pointer's own optional section field governs this per sc1, and ReviewTargets places no constraint on which of its entries carry a section. |

## 7. Test strategy

**Test framework:** `node:test (tsx --test)`

**Test levels**

- **unit** — Verify ReviewTargets holds exactly the current round's entries with no merge/carry-forward capability anywhere in its surface.
  - Subjects: `a ReviewTargets built from a fresh Pointer list contains exactly those entries, nothing else`, `no builder, factory or merge function exists anywhere in ReviewTargets' exported surface (a1's deliberate absence of such an API)`, `two ReviewTargets instances built for consecutive rounds on the same artifact are independent objects sharing no entries by construction`
  - Fixtures: `sample Pointer fixtures reused from Story s1`, `two distinct Pointer lists representing two different rounds' real target sets`
- **unit** — Verify ReviewTargets places no structural restriction on what a reviewer may investigate beyond its entries.
  - Subjects: `ReviewTargets' exported surface contains no validator, allow-list or restriction function of any kind that could cap investigation to entries`, `a ReviewTargets with zero entries is structurally valid`
  - Fixtures: `a ReviewTargets fixture with an empty entries array`
- **unit** — Verify ReviewTargets accepts the documented unusual-but-valid entry shapes without special-casing.
  - Subjects: `entries with a duplicate Pointer (same path and section) is accepted`, `entries mixing whole-file Pointers (no section) and region-pinned Pointers (section populated) is accepted`
  - Fixtures: `Pointer fixtures with and without a section`
- **contract** — Verify ReviewTargets' entries remain structurally compatible with sc6's PointerPathValidator, mirroring the existing sc2 PointerStalenessCheck compatibility check this Story already runs, so a caller can validate every entry's path before sending ReviewTargets for review (closes the cross-LLD security gap).
  - Subjects: `every ReviewTargets.entries[] Pointer can be passed directly to sc6's PointerPathValidator with no reshaping`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `a ReviewTargets built from a fresh Pointer list contains exactly those entries, nothing else`, `no builder, factory or merge function exists anywhere in ReviewTargets' exported surface (a1's deliberate absence of such an API)`, `two ReviewTargets instances built for consecutive rounds on the same artifact are independent objects sharing no entries by construction` |
| `ac2` | `ReviewTargets' exported surface contains no validator, allow-list or restriction function of any kind that could cap investigation to entries` |

## 8. Alternatives considered

### 8.1 a1: Bare ReviewTargets interface exactly as sketched, no accompanying API — **CHOSEN**

ReviewTargets{entries: readonly Pointer[]} exactly as sc4's interfaceSketch, with no builder, factory or merge function of any kind -- the 'reset each round, never merged' rule (lc3) is a controller-usage discipline this Story documents but does not enforce through extra API surface.

Define interface ReviewTargets { readonly entries: readonly Pointer[] } and nothing else. A caller builds a new ReviewTargets each round by constructing a fresh object literal from that round's real target set; there is no exported function to call, no state ReviewTargets itself tracks across rounds, and no mechanism this Story provides to merge two ReviewTargets instances together (none exists to misuse).

### 8.2 a2: A buildReviewTargets factory function wrapping the entries array

Add a buildReviewTargets(pointers: readonly Pointer[]) => ReviewTargets factory that every caller is expected to use each round, instead of constructing the object literal directly.

Export a function buildReviewTargets that takes this round's real Pointer list and returns a ReviewTargets wrapping it, with no other behavior -- callers would use this function rather than writing the object literal themselves.

**Rejected because:** Satisfies every ac/sc/k constraint but scores only partial on sc4 for adding a pass-through buildReviewTargets builder that sc4's own interfaceSketch does not publish or require, with no real behavioral guarantee since a caller can still bypass it.

### 8.3 a3: A mergeReviewTargets function combining a new round's entries with the previous round's

Export a mergeReviewTargets(previous: ReviewTargets, next: ReviewTargets) => ReviewTargets that unions or appends entries across rounds instead of discarding the previous round's list.

Provide a function that takes the prior round's ReviewTargets and the new round's raw entries and produces a combined ReviewTargets carrying both.

**Rejected because:** Violates ac1 and sc4 directly by providing a mergeReviewTargets capability that lc3 and sc4's own interfaceSketch comment explicitly forbid.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 capability-discovery bundle on ReviewTargets naming and its landing module` — "grep for 'interface ReviewTargets' across src/ returned zero hits ... src/workflow/artifact-core/types.ts exists ... and is the confirmed landing module."
- **[[c2]]** `analyze-bundle` `s1 capability-discovery bundle reused from the Epic-level ReviewContext capability-discovery pass` — "Zero clear-match; 5 partial-match are each separate per-review-type legacy contracts/types ... baseClassIdioms: []."

## Citations

- **[[c1]]** `analyze-bundle` `s1 capability-discovery bundle on ReviewTargets naming and its landing module` — "grep for 'interface ReviewTargets' across src/ returned zero hits ... src/workflow/artifact-core/types.ts exists ... and is the confirmed landing module."
- **[[c2]]** `analyze-bundle` `s1 capability-discovery bundle reused from the Epic-level ReviewContext capability-discovery pass` — "Zero clear-match; 5 partial-match are each separate per-review-type legacy contracts/types ... baseClassIdioms: []."

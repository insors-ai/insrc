<!-- insrc:artifact LLD-50cde239426d6e2a-s4 -->

# LLD: STORY-50cde239426d6e2a-s4 — Comments carries the submitter's freeform context and round tracking across repeated rounds on the same artifact

## Summary

**Epic:** `shared-reviewcontext-data-model`
**HLD base run:** `wf-1794984468539-8trvyt`
**HLD effective hash:** `720f2f3adc55...`
**Tracker:** [insors-ai/insrc#200](https://github.com/insors-ai/insrc/issues/200)

This Story defines CommentEntry and ReviewContextRound: a flat, provenance-tagged freeform-context record and the explicit root-level round field every review attempt stamps. CommentEntry deliberately carries no verdict, severity or dimension field -- it is a catchall for context the rest of the model doesn't structurally handle, never a channel for trusted review output.

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
**Owns:** `sc5` (CommentEntry + round)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The specific set of currently-known LocatorKind string literals (symbol/lineRange/docSection) is s1's own enumeration; because every consumer treats `Locator.kind` as an opaque string rather than exhaustively switching on a closed union, s1 can add a new literal later without forcing s2/s3/s4 to change, satisfying ac2/lc1. — owns `sc1`, `sc2`
- `s2`: Which named artifact-kind fields Scope carries beyond def/hld/lld/plan/tasks (e.g. a future named kind) and the exact per-review-type ScopeValidator implementations are s2's own; no other Story's type depends on Scope, since nothing in the Epic's Story graph consumes s2. — owns `sc3`
- `s3`: ReviewTargets' own reset-on-new-round mechanics (how the entries list is rebuilt rather than merged) stay internal to s3; no other Story's type depends on ReviewTargets. — owns `sc4`

## 2. Contract details

**Surface level:** internal-shared

## 3. Data model changes

### 3.1 `CommentParty` — new

type CommentParty = 'submitter' | 'reviewer', exactly as sc5's interfaceSketch. A closed two-value union (unlike Locator's open kind) since only these two parties exist in the converged review process.

**Call sites:**
- `src/workflow/artifact-core/types.ts`

### 3.2 `CommentEntry` — new

interface CommentEntry { readonly round: number; readonly party: CommentParty; readonly timestamp: string; readonly text: string }, exactly as sc5's interfaceSketch. No verdict/severity/dimension field exists anywhere on this type (per lc6) -- it is a pure freeform-context record. round is a first-class field on every entry, independent of how entries happen to be stored in a container.

**Call sites:**
- `src/workflow/artifact-core/types.ts`

### 3.3 `ReviewContextRound` — new

interface ReviewContextRound { readonly round: number; readonly comments: readonly CommentEntry[] }, exactly as sc5's interfaceSketch. round is the root-level field stamped once per new review attempt (lc5/ac1); comments is same-artifact-only across the chain (lc7/ac3) by assembly discipline -- this Story's types carry no field that could leak a different artifact's comments in, since there is none to populate incorrectly from.

**Call sites:**
- `src/workflow/artifact-core/types.ts`

## 4. Diagrams

- [ER model](docs/epics/shared-reviewcontext-data-model-E2026111850cde239/S004/er-model.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc5` | implements | This Story is sc5's owner; CommentParty, CommentEntry and ReviewContextRound are implemented exactly as sc5's interfaceSketch, with zero additional fields. |

## 6. Error paths

**Error cases**

- **A CommentEntry's round value does not match the containing ReviewContextRound's own round (e.g. a stale comment from an earlier round is accidentally included in a later round's comments array).** (recoverable)
  - Detection: None exists in this Story's own surface: ReviewContextRound.comments accepts any readonly CommentEntry[] value, and there is no cross-check function comparing each entry's round against the container's round.
  - Response: Not caught by this Story's contract at all -- consistency between an entry's own round and its container's round is a controller-assembly discipline, not something these plain data types enforce.
  - User impact: A caller that populates comments incorrectly would silently produce a ReviewContextRound with internally inconsistent round values; no error surfaces at the type level.
- **Comments from a different artifact in the same review chain are included in a ReviewContextRound's comments array (an lc7 violation).** (recoverable)
  - Detection: None exists in this Story's own surface: CommentEntry carries no artifactId or other scoping field (a2's such a field was rejected as reaching into the deferred container assembly's scope), so there is nothing in CommentEntry itself that could distinguish a same-artifact comment from a cross-artifact one.
  - Response: Not caught by this Story's contract -- lc7's same-artifact-only scoping is enforced entirely by the (not-yet-built) controller assembly logic that decides which comments to read when building a ReviewContextRound, not by anything CommentEntry or ReviewContextRound carry.
  - User impact: A caller that violates lc7 would silently produce a ReviewContextRound with cross-artifact comments mixed in; no error surfaces at the type level.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A CommentEntry.party value outside the closed CommentParty union ('submitter' \| 'reviewer'). | Rejected at compile time by TypeScript's own type checker -- unlike Locator.kind (an intentionally open LocatorKind \| string), CommentParty is a closed two-value union since only these two parties exist in the converged review process; there is no runtime path for a third value to reach this field. |
| A ReviewContextRound with an empty comments array. | Valid -- a round with no freeform comments recorded is structurally fine; comments is purely additive context, never required. |
| Multiple CommentEntry values in the same round, one from 'submitter' and one from 'reviewer', with identical timestamps. | Accepted without special-casing -- nothing in this Story's types deduplicates or orders entries by timestamp or party; both are recorded as distinct entries. |
| A CommentEntry.text that is an empty string. | Structurally valid -- text has no minimum-length constraint in sc5's interfaceSketch, and this Story introduces none. |

## 7. Test strategy

**Test framework:** `node:test (tsx --test)`

**Test levels**

- **unit** — Verify ReviewContextRound's root-level round field states the current attempt.
  - Subjects: `a ReviewContextRound built for attempt N carries round=N at the root level`
  - Fixtures: `ReviewContextRound fixtures for several round numbers`
- **unit** — Verify CommentEntry carries exactly round/party/timestamp/text with no verdict/severity/dimension channel.
  - Subjects: `a CommentEntry carries round, party, timestamp and text as first-class fields`, `CommentEntry's exported shape contains no verdict, severity or dimension field of any kind`, `a CommentEntry.party value outside 'submitter'|'reviewer' is rejected at compile time (type-level check, not a runtime test)`
  - Fixtures: `CommentEntry fixtures for both CommentParty values`
- **unit** — Verify CommentEntry/ReviewContextRound carry no field that could leak a different artifact's comments into a round (ac3's structural guarantee).
  - Subjects: `CommentEntry's and ReviewContextRound's exported shapes contain no artifactId or other cross-artifact scoping field of any kind`
- **unit** — Verify the documented unusual-but-valid edge cases are accepted without special-casing.
  - Subjects: `a ReviewContextRound with an empty comments array is structurally valid`, `multiple CommentEntry values in the same round from different parties with identical timestamps are both recorded`, `a CommentEntry.text that is an empty string is structurally valid`
  - Fixtures: `CommentEntry fixtures with identical timestamps`, `a ReviewContextRound fixture with zero comments`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `a ReviewContextRound built for attempt N carries round=N at the root level` |
| `ac2` | `a CommentEntry carries round, party, timestamp and text as first-class fields`, `CommentEntry's exported shape contains no verdict, severity or dimension field of any kind` |
| `ac3` | `CommentEntry's and ReviewContextRound's exported shapes contain no artifactId or other cross-artifact scoping field of any kind` |

## 8. Alternatives considered

### 8.1 a1: CommentEntry + ReviewContextRound exactly as sketched, no extra fields — **CHOSEN**

CommentParty/CommentEntry/ReviewContextRound implemented exactly per sc5's interfaceSketch -- round/party/timestamp/text only, with no artifactId or other scoping field; same-artifact-only scoping (lc7) is a controller-assembly discipline, not a field this type carries.

Define type CommentParty = 'submitter' | 'reviewer', interface CommentEntry { round, party, timestamp, text }, and interface ReviewContextRound { round, comments: readonly CommentEntry[] }. Nothing else. A caller only ever populates comments from the current artifact's own prior comments when assembling a ReviewContextRound; which artifact a given round belongs to is carried by the surrounding (deferred) ReviewContext container, not by CommentEntry itself.

### 8.2 a2: Add an explicit artifactId field to CommentEntry for self-documented scoping

Add a readonly artifactId: string field to CommentEntry so each comment structurally self-documents which artifact's chain it belongs to, instead of relying purely on assembly discipline for lc7.

Extend CommentEntry with an artifactId field (e.g. the artifact's Pointer path or id) alongside round/party/timestamp/text, so a comment carries its own scoping information.

**Rejected because:** Satisfies every ac but scores only partial on sc5 for adding an artifactId field sc5's own interfaceSketch does not publish, reaching into the deferred ReviewContext container assembly's own scope (an Epic Non-Goal).

### 8.3 a3: Nest comments in a map keyed by round number instead of a flat list with per-entry round

Replace ReviewContextRound.comments: readonly CommentEntry[] (with round on every entry) with a Record<number, CommentEntry[]> keyed by round, dropping the per-entry round field as redundant with the key.

Store comments as a map from round number to that round's CommentEntry list, removing CommentEntry.round since the map key already states which round a comment belongs to.

**Rejected because:** Violates ac2, sc5 and k1 by dropping CommentEntry.round as a first-class entry-level field in favor of a round-keyed map, echoing the genericized-map smell k1 already warns against for Scope.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 capability-discovery bundle on CommentEntry naming and its landing module` — "grep for 'interface CommentEntry', 'interface ReviewContextRound', and 'type CommentParty' across src/ returned zero hits."
- **[[c2]]** `analyze-bundle` `s1 capability-discovery bundle reused from the Epic-level ReviewContext capability-discovery pass` — "Zero clear-match; 5 partial-match are each separate per-review-type legacy contracts/types ... baseClassIdioms: []."

## Citations

- **[[c1]]** `analyze-bundle` `s1 capability-discovery bundle on CommentEntry naming and its landing module` — "grep for 'interface CommentEntry', 'interface ReviewContextRound', and 'type CommentParty' across src/ returned zero hits."
- **[[c2]]** `analyze-bundle` `s1 capability-discovery bundle reused from the Epic-level ReviewContext capability-discovery pass` — "Zero clear-match; 5 partial-match are each separate per-review-type legacy contracts/types ... baseClassIdioms: []."

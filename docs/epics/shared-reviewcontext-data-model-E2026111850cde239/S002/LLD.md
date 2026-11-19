<!-- insrc:artifact LLD-50cde239426d6e2a-s2 -->

# LLD: STORY-50cde239426d6e2a-s2 — Scope describes which depth and chain a review attempt belongs to, including the artifact under review itself

## Summary

**Epic:** `shared-reviewcontext-data-model`
**HLD base run:** `wf-1794984468539-8trvyt`
**HLD effective hash:** `720f2f3adc55...`
**Tracker:** [insors-ai/insrc#198](https://github.com/insors-ai/insrc/issues/198)

This Story defines Scope, the type that names which review family (design or code) and which chain depth (def through hld/lld/plan/tasks) a review attempt covers, self-inclusive at the artifact actually under review. It also defines the per-review-type validator contract: two dedicated ScopeValidator instances, validateDesignScope and validateCodeScope, each enforcing exactly which named fields must or must not be populated for a given (scopeType, scopeLevel) pair, sharing one proven self-inclusive-chain comparison rather than duplicating it.

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
10. [Open questions](#10-open-questions)

## 1. HLD context

> See **HLD-50cde239426d6e2a** § 2. Framework summary

**Rollout phase:** Phase B — Scope, ReviewTargets and Comments types
**Owns:** `sc3` (Scope)
**Consumes:** `sc1` (Locator + Pointer), `sc2` (Pointer staleness check), `sc6` (Pointer path validation)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The specific set of currently-known LocatorKind string literals (symbol/lineRange/docSection) is s1's own enumeration; because every consumer treats `Locator.kind` as an opaque string rather than exhaustively switching on a closed union, s1 can add a new literal later without forcing s2/s3/s4 to change, satisfying ac2/lc1. — owns `sc1`, `sc2`, `sc6`
- `s3`: ReviewTargets' own reset-on-new-round mechanics (how the entries list is rebuilt rather than merged) stay internal to s3; no other Story's type depends on ReviewTargets. — owns `sc4`
- `s4`: CommentEntry does not reference Pointer/Locator at all, so s4 needs neither sc1 nor sc2. The round-stamping mechanics (how a new attempt's round number is assigned) and the same-artifact-only scoping of Comments across a chain stay internal to s4; the full ReviewContext container embedding Scope and ReviewTargets alongside round/comments is explicitly deferred (Epic Non-Goals), since no Story in this graph depends on all of s2, s3 and s4 together. — owns `sc5`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `ScopeValidator`

```typescript
type ScopeValidator = (scope: Scope, registeredRepoRoot: string) => ValidationResult
```

**Parameters:**
- `scope: Scope` — The populated Scope to check against its own declared (scopeType, scopeLevel) pair.
- `registeredRepoRoot: string` — The absolute path sc6's PointerPathValidator resolves each populated Pointer-typed field against. Threaded through from the caller (the controller or whoever assembles the review) rather than read from any global/process state, so the function stays a pure mapping of its own arguments.

**Returns:** `ValidationResult` — {ok, violations}: whether exactly the fields valid for this Scope's (scopeType, scopeLevel) pair are populated, and a human-readable violation per field that is wrongly present or wrongly absent.

**Postconditions:**
- The function is pure: it only reads scope's own fields and returns a result; it performs no I/O and mutates nothing.

### 2.2 `validateDesignScope`

```typescript
const validateDesignScope: ScopeValidator
```

**Parameters:**
- `scope: Scope` — A Scope whose scopeType is expected to be 'design'.
- `registeredRepoRoot: string` — Passed straight through to sc6's PointerPathValidator for every populated Pointer-typed field.

**Returns:** `ValidationResult` — ok:false with a violation naming the mismatch if scope.scopeType is not 'design'; otherwise checks the def/hld/lld self-inclusive chain for scope.scopeLevel. As of this revision, also calls sc6's PointerPathValidator against every populated Pointer-typed field (def/hld/lld/plan/tasks/extension/amendment), closing the repo-root-escape gap a cross-LLD review found; a violation from that check is folded into the same violations array.

### 2.3 `validateCodeScope`

```typescript
const validateCodeScope: ScopeValidator
```

**Parameters:**
- `scope: Scope` — A Scope whose scopeType is expected to be 'code'.
- `registeredRepoRoot: string` — Passed straight through to sc6's PointerPathValidator for every populated Pointer-typed field.

**Returns:** `ValidationResult` — ok:false with a violation naming the mismatch if scope.scopeType is not 'code'; otherwise checks the def/hld/lld/plan/tasks self-inclusive chain for scope.scopeLevel. As of this revision, also calls sc6's PointerPathValidator against every populated Pointer-typed field (def/hld/lld/plan/tasks/extension/amendment), closing the repo-root-escape gap a cross-LLD review found; a violation from that check is folded into the same violations array.

## 3. Data model changes

### 3.1 `Scope` — new

interface Scope { readonly scopeType: ScopeType; readonly scopeLevel: ScopeLevel; readonly def?: Pointer; readonly hld?: Pointer; readonly lld?: Pointer; readonly plan?: Pointer; readonly tasks?: readonly Pointer[]; readonly extension?: Pointer; readonly amendment?: Pointer } where ScopeType = 'design' | 'code' and ScopeLevel = 'def' | 'hld' | 'lld' | 'plan' | 'task'. Every named kind is its own independently-typed field (never a generic map), matching k1. Lands in src/workflow/artifact-core/types.ts alongside sc1's Locator/Pointer.

**Call sites:**
- `src/workflow/artifact-core/types.ts`

### 3.2 `ValidationResult` — new

interface ValidationResult { readonly ok: boolean; readonly violations: readonly string[] }, returned by every ScopeValidator. Lands beside Scope in src/workflow/artifact-core/types.ts.

**Call sites:**
- `src/workflow/artifact-core/types.ts`

### 3.3 `ScopeFieldRequirement (internal)` — new

A private, declarative data shape (not exported as part of sc3's public surface) mapping each valid (scopeType, scopeLevel) pair to which of Scope's named fields must be populated (the self-inclusive chain up to and including the review's own depth) and which must be absent (anything deeper than the review's own scopeLevel). validateDesignScope and validateCodeScope each read their own slice of this table through one shared internal comparison function.

**Call sites:**
- `src/workflow/artifact-core/types.ts`

## 4. Diagrams

- [ER model](docs/epics/shared-reviewcontext-data-model-E2026111850cde239/S002/er-model.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | This Story is sc3's owner; Scope, ScopeType, ScopeLevel, ScopeValidator and ValidationResult are implemented exactly as sc3's interfaceSketch, with validateDesignScope/validateCodeScope as the two required 'one per review type' instances. |
| `sc1` | consumes | Scope's def/hld/lld/plan/extension/amendment fields and tasks array are typed as Pointer/readonly Pointer[] exactly as sc1 publishes Pointer; this Story does not redesign Locator or Pointer. |
| `sc2` | consumes | This Story does not call PointerStalenessCheck itself (Scope's validators check field presence/shape, not content freshness); it simply ensures Scope's Pointer-typed fields remain structurally compatible with sc2's PointerStalenessCheck signature for whichever caller later runs that check. |
| `sc6` | consumes | validateDesignScope and validateCodeScope each take registeredRepoRoot as their second parameter and call sc6's PointerPathValidator (owned by s1) against every populated Pointer-typed field before returning ok:true, closing the gap a cross-LLD review found: this Story's ScopeValidators previously checked only field presence/absence, never the repo-root-escape security property sc1's own nonFunctional note requires somewhere. The second parameter was added by a build-stage amendment: ScopeValidator's original single-argument sketch gave the validators no real root to check against, and a fixed/synthetic root is provably exploitable (a Pointer.path crafted to reuse that root's own last segment resolves back inside it while still escaping the real repo). |

## 6. Error paths

**Error cases**

- **validateDesignScope is called on a Scope whose scopeType is actually 'code' (or vice versa for validateCodeScope).** (recoverable)
  - Detection: The validator reads scope.scopeType first and compares it against the one literal value it is dedicated to ('design' or 'code' respectively); a mismatch is a direct string comparison, not an exception.
  - Response: Returns ok:false with a violation naming the scopeType mismatch; the validator never proceeds to check the field table for the wrong review type.
  - User impact: A caller that routes a Scope to the wrong validator gets a clear, named violation rather than a confusing field-level error or a false pass.
- **A field required at the Scope's own declared scopeLevel is absent (e.g. scopeLevel='lld' but scope.lld is undefined).** (recoverable)
  - Detection: The shared comparison engine looks up the (scopeType, scopeLevel) pair in the declarative requirement table, finds 'lld' listed as required, and checks scope.lld === undefined.
  - Response: Returns ok:false with a violation naming the missing required field.
  - User impact: A reviewer is never handed a Scope that claims a depth it does not actually carry a Pointer for.
- **A field deeper than the Scope's own declared scopeLevel is populated (e.g. scopeLevel='hld' but scope.lld is also populated).** (recoverable)
  - Detection: The requirement table marks 'lld' as must-be-absent at scopeLevel='hld'; the comparison engine checks scope.lld !== undefined against that must-be-absent entry.
  - Response: Returns ok:false with a violation naming the field that should not have been populated at this depth.
  - User impact: Prevents a Scope from silently smuggling in content beyond what the review attempt actually declared it covers.
- **scope.scopeLevel is a value that is not valid for the Scope's own scopeType (e.g. scopeType='design' with scopeLevel='task', since design review's valid levels are def/hld/lld and code review's are plan/task).** (recoverable)
  - Detection: The requirement table has no entry at all for that (scopeType, scopeLevel) combination; the lookup itself comes back empty rather than returning a field list.
  - Response: Returns ok:false with a violation naming the (scopeType, scopeLevel) combination itself as invalid, rather than attempting to check individual fields against a non-existent entry.
  - User impact: A caller that constructs an impossible scopeType/scopeLevel pair gets one clear top-level violation instead of a confusing or empty field-by-field result.
- **scope.tasks is present but an empty array ([]) at a scopeLevel that requires at least one Task Pointer.** (recoverable)
  - Detection: The comparison engine treats an empty tasks array the same as absent for the purposes of the 'must be populated' check -- it inspects tasks.length, not merely whether the field key exists.
  - Response: Returns ok:false with a violation naming tasks as effectively absent.
  - User impact: A Scope cannot claim task-level coverage while naming zero actual Tasks.
- **A populated Pointer-typed field on a Scope (e.g. scope.hld) carries a path that would resolve outside the registered repo root (e.g. containing '..' segments).** (recoverable)
  - Detection: validateDesignScope/validateCodeScope now take registeredRepoRoot as their second parameter and call sc6's PointerPathValidator against every populated Pointer-typed field, passing that same registeredRepoRoot through, as part of their own check after the field-presence table lookup passes; PointerPathValidator resolves the path via path.resolve and checks it stays within registeredRepoRoot.
  - Response: Returns ok:false with a violation naming the escaping field, folded into the same ValidationResult.violations array as any field-presence violations. This closes a gap a cross-LLD review found: earlier this Story's validators checked only field presence/absence, leaving the repo-root-escape requirement sc1's nonFunctional security note promises unimplemented anywhere.
  - User impact: A Scope carrying an escaping Pointer path is rejected before being sent for review, with a named violation identifying which field.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A minimal valid design-review Scope: scopeType='design', scopeLevel='def', only def populated, every other named field absent. | validateDesignScope returns ok:true -- def is both required and sufficient at scopeLevel='def'; nothing deeper is populated to violate the self-inclusive-depth rule. |
| A Scope with multiple Pointers in its tasks array. | Accepted without special-casing -- tasks is typed readonly Pointer[] and the requirement table only checks non-emptiness where required, not a specific count. |
| A Scope with both extension and amendment populated alongside a normal def/hld/lld chain. | Neither extension nor amendment is governed by the (scopeType, scopeLevel) requirement table -- the HLD's own ScopeLevel enum names no 'extension' or 'amendment' level, so these are orthogonal optional fields this Story's validators do not constrain; both may be populated or absent independent of scopeLevel. |
| A Scope where scopeLevel='hld' but hld itself is absent while def is populated (an ancestor-only Scope with no self-inclusive artifact Pointer). | validateDesignScope returns ok:false -- this is exactly the case ac2/lc2 exists to reject: the hld field (the artifact actually under review at this depth) must itself be populated, not merely its ancestor def. |

## 7. Test strategy

**Test framework:** `node:test (tsx --test)`

**Test levels**

- **unit** — Verify Scope's named per-kind fields are independently typed and never folded together.
  - Subjects: `a Scope with distinct def/hld/lld/plan/tasks/extension/amendment Pointers keeps each field independently addressable`, `a minimal valid design-review Scope (scopeType='design', scopeLevel='def', only def populated) validates ok:true`
  - Fixtures: `sample Scope objects per scopeType/scopeLevel combination`, `sample Pointer fixtures reused from Story s1`
- **unit** — Verify the self-inclusive depth model: the artifact actually under review must itself be populated, not just its ancestors.
  - Subjects: `validateDesignScope returns ok:false when scopeLevel='hld' but hld is absent while def is populated`, `validateDesignScope returns ok:true when scopeLevel='hld' and both def and hld are populated`
  - Fixtures: `Scope fixtures with an ancestor populated but the self-inclusive field missing`
- **unit** — Verify each dedicated per-review-type validator enforces exactly the fields valid for its own (scopeType, scopeLevel) pairs.
  - Subjects: `validateDesignScope/validateCodeScope return ok:false with a named violation when called on the wrong scopeType`, `validateCodeScope returns ok:false when a field deeper than scopeLevel is populated`, `validateCodeScope returns ok:false when scope.tasks is an empty array at a scopeLevel requiring tasks`, `a validator returns ok:false naming the (scopeType, scopeLevel) combination itself as invalid when no requirement-table entry exists for it`, `extension and amendment populated or absent independent of scopeLevel do not affect ok/violations`
  - Fixtures: `Scope fixtures covering every valid and invalid (scopeType, scopeLevel) combination`, `a Scope fixture with a mismatched scopeType for the validator under test`
- **integration** — Verify validateDesignScope/validateCodeScope now reject a Scope carrying an escaping Pointer path, via sc6's PointerPathValidator (closes the cross-LLD security gap).
  - Subjects: `validateDesignScope returns ok:false with a named violation when a populated Pointer-typed field's path escapes registeredRepoRoot`, `validateCodeScope returns ok:false with a named violation when a populated Pointer-typed field's path escapes registeredRepoRoot`
  - Fixtures: `Scope fixtures with an escaping Pointer path in a populated field`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `a Scope with distinct def/hld/lld/plan/tasks/extension/amendment Pointers keeps each field independently addressable` |
| `ac2` | `validateDesignScope returns ok:false when scopeLevel='hld' but hld is absent while def is populated`, `validateDesignScope returns ok:true when scopeLevel='hld' and both def and hld are populated` |
| `ac3` | `validateDesignScope/validateCodeScope return ok:false with a named violation when called on the wrong scopeType`, `validateCodeScope returns ok:false when a field deeper than scopeLevel is populated`, `validateCodeScope returns ok:false when scope.tasks is an empty array at a scopeLevel requiring tasks`, `a validator returns ok:false naming the (scopeType, scopeLevel) combination itself as invalid when no requirement-table entry exists for it` |

## 8. Alternatives considered

### 8.1 a1: One shared declarative field-requirement table + a generic validation engine, instantiated as two named per-review-type ScopeValidator exports — **CHOSEN**

Scope/ScopeValidator/ValidationResult exactly as sc3's sketch; the two required ScopeValidator instances (validateDesignScope, validateCodeScope) are each a thin closure over a shared, declarative per-(scopeType,scopeLevel) field-requirement table and one shared comparison engine, rather than duplicated branching logic.

Scope, ScopeType, ScopeLevel, ValidationResult and the ScopeValidator function type are defined exactly as sc3's interfaceSketch. A private, declarative table maps each valid (scopeType, scopeLevel) pair to which named fields (def/hld/lld/plan/tasks/extension/amendment) must be populated (the self-inclusive chain up to and including the review's own depth) and which must be absent (anything deeper than the review's own scopeLevel). validateDesignScope and validateCodeScope are each exported as a real ScopeValidator-typed const, but both call one shared internal comparison function against their own slice of the table -- so the two review types stay independently named and independently typed (satisfying k3's 'one per review type'), while the actual self-inclusive-chain comparison logic is written once.

### 8.2 a2: Two fully independent, hand-written validator functions with no shared logic

validateDesignScope and validateCodeScope are each written from scratch, with their own independent switch/if-chain over scopeLevel and no shared comparison helper.

Each of the two ScopeValidator-typed exports contains its own complete, independent logic for checking which named fields must/must-not be populated at each of its valid scopeLevel values -- nothing is factored out or shared between them.

**Rejected because:** Technically satisfies every ac/sc/k constraint, but duplicates the self-inclusive-chain logic (lc2/ac2) across two independent implementations with no shared engine, risking per-type drift the sibling Epic's own risky-bits table warns about for its analogous hook-interface concern.

### 8.3 a3: One single validator function that reads scope.scopeType and branches internally

Export one function, validateScope(scope) => ValidationResult, that reads scope.scopeType itself and branches to design-specific or code-specific logic inside the same function body.

Instead of two separate ScopeValidator-typed exports, export a single function matching the ScopeValidator type that inspects scope.scopeType at the top and dispatches to an internal design-branch or code-branch.

**Rejected because:** Violates ac3, sc3 and k3 by collapsing 'one validator per review type' into a single dispatcher that branches on scopeType internally, contradicting both the HLD's own interfaceSketch wording and the sibling Epic's own explicit lesson against exactly this shared-function-branches-on-type pattern.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 capability-discovery bundle (Scope/ValidationResult/Validator naming collision check)` — "Three unrelated interface Scope declarations in src/indexer/parser/{cpp,rust,csharp}.ts ... no naming collision risk."
- **[[c2]]** `analyze-bundle` `s1 capability-discovery bundle (reused ReviewContext capability-discovery)` — "Zero clear-match; 5 partial-match are each separate per-review-type legacy contracts/types ... baseClassIdioms: []."

## 10. Open questions

- [dm1 / missed] All three dataModel entries (Scope, ValidationResult, ScopeFieldRequirement) cite callSites: ['src/workflow/artifact-core/types.ts'], but this Story's own s1.analyzeBundles[*].pathsCited never actually lists that path -- it only cites the three indexer/parser Scope files and the five review-history files. The landing location is correct (it matches Story s1's own approved LLD and this Epic's established module), but it was not freshly grounded by an analyze call in this Story's own context.assemble step. Should be closed by a module.profile/concept.resolve pass on src/workflow/artifact-core/types.ts before this LLD proceeds to build, so the citation is genuinely satisfied rather than carried over by assumption from the sibling Story.

## Resolved questions

- `dm1` — [dm1 / missed] All three dataModel entries (Scope, ValidationResult, ScopeFieldRequirement) cite callSites: ['src/workflow/artifact-core/types.ts'], but this Story's own s1.analyzeBundles[*].pathsCited never actually lists that path -- it only cites the three indexer/parser Scope files and the five review-history files. The landing location is correct (it matches Story s1's own approved LLD and this Epic's established module), but it was not freshly grounded by an analyze call in this Story's own context.assemble step. Should be closed by a module.profile/concept.resolve pass on src/workflow/artifact-core/types.ts before this LLD proceeds to build, so the citation is genuinely satisfied rather than carried over by assumption from the sibling Story.
  - **resolved**: Ground before planning — types.ts now carries Locator/Pointer/StalenessResult/PathValidationResult from Story s1's approved build; grounding s2's LLD citation against the real file closes the gap before planning s2. _(2026-11-19T10:02:04.658Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1 capability-discovery bundle (Scope/ValidationResult/Validator naming collision check)` — "Three unrelated interface Scope declarations in src/indexer/parser/{cpp,rust,csharp}.ts ... no naming collision risk."
- **[[c2]]** `analyze-bundle` `s1 capability-discovery bundle (reused ReviewContext capability-discovery)` — "Zero clear-match; 5 partial-match are each separate per-review-type legacy contracts/types ... baseClassIdioms: []."

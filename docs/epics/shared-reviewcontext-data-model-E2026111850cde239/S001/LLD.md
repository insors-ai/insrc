<!-- insrc:artifact LLD-50cde239426d6e2a-s1 -->

# LLD: STORY-50cde239426d6e2a-s1 — Pointer and Locator as the shared building blocks for naming content

## Summary

**Epic:** `shared-reviewcontext-data-model`
**HLD base run:** `wf-1794984468539-8trvyt`
**HLD effective hash:** `720f2f3adc55...`
**Tracker:** [insors-ai/insrc#197](https://github.com/insors-ai/insrc/issues/197)

This Story defines Locator and Pointer, the two foundational types every other piece of ReviewContext uses to name a piece of content: a Pointer references an existing authored file (optionally with a content hash recorded at build time), and an optional Locator pins an exact region within it. It also defines one shared, pure staleness-detection function so every consumer (Scope, ReviewTargets) checks a Pointer's freshness the same way, with no I/O inside the check itself.

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

**Rollout phase:** Phase A — foundational Pointer/Locator + staleness contract
**Owns:** `sc1` (Locator + Pointer), `sc2` (Pointer staleness check), `sc6` (Pointer path validation)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Which named artifact-kind fields Scope carries beyond def/hld/lld/plan/tasks (e.g. a future named kind) and the exact per-review-type ScopeValidator implementations are s2's own; no other Story's type depends on Scope, since nothing in the Epic's Story graph consumes s2. — owns `sc3`
- `s3`: ReviewTargets' own reset-on-new-round mechanics (how the entries list is rebuilt rather than merged) stay internal to s3; no other Story's type depends on ReviewTargets. — owns `sc4`
- `s4`: CommentEntry does not reference Pointer/Locator at all, so s4 needs neither sc1 nor sc2. The round-stamping mechanics (how a new attempt's round number is assigned) and the same-artifact-only scoping of Comments across a chain stay internal to s4; the full ReviewContext container embedding Scope and ReviewTargets alongside round/comments is explicitly deferred (Epic Non-Goals), since no Story in this graph depends on all of s2, s3 and s4 together. — owns `sc5`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `PointerStalenessCheck`

```typescript
type PointerStalenessCheck = (pointer: Pointer, currentContentHash: string) => StalenessResult
```

**Parameters:**
- `pointer: Pointer` — The Pointer whose recorded contentHash is being checked for staleness.
- `currentContentHash: string` — The sha256 hex digest of pointer.path's current content, computed by the caller (createHash('sha256').update(content).digest('hex')) before calling this function -- the function performs no I/O itself.

**Returns:** `StalenessResult` — {stale, checkedAt}: whether pointer.contentHash (when present) differs from currentContentHash, and the ISO-8601 timestamp the comparison was made.

**Preconditions:**
- pointer.contentHash may be absent (a Pointer built without recording a hash); in that case the function returns stale:false -- there is nothing to compare against, so absence is not staleness.

**Postconditions:**
- The function is pure: given the same two arguments it always returns the same stale value; only checkedAt varies by wall-clock time.

### 2.2 `PointerPathValidator`

```typescript
type PointerPathValidator = (pointer: Pointer, registeredRepoRoot: string) => PathValidationResult
```

**Parameters:**
- `pointer: Pointer` — The Pointer whose path is being checked for escaping the registered repo root.
- `registeredRepoRoot: string` — The absolute path of the registered repo root the caller is validating against, obtained the same way the repo-registry strict-contract rule elsewhere in this codebase does (the registered repo's own root).

**Returns:** `PathValidationResult` — {ok, violations}: whether pointer.path, once resolved via path.resolve(registeredRepoRoot, pointer.path), stays within registeredRepoRoot; a violation names the escaping path when it does not.

**Postconditions:**
- The function is pure: it only normalizes and compares two strings (via path.resolve, the same normalization src/db/repos.ts's own repo-path comparison already uses) and returns a result; it performs no file-system I/O and mutates nothing.

## 3. Data model changes

### 3.1 `Locator` — new

interface Locator { readonly kind: LocatorKind | string; readonly value: string } where type LocatorKind = 'symbol' | 'lineRange' | 'docSection' (known kinds; the set is open, not exhaustive -- every consumer reads kind structurally, e.g. a lookup by string key, never an exhaustive switch with no default, per the HLD's own risky-bits mitigation). value stays one opaque string per kind (a symbol name, 'startLine-endLine', or a doc-section id) -- the caller that builds a Locator already knows the format for its own kind; this Story does not introduce per-kind structured typing (a2 rejected). Lands in src/workflow/artifact-core/types.ts, the existing home for shared plain-interface types in this part of the codebase.

**Call sites:**
- `src/workflow/artifact-core/types.ts`

### 3.2 `Pointer` — new

interface Pointer { readonly path: string; readonly section?: Locator; readonly contentHash?: string }. path is a repo-relative path to an existing authored file (DEF.md/HLD.md/LLD.md/source); never a generated extract. contentHash, when present, is the sha256 hex digest of path's content at the time this Pointer was built, computed with createHash('sha256').update(content).digest('hex') -- the same idiom already used for entity ids and for the lifecycle revision's own contentHash. Pointer MUST stay a plain TypeScript interface (no sealed/closed type, no class) so a future structural subtype -- e.g. the sibling standalone security-extension-points Story's planned SecurityPointer, which the user has decided will be `interface SecurityPointer extends Pointer` -- can add its own fields (trustBoundaryId, taintPathStepIndex) without this Story needing to change; that future subtype is out of this Story's scope and is not modeled here. Lands in src/workflow/artifact-core/types.ts alongside Locator.

**Call sites:**
- `src/workflow/artifact-core/types.ts`

### 3.3 `StalenessResult` — new

interface StalenessResult { readonly stale: boolean; readonly checkedAt: string } (checkedAt is ISO-8601). Returned by PointerStalenessCheck. Lands beside Locator/Pointer in src/workflow/artifact-core/types.ts.

**Call sites:**
- `src/workflow/artifact-core/types.ts`
- `src/workflow/artifact-core/lifecycle.ts`

### 3.4 `PathValidationResult` — new

interface PathValidationResult { readonly ok: boolean; readonly violations: readonly string[] }, returned by PointerPathValidator. Lands beside Locator/Pointer/StalenessResult in src/workflow/artifact-core/types.ts.

**Call sites:**
- `src/workflow/artifact-core/types.ts`
- `src/db/repos.ts`

## 4. Diagrams

- [ER model](docs/epics/shared-reviewcontext-data-model-E2026111850cde239/S001/er-model.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | This Story is sc1's owner; Locator and Pointer are implemented exactly as sc1's interfaceSketch describes, with Pointer kept plain-interface-extensible per the resolved cross-design open question on the future SecurityPointer subtype. |
| `sc2` | implements | This Story is sc2's owner; PointerStalenessCheck implements sc2's interfaceSketch exactly -- a pure, synchronous function taking a pre-computed currentContentHash, with no I/O inside it, matching sc2's own nonFunctional performance note. |
| `sc6` | implements | This Story is sc6's owner; PointerPathValidator implements sc6's interfaceSketch exactly -- a pure, synchronous function using the same path.resolve-based normalization src/db/repos.ts's own repo-path comparison already uses, closing the gap this LLD's s2/s3 siblings left unaddressed. |

## 6. Error paths

**Error cases**

- **A caller passes a currentContentHash to PointerStalenessCheck that was computed with a different scheme than this Story's established createHash('sha256').update(content).digest('hex') idiom (e.g. base64 instead of hex, or hashed over normalized rather than raw bytes).** (recoverable)
  - Detection: PointerStalenessCheck performs a plain string comparison between pointer.contentHash and currentContentHash; it has no way to detect which hashing scheme produced either string, since both are opaque strings to the function.
  - Response: No error is raised. The mismatched encoding simply makes the two strings unequal, so the comparison reports stale:true even though the file may not actually have changed -- a false positive caused entirely by a caller-side hashing-convention violation, not something this pure function can catch.
  - User impact: A Pointer could be reported stale incorrectly if some future caller does not follow the established sha256-hex idiom; this is a caller-discipline concern, not a defect in PointerStalenessCheck itself.
- **The file at pointer.path no longer exists (deleted or moved) since the Pointer was built.** (recoverable)
  - Detection: PointerStalenessCheck itself never reads pointer.path -- it only compares two already-computed strings -- so it cannot detect a missing file. Detection happens one level up, at the caller's own file-read step (an ENOENT or equivalent) when it tries to compute currentContentHash before calling this function at all.
  - Response: Out of this Story's scope: file I/O and its error handling belong to the caller (the controller or a consuming Story's validator), not to the pure Locator/Pointer/PointerStalenessCheck contract this Story defines. This Story's contract assumes currentContentHash is already available by the time PointerStalenessCheck is called.
  - User impact: None directly from this Story's types; a caller that does not handle a missing-file read error before calling PointerStalenessCheck would surface that failure through its own error path, not through a StalenessResult.
- **A Pointer.path value that would resolve outside the registered repo root (e.g. containing '..' segments) is passed to PointerPathValidator.** (recoverable)
  - Detection: PointerPathValidator resolves pointer.path against registeredRepoRoot via path.resolve (the same normalization src/db/repos.ts's own repo-path comparison already uses, per 'Compared post-path.resolve so trailing slashes / `..` segments' normalize') and checks the result starts with registeredRepoRoot.
  - Response: Returns ok:false with a violation naming the escaping path. This closes the gap found in a cross-LLD review: earlier this Story deferred the check to 's2's ScopeValidator' informally with no shared contract backing it; sc6 now gives s2 and s3 a real function to call on every Pointer-typed field before sending a Scope/ReviewTargets instance for review.
  - User impact: A Pointer that would escape the registered repo root is rejected with a named violation instead of silently passing through to review.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A Pointer with no contentHash at all (never recorded at build time). | PointerStalenessCheck returns stale:false -- there is nothing to compare against, so an absent contentHash is not treated as staleness, per the function's documented precondition. |
| A Pointer.contentHash that is present but an empty string. | An empty string is still a 'present' value (not undefined), so it is compared literally against currentContentHash like any other string; it is almost certainly unequal to a real sha256 hex digest, so this reports stale:true -- not a special case, just the ordinary comparison outcome for an unusual recorded value. |
| A Locator with kind set to a string that is not one of the three currently-known literals (symbol/lineRange/docSection) -- e.g. a future kind introduced by a different Story. | Accepted without error: kind is typed `LocatorKind \| string`, so any string is structurally valid. Consumers reading kind must do so via a non-exhaustive lookup (e.g. a string-keyed branch), never an exhaustive switch with no default, per ac2/lc1. |
| A Locator.value string whose format does not match the convention expected for its own kind (e.g. a 'lineRange' kind with a value that is not actually formatted 'startLine-endLine'). | This Story's types do not validate value's internal format per kind -- that interpretation and validation responsibility belongs to whichever consumer reads a Locator of that specific kind, not to the Locator type itself. |

## 7. Test strategy

**Test framework:** `node:test (tsx --test)`

**Test levels**

- **unit** — Verify Pointer/Locator shapes identify a file + exact region with no generated extract involved.
  - Subjects: `a Pointer with path + section (Locator) identifies both the file and the region`, `a Pointer with no section still identifies the whole file`
  - Fixtures: `sample Pointer objects with and without section`
- **unit** — Verify Locator's open-string kind field accepts any string, including kinds beyond the three currently-known literals, without requiring code changes.
  - Subjects: `a Locator with kind='symbol'/'lineRange'/'docSection' is accepted`, `a Locator with an arbitrary future kind string is accepted and read via a non-exhaustive string-keyed lookup, not an exhaustive switch`
  - Fixtures: `Locator fixtures per known kind`, `a Locator fixture with an unknown kind string`
- **unit** — Verify PointerStalenessCheck's pure comparison logic across the documented precondition and edge cases.
  - Subjects: `PointerStalenessCheck returns stale:true when pointer.contentHash differs from currentContentHash`, `PointerStalenessCheck returns stale:false when pointer.contentHash equals currentContentHash`, `PointerStalenessCheck returns stale:false when pointer.contentHash is absent (no hash was ever recorded)`, `PointerStalenessCheck returns stale:true when pointer.contentHash is an empty string compared against a real hex digest`, `PointerStalenessCheck always returns the same stale value for the same two arguments (purity), only checkedAt varies`
  - Fixtures: `Pointer fixtures with matching/differing/absent/empty contentHash`, `sample sha256 hex digests computed via createHash('sha256').update(content).digest('hex')`
- **unit** — Verify PointerPathValidator correctly accepts in-root paths and rejects escaping paths (closes the cross-LLD security gap; not tied to an existing Story ac since it operationalizes the HLD's own nonFunctional security note via the new sc6 contract).
  - Subjects: `PointerPathValidator returns ok:true for a Pointer.path that resolves within registeredRepoRoot`, `PointerPathValidator returns ok:false with a named violation for a Pointer.path containing '..' segments that resolves outside registeredRepoRoot`
  - Fixtures: `Pointer fixtures with in-root and escaping paths`, `a sample registeredRepoRoot value`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `a Pointer with path + section (Locator) identifies both the file and the region`, `a Pointer with no section still identifies the whole file` |
| `ac2` | `a Locator with an arbitrary future kind string is accepted and read via a non-exhaustive string-keyed lookup, not an exhaustive switch` |
| `ac3` | `PointerStalenessCheck returns stale:true when pointer.contentHash differs from currentContentHash`, `PointerStalenessCheck returns stale:false when pointer.contentHash equals currentContentHash`, `PointerStalenessCheck always returns the same stale value for the same two arguments (purity), only checkedAt varies` |

## 8. Alternatives considered

### 8.1 a1: Exactly-as-sketched minimal types: opaque-string Locator, plain Pointer, pure synchronous staleness comparator — **CHOSEN**

Implement sc1/sc2 literally as the HLD's own interface sketches: Locator{kind:string,value:string}, Pointer{path,section?,contentHash?}, and a pure PointerStalenessCheck(pointer, currentContentHash) => StalenessResult that only compares two hex strings.

Locator.kind stays a plain string (LocatorKind | string) and Locator.value stays one opaque string per kind (symbol name, 'startLine-endLine', or doc-section id) -- the caller that builds a Locator already knows how to format value for its kind; no cross-kind structured typing is introduced. Pointer stays exactly {path, section?: Locator, contentHash?: string}. PointerStalenessCheck is a pure, synchronous function: it takes the Pointer and an already-computed currentContentHash (the caller reads the file and runs createHash('sha256').update(content).digest('hex'), matching the repo's established content-hashing idiom) and returns {stale, checkedAt} from a plain string comparison -- no I/O inside the function itself, matching sc2's nonFunctional performance note ('adds no I/O beyond the read the controller already performs').

### 8.2 a2: Structured per-kind Locator.value (discriminated union keyed by kind)

Replace Locator's single opaque `value: string` with a discriminated union typing value's shape per known kind (e.g. {kind:'lineRange', start:number, end:number} vs {kind:'symbol', name:string}).

Define Locator as a union of concrete shapes, one per known LocatorKind literal, each with its own strongly-typed value fields instead of one opaque string a caller must format/parse by convention.

**Rejected because:** Directly contradicts lc1/ac2's open-extensibility requirement by closing Locator's value into a per-kind discriminated union, and deviates from sc1's own published interfaceSketch, which already chose the open opaque-string shape for this reason.

### 8.3 a3: Self-contained async staleness check that reads and hashes the file itself

Give PointerStalenessCheck a single-argument async signature that reads pointer.path from disk and computes its own sha256 hash internally, instead of taking a pre-computed currentContentHash.

PointerStalenessCheck(pointer: Pointer) => Promise<StalenessResult> reads the file at pointer.path itself, hashes it, and compares against pointer.contentHash -- the caller passes only the Pointer, not a separately-computed hash.

**Rejected because:** Contradicts sc2's exact published synchronous signature and its own nonFunctional performance note by making the staleness check asynchronous and self-reading, duplicating I/O the controller already performs.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 capability-discovery bundle` — "grep for 'interface Locator'/'interface Pointer' across src/ (excluding __tests__) returned zero hits."
- **[[c2]]** `analyze-bundle` `s1 how-does-it-work bundle (content hash + repo-registry strict-contract)` — "The repo's established idiom for content hashing is createHash('sha256').update(<content>).digest('hex')."
- **[[c3]]** `analyze-bundle` `s1 how-does-it-work bundle (test-file convention)` — "src/workflow/artifact-core/__tests__/ uses flat kebab-case *.test.ts files ... using node:test's describe/it + node:assert/strict."

## Citations

- **[[c1]]** `analyze-bundle` `s1 capability-discovery bundle` — "grep for 'interface Locator'/'interface Pointer' across src/ (excluding __tests__) returned zero hits."
- **[[c2]]** `analyze-bundle` `s1 how-does-it-work bundle (content hash + repo-registry strict-contract)` — "The repo's established idiom for content hashing is createHash('sha256').update(<content>).digest('hex')."
- **[[c3]]** `analyze-bundle` `s1 how-does-it-work bundle (test-file convention)` — "src/workflow/artifact-core/__tests__/ uses flat kebab-case *.test.ts files ... using node:test's describe/it + node:assert/strict."

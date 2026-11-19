<!-- insrc:artifact LLD-03f4fd3b9102aab8-s2 -->

# LLD: STORY-03f4fd3b9102aab8-s2 — Findings are classified against a fixed taxonomy with a per-review-type-configurable severity scale

## Summary

**Epic:** `review-rounds-reconciliation-recovery`
**HLD base run:** `wf-1794986545330-2wntv5`
**HLD effective hash:** `6d57abfa68ac...`
**Tracker:** [insors-ai/insrc#212](https://github.com/insors-ai/insrc/issues/212)

This Story adds the fixed taxonomy every finding is classified against and a documented default severity scale. A finding's category is always exactly one of five fixed values, so findings stay comparable across every round and every review type. Severity itself stays a plain string, since no review-type class hierarchy exists to constrain it further -- a review type that wants its own severity vocabulary supplies it through its own grounding/steering, falling back to HIGH/MED when it declares none.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

> See **HLD-03f4fd3b9102aab8** § 2. Framework summary

**Rollout phase:** Phase B — taxonomy, reconciliation, rendering, checkpointing
**Owns:** `sc2` (Finding taxonomy + severity scale)
**Consumes:** `sc1` (Review-type hook set)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The round-driver function itself -- what it does internally to run the grounding+findings, reconciliation, render+present and checkpoint-write cycle -- stays private to s1; no other Story's type depends on the driver's internals, only on the hook contract sc1 exposes. — owns `sc1`
- `s3`: How the reconciliation LLM call is actually prompted, and how it reads the temp folder's audit trail when needed, stay internal to s3; no other Story's type depends on ReconciliationResult's internals beyond its verdict shape. — owns `sc3`
- `s4`: The exact docgen docType registration and MD rendering logic (including the resolved/still-open/contradicted annotation rule scoped to this round's own corrections) stay internal to s4; no other Story's type depends on the renderer's internals. — owns `sc4`
- `s5`: The exact per-review-type granularity mapping (round-level for design review, per-Task for code review) and the durable-copy-before-deletion mechanics stay internal to s5; no other Story's type depends on ReviewCheckpoint's internals beyond what sc1's round-driver needs to call it. — owns `sc5`

## 2. Contract details

**Surface level:** internal-shared

## 3. Data model changes

### 3.1 `FindingCategory` — new

type FindingCategory = 'correctness' | 'functional-completeness' | 'security' | 'quality' | 'maintainability'; -- exactly sc2's HLD interfaceSketch, a fixed 5-member union never widened per review type.


### 3.2 `Finding` — new

interface Finding { readonly id: string; readonly category: FindingCategory; readonly severity: string; } -- sc2's HLD interfaceSketch as amended (revision 4): adds a required id field so a finding has a stable identity across rounds. severity stays an unconstrained string because no abstract review-type class hierarchy exists in the codebase (grounded in s1's structural-map bundle) to type-check against; a review type's own grounding/steering is where its severity vocabulary is actually declared and used. id is assigned by whatever review type's hook produces the finding (sc1's RoundDriverHooks.ground()) -- this Story defines the field, not how a given hook generates a unique value for it.


### 3.3 `DEFAULT_SEVERITY_SCALE` — new

const DEFAULT_SEVERITY_SCALE: readonly string[] = ['HIGH', 'MED'] as const; -- the fallback scale ac2/lc2 name for a review type that declares no severity scale of its own. Documents the default; does not enforce it structurally (severity stays a plain string).


## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | FindingCategory and Finding are authored here as sc2's concrete shape, implementing the HLD interfaceSketch verbatim; DEFAULT_SEVERITY_SCALE is this Story's own addition, documenting the fallback ac2 requires. |
| `sc1` | consumes | Finding's severity field is populated by whatever a review type's RoundDriverHooks.ground() implementation (sc1, owned by s1) returns -- this Story only defines the shape findings must carry, not how a review type's hook chooses its severity values. |

## 5. Error paths

**Error cases**

- **code attempts to construct a Finding with a category value outside the fixed 5-member FindingCategory union** (recoverable)
  - Detection: tsc rejects the literal at compile time because it does not match the FindingCategory union type
  - Response: compilation fails before the code can ship; no invalid category literal ever reaches runtime
  - User impact: a typo'd or sixth category is caught during development, not discovered later from a stored finding carrying an uncategorized or miscategorized value

**Edge cases**

| Input | Expected |
| :--- | :--- |
| a review type's hook declares no severity scale at all (its RoundDriverHooks.ground() implementation simply emits 'HIGH'/'MED' values without ever referencing DEFAULT_SEVERITY_SCALE) | Finding.severity still structurally accepts those values -- DEFAULT_SEVERITY_SCALE is documentation of the fallback, not a runtime default applied automatically by any function in this Story (there is no function in this Story's contract to apply it) |
| a review type's hook emits a severity string outside any documented scale (e.g. a typo like 'HGIH', or a wholly custom value like 'CRITICAL' with no corresponding scale declared anywhere) | Finding accepts it structurally -- severity is deliberately an unconstrained string (per the chosen alternative's rationale), so no finding is rejected or dropped for an unrecognized severity value |
| a nested security pass (per the resolved cross-epic decision in s1) produces a finding | that finding still uses category='security', one of the same fixed 5-member FindingCategory values -- the security pass does not introduce a parallel taxonomy or category scheme of its own |

## 6. Test strategy

**Test framework:** `node:test, run via npx tsx --test, with a compile-time @ts-expect-error fixture checked through a throwaway tsconfig (matches this Epic's own s1 convention and the shared-reviewcontext-data-model epic's artifact-core convention)`

**Test levels**

- **unit** — Prove FindingCategory is a closed fixed taxonomy (ac1), Finding.severity accepts any review-type-declared value including the documented default scale (ac2), and Finding's exported shape has exactly the two documented fields -- no extra field smuggled in later.
  - Subjects: `Finding and FindingCategory are exported with the exact documented field shapes, including the id field`, `FindingCategory accepts exactly the five fixed categories (correctness, functional-completeness, security, quality, maintainability) and rejects any other category value at compile time`, `Finding.severity accepts any string value, including a review-type-specific custom severity scale outside HIGH/MED`, `DEFAULT_SEVERITY_SCALE names HIGH and MED as the documented fallback scale for a review type that declares none`, `Finding's exported shape contains exactly id, category and severity, and no other field of any kind`, `two Finding values with identical category and severity but different id values are distinct findings`
  - Fixtures: `a compile-time typecheck fixture (__type-tests__/finding.typecheck.ts) with @ts-expect-error assertions for an invalid category literal and an exact-keys Equal<keyof Finding, 'id'|'category'|'severity'> assertion`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `FindingCategory accepts exactly the five fixed categories (correctness, functional-completeness, security, quality, maintainability) and rejects any other category value at compile time` |
| `ac2` | `Finding.severity accepts any string value, including a review-type-specific custom severity scale outside HIGH/MED`, `DEFAULT_SEVERITY_SCALE names HIGH and MED as the documented fallback scale for a review type that declares none` |

## 7. Alternatives considered

### 7.1 a1: Flat Finding{category,severity:string} exactly per sc1's sketch, plus an advisory default-scale constant — **CHOSEN**

Finding carries a fixed 5-value FindingCategory and a plain `severity: string`; a DEFAULT_SEVERITY_SCALE = ['HIGH','MED'] constant documents the fallback a review type's steering/prompt falls back to when it declares no scale of its own.

type FindingCategory = 'correctness' | 'functional-completeness' | 'security' | 'quality' | 'maintainability' (fixed, never widened). interface Finding { readonly category: FindingCategory; readonly severity: string; } -- exactly sc2's HLD interfaceSketch, unchanged. export const DEFAULT_SEVERITY_SCALE: readonly string[] = ['HIGH', 'MED'] as const -- the fallback named by ac2/lc2 when a review type declares no scale of its own. Since no abstract 'Feedback' base class exists anywhere in the codebase (confirmed by s1's grounding), 'a review type's Feedback implementation declares its own severity scale' is realized at the steering/prompt level (the per-review-type hook's grounding instructions name the scale it uses), not by a TypeScript class hierarchy -- severity stays an unconstrained string so any review type's scale fits without widening the type.

### 7.2 a2: Generic Finding<S extends string> parameterized by each review type's severity-scale union

Finding<S extends string = 'HIGH'|'MED'> carries severity: S, so each review type instantiates its own literal-union severity type and gets compile-time narrowing.

interface Finding<S extends string = 'HIGH'|'MED'> { readonly category: FindingCategory; readonly severity: S; } -- a review type with a custom scale declares its own `type MySeverity = 'CRITICAL'|'WARN'` and uses Finding<MySeverity>; the default type parameter supplies HIGH/MED when a review type does not specialize it.

**Rejected because:** Violates sc2's approved shape by introducing a generic parameter nothing in the Story or HLD asked for; the extra compile-time rigor it buys over a1 is not needed to satisfy ac2.

### 7.3 a3: Self-describing Finding.severity as {scale, value}

severity becomes a structured object carrying both the finding's own value and the full scale it was drawn from, so each Finding is self-contained without a separate constant.

interface Finding { readonly category: FindingCategory; readonly severity: { readonly scale: readonly string[]; readonly value: string }; } -- every finding instance repeats its review type's entire severity scale alongside its own value.

**Rejected because:** Violates sc2's approved shape (nested severity object instead of a flat string) and duplicates the severity scale across every finding instance for a self-description benefit neither acceptance criterion asks for.

## 8. References

- **[[c1]]** `analyze-bundle` `src/workflow/review-history/review/design-review/admission-checkpoint.ts`
- **[[c2]]** `analyze-bundle` `src/workflow/review-history/review/design-review/preparation-checkpoint.ts`
- **[[c3]]** `analyze-bundle` `src/workflow/review-history/review/design-review/checkpoint.ts`
- **[[c4]]** `analyze-bundle` `src/workflow/review-history/code-review/task-review/admission-checkpoint.ts`
- **[[c5]]** `analyze-bundle` `src/mcp/docgen/handler.ts`
- **[[c6]]** `analyze-bundle` `src/workflow/artifact-core/types.ts:73-93`
- **[[c7]]** `analyze-bundle` `src/workflow/review-history/review/types.ts:29`
- **[[c8]]** `analyze-bundle` `src/workflow/review-history/review/types.ts:65-80`
- **[[c9]]** `analyze-bundle` `src/workflow/review-history/code-review/types.ts:26`
- **[[c10]]** `analyze-bundle` `src/workflow/review-history/code-review/types.ts:34-48`
- **[[c11]]** `prior-artifact` `HLD-03f4fd3b9102aab8#sc2`

## 9. Open questions

- The HLD's lc2 text assumes 'Feedback being an abstract base type with per-review-type implementations' as an existing fact this Story's design should be consistent with, but no such class or interface exists anywhere in the codebase (grepped repo-wide; the only 'Feedback' symbol, artifact-core/types.ts:73-93, is an unrelated comment/thread-reply type with no severity field). This LLD's chosen design still satisfies ac1/ac2 and sc2's interfaceSketch exactly by treating severity-scale configuration as a steering/prompt-level concern (via sc1's RoundDriverHooks.ground()), not a class hierarchy. Flagging for the HLD owner to correct lc2's wording in a future revision; does not block this Story's approval.
- Resolved (revision 2, following the s3/s5 cross-review): sc2 was amended (HLD revision 4, fieldAdd, non-breaking) to add Finding.id: string, giving a finding a stable identity across rounds. s3's reconcileRound now keys ReconciliationResult.priorFindingRef off Finding.id directly instead of requiring the caller to assign and track an opaque ref.

## Citations

- **[[c1]]** `analyze-bundle` `src/workflow/review-history/review/design-review/admission-checkpoint.ts`
- **[[c2]]** `analyze-bundle` `src/workflow/review-history/review/design-review/preparation-checkpoint.ts`
- **[[c3]]** `analyze-bundle` `src/workflow/review-history/review/design-review/checkpoint.ts`
- **[[c4]]** `analyze-bundle` `src/workflow/review-history/code-review/task-review/admission-checkpoint.ts`
- **[[c5]]** `analyze-bundle` `src/mcp/docgen/handler.ts`
- **[[c6]]** `analyze-bundle` `src/workflow/artifact-core/types.ts:73-93`
- **[[c7]]** `analyze-bundle` `src/workflow/review-history/review/types.ts:29`
- **[[c8]]** `analyze-bundle` `src/workflow/review-history/review/types.ts:65-80`
- **[[c9]]** `analyze-bundle` `src/workflow/review-history/code-review/types.ts:26`
- **[[c10]]** `analyze-bundle` `src/workflow/review-history/code-review/types.ts:34-48`
- **[[c11]]** `prior-artifact` `HLD-03f4fd3b9102aab8#sc2`

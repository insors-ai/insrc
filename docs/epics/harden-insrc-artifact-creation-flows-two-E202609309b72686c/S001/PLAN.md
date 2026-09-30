<!-- insrc:artifact PLAN-9b72686c1746af2b-s1 -->

# Plan: E202609309b72686c:S001

## Summary

**Epic:** `harden-insrc-artifact-creation-flows-two`
**LLD run:** `wf-1790752307218-lk72hy`
**LLD effective hash:** `a96cc61752b7...`

Building S001 is a small, single-file change to src/workflow/orchestrator.ts: add a pure pre-render gate that runs the four existing companion validators and, on a HIGH finding, returns the existing schema-kind retryable FinalizeResult failure carrying the errors; wire that gate into the three finalizers before they render; and strip the now-redundant HIGH-branch from each render helper while keeping its infra-swallow. The tests extend the existing diagram-companion-finalize harness to prove surface+retry, no-partial-write, retry-then-render, the untouched infra-swallow, and that the author's definition is never rewritten.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the companion-validation gate and wire it into the three finalizers; remove the redundant helper HIGH-branches | S | — | smoke: smoke: npx tsc --noEmit is clean after the gate helper + three finalizer short-circuits + helper HIGH-branch removal | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Add unit + integration tests for the companion-validation surface-and-retry | S | `t1` | unit: unit: firstCompanionValidationFailure over a HIGH-invalid er/ux/sequence/component definition -> retryable schema failure with non-empty details; unit: unit: firstCompanionValidationFailure over a valid / MED-LOW-only / no-companion body -> undefined; integration: integration: finalizeDesignStory/Epic + standalone-LLD with a HIGH-invalid companion -> {ok:false, kind:'schema', retryable:true} and no artifact written; integration: integration: corrected (valid) body -> {ok:true}, companion rendered + present in body.companions; integration: integration: already-valid body -> {ok:true}, rendered, no failure/retry (no regression); integration: integration: valid definition whose renderer throws DiagramGenerationError -> {ok:true} with the companion absent (infra-swallow preserved); integration: integration: the author's companion definition JSON is byte-identical after a failed and a successful finalize (no machine rewrite); smoke: smoke: npx tsx --test 'src/workflow/**/*.test.ts' runs green | [[c4]] |

### 1.1 E202609309b72686c:S001:T001 — Add the companion-validation gate and wire it into the three finalizers; remove the redundant helper HIGH-branches

In src/workflow/orchestrator.ts add a private gate firstCompanionValidationFailure(body): ValidationResult | undefined that runs the four existing validators (validateErDefinition/validateUxDefinition/validateSequenceDefinition/validateComponentDependencyDefinition) over whichever authored definitions the body carries and, if any DimensionFinding has severity==='HIGH', returns a schema-kind ValidationFailure (message + details[] = the HIGH findings' messages, retryable:true) via the schemaFailure shape; else undefined. Call the gate immediately before the companion render block in all three finalizers (finalizeDesignEpic:1744, finalizeDesignStory:2095, standalone-LLD:2246) and return {ok:false, failure} when it fires, before any write. Remove the now-redundant HIGH-validation branch inside renderErCompanionForBody/renderUxCompanionForBody/renderDiagramCompanionsForBody, keeping each helper's absent-definition early-return and its DiagramGenerationError try/catch swallow intact.

**Acceptance checks:**
- firstCompanionValidationFailure returns a schema-kind {ok:false} ValidationFailure with retryable:true and a non-empty details[] when any authored companion definition has a HIGH finding; undefined otherwise
- All three finalizers (finalizeDesignEpic, finalizeDesignStory, standalone-LLD) call the gate before rendering and return {ok:false, failure} without writing any artifact when it fires
- The DiagramGenerationError infra-catch in each *ForBody helper is unchanged (still swallowed, not surfaced as a retryable failure)
- The valid/absent-definition path is byte-identical: a body with valid or no companion definitions still resolves {ok:true} and renders as today
- npx tsc --noEmit is clean; the author's companion definition JSON is never mutated

### 1.2 E202609309b72686c:S001:T002 — Add unit + integration tests for the companion-validation surface-and-retry

Extend src/workflow/__tests__/diagram-companion-finalize.test.ts (node:test / tsx --test, assert/strict). Unit: firstCompanionValidationFailure over a HIGH-invalid er/ux/sequence/component definition each returns a retryable schema failure with non-empty details; over a valid, a MED/LOW-only, and a no-companion body returns undefined. Integration: drive finalizeDesignStory/finalizeDesignEpic (and the standalone-LLD path) with a HIGH-invalid companion -> {ok:false, failure:{kind:'schema', retryable:true}} and NO artifact written; the corrected (valid) body -> {ok:true} with the companion rendered + present in body.companions; an already-valid body -> {ok:true} with no failure/retry; a valid definition whose renderer throws DiagramGenerationError -> {ok:true} with that companion absent (infra-swallow preserved); and the author's definition JSON byte-identical after both a failed and a successful finalize.

**Acceptance checks:**
- Unit tests cover the gate over all four companion kinds (HIGH-invalid -> failure) plus the valid / MED-LOW-only / no-companion cases (-> undefined) [ac1, ac3]
- Integration tests prove surface+retry with no artifact written [ac1], retry-then-render for a corrected definition [ac2], the no-regression valid path [ac3], and the byte-identical author definition [ac4]
- An integration test proves the DiagramGenerationError infra path still resolves {ok:true} with the companion absent (infra-swallow preserved)
- The full workflow test sweep (npx tsx --test 'src/workflow/**/*.test.ts') runs green

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| firstCompanionValidationFailure with a HIGH-invalid erDefinition -> returns {ok:false, kind:'schema', retryable:true, details non-empty} | `t2` |
| HIGH-invalid uxDefinition / sequenceDefinition / componentDependencyDefinition -> each returns a failure (lc1) | `t2` |
| no companion definitions -> returns undefined | `t2` |
| MED/LOW-only definition -> returns undefined (HIGH threshold) | `t2` |
| valid definition -> returns undefined | `t2` |
| finalizeDesignStory/Epic with a HIGH-invalid companion -> {ok:false, failure:{kind:'schema', retryable:true}} and NO artifact written | `t2` |
| standalone-LLD path with a HIGH-invalid definition -> same failure (lc1) | `t2` |
| same body corrected to valid -> {ok:true}, companion rendered + present in body.companions (ac2) | `t2` |
| already-valid definition -> {ok:true}, rendered, no failure/retry (ac3) | `t2` |
| valid definition whose renderer throws DiagramGenerationError -> {ok:true} with that companion absent (infra-swallow preserved) | `t2` |
| the author's definition JSON in the body is byte-identical to input (no machine rewrite, ac4) | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails + dataModelChanges — the firstCompanionValidationFailure gate + FinalizeResult failure-arm invariant-change wired into the three finalizers` — "A HIGH companion-validation finding yields {ok:false, failure} (schema-kind, retryable:true, details[]=HIGH messages) before any write; the gate runs the four validators."
- **[[c2]]** `prior-artifact` `LLD s1 errorPaths.invariantsToPreserve — infra-swallow stays distinct, no-partial-write, no machine-rewrite, HIGH-only threshold` — "The DiagramGenerationError infra-swallow remains; no artifact is written on a failure; the author's definition is never rewritten; only HIGH gates."
- **[[c3]]** `prior-artifact` `LLD s1 migration — add the gate, wire it into the three finalizers before the render block, remove the redundant helper HIGH-branches` — "The *ForBody helpers become render-only (HIGH-branch removed) while their absent-definition + DiagramGenerationError swallow stay; valid path byte-identical."
- **[[c4]]** `prior-artifact` `LLD s1 testStrategy — unit gate tests + integration finalizer tests extending diagram-companion-finalize.test.ts` — "Unit tests over the gate for all four kinds + valid/MED-LOW/no-companion; integration tests for surface+retry, no-partial-write, retry-then-render, infra-swallow, byte-identical author definition."

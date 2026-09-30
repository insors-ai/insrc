<!-- insrc:artifact LLD-9b72686c1746af2b-s1 -->

# LLD: E202609309b72686c:S001

## Summary

**Epic:** `harden-insrc-artifact-creation-flows-two`
**HLD base run:** `wf-1790749192360-iyxm4i`
**HLD effective hash:** `a96cc61752b7...`

S001 turns the silent drop of a malformed authored companion (ER, UX mock, sequence, component-dependency) into an actionable, author-visible retry. Today the finalize render helpers validate an authored definition and, on a HIGH finding, log a warning and return nothing, so the artifact is written without the visual it references. This Story lifts that validation into a single pre-render gate at the three finalizers: when any authored companion definition carries a HIGH validation finding, finalize returns its existing FinalizeResult failure (schema-kind, retryable, carrying the specific error messages), which the client-driven synthesize phase already maps to a retryable error that re-requests the turn. The docgen infra-failure path (DiagramGenerationError) stays a swallow, and the author's definition is never machine-rewritten.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

> See **HLD-9b72686c1746af2b** § 2. Framework summary

**Rollout phase:** Phase A — Foundational fixes (two silent-failure regressions)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Private to S002: the build-step validate standalone branch reaching the shared BUILD record writer (sc1). — owns `sc1`
- `s3`: Private to S003: additive omit-slot summary + feedback sections in the BUILD record renderer; consumes sc1.

## 2. Contract details

**Surface level:** internal

### 2.1 `finalizeDesignEpic`

```typescript
(intent: WorkflowIntent, stepOutputs: Readonly<Record<string, unknown>>, runId: string, elapsedMs: number, llmResponse: Record<string, unknown>, model: string, attribution?: ArtifactModelAttribution) => Promise<FinalizeResult>
```

**Parameters:**
- `llmResponse: Record<string, unknown>` — The synthesizer body carrying any authored er/ux/sequence/component-dependency definition to validate before rendering.

**Returns:** `Promise<FinalizeResult>` — Unchanged type. NEW: when an authored companion definition has a HIGH validation finding, resolves {ok:false, failure} (schema-kind, retryable:true, details[]=HIGH messages) BEFORE any write; otherwise renders companions and resolves {ok:true} as today.

**Errors:**
- `FinalizeResult failure (kind:'schema', retryable:true)` when Any authored companion definition in the HLD body has one or more HIGH validation findings.

**Preconditions:**
- Runs the new private gate firstCompanionValidationFailure(body) immediately before the render block (orchestrator.ts:1744-1750).

**Postconditions:**
- No artifact is written when the gate fires (no partial write).
- The author's companion definition JSON is unchanged (validation only reads it).

### 2.2 `finalizeDesignStory`

```typescript
(intent: WorkflowIntent, stepOutputs: Readonly<Record<string, unknown>>, runId: string, elapsedMs: number, llmResponse: Record<string, unknown>, model: string, attribution?: ArtifactModelAttribution) => Promise<FinalizeResult>
```

**Parameters:**
- `llmResponse: Record<string, unknown>` — The synthesizer LLD body carrying any authored companion definitions to validate before rendering.

**Returns:** `Promise<FinalizeResult>` — Unchanged type; same gate behaviour as finalizeDesignEpic, applied at BOTH the design.story finalize block (:2095-2100) and the standalone-LLD finalize block (:2246-2251) so a standalone LLD gets the same surface+retry (lc1).

**Errors:**
- `FinalizeResult failure (kind:'schema', retryable:true)` when Any authored companion definition in the LLD body has HIGH findings, on either the design.story or the standalone-LLD path.

**Preconditions:**
- Runs firstCompanionValidationFailure(body) before the render block on BOTH companion-rendering finalize paths.

**Postconditions:**
- No LLD artifact is written when the gate fires.
- The author's definition JSON is unchanged.

### 2.3 `renderErCompanionForBody`

```typescript
(body: { erDefinition?: ErDefinition; functionalDefinition?: FunctionalDefinition }, destPath: string, repoPath: string) => Promise<CompanionArtifactRef | undefined>
```

**Parameters:**
- `body: { erDefinition?: ErDefinition; functionalDefinition?: FunctionalDefinition }` — The already-gate-validated body; renders the ER companion for a valid definition.

**Returns:** `Promise<CompanionArtifactRef | undefined>` — Unchanged type. The internal HIGH-validation branch (:1521-1525) is REMOVED (the gate rejects upstream); absent-definition early-return and the DiagramGenerationError infra-swallow are retained.

**Errors:**
- `(none surfaced)` when A DiagramGenerationError from the underlying renderer is caught and swallowed (returns undefined) — an infra failure is not the author's fault and must not trigger a retry.

**Preconditions:**
- The body's erDefinition has already passed the finalizer gate.

**Postconditions:**
- A valid erDefinition renders er-model.html and returns its CompanionArtifactRef; the definition is unchanged.

### 2.4 `renderUxCompanionForBody`

```typescript
(body: { uxDefinition?: UxDefinition; functionalDefinition?: FunctionalDefinition }, destPath: string, repoPath: string) => Promise<CompanionArtifactRef | undefined>
```

**Parameters:**
- `body: { uxDefinition?: UxDefinition; functionalDefinition?: FunctionalDefinition }` — The already-gate-validated body; renders the UX mock for a valid definition.

**Returns:** `Promise<CompanionArtifactRef | undefined>` — Unchanged type. The internal HIGH-validation branch (:1557-1561) is REMOVED (the gate rejects upstream); absent-definition and DiagramGenerationError infra-swallow are retained.

**Errors:**
- `(none surfaced)` when A DiagramGenerationError is caught and swallowed as today.

**Preconditions:**
- The body's uxDefinition has already passed the finalizer gate.

**Postconditions:**
- A valid uxDefinition renders ux-mock.html and returns its CompanionArtifactRef; the definition is unchanged.

### 2.5 `renderDiagramCompanionsForBody`

```typescript
(body: { sequenceDefinition?: SequenceDefinition; componentDependencyDefinition?: ComponentDependencyDefinition }, destDir: string, repoPath: string) => Promise<readonly CompanionArtifactRef[]>
```

**Parameters:**
- `body: { sequenceDefinition?: SequenceDefinition; componentDependencyDefinition?: ComponentDependencyDefinition }` — The already-gate-validated body; renders the sequence and/or component companions for valid definitions.

**Returns:** `Promise<readonly CompanionArtifactRef[]>` — Unchanged type. The internal HIGH-validation skip branches (:1596-1599, :1614-1616) are REMOVED (the gate rejects upstream); each definition's DiagramGenerationError infra-catch is retained so a valid definition still renders when its sibling's render fails at the infra level.

**Errors:**
- `(none surfaced)` when A DiagramGenerationError for either definition is caught and swallowed per-definition as today.

**Preconditions:**
- The body's sequence/component definitions have already passed the finalizer gate.

**Postconditions:**
- Each valid definition renders its sibling HTML and its CompanionArtifactRef is included; the definitions are unchanged.

## 3. Data model changes

### 3.1 `FinalizeResult (failure arm)` — invariant-change

A HIGH companion-validation finding now yields {ok:false, failure} of kind:'schema' with retryable:true and details[]=the HIGH DimensionFinding.message strings, instead of the prior outcome where the companion was dropped and finalize still resolved {ok:true}. The failure flows unchanged through synthesize.ts (code=synthesize-schema, retryable) to re-prompt the author. New private producer firstCompanionValidationFailure(body): ValidationResult | undefined runs the four existing validators over the body's authored definitions and mints this failure via the schemaFailure shape (extended with details + retryable:true).

**Call sites:**
- `src/workflow/orchestrator.ts:1744`
- `src/workflow/orchestrator.ts:2095`
- `src/workflow/orchestrator.ts:2246`
- `src/mcp/workflow-step/phases/synthesize.ts:54`

## 4. Error paths

**Error cases**

- **An authored companion definition (er/ux/sequence/component-dependency) in the finalize body violates its strict schema (a HIGH validation finding).** (recoverable)
  - Detection: The new firstCompanionValidationFailure(body) gate runs the four existing validators over whichever definitions the body carries and finds at least one DimensionFinding with severity==='HIGH'.
  - Response: Return {ok:false, failure:{kind:'schema', message, details:[HIGH messages], retryable:true}} from the finalizer BEFORE any write; synthesize.ts:54-59 maps it to errorResult('synthesize-schema', formatFailure, retryable:true) which re-requests the synthesize turn.
  - User impact: The author receives the specific validation errors and is asked to correct the definition, instead of silently getting a document referencing a companion that never rendered.
- **A companion definition is valid but the underlying docgen renderer fails (infra error) throwing DiagramGenerationError.** (terminal)
  - Detection: The existing per-helper try/catch around renderErCompanion/renderUxCompanion/renderSequenceCompanion/renderComponentCompanion catches DiagramGenerationError (render.ts:42).
  - Response: Swallow as today — log.warn and return undefined (ER/UX) or skip that ref (diagrams); do NOT convert to a FinalizeResult failure. A docgen infra failure is not an author error and a re-emit of the same valid definition would not fix it.
  - User impact: The artifact is written without that one companion picture, exactly as today; the author is not prompted to fix something that is not their fault.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A finalize body carrying NO authored companion definitions. | firstCompanionValidationFailure returns undefined; finalize proceeds to write with no companions and resolves {ok:true} exactly as today (no regression). |
| A body carrying two authored definitions where one has a HIGH finding and the other is valid. | The gate fires on the invalid one and finalize returns a single {ok:false, failure} (no partial write) rather than rendering the valid one and dropping the invalid one; on the corrected retry both are validated and rendered. |
| A definition whose findings are all MED/LOW (no HIGH). | The gate does not fire (thresholds on HIGH, matching the existing problems.some(f=>f.severity==='HIGH') check); the companion renders as today. |

**Invariants to preserve**

- A DiagramGenerationError (docgen infra failure) stays a swallow and is never surfaced as a retryable author error — the author-error path (HIGH validation) and the infra-failure path remain distinct. [[c2]]
- When finalize returns a FinalizeResult failure, no markdown/json artifact is written (no partial write), matching finalizeArtifact's existing schemaFailure behaviour. [[c2]]
- The authored companion definition is validated and rendered deterministically; the framework never machine-rewrites the author's definition JSON (author is source of truth). [[c2]]
- Only a HIGH-severity validation finding gates finalize; MED/LOW findings do not block companion rendering. [[c2]]

## 5. Test strategy

**Test framework:** `node:test (node --test / tsx --test), assert/strict — the repo convention used by src/workflow/__tests__/*.test.ts`

**Test levels**

- **unit** — Exercise the new firstCompanionValidationFailure gate in isolation over each authored companion kind, plus the no-companion / MED-LOW-only / valid edge cases.
  - Subjects: `firstCompanionValidationFailure with a HIGH-invalid erDefinition -> returns {ok:false, kind:'schema', retryable:true, details non-empty}`, `HIGH-invalid uxDefinition / sequenceDefinition / componentDependencyDefinition -> each returns a failure (lc1)`, `no companion definitions -> returns undefined`, `MED/LOW-only definition -> returns undefined (HIGH threshold)`, `valid definition -> returns undefined`
  - Fixtures: `A HIGH-invalid uxDefinition fixture (the malformed Adaptive Cards shape from the reproduction)`, `One HIGH-invalid fixture per other kind`, `A known-valid fixture per kind`
- **integration** — Drive the finalizers end-to-end (mirroring diagram-companion-finalize.test.ts) to prove surface-vs-swallow, no-partial-write, retry-then-render, and the untouched infra-swallow.
  - Subjects: `finalizeDesignStory/Epic with a HIGH-invalid companion -> {ok:false, failure:{kind:'schema', retryable:true}} and NO artifact written`, `standalone-LLD path with a HIGH-invalid definition -> same failure (lc1)`, `same body corrected to valid -> {ok:true}, companion rendered + present in body.companions (ac2)`, `already-valid definition -> {ok:true}, rendered, no failure/retry (ac3)`, `valid definition whose renderer throws DiagramGenerationError -> {ok:true} with that companion absent (infra-swallow preserved)`, `the author's definition JSON in the body is byte-identical to input (no machine rewrite, ac4)`
  - Fixtures: `A finalize harness over finalizeDesignStory/finalizeDesignEpic (extend diagram-companion-finalize.test.ts)`, `A stub to force DiagramGenerationError for the infra-swallow case`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: firstCompanionValidationFailure returns a retryable schema failure for a HIGH-invalid ux/er/sequence/component definition`, `integration: finalizeDesignStory/Epic with a HIGH-invalid companion resolves {ok:false, failure:{kind:'schema', retryable:true}} and writes no artifact` |
| `ac2` | `integration: finalize with the corrected (now-valid) definition resolves {ok:true} and the companion is rendered + present in body.companions` |
| `ac3` | `integration: finalize with an already-valid companion resolves {ok:true}, rendered, no failure and no retry`, `unit: firstCompanionValidationFailure returns undefined for a valid and for a MED/LOW-only definition` |
| `ac4` | `integration: after a HIGH-invalid finalize failure and after a valid finalize, the author's companion definition JSON in the body is unchanged` |

## 6. Migration

**State before:** The finalize render helpers in orchestrator.ts validate an authored companion definition and, on a HIGH finding, log.warn + return undefined (ER :1521-1525, UX :1557-1561) or log.warn + skip the ref (sequence :1596-1599, component :1614-1616). Because the helpers return only CompanionArtifactRef|undefined or CompanionArtifactRef[], the HIGH finding cannot cross the signature, so each finalizer (finalizeDesignEpic:1744, finalizeDesignStory:2095, standalone-LLD:2246) writes the artifact and resolves {ok:true} with the companion silently dropped. The retry machinery (synthesize.ts:54-59) already exists but is never reached for a companion-validation failure.

**State after:** A single pre-render gate firstCompanionValidationFailure(body) runs the four existing validators before rendering; when any has a HIGH finding the finalizer returns {ok:false, failure:{kind:'schema', retryable:true, details:[HIGH messages]}} with no artifact written, and synthesize.ts re-prompts the author. The *ForBody helpers become render-only (their HIGH-validation branch removed) while their absent-definition and DiagramGenerationError infra-swallow behaviours are unchanged. The valid path is byte-identical.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the private gate helper firstCompanionValidationFailure(body): ValidationResult | undefined in orchestrator.ts that runs the four validators over whichever definitions the body carries and returns a schema-kind retryable ValidationFailure (message + details from the HIGH DimensionFinding messages) if any HIGH finding is present, else undefined. — ↩ rollbackable
2. Call the gate immediately before the companion render block in all three finalizers and return {ok:false, failure} when it fires — before any write (no partial write). — ↩ rollbackable
3. Remove the now-redundant HIGH-validation branch inside each *ForBody helper, keeping the absent-definition early-return and the DiagramGenerationError try/catch swallow intact. — ↩ rollbackable
4. Add the unit tests for the gate and the integration tests over the finalizers (extending diagram-companion-finalize.test.ts) covering surface+retry, no-partial-write, retry-then-render, no-regression, infra-swallow-preserved, and no-machine-rewrite. — ↩ rollbackable

**Backward compat:** The changed helpers are private to orchestrator.ts and the FinalizeResult type is unchanged, so no public API or persisted artifact schema changes. The only observable behaviour change is intended (k1): an artifact whose authored companion definition is HIGH-invalid, today written with the companion silently dropped, now returns a retryable failure until the author corrects it. Artifacts with valid or absent companion definitions finalize byte-identically. Ships with a daemon rebuild; no in-flight run state depends on the old behaviour.

## 7. Alternatives considered

### 7.1 a1: Shared pre-render validation gate at the finalize sites — **CHOSEN**

One helper validates all authored companion definitions before rendering; each finalizer short-circuits to {ok:false, failure} on a HIGH finding.

Add a private helper firstCompanionValidationFailure(body) that runs the four existing validators over the body's authored definitions, collects HIGH messages, and returns a schema-kind retryable ValidationFailure if any HIGH (else undefined). Each of the three finalizers calls it before the render block and returns {ok:false, failure} when it fires, before any write. The *ForBody helpers become render-only; their DiagramGenerationError infra-catch stays a swallow.

### 7.2 a2: Result-union return from each *ForBody helper

Change the render helpers to return ref-or-failure; the finalize sites propagate the first companion failure.

Widen ER/UX helpers to return {ref?} | {failure} and the diagram helper to {refs, failure?}; a HIGH finding returns a failure, an infra error returns the no-failure outcome. The finalize sites propagate the first failure.

### 7.3 a3: Typed throw caught by finalizeArtifact's existing converter

Helpers throw a CompanionValidationError on a HIGH finding; finalizeArtifact's catch converts it to a retryable schema failure.

The *ForBody helpers throw a CompanionValidationError on a HIGH finding (still swallowing DiagramGenerationError); finalizeArtifact's existing try/catch, which already converts a throw into a retryable schema failure, is extended to fold its findings into details[].

## 8. References

- **[[c1]]** `analyze-bundle` `s1 'finalize->synthesize retry contract' — orchestrator.ts:379-381 (FinalizeResult), synthesizer.ts:49/:75 (ValidationFailure), synthesize.ts:46-59 (failure->retryable error mapping)` — "synthesize.ts already maps a FinalizeResult failure to errorResult('synthesize-'+kind, retryable) which re-prompts the author; surfacing a schema-kind ValidationFailure is all S001 needs (k1) and neve"
- **[[c2]]** `analyze-bundle` `s1 'companion-validation swallow sites' — orchestrator.ts:1512-1631 (renderEr/Ux/DiagramCompanionsForBody), validators in companion/{er,ux,sequence,component}.ts, code-review/types.ts:42 (DimensionFinding), render.ts:42 (DiagramGenerationError)` — "Each helper validates then, on a HIGH finding, log.warn + returns undefined/skips (swallow); the DiagramGenerationError infra-catch is a distinct swallow that must remain (not an author error)."
- **[[c3]]** `analyze-bundle` `s1 'finalize call sites + no-partial-write precedent' — orchestrator.ts:1744/2095/2246 (the three finalize render blocks), :416-424 + :482 (finalizeArtifact catch + schemaFailure), issue-artifact.test.ts:214 (invalid body -> retryable schema failure, no partial write), bugfix/mount.ts:92 (a throw becomes an ok:false)` — "finalizeArtifact already converts an invalid body into a retryable schema failure with no partial write — the precedent the companion gate mirrors at the three finalize sites."
- **[[c4]]** `analyze-bundle` `s1 'existing test harness' — diagram-companion-finalize.test.ts:15 (drives renderDiagramCompanionsForBody through a finalizer), adjacent-scope-gate.test.ts:102/:237 (assert result.failure.retryable)` — "diagram-companion-finalize.test.ts already exercises the private companion seam through a finalizer — the harness S001's surface+retry tests extend."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-09-30T07:29:52.440Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | auto | FinalizeResult is a discriminated union at orchestrator.ts:379-381 whose failure arm is {ok:false, failure: ValidationResult}. | Confirmed: orchestrator.ts:379 `export type FinalizeResult =` and (per HLD probe) :381 `\| { readonly ok: false; readonly failure: ValidationResult }` — the two-arm union with the failure channel S001 reuses resolves verbatim. | accept |
| cl2 | closed-union | LOW | auto | There are exactly four authored companion validators (validateErDefinition, validateUxDefinition, validateSequenceDefinition, validateComponentDependencyDefinition), one per companion kind. | Confirmed: the grep re-derived exactly the four validators — validateComponentDependencyDefinition (component.ts:81), validateErDefinition (er.ts:102), plus validateUxDefinition (ux.ts:150) and validateSequenceDefinition (sequence.ts:93) — one per authored companion kind (closed union holds). | accept |
| cl3 | citation | LOW | auto | renderErCompanionForBody currently swallows a HIGH validation finding (log.warn + return undefined) at orchestrator.ts:1521-1525. | Confirmed: the read anchor orchestrator.ts:1521 resolves (found:true) and the `f.severity === 'HIGH'` pattern is the exact threshold the swallow branch uses; renderErCompanionForBody's HIGH -> log.warn -> return undefined block sits at :1521-1525 as claimed. | accept |
| cl4 | inventory | LOW | auto | The companion render helper renderErCompanionForBody is invoked from three finalize call sites (orchestrator.ts:1744, :2095, :2246) plus its single definition. | Confirmed: all three read anchors orchestrator.ts:1744, :2095, :2246 resolve (found:true) as renderErCompanionForBody call sites — the three finalize render blocks the gate must guard. | accept |
| cl5 | citation | LOW | auto | synthesize.ts maps a FinalizeResult failure to a retryable error (code=`synthesize-${failure.kind}`, retryable=failure.retryable??true) at synthesize.ts:54-59. | Confirmed verbatim: synthesize.ts:55 `const code = failure.ok ? 'synthesize-unknown' : `synthesize-${failure.kind}`` and :58 `const retryable = failure.ok ? true : (failure.retryable ?? true)` — the FinalizeResult-failure -> retryable-error mapping S001 reuses. | accept |
| cl6 | citation | LOW | auto | schemaFailure(message) at orchestrator.ts:482 returns a ValidationResult of {ok:false, kind:'schema', message} (retryable defaults true). | Confirmed verbatim: orchestrator.ts:482 `function schemaFailure(message: string): ValidationResult {` — the schema-kind failure constructor the gate mints from. | accept |
| cl7 | citation | LOW | auto | The underlying companion renderer throws DiagramGenerationError (message built at render.ts:42), which the *ForBody helpers catch and swallow. | Confirmed: the read anchor companion/render.ts:42 resolves (found:true) — the DiagramGenerationError message construction; the *ForBody helpers catch it as the distinct infra-swallow path. | accept |
| cl8 | citation | LOW | auto | An existing test harness drives the private renderDiagramCompanionsForBody seam through a finalizer at diagram-companion-finalize.test.ts. | Confirmed: the read anchor __tests__/diagram-companion-finalize.test.ts:15 resolves (found:true) — the existing harness that drives renderDiagramCompanionsForBody through a finalizer, which the S001 tests extend. | accept |
| cl9 | semantic | LOW | auto | The companion validators return readonly DimensionFinding[]; DimensionFinding carries a severity field (defined at code-review/types.ts:42). | Confirmed: interface DimensionFinding is declared in src/workflow/code-review/types.ts (carrying the severity field), the type the four validators return as readonly DimensionFinding[]. | accept |
| cl10 | semantic | LOW | auto | ValidationFailure (synthesizer.ts:49) carries an optional details:string[] and an optional retryable:boolean, so a schema-kind failure can carry the HIGH findings' messages and be retryable. | Confirmed verbatim: synthesizer.ts:49 `export interface ValidationFailure {`, :56 `readonly details?: ReadonlyArray<string>` and :62 `readonly retryable?: boolean` — a schema-kind failure can carry the HIGH messages in details[] and be retryable, exactly as the design relies on. | accept |

<!-- insrc:artifact HLD-9b72686c1746af2b -->

# HLD: harden-insrc-artifact-creation-flows-two

## Summary

The chosen framework fixes both failure modes on the seams that already exist, adding no new workflow phase or protocol. For design documents, a companion definition that fails its strict schema stops being swallowed at finalize and instead becomes a normal finalize failure carrying the specific errors — which the existing synthesize retry already turns into a re-prompt, so the author repairs the definition and the picture renders. For builds, the build-step validation gains a standalone branch so a small standalone story reaches the same record writer every other story uses, and that record grows a plain-language change summary plus a build-cycle feedback slot as additive, omit-slot sections.

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

## 1. Problem context

> See **DEF-9b72686c1746af2b** § 1. Problem

## 2. Framework summary

Both halves of the Epic are delivered by extending existing seams rather than introducing new machinery, which is why alternative a1 was chosen over tightening the emit schema (a2, schema-duplication drift) or adding a dedicated validation phase (a3, protocol change near a non-goal). For the design-artifact half (S001), the strict companion validators already run at finalize; the framework's single change is to stop the finalize render helpers swallowing a HIGH finding and instead let finalizeArtifact return its existing FinalizeResult failure carrying the validation errors. The client-driven synthesize phase already maps a FinalizeResult failure to a retryable error that re-prompts the author, so surface-and-retry (k1) is achieved with the proven path and the author's definition is only surfaced, never rewritten (k2). Because all four authored companion kinds (ER, UX, sequence, component-dependency) pass through the same finalize helpers, the behaviour is uniform (lc1).

For the build half (S002 + S003), the framework treats the BUILD ledger record as a shared contract owned by the story that makes it reachable for every story. S002 gives build-step validate a standalone branch that mirrors the existing standalone handling in implement, so a Small standalone story resolves its identity without the plan-driven task resolver and reaches the existing persistBuildRecord upsert + collectBuildChangeLog path (k3), while a persist failure stays fail-open (k5). S003, which depends on S002, extends that same record with a narrative change summary and a build-cycle feedback slot as additive omit-slot sections of the body and its renderer, so a record carrying neither is byte-identical to today's output (k4).

## 3. Architecture shape

Two independent seams under one Epic. Seam one is the design-synthesis path: workflow-step synthesize -> finalizeArtifact -> (companion validators + validateBodyAndCitations) -> FinalizeResult; the change moves companion-validation failure from a swallowed warn into the FinalizeResult failure channel that already re-prompts. Seam two is the build path: build-step validate -> (target resolution) -> persistBuildRecord (standalone-record.ts) -> BUILD-<hash>-<story> record + rendered markdown; the changes add a standalone resolution branch (S002) and additive summary/feedback slots on the record contract (S003). The two seams share no code; S001 is isolated, and S002 -> S003 is the only dependency edge.

## 4. Diagrams

- [Sequence diagram](docs/epics/harden-insrc-artifact-creation-flows-two-E202609309b72686c/sequence-diagram.html)

## 5. Shared contracts

### 5.1 sc1: BUILD ledger record contract

**Owner Story:** `s2`
**Consumed by:** `s3`

**Purpose:** The persisted BUILD-<epicHash>-<storyId> record shape + its writer, made reachable for every story (S002) and enriched with an optional change summary + feedback (S003). S003 depends on S002, so it consumes the contract its owner establishes.

**Interface sketch (type-level):**

```
// type-level only
interface BuildRecord {
  readonly meta: {
    readonly workflow: 'build';
    readonly standalone: boolean;
    readonly epicHash: string;
    readonly storyId: string;
    readonly createdAt: string;
    readonly updatedAt?: string | undefined;
    readonly approvedAt?: string | undefined;
    // ...existing completion/rejection stamps preserved verbatim
  };
  readonly body: {
    readonly tasks?: readonly { readonly id: string; readonly passed?: boolean } []| undefined;
    readonly changeLog?: ChangeLog | undefined;      // existing (S002 populates for standalone)
    readonly feedback?: FeedbackRecord | undefined;  // existing field; S003 captures in-cycle
    readonly summary?: string | undefined;           // NEW (S003) omit-slot narrative change summary
    // ...existing focus/producesLld/commit
  };
}
// writer stays an upsert; persist failure is fail-open (k5)
declare function persistBuildRecord(repoPath: string, rec: BuildRecord): { md: string; json: string };
```

**Assumptions cited:** [[c1]] [[c5]]

## 6. Story boundaries

### 6.1 Story E202609309b72686c:S001


Entirely private to S001: the change to the finalize render helpers (renderErCompanionForBody / renderUxCompanionForBody / renderDiagramCompanionsForBody) so a HIGH companion-validation finding yields a finalize failure instead of a swallowed warn, and the plumbing that routes that failure through the existing FinalizeResult -> synthesize retryable-error path. No other story consumes this; S001 has no dependents and no dependencies. The retry semantics themselves are the existing synthesize contract, unchanged.

### 6.2 Story E202609309b72686c:S002

**Owns:** `sc1`

Private to S002: the build-step validate standalone branch that resolves a Small standalone story's identity (from the standalone inputs) without the plan-driven resolveTaskRef, so it reaches the shared BUILD record writer. The record contract it establishes is shared (sc1); the resolution branch itself is internal.

### 6.3 Story E202609309b72686c:S003

**Depends on:** `sc1`

Private to S003: the additive omit-slot rendering of the new summary + feedback sections in the BUILD record markdown renderer, and the capture of build-cycle feedback into the record. It consumes the sc1 record contract established by S002 and extends its body with the optional summary slot; the omit-slot rendering + capture wiring are internal.

## 7. Non-functional targets

- **Performance:** No new LLM calls. Companion validation is the existing deterministic ajv/validator pass already run at finalize; S001 only changes how its result is propagated. Build-record changes are local filesystem writes as today.
- **Observability:** Companion-validation failures move from a silent warn to a first-class, author-visible retry message carrying the specific errors; the existing warn logs may remain for operators.
- **Durability:** The BUILD record writer stays an upsert that preserves createdAt + completion/rejection stamps; a persist failure is swallowed so it never converts a real build verdict into an error (k5).

## 8. Rollout

**Phase A — Foundational fixes (two silent-failure regressions)**

**Stories:** `s1`, `s2`

S001 (companion validation surface+retry) and S002 (standalone BUILD record) are independent — they touch disjoint seams (design-synthesis vs build path) and neither depends on the other — so they land together as the foundational fixes. S002 also establishes the shared BUILD-record contract (sc1) that Phase B consumes, so it must precede S003.

**Backward compat:** Preserve the valid-companion render path unchanged (a conforming definition still renders + links with no extra prompting — ac3); preserve the plan-driven build-record path and the fail-open persist (k5). The standalone branch is additive — it must not alter plan-driven target resolution.

**Phase B — BUILD-record enrichment**

**Stories:** `s3`

S003 depends on S002 and consumes the sc1 BUILD-record contract it establishes, so it lands after Phase A. It adds the narrative summary + build-cycle feedback as additive omit-slot sections.

**Backward compat:** A BUILD record that carries neither a summary nor feedback must render byte-identically to today's output (omit-slot, not empty sections — k4).

**Ordering rationale:** Two independent seams under one Epic. S001 and S002 have no dependency between them and can be built in either order within Phase A; grouping them as the foundational phase fixes both silent-failure regressions first. The only hard ordering edge is sc1 (owned by S002) -> S003 (consumer), so S003 is Phase B after S002. No feature flags are needed because every change either fixes a broken path or is additive/omit-slot on the valid paths.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| S001 — retryable classification of a companion-validation failure | If the companion failure is mapped to a NON-retryable finalize failure, the driver would abort the run instead of re-prompting the author, defeating k1. | Route the companion failure through the same retryable schema-failure channel validateBodyAndCitations uses (synthesize maps it to a retryable errorResult); add a test asserting the synth turn is re-requested, not aborted. |
| S001 — regressing the valid companion path | Changing the finalize helpers to return a failure on HIGH findings risks accidentally failing a valid definition or dropping a valid companion's render. | Cover ac3 with a regression test (a conforming definition renders + links with no retry) across all four companion kinds, and keep the swallow only for non-HIGH/absent cases exactly as today. |
| S002 — standalone branch must not disturb the plan-driven validate path | validate.ts currently resolves every target via resolveTaskRef; adding a standalone branch could change resolution for plan-driven builds if mis-gated. | Gate the standalone branch strictly on the presence of the standalone inputs (mirroring implement.ts), leaving resolveTaskRef untouched for plan-driven builds; keep the existing plan-driven build-step tests green. |

## 9. Alternatives considered

### 9.1 a1: Reuse the existing finalize-failure→retry contract; extend the build-record writer in place — **CHOSEN**

For S001, turn a companion-definition validation failure into a first-class finalize failure that flows through the SAME FinalizeResult→synthesize-retry path validateBodyAndCitations already uses; for S002/S003, give build-step validate a standalone branch and add omit-slot summary/feedback to the existing BuildRecord writer.

The design keeps every change on the seams that already exist. For S001, the strict companion validators (validateUxDefinition and the ER/sequence/component peers) already run at finalize — the only defect is that their HIGH findings are swallowed inside the render helpers before validateBodyAndCitations. The framework stops swallowing: a companion definition that carries a HIGH finding makes finalizeArtifact return {ok:false, failure} carrying the specific validation errors, exactly like a body/citation failure. The client-driven synthesize phase already maps that to a retryable errorResult that re-prompts the author, so no new phase, state, or protocol is introduced; the author's definition is never rewritten (only surfaced), and the valid path is unchanged. This covers all four companion kinds uniformly because they all pass through the same finalize helpers.

For the build-record seam, S002 gives build-step validate a standalone branch that mirrors implement's existing standalone handling (resolve the story identity from the standalone inputs instead of the plan-driven resolveTaskRef) so a Small standalone story reaches the existing persistBuildRecord + collectBuildChangeLog path. S003 adds a narrative summary and an in-cycle feedback slot to the existing BuildRecord body and its renderer as additive omit-slot sections, so a record without them is byte-identical. Both reuse the current upsert + fail-open writer, honouring k4 and k5.

**Pros:**
- No new workflow phase, state token, or protocol — S001 reuses the FinalizeResult→synthesize retry that already re-prompts on body/citation failures (synthesize.ts:54, orchestrator.ts:381), so the retry semantics are already proven
- Honours k2 by construction: the failure carries only the validation errors, the daemon never rewrites the author's definition
- Smallest change surface for the build seam: S002 mirrors implement's standalone branch and S003 adds omit-slot sections to the existing renderer, preserving k4 byte-identity and k5 fail-open with no writer redesign
- All four companion kinds are covered at one choke point (the finalize helpers), satisfying lc1 without per-kind protocol

**Cons:**
- The strict validation still runs at finalize (after the author has authored the whole body), so the author learns of a malformed companion one turn later than an emit-time schema rejection would
- Requires care that a companion failure returns a RETRYABLE finalize failure (not a hard non-retryable one) so the driver re-prompts rather than aborts the run

**Cost estimate:** M

### 9.2 a2: Tighten the emit-time schemas so a malformed companion is rejected before finalize

Replace the loose emit-schema property fragments (body.items:{type:object}) with the full strict Adaptive Cards / diagram vocabulary so the synth-emit ajv validation rejects a malformed companion at emit time and re-prompts before finalize; build seam handled as in a1.

This alternative moves the companion validation earlier, to the emit-schema. Today UX_DEFINITION_PROPERTY_SCHEMA and its ER/sequence/component peers keep the definition body loose because they were originally admit-but-never-emit; the fix makes them strict so the ajv validation the synthesize schema already performs on the emitted artifact rejects a non-conforming companion at emit time and returns the schema errors for a retry. Finalize then only ever sees valid definitions, so the swallow path becomes unreachable for well-formed submissions.

The build-record seam is handled identically to a1 (standalone validate branch + omit-slot summary/feedback on the existing writer). The discriminator is purely where companion validation lives: in the emit contract rather than at finalize.

**Pros:**
- The author is told at emit time, in the same turn, before any finalize work — the tightest possible feedback loop
- Makes the emit schema self-documenting: the accepted companion shape is expressed once in the property fragment the synthesizer is handed

**Cons:**
- Duplicates the full Adaptive Cards + diagram vocabulary into the ajv property fragments, which must then be kept in lock-step with the vendored strict schemas the finalize validators use — a real drift-maintenance cost across four companion kinds
- The strict validators still exist at finalize as the source of truth, so validation is now expressed in two places; a divergence would either double-reject or let a finalize-only rule slip through
- Larger schema surface to author + test for each of the four kinds than a1's single choke point

**Cost estimate:** L

**Rejected because:** Rank 2. Meets every constraint and gives the tightest (emit-time) feedback, but duplicates the full Adaptive Cards / diagram vocabulary into the ajv emit fragments for all four kinds, which must stay in lock-step with the finalize validators (the source of truth) — a standing drift-maintenance liability a1 avoids by validating in one place.

### 9.3 a3: A dedicated companion-validation gate/phase in the workflow-step protocol

Introduce a distinct pre-finalize validation pass (a new gate or step) that validates every authored companion definition and hands back a structured retry, separate from the existing FinalizeResult path; build seam as in a1.

This alternative treats companion validation as its own concern with its own phase or gate in the workflow-step protocol: after the synthesizer emits the artifact but before finalize, a validation gate checks each companion definition and, on failure, returns a dedicated retry response listing the offending definitions and their errors. The synthesize loop gains an explicit companion-validation turn.

The build-record seam is handled as in a1. The discriminator is a new first-class protocol step rather than reusing the existing FinalizeResult failure.

**Pros:**
- Makes companion validation an explicit, independently testable stage with its own response shape
- Cleanly separates companion validation from body/citation validation, which could ease future per-kind validation policies

**Cons:**
- Adds a new phase/state to the workflow-step protocol shared by every design artifact — the most invasive change, and closest to the Epic's own non-goal of not reworking the driver protocol
- Duplicates retry machinery that already exists in the FinalizeResult→synthesize path, for no behavioural gain over a1
- Higher risk to the mandated client-driven step loop (more turns, more state) for a problem a1 solves at an existing choke point

**Cost estimate:** L

**Rejected because:** Rank 3. Meets every constraint but adds a new phase/state to the workflow-step protocol shared by every design artifact — the most invasive option and the closest to the Epic's non-goal of not reworking the driver protocol — while duplicating retry machinery a1 already reuses, for no behavioural gain.

## 10. References

- **[[c1]]** `code` `src/mcp/build-step/phases/validate.ts:64+102, implement.ts:133, src/workflow/runners/build/standalone-record.ts` — "validate uses resolveTaskRef (no standalone branch) and bails before persistBuildRecord:102; implement persists only for trivial standalone; BuildRecord.body has changeLog + feedback but no summary."
- **[[c2]]** `code` `src/workflow/orchestrator.ts:1548/1557/1587; src/workflow/artifacts/companion/ux-schema.ts:24` — "The finalize render helpers validate companion definitions and swallow a HIGH finding (warn); the emit-schema is loose."
- **[[c5]]** `prior-artifact` `Epic provenance-traceability-workflow-artifact-json-two (a0f4c1cfe262a497)` — "Added the BUILD change-log + append-only feedback field as omit-slot sections preserving byte-identity."
- **[[c6]]** `code` `src/mcp/workflow-step/phases/synthesize.ts:54; src/workflow/orchestrator.ts:377-381` — "finalizeArtifact returns a FinalizeResult {ok:false, failure} that synthesize maps to a retryable errorResult re-prompting the author."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.epic (design.epic)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-30T06:34:00.410Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c6/a1 | citation | LOW | auto | finalizeArtifact returns a FinalizeResult that is either {ok:true, finalized} or {ok:false, failure} — the failure channel S001 reuses. | Confirmed: orchestrator.ts:381 `\| { readonly ok: false; readonly failure: ValidationResult }` with a single `type FinalizeResult` union — the failure channel S001 reuses exists. | Accept — citation resolves. |
| c6/a1 | citation | LOW | auto | The workflow-step synthesize phase maps a finalize failure to a retryable errorResult that re-prompts the author (does not abort the run). | Confirmed: synthesize.ts:54 `const failure = result.failure` feeding an `errorResult(..., retryable)` — a finalize failure re-prompts, not aborts. | Accept — citation resolves. |
| c2/s1 | citation | LOW | auto | The finalize render helpers (renderUxCompanionForBody, renderDiagramCompanionsForBody) validate the authored companion and swallow a HIGH finding (return undefined + warn) rather than surfacing it. | Confirmed: orchestrator.ts:1557 `validateUxDefinition(uxDef, body.functionalDefinition)` and the 'leaving it in-body without a companion' warn (6 hits) — HIGH findings are swallowed in the render helpers. | Accept — citation resolves. |
| s1/lc1 | closed-union | LOW | auto | The authored companion kinds that pass through the same finalize helpers are exactly four: ER, UX, sequence, component-dependency. | Confirmed: all four renderers exist (renderErCompanionForBody, renderUxCompanionForBody, renderSequenceCompanion, renderComponentCompanion) — exactly four companion kinds through the finalize helpers. | Accept — closed union holds. |
| sc1/s2 | citation | LOW | auto | build-step validate resolves its target via the plan-driven resolveTaskRef with no standalone branch, bailing before persistBuildRecord. | Confirmed: validate.ts:64 `resolveTaskRef(...)` (plan-driven, no standalone branch) and :102 `persistBuildRecord(...)` after it — a standalone story bails before persisting. | Accept — citation resolves. |
| sc1/s2 | citation | LOW | auto | build-step implement already has a standalone branch (persistStandaloneBuildRecord) that S002 mirrors; it currently runs only for trivial standalone. | Confirmed: implement.ts:133 `persistStandaloneBuildRecord(...)` inside the trivial (!producesLld) branch — the standalone handling S002 mirrors exists. | Accept — citation resolves. |
| sc1 | semantic | LOW | auto | The BuildRecord body already carries changeLog + feedback (the S003 feedback slot exists) and has no summary field (the S003 summary is a NEW additive slot); persistBuildRecord is an upsert with a fail-open persist. | Confirmed: standalone-record.ts:61 body carries changeLog + feedback (no summary — verified by direct read earlier); persistBuildRecord + mergeWithPrior confirm the upsert. The S003 summary is a genuine NEW additive slot. | Accept — semantic claim holds. |
| 6 | ordering | LOW | auto | The only Story dependency edge is S003 dependsOn S002 (S001 is isolated), matching the sc1 owner(S002)->consumer(S003) relationship. | Confirmed: the DEF carries the dependsOn graph with S003 dependsOn S002 and S001 isolated — matching the sc1 owner(S002)->consumer(S003) relationship; the writer's mergeWithPrior upsert supports the shared record. | Accept — ordering holds. |

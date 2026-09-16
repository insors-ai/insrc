<!-- insrc:artifact LLD-d88062a6e63aa312-S001 -->

# LLD: S001

**Epic:** `make-code-review-work-any-subset`
**HLD base run:** `wf-1785870051230-po3dyg`
**HLD effective hash:** `d88062a6e63a...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal-shared

### `resolveCodeReviewSubject`

```typescript
(repoPath: string, epicHash: string, storyId: string, deps?: SubjectDeps) => Promise<CodeReviewSubjectResult>
```

**Parameters:**
- `repoPath: string` — Registered repo root.
- `epicHash: string` — Epic hash keying the story.
- `storyId: string` — Story id keying the (optional) LLD/plan.
- `deps: SubjectDeps` _(optional)_ — Injected requireApprovedLld/requireApprovedPlan/changedFiles/readBuildRecord (test seam).

**Returns:** `Promise<CodeReviewSubjectResult>` — {ok:true, subject} with approvedLld and/or approvedPlan possibly null; {ok:false, reason:'no-build-record'} ONLY when there are no changed files.

**Errors:**
- `no-build-record (reason)` when the changedFiles derivation throws NoBuildChangesError (unchanged) — now the ONLY ok:false reason.
- `propagated` when UnregisteredRepoError + any non-Artifact error still propagate.

**Postconditions:**
- The LLD and plan are EACH resolved in their own try mapping ArtifactMissingError|ArtifactNotApprovedError -> null (a non-Artifact error re-throws). A missing/unapproved contract is NO LONGER a failure; the resolver never returns 'no-approved-contract'. ok:true even when both are null (a trivial/no-contract story is reviewable).

### `judgeAdherence`

```typescript
(subject: CodeReviewSubject, grounding: CodeReviewGrounding, provider: LLMProvider) => Promise<DimensionResult>
```

**Parameters:**
- `subject: CodeReviewSubject` — Carries the (nullable) approvedLld + approvedPlan.
- `grounding: CodeReviewGrounding` — Changed-symbol summaries.
- `provider: LLMProvider` — The tier-resolved judge provider.

**Returns:** `Promise<DimensionResult>` — The adherence dimension result; EMPTY findings in mode C (no contract).

**Errors:**
- `propagated` when withStructuredRetry throws after MAX_ATTEMPTS when a contract IS present (unchanged); never a fabricated pass.

**Postconditions:**
- SHORT-CIRCUIT: when approvedLld===null && approvedPlan===null, return an empty DimensionResult (dimension:'adherence', findings:[]) WITHOUT any provider call — guaranteed no fabricated departure. Otherwise issue the single serial completeStructured call as today, scoped to changedFiles.

### `buildAdherencePrompt`

```typescript
(subject: CodeReviewSubject, grounding: CodeReviewGrounding, extraNote: string | undefined) => LLMMessage[]
```

**Parameters:**
- `subject: CodeReviewSubject` — Carries the nullable approvedLld + approvedPlan.
- `grounding: CodeReviewGrounding` — Changed-symbol summaries.
- `extraNote: string | undefined` — Correction from a prior validation attempt.

**Returns:** `LLMMessage[]` — The adherence judge messages, branched on which contracts are present.

**Errors:**
- `none` when pure builder; MUST NOT dereference a null approvedLld/approvedPlan (the adherence.ts:98 unconditional plan deref is the bug). Only ever called when a contract exists (judgeAdherence short-circuits mode C before building).

**Preconditions:**
- At least one of approvedLld/approvedPlan is non-null (mode A or B)

**Postconditions:**
- LLD+PLAN (mode A): includes the LLD body + the '## Approved plan' body section + implementation-correctness framing (code correctly IMPLEMENTS the plan tasks + acceptance checks AND honours the LLD). LLD only (mode B): includes the LLD body, OMITS the plan section, frames as an LLD-contract review. The trailing structural-payload order is preserved.

### `buildCoveragePrompt`

```typescript
(subject: CodeReviewSubject, grounding: CodeReviewGrounding, extraNote: string | undefined) => LLMMessage[]
```

**Parameters:**
- `subject: CodeReviewSubject` — Carries the nullable approvedPlan whose tasks[].tests are the promised tests.
- `grounding: CodeReviewGrounding` — Changed symbols + testsReaching edges.
- `extraNote: string | undefined` — Correction from a prior attempt.

**Returns:** `LLMMessage[]` — The coverage judge messages; the promised-tests framing conditioned on plan presence.

**Errors:**
- `none` when promisedTestsOf already yields [] for a null plan; no throw.

**Postconditions:**
- Plan PRESENT: keeps the promised-tests section + the missing-promised-test rule. Plan NULL (mode B or C): empty promised-tests list + framing 'no approved plan — judge testsReaching coverage of the changed symbols only; do not report missing promised tests'. testsReaching-based coverage is unchanged in all modes.

## Data model changes

### `CodeReviewSubject.approvedLld / approvedPlan` — field-modify

Widen both to nullable: approvedLld: LldArtifact | null and approvedPlan: PlanArtifact | null. The review MODE is the derivable predicate over presence: (A) both present, (B) LLD only, (C) neither — no stored mode field. conventions/quality read neither, so they are mode-agnostic.

```
CodeReviewSubject.approvedLld: LldArtifact -> LldArtifact | null; CodeReviewSubject.approvedPlan: PlanArtifact -> PlanArtifact | null
```

**Call sites:**
- `src/workflow/code-review/types.ts:97`
- `src/workflow/code-review/subject.ts:122`
- `src/workflow/code-review/dimensions/adherence.ts:98`
- `src/workflow/code-review/dimensions/coverage.ts:84`

### `CodeReviewSubjectResult (failure-reason union)` — invariant-change

Trim the failure union from {ok:false; reason:'no-approved-contract'|'no-build-record'} to {ok:false; reason:'no-build-record'}. Since neither contract is required, 'no-approved-contract' is no longer produced; removing it keeps the surface honest (no unreachable state). The handler relays reasons generically (handler.ts:176) so no handler branch is lost.

```
CodeReviewSubjectResult failure reason: 'no-approved-contract'|'no-build-record' -> 'no-build-record'
```

**Call sites:**
- `src/workflow/code-review/types.ts:107`
- `src/workflow/code-review/subject.ts:102`
- `src/mcp/code-review-step/handler.ts:176`

## Error paths

### Error cases

- **The changed-file derivation finds NO changed files (nothing built to review).** (recoverable)
  - Detection: resolveCodeReviewSubject's changedFiles derivation throws NoBuildChangesError (unchanged from today, subject.ts:110-113).
  - Response: Return {ok:false, reason:'no-build-record'} — now the ONLY ok:false path. handler.ts:176 relays it generically as a no-subject error.
  - User impact: Code review declines with a clear 'nothing changed to review' reason rather than a hollow pass.
- **The LLD (or plan) file is present on disk but its meta.approvedAt is unset (unapproved contract).** (recoverable)
  - Detection: requireApprovedLld / requireApprovedPlan throws ArtifactNotApprovedError, caught in that contract's OWN try.
  - Response: Map to null for that contract (NOT a failure). The review proceeds in the degraded mode (B if only the plan is unapproved, C if both are).
  - User impact: An in-progress story with an unapproved contract is still reviewable against whatever IS approved (or as a pure code review) — no more hard 'no-approved-contract' refusal.
- **A non-Artifact error is raised while resolving a contract (e.g. UnregisteredRepoError, a JSON parse failure on a corrupt artifact).** (terminal)
  - Detection: The catch in each contract's try re-throws anything that is NOT ArtifactMissingError|ArtifactNotApprovedError.
  - Response: Propagate — a genuine fault must surface, never be silently swallowed into a null contract that would mask corruption as 'mode C'.
  - User impact: A real repo/artifact fault fails loudly instead of degrading to a hollow no-contract review.
- **Adherence judging is requested in mode C (both contracts null) — there is no design contract to assess against.** (recoverable)
  - Detection: judgeAdherence checks approvedLld===null && approvedPlan===null at entry.
  - Response: Short-circuit: return an empty DimensionResult (dimension:'adherence', findings:[]) with NO provider call, so the model cannot fabricate a departure from a non-existent contract.
  - User impact: Mode-C reviews report zero adherence findings honestly (conventions/quality/coverage still run) instead of hallucinated ones.

### Edge cases

| Input | Expected |
| :--- | :--- |
| LLD approved, plan absent (mode B — the small-story route that Fix D targets). | ok:true, approvedLld set, approvedPlan null. Adherence judges vs the LLD contract only (buildAdherencePrompt omits the plan section). Coverage uses testsReaching only (promisedTestsOf yields []). |
| LLD absent, plan approved (asymmetric — plan without an LLD). | ok:true, approvedLld null, approvedPlan set. Adherence judges vs the plan tasks/acceptance checks (buildAdherencePrompt includes the plan section, omits the LLD body). Not the small-story route but structurally valid — no throw. |
| Both LLD and plan approved (mode A — the full feature route). | ok:true, both set. Adherence = implementation-correctness (code vs plan tasks+acceptance AND the LLD). Coverage keeps the promised-tests section. Byte-identical to today's behavior. |
| Both contracts null but there ARE changed files (mode C — a trivial story with no design artifacts). | ok:true, both null. Adherence returns empty (no provider call); conventions + quality + coverage(testsReaching-only) run normally. A pure code review with no design contract. |

### Invariants to preserve

- conventions + quality dimensions read neither approvedLld nor approvedPlan and MUST run byte-identically in all three modes — they are contract-independent. [[c3]]
- No fabricated adherence: the adherence dimension NEVER reports a finding when there is no contract to assess against (guaranteed by the judgeAdherence short-circuit that skips the provider call entirely in mode C). [[c3]]
- A non-Artifact error while resolving a contract must still propagate — only ArtifactMissingError|ArtifactNotApprovedError map to null; corruption/registration faults never degrade silently to mode C. [[c1]]
- The MCP handler relays resolved.reason generically (handler.ts:176) with no per-reason branch, so trimming 'no-approved-contract' from the union requires no handler edit and loses no user-facing message. [[c4]]

## Test strategy

**Test framework:** `node:test via npx tsx --test`

### Test levels

- **unit** — Prove resolveCodeReviewSubject resolves each contract independently and only fails with 'no-build-record'.
  - Subjects: `resolveCodeReviewSubject: LLD+plan approved -> ok:true both set (mode A)`, `resolveCodeReviewSubject: LLD approved, plan missing/unapproved -> ok:true, approvedPlan null (mode B)`, `resolveCodeReviewSubject: plan approved, LLD missing -> ok:true, approvedLld null (asymmetric)`, `resolveCodeReviewSubject: both missing/unapproved but changed files present -> ok:true, both null (mode C)`, `resolveCodeReviewSubject: no changed files -> ok:false, reason:'no-build-record'`, `resolveCodeReviewSubject: non-Artifact error while resolving a contract propagates (not mapped to null)`
  - Fixtures: `SubjectDeps stub with injectable requireApprovedLld/requireApprovedPlan/changedFiles/readBuildRecord (throw ArtifactMissingError/ArtifactNotApprovedError/NoBuildChangesError/a generic Error on demand)`
- **unit** — Prove the three-mode fork points in the dimensions never deref null and adherence never fabricates in mode C.
  - Subjects: `judgeAdherence: both contracts null -> returns empty DimensionResult with NO provider call (spy provider asserts zero calls)`, `judgeAdherence: a contract present -> issues exactly one completeStructured call (unchanged)`, `buildAdherencePrompt: mode A includes LLD body + '## Approved plan' section + implementation-correctness framing`, `buildAdherencePrompt: mode B (LLD only) includes LLD body, OMITS plan section, no null deref`, `buildCoveragePrompt: plan present keeps promised-tests section; plan null emits empty list + softened 'testsReaching only' framing`, `conventions + quality prompt builders byte-identical across all three modes (no approvedLld/approvedPlan read)`
  - Fixtures: `A spy LLMProvider recording completeStructured call count`, `Minimal CodeReviewSubject fixtures for each of the 3 modes + the asymmetric case`, `A minimal CodeReviewGrounding fixture with changed symbols + testsReaching edges`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `resolveCodeReviewSubject: LLD approved, plan missing/unapproved -> ok:true, approvedPlan null (mode B)`, `resolveCodeReviewSubject: both missing/unapproved but changed files present -> ok:true, both null (mode C)`, `resolveCodeReviewSubject: no changed files -> ok:false, reason:'no-build-record'` |
| `ac2` | `judgeAdherence: both contracts null -> returns empty DimensionResult with NO provider call (spy provider asserts zero calls)`, `buildAdherencePrompt: mode B (LLD only) includes LLD body, OMITS plan section, no null deref` |
| `ac3` | `buildCoveragePrompt: plan present keeps promised-tests section; plan null emits empty list + softened 'testsReaching only' framing`, `conventions + quality prompt builders byte-identical across all three modes (no approvedLld/approvedPlan read)` |

## Migration

**State before:** resolveCodeReviewSubject (subject.ts:88) resolves requireApprovedLld THEN requireApprovedPlan in ONE try (subject.ts:98-99); a missing/unapproved EITHER contract returns {ok:false, reason:'no-approved-contract'} (subject.ts:100-102). CodeReviewSubject.approvedLld/approvedPlan are non-null (types.ts:97); CodeReviewSubjectResult's failure union is 'no-approved-contract'|'no-build-record' (types.ts:107). buildAdherencePrompt unconditionally derefs subject.approvedPlan.body (adherence.ts:98) and judgeAdherence always calls the provider (adherence.ts:119/127). Net: a small/trivial story with no plan (or no LLD) can never be code-reviewed. Cited: subject.ts:88/98/122, types.ts:97/107, adherence.ts:98/119.

**State after:** Both contracts are optional. approvedLld: LldArtifact|null and approvedPlan: PlanArtifact|null. resolveCodeReviewSubject resolves each contract in its OWN try, mapping ArtifactMissingError|ArtifactNotApprovedError -> null and re-throwing non-Artifact errors; the only ok:false failure is 'no-build-record' (no changed files), so 'no-approved-contract' is dropped from the union. Three derived modes: (A) both present -> implementation-correctness; (B) LLD only -> LLD-contract review; (C) neither -> pure code review, adherence short-circuits to empty (no provider call). conventions + quality run byte-identically in all modes.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Widen the CodeReviewSubject fields: change approvedLld to LldArtifact|null and approvedPlan to PlanArtifact|null (types.ts:97). — ↩ rollbackable
2. Trim the CodeReviewSubjectResult failure union to reason:'no-build-record' only, removing the now-unreachable 'no-approved-contract' (types.ts:107). — ↩ rollbackable
3. Split the single contract-resolution try in resolveCodeReviewSubject into two independent trys (LLD, then plan), each catching ArtifactMissingError|ArtifactNotApprovedError -> assign null for that contract and re-throwing anything else; remove the no-approved-contract early-return (subject.ts:98-102). — ↩ rollbackable
4. Guard buildAdherencePrompt against a null contract: branch the payload assembly so it includes the LLD body only when approvedLld is set and the '## Approved plan' section only when approvedPlan is set; never deref a null (fixes the adherence.ts:98 hard deref). — ↩ rollbackable
5. Add the mode-C short-circuit to judgeAdherence: when approvedLld===null && approvedPlan===null, return an empty DimensionResult without any provider call (guard placed BEFORE the completeStructured call at adherence.ts:127). — ↩ rollbackable
6. Soften buildCoveragePrompt framing when approvedPlan is null: emit an empty promised-tests list plus the 'no approved plan — judge testsReaching coverage only; do not report missing promised tests' instruction; leave the plan-present path unchanged. — ↩ rollbackable
7. Add the unit tests for the three modes + the asymmetric case + no-build-record + the judgeAdherence zero-provider-call assertion; run the code-review test suite. — ↩ rollbackable

**Backward compat:** The change is source-compatible for existing callers: mode A (LLD+plan both approved — the full feature route) resolves identically to today and adherence/coverage prompts are byte-identical. Consumers that pattern-match CodeReviewSubjectResult on reason==='no-approved-contract' would no longer see that value — but the only consumer (handler.ts:176) relays resolved.reason generically with no per-reason branch, so no call-site breaks. Readers of subject.approvedLld/approvedPlan must now handle null; all in-repo readers (adherence/coverage) are updated in this same story, and conventions/quality never read them.

## Alternatives considered

### a1: Both nullable; adherence short-circuits to empty in mode C; trim the dead reason — **CHOSEN**

approvedLld + approvedPlan both -> |null; judgeAdherence returns an empty result WITHOUT a provider call when both are null; buildAdherencePrompt/buildCoveragePrompt branch on presence; 'no-approved-contract' removed from the failure union (only 'no-build-record' remains).



### a2: Both nullable; adherence handled purely by a mode-C prompt; retain the union

Same nullability, but judgeAdherence always calls the provider with a mode-C 'no contract -> return empty' prompt, and 'no-approved-contract' stays in the union as an unreachable member.



**Rejected because:** Smallest diff but VIOLATES the mode-C no-hallucination constraint — still calls the provider in mode C and relies on the model to self-report empty against no contract, so it can emit a fabricated adherence finding with no expectationRef. Accuracy-first rules it out. Also leaves a dead 'no-approved-contract' reason.

### a3: Both nullable; short-circuit adherence; RETAIN the reason union for API stability

a1's short-circuit + nullability, but keep 'no-approved-contract' in the failure union (unreachable) to avoid touching the exported type.



**Rejected because:** Matches a1 on correctness (same short-circuit) but leaves an unreachable 'no-approved-contract' reason — partial on honest-surface; a future reader may wrongly assume the resolver still gates on the contract. a1's union trim is contained in-story, so the API-stability upside does not outweigh the misleading dead state.

## Citations

- **[[c1]]** `analyze-bundle` `src/workflow/code-review/subject.ts:88 — symbol.locate: resolveCodeReviewSubject required-contract gate` — "resolveCodeReviewSubject (subject.ts:88) resolves deps.requireApprovedLld THEN deps.requireApprovedPlan in ONE try; either ArtifactMissingError|ArtifactNotApprovedError -> {ok:false, reason:'no-approv"
- **[[c2]]** `analyze-bundle` `src/workflow/code-review/types.ts:97,107 — data-model.trace: CodeReviewSubject fields + failure-reason union` — "CodeReviewSubject has readonly approvedLld: LldArtifact + readonly approvedPlan: PlanArtifact. CodeReviewSubjectResult = {ok:true; subject} | {ok:false; reason:'no-approved-contract'|'no-build-record'"
- **[[c3]]** `analyze-bundle` `src/workflow/code-review/dimensions/adherence.ts:98,119 + coverage.ts:84 — usage.example: three-mode fork points` — "buildAdherencePrompt unconditionally does JSON.stringify(subject.approvedPlan.body) (THROWS on null). judgeAdherence ALWAYS issues one provider.completeStructured call. buildCoveragePrompt reads promi"
- **[[c4]]** `analyze-bundle` `src/mcp/code-review-step/handler.ts:29,176 — symbol.locate: handler subject/reason handling` — "handler.ts on ok:false returns errorResult('no-subject', `... ${resolved.reason}`) — it RELAYS resolved.reason generically, with NO special-case branch for 'no-approved-contract'. So removing that rea"
- **[[c5]]** `analyze-bundle` `src/workflow/code-review/__tests__ + dimensions/__tests__ — test.locate: code-review tests to extend` — "New coverage: subject -> ok:true with approvedLld=null and/or approvedPlan=null; judgeAdherence returns EMPTY (no provider call) when both null; buildAdherencePrompt three-way framing; buildCoveragePr"
- **[[c6]]** `step-output` `s3 judge — winner a1` — "a1 wins on the correctness-critical spine: mode-C adherence is GUARANTEED empty via a judge short-circuit (a2 violates this), the three modes are delivered, and it removes the now-unreachable no-appro"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-08-04T19:11:38.084Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | manual | resolveCodeReviewSubject is defined in src/workflow/code-review/subject.ts and resolves the LLD then plan contracts, returning a CodeReviewSubjectResult. | Anchor src/workflow/code-review/subject.ts:88 resolves (found:true); grep confirms `function resolveCodeReviewSubject` (2 hits) and 50 uses of the symbol — the resolver exists as cited. | None — citation verified. |
| cl2 | citation | LOW | manual | CodeReviewSubject declares approvedLld and approvedPlan fields, and CodeReviewSubjectResult declares the failure-reason union, in src/workflow/code-review/types.ts. | types.ts:97 and types.ts:107 both resolve; grep confirms approvedLld, approvedPlan, no-approved-contract, and no-build-record all present in the tree — the fields + failure-reason union exist as cited. | None — citation verified. |
| cl3 | citation | LOW | manual | buildAdherencePrompt in src/workflow/code-review/dimensions/adherence.ts dereferences subject.approvedPlan.body (the null-deref bug this story fixes), and judgeAdherence always issues a provider.completeStructured call. | adherence.ts:119 resolves EXACTLY to `export async function judgeAdherence(`; grep confirms `approvedPlan.body` (22 hits) and completeStructured usage — the null-deref bug and the always-provider-call both exist as cited. The :98 anchor is within buildAdherencePrompt's message assembly (found:true); the exact deref line may sit a few lines off but the pattern is present in-file. | None — citation verified; line offset is immaterial (grep confirms the deref exists). |
| cl4 | citation | LOW | manual | buildCoveragePrompt and promisedTestsOf live in src/workflow/code-review/dimensions/coverage.ts, and promisedTestsOf is already null-plan-tolerant. | coverage.ts:84 resolves; grep confirms buildCoveragePrompt (44) and promisedTestsOf (7) both exist in the coverage dimension as cited. | None — citation verified. |
| cl5 | citation | LOW | manual | The MCP code-review handler resolves the subject via resolveCodeReviewSubject and relays resolved.reason generically on an ok:false no-subject result, with no per-reason branch. | handler.ts:176 resolves; grep confirms resolveCodeReviewSubject, no-subject (10), resolved.reason (6), and buildAdherencePrompt in the MCP handler — the generic reason relay exists as cited. | None — citation verified. |
| cl6 | closed-union | LOW | manual | conventions.ts and quality.ts do NOT read approvedLld or approvedPlan, so they are contract-independent and unchanged across all three modes. | approvedLld/approvedPlan grep returns 50 hits tree-wide (capped), consistent with the fields being read in adherence/coverage but the claim that conventions.ts/quality.ts do NOT read them cannot be refuted by the capped global grep — no counter-evidence surfaced. The design does not depend on this beyond leaving those two modules untouched, which is verifiable at build time. | Build-time verification: conventions.ts + quality.ts remain unedited in this story; confirm no approvedLld/approvedPlan reference is added there. |
| cl7 | inventory | LOW | manual | The code-review dimensions are the four named (adherence, conventions, coverage, quality), each a distinct module under src/workflow/code-review/dimensions/. | grep for dimension:'(adherence\|conventions\|coverage\|quality)' and DimensionResult both return hits — the four-dimension inventory is consistent with the tree. | None — inventory consistent. |

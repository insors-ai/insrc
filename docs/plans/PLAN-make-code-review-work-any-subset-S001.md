<!-- insrc:artifact PLAN-d88062a6e63aa312-S001 -->

# Plan: S001

**Epic:** `make-code-review-work-any-subset`
**LLD run:** `wf-1785870051230-po3dyg`
**LLD effective hash:** `d88062a6e63a...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Widen the CodeReviewSubject fields + trim the failure-reason union | S | — | unit: tsc over the code-review module compiles with CodeReviewSubject.approvedLld/approvedPlan nullable and the trimmed no-build-record-only failure union (type-shape assertion) | [[c1]] [[c2]] |
| 2 | **`t2`** Split resolveCodeReviewSubject contract resolution into two independent trys | M | `t1` | unit: resolveCodeReviewSubject: LLD+plan approved -> ok:true both set (mode A); unit: resolveCodeReviewSubject: LLD approved, plan missing/unapproved -> ok:true, approvedPlan null (mode B); unit: resolveCodeReviewSubject: plan approved, LLD missing -> ok:true, approvedLld null (asymmetric); unit: resolveCodeReviewSubject: both missing/unapproved but changed files present -> ok:true, both null (mode C); unit: resolveCodeReviewSubject: no changed files -> ok:false, reason:'no-build-record'; unit: resolveCodeReviewSubject: non-Artifact error while resolving a contract propagates (not mapped to null) | [[c1]] |
| 3 | **`t3`** Branch buildAdherencePrompt on contract presence + short-circuit judgeAdherence in mode C | M | `t2` | unit: judgeAdherence: both contracts null -> returns empty DimensionResult with NO provider call (spy provider asserts zero calls); unit: judgeAdherence: a contract present -> issues exactly one completeStructured call (unchanged); unit: buildAdherencePrompt: mode A includes LLD body + '## Approved plan' section + implementation-correctness framing; unit: buildAdherencePrompt: mode B (LLD only) includes LLD body, OMITS plan section, no null deref | [[c3]] |
| 4 | **`t4`** Soften buildCoveragePrompt promised-tests framing when no plan | S | `t2` | unit: buildCoveragePrompt: plan present keeps promised-tests section; plan null emits empty list + softened 'testsReaching only' framing | [[c3]] |
| 5 | **`t5`** Add the three-mode unit tests for subject + dimensions | M | `t3`, `t4` | unit: conventions + quality prompt builders byte-identical across all three modes (no approvedLld/approvedPlan read); unit: code-review suite green: npx tsx --test over src/workflow/code-review/**/*.test.ts passes with conventions.ts/quality.ts/handler.ts unedited | [[c5]] |

### `t1` — Widen the CodeReviewSubject fields + trim the failure-reason union

In src/workflow/code-review/types.ts, change CodeReviewSubject.approvedLld to LldArtifact|null and approvedPlan to PlanArtifact|null, and trim the CodeReviewSubjectResult failure union from {reason:'no-approved-contract'|'no-build-record'} to {reason:'no-build-record'}. Pure type-surface change; no runtime logic here.

**Acceptance checks:**
- CodeReviewSubject.approvedLld and approvedPlan are typed `LldArtifact | null` / `PlanArtifact | null`
- CodeReviewSubjectResult's ok:false member is exactly {ok:false; reason:'no-build-record'} — 'no-approved-contract' is gone
- tsc surfaces every downstream call site that now must handle null (drives t2–t4)

### `t2` — Split resolveCodeReviewSubject contract resolution into two independent trys

In src/workflow/code-review/subject.ts, replace the single try that resolves requireApprovedLld+requireApprovedPlan (currently returning 'no-approved-contract') with two independent trys — one per contract — each catching ArtifactMissingError|ArtifactNotApprovedError and assigning null for that contract, re-throwing anything else. The two `let` bindings become LldArtifact|null / PlanArtifact|null (init to null). Remove the no-approved-contract early-return; the changedFiles try (no-build-record) is unchanged. Success subject now carries the possibly-null contracts. NOTE: the MCP handler needs NO edit — with the resolver now returning ok:true in mode C, mode-C flows straight to the four-dimension drive; the no-subject decline only fires for no-build-record (handler.ts:176 relays generically).

**Acceptance checks:**
- Missing/unapproved LLD maps approvedLld to null WITHOUT failing; missing/unapproved plan maps approvedPlan to null WITHOUT failing
- A non-Artifact error thrown during contract resolution still propagates (not mapped to null)
- The only ok:false path is reason:'no-build-record' from the changedFiles derivation
- ok:true is returned even when BOTH contracts are null (a story with changed files but no contract)

### `t3` — Branch buildAdherencePrompt on contract presence + short-circuit judgeAdherence in mode C

In src/workflow/code-review/dimensions/adherence.ts: (a) make buildAdherencePrompt's user payload conditional — emit the '## Approved design (LLD body)' section only when approvedLld!=null and the '## Approved plan (PLAN body...)' section only when approvedPlan!=null, with implementation-correctness framing when both present and LLD-contract framing when LLD-only; never deref a null. (b) short-circuit judgeAdherence to return an empty DimensionResult (dimension DIMENSION, findings:[]) BEFORE the withStructuredRetry call when approvedLld===null && approvedPlan===null — no provider call. The trailing structural-payload order is preserved.

**Acceptance checks:**
- buildAdherencePrompt never dereferences a null approvedLld or approvedPlan
- Mode A (both present): payload includes both the LLD body and the plan body with implementation-correctness framing
- Mode B (LLD only): payload includes the LLD body, OMITS the plan section, frames as an LLD-contract review
- judgeAdherence returns an empty adherence DimensionResult with ZERO provider calls when both contracts are null (mode C)
- When a contract IS present, judgeAdherence issues exactly one completeStructured call as today

### `t4` — Soften buildCoveragePrompt promised-tests framing when no plan

In src/workflow/code-review/dimensions/coverage.ts, when approvedPlan===null, keep promisedTestsOf's empty list but soften the system framing so no missing-promised-test finding is raised ('no approved plan — judge testsReaching coverage of the changed symbols only; do not report missing promised tests'). When a plan is present, the promised-tests section + missing-promised-test rule are unchanged. testsReaching-based coverage is unchanged in all modes. promisedTestsOf is already null-tolerant — only the prompt framing branches.

**Acceptance checks:**
- Plan present: the promised-tests section and the missing-promised-test HIGH rule are byte-identical to today
- Plan null: the promised-tests list is empty and the framing instructs the judge to score testsReaching coverage only, not report missing promised tests
- testsReaching-based coverage behaviour is identical across all three modes
- No throw when approvedPlan is null

### `t5` — Add the three-mode unit tests for subject + dimensions

Add node:test unit tests under src/workflow/code-review/__tests__ (subject resolution via the SubjectDeps stub seam) and src/workflow/code-review/dimensions/__tests__ (adherence + coverage prompt/judge). Cover: subject mode A/B/C + asymmetric + no-build-record + non-Artifact-propagates; judgeAdherence zero-provider-call in mode C (spy provider) + one call when a contract is present; buildAdherencePrompt mode-A vs mode-B payload branching (no null deref); buildCoveragePrompt plan-null softening. Confirm conventions.ts + quality.ts AND the MCP handler remain unedited. Run the code-review suite green.

**Acceptance checks:**
- Subject tests cover all three modes, the asymmetric case, no-build-record, and non-Artifact propagation
- A spy LLMProvider proves judgeAdherence makes zero calls in mode C and one call when a contract is present
- buildAdherencePrompt and buildCoveragePrompt branching are asserted directly (no null deref; softened framing)
- conventions.ts + quality.ts AND src/mcp/code-review-step/handler.ts are unchanged in the diff (mode-C reachability comes purely from the resolver returning ok:true)
- npx tsx --test over src/workflow/code-review/**/*.test.ts passes

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| resolveCodeReviewSubject: LLD+plan approved -> ok:true both set (mode A) | `t2` |
| resolveCodeReviewSubject: LLD approved, plan missing/unapproved -> ok:true, approvedPlan null (mode B) | `t2` |
| resolveCodeReviewSubject: plan approved, LLD missing -> ok:true, approvedLld null (asymmetric) | `t2` |
| resolveCodeReviewSubject: both missing/unapproved but changed files present -> ok:true, both null (mode C) | `t2` |
| resolveCodeReviewSubject: no changed files -> ok:false, reason:'no-build-record' | `t2` |
| resolveCodeReviewSubject: non-Artifact error while resolving a contract propagates (not mapped to null) | `t2` |
| judgeAdherence: both contracts null -> returns empty DimensionResult with NO provider call (spy provider asserts zero calls) | `t3` |
| judgeAdherence: a contract present -> issues exactly one completeStructured call (unchanged) | `t3` |
| buildAdherencePrompt: mode A includes LLD body + '## Approved plan' section + implementation-correctness framing | `t3` |
| buildAdherencePrompt: mode B (LLD only) includes LLD body, OMITS plan section, no null deref | `t3` |
| buildCoveragePrompt: plan present keeps promised-tests section; plan null emits empty list + softened 'testsReaching only' framing | `t4` |
| conventions + quality prompt builders byte-identical across all three modes (no approvedLld/approvedPlan read) | `t5` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails.resolveCodeReviewSubject + migration — split the LLD+plan gate, map Artifact errors to null, only no-build-record fails` — "resolveCodeReviewSubject resolves each contract in its OWN try, mapping ArtifactMissingError|ArtifactNotApprovedError -> null and re-throwing non-Artifact errors; the only ok:false failure is 'no-buil"
- **[[c2]]** `prior-artifact` `LLD S001 dataModelChanges — widen CodeReviewSubject.approvedLld/approvedPlan to nullable + trim the CodeReviewSubjectResult failure union` — "CodeReviewSubject.approvedLld: LldArtifact -> LldArtifact | null; approvedPlan: PlanArtifact -> PlanArtifact | null; failure reason 'no-approved-contract'|'no-build-record' -> 'no-build-record'."
- **[[c3]]** `prior-artifact` `LLD S001 contractDetails.buildAdherencePrompt/judgeAdherence/buildCoveragePrompt — the three-mode dimension fork points` — "buildAdherencePrompt branches on contract presence and never derefs null; judgeAdherence short-circuits to empty (no provider call) in mode C; buildCoveragePrompt softens the promised-tests framing wh"
- **[[c5]]** `prior-artifact` `LLD S001 testStrategy + test.locate bundle — code-review test locations (__tests__ + dimensions/__tests__), node:test via npx tsx --test` — "New coverage across subject resolution + adherence/coverage dimensions; conventions/quality byte-identical; node:test via npx tsx --test."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-08-04T19:24:58.189Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | citation | LOW | manual | src/workflow/code-review/types.ts declares CodeReviewSubject with approvedLld + approvedPlan fields and the CodeReviewSubjectResult failure-reason union — the type surface t1 widens/trims. | types.ts:97 reads `readonly approvedPlan: PlanArtifact;` and types.ts:107 reads the exact union `\| { readonly ok: false; readonly reason: 'no-approved-contract' \| 'no-build-record' };` — the type surface t1 widens/trims exists as cited. | None — verified. |
| t2 | citation | LOW | manual | resolveCodeReviewSubject in src/workflow/code-review/subject.ts resolves requireApprovedLld + requireApprovedPlan in one try that returns reason:'no-approved-contract', and has a separate changedFiles try returning 'no-build-record' — the structure t2 splits. | subject.ts:97 is the `try {` opening the single contract-resolution block and subject.ts:101 the `if (err instanceof ArtifactMissingError \|\| err instanceof ArtifactNotApprovedError)` catch; grep confirms requireApprovedLld/requireApprovedPlan/no-approved-contract/NoBuildChangesError — the structure t2 splits exists as cited. | None — verified. |
| t3 | citation | LOW | manual | buildAdherencePrompt + judgeAdherence in src/workflow/code-review/dimensions/adherence.ts exist; buildAdherencePrompt unconditionally stringifies subject.approvedPlan.body and judgeAdherence always calls the provider via withStructuredRetry — the fork points t3 edits. | adherence.ts:94 reads `'```json', JSON.stringify(subject.approvedPlan.body, null, 2), '```',` (the unconditional null-deref) and adherence.ts:119 is `export async function judgeAdherence(`; grep confirms withStructuredRetry — the fork points t3 edits exist as cited. | None — verified. |
| t4 | citation | LOW | manual | buildCoveragePrompt + promisedTestsOf in src/workflow/code-review/dimensions/coverage.ts exist, and promisedTestsOf reads subject.approvedPlan tolerantly (optional chaining) — the null-tolerant helper t4 relies on. | coverage.ts:84 is `function promisedTestsOf(subject: CodeReviewSubject)` and coverage.ts:105 is `export function buildCoveragePrompt(`; grep confirms both symbols — the null-tolerant helper t4 relies on exists as cited. | None — verified. |
| t5 | citation | LOW | manual | The code-review test directories src/workflow/code-review/__tests__ and src/workflow/code-review/dimensions/__tests__ exist as the homes for the new node:test unit tests. | grep confirms resolveCodeReviewSubject/buildAdherencePrompt/buildCoveragePrompt are exercised in test files under the code-review tree; the __tests__ directories are the established test homes. | None — verified. |
| t5 | closed-union | LOW | manual | conventions.ts + quality.ts + the MCP handler (src/mcp/code-review-step/handler.ts) do NOT need editing: the four code-review dimensions are adherence/conventions/coverage/quality and only adherence/coverage read the contracts. | grep for the four-dimension literal set returns hits (adherence/conventions/coverage/quality) and resolved.reason appears in the handler; no counter-evidence that conventions/quality/handler read the contracts. Enforced at build time by t5's no-diff acceptance check. | t5 asserts conventions.ts/quality.ts/handler.ts are unchanged in the diff — build-time verification. |
| tasks | ordering | LOW | manual | The task dependency graph t1<-t2<-{t3,t4}<-t5 is acyclic and the order field (1..5) is a valid topological order. | Dependency edges t1->t2->t3, t2->t4, {t3,t4}->t5 form a DAG; order 1,2,3,4,5 places every task after its dependencies (t3@3>t2@2, t4@4>t2@2, t5@5>t3@3 and t4@4). Acyclic + valid topological order. | None — consistent. |

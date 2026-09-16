<!-- insrc:artifact HLD-761a43a6fa645815 -->

# HLD: A hybrid code-review stage (winner a3): a code-review-specific orchestrator runs the four dimensions (adherence/conventions/coverage/quality) as an explicit SERIAL provider loop, reusing src/daemon/workflow-rpc

## Framework summary

A hybrid code-review stage (winner a3): a code-review-specific orchestrator runs the four dimensions (adherence/conventions/coverage/quality) as an explicit SERIAL provider loop, reusing src/daemon/workflow-rpc.ts's proven machinery (buildShaperProvider resolution, synthesize-with-retry, writeAtomic, meta-stamping, optional boundary re-audit, the runStart StreamHandler shape) rather than cloning it, and mirroring the existing review vocabulary (ReviewVerdict / Severity / ReviewReport from src/workflow/review/types.ts) so the persisted CodeReviewArtifact carries a block/warn/pass verdict downstream approval already understands. The daemon-driven path and the controller-driven insrc_code_review_step (which mirrors insrc_review_step's start/emit/done/error/opaque-state envelope) share ONE orchestrator, differing only in who supplies each dimension's judgement. The stage runs after build, consumes the build record + approved LLD/PLAN as its fixed subject without re-deriving them, and never modifies the code it judges.

## Architecture shape

Layered around a fixed per-Story subject. s1 establishes the SUBJECT (the build record's changed-file set + the requireApproved LLD/PLAN contract) and the daemon-served structured grounding (graph symbol summaries, IPC-only, no raw file dumps), plus the per-dimension Finding vocabulary the four dimensions emit. s2-s5 are four independent judgements over that fixed subject, each a single high-tier provider call producing DimensionFindings. s6 is the aggregation core: it sequences the four dimensions serially (the CodeReviewRunner, a workflow-rpc-style daemon entrypoint), folds their results into one ReviewReport-shaped CodeReviewArtifact with a block/warn/pass verdict, and persists it atomically under CR-<epic>-<story>. s7 is the completion gate that enforces the verdict via the existing approveArtifactByJsonPath/ReviewBlockedError block-or-override pattern. s8 is the controller-driven variant that reuses the same runner + record but takes each dimension's judgement from an external caller through the review-step envelope. Ownership follows the dependency graph: cross-cutting subject/grounding/finding contracts are owned at the common ancestor s1; the aggregate record + runner are owned at s6 (which depends on s2-s5) and consumed by s7/s8.

## Shared contracts

### sc1: CodeReviewSubject

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s6`, `s8`

**Purpose:** The fixed, per-Story review subject: exactly the files the Story's build changed (from the build record, consumed not re-derived) plus its approved LLD + PLAN. Resolving it enforces the no-approved-contract→no-verdict rule and scopes every dimension to this Story's own changes. Owned at s1 (the common ancestor every dimension + the controller depends on).

**Interface sketch (type-level):**

```
type ReviewDimension = 'adherence' | 'conventions' | 'coverage' | 'quality';

interface CodeReviewSubject {
  readonly repoPath: string;
  readonly epicHash: string;
  readonly storyId: string;
  readonly changedFiles: readonly string[];   // the build record's changed set = the exact subject
  readonly approvedLld: LldArtifact;           // via requireApprovedLld (throws if absent)
  readonly approvedPlan: PlanArtifact;         // via requireApprovedPlan (throws if absent)
  readonly buildRecord: BuildArtifact;         // consumed as input, never re-derived
}

type CodeReviewSubjectResult =
  | { readonly ok: true;  readonly subject: CodeReviewSubject }
  | { readonly ok: false; readonly reason: 'no-approved-contract' | 'no-build-record' };
```

**Assumptions cited:** [[c9]] [[c10]]

### sc2: CodeReviewGrounding

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s8`

**Purpose:** Daemon-served structured summaries of the Story's new/changed symbols (signatures + caller/callee + test-reaching edges) from the graph, so every dimension and the external controller reason from entity summaries rather than raw file dumps, and reach storage only through the daemon (k5/k6). Owned at s1.

**Interface sketch (type-level):**

```
interface ChangedSymbolSummary {
  readonly entityId: string;
  readonly file: string;
  readonly kind: string;
  readonly name: string;
  readonly signature: string;
  readonly callers: readonly string[];
  readonly callees: readonly string[];
  readonly testsReaching: readonly string[];   // graph edges: test-entity -> this symbol
}

interface CodeReviewGrounding {
  readonly symbols: readonly ChangedSymbolSummary[];   // IPC-served; no raw file contents
}
```

**Assumptions cited:** [[c16]]

### sc3: DimensionFinding

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s6`

**Purpose:** The per-dimension finding + result vocabulary each of the four dimension judgements (s2-s5) emits, reusing the existing review Severity scale so findings fold into one ReviewReport-shaped record. Cross-cutting across the four parallel dimension branches, so owned at their nearest common ancestor s1 (NOT s6, which s2-s5 do not depend on).

**Interface sketch (type-level):**

```
// Severity reused verbatim from src/workflow/review/types.ts: 'HIGH' | 'MED' | 'LOW'
interface DimensionFinding {
  readonly dimension: ReviewDimension;
  readonly severity: Severity;
  readonly location: string;              // file:line within the Story's changed set
  readonly message: string;
  readonly expectationRef?: string;       // adherence: the named approved clause departed from
  readonly counterpartRef?: string;       // quality: the existing duplication counterpart
  readonly confidence?: 'observation' | 'breach';  // conventions: low-sample => observation
}

interface DimensionResult {
  readonly dimension: ReviewDimension;
  readonly findings: readonly DimensionFinding[];
}
```

**Assumptions cited:** [[c2]] [[c17]]

### sc4: CodeReviewArtifact

**Owner Story:** `s6`
**Consumed by:** `s7`, `s8`

**Purpose:** The single persisted, ReviewReport-shaped record aggregating all four DimensionResults into one block/warn/pass verdict (ReviewVerdict verbatim), stamped like every other artifact and stored at CR-<epic>-<story>. Distinct in kind from the artifact review, so both coexist. Owned by s6 (depends on s2-s5); read by the gate (s7) and re-produced by the controller path (s8).

**Interface sketch (type-level):**

```
// ReviewVerdict reused verbatim from src/workflow/review/types.ts: 'pass' | 'warn' | 'block'
interface CodeReviewBody {
  readonly kind: 'code-review';           // identifies its own review kind (distinct from artifact review)
  readonly epicHash: string;
  readonly storyId: string;
  readonly subject: { readonly changedFiles: readonly string[] };
  readonly dimensions: readonly DimensionResult[];   // all four
  readonly verdict: ReviewVerdict;
  readonly counts: { readonly high: number; readonly med: number; readonly low: number };
}

type CodeReviewArtifact = WorkflowArtifact<CodeReviewBody>;   // meta mirrors ArtifactMetaBase

// storage.ts additions (type-level): codeReviewArtifactId(epicHash, storyId): string  // 'CR-<epic>-<story>'
//   codeReviewArtifactPaths(...) -> { md; json }; codeReviewMdRel(...); pathsForWorkflow branch

type CodeReviewOutcome =
  | { readonly ok: true;  readonly artifact: CodeReviewArtifact }
  | { readonly ok: false; readonly error: string };   // partial failure => NO pass record persisted
```

**Assumptions cited:** [[c2]] [[c8]]

### sc5: CodeReviewRunner

**Owner Story:** `s6`
**Consumed by:** `s8`

**Purpose:** The shared orchestrator that sequences the four dimensions SERIALLY (k4) and finalizes them into a CodeReviewArtifact, plus its daemon-driven entrypoint + IPC (a peer of workflow-rpc.ts runStart) reusing provider resolution / retry / writeAtomic / optional re-audit. Owned by s6; the controller path (s8) drives the same orchestrator with externally-supplied judgements.

**Interface sketch (type-level):**

```
interface CodeReviewProgress {
  readonly phase: 'grounding' | 'dimension-start' | 'dimension-done' | 'finalize' | 'done' | 'error';
  readonly dimension?: ReviewDimension;
  readonly detail?: string;
}

interface RunCodeReviewOpts {
  readonly runId: string;
  readonly modelLabel: string;               // resolved high-tier (critical role, k10)
  readonly signal?: AbortSignal;
  readonly onProgress?: (f: CodeReviewProgress) => void;
}

interface CodeReviewRunner {
  // serial dimension loop -> finalize -> atomic persist; type-level signature only
  runServerSide(subject: CodeReviewSubject, provider: LLMProvider, opts: RunCodeReviewOpts): Promise<CodeReviewOutcome>;
}

// daemon IPC (type-level): 'codeReview.run' StreamHandler mirroring workflow.run's runStart
```

**Assumptions cited:** [[c6]] [[c15]]

## Story boundaries

### Story E20260803761a43a6:S001

**Owns:** `sc1`, `sc2`, `sc3`

How the changed-file set is derived from the build record, how requireApproved LLD/PLAN resolution and the byte-unchanged (read-only) guarantee are enforced, and how the daemon assembles ChangedSymbolSummary rows from the graph — all private to s1; downstream stories see only the sc1/sc2/sc3 shapes.

### Story E20260803761a43a6:S002

**Depends on:** `sc1`, `sc2`, `sc3`

The adherence judgement itself — the high-tier prompt that compares the changed code against the approved LLD contract + plan tasks + acceptance criteria and names the specific approved expectation each departure fails, without judging whether the decision was right. Private to s2.

### Story E20260803761a43a6:S003

**Depends on:** `sc1`, `sc2`, `sc3`

The standards judgement — baselining on the repo's documented CLAUDE.md rules plus multi-file convention sampling (single-file sampling stays a low-confidence observation, not a breach). Private to s3.

### Story E20260803761a43a6:S004

**Depends on:** `sc1`, `sc2`, `sc3`

The coverage judgement — matching the plan's promised per-task tests against what exists/passes and using test-reaching graph edges to mark each changed symbol exercised or not, while excluding pre-existing unrelated gaps. Private to s4.

### Story E20260803761a43a6:S005

**Depends on:** `sc1`, `sc2`, `sc3`

The quality judgement — correctness/complexity/duplication/error-handling risks with location + severity, identifying a duplication's existing counterpart and keeping matters of taste below blocking severity. Private to s5.

### Story E20260803761a43a6:S006

**Owns:** `sc4`, `sc5`
**Depends on:** `sc1`, `sc3`

How the four DimensionResults are folded into one verdict (the block/warn/pass computation from the aggregate severity counts), how the runner reuses workflow-rpc.ts's retry/writeAtomic/re-audit machinery, and how partial-failure is reported as failure rather than a pass. Private to s6; downstream sees only the sc4 record + sc5 runner surface.

### Story E20260803761a43a6:S007

**Depends on:** `sc4`

The Story-completion gate wiring — reusing approveArtifactByJsonPath/ReviewBlockedError to refuse completion on a block verdict, record an explicit override, surface warn-level warnings, and present the outcome before the user's explicit approval. Private to s7.

### Story E20260803761a43a6:S008

**Depends on:** `sc1`, `sc2`, `sc4`, `sc5`

The insrc_code_review_step MCP handler + its multi-turn phase envelope (start / emit-judgements / done / error / opaque state) mirroring insrc_review_step, including malformed-turn rejection — the controller supplies each dimension's judgement while the daemon still serves grounding and persists the same sc4 record. Private to s8.

## Non-functional targets

- **Performance:** The four dimensions run as a strictly serial provider loop (k4 — never Promise.all over the LLM); grounding is bounded structured symbol summaries from the graph (sc2), not raw file dumps, keeping per-dimension context size proportional to the Story's changed set rather than to repo size.
- **Security:** All model access goes through the LLMProvider abstraction via the locally-installed CLI OAuth session — no direct cloud REST (k3). The daemon owns all DB access; the MCP tool and any CLI surface reach storage only via IPC (k5). The review is read-only: the Story's files are byte-for-byte unchanged (S001 ac5).
- **Observability:** CodeReviewProgress frames (grounding / dimension-start / dimension-done / finalize / done / error) mirror workflow-rpc.ts's WorkflowProgress and flow through the existing appendProgressLog / appendRunLog + StreamHandler, so a daemon-driven run streams the same way workflow.run does.
- **Durability:** The record is written through the existing writeAtomic (tmp-then-rename) under ARTIFACTS_DIR, so a crash leaves no partial artifact; a run that fails partway persists NO pass record and reports the failure as a failure (S006 ac5). The critical review role is pinned at no less than the high model tier (k10).

## Rollout

### Phase A — Subject + grounding foundation

**Stories:** `s1`

s1 owns the three cross-cutting contracts every later Story consumes: the CodeReviewSubject (sc1, changed-file set from the build record + approved LLD/PLAN), the daemon-served CodeReviewGrounding (sc2), and the per-dimension DimensionFinding vocabulary (sc3). Nothing can judge code until the subject is scoped and grounding is available, so this lands first.

**Backward compat:** None — all three contracts and the subject-resolution path are brand-new surfaces with no existing on-disk data or external clients to preserve.

### Phase B — The four dimension judgements

**Stories:** `s2`, `s3`, `s4`, `s5`

Adherence (s2), standards (s3), coverage (s4), and quality (s5) each depend only on s1 and are mutually independent — they consume sc1/sc2/sc3 and emit DimensionResults, so they can be built in any order or in parallel once Phase A is in. None consumes another's output.

**Backward compat:** None — each dimension is a new internal judgement producing sc3 findings; no existing behaviour changes.

### Phase C — Aggregate record + runner

**Stories:** `s6`

s6 depends on all four dimensions (s2-s5): it sequences them serially, folds their DimensionResults into one block/warn/pass CodeReviewArtifact (sc4), and exposes the CodeReviewRunner + daemon IPC (sc5). It must land after Phase B and before the gate/controller that consume its record.

**Backward compat:** The CodeReviewArtifact record shape (sc4) and the 'codeReview.run' IPC are new and unreleased — no external IDE/IPC clients yet — but the record MUST reuse the existing ReviewVerdict/ReviewReport vocabulary verbatim so the later gate reads it with the existing approval logic and no second interpretation.

### Phase D — Completion gate + independent controller path

**Stories:** `s7`, `s8`
**Flag:** `insrc.codeReview.enforce`

Both depend on s6 and are independent of each other: s7 wires the Story-completion gate to enforce the sc4 verdict (reusing approveArtifactByJsonPath/ReviewBlockedError), and s8 exposes insrc_code_review_step driving the same sc5 runner + sc4 record through the review-step envelope. They can be built in parallel once Phase C is in.

**Backward compat:** The gate MUST be additive: a Story with no CodeReviewArtifact completes exactly as it does today — only a PRESENT block verdict withholds completion — so existing stories are never retroactively blocked. Approval remains the existing explicit gated act (k7), extended, not replaced.

**Ordering rationale:** Phases follow the Epic dependency edges and shared-contract ownership exactly. Phase A (s1) lands the sc1/sc2/sc3 contracts every consumer needs before any consumer exists. Phase B (s2-s5) are the four parallel dimension branches, each depending only on s1 and emitting sc3 — no cross-dependency, so any build order works. Phase C (s6) waits for all four because it aggregates their DimensionResults into sc4 and owns the sc5 runner. Phase D (s7, s8) waits for s6 because both consume sc4 (and s8 also sc5); they are mutually independent. Every owner Story precedes its consumers: s1 before s2-s6/s8; s6 before s7/s8.

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Daemon-driven runner reliability + cross-boundary reuse of workflow-rpc.ts machinery | The runner (sc5) reuses workflow-rpc.ts's provider-resolution/retry/writeAtomic/re-audit helpers, which couples the new code-review path to daemon internals; and the CLI-provider path those helpers drive can fail mid-run (as observed: a truncated/exited CLI subprocess), which would abort a daemon-driven review. | Extract the shared helpers into a small neutral module (or keep the runner in daemon/ as a declared peer) rather than importing daemon internals into workflow/; keep the synthesize-with-retry loop; and rely on the controller-driven path (s8) as the reliable fallback — it takes judgements from an external caller with no daemon CLI subprocess in the loop, and persists the identical sc4 record. |
| Story-completion gate changing existing completion behaviour | s7 inserts a verdict check into Story completion; done wrong it could block Stories that legitimately have no code review (pre-existing Stories, or Stories where review was never run), turning an additive gate into a regression. | Make the gate strictly additive: absence of a CodeReviewArtifact NEVER blocks completion; only a present block verdict withholds it, and always with an explicit override path. Ship enforcement behind the insrc.codeReview.enforce flag so it can be validated before it gates real completions. |
| Coverage dimension depends on graph test→symbol edges being fresh after build | s4 marks each changed symbol exercised/not via recorded test-reaching edges (assumption c16, med confidence); if the graph is stale or the just-built symbols are not yet indexed, coverage could under- or over-report and produce findings the author cannot act on. | Verify graph freshness for the changed set during subject assembly (sc1/sc2); treat a symbol with no recorded edges as an explicit 'unknown/not-exercised' distinct from 'has a failing test' (S004 ac3) rather than silently passing; and scope coverage strictly to the Story's changed behaviour, excluding pre-existing unrelated gaps (S004 ac4). |

## Alternatives considered

### a1: Code-review as a registered workflow (reuse the generic executor)

Register a new code.review workflow whose four dimensions are executor steps, driven end-to-end by runWorkflowServerSide.

Treat a code review as just another entry in the workflow chain: register a code.review workflow with registerWorkflowRunners, where the four dimensions (adherence/conventions/coverage/quality) are executor steps and a final synthesize step folds their findings into a CodeReviewArtifact via finalizeArtifact. The daemon-driven path is literally runWorkflowServerSide(intent, provider, opts) unchanged, and the controller-driven path reuses insrc_workflow_step's start/plan/step/synthesize envelope. Storage, meta-stamping, and the boundary re-audit all come for free from the orchestrator seam.

**Pros:**
- Maximal reuse: the daemon driver, retry loop, writeAtomic, meta-stamping, and optional boundary re-audit are inherited verbatim from workflow-rpc.ts with zero new orchestration code.
- One finalize path: finalizeCodeReview joins the existing finalize<X> family, so approval/review stamping stays uniform.
- The four dimensions become steps the executor already pauses/resumes, so serial provider calls (k4) are the default.

**Cons:**
- k2 conflict: the controller path would be the workflow envelope, NOT the insrc_review_step start/claims/verdicts envelope k2 names.
- The executor's decompose→one-synthesized-artifact shape is built for design synthesis; four judgements over a fixed subject strain the plan abstraction.
- Registering review as a chain workflow blurs the build-then-review boundary (k9).

**Cost estimate:** L

**Rejected because:** Rank 3. VIOLATES k2 (controller path is the workflow envelope, not the review-step envelope) and only partial on k1/k8/k9 because the executor's design-synthesis shape does not fit four independent judgements over a fixed subject.

### a2: Parallel code-review subsystem mirroring src/workflow/review/

Clone the artifact-review pipeline shape into src/workflow/code-review/ with four dimension passes producing a ReviewReport-shaped record.

Build src/workflow/code-review/ as a structural peer of src/workflow/review/: a runCodeReview entry point orchestrates four dimension passes, each a provider call emitting Findings in the existing Finding/Severity/ReviewVerdict vocabulary, aggregated into a ReviewReport-shaped CodeReviewArtifact. The daemon path is a thin workflow-rpc-style RPC that resolves the provider via buildShaperProvider and calls runCodeReview; the controller path is insrc_code_review_step mirroring insrc_review_step's envelope verbatim.

**Pros:**
- k1 and k2 satisfied by construction: record IS ReviewReport-shaped and the controller envelope IS the review-step envelope, both cloned from the nearest peer.
- The four dimensions map naturally to four independent finding-producing passes, matching the domain.
- Stays visibly distinct from the artifact review (k8): a separate subsystem with its own subject and entry point.

**Cons:**
- Duplicates the extract/probe/verify/report scaffolding, which must be kept in sync with src/workflow/review/.
- Re-implements the daemon serial-loop + retry + writeAtomic that workflow-rpc.ts already provides.
- Two review subsystems to maintain, risking divergent verdict semantics.

**Cost estimate:** L

**Rejected because:** Rank 2. Satisfies all twelve but re-implements the daemon serial-loop/retry/writeAtomic/re-audit that workflow-rpc.ts (grounded in s1 as generic over WorkflowIntent) already provides, and stands up a second full review subsystem — correct but higher duplication cost than a3.

### a3: Hybrid — reuse the daemon runner machinery, mirror the review artifact + controller envelope — **CHOSEN**

A code-review-specific orchestrator runs four serial dimension passes, wrapped by a workflow-rpc-style daemon runner and an insrc_review_step-style controller envelope, producing a ReviewReport-shaped CodeReviewArtifact.

Split the concern: reuse workflow-rpc.ts's proven machinery (buildShaperProvider provider resolution, the serial synthesize-with-retry loop, writeAtomic, meta-stamping, optional boundary re-audit, the runStart StreamHandler shape for the 'codeReview.run' IPC) but keep the four dimensions as an explicit serial loop inside a code-review orchestrator rather than as workflow executor steps. Each dimension is one provider call emitting Findings; finalizeCodeReview folds them into a ReviewReport-shaped CodeReviewArtifact (verdict = ReviewVerdict verbatim). The controller path is insrc_code_review_step mirroring the review-step envelope; the daemon path wraps the same orchestrator. The cross-cutting CodeReviewArtifact + verdict + per-dimension Finding schema are pinned in the S006 owner story so s2-s5/s7/s8 validate against a fixed contract.

**Pros:**
- Satisfies k1 and k2 directly WHILE reusing workflow-rpc.ts's provider/retry/write/re-audit machinery — neither the report shape nor the driver is re-invented.
- The four dimensions stay a clean serial loop honoring k4 without the executor's plan/step abstraction.
- Keeps the code review a distinct stage (k8/k9) with its own subject + IPC, while gate/runner reuse the exact enforcement pattern so approval semantics stay uniform.

**Cons:**
- Introduces a third orchestration pattern, so the dimension-runner contract must be newly specified.
- Sharing workflow-rpc.ts helpers means extracting them or importing across the daemon/workflow boundary.
- More upfront design in the S006 owner story to pin the shared CodeReviewArtifact + Finding contract.

**Cost estimate:** L

### a4: Generalize the existing artifact review to also accept code as a subject

Extend reviewArtifactFile so a single review engine premise-audits either a design artifact or a code diff.

Widen the existing src/workflow/review/ engine: reviewArtifactFile gains a subject kind (artifact | code), and when the subject is code it runs the four dimensions instead of prose premise-extraction, reusing the same report/verdict/apply machinery and the same insrc_review_step tool with a subject parameter. One review engine, one controller tool, one report shape.

**Pros:**
- Smallest new surface area: no new MCP tool, no new daemon runner; report/verdict/apply reused.
- Guarantees a single verdict vocabulary trivially (k1), since there is one report type.

**Cons:**
- Directly violates k8 and the DEF non-goal: the artifact review is scoped to artifacts and to PRE-approve; overloading it to review code after build collapses two distinct stages.
- The premise-audit engine does not fit code judgement, so the shared engine forks internally on subject kind — shared in name only.
- A blocked code verdict flows through the same approval path with no way to tell which kind of review blocked (violates S006 ac3).

**Cost estimate:** M

**Rejected because:** Rank 4. VIOLATES k8 (and its sourcing non-goal): folding code review into the artifact-review engine collapses two stages the Epic requires to remain separate, and makes a blocked verdict indistinguishable by kind (fails S006 ac3). Disqualifying.

## Citations

- **[[c1]]** `analyze-bundle` `s1 module.profile — src/daemon/workflow-rpc.ts` — "runWorkflowServerSide(intent, provider, opts) (164) is the generic daemon driver ... FIT CONFIRMED: the driver is workflow-agnostic (generic over WorkflowIntent) and already fuses provider-loop + fina"
- **[[c2]]** `analyze-bundle` `s1 module.profile — src/workflow/review/types.ts` — "Severity = 'HIGH'|'MED'|'LOW' (41), ReviewVerdict = 'pass'|'warn'|'block' (43), Finding {claimId, severity, ...} (119), and ReviewReport {stage, verdict, findings[], counts:{high,med,low}} (134). The "
- **[[c3]]** `analyze-bundle` `s1 module.profile — src/workflow/gates.ts` — "ReviewBlockedError (71) and approveArtifactByJsonPath(jsonPath, {overrideReview}) (488) which, before stamping approvedAt, filters review.findings for unresolved HIGH/MED and refuses unless overrideRe"
- **[[c4]]** `analyze-bundle` `s1 module.profile — src/workflow/storage.ts + artifacts/` — "buildArtifactId (BUILD-<epic>-<story>, 161) + buildArtifactPaths (285) + buildMdRel (333) are the closest peer, because a code review is PER-STORY like build; a CodeReviewArtifact adds a codeReviewArt"
- **[[c5]]** `analyze-bundle` `s1 reuse — src/mcp/review-step/types.ts + handler.ts` — "The controller multi-turn envelope is fully typed in src/mcp/review-step/types.ts (ReviewStepInputStart 30, EmitClaims 71, EmitVerdicts 80, Done 91, Error 105, StatePayload 124, McpEnvelope 142) drive"
- **[[c6]]** `analyze-bundle` `s1 reuse — convention.detect / src/analyze/explore/convention-detect.ts` — "convention.detect over a single file put every signal below the 5-entity confidence threshold — direct evidence the standards dimension must lean on repo CLAUDE.md rules + multi-file sampling, not per"
- **[[c7]]** `step-output` `s3 alternatives.judge — winner a3` — "a3 is the only alternative that scores satisfies on ALL twelve constraints while also reusing the proven daemon machinery; a1 VIOLATES k2, a4 VIOLATES k8, a2 satisfies all twelve but re-implements the"
- **[[c8]]** `doc` `CLAUDE.md — Building features via insrc / review before approve` — "insrc_review_step before approve — the independent 'two sets of eyes' review; it stamps approvedAt and enforces the review block-verdict. The code review must remain distinct from this artifact review"
- **[[c9]]** `prior-artifact` `Epic 185807ba9a6b35d3 / add-build-workflow-insrc-5th-stage` — "The build stage yields an identifiable, per-Story set of changed files and a run record; the code review consumes that record as input and must not re-derive or duplicate it (k9)."
- **[[c10]]** `prior-artifact` `Epic 1cd9a4c34f403a80 / add-plan-workflow-insrc-framework-4th` — "The approved plan states the tests each unit of work should produce — the approved expectation the coverage dimension checks the code against."
- **[[c15]]** `analyze-bundle` `s1 concept.resolve (second pass) — daemon self-review driver` — "src/daemon/workflow-rpc.ts ranks as the daemon-driven review-pattern neighbour; s1's module.profile confirms its runServerSide driver is generic over WorkflowIntent and is the runner the code-review p"
- **[[c16]]** `doc` `CLAUDE.md — Key architectural rules` — "Daemon owns all DB access — CLI, MCP, and the IDE workbench communicate via IPC only. No raw file dumps — context is always structured entity summaries + relations from the graph (k5/k6)."
- **[[c17]]** `doc` `CLAUDE.md — Code conventions` — ".js import extensions, import type for type-only imports, getLogger not console.log, never Promise.all over an LLM/embed provider — the documented TypeScript rules the standards dimension baselines on"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.epic (design.epic)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-08-03T07:36:29.801Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| sc5/c1 | citation | LOW | manual | src/daemon/workflow-rpc.ts exports runWorkflowServerSide and runStart, the generic daemon driver + StreamHandler the CodeReviewRunner (sc5) reuses. | runWorkflowServerSide at src/daemon/workflow-rpc.ts:164 and runStart at :439 both confirmed — the generic driver + StreamHandler sc5 reuses are real. | None; the sc5 runner-reuse basis holds. |
| sc5/c1 | citation | LOW | manual | buildShaperProvider and writeAtomic (the provider resolution + atomic write the runner reuses) are imported/available in src/daemon/workflow-rpc.ts. | Direct verification: buildShaperProvider imported at workflow-rpc.ts:32 and called at :428; writeAtomic imported at :41 and called at :318-319. (The review engine's plain-word grep surfaced only doc matches, but both symbols are genuinely used in the runner.) | None; the provider-resolution + atomic-write reuse is real. |
| sc3,sc4/c2 | citation | LOW | manual | src/workflow/review/types.ts declares Severity = 'HIGH'\|'MED'\|'LOW', ReviewVerdict = 'pass'\|'warn'\|'block', Finding, and ReviewReport — the verdict/report vocabulary sc3/sc4 reuse verbatim. | src/workflow/review/types.ts: Severity at :41, ReviewVerdict='pass'\|'warn'\|'block' at :43, ReviewReport at :134 — the verdict/report vocabulary sc3/sc4 reuse verbatim exists exactly as cited. | None; k1 verdict-vocabulary reuse is grounded. |
| sc4,s7/c3 | citation | LOW | manual | src/workflow/gates.ts exports approveArtifactByJsonPath and ReviewBlockedError — the block/override enforcement the completion gate (s7) reuses. | approveArtifactByJsonPath(jsonPath, {overrideReview}) at src/workflow/gates.ts:488 and ReviewBlockedError at :71 — the block/override enforcement s7 reuses is real. | None; the s7 gate-reuse basis holds. |
| sc1/c3 | citation | LOW | manual | src/workflow/gates.ts exports requireApprovedLld and requireApprovedPlan — the approved-contract resolution CodeReviewSubject (sc1) relies on (throws when absent => no-verdict). | requireApprovedLld at gates.ts:255 and requireApprovedPlan at :354 — the throw-if-absent approved-contract resolution sc1 relies on exists. | None; the no-approved-contract→no-verdict basis holds. |
| sc1/c9 | citation | LOW | manual | src/workflow/gates.ts provides a build-stage upstream reader (readBuildUpstream / BuildUpstream) that yields the Story's build record — the input sc1 consumes without re-deriving. | readBuildUpstream at gates.ts:449 + BuildUpstream interface at :443 — the build-stage upstream reader sc1 consumes (without re-deriving) is real. | None; the build-record-as-input basis (k9) holds. |
| sc4/c4 | citation | LOW | manual | src/workflow/storage.ts declares the build artifact family (buildArtifactId 'BUILD-<epic>-<story>', buildArtifactPaths, buildMdRel) + ARTIFACTS_DIR + writeAtomic + pathsForWorkflow — the per-Story peer + storage helpers the CodeReviewArtifact (sc4, 'CR-<epic>-<story>') mirrors. | buildArtifactId at storage.ts:161, pathsForWorkflow at :373, ARTIFACTS_DIR='.insrc/artifacts' at :50 — the per-Story build peer + storage helpers sc4 mirrors all exist. | None; the CR-<epic>-<story> placement mirrors a real peer. |
| s8/c5 | citation | LOW | manual | The controller multi-turn envelope insrc_code_review_step (s8) mirrors is real: handleReviewStep in src/mcp/review-step/handler.ts driving the typed envelope in src/mcp/review-step/types.ts. | handleReviewStep at src/mcp/review-step/handler.ts:32 returning ReviewStepMcpEnvelope — the controller multi-turn envelope insrc_code_review_step (s8) mirrors is real and typed. | None; the k2 envelope-reuse basis holds. |
| s3/c6 | citation | LOW | manual | src/analyze/explore/convention-detect.ts exists — the convention-detection capability the standards dimension (s3) draws on (and whose single-file thinness motivates multi-file sampling). | src/analyze/explore/convention-detect.ts exists and exports runConventionDetect (:86), classifyName (:169) et al — the convention-detection capability s3 draws on is real. | None; the standards-dimension reuse basis holds. |
| sc4/semantic | semantic | LOW | manual | A generic WorkflowArtifact<Body> envelope type exists that CodeReviewArtifact (sc4) can specialize, mirroring the other per-type artifact records. | WorkflowArtifact<Body> is the shared envelope used across artifacts/ (define.ts:78 DefineArtifact = WorkflowArtifact<DefineBody>, hld.ts, etc.), and ArtifactMetaBase exists — so CodeReviewArtifact = WorkflowArtifact<CodeReviewBody> follows the established pattern. | None; the sc4 envelope-specialization is consistent with the artifact family. |

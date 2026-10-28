<!-- insrc:artifact DEF-c32aa60534232f36 -->

# Epic: review-planned-changes-through-agent-investigation

## Summary

**Flavor:** enhancement

Both indexed and diff-based code reviews investigate the same scope-selected commit packets against the approved work plan. Reviewers inspect source as needed; indexed review additionally finds callers of changed entities and assesses their impact. Evidence and progress survive interruptions, and completion accounts for every task and the scoped change while preserving independent review and human approval.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)

## 1. Problem

A Story's independent code review can spend most of its input repeating the same approved requirements across separately prepared source portions, then incur another model call for each requirement. Successive corrections to the same files enlarge the material again, while interrupted reviews discard accepted answers and restart successful work. Operators cannot reliably distinguish complete inspection from partial progress or understand the remaining work and consumption. Large changes therefore take disproportionate time and tokens to reach a trustworthy verdict, and repeated failures make that cost recur without a usable review record.

## 2. Functional requirements

- **E20261028c32aa605:FR001** — A reviewer can investigate approved tasks and changed implementation on demand from a fixed, attributed review subject without repeated full-context source partitions.
- **E20261028c32aa605:FR002** — A review exposes evidence-backed coverage and unresolved work for the entire change and cannot publish a successful completion with missing required coverage.
- **E20261028c32aa605:FR003** — Interrupted work resumes from compatible durable progress without rerunning already accepted work, and concurrent owners cannot corrupt or duplicate finalization.
- **E20261028c32aa605:FR004** — Operators can distinguish progress, failures, uncertainty, estimated allowances and observed usage across all review entrypoints and resumptions.
- **E20261028c32aa605:FR005** — The new code-review mechanism can be introduced and evaluated while preserving independent review, approval policy and existing design-review behavior.

**s1:**

- **E20261028c32aa605:S001:FR001** — Both review modes navigate the same immutable scope-selected commit packets and approved obligations without unrelated commits or hunks entering through generic repository diffs.

**s2:**

- **E20261028c32aa605:S002:FR001** — Review coverage exposes evidence and unresolved work across approved expectations and the entire change.

**s3:**

- **E20261028c32aa605:S003:FR001** — The reviewer investigates evidence on demand, shares related reasoning and yields bounded continuations when work remains.
- **E20261028c32aa605:S003:FR002** — Review execution handles provider failure and cancellation without spending through the remaining backlog.
- **E20261028c32aa605:S003:FR003** — Indexed review can discover callers of changed methods/entities and assess their impact without changing the scoped commit packets used by both review modes.

**s4:**

- **E20261028c32aa605:S004:FR001** — Compatible accepted review progress survives failures and can be resumed safely by one current owner.

**s5:**

- **E20261028c32aa605:S005:FR001** — Completion verifies evidence-backed review coverage and publishes a single current independent code-review result.

**s6:**

- **E20261028c32aa605:S006:FR001** — All supported code-review entrypoints expose compatible execution, progress, recovery and consumption information.
- **E20261028c32aa605:S006:FR002** — The system can adopt or roll back the new mechanism only with explicit compatibility and quality evidence.

## 3. Non-goals

- **Replace design-document review or redesign the analyzer.** — This epic changes post-build code review; shared infrastructure must retain existing design-review behavior.
- **Change severity policy, weaken review criteria or automatically approve work.** — Accuracy and independent evidence remain the purpose of review.
- **Guarantee a fixed token saving or exact token counts where the provider supplies none.** — Savings require measurement; estimates and observed usage have different meanings.
- **Introduce a new token-usage warehouse, model catalog or client-specific delivery-board UI.** — Consume existing accounting contracts; those product capabilities belong to their own epics.
- **Recover model answers that were never persisted by historical runs.** — Legacy metadata cannot reconstruct lost answers.

## 4. Assumptions

- `high` Existing Story-attributed patch assembly is reusable as an input seam, subject to HLD validation; storyRangeDiff in src/workflow/code-review/grounding.ts:446-489 assembles selected units, not the new commit-packet contract. [[c2]]
- `high` The existing chunkCall and codeReviewGather adapters identify the static code-review execution being replaced; their requirements and evidence plumbing are reuse candidates, not the proposed agent investigation loop. [[c7]] [[c6]]
- `high` Existing CLI reviewer sessions have read-only execution support: codexReviewSessionArgs in src/agent/providers/cli-provider.ts:138-140 selects the read-only sandbox. This is a reusable provider seam, not proof that every new review permission boundary is already implemented. [[c11]]
- `high` Existing createReviewBudgetPolicy and measureReviewBudget in src/workflow/review-pipeline/budget.ts:86-149 provide estimated inclusive budgeting; the new continuation policy must integrate and validate these rather than assume their suitability. [[c12]]
- `med` Related tasks can be investigated together without prescribing one model call per task or requirement; quality and consumption must be established by evaluation. [[c1]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | stakeholder | Both indexed and diff-based reviews use the same detailed approved tasks, Story artifact references and immutable scope-selected commit packets with explicit commit identities, parent/merge provenance, relevant changed blocks and old/new line ranges. Generic base-to-HEAD, HEAD or working-tree diffs must not establish or widen scope; unrelated commits and unrelated hunks in shared commits are excluded or explicitly reported as ambiguous. | [[c10]] |
| `k2` | invariant | Review completion accounts for every task and acceptance check, all attributed changes including unplanned work, applicable approved design requirements and existing cross-cutting criteria. Missing evidence stays explicitly unverified and never becomes a fabricated pass. | [[c1]] |
| `k3` | invariant | Preserve independent reviewer identity, severity/verdict semantics, source freshness, human approval gates, and serial LLM dispatch through LLMProvider with CLI-only cloud access. Daemon owns persisted review state. | [[c3]] |
| `k4` | contract | Accepted evidence and progress survive interruption; resume verifies source, contract and policy compatibility and enforces a single current owner. In-flight outcomes not durably accepted remain uncertain, never assumed successful. | [[c1]] |
| `k5` | stakeholder | Each continuation obeys the inclusive estimated request budget and explicit time policy. Repeated provider failures pause useful work promptly; no fixed call-per-clause or eager full-review dispatch is required. | [[c1]] |
| `k6` | contract | Both daemon and controller code-review entrypoints preserve existing completion and artifact compatibility. Builds legitimately without a PLAN use their approved upstream contract and report the basis; they must not invent tasks. | [[c4]] |
| `k7` | contract | Measure consumed usage separately from allowances and estimates; retain attempt provenance across resume and represent unavailable provider usage as unknown. Reused persisted work must not be charged as a new call. | [[c1]] |
| `k8` | contract | A successor may replace predecessor code-review chunking only after staged accuracy/coverage and recovery validation; design-document review remains compatible. Ambiguous concurrent-change attribution must be surfaced rather than silently including foreign work. | [[c5]] |
| `k9` | stakeholder | Indexed review differs only by permitting caller queries for methods/entities changed in the selected commit packets and impact analysis from those results. Impact evidence is distinguished from changed implementation scope. Index identity, freshness, missing entities and incomplete caller coverage are disclosed; index results never select additional review commits or silently substitute for authoritative packet/source evidence. | [[c10]] |

## 6. Stories

### 6.1 STORY-c32aa60534232f36-s1 — Orient both review modes with approved work and scoped commit packets

**User value:** `size: L`

The reviewer knows what was promised and exactly which commits and changed blocks belong to the review, without unrelated repository changes creeping into scope.

**Extends:** [[c9]]

**Acceptance criteria:**

- **ac1:** Given A built Story with an approved PLAN and LLD, when a review subject is prepared, then both review modes receive the same detailed task IDs, descriptions and acceptance checks, Story artifact references and immutable packets identifying only relevant commits, parent/merge provenance, attributed files and changed blocks with old/new line ranges, including added, deleted, renamed and binary files.. _(operationalizes `k1`, `k3`)_
- **ac2:** Given Successive Story commits and concurrent foreign edits to shared files, when the manifest is prepared, then only the explicitly scoped commit packets and relevant hunks are admitted; unrelated commits and unrelated hunks in shared commits do not enter the review through a generic HEAD or working-tree diff. Intermediate edits retain provenance, and packet grouping/navigation may reduce repetition without replacing that provenance with an unscoped net diff. Ambiguous attribution is reported and prevents a misleading complete subject; exact before/after source remains navigable.. _(operationalizes `k1`, `k8`)_
- **ac3:** Given A build route legitimately lacks a PLAN, or an index is unavailable, when the subject is prepared, then the approved upstream contract is identified without inventing tasks; the same commit-packet review and source navigation work without the index, and index completeness is never assumed.. _(operationalizes `k1`, `k6`)_
- **ac4:** Given Approved artifacts or source have changed since a manifest was created, when that subject is opened for investigation, then the mismatch is reported and mixed-revision evidence is not silently accepted.. _(operationalizes `k3`, `k4`)_

### 6.2 STORY-c32aa60534232f36-s2 — Track what the review has established and what remains unverified

**User value:** `size: L`

Users and reviewers can distinguish inspected evidence, unresolved questions and missing coverage.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given An attributed review subject and approved expectations, when coverage is initialized and updated, then every task and acceptance check, applicable approved design obligation, changed block or explicit non-text change, and cross-cutting review criterion remains identifiable with its inspected evidence, findings or reason it is unresolved.. _(operationalizes `k2`)_
- **ac2:** Given A reviewer relates several tasks to shared evidence, when coverage is recorded, then that evidence can support multiple expectations with traceable source references; a note or claimed pass without supporting inspection cannot silently satisfy coverage.. _(operationalizes `k2`)_
- **ac3:** Given A file is removed, a change falls outside the plan or evidence is unavailable, when the reviewer records disposition, then the change remains in the ledger with an explicit assessment or unresolved reason rather than disappearing from scope.. _(operationalizes `k2`, `k8`)_

### 6.3 STORY-c32aa60534232f36-s3 — Investigate related tasks and source on demand within bounded review continuations

**User value:** `size: XL`

The independent reviewer chooses the evidence it needs and handles related work together without repetitive source packets or a mandatory call for each requirement.

**Depends on:** `s1`, `s2`

**Extends:** [[c9]]

**Acceptance criteria:**

- **ac1:** Given A fixed subject with related tasks and an empty coverage ledger, when the reviewer investigates, then both review modes choose necessary packet blocks, surrounding source, helpers and tests and may assess related obligations together, without mandatory eager chunking or one call per clause. Indexed mode additionally queries callers of methods/entities changed in those packets and investigates their impact; affected callers are labeled contextual impact evidence rather than new changed implementation scope.. _(operationalizes `k1`, `k2`, `k9`)_
- **ac2:** Given A continuation approaches its admitted request or time allowance, when it needs further evidence, then it yields an explicit continuation with coverage and pending work, preserves evidence references and uncertainty, and does not truncate required evidence or claim completion; inaccurate index results do not replace source inspection.. _(operationalizes `k2`, `k5`)_
- **ac3:** Given Provider failures recur or a user cancels, when the current continuation stops, then remaining work is paused with a typed reason and useful progress, retries are bounded without attempting the full pending backlog first, and no fabricated verdict is produced.. _(operationalizes `k4`, `k5`)_
- **ac4:** Given A reviewer can inspect repository content, when it conducts a review, then review operations remain read-only, untrusted repository text cannot change review policy or tool permissions, independent-party rules hold and LLM calls remain serial through approved providers.. _(operationalizes `k3`)_
- **ac5:** Given An indexed review has stale, missing or incomplete caller data for a changed method or entity, when impact analysis is requested, then the reviewer discloses index freshness and coverage limits, records unresolved impact questions and can use authoritative source evidence; it neither treats missing callers as proof of no impact nor widens the selected commit set.. _(operationalizes `k2`, `k9`)_

### 6.4 STORY-c32aa60534232f36-s4 — Resume interrupted reviews from durable accepted progress

**User value:** `size: L`

An interruption does not force users to pay for repeating evidence and reasoning that were already accepted.

**Depends on:** `s2`, `s3`

**Acceptance criteria:**

- **ac1:** Given Several continuation results have been durably accepted, when a worker or daemon crashes and the review is resumed, then accepted evidence, coverage and outstanding work are restored and accepted work is not dispatched again; legacy runs without such records are explicitly non-resumable.. _(operationalizes `k4`)_
- **ac2:** Given A provider may have responded but the result was not durably accepted, when recovery inspects the interrupted attempt, then its outcome is marked uncertain with its attempt identity; it is not treated as success or guaranteed free of duplicate external execution, and any retry is recorded.. _(operationalizes `k4`, `k7`)_
- **ac3:** Given Two sessions resume the same review or a prior worker returns late, when results are submitted, then only the current owner can advance accepted progress and terminal publication cannot be duplicated.. _(operationalizes `k3`, `k4`)_
- **ac4:** Given Source, approved contracts, review policy, evidence format or relevant provider/tool compatibility differs from the checkpoint, when resume is requested, then reuse is explicitly validated and incompatible work is invalidated or refused with a reason; inactive elapsed time and remaining execution allowance follow a declared policy rather than silently resetting budgets.. _(operationalizes `k3`, `k4`, `k5`)_
- **ac5:** Given Work is reused, retried or has unavailable provider usage, when consumption is recovered, then attempt provenance survives, accepted replay is not counted as a new model call and observed usage, estimates and unknown usage remain distinct.. _(operationalizes `k4`, `k7`)_

### 6.5 STORY-c32aa60534232f36-s5 — Publish one independent verdict only after accountable review coverage

**User value:** `size: L`

A completed review means the approved work and the whole change were assessed, rather than just that the agent stopped.

**Depends on:** `s2`, `s3`, `s4`

**Acceptance criteria:**

- **ac1:** Given The reviewer requests completion, when required coverage and evidence are checked, then all tasks and acceptance checks, applicable LLD requirements, changed scope and cross-cutting criteria have explicit evidence-backed dispositions; unresolved required evidence prevents a successful complete verdict and remains visible.. _(operationalizes `k2`, `k3`)_
- **ac2:** Given A claimed pass lacks source evidence, a change is unplanned, or approved requirements conflict, when completion is assessed, then unsupported coverage is rejected, unplanned work is judged, and requirement conflicts surface for a human decision rather than being silently weakened or reinterpreted.. _(operationalizes `k2`, `k3`)_
- **ac3:** Given A review reaches a terminal result or repeats a terminal request after recovery, when the result is published, then one compatible code-review record links the subject and coverage evidence, existing severity/verdict and human approval semantics remain intact, and partial or failed execution is not a passing CR.. _(operationalizes `k3`, `k4`, `k6`)_
- **ac4:** Given The reviewed source or approved contract changes before publication, when completion is requested, then stale review evidence is rejected for the new revision and the user sees why further review is required.. _(operationalizes `k3`, `k4`)_

### 6.6 STORY-c32aa60534232f36-s6 — Adopt the new review mechanism with visible progress and verified quality

**User value:** `size: L`

Users can use either supported entrypoint, understand work and consumption, and trust the migration before legacy code-review execution is retired.

**Depends on:** `s1`, `s2`, `s3`, `s4`, `s5`

**Acceptance criteria:**

- **ac1:** Given A supported daemon or controller code-review entrypoint starts or resumes a review, when the new mechanism is selected, then both entrypoints and both grounding modes use the same scoped commit packets, PLAN-directed investigation, evidence, continuation, recovery and completion semantics. Indexed mode differs only in caller lookup and impact analysis; small and planless builds remain supported and no generic HEAD or working-tree diff silently changes scope.. _(operationalizes `k3`, `k6`, `k9`)_
- **ac2:** Given A review is prepared, running, paused or complete, when a client requests status, then it sees review identity, pending/covered work, failures and resume availability plus estimated allowances and observed or unknown usage; a preflight estimate explains uncertainty instead of promising an exact autonomous call count.. _(operationalizes `k5`, `k7`)_
- **ac3:** Given The new engine is considered for default use, when representative defect-detection, cross-file, unplanned-change, planless, concurrency, crash and freshness scenarios are evaluated, then required coverage and independently adjudicated defect detection do not regress; time, calls and repeated input are compared against recorded baselines. Routine tests use deterministic providers, live comparisons are separately authorized and no full legacy review is required for every iteration.. _(operationalizes `k2`, `k3`, `k8`)_
- **ac4:** Given Migration is enabled or rolled back, when legacy code-review paths and shared infrastructure are managed, then the successor explicitly supersedes predecessor code-only chunk/gather requirements at adoption, existing review artifacts remain readable, rollback has a declared compatibility boundary and design-document review behavior is preserved.. _(operationalizes `k6`, `k8`)_

## 7. References

- **[[c1]]** `stakeholder` `Conversation: PLAN-directed review proposal and instruction to define the epic, 2026-10-28` — "send the task list, the reference to the story (path) and the change set (files with changed blocks, line ranges) and then lets the agent figure out what it needs for each"
- **[[c2]]** `code` `src/workflow/code-review/grounding.ts:446-489`
- **[[c3]]** `stakeholder` `Project instructions supplied in this conversation, LLM provider abstraction and architectural rules`
- **[[c4]]** `code` `src/workflow/code-review/subject.ts:121-177`
- **[[c5]]** `prior-artifact` `docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/DEF.md:27-34`
- **[[c6]]** `code` `src/workflow/review-pipeline/adapters/code-review-chunk.ts:141-164`
- **[[c7]]** `code` `src/workflow/review-pipeline/adapters/code-review-gather.ts:156-184`
- **[[c9]]** `code` `src/workflow/review-pipeline/code-review.ts:159-220` — "modelDimensionAdapter prepares material and configures source inspection, chunk calls and gather for a review dimension."
- **[[c10]]** `stakeholder` `Conversation: unified commit-packet review scope clarification, 2026-10-28` — "both index based review and diff review should work in the same way. should be given commit packet(s) only commits relevant to this review scope (no generic diff with HEAD, this causes other changes t"
- **[[c11]]** `code` `src/agent/providers/cli-provider.ts:138-140`
- **[[c12]]** `code` `src/workflow/review-pipeline/budget.ts:86-149`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — define (define)

**0 HIGH · 5 MED · 13 LOW** · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-28T07:33:09.194Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| s2 | ordering | MED | manual | Story s2 (STORY-c32aa60534232f36-s2) declares a dependency on story s1 and no other story. | The only probe run was a grep for the pattern `### 6.2 STORY-c32aa60534232f36-s2[\\s\\S]{0,200}Depends on.*`s1`` against docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/DEF.md, which returned 0 matches. | Evidence is empty/non-addressing: the probe found no occurrence of the expected 's2 section + Depends on s1' text, but this does not prove the dependency claim is wrong — it may simply be formatted differently (different heading numbering/level, different wording of the dependency line, or elsewhere in the file) than the probe's rigid regex assumed. Re-run a looser probe (e.g. search for 'STORY-c32aa60534232f36-s2' and separately for its 'Depends on' line) against the real DEF.md before concluding the ordering premise is wrong or right. |
| s3 | ordering | MED | manual | Story s3 declares dependencies on exactly s1 and s2. | The probe regex `### 6.3 STORY-c32aa60534232f36-s3[\\s\\S]{0,200}Depends on.*`s1`, `s2`` against docs/epics/.../DEF.md returned 0 matches. This only shows the exact literal pattern (heading '### 6.3 STORY-c32aa60534232f36-s3' followed within 200 chars by 'Depends on' then backtick-quoted `s1`, `s2`) was not found verbatim — it does not reveal what the actual dependency line for s3 says, since the section numbering, heading text, or dependency formatting (spacing, quoting, order) could legitimately differ from what the probe assumed. | Read docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/DEF.md directly, locate the STORY-c32aa60534232f36-s3 section, and confirm its actual 'Depends on' line against s1/s2 before relying on this premise; correct the premise text if the dependency set differs. |
| s4 | ordering | MED | manual | Story s4 declares dependencies on exactly s2 and s3. | The probe searched DEF.md for the pattern '### 6.4 STORY-c32aa60534232f36-s4 ... Depends on.*`s2`, `s3`' and found 0 matches in /home/subho/work/dev/insors/insrc/docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/DEF.md. No evidence was returned showing the actual s4 section or its real 'Depends on' line, so the claim that s4 depends on exactly s2 and s3 cannot be confirmed or contradicted from what was gathered — the section may use different formatting, different dependency ids, or the probe's anchor/section numbering (6.4) may be stale. | Re-run the probe against the actual s4 section heading and its literal 'Depends on:' line in DEF.md (grep for 'STORY-c32aa60534232f36-s4' alone, then inspect the following lines) to confirm the real dependency set before relying on this premise. |
| s5 | ordering | MED | manual | Story s5 declares dependencies on exactly s2, s3 and s4. | The grep probe for the pattern '### 6.5 STORY-c32aa60534232f36-s5[...]Depends on.*s2, s3, s4' against DEF.md in docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/ returned 0 matches. No evidence was gathered that confirms or contradicts the dependency list for s5. | Re-check the actual DEF.md section for STORY-c32aa60534232f36-s5 and confirm its literal 'Depends on' line - the exact dependency set (s2, s3, s4) could not be verified from the gathered evidence since the probe found no matching text (possibly due to formatting drift, e.g. different spacing, backtick style, or section heading format). |
| s6 | ordering | MED | manual | Story s6 declares dependencies on all five preceding stories, s1 through s5. | The only probe run was a single regex combining the s6 section header with a literal 'Depends on: `s1`, `s2`, `s3`, `s4`, `s5`' string within 200 chars, and it returned 0 matches against docs/epics/.../DEF.md. A zero-match result on one rigid combined pattern does not establish that s6 lacks these dependencies — it only shows that this exact phrasing/spacing/section-anchor combination isn't present verbatim. The dependency list could be formatted differently (different bullet style, different ordering, separate lines, or a different section number) and still convey the same ordering fact. | Re-run the probe against the real DEF.md with a looser match (e.g. search for the s6 section by itself, then separately for its 'Depends on' line) or open docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/DEF.md directly and read the s6 section to confirm whether it lists s1–s5 as dependencies before trusting or rejecting this ordering premise. |
| assumptions | citation | LOW | manual | storyRangeDiff, defined in src/workflow/code-review/grounding.ts within lines 446-489, assembles selected review units but does not implement the new commit-packet contract this epic proposes. | read src/workflow/code-review/grounding.ts:446-489 confirms storyRangeDiff is defined exactly there (`export async function storyRangeDiff(repoPath, base, set, excludeGlobs, run = runDiff)`), and its body assembles diffs from `set.units`/`set.paths` (splitting plain vs shared paths, running `run()` per unit range, folding merge-edit hunks, returning `{files, body, truncated, hunksByFile}`). Nothing in this function or in the 24 grep matches (DEF.md:70, LLD/PLAN docs, test files) references a 'commit-packet' contract — all describe it in terms of StoryChangeSet units, attribution, and per-path hunk assembly. grep confirms call sites (grounding.ts:516) and test coverage (diff-attribution.test.ts, diff-grounding.test.ts) are consistent with this being existing unit-assembly code, not the new contract. | none — verified sound |
| assumptions | citation | LOW | manual | The chunkCall adapter in src/workflow/review-pipeline/adapters/code-review-chunk.ts:141-164 and the codeReviewGather adapter in src/workflow/review-pipeline/adapters/code-review-gather.ts:156-184 together identify the existing static code-review execution that this epic's agent-investigation loop is proposed to replace. | Both anchors resolve exactly as cited. src/workflow/review-pipeline/adapters/code-review-chunk.ts:141-164 is the real `export function chunkCall(spec, chunk, material, execution)` body — it builds a single structured-review prompt framed as chunked, reasoning only over 'structured symbol summaries' (or source-inspection mode) with obligations/context/neighbours baked into the user message. src/workflow/review-pipeline/adapters/code-review-gather.ts:156-184 is the real `export function codeReviewGather(args)` which returns a GatherPlan whose obligationCall judges one obligation from the evidence notes the chunks wrote ('This review was DIVIDED into chunks... The notes are the whole evidence'). Both are wired into the live code-review pipeline (code-review.ts:31,33,199,220) and exercised by multiple existing tests (code-review-chunking.test.ts, pipeline-job.test.ts, call-limits.test.ts), confirming they are today's actual static code-review execution path, not legacy/dead code. | none — verified sound |
| assumptions / s3 ac4 | citation | LOW | manual | codexReviewSessionArgs in src/agent/providers/cli-provider.ts:138-140 selects a read-only sandbox for existing CLI reviewer sessions, providing a reusable read-only execution seam. | Read of src/agent/providers/cli-provider.ts:138-140 shows the exact function: a doc comment 'codex arguments for a reviewer session: a read-only sandbox, never `--full-auto`.' followed by `export function codexReviewSessionArgs(schemaPath, cwd, modelArgs)` returning `['exec', '--output-schema', schemaPath, '--json', '--sandbox', 'read-only', '-C', cwd, ...modelArgs]`. The grep hits confirm reuse: it is called at cli-provider.ts:512 inside `runCodex(...)` for an existing reviewer session, and is imported/exercised directly in src/agent/providers/__tests__/cli-review-session.test.ts:19,97, matching the premise's description of a reusable read-only execution seam for CLI reviewer sessions. | none — verified sound |
| assumptions / k5 | citation | LOW | manual | createReviewBudgetPolicy and measureReviewBudget, both in src/workflow/review-pipeline/budget.ts:86-149, provide the existing estimated inclusive budgeting that the epic's continuation policy must integrate with. | read src/workflow/review-pipeline/budget.ts:86-149 confirms both cited symbols exist exactly where claimed: createReviewBudgetPolicy begins the range (grep confirms its definition sits at the start of this span, immediately followed by validateReviewBudgetPolicy), and measureReviewBudget (grep: defined at budget.ts:110) runs through the end of the cited range — admitReviewBudget, which calls measureReviewBudget at line 151, begins at line 150, i.e. immediately after the cited 86-149 span. The read body shows measureReviewBudget computing an estimatedTotalTokens that sums promptTokens, schemaTokens, declaredToolsTokens, nativeReserveTokens, transportReserveTokens, completionReserveTokens, inspectionReserveTokens, hostContextReserveTokens and retryHeadroomTokens — i.e. an inclusive, estimated budget exactly as the premise describes — and createReviewBudgetPolicy builds the ReviewBudgetPolicy consumed by it. Widespread call sites (read-only-tool-loop.ts, review-budget.ts, measurement.ts, multiple test files) corroborate these are the live, existing budgeting primitives. | none — verified sound |
| references / s1,s3 Extends | citation | LOW | manual | modelDimensionAdapter in src/workflow/review-pipeline/code-review.ts:159-220 prepares material and configures source inspection, chunk calls and gather for a review dimension, and is the existing mechanism that stories s1 and s3 extend. | The read of src/workflow/review-pipeline/code-review.ts:159-220 confirms the premise verbatim: `export function modelDimensionAdapter<O>(spec, subject, snapshot, limitChars, path, budgetPolicy): ReviewAdapter<DimensionResult>` builds `execution` (source-inspection vs structured mode), a lazily-built `material()`, a `stages()` function that assembles model/deterministic stages with `chunkCalls`, and returns an object that conditionally includes `gather: codeReviewGather(...)` — i.e. it prepares material and configures source inspection, chunk calls and gather for a review dimension, exactly as cited. The comments at this exact site already read 'Story s3: its obligations and their context' and 'Story s3: a divided review judges each obligation once, over every chunk's notes', independently corroborating s3 as an extension point of this mechanism. 's1' does not appear in these lines, but that is expected if s1 is a new, not-yet-built story proposing to extend this adapter — the gathered grep/read evidence cannot contradict a forward-looking design claim about an unbuilt story. | none — verified sound; the function, its location, and its described behavior match the real source exactly, and the s3 extension role is independently corroborated by existing in-code comments. |
| k6 / references | citation | LOW | manual | src/workflow/code-review/subject.ts:121-177 is the existing implementation backing constraint k6's requirement that builds without a PLAN use their approved upstream contract and report the basis rather than inventing tasks. | The read of src/workflow/code-review/subject.ts:121-177 shows resolveCodeReviewSubject resolving approvedLld and approvedPlan independently, each in its OWN try/catch: ArtifactMissingError or ArtifactNotApprovedError for either is caught and mapped to null for that field only, while any other error propagates unchanged. This is exactly the 'use their approved upstream contract' mechanism k6 describes — when no approved PLAN exists, approvedPlan is simply null and approvedLld (the upstream contract) remains available, with both fields carried forward (not shown past line 177, but set up here) rather than any fabricated/invented task list being constructed in this block. | none — verified sound; the cited lines correctly implement the optional, independently-resolved LLD/PLAN contract fallback that k6 requires. If the reviewer wants the 'report the basis' half of k6 pinned down too, extend the citation a little past line 177 to the return/result construction, but that is a refinement, not a correction. |
| k8 / references | cross-artifact | LOW | manual | The prior epic artifact docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/DEF.md, lines 27-34, establishes the compatibility boundary that constraint k8 requires this epic's successor mechanism to respect when superseding predecessor code-review chunking. | Reading docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/DEF.md lines 27-34 confirms the cited lines contain FR001-FR008 of the prior epic: FR001 (every review passes through the same prepare/review/gather stages), FR003-FR006 (how chunking divides material, carries cross-chunk summaries, guarantees nothing is cut or dropped, and gathers chunk findings into one equivalent-to-whole-material result), FR007 (per-call unique identifiers to prevent duplicate sends), and FR008 (the chunk limit is one token-based setting, default 128K). This is exactly the functional contract (chunk boundaries, dedup/no-drop guarantees, gather-stage equivalence, and the single tunable limit) that a successor mechanism superseding this chunking approach must remain compatible with. The anchor resolves to the correct file and line range and the content is on-topic for the stated constraint. | none - verified sound |
| section 6 | inventory | LOW | manual | Section 6 defines exactly six stories, STORY-c32aa60534232f36-s1 through -s6, with no gaps or duplicates in the sequence. | grep for /^### 6\\.[0-9]+ STORY-c32aa60534232f36-s[0-9]+/ in DEF.md returns exactly 6 matches: 6.1→s1 (line 92), 6.2→s2 (line 107), 6.3→s3 (line 121), 6.4→s4 (line 139), 6.5→s5 (line 155), 6.6→s6 (line 170). The sequence s1-s6 is contiguous with no gaps and no duplicate story ids or section numbers. | none — verified sound |
| section 5 | inventory | LOW | manual | The constraints table in section 5 lists exactly nine constraints, k1 through k9, each with a distinct ID. | grep for "^\| `k[0-9]` \|" in DEF.md returned exactly 9 matches, at lines 80-88, with IDs k1, k2, k3, k4, k5, k6, k7, k8, k9 — each a distinct row with its own category (stakeholder/invariant/contract) and citation. | none — verified sound |
| section 2 | inventory | LOW | manual | Section 2 lists exactly five epic-level functional requirements, E20261028c32aa605:FR001 through FR005, before any per-story FR groupings begin. | grep for `^- \\*\\*E20261028c32aa605:FR[0-9]{3}\\*\\*` against docs/epics/.../DEF.md returned exactly 5 matches, lines 27-31: FR001 through FR005 in sequential, unbroken order with no gaps or duplicates. | none — verified sound |
| section 2 | inventory | LOW | manual | The six per-story functional-requirement groupings in section 2 are labeled s1 through s6 and each group's requirement IDs use the matching story number (S001 under s1, S002 under s2, ..., S006 under s6), in the same order as the six stories in section 6. | The six **sN:** headers at DEF.md:33,37,41,47,51,55 (s1..s6) each precede exactly the matching story's FR IDs before the next header: s1(33)→S001:FR001(35); s2(37)→S002:FR001(39); s3(41)→S003:FR001-003(43-45); s4(47)→S004:FR001(49); s5(51)→S005:FR001(53); s6(55)→S006:FR001-002(57-58). The story-number-to-section mapping is exact and consistently ordered 1 through 6. | none — verified sound |
| k9 / s6 ac1 | closed-union | LOW | manual | Constraint k9 and story s6's acceptance criterion ac1 make the same closed-union claim: indexed review and diff-based review are identical in every respect except that indexed review additionally permits caller queries and impact analysis for changed methods/entities, and that difference never widens the selected commit scope. | DEF.md:88 (k9): 'Indexed review differs only by permitting caller queries for methods/entities changed in the selected commit packets and impact analysis from those results... index results never select additional review commits or silently substitute for authoritative packet/source evidence.' DEF.md:180 (ac1): 'Indexed mode differs only in caller lookup and impact analysis; small and planless builds remain supported and no generic HEAD or working-tree diff silently changes scope.' Both independently state the same closed-union claim: the sole delta between indexed and diff-based review is caller-query/impact-analysis capability, and neither mode widens the selected commit scope. | none — verified sound |
| Contents | citation | LOW | manual | Each of the seven table-of-contents links in the Contents section (#1-problem through #7-references) resolves to a correspondingly numbered level-2 header later in this same document. | grep ^## [1-7]\\. over DEF.md returns exactly 7 matches at lines 21, 25, 60, 68, 76, 90, 185, with headers '## 1. Problem', '## 2. Functional requirements', '## 3. Non-goals', '## 4. Assumptions', '## 5. Constraints', '## 6. Stories', '## 7. References' — matching all seven anchors in both number and text. | none — verified sound |

#### Proposed fixes

- **s2** (manual) — Cannot derive a safe text correction from a zero-match, non-addressing probe; need a re-check of the actual DEF.md section 6.2 for s2's real dependency line before any artifact edit is proposed.
  - option: Re-run probe with a looser regex (match story id and 'Depends on' separately) against DEF.md
  - option: Manually open docs/epics/.../DEF.md section 6.2 for s2 and confirm the literal dependency line
  - option: If confirmed correct, resolve as could-not-verify; if different, correct the premise's stated dependency

- **s3** (manual) — A single zero-match grep probe with a rigid pattern is a limitation of the probe, not proof the dependency claim is wrong or absent — this is UNVERIFIABLE rather than contradicted, and no safe mechanical edit can be derived without reading the actual section content.
  - option: Manually open DEF.md and verify the literal 'Depends on' line for STORY-c32aa60534232f36-s3
  - option: Re-run the probe with a looser pattern (flexible heading numbering/quoting/order) before concluding anything about this premise
  - option: If verification confirms s3 depends only on s1 and s2, mark this premise as holds and move on

- **s4** (manual) — The gathered evidence is a zero-match grep, not a disconfirming read of the real dependency line, so there is no evidence-derived text to mechanically substitute.
  - option: Re-grep DEF.md for 'STORY-c32aa60534232f36-s4' and read the following lines to find the real 'Depends on' list, then correct the premise/anchors to match
  - option: If s4's dependency line uses different formatting (e.g. no backticks, different section number), update the probe's regex rather than the artifact
  - option: Confirm with the author whether s4's intended dependencies are still s2 and s3

- **s5** (manual) — No real evidence was returned to derive a mechanical correction from; the premise is unverifiable rather than confirmed or contradicted, so no auto-edit can be safely derived.
  - option: Re-run the grep probe with a looser pattern (just the story id and 'Depends on' separately) to locate the actual dependency line in DEF.md
  - option: Manually inspect DEF.md section 6.5 for s5 to confirm the real dependency list before relying on this premise
  - option: If s5's dependency list cannot be located at all, flag this as a missing or incomplete DEF section rather than a wrong premise

- **s6** (manual) — No real evidence was gathered that confirms or contradicts the premise, so no mechanical text correction can be derived; a human/reviewer needs to re-check the actual DEF.md section content.
  - option: Re-run grep with a relaxed pattern against DEF.md section 6.6 to locate the actual 'Depends on' line
  - option: Directly read the s6 section of DEF.md to verify its listed dependencies
  - option: Treat as unresolved and ask the author to confirm s6's dependency list

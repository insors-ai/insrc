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
- `high` Existing CLI reviewer sessions have read-only execution support: codexReviewSessionArgs in src/agent/providers/cli-provider.ts:148-150 selects the read-only sandbox. This is a reusable provider seam, not proof that every new review permission boundary is already implemented. [[c11]]
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
| `k8` | contract | A successor may replace predecessor code-review chunking only after staged accuracy/coverage and recovery validation; design-document review remains compatible. Ambiguous concurrent-change attribution must be surfaced rather than silently including foreign work. | [[c13]] |
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

### 6.7 STORY-c32aa60534232f36-s7 — Make scoped reviews usable with simple assessments and durable progress

**User value:**

A developer obtains an independent, useful review of the exact built changes, sees progress survive interruption, and can enable a proven review mode without repeated evidence-approval ceremonies. Existing safeguards remain intact and unavailable evidence is clear.

**Acceptance criteria:**

- **ac1:** Given A built Story and an explicitly selected immutable review scope, when an independent reviewer investigates the change, then the reviewer can read the selected changes and surrounding pinned context and submit a block assessment without constructing internal run digests, ownership generations, sequence counters or complete coverage-row objects; host-owned binding, provenance and scope checks remain authoritative..
- **ac2:** Given Added, deleted or insertion-only changes and a rejected evidence request, when navigation is presented and source is inspected, then supplied references are valid for their actual source spans, contextual reads are clearly distinguished from changed scope, and safe actionable refusal details identify how to correct a request; bounded diagnostics retain the failed operation's cause without leaking private source or credentials..
- **ac3:** Given A review has established a block assessment and further investigation remains, when the reviewer moves on, its attempt approaches the existing budget/time cap, or the run is cancelled or interrupted, then useful assessed progress is durably acknowledged promptly, unfinished work yields explicitly, and compatible resume retains accepted work without repeating it; cross-file investigation stays possible and one current owner controls updates..
- **ac4:** Given Approved tasks, applicable design expectations and selected changes include related requirements or missing evidence, when coverage and results are presented, then the reviewer and user receive concise grouped expectations with traceability to all applicable obligations, no fabricated satisfaction and an explicit useful inconclusive report when evidence is missing; inconclusive work never becomes a successful complete review or automatic BUILD approval..
- **ac5:** Given A qualified installed backend and an operator considering a bounded pilot or default adoption, when readiness is checked or ordinary review implementation code changes, then one understandable operational decision exposes actual compatibility, test and live-review evidence without repeated standalone approval workflows for fixture outputs; isolation qualification follows the actual execution boundary, source/contract freshness remains enforced, and default activation still requires explicit human signoff..
- **ac6:** Given The qualified Claude source-only path is the first deployment target, when representative real clean-change and known-defect reviews and a cancel/resume/concurrent-owner scenario are exercised, then the existing engine produces useful durable progress and a correct final result or explicit limitation through normal admission, recorded evidence supports the activation decision, and indexed enrichment and other backends can be enabled separately only after their own capability checks..
- **ac7:** Given The implementation is ready for independent final Story review, when build validation and Story completion are performed, then task validation precedes final code review and final code review precedes completion approval, with no circular prerequisite, no silent review bypass and no relabelling of earlier failed acceptance as passed; existing legacy/design-review compatibility, accuracy policy, CLI-only cloud access and cancellation/budget controls remain preserved..

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
- **[[c11]]** `code` `src/agent/providers/cli-provider.ts:148-150`
- **[[c12]]** `code` `src/workflow/review-pipeline/budget.ts:86-149`
- **[[c13]]** `stakeholder` `Conversation: user requires real-life validation and explicit activation signoff before legacy code-review deletion` — "ok, we need to test this in real life by updating the daemon and then signoff for activation. post that the legacy review engine needs to be deleted"

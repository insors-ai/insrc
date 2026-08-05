<!-- insrc:artifact DEF-761a43a6fa645815 -->

# Epic: Once a Story's approved design and plan are turned into actual code, nothing in the chain independently examines the code that came out.

**Flavor:** enhancement

## Problem

Once a Story's approved design and plan are turned into actual code, nothing in the chain independently examines the code that came out. The scrutiny that exists lands elsewhere: the design artifacts are premise-audited as prose before they are approved, and the build stage closes out by recording what its own run did. Neither one looks at the changed files a Story produced. So there is no point at which someone other than the author asks whether the implementation actually honours the design contract, the plan's ordered task breakdown, and the Story's acceptance criteria; whether it obeys the repo's documented rules and the local conventions of the modules it touched; whether the new and changed symbols are exercised by tests — including the per-task tests the plan itself called for — and whether those tests pass; or whether the code carries correctness risks, avoidable complexity, duplication, or unhandled error paths. A Story can therefore reach completion with code that no second pair of eyes has assessed, and any divergence between what was approved and what was written stays invisible until it resurfaces later as defects or as accumulated drift from the design.

## Non-goals

- **Replacing, absorbing, or altering the existing design-artifact review that premise-audits DEF/HLD/LLD/PLAN prose** — That review answers a different question — whether the design's stated premises hold — and operates on artifact text, not on produced code. Both are needed; collapsing them would lose the artifact-level audit and muddy the verdict semantics this Epic must mirror.
- **Repo-wide or module-wide code-health assessment** — Scope here is a single Story's changed files judged against that Story's approved design and plan. A module-scoped, read-only view of test health is already framed by a separate Epic (8f485fe5c614fefc); duplicating it would produce two competing answers with different scopes.
- **Modifying, repairing, or re-authoring the code under review** — Authoring code belongs to the build stage. A stage that both writes and judges the same code is not an independent second opinion, which is the entire point of this Epic.
- **Re-deriving or replacing the build stage's own record of what a run did** — That record is owned by the build Epic (185807ba9a6b35d3) and is an input to this stage, not something to reproduce. Re-deriving it would fork the source of truth for what was built.
- **Reviewing code that was not produced under an approved design and plan for a Story** — Without an approved contract to review against, the adherence and coverage dimensions have no reference point, and the result would degrade into generic linting.
- **Judging whether the approved design or plan was itself the right decision** — That judgement was already made and approved upstream. Re-opening it here would turn a code gate into a design re-litigation and would block Stories for reasons the author cannot act on in code.

## Assumptions

- `med` The build stage yields an identifiable, per-Story set of changed files (a diff) that a downstream stage can consume as its subject. [[c9]]
- `high` The approved plan artifact states the tests each unit of work should produce, giving the coverage dimension an approved expectation to check against rather than an invented one. [[c10]]
- `high` The existing artifact-review input/result shapes are stable enough to serve as the template for a code-level equivalent's persisted report and verdict. [[c2]]
- `high` The multi-turn phase contract of the existing controller-drivable review tool is a workable template for a code-level controller path, so the independent-eyes loop does not need a new interaction model. [[c4]]
- `low` A daemon-side, LLMProvider-driven review driver already exists at the cited path and is the pattern to follow; only its path and resolver ranking are grounded — its internal shape was never profiled, so the fit is unverified. [[c6]]
- `high` Per-file convention detection is too thin to ground a standards judgement — sampling one file put every signal below the confidence threshold — so the standards dimension must lean on repo-level documented rules plus multi-file sampling. [[c12]]
- `med` The indexed graph covers the Story's new and changed symbols closely enough after a build for structured grounding, so the reviewer does not need raw file dumps to reason about them. [[c16]]
- `med` The L scope is set by the size of the module this stage must mirror — 12 files, 96 entities, ~114 KB — rather than by the number of review dimensions. [[c7]]
- `high` No existing Epic in the chain frames this problem: the build Epic stops at the run record and the review module audits artifacts, so a new Define is required rather than an amendment. [[c13]]
- `med` The existing CLI service call site for artifact review indicates the surface area a code-level equivalent will also have to expose, beyond the daemon-internal path. [[c5]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | contract | The persisted code-review record must carry a block/warn/pass verdict and mirror the report shape of the existing artifact review, so downstream approval logic reads one verdict vocabulary. | [[c2]] |
| `k2` | contract | The controller-drivable path must follow the established multi-turn phase envelope contract (start / emit / done / error / opaque state) used by the existing review step tool. | [[c4]] |
| `k3` | invariant | All model access goes through the LLMProvider abstraction; cloud access is via the locally installed CLI binaries only. Direct cloud REST calls from our process must not be introduced. | [[c14]] |
| `k4` | invariant | Nothing that reaches an LLM provider — cloud or local embed/complete — may be issued under Promise.all; calls stay serial. | [[c17]] |
| `k5` | invariant | The daemon owns all DB access; the MCP tool and any CLI surface reach storage only through IPC, never by opening LMDB or LanceDB directly. | [[c16]] |
| `k6` | invariant | Grounding context is structured entity summaries and relations from the graph, not raw file dumps. | [[c16]] |
| `k7` | contract | Approval must remain the existing gated act — an artifact is presented, the user explicitly approves, and a blocking review verdict is enforced unless explicitly overridden. | [[c8]] |
| `k8` | stakeholder | The new stage must remain distinct from the artifact review the documentation describes: that one is scoped to artifacts and to pre-approve, with no code-level equivalent after build. | [[c8]] |
| `k9` | contract | The stage runs after build and consumes its output; it is the immediate downstream neighbour of the build Epic and must not duplicate that Epic's run record. | [[c9]] |
| `k10` | invariant | Accuracy is primary and cost is the least priority: review is a critical role, so it must not be served below the high model tier to save cost. | [[c14]] |
| `k11` | convention | Implementation follows the repo's TypeScript conventions: .js extensions on import paths, import type for type-only imports, getLogger instead of console.log, strict-mode handling of optional and indexed access. | [[c17]] |
| `k12` | convention | The standards dimension must evaluate against the repo's documented rules as its baseline, since those rules are the stated contract the code is expected to honour. | [[c17]] |

## Stories

### E20260803761a43a6:S001 — A code review is scoped to exactly the code one Story produced

**User value:** `size: M`

Whoever reads the review can trust that every judgement is about this Story's own changes, so findings are attributable to the Story's author and actionable inside the Story rather than being generic noise about the wider repo.

**Extends:** [[c10]] [[c13]]

**Acceptance criteria:**

- **ac1:** Given a Story whose build has finished and whose build record already states what that run did, when a code review of that Story is requested, then the review's subject is exactly the set of files that Story's build changed, unrelated code is not judged, and the build's own record is consumed as input rather than re-derived. _(operationalizes `k9`)_
- **ac2:** Given a Story that has no approved design and no approved plan, when a code review of that Story is requested, then no verdict is produced and the requester is told that there is no approved contract to review against. _(operationalizes `k9`)_
- **ac3:** Given the review needs to understand the new and changed behaviour in the Story's files, when it assembles its grounding, then it works from structured summaries of the affected symbols and their relationships rather than from raw file contents. _(operationalizes `k6`)_
- **ac4:** Given any surface — daemon-internal or external — needs stored knowledge about the Story's symbols, when that knowledge is fetched, then it is obtained through the daemon rather than by any other surface reading the stores directly. _(operationalizes `k5`)_
- **ac5:** Given a code review of a Story is in progress or has finished, when the Story's files are inspected afterwards, then they are byte-for-byte unchanged by the review. _(operationalizes `k9`)_

**Local constraints:**

- `c101` (invariant) Code produced without an approved design and plan for a Story is not a valid review subject — without an approved contract the adherence and coverage judgements have no reference point. [[c17]]
- `c102` (invariant) The review only reports; it never modifies, repairs, or re-authors the code it is judging, because a stage that both writes and judges the same code is not an independent second opinion. [[c6]]

### E20260803761a43a6:S002 — See whether the implementation honours the approved design, the plan's tasks, and the Story's acceptance criteria

**User value:** `size: L`

Divergence between what was approved and what was actually written becomes visible at the moment it happens, instead of resurfacing later as defects or as silent drift away from the design.

**Depends on:** `s1`

**Extends:** [[c14]]

**Acceptance criteria:**

- **ac1:** Given a Story with an approved design contract, an ordered task breakdown, and stated acceptance criteria, when the adherence judgement runs over the Story's changed code, then each place where the code departs from an approved expectation is reported as a finding that names the specific expectation it failed to meet. _(operationalizes `k9`)_
- **ac2:** Given an implementation that satisfies every approved expectation, when the adherence judgement runs, then it reports no divergence rather than manufacturing findings to appear thorough. _(operationalizes `k10`)_
- **ac3:** Given code that faithfully implements a design decision the reviewer would have made differently, when the adherence judgement runs, then no finding is raised against that decision, because the decision itself is not what is under review. _(operationalizes `k8`)_
- **ac4:** Given the adherence judgement requires model reasoning, when that reasoning is obtained, then it comes through the sanctioned local model path with no direct cloud calls, and is never served below the tier reserved for critical roles. _(operationalizes `k3`, `k10`)_

**Local constraints:**

- `c103` (stakeholder) Whether the approved design or plan was the right decision is out of scope; that judgement was made and approved upstream and cannot be acted on in code by the Story's author. [[c17]]

### E20260803761a43a6:S003 — See whether the code obeys the repo's documented rules and the conventions of the modules it touched

**User value:** `size: M`

Rule and convention drift is caught while the change is still fresh, so the codebase keeps reading as one system instead of accumulating per-Story dialects.

**Depends on:** `s1`

**Extends:** [[c16]] [[c13]]

**Acceptance criteria:**

- **ac1:** Given a Story's changed files and the repo's documented rules, when the standards judgement runs, then the documented rules are used as the baseline and each breach is reported as a finding naming the rule it breached. _(operationalizes `k12`)_
- **ac2:** Given changed code that breaks a documented TypeScript rule — a missing import extension, a type-only import written as a value import, direct console output instead of the logger, or unhandled optional and indexed access, when the standards judgement runs, then each such breach is reported individually with its location. _(operationalizes `k11`, `k12`)_
- **ac3:** Given a change that touches modules with their own local idioms, when the standards judgement samples those conventions, then the sample spans the touched modules rather than a single file, and any convention drawn from too few examples is surfaced as a low-confidence observation rather than a breach. _(operationalizes `k12`)_
- **ac4:** Given code that reaches a model provider for completions or embeddings, when the standards judgement runs, then concurrent fan-out of those calls is reported as a breach of the serial-calls rule. _(operationalizes `k4`, `k12`)_
- **ac5:** Given code on a surface other than the daemon that reaches storage directly, or that assembles context from raw file contents, when the standards judgement runs, then each is reported as a breach of the daemon-owns-storage and structured-grounding rules. _(operationalizes `k5`, `k6`)_

**Local constraints:**

- `c104` (convention) Convention signals sampled from too few examples are reported as observations, not as violations — single-file sampling put every signal below the confidence threshold in the scoping evidence. [[c16]]

### E20260803761a43a6:S004 — See whether the Story's new and changed behaviour is actually exercised by passing tests

**User value:** `size: L`

A Story cannot quietly complete with untested behaviour or with the very tests its own plan promised still missing or red.

**Depends on:** `s1`

**Extends:** [[c13]]

**Acceptance criteria:**

- **ac1:** Given a Story whose approved plan states the tests each unit of work should produce, when the coverage judgement runs, then every promised test is reported as present or missing, and each present one as passing or failing. _(operationalizes `k9`)_
- **ac2:** Given symbols the Story newly added or changed, when the coverage judgement runs, then each one is reported as exercised or not exercised by a test, using the recorded relationships between tests and the code they reach. _(operationalizes `k6`)_
- **ac3:** Given behaviour with a test that exists but does not pass, when the coverage judgement reports, then it is distinguished from behaviour with no test at all, because the two call for different responses. _(operationalizes `k10`)_
- **ac4:** Given modules the Story touched that have pre-existing gaps unrelated to this Story's change, when the coverage judgement runs, then those gaps are not reported as findings against this Story. _(operationalizes `k9`)_

**Local constraints:**

- `c105` (invariant) Coverage here is scoped to the Story's changed behaviour, not to the overall health of the modules it touched; a module-scoped, read-only view of test health is owned elsewhere and duplicating it would produce two competing answers. [[c12]]

### E20260803761a43a6:S005 — See the correctness, complexity, duplication, and error-handling risks the change carries

**User value:** `size: M`

Problems that are neither a rule breach nor a design divergence — a mishandled failure path, a needlessly tangled routine, a third copy of the same logic — get named before they are merged and forgotten.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given a Story's changed code, when the quality judgement runs, then correctness risks, avoidable complexity, duplication, and unhandled error paths are each reported as findings carrying a location and a severity. _(operationalizes `k1`)_
- **ac2:** Given a suspected duplication of logic that already exists elsewhere in the repo, when the quality judgement reports it, then the existing counterpart is identified, so the reader can confirm the overlap instead of taking the claim on trust. _(operationalizes `k6`)_
- **ac3:** Given a finding that turns out to be a matter of taste rather than a risk, when the quality judgement reports, then it is not raised at a severity that would block the Story. _(operationalizes `k1`)_
- **ac4:** Given the quality judgement requires model reasoning over the change, when that reasoning is obtained, then it is served at no less than the tier reserved for critical roles, and cost is not traded against the accuracy of the judgement. _(operationalizes `k10`, `k3`)_

### E20260803761a43a6:S006 — The four judgements become one persisted review record with a block, warn, or pass verdict

**User value:** `size: M`

Everyone downstream — the author, the approver, and anything that gates on the outcome — reads one durable record in one verdict vocabulary, rather than four separate opinions that have to be reconciled by hand.

**Depends on:** `s2`, `s3`, `s4`, `s5`

**Extends:** [[c13]] [[c14]] [[c15]]

**Acceptance criteria:**

- **ac1:** Given completed adherence, standards, coverage, and quality judgements for a Story, when the review is finalised, then a single record is persisted that carries all four dimensions' findings and one overall verdict of block, warn, or pass. _(operationalizes `k1`)_
- **ac2:** Given a persisted code-review record, when anything downstream reads its verdict, then the verdict vocabulary and report shape match the existing artifact review's, so no downstream reader needs a second interpretation. _(operationalizes `k1`)_
- **ac3:** Given a Story that has both a design-artifact review and a code review, when either record is read, then each is identifiable as its own kind of review with its own subject, and neither replaces or overwrites the other. _(operationalizes `k8`)_
- **ac4:** Given several dimensions of a review that each need model reasoning, when the review runs, then those requests are issued one after another rather than concurrently against the provider. _(operationalizes `k4`)_
- **ac5:** Given a review run that fails partway through, when the outcome is reported, then no record is left claiming a pass, and the failure is stated as a failure rather than as an absence of findings. _(operationalizes `k1`)_

**Local constraints:**

- `c106` (contract) The record must stay recognisably separate from the design-artifact review: that one audits the premises of design prose before approval, this one audits produced code after build. Both continue to exist. [[c6]]

### E20260803761a43a6:S007 — A blocking code-review verdict holds the Story back until it is addressed or explicitly overridden

**User value:** `size: S`

The review is a real gate rather than advice — a Story cannot reach completion carrying blocking findings unless someone knowingly and visibly decides otherwise.

**Depends on:** `s6`

**Acceptance criteria:**

- **ac1:** Given a Story whose code review returned a blocking verdict, when completion of that Story is attempted, then it is refused and the blocking reason is relayed to the person attempting it. _(operationalizes `k7`, `k1`)_
- **ac2:** Given a blocking verdict the user has decided to accept anyway, when they explicitly override it, then completion proceeds and the override is recorded alongside the verdict it bypassed. _(operationalizes `k7`)_
- **ac3:** Given a code review that returned warn rather than block, when completion is attempted, then it is allowed and the warnings are still surfaced to the user before they act. _(operationalizes `k7`, `k1`)_
- **ac4:** Given a Story ready to complete, when the user is asked to approve it, then the review outcome is presented first and approval remains an explicit act by the user rather than something taken automatically on their behalf. _(operationalizes `k7`)_

### E20260803761a43a6:S008 — An independent reviewer outside the daemon can drive the same code review turn by turn

**User value:** `size: M`

The review can be performed by a second set of eyes rather than by the same reasoning that produced the code — which is the whole reason the gate is worth having.

**Depends on:** `s6`

**Extends:** [[c14]] [[c15]]

**Acceptance criteria:**

- **ac1:** Given an external controller that wants to review a Story's code itself, when it starts a code review, then it is handed the work one turn at a time — a start, one or more turns where it supplies its own judgement, and a terminal done or error — matching the turn-taking contract the existing controller-driven review already uses. _(operationalizes `k2`)_
- **ac2:** Given an in-progress controller-driven review, when the controller takes its next turn, then it carries back an opaque token from the previous turn unchanged, and the review resumes exactly where it left off. _(operationalizes `k2`)_
- **ac3:** Given a controller-driven review that reaches its terminal turn, when the outcome is persisted, then it produces the same kind of record and the same verdict vocabulary as a review the daemon drove on its own. _(operationalizes `k1`, `k2`)_
- **ac4:** Given a controller driving a review from outside the daemon, when it needs grounding about the Story's code, then it receives structured summaries served through the daemon, and never reaches the stores itself. _(operationalizes `k5`, `k6`)_
- **ac5:** Given a controller that supplies malformed or incomplete judgement on a turn, when that turn is submitted, then the review returns an error naming what was wrong instead of silently accepting it and producing a verdict. _(operationalizes `k2`)_

**Local constraints:**

- `c107` (stakeholder) A review performed by the same model that authored the code is a self-review; the independent path exists so the judging reasoning can be different from the authoring reasoning. [[c6]]

### E20260803761a43a6:S009 — Wait for a fresh index before grounding a Story's code review

**User value:**

insrc_code_review_step must never silently produce a hollow PASS when the daemon graph is stale for the Story's changed files (the S001 incident: empty grounding.symbols after an un-reindexed commit). This story adds an indexing-readiness gate to the start phase: it detects staleness with a combined signal (queue.isProcessing AND each changed file's lastIndexedAt watermark vs its mtime); on stale it returns an explicit confirm_wait turn carrying the stale-file list; on an explicit proceed:true resume it runs a bounded block-and-poll that waits for the queued files to drain (never calling repo.reindex — the file-watcher already enqueues them), bounded by a configurable codeReview.* timeout; on timeout it re-prompts (keep waiting longer / abort) rather than deciding unilaterally. Records produced by the fresh graph-grounded path are stamped groundingMode:'full'. On decline/abort the review fails closed with no verdict for now — the sibling Story B replaces that fail-closed exit with a diff-only degraded review. Scope reuses the daemon index-status surface (queue.isProcessing at src/daemon/queue.ts:154, the lastIndexedAt watermark, repo.reindex IPC) as-is and never triggers repo.reindex.

**Acceptance criteria:**

- **ac1:** Given the daemon index is stale for at least one file the Story changed (its lastIndexedAt predates the file mtime, or the queue is still processing it), when insrc_code_review_step's start phase runs, then it returns a confirm_wait result carrying the stale-file list instead of proceeding to grounding, so a hollow PASS against empty grounding.symbols is impossible.
- **ac2:** Given a confirm_wait result was returned, when the caller resumes start with proceed:true, then the tool block-and-polls the combined signal (queue.isProcessing AND per-file lastIndexedAt vs mtime) until the changed files are fresh, without ever calling repo.reindex, then serves grounding and runs the four dimension judges.
- **ac3:** Given the block-and-poll has run longer than the configurable codeReview.* timeout without the index becoming fresh, when the timeout fires, then the tool returns another confirm_wait-style turn offering keep-waiting-longer or abort, rather than unilaterally deciding to abort or proceed.
- **ac4:** Given the daemon index is already fresh for every changed file, when start runs, then it proceeds directly to grounding + the four judges with no confirm_wait turn, and the resulting code-review record is stamped groundingMode:'full'.
- **ac5:** Given the user declines to wait (aborts at the initial confirm_wait or a later timeout re-prompt), when the abort is received, then the review fails closed for now — no dimension judges run and no verdict/record is written (an interim behaviour that Story B's diff-only fallback supersedes).

## Open questions

- Item a2: HONEST FAIL. Exactly one assumption is low-confidence — "A daemon-side, LLMProvider-driven review driver already exists at the cited path and is the pattern to follow; only its path and resolver ranking are grounded — its internal shape was never profiled, so the fit is unverified." The Epic object has no openQuestions field at all (keys are problem, nonGoals, assumptions, constraints, citations), so this assumption maps to nothing. It is precisely the case the rule exists for: c6/c15 ground only the path and a 0.314 resolver rank for src/daemon/workflow-rpc.ts, and s1 explicitly records that no module.profile or symbol.locate ran against it. Fix: add an openQuestion asking whether workflow-rpc.ts's driver shape actually fits a code-review path, and link assumptions[4] to it.
- Item ac2: Every operationalizes id is real — all 35 criteria reference only k1–k12, no dangling ids. But several point at a constraint they do not operationalize, while the Story's own localConstraints c101–c107 are referenced by nothing at all. Clearest cases: s1.ac2 (no approved design/plan ⇒ no verdict) cites k9 (runs after build, must not duplicate the run record) when its actual basis is local c101; s1.ac5 (files byte-for-byte unchanged) cites k9 when its basis is local c102; s2.ac3 (no finding against a design decision the reviewer would have made differently) cites k8 (stay distinct from the artifact review) when its basis is local c103. Also s2.ac1 and s4.ac1/ac4 lean on k9 for adherence/coverage claims k9 does not cover. Fix: allow operationalizes to reference localConstraint ids and repoint these; otherwise the constraint-to-criterion trace is decorative in those spots.
- Item s1a: Seven of eight userValue paragraphs stand on their own (s1 attributability, s3 "per-Story dialects", s4 "quietly complete", s5 "a third copy of the same logic", s6 four opinions reconciled by hand, s7 gate-not-advice, s8 second set of eyes). s2's is a near-verbatim inversion of the Epic problem's closing clause: Story — "instead of resurfacing later as defects or as silent drift away from the design"; Epic — "until it resurfaces later as defects or as accumulated drift from the design." That is a restatement, not an independent statement of this slice's value. Rewrite s2.userValue around what the adherence check specifically buys (a named approved expectation to point at when code departs from it).

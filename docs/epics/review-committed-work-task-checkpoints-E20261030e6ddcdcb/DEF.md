<!-- insrc:artifact DEF-e6ddcdcb3d9cf330 -->

# Epic: review-committed-work-task-checkpoints

## Summary

**Flavor:** enhancement

Review a story or task against its submitted committed changes, requirements and tests without holding a connection open. Preserve completed task feedback across interruptions and re-reviews, publish the result in the existing code-review record, and clean up temporary history when the story build is approved.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)

## 1. Problem

Code review is difficult to complete reliably when its scope is inferred from repository state, its execution depends on a long-lived request, and interrupted or repeated reviews cannot clearly distinguish completed work from work still outstanding. Developers need useful feedback on the changes they submitted, correlated with the intended behavior and tests, without losing progress or replaying completed work after a disconnection. The prior replacement was rolled back before proving that basic review interaction, leaving an existing review path that does not provide the newly agreed task-oriented execution and recovery behavior.

## 2. Functional requirements


**s1:**

- **E20261030e6ddcdcb:S001:FR001** — Obtain an independent, scoped review that assesses functional correctness and test coverage without keeping a request open.
- **E20261030e6ddcdcb:S001:FR002** — Observe durable progress at completed-task boundaries and an honest terminal result.

**s2:**

- **E20261030e6ddcdcb:S002:FR001** — Recover only interrupted work and retain the original attempt input.
- **E20261030e6ddcdcb:S002:FR002** — Re-review fixes with prior feedback while preserving distinct attempt history.

**s3:**

- **E20261030e6ddcdcb:S003:FR001** — Allow concurrent independent reviews while rejecting duplicate execution of one review-id.
- **E20261030e6ddcdcb:S003:FR002** — Retain permanent code-review results and remove temporary checkpoints on story BUILD approval.

## 3. Non-goals

- **Reintroduce the rolled-back investigation engine, evidence ledgers, native qualification or activation proof machinery.** — The user explicitly requested a fresh, simpler review design after complete rollback.
- **Build a replacement session-threading framework or assume another branch is already merged.** — The user identified session-per-thread work in another branch; this epic integrates with its actual lifecycle contract.
- **Review uncommitted changes, infer scope from generic HEAD differences, or save partial-task checkpoints.** — The user requires a committed review set, submitted scope and completed-task checkpoints.
- **Replace design-artifact review, add a new artifact type, or automatically approve builds.** — This change concerns code review and reuses the existing CR and human BUILD approval flow.

## 4. Assumptions

- `high` Existing review providers and task contracts are reuse candidates; exact API changes are design work, not established compatibility. [[c2]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | stakeholder | Submitter supplies a functional summary, committed Story/LLD/Plan references, a mandatory commit packet with explicit review commits and scoped files/segments, and complete test files/cases/results. Every submitted change belongs to the review set. Submitted changes alone define scope; surrounding reads and test execution are at reviewer discretion. Derive dependencies and attribution from existing documents rather than duplicating input. | [[c1]] |
| `k2` | contract | A review-id identifies one story/task scope across fixes; attempts are sequential. Each attempt pins its committed code/documents and stores header metadata, submitted packet and review-response in one project-local .insrc/tmp/.../<review-id>.json file containing all attempts. | [[c1]] |
| `k3` | contract | Return promptly and review in the background independently of controller connection lifetime. The controller polls the checkpoint. Process tasks serially in dependency order within a review; allow concurrent different review-ids and reject a second active request for the same id. | [[c1]] |
| `k4` | invariant | Checkpoint only completed tasks. Explicit controller retrigger recovers an interrupted attempt without repeating completed tasks. Terminal failed/incomplete tasks are reconsidered only in subsequent attempts, whose scope the reviewer assesses using full history. Review continues to remaining tasks after findings, failures or incomplete results. | [[c1]] |
| `k5` | contract | Per-task S/M/L time limits are 5/10/15 minutes; timeout is incomplete and does not stop remaining tasks. Task and attempt statuses are pending, running, passed, changes_requested, incomplete, failed. HIGH/MED request changes and LOW-only may pass; terminal aggregate precedence is failed, incomplete, changes_requested, passed. | [[c1]] |
| `k6` | invariant | Preserve builder/reviewer independence with identical behavior for daemon and controller reviewer routes. Update existing CR after each completed attempt, retaining findings and required scope/result data. Delete all story-related review checkpoints only upon that story BUILD approval after permanent CR preservation. | [[c1]] |
| `k7` | stakeholder | Reuse existing provider/task/artifact infrastructure and integrate the separately developed session-thread lifecycle. Do not reintroduce the retired engine as a prerequisite. Prove one useful installed end-to-end review before expanding recovery and integration work. | [[c3]] |
| `k8` | convention | Cloud model calls continue through installed CLI providers; preserve existing daemon-owned storage and IPC boundaries. | [[c4]] |

## 6. Stories

### 6.1 STORY-e6ddcdcb3d9cf330-s1 — Get a useful background review of submitted committed work

**User value:** `size: L`

Submit a story or task, receive independent feedback correlated with requirements and tests, and observe progress without waiting on a long request.

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given A submitter has a story/task summary, committed requirements/design/plan references, complete test details and an explicit commit packet, when the review is submitted, then only specified changes belonging to those review commits are admitted; missing or inconsistent scope fails explicitly without a HEAD-based fallback or redundant dependency input.. _(operationalizes `k1`, `k2`)_
- **ac2:** Given An admitted review identifies its scope and pinned input, when execution begins, then submission promptly returns its review-id, attempt, checkpoint path and status; work runs independently of the submitting connection, and a controller can poll the JSON file.. _(operationalizes `k2`, `k3`)_
- **ac3:** Given A story review contains multiple Plan tasks or a per-task review selects one, when the reviewer proceeds, then tasks are derived and reviewed serially in dependency order; the reviewer correlates changes with pinned requirements/design, assesses submitted test coverage, and may inspect surrounding context or execute tests.. _(operationalizes `k1`, `k3`)_
- **ac4:** Given A task is being reviewed, when it completes or reaches its S/M/L limit, then a completed-task result is saved atomically under the attempt's header/submitted/review-response sections; S/M/L limits are 5/10/15 minutes, timeout records incomplete and review continues, and no partial-task checkpoint is treated as completed work.. _(operationalizes `k2`, `k4`, `k5`)_
- **ac5:** Given Review tasks produce findings or execution outcomes, when the attempt finishes, then task/attempt results use the agreed enum, HIGH/MED require changes, LOW-only can pass, aggregate precedence is failed then incomplete then changes_requested then passed, and the existing CR captures required results and findings.. _(operationalizes `k5`, `k6`)_
- **ac6:** Given Either the controller or daemon built the reviewed code, when the other party performs a real end-to-end review, then both reviewer routes use the same scope, task order, statuses, checkpoints and CR behavior; one actual useful evidence-backed review is demonstrated before downstream expansion, without bringing back qualification machinery.. _(operationalizes `k6`, `k7`, `k8`)_

### 6.2 STORY-e6ddcdcb3d9cf330-s2 — Recover interruptions and re-review fixes using the same review history

**User value:** `size: M`

Keep completed review work after interruption and use earlier feedback to focus subsequent reviews of fixes.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given An attempt is interrupted after one or more task checkpoints, when the controller explicitly retriggers that review-id and attempt, then review uses the original pinned code/documents and saved packet, preserves completed task results, and restarts only unfinished work without automatically resuming after daemon startup.. _(operationalizes `k2`, `k4`)_
- **ac2:** Given A completed attempt includes feedback, failed or incomplete tasks, when a sequential new attempt is submitted for the same story/task scope, then the review-id stays stable, the new attempt pins its own submitted commits/documents, prior attempt sections remain available, and the reviewer assesses re-review scope using the entire history.. _(operationalizes `k1`, `k2`, `k4`)_
- **ac3:** Given A task already ended as failed or incomplete in an attempt, when same-attempt recovery or subsequent-task execution occurs, then that terminal task is not retried within the same attempt; only a later attempt can reconsider it and remaining tasks continue.. _(operationalizes `k4`, `k5`)_
- **ac4:** Given An attempt is retriggered or re-review finishes, when the controller reads progress and the CR, then the returned metadata and checkpoint identify the correct attempt and preserved/completed work, and each completed attempt refreshes the existing CR without presenting old feedback as a new review.. _(operationalizes `k2`, `k6`)_

### 6.3 STORY-e6ddcdcb3d9cf330-s3 — Run independent reviews concurrently and clean up after story approval

**User value:** `size: M`

Multiple sessions can review independent work safely, and temporary review history is removed only after permanent results are retained and the story build is approved.

**Depends on:** `s1`, `s2`

**Acceptance criteria:**

- **ac1:** Given One review-id is active, when another request targets the same review-id, then the second request receives an explicit already-running error and cannot create duplicate task execution or checkpoint writers.. _(operationalizes `k3`)_
- **ac2:** Given Different sessions submit different review-ids, when reviews execute concurrently and a submitting session disconnects, then independent reviews can continue without shared checkpoint corruption or a global review queue; execution integrates with the actual session-thread lifecycle rather than reimplementing it, and disconnect does not stop admitted work.. _(operationalizes `k3`, `k7`)_
- **ac3:** Given A story has task-review and story-review checkpoint files and preserved CR results, when the story BUILD approval succeeds, then all checkpoints belonging to that story are deleted only after required permanent CR data is retained; earlier task validation/approval, review completion, or rejected BUILD approval does not trigger cleanup.. _(operationalizes `k6`)_
- **ac4:** Given The new review flow is ready to replace normal code-review execution, when entrypoints and BUILD lifecycle are exercised, then both reviewer parties behave identically through normal requests and CR/approval integration, design-artifact review remains unaffected, and tests prove committed scope, interruption/re-review, duplicate rejection and disconnect behavior without reviving the retired engine.. _(operationalizes `k1`, `k2`, `k3`, `k4`, `k5`, `k6`, `k7`, `k8`)_

## 7. References

- **[[c1]]** `stakeholder` `Current conversation: sequential code-review design clarifications accepted by the user through 2026-10-31` — "make it mandatory to create a commit packet before calling code review."
- **[[c2]]** `analyze-bundle` `Scope discovery: existing code-review runner, task contracts, request handler and review-session providers` — "Existing task lookup and provider review sessions are available; some lifecycle symbols require later source inspection."
- **[[c3]]** `doc` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/ROLLBACK.md` — "prior approvals do not authorize restarting the abandoned implementation."
- **[[c4]]** `convention` `AGENTS.md` — "No direct cloud REST calls from our process."

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — define (define)

**0 HIGH · 3 MED · 11 LOW** · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-30T18:43:16.510Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl3 | inventory | MED | manual | The epic defines exactly three stories: s1 (size L), s2 (size M), s3 (size M), numbered 6.1-6.3. | grep for /^### 6\\.\\d+ STORY-/ in DEF.md returns exactly 3 matches, confirming the count, numbering and IDs: line 69 '### 6.1 STORY-e6ddcdcb3d9cf330-s1 — Get a useful background review of submitted committed work', line 86 '### 6.2 STORY-e6ddcdcb3d9cf330-s2 — Recover interruptions and re-review fixes using the same review history', line 101 '### 6.3 STORY-e6ddcdcb3d9cf330-s3 — Run independent reviews concurrently and clean up after story approval'. This confirms the story count (3), the numbering (6.1-6.3) and the s1/s2/s3 ids/anchors. However, the gathered evidence contains no size-field data (no 'Size:' or similar line was captured for any of the three stories), so the specific size claims in the premise (s1=L, s2=M, s3=M) are not addressed by the evidence at all and cannot be confirmed or refuted. | Re-run the grep/read against each story's size field (e.g. a 'Size:' or 'Estimate:' line under each ### 6.x heading) to confirm s1=L, s2=M, s3=M before relying on the size breakdown; if confirmed no edit is needed, if not, correct the sizes in the premise/artifact text. |
| cl8 | external-contract | MED | assisted | [[c2]] asserts that an existing code-review runner, task contracts, request handler and review-session providers are present in the codebase as reuse candidates for this epic. | Of the four reuse candidates [[c2]] claims exist, only 'review-session providers' is solidly grounded: CliProvider.runReviewSession and an optional LLMProvider.runReviewSession implemented by OllamaProvider are cited throughout docs/epics/.../S001/LLD.md (lines 237, 279-291, 533) and corroborated by src/agent/providers/cli-provider.ts:90 (ReviewSessionTimeoutError). 'Code-review runner' has partial support -- LLD.md:714 references existing entry points runCodeReview/runReview/runTemplateReview as pre-build code -- but the class-shaped grep for class Review(Runner\|Session) found only an error class, not a runner class. 'Task contracts' returned 0 matches for the literal string TaskContract, and 'request handler' returned only 2 irrelevant hits (a review markdown doc and an unrelated JetBrains FUS event-schema field hasPreRequestHandler) -- neither addresses a code-review request handler. These two zero/irrelevant results are narrow, literal-CamelCase searches that may not match this codebase's actual naming (e.g. a generic Task type in src/workflow/, or an IPC/daemon handler under a different name), not proof the constructs are absent. | Re-run grounding with the actual symbol names intended for 'task contracts' and 'request handler' (search src/workflow/ for Task-shaped types, and src/daemon/ for IPC/request-handling constructs), and have the author cite concrete file:line evidence for those two reuse candidates in [[c2]], or narrow the premise to only the two candidates (code-review runner, review-session providers) the evidence actually supports. |
| cl12 | semantic | MED | assisted | The Problem statement's claim that 'the prior replacement was rolled back before proving that basic review interaction' is grounded in and consistent with the content of the ROLLBACK.md document cited as [[c3]]. | ROLLBACK.md:3 confirms a rollback was authorized 'before any redesign', and ROLLBACK.md:9 confirms 'S7 Task 2 did not pass, and subsequent S7 Tasks were not started' — consistent with a rollback occurring before anything was proven to work. However, the grep for the literal phrases 'basic review interaction' / 'not proven' / 'rolled back' matched only the document's title line ('# Review engine implementation rolled back'); the document never states that S7 Task 2 (or any task) was specifically testing 'basic review interaction'. The timing/narrative (rollback before proof of success) is grounded, but the specific characterization of WHAT failed to be proven ('basic review interaction') is not substantiated by the cited text — it is a plausible paraphrase of 'S7 Task 2 did not pass', not a confirmed equivalence. | Either cite the artifact/task definition that establishes S7 Task 2's scope as 'basic review interaction' (so the paraphrase is traceable), or soften the Problem statement to track the document's own wording ('S7 Task 2 did not pass') instead of the unsupported gloss 'basic review interaction'. |
| cl1 | citation | LOW | manual | [[c3]] cites docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/ROLLBACK.md as containing the quoted text 'prior approvals do not authorize restarting the abandoned implementation.' | grep for the exact phrase 'prior approvals do not authorize restarting the abandoned implementation' returns 1 match in docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/ROLLBACK.md:9, which reads in full: '...This rollback supersedes implementation/activation instructions in the retained epic and prerequisite documents; prior approvals do not authorize restarting the abandoned implementation.' This confirms the cited file does contain the quoted text verbatim. The read evidence error (out-of-range 1-40) is a tooling limitation, not proof against the citation — the grep match already confirms the premise. | none — verified sound |
| cl2 | citation | LOW | manual | [[c4]] cites AGENTS.md as the source of the convention 'No direct cloud REST calls from our process.' | grep for the exact convention text returns exactly one match: AGENTS.md:12 — "**No direct cloud REST calls from our process.** Cloud LLM access happens through the locally-installed `claude` and `codex` CLI binaries (via `CliProvider`). Auth + quota stay with the user's CLI OAuth sessions. Direct REST providers to Anthropic / OpenAI / Gemini / Mistral must not be reintroduced." This confirms AGENTS.md is indeed the source location of the cited convention, matching the premise exactly. | none — verified sound |
| cl4 | inventory | LOW | manual | The Constraints table (section 5) lists exactly eight constraints, k1 through k8. | grep of `^\\\| `k\\d` \\\|` against docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/DEF.md returns exactly 8 rows (lines 58-65), one each for k1 through k8 — matching the anchors listed (k1, k2, k3, k4, k5, k6, k7, k8) with no gaps or duplicates. | none — verified sound |
| cl5 | inventory | LOW | manual | The References section (section 7) lists exactly four references, c1 through c4, and every [[cN]] token used in the body (k1-k8, ac's, non-goals, assumptions) resolves to one of these four. | The bold-anchor grep (\\*\\*\\[\\[c\\d\\]\\]\\*\\*) finds exactly 4 matches, at DEF.md:118-121, defining c1, c2, c3, c4 in the References section. The broader grep (\\[\\[c\\d\\]\\]) finds 14 total matches, and every body usage outside the References block — line 52 ([[c2]]), line 58 k1 ([[c1]]), line 59 k2 ([[c1]]), line 60 k3 ([[c1]]), line 61 k4 ([[c1]]), line 62 k5 ([[c1]]), line 63 k6 ([[c1]]), line 64 k7 ([[c3]]), line 65 k8 ([[c4]]), and line 75 Extends ([[c2]]) — references only c1, c2, c3, or c4. No c5+ or other undefined token appears anywhere in the matches. | none — verified sound |
| cl6 | closed-union | LOW | manual | Task and attempt statuses form a closed set of exactly six values: pending, running, passed, changes_requested, incomplete, failed (k5), and every other status mention in the document (e.g. s2 ac1/ac3's 'failed or incomplete', ac5's 'failed then incomplete then changes_requested then passed') uses only members of this set. | DEF.md:62 (k5) states verbatim: 'Task and attempt statuses are pending, running, passed, changes_requested, incomplete, failed' — exactly the six values the premise names. ac5 (line 83) uses 'failed then incomplete then changes_requested then passed' — all four terms are members of the k5 set. ac2 (line 97) and ac3 (line 98) both use 'failed or incomplete' — both members of the set. No evidence of any status term outside the six-value set appearing anywhere in the document. | none — verified sound |
| cl7 | ordering | LOW | manual | The terminal aggregate precedence order — failed, then incomplete, then changes_requested, then passed — is stated identically in k5 and restated consistently in s1/ac5 without contradiction elsewhere in the document. | DEF.md:62 (k5) states: 'terminal aggregate precedence is failed, incomplete, changes_requested, passed.' DEF.md:83 (ac5) states: 'aggregate precedence is failed then incomplete then changes_requested then passed.' Both enumerate the identical four-element order (failed, incomplete, changes_requested, passed) with no divergence in membership or sequence, and no other grep match surfaces a conflicting ordering elsewhere in the document. | none — verified sound |
| cl9 | ordering | LOW | manual | Story dependencies are strictly ordered: s2 depends on s1, and s3 depends on both s1 and s2, with no cyclic or forward dependency (e.g. s1 does not depend on s2 or s3). | DEF.md:92 shows "**Depends on:** `s1`" (for s2) and DEF.md:107 shows "**Depends on:** `s1`, `s2`" (for s3). This exactly matches the premise: s2 depends on s1 alone, and s3 depends on both s1 and s2. No entry for s1 lists a dependency on s2 or s3, consistent with the no-cyclic/no-forward-dependency claim. | none — verified sound |
| cl10 | semantic | LOW | manual | The functional-requirement ids use the pattern E20261030e6ddcdcb:S00N:FR00M where S001, S002, S003 correspond respectively to stories s1, s2, s3, and the hash suffix e6ddcdcb3d9cf330 matches the epic hash used in the Story ids (STORY-e6ddcdcb3d9cf330-sN) and the artifact id (DEF-e6ddcdcb3d9cf330). | docs/epics/.../DEF.md:30-41 show FR ids E20261030e6ddcdcb:S001:FR001/FR002, S002:FR001/FR002, S003:FR001/FR002 - S001/S002/S003 map to stories s1/s2/s3 per headings at lines 69, 86, 101 (STORY-e6ddcdcb3d9cf330-s1/s2/s3). Line 1 confirms the artifact id DEF-e6ddcdcb3d9cf330 uses the same hash suffix e6ddcdcb3d9cf330 as the Story ids. All three parts of the premise are corroborated by the gathered matches. | none - verified sound |
| cl11 | cross-artifact | LOW | manual | The non-goal 'Build a replacement session-threading framework or assume another branch is already merged' presupposes an actual, separately developed session-thread lifecycle contract (referenced again in k7 and s1/ac6 and s3/ac2) that this epic must integrate with rather than reimplement. | DEF.md:46 states the non-goal verbatim: 'Build a replacement session-threading framework or assume another branch is already merged... this epic integrates with its actual lifecycle contract.' DEF.md:64 (k7) consistently requires the epic to 'integrate the separately developed session-thread lifecycle' and explicitly forbids reintroducing a retired engine as a prerequisite. DEF.md:112 (an ac2) reiterates that 'execution integrates with the actual session-thread lifecycle rather than reimplementing it.' grep for 'SessionThread' (likely a concrete type/class name) returns 0 matches, but this is expected and not contradictory: the artifact itself states the session-per-thread work lives in another, as-yet-unmerged branch, so its absence from this source tree is consistent with the premise rather than evidence against it. The s1/ac6 and s3/ac2 anchors were not individually shown (grep results were capped/truncated), which is a coverage limitation, not proof those anchors diverge from the k7/ac2 pattern already confirmed. | none — verified sound. If the truncated grep leaves doubt about s1/ac6 specifically, a reviewer could re-run an uncapped search for 'session-thread' scoped to the s1 and s3 LLD/story files to confirm identical phrasing, but nothing in the gathered evidence contradicts the premise. |
| cl13 | inventory | LOW | manual | Each story's acceptance criteria cite constraint ids (kN) via '_(operationalizes ...)_', and every kN referenced this way (k1-k8) exists in the section-5 constraints table — no acceptance criterion operationalizes a non-existent constraint id. | The 14 acceptance-criteria matches (DEF.md:79-84, 96-99, 111-114) cite exactly the anchors listed (s1/ac1-ac6, s2/ac1-ac4, s3/ac1-ac4). Collecting every `kN` cited across them yields k1,k2,k3,k4,k5,k6,k7,k8 — no id outside that range appears (e.g. s1/ac6 cites k6,k7,k8; s3/ac4 cites k1-k8). The section-5 constraints table (DEF.md:58-65) has exactly 8 rows, `k1` through `k8`, matching the grep count. Every kN referenced by an acceptance criterion resolves to a real row in the table; none is dangling. | none — verified sound |
| cl14 | closed-union | LOW | manual | The Non-goals section (section 3) enumerates exactly four excluded scopes, each tied to a stated user rationale, and none of the six Stories' acceptance criteria reintroduce those excluded scopes (e.g. no AC performs partial-task checkpointing or HEAD-based scope inference). | The bullet-pattern grep over DEF.md returns 10 matches total: lines 30-41 are the six Stories' FRs, and lines 45-48 are exactly four Non-goals bullets, each ending in an em-dash rationale clause (45: rolled-back investigation engine — 'user explicitly requested a fresh, simpler review design'; 46: replacement session-threading framework — 'user identified session-per-thread work in another branch'; 47: uncommitted/HEAD-based/partial-task checkpoints — 'user requires a committed review set, submitted scope and completed-task checkpoints'; 48: replacing design-artifact review / auto-approving builds — 'reuses existing CR and human BUILD approval flow'). This confirms 'exactly four excluded scopes, each tied to a stated user rationale.' The targeted greps for the two excluded-scope keywords named in the premise's own example ('HEAD-based' and 'partial-task checkpoint') were run over the whole DEF.md file (not line-scoped) and each returns only two hits: the Non-goals bullet itself (line 47) plus exactly one AC (ac1 line 79 for HEAD-based, ac4 line 82 for partial-task checkpoint) — and in both cases the AC explicitly REJECTS the excluded behavior ('fails explicitly without a HEAD-based fallback'; 'no partial-task checkpoint is treated as completed work') rather than reintroducing it. No additional, unexpected matches turned up elsewhere in the document, which is the evidence that would have surfaced a violation in any of the other Stories' ACs. | none — verified sound |

#### Proposed fixes

- **cl3** (manual) — The count/numbering/IDs are verified sound, but the size labels are an unverified sub-claim requiring an additional targeted probe (grep for the size field per story) rather than a mechanical text fix, since there is no evidence yet to derive a replacement value from.
  - option: Re-run probes capturing each story's size field and confirm/correct s1/s2/s3 sizes
  - option: Treat the size claim as advisory since the core inventory (3 stories, 6.1-6.3, correct ids) is verified
  - option: Have the artifact author re-cite the size fields with file:line so they are machine-checkable

- **cl8** (assisted) — The gap is an evidentiary/terminology mismatch, not a confirmed absence -- a human should either supply correct symbol names so the premise can be re-verified, or accept a narrowed premise.
  - option: Narrow [[c2]] to only 'code-review runner' and 'review-session providers', dropping the unverified 'task contracts' / 'request handler' claims
  - option: Re-ground [[c2]] with corrected search terms (e.g. Task type under src/workflow/, handler registration under src/daemon/) and cite the resulting file:line hits
  - option: Leave [[c2]] as-is but mark 'task contracts' and 'request handler' as could-not-verify pending author clarification

- **cl12** (assisted) — The equivalence between 'S7 Task 2' and 'basic review interaction' isn't verifiable from the evidence given; a human should pick whether to add a grounding citation for that equivalence or reword the Problem statement to the document's literal terms.
  - option: Add a citation to the S7 Task 2 definition (e.g. its LLD/BUILD task description) establishing it tested basic review interaction, then keep the phrase as-is.
  - option: Reword the Problem statement to say 'before S7 Task 2 passed' (ROLLBACK.md's own wording) instead of the paraphrase 'basic review interaction'.
  - option: Leave as-is and accept the paraphrase as reasonable narrative shorthand (no further action).

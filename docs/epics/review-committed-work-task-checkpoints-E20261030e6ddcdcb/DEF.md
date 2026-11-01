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

### 6.4 STORY-e6ddcdcb3d9cf330-s4 — Show incremental progress during background code reviews

**User value:**

Users can see which task is being reviewed and the last observed activity throughout a long review, without additional model calls. Reuses normalized activity from the approved permissive-timeout implementation; timeout policy remains separate. User authorized S4 design on 2026-11-01.

**Acceptance criteria:**

- **ac1:** Given A background review is running, when The controller polls its progress, then It shows phase, task ID/name and position, completed/total tasks, review/task elapsed time and timestamp of last observed activity. Phases cover scope preparation, task review, test execution, feedback persistence and CR publication; unavailable activity is explicitly unknown..
- **ac2:** Given A task runs for several minutes, when Native CLI events report source reads, tool/test starts or completions, model output or feedback submission, then Bounded sanitized progress metadata updates during the task without extra model calls, reasoning text, raw prompts or raw tool output; routine updates are throttled and do not rewrite immutable submitted packets or completed results..
- **ac3:** Given A subprocess is alive but no meaningful activity is observable, when A heartbeat is received or elapsed time advances, then The display distinguishes process liveness from last meaningful activity and never invents progress percentages, findings or completion. This story does not change timeout/retry policy..
- **ac4:** Given Claude or Codex performs the review, when Progress is polled after reconnect or for concurrent independent review IDs, then Both providers expose the same normalized behavior; progress is isolated by review ID/attempt/task, stale data is labelled, and reconnect recovers the latest snapshot without restarting review..
- **ac5:** Given A user waits for review, when A phase changes or 30–60 seconds pass, then The controller surfaces a concise update using existing polling, while terminal completion and errors remain visible and authoritative. No additional LLM summary requests are made..

## 7. References

- **[[c1]]** `stakeholder` `Current conversation: sequential code-review design clarifications accepted by the user through 2026-10-31` — "make it mandatory to create a commit packet before calling code review."
- **[[c2]]** `analyze-bundle` `Scope discovery: existing code-review runner, task contracts, request handler and review-session providers` — "Existing task lookup and provider review sessions are available; some lifecycle symbols require later source inspection."
- **[[c3]]** `doc` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/ROLLBACK.md` — "prior approvals do not authorize restarting the abandoned implementation."
- **[[c4]]** `convention` `AGENTS.md` — "No direct cloud REST calls from our process."

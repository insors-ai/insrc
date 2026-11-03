<!-- insrc:artifact DEF-9b04adb36cac716d -->

# Epic: review-evolving-designs-durable-checkpoints

## Summary

**Flavor:** new-capability
**Seeded from:** `SPEC-16f49beb846e02b4`

Provide independent reviews of current design artifacts that remain understandable and recoverable even for large scopes. Users can see completed feedback while work continues, govern restarts and failures, and receive impact-aware feedback on corrections without losing review history.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)

## 1. Problem

Authors cannot obtain dependable independent feedback on their DEF, HLD and LLD designs through the current workflow because design-review execution has been removed. Large designs make progress and completeness difficult to assess, interruptions can waste completed analysis, and corrected designs need scrutiny that accounts for indirect consequences rather than only edited text. Without trustworthy review history tied to the artifact actually examined, users cannot distinguish unfinished feedback from a complete review or make informed approval decisions. [[c1]] [[c2]]

## 2. Functional requirements


**s1:**

- **E202611039b04adb3:S001:FR001** — Review the latest design through document paths using independent read-only reviewers.
- **E202611039b04adb3:S001:FR002** — Plan coherent artifact-specific chunks, expose completed feedback and publish a complete consolidated review.

**s2:**

- **E202611039b04adb3:S002:FR001** — Resume interrupted review of an unchanged artifact from completed chunk checkpoints.
- **E202611039b04adb3:S002:FR002** — Retry technical chunk failures within a fixed limit, then wait for user direction.
- **E202611039b04adb3:S002:FR003** — Stop changed-artifact reviews and require user approval before a fresh full restart.

**s3:**

- **E202611039b04adb3:S003:FR001** — Determine affected review chunks from corrections, prior feedback and indirect design relationships.
- **E202611039b04adb3:S003:FR002** — Expand uncertain impact to a complete review and preserve attempt-specific provenance.

**s4:**

- **E202611039b04adb3:S004:FR001** — Use consolidated independent design review in normal artifact approval gates.
- **E202611039b04adb3:S004:FR002** — Retain permanent attempt history before approval-triggered checkpoint cleanup.
- **E202611039b04adb3:S004:FR003** — Use the same design-review behavior across normal daemon and controller sessions.

## 3. Non-goals

- **Restore the removed review engines or introduce compatibility execution paths and fallback flags.** — User explicitly requires a blank-slate replacement.
- **Change working task-based code-review semantics or require shared-engine extraction first.** — Code review is operational; infrastructure reuse is a later design decision.
- **Embed artifact content in prompts or require committed artifact versions.** — Reviewers read current documents through paths and may inspect the codebase.
- **Automatically restart changed artifacts, react to external file changes, or make intermediate corrective edits.** — User governs restarts and waits for complete feedback; external changes must not create loops.
- **Always perform full re-reviews after corrections, or use changed text alone to select work.** — Direct and indirect impact must govern scope; uncertainty expands to full review.
- **Implement token accounting, new client dashboards, trust keys or activation-proof machinery.** — Separate work; reuse ordinary model/transport and approval facilities without additional qualification systems.

## 4. Assumptions

- `high` Historical design-review records and approval metadata remain readable while new execution is introduced. [[c2]]
- `high` Existing task-review activity, provider and IPC patterns can inform implementation, but their committed-task semantics do not determine design-review behavior. [[c3]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | stakeholder | Prompt contains review guidelines and document paths, not copied artifact content. Reviewer is read-only and may inspect anything in the codebase. | [[c1]] |
| `k2` | invariant | Review latest artifact without commit pinning. Any artifact change mid-review invalidates/stops that attempt; controller notifies user and obtains explicit approval before a fresh full review. No chunk reuse from invalidated attempts. Changes outside reviewed artifact do not invalidate it. | [[c1]] |
| `k3` | contract | Reviewer plans coherent chunks using explicit DEF/HLD/LLD guidelines. DEF groups capability requirements/stories/constraints/acceptance; HLD groups subsystems/contracts/ownership/dependencies/interactions; LLD groups implementation responsibilities/interfaces/logic/errors/test coverage. Include artifact-wide cross-chunk consistency and upstream alignment checks. | [[c1]] |
| `k4` | contract | Run review in background with prompt acknowledgement, progress polling and durable completed-chunk results. Polling does not require a live initial request and must not initiate model work. | [[c1]] |
| `k5` | stakeholder | Expose completed chunk findings immediately, but controller performs no intermediate corrective action before full review completion. HIGH/MED findings do not stop remaining chunks. | [[c1]] |
| `k6` | contract | Technical failures allow an initial execution plus at most three automatic retries of only the failed chunk; keep completed chunks. After retry exhaustion pause and wait for user direction rather than continuing remaining chunks. | [[c1]] |
| `k7` | invariant | No fixed review deadline. Use a 30-minute inactivity grace and track long-running active tools separately, consistently across reviewer parties. | [[c1]] |
| `k8` | contract | Subsequent corrected attempts use complete prior feedback and proper analysis of direct and non-obvious indirect impact to select affected chunks. Uncertain impact expands to a full-artifact review, including necessary cross-chunk checks. | [[c1]] |
| `k9` | invariant | Daemon reviews controller-authored artifacts and controller reviews daemon-authored artifacts under identical substantive guidelines. HIGH/MED block approval; LOW-only may pass. Unfinished, paused or invalidated work cannot be represented as a complete passing review. | [[c1]] |
| `k10` | invariant | Retain checkpoints until reviewed artifact approval; permanently preserve consolidated results and all attempt history before cleanup. Existing historical artifacts remain intact. | [[c1]] |
| `k11` | convention | Preserve current code review operation and central provider/IPC conventions. No direct cloud REST or restored retired review execution. | [[c4]] |

## 6. Stories

### 6.1 STORY-9b04adb36cac716d-s1 — Obtain a complete background review of a current design

**User value:** `size: L`

Receive useful independent feedback on large DEF, HLD and LLD artifacts while seeing durable progress without keeping a request open.

**Acceptance criteria:**

- **ac1:** Given A current DEF, HLD or LLD authored by a known party, when Its review is requested, then The opposite party reviews it under identical guidelines; prompt supplies guidelines and paths without embedding artifact contents, and the reviewer may consult any codebase content.. _(operationalizes `k1`, `k4`, `k9`, `k11`)_
- **ac2:** Given A design spans multiple concerns, when The reviewer prepares its chunk plan, then DEF capability groups retain requirements, stories, constraints and acceptance; HLD subsystem groups retain contracts, ownership and interactions; LLD implementation groups retain interfaces, logic, errors and test coverage, and every artifact gets cross-chunk/upstream consistency checks.. _(operationalizes `k3`)_
- **ac3:** Given A background review is running, when The initial request returns and a later poll observes completed chunks, then Acknowledgement is short, completed findings survive request disconnection and are immediately visible; polling starts no model work and controller makes no intermediate corrections.. _(operationalizes `k4`, `k5`)_
- **ac4:** Given A completed chunk has HIGH or MED findings, when The remaining coherent chunks and final consistency check run, then Findings do not stop review; consolidated output distinguishes inspected coverage, findings and limitations and does not claim unavailable evidence was verified.. _(operationalizes `k3`, `k5`, `k9`)_
- **ac5:** Given Initial useful review implementation is ready, when A real independent review is exercised through the supported entry point, then A meaningful artifact is chunked, examined and published without restored legacy execution, and working code review remains operational.. _(operationalizes `k1`, `k4`, `k9`, `k11`)_

### 6.2 STORY-9b04adb36cac716d-s2 — Recover interrupted reviews and govern failures and artifact changes

**User value:** `size: L`

Avoid losing completed review work while retaining control over repeated work and changed designs.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given Completed chunks exist and review execution was interrupted without an artifact change, when The controller explicitly requests recovery, then Completed chunks remain untouched and only unfinished work resumes; result publication and retrieval remain reliable after request or daemon interruption.. _(operationalizes `k4`, `k6`, `k10`)_
- **ac2:** Given A chunk encounters a technical failure, when Automatic recovery is attempted, then Only that failed chunk gets at most three retries after its initial execution; completed chunks are retained, and exhausted retries pause remaining work until user direction is obtained.. _(operationalizes `k6`, `k9`)_
- **ac3:** Given A review is active or awaiting recovery, when The reviewed artifact changes, including during a long-running chunk or before publication, then The attempt stops and cannot publish a valid completed review of the changed artifact; controller notifies the user and waits for explicit approval before a full restart without chunk reuse.. _(operationalizes `k2`, `k9`)_
- **ac4:** Given Referenced documents or source files change while the reviewed artifact does not, when Activity and recovery checks run, then Those external changes do not invalidate or restart the review.. _(operationalizes `k2`)_
- **ac5:** Given A review takes longer than earlier fixed allowances, when Meaningful activity continues or a long-running tool remains active, then No fixed deadline terminates it; the 30-minute inactivity policy distinguishes actual activity and active tools from polling or mere process presence.. _(operationalizes `k7`)_
- **ac6:** Given Technical retries are exhausted, when The user has not yet provided direction, then Progress clearly reports paused state and the failed chunk; no fresh retry, remaining-chunk execution or restart occurs automatically.. _(operationalizes `k6`, `k9`)_

### 6.3 STORY-9b04adb36cac716d-s3 — Review corrections according to their direct and indirect impact

**User value:** `size: L`

Obtain rigorous feedback on corrected designs without repeating unrelated completed analysis.

**Depends on:** `s2`

**Acceptance criteria:**

- **ac1:** Given A previous review completed and the author corrected the artifact afterward, when A subsequent attempt begins, then Reviewer compares the current artifact with the prior reviewed state, consults previous feedback and analyzes direct and implicit impact before selecting chunks; edited-text matches alone do not establish scope.. _(operationalizes `k8`, `k10`)_
- **ac2:** Given A correction changes a shared constraint or interface without editing dependent sections, when Impact is assessed, then Affected downstream chunks and necessary cross-chunk/upstream consistency checks are included, with an understandable scope explanation.. _(operationalizes `k3`, `k8`)_
- **ac3:** Given Changes or missing prior context prevent confident impact boundaries, when Scope selection finishes, then The reviewer expands to a full-artifact review and reports why rather than claiming an unproven selective review is complete.. _(operationalizes `k8`, `k9`)_
- **ac4:** Given Impact is confidently bounded and unaffected prior work is retained, when The new attempt completes, then Current findings and explicitly retained prior coverage form a traceable consolidated result; no unresolved earlier HIGH/MED disappears merely because its chunk was not selected.. _(operationalizes `k8`, `k9`, `k10`)_
- **ac5:** Given The artifact changes during impact analysis or selective execution, when Mutation is detected, then The same stop, notify and user-approved fresh-full-restart rule applies, rather than treating the mutation as an ordinary correction within the running attempt.. _(operationalizes `k2`, `k8`)_

### 6.4 STORY-9b04adb36cac716d-s4 — Approve reviewed designs with permanent history and safe checkpoint cleanup

**User value:** `size: L`

Make trustworthy approval decisions from complete review history and remove temporary state only when safe.

**Depends on:** `s3`

**Acceptance criteria:**

- **ac1:** Given A DEF, HLD or LLD has consolidated findings or unfinished review work, when Approval is requested through normal workflow paths, then HIGH/MED block normal approval, LOW-only may pass, and paused/incomplete/invalidated or same-party work cannot masquerade as complete independent review; existing explicit user-authorized override discipline remains visible.. _(operationalizes `k9`)_
- **ac2:** Given A reviewed artifact receives explicit approval, when Temporary review state is cleaned up, then Permanent consolidated results and complete attempt history are preserved first; checkpoints for that artifact are removed only after approval, and other artifacts or active reviews remain intact.. _(operationalizes `k10`)_
- **ac3:** Given Multiple sessions request or observe design reviews, when Normal MCP and daemon review paths are used, then Independent artifacts can progress without duplicate execution of one review; both reviewer parties receive the same substantive guidelines, progress and retry rules through the supported interface.. _(operationalizes `k4`, `k6`, `k9`, `k11`)_
- **ac4:** Given The implementation reaches end-to-end verification, when DEF, HLD and LLD scenarios exercise normal review and approval paths, then Latest-artifact reads, coherent chunks, disconnection/recovery, technical retry pause, mutation invalidation, selective impact review, publication and cleanup are demonstrated with recorded evidence; hosted calls are distinguished from deterministic fixtures.. _(operationalizes `k1`, `k2`, `k3`, `k4`, `k6`, `k7`, `k8`, `k9`, `k10`)_
- **ac5:** Given The new design-review path is deployed, when A useful live independent design review completes through the normal interface, then Its real results and progress are retrievable, existing code-review smoke remains healthy, and no legacy engine, fallback flag or separate activation-proof system is needed.. _(operationalizes `k4`, `k9`, `k11`)_

## 7. References

- **[[c1]]** `prior-artifact` `docs/standalone/review-evolving-designs-durable-checkpoints-E2026110316f49beb/SPEC.md`
- **[[c2]]** `code` `src/workflow/review/review.ts`
- **[[c3]]** `code` `src/workflow/code-review/task-review/coordinator.ts`
- **[[c4]]** `convention` `AGENTS.md`

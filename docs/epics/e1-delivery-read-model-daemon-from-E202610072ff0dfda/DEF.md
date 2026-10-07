<!-- insrc:artifact DEF-2ff0dfdadb1c8d1c -->

# Epic: e1-delivery-read-model-daemon-from

## Summary

**Flavor:** new-capability

This epic gives insrc one authoritative, read-only view of delivery work: every epic, story, task and issue, each with the stage it has reached and the evidence behind it. Approval, review, task validation and conflicts between them stay visible as separate facts instead of being hidden behind a single status. Every IDE board reads the same view from the daemon, so all clients agree on what is ready, what needs attention and why.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)
8. [Open questions](#8-open-questions)

## 1. Problem

The workflow records every unit of delivery work across many separate artifacts: an epic's framing names its stories, a plan names a story's tasks, build records carry task results and completion approval, code reviews carry verdicts, and issues carry defects and the work that fixes them. Nothing assembles these into a single, trustworthy picture of the work itself. The only existing assembly covers an epic's framing, high-level design and per-story designs, and it is reachable only from the terminal tool; plans, build records, code reviews and issues are never joined to the story they belong to, and the list of artifacts awaiting approval cannot speak to completion at all. As a result, anyone asking what is ready to build, what needs a decision, or why an item looks finished must open and cross-read the records by hand. That reading is error-prone in ways the records themselves make likely: stories reach build by different routes, some of which legitimately skip planning; a story's identifier can be written in more than one form; code is sometimes reviewed before any build record exists; and a build can carry a completion approval while some of its tasks are recorded as failed. Each IDE client that wanted to show delivery status would today have to repeat this interpretation on its own, so two clients could disagree about the same work, and none of them is allowed to read the stores directly.

## 2. Functional requirements

- **E202610072ff0dfda:FR001** — Every epic, story, task and issue appears exactly once, under one stable identity, however many artifacts record it and whichever form its identifier is written in. _(Duplicate or split cards would make counts and stages untrustworthy.)_
- **E202610072ff0dfda:FR002** — Each work item's delivery stage is derived from its recorded artifacts and the route it was triaged onto, and comes with a stated reason. _(Routes legitimately differ; a stage without its reason cannot be checked.)_
- **E202610072ff0dfda:FR003** — Approval, review verdict and override, task validation, and conflicts between them are reported as independent signals, never folded into the stage. _(A completion approval and a failed task result can both be true and must both be visible.)_
- **E202610072ff0dfda:FR004** — Missing, malformed or unresolvable records are reported as data-quality notices while every unaffected work item remains present. _(One bad record must not blank the view or silently drop work.)_
- **E202610072ff0dfda:FR005** — Clients obtain the whole view as one coherent, read-only snapshot that states when it was taken, and the same snapshot always yields the same order and counts. _(Consistent counts across clients and refreshes depend on a single, deterministic snapshot.)_

**s1:**

- **E202610072ff0dfda:S001:FR001** — Each epic, story, task and issue is represented once under one stable identity, with its original identifiers kept.
- **E202610072ff0dfda:S001:FR002** — Work items are nested by their recorded relationships: stories under epics, tasks under stories, fix stories under issues.
- **E202610072ff0dfda:S001:FR003** — Standalone stories and issues remain first-class items and are never assigned to an invented parent.
- **E202610072ff0dfda:S001:FR004** — Identity ambiguity and unresolved parents are reported on the affected items rather than resolved by guessing.

**s2:**

- **E202610072ff0dfda:S002:FR001** — Every work item is placed in exactly one of six stages: Scoped, Design & plan, Ready · design approved, Ready · plan approved, Build recorded, Complete.
- **E202610072ff0dfda:S002:FR002** — Which gate makes an item ready depends on the route it was triaged onto, not on which records happen to exist.
- **E202610072ff0dfda:S002:FR003** — Every derived stage carries a reason that names the evidence behind it.

**s3:**

- **E202610072ff0dfda:S003:FR001** — Approval is reported as approved, rejected or pending from the recorded stamps.
- **E202610072ff0dfda:S003:FR002** — Review verdicts and any recorded override are reported alongside the artifact they belong to.
- **E202610072ff0dfda:S003:FR003** — Task results are reported as passed, failed or unrecorded, and unplanned tasks are marked.
- **E202610072ff0dfda:S003:FR004** — A completion approval that coexists with failed task results is reported as a conflict without changing either fact.
- **E202610072ff0dfda:S003:FR005** — Needs attention covers pending decisions, rejections, unresolved review blocks, failed validation, conflicts and unresolved references, and excludes resolved or overridden blocks.

**s4:**

- **E202610072ff0dfda:S004:FR001** — The applicable revision of each record, and the effective amendments and extensions, are resolved from recorded revision information.
- **E202610072ff0dfda:S004:FR002** — Malformed, missing and unresolvable records produce per-item and view-level data-quality notices.
- **E202610072ff0dfda:S004:FR003** — A bad record never removes unaffected work items from the view.

**s5:**

- **E202610072ff0dfda:S005:FR001** — A single read-only request returns the complete delivery view with snapshot and freshness information.
- **E202610072ff0dfda:S005:FR002** — The same snapshot always yields the same order and counts.
- **E202610072ff0dfda:S005:FR003** — Evidence records without a rendered document can still be read through the daemon.
- **E202610072ff0dfda:S005:FR004** — Existing IPC methods are unchanged, or changed only additively.

## 3. Non-goals

- **Building any board, rollup or detail user interface in VS Code, JetBrains or the IDE fork.** — The IDE surfaces are separate epics (E2, E3) that consume this view; keeping rendering out lets the view's contract settle first.
- **Creating, editing, approving, rejecting or reopening any artifact, or changing code or Git state.** — The first release is read-only by requirement; controlled actions need their own interaction and workflow design.
- **Introducing a new workflow state machine or redefining when a stage gate passes.** — The stages are a display projection of recorded evidence, not a replacement for the workflow's own gates.
- **Reporting live agent or coding-session activity.** — The existence of a plan or build record does not establish that anything is currently running.
- **Pushing updates to clients as artifacts change.** — Manual refresh is sufficient for the first increment. The daemon sends nothing unsolicited; a long-lived streamed request could carry updates in a later increment.
- **Review annotations, feedback capture, or agent handoff.** — A follow-on capability: docs/plans/vscode-viewer-gaps.md:86-90 (Track B1) leaves open which surface owns which anchor kind [[c22]].
- **Repairing, migrating or normalising artifacts on disk.** — The view reports bad or ambiguous records; correcting them belongs to the workflow and its migration tooling.
- **Breaking or narrowing the behaviour of existing IPC methods.** — Existing clients of every daemon IPC method must keep working unchanged; any change to an existing method may only add.

## 4. Assumptions

- `high` The route a story or issue took is recorded on its artifacts. meta.sizeClass is typed as the full five-member size class (epic, feature, small, trivial, bugfix) and is stamped on a triage-routed standalone LLD with only a defined-check, so feature, small and bugfix (a sized bugfix's fix story) are the expected values but not a closed set; any other value, or an absent one, is an unknown route. meta.magnitude on an ISSUE is restricted to small or sized when stamped. Full-chain epic LLDs carry no sizeClass in the store today (141 of 141 non-standalone LLDs [[c17]]). Seven standalone LLDs and one ISSUE predate these stamps and have unknown routes [[c17]]. [[c12]]
- `high` Each artifact file is written atomically (a temporary file renamed into place), so a reader never sees a half-written file. An artifact's JSON record and its markdown copy are two separate writes and are not committed together. [[c18]]
- `high` The approve and reject paths stamp meta.approvedAt and meta.rejectedAt, and pending means neither stamp is present. [[c4]]
- `low` Proposed default for the attention policy, to be confirmed by the stakeholder: a pending artifact stops counting toward Needs attention once a downstream gate on the same work item is approved. [[c13]]
- `high` The store holds 731 artifact records today, so a 1,000-artifact / 500-work-item fixture gives headroom for the performance target. [[c17]]
- `high` The daemon's socket server only answers client requests, with a single response or a stream of messages for that request; it never sends unsolicited, connection-level messages. Push-style delivery is possible only as a long-lived streamed request, the pattern the log tail already uses, so a first increment that refreshes by asking again needs no new channel. [[c19]]
- `high` The existing chain report covers an epic's framing, high-level design and per-story designs only, with no plan, build, code-review or issue state. [[c3]]
- `high` The pending-artifact list excludes build records, so it cannot report completion. [[c5]]
- `high` The terminal tool reads the artifact store directly, listing epics and building the chain report in its own process. [[c16]]
- `high` The existing artifact review view resolves a record from its markdown through the in-file artifact marker, so the 69 build records whose markdown lacks the marker cannot be opened through it today. [[c21]]
- `high` A review is stamped on the artifact it reviews, one current review per artifact, recording only when and by whom it was made. Artifacts that carry reviews record no content revision, and the only staleness the framework computes compares a story design with its high-level design, so whether a review still matches an artifact's current content cannot be established from recorded fields today. [[c23]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | The daemon owns all interpretation of the artifact store [[c2]]. CLI, MCP and IDE clients obtain the view only over daemon IPC and never read or interpret artifact files themselves. | [[c8]] |
| `k2` | invariant | The capability is strictly read-only: producing or serving the view never writes to artifacts, approval stamps, source code or Git state. | [[c1]] |
| `k3` | contract | IPC method names and payload shapes stay in lock-step with every client that mirrors them: the insrc-ide fork, the VS Code plugin (which imports the daemon's TypeScript types directly) and the JetBrains plugin (which keeps Kotlin copies) [[c20]]; the response shape is fixed before any client epic depends on it. | [[c9]] |
| `k4` | contract | Work-item identity reuses the existing canonical work-item identity (sc1), under which s1, S1 and S001 name the same story [[c6]]; no parallel identity scheme is introduced, and any collision that rule cannot settle is flagged rather than merged. | [[c7]] |
| `k5` | invariant | Approval state is read from the same fields the approve and reject paths write; the view never infers approval from file existence, file names or modification times. | [[c4]] |
| `k6` | convention | Accuracy over cost: where evidence is missing or ambiguous the view reports incomplete coverage instead of guessing, and no stage or signal is invented to fill a gap. | [[c10]] |
| `k7` | invariant | Stages and signals are derived deterministically from recorded fields, never inferred from prose; the same snapshot and inputs produce the same order and counts. | [[c1]] |
| `k8` | contract | No existing daemon IPC method changes behaviour; this epic only adds. This covers every handler in the daemon's registry, including workflow.pending, workflow.artifactContent, workflow.approve, workflow.resolveComment, artifact.get and artifact.search; any change to one of them is additive only. | [[c11]] |

## 6. Stories

### 6.1 E202610072ff0dfda:S001 — Every work item appears once, in its place in the hierarchy

**User value:** `size: L`

A reader of the delivery view sees each epic, story, task and issue exactly once, nested under the work it belongs to, so counts and navigation can be trusted without cross-reading artifacts.

**Extends:** [[c7]] [[c15]]

**Acceptance criteria:**

- **ac1:** Given a story with a design, a plan, a build record and a code review, when the delivery view is produced, then exactly one story item appears, and it references all four records as its evidence. _(operationalizes `k4`, `k7`)_
- **ac2:** Given records for the same story whose identifiers are written as s1 and S001, when the delivery view is produced, then they resolve to one story item under the canonical identity, and both original identifiers are retained on it. _(operationalizes `k4`)_
- **ac3:** Given two records whose identity the canonical rule cannot settle as the same or different work item, when the delivery view is produced, then both remain separate and each carries an ambiguity notice naming the other; neither is silently merged. _(operationalizes `k4`, `k6`)_
- **ac4:** Given an issue with two associated fix stories, when the delivery view is produced, then the issue appears once with both fix stories as distinct children, each keeping its own tasks and evidence. _(operationalizes `k4`)_
- **ac5:** Given an issue whose parent story cannot be found, and a standalone story with no epic, when the delivery view is produced, then the issue is still present with an unresolved-parent notice, and the standalone story is present without being attached to any invented epic. _(operationalizes `k6`)_
- **ac6:** Given a planned task identified only by a short task identifier that also appears in another story, when the delivery view is produced, then each task is identified through its parent story, so the two tasks never collide. _(operationalizes `k4`, `k7`)_

### 6.2 E202610072ff0dfda:S002 — Each work item shows the stage it has reached, and why

**User value:** `size: M`

A reviewer can see at a glance where every work item stands on its own route to completion, with the evidence that placed it there, so items that legitimately skip planning are not mistaken for stalled work.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given a full-chain story with an approved plan and no build record, when its stage is derived, then it is in Ready · plan approved, with a reason naming the approved plan, and no running activity is implied. _(operationalizes `k7`, `k6`)_
- **ac2:** Given a small-route story with an approved design and no plan, and a small bugfix with an approved issue and no design, when their stages are derived, then both are in Ready · design approved, neither is in Ready · plan approved, and neither reports a missing plan or a pending planning decision. _(operationalizes `k7`)_
- **ac3:** Given a story with a build record that has no completion approval, even though all its task checks passed, when its stage is derived, then it is in Build recorded. _(operationalizes `k5`, `k7`)_
- **ac4:** Given a story with a build record that carries a completion approval, when its stage is derived, then it is in Complete regardless of its task results or review verdicts. _(operationalizes `k5`, `k7`)_
- **ac5:** Given a story with a code review but no build record, when its stage is derived, then the code review does not change the stage, and the item carries a notice that its code was reviewed without a build record. _(operationalizes `k6`, `k7`)_
- **ac6:** Given a work item whose route cannot be determined from its records, when its stage is derived, then it keeps the stage its records establish and carries an unknown-route notice; no route is guessed. _(operationalizes `k6`)_
- **ac7:** Given a story or issue with no design, plan or build record, when its stage is derived, then it is in Scoped. _(operationalizes `k7`)_

### 6.3 E202610072ff0dfda:S003 — Approval, review, validation and conflicts stay visible as separate facts

**User value:** `size: L`

A reviewer can tell what was approved, what the reviews said, which tasks actually passed, and where those facts disagree, so a convenient status never hides contradictory evidence and the attention list shows what genuinely needs a decision.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given an artifact with an approval stamp, another with a rejection stamp, and a third with neither, when their approval signals are reported, then they read approved, rejected and pending respectively, and a rejected artifact is never shown as pending. _(operationalizes `k5`)_
- **ac2:** Given an approved build record with one task recorded as failed, when its signals are reported, then the item stays Complete and carries a validation-conflict signal that shows both the approval and the failed task; neither fact is altered. _(operationalizes `k2`, `k6`)_
- **ac3:** Given a planned task with no recorded result, when task validation is reported, then the task is Unrecorded and is counted as neither passed nor failed. _(operationalizes `k6`)_
- **ac4:** Given a task result recorded in a build record that has no matching planned task, when task validation is reported, then the task is shown with its result and marked as unplanned. _(operationalizes `k6`)_
- **ac5:** Given an unapproved artifact whose review verdict is block and which has no recorded override, when the attention filter is evaluated, then the item matches Needs attention and keeps its stage. _(operationalizes `k7`)_
- **ac6:** Given an approved artifact with a historical block verdict, and an unapproved artifact whose block carries a recorded override, when the attention filter is evaluated, then neither matches Needs attention, and both still show the original verdict and, where present, the override. _(operationalizes `k7`, `k6`)_
- **ac7:** Given a pending artifact on a work item where a downstream gate on the same item is already approved, when the attention filter is evaluated, then the pending artifact is handled according to the attention policy the stakeholder confirms, and the rule applied is stated on the item. _(operationalizes `k7`)_

**Local constraints:**

- `lc1` (stakeholder) The attention policy for pending artifacts superseded by downstream approval must be confirmed by the stakeholder before this story's design is approved; the proposed default is that such an artifact stops counting toward Needs attention. [[c13]]

### 6.4 E202610072ff0dfda:S004 — The view reflects the current revision of each record and reports incomplete evidence

**User value:** `size: M`

A reader can rely on the view to use the record that actually applies, including accepted amendments and extensions, to be told when it cannot know whether a review still matches the current content, and to be told plainly when a record is malformed or missing instead of seeing a silently thinner view.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given an artifact with a recorded review, whose content may have changed since that review, when the applicable review is reported, then the review is shown exactly as recorded with the time it was made; it is reported as current or stale only where recorded fields establish that, and otherwise as of unknown currency; file modification time is never used. _(operationalizes `k5`, `k7`)_
- **ac2:** Given an epic with an accepted extension that adds a story, and a base framing that predates it, when the delivery view is produced, then the added story is present, and the older base framing does not hide or overwrite it. _(operationalizes `k6`, `k7`)_
- **ac3:** Given one malformed artifact file among otherwise valid records, when the delivery view is produced, then every unaffected work item is present, and a data-quality notice names the malformed file and the coverage it leaves unknown. _(operationalizes `k6`)_
- **ac4:** Given records that are missing, such as a story with a build record but no plan, or an artifact with no title, when the delivery view is produced, then the affected items remain inspectable and are marked as having incomplete evidence; no content is invented. _(operationalizes `k6`)_
- **ac5:** Given any malformed or ambiguous record, when the delivery view is produced, then no file in the artifact store is changed. _(operationalizes `k2`)_

### 6.5 E202610072ff0dfda:S005 — Clients read the whole view, and its evidence, as one coherent snapshot

**User value:** `size: M`

Every IDE client gets the same complete, timestamped view in one request, can open the records behind any item, and sees identical order and counts each time, so separate clients and refreshes never disagree.

**Depends on:** `s1`, `s2`, `s3`, `s4`

**Acceptance criteria:**

- **ac1:** Given a registered repository with artifacts, when a client requests the delivery view, then it receives one complete snapshot of all work items with the time it was taken, and no artifact, approval, code or Git state changes. _(operationalizes `k1`, `k2`)_
- **ac2:** Given the same artifact store, including work items with equal timestamps, when the delivery view is requested twice, then both responses list the same items in the same order with identical counts. _(operationalizes `k7`)_
- **ac3:** Given a work item whose build record cannot be opened through the existing review view, because its markdown carries no artifact marker, when a client asks for that evidence, then the client receives a readable view of the record through the daemon, without reading the file itself. _(operationalizes `k1`, `k8`)_
- **ac4:** Given a store of 1,000 artifacts forming 500 work items on the reference environment, when the delivery view is requested, then the snapshot is returned within the agreed time budget. _(operationalizes `k6`)_
- **ac5:** Given existing clients of any daemon IPC method, including the pending-artifact list and the artifact review view, when this capability is added, then those clients behave exactly as before. _(operationalizes `k8`)_
- **ac6:** Given the published response shape, when a client epic starts, then the shape is fixed and mirrored for the VS Code plugin, the JetBrains plugin and the insrc-ide fork. _(operationalizes `k3`)_

## 7. References

- **[[c1]]** `doc` `docs/insrc-delivery-board-prd.html:193 (FR-09); §05 State & evidence at :164, §07 Data contract at :197` — "Keep the MVP read-only: all navigation and filtering leave artifacts, approvals, code, and Git state unchanged."
- **[[c2]]** `doc` `docs/plans/delivery-board-epics.md:54-55 (E1 — Delivery read model (daemon))` — "one read-only, daemon-owned projection that turns `.insrc/artifacts/` into the PRD's work-item model, exposed over IPC."
- **[[c3]]** `code` `src/workflow/chain.ts:30-65 (ChainReport)` — "readonly stories: readonly { readonly id: string; readonly title: string; readonly hasLld: boolean; readonly approved: boolean; readonly stale: boolean; ... }[]; readonly amendments: {...}; readonly t"
- **[[c4]]** `code` `src/workflow/pending.ts:126-128 (pending test); written at src/workflow/gates.ts:606 (approvedAt) and :954 (rejectedAt)` — "// Pending = neither stamped: the SAME fields approve/reject write (k5)."
- **[[c5]]** `code` `src/workflow/pending.ts:39` — "export const PENDING_KINDS = ['SPEC', 'DEF', 'HLD', 'LLD', 'PLAN', 'ISSUE', 'CR'] as const;"
- **[[c6]]** `code` `src/workflow/id.ts::storyIdToOrdinal` — "The ordinal is what matters — 's1', 'S1' and 'S001' all yield 1."
- **[[c7]]** `prior-artifact` `docs/epics/restructure-docs-artifact-markdown-from-flat-E20260915599a9b50/HLD.md :: sc1: Uniform work-item identity` — "One canonical, both-way identity for every work item and story — epic-parented or standalone — so identity can serve as the folder key and lookup key the whole layout hangs on."
- **[[c8]]** `convention` `CLAUDE.md:135 — Key architectural rules, rule 1` — "Daemon owns all DB access — CLI, MCP, and the IDE workbench communicate via IPC only."
- **[[c9]]** `convention` `CLAUDE.md:30-32 — What lives here` — "IPC method names, socket path (`~/.insrc/daemon.sock`), and payload shapes stay in lock-step across the two repos via mirrored types."
- **[[c10]]** `convention` `CLAUDE.md:11 — Project principles` — "Accuracy is primary; cost is the least priority."
- **[[c11]]** `code` `src/daemon/index.ts:686-704 (workflow.pending, workflow.artifactContent handlers); registry entries workflow.approve :643, workflow.pending :686, workflow.artifactContent :698, workflow.resolveComment :712, artifact.get :1131, artifact.search :1145` — "the review view for one pending artifact — its own rendered .md content ... A pure read (handleArtifactContent) path-guarded under docs/"
- **[[c12]]** `code` `src/workflow/types.ts:401 (meta.sizeClass?: SizeClass) and :412 (meta.magnitude?: BugfixMagnitude); SizeClass defined at src/workflow/triage/types.ts:17 as 'epic' | 'feature' | 'small' | 'trivial' | 'bugfix'; stamped at src/workflow/orchestrator.ts:2352 (standalone design.story, defined-check only) and :903 (issue, small | sized only)` — "...(sizeClass !== undefined ? { sizeClass } : {}),  /  ...(magnitude === 'small' || magnitude === 'sized' ? { magnitude } : {}),"
- **[[c13]]** `stakeholder` `Stakeholder session 2026-10-07: attention-policy default proposed, not yet confirmed` — "Proposed: a pending artifact stops counting toward Needs attention once a downstream gate on the same work item is approved."
- **[[c15]]** `analyze-bundle` `define/s1 code capability-discovery over the artifact-store readers (anchors: src/workflow/chain.ts:84 buildChainReport, src/workflow/artifact-content.ts:101 handleArtifactContent, src/workflow/pending.ts:67 handleWorkflowPending)` — "0 clear-match, 1 partial-match (src/workflow — chain.ts derives per-epic DEF/HLD/LLD approval, artifact-content.ts serves review views), 4 unrelated. Among the five candidates evaluated; the CLI reade"
- **[[c16]]** `code` `src/cli/services/workflow.ts:126 (listEpics) and :145 (chain)` — "listEpics: const dir = join(repoPath, ARTIFACTS_DIR);  /  chain: return buildChainReport(repoPath, epicHash);"
- **[[c17]]** `step-output` `Measured 2026-10-07 by a script over .insrc/artifacts/*.json that reads meta and body fields directly (not docs/ markdown); stories keyed by epicHash + story ordinal (storyIdToOrdinal)` — "731 JSON records; 80 BUILD, 29 of them with meta.approvedAt and at least one body.tasks[].passed === false; 148 CR, 73 with no BUILD for the same story; 39 LLDs with no PLAN; 31 artifacts with meta.re"
- **[[c18]]** `code` `src/workflow/storage.ts:77-87 (writeAtomic)` — "export function writeAtomic(absPath: string, content: string): void { ... renameSync(tmp, absPath);"
- **[[c19]]** `code` `src/daemon/server.ts:59-60, 164-242 (request and stream handling; every socket write at :219, :232, :242 answers a request id)` — "Stream mode: request with "stream": true gets multiple IpcStreamMessages until the handler resolves (stream:done) or throws (stream:error)."
- **[[c20]]** `code` `vscode-plugin/src/chat/docs-review-client.ts:18; jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:31` — "import type { PendingArtifact } from '../../../src/workflow/pending.js';  /  data class PendingArtifactDto("
- **[[c21]]** `code` `src/workflow/artifact-content.ts:101 (handleArtifactContent); :119-125 (.md under docs/ only); :156-162 (metadata resolved through the in-file insrc:artifact marker via jsonPathForMd)` — "// The sibling hash-flat .json (meta + body) via the in-file insrc:artifact marker. ... return { error: `workflow.artifactContent: cannot resolve artifact metadata: ...` }"
- **[[c22]]** `doc` `docs/plans/vscode-viewer-gaps.md:86-90 (Track B1 design question)` — "The design has to state which surface owns which anchor kind rather than growing both."
- **[[c23]]** `code` `src/workflow/review/types.ts:144-160 (ReviewReport); src/workflow/chain.ts:48-51 (per-story LLD-vs-HLD stale / staleReason, computed by src/workflow/amendments/staleness.ts:45 from hldEffectiveHash; no review-staleness signal)` — "ReviewReport { artifact; stage; verdict; findings; counts; template?; reviewedAt; model; reviewedBy? } — no revision or content-hash field. 326 reviewed artifacts on 2026-10-07; none carries meta.upda"

## 8. Open questions

- Item a2: Confirm the attention policy (s3 lc1 / ac7): does a pending artifact stop counting toward Needs attention once a downstream gate on the same work item is approved? The proposed default is yes; confirm before s3's design is approved.

## Resolved questions

- `q17f993e9` — Item a2: Confirm the attention policy (s3 lc1 / ac7): does a pending artifact stop counting toward Needs attention once a downstream gate on the same work item is approved? The proposed default is yes; confirm before s3's design is approved.
  - **resolved**: Yes: a pending artifact stops counting toward Needs attention once a downstream gate on the same work item is approved. — Stakeholder confirmed the proposed default in chat on 2026-10-07. _(2026-10-07T08:03:13.083Z)_

## Citations

- **[[c1]]** `doc` `docs/insrc-delivery-board-prd.html:193 (FR-09); §05 State & evidence at :164, §07 Data contract at :197` — "Keep the MVP read-only: all navigation and filtering leave artifacts, approvals, code, and Git state unchanged."
- **[[c2]]** `doc` `docs/plans/delivery-board-epics.md:54-55 (E1 — Delivery read model (daemon))` — "one read-only, daemon-owned projection that turns `.insrc/artifacts/` into the PRD's work-item model, exposed over IPC."
- **[[c3]]** `code` `src/workflow/chain.ts:30-65 (ChainReport)` — "readonly stories: readonly { readonly id: string; readonly title: string; readonly hasLld: boolean; readonly approved: boolean; readonly stale: boolean; ... }[]; readonly amendments: {...}; readonly t"
- **[[c4]]** `code` `src/workflow/pending.ts:126-128 (pending test); written at src/workflow/gates.ts:606 (approvedAt) and :954 (rejectedAt)` — "// Pending = neither stamped: the SAME fields approve/reject write (k5)."
- **[[c5]]** `code` `src/workflow/pending.ts:39` — "export const PENDING_KINDS = ['SPEC', 'DEF', 'HLD', 'LLD', 'PLAN', 'ISSUE', 'CR'] as const;"
- **[[c6]]** `code` `src/workflow/id.ts::storyIdToOrdinal` — "The ordinal is what matters — 's1', 'S1' and 'S001' all yield 1."
- **[[c7]]** `prior-artifact` `docs/epics/restructure-docs-artifact-markdown-from-flat-E20260915599a9b50/HLD.md :: sc1: Uniform work-item identity` — "One canonical, both-way identity for every work item and story — epic-parented or standalone — so identity can serve as the folder key and lookup key the whole layout hangs on."
- **[[c8]]** `convention` `CLAUDE.md:135 — Key architectural rules, rule 1` — "Daemon owns all DB access — CLI, MCP, and the IDE workbench communicate via IPC only."
- **[[c9]]** `convention` `CLAUDE.md:30-32 — What lives here` — "IPC method names, socket path (`~/.insrc/daemon.sock`), and payload shapes stay in lock-step across the two repos via mirrored types."
- **[[c10]]** `convention` `CLAUDE.md:11 — Project principles` — "Accuracy is primary; cost is the least priority."
- **[[c11]]** `code` `src/daemon/index.ts:686-704 (workflow.pending, workflow.artifactContent handlers); registry entries workflow.approve :643, workflow.pending :686, workflow.artifactContent :698, workflow.resolveComment :712, artifact.get :1131, artifact.search :1145` — "the review view for one pending artifact — its own rendered .md content ... A pure read (handleArtifactContent) path-guarded under docs/"
- **[[c12]]** `code` `src/workflow/types.ts:401 (meta.sizeClass?: SizeClass) and :412 (meta.magnitude?: BugfixMagnitude); SizeClass defined at src/workflow/triage/types.ts:17 as 'epic' | 'feature' | 'small' | 'trivial' | 'bugfix'; stamped at src/workflow/orchestrator.ts:2352 (standalone design.story, defined-check only) and :903 (issue, small | sized only)` — "...(sizeClass !== undefined ? { sizeClass } : {}),  /  ...(magnitude === 'small' || magnitude === 'sized' ? { magnitude } : {}),"
- **[[c13]]** `stakeholder` `Stakeholder session 2026-10-07: attention-policy default proposed, not yet confirmed` — "Proposed: a pending artifact stops counting toward Needs attention once a downstream gate on the same work item is approved."
- **[[c15]]** `analyze-bundle` `define/s1 code capability-discovery over the artifact-store readers (anchors: src/workflow/chain.ts:84 buildChainReport, src/workflow/artifact-content.ts:101 handleArtifactContent, src/workflow/pending.ts:67 handleWorkflowPending)` — "0 clear-match, 1 partial-match (src/workflow — chain.ts derives per-epic DEF/HLD/LLD approval, artifact-content.ts serves review views), 4 unrelated. Among the five candidates evaluated; the CLI reade"
- **[[c16]]** `code` `src/cli/services/workflow.ts:126 (listEpics) and :145 (chain)` — "listEpics: const dir = join(repoPath, ARTIFACTS_DIR);  /  chain: return buildChainReport(repoPath, epicHash);"
- **[[c17]]** `step-output` `Measured 2026-10-07 by a script over .insrc/artifacts/*.json that reads meta and body fields directly (not docs/ markdown); stories keyed by epicHash + story ordinal (storyIdToOrdinal)` — "731 JSON records; 80 BUILD, 29 of them with meta.approvedAt and at least one body.tasks[].passed === false; 148 CR, 73 with no BUILD for the same story; 39 LLDs with no PLAN; 31 artifacts with meta.re"
- **[[c18]]** `code` `src/workflow/storage.ts:77-87 (writeAtomic)` — "export function writeAtomic(absPath: string, content: string): void { ... renameSync(tmp, absPath);"
- **[[c19]]** `code` `src/daemon/server.ts:59-60, 164-242 (request and stream handling; every socket write at :219, :232, :242 answers a request id)` — "Stream mode: request with "stream": true gets multiple IpcStreamMessages until the handler resolves (stream:done) or throws (stream:error)."
- **[[c20]]** `code` `vscode-plugin/src/chat/docs-review-client.ts:18; jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:31` — "import type { PendingArtifact } from '../../../src/workflow/pending.js';  /  data class PendingArtifactDto("
- **[[c21]]** `code` `src/workflow/artifact-content.ts:101 (handleArtifactContent); :119-125 (.md under docs/ only); :156-162 (metadata resolved through the in-file insrc:artifact marker via jsonPathForMd)` — "// The sibling hash-flat .json (meta + body) via the in-file insrc:artifact marker. ... return { error: `workflow.artifactContent: cannot resolve artifact metadata: ...` }"
- **[[c22]]** `doc` `docs/plans/vscode-viewer-gaps.md:86-90 (Track B1 design question)` — "The design has to state which surface owns which anchor kind rather than growing both."
- **[[c23]]** `code` `src/workflow/review/types.ts:144-160 (ReviewReport); src/workflow/chain.ts:48-51 (per-story LLD-vs-HLD stale / staleReason, computed by src/workflow/amendments/staleness.ts:45 from hldEffectiveHash; no review-staleness signal)` — "ReviewReport { artifact; stage; verdict; findings; counts; template?; reviewedAt; model; reviewedBy? } — no revision or content-hash field. 326 reviewed artifacts on 2026-10-07; none carries meta.upda"

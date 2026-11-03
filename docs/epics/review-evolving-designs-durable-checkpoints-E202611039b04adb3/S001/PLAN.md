<!-- insrc:artifact PLAN-9b04adb36cac716d-s1 -->

# Plan: STORY-9b04adb36cac716d-s1

## Summary

**Epic:** `review-evolving-designs-durable-checkpoints`
**LLD run:** `wf-1793695514430-59qpx5`
**LLD effective hash:** `20a9ee7f3bdf...`

Build a dedicated design-review path from validated contracts and workflow-aware subject resolution through coherent review policy, durable checkpoints and independent reviewer execution. Wire the normal MCP/daemon interface, then verify compiled integration and one useful real review while preserving working code review. Recovery, automatic retries, impact-based attempts and approval cleanup remain later stories.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define strict design-review contracts and bounded inputs | M | — | — | unit: Strict phase/schema boundaries reject malformed identities, unknown fields/enums, noninitial S1 attempts and payload/size limit violations.; unit: Common daemon/controller assignment and result schema preserves typed workflow context and bounded progress cursor options. | [[c1]] [[c2]] |
| 2 | **`t2`** Resolve current subjects and workflow-specific required context | L | — | `t1` | unit: Table-driven Epic DEF/HLD/LLD, standalone feature/small LLD, sized ISSUE LLD and no-LLD small/trivial context requirements.; unit: Missing required Epic HLD cannot become standalone; ISSUE root plus standalone flag/corrects link remains issue; missing optional references do not fail.; unit: Canonical identity/paired marker, path containment, unknown party and missing/contradictory provenance are rejected before provider work. | [[c1]] [[c2]] [[c3]] |
| 3 | **`t3`** Implement common reviewer policy and complete chunk/result validation | L | — | `t1`, `t2` | unit: DEF/HLD/LLD prompts contain policy/paths/trailing schema without artifact-body canary or copied baseline.; unit: Coverage plan rejects omitted/unknown units, final-only coverage, cycles, duplicate ids and bad final consistency.; unit: Required verification gaps cannot pass; HIGH/MED and incomplete precedence, LOW/advice separation and deterministic counts preserve findings. | [[c1]] [[c2]] [[c3]] |
| 4 | **`t4`** Persist completed chunks and expose bounded progress | M | — | `t1` | unit: Atomic save faults preserve previous checkpoint and do not acknowledge incomplete durable results.; unit: No-follow bounded loads refuse corrupt/foreign/oversize state without deletion.; unit: Metadata polling and one-result cursor pages never expose baseline/history or trigger provider/activity renewal. | [[c1]] [[c2]] |
| 5 | **`t5`** Run native background reviews through the dedicated owner | L | — | `t2`, `t3`, `t4` | integration: Delayed fake provider proves durable short acknowledgement, exact duplicate-start idempotence and serial planning/chunk dispatch.; integration: Early HIGH/MED/incomplete results continue remaining chunks; failed save prevents advancement and boundary mutation rejects stale candidate.; integration: Submitter disconnect leaves native work active; activity options enforce no fixed deadline/internal retry/code-task grants. | [[c1]] [[c2]] [[c4]] |
| 6 | **`t6`** Support the independent controller reviewer with identical semantics | L | — | `t5` | integration: Actual trusted owner connection/execution/sequence gates controller plan/activity/result, with idempotent exact replay and conflicting replay refusal.; integration: Reviewing-controller disconnect retains completed chunks as interrupted with no automatic reassignment/recovery.; unit: Equivalent native/controller feedback shares policy/schema and produces identical status/counts. | [[c1]] [[c2]] [[c4]] |
| 7 | **`t7`** Wire the normal MCP and daemon design-review interface | L | — | `t5`, `t6` | integration: Normal stdio MCP/Unix IPC start and progress reach one main owner; second observer cannot acquire reviewer authority or duplicate execution.; integration: Schema discovery and steering expose current phases, bounded polling and wait-for-completion guidance.; unit: Retired review/stream/resolve routes remain unavailable and current code-review registration/routing stays intact. | [[c1]] [[c2]] [[c4]] |
| 8 | **`t8`** Verify compiled integration and one useful live design review | M | — | `t7` | smoke: Production build and compiled MCP/daemon fake-CLI smoke complete planning, chunks, incremental feedback and report retrieval.; smoke: Focused existing task-review schema/routing/owner regressions pass without hosted reruns or unrelated full sweep.; live: One meaningful independent design review via normal insrc_review_step records model, acknowledgement/chunk timing, scope, actual feedback and limits separately from fake fixtures. | [[c1]] [[c2]] [[c3]] [[c4]] |

### 1.1 TASK-9b04adb36cac716d-s1-t1 — Define strict design-review contracts and bounded inputs

Add proposed design-review sc1/sc2 schemas and typed errors under src/workflow/review/design-review/contracts.ts. Cover trimmed phase envelopes, workflow context, chunk inventory/plan/results, private attempt/checkpoint and bounded progress/result pages. Keep old task-review domain contracts separate.

**Acceptance checks:**
- Strict phase/schema validation rejects unknown fields, bad review ids/attempts, invalid enums and exceeded limits before provider calls.
- S1 start admits attempt 1 only; observation includes typed cursor/includeResult and never exposes baseline or full history by default.
- Subject/plan/result/progress/checkpoint schemas share one versioned authority for daemon and controller; optional fields meet strict TypeScript conventions.

### 1.2 TASK-9b04adb36cac716d-s1-t2 — Resolve current subjects and workflow-specific required context

Implement proposed subject.ts using current canonical path/identity/root helpers, with Epic/Standalone/Issue requirements from the approved LLD matrix. Build a deterministic reviewable inventory and one private baseline. No commit pins, future build artifacts, synthetic Epic parents or corrections-link workflow switching.

**Acceptance checks:**
- DEF, HLD and Epic-story LLD resolve applicable upstream requirements; standalone feature/small LLD works without DEF/HLD; sized issue LLD uses originating ISSUE.
- Small issue/trivial no-LLD routes are not given invented design subjects or passing reviews; ISSUE/SPEC/PLAN are not added as mandatory review kinds.
- Wrong identity, path escape, unknown author, contradictory root and missing required provenance fail explicitly; missing not-applicable context is not an error and broken Epic chains cannot silently become standalone.
- Workflow derives from canonical root/provenance, including ISSUE root plus standalone layout/flag and correction links; no caller-supplied duplicate workflow discriminator.
- Inventory covers reviewable sections/ids/citations/visual references and baseline checks compare only subject representations, not external context.

### 1.3 TASK-9b04adb36cac716d-s1-t3 — Implement common reviewer policy and complete chunk/result validation

Add proposed policy.ts and results.ts for guidelines+paths prompts, coherent DEF/HLD/LLD chunking, full inventory mapping and final consistency checks. Validate results and derive final status/counts from accepted feedback without another re-verdict model call.

**Acceptance checks:**
- Prompt uses live subject/context/checkpoint paths and trailing schema; artifact-body canary and baseline are absent.
- Plans reject missing/unknown units, final-only coverage, duplicate ids, cycles, bad ordering and missing final consistency.
- DEF/HLD/LLD guidelines retain appropriate semantic concerns, and final alignment uses real Epic, standalone scope or ISSUE context.
- Assigned required coverage is inspected or named as unverified/incomplete; HIGH/MED, LOW/advice and incomplete precedence are consistent across reviewer parties.
- Consolidation preserves all accepted results, counts finding IDs consistently and does not manufacture evidence or run another review call.

### 1.4 TASK-9b04adb36cac716d-s1-t4 — Persist completed chunks and expose bounded progress

Implement proposed checkpoint.ts and progress projection for one private validated atomic JSON state per review, durable accepted chunk boundaries and final report retention. Poll metadata by default and allow one completed-result page without repeated baseline transfer.

**Acceptance checks:**
- Private temp-file write/fsync/rename/directory durability publishes complete validated snapshots; no partial JSON.
- Size/schema/disk faults preserve last accepted state and prevent next-unit advancement; unknown/corrupt/foreign/symlink checkpoints are retained and refused.
- Progress polling never starts models, renews inactivity or claims a saved orphaned execution is live.
- Final report stays in checkpoint and is retrievable; S1 performs no permanent lifecycle stamp or checkpoint deletion.
- Default poll returns metadata only; optional cursor read returns at most one <=1MiB completed result plus next cursor, with no baseline/prompt/history retransmission. Elapsed/activity metadata distinguishes real reviewer/tool activity from observation.

### 1.5 TASK-9b04adb36cac716d-s1-t5 — Run native background reviews through the dedicated owner

Implement proposed coordinator.ts with one main-daemon owner, subject reservations, short durable acknowledgement, reviewer planning and serial chunk execution over existing review-role activity sessions. Keep accepted feedback and substantive continuations durable.

**Acceptance checks:**
- Durable admission precedes acknowledgement/provider dispatch; exact duplicate start is idempotent, conflicting reuse is refused and one subject cannot execute twice.
- Native review survives submitter disconnect and uses existing core review role, activity mode 1800000ms, internalRetry:false and no code-task command grants.
- Save completed feedback before next chunk; early HIGH/MED and honest incomplete results do not stop later chunks/final consistency.
- Boundary subject change rejects stale candidates and marks invalidated; technical/schema/persistence errors are explicit, with no hidden S1 retry, legacy fallback or recovery.
- Completed state/report are deterministic and model-free to retrieve; no raw reasoning/transcript archive.

### 1.6 TASK-9b04adb36cac716d-s1-t6 — Support the independent controller reviewer with identical semantics

Add controller plan/activity/result exchange to the design-review owner, binding authority to the actual trusted session and issued execution generation/sequence. Use the same assignments, schemas, coverage and result assessment as native review, without extracting task-review internals.

**Acceptance checks:**
- Opposite party derives from artifact author; unknown author and caller-forged party are refused.
- Only actual active reviewer connection can submit plans/activity/results; observers can query without acquiring authority.
- Exact response replay is idempotent; foreign, stale or conflicting submissions do not replace accepted results or close a healthy owner merely for semantic errors.
- Controller disconnect exposes interrupted state and preserves completed chunks; S1 does not automatically reassign/resume.
- Identical valid native/controller results produce identical final status/counts and use the same policy/schema.

### 1.7 TASK-9b04adb36cac716d-s1-t7 — Wire the normal MCP and daemon design-review interface

Add proposed design-review MCP schema/adapter, daemon RPC and step handler; update normal MCP registration/schema/guide and main-thread/repo authorization routing. Preserve working code review and exact retired-route failures.

**Acceptance checks:**
- Normal insrc_review_step advertises start/progress/assignment/plan/activity/result and routes via short main-owner operations with trusted controller context.
- MCP uses generic persistent IPC where needed; native work is independent of observer lifetime and controller ownership lasts across sequential exchanges.
- Repo authorization/audit and worker/session routing cannot create a second coordinator; independent subjects can progress without duplicate same-subject execution.
- Retired workflow.review, workflow.reviewArtifact, workflow.resolveFinding and old stream/claim/judge helpers remain unavailable; current code-review tool/schema/routes stay intact.
- Steering tells controller to poll, expose progress and wait for full review before corrections; no backward-compatibility flag or activation switch.

### 1.8 TASK-9b04adb36cac716d-s1-t8 — Verify compiled integration and one useful live design review

Add reproducible compiled transport smoke and focused route/coverage regressions, then run one meaningful independent hosted review through the normal MCP interface. Record complete evidence, limitations and documentation; distinguish deterministic fake-provider tests from hosted review.

**Acceptance checks:**
- Production build and compiled normal MCP/daemon smoke pass with clearly labeled fake CLI output; code-review focused regressions remain healthy.
- Epic, Standalone and Issue fixture matrix proves different required artifacts and negative branch-confusion behavior.
- One real independent review through normal insrc_review_step reads linked current design/code, emits coherent chunks and finishes with retrievable feedback; no raw internal RPC substitute.
- Record review-id/attempt, model identity, timing, plan/chunk outcomes, test execution results and limits. A blocked live run is reported as outstanding, not counted as passing or replaced with author self-review.
- No unrelated full test sweep, sibling-story implementation or new activation/qualification system is added; normal deployment/restart if needed is documented as execution prerequisite.
- Record acknowledgement latency, per-chunk timing and when completed feedback became visible. A useful completed execution may report design findings or explicit substantive verification limits; do not rerun hosted reviews merely to obtain a clean design verdict. Technical failure or no substantive inspection remains outstanding.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Canonical DEF/HLD/standalone LLD resolution; wrong marker/type/party/path refusal before provider call. | `t2` |
| Host inventory and semantic plan mapping for all three artifact kinds, missing-unit/final-only/cycle/duplicate rejection. | `t2`, `t3` |
| Prompt contains policy, live paths, chunk metadata and trailing output schema but not a unique artifact-body canary or repeated baseline. | `t3` |
| Accepted result requires assigned inspected references or explicit limitations; HIGH/MED/incomplete precedence, LOW advice separation and count deduplication. | `t3` |
| Atomic-save fault injection preserves prior checkpoint and prevents next-unit dispatch; unknown/corrupt/oversize state retained. | `t4` |
| Table-driven required references: DEF without future artifacts; HLD with DEF; Epic LLD with DEF/HLD/story; standalone feature/small LLD with no DEF/HLD; sized issue LLD with ISSUE and no fabricated HLD; no-design-review small issue/trivial route. | `t2` |
| Negative branch confusion: missing required Epic HLD does not silently become standalone; ISSUE root plus standalone flag/corrects link remains issue; declared missing SPEC differs from optional absent SPEC; LLD review never requires future PLAN/TASKS/BUILD/CR. | `t2` |
| Opposite-party selection for both authors, refusal of unknown author. | `t2`, `t6` |
| Controller owner/execution/sequence binding, exact replay idempotence and conflicting replay refusal. | `t6` |
| Native/controller equivalent chunk feedback produces identical consolidated status/counts. | `t5`, `t6` |
| Progress request and bounded result-page request never call a provider or renew inactivity. | `t4`, `t5` |
| Native options are activity mode 1800000ms, internalRetry:false and absent codeTaskCommands. | `t5` |
| Real local Unix IPC/stdio MCP start acknowledges before delayed fake reviewer completion; independent poll sees saved feedback. | `t7` |
| One review serializes chunks; duplicate start from another session dispatches no additional planning/chunk work. | `t5`, `t7` |
| Submitting MCP disconnect does not abort native review; reviewing-controller disconnect marks interrupted and preserves completed chunks. | `t5`, `t6`, `t7` |
| HIGH/MED first chunk and incomplete second chunk both permit later substantive/final consistency work; no corrective artifact writes. | `t3`, `t5` |
| Progress pages expose completed findings without retransmitting baseline; exact failed save prevents advancing. | `t4`, `t7` |
| Retired workflow.review/legacy stream and resolver routes still throw exact unavailable exception; code-review normal path remains unchanged. | `t7`, `t8` |
| Build with npm run build; compiled MCP schema discovery exposes only current design phases and correct guide. | `t8` |
| Compiled daemon/main-thread route starts one fake native review, polls feedback and retrieves completed report. | `t8` |
| Compiled code-review registration and focused routing regression remain healthy. | `t8` |
| Controller-authored meaningful current DEF/HLD/LLD is reviewed by the daemon via normal insrc_review_step, not internal RPC fallback. | `t8` |
| Reviewer reads linked artifact/code, returns coherent plan and substantive feedback, all chunks complete and checkpoint/result remain retrievable. | `t8` |
| Record model identity, review/attempt, timestamps, chunk/status/findings and any optional execution/visual verification limits. No test fixture output is claimed as hosted assessment. | `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S001/LLD.md#2-contract-details`
- **[[c2]]** `prior-artifact` `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S001/LLD.md#3-data-model-changes`
- **[[c3]]** `prior-artifact` `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S001/LLD.md#7-test-strategy`
- **[[c4]]** `prior-artifact` `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S001/LLD.md#6-error-paths`

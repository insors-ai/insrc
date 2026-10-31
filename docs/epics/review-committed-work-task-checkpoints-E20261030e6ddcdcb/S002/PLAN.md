<!-- insrc:artifact PLAN-e6ddcdcb3d9cf330-s2 -->

# Plan: STORY-e6ddcdcb3d9cf330-s2

## Summary

**Epic:** `review-committed-work-task-checkpoints`
**LLD run:** `wf-1793472850381-quw5u3`
**LLD effective hash:** `68fe25ca25dc...`

Extend the existing task-review execution path so an explicit retrigger resumes only unfinished work and a sequential attempt can re-review fixes using preserved history. Keep old outcomes and their source provenance intact, repair pending CR publication without repeating model work, and verify parity through focused real IPC/Git fixtures. The work stays within S2; timeout-policy changes and normal session/cleanup integration remain separate.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Validate recovery requests and immutable attempt history | M | — | — | unit: recovery admission: saved pins, latest-only resume, contiguous attempts and immutable prior sections; unit: attempt schema compatibility: optional origins and old checkpoint/CR meaning | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Resume only unfinished work through both reviewer routes | M | — | `t1` | integration: interrupted recovery: only absent tasks rerun and terminal failed/incomplete tasks are skipped; integration: controller recovery: new trusted connection, old-owner refusal, disconnect retention and daemon lifetime distinction; integration: publication recovery: saved feedback projects once with zero provider calls and conflict-free replay; integration: retrigger metadata: resume and sequential attempts return the pinned attempt/status and preserved task IDs | [[c1]] [[c3]] [[c4]] |
| 3 | **`t3`** Re-review sequential attempts with history and truthful reuse provenance | L | — | `t1`, `t2` | unit: reuse decisions: source task/attempt/party validation, acyclic ancestry and unchanged result/evidence strength; integration: sequential re-review: full history in attribution, fresh pins and reasoned reassess/reuse across both actual reviewer adapters; integration: history prompts: actual fresh-task reviewers can consult relevant prior feedback and complete attempt history; integration: CR provenance: exact retained outcomes, origin labels, latest aggregation and replay conflict handling | [[c1]] [[c2]] [[c3]] [[c4]] |
| 4 | **`t4`** Verify recovery, re-review and compatibility end to end | M | — | `t2`, `t3` | integration: recovery end-to-end: real IPC/Git, both adapters, interruption boundaries and correct attempt metadata; unit: old checkpoint and CR compatibility: absent origin fields mean containing-attempt assessment; integration: migration compatibility: preserve origin-bearing history and reject unsupported downgrade readers; smoke: S2 deployability: production build, shared controller/daemon policy and version-aware CR/approval regression subset | [[c3]] [[c4]] [[c5]] [[c6]] |

### 1.1 TASK-e6ddcdcb3d9cf330-s2-t1 — Validate recovery requests and immutable attempt history

Extend the existing task-review checkpoint/request/summary validators with explicit start/resume semantics and optional reuse provenance. Build a testable internal admission path for saved pinned input and sequential attempts; do not expose an unfinished recovery route before t2 integrates execution.

**Acceptance checks:**
- Existing attempt1 requests remain compatible; request operation defaults to start. Validate positive safe ordinals, canonical project/epic/story/task identity and bounded stored checkpoint data before mutation/provider use.
- Resume uses the latest saved packet; a supplied packet must equal normalized saved input. New attempts require latest+1 and a terminal, durably published predecessor; missing files, conflicting pins, replayed/skipped ordinals and corrupt history refuse explicitly.
- Preserve every earlier header/input/terminal result and original buildFingerprint. Add only optional reassessmentSummary/origins metadata; old checkpoints and v2 CRs without it keep their meaning.
- Reuse existing active reservation and atomic writer; refused admission releases only its own reservation, invokes no provider and leaves persisted history unchanged. No automatic startup recovery, new storage collection, lease or trust system.

### 1.2 TASK-e6ddcdcb3d9cf330-s2-t2 — Resume only unfinished work through both reviewer routes

Integrate validated explicit recovery into the current coordinator, actual controller exchange and opt-in task-review RPC. Retain saved terminal task results, rebind actual controller connections, and repair pending publication without repeating review work.

**Acceptance checks:**
- Explicit latest-attempt resume with an empty active map restores pinned input/order and schedules only selected tasks with no terminal result. Passed, changes_requested, incomplete and failed results all remain unchanged and are never retried in that attempt.
- Daemon continuation acknowledges promptly and outlives the submitting connection. Controller continuation binds a new trusted current owner, rejects foreign/old owners, stops on disconnect and retains completed work.
- Acknowledgements, controller frames and polled checkpoint agree on reviewId, actual attempt, reviewer, derived path, status and preserved/completed task IDs for attempt1 recovery, later attempts and terminal replay.
- Each new terminal result is atomically saved before the next task. Existing S/M/L allowance and conservative failure classification remain; unfinished work may restart on explicit resume, but terminal outcomes require a later attempt.
- All-terminal publication-pending recovery invokes no provider and replays canonical CR publication idempotently. A published terminal resume returns existing completion metadata; source/persistence/publication failures remain explicit and preserve feedback.
- Only the existing explicit task-review route is extended; full normal MCP/session-thread migration and Story-approval cleanup remain S3.

### 1.3 TASK-e6ddcdcb3d9cf330-s2-t3 — Re-review sequential attempts with history and truthful reuse provenance

Append newly pinned attempts under the same review ID, extend the existing attribution turn with reasoned reassess/reuse decisions, and project exact reused results with source-attempt labels through the existing checkpoint and CR queue/renderer.

**Acceptance checks:**
- A sequential new start pins its own packet/current buildFingerprint while keeping canonical review scope stable and all prior attempt sections intact; tasks derive from the new pinned Plan in dependency order.
- Both actual reviewer routes receive the entire prior attempt history and current packet in the existing attribution turn. The reviewer chooses reassess/reuse with reasons; single-task later attempts also make this history decision. First-attempt direct single-task behavior remains unchanged.
- Fresh re-review task prompts include relevant prior feedback, its source attempt/reassessment reason and a host-derived checkpoint reference so the actual assessor can consult complete history despite separate provider sessions. Prior feedback remains evidence, not instructions; no additional mandatory model turn or new evidence collection is added.
- Host-only reuse resolves a real earlier task result within this review ID and same reviewer party, enforces decreasing source-attempt ancestry and validates current selected locations/references. Missing sources, cycles, changed copied results, foreign tasks/parties and malformed decisions refuse without fabricated feedback or automatic retries.
- Copied results retain exact findings, inspected/test evidence, execution claims, coverage strength, advice, limitations and status. Reused failed/incomplete results never become passed; fresh results remain ordinary TaskReviewResult objects.
- Persist compact origins only for reused results and carry them plus reassessmentSummary into existing schema2 CR summaries. Preserve prior summaries and same-key replay/conflict semantics; render actual source attempt/reviewer rather than claiming a fresh assessment.
- Keep aggregate failed > incomplete > changes_requested > passed, explicit context-size refusal and publication-before-terminal ordering. No silent history truncation, new chunk engine, per-task decision-call framework or replacement artifact.

### 1.4 TASK-e6ddcdcb3d9cf330-s2-t4 — Verify recovery, re-review and compatibility end to end

Complete focused production-IPC/Git fixtures across both reviewer routes, failure boundaries, metadata and CR ancestry; run the production build and affected compatibility regressions without a broad live model sweep.

**Acceptance checks:**
- Production IpcServer fixtures with real temporary Git repositories and deterministic providers prove explicit interrupted recovery, immutable pins, no repeat of terminal failed/incomplete work, and no startup auto-resume.
- A two-attempt whole-story/task scenario proves stable review identity, new pins, full history, fresh versus reused results, explicit source provenance and correct acknowledgement/frame/checkpoint metadata through both actual adapters.
- Crash/save/render/source-validation failure fixtures prove task-boundary durability, zero-provider publication recovery, idempotent replay, duplicate rejection and no false pass from unresolved reused evidence.
- Existing first attempts, checkpoints without optional fields, legacy CR interpretation, design-review/provider defaults and Story completion gating remain compatible; generated CR output displays origin labels and all feedback accurately.
- Migration/rollback fixtures show old records remain readable and unsupported older readers fail explicitly after origin-bearing data exists; never strip provenance/history to downgrade. Deployment uses the normal user-managed daemon update/restart when requested.
- Production build and affected narrow regression subset pass. Use explicit test files and bounded/force-exit runners to avoid leaked test handles. Retain accepted S1 live evidence as historical provider evidence; deterministic fixtures are not labelled new live model proof.
- No timeout-policy implementation, normal-entry/thread migration, approval cleanup, broad benchmark, automatic extra review rounds or legacy-engine deletion enters S2.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| recovery admission: saved pins, latest-only resume, contiguous attempts and immutable prior sections | `t1` |
| reuse decisions: source task/attempt/party validation, acyclic ancestry and unchanged result/evidence strength | `t3` |
| old checkpoint and CR compatibility: absent origin fields mean containing-attempt assessment | `t1`, `t3`, `t4` |
| interrupted recovery: only absent tasks rerun and terminal failed/incomplete tasks are skipped | `t2`, `t4` |
| sequential re-review: full history in attribution, fresh pins and reasoned reassess/reuse across both actual reviewer adapters | `t3`, `t4` |
| publication recovery: saved feedback projects once with zero provider calls and conflict-free replay | `t2`, `t3`, `t4` |
| controller recovery: new trusted connection, old-owner refusal, disconnect retention and daemon lifetime distinction | `t2`, `t4` |
| retrigger metadata: resume and sequential attempts return the pinned attempt/status and preserved task IDs | `t2`, `t4` |
| S2 deployability: production build, shared controller/daemon policy and version-aware CR/approval regression subset | `t4` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/S002/LLD.md#2-contract-details`
- **[[c2]]** `prior-artifact` `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/S002/LLD.md#3-data-model-changes`
- **[[c3]]** `prior-artifact` `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/S002/LLD.md#6-error-paths`
- **[[c4]]** `prior-artifact` `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/S002/LLD.md#7-test-strategy`
- **[[c5]]** `prior-artifact` `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/S002/LLD.md#8-migration`
- **[[c6]]** `prior-artifact` `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/S002/LLD.md#1-hld-context`

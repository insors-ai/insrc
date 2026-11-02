<!-- insrc:artifact PLAN-bd3fc04540624ba3-s1 -->

# Plan: STORY-bd3fc04540624ba3-s1

## Summary

**Epic:** `preserve-native-review-validation-failures-next`
**LLD run:** `wf-1793597748326-1qf85p`
**LLD effective hash:** `bd3fc0454062...`

Implement one bounded diagnostic path from native review output to the existing checkpoint, then derive concise previousRoundFeedback for the next attempt. Build and verify provider capture before durable host integration, and complete the input projection with deterministic recovery tests. Strict schema/finality checks and prior review results remain unchanged; no hosted S2 rerun is part of this build.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Capture bounded native output diagnostics for Claude and Codex | M | — | — | unit: Claude missing-findings repeated five times coalesces and never accepts; unit: Codex final JSON parse/schema failure preserves finality and diagnostics; unit: Terminal CLI failure and host semantic rejection retain pointed fields; unit: UTF-8/count/preview budgets and static correction mapping exclude reasoning and markup repair | [[c1]] [[c2]] |
| 2 | **`t2`** Persist diagnostics through both task-review host routes | M | — | `t1` | unit: Old checkpoint unchanged; diagnostics optional and host-owned, absent from model result schema; unit: Shared attribution diagnostics stored once and projected only to applicable selected scope; integration: Controller diagnostic exchange preserves ownership/sequence replay and never renews inactivity; integration: Writer failure does not falsely acknowledge diagnostics; accepted feedback survives later wrapper failure | [[c1]] [[c3]] |
| 3 | **`t3`** Supply concise previous-round feedback and verify recovery end to end | M | — | `t2` | unit: previousRoundFeedback is concise, scoped, bounded, excludes previews/schema and respects latest same-party resolved result; integration: Fake Claude/Codex failure persists on daemon route and appears in subsequent input; integration: Saved diagnostics survive disconnect/restart; later valid feedback does not rewrite failed attempt; integration: Writer failure does not falsely acknowledge diagnostics; accepted feedback survives later wrapper failure | [[c1]] [[c4]] [[c5]] |

### 1.1 TASK-bd3fc04540624ba3-s1-t1 — Capture bounded native output diagnostics for Claude and Codex

Implement the approved shared diagnostic/error types and optional activity diagnostic callback, reuse the existing AJV validation result with plain structured issues, and capture native JSON/schema/host/terminal failures plus bounded rejected-feedback evidence in ReviewActivityStream/CliProvider. Preserve existing strict acceptance, successful finality, process cancellation and memory bounds; no auto-retry or markup repair.

**Acceptance checks:**
- Both providers expose missing-field, malformed final JSON, terminal/exit and host validation failures through bounded structured diagnostics rather than only generic errors.
- Repeated issues coalesce; approved UTF-8/count/preview limits and static corrections exclude prompts/reasoning and never parse summary markup into fields.
- Only valid final feedback can be accepted; accepted durable feedback survives a later wrapper failure; no fixed task timer or native retry is introduced.
- Claude validation errors must correlate to StructuredOutput/native terminal envelopes; unrelated Read/Bash permission/tool errors are not inferred to be output-schema errors.

### 1.2 TASK-bd3fc04540624ba3-s1-t2 — Persist diagnostics through both task-review host routes

Add optional host-owned failureDiagnostics to the existing attempt response and connect the native callback/error fallback to daemon serial persistence. Extend the existing controller activity exchange for diagnostics with task/phase/owner/execution/sequence checks. Keep shared attribution diagnostic evidence once per attempt phase and assessment diagnostics per selected task, preserving old checkpoints, ordinary result schemas and immutable history.

**Acceptance checks:**
- Daemon and controller paths durably retain equivalent diagnostic snapshots in the existing checkpoint; no new recovery file or diagnostic RPC is introduced.
- Diagnostics never renew inactivity, complete tasks, change prior results or cross owner/execution/task fences; identical accepted exchange replay is idempotent.
- Attribution errors are stored once at phase scope; assessment errors require a selected task. Save/budget failures surface honestly without false acknowledgment or loss of already accepted feedback.
- Historical checkpoints/CRs without diagnostics remain unchanged and readable; model-authored TaskReviewResult/native schemas do not request or accept host diagnostic fields.

### 1.3 TASK-bd3fc04540624ba3-s1-t3 — Supply concise previous-round feedback and verify recovery end to end

Project explicit previousRoundFeedback into attribution and assessment inputs using latest applicable same-reviewer unresolved failures. Exclude previews/raw errors/schema repetition from this property and raw diagnostics from embedded history. Complete provider/host/recovery and subsequent valid feedback tests, preserve old failed attempts, and document the new input and diagnostic boundaries.

**Acceptance checks:**
- Next inputs contain pointed attempt/task/phase/code/field/correction data; assignments are task-scoped and attribution selected-scope, within the 4 KiB prompt budget with explicit truncation.
- Latest same-party resolved results suppress older errors; absent/foreign historical diagnostics produce empty feedback without guessing or backfill.
- Synthetic Claude/Codex runs prove rejected feedback -> durable checkpoint -> concise next input -> independently schema-valid next feedback on both host routes, with byte-identical earlier attempts.
- Disconnect/restart, shared attribution, writer failure and accepted-feedback precedence tests preserve existing invariants. Documentation updated; no hosted S2 retry or legacy review invocation is part of this build.
- Document optional diagnostic data compatibility, old strict-reader downgrade limitations and no stripping/backfill of immutable history.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Claude missing-findings repeated five times coalesces and never accepts | `t1` |
| Codex final JSON parse/schema failure preserves finality and diagnostics | `t1` |
| Terminal CLI failure and host semantic rejection retain pointed fields | `t1` |
| UTF-8/count/preview budgets and static correction mapping exclude reasoning and markup repair | `t1` |
| Old checkpoint unchanged; diagnostics optional and host-owned, absent from model result schema | `t2` |
| previousRoundFeedback is concise, scoped, bounded, excludes previews/schema and respects latest same-party resolved result | `t3` |
| Shared attribution diagnostics stored once and projected only to applicable selected scope | `t2` |
| Fake Claude/Codex failure persists on daemon route and appears in subsequent input | `t3` |
| Controller diagnostic exchange preserves ownership/sequence replay and never renews inactivity | `t2` |
| Saved diagnostics survive disconnect/restart; later valid feedback does not rewrite failed attempt | `t3` |
| Writer failure does not falsely acknowledge diagnostics; accepted feedback survives later wrapper failure | `t2`, `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD-bd3fc04540624ba3-s1 contractDetails and errorPaths`
- **[[c2]]** `prior-artifact` `LLD-bd3fc04540624ba3-s1 dataModelChanges: ReviewDiagnosticSnapshot and ReviewOutputFailureError`
- **[[c3]]** `prior-artifact` `LLD-bd3fc04540624ba3-s1 dataModelChanges: ReviewAttempt.review-response.failureDiagnostics`
- **[[c4]]** `prior-artifact` `LLD-bd3fc04540624ba3-s1 dataModelChanges: previousRoundFeedback`
- **[[c5]]** `prior-artifact` `LLD-bd3fc04540624ba3-s1 testStrategy and migration`

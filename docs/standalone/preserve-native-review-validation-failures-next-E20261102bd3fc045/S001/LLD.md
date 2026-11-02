<!-- insrc:artifact LLD-bd3fc04540624ba3-s1 -->

# LLD: STORY-bd3fc04540624ba3-s1

## Summary

**Epic:** `preserve-native-review-validation-failures-next`
**HLD base run:** `wf-1793597748326-1qf85p`
**HLD effective hash:** `bd3fc0454062...`

Capture native review output failures in the existing checkpoint, then pass concise previousRoundFeedback into subsequent reviewer inputs. Claude and Codex use the same bounded diagnostics and strict acceptance rules. Rejected output remains evidence, never an automatically repaired or accepted review.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `ActivityReviewSessionOpts`

```typescript
interface ActivityReviewSessionOpts { onDiagnostic?: (snapshot: ReviewDiagnosticSnapshot) => void | Promise<void>; /* existing fields unchanged */ }
```

**Parameters:**
- `onDiagnostic: (snapshot: ReviewDiagnosticSnapshot) => void | Promise<void>` _(optional)_ — Relay bounded output-validation failures to the owning host separately from activity and acceptance.

**Returns:** `void | Promise<void>` — Receipt after persistence, or surfaced failure.

**Errors:**
- `ReviewOutputFailureError` when Output failure carries bounded diagnostic snapshot; diagnostic persistence failure is surfaced without acknowledging durability.

**Preconditions:**
- Existing serialized native session ownership.

**Postconditions:**
- Diagnostic receipt never renews inactivity or accepts feedback.

### 2.2 `ReviewActivityStream`

```typescript
class ReviewActivityStream<T> { feed(chunk: Buffer): Promise<void>; end(): Promise<void>; result(): { accepted: true; value: T } | { accepted: false }; completed(): T; }
```

**Parameters:**
- `opts: ActivityReviewSessionOpts` — Existing schema/activity/candidate contract plus diagnostic sink.

**Returns:** `T` — Only valid final accepted feedback.

**Errors:**
- `ReviewOutputFailureError` when Native JSON/schema/protocol/terminal failure with bounded snapshot.

**Preconditions:**
- Assigned schema and serial native frames.

**Postconditions:**
- Capture Claude StructuredOutput candidate/rejection/result errors and Codex final-message JSON/schema/turn errors.
- Keep finality, candidate size bounds and host semantic rejection authoritative; no XML extraction or automatic retry.

### 2.3 `validateAgainstSchema`

```typescript
validateAgainstSchema<T>(schema: StructuredSchema, raw: unknown): { ok: true; value: T } | { ok: false; errors: string[]; issues?: readonly ReviewValidationIssue[] }
```

**Parameters:**
- `schema: StructuredSchema` — Existing supplied schema.
- `raw: unknown` — Untrusted native JSON boundary; unknown is intentional.

**Returns:** `ValidationResult<T>` — Same validator and existing errors plus plain structured issues from that validation invocation.

**Preconditions:**
- No validator SDK types in shared contracts.

**Postconditions:**
- No duplicate/weaker validation path or inferred correction from arbitrary prose.

### 2.4 `TaskReviewCoordinator`

```typescript
class TaskReviewCoordinator { /* existing start/resume and candidate flow consume diagnostic snapshots */ }
```

**Parameters:**
- `snapshot: ReviewDiagnosticSnapshot` — Host binds provider diagnostics to current phase/task/attempt under existing serial checkpoint writer.

**Returns:** `Promise<void>` — Durable current-attempt diagnostic update.

**Errors:**
- `TaskReviewInputError` when Invalid snapshot or stale task execution.

**Preconditions:**
- Existing reservation, execution and ordering fences.

**Postconditions:**
- No old attempt/result mutation. Typed provider error retains last diagnostics if callback path fails before terminal error.
- Successful durable accepted feedback survives later CLI failure.

### 2.5 `ControllerTaskReview`

```typescript
class ControllerTaskReview { activity(input: unknown, owner: ControllerReviewOwner, envelope: unknown): Promise<unknown>; }
```

**Parameters:**
- `input: Existing activity event | { kind: 'diagnostic'; diagnostic: ReviewDiagnosticSnapshot }` — Extend existing codeReview.task.activity exchange; no new RPC or checkpoint.
- `envelope: {taskId:string;executionId:string;sequence:number}` — Existing ownership, sequence and replay fence.

**Returns:** `Promise<unknown>` — Validated persisted diagnostic receipt.

**Errors:**
- `TaskReviewInputError` when Wrong owner/task/execution/sequence, conflicting replay or over-bound snapshot.

**Preconditions:**
- Updated native controller integration forwards onDiagnostic.

**Postconditions:**
- Same persistence/feedback behavior as daemon route. Diagnostics do not count as activity.

## 3. Data model changes

### 3.1 `ReviewDiagnosticSnapshot and ReviewOutputFailureError` — new

New host-owned plain data/types, not model output. Snapshot: provider claude|codex; issues[{code,field,correction,message?,occurrences}]; optional terminal{reason,exitCode?,message?}; optional lastRejectedFeedback{preview,truncated}. ReviewOutputFailureError extends Error and carries this bounded snapshot across provider failures. Errors derive from JSON parser, existing AJV keyword/path details, native terminal envelopes or known host validation errors only. Static correction examples: missing required findings -> MISSING_REQUIRED_FIELD / findings / 'Return findings as a top-level JSON array.'; invalid JSON -> INVALID_JSON / '/' / 'Return one valid JSON object.' Do not invent FIELD_EMBEDDED_IN_SUMMARY from text or parse markup into missing fields. Capture only whitelisted output/error fields, never reasoning/prompts/raw tool results.

```
At most 8 distinct issues per snapshot; code <=64 chars; field/correction <=256 UTF-8 bytes each; message <=1024 UTF-8 bytes; preview <=8192 UTF-8 bytes. Count repeated issues rather than append. Current-attempt diagnostic total <=32 KiB. Drop preview then long message first and mark truncation. Preserve existing 4 MiB whole-checkpoint bound; if compact codes cannot fit, surface save failure rather than falsely acknowledge or silently lose them.
```

**Call sites:**
- `src/agent/providers/review-activity-stream.ts`
- `src/agent/providers/cli-provider.ts`
- `src/agent/providers/structured-output.ts`
- `src/shared/types.ts`
- `src/workflow/code-review/task-review/coordinator.ts`
- `src/workflow/code-review/task-review/controller.ts`

### 3.2 `ReviewAttempt.review-response.failureDiagnostics` — field-add

Optional host-owned array of {phase:'attribution'|'assessment',taskId?:string,diagnostic:ReviewDiagnosticSnapshot}. Relationship: one attempt owns zero or more entries; assessment entries each belong to exactly one selected task; one attribution entry omits taskId and applies to the selected task set. Replace latest current-execution snapshot using existing atomic serial writer and execution fences. Do not multiply shared attribution evidence per task. TaskReviewResult/native schema remains unchanged. Old checkpoints/CRs need no rewrite or backfill. This field remains in existing temporary checkpoint, cleaned by normal story BUILD approval ownership; no new recovery file/cleanup mechanism.

**Call sites:**
- `src/workflow/code-review/task-review/contracts.ts`
- `src/workflow/code-review/task-review/coordinator.ts`
- `src/workflow/code-review/task-review/controller.ts`

### 3.3 `previousRoundFeedback` — new

Derived explicit input property {previousRoundFeedback:[{attempt,taskId,phase,errors:[{code,field,correction}]}],previousRoundFeedbackTruncated?:true}. Not submitter input. For each task/phase inspect the latest earlier same-reviewer attempt only; include supported diagnostics if that task/phase remains unresolved. A newer successful result suppresses older errors. Assignment prompt includes its task; attribution includes applicable selected tasks/shared phase. Missing/foreign/history-without-diagnostics gives []. At most 8 errors per task and 4 KiB UTF-8 across the whole projected feedback including truncation marker. Stable deduplication; no schema repetition or native/candidate snippets. Omit raw failureDiagnostics from all ordinary embedded history so another prompt section cannot reintroduce verbose evidence. Complete checkpoint remains available through existing read tools if needed.

**Call sites:**
- `src/workflow/code-review/task-review/assessment.ts`
- `src/workflow/code-review/task-review/policy.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/preserve-native-review-validation-failures-next-E20261102bd3fc045/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **Malformed JSON, invalid schema, or host semantic rejection** (recoverable)
  - Detection: Native JSON parser, same existing AJV invocation, or host TaskReviewInputError reports a concrete field/error.
  - Response: Persist bounded pointed diagnostics; preserve existing rejection and truthful failed/incomplete state. Later valid output still passes normal validation; never promote rejected feedback.
  - User impact: Next round knows the exact output mistake.
- **Native CLI spawn/exit/terminal failure or missing successful final feedback** (recoverable)
  - Detection: runInProcessGroup result and native result/turn envelope provide failure/exit metadata and parser has no accepted candidate.
  - Response: Preserve terminal details plus last rejection through ReviewOutputFailureError and diagnostic sink; no internal retry or full stdout retention.
  - User impact: Generic failure no longer erases actionable diagnostics.
- **Foreign/stale/late controller diagnostic** (terminal)
  - Detection: Owner/task/executionId/sequence/replay validation or completed durable result fence fails.
  - Response: Reject conflicting update; no previous task/result or attempt mutation. Exact accepted exchange replay remains idempotent.
  - User impact: No cross-session contamination.
- **Budget overflow or diagnostic save failure** (recoverable)
  - Detection: Strict schema and UTF-8/issue/attempt/checkpoint byte accounting; atomic writer rejects.
  - Response: Coalesce repeated errors and explicitly truncate preview/long messages first. If compact required errors cannot fit or save fails, surface failure and retain last durable checkpoint; never acknowledge false durability.
  - User impact: Bounded storage and honest persistence.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Five identical missing-findings errors | One pointed missing-field correction plus occurrence count; no verbose explanations, repeated schema or XML extraction. |
| Invalid candidate followed by valid accepted feedback | Acceptance wins; diagnostics remain evidence and do not turn a success into failure or pollute next-round resolved task feedback. |
| No old diagnostics or wrong reviewer party | Empty previousRoundFeedback; no retrospective guessing/backfill. |
| Attribution-wide error | One stored phase entry applies to selected task set; next input includes applicable concise errors without duplicated raw evidence. |
| Disconnect/restart after saved diagnostic before result | Explicit recovery reads persisted current-attempt evidence. No automatic restart/retry or rewriting previous attempts. |
| Untrusted native text/injection/Unicode | Whitelist only output/errors; bound by UTF-8 bytes, JSON-escape fields and use static corrections. No thinking/prompts enter diagnostics or concise feedback. |

**Invariants to preserve**

- Existing supplied schema, successful finality and candidate/semantic enforcement remain authoritative (s1 provider analysis). [[c1]]
- Existing serialized checkpoint ownership and immutable sequential attempts remain authoritative (s1 task-review analysis). [[c2]]
- No automatic retry, engine replacement, timeout redesign or history rewrite (approved issue and s1 located host boundaries). [[c3]]

## 6. Test strategy

**Test framework:** `node:test + node:assert/strict via tsx, confirmed by direct-source fallback after off-topic analyzer test results.`

**Test levels**

- **unit** — Native failure capture and concise corrections for both CLIs.
  - Subjects: `Claude missing-findings repeated five times coalesces and never accepts`, `Codex final JSON parse/schema failure preserves finality and diagnostics`, `Terminal CLI failure and host semantic rejection retain pointed fields`, `UTF-8/count/preview budgets and static correction mapping exclude reasoning and markup repair`
  - Fixtures: `Synthetic native frames matching S2 failure`, `Multibyte oversized candidates/errors`
- **contract** — Stored data and input boundaries.
  - Subjects: `Old checkpoint unchanged; diagnostics optional and host-owned, absent from model result schema`, `previousRoundFeedback is concise, scoped, bounded, excludes previews/schema and respects latest same-party resolved result`, `Shared attribution diagnostics stored once and projected only to applicable selected scope`
  - Fixtures: `Old/new checkpoints and both reviewer histories`
- **integration** — Provider-host-persistence-next-input continuity without hosted models.
  - Subjects: `Fake Claude/Codex failure persists on daemon route and appears in subsequent input`, `Controller diagnostic exchange preserves ownership/sequence replay and never renews inactivity`, `Saved diagnostics survive disconnect/restart; later valid feedback does not rewrite failed attempt`, `Writer failure does not falsely acknowledge diagnostics; accepted feedback survives later wrapper failure`
  - Fixtures: `Existing fake CLI, local Unix IPC, temporary Git fixtures and injected writer failures`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Claude missing-findings repeated five times coalesces and never accepts`, `Codex final JSON parse/schema failure preserves finality and diagnostics`, `Terminal CLI failure and host semantic rejection retain pointed fields` |
| `ac2` | `UTF-8/count/preview budgets and static correction mapping exclude reasoning and markup repair`, `Old checkpoint unchanged; diagnostics optional and host-owned, absent from model result schema` |
| `ac3` | `previousRoundFeedback is concise, scoped, bounded, excludes previews/schema and respects latest same-party resolved result` |
| `ac4` | `Fake Claude/Codex failure persists on daemon route and appears in subsequent input`, `Controller diagnostic exchange preserves ownership/sequence replay and never renews inactivity` |
| `ac5` | `Saved diagnostics survive disconnect/restart; later valid feedback does not rewrite failed attempt`, `Writer failure does not falsely acknowledge diagnostics; accepted feedback survives later wrapper failure` |
| `ac6` | `Shared attribution diagnostics stored once and projected only to applicable selected scope` |

## 7. Migration

**State before:** s1 grounded parser drops invalid-candidate details and generic activity exit loses native errors; checkpoints have no explicit error feedback.

**State after:** Native adapters/hosts persist bounded host-owned evidence and next-attempt inputs receive concise previousRoundFeedback; strict model results/finality and all earlier attempts stay unchanged.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add optional stored diagnostic/plain issue contracts while keeping native model result schemas unchanged; verify old fixtures. — ↩ rollbackable
2. Connect both native adapters and host routes through diagnostic sink/existing activity exchange with strict execution fencing. — ↩ rollbackable
3. Project concise feedback in attribution and assessment and omit raw diagnostic history from inline context. — ↩ rollbackable
4. Deploy with normal daemon restart after BUILD approval. Do not backfill old histories or automatically start S2 review. — ↩ rollbackable

**Backward compat:** New optional checkpoint fields preserve existing old data in new readers; model/submitter schemas unchanged. Updated controller native integration wires optional onDiagnostic for parity. Old strict binaries may reject new diagnostic checkpoints; do not strip/rewrite history to downgrade active runs. No legacy engine, fallback flag or new persistence mechanism.

## 8. Alternatives considered

### 8.1 a1: Host-owned attempt diagnostics — **CHOSEN**

Store bounded host failures alongside task results; derive concise next-round input.

Native adapters report diagnostics to their owning host, which persists them under the existing attempt review-response. Next inputs derive previousRoundFeedback without changing the model TaskReviewResult schema.

### 8.2 a2: Host diagnostics in task result

Add optional host diagnostics to ordinary task results.

Extend TaskReviewResult with host-populated failures, excluding them from native model output schemas, and derive next-round input from those results.

**Rejected because:** Satisfies behavior but mixes host failures into model-authored task output.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 provider/task-review analysis: native validation boundary` — "ReviewActivityStream and validateAgainstSchema located; candidate error details dropped at provider boundary."
- **[[c2]]** `analyze-bundle` `s1 provider/task-review analysis: checkpoint and host boundary` — "TaskReviewCoordinator/ControllerTaskReview and strict immutable checkpoint flow inspected."
- **[[c3]]** `prior-artifact` `.insrc/artifacts/ISSUE-67a00caafa8fcb3e.json`
- **[[c4]]** `code` `src/agent/providers/review-activity-stream.ts`
- **[[c5]]** `code` `src/agent/providers/cli-provider.ts`
- **[[c6]]** `code` `src/agent/providers/structured-output.ts`
- **[[c7]]** `code` `src/shared/types.ts`
- **[[c8]]** `code` `src/workflow/code-review/task-review/contracts.ts`
- **[[c9]]** `code` `src/workflow/code-review/task-review/coordinator.ts`
- **[[c10]]** `code` `src/workflow/code-review/task-review/controller.ts`
- **[[c11]]** `code` `src/workflow/code-review/task-review/assessment.ts`
- **[[c12]]** `code` `src/workflow/code-review/task-review/policy.ts`
- **[[c13]]** `stakeholder` `User decision: previousRoundFeedback contains pointed summaries of output mistakes, not verbose explanations; support both Claude and Codex.`

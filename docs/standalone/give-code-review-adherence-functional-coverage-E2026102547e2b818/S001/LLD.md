<!-- insrc:artifact LLD-47e2b81827433589-s1 -->

# LLD: STORY-47e2b81827433589-s1

## Summary

**Epic:** `give-code-review-adherence-functional-coverage`
**HLD base run:** `wf-1792923694985-ba40bw`
**HLD effective hash:** `3efd443b024f...`

Adherence and functional-coverage reviews will inspect source in read-only reviewer sessions instead of judging implementation from symbol summaries alone. Both single-call and divided reviews will distinguish a source-demonstrated breach from an inability to verify behavior, retaining real defects while downgrading evidence gaps to LOW observations.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `modelDimensionAdapter`

```typescript
modelDimensionAdapter<O>(spec: ModelDimensionSpec<O>, subject: CodeReviewSubject, snapshot: ReviewMaterialSnapshot, limitChars?: number, path?: ReviewPath): ReviewAdapter<DimensionResult>
```

**Parameters:**
- `spec: ModelDimensionSpec<O>` — Dimension-owned opt-in to read-only source inspection; existing other specs keep structured execution.
- `subject: CodeReviewSubject` — Approved contract, changed-file scope and repo cwd.
- `snapshot: ReviewMaterialSnapshot` — Prepared grounding snapshot; summaries remain navigation context.
- `limitChars: number` _(optional)_ — Existing chunk limit.
- `path: ReviewPath` _(optional)_ — Existing daemon/controller behavior.

**Returns:** `ReviewAdapter<DimensionResult>` — Adherence/functional coverage use reviewer-session execution for every model call including judge, chunk, obligation gather, relation and reduction, preserving serial driver and existing limits.

**Errors:**
- `Error` when Reviewer session unavailable or invocation/validation fails: existing pipeline failure/retry, never fabricated pass.

**Preconditions:**
- Existing subject and snapshot contracts hold.

**Postconditions:**
- Source-read instructions permit Read/Grep/Glob and read-only commands such as rg and sed for Codex; no writes or test execution.
- Single/chunk/gather prompts explicitly identify summaries and NO_EVIDENCE as incomplete navigation evidence, never proof of absence.
- Proven breaches require actual source location and explanation after checking relevant helpers; missing/unreadable/deleted/inadequate evidence is confidence observation and severity LOW.
- Other review dimensions preserve existing execution.
- Shared chunk and gather builders must opt out of their current summary-only and notes-are-whole-evidence instructions for these dimensions, including obligation, relation and reduction prompts; preserve citations and uncertainty during reduction.

## 3. Data model changes

### 3.1 `ModelDimensionSpec` — field-add

Add optional source-inspection opt-in consumed only by the adapter; absent preserves compatibility. One spec owns many calls (1:N); adapter passes chosen execution to chunk and gather, each call routes through existing driver to exactly one read-only session. No persistence or public IPC schema changes. Explicitly update src/workflow/review-pipeline/adapters/code-review-chunk.ts and src/workflow/review-pipeline/adapters/code-review-gather.ts: opt-in-aware chunk, obligation, relation and reduction prompts must remove summary-only and closed-evidence assumptions, permit read-only source inspection, and preserve source citations and uncertainty through reductions. Other dimensions retain existing prompt behavior.

**Call sites:**
- `src/workflow/review-pipeline/code-review.ts`
- `src/workflow/review-pipeline/adapters/code-review-chunk.ts`
- `src/workflow/review-pipeline/adapters/code-review-gather.ts`

### 3.2 `Adherence and functional-coverage findings` — invariant-change

Require explicit confidence breach|observation in new model outputs. toResult normalizes observations to LOW; legacy missing confidence is conservatively LOW observation. Breach means source was inspected and demonstrated the specific omission/departure; message cites concrete source and limitation. This does not demote genuine partial implementations proven in source. Chunk notes retain source locations and uncertainty; gather rechecks source rather than converting an empty notes set to a breach. Existing changed-file and known-FR filters remain.

**Call sites:**
- `src/workflow/code-review/dimensions/adherence.ts`
- `src/workflow/code-review/dimensions/functional-coverage.ts`

## 4. Error paths

**Error cases**

- **Source unavailable, deleted or insufficient to establish the clause** (recoverable)
  - Detection: Reviewer attempts source inspection and records missing/read-denied evidence or unresolved helper/context; absent chunk notes alone never establish absence.
  - Response: LOW observation identifying what could not be verified, not unimplemented expectation.
  - User impact: Review exposes evidence gap without false blocking defect.
- **Session missing, timeout, invalid schema or provider failure** (recoverable)
  - Detection: Existing driver detects unavailable runReviewSession, thrown invocation or failed output validation.
  - Response: Existing bounded retry and not-judged/failure behavior; never manufacture pass or implementation absence.
  - User impact: Explicit review failure or incomplete evidence.
- **Source differs during review** (recoverable)
  - Detection: Reviewer sees inconsistent source versus supplied summary or file change while tracing the clause.
  - Response: Identify inspected version and uncertainty; unresolved behavior is LOW observation, do not assert missing implementation from stale summaries.
  - User impact: User can rerun on stable tree.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Behavior present in helper but absent from symbol summary | Inspect caller/helper; no unimplemented finding when source establishes behavior. |
| Genuine missing or partial implementation demonstrated by source | Retain appropriate HIGH/MED breach at real changed code location with approved expectation ref. |
| No chunk records an obligation | Gather inspects source before concluding; if still unverified, LOW observation. |
| Legacy finding with absent confidence or observation labeled HIGH | Normalize to LOW observation; explicit source-demonstrated breach retains severity. |

**Invariants to preserve**

- Existing changed-file filters, FR reference filters, chunk/gather ordering and serial provider calls remain, as found by s1 adapter exploration. [[c1]]
- No provider REST access or edit permissions; reuse existing provider/driver interface only. [[c1]]

## 5. Test strategy

**Test framework:** `node:test + node:assert/strict, executed with tsx; existing *.test.ts convention`

**Test levels**

- **unit** — Both dimensions require source inspection, emit explicit confidence, normalize evidence gaps LOW while retaining genuine HIGH/MED breaches and filters.
  - Subjects: `adherence prompt/schema/result tests`, `functional-coverage prompt/schema/result tests`
  - Fixtures: `Implemented behavior omitted from summaries`, `Actual source-proven omission`, `Unreadable source and missing confidence`
- **integration** — Exercise real pipeline with recording fake read-only session provider and force single/divided paths; verify all execution roles, missing notes, source-read instructions, retries and unchanged other dimensions.
  - Subjects: `modelDimensionAdapter`, `codeReviewGather`, `runReviewJob`
  - Fixtures: `Temporary repo with helper-implemented clause`, `Provider records actual prompts/execution and reads fixture source without writes`, `Missing-note obligation and proven omission`
- **live** — After build, re-review b7a68147dcf72034 s4 with updated runtime; provide source-backed dispositions and assert the four round-2 summary-induced false HIGH findings do not recur. Unavailable verification is outstanding acceptance evidence, not a passing result.
  - Subjects: `Story s4 prior four HIGH findings`, `Mandatory post-build code review for this Story`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Both judges single/divided calls use read-only sessions with source-read guidance.` |
| `ac2` | `Implemented fixture omitted from summaries passes; evidence gaps and missing-note cases LOW; actual omitted behavior remains HIGH breach for both dimensions.` |
| `ac3` | `Re-review b7a68147dcf72034 s4 using updated code: source-backed dispositions demonstrate that none of the four round-2 summary-induced false HIGH findings recur. Unavailable live verification leaves ac3 outstanding, never passing.`, `Affected suite and TypeScript build pass.` |

## 6. Migration

**State before:** s1 analyze adapter exploration and source inspection show structured completion calls on symbol summaries; adherence and functional-coverage gather infer unimplemented behavior from missing notes.

**State after:** Two dimensions opt into read-only source-inspecting reviewer sessions, source-proven breaches retain severity and evidence gaps become LOW observations on both pipeline paths.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add optional dimension source-inspection selection and propagate existing reviewer execution/limits through all generated calls. — ↩ rollbackable
2. Update both dimensions' single and divided prompts, confidence schemas and conservative observation normalization; add regressions. — ↩ rollbackable
3. Build and validate; run mandatory Story review and targeted s4 re-review on updated runtime. Do not silently restart or deploy an installed daemon; if the connected runtime is stale, use isolated temporary-home runtime or document the exact blocked live verification. — ↩ rollbackable

**Backward compat:** No public IPC, DB or provider interface changes. Other dimensions retain structured execution. Existing CR records remain historical; no rewrite or automatic approval. Legacy missing-confidence output is normalized LOW observation when processed by revised dimensions.

## 7. Alternatives considered

### 7.1 a1: Read-only reviewer sessions with explicit evidence outcomes — **CHOSEN**

Reuse existing reviewer-session execution for the two dimensions and require source checks.

Opt adherence and functional coverage into existing read-only reviewer-session execution for single, chunk and gather calls. Prompts require inspecting changed source with platform-appropriate read commands, recording source-grounded evidence versus unverified observations, and never inferring absence from summaries. Gather may read source to resolve gaps. Preserve existing chunk orchestration.

### 7.2 a2: Frozen source evidence atoms

Snapshot changed files and feed line-numbered source through chunked material.

Extend grounding with exact line-numbered changed source, provenance and unavailable status; prepare source snapshots and divide into bounded source atoms while retaining summaries as context. Judge and gather consume source evidence rather than live reads.

**Rejected because:** Larger atom and grounding redesign with source-dump tension; no need to introduce it for this defect.

## 8. References

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[0]` — "Review adapter depends on material, chunk, gather and obligation adapters; graph incomplete, direct source corroborated."
- **[[c2]]** `code` `src/workflow/code-review/dimensions/adherence.ts:153`
- **[[c3]]** `code` `src/workflow/code-review/dimensions/functional-coverage.ts:148`
- **[[c4]]** `prior-artifact` `ISSUE-47e2b81827433589`
- **[[c5]]** `code` `src/workflow/review-pipeline/driver.ts:78`
- **[[c6]]** `code` `src/workflow/review-pipeline/adapters/code-review-chunk.ts:139`
- **[[c7]]** `code` `src/workflow/review-pipeline/adapters/code-review-gather.ts:157`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 5 hold** · template `design-issue` · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-25T10:22:35.573Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._

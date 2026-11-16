<!-- insrc:artifact LLD-dae67bfc7da310cc-s1 -->

# LLD: STORY-dae67bfc7da310cc-s1 — Remove design and code review implementations while retaining unavailable endpoints

## Summary

**Epic:** `remove-design-code-review-implementations-while`
**HLD base run:** `wf-1794835125681-aqgphg`
**HLD effective hash:** `810021dce1a3...`

Remove executable automated design-review and code-review functionality and its gate requirements, retaining public endpoints that raise clear being-rewritten exceptions. Human artifact approval, integrity/team/signoff checks, build validation, task accounting and historical artifact viewing remain. Delete review-only engines, services, workers, preparation, checkpoints, publication, cleanup, activation, prompts and obsolete implementation tests; preserve shared daemon infrastructure.

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

**Surface level:** public

### 2.1 `insrc_review_step`

```typescript
insrc_review_step(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing src/mcp/design-review/schema.ts input schema and all currently accepted phases remain. Unknown denotes the raw transport boundary, not an unvalidated success path.

**Returns:** `Promise<never>` — No successful review response; existing MCP transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Design review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.2 `insrc_code_review_step`

```typescript
insrc_code_review_step(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing src/mcp/code-review/schema.ts input schema and all currently accepted phases remain. Unknown denotes the raw transport boundary, not an unvalidated success path.

**Returns:** `Promise<never>` — No successful review response; existing MCP transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Code review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.3 `designReview.start`

```typescript
designReview.start(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Design review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.4 `designReview.cancel`

```typescript
designReview.cancel(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Design review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.5 `designReview.progress`

```typescript
designReview.progress(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Design review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.6 `designReview.assignment`

```typescript
designReview.assignment(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Design review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.7 `designReview.plan`

```typescript
designReview.plan(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Design review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.8 `designReview.impact`

```typescript
designReview.impact(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Design review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.9 `designReview.activity`

```typescript
designReview.activity(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Design review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.10 `designReview.result`

```typescript
designReview.result(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Design review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.11 `designReview.recover`

```typescript
designReview.recover(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Design review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.12 `designReview.failure`

```typescript
designReview.failure(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Design review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.13 `codeReview.task.cleanup`

```typescript
codeReview.task.cleanup(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Code review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.14 `codeReview.task.cancel`

```typescript
codeReview.task.cancel(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Code review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.15 `codeReview.task.progress`

```typescript
codeReview.task.progress(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Code review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.16 `codeReview.task.publish`

```typescript
codeReview.task.publish(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Code review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.17 `codeReview.task.start`

```typescript
codeReview.task.start(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Code review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.18 `codeReview.task.activity`

```typescript
codeReview.task.activity(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Code review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.19 `codeReview.task.assignment`

```typescript
codeReview.task.assignment(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Code review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.20 `codeReview.task.scope`

```typescript
codeReview.task.scope(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Code review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.21 `codeReview.task.result`

```typescript
codeReview.task.result(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Code review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.22 `codeReview.grounding`

```typescript
codeReview.grounding(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Code review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.23 `codeReview.freshness`

```typescript
codeReview.freshness(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Code review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.24 `codeReview.run`

```typescript
codeReview.run(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Code review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.25 `workflow.review`

```typescript
workflow.review(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Design review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.26 `workflow.reviewArtifact`

```typescript
workflow.reviewArtifact(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Design review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

### 2.27 `workflow.resolveFinding`

```typescript
workflow.resolveFinding(params: unknown): Promise<never>
```

**Parameters:**
- `params: unknown` — Existing raw RPC parameters. Preserve dispatch identity; the unavailable handler does not parse review-specific fields.

**Returns:** `Promise<never>` — No successful review response; existing IPC transport conveys the exception through its ordinary error channel. No acknowledgement or polling token.

**Errors:**
- `Error` when Every call reaching the handler raises exactly 'Design review functionality is being rewritten.'; ordinary MCP schema validation may reject malformed input before dispatch.

**Preconditions:**
- No repo resolution, provider access or review-specific IO is required to report unavailability.

**Postconditions:**
- No worker/process/context/attempt/checkpoint/history/cleanup/progress state is created or changed.
- MCP converts the exception once to a non-retryable error envelope without allocating a persistent review connection; IPC preserves ordinary unary/stream error handling.

## 3. Data model changes

### 3.1 `Review runtime ownership and endpoint routing` — invariant-change

Exactly 27 public operations (2 MCP tools and 25 IPC methods) delegate to one stateless error helper: many endpoints to one helper, zero review-state/worker ownership. Preserve MCP schemas by extracting them from runtime contracts into dependency-free endpoint-schema modules as needed. workflow.reviewDecision (human approve/reject/feedback), team ownership/signoff endpoints and generic pending/artifact/comment views remain active without invoking automated review or cleanup. The explicit API list and relationship prose fully specify this stateless error flow; no ERD, sequence/component companion or UX mock is needed.

**Call sites:**
- `src/daemon/handler-runtime.ts`
- `src/mcp/design-review/handler.ts`
- `src/mcp/code-review/handler.ts`
- `src/workflow/review-decision.ts`

### 3.2 `Workflow approval and completion` — invariant-change

Remove automated-review verdict, author-party, freshness and current-review requirements from artifact approval, lifecycle approval fencing and Story completion. Remove storyCodeReview-dependent blocking/diagnostic/completion-outcome paths instead of returning fake clean evidence. Preserve human artifact approval, log/content integrity, team authorization/signoff, upstream approvals, validated BUILD and current task accounting. Future artifacts require no review override. Historical override fields remain readable; preserve task-accounting override semantics separately, and never rewrite historical verdicts. New completion certifies remaining human/build/task gates, never that automated review ran.

**Call sites:**
- `src/workflow/gates.ts`
- `src/workflow/artifact-core/completion-evidence.ts`
- `src/workflow/artifact-core/lifecycle.ts`
- `src/workflow/artifact-core/lifecycle-service.ts`

### 3.3 `Shared daemon and historical infrastructure` — invariant-change

Delete ProductionReviews and dedicated review worker/native-host/preparation/resource/cleanup/request-owner/activation execution, live review progress producers and review-specific settings/guidance. Preserve shared ThreadServices, router/hub/step state, process broker/provider execution, generic task-progress validators/store and normal index/analyze/workflow workers. The reviewServices variable also backs ordinary threads: remove only review hooks or rename it, never delete the shared instance. Preserve historical artifacts/checkpoints as inert files and dependency-free schemas/readers/renderers used by generic artifact views; extract them out of execution modules if necessary. Do not remove shared packages or files solely because their name contains review.

**Call sites:**
- `src/daemon/index.ts`
- `src/daemon/threads/main-services.ts`
- `src/daemon/threads/router.ts`
- `src/daemon/threads/status-board.ts`
- `src/daemon/task-progress/review-measurements.ts`

## 4. Error paths

**Error cases**

- **Any automated design/code review endpoint is invoked** (terminal)
  - Detection: A retained MCP tool or unary/stream IPC method is dispatched.
  - Response: Throw built-in Error with the exact family-specific being-rewritten message. Existing transport maps it once to its ordinary non-retryable error response. Return no success, attempt token, progress acknowledgement or synthetic verdict; do no review-specific IO.
  - User impact: The operation reports unavailable immediately; clients do not enter a polling/retry loop.
- **Ordinary human artifact approval or BUILD completion follows removal** (recoverable)
  - Detection: The existing approval/lifecycle operation runs its remaining guards.
  - Response: Do not consult automated-review evidence or call review cleanup. Enforce human approval, integrity/team/signoff/upstream/build/task checks normally. Missing review cannot block and is never rewritten as clean.
  - User impact: Workflow remains usable with human approval and existing non-review validation.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Any old review-id/resume/progress/cancel/cleanup/publish request | Same rewritten exception without reading or mutating saved review/checkpoint files. |
| Malformed input | Existing MCP structural validation may reject before dispatch; otherwise handler returns the rewritten exception without review validation. |
| Human workflow.reviewDecision approve/reject/feedback | Human decision remains functional; it must never invoke automated review, unavailable endpoint or cleanup. |
| History artifact reads and old override/review metadata | Remain readable via generic views; no schema/version/content rewrites and no runtime recovery. |
| Normal daemon workers and task-progress subscriptions | Shared services remain functional; no review producers/workers are registered. Historical review task rows are inert, not deleted or announced as running. |
| Already-running installed review daemon | Source changes do not magically stop old installed processes. Do not restart/deploy automatically; coordinate installation/restart separately. No promise of remote cancellation from a new unavailable endpoint. |

**Invariants to preserve**

- Preserve callable endpoint input schemas and ordinary transport error behavior; exact endpoint inventory is in contractDetails.api. [[c2]]
- Preserve human approvals, integrity/team/signoff/build/task guards and shared daemon services; remove only automated-review dependencies. [[c3]]
- Preserve immutable historical artifact data and generic read compatibility without importing executable review modules. [[c4]]

## 5. Test strategy

**Test framework:** `Node.js node:test via tsx; existing *.test.ts conventions`

**Test levels**

- **contract** — Verify the exact frozen inventory of 2 MCP and 25 IPC review endpoints and the existing MCP input schemas; exercise every accepted phase and valid request through production registration.
  - Subjects: `All contractDetails.api entries`, `Unary and stream error propagation`, `MCP error-envelope mapping`
  - Fixtures: `Pre-change endpoint/schema snapshot`, `Valid requests for every preserved phase; malformed transport requests`
- **integration** — Prove review calls cause no repo lookup, provider call, worker/native process, preparation/cache/checkpoint/history/cleanup mutation or task-progress creation; repeated failures do not retain MCP connections.
  - Subjects: `MCP handlers`, `Daemon handler maps and step host`, `Daemon startup/shutdown and router/hub review hooks`
  - Fixtures: `Fail-on-call IO/provider/spawn/cleanup seams`, `Temporary artifact/checkpoint tree and hashes`
- **integration** — Prove human approvals and Story/Epic rollup work without CR records, and unrelated guards still reject invalid work.
  - Subjects: `Human workflow.reviewDecision`, `Workflow approval and lifecycle completion`, `Missing/failed BUILD and incomplete/stale task sets`, `Integrity/team/signoff/upstream approval denials`, `Generic historical review rendering`, `Normal indexing/analyze/workflow workers and task progress`
  - Fixtures: `No-review approved/failed BUILD examples`, `Pending human decision and signoff examples`, `Representative historical review schema versions`
- **smoke** — Prove deleted implementation is absent from clean production/package output and current clients display the unavailable error without polling.
  - Subjects: `npm run build and scripts/clean-output.mjs`, `Import/transitive dependency and obsolete prompt/config audit`, `VS Code and JetBrains contract/error handling checks`
  - Fixtures: `Plant a stale review output file, run clean build and assert removal`, `Existing client error fixtures`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Exact 27-operation inventory/schema comparison and all accepted phases return exact family errors` |
| `ac2` | `Fail-on-call side-effect seams; no runtime imports/workers; repeated MCP failures retain no review connections; no deleted runtime files in package output` |
| `ac3` | `Human approvals/completion work without CR; non-review guards still reject invalid work; historical hashes/serialization remain unchanged` |

## 6. Migration

**State before:** s1.analyzeBundles[0] provides broad review boundaries; s1.analyzeBundles[1] and direct code references enumerate 27 public operations, shared ThreadServices and review-dependent approval/completion/cleanup. Existing partial stubs coexist with active current engines. Stored graph coverage is incomplete and is supplemented by source/import checks.

**State after:** All 27 review operations retain names/callable schemas and report family-specific rewritten exceptions. Automated review execution, gates and live progress producers are removed. Human approval, build/task validation, integrity/team/signoff and unrelated workers remain active. Historical data is retained without running review logic.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Freeze the exact endpoint/schema inventory, historical fixture hashes and workspace baseline. Review clean and mixed modules by responsibility, not filename. — ↩ rollbackable
2. Replace preserved operations with stateless rewritten errors, remove MCP persistent connection ownership and detach review-only daemon startup/shutdown/router/progress hooks. Preserve shared ThreadServices and ordinary worker services. — ↩ rollbackable
3. Remove automated-review gate/fence/evidence/cleanup requirements from human artifact approval and Story/Epic completion, preserving every non-review integrity/team/signoff/build/task/upstream check and historical metadata. — ↩ rollbackable
4. Delete review runtime/preparation/checkpoint/publication/cleanup/activation code and obsolete implementation tests/prompts/config. Extract only dependency-free endpoint schemas and generic historical readers. Update operational guidance to human approval without automated-review requirements. — ↩ rollbackable
5. Run endpoint, side-effect, completion, historical-read and unrelated-worker checks plus clean production build/package inspection and current IDE error contracts. Do not install/restart the daemon as part of source changes; deployment needs separate coordination for old active processes. — ↩ rollbackable

**Backward compat:** Public operation names and callable input schemas remain; successful review behavior is intentionally replaced with Error('Design review functionality is being rewritten.') or Error('Code review functionality is being rewritten.'). Human artifact approval remains explicit and works without CR or review-override reasons; no historical review is rewritten or new review pass fabricated. Generic artifact views and historical wire data remain readable. Source-only review cleanup never runs. Existing installed daemons keep their old behavior until a coordinated update/restart. Rollback restores code without rewriting data. Clean output is verified so deleted sources cannot survive as stale shipped JS.

## 7. Alternatives considered

### 7.1 a1: Direct endpoint tombstones — **CHOSEN**

Retain the registered endpoints and minimal contract types; delete implementation and wire every review operation directly to a throwing helper.

Preserve public endpoint names and input schemas, route each directly to a stateless rewritten Error, and delete automated review execution and automated-review gate dependencies. Preserve human approval, integrity/team/signoff/build/task guards, generic historical reads and shared daemon infrastructure. No review success or override is synthesized.

### 7.2 a2: Dedicated unavailable review adapter

Delete implementation and route all preserved endpoints through a new adapter exposing the former service interface.

Delete engines/workers but keep a dedicated unavailable service implementing old review methods. Remove automated-review gate requirements while preserving human approval and shared infrastructure. Retain public contracts and historical records.

**Rejected because:** Retains unnecessary service abstraction after functionality removal.

## 8. References

- **[[c1]]** `code` `src/workflow/review-unavailable.ts`
- **[[c2]]** `code` `src/daemon/handler-runtime.ts:549-727`
- **[[c3]]** `code` `src/workflow/gates.ts:640-729`
- **[[c4]]** `code` `src/workflow/code-review/task-review/record.ts`
- **[[c5]]** `code` `src/workflow/artifact-core/lifecycle.ts:383-405`
- **[[c6]]** `code` `src/workflow/artifact-core/lifecycle-service.ts`
- **[[c7]]** `code` `src/workflow/artifact-core/completion-evidence.ts:78-96`
- **[[c8]]** `code` `src/daemon/index.ts:274-281`
- **[[c9]]** `code` `src/daemon/threads/main-services.ts:168-184`
- **[[c10]]** `code` `src/mcp/design-review/schema.ts`
- **[[c11]]** `code` `src/mcp/code-review/schema.ts`
- **[[c12]]** `code` `src/mcp/design-review/handler.ts`
- **[[c13]]** `code` `src/mcp/code-review/handler.ts`
- **[[c14]]** `code` `src/workflow/review-decision.ts`
- **[[c15]]** `code` `scripts/clean-output.mjs`
- **[[c16]]** `stakeholder` `User instruction, 2026-11-16: completely remove design/code review functionality, retaining endpoints that raise a being-rewritten exception; follow-up explicitly requests self-review because the review framework is broken.`
- **[[c17]]** `step-output` `s8` — "Author self-review only, not independent review. Source inventory verifies 25 IPC operations plus 2 MCP tools; preserve distinct human approval and shared daemon infrastructure."

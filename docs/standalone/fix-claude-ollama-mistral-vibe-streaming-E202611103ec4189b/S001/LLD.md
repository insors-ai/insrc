<!-- insrc:artifact LLD-3ec4189b758be646-s1 -->

# LLD: STORY-3ec4189b758be646-s1 — Fix Claude on Ollama and Mistral Vibe streaming reviews

## Summary

**Epic:** `fix-claude-ollama-mistral-vibe-streaming`
**HLD base run:** `wf-1794331973678-kkqo4t`
**HLD effective hash:** `3ec4189b758b...`

This story fixes the activity-mode (streaming) review path in the CLI provider in two halves. First, CliProvider.activityReview now runs the same Ollama preflight (checkOllama) and per-child environment (withOllama) as the bounded claude path, passing the result as env to runInProcessGroup — an Ollama-targeted review child is bound to the Ollama endpoint with vendor login stripped, and a rejected preflight spawns nothing. Second, a vibe branch drives the existing ReviewActivityStream lifecycle from the Vibe app-server transport, and the shared cloud model catalog gains the versioned Mistral Large 4 entry with only runtime-verified efforts, so explicit model/effort selection still fails before dispatch when unsupported.

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

**Surface level:** undefined

### 2.1 `CliProvider.activityReview`

```typescript
private async activityReview<T>(prompt: string, schema: StructuredSchema, opts: ActivityReviewSessionOpts): Promise<T> — now with, at the top: await this.checkOllama(); const childEnv = this.withOllama(process.env) ?? undefined; and the vibe guard replaced by a vibe branch
```

**Parameters:**
- `prompt: string` — Review assignment prompt fed as stdin / session input
- `schema: StructuredSchema` — Structured output schema validated via onCandidate / validateNativeReply
- `opts: ActivityReviewSessionOpts` — ActivityReviewSessionOpts: cwd, signal, inactivityMs, onActivity, onCandidate, codeTaskCommands

**Returns:** `Promise<T>` — The accepted structured review output matching schema

**Errors:**
- `OllamaTargetError — thrown before any child process is spawned; propagates un-retried through runReviewSession:601` when this.ollama is set and checkOllamaTarget fails (unreachable / model unavailable / not signed in / account unavailable)
- `VibeSelectionError — thrown before dispatch` when this.kind === 'vibe' and the model/effort is not in the catalog or not verified by the installed Vibe runtime
- `ReviewOutputFailureError via parser.failure('spawn_failed'|'cli_exit', ...) with diagnostic snapshot` when child spawn fails or exits non-zero
- `ReviewOutputFailureError via parser.failure('no_valid_final', ...)` when no accepted/final structured result

**Preconditions:**
- opts.mode === 'activity'; validateReviewSessionOptions(opts) passed
- provider admits connection execution (assertConnectionProviderAdmission)

**Postconditions:**
- For ollama-targeted providers the child env contains ANTHROPIC_BASE_URL/ANTHROPIC_AUTH_TOKEN from this.ollama, ANTHROPIC_API_KEY='', and none of CLAUDE_CODE_OAUTH_TOKEN / CLAUDE_CODE_USE_BEDROCK / CLAUDE_CODE_USE_VERTEX
- The child is never spawned when preflight rejected
- ReviewActivityStream lifecycle (start/feed/failure/result/completed), activity events, cancellation and structured validation behave exactly as today for claude/codex; vibe uses the same lifecycle via the Vibe transport

### 2.2 `runInProcessGroup (activity mode) call site in activityReview`

```typescript
runInProcessGroup(command, args, { mode:'activity', cwd:opts.cwd, stdin:prompt, signal, onStdoutChunk, ...(childEnv ? { env: childEnv } : {}) })
```

**Parameters:**
- `command: string` — resolveBin(this.binPath)
- `args: readonly string[]` — claudeReviewSessionArgs + stream-json/--verbose/--include-partial-messages, or codexReviewSessionArgs, or vibe activity args
- `opts: ProcessGroupOpts & { env?: NodeJS.ProcessEnv }` — mode:'activity', cwd, stdin:prompt, signal, onStdoutChunk; PLUS env: childEnv when the provider has an Ollama target

**Returns:** `Promise<ProcessGroupResult>` — ProcessGroupResult { spawnError?, exitCode, stderr, aborted, durationMs }

**Errors:**
- `abortError() when result.aborted` when spawn kills the process group on timeout/abort
- `parser.failure('spawn_failed'|'cli_exit', 'Review activity CLI failed', exitCode, detail)` when runInProcessGroup reports spawnError or exitCode!==0

**Preconditions:**
- checkOllama() already passed for ollama-targeted providers

**Postconditions:**
- process-group.ts:136 spreads opts.env over the daemon env when set, so the Ollama env reaches the child; when unset behavior is unchanged

### 2.3 `ReviewActivityStream (kind 'vibe')`

```typescript
new ReviewActivityStream<T>('vibe', schema, opts, () => acceptedStop.abort())
```

**Parameters:**
- `kind: string` — 'claude' | 'codex' | 'vibe' frame decoder selection
- `schema: StructuredSchema` — structured output contract
- `opts: ActivityReviewSessionOpts` — activity opts incl. onActivity/onCandidate
- `abort: () => void` — acceptedStop abort callback

**Returns:** `ReviewActivityStream<T>` — Same lifecycle as claude/codex: start/feed/failure/result/completed over Vibe app-server frames

**Errors:**
- `removed — vibe now runs through startVibeActivitySession / the Vibe app-server transport feeding ReviewActivityStream kind 'vibe'` when kind 'vibe' previously threw 'review activity is not supported for the vibe CLI'

**Preconditions:**
- model present in cli-vibe catalog and verified by the installed Vibe runtime (vibe-session.ts:384-404)

**Postconditions:**
- Vibe session is read-only like the bounded vibe path (--enabled-tools read_file + mcp_insrc_* equivalent policy on the app-server side); structured feedback validated through the same onCandidate path; activity events emitted via onActivity; cancellation honored via the shared signal; checkpoint resume semantics unchanged (coordinator-side)

## 3. Data model changes

### 3.1 `activity-mode child process environment` — field-add

ProcessGroupOpts gains an explicit env passthrough at the activityReview call site: env = this.withOllama(process.env) when this.ollama is set (ANTHROPIC_BASE_URL=this.ollama.host, ANTHROPIC_AUTH_TOKEN='ollama', ANTHROPIC_API_KEY='', vendor login keys removed — see src/agent/providers/cli-provider.ts:803-811). src/shared/process-group.ts:68,136 already supports opts.env; only the activity call site starts passing it.

```
ProcessGroupOpts.env?: NodeJS.ProcessEnv — already declared (src/shared/process-group.ts:68); now populated for activity spawns of Ollama-targeted providers
```

**Call sites:**
- `src/agent/providers/cli-provider.ts:610`
- `src/agent/providers/cli-provider.ts:627`
- `src/workflow/review/design-review/coordinator.ts:379`
- `src/workflow/code-review/task-review/coordinator.ts:223`

### 3.2 `cloud-model-catalog.json cli-vibe family models[]` — field-add

cli-vibe catalog family gains a versioned Mistral Large 4 model entry (id matching the versioned name Mistral documents, e.g. mistral-large-4, with displayName 'Mistral Large 4') whose efforts array lists ONLY efforts verified present in the installed Vibe runtime's thinkingLevels for that model. Explicit selection of an uncatalogued model or unverified effort still throws VibeSelectionError before any turn (vibe-session.ts:385, :403-404).

```
models[] += { id: 'mistral-large-4', displayName: 'Mistral Large 4', efforts: [<verified only>] } — validated by model-catalog.ts cliKind check
```

**Call sites:**
- `src/agent/providers/cli-provider.ts:611`
- `src/shared/vibe-session.ts:384`
- `src/shared/vibe-session.ts:403`

### 3.3 `ReviewActivityStream kind + vibe frame mapping` — field-modify

ReviewActivityStream.kind widened from 'claude'|'codex' to include 'vibe'; the decode() frame handling gains a vibe branch that maps Vibe app-server frames onto the same tool_started/tool_completed/result/feedback events, so failure() NATIVE_CLI_FAILURE diagnostics, accepted-result and completed() semantics are identical across kinds.

```
kind: 'claude' | 'codex' | 'vibe'
```

**Call sites:**
- `src/agent/providers/review-activity-stream.ts:14`
- `src/agent/providers/cli-provider.ts:615`

### 3.4 `ReviewDiagnosticCollector.provider / ReviewDiagnosticSnapshot.provider` — field-modify

ReviewActivityStream's constructor already does `this.diagnostics = new ReviewDiagnosticCollector(kind)` with the same `kind` it widens to 'vibe'; ReviewDiagnosticCollector's constructor parameter and ReviewDiagnosticSnapshot.provider are currently hard-typed 'claude' | 'codex' and must widen in lockstep, or the vibe branch does not type-check and invariant c3 (NATIVE_CLI_FAILURE diagnostics identical for all kinds including vibe) cannot hold. Found during the LLD self-review's round 2 (CliProvider.kind is already CliKind = 'claude'|'codex'|'vibe' at cli-provider.ts:89,169,229, so this.kind flowing into both constructors forces the widening).

```
provider: 'claude' | 'codex' | 'vibe' (both the constructor parameter and the ReviewDiagnosticSnapshot.provider field)
```

**Call sites:**
- `src/shared/review-diagnostics.ts:9`
- `src/shared/review-diagnostics.ts:33`
- `src/shared/review-diagnostics.ts:35`
- `src/agent/providers/review-activity-stream.ts:28`

## 4. Error paths

**Error cases**

- **Ollama-targeted provider (ollama-claude) but the Ollama server is unreachable, the model is missing, or the account is not signed in** (recoverable)
  - Detection: checkOllamaTarget (src/agent/providers/ollama-target.ts:51) fails its reachable/model-present/signed-in probes; checkOllama (cli-provider.ts:813) catches, logs cause, and rethrows OllamaTargetError
  - Response: activityReview awaits this.checkOllama() first and lets OllamaTargetError propagate before any spawn; runReviewSession rethrows it un-retried; the review unit pauses with a resumable checkpoint and the diagnostic carries the OllamaTargetError cause so the backend response is no longer lost
  - User impact: Review planning pauses with a precise preflight cause instead of a generic NATIVE_CLI_FAILURE after 1 dispatch + 3 retries; no child process is ever spawned into the wrong backend
- **Activity child crashes or exits non-zero (e.g. wrong endpoint because env was missing — the pre-fix behavior)** (recoverable)
  - Detection: runInProcessGroup returns spawnError or exitCode !== 0; stderr is filtered to bounded Error/Fatal/... lines
  - Response: parser.failure('spawn_failed'|'cli_exit', 'Review activity CLI failed', exitCode, detail) — detail now includes the real stderr error line in the diagnostic, not only the generic NATIVE_CLI_FAILURE
  - User impact: Checkpoint diagnostic names the actual backend error, so the failure is debuggable and the daemon retry policy sees the real class
- **No valid structured final answer within the activity session** (recoverable)
  - Detection: parser.result() not accepted and parser.completed() throws; or acceptedStop aborted
  - Response: parser.failure('no_valid_final', ...) or abortError(); coordinator records the unit as failed and the checkpoint stays resumable — unchanged from today
  - User impact: Same as today: bounded retry budget in the coordinator, resumable checkpoint
- **cli-vibe tier configured with a model/effort the installed Vibe runtime does not verify (including the previously-missing versioned Large 4)** (terminal)
  - Detection: vibe-session.ts:384-404: explicit model absent from catalog or active runtime model/thinkingLevels mismatch throws VibeSelectionError
  - Response: Vibe activity branch resolves the model via the same catalog+runtime verification BEFORE starting the Vibe app server; unsupported model/effort fails before dispatch and no Vibe turn starts
  - User impact: Configuration error surfaces immediately at session start with the exact model/effort named, instead of a mid-review rejection
- **Review cancelled mid-activity (controller disconnect, inactivity timeout, user cancel)** (recoverable)
  - Detection: signal aborted (coordinator cancellation) → runInProcessGroup / Vibe transport abort → result.aborted
  - Response: throw abortError(); acceptedStop wiring unchanged; checkpoint resumable for a later attempt
  - User impact: Unchanged: cancellation is immediate and the checkpoint resumes cleanly

**Edge cases**

| Input | Expected |
| :--- | :--- |
| provider without an Ollama target (plain cli-claude / cli-codex) running an activity review | childEnv is undefined and runInProcessGroup is called without env — byte-identical to today's behavior (src/shared/process-group.ts:136 spreads only when set) |
| ollama-claude activity review while the daemon env holds a vendor login token | withOllama output still deletes CLAUDE_CODE_OAUTH_TOKEN / CLAUDE_CODE_USE_BEDROCK / CLAUDE_CODE_USE_VERTEX even if the daemon env carries them; ANTHROPIC_API_KEY is blanked, not inherited |
| ollama-claude activity review with the Ollama server unreachable or the model missing | checkOllama() runs BEFORE args are built and before parser.start(); a rejected check throws OllamaTargetError and no parser/pgroup exists yet; runReviewSession rethrows it without the transient retry |
| core/mid tier set to cli-vibe with mistral-large-4 but an effort the runtime does not list | vibe branch validates model against the cli-vibe catalog and the installed runtime's thinkingLevels (src/shared/vibe-session.ts:384-404) before the Vibe app server starts; VibeSelectionError precedes any dispatch |
| activity child fails after spawn (cli_exit / spawn_failed) | diagnostic snapshot records the real backend detail (stderr error line / OllamaTargetError cause) alongside or instead of the bare NATIVE_CLI_FAILURE generic, so the checkpoint no longer loses the backend response |

**Invariants to preserve**

- Bounded review path semantics are untouched: runReviewSession's bounded branch, retry-once-on-stall, OllamaTargetError passthrough, and VibeTurnError dispatchState handling stay exactly as they are — the fix only adds preflight+env to the activity branch. [[c1]]
- Claude/codex activity arg construction is verbatim: claudeReviewSessionArgs + stream-json/--verbose/--include-partial-messages mapping and codexReviewSessionArgs tmp-schema flow are unchanged; only opts.env is added to the runInProcessGroup call. [[c2]]
- ReviewActivityStream lifecycle contract (start/feed/failure/result/completed, tool start/complete tracking with the 128-tool cap, NATIVE_CLI_FAILURE diagnostic on failure, HOST_VALIDATION_ERROR on host rejection) is identical for all kinds including vibe — src/agent/providers/review-activity-stream.ts:31-145. [[c3]]
- Read-only review tool policy holds for vibe activity exactly as for bounded vibe: the bounded path passes --enabled-tools read_file + mcp_insrc_*; the vibe activity branch must expose the same read-only + insrc MCP tools and no write/execute tools. [[c4]]
- Catalog validation discipline: model-catalog.ts still validates cliKind and family shape, and vibe-session still refuses uncatalogued explicit models and unverified active models — the new Large 4 entry only widens what is selectable, never weakens verification. [[c5]]

## 5. Test strategy

**Test framework:** `node:test via `npx tsx --test` (repo convention; Node 22 via PATH=/opt/homebrew/opt/node@22/bin:$PATH for src/ suites), colocated __tests__ beside the touched files: src/agent/providers/__tests__/cli-provider*.test.ts, src/agent/providers/__tests__/review-activity-stream.test.ts, src/shared/__tests__/vibe-session.test.ts, src/daemon/__tests__/model-catalog.test.ts`

**Test levels**

- **unit** — Prove each fix-intent bullet at the provider/stream/catalog level: env contents, no-spawn-after-rejection, vendor stripping, vibe frame decoding, catalog verification, and unchanged claude/codex behavior
  - Subjects: `CliProvider.activityReview (src/agent/providers/cli-provider.ts:610)`, `withOllama / checkOllama reuse (src/agent/providers/cli-provider.ts:803-811)`, `runInProcessGroup env passthrough (src/shared/process-group.ts:68-136)`, `ReviewActivityStream kind 'vibe' decode path (src/agent/providers/review-activity-stream.ts)`, `vibe-session catalog+runtime verification (src/shared/vibe-session.ts:384-404)`, `model-catalog validation of the new cli-vibe entry (src/daemon/model-catalog.ts)`, `cloud-model-catalog.json cli-vibe family schema`
  - Fixtures: `stub ollamaCheck that resolves or throws OllamaTargetError`, `fake CLI binary / injected runInProcessGroup seam capturing opts.env`, `fake Vibe app-server transport emitting canned frames`, `catalog fixture with the new mistral-large-4 entry + runtime model list with thinkingLevels`
- **integration** — Exercise both provider paths through the real review dispatch: design-review coordinator mode:'activity' call with an ollama-claude provider and with a cli-vibe provider, asserting the spawned child received the expected env (via a fake binary that records its env) and that an unsupported vibe model/effort fails before any Vibe session starts
  - Subjects: `src/workflow/review/design-review/coordinator.ts:379`, `src/workflow/code-review/task-review/coordinator.ts:223`
- **live** — Manual/live verification only (INSRC_LIVE_TESTS-style, not run in CI): an actual independent review with core tier ollama-claude glm-5.3:cloud high effort completes planning without NATIVE_CLI_FAILURE, and a cli-vibe core/mid config with mistral-large-4 runs an activity review and reads back the native session model/effort
  - Subjects: `real Ollama cloud endpoint + real installed Vibe runtime`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `T1-ollama-activity-child-env`, `T2-ollama-activity-no-vendor-inherit`, `T3-ollama-activity-preflight-rejects-before-spawn` |
| `ac2` | `T4-plain-provider-activity-env-unchanged`, `T5-claude-codex-activity-args-unchanged` |
| `ac3` | `T6-vibe-activity-stream-lifecycle`, `T7-vibe-activity-readonly-tool-policy`, `T8-vibe-activity-structured-validation-cancellation` |
| `ac4` | `T9-catalog-large4-entry-verified-efforts`, `T10-vibe-session-readback-core-mid`, `T11-unsupported-model-effort-fails-before-dispatch` |
| `ac5` | `T12-failure-diagnostic-carries-backend-detail` |

## 6. Migration

**State before:** Activity-mode (streaming) review for an ollama-claude core tier spawns the Claude CLI with the daemon's env — no ANTHROPIC_BASE_URL/ANTHROPIC_AUTH_TOKEN pointing at Ollama, vendor login possibly present — and planning ends NATIVE_CLI_FAILURE after initial dispatch + 3 retries with only a generic checkpoint diagnostic (s1 bundle c1). The cli-vibe family in src/assets/models/cloud-model-catalog.json has no versioned mistral-large-4 entry, so explicit selection is refused, and activityReview rejects vibe outright (src/agent/providers/cli-provider.ts:611).

**State after:** Activity-mode review children of Ollama-targeted providers are preflighted (checkOllama) and spawned with the Ollama endpoint/auth env and vendor login stripped (withOllama via runInProcessGroup opts.env); a failed preflight never spawns a child. Vibe gets a streaming activity branch on the same ReviewActivityStream lifecycle with read-only tool policy. The cli-vibe catalog includes the versioned Mistral Large 4 entry with only runtime-verified efforts; unsupported model/effort still throws VibeSelectionError before dispatch.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. No data migration — bugfix, not enhancement. stateBefore (s1 bundle c1): activity-mode review children of ollama-claude providers inherit the daemon env with no Ollama endpoint and possibly a vendor login, and cli-vibe selectable models exclude the versioned Mistral Large 4. stateAfter: activity children run checkOllama preflight first and receive withOllama env via runInProcessGroup opts.env; a vibe activity branch drives ReviewActivityStream kind 'vibe'; the catalog carries mistral-large-4 with verified efforts only. — ↩ rollbackable

**Backward compat:** Fully backward compatible: no persisted artifact schema changes, no IPC shape changes. The activityReview signature is unchanged (private method); runInProcessGroup's opts.env already existed and is only populated when the provider has an Ollama target. The catalog change is additive (one new model entry in the cli-vibe family) and validated by the existing model-catalog checks; configs that do not name mistral-large-4 behave identically. Rolling back = revert the code commit and remove the catalog entry; no data rewrite.

## 7. Alternatives considered

### 7.1 a1: Unified activity spawn with provider preflight/env (in-provider fix) — **CHOSEN**

Move Ollama preflight + per-child env inside activityReview for all CLI kinds, add a Vibe activity branch reusing ReviewActivityStream, and add the versioned Large 4 catalog entry.

In CliProvider.activityReview, run the same checkOllama() preflight before building args (so a failed check starts no process) and compute env = this.withOllama(process.env) when this.ollama is set, passing it as opts.env to runInProcessGroup; leave the vibe rejection removed only as far as needed for alternative a3/a4. For the Vibe half, add a vibe branch that drives ReviewActivityStream with kind 'vibe' from the Vibe app-server transport instead of runInProcessGroup, reusing the bounded vibe tool policy. One shared private helper spawnActivityReview(args, env, parser) keeps claude/codex/vibe on the same preflight+env path.

### 7.2 a2: Caller-supplied env/opts plumbing

Push Ollama env responsibility up to the review coordinators via new opts fields.

Extend ReviewSessionOpts (types.ts:250) with optional ollama target/env fields and have both coordinators (design-review/coordinator.ts:379, task-review/coordinator.ts:223) resolve the Ollama env from provider config and pass it; runInProcessGroup already accepts env. Vibe activity would still need a provider-side branch.

**Rejected because:** Moves the fix to callers and leaves it insecure-by-default; the Ollama knowledge (host, token, vendor keys) would be duplicated in coordinators.

### 7.3 a3: Shared prepare-helper + vibe frame adapter

Split the fix into a spawn-prep helper plus a separate Vibe frame adapter module.

Keep activityReview claude/codex-only but wrap runInProcessGroup's spawn in a shared 'prepareActivityChild' that applies preflight+env for any kind including vibe, and add a thin VibeActivityStream adapter that normalizes Vibe app-server frames into the ReviewActivityStream decoder interface.

**Rejected because:** Functionally equivalent to a1 but with an extra abstraction layer with no second consumer.

### 7.4 a4: Ollama-env fix only, defer Vibe

Ship only the activity-child env/preflight fix; catalog entry added, Vibe activity deferred.

Only fix the Ollama env gap in activityReview (claude/codex) and defer Vibe streaming review to a follow-up story; add the catalog entry now so explicit selection is at least resolvable.

**Rejected because:** Cheapest but rejects the approved fix intent; Vibe streaming review would still be impossible.

## 8. References

- **[[c1]]** `code` `src/agent/providers/cli-provider.ts:567-634`
- **[[c2]]** `code` `src/agent/providers/review-activity-stream.ts:14-145`
- **[[c3]]** `code` `src/shared/vibe-session.ts:384-404`
- **[[c4]]** `code` `src/shared/process-group.ts:68-136`
- **[[c5]]** `code` `src/daemon/model-catalog.ts`
- **[[c6]]** `code` `src/assets/models/cloud-model-catalog.json`
- **[[c7]]** `code` `src/workflow/review/design-review/coordinator.ts:379`
- **[[c8]]** `code` `src/workflow/code-review/task-review/coordinator.ts:223`
- **[[c9]]** `code` `src/agent/providers/ollama-target.ts:51`
- **[[c10]]** `code` `src/agent/providers/cli-provider.ts:803-828`
- **[[c11]]** `prior-artifact` `.insrc/artifacts/ISSUE-738d62b848fd173f.json`
- **[[c12]]** `doc` `https://docs.mistral.ai/vibe/code/cli/configuration`
- **[[c13]]** `code` `src/shared/review-diagnostics.ts:1-20`

<!-- insrc:artifact PLAN-3ec4189b758be646-s1 -->

# Plan: STORY-3ec4189b758be646-s1

## Summary

**Epic:** `fix-claude-ollama-mistral-vibe-streaming`
**LLD run:** `wf-1794331973678-kkqo4t`
**LLD effective hash:** `3ec4189b758b...`

Building this story fixes the activity-mode (streaming) review path in the CLI provider in two halves. The Ollama half adds the same checkOllama preflight and withOllama per-child env that the bounded claude path already uses, passed through runInProcessGroup's existing opts.env, so an Ollama-targeted review child is bound to the right endpoint with vendor login stripped and a failed preflight spawns nothing. The Vibe half replaces the outright rejection with a vibe branch that starts a runtime-verified Vibe app-server session and feeds its frames into ReviewActivityStream kind 'vibe' under the same read-only tool policy, alongside a lockstep diagnostics type widening and an additive mistral-large-4 catalog entry. Nine ordered tasks cover the provider edit, the stream/diagnostics widening, the vibe branch, the catalog entry, diagnostic detail, and the unit/integration/live test suite.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Ollama preflight + env on the activity-mode spawn path | M | — | — | unit: T1-ollama-activity-child-env; unit: T3-ollama-activity-preflight-rejects-before-spawn; unit: T4-plain-provider-activity-env-unchanged | [[c1]] [[c2]] [[c7]] |
| 2 | **`t2`** Vendor-login stripping + Ollama env contents on activity children | S | — | `t1` | unit: T2-ollama-activity-no-vendor-inherit | [[c1]] [[c2]] [[c7]] |
| 3 | **`t3`** Invariant guard: claude/codex activity args unchanged | S | — | `t1` | unit: T5-claude-codex-activity-args-unchanged | [[c2]] [[c4]] [[c7]] |
| 4 | **`t4`** ReviewActivityStream kind 'vibe' + vibe frame mapping | M | — | — | unit: T6-vibe-activity-stream-lifecycle | [[c3]] [[c5]] [[c8]] |
| 5 | **`t5`** Widen diagnostics provider type in lockstep (LLD §3.4) | S | — | `t4` | unit: T12-failure-diagnostic-carries-backend-detail | [[c3]] [[c5]] [[c8]] [[c9]] |
| 6 | **`t6`** Vibe activity branch in CliProvider.activityReview | L | — | `t4`, `t5` | unit: T7-vibe-activity-readonly-tool-policy; unit: T8-vibe-activity-structured-validation-cancellation; unit: T11-unsupported-model-effort-fails-before-dispatch; integration: T6-vibe-activity-coordinator-dispatch-fake-transport; live: T10-vibe-session-readback-core-mid | [[c3]] [[c4]] [[c5]] [[c7]] [[c8]] [[c11]] |
| 7 | **`t7`** cli-vibe catalog: mistral-large-4 entry with verified efforts | S | — | — | unit: T9-catalog-large4-entry-verified-efforts | [[c5]] [[c6]] [[c10]] [[c11]] |
| 8 | **`t8`** Failure diagnostics carry real backend detail | S | — | `t1`, `t6` | unit: T12-failure-diagnostic-carries-backend-detail; integration: T1-ollama-activity-coordinator-dispatch-env-capture | [[c1]] [[c3]] [[c7]] [[c9]] [[c12]] [[c13]] |
| 9 | **`t9`** Test suite: unit + coordinator integration + live-gated | M | — | `t1`, `t2`, `t3`, `t4`, `t5`, `t6`, `t7`, `t8` | integration: T1-ollama-activity-coordinator-dispatch-env-capture; integration: T6-vibe-activity-coordinator-dispatch-fake-transport; live: T10-vibe-session-readback-core-mid; live: live-ollama-claude-activity-review-completes-planning | [[c6]] [[c7]] [[c8]] [[c9]] [[c10]] [[c11]] [[c12]] [[c13]] |

### 1.1 TASK-3ec4189b758be646-s1-t1 — Ollama preflight + env on the activity-mode spawn path

In CliProvider.activityReview (src/agent/providers/cli-provider.ts:610-627): add `await this.checkOllama()` first, compute `childEnv = this.withOllama(process.env) ?? undefined` when this.ollama is set, and pass `env: childEnv` into the runInProcessGroup activity call. Bounded path (runClaude :826, checkOllama :813, withOllama :803-811) semantics reused verbatim.

**Acceptance checks:**
- activityReview awaits this.checkOllama() at the top, before args are built and before parser.start()
- childEnv = this.withOllama(process.env) computed when this.ollama is set
- runInProcessGroup activity call passes ...(childEnv ? { env: childEnv } : {})
- when childEnv is undefined the call is byte-identical to today (process-group.ts:136 spreads only when set)
- a rejected preflight throws OllamaTargetError before any child spawn; runReviewSession rethrows un-retried

### 1.2 TASK-3ec4189b758be646-s1-t2 — Vendor-login stripping + Ollama env contents on activity children

Verify/lock the withOllama env contract at the activity call site: Ollama endpoint + auth present, ANTHROPIC_API_KEY blanked, vendor login keys stripped regardless of daemon env contents.

**Acceptance checks:**
- withOllama output contains ANTHROPIC_BASE_URL/ANTHROPIC_AUTH_TOKEN from this.ollama, ANTHROPIC_API_KEY=''
- CLAUDE_CODE_OAUTH_TOKEN / CLAUDE_CODE_USE_BEDROCK / CLAUDE_CODE_USE_VERTEX are deleted even when present in the daemon env
- unit test proves both env contents and vendor stripping through the activity call site

### 1.3 TASK-3ec4189b758be646-s1-t3 — Invariant guard: claude/codex activity args unchanged

Regression-guard that claude/codex activity arg construction is byte-identical after the t1 edit (invariant c2 of the LLD): only the runInProcessGroup opts gain env.

**Acceptance checks:**
- claudeReviewSessionArgs + stream-json/--verbose/--include-partial-messages arg construction unchanged
- codexReviewSessionArgs tmp-schema flow unchanged
- no opts/env changes alter args; only opts.env is added

### 1.4 TASK-3ec4189b758be646-s1-t4 — ReviewActivityStream kind 'vibe' + vibe frame mapping

Widen ReviewActivityStream (src/agent/providers/review-activity-stream.ts:14) kind to include 'vibe' and add the vibe frame-decode branch so Vibe app-server frames drive the same lifecycle/events as claude/codex.

**Acceptance checks:**
- ReviewActivityStream kind widened to 'claude'|'codex'|'vibe'
- decode() gains a vibe branch mapping Vibe app-server frames onto tool_started/tool_completed/result/feedback
- start/feed/failure/result/completed lifecycle identical across kinds (LLD invariant c3); 128-tool cap and NATIVE_CLI_FAILURE diagnostic preserved

### 1.5 TASK-3ec4189b758be646-s1-t5 — Widen diagnostics provider type in lockstep (LLD §3.4)

Widen ReviewDiagnosticCollector.provider / ReviewDiagnosticSnapshot.provider to include 'vibe' in lockstep with ReviewActivityStream.kind (LLD §3.4, revision 2) so the vibe branch type-checks and invariant c3 holds.

**Acceptance checks:**
- ReviewDiagnosticCollector constructor param and ReviewDiagnosticSnapshot.provider widened to 'claude'|'codex'|'vibe' (review-diagnostics.ts:9,33,35)
- type-checks with ReviewActivityStream feeding kind into the collector (:28)

### 1.6 TASK-3ec4189b758be646-s1-t6 — Vibe activity branch in CliProvider.activityReview

Replace the vibe rejection in activityReview with a vibe branch that starts the verified Vibe app-server session and feeds its frames into ReviewActivityStream('vibe'), enforcing the read-only tool policy and pre-dispatch VibeSelectionError.

**Acceptance checks:**
- activityReview vibe guard at cli-provider.ts:611 replaced by a vibe branch
- vibe branch validates model via catalog + runtime thinkingLevels (vibe-session.ts:384-404) BEFORE starting the Vibe app server; VibeSelectionError precedes dispatch
- vibe activity drives ReviewActivityStream kind 'vibe' with read-only tool policy (read_file + mcp_insrc_* equivalent, LLD invariant c4)
- cancellation via shared signal/acceptedStop honored

### 1.7 TASK-3ec4189b758be646-s1-t7 — cli-vibe catalog: mistral-large-4 entry with verified efforts

Add the versioned mistral-large-4 entry (verified efforts only) to the cli-vibe family in cloud-model-catalog.json; catalog validation unchanged and still rejects unverified selections.

**Acceptance checks:**
- cli-vibe family gains { id: 'mistral-large-4', displayName: 'Mistral Large 4', efforts: [<runtime-verified only>] } in src/assets/models/cloud-model-catalog.json
- model-catalog.ts cliKind/family validation passes on the new entry
- uncatalogued model or unverified effort still throws VibeSelectionError before any turn (vibe-session.ts:385,403-404)

### 1.8 TASK-3ec4189b758be646-s1-t8 — Failure diagnostics carry real backend detail

Failure diagnostics carry backend detail: spawn/crash failures record the real stderr line (and preflight failures the OllamaTargetError cause) in the diagnostic snapshot, fixing the checkpoint's lost backend response.

**Acceptance checks:**
- parser.failure('spawn_failed'|'cli_exit') detail includes the real stderr error line / OllamaTargetError cause alongside the generic
- checkpoint diagnostic snapshot carries the backend detail (not bare NATIVE_CLI_FAILURE)

### 1.9 TASK-3ec4189b758be646-s1-t9 — Test suite: unit + coordinator integration + live-gated

Write the LLD's test suite: unit tests per touched module (env/preflight, vendor strip, args-unchanged, vibe lifecycle/policy, catalog, diagnostics), an integration pass through both review coordinators, and a live-gated manual suite. Full sweep once at plan end.

**Acceptance checks:**
- unit tests T1-T8 in colocated __tests__ beside cli-provider / review-activity-stream / review-diagnostics
- unit tests T9-T11 beside vibe-session / model-catalog + catalog schema
- integration test through both coordinators (design-review:379, task-review:223) with a fake binary capturing env
- live/ manual suite (INSRC_LIVE_TESTS-gated) documents the real ollama-claude and cli-vibe review runs

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| CliProvider.activityReview (src/agent/providers/cli-provider.ts:610) | `t1`, `t2`, `t8`, `t9` |
| withOllama / checkOllama reuse (src/agent/providers/cli-provider.ts:803-811) | `t1`, `t2` |
| runInProcessGroup env passthrough (src/shared/process-group.ts:68-136) | `t1`, `t8`, `t9` |
| ReviewActivityStream kind 'vibe' decode path (src/agent/providers/review-activity-stream.ts) | `t4`, `t6` |
| vibe-session catalog+runtime verification (src/shared/vibe-session.ts:384-404) | `t6`, `t7`, `t9` |
| model-catalog validation of the new cli-vibe entry (src/daemon/model-catalog.ts) | `t7`, `t9` |
| cloud-model-catalog.json cli-vibe family schema | `t7` |
| src/workflow/review/design-review/coordinator.ts:379 | `t9` |
| src/workflow/code-review/task-review/coordinator.ts:223 | `t9` |
| real Ollama cloud endpoint + real installed Vibe runtime | `t9` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD 3ec4189b758be646 s1 — dataModelChanges[0] activity-mode child env field-add + errorPaths (preflight rejection, spawn/crash diagnostics, vendor strip)` — "ProcessGroupOpts gains an explicit env passthrough at the activityReview call site: env = this.withOllama(process.env) when this.ollama is set ... vendor login keys removed"
- **[[c2]]** `prior-artifact` `LLD 3ec4189b758be646 s1 — contractDetails.api[0]/api[1] CliProvider.activityReview + runInProcessGroup env passthrough and postconditions` — "childEnv = this.withOllama(process.env) ?? undefined ... runInProcessGroup(command, args, { mode:'activity', ..., ...(childEnv ? { env: childEnv } : {}) })"
- **[[c3]]** `prior-artifact` `LLD 3ec4189b758be646 s1 — dataModelChanges[2]/[3] ReviewActivityStream kind 'vibe' + lockstep diagnostics provider widening (revision 2 §3.4) + invariant c3` — "kind: 'claude' | 'codex' | 'vibe' ... provider: 'claude' | 'codex' | 'vibe' (both the constructor parameter and the ReviewDiagnosticSnapshot.provider field)"
- **[[c4]]** `prior-artifact` `LLD 3ec4189b758be646 s1 — contractDetails.api[2] ReviewActivityStream kind 'vibe' via Vibe app-server transport + invariant c4 read-only tool policy` — "vibe now runs through the Vibe app-server transport feeding ReviewActivityStream kind 'vibe' ... read-only + insrc MCP tools and no write/execute tools"
- **[[c5]]** `prior-artifact` `LLD 3ec4189b758be646 s1 — dataModelChanges[1] cli-vibe catalog mistral-large-4 field-add + invariants c3/c5 (catalog verification unchanged)` — "models[] += { id: 'mistral-large-4', displayName: 'Mistral Large 4', efforts: [<verified only>] } — validated by model-catalog.ts cliKind check"
- **[[c6]]** `prior-artifact` `LLD 3ec4189b758be646 s1 — testStrategy (ac1-ac5 acceptance mapping + unit/integration/live testLevels)` — "testFramework node:test via npx tsx --test ... colocated __tests__ beside the touched files"
- **[[c7]]** `code` `src/agent/providers/cli-provider.ts:610-627`
- **[[c8]]** `code` `src/agent/providers/review-activity-stream.ts:14-43`
- **[[c9]]** `code` `src/shared/review-diagnostics.ts:9-35`
- **[[c10]]** `code` `src/assets/models/cloud-model-catalog.json:43-82`
- **[[c11]]** `code` `src/shared/vibe-session.ts:384-404`
- **[[c12]]** `code` `src/workflow/review/design-review/coordinator.ts:379`
- **[[c13]]** `code` `src/workflow/code-review/task-review/coordinator.ts:223`

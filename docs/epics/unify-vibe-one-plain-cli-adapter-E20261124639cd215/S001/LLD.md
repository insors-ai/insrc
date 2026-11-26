<!-- insrc:artifact LLD-639cd2159a87aedb-s1 -->

# LLD: STORY-639cd2159a87aedb-s1 — One shared plain-CLI launch path serves every backend Vibe request

## Summary

**Epic:** `unify-vibe-one-plain-cli-adapter`
**HLD base run:** `wf-1795535373279-l4wumn`
**HLD effective hash:** `67d59677de6a...`

This Story builds the one shared plain-CLI Vibe adapter and rewires every backend Vibe path onto it: the provider's completion, structured-output and read-only entries become thin request builders over the adapter's single launch contract, with model/thinking selection riding the plain invocation, structured output staying locally validated, and the read-only mode present but refusing until its qualification lands in s2. The app-server session transport is deleted outright, and the plugin's four transport imports are re-pointed to adapter-owned equivalents so the repo compiles at the story boundary with no chat behavior change. The adapter owns termination, descendant cleanup and temporary-file cleanup on every exit path, in both process-group modes, and produces the rich turn events — session identity, tool calls and results with content — that the chat migration in s3 will render.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

> See **HLD-639cd2159a87aedb** § 2. Framework summary

**Rollout phase:** Phase A — Shared foundations
**Owns:** `sc1` (Vibe execution adapter interface), `sc2` (Qualified insrc tool naming — general identity plus the analysis allowlist)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: The narrow-authorization design itself: the live qualification suite against the real installed binary (custom policy/agent exploration, allowed-tool execution proof, blocked-tool proof, blanket-bypass absence proof, write-refusal check, AND the invalidation behavior — a changed binary version or effective policy returns the mode to refusing until re-qualified), the adapter-owned ReadOnlyCapability wiring (the adapter validates and exposes; callers never construct), the unavailable-state reporting when qualification fails, and the adapter's read-only mode enablement. The custom-agent/policy TOML a qualified design may need is authored with the same smol-toml dependency directly — it is not the Vibe-config reader (sc4). — owns `sc3`
- `s3`: The chat surface migration: the vibe mapper and job runner become consumers of the adapter (argv and VIBE_ACTIVE_MODEL pinning deleted from the plugin; the worker's signal threads into the adapter's per-turn cancellation; the worker keeps its supervisor-owned process group and its forced-stop sweep), while the transcript rendering, streaming event mapping over the RICH events (tool-call identity and arguments for command correlation, tool-result OUTPUT content, session identity and resume-handle delivery), worker lifecycle, resume handles and attachments keep their existing behavior (lc2). Also internal: the live verifications whose outcomes s6 records — the approval parity cases, the tool-result output parity fixture, the worker forced-termination and descendant-cleanup parity check, the prompt-transport check, the resume round-trip, and the general-naming check that chat tool-activity rendering and insrc_present declarations parse through sc2's general identity.
- `s4`: The reader's internals: parse-for-understanding via the existing smol-toml dependency following the codex project-config guard's refuse-don't-rewrite precedent, the surgical byte-preserving edit engine, the refusal path for configs that cannot be changed safely, and the rewiring of the daemon's registration checks and cleanup (mcp-register) and the plugin's config writer (toml-mcp-writer) onto it — with src/shared/toml-inline-list.ts deleted. — owns `sc4`
- `s5`: The model-family alignment: catalog, registry, check and definitions entries for cli-vibe rebuilt to exactly the models and thinking levels the adapter honors (verified against the installed tool's catalog), the selection-delivery semantics through the adapter — new sessions take the selection, resumed sessions inherit and report — and the fail-before-dispatch error naming supported choices. No other story consumes these records; settings and tier resolution do.
- `s6`: The reconciliation work itself: verifying the chat prompt-transport fix, the approval parity cases, the tool-result output parity, the resume-selection behavior and the worker cleanup parity live with s3's evidence, checking catalog coverage, closing the implemented issues (read-only authorization via sc3's qualification evidence incl. its provenAgainst record, TOML parsing via sc4's story validation), stamping the review-dependent deferrals with their recorded dependency on the review rewrite, and attaching evidence to every closure.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `createVibeAdapter`

```typescript
createVibeAdapter(context: VibeAdapterContext, deps?: VibeAdapterDeps): VibeExecutionAdapter
```

**Parameters:**
- `context: VibeAdapterContext` — The construction-fixed execution context: cwd, env, and the process-group policy — adapter-owned or supervisor-owned
- `deps: VibeAdapterDeps` _(optional)_ — Injectable seams for tests: spawn, file read/write, process-group kill/sweep, clock

**Returns:** `VibeExecutionAdapter` — The single Vibe launch contract instance both surfaces call

**Errors:**
- `Error` when context.cwd is empty or not a directory — refused at construction

**Preconditions:**
- Called once per consumer surface

**Postconditions:**
- The returned adapter spawns one CLI subprocess per turn
- In adapter-owned mode every exit path sweeps the child group and removes turn temporary files

### 2.2 `startTurn`

```typescript
VibeExecutionAdapter.startTurn(request: VibeTurnRequest): AsyncIterable<VibeTurnEvent> & { readonly result: Promise<VibeTurnResult> }
```

**Parameters:**
- `request: VibeTurnRequest` — The turn: prompt, outputMode, session (new — carries model/thinking — or resumed — carries only the resumeHandle), mode, approval (REJECTED for read-only), readDirs, budget guards, per-turn signal and host deadline

**Returns:** `AsyncIterable<VibeTurnEvent> & { result: Promise<VibeTurnResult> }` — The streamed turn events and the result promise carrying text + identity + exit evidence

**Errors:**
- `VibeRefusalError` when mode:'read-only' while the adapter's own qualification has not succeeded (until s2) — refused before any subprocess spawns, the refusal reason surfaced
- `VibeRefusalError` when A mode:'read-only' request carries any approval setting — refused before dispatch
- `VibeSelectionError` when A new-session request names a model or thinking level outside the installed tool's real catalog — surfaced before any model call
- `Error` when request.signal aborted or request.deadlineMs exceeded — the turn is terminated and result rejects

**Preconditions:**
- The adapter was constructed with a context; the tool binary is reachable on PATH

**Postconditions:**
- A 'session' event opens every turn, carrying the native session id and, for a new session, the resume handle
- result carries exit evidence: stop reason, outcome, and the session's effective model/thinking read back from the export
- Turn temporary files are removed on every exit path; in adapter-owned mode the child group is swept too

### 2.3 `runVibeTurn`

```typescript
runVibeTurn(options: VibeTurnOptions): Promise<VibeTurnOutcome> — the adapter-owned turn entry shaped so runVibeChatJob's existing call re-points mechanically
```

**Parameters:**
- `options: VibeTurnOptions` — The plugin's existing turn options — command resolution, cwd, timeoutMs, signal, inheritProcessGroup, agentConfig, nativeSessionId, model, effort, catalog, prompt — mapped one-to-one onto the adapter's context + request; the mapping is total so no chat option is lost

**Returns:** `Promise<VibeTurnOutcome>` — The turn outcome the chat worker already consumes (stop reason, session id, output history)

**Errors:**
- `VibeTurnError` when The turn fails mid-flight (non-transient) — carried to the chat worker unchanged in shape

**Preconditions:**
- Called only by vscode-plugin/src/chat/vibe-session-process.ts's runVibeChatJob until s3 migrates the chat surface onto startTurn directly

**Postconditions:**
- The chat worker's observable behavior is unchanged — the same rows are written to the same line protocol
- No reference to src/shared/vibe-session.js remains in the plugin

### 2.4 `fromStreamedName`

```typescript
VibeMcpNaming.fromStreamedName(streamedName: string): VibeMcpToolIdentity | undefined
```

**Parameters:**
- `streamedName: string` — A tool name as the installed CLI spells it in its event stream (incl. insrc_present)

**Returns:** `VibeMcpToolIdentity | undefined` — The tool's identity split into server and tool, or undefined

**Errors:**
- `undefined return` when The streamed name matches no insrc MCP tool — undefined, never a guess

**Preconditions:**
- The spelling was established by live qualification against the installed tool

**Postconditions:**
- One spelling serves the backend allowlist and the chat parser; the restricted analysis allowlist stays a separate fixed set

### 2.5 `complete`

```typescript
CliProvider.complete(messages: LLMMessage[], opts?: CompletionOpts): Promise<LLMResponse> — rewired: builds a VibeTurnRequest (new session, no selection) and consumes the adapter
```

**Parameters:**
- `messages: LLMMessage[]` — The conversation to serialise into the prompt
- `opts: CompletionOpts` _(optional)_ — cwd/timeout/signal — threaded to the adapter's per-turn cancellation

**Returns:** `LLMResponse` — The final assistant text

**Errors:**
- `Error` when The adapter turn fails non-transiently — propagates to the provider's caller

**Preconditions:**
- The provider was constructed with kind 'vibe'

**Postconditions:**
- ac1: the same plain-CLI path as every other vibe request, prompt via the tool's programmatic input contract

### 2.6 `completeStructuredVibe`

```typescript
CliProvider.completeStructuredVibe<T>(messages: LLMMessage[], schema: StructuredSchema, opts?): Promise<T> — rewired onto the adapter; the local schema-validation loop stays in the provider
```

**Parameters:**
- `messages: LLMMessage[]` — The conversation
- `schema: StructuredSchema` — The requested JSON Schema — the tool has no native schema flag, so the schema note rides the prompt

**Returns:** `T` — The schema-validated payload

**Errors:**
- `ModelResponseShapeError` when Both local validation attempts fail — ModelResponseShapeError naming the schema errors

**Preconditions:**
- Called from completeStructured's vibe branch

**Postconditions:**
- ac4: the answer is validated locally against the caller's schema with the existing two-attempt retry; transient upstream failures retry via withTransientRetry (ac5)

### 2.7 `readOnlySessionOnce`

```typescript
CliProvider.readOnlySessionOnce<T>(prompt, schema, exec): Promise<T> — rewired: builds a mode:'read-only' VibeTurnRequest; the adapter refuses until its own qualification succeeds
```

**Parameters:**
- `prompt: string` — The read-only session's task
- `schema: StructuredSchema` — The expected answer schema, validated locally

**Returns:** `T` — The schema-validated answer

**Errors:**
- `ReadOnlyUnavailableError` when mode 'read-only' is refused before dispatch until the adapter's qualification succeeds (s2) — ReadOnlyUnavailableError with the surfaced reason

**Preconditions:**
- The backend read-only entry path

**Postconditions:**
- No write/execute capability runs in a completed read-only session (the s2 qualification proves it; from s1 the mode refuses outright)

### 2.8 `runVibe`

```typescript
runVibe(args, prompt, exec): Promise<SubprocessResult> — REMOVED: the dispatch seam (with its model/effort branch into the app-server transport, cli-provider.ts:885-905) is absorbed into the adapter
```

**Parameters:**
- `args: readonly string[]` — The vibe argv fragment
- `prompt: string` — The prompt on stdin

**Returns:** `—` — —

**Preconditions:**
- —

**Postconditions:**
- ac3: no session-based transport remains reachable, referenced or importable in production code

### 2.9 `vibeArgs`

```typescript
vibeArgs(output, extra): string[] — REMOVED into the adapter's argv construction
```

**Returns:** `—` — —

**Preconditions:**
- —

**Postconditions:**
- argv construction lives in the adapter, constructed against the qualified 3.1.4 flag surface

### 2.10 `runVibeChatJob`

```typescript
runVibeChatJob(job: VibeChatJob, signal: AbortSignal, write: (line: string) => void, ownedGroup: boolean): Promise<number> — reshaped: its runVerifiedVibeTurn call re-points to the adapter's runVibeTurn turn entry (mechanical re-home)
```

**Parameters:**
- `job: VibeChatJob` — The chat turn job (prompt, model/effort, catalog snapshot, session, readDirs, permissionMode)
- `signal: AbortSignal` — Host cancellation, threaded to the adapter
- `ownedGroup: boolean` — The worker's process-group ownership — the adapter runs the turn supervisor-owned so the worker's sweep is unchanged

**Returns:** `Promise<number>` — The exit code the worker already propagates

**Errors:**
- `VibeTurnError` when The underlying adapter turn fails — same error shapes the chat already renders

**Preconditions:**
- Called by vscode-plugin/src/vibe-session-worker.ts through the plugin-internal import — unchanged

**Postconditions:**
- The plugin compiles with zero references to the shared transport; chat behavior is unchanged (the real migration is s3)

## 3. Data model changes

### 3.1 `VibeTurnRequest` — new

The turn request union: new sessions carry model/thinking; resumed sessions carry only the resumeHandle with selection structurally absent (the type-level no-silent-substitution rule). Carries mode, approval (rejected for read-only), readDirs, budget guards, per-turn signal and deadlineMs.

**Call sites:**
- `src/agent/providers/cli-provider.ts:470`
- `src/agent/providers/cli-provider.ts:622`
- `src/agent/providers/cli-provider.ts:756`
- `vscode-plugin/src/chat/vibe-session-process.ts:76`

### 3.2 `VibeTurnEvent` — new

The rich event variants: session (identity + resume handle), status, assistant-text, tool-call (id, name, arguments), tool-result (id, ok, normalized OUTPUT per the chat precedence), error. Produced live from the streaming output for outputMode 'streaming'; mapped from the final message for text/json.

**Call sites:**
- `vscode-plugin/src/chat/vibe-session-process.ts:56`

### 3.3 `VibeTurnResult + VibeExitEvidence` — new

The result carries text, sessionId, resumeHandle and exit evidence — stopReason, outcome and the session's effectiveSelection read back from the tool's --output-dir export.json (a resumed turn reports what actually ran).

**Call sites:**
- `src/agent/providers/cli-provider.ts:895`

### 3.4 `VibeCatalogModel` — field-modify

The catalog model type (id, aliases, efforts) re-homes from the deleted transport to the adapter module — pure re-point, no shape change; all three import sites move with it.

**Call sites:**
- `src/agent/providers/cli-provider.ts:76`
- `vscode-plugin/src/chat/cli-adapter.ts:49`
- `vscode-plugin/src/chat/vibe-session-process.ts:2`

### 3.5 `VerifiedVibeSession + VibeSessionOptions` — field-remove

The app-server session transport (openVerifiedVibeSession, runVerifiedVibeTurn, VerifiedVibeSession, VibeSessionOptions) and its module are deleted; VibeTurnError is re-homed to the adapter (its refusal-marker role in structured-output.ts:234 is preserved); vibe-selection-smoke.mjs and vibe-session.test.ts go with the module.

**Call sites:**
- `src/agent/providers/cli-provider.ts:76`
- `src/agent/providers/structured-output.ts:40`
- `vscode-plugin/src/chat/vibe-session-process.ts:1`

### 3.6 `READ_ONLY_SESSION_VIBE_TOOL_NAMES` — field-modify

The backend read-only allowlist constant is replaced by the adapter's sc2 VibeInsrcAnalysisToolId allowlist — same two tool ids, now the one established spelling shared with the chat parser.

**Call sites:**
- `src/agent/providers/cli-provider.ts:123`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | The Story builds the adapter module exporting the sc1 types verbatim plus the createVibeAdapter factory (construction fixes VibeAdapterContext incl. the dual processGroup policy) and startTurn with live event production, the approval mapping (rejected for read-only), the type-level resumed-session rule, exit-evidence readback, and adapter-owned termination/descendant-exit/temp cleanup on every exit path. The read-only mode exists and refuses until s2's adapter-owned qualification succeeds. |
| `sc2` | implements | The adapter module exports the naming split: general VibeMcpNaming.fromStreamedName (any insrc MCP tool incl. insrc_present, established by live qualification) and the restricted VibeInsrcAnalysisToolId allowlist the read-only mode uses. |

## 5. Error paths

**Error cases**

- **A read-only request arrives before the adapter's qualification has succeeded (the s1 state, and any post-s2 invalidation)** (recoverable)
  - Detection: The adapter checks request.mode and its own qualification state BEFORE spawning — a refusal is raised, never a spawn-and-hope
  - Response: Raise the read-only refusal error with the surfaced reason; the provider surfaces it as the read-only session's failure. No subprocess is spawned.
  - User impact: The read-only session reports analysis unavailable with a clear reason (k1's honest unavailable state) — never a blanket bypass, never a silent fallback
- **A new-session request names a model or thinking level outside the installed tool's real catalog** (recoverable)
  - Detection: The tool fails fast with its supported-choices listing (live-probed: 'Error: Unknown model: __no_such_alias__. Available: …') — the adapter recognizes the tool's selection-failure wording in stderr
  - Response: Surface the tool's supported choices as a selection error before any model call; do not retry a selection error (it is deterministic)
  - User impact: The caller gets the tool's real catalog in the error — same guarantee as claude/codex clients
- **The tool binary is missing from PATH or a transient upstream error drops mid-response** (recoverable)
  - Detection: The spawned process fails to launch (spawnError) or exits non-zero with a transient-looking failure (withTransientRetry's isTransientCliError classification on the error text)
  - Response: The provider's existing withTransientRetry retries a fresh invocation up to its bound; deterministic failures are re-thrown at once — the bounded semantics ac5 pins
  - User impact: Same retry behavior as the claude and codex clients — bounded attempts, then the failure surfaces
- **The tool stalls during bootstrap before applying its own budget guards** (terminal)
  - Detection: request.signal.aborted or Date.now() passes the turn start + deadlineMs — checked by the adapter's watchdog, authoritative over the tool's own budgets
  - Response: Terminate the turn (the adapter's own child group in adapter-owned mode; the supervisor's sweep otherwise), remove temporary files, reject result with an abort/deadline error
  - User impact: The host deadline bounds what the tool cannot — no unbounded hang
- **The --output-dir export.json is missing or malformed after the turn exits** (recoverable)
  - Detection: readFileSync of the export throws, or the JSON parses but lacks stopReason/outcome — the adapter treats evidence as absent rather than guessing
  - Response: The result carries undefined exitEvidence (and undefined effectiveSelection) rather than fabricated values; the turn text still returns
  - User impact: Slightly poorer attribution for that one turn; no silent fabrication of exit evidence
- **The adapter cannot create its temporary working files (ENOENT/EACCES/EROFS/ENOSPC)** (terminal)
  - Detection: mkdirSync/writeFileSync of the export dir or the prompt temp file throws — the exception propagates from startTurn before spawn
  - Response: The turn fails before dispatch with the IO error; no partial process is left running
  - User impact: A clear setup failure naming the path — never a half-launched turn

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A backend Vibe request with no explicit model or thinking level | No model/thinking flags are added to the argv — the tool's configured defaults apply; the result reports the effective selection read back from the export (ac1) |
| A new-session request with an explicit model and thinking level, both valid in the installed catalog | The argv carries --model/--thinking for the new session only; the catalog check happens at the tool (bogus alias fails before any model call listing the real catalog — live-probed 2026-11-24), and the adapter surfaces the supported choices (ac2) |
| A resumed turn whose session had a different model/thinking than the caller now wants | The argv carries only --resume <handle> — the request type has no selection fields on a resumed turn, so nothing is silently substituted; the result reports the session's effective selection from the exit evidence |
| A mode:'read-only' request while the adapter's qualification has not succeeded | Refused before dispatch with the surfaced reason (until s2's adapter-owned qualification succeeds); no subprocess spawns (k1 fail-closed from s1) |
| A mode:'read-only' request that also carries an approval setting (manual/edit-auto/auto) | Refused before dispatch — the read-only authorization is the adapter's own qualified narrow policy, never a caller choice (r2 finding 1) |
| An ordinary (mode:'default') request with each approval value in turn | default/undefined adds no approval flag (CLI defaults); manual maps to agent ask; edit-auto maps to agent accept-edits; auto maps to auto-approve — the mapping chat's private launch path built today (vibe-session-process.ts:89-91) |
| A turn the tool stops early (budget guard, time limit) | The tool's stop reason and outcome ride the result's exit evidence — failures are attributable, not just exit-code -1 (the tool's --time-limit exits 3 and writes the export) |
| The host aborts the signal or the deadlineMs passes mid-turn (including during a bootstrap stall before the tool applies its own budgets) | The adapter stops the turn, sweeps its own child group (adapter-owned) or leaves the group to the supervisor (supervisor-owned), and removes the turn's temporary files; result rejects with an abort error |
| A streaming turn whose tool result arrives with outputText absent but output present (and vice versa; and an error-only result) | The event stream yields the session event and the tool-result variants carry the normalized OUTPUT (outputText/output, else error message, else reason — the existing chat precedence), not empty payloads |

**Invariants to preserve**

- A Vibe turn never approves every tool as a side effect of enabling analysis: the read-only mode refuses until the adapter's own live qualification succeeds (s2), and ordinary approval settings are rejected on read-only requests — the k1 invariant this Story ships the refusing half of. [[c2]]
- Every backend Vibe request — plain completion, structured output and read-only session alike — executes through the one plain-CLI launch path; the session-based transport is deleted, not demoted to a fallback or verification layer (k2, ac3). [[c4]]
- The provider's bounded transient-retry semantics (withTransientRetry — fresh invocation, bounded attempts, deterministic failures re-thrown at once) are preserved for every vibe path; the adapter adds the host-side signal/deadline bound on top (ac5, cli-provider.ts:475-520). [[c2]]
- Structured output is validated locally against the caller's schema with the existing two-attempt retry — the tool enforces no native schema flag, so the schema rides the prompt and the provider's ajv loop stays authoritative (ac4, cli-provider.ts:622-640). [[c4]]
- The prompt travels via the tool's programmatic input contract (stdin), never through shell-interpolated argv — a prompt with multiline text or option-like text reaches the tool whole (k6). [[c3]]
- VibeTurnError's role as the non-retryable refusal marker in structured-output retry (structured-output.ts:234) survives the transport deletion: the adapter's error surface re-homes it so the retry classifier keeps distinguishing tool refusals from transient failures. [[c2]]

## 6. Test strategy

**Test framework:** `node:test`

**Test levels**

- **unit** — The adapter's contract behavior with injected spawn/fs/clock seams: argv construction per mode/approval/session kind, the read-only refusal before spawn, event production from the stream, tool-result output normalization, exit-evidence readback, cleanup on every exit path in both process-group modes, and the provider's rewired entries building requests instead of argv.
  - Subjects: `src/shared/vibe-adapter.ts (createVibeAdapter, startTurn, runVibeTurn, fromStreamedName)`, `src/agent/providers/cli-provider.ts vibe paths (complete, completeStructuredVibe, readOnlySessionOnce) against the seam-injected adapter`
  - Fixtures: `canned CLI stderr for the selection-failure wording`, `canned streaming JSONL rows for the event variants`, `canned export.json for the exit-evidence readback`
- **integration** — The provider + structured-output + plugin chat worker run against the real adapter module (no transport), including the chat worker's mechanical re-home producing its existing line protocol.
  - Subjects: `src/agent/providers/structured-output.ts retry classification with the re-homed VibeTurnError`, `vscode-plugin/src/chat/vibe-session-process.ts runVibeChatJob through the adapter turn entry`
  - Fixtures: `a scripted fake vibe binary for the spawned path`
- **live** — Gated behind INSRC_LIVE_TESTS=1 against the real installed binary 3.1.4: the plain-CLI path end to end, the selection failure surfacing the real catalog, and exit-evidence readback from --output-dir.
  - Subjects: `vibe adapter live suite (new, alongside the existing cli-provider live suites)`
- **contract** — The no-transport invariant as a durable check: a test that greps production sources for src/shared/vibe-session.js imports and the module's existence, so a regression re-introducing the transport fails the suite.
  - Subjects: `repo-wide import scan test (the LldContext's grep enumeration as the baseline)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: adapter argv construction — a request with no model/thinking adds no --model/--thinking flags and writes the prompt to the tool's programmatic input (stdin), never into argv`, `unit: provider.complete for kind 'vibe' builds a single VibeTurnRequest and consumes the adapter — no private argv path remains (grep-level assertion: no vibeArgs/runVibe in cli-provider.ts)`, `integration: the backend vibe request path spawns exactly one subprocess per turn through the adapter (seam-recorded spawn)` |
| `ac2` | `unit: a new-session request with model+thinking constructs the argv with --model/--thinking; a resumed-session request constructs --resume only and the type forbids selection (compile-time plus runtime guard test)`, `unit: the adapter recognizes the tool's selection-failure wording (fixture: 'Error: Unknown model: … Available: …' from the live probe) and raises VibeSelectionError before any model call, not retried by withTransientRetry`, `live: INSRC_LIVE_TESTS-gated — a real `vibe -p` turn with a bogus alias surfaces the tool's real catalog; a valid model/thinking completes` |
| `ac3` | `unit: a repo-wide grep test asserts no production file imports src/shared/vibe-session.js and the module no longer exists (the grep-exhaustive enumeration in the LldContext is the baseline list)`, `unit: the transport's test suite (vibe-session.test.ts) and fixture (vibe-selection-smoke.mjs) are deleted with the module; packaging.test.ts's shared-file list updated`, `integration: provider + structured-output + chat worker compile and run against the adapter alone` |
| `ac4` | `unit: completeStructuredVibe keeps the local two-attempt ajv validation loop — a first invalid answer retries once, a second raises ModelResponseShapeError naming the errors`, `unit: the schema note rides the prompt — the prompt passed to the spawn seam contains the output contract` |
| `ac5` | `unit: withTransientRetry still wraps every vibe path — a transient error text from the seam retries a fresh invocation, a deterministic failure re-throws on attempt 1, bounded at the existing max`, `unit: VibeTurnError re-homed to the adapter is still the non-retryable refusal marker (structured-retry-vibe-refusal.test.ts's cases re-pointed, same verdicts)` |

## 7. Migration

**State before:** The backend provider carries a two-transport split (LldContext bundle 4): runVibe at src/agent/providers/cli-provider.ts:885 dispatches plain `vibe -p` via vibeArgs for the default model, but switches to the app-server transport (openVerifiedVibeSession/runVerifiedVibeTurn) whenever a model/effort is set (:895-905); the chat worker (vscode-plugin/src/chat/vibe-session-process.ts:76) calls the app-server transport directly, passing inheritProcessGroup and the per-turn permission mapping (:84-95); structured-output.ts:234 classifies VibeTurnError as the non-retryable refusal marker; the read-only path pins its tool names via READ_ONLY_SESSION_VIBE_TOOL_NAMES (:123). Four production files import src/shared/vibe-session.js (grep-exhaustive bundle 3), plus eight test/fixture references.

**State after:** Every backend Vibe request — complete, completeStructured, the interactive-tools path and the read-only entry — builds a VibeTurnRequest and executes through the single adapter module (one subprocess per turn, model/thinking on the plain argv for new sessions, resumed sessions structurally selection-free, read-only refusing until s2 qualifies, approval rejected on read-only). The app-server transport module no longer exists; the plugin's chat worker compiles against the adapter's turn entry with unchanged observable behavior; structured output keeps its local validation; transient retry keeps its bounded semantics; the provider contains no vibe argv construction.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add src/shared/vibe-adapter.ts: the sc1/sc2 types verbatim, the createVibeAdapter factory with injectable spawn/fs/process-group/clock seams, startTurn with live JSONL event production, the runVibeTurn turn entry (the total mapping of the plugin's VibeTurnOptions onto context+request), the re-homed VibeTurnError, the approval mapping, the dual process-group policy with cleanup on every exit path, the exit-evidence readback, and the sc2 naming split. Purely additive — nothing imports it yet. — ↩ rollbackable
2. Re-point the plugin's two shared-transport imports mechanically: vscode-plugin/src/chat/cli-adapter.ts:49's VibeCatalogModel type import and vscode-plugin/src/chat/vibe-session-process.ts:1-2's runVerifiedVibeTurn/VibeTurnError/VibeCatalogModel/VibeTurnOptions imports move to the adapter module; runVibeChatJob's turn call becomes a call to the adapter's runVibeTurn with the same options object — no mapper, event-mapping or worker-lifecycle change (that is s3). — ↩ rollbackable
3. Re-point the backend's two transport imports: src/agent/providers/structured-output.ts:40's VibeTurnError import moves to the adapter (its refusal-marker role at :234 is untouched); src/agent/providers/cli-provider.ts:76's imports move to the adapter (VibeCatalogModel, VibeTurnError). — ↩ rollbackable
4. Rewire the backend vibe call sites onto the adapter: complete() (:470) and completeStructuredVibe() (:622) build VibeTurnRequests and consume startTurn; the interactive-tools path (:684) maps its auto-approve flag to the approval input; readOnlySessionOnce() (:756) builds a mode:'read-only' request whose tool-name set comes from the adapter's sc2 allowlist — the adapter refuses it before dispatch (the s1 fail-closed state). runVibe (:885) and vibeArgs (:980) are deleted — the provider stops constructing vibe argv. — ✕ non-rollbackable
5. Delete src/shared/vibe-session.ts with its test suite and fixture (vibe-session.test.ts, vibe-selection-smoke.mjs), and update the remaining references: the daemon test helper review-shell-worker.mjs and model-catalog-asset.test.ts re-point to the adapter (or drop the reference if transport-specific), the plugin packaging.test.ts shared-file list gains vibe-adapter.js and loses vibe-session.js, and cli-vibe.test.ts / structured-retry-vibe-refusal.test.ts / cli-adapter.test.ts re-point to the adapter equivalents with the same case verdicts. — ✕ non-rollbackable
6. Add the no-transport contract check (the repo-wide grep test asserting no production file imports src/shared/vibe-session.js and the module no longer exists) and run the full test sweep — the repo compiles at every prior step's boundary, so this step only verifies. — ↩ rollbackable

**Backward compat:** The four external behavior surfaces keep their observable contracts: the LLMProvider interface for kind 'vibe' (complete/completeStructured/runReadOnlySession shapes and errors, incl. ModelResponseShapeError and the transient-retry classification), the plugin chat's line protocol (the same rows the worker writes today), the structured-output retry classification (VibeTurnError as the non-retryable refusal marker), and the cli-vibe model-family catalog type (VibeCatalogModel, re-homed with no shape change — the s5 alignment is a later story). Internal-only breaking change: src/shared/vibe-session.js's exports cease to exist — the grep-enumerated four production importers and eight test/fixture references are the complete migration set, and no out-of-repo consumer exists (the deprecated insrc-ide fork is out of scope per project rules).

## 8. Alternatives considered

### 8.1 b1: Single-module adapter with injectable seams and a live-streaming turn — **CHOSEN**

One shared module: sc1/sc2 verbatim, a factory with injectable spawn/fs/group seams, live JSONL event production, and a turn-entry export for the plugin's mechanical re-home.

One module, src/shared/vibe-adapter.ts, exporting the sc1 types verbatim, a factory createVibeAdapter(context, deps?) with injectable spawn/filesystem/process-group seams (the same McpRegisterDeps/VibeSessionOptions convention the codebase already uses for testable subprocess code), and the sc2 naming split. Events are produced LIVE: when outputMode is 'streaming' the adapter spawns the tool with --output streaming and parses the JSONL stream into the rich event variants as they arrive; text/json modes map the final assistant message. The module also exports an adapter-owned turn-entry function whose signature is shaped so vibe-session-process.ts's runVibeChatJob call re-points mechanically (one-line import + call change, no chat behavior change) — the HLD's mechanical re-home. Exit evidence comes from --output-dir export.json read after turn end; temp files and (in adapter-owned mode) the child group are swept on every exit path. Structured output stays in the provider: the adapter returns the turn, the provider keeps its existing two-attempt local schema-validation loop.

### 8.2 b2: Directory module with explicit internal seams

src/shared/vibe-adapter/ split into types, argv, stream, process and naming files behind one index — same contract, file-level internal seams.

A directory module, src/shared/vibe-adapter/ with types.ts (the sc1/sc2 types verbatim), argv.ts (flag-surface construction incl. the approval mapping and budget guards), stream.ts (JSONL event parsing + the tool-result output normalization), process.ts (spawn, dual process-group policy, termination/descendant-exit/temp cleanup, exit-evidence reading) and naming.ts, plus index.ts re-exporting the public surface. Same external contract as b1; the internal seams are file boundaries from day one.

**Rejected because:** Satisfies everything b1 does and answers the HLD's 'one module, several concerns' con structurally — but the internal split is speculative until s2/s3 exercise the seams, adds a barrel index with no consumer-facing benefit, and costs the same. The documented fallback if the adapter module grows.

### 8.3 b3: Replay-based event production (collect, then synthesize)

The adapter collects the final output and synthesizes the event sequence at completion — no live stream parsing in this Story.

Same module and factory as b1, but events are synthesized after the fact: the adapter always runs --output json (the final session-messages array) or --output text, and composes the event sequence when the turn completes — session event, then the recorded assistant/tool events replayed, then the result. No live JSONL parsing at all in this Story.

**Rejected because:** Backend-complete but contract-hollowing: the AsyncIterable shape exists but is a replay — events arrive only at turn completion, partialing sc1 (the streaming event contract s3 depends on) and k3 (chat-surface alignment deferred into s3, which would then rewrite the adapter's event-production internals). Smaller now only by deferring cost into the story that already carries the parity risk.

## 9. References

- **[[c1]]** `step-output` `s1`
- **[[c2]]** `analyze-bundle` `s1` — "the grep-exhaustive production import enumeration of src/shared/vibe-session.js (four importers, eight test/fixture references) and the backend vibe call sites the Story rewires"
- **[[c3]]** `analyze-bundle` `s1` — "the live 3.1.4 qualification: headless --model/--thinking for NEW sessions, --approval-policy, budget guards, --output-dir export.json, and the programmatic-mode documentation establishing new-session"
- **[[c4]]** `code` `src/agent/providers/cli-provider.ts:470` — "the provider vibe paths the Story reshapes: complete (:470), completeStructuredVibe (:622), interactive-tools (:684), readOnlySessionOnce (:756), runVibe (:885), vibeActivityCatalog (:715), READ_ONLY_"
- **[[c5]]** `code` `src/agent/providers/structured-output.ts:234` — "VibeTurnError as the non-retryable refusal marker in the structured-output retry classifier"
- **[[c6]]** `code` `vscode-plugin/src/chat/vibe-session-process.ts:56` — "the chat worker's tool-result content emission (outputText/output/error/reason) and its per-turn permission mapping"
- **[[c7]]** `prior-artifact` `docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/HLD.md` — "the approved HLD this LLD implements — sc1/sc2 owned by s1, the rev-3 contract surface and the rollout risky bit 1 (the mechanical plugin re-home)"
- **[[c8]]** `prior-artifact` `docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/DEF.md` — "the approved Epic — the Story's acceptance criteria and constraints k1-k7"
- **[[c9]]** `code` `src/shared/vibe-session.ts` — "the session transport to be deleted"
- **[[c10]]** `step-output` `s4`
- **[[c11]]** `step-output` `s5`
- **[[c12]]** `step-output` `s6`
- **[[c13]]** `step-output` `s7`

<!-- insrc:artifact PLAN-639cd2159a87aedb-s1 -->

# Plan: STORY-639cd2159a87aedb-s1

## Summary

**Epic:** `unify-vibe-one-plain-cli-adapter`
**LLD run:** `wf-1795537513475-h3oly6`
**LLD effective hash:** `67d59677de6a...`

Building this Story means writing one new, injectable-seam module (src/shared/vibe-adapter.ts, split across two Tasks: construction/validation/refusal paths, then turn-execution internals), then mechanically re-pointing every existing backend and plugin import of the old app-server transport onto it, rewiring the backend's three vibe call sites to build adapter requests instead of constructing CLI argv directly, deleting the old transport module and its tests outright, and closing with a durable contract test plus a full regression sweep. No chat-visible behavior changes anywhere in this Story; the migration is purely an internal re-plumbing with one new fail-closed refusal path (read-only mode) that stays closed until a later Story supplies its qualification.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [Tasks](#2-tasks)
3. [Test-strategy coverage](#3-test-strategy-coverage)
4. [References](#4-references)

## 1. Epic impact analysis

**Does not apply**: s1 is this Epic's first Story (Phase A, shared foundations) — no prior Story has built anything yet for this Epic to have impact against.

## 2. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add vibe-adapter.ts core: sc1/sc2 types, createVibeAdapter factory, and startTurn's request validation/refusal paths | M | — | — | unit: createVibeAdapter throws when context.cwd is empty or not a directory, before any subprocess spawns; unit: startTurn with mode:'read-only' refuses before any subprocess spawn, surfacing a reason; unit: startTurn with mode:'read-only' and any approval setting refuses before dispatch; unit: the ordinary approval mapping matches today's chat mapping: default/manual/edit-auto/auto; unit: VibeTurnError is re-homed with the same constructor shape (dispatchState, sessionId, cause) | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Add vibe-adapter.ts turn execution: live event production, process-group cleanup, exit-evidence readback, and naming | M | — | `t1` | unit: adapter argv construction — a request with no model/thinking adds no --model/--thinking flags and writes the prompt to the tool's programmatic input (stdin), never into argv; unit: a new-session request with model+thinking constructs the argv with --model/--thinking; a resumed-session request constructs --resume only and the type forbids selection; unit: the adapter recognizes the tool's selection-failure wording and raises VibeSelectionError before any model call, not retried by withTransientRetry; unit: every exit path removes the turn's temporary files; adapter-owned mode additionally sweeps the child group on every exit path; unit: a 'session' event opens every turn carrying the native session id and, for a new session, the resume handle; unit: exit evidence is read back from export.json; a missing/malformed export.json yields undefined evidence rather than a fabricated value; unit: VibeMcpNaming.fromStreamedName returns undefined for a name matching no insrc MCP tool, never a guess; unit: a streaming tool-result with outputText/output/error/reason normalizes to the existing chat precedence, never an empty payload; live: INSRC_LIVE_TESTS=1 — a real vibe -p turn with a bogus alias surfaces the tool's real catalog; a valid model/thinking completes | [[c1]] [[c2]] [[c3]] |
| 3 | **`t3`** Re-point the plugin's shared-transport imports onto the adapter (mechanical, no chat behavior change) | M | — | `t2` | unit: cli-adapter.ts imports VibeCatalogModel from the adapter module, not vibe-session.js; integration: vscode-plugin/src/chat/vibe-session-process.ts runVibeChatJob through the adapter turn entry — the chat worker's observable behavior is unchanged, same rows to the same line protocol | [[c3]] [[c6]] |
| 4 | **`t4`** Re-point the backend's shared-transport imports onto the adapter | S | — | `t2` | unit: structured-output.ts imports VibeTurnError from the adapter module; the retry classifier's instanceof check still distinguishes the refusal marker from a transient failure; unit: cli-provider.ts imports VibeCatalogModel/VibeTurnError from the adapter module with no behavior change at this step | [[c3]] [[c5]] |
| 5 | **`t5`** Rewire the backend's vibe call sites onto the adapter; delete runVibe/vibeArgs | L | — | `t2`, `t4` | unit: provider.complete for kind 'vibe' builds a single VibeTurnRequest and consumes the adapter — no private argv path remains (grep-level assertion: no vibeArgs/runVibe in cli-provider.ts); integration: the backend vibe request path spawns exactly one subprocess per turn through the adapter (seam-recorded spawn); unit: completeStructuredVibe keeps the local two-attempt ajv validation loop — a first invalid answer retries once, a second raises ModelResponseShapeError naming the errors; unit: the schema note rides the prompt — the prompt passed to the spawn seam contains the output contract; unit: withTransientRetry still wraps every vibe path — a transient error text retries a fresh invocation, a deterministic failure re-throws on attempt 1, bounded at the existing max; live: INSRC_LIVE_TESTS=1 — the plain-CLI path end to end and exit-evidence readback from --output-dir | [[c1]] [[c3]] [[c4]] [[c5]] |
| 6 | **`t6`** Delete src/shared/vibe-session.ts and its test/fixture files; update the remaining non-production references | M | — | `t3`, `t4`, `t5` | unit: the transport's test suite (vibe-session.test.ts) and fixture (vibe-selection-smoke.mjs) are deleted with the module; packaging.test.ts's shared-file list updated; unit: VibeTurnError re-homed to the adapter is still the non-retryable refusal marker (structured-retry-vibe-refusal.test.ts's cases re-pointed, same verdicts); integration: provider + structured-output + chat worker compile and run against the adapter alone | [[c2]] [[c3]] |
| 7 | **`t7`** Add the no-transport contract check and run the full test sweep | S | — | `t6` | unit: a repo-wide grep test asserts no production file imports src/shared/vibe-session.js and the module no longer exists (the grep-exhaustive enumeration in the LldContext is the baseline list); smoke: the full relevant test sweep passes and typecheck is clean | [[c2]] [[c3]] |

### 2.1 TASK-639cd2159a87aedb-s1-t1 — Add vibe-adapter.ts core: sc1/sc2 types, createVibeAdapter factory, and startTurn's request validation/refusal paths

New, purely additive module src/shared/vibe-adapter.ts. Exports the sc1/sc2 types verbatim (VibeAdapterContext, VibeNewSession/VibeResumedSession, VibeTurnRequest, VibeTurnEvent, VibeTurnResult+VibeExitEvidence, VibeMcpToolIdentity) and createVibeAdapter(context, deps?) with injectable spawn/fs/process-group/clock seams, refusing construction when context.cwd is empty or not a directory. startTurn() validates the request shape and runs every refusal/mapping path BEFORE any subprocess spawns: the read-only refusal (refuses outright until s2's qualification exists), the read-only+approval-setting refusal, the new-session selection-catalog check surface, and the ordinary-session approval mapping (default/manual/edit-auto/auto). The re-homed VibeTurnError class (same refusal-marker shape structured-output.ts relies on) is defined here. Turn execution internals (event production, process-group cleanup, exit-evidence readback, naming) are a separate Task (t2) and are stubbed/deferred here -- nothing imports this module yet.

**Acceptance checks:**
- createVibeAdapter throws when context.cwd is empty or not a directory, before any subprocess spawns
- startTurn with mode:'read-only' refuses before any subprocess spawn, surfacing a reason (k1 fail-closed from s1; s2 will later make this conditional on qualification)
- startTurn with mode:'read-only' and any approval setting refuses before dispatch
- a new-session request's argv carries --model/--thinking only when the caller supplied them; a resumed-session request's type carries no selection fields
- the ordinary approval mapping matches today's chat mapping: default/undefined adds no flag, manual maps to agent ask, edit-auto maps to agent accept-edits, auto maps to auto-approve
- VibeTurnError is re-homed with the same constructor shape (dispatchState, sessionId, cause) structured-output.ts's instanceof check relies on

### 2.2 TASK-639cd2159a87aedb-s1-t2 — Add vibe-adapter.ts turn execution: live event production, process-group cleanup, exit-evidence readback, and naming

Completes src/shared/vibe-adapter.ts: startTurn's live JSONL event production for outputMode:'streaming' (session/status/assistant-text/tool-call/tool-result/error variants) and final-message mapping for text/json modes; the dual process-group policy with termination/descendant-exit-confirmation/temp-file cleanup on every exit path (adapter-owned and supervisor-owned); exit-evidence readback from --output-dir export.json (stopReason, outcome, effectiveSelection), treating a missing/malformed export as absent evidence rather than fabricated; VibeMcpNaming.fromStreamedName (general insrc MCP tool identity) and the VibeInsrcAnalysisToolId allowlist (restricted); and runVibeTurn(options), the adapter-owned turn entry whose signature totally maps the plugin's existing VibeTurnOptions onto context+request with no chat behavior change.

**Acceptance checks:**
- every exit path (success, abort/deadline, spawn failure) removes the turn's temporary files; adapter-owned mode additionally sweeps the child group on every exit path
- a 'session' event opens every turn carrying the native session id and, for a new session, the resume handle
- the result carries exit evidence (stopReason, outcome, effectiveSelection) read back from export.json; a missing/malformed export.json yields undefined evidence rather than a fabricated value
- VibeMcpNaming.fromStreamedName returns undefined for a name matching no insrc MCP tool, never a guess
- a streaming turn whose tool-result arrives with outputText absent but output present (and vice versa; and an error-only result) yields the normalized OUTPUT per the existing chat precedence, never an empty payload
- runVibeTurn's parameter mapping from VibeTurnOptions is total: every field the plugin's existing options object carries maps onto the adapter's context+request with no silently dropped option

### 2.3 TASK-639cd2159a87aedb-s1-t3 — Re-point the plugin's shared-transport imports onto the adapter (mechanical, no chat behavior change)

vscode-plugin/src/chat/cli-adapter.ts's type-only VibeCatalogModel import moves from src/shared/vibe-session.js to the adapter module (zero behavior change, confirmed no runtime transport call in this file). vscode-plugin/src/chat/vibe-session-process.ts's imports (runVerifiedVibeTurn, VibeTurnError, VibeCatalogModel, VibeTurnOptions) move to the adapter's equivalents; runVibeChatJob's turn call becomes a call to the adapter's runVibeTurn with the identical options object -- no mapper, event-mapping or worker-lifecycle change (that is a later Story, s3).

**Acceptance checks:**
- cli-adapter.ts imports VibeCatalogModel from the adapter module, not vibe-session.js, with no other change to that file
- vibe-session-process.ts imports runVerifiedVibeTurn/VibeTurnError/VibeCatalogModel/VibeTurnOptions equivalents from the adapter module only
- runVibeChatJob's turn call is the adapter's runVibeTurn, given the SAME VibeTurnOptions-shaped object the worker already builds
- the chat worker's observable behavior is unchanged -- the same rows are written to the same line protocol (integration test against the real adapter, no transport)

### 2.4 TASK-639cd2159a87aedb-s1-t4 — Re-point the backend's shared-transport imports onto the adapter

src/agent/providers/structured-output.ts's VibeTurnError import moves to the adapter module; its refusal-marker role in the structured-output retry classifier (the instanceof check) is untouched. src/agent/providers/cli-provider.ts's VibeCatalogModel and VibeTurnError imports move to the adapter module.

**Acceptance checks:**
- structured-output.ts imports VibeTurnError from the adapter module; the retry classifier's instanceof check still distinguishes the refusal marker from a transient failure, same verdicts as today
- cli-provider.ts imports VibeCatalogModel/VibeTurnError from the adapter module, with no behavior change at this step (call sites are rewired in the next Task)

### 2.5 TASK-639cd2159a87aedb-s1-t5 — Rewire the backend's vibe call sites onto the adapter; delete runVibe/vibeArgs

complete() builds a new-session VibeTurnRequest (no selection) and consumes startTurn, returning the final assistant text. completeStructuredVibe() builds a VibeTurnRequest and consumes startTurn, keeping its existing local two-attempt ajv validation loop and the schema note riding the prompt (the tool has no native schema flag). The interactive-tools/auto-approve path maps its auto-approve flag onto the request's approval input. readOnlySessionOnce() builds a mode:'read-only' request whose tool-name set comes from the adapter's sc2 VibeInsrcAnalysisToolId allowlist -- the adapter refuses it before dispatch (the s1 fail-closed state, matching today's READ_ONLY_SESSION_VIBE_TOOL_NAMES behavior one-for-one). runVibe() and vibeArgs() are deleted outright -- the provider stops constructing vibe argv or branching into the app-server transport.

**Acceptance checks:**
- complete() for kind 'vibe' builds exactly one VibeTurnRequest and consumes the adapter -- a grep-level assertion confirms no vibeArgs/runVibe reference remains in cli-provider.ts
- completeStructuredVibe keeps the local two-attempt ajv validation loop unchanged: a first invalid answer retries once, a second raises ModelResponseShapeError naming the schema errors
- readOnlySessionOnce's request uses the adapter's sc2 allowlist and is refused before any subprocess spawns, with the same ReadOnlyUnavailableError-shaped surfaced reason as today's refusal
- the provider's existing withTransientRetry still wraps every vibe path: a transient error text from the seam retries a fresh invocation once, a deterministic failure re-throws on attempt 1
- a backend vibe request (complete/completeStructuredVibe/readOnlySessionOnce) spawns exactly one subprocess per turn through the adapter (seam-recorded spawn count)

### 2.6 TASK-639cd2159a87aedb-s1-t6 — Delete src/shared/vibe-session.ts and its test/fixture files; update the remaining non-production references

Delete src/shared/vibe-session.ts, src/shared/__tests__/vibe-session.test.ts and src/shared/__tests__/fixtures/vibe-selection-smoke.mjs. Re-point src/agent/providers/__tests__/cli-vibe.test.ts and src/agent/providers/__tests__/structured-retry-vibe-refusal.test.ts to the adapter equivalents with the same case verdicts. Update vscode-plugin's packaging.test.ts shared-file list (gains vibe-adapter.js, loses vibe-session.js) and any other repo-wide test/fixture reference found by the grep enumeration (e.g. a daemon test helper or model-catalog-asset.test.ts), re-pointing or dropping each per its own relevance.

**Acceptance checks:**
- src/shared/vibe-session.ts no longer exists in the repo
- vibe-session.test.ts and vibe-selection-smoke.mjs no longer exist
- cli-vibe.test.ts and structured-retry-vibe-refusal.test.ts pass against the adapter's equivalents with the same case verdicts as before the rewire
- packaging.test.ts's shared-file list reflects vibe-adapter.js and no longer references vibe-session.js
- every other repo-wide reference to vibe-session.js found by a fresh grep at this Task's end is either re-pointed or justified as dropped in the Task's own notes

### 2.7 TASK-639cd2159a87aedb-s1-t7 — Add the no-transport contract check and run the full test sweep

Add a durable repo-wide grep test asserting no production file imports src/shared/vibe-session.js and the module no longer exists, so a future regression re-introducing the transport fails the suite immediately. Run the full relevant test sweep (src/agent/providers/**, src/shared/**, vscode-plugin's chat/plugin suites) plus typecheck to confirm no regression to any path this Story touched.

**Acceptance checks:**
- the new contract test fails if src/shared/vibe-session.js is re-imported by any production file or the file is restored
- the full relevant test sweep passes and typecheck is clean

## 3. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/shared/vibe-adapter.ts (createVibeAdapter, startTurn, runVibeTurn, fromStreamedName) | `t1`, `t2` |
| src/agent/providers/cli-provider.ts vibe paths (complete, completeStructuredVibe, readOnlySessionOnce) against the seam-injected adapter | `t5` |
| src/agent/providers/structured-output.ts retry classification with the re-homed VibeTurnError | `t4`, `t6` |
| vscode-plugin/src/chat/vibe-session-process.ts runVibeChatJob through the adapter turn entry | `t3` |
| vibe adapter live suite (new, alongside the existing cli-provider live suites) | `t1`, `t2`, `t5` |
| repo-wide import scan test (the LldContext's grep enumeration as the baseline) | `t7` |

## 4. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails 2.1-2.10 (createVibeAdapter/startTurn/runVibeTurn/fromStreamedName/complete/completeStructuredVibe/readOnlySessionOnce/runVibe-REMOVED/vibeArgs-REMOVED/runVibeChatJob)`
- **[[c2]]** `prior-artifact` `LLD s1 dataModelChanges 3.1-3.6 (VibeTurnRequest/VibeTurnEvent/VibeTurnResult+VibeExitEvidence/VibeCatalogModel/VerifiedVibeSession+VibeSessionOptions-removed/READ_ONLY_SESSION_VIBE_TOOL_NAMES-replaced)`
- **[[c3]]** `prior-artifact` `LLD s1 migration steps 1-6 (add adapter, re-point plugin imports, re-point backend imports, rewire backend call sites, delete vibe-session.ts, add contract check + full sweep)`
- **[[c4]]** `prior-artifact` `LLD s1 errorPaths (read-only refusal before qualification, selection-catalog failure, transient-retry bound, missing/malformed export evidence, IO failure before spawn)`
- **[[c5]]** `prior-artifact` `LLD s1 testStrategy acceptanceMapping ac1-ac5`
- **[[c6]]** `prior-artifact` `LLD s1 contractDetails 2.10 runVibeChatJob (vscode-plugin/src/chat/vibe-session-process.ts tool-result content emission and per-turn permission mapping)`

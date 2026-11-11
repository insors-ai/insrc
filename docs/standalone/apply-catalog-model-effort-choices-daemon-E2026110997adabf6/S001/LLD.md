<!-- insrc:artifact LLD-97adabf6bd47b036-s1 -->

# LLD: STORY-97adabf6bd47b036-s1 — Apply catalog model and effort choices in daemon and VS Code

## Summary

**Epic:** `apply-catalog-model-effort-choices-daemon`
**HLD base run:** `wf-1794244063610-bypsg8`
**HLD effective hash:** `ea720fa2f14e...`

Apply catalog-backed selections at the Vibe session boundary and recover the VS Code chat picker when the daemon catalog becomes available.

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

### 2.1 `Vibe session launch`

```typescript
runVibeSession(request: VibeRunRequest, transport: VibeSessionTransport): Promise<VibeRunResult>
```

**Parameters:**
- `request: VibeRunRequest` — Existing prompt, working directory, permissions, attachments, native session, optional model and effort, and cancellation.
- `transport: VibeSessionTransport` — Caller-owned local process adapter for the installed Vibe app-server binary.

**Returns:** `Promise<VibeRunResult>` — Verified effective selection, native session identity, and the same bounded events and outcome each caller consumes.

**Errors:**
- `selection-unavailable` when Local protocol lacks a required capability, a catalog model cannot be mapped to an unambiguous allowed alias, or the runtime does not confirm the requested choice.
- `launch-failed` when Process startup, authentication, protocol, timeout, or tool-scope parity fails.
- `dispatch-uncertain` when Writing turn/start may have delivered bytes but no authoritative reply was received. This failure carries dispatchState: 'possibly-sent'.
- `turn-failed` when Vibe acknowledged turn/start before the failure. This failure carries dispatchState: 'accepted'.

**Preconditions:**
- Catalog models and effort levels remain sourced from models.definitions and the daemon registry. Discovery is limited to the local Vibe session and never grants access to a model absent from the catalog.
- Explicit choices use the app-server path. Default-only invocations retain the existing headless behavior. Preserve the caller's existing working directory, tool approvals, attachment access, budgets, and abort signal.

**Postconditions:**
- Use one local process and at most one Vibe session per invocation. Start a new session or resume the supplied native ID without sending the prompt. Resolve catalog ID and aliases against the session's model choices, apply config/model/write with session_only true, and verify runtime model and effort before turn/start. A default model with explicit effort uses the verified effective model and its catalog levels.
- Model aliases are accepted only when they resolve to the intended catalog ID. A returned failure, policy rejection, or mismatched effective selection stops before prompt delivery. Existing CLI credentials and configuration files are preserved.
- Translate bounded native events into current daemon and VS Code outputs, including text, reasoning, tool activity and session identity. Preserve resume identity. Cancel or time out the owned turn and child, and distinguish failure after dispatch from a safe pre-dispatch refusal. Never replay an uncertain prompt.
- Use a typed VibeSessionError with dispatchState 'not-sent' | 'possibly-sent' | 'accepted'. Enter possibly-sent before handing turn/start to the transport, including write and cancellation races. Enter accepted on a successful acknowledgement or authoritative turn event. Only a proven pre-dispatch failure can enter the existing transient retry path. The daemon complete() and runEditSession() retries and the separate runReviewSession() retry loop must consult this field before classifying error text. The chat adapter releases its turn lease and preserves its transcript and native session without automatic replay. A lost acknowledgement never resets the state. Apply the same dispatch guard to completeStructuredVibe() through withStructuredRetry(). Propagate typed failures in the possibly-sent and accepted states as the original error, without converting them into validation feedback or wrapping them on final failure. Keep schema correction for successfully received output that fails validation.
- Follow the installed stdio handshake in order. Send initialize, wait for the response, send initialized, open or resume, apply session-only config, then use runtime/read to verify the effective model and effort. Qualify the installed protocol in the smoke test with a loopback fixture and record the effective values and unchanged configuration.

### 2.2 `Chat catalog refresh and selection`

```typescript
refreshRunCatalog(): Promise<void>; reconcileRunConfig(provider: Provider, next: RunConfig, catalog: RunCatalog): RunConfig
```

**Parameters:**
- `provider: Provider` — The target session's provider selects the model list from the catalog projection.
- `next: RunConfig` — Existing optional model and effort fields. Keep their persisted format.
- `catalog: RunCatalog` — In-memory projection keyed by provider, containing the existing per-provider model and per-model effort views.

**Returns:** `RunConfig` — A selection whose effort is supported by the selected model, or its default effort.

**Errors:**
- `catalog-unavailable` when The daemon is disconnected or fails its catalog request.

**Preconditions:**
- Provider discovery remains based on locally available chat adapters. Daemon tier settings retain their existing config gateway and model validation.

**Postconditions:**
- Coalesce concurrent catalog refreshes. Retry after reconnect or reopening the picker. Preserve the last valid catalog during transient failures and display a loading or unavailable state when there is no catalog. Ignore late or disposed responses.
- Commit model and effort together. Retain the old effort only when the selected catalog model allows it. Show default as the only effort until a specific model is known. Preserve existing persisted chat selection until a valid catalog can evaluate it, and keep session identity, transcript, and in-flight turns intact.
- Use provider-aware reconciliation for new-chat, set-run-config, and session restore. Persist provider and reconciled fields in one session update. Validate again on the authoritative host before a turn. Without catalog evidence, preserve restored choices but disable edits that depend on unavailable definitions.
- The extension supplies its existing IpcClient reachability probe to the chat host. After a catalog failure, the host runs one bounded reachability probe per minute while a panel is open, without invoking an agent. A reachable daemon permits a coalesced catalog retry. The picker-open webview intent requests immediate refresh; a failing definitions request while the daemon is reachable remains retryable. Stop the timer on catalog success or panel disposal.
- Keep cache, single-flight refresh, and monotonic generation on the chat host. Dispose or replace the webview binding before accepting another ready handshake. Ignore results from invalidated generations. Send a run-catalog snapshot with status, revision and provider projection on ready and after changes. The webview applies it to the picker state only and rerenders the open controls in place. Selection, transcript and active turn state stay on their existing channels.

## 3. Data model changes

### 3.1 `VibeRunRequest and effective selection` — new

Transient one-to-one ownership from a daemon run or VS Code turn to an owned Vibe process and session. A resumed session is referenced by its existing native ID. The returned model and effort confirm the request before dispatch. Credentials and existing saved settings stay in Vibe.

**Call sites:**
- `src/agent/providers/cli-provider.ts`
- `vscode-plugin/src/chat/cli-adapter.ts`

### 3.2 `VS Code chat run configuration` — invariant-change

One session retains a provider, optional catalog model and optional supported effort. Many sessions can read the same in-memory catalog projection. Existing persisted fields and wire messages remain compatible.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/extension.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/apply-catalog-model-effort-choices-daemon-E2026110997adabf6/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **Catalog fetch fails or the daemon reconnects during a fetch** (recoverable)
  - Detection: Read rejects, times out, or returns for an obsolete refresh generation.
  - Response: Keep the last valid catalog if present, expose unavailable state otherwise, and retry on reconnect or picker open.
  - User impact: Model choices return without reopening the chat.
- **Vibe lacks a required method or cannot apply the selected model or effort** (recoverable)
  - Detection: Capability negotiation, a negative mutation response, or read-back differs from the requested selection.
  - Response: Stop before submitting the prompt and surface a concise error that names the unsupported choice. Do not use an implicit default for an explicit selection.
  - User impact: The user can choose an available value or clear the override without losing the chat.
- **Vibe loses the turn/start acknowledgement or fails after dispatch** (recoverable)
  - Detection: Transport closes, terminal event reports failure, or the owned deadline expires.
  - Response: Preserve dispatch certainty in the typed error. Bypass automatic transient retries and structured-output correction retries when dispatch may have occurred. Propagate the original error, release the child, and preserve received output and session identity.
  - User impact: The user can inspect partial output and decide whether to retry.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Model changes from a high-effort choice to a model offering no effort choices | Persist the new model with default effort in one update. |
| A saved model and effort are restored while the catalog is unavailable | Preserve the saved selection and defer validation until a successful refresh. |
| No explicit model or effort was chosen | Preserve the existing headless defaults and output path. |
| Existing Vibe session resumes with a supported selection different from its prior settings | Confirm the selection in that session before starting its next turn. Preserve native session identity and caller policy. |

**Invariants to preserve**

- Daemon tiers and VS Code read model and effort definitions from the existing catalog projection. [[c1]]
- Existing run paths retain their prompt, provider authentication, policy, session resume, and cancellation behavior. [[c7]]

## 6. Test strategy

**Test framework:** `Node test runner with tsx, injected fake child process and chat panel fixtures. The standalone issue states acceptance in prose. The local mapping uses ac1 for effective execution selection, ac2 for picker recovery and compatible selection, and ac3 for safe dispatch and explicit failure.`

**Test levels**

- **unit** — Protect catalog lifecycle and model-specific selection.
  - Subjects: `Chat recovers from a failed catalog request without losing session state`, `Chat validates effort on model switch and session restore`
- **integration** — Qualify both existing execution entry points with a fake Vibe process and verify preflight, output and cleanup.
  - Subjects: `Daemon and chat apply verified Vibe model and effort to new and resumed turns`, `Vibe preflight failures never submit or replay the prompt`, `Vibe protocol path preserves caller permissions, attachments, and terminal output`, `Lost turn/start acknowledgement and post-acknowledgement transport errors each dispatch once through daemon complete, structured completion, edit and review`, `Real picker intent and ready handshake recover from initial catalog failure and reconnect without replacing the view or interrupting the turn`, `Structured Vibe completion retains schema correction when a received response fails validation`
  - Fixtures: `Scripted local app-server protocol fixture with capability, configuration, event, and cancellation cases.`
- **smoke** — Check the installed CLI contract using an isolated session with no cloud prompt.
  - Subjects: `Installed Vibe confirms a session-only model and effort without changing saved configuration`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Daemon and chat apply verified Vibe model and effort to new and resumed turns`, `Installed Vibe confirms a session-only model and effort without changing saved configuration` |
| `ac2` | `Chat recovers from a failed catalog request without losing session state`, `Chat validates effort on model switch and session restore`, `Real picker intent and ready handshake recover from initial catalog failure and reconnect without replacing the view or interrupting the turn` |
| `ac3` | `Vibe preflight failures never submit or replay the prompt`, `Vibe protocol path preserves caller permissions, attachments, and terminal output`, `Lost turn/start acknowledgement and post-acknowledgement transport errors each dispatch once through daemon complete, structured completion, edit and review`, `Structured Vibe completion retains schema correction when a received response fails validation` |

## 7. Migration

**State before:** The daemon registry serves the catalog. Both Vibe launch paths omit effort, and the VS Code chat fetches its catalog once and stores model and effort independently.

**State after:** The same catalog drives validated choices. Explicit Vibe selections use verified session-only settings, and a chat can recover its catalog after a daemon reconnect.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Qualify the local Vibe protocol and execution policy parity. Deploy the daemon and VS Code builds with shared selection handling and typed preflight failures. — ↩ rollbackable
2. Reload the VS Code extension and restart the daemon through normal release operations when the build is installed. Retain existing model tier and chat records. — ↩ rollbackable

**Backward compat:** Existing catalog RPC and saved config shapes remain valid. Older Vibe builds retain the default headless path and report unsupported explicit choices if session-only settings cannot be verified. A mixed daemon and extension release uses the same existing catalog wire shape. Rollback restores the prior selection behavior without migrating data.

## 8. Alternatives considered

### 8.1 a1: Session-only Vibe settings — **CHOSEN**

Verify explicit overrides before dispatch.

Apply and verify local session settings while preserving existing default behavior.

### 8.2 a2: Child environment configuration

Apply child-local environment settings.

Keep headless invocation and express the selected model and thinking through a child environment.

**Rejected because:** The sparse environment route cannot reliably preserve complete model settings or precedence on resume.

## 9. References

- **[[c1]]** `code` `src/daemon/model-definitions.ts:147`
- **[[c2]]** `prior-artifact` `docs/standalone/apply-catalog-model-effort-choices-daemon-E2026110997adabf6/ISSUE.md`
- **[[c3]]** `code` `src/assets/models/cloud-model-catalog.json`
- **[[c4]]** `doc` `https://docs.mistral.ai/vibe/code/cli/work-with-cli`
- **[[c5]]** `doc` `https://docs.mistral.ai/vibe/code/cli/configuration-reference`
- **[[c6]]** `code` `/Users/subhagho/.local/share/uv/tools/mistral-vibe/lib/python3.14/site-packages/vibe/app_server/protocol.py`
- **[[c7]]** `code` `src/agent/providers/cli-provider.ts:309`
- **[[c8]]** `code` `vscode-plugin/src/chat/chat-panel.ts:326`
- **[[c9]]** `code` `src/shared/ipc-client.ts:149`
- **[[c10]]** `code` `src/agent/providers/structured-output.ts:230`
- **[[c11]]** `doc` `.insrc/tmp/design-review/catalog-model-effort-lld-97adabf6-evidence/sequence-fit.png` — "Chrome capture of the generated sequence after Fit. All four participants and nine messages are visible. The sequence definition is unchanged from the captured revision."

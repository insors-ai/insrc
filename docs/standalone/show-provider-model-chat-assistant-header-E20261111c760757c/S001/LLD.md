<!-- insrc:artifact LLD-c760757cc9077508-s1 -->

# LLD: STORY-c760757cc9077508-s1 — Show <PROVIDER>/<model> as the chat assistant header label

## Summary

**Epic:** `show-provider-model-chat-assistant-header`
**HLD base run:** `wf-1794423251207-of26xe`
**HLD effective hash:** `c760757cc907...`

This story replaces the hardcoded 'claude' assistant header in the VS Code chat webview with the active run identity '<PROVIDER>/<model>' (provider uppercased, model lowercased, '' = CLI default). The webview already receives provider/model via the existing run-config echo, so the change is confined to the render path: a small compose helper in the webview source builds the label, and msgRow's assistant branch uses it instead of the literal. Live assistant-delta rows and session-restored replay rows both render through msgRow, so both get the label with no protocol, host, or persistence change.

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

**Surface level:** internal

### 2.1 `toViewModel`

```typescript
toViewModel(entry: TranscriptEntry | TurnEvent): RowViewModel
```

**Parameters:**
- `entry: TranscriptEntry | TurnEvent` — TranscriptEntry (replay) or TurnEvent (live) to map to a row view model

**Returns:** `RowViewModel` — The row's view model consumed by msgRow

**Preconditions:**
- entry is a well-formed TranscriptEntry or TurnEvent

**Postconditions:**
- Assistant rows keep kind 'assistant-text' and collapsible=true; no label is stored on the view model (label is composed at render time from run-config state)

### 2.2 `msgRow (webview inline copy)`

```typescript
msgRow(vm, host, role, inner?) — inline in renderRegistryWebviewSource; parity-pinned with the TS-side mapping
```

**Parameters:**
- `vm: RowViewModel` — the row view model
- `host: RenderHost` — renderer host (collapsible etc.)
- `role: string` — 'user' | 'assistant'
- `inner: Element | null` _(optional)_ — pre-rendered inner content

**Returns:** `Element` — The message row element appended to the transcript

**Preconditions:**
- run-config state (curProv, model) has been received, or the fallback applies
- vm carries text and optional meta.at

**Postconditions:**
- The assistant whoRow label is the composed run identity: provider.toUpperCase() + '/' + model.toLowerCase(), with '' model rendered per the empty-model rule (CLI default); the literal 'claude' no longer appears

## 3. Data model changes

### 3.1 `run-config webview state (curProv / model, set from HostToWebview 'run-config')` — field-modify

The webview's run-config handler state (curProv, m.model at chat-panel.ts:2702) is now also the source of the assistant whoRow label; no new field is added — the existing echoed provider/model strings are composed into the label. Empty provider (run-config not yet received) falls back to the literal-free placeholder; empty model ('') is the CLI default and renders without a trailing slash ambiguity per the compose rule.

```
no schema change: { type:'run-config', provider:string, model:string, effort:string } is consumed as-is
```

**Call sites:**
- `vscode-plugin/src/chat/render-registry.ts:450`
- `vscode-plugin/src/chat/chat-panel.ts:2702`
- `vscode-plugin/src/chat/protocol.ts:109`

## 4. Error paths

**Error cases**

- **msgRow renders an assistant row while curProv is still '' (run-config echo not yet processed)** (recoverable)
  - Detection: The compose helper treats provider==='' (run-config not yet received) as the fallback case at render time — detected by reading the current run-config state inside msgRow.
  - Response: Render the assistant label from the fallback (e.g. 'assistant') instead of crashing or showing 'undefined/undefined'; when run-config arrives, subsequent rows compose the real label.
  - User impact: Briefly a generic assistant header instead of PROVIDER/model on the very first rows; self-corrects on the next render.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| run-config received with provider='codex', model='' (CLI default model) | The compose rule for empty model does not produce a misleading trailing segment; the label shows the provider with the CLI-default rule applied (no bare 'CODEX/'). |
| Assistant row rendered before any run-config message arrived (first-paint race on panel open) | Label falls back to a neutral placeholder (not the literal 'claude') until the first run-config arrives; once run-config lands the next rendered/updated row shows the real identity. |
| run-config with provider='ollama', model='Qwen3.6:35B-A3B' | Label shows e.g. 'OLLAMA/qwen3.6:35b-a3b' — provider caps, model lowercased verbatim (colons/dashes preserved, only case lowered). |
| set-run-config changes model mid-session | After a set-run-config model change mid-session, newly rendered assistant rows show the new model; already-rendered rows keep their render-time label — acceptable since the header tracks the active run. |

**Invariants to preserve**

- whoRow keeps its signature whoRow(role, glyph, label, at) and the time-stamp behaviour (meta.at → insrc-when span) is unchanged; only the assistant label argument changes from the literal 'claude' to the composed run identity (vscode-plugin/src/chat/render-registry.ts:432-441,446-450). [[c1]]
- toViewModel's assistant branches (vscode-plugin/src/chat/render-registry.ts:131 transcript replay, :163 live delta) keep producing kind 'assistant-text', role 'assistant', collapsible true, and meta.at; no provider/model is persisted on the view model (chosen alternative a1 keeps the label render-time, run-config-sourced). [[c2]]
- The run-config protocol message shape { type:'run-config', provider, model, effort } (vscode-plugin/src/chat/protocol.ts:109) and its host poster (vscode-plugin/src/chat/chat-panel.ts:1059) are unchanged — the story consumes the echo, it does not extend it. [[c3]]

## 5. Test strategy

**Test framework:** `node:test via tsx (repo convention: npx tsx --test 'vscode-plugin/src/chat/__tests__/*.test.ts'); the webview render path is exercised through render-registry's fake-DOM harness in vscode-plugin/src/chat/__tests__`

**Test levels**

- **unit** — Prove the composed assistant label for every provider, the empty-model CLI-default case, the pre-run-config fallback, and replay/live parity through msgRow; update any assertion pinning the old literal 'claude'.
  - Subjects: `vscode-plugin/src/chat/render-registry.ts (msgRow/whoRow inline webview source + toViewModel parity)`, `vscode-plugin/src/chat/__tests__/chat-panel.test.ts`, `vscode-plugin/src/chat/__tests__/protocol.test.ts`
  - Fixtures: `run-config message { provider, model, effort } injected into the fake webview state`, `fake DOM harness from the render-registry tests`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `chat webview unit: msgRow assistant label composes 'CLAUDE/<model-lowercased>' from run-config state (render-registry fake-DOM test)`, `chat webview unit: msgRow assistant label composes 'CODEX/…' and 'OLLAMA/qwen3.6:35b-a3b' for those providers`, `chat webview unit: empty model ('') renders the CLI-default rule, not a trailing '/' artifact`, `chat webview unit: no run-config yet → neutral fallback label, never the literal 'claude'`, `parity test: TS-side mapping and the inline webview copy stay in sync (existing parity suite)` |
| `ac2` | `chat webview unit: a session-restored replay assistant row renders the same composed PROVIDER/model label as a live assistant-delta row (both through msgRow)` |
| `ac3` | `existing chat-panel/protocol suites updated: no assertion expects the literal 'claude' whoRow label; run-config echo behaviour (vscode-plugin/src/chat/chat-panel.ts:1059, vscode-plugin/src/chat/protocol.ts:109) unchanged` |

## 6. Migration

**State before:** msgRow's assistant branch hardcodes the whoRow label 'claude' (vscode-plugin/src/chat/render-registry.ts:450), regardless of the session's actual provider/model; the webview already holds the correct provider/model in run-config state (vscode-plugin/src/chat/protocol.ts:109, posted from vscode-plugin/src/chat/chat-panel.ts:1059).

**State after:** Every assistant message row (live delta and restored replay) renders '<PROVIDER>/<model>' from the active run-config echo; the literal 'claude' no longer appears in the renderer.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Replace the literal 'claude' assistant whoRow label in the webview source with a compose helper reading run-config state (provider.toUpperCase() + '/' + model.toLowerCase(); '' model = CLI default rule; '' provider = neutral fallback). — ↩ rollbackable
2. Update the render-registry parity copy and the unit assertions that pin the old literal label. — ↩ rollbackable

**Backward compat:** No persisted data changes: TranscriptEntry, the run-config message, and the session record are untouched, so stored sessions replay unchanged and old extension versions still read everything the new webview writes. The only behavioural delta is the label text itself (cosmetic). No public API changes (surfaceLevel internal).

## 7. Alternatives considered

### 7.1 a1: Compose the label in the webview from run-config state — **CHOSEN**

Smallest change: msgRow reads the already-echoed run-config provider/model and renders PROVIDER/model; zero protocol or host changes.

The webview keeps its current run-config state (curProv / model set by the `run-config` message, protocol.ts:109). msgRow's assistant branch composes the label at render time from that state: `whoRow('assistant', glyph, (curProv||'?').toUpperCase() + '/' + (curModel||'').toLowerCase(), at)`. No change to toViewModel, RowViewModel meta, protocol, or the host; when model is '' the label is 'PROVIDER/' (CLI default). Live deltas and restored replays render identically because both go through the same msgRow.

### 7.2 a2: Stamp provider/model into RowViewModel meta per assistant row

Thread provider/model through the view-model meta so each assistant row carries its own label; historically accurate after model switches.

Extend RowViewModel meta with `provider`/`model` on the two assistant branches of toViewModel (render-registry.ts:131 transcript replay, :163 live delta). The host stamps each assistant TranscriptEntry (or the delta event) with the session's provider/model at write time (session-store/session-output path, using the ChatSession's provider + model at session-store.ts:110-127), so replayed history shows the provider/model that produced it even after a set-run-config model change. msgRow then reads vm.meta.provider/model and composes the label.

**Rejected because:** Over-built for a run-identity header: spans protocol/session-store/host write path plus back-compat reads; violates minimal scope (s3 rank 2).

### 7.3 a3: Hybrid: run-config for live rows, meta for replayed rows

Split behaviour between live and replay paths; maximum accuracy at maximum cost.

Hybrid: label composed in the webview from run-config state (a1) as the live source, and toViewModel/stamping (a2) only for restored replay rows so old sessions still label correctly. Not needed if a1's fallback handles missing run-config, so this is the most code for the least marginal benefit.

**Rejected because:** Two sources of truth and the widest diff for a cosmetic header; no marginal benefit once a1 handles the missing-run-config fallback (s3 rank 3).

### 7.4 a4: New assistant-identity protocol message

Dedicated per-turn identity message; rejected as redundant with the existing run-config echo.

Change the host to send a dedicated `assistant-identity { provider, model }` with every turn-event / session-restored, independent of run-config. Equivalent information, but adds a new protocol message instead of reusing the run-config echo.

**Rejected because:** New protocol message duplicating the existing run-config echo; violates reuse (s3 rank 4).

## 8. References

- **[[c1]]** `code` `vscode-plugin/src/chat/render-registry.ts:116-179` — "s1 bundle 1 (structural-map): toViewModel (render-registry.ts:116) maps a TranscriptEntry or TurnEvent to a RowViewModel; assistant transcript branch line 131 and live delta branch line 163 carry meta"
- **[[c2]]** `code` `vscode-plugin/src/chat/protocol.ts:109` — "s1 bundle 2 (capability-discovery): the host posts { type:'run-config', provider, model, effort } to the webview on open/switch/restore and after set-run-config; ChatSession carries provider + optiona"
- **[[c3]]** `code` `vscode-plugin/src/chat/session-store.ts:31-106` — "s1 bundle 3 (how-does-it-work): TranscriptEntry is a discriminated union on role (session-store.ts:31); existing chat __tests__ suites pin the current rendering and must drop assertions expecting the "

<!-- insrc:artifact LLD-c5c764585f6714f7-S001 -->

# LLD: E20261030c5c76458:S001

## Summary

**Epic:** `group-vs-code-model-tiers-settings`
**HLD base run:** `wf-1793361848441-7grzfp`
**HLD effective hash:** `f9af73195905...`

This Story adds a dedicated 'Model Tiers' webview panel to the VS Code extension, replacing the hard-to-read flat settings list with one card per tier (core/mid/cheap) showing runner, model and effort dropdowns, cloud/local hosting badges, and an inline 'not supported'/'not listed'/'floor-raised' status, plus an editable Core-floor control — matching the user-approved mock at mocks/model-tiers-grouped.html. It reads and writes the same insrc.models.* configuration keys the native settings page already uses; no new config keys are introduced. Non-goal: the mock's 'Check an unlisted model…' link is NOT implemented by this Story — that capability continues to be reached only through the existing 'insrc: Set model tier' QuickPick wizard's checkUnlisted flow (model-tier-picker.ts:360-449), which this Story leaves untouched.

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

### 2.1 `currentTier`

```typescript
export function currentTier(defs: ModelDefinitions, raw: Record<string, unknown>, tier: Tier): TierValue | undefined
```

**Parameters:**
- `defs: ModelDefinitions` — the daemon's model catalog, used to resolve the stored runner/model strings into a typed value
- `raw: Record<string, unknown>` — the plugin's current insrc.models.* configuration snapshot
- `tier: Tier` — which of core/mid/cheap to resolve

**Returns:** `TierValue | undefined` — the tier's current runner/model/effort as configured, or undefined if unset

**Preconditions:**
- raw is the plugin's own machine-scope insrc.models.* configuration snapshot, not arbitrary JSON
- tier is one of 'core' | 'mid' | 'cheap'

**Postconditions:**
- does not mutate defs or raw
- visibility changes from private (vscode-plugin/src/models/model-tier-picker.ts:149) to exported; no signature or behavior change

### 2.2 `tierStatus`

```typescript
export function tierStatus(defs: ModelDefinitions, raw: Record<string, unknown>, tier: Tier, coreFloor: Tier): TierStatus
```

**Parameters:**
- `defs: ModelDefinitions` — the daemon's model catalog, used to classify whether the configured model is still listed/supported
- `raw: Record<string, unknown>` — the plugin's current insrc.models.* configuration snapshot
- `tier: Tier` — which of core/mid/cheap to classify
- `coreFloor: Tier` — the resolved insrc.models.coreFloor setting, used to detect when this tier is raised

**Returns:** `TierStatus` — one of ok | not-supported | not-listed | floor-raised for this tier

**Preconditions:**
- same raw/tier contract as currentTier
- coreFloor is one of 'core' | 'mid' | 'cheap'

**Postconditions:**
- pure — no I/O, no mutation
- returns 'floor-raised' only when tier ranks below coreFloor among core > mid > cheap
- classifies a configured-but-unresolved model: family.host is set only for the family whose CLI runs on a host such as Ollama with a closed model list (vscode-plugin/src/models/definitions.ts:32-33); when familyOf(defs, configured runner) resolves to such a family, returns 'not-supported' (a closed list can't fall back); when it resolves to an open vendor family (host undefined, e.g. claude/codex), returns 'not-listed' (runs the default) — the same two-way split pickModel's inline marker already applies at vscode-plugin/src/models/model-tier-picker.ts:335-339
- additionally classifies the case pickModel's marker does not cover: when the configured runner itself does not resolve to any family in defs (an unknown/stale runner), tierStatus reports 'not-listed' directly from that unresolved lookup, rather than through currentTier's fallback (vscode-plugin/src/models/model-tier-picker.ts:149-165), which silently substitutes the default family's value for that case and would otherwise lose the distinction

### 2.3 `renderModelTiers`

```typescript
export function renderModelTiers(deps: ModelTiersRendererDeps): ModelTiersRenderer
```

**Parameters:**
- `deps: ModelTiersRendererDeps` — injected modelDefinitions + rawConfig the renderer reads from

**Returns:** `ModelTiersRenderer` — a () => Promise<string> thunk the panel host calls to (re)render the webview body, mirroring RepoConfigRenderer's shape (vscode-plugin/src/panels/repo-config.ts:82)

**Preconditions:**
- deps.modelDefinitions and deps.rawConfig reflect the current model catalog and insrc.models.* settings at render time

**Postconditions:**
- returned HTML embeds one card per tier built from currentTier + tierStatus, plus the mock's panel-foot Core-floor <select> bound to the current insrc.models.coreFloor value, matching mocks/model-tiers-grouped.html
- does NOT render the mock's panel-foot 'Check an unlisted model…' link — out of scope for this Story (non-goal; see Summary); that affordance remains reachable only via the existing 'insrc: Set model tier' QuickPick wizard's checkUnlisted flow
- performs no writes

### 2.4 `createModelTiersWriteHandler`

```typescript
export function createModelTiersWriteHandler(deps: ModelTiersWriteHandlerDeps): (write: ModelTiersWrite) => void
```

**Parameters:**
- `deps: ModelTiersWriteHandlerDeps` — injected config-write + refresh callback, mirroring RepoConfigWriteDeps (vscode-plugin/src/panels/repo-config.ts:40)

**Returns:** `(write: ModelTiersWrite) => void` — a handler the panel host forwards every incoming ModelTiersWrite message to, mirroring createRepoConfigWriteHandler's shape (vscode-plugin/src/panels/repo-config.ts:174)

**Errors:**
- `none (logged, not thrown)` when the daemon's config.write call rejects (a thrown/caught error, e.g. daemon unreachable); handled the same way createRepoConfigWriteHandler's catch block already handles it (repo-config.ts:220-222) — logs via deps.logger and does NOT call deps.refresh()

**Preconditions:**
- write.kind === 'tierField' addresses an existing insrc.models.tiers.<tier>.<field> key (vscode-plugin/package.json:360-432); write.kind === 'coreFloor' addresses the existing insrc.models.coreFloor key — no new keys are introduced

**Postconditions:**
- when config.write RESOLVES (whether the daemon accepts or refuses the write), calls deps.refresh() unconditionally, exactly as createRepoConfigWriteHandler's deps.refresh() call (repo-config.ts:219) runs on both an accepted and a refused resolution
- when config.write instead REJECTS (throws), logs the failure and does NOT call deps.refresh() — the panel keeps showing its last-rendered (pre-write) state until the next natural re-render, exactly as createRepoConfigWriteHandler's catch branch (repo-config.ts:220-222) behaves on a rejection

### 2.5 `openModelTiers`

```typescript
openModelTiers(): void
```

**Returns:** `void` — opens/reveals the singleton Model Tiers panel; if deps.modelTiersRenderer is unset, renders a placeholder body instead of the real cards

**Postconditions:**
- always opens/reveals the panel, exactly as openRepoConfiguration unconditionally does (vscode-plugin/src/panels/webview-host.ts:398-415) — it is never a no-op
- when deps.modelTiersRenderer is unset, shows a static placeholder body (mirroring REPO_PLACEHOLDER, webview-host.ts:293-313) instead of the rendered cards
- panel content reflects the latest rawConfig/modelDefinitions at the moment it's called, when a renderer is present
- new method on WebviewPanelHost (vscode-plugin/src/panels/types.ts:34), implemented in webview-host.ts alongside the existing openRepoConfiguration

## 3. Data model changes

### 3.1 `TierStatus` — new

type TierStatus = { kind: 'ok' } | { kind: 'floor-raised'; to: Tier } | { kind: 'not-supported'; model: string } | { kind: 'not-listed'; model: string }. Generalizes pickModel's existing inline marker text into a reusable value.

**Call sites:**
- `vscode-plugin/src/models/model-tier-picker.ts:327-338`
- `vscode-plugin/src/panels/model-tiers.ts`

### 3.2 `ModelTiersRendererDeps` — new

interface ModelTiersRendererDeps { modelDefinitions: ModelDefinitions; rawConfig: Record<string, unknown>; }. Narrower analog of RepoConfigRendererDeps (vscode-plugin/src/panels/types.ts:186-193).

**Call sites:**
- `vscode-plugin/src/panels/model-tiers.ts`
- `vscode-plugin/src/extension.ts:391-434`

### 3.3 `ModelTiersWrite` — new

type ModelTiersWrite = { kind: 'tierField'; tier: Tier; field: 'runner' | 'model' | 'effort'; value: string } | { kind: 'coreFloor'; value: Tier }. Covers both editable controls in the approved mock (mocks/model-tiers-grouped.html:96-157 per-tier dropdowns, :160-166 the panel-foot Core-floor select); structurally a discriminated-union widening of the single-shape RepoConfigWrite (vscode-plugin/src/panels/types.ts:202-206), needed because this panel writes two distinct config paths (insrc.models.tiers.<tier>.<field> and insrc.models.coreFloor) where Repo Configuration only ever writes one shape.

**Call sites:**
- `vscode-plugin/src/panels/model-tiers.ts`
- `vscode-plugin/src/panels/webview-host.ts:44-70`

### 3.4 `ModelTiersWriteHandlerDeps` — new

interface mirroring RepoConfigWriteDeps (vscode-plugin/src/panels/repo-config.ts:40): carries the daemon config.write call and a refresh(): void callback.

**Call sites:**
- `vscode-plugin/src/panels/model-tiers.ts`
- `vscode-plugin/src/extension.ts:452-458`

### 3.5 `WebviewPanelHostDeps` — field-add

adds modelTiersRenderer?: ModelTiersRenderer | undefined and onModelTiersWrite?: ((write: ModelTiersWrite) => void) | undefined.

**Call sites:**
- `vscode-plugin/src/panels/types.ts:246`
- `vscode-plugin/src/extension.ts:391-434`

### 3.6 `WebviewPanelHost` — field-add

adds method openModelTiers(): void alongside the existing openRepoConfiguration(): void.

**Call sites:**
- `vscode-plugin/src/panels/types.ts:34`
- `vscode-plugin/src/panels/webview-host.ts:398`

### 3.7 `MenuItem` — field-modify

widens action: 'detailed' | 'repoConfig' to 'detailed' | 'repoConfig' | 'modelTiers', and the status-bar menu array gains a { label: 'Model Tiers', action: 'modelTiers' } entry.

**Call sites:**
- `vscode-plugin/src/panels/types.ts:221`
- `vscode-plugin/src/panels/webview-host.ts:44-70`

## 4. Error paths

**Error cases**

- **The daemon's config.write call rejects (throws) — daemon unreachable / IPC error — while saving a tier field or coreFloor change from the panel.** (recoverable)
  - Detection: createModelTiersWriteHandler's call to config.write throws, caught in the handler's own try/catch, mirroring createRepoConfigWriteHandler's catch block (repo-config.ts:220-222).
  - Response: The handler logs the failure via its injected deps.logger and does NOT call deps.refresh() — the same as the cited catch block, which only logs.
  - User impact: The panel keeps showing its last-rendered (pre-write) state; the control the user just changed may visually disagree with the unwritten config until the panel is next reopened or manually refreshed. No silent data loss, but no inline error toast (consistent with the existing Repo Configuration write path).
- **The daemon's config.write call resolves but REFUSES the write (e.g. a consent/validation refusal inside the daemon, result.ok === false) while saving a tier field or coreFloor change.** (recoverable)
  - Detection: createModelTiersWriteHandler's call to config.write resolves with { ok: false, reason }.
  - Response: The handler calls deps.refresh() unconditionally on this resolution, exactly as createRepoConfigWriteHandler's deps.refresh() call (repo-config.ts:219) runs on both an accepted and a refused resolution.
  - User impact: The panel immediately re-renders from the daemon's current (still unwritten) config, so the control reverts to its last-known-good value.
- **modelDefinitions is stale or empty (daemon model catalog not yet loaded) when the panel renders, so the configured runner does not resolve to any family.** (recoverable)
  - Detection: tierStatus's own familyOf(defs, configured runner) lookup returns undefined, independent of currentTier's fallback (which would otherwise silently substitute the default family).
  - Response: tierStatus reports 'not-listed' directly from the unresolved lookup.
  - User impact: User sees an accurate 'not served by X' warning instead of a blank panel.
- **A webview postMessage arrives with a malformed ModelTiersWrite, e.g. from a stale webview script version.** (recoverable)
  - Detection: The host's onMessage handler validates the message shape before forwarding: for a tier-field write, type === 'modelTiersWrite', kind === 'tierField', tier one of 'core'|'mid'|'cheap', field one of 'runner'|'model'|'effort', value a string; for a core-floor write, kind === 'coreFloor' and value one of 'core'|'mid'|'cheap' — mirroring handleRepoMessage's existing repoWrite shape validation (webview-host.ts:322-333).
  - Response: A message that fails this check is silently dropped (no-op) and never reaches onModelTiersWrite, exactly as an unrecognized message is today (webview-host.ts:371, 'Anything else is a silent no-op').
  - User impact: No write occurs for a malformed message; the panel's displayed state is unaffected.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| All three tiers configured identically (same runner/model/effort). | Three distinct cards are still rendered, each independently editable; no dedup logic is applied. |
| A tier's configured model has been removed from the catalog entirely. | tierStatus returns not-supported; the dropdown shows the removed model styled distinctly with effort disabled, matching mocks/model-tiers-grouped.html. |
| insrc.models.coreFloor is set to 'cheap' (the lowest tier). | tierStatus never returns floor-raised for any tier; the floor-badge is omitted from all three cards. |
| User changes the panel-foot Core-floor dropdown to a different tier. | A { kind: 'coreFloor', value } ModelTiersWrite is posted; createModelTiersWriteHandler writes insrc.models.coreFloor and the panel re-renders with the new floor-raised badges applied to the appropriate tier(s). |
| User changes the same dropdown twice in quick succession before the first config.write resolves. | Each ModelTiersWrite is forwarded and handled independently in arrival order; this Story adds no debouncing. |

**Invariants to preserve**

- The Model Tiers panel reads and writes only the existing insrc.models.tiers.<tier>.<field> and insrc.models.coreFloor keys; no new configuration keys are introduced. [[c1]]
- The write path forwards a DTO from webview to host to an injected sink which then calls config.write + refresh(), exactly as the existing RepoConfigWrite path already does. [[c2]]
- currentTier's resolution behavior is unchanged by exporting it; the existing 'insrc: Set model tier' QuickPick wizard (runSetModelTier) continues to work identically. [[c5]]

## 5. Test strategy

**Test framework:** `node:test (via npx tsx --test), matching repo-config.test.ts / webview-host.test.ts / model-tier-picker.test.ts`

**Test levels**

- **unit** — Verify the new pure data layer (tierStatus, exported currentTier) classifies every status branch correctly with fake ModelDefinitions/raw config, no VS Code APIs involved, including the floor-raised branch at every coreFloor value.
  - Subjects: `vscode-plugin/src/models/model-tier-picker.ts (currentTier, tierStatus)`
  - Fixtures: `a fake ModelDefinitions with a closed-list (host-set) family, an open vendor family, and an unresolvable runner case`, `fake insrc.models.* raw config objects for all three tiers`, `coreFloor fixtures at 'core', 'mid', and 'cheap' to exercise floor-raised for zero, some, and no tiers`
- **unit** — Verify renderModelTiers produces one card per tier plus the Core-floor footer control with the correct dropdown options, hosting badge, and inline status text, and that createModelTiersWriteHandler maps both ModelTiersWrite kinds (tierField and coreFloor) to the right config.write key, calling refresh() only when the write call resolves (not when it rejects).
  - Subjects: `vscode-plugin/src/panels/model-tiers.ts (renderModelTiers, createModelTiersWriteHandler)`
  - Fixtures: `fake ModelTiersRendererDeps (modelDefinitions, rawConfig)`, `fake ModelTiersWriteHandlerDeps with a spy config.write (resolving ok, resolving refused, and rejecting) + refresh`
- **unit** — Verify WebviewPanelHost.openModelTiers opens/reveals a singleton panel via the injected modelTiersRenderer, and that the status-bar MenuItem list carries the new 'Model Tiers' entry.
  - Subjects: `vscode-plugin/src/panels/webview-host.ts (openModelTiers, status-bar menu array)`
  - Fixtures: `fake PanelHandle (as already used in webview-host.test.ts)`, `WebviewPanelHostDeps with modelTiersRenderer/onModelTiersWrite set`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `model-tiers.test.ts: renderModelTiers renders one labelled card per tier (core/mid/cheap), not a flat field list`, `model-tiers.test.ts: a tier card shows a cloud/local hosting badge matching its resolved family's hosting`, `model-tiers.test.ts: a tier whose configured model is not in the catalog renders the not-supported note inline, matching mocks/model-tiers-grouped.html` |
| `ac2` | `model-tiers.test.ts: renderModelTiers renders the panel-foot Core-floor <select> bound to the current insrc.models.coreFloor value, matching mocks/model-tiers-grouped.html`, `model-tier-picker.test.ts: tierStatus returns floor-raised for every tier ranked below coreFloor, and omits it when coreFloor is 'cheap'`, `model-tiers.test.ts: createModelTiersWriteHandler maps a { kind: 'coreFloor', value } write to the insrc.models.coreFloor key` |

## 6. Migration

**State before:** The only way to view or edit model-tier settings is the native VS Code Settings UI's 9 flat insrc.models.tiers.{core,mid,cheap}.{runner,model,effort} string fields plus insrc.models.coreFloor (vscode-plugin/package.json:360-432), or the one-tier-at-a-time 'insrc: Set model tier' QuickPick wizard (vscode-plugin/src/models/model-tier-picker.ts:118).

**State after:** A new 'Model Tiers' webview panel (vscode-plugin/src/panels/model-tiers.ts), opened via a new status-bar menu entry and command, renders the same three tiers as grouped cards with live status; the native Settings fields and the existing QuickPick wizard remain fully functional and unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Export currentTier from model-tier-picker.ts (visibility-only change) and add the new pure tierStatus helper alongside it. — ↩ rollbackable
2. Add the new model-tiers.ts module (renderModelTiers, ModelTiersWrite, createModelTiersWriteHandler) with no changes to any existing file. — ↩ rollbackable
3. Widen WebviewPanelHostDeps / WebviewPanelHost / MenuItem in types.ts and implement openModelTiers + the new menu entry in webview-host.ts. — ↩ rollbackable
4. Wire the renderer, write-handler, and a new 'insrc.status.modelTiers' command into extension.ts's existing panelHost construction. — ↩ rollbackable

**Backward compat:** Purely additive: no existing settings keys, commands, or exported function signatures are removed or changed in behavior. currentTier's only change is export visibility (was private).

## 7. Alternatives considered

### 7.1 a1: Grouped QuickPick rework

Replace the one-tier-at-a-time QuickPick with a single list showing all three tiers at once.

Extend runSetModelTier's entry point to render a top-level QuickPickItem per tier; picking a tier drops into the existing wizard unchanged.

**Rejected because:** Violates the core visual-grouping requirement (c1) and only partially addresses hosting visibility and in-place status (c2/c3) — does not meet what the user explicitly approved in the mock.

### 7.2 a2: Dedicated Model Tiers webview panel (Repo Configuration template) — **CHOSEN**

A new webview panel, structurally identical to the existing Repo Configuration panel, with one card per tier matching the approved mock.

New model-tiers.ts exports renderModelTiers mirroring renderRepoConfig, plus ModelTiersWrite/createModelTiersWriteHandler mirroring RepoConfigWrite/createRepoConfigWriteHandler. WebviewPanelHost gains openModelTiers mirroring openRepoConfiguration; extension.ts wires renderer + write-handler + a new command, copying the existing three-point wiring. A new pure tierStatus helper generalizes pickModel's inline marker logic.

### 7.3 a3: Widen the Detailed-Status tabbed panel with a 4th 'Models' tab

Add a 'models' DetailTab to the existing tabbed Detailed-Status panel instead of a standalone panel.

Add 'models' to the DetailTab union, write a TabRenderer for it, and wire a config-write path into the shared DaemonDataGateway all three existing tabs depend on.

**Rejected because:** Fails reuse/low-risk and no-facade-pollution constraints (c4/c5) by forcing a write concern into a facade/host built and shared as read-only, for a worse architectural fit and higher cost (L vs M) than a2.

## 8. References

- **[[c1]]** `analyze-bundle` `vscode-plugin/package.json:360-432` — "9 flat string settings insrc.models.tiers.{core,mid,cheap}.{runner,model,effort} plus insrc.models.coreFloor"
- **[[c2]]** `analyze-bundle` `vscode-plugin/src/panels/repo-config.ts:40,82,174` — "renderRepoConfig / RepoConfigWrite / createRepoConfigWriteHandler — the write-path template"
- **[[c3]]** `analyze-bundle` `vscode-plugin/src/panels/types.ts:34,186-193,202-206,221,246; vscode-plugin/src/panels/webview-host.ts:44-70,322-351,398-415` — "WebviewPanelHost / WebviewPanelHostDeps / MenuItem / openRepoConfiguration"
- **[[c4]]** `analyze-bundle` `vscode-plugin/src/extension.ts:391-434,444,452-458,480-482` — "extension.ts's three-point wiring of the Repo Configuration panel"
- **[[c5]]** `analyze-bundle` `vscode-plugin/src/models/model-tier-picker.ts:149,252,327-338` — "currentTier / saveTier / pickModel's inline not-supported marker"
- **[[c6]]** `analyze-bundle` `vscode-plugin/src/models/definitions.ts:54,60,83` — "ModelDefinitions / familyDefault / classifyDaemonFailure"
- **[[c7]]** `analyze-bundle` `vscode-plugin/src/panels/__tests__/repo-config.test.ts; vscode-plugin/src/panels/__tests__/webview-host.test.ts; vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` — "existing test templates for the new panel/model-tier tests"

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 2 could not be verified · 14 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-30T12:31:28.948Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| coverage-of-intent | ac1/ac2 in the Acceptance mapping table represent the complete, upstream-approved set of acceptance criteria for this Story (nothing else is missing from the mock/scope). | §1 states "Standalone feature — no parent HLD... There are no HLD shared contracts to honour," and a glob of docs/standalone/group-vs-code-model-tiers-settings-E20261030c5c76458/** returns only this one LLD.md — no SPEC/brainstorm/ISSUE artifact exists that enumerates a numbered criteria list to check ac1+ac2 completeness against. The two listed criteria (grouped per-tier cards with status, and the Core-floor control) do match the mock's two headline features in mocks/model-tiers-grouped.html, but there is no authoritative source confirming no third criterion exists. | Ask the author/user to confirm ac1+ac2 is the full intended scope, or point to an upstream spec/brainstorm artifact if one exists outside the standalone docs folder. |
| tests | Every acceptance criterion has a mapped proving test, and the mapped test files/subjects are consistent with where the new code is designed to live. | ac1 and ac2 each map to named tests in model-tiers.test.ts / model-tier-picker.test.ts, consistent with §2's subjects (model-tiers.ts, model-tier-picker.ts). However, as in the coverage-of-intent item, there is no upstream artifact enumerating a complete criteria set beyond ac1/ac2, so completeness of criterion-to-test coverage can only be confirmed for the two criteria actually stated, not against an independent upstream list. | Same as coverage-of-intent: confirm with the author/user whether ac1+ac2 is the complete criteria set before treating test coverage as exhaustive. |

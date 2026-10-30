<!-- insrc:artifact PLAN-c5c764585f6714f7-S001 -->

# Plan: E20261030c5c76458:S001

## Summary

**Epic:** `group-vs-code-model-tiers-settings`
**LLD run:** `wf-1793361848441-7grzfp`
**LLD effective hash:** `f9af73195905...`

Building this Story is a straight-line, five-task sequence: export/add two small pure helpers, write one new self-contained panel file, widen three small existing interfaces plus their host-side implementation, wire the panel into the extension's existing construction site, then round out tests. Nothing here touches the native Settings UI or the existing QuickPick wizard — this is a purely additive build.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Export currentTier and add the tierStatus helper | S | — | unit: model-tier-picker.test.ts: currentTier remains exported with unchanged resolution behavior; unit: model-tier-picker.test.ts: tierStatus classifies ok/not-supported/not-listed/floor-raised across a host-set family, an open vendor family, an unresolvable runner, and all three coreFloor values | [[c1]] |
| 2 | **`t2`** Create model-tiers.ts: renderer, write DTO, and write handler | M | `t1` | unit: model-tiers.test.ts: renderModelTiers renders one labelled card per tier (core/mid/cheap), not a flat field list; unit: model-tiers.test.ts: renderModelTiers renders the panel-foot Core-floor <select> bound to the current insrc.models.coreFloor value; unit: model-tiers.test.ts: createModelTiersWriteHandler maps both ModelTiersWrite kinds to the right config.write key and calls refresh() only when config.write resolves (not when it rejects) | [[c2]] [[c3]] |
| 3 | **`t3`** Widen panel-host types and wire openModelTiers + the status-bar menu entry | S | `t2` | unit: webview-host.test.ts: openModelTiers always opens/reveals the panel and falls back to a placeholder body when modelTiersRenderer is unset; unit: webview-host.test.ts: the status-bar MenuItem list carries the new 'Model Tiers' entry alongside 'Repo Configuration'; unit: webview-host.test.ts: a malformed postMessage of either ModelTiersWrite kind is silently dropped and never reaches onModelTiersWrite | [[c4]] |
| 4 | **`t4`** Wire the Model Tiers panel into extension.ts | S | `t2`, `t3` | unit: model-tiers.test.ts / webview-host.test.ts: createModelTiersWriteHandler's refresh callback, wired exactly as in extension.ts's panelHost construction, invokes openModelTiers after a resolved write | [[c5]] |
| 5 | **`t5`** Write unit tests for the new data layer, renderer/handler, and host wiring | M | `t1`, `t2`, `t3`, `t4` | unit: model-tiers.test.ts: a tier card shows a cloud/local hosting badge matching its resolved family's hosting; unit: model-tiers.test.ts: a tier whose configured model is not in the catalog renders the not-supported note inline, matching mocks/model-tiers-grouped.html; unit: model-tier-picker.test.ts: tierStatus returns floor-raised for every tier ranked below coreFloor, and omits it when coreFloor is 'cheap'; unit: model-tiers.test.ts: createModelTiersWriteHandler maps a { kind: 'coreFloor', value } write to the insrc.models.coreFloor key | [[c6]] |

### 1.1 E20261030c5c76458:S001:T001 — Export currentTier and add the tierStatus helper

In model-tier-picker.ts: change currentTier from a private function to an exported one (no signature/behavior change), and add a new exported pure function tierStatus(defs, raw, tier, coreFloor): TierStatus that classifies ok/not-supported/not-listed/floor-raised, generalizing pickModel's existing inline marker logic and the floor-vs-coreFloor rank comparison.

**Acceptance checks:**
- currentTier is exported from model-tier-picker.ts with an unchanged signature and behavior; runSetModelTier's existing QuickPick flow still passes its existing tests unmodified
- tierStatus returns 'not-supported' for a configured model unresolved in a host-set (closed-list) family, 'not-listed' for the same in an open vendor family or an unresolved runner, 'floor-raised' when the tier ranks below coreFloor, and 'ok' otherwise

### 1.2 E20261030c5c76458:S001:T002 — Create model-tiers.ts: renderer, write DTO, and write handler

New file vscode-plugin/src/panels/model-tiers.ts exporting: ModelTiersRendererDeps, renderModelTiers(deps): ModelTiersRenderer (one card per tier via currentTier+tierStatus, plus the Core-floor footer select; no 'Check an unlisted model…' link per the documented non-goal); the ModelTiersWrite discriminated union ({kind:'tierField',...}|{kind:'coreFloor',...}); ModelTiersWriteHandlerDeps; and createModelTiersWriteHandler(deps): (write) => void, which calls deps.refresh() when config.write resolves (ok or refused) and does not call it when config.write rejects.

**Acceptance checks:**
- renderModelTiers's output embeds one labelled card per tier (core/mid/cheap) with runner/model/effort dropdowns, a cloud/local hosting badge, inline tierStatus text, and the Core-floor select bound to the current coreFloor value
- createModelTiersWriteHandler maps a {kind:'tierField'} write to insrc.models.tiers.<tier>.<field> and a {kind:'coreFloor'} write to insrc.models.coreFloor, calling deps.refresh() on both an accepted and a refused resolution but not on a rejection

### 1.3 E20261030c5c76458:S001:T003 — Widen panel-host types and wire openModelTiers + the status-bar menu entry

In types.ts: add openModelTiers(): void to WebviewPanelHost; add modelTiersRenderer?/onModelTiersWrite? to WebviewPanelHostDeps; widen MenuItem.action to include 'modelTiers'. In webview-host.ts: implement openModelTiers (opens/reveals the singleton panel; placeholder body when no renderer is injected, exactly as openRepoConfiguration does today), a handleModelTiersMessage validating the incoming postMessage shape for both ModelTiersWrite kinds before forwarding to onModelTiersWrite, and add a 'Model Tiers' entry to the status-bar menu array alongside 'Repo Configuration'.

**Acceptance checks:**
- openModelTiers always opens/reveals the panel (never a no-op) and shows the placeholder body when modelTiersRenderer is unset
- a malformed/unrecognized postMessage is silently dropped and never reaches onModelTiersWrite, matching the existing fallback behavior for an unrecognized message
- the status-bar menu offers 'Model Tiers' alongside the existing 'Repo Configuration' entry

### 1.4 E20261030c5c76458:S001:T004 — Wire the Model Tiers panel into extension.ts

In extension.ts's existing panelHost construction, add modelTiersRenderer: renderModelTiers({...}) and onModelTiersWrite: createModelTiersWriteHandler({...refresh: () => panelHost.openModelTiers()}), and register a new 'insrc.status.modelTiers' command calling panelHost.openModelTiers(), copying the existing repoConfig wiring pattern verbatim.

**Acceptance checks:**
- invoking the new command (or the status-bar menu entry) opens the Model Tiers panel showing live data from the daemon's current model definitions and insrc.models.* config
- a write made in the panel round-trips through config.write and is reflected back after refresh, exactly as the Repo Configuration panel's existing write path already does

### 1.5 E20261030c5c76458:S001:T005 — Write unit tests for the new data layer, renderer/handler, and host wiring

Add/extend tests per the approved test strategy: model-tier-picker.test.ts for currentTier (export, unchanged behavior) and tierStatus (all four status branches across host-set/open/unresolved families and all three coreFloor values); model-tiers.test.ts for renderModelTiers (card content, hosting badges, Core-floor select) and createModelTiersWriteHandler (both write kinds, refresh-on-resolve-not-on-reject); webview-host.test.ts for openModelTiers (no-op-never, placeholder fallback) and the new menu entry.

**Acceptance checks:**
- every acceptanceMapping proving test named in the LLD's ac1 and ac2 rows exists and passes
- a rejecting config.write does not call refresh, while a resolved-but-refused config.write does call refresh
- a malformed postMessage of either ModelTiersWrite kind ('tierField' or 'coreFloor') is silently dropped and never reaches onModelTiersWrite
- a removed/unresolvable configured model renders the not-supported or not-listed styling per tierStatus's classification
- three identically-configured tiers render as three independent, separately-editable cards
- two rapid writes to the same control are each forwarded and handled independently in arrival order
- the full vscode-plugin test suite (npx tsx --test, default node, per project convention) passes with these additions and no existing test is modified to pass artificially

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| vscode-plugin/src/models/model-tier-picker.ts (currentTier, tierStatus) | `t1`, `t5` |
| vscode-plugin/src/panels/model-tiers.ts (renderModelTiers, createModelTiersWriteHandler) | `t2`, `t5` |
| vscode-plugin/src/panels/webview-host.ts (openModelTiers, status-bar menu array) | `t3`, `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails.api[currentTier, tierStatus]`
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails.api[renderModelTiers] + dataModelChanges[ModelTiersRendererDeps]`
- **[[c3]]** `prior-artifact` `LLD S001 contractDetails.api[createModelTiersWriteHandler] + dataModelChanges[ModelTiersWrite, ModelTiersWriteHandlerDeps] + errorPaths`
- **[[c4]]** `prior-artifact` `LLD S001 contractDetails.api[openModelTiers] + dataModelChanges[WebviewPanelHostDeps, WebviewPanelHost, MenuItem]`
- **[[c5]]** `prior-artifact` `LLD S001 migration.migrationSteps[4] (extension.ts wiring)`
- **[[c6]]** `prior-artifact` `LLD S001 testStrategy + errorPaths.edgeCases`

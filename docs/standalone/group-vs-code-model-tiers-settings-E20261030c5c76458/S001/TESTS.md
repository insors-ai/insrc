<!-- insrc:artifact TESTS-c5c764585f6714f7-S001 -->

# Tests: c5c764585f6714f7 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 15 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-30T13:12:58.093Z on commit `9e647cf13`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-tier-picker.test.ts: currentTier remains exported with unchanged resolution behavior**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-tier-picker.test.ts: currentTier remains exported with unchanged resolution behavior | `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` |

**unit: model-tier-picker.test.ts: tierStatus classifies ok/not-supported/not-listed/floor-raised across a host-set family, an open vendor family, an unresolvable runner, and all three coreFloor values**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-tier-picker.test.ts: tierStatus classifies ok/not-supported/not-listed/floor-raised across a host-set family, an open vendor family, an unresolvable runner, and all three coreFloor values | `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` | 0 | 8 | 0.3 s |  |

## t2

Run at 2026-10-30T13:17:49.021Z on commit `14af75a9c`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-tiers.test.ts: renderModelTiers renders one labelled card per tier (core/mid/cheap), not a flat field list**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | renderModelTiers: one labelled card per tier (core/mid/cheap), not a flat field list | `vscode-plugin/src/panels/__tests__/model-tiers.test.ts` |

**unit: model-tiers.test.ts: renderModelTiers renders the panel-foot Core-floor <select> bound to the current insrc.models.coreFloor value**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | renderModelTiers: the panel-foot Core-floor <select> is bound to the current insrc.models.coreFloor value | `vscode-plugin/src/panels/__tests__/model-tiers.test.ts` |

**unit: model-tiers.test.ts: createModelTiersWriteHandler maps both ModelTiersWrite kinds to the right config.write key and calls refresh() only when config.write resolves (not when it rejects)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | createModelTiersWriteHandler: a {kind:'tierField'} write maps to ['models','tiers',tier,field]; a {kind:'coreFloor'} write maps to ['models','coreFloor'] | `vscode-plugin/src/panels/__tests__/model-tiers.test.ts` |
| pass | createModelTiersWriteHandler: refresh() runs on an accepted write and on a refused write, never on a rejected one | `vscode-plugin/src/panels/__tests__/model-tiers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/panels/__tests__/model-tiers.test.ts` | 0 | 5 | 0.4 s |  |

## t3

Run at 2026-10-30T13:21:53.119Z on commit `a0283861e`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: webview-host.test.ts: openModelTiers always opens/reveals the panel and falls back to a placeholder body when modelTiersRenderer is unset**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001: openModelTiers always opens/reveals the panel (never a no-op); with no modelTiersRenderer it renders the placeholder | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |

**unit: webview-host.test.ts: the status-bar MenuItem list carries the new 'Model Tiers' entry alongside 'Repo Configuration'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | showStatusMenu offers EXACTLY three items, including Model Tiers, and routes each choice to the matching panel | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |

**unit: webview-host.test.ts: a malformed postMessage of either ModelTiersWrite kind is silently dropped and never reaches onModelTiersWrite**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001: a {kind:'tierField'} modelTiersWrite forwards a validated ModelTiersWrite; a {kind:'coreFloor'} one too; malformed ones are silent no-ops | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/panels/__tests__/webview-host.test.ts` | 0 | 34 | 0.5 s |  |

## t4

Run at 2026-10-30T13:25:05.107Z on commit `9c8cbbd68`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-tiers.test.ts / webview-host.test.ts: createModelTiersWriteHandler's refresh callback, wired exactly as in extension.ts's panelHost construction, invokes openModelTiers after a resolved write**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | createModelTiersWriteHandler: refresh wired exactly as extension.ts does (refresh: () => panelHost.openModelTiers()) invokes openModelTiers after a resolved write | `vscode-plugin/src/panels/__tests__/model-tiers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/panels/__tests__/model-tiers.test.ts` | 0 | 6 | 0.4 s |  |

## t5

Run at 2026-10-30T13:43:40.452Z on commit `4afea5886`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-tiers.test.ts: a tier card shows a cloud/local hosting badge matching its resolved family's hosting**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | renderModelTiers: a tier resolved to the host-set family shows its cloud/local hosting badge; an unresolved model is flagged not-supported inline | `vscode-plugin/src/panels/__tests__/model-tiers.test.ts` |

**unit: model-tiers.test.ts: a tier whose configured model is not in the catalog renders the not-supported note inline, matching mocks/model-tiers-grouped.html**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | renderModelTiers: a tier resolved to the host-set family shows its cloud/local hosting badge; an unresolved model is flagged not-supported inline | `vscode-plugin/src/panels/__tests__/model-tiers.test.ts` |
| pass | renderModelTiers: an open vendor family with a model it no longer lists renders the not-listed styling inline (distinct from not-supported) | `vscode-plugin/src/panels/__tests__/model-tiers.test.ts` |

**unit: model-tier-picker.test.ts: tierStatus returns floor-raised for every tier ranked below coreFloor, and omits it when coreFloor is 'cheap'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-tier-picker.test.ts: tierStatus returns floor-raised for every tier ranked below coreFloor, and omits it when coreFloor is 'cheap' | `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` |

**unit: model-tiers.test.ts: createModelTiersWriteHandler maps a { kind: 'coreFloor', value } write to the insrc.models.coreFloor key**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | createModelTiersWriteHandler: a {kind:'tierField'} write maps to ['models','tiers',tier,field]; a {kind:'coreFloor'} write maps to ['models','coreFloor'] | `vscode-plugin/src/panels/__tests__/model-tiers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` | 0 | 9 | 0.4 s |  |
| `vscode-plugin/src/panels/__tests__/model-tiers.test.ts` | 0 | 9 | 0.4 s |  |

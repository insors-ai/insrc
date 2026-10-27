<!-- insrc:artifact ISSUE-07dfdf71974a7c45 -->

# Make the VS Code tier picker show the tier the daemon actually runs

## Reproduction

Setup: in config.json set models.tiers.core = { runner: 'cli-codex', model: <a listed codex model> } with no effort, where the codex family's core tier default has an effort (e.g. 'high'). Run 'insrc: Set model tier' and choose core. Observed: the picker marks the default's effort ('high') as the current one. Expected: no effort (CLI default), because that is what the daemon runs. Second case: set only models.tiers.core.runner = 'cli-claude' (no model). Observed: the picker marks Claude and Claude's core default as current. Expected: the DEFAULT family's core default, because the daemon ignores a tier without a model. Third case: store an effort the configured model does not accept. Observed: that effort is marked current. Expected: no effort, since the daemon drops it with a warning. In each case, accepting the marked values writes a tier different from the one that was running.

## Root cause

currentTier in vscode-plugin/src/models/model-tier-picker.ts:145-158 lays the configured fields over the configured runner's family default and fills a missing effort from that default. The daemon resolves differently. In tierSetting (src/config/analyze.ts:216-227), a tier with a configured runner and model runs with the configured effort or none, and only an unset tier takes the default family's tier default and its effort. parseTiering (src/config/analyze.ts:395-407) drops a tier whose model is missing or '' (while keeping its effort leaf), so a runner alone is ignored. The registry then drops an effort the resolved model does not accept (droppedEffort, src/daemon/model-registry.ts:274). The function's own comment claims 'the daemon's own precedence', but the code does not follow it. The native-settings sync engine (vscode-plugin/src/config/sync-engine.ts:174-199) only validates edits and mirrors the stored leaves, so it does not have this display defect.

## Fix intent

The picker's starting tier is the tier the daemon resolves, under the same rules: configured runner and model with the configured effort or none; otherwise the default family's tier default with the configured effort leaf, else the default's effort; and an effort the resolved model does not accept is shown as none. Parity tests cover each rule against the daemon's own resolution cases.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/models/model-tier-picker.ts:145` — "function currentTier(defs: ModelDefinitions, raw: Record<string, unknown>, tier: Tier): TierValue | undefined {"
- **[[c2]]** `code` `src/config/analyze.ts:216` — "if (configured !== undefined) {
		return { runner: configured.runner, model: configured.model, ...(effort ? { effort } : {}) };"
- **[[c3]]** `code` `src/config/analyze.ts:402` — "// A '' model leaves the tier unset: it resolves to the tier default."
- **[[c4]]** `code` `src/daemon/model-registry.ts:274` — ": { family: setting.runner, model: found, droppedEffort: effort };"
- **[[c5]]** `code` `vscode-plugin/src/config/sync-engine.ts:174`
- **[[c6]]** `prior-artifact` `LLD-ce99b72065d03b1b-s7` — "s7 review round 1 finding: overlaying configured tier leaves on family defaults does not reproduce daemon resolution for an absent effort."

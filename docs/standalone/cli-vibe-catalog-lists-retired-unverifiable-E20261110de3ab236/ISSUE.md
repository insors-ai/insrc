<!-- insrc:artifact ISSUE-de3ab23659bc21fd -->

# cli-vibe catalog lists retired/unverifiable Mistral model ids and wrong efforts

## Reproduction

In VS Code, open the insrc chat with provider = Mistral Vibe CLI and pick a model: (a) devstral-latest, mistral-large-latest, or mistral-small-latest — the turn fails before dispatch with VibeSelectionError 'no unambiguous local alias for the selected model' because none of these names appear in the installed Vibe 3.0.4 runtime's model list (probed live via vibe-app-server runtime/read on 2026-11-10, which lists only mistral-large-4-0, mistral-vibe-cli-latest, zai-glm-5-3, zai-glm-5-3-flash); (b) mistral-vibe-cli-latest with effort low/medium/xhigh/max — fails with 'the selected effort is unavailable on this model' because the live thinkingLevels for that model are [off, high]. Expected: every model shown in the picker passes runtime verification, and the API ids resolve to current (non-deprecated) models.

## Root cause

The cli-vibe family in src/assets/models/cloud-model-catalog.json was curated before Mistral's 2026 model-lifecycle changes and is not re-verified against the installed Vibe runtime: devstral-latest points at Devstral 2, deprecated 2026-05-22 and retired 2026-07-31; mistral-large-latest now resolves to Mistral Large 3 (deprecated 2026-10-31, replacement Mistral Large 4 GA 2026-11-05); mistral-small-latest is absent from Vibe's vibe-code model catalog; and mistral-vibe-cli-latest's efforts were listed as [low, medium, high, xhigh, max] while the runtime offers [off, high]. src/shared/vibe-session.ts enforces id + effort against the live runtime, so the stale entries hard-fail instead of falling back.

## Fix intent

Rewrite only the cli-vibe family of src/assets/models/cloud-model-catalog.json to the runtime-verified values: remove devstral-latest and mistral-small-latest; replace mistral-large-latest with { id: 'mistral-large-4-0', aliases: ['mistral-large-4-0-3', 'mistral-large-4'], displayName: 'Mistral Large 4', efforts: ['low', 'medium', 'high'] }; set mistral-vibe-cli-latest (alias mistral-medium-3.5) efforts to ['off', 'high']; keep zai-glm-5-3 and zai-glm-5-3-flash with efforts ['low', 'high', 'max']; set tierDefaults to core: mistral-large-4-0, mid: mistral-vibe-cli-latest, cheap: zai-glm-5-3-flash and summariserModel to zai-glm-5-3-flash. No production code changes; the shipped-asset validator and test suites must pass unchanged.

## Citations

- **[[c1]]** `code` `src/assets/models/cloud-model-catalog.json:43-60` — "cli-vibe family lists mistral-large-latest, mistral-vibe-cli-latest (efforts low/medium/high/xhigh/max), zai-glm-5-3, zai-glm-5-3-flash, devstral-latest, mistral-small-latest with tierDefaults core mi"
- **[[c2]]** `code` `src/shared/vibe-session.ts:384-417` — "explicitModel must match the catalog; choice must be the single live model whose name matches; effort must be in BOTH target.efforts and choice.thinkingLevels, else VibeSelectionError"
- **[[c3]]** `code` `vscode-plugin/src/chat/chat-panel.ts:2410` — "const catalogJson = attr(JSON.stringify(runCatalog));"
- **[[c4]]** `code` `vscode-plugin/src/extension.ts:648` — "vibeCatalog: async () => { const definitions = await chatModelDefinitions(); const family = definitions.families.find(entry => entry.id === 'cli-vibe'); ... }"
- **[[c5]]** `code` `src/daemon/model-catalog.ts:46` — "export type EffortLevel = string; // the file is the authority for level names"
- **[[c6]]** `step-output` `live vibe-app-server runtime/read probe, 2026-11-10` — "vibe 3.0.4, user credential: models = zai-glm-5-3 (alias glm-5-3, thinkingLevels [low,high,max]), mistral-large-4-0 (alias mistral-large-4-0-3, thinkingLevels [low,medium,high]), zai-glm-5-3-flash (th"
- **[[c7]]** `doc` `https://docs.mistral.ai/models` — "Models Overview, checked 2026-11-10: Mistral Large 4 GA v26.10; Devstral 2 (devstral-2512) deprecated 5/22/2026, retirement 7/31/2026, replacement Mistral Medium 3.5; Mistral Large 3 (mistral-large-25"
- **[[c8]]** `doc` `/Users/subhagho/.local/share/uv/tools/mistral-vibe/lib/python3.14/site-packages/vibe/core/config/vibe_schema.py:190-207` — "installed vibe 3.0.4: DEFAULT_ACTIVE_MODEL_CONFIG name='mistral-vibe-cli-latest', alias='mistral-medium-3.5', thinking_levels=['off','high']; vibe/config_values.py:12 THINKING_LEVELS = (off, low, medi"

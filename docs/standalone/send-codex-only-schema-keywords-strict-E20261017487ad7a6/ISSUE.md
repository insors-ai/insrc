<!-- insrc:artifact ISSUE-487ad7a67474d321 -->

# Send codex only the schema keywords strict mode accepts

## Reproduction

Route a structured completion to the codex CLI, for example the analyzer's context shaper when the core tier is set to codex. Directly: call CliProvider({ kind: 'codex' }).completeStructured with modelFacingBundleSchema({ withMeta: true }) from src/analyze/context/schema.ts. Observed (2026-10-17): codex fails with 400 invalid_json_schema, "Invalid schema for response_format 'codex_output_schema': 'schema.properties.meta.properties.emptyLayers.uniqueItems' is not permitted when strict is true." The analyze run then fails as shaper-llm-unavailable, and a daemon reviewer running on codex reports that analyzer access failed. With uniqueItems removed from the same schema, codex accepts it and answers. Expected: codex accepts every schema the daemon sends it, and the reply is still held to the caller's full schema.

## Root cause

codex runs --output-schema in OpenAI strict mode. Since ISSUE-e48e33ae, both codex paths send the schema through codexSchemaJson (src/agent/providers/cli-provider.ts:120-122, used at :288 and :400), which applies processSchemaForOpenAIStrict (src/agent/providers/structured-output.ts:266-325). That conversion only adds additionalProperties:false and a full required list, and renames oneOf to anyOf; every other keyword is passed through unchanged. Strict mode refuses some of those keywords, and the analyzer's bundle schema carries one of them: uniqueItems on meta.emptyLayers (src/analyze/context/schema.ts). Other schemas that reach providers also use uniqueItems (src/daemon/tools/builtins/code/class-locate.ts:89, src/daemon/tools/builtins/code/class-references.ts:90, src/design/corpus/contracts.ts:21). On the codex path the reply is only JSON-parsed (src/agent/providers/cli-provider.ts:293-297); holding it to the full schema is left to each caller.

## Fix intent

The schema the codex paths send contains only what strict mode accepts: every keyword strict mode refuses is left out of (or rewritten in) the copy sent to codex, with the set of refused keywords established by probing codex rather than assumed. The caller's own schema is unchanged, and no constraint is lost: a reply that breaks a constraint left out of the codex copy is still rejected, as it would be against the caller's full schema.

## Citations

- **[[c1]]** `code` `src/agent/providers/cli-provider.ts:120-122` — "return JSON.stringify(processSchemaForOpenAIStrict(structuredClone(schema)));"
- **[[c2]]** `code` `src/agent/providers/structured-output.ts:266-325`
- **[[c3]]** `code` `src/analyze/context/schema.ts`
- **[[c4]]** `code` `src/agent/providers/cli-provider.ts:293-297`
- **[[c5]]** `step-output` `live codex probe 2026-10-17: CliProvider codex completeStructured with modelFacingBundleSchema({withMeta:true})` — "'schema.properties.meta.properties.emptyLayers.uniqueItems' is not permitted when strict is true."
- **[[c6]]** `code` `src/daemon/tools/builtins/code/class-locate.ts:89`
- **[[c7]]** `prior-artifact` `ISSUE-e48e33ae6af03720`

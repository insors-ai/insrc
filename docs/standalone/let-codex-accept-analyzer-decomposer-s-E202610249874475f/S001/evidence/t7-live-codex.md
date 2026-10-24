# t7 live check: codex accepts the analyzer's complete plan schemas (2026-10-24)

Test: `src/analyze/__tests__/codex-plan-schemas.live.test.ts`, run with
`INSRC_LIVE_TESTS=1` against codex-cli 0.164.0, model `gpt-6.1-sol`, effort `low`,
one call at a time through `CliProvider.completeStructured` (which sends the
`codexStrictSchema` copy). Each reply is then checked with `validateCodexReply`.

Schemas sent: the complete `DECOMPOSE_SCHEMA` (all 20 exploration types), and
`plannerWireSchema(getTemplatesForTarget(t)).schema` for t = code, docs, data,
infra, generic (all 27 built-in templates).

## Result

```
# pass 1
# fail 0
# skipped 0
# duration_ms 51571.704458
```

All 6 schemas accepted; all 6 replies pass the reply check.

## Control

The same test with one extra case, today's `PLAN_TASK_SCHEMA` (the schema
runPlanner sent before t5), fails on that case only, with codex's original
refusal:

```
CONTROL PLAN_TASK_SCHEMA: codex emitted error event: ... "Invalid schema for response_format 'codex_output_schema': 'schema.properties.tasks.items.properties.params.properties' is required for object schemas." ... "code":"invalid_json_schema" ... "status":400
# pass 0
# fail 1
```

So the test reaches codex and fails on a refused schema; the pass above is real.

## Refused schemas left out of scope

Recorded, not fixed (user decision 2026-10-24, option 2), with their probe
results from `evidence/open-object-probe.md` beside ISSUE-8d39ef09, and noted on
ISSUE-7d346e0dcbafc70e (`docs/standalone/let-codex-leave-optional-schema-fields-E202610247d346e0d/evidence/refused-open-object-schemas.md`):

| Schema | Reaches codex through | Probe result (2026-10-24) |
|---|---|---|
| frameworkWriteSchema | workflow.run (src/daemon/workflow-rpc.ts:211) | `'schema.properties.erDefinition.properties.classes.properties' is required for object schemas` |
| contractDetailSchema | workflow.run | `'schema.properties.hld.properties.amendmentProposal.additionalProperties' is required to be supplied and to be false when strict is true` |
| ER_DEFINITION_PROPERTY_SCHEMA | workflow.run (inside the write schemas) | `'schema.properties.classes.properties' is required for object schemas` |
| UX_DEFINITION_PROPERTY_SCHEMA | workflow.run (inside the write schemas) | `'schema.properties.body.items.properties' is required for object schemas` |
| trackerPushExecuteSchema | workflow.run | `'schema.properties.storyRefs.properties' is required for object schemas` |
| trackerSyncExecuteSchema | workflow.run | `'schema.properties.storyStatus.properties' is required for object schemas` |
| STUB_ARTIFACT_JSON_SCHEMA | workflow.run | `'schema.additionalProperties' is required to be supplied and to be false when strict is true` |
| AGGREGATOR_OUTPUT_SCHEMA | never sent to a model (template runtime schema) | `'schema.additionalProperties' is required to be supplied and to be false when strict is true` |

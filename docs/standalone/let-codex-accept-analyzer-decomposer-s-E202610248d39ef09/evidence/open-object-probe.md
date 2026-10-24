# Open objects the codex strict copy cannot express (2026-10-24)

`scan.mts` runs `codexStrictSchema` over every exported object schema under src/analyze, src/workflow, src/daemon/steps and src/agent, and lists object nodes left without `properties`. `probe.mts` sends each one it finds to live codex (gpt-6.1-sol) through `CliProvider.completeStructured`. `repro.mts` is the single-schema reproduction.

Probe result: every schema was refused, under one of two strict-mode rules.

```
REFUSED DECOMPOSE_SCHEMA (3279 ms): Invalid schema for response_format 'codex_output_schema': 'schema.properties.explorations.items.properties.params.properties' is required for object schemas.
REFUSED PLANNED_TASK_SCHEMA (3252 ms): Invalid schema for response_format 'codex_output_schema': 'schema.properties.params.properties' is required for object schemas.
REFUSED PLAN_TASK_SCHEMA (3019 ms): Invalid schema for response_format 'codex_output_schema': 'schema.properties.tasks.items.properties.params.properties' is required for object schemas.
REFUSED AGGREGATOR_OUTPUT_SCHEMA (2219 ms): Invalid schema for response_format 'codex_output_schema': 'schema.additionalProperties' is required to be supplied and to be false when strict is true.
REFUSED ER_DEFINITION_PROPERTY_SCHEMA (2177 ms): Invalid schema for response_format 'codex_output_schema': 'schema.properties.classes.properties' is required for object schemas.
REFUSED UX_DEFINITION_PROPERTY_SCHEMA (2112 ms): Invalid schema for response_format 'codex_output_schema': 'schema.properties.body.items.properties' is required for object schemas.
REFUSED STUB_ARTIFACT_JSON_SCHEMA (2226 ms): Invalid schema for response_format 'codex_output_schema': 'schema.additionalProperties' is required to be supplied and to be false when strict is true.
REFUSED frameworkWriteSchema (2059 ms): Invalid schema for response_format 'codex_output_schema': 'schema.properties.erDefinition.properties.classes.properties' is required for object schemas.
REFUSED contractDetailSchema (2231 ms): Invalid schema for response_format 'codex_output_schema': 'schema.properties.hld.properties.amendmentProposal.additionalProperties' is required to be supplied and to be false when strict is true.
REFUSED trackerPushExecuteSchema (2617 ms): Invalid schema for response_format 'codex_output_schema': 'schema.properties.storyRefs.properties' is required for object schemas.
REFUSED trackerSyncExecuteSchema (2858 ms): Invalid schema for response_format 'codex_output_schema': 'schema.properties.storyStatus.properties' is required for object schemas.
```

Only the decomposer is hit in production: 113 of 113 calls in the 2026-10-16..24 survey. The planner (`analyze.plan.build` IPC) and the daemon-driven `workflow.run` can reach codex with the others, but neither did in the survey window.

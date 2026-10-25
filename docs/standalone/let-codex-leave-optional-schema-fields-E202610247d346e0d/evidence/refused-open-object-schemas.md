# Open-object schemas codex refuses, left for this ISSUE (recorded 2026-10-24)

From ISSUE-8d39ef09 / LLD-9874475f902756f6-S001 (user decision 2026-10-24,
option 2): that fix makes the analyzer's plan schemas (DECOMPOSE_SCHEMA and the
planner's per-catalog wire schema) codex-expressible; live codex accepts them
(`docs/standalone/let-codex-accept-analyzer-decomposer-s-E202610249874475f/S001/evidence/t7-live-codex.md`).
The schemas below are refused by codex's strict grammar for the same reason
(an object with no `properties`, or `additionalProperties` not false in the
`codexStrictSchema` copy) and belong with this ISSUE's strict-copy work. Probe:
`docs/standalone/let-codex-accept-analyzer-decomposer-s-E202610248d39ef09/evidence/probe.mts`
against live codex (gpt-6.1-sol), 2026-10-24.

| Schema | Reaches codex through | Probe result |
|---|---|---|
| frameworkWriteSchema | daemon-driven workflow.run (src/daemon/workflow-rpc.ts:211) | `'schema.properties.erDefinition.properties.classes.properties' is required for object schemas` |
| contractDetailSchema | workflow.run | `'schema.properties.hld.properties.amendmentProposal.additionalProperties' is required to be supplied and to be false when strict is true` |
| ER_DEFINITION_PROPERTY_SCHEMA | workflow.run (inside the write schemas) | `'schema.properties.classes.properties' is required for object schemas` |
| UX_DEFINITION_PROPERTY_SCHEMA | workflow.run (inside the write schemas) | `'schema.properties.body.items.properties' is required for object schemas` |
| trackerPushExecuteSchema | workflow.run | `'schema.properties.storyRefs.properties' is required for object schemas` |
| trackerSyncExecuteSchema | workflow.run | `'schema.properties.storyStatus.properties' is required for object schemas` |
| STUB_ARTIFACT_JSON_SCHEMA | workflow.run | `'schema.additionalProperties' is required to be supplied and to be false when strict is true` |
| AGGREGATOR_OUTPUT_SCHEMA | never sent to a model (template runtime schema) | `'schema.additionalProperties' is required to be supplied and to be false when strict is true` |

None was hit in production in the 2026-10-16..24 survey (only the decomposer
was: 113 of 113 calls); workflow.run is the daemon-side runner, not the
in-session `insrc_workflow_step` path.

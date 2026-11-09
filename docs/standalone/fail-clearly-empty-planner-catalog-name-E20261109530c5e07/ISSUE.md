<!-- insrc:artifact ISSUE-530c5e079d4edfcd -->

# Fail clearly on an empty planner catalog and name the schema keywords of a codex schema rejection

## Reproduction

1. Build the planner's wire schema for an empty template catalog (plannerWireSchema([])). Each task's `params` becomes `anyOf: []`.
2. Send it through the codex provider (CliProvider kind codex, completeStructured). Codex answers 400: "Invalid schema for response_format 'codex_output_schema': invalid schema keyword" (code invalid_json_schema), and the plan stage fails with `plan-builder-llm-unavailable`.
Observed: a model-unavailable error that blames the model and does not say which part of the schema was refused. Expected: the planner refuses an empty catalog itself with a clear typed error before any model call, and a codex schema rejection says which schema keywords were sent.
Note: with the real template catalogs (5 targets, 6 to 27 templates) codex accepts the planner schema; a live broad docs run failed in the plan stage with this exact error and the schema the daemon sent could not be seen.

## Root cause

plannerWireSchema builds `params` as an anyOf over one branch per catalog template and never checks that the catalog is non-empty, so an empty catalog yields `anyOf: []`, which codex's strict mode refuses; runPlanner passes any provider error through classifyError, which reports it as the plan builder's model being unavailable. The CLI provider's codex error carries only codex's own text, so a rejected schema cannot be traced to the keyword that caused it.

## Fix intent

Make runPlanner (or plannerWireSchema) refuse an empty template catalog with a typed planner error that names the target and the empty catalog, before building the schema or calling a model. Make the CLI provider add a summary of the schema keywords it sent (the distinct keywords and where anyOf/oneOf lists are empty) to the error it raises when codex answers invalid_json_schema, so a rejection can be traced. Cover both with tests.

## Citations

- **[[c1]]** `code` `src/analyze/planner/wire-schema.ts` — "taskProps['params'] = { anyOf: branches };"
- **[[c2]]** `code` `src/analyze/planner/driver.ts` — "throw classifyError(err);"
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts` — "const args = ['exec', '--output-schema', schemaPath, '--json', ...this.modelArgs(opts)];"

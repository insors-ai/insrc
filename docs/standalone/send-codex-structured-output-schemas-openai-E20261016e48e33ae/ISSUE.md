<!-- insrc:artifact ISSUE-e48e33ae6af03720 -->

# Send codex structured-output schemas in OpenAI strict form

## Reproduction

Route a model tier to the codex CLI (in ~/.insrc/config.json the core and mid tiers set to cli-codex), then run any step that asks codex for structured output with a schema whose objects do not declare additionalProperties: false. Observed on 2026-10-16: the build gate's validate phase for Epic c2ba6fa6, Story s1, task t5 sent its judge schema to codex, codex answered HTTP 400 "Invalid schema for response_format 'codex_output_schema': 'schema.additionalProperties' is required to be supplied and to be false when strict is true", and the gate failed with unparseable-verdict. Expected: codex accepts the schema and returns a verdict, as claude does for the same schema.

## Root cause

CliProvider writes the caller's schema to the file it passes to codex's --output-schema flag exactly as given, in both of its codex paths: the structured completion (src/agent/providers/cli-provider.ts:274-278) and the review session (src/agent/providers/cli-provider.ts:386-390). codex runs output schemas in strict mode, which requires additionalProperties: false and a complete required list on every object. Most callers' schemas are not written that way; the build gate's judge schema (src/daemon/steps/build-step/phases/validate.ts:92-109) declares neither on its root object nor on its checks items. The repository already has processSchemaForOpenAIStrict (src/agent/providers/structured-output.ts:266), which produces exactly that form, but no codex path calls it.

## Fix intent

Both codex paths send codex the strict form of the caller's schema, produced by the existing processSchemaForOpenAIStrict on a copy, so the caller's own schema object is left unchanged (callers reuse constant schemas, and the claude path and the answer's validation keep using the original). A test shows a schema without additionalProperties reaches codex's --output-schema file in strict form in both paths, and that the caller's schema is not modified.

## Citations

- **[[c1]]** `code` `src/agent/providers/cli-provider.ts:274-278` — "writeFileSync(schemaPath, JSON.stringify(schema));
const args = ['exec', '--output-schema', schemaPath, '--json', ...this.modelArgs(opts)];"
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts:386-390` — "writeFileSync(schemaPath, JSON.stringify(schema));
const { events } = await this.runCodex(codexReviewSessionArgs(schemaPath, exec.cwd, this.modelArgs()), prompt, exec);"
- **[[c3]]** `code` `src/agent/providers/structured-output.ts:266` — "export function processSchemaForOpenAIStrict(schema: StructuredSchema): StructuredSchema {"
- **[[c4]]** `code` `src/daemon/steps/build-step/phases/validate.ts:92-109` — "const JUDGE_VERDICT_SCHEMA: StructuredSchema = {
	type: 'object',
	required: ['taskId', 'passed', 'checks', 'scopeRespected', 'reason'],"

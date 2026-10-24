const R = '/Users/subhagho/work/projects/insors/insrc';
const { CliProvider } = await import(`${R}/src/agent/providers/cli-provider.ts`);
const targets: [string, string][] = [
  ['src/analyze/context/decomposer.ts', 'DECOMPOSE_SCHEMA'],
  ['src/analyze/index.ts', 'PLANNED_TASK_SCHEMA'],
  ['src/analyze/index.ts', 'PLAN_TASK_SCHEMA'],
  ['src/analyze/planner/templates/shared-schemas.ts', 'AGGREGATOR_OUTPUT_SCHEMA'],
  ['src/workflow/artifacts/companion/er-schema.ts', 'ER_DEFINITION_PROPERTY_SCHEMA'],
  ['src/workflow/artifacts/companion/ux-schema.ts', 'UX_DEFINITION_PROPERTY_SCHEMA'],
  ['src/workflow/artifacts/stub.ts', 'STUB_ARTIFACT_JSON_SCHEMA'],
  ['src/workflow/runners/design-epic/schemas.ts', 'frameworkWriteSchema'],
  ['src/workflow/runners/design-story/schemas.ts', 'contractDetailSchema'],
  ['src/workflow/runners/tracker/schemas.ts', 'trackerPushExecuteSchema'],
  ['src/workflow/runners/tracker/schemas.ts', 'trackerSyncExecuteSchema'],
];
const p = new CliProvider({ kind: 'codex', model: 'gpt-6.1-sol', effort: 'low' });
for (const [f, name] of targets) {
  const schema = (await import(`${R}/${f}`))[name];
  const t0 = Date.now();
  try {
    await p.completeStructured([{ role: 'user', content: 'Return the smallest JSON object that satisfies the schema. Do not use any tools.' }], schema, { internalRetry: false, timeoutMs: 180000 });
    console.log(`ACCEPTED ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    const m = (e as Error).message;
    const schemaErr = /invalid_json_schema|Invalid schema/.test(m);
    console.log(`${schemaErr ? 'REFUSED' : 'OTHER'} ${name} (${Date.now() - t0} ms): ${(m.match(/Invalid schema[^"\\]*/)?.[0] ?? m).slice(0, 220)}`);
  }
}

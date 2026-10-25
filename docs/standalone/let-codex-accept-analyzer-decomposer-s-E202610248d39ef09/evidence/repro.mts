const R = '/Users/subhagho/work/projects/insors/insrc';
const { codexStrictSchema } = await import(`${R}/src/agent/providers/structured-output.ts`);
const { DECOMPOSE_SCHEMA } = await import(`${R}/src/analyze/context/decomposer.ts`);
const { CliProvider } = await import(`${R}/src/agent/providers/cli-provider.ts`);
const strict = codexStrictSchema(DECOMPOSE_SCHEMA) as any;
console.log('strict params node:', JSON.stringify(strict.properties.explorations.items.properties.params));
const p = new CliProvider({ kind: 'codex', model: 'gpt-6.1-sol', effort: 'medium' });
const t0 = Date.now();
try {
  await p.completeStructured([{ role: 'user', content: 'Plan one exploration: locate the symbol runReview. Answer with the JSON.' }], DECOMPOSE_SCHEMA, { internalRetry: false, timeoutMs: 120000 });
  console.log('ACCEPTED', Date.now() - t0);
} catch (e) { console.log('REFUSED after', Date.now() - t0, 'ms:', (e as Error).message.slice(0, 400)); }

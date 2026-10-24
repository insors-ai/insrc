const R = '/Users/subhagho/work/projects/insors/insrc';
const { CliProvider } = await import(`${R}/src/agent/providers/cli-provider.ts`);
const { codexStrictSchema } = await import(`${R}/src/agent/providers/structured-output.ts`);
const P = (props: Record<string, unknown>, req: string[]) => ({ type: 'object', additionalProperties: false, required: req, properties: props });
const schema = P({ explorations: { type: 'array', items: P({
  id: { type: 'string' }, type: { type: 'string', enum: ['symbol.locate', 'search.text'] },
  params: { anyOf: [
    P({ names: { type: 'array', items: { type: 'string' } }, kinds: { type: ['array', 'null'], items: { type: 'string' } }, limit: { type: ['integer', 'null'] } }, ['names']),
    P({ pattern: { type: 'string' }, glob: { type: ['string', 'null'] }, topK: { type: ['integer', 'null'] } }, ['pattern']),
  ] },
}, ['id', 'type', 'params']) } }, ['explorations']);
console.log('strict:', JSON.stringify(codexStrictSchema(schema)).slice(0, 600));
const p = new CliProvider({ kind: 'codex', model: 'gpt-6.1-sol', effort: 'low' });
try {
  const r = await p.completeStructured([{ role: 'user', content: 'Plan two explorations: a symbol.locate for names ["runReview"], and a search.text for pattern "VERIFY_CALL". Leave unneeded optional params null. Do not use tools.' }], schema, { internalRetry: false, timeoutMs: 180000 });
  console.log('ACCEPTED', JSON.stringify(r));
} catch (e) { console.log('REFUSED', (e as Error).message.slice(0, 500)); }

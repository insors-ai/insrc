/** Batch05: final execution authority preserves the executor's earlier outcomes. */
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { executeTool, _setApprovalGateForTests } from '../executor.js';
import { registerTool, _resetRegistryForTests } from '../registry.js';
import { registerToolHook, _resetToolHooksForTests } from '../hooks.js';
import { fakeTool, deps } from './_fakes.js';
import type { ToolDeps } from '../types.js';

const OK = { output: 'ok', format: 'text' as const, success: true, data: { id: 'x', total: 1 } };
afterEach(() => { _resetRegistryForTests(); _resetToolHooksForTests(); _setApprovalGateForTests(undefined); });

test('final authority preserves unknown schema cancellation and denial results without registry lookup', async () => {
 const tool = fakeTool('admission', OK); tool.approval = 'destructive'; registerTool(tool);
 _setApprovalGateForTests(() => ({ ask: async () => 'declined' }));
 const aborted = new AbortController(); aborted.abort();
 const input = { name: 'valid', count: 1 };
 for (const [id, args, signal] of [
  ['unknown-admission', input, undefined], ['admission', {}, undefined],
  ['admission', input, aborted.signal], ['admission', input, undefined],
 ] as const) {
  const base = { ...deps(), signal };
  const expected = await executeTool(id, args, base);
  const actual = await executeTool(id, args, { ...base, authorizeRepository: async () => assert.fail('early failure reached repo authority') });
  assert.deepEqual(actual, expected);
  assert.equal(actual.success, false);
 }
 assert.equal(tool.ran, 0);
});

test('final authority refusal runs neither capability nor success hooks and admitted execution uses canonical repo', async () => {
 const seen: string[] = [];
 const tool = fakeTool('admission', OK, { schemas: false }); tool.approval = 'none';
 tool.execute = async (_input, context) => { seen.push(context.repoPath); assert.equal(context.authorizeRepository, undefined); return OK; };
 registerTool(tool);
 let hooks = 0; registerToolHook({ id: 'admission-hook', toolId: tool.id, run: async () => { hooks++; } });
 const refused = await executeTool(tool.id, {}, { ...deps(), authorizeRepository: async () => { throw new Error('repo-not-registered: admission refused'); } });
 assert.equal(refused.success, false); assert.match(refused.error ?? '', /^repo-not-registered:/);
 assert.deepEqual(seen, []); assert.equal(hooks, 0);
 const admitted = await executeTool(tool.id, {}, { ...deps(), authorizeRepository: async () => '/canonical/repo' });
 assert.deepEqual(admitted, OK); assert.deepEqual(seen, ['/canonical/repo']); assert.equal(hooks, 1);
});

test('cancellation during final authority lookup prevents capability and hooks for either lookup outcome', async () => {
 const tool = fakeTool('admission', OK, { schemas: false }); tool.approval = 'none'; registerTool(tool);
 let hooks = 0; registerToolHook({ id: 'admission-hook', toolId: tool.id, run: async () => { hooks++; } });
 for (const fails of [false, true]) {
  const controller = new AbortController();
  let entered!: () => void; const pending = new Promise<void>(resolve => { entered = resolve; });
  let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
  const context: ToolDeps = { ...deps(), signal: controller.signal, authorizeRepository: async () => {
   entered(); await wait; if (fails) throw new Error('repo-not-registered'); return '/canonical/repo';
  } };
  const run = executeTool(tool.id, {}, context);
  await pending; controller.abort(); release();
  const result = await run;
  assert.equal(result.failure?.denial, 'cancelled'); assert.equal(tool.ran, 0); assert.equal(hooks, 0);
 }
});

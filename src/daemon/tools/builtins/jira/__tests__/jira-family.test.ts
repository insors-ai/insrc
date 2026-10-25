import assert from 'node:assert/strict';
import { test } from 'node:test';
import { _resetRegistryForTests, getTool, registerTool } from '../../../registry.js';
import { _setApprovalGateForTests, executeTool } from '../../../executor.js';
import { registerBuiltinTools } from '../../index.js';
import { installFakeAcli } from './_fakeacli.js';
import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import { ALL_OP_CASES, ALL_TOOLS } from './_all-ops.js';
import { SAMPLE_OPS, deps, sampleFamily } from './_sample.js';

test('jira-family.test.ts: a sample family refuses unknown ops, missing, extra and exclusive-group fields before acli runs', async () => {
  const fake = installFakeAcli('ok', { stdout: '{"key":"IN-1","id":"1"}' });
  try {
    const tool = sampleFamily();
    // the value is a GhFamilyTool: a typed tool carrying its ops
    assert.equal(tool.id, 'jira_sample');
    assert.equal(tool.ops, SAMPLE_OPS);
    assert.ok(tool.inputSchema && tool.outputSchema);
    const run = (input: Record<string, unknown>) => tool.execute(input, deps());
    const refused: [string, Record<string, unknown>, RegExp][] = [
      ['an unknown op', { op: 'nope' }, /unknown op/],
      ['a missing required field', { op: 'view' }, /needs the field key/],
      ['an extra field', { op: 'view', key: 'IN-1', jql: 'x' }, /does not accept the field jql/],
      ['an exclusive group with both', { op: 'count', jql: 'a', filter: 'b' }, /exactly one of jql, filter/],
      ['an exclusive group with neither', { op: 'count' }, /exactly one of jql, filter/],
      ['a missing at-least-one field', { op: 'edit', keys: ['IN-1'] }, /at least one of summary/],
      ['a leading-dash key', { op: 'view', key: '-IN-1' }, /not a valid work item key/],
      ['a malformed key', { op: 'view', key: 'in-1' }, /not a valid work item key/],
      ['a leading-dash key in a list', { op: 'delete', keys: ['IN-1', '-IN-2'] }, /not a valid work item key/],
    ];
    for (const [what, input, re] of refused) {
      const r = await run(input);
      assert.equal(r.success, false, what);
      assert.equal(r.failure?.kind, 'rejected', what);
      assert.match(r.failure?.message ?? '', re, what);
    }
    assert.deepEqual(fake.calls(), [], 'acli never ran for a refused call');

    // through the executor the schema refuses the same calls, again before acli runs
    _resetRegistryForTests();
    registerTool(tool);
    for (const input of [{ op: 'nope' }, { op: 'view', key: '-IN-1' }, { op: 'edit', keys: Array.from({ length: 51 }, (_, i) => `IN-${i + 1}`), summary: 's' }, { op: 'view', key: 'IN-1', unknown: 1 }]) {
      const r = await executeTool('jira_sample', input, deps());
      assert.equal(r.failure?.kind, 'rejected', JSON.stringify(input).slice(0, 60));
    }
    assert.deepEqual(fake.calls(), []);

    // a valid call runs acli once, with the op's words
    const ok = await run({ op: 'view', key: 'IN-1' });
    assert.equal(ok.success, true);
    assert.deepEqual((ok.data as { op: string }).op, 'view');
    assert.deepEqual(fake.calls(), ['jira workitem view --key IN-1 --json']);
  } finally { fake.restore(); _resetRegistryForTests(); }
});

test('jira-family.test.ts: the five tools and 32 ops are registered and each op returns its declared shape', async () => {
  _resetRegistryForTests();
  registerBuiltinTools();
  try {
    assert.deepEqual(ALL_TOOLS.map(t => t.id), ['jira_workitem', 'jira_comment', 'jira_link', 'jira_project', 'jira_auth']);
    for (const t of ALL_TOOLS) { assert.equal(getTool(t.id), t, `${t.id} is registered`); }
    assert.equal(ALL_TOOLS.reduce((n, t) => n + t.ops.length, 0), 32);
    // one case per op, and none missing
    assert.deepEqual(ALL_OP_CASES.map(c => `${c.tool.id}.${String(c.input['op'])}`).sort(), ALL_TOOLS.flatMap(t => t.ops.map(o => `${t.id}.${o.name}`)).sort());
    for (const c of ALL_OP_CASES) {
      const fake = installFakeAcli('ok', { stdout: c.stdout });
      try {
        // through the executor, so both the input check and the output check run; a destructive op is approved by a fake gate
        _setApprovalGateForTests(() => ({ async ask(r) { return { requestId: r.requestId, decision: 'approve' as const }; } }));
        const r = await executeTool(c.tool.id, c.input, deps());
        const what = `${c.tool.id} ${String(c.input['op'])}`;
        assert.equal(r.success, true, `${what}: ${r.failure?.message ?? ''}`);
        assert.equal((r.data as { op: string }).op, c.input['op'], what);
        assert.equal(validateAgainstSchema(c.tool.outputSchema as unknown as StructuredSchema, r.data).ok, true, `${what} fits its declared shape`);
        assert.equal(fake.calls().length, 1, what);
      } finally { fake.restore(); _setApprovalGateForTests(undefined); }
    }
  } finally { _resetRegistryForTests(); }
});

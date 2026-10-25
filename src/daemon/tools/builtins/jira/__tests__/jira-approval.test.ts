import assert from 'node:assert/strict';
import { test } from 'node:test';
import { _resetRegistryForTests, registerTool } from '../../../registry.js';
import { _setApprovalGateForTests, executeTool } from '../../../executor.js';
import { resolveApprovalClass } from '../../../approval-policy.js';
import { installFakeAcli } from './_fakeacli.js';
import { SAMPLE_OPS, deps, sampleFamily } from './_sample.js';

test('jira-approval.test.ts: the approval function per op and an unknown op is destructive and denied with no client', async () => {
  const tool = sampleFamily();
  const classes = Object.fromEntries(SAMPLE_OPS.map(o => [o.name, resolveApprovalClass(tool, { op: o.name })]));
  assert.deepEqual(classes, { view: 'none', count: 'none', edit: 'common', delete: 'destructive', 'wrong-data': 'none', 'no-data': 'none' });
  // an op the table does not know is destructive, and so is a missing op
  assert.equal(resolveApprovalClass(tool, { op: 'drop-everything' }), 'destructive');
  assert.equal(resolveApprovalClass(tool, {}), 'destructive');
  // the preview names the op and the arguments and leaves the working directory out
  const gate = tool.buildApprovalGate!({ op: 'delete', keys: ['IN-1', 'IN-2'], cwd: '/tmp' });
  assert.equal(gate.title, 'jira_sample delete');
  assert.match(gate.content, /Op: \*\*delete\*\*/);
  assert.match(gate.content, /keys: \["IN-1","IN-2"\]/);
  assert.doesNotMatch(gate.content, /cwd/);

  // a destructive op with no client attached is denied and acli does not run
  const fake = installFakeAcli('ok', { stdout: '{}' });
  try {
    _resetRegistryForTests();
    registerTool(tool);
    _setApprovalGateForTests(() => ({ async ask() { return 'no-client'; } }));
    const denied = await executeTool('jira_sample', { op: 'delete', keys: ['IN-1'] }, deps());
    assert.equal(denied.success, false);
    assert.equal(denied.failure?.kind, 'denied');
    assert.equal(denied.failure?.denial, 'no-client');
    assert.deepEqual(fake.calls(), []);
    // a read runs without asking
    let asked = 0;
    _setApprovalGateForTests(() => ({ async ask() { asked += 1; return 'no-client'; } }));
    await executeTool('jira_sample', { op: 'view', key: 'IN-1' }, deps());
    assert.equal(asked, 0);
    assert.equal(fake.calls().length, 1);
  } finally { fake.restore(); _setApprovalGateForTests(undefined); _resetRegistryForTests(); }
});

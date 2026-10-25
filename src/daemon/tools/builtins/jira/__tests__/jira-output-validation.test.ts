import assert from 'node:assert/strict';
import { test } from 'node:test';
import { _resetRegistryForTests, registerTool } from '../../../registry.js';
import { executeTool } from '../../../executor.js';
import { installFakeAcli } from './_fakeacli.js';
import { deps, sampleFamily } from './_sample.js';

test('jira-output-validation.test.ts: a builder that returns data outside its union, or no data, is schema-mismatch through executeTool', async () => {
  const fake = installFakeAcli('ok', { stdout: 'ignored' });
  try {
    _resetRegistryForTests();
    registerTool(sampleFamily());
    // the builder returns { count: 'many' } for a shape that wants a number
    const wrong = await executeTool('jira_sample', { op: 'wrong-data' }, deps());
    assert.equal(wrong.success, false);
    assert.equal(wrong.failure?.kind, 'schema-mismatch');
    assert.match(wrong.failure?.message ?? '', /count/);
    assert.equal(wrong.data, undefined, 'the unchecked data is not passed on');
    // the builder reports success with no data
    const none = await executeTool('jira_sample', { op: 'no-data' }, deps());
    assert.equal(none.success, false);
    assert.equal(none.failure?.kind, 'schema-mismatch');
    assert.match(none.failure?.message ?? '', /no data/);
    // the family did not relabel either as rejected: acli ran once for each
    assert.equal(fake.calls().length, 2);
  } finally { fake.restore(); _resetRegistryForTests(); }
});

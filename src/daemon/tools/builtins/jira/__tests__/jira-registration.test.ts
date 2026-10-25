import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerBuiltinTools } from '../../index.js';
import { registerGhTools } from '../../gh/index.js';
import { registerJiraTools } from '../index.js';
import { _resetRegistryForTests, getTool, listTools } from '../../../registry.js';

test('jira-registration.test.ts: registerJiraTools adds exactly five tool ids and changes no existing one', () => {
  _resetRegistryForTests();
  registerGhTools();
  const before = new Map(listTools().map(t => [t.id, t] as const));
  assert.ok(before.size > 50 && !before.has('jira_workitem'));
  registerJiraTools();
  const after = new Map(listTools().map(t => [t.id, t] as const));
  const added = [...after.keys()].filter(id => !before.has(id)).sort();
  assert.deepEqual(added, ['jira_auth', 'jira_comment', 'jira_link', 'jira_project', 'jira_workitem']);
  // every tool that was there is still the same definition
  for (const [id, tool] of before) { assert.equal(after.get(id), tool, id); }
  assert.equal(after.size, before.size + 5);
  // the aggregate registers them too, with 32 ops in all
  _resetRegistryForTests();
  registerBuiltinTools();
  const ids = ['jira_workitem', 'jira_comment', 'jira_link', 'jira_project', 'jira_auth'];
  const ops = ids.map(id => ((getTool(id) as unknown as { ops: unknown[] }).ops.length));
  assert.deepEqual(ops, [15, 5, 4, 7, 1]);
  _resetRegistryForTests();
});

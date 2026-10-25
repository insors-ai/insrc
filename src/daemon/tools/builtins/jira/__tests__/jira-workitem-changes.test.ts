import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import type { ToolResult } from '../../../types.js';
import { WORKITEM_CHANGE_OPS, jiraWorkitemTool } from '../workitem.js';
import { installFakeAcli } from './_fakeacli.js';
import { deps } from './_sample.js';

const fixture = (name: string): string => readFileSync(join(fileURLToPath(new URL('./fixtures/', import.meta.url)), name), 'utf8');

async function run(input: Record<string, unknown>, stdout: string): Promise<{ r: ToolResult; calls: string[] }> {
  const fake = installFakeAcli('ok', { stdout });
  try { const r = await jiraWorkitemTool.execute(input, deps()); return { r, calls: fake.calls() }; } finally { fake.restore(); }
}
/** The batch form acli prints (recorded for edit, assign, transition, comment create, clone, archive and unarchive), for the given keys. */
const batch = (message: (k: string) => string, ...keys: string[]): string =>
  JSON.stringify({ results: keys.map(k => ({ status: 'SUCCESS', message: message(k), id: k })), totalCount: keys.length, successCount: keys.length });
const outputOk = (data: unknown): boolean => validateAgainstSchema(jiraWorkitemTool.outputSchema as unknown as StructuredSchema, data).ok;

test('jira-workitem-changes.test.ts: each changing op returns {ok, target, message} and its argv matches acli', async () => {
  assert.deepEqual(WORKITEM_CHANGE_OPS.map(o => [o.name, o.cls]), [
    ['create', 'common'], ['edit', 'common'], ['transition', 'common'], ['assign', 'common'], ['clone', 'common'], ['archive', 'common'], ['unarchive', 'common'],
    ['delete', 'destructive'], ['attachment-delete', 'destructive'], ['watcher-remove', 'common'],
  ]);
  assert.ok(WORKITEM_CHANGE_OPS.every(o => o.limitS === 60));
  const created = JSON.stringify({ key: 'IN-4', id: '10040', fields: { summary: 's' }, self: 'x', expand: null });
  const cases: { input: Record<string, unknown>; stdout: string; argv: string; target: string }[] = [
    { input: { op: 'create', project: 'IN', type: 'Task', summary: 'A task', description: '-starts with a dash', labels: ['a', 'b'], assignee: '@me', parent: 'IN-1' }, stdout: created,
      argv: 'jira workitem create --project IN --type Task --summary=A task --description=-starts with a dash --assignee @me --label=a,b --parent IN-1 --json', target: 'IN-4' },
    { input: { op: 'edit', keys: ['IN-1'], summary: 'new', labels: ['x'], removeLabels: ['y'] }, stdout: fixture('batch-edit-success.json'),
      argv: 'jira workitem edit --key IN-1 --summary=new --labels=x --remove-labels=y --yes --json', target: 'IN-1' },
    { input: { op: 'edit', keys: ['IN-1'], removeAssignee: true }, stdout: fixture('batch-edit-success.json'), argv: 'jira workitem edit --key IN-1 --remove-assignee --yes --json', target: 'IN-1' },
    { input: { op: 'transition', keys: ['IN-1', 'IN-2'], status: 'In Progress' }, stdout: batch(k => `Work item ${k} has been successfully transitioned to In Progress`, 'IN-1', 'IN-2'),
      argv: 'jira workitem transition --key IN-1,IN-2 --status In Progress --yes --json', target: 'IN-1,IN-2' },
    { input: { op: 'assign', keys: ['IN-1'], assignee: '@me' }, stdout: batch(k => `Work item ${k} has been successfully assigned to user@example.com`, 'IN-1'), argv: 'jira workitem assign --key IN-1 --assignee @me --yes --json', target: 'IN-1' },
    { input: { op: 'assign', keys: ['IN-1'], removeAssignee: true }, stdout: batch(k => `Work item ${k} has been unassigned`, 'IN-1'), argv: 'jira workitem assign --key IN-1 --remove-assignee --yes --json', target: 'IN-1' },
    { input: { op: 'clone', keys: ['IN-1'], toProject: 'IN' }, stdout: fixture('batch-clone.json'), argv: 'jira workitem clone --key IN-1 --to-project IN --yes --json', target: 'IN-3' },
    { input: { op: 'archive', keys: ['IN-2'] }, stdout: fixture('batch-edit-success.json'), argv: 'jira workitem archive --key IN-2 --yes --json', target: 'IN-1' },
    { input: { op: 'unarchive', keys: ['IN-2'] }, stdout: batch(k => `Work item ${k} has been successfully unarchived`, 'IN-2'), argv: 'jira workitem unarchive --key IN-2 --yes --json', target: 'IN-2' },
    { input: { op: 'delete', keys: ['IN-2'] }, stdout: batch(k => `Work item ${k} has been successfully deleted`, 'IN-2'), argv: 'jira workitem delete --key IN-2 --yes --json', target: 'IN-2' },
    { input: { op: 'attachment-delete', id: '10002' }, stdout: '✓ Attachment 10002 has been deleted\n', argv: 'jira workitem attachment delete --id 10002', target: '10002' },
    { input: { op: 'watcher-remove', key: 'IN-1', user: '712020:abc' }, stdout: '✓ Watcher removed successfully from issue IN-1\n', argv: 'jira workitem watcher remove --key IN-1 --user 712020:abc', target: 'IN-1' },
  ];
  for (const c of cases) {
    const { r, calls } = await run(c.input, c.stdout);
    assert.equal(r.success, true, `${String(c.input['op'])}: ${r.failure?.message ?? ''}`);
    assert.deepEqual(calls, [c.argv], String(c.input['op']));
    const data = r.data as { op: string; ok: boolean; target: string; message: string };
    assert.equal(data.op, c.input['op']);
    assert.equal(data.ok, true);
    assert.equal(data.target, c.target, `${String(c.input['op'])} target`);
    assert.ok(data.message.length > 0);
    assert.ok(outputOk(data), `${String(c.input['op'])} fits its output member`);
    assert.ok(!calls.some(x => x.includes('--paginate')));
  }
  // a text command without the success mark is a rejected failure
  for (const op of [{ op: 'attachment-delete', id: '1' }, { op: 'watcher-remove', key: 'IN-1', user: 'u' }]) {
    const bad = await run(op, 'done');
    assert.equal(bad.r.failure?.kind, 'rejected');
    assert.equal(bad.r.failure?.original, 'done');
  }
});

test('jira-workitem-changes.test.ts: keys only, repeated keys sent once, jql, filter and from-file refused', async () => {
  const keyed = ['edit', 'transition', 'assign', 'clone', 'archive', 'unarchive', 'delete'];
  const base: Record<string, Record<string, unknown>> = {
    edit: { summary: 's' }, transition: { status: 'Done' }, assign: { assignee: '@me' }, clone: {}, archive: {}, unarchive: {}, delete: {},
  };
  for (const op of keyed) {
    // repeated keys are sent once, in first-seen order
    const dup = await run({ op, keys: ['IN-2', 'IN-1', 'IN-2'], ...base[op] }, batch(k => `ok ${k}`, 'IN-2', 'IN-1'));
    assert.match(dup.calls[0] ?? '', / --key IN-2,IN-1 /, op);
    assert.match(dup.calls[0] ?? '', /--yes/, `${op} passes --yes`);
    // jql, filter and from-file are not inputs of a changing op
    for (const extra of [{ jql: 'project = "IN"' }, { filter: '10001' }, { fromFile: 'keys.txt' }, { 'from-file': 'keys.txt' }]) {
      const { r, calls } = await run({ op, keys: ['IN-1'], ...base[op], ...extra }, '{}');
      assert.equal(r.failure?.kind, 'rejected', `${op} ${JSON.stringify(extra)}`);
      assert.match(r.failure?.message ?? '', /does not accept the field/);
      assert.deepEqual(calls, []);
    }
    // keys are required
    const none = await run({ op, ...base[op] }, '{}');
    assert.match(none.r.failure?.message ?? '', /needs the field keys/);
  }
  // the schema caps the keys supplied at 50
  const schema = jiraWorkitemTool.inputSchema as unknown as StructuredSchema;
  const fifty = Array.from({ length: 50 }, (_, i) => `IN-${i + 1}`);
  assert.equal(validateAgainstSchema(schema, { op: 'delete', keys: fifty }).ok, true);
  assert.equal(validateAgainstSchema(schema, { op: 'delete', keys: [...fifty, 'IN-51'] }).ok, false);
  // edit needs something to change; assign takes exactly one of an assignee and removeAssignee
  assert.match((await run({ op: 'edit', keys: ['IN-1'] }, '{}')).r.failure?.message ?? '', /at least one of/);
  assert.match((await run({ op: 'edit', keys: ['IN-1'], assignee: '@me', removeAssignee: true }, '{}')).r.failure?.message ?? '', /at most one of assignee, removeAssignee/);
  assert.match((await run({ op: 'assign', keys: ['IN-1'] }, '{}')).r.failure?.message ?? '', /exactly one of assignee, removeAssignee/);
  // create needs a project, a type and a summary
  assert.match((await run({ op: 'create', project: 'IN', type: 'Task' }, '{}')).r.failure?.message ?? '', /needs the field summary/);
});

test('jira-workitem-changes.test.ts: a FAILURE result at exit 0 and a partial batch are rejected failures', async () => {
  const missing = await run({ op: 'edit', keys: ['IN-999'], summary: 's' }, fixture('batch-missing-key.json'));
  assert.equal(missing.r.success, false);
  assert.equal(missing.r.failure?.kind, 'rejected');
  assert.match(missing.r.failure?.message ?? '', /IN-999: Issue does not exist/);
  const noPath = await run({ op: 'transition', keys: ['IN-1'], status: 'Nonexistent' }, fixture('batch-no-transition.json'));
  assert.equal(noPath.r.failure?.kind, 'rejected');
  assert.match(noPath.r.failure?.message ?? '', /No allowed transitions found/);
  assert.match(noPath.r.failure?.message ?? '', /IN-1/);
  const partial = await run({ op: 'edit', keys: ['IN-1', 'IN-999'], summary: 's' }, fixture('batch-partial.json'));
  assert.equal(partial.r.failure?.kind, 'rejected');
  assert.match(partial.r.failure?.message ?? '', /succeeded: IN-1/);
  assert.match(partial.r.failure?.message ?? '', /the batch was partly applied/);
  // a delete that Jira refuses (the permission case seen on the IN project) is the same failure
  const denied = JSON.stringify({ results: [{ status: 'FAILURE', message: 'AuthException: You do not have permission to delete issues in this project.', id: 'IN-1' }], totalCount: 1, successCount: 0 });
  const del = await run({ op: 'delete', keys: ['IN-1'] }, denied);
  assert.equal(del.r.failure?.kind, 'rejected');
  assert.match(del.r.failure?.message ?? '', /permission to delete issues/);
  // a clone message without the new key is a failure, not a guess
  const clone = await run({ op: 'clone', keys: ['IN-1'] }, batch(k => `Work item ${k} has been cloned`, 'IN-1'));
  assert.equal(clone.r.failure?.kind, 'rejected');
  assert.match(clone.r.failure?.message ?? '', /did not say the key of the new work item/);
});

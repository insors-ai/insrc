import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import type { ToolResult } from '../../../types.js';
import type { GhFamilyTool } from '../../gh/op-table.js';
import { COMMENT_OPS, jiraCommentTool } from '../comment.js';
import { LINK_OPS, jiraLinkTool } from '../link.js';
import { installFakeAcli } from './_fakeacli.js';
import { deps } from './_sample.js';

const fixture = (name: string): string => readFileSync(join(fileURLToPath(new URL('./fixtures/', import.meta.url)), name), 'utf8');

async function run(tool: GhFamilyTool, input: Record<string, unknown>, stdout: string): Promise<{ r: ToolResult; calls: string[] }> {
  const fake = installFakeAcli('ok', { stdout });
  try { const r = await tool.execute(input, deps()); return { r, calls: fake.calls() }; } finally { fake.restore(); }
}
const fits = (tool: GhFamilyTool, data: unknown): boolean => validateAgainstSchema(tool.outputSchema as unknown as StructuredSchema, data).ok;

test('jira-comment-link.test.ts: every comment and link op returns its declared shape and its argv matches acli', async () => {
  assert.deepEqual(COMMENT_OPS.map(o => [o.name, o.cls]), [['list', 'none'], ['create', 'common'], ['update', 'common'], ['delete', 'destructive'], ['visibility', 'none']]);
  assert.deepEqual(LINK_OPS.map(o => [o.name, o.cls]), [['list', 'none'], ['types', 'none'], ['create', 'common'], ['delete', 'destructive']]);

  const cases: { tool: GhFamilyTool; input: Record<string, unknown>; stdout: string; argv: string; check: (d: Record<string, any>) => void }[] = [
    { tool: jiraCommentTool, input: { op: 'list', key: 'IN-1' }, stdout: fixture('comment-list.json'), argv: 'jira workitem comment list --key IN-1 --limit 50 --json',
      check: d => { assert.equal(d['total'], 1); assert.equal(d['isLast'], false); assert.equal(d['comments'].length, 1); } },
    { tool: jiraCommentTool, input: { op: 'list', key: 'IN-1', limit: 200 }, stdout: fixture('comment-list.json'), argv: 'jira workitem comment list --key IN-1 --limit 200 --json', check: () => {} },
    { tool: jiraCommentTool, input: { op: 'create', keys: ['IN-1'], body: '-a comment that starts with a dash' }, stdout: fixture('batch-comment-create.json'),
      argv: 'jira workitem comment create --key IN-1 --body=-a comment that starts with a dash --json', check: d => { assert.equal(d['target'], 'IN-1'); assert.equal(d['ok'], true); } },
    { tool: jiraCommentTool, input: { op: 'update', key: 'IN-1', id: '10001', body: 'edited' }, stdout: fixture('comment-update.txt'),
      argv: 'jira workitem comment update --key IN-1 --id 10001 --body=edited', check: d => { assert.equal(d['target'], '10001'); assert.match(d['message'], /successfully updated/); } },
    { tool: jiraCommentTool, input: { op: 'delete', key: 'IN-1', id: '10001' }, stdout: '✓ Successfully deleted the comment with id 10001\n',
      argv: 'jira workitem comment delete --key IN-1 --id 10001', check: d => { assert.equal(d['target'], '10001'); assert.equal(d['ok'], true); } },
    { tool: jiraCommentTool, input: { op: 'visibility', group: true }, stdout: fixture('visibility-group.txt'), argv: 'jira workitem comment visibility --group',
      check: d => { assert.equal(d['groups'].length, 26); assert.equal(d['roles'], undefined); } },
    { tool: jiraCommentTool, input: { op: 'visibility', role: true, project: 'IN' }, stdout: fixture('visibility-role.txt'), argv: 'jira workitem comment visibility --role --project IN',
      check: d => { assert.deepEqual(d['roles'], ['Administrators', 'atlassian-addons-project-access', 'jira-guest-member']); } },
    { tool: jiraLinkTool, input: { op: 'list', key: 'IN-1' }, stdout: fixture('link-list.json'), argv: 'jira workitem link list --key IN-1 --json', check: d => { assert.equal(d['links'].length, 1); } },
    { tool: jiraLinkTool, input: { op: 'types' }, stdout: fixture('link-types.json'), argv: 'jira workitem link type --json', check: d => { assert.deepEqual(d['types'], ['Blocks', 'Cloners', 'Duplicate', 'Relates']); } },
    { tool: jiraLinkTool, input: { op: 'create', out: 'IN-1', in: 'IN-2', type: 'Blocks' }, stdout: '✓ Link between issues has been successfully created (IN-1 Blocks IN-2)\n',
      argv: 'jira workitem link create --out IN-1 --in IN-2 --type Blocks --yes', check: d => { assert.equal(d['target'], 'IN-1 Blocks IN-2'); assert.equal(d['ok'], true); } },
    { tool: jiraLinkTool, input: { op: 'delete', id: '10001' }, stdout: fixture('link-delete.txt'), argv: 'jira workitem link delete --id 10001 --yes',
      check: d => { assert.equal(d['target'], '10001'); assert.equal(d['message'], 'Link has been successfully deleted (10001)'); } },
  ];
  for (const c of cases) {
    const { r, calls } = await run(c.tool, c.input, c.stdout);
    const what = `${c.tool.id} ${String(c.input['op'])}`;
    assert.equal(r.success, true, `${what}: ${r.failure?.message ?? ''}`);
    assert.deepEqual(calls, [c.argv], what);
    const data = r.data as Record<string, any>;
    assert.equal(data['op'], c.input['op']);
    assert.ok(fits(c.tool, data), `${what} fits its output member`);
    c.check(data);
    assert.ok(!calls.some(x => x.includes('--paginate') || x.includes('--body-file') || x.includes('--body-adf') || x.includes('--editor')));
  }
});

test('jira-comment-link.test.ts: text commands without the success mark are rejected and visibility rules are enforced', async () => {
  // a text command succeeds only on the success mark
  const text: [GhFamilyTool, Record<string, unknown>][] = [
    [jiraCommentTool, { op: 'update', key: 'IN-1', id: '1', body: 'x' }], [jiraCommentTool, { op: 'delete', key: 'IN-1', id: '1' }],
    [jiraLinkTool, { op: 'create', out: 'IN-1', in: 'IN-2', type: 'Blocks' }], [jiraLinkTool, { op: 'delete', id: '1' }],
  ];
  for (const [tool, input] of text) {
    for (const stdout of ['done', '', '✗ Can not find a comment for the id: 99999.\n']) {
      const { r } = await run(tool, input, stdout);
      assert.equal(r.success, false, `${String(input['op'])} ${JSON.stringify(stdout)}`);
      assert.equal(r.failure?.kind, 'rejected');
      assert.equal(r.failure?.original, stdout);
    }
  }
  // acli's own failure (exit 1) is a rejected failure with its text
  const fake = installFakeAcli('fail-generic');
  try {
    const r = await jiraCommentTool.execute({ op: 'update', key: 'IN-1', id: '99999', body: 'x' }, deps());
    assert.equal(r.failure?.kind, 'rejected');
  } finally { fake.restore(); }
  // visibility: exactly one of group and role, and role needs project, which goes only with role
  const refuse: [Record<string, unknown>, RegExp][] = [
    [{ op: 'visibility' }, /exactly one of group, role/],
    [{ op: 'visibility', group: true, role: true, project: 'IN' }, /exactly one of group, role/],
    [{ op: 'visibility', role: true }, /role needs the field project/],
    [{ op: 'visibility', group: true, project: 'IN' }, /project only together with role/],
    [{ op: 'visibility', role: true, project: '-IN' }, /not a valid project key/],
  ];
  for (const [input, re] of refuse) {
    const { r, calls } = await run(jiraCommentTool, input, '');
    assert.equal(r.failure?.kind, 'rejected', JSON.stringify(input));
    assert.match(r.failure?.message ?? '', re);
    assert.deepEqual(calls, []);
  }
  // an unreadable visibility body is a failure, never an empty list
  const heading = await run(jiraCommentTool, { op: 'visibility', group: true }, '✓ Available Groups (3 total):\n');
  assert.equal(heading.r.failure?.kind, 'rejected');
  assert.equal((await run(jiraCommentTool, { op: 'visibility', role: true, project: 'IN' }, '✓ Available Roles:\n')).r.failure?.kind, 'rejected');
  // the comment body comes only from the body field: no file, ADF or editor input exists
  const schema = jiraCommentTool.inputSchema as unknown as StructuredSchema;
  for (const extra of [{ bodyFile: 'a.txt' }, { 'body-file': 'a.txt' }, { bodyAdf: 'a.json' }, { editor: true }, { jql: 'x' }, { filter: '1' }, { notify: true }]) {
    assert.equal(validateAgainstSchema(schema, { op: 'update', key: 'IN-1', id: '1', body: 'x', ...extra }).ok, false, JSON.stringify(extra));
  }
  // comment list is bounded to 1..200 and never paginates
  assert.equal(validateAgainstSchema(schema, { op: 'list', key: 'IN-1', limit: 200 }).ok, true);
  assert.equal(validateAgainstSchema(schema, { op: 'list', key: 'IN-1', limit: 201 }).ok, false);
  assert.equal(validateAgainstSchema(schema, { op: 'list', key: 'IN-1', paginate: true }).ok, false);
  // link create: both keys and a type are required
  assert.match((await run(jiraLinkTool, { op: 'create', out: 'IN-1', in: 'IN-2' }, '')).r.failure?.message ?? '', /needs the field type/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import type { ToolResult } from '../../../types.js';
import type { GhFamilyTool } from '../../gh/op-table.js';
import { AUTH_OPS, jiraAuthTool } from '../auth.js';
import { PROJECT_OPS, jiraProjectTool } from '../project.js';
import { installFakeAcli } from './_fakeacli.js';
import { deps } from './_sample.js';

const fixture = (name: string): string => readFileSync(join(fileURLToPath(new URL('./fixtures/', import.meta.url)), name), 'utf8');

async function run(tool: GhFamilyTool, input: Record<string, unknown>, stdout: string, mode = 'ok'): Promise<{ r: ToolResult; calls: string[] }> {
  const fake = installFakeAcli(mode, { stdout, probe: 'file' }); // 'jira auth status' prints the given text too
  try { const r = await tool.execute(input, deps()); return { r, calls: fake.calls() }; } finally { fake.restore(); }
}
const fits = (tool: GhFamilyTool, data: unknown): boolean => validateAgainstSchema(tool.outputSchema as unknown as StructuredSchema, data).ok;

test('jira-project-auth.test.ts: every project op and auth status returns its declared shape and its argv matches acli', async () => {
  assert.deepEqual(PROJECT_OPS.map(o => [o.name, o.cls]), [['list', 'none'], ['view', 'none'], ['create', 'common'], ['update', 'common'], ['archive', 'destructive'], ['restore', 'common'], ['delete', 'destructive']]);
  assert.deepEqual(AUTH_OPS.map(o => [o.name, o.cls]), [['status', 'none']]);

  const mark = '✓ done\n';
  const cases: { tool: GhFamilyTool; input: Record<string, unknown>; stdout: string; argv: string; check: (d: Record<string, any>) => void }[] = [
    { tool: jiraProjectTool, input: { op: 'list' }, stdout: fixture('project-list.json'), argv: 'jira project list --limit 30 --json',
      check: d => { assert.equal(d['count'], 2); assert.deepEqual(d['projects'][0], { key: 'IN', id: '10001', name: 'insrc' }); } },
    { tool: jiraProjectTool, input: { op: 'list', limit: 200 }, stdout: fixture('project-list.json'), argv: 'jira project list --limit 200 --json', check: () => {} },
    { tool: jiraProjectTool, input: { op: 'list', recent: true }, stdout: fixture('project-list.json'), argv: 'jira project list --recent --json', check: () => {} },
    { tool: jiraProjectTool, input: { op: 'view', key: 'IN' }, stdout: fixture('project-view.json'), argv: 'jira project view --key IN --json',
      check: d => { assert.deepEqual(d['project'], { key: 'IN', id: '10001', name: 'insrc' }); } },
    { tool: jiraProjectTool, input: { op: 'create', fromProject: 'IN', key: 'ZZPROBE', name: 'Probe', description: '-d', url: 'https://x.io', leadEmail: 'a@b.co' }, stdout: mark,
      argv: 'jira project create --from-project IN --key ZZPROBE --name=Probe --description=-d --url=https://x.io --lead-email=a@b.co', check: d => { assert.equal(d['target'], 'ZZPROBE'); assert.equal(d['ok'], true); } },
    { tool: jiraProjectTool, input: { op: 'create', fromProject: 'IN', key: 'ZZPROBE', name: 'Probe' }, stdout: mark, argv: 'jira project create --from-project IN --key ZZPROBE --name=Probe', check: () => {} },
    { tool: jiraProjectTool, input: { op: 'update', projectKey: 'ZZPROBE', name: 'Renamed', key: 'ZZP2' }, stdout: mark,
      argv: 'jira project update --project-key ZZPROBE --key ZZP2 --name=Renamed', check: d => { assert.equal(d['target'], 'ZZPROBE'); } },
    { tool: jiraProjectTool, input: { op: 'archive', key: 'ZZPROBE' }, stdout: mark, argv: 'jira project archive --key ZZPROBE', check: d => { assert.equal(d['target'], 'ZZPROBE'); } },
    { tool: jiraProjectTool, input: { op: 'restore', key: 'ZZPROBE' }, stdout: mark, argv: 'jira project restore --key ZZPROBE', check: () => {} },
    { tool: jiraProjectTool, input: { op: 'delete', key: 'ZZPROBE' }, stdout: mark, argv: 'jira project delete --key ZZPROBE', check: () => {} },
    { tool: jiraAuthTool, input: { op: 'status' }, stdout: fixture('auth-status.txt'), argv: 'jira auth status',
      check: d => { assert.deepEqual({ signedIn: d['signedIn'], site: d['site'], email: d['email'], authType: d['authType'] }, { signedIn: true, site: 'example.atlassian.net', email: 'user@example.com', authType: 'oauth' }); } },
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
    // no op writes a flag that reads or writes a local file, and none passes --yes (the project commands have none)
    assert.ok(!calls.some(x => /--(from-json|generate-json|paginate|yes)/.test(x)), what);
  }
  // the project commands accept the success mark only
  const bad = await run(jiraProjectTool, { op: 'archive', key: 'ZZPROBE' }, 'archived');
  assert.equal(bad.r.failure?.kind, 'rejected');
  assert.equal(bad.r.failure?.original, 'archived');
  // auth status needs no model call: it reads text, and signed-out text is not signed in
  const out = await run(jiraAuthTool, { op: 'status' }, '');
  assert.equal((out.r.data as { signedIn: boolean }).signedIn, false);
});

test('jira-project-auth.test.ts: project create needs fromProject and a non-company-managed source is a rejected failure', async () => {
  for (const [input, re] of [
    [{ op: 'create', key: 'ZZPROBE', name: 'x' }, /needs the field fromProject/],
    [{ op: 'create', fromProject: 'IN', name: 'x' }, /needs the field key/],
    [{ op: 'create', fromProject: 'IN', key: 'ZZPROBE' }, /needs the field name/],
    [{ op: 'create', fromProject: '-IN', key: 'ZZPROBE', name: 'x' }, /not a valid project key/],
    [{ op: 'create', fromProject: 'IN', key: 'zz probe', name: 'x' }, /not a valid project key/],
    [{ op: 'create', fromProject: 'IN', key: 'ZZPROBE', name: 'x', fromJson: 'p.json' }, /does not accept the field fromJson/],
    [{ op: 'create', fromProject: 'IN', key: 'ZZPROBE', name: 'x', generateJson: true }, /does not accept the field generateJson/],
    [{ op: 'update', projectKey: 'ZZPROBE' }, /at least one of/],
    [{ op: 'list', limit: 5, recent: true }, /at most one of limit, recent/],
  ] as [Record<string, unknown>, RegExp][]) {
    const { r, calls } = await run(jiraProjectTool, input, '');
    assert.equal(r.failure?.kind, 'rejected', JSON.stringify(input));
    assert.match(r.failure?.message ?? '', re);
    assert.deepEqual(calls, []);
  }
  // the schema bounds the project list to 1..200
  const schema = jiraProjectTool.inputSchema as unknown as StructuredSchema;
  assert.equal(validateAgainstSchema(schema, { op: 'list', limit: 200 }).ok, true);
  assert.equal(validateAgainstSchema(schema, { op: 'list', limit: 201 }).ok, false);
  // a source that is not company-managed: acli's refusal text reaches the caller
  const refusal = '✗ Error: Only company managed projects can be used to clone a new project\n';
  const { r } = await run(jiraProjectTool, { op: 'create', fromProject: 'SCRUM', key: 'ZZPROBE', name: 'x' }, refusal, 'fail-file');
  assert.equal(r.success, false);
  assert.equal(r.failure?.kind, 'rejected');
  assert.match(r.failure?.message ?? '', /company managed projects/);
  assert.match(r.failure?.message ?? '', /outcome is unknown/);
});

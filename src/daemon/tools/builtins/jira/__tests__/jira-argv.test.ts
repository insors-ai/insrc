import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csv, field, lit, on, rep, val } from '../../gh/op-table.js';
import type { OpDef } from '../../gh/op-table.js';
import { jiraArgv } from '../exec.js';

const custom = { kind: 'custom', shape: {}, build: async () => ({}) } as const;
const op = (name: string, command: string[], fields: OpDef['fields'], args: OpDef['args'], extra: Partial<OpDef> = {}): OpDef =>
  ({ name, command, cls: 'none', limitS: 30, fields, args, out: custom, ...extra });

const search = op('search', ['workitem', 'search'], { jql: field.str(), limit: field.int(), fields: field.strs() }, [lit('--json'), val('--jql', 'jql'), val('--limit', 'limit'), csv('--fields', 'fields')]);
const edit = op('edit', ['workitem', 'edit'], { keys: field.strs(), summary: field.str(), labels: field.strs(), status: field.str() }, [csv('--key', 'keys'), val('--summary', 'summary'), rep('--labels', 'labels'), lit('--yes', '--json')], { cls: 'common' });
const transition = op('transition', ['workitem', 'transition'], { keys: field.strs(), status: field.str() }, [csv('--key', 'keys'), val('--status', 'status'), lit('--yes', '--json')], { cls: 'common' });
const commentList = op('list', ['workitem', 'comment', 'list'], { key: field.str(), limit: field.int() }, [val('--key', 'key'), val('--limit', 'limit'), lit('--json')]);
const projectList = op('list', ['project', 'list'], { limit: field.int(), recent: field.bool() }, [on('--recent', 'recent'), val('--limit', 'limit'), lit('--json')]);
const projectCreate = op('create', ['project', 'create'], { key: field.str(), fromProject: field.str(), name: field.str(), description: field.str(), leadEmail: field.str() },
  [val('--from-project', 'fromProject'), val('--key', 'key'), val('--name', 'name'), val('--description', 'description'), val('--lead-email', 'leadEmail')], { cls: 'common' });

test('jira-argv.test.ts: jiraArgv head, --yes, literal --json, finite --limit, never --paginate and free text as one --flag=value token', () => {
  // the head is 'acli jira' and the op's words follow; the gh head of buildArgv is gone
  const s = jiraArgv(search, { op: 'search', jql: 'project = "IN"', limit: 5 });
  assert.deepEqual(s.slice(0, 4), ['acli', 'jira', 'workitem', 'search']);
  assert.ok(!s.includes('gh'));
  // a literal boolean --json, and a finite --limit (the default when none is given), never --paginate
  assert.ok(s.includes('--json'));
  assert.deepEqual(s.slice(s.indexOf('--limit'), s.indexOf('--limit') + 2), ['--limit', '5']);
  assert.equal(jiraArgv(search, { op: 'search', jql: 'x' })[jiraArgv(search, { op: 'search', jql: 'x' }).indexOf('--limit') + 1], '50');
  assert.equal(jiraArgv(commentList, { op: 'list', key: 'IN-1' }).at(jiraArgv(commentList, { op: 'list', key: 'IN-1' }).indexOf('--limit') + 1), '50');
  const pl = jiraArgv(projectList, { op: 'list' });
  assert.equal(pl[pl.indexOf('--limit') + 1], '30');
  const recent = jiraArgv(projectList, { op: 'list', recent: true });
  assert.ok(recent.includes('--recent') && !recent.includes('--limit'), 'recent replaces the limit');
  for (const argv of [s, pl, recent, jiraArgv(edit, { op: 'edit', keys: ['IN-1'], summary: 's' })]) { assert.ok(!argv.includes('--paginate')); }
  // --yes where the op has it, and repeated keys are sent once as one comma list
  const e = jiraArgv(edit, { op: 'edit', keys: ['IN-2', 'IN-1', 'IN-2'], summary: 'new' });
  assert.ok(e.includes('--yes'));
  assert.equal(e[e.indexOf('--key') + 1], 'IN-2,IN-1');
  // free text is one --flag=value token, including a value that starts with '-'
  const dash = jiraArgv(edit, { op: 'edit', keys: ['IN-1'], summary: '-rf looks like a flag', labels: ['-a', 'b'] });
  assert.ok(dash.includes('--summary=-rf looks like a flag'));
  assert.ok(!dash.includes('--summary'));
  assert.ok(dash.includes('--labels=-a') && dash.includes('--labels=b'));
  const j = jiraArgv(search, { op: 'search', jql: '-labels = x', fields: ['key', 'summary'] });
  assert.ok(j.includes('--jql=-labels = x'));
  assert.ok(j.includes('--fields=key,summary'));
  // keys and ids keep two tokens (they cannot start with a dash); a status name is free text and is joined
  const t = jiraArgv(transition, { op: 'transition', keys: ['IN-1'], status: 'In Progress' });
  assert.deepEqual(t.slice(-5), ['--key', 'IN-1', '--status=In Progress', '--yes', '--json']);
  // project create: from an existing project, never a JSON file
  const c = jiraArgv(projectCreate, { op: 'create', fromProject: 'IN', key: 'ZZPROBE', name: 'Probe', description: 'd', leadEmail: 'a@b.c' });
  assert.deepEqual(c.slice(0, 4), ['acli', 'jira', 'project', 'create']);
  assert.deepEqual(c.slice(4, 10), ['--from-project', 'IN', '--key', 'ZZPROBE', '--name=Probe', '--description=d']);
  assert.ok(!c.some(x => x.startsWith('--from-json') || x === '--generate-json'));
});

test('jira-argv.test.ts: an op that would write a forbidden flag, or does not use the custom output, is refused', () => {
  const paginate = op('bad', ['workitem', 'search'], {}, [lit('--paginate')]);
  assert.throws(() => jiraArgv(paginate, { op: 'bad' }), /--paginate/);
  const fromJson = op('bad', ['project', 'create'], { f: field.str() }, [val('--from-json', 'f')]);
  assert.throws(() => jiraArgv(fromJson, { op: 'bad', f: 'x.json' }), /--from-json/);
  const items = op('bad', ['workitem', 'view'], {}, [], { out: { kind: 'items', jsonFields: ['key'] } });
  assert.throws(() => jiraArgv(items, { op: 'bad' }), /custom/);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import { buildInputSchema, field, lit } from '../../gh/op-table.js';
import type { OpDef } from '../../gh/op-table.js';
import { JIRA_LIMITS } from '../limits.js';
import { checkJiraValues, jiraInputSchema, normalizeKeys } from '../input.js';

const okIn = (schema: unknown, i: Record<string, unknown>): boolean => validateAgainstSchema(schema as StructuredSchema, i).ok;

const op = (name: string, command: string[], fields: OpDef['fields'], extra: Partial<OpDef> = {}): OpDef => ({
  name, command, cls: 'none', limitS: 30, fields, args: [lit('--json')], out: { kind: 'custom', shape: {}, build: async () => ({}) }, ...extra,
});

const workitem: OpDef[] = [
  op('search', ['workitem', 'search'], { jql: field.str(), limit: field.int() }),
  op('edit', ['workitem', 'edit'], { keys: field.strs(), summary: field.str(), assignee: field.str(), status: field.str(), parent: field.str(), project: field.str(), type: field.str() }),
  op('view', ['workitem', 'view'], { key: field.str() }),
  op('attachment-delete', ['workitem', 'attachment', 'delete'], { id: field.str() }),
  op('watcher-remove', ['workitem', 'watcher', 'remove'], { key: field.str(), user: field.str() }),
  op('clone', ['workitem', 'clone'], { keys: field.strs(), toProject: field.str() }),
];
const comment: OpDef[] = [op('list', ['workitem', 'comment', 'list'], { key: field.str(), limit: field.int() })];
const project: OpDef[] = [
  op('list', ['project', 'list'], { limit: field.int(), recent: field.bool() }),
  op('create', ['project', 'create'], { key: field.str(), fromProject: field.str(), name: field.str() }),
  op('update', ['project', 'update'], { projectKey: field.str(), key: field.str() }),
];
const link: OpDef[] = [op('create', ['workitem', 'link', 'create'], { out: field.str(), in: field.str(), type: field.str() })];


test('jira-inputs.test.ts: jiraInputSchema sets maximum 500, 200 and 200, maxItems 50 and identifier patterns', () => {
  const props = (s: unknown): Record<string, any> => (s as { properties: Record<string, any> }).properties;
  const w = props(jiraInputSchema(buildInputSchema(workitem), workitem));
  assert.equal(w['limit'].maximum, JIRA_LIMITS.searchMax);
  assert.equal(w['limit'].maximum, 500);
  assert.equal(w['keys'].maxItems, 50);
  assert.ok(w['keys'].items.pattern, 'key array items carry the work item key pattern');
  for (const f of ['parent', 'project', 'toProject', 'id', 'user', 'assignee', 'status', 'type', 'key']) { assert.ok(w[f].pattern, `${f} has a pattern`); }
  assert.equal(w['summary'].pattern, undefined, 'free text has no pattern');
  assert.equal(props(jiraInputSchema(buildInputSchema(comment), comment))['limit'].maximum, 200);
  const p = props(jiraInputSchema(buildInputSchema(project), project));
  assert.equal(p['limit'].maximum, 200);
  assert.ok(p['key'].pattern.includes('[A-Z0-9_]*$') && !p['key'].pattern.includes('\\d'), 'key is a project key for the project commands');
  assert.ok(p['fromProject'].pattern && p['projectKey'].pattern);
  assert.ok(props(jiraInputSchema(buildInputSchema(link), link))['out'].pattern);
  // the base schema is not modified
  assert.equal(props(buildInputSchema(workitem))['keys'].maxItems, undefined);
  // the schema is enforced
  const schema = jiraInputSchema(buildInputSchema(workitem), workitem);
  assert.equal(okIn(schema, { op: 'search', limit: 500 }), true);
  assert.equal(okIn(schema, { op: 'search', limit: 501 }), false);
  assert.equal(okIn(schema, { op: 'view', key: 'IN-12' }), true);
  assert.equal(okIn(schema, { op: 'view', key: '-IN-12' }), false);
  assert.equal(okIn(schema, { op: 'view', key: 'in-1' }), false);
});

test('jira-inputs.test.ts: 51 keys with repeats are refused and normalizeKeys keeps first-seen order', () => {
  const schema = jiraInputSchema(buildInputSchema(workitem), workitem);
  const fifty = Array.from({ length: 50 }, (_, i) => `IN-${i + 1}`);
  assert.equal(okIn(schema, { op: 'edit', keys: fifty }), true);
  // 51 supplied, though only 2 are distinct: the cap applies to the keys supplied
  assert.equal(okIn(schema, { op: 'edit', keys: Array.from({ length: 51 }, (_, i) => (i % 2 === 0 ? 'IN-1' : 'IN-2')) }), false);
  assert.equal(okIn(schema, { op: 'edit', keys: [] }), false);
  assert.deepEqual(normalizeKeys(['IN-3', 'IN-1', 'IN-3', 'IN-2', 'IN-1']), ['IN-3', 'IN-1', 'IN-2']);
  assert.deepEqual(normalizeKeys([]), []);
});

const edit0 = (): OpDef => workitem.find(o => o.name === 'edit')!;

test('jira-inputs.test.ts: checkJiraValues refuses a leading-dash value in every identifier field', () => {
  const find = (ops: OpDef[], name: string): OpDef => ops.find(o => o.name === name)!;
  const cases: [OpDef, string, unknown][] = [
    [find(workitem, 'view'), 'key', '-IN-1'],
    [find(workitem, 'edit'), 'keys', ['IN-1', '-IN-2']],
    [find(workitem, 'edit'), 'project', '-IN'],
    [find(workitem, 'clone'), 'toProject', '-IN'],
    [find(project, 'update'), 'projectKey', '-IN'],
    [find(project, 'create'), 'fromProject', '-IN'],
    [find(workitem, 'attachment-delete'), 'id', '-1'],
    [find(workitem, 'watcher-remove'), 'user', '-abc'],
    [find(workitem, 'edit'), 'assignee', '-x@y.z'],
    [find(workitem, 'edit'), 'status', '-Done'],
    [find(link, 'create'), 'type', '-Blocks'],
    [find(link, 'create'), 'out', '-IN-1'],
    [find(workitem, 'edit'), 'parent', '-IN-1'],
  ];
  for (const [def, name, value] of cases) {
    const f = checkJiraValues(def, { op: def.name, [name]: value });
    assert.equal(f?.kind, 'rejected', `${def.name}.${name}`);
    assert.match(f?.message ?? '', new RegExp(name));
  }
  // names may use any letters, as configured on the site
  assert.equal(checkJiraValues(edit0(), { op: 'edit', status: 'Erledigt – prüfen' }), undefined);
  // valid values pass, including a status with spaces, an email, '@me' and a project key for the project commands
  const edit = find(workitem, 'edit');
  assert.equal(checkJiraValues(edit, { op: 'edit', keys: ['IN-1', 'ABC_D-20'], status: 'In Progress', assignee: 'a.b@x.io', parent: 'IN-4', summary: '-free text may start with a dash' }), undefined);
  assert.equal(checkJiraValues(edit, { op: 'edit', assignee: '@me' }), undefined);
  assert.equal(checkJiraValues(find(project, 'create'), { op: 'create', key: 'ZZPROBE', fromProject: 'IN', name: 'x' }), undefined);
  // a work item key is not a valid project key and the reverse
  assert.equal(checkJiraValues(find(project, 'create'), { op: 'create', key: 'IN-1' })?.kind, 'rejected');
  assert.equal(checkJiraValues(find(workitem, 'view'), { op: 'view', key: 'IN' })?.kind, 'rejected');
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import { buildOutputSchema } from '../../gh/op-table.js';
import type { OpDef } from '../../gh/op-table.js';
import * as shapes from '../schemas.js';

const fixture = (name: string): unknown => JSON.parse(readFileSync(join(fileURLToPath(new URL('./fixtures/', import.meta.url)), name), 'utf8'));
const op = (name: string, shape: shapes.Shape): OpDef => ({ name, command: ['x'], cls: 'none', limitS: 30, args: [], out: { kind: 'custom', shape, build: async () => ({}) } });

const ops = [
  op('change', shapes.changeShape), op('view', shapes.viewShape), op('search', shapes.searchShape), op('count', shapes.countShape),
  op('attachment-list', shapes.attachmentListShape), op('watcher-list', shapes.watcherListShape), op('comment-list', shapes.commentListShape),
  op('visibility', shapes.visibilityShape), op('link-list', shapes.linkListShape), op('types', shapes.linkTypesShape),
  op('project-list', shapes.projectListShape), op('project-view', shapes.projectViewShape), op('status', shapes.authStatusShape),
];
const union = buildOutputSchema(ops) as unknown as StructuredSchema;
const ok = (v: unknown): boolean => validateAgainstSchema(union, v).ok;

test('jira-output-schemas.test.ts: each shape accepts its recorded answer, passes extra properties through and rejects a wrong literal op', () => {
  const comments = fixture('comment-list.json') as { comments: unknown[]; isLast: boolean; total: number };
  const watchers = fixture('watcher-list.json') as { watchCount: number; watchers: unknown[] };
  const answers: Record<string, Record<string, unknown>> = {
    change: { ok: true, target: 'IN-1', message: 'Work item IN-1 has been successfully edited' },
    view: { item: { key: 'IN-1', id: '10036', fields: { summary: 's', assignee: null }, transitions: null, names: null } },
    search: { count: 1, items: [{ key: 'IN-1', id: '10036', fields: { summary: 's' }, self: 'x', expand: null }] },
    count: { count: 2 },
    'attachment-list': { count: 0, attachments: (fixture('attachment-list.json') as { attachments: unknown[] }).attachments },
    'watcher-list': { count: watchers.watchCount, watchers: watchers.watchers },
    'comment-list': { total: comments.total, isLast: comments.isLast, comments: comments.comments },
    visibility: { groups: [{ name: 'org-admins', id: '9cd994c5' }] },
    'link-list': { links: (fixture('link-list.json') as { issueLinks: unknown[] }).issueLinks },
    types: { types: ['Blocks', 'Cloners', 'Duplicate', 'Relates'] },
    'project-list': { count: 1, projects: [{ key: 'IN', id: '10001', name: 'insrc', style: 'classic', archived: null }] },
    'project-view': { project: { key: 'IN', id: '10001', name: 'insrc', lead: { displayName: 'x' }, roles: null } },
    status: { signedIn: true, site: 'example.atlassian.net', email: 'user@example.com', authType: 'oauth' },
  };
  for (const [name, answer] of Object.entries(answers)) {
    assert.equal(ok({ op: name, ...answer }), true, `${name} accepts its recorded answer`);
    // the literal op must match the shape: any other op name is refused
    assert.equal(ok({ op: name === 'types' ? 'view' : 'types', ...answer }), false, `${name} answer under an op whose shape it does not fit`);
    assert.equal(ok({ op: 'nope', ...answer }), false, `${name} answer under an unknown op`);
  }
  // a watcher is typed by its accountId only: a null displayName or a null accountId is not a failure
  assert.equal(ok({ op: 'watcher-list', count: 1, watchers: [{ accountId: 'a', displayName: null, emailAddress: null }] }), true);
  assert.equal(ok({ op: 'watcher-list', count: 1, watchers: [{ accountId: null }] }), true);
  assert.equal(ok({ op: 'watcher-list', count: 1, watchers: [{ accountId: 5 }] }), false);
  // the roles variant of visibility, and a signed-out status
  assert.equal(ok({ op: 'visibility', roles: ['Administrators'] }), true);
  assert.equal(ok({ op: 'status', signedIn: false }), true);
  // only key, id and name (a watcher's accountId) are typed: a missing key or a wrong type is refused
  assert.equal(ok({ op: 'view', item: { id: '1' } }), false);
  assert.equal(ok({ op: 'project-list', count: 1, projects: [{ key: 'IN', id: '1' }] }), false);
  assert.equal(ok({ op: 'change', ok: 'yes', target: 'x', message: 'm' }), false);
  assert.equal(ok({ op: 'count', count: '2' }), false);
});

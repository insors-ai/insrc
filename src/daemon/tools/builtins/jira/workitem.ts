/** jira_workitem: the work item reads (view, search, count, attachment-list, watcher-list) and, below them, the changes. */

import { csv, field, lit, on, pos, val } from '../gh/op-table.js';
import type { OpDef } from '../gh/op-table.js';
import type { GhFamilyTool } from '../gh/op-table.js';
import { batchAnswer, countAnswer, jsonAnswer, markAnswer } from './answers.js';
import { defineJiraFamily } from './family.js';
import { attachmentListShape, changeShape, countShape, searchShape, viewShape, watcherListShape } from './schemas.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
/** The top-level properties of a REST object that carry a value (acli prints dozens of nulls). */
const withValues = (o: Obj): Obj => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null));
const isWorkItem = (v: unknown): v is Obj => isObj(v) && typeof v['key'] === 'string' && typeof v['id'] === 'string';

const view: OpDef = {
  name: 'view', command: ['workitem', 'view'], cls: 'none', limitS: 30,
  required: ['key'], fields: { key: field.str('The work item key.'), fields: field.strs('The fields to return (default: key, issuetype, summary, status, assignee, description).') },
  args: [pos('key'), csv('--fields', 'fields'), lit('--json')],
  out: { kind: 'custom', shape: viewShape, build: jsonAnswer('a work item', d => isWorkItem(d) ? { item: withValues(d) } : undefined) },
};

const search: OpDef = {
  name: 'search', command: ['workitem', 'search'], cls: 'none', limitS: 60,
  oneOf: [['jql', 'filter']],
  fields: { jql: field.str('A JQL query. A project key that is a JQL word must be quoted: project = "IN".'), filter: field.str('A filter id.'), limit: field.int('At most this many work items (default 50, at most 500).'), fields: field.strs('The fields to return.') },
  args: [val('--jql', 'jql'), val('--filter', 'filter'), val('--limit', 'limit'), csv('--fields', 'fields'), lit('--json')],
  out: {
    kind: 'custom', shape: searchShape,
    build: jsonAnswer('a list of work items', d => Array.isArray(d) && d.every(isWorkItem) ? { count: d.length, items: d.map(withValues) } : undefined),
  },
};

const count: OpDef = {
  name: 'count', command: ['workitem', 'search'], cls: 'none', limitS: 60,
  oneOf: [['jql', 'filter']], fields: { jql: field.str(), filter: field.str() },
  args: [val('--jql', 'jql'), val('--filter', 'filter'), lit('--count')],
  out: { kind: 'custom', shape: countShape, build: countAnswer() },
};

const attachmentList: OpDef = {
  name: 'attachment-list', command: ['workitem', 'attachment', 'list'], cls: 'none', limitS: 30,
  required: ['key'], fields: { key: field.str() }, args: [val('--key', 'key'), lit('--json')],
  out: { kind: 'custom', shape: attachmentListShape, build: jsonAnswer('a list of attachments', d => isObj(d) && Array.isArray(d['attachments']) ? { count: d['attachments'].length, attachments: d['attachments'] } : undefined) },
};

const watcherList: OpDef = {
  name: 'watcher-list', command: ['workitem', 'list-watchers'], cls: 'none', limitS: 30,
  required: ['key'], fields: { key: field.str() }, args: [val('--key', 'key'), lit('--json')],
  out: {
    kind: 'custom', shape: watcherListShape,
    build: jsonAnswer('a list of watchers', d => isObj(d) && Array.isArray(d['watchers']) ? { count: typeof d['watchCount'] === 'number' ? d['watchCount'] : d['watchers'].length, watchers: d['watchers'] } : undefined),
  },
};

export const WORKITEM_READ_OPS: readonly OpDef[] = [view, search, count, attachmentList, watcherList];

// ---------------------------------------------------------------------------
// Changes. Every change addresses work items by key only (never --jql, --filter or --from-file), and passes --yes.
// ---------------------------------------------------------------------------

const KEYS = field.strs('One to 50 work item keys.');
const change = { kind: 'custom', shape: changeShape } as const;

const create: OpDef = {
  name: 'create', command: ['workitem', 'create'], cls: 'common', limitS: 60,
  required: ['project', 'type', 'summary'],
  fields: {
    project: field.str('The project key.'), type: field.str('The work item type, for example Task, Story, Bug, Epic.'), summary: field.str(),
    description: field.str('Plain text.'), assignee: field.str("An email, an account id, '@me' or 'default'."), labels: field.strs(), parent: field.str('The key of the parent work item.'),
  },
  args: [val('--project', 'project'), val('--type', 'type'), val('--summary', 'summary'), val('--description', 'description'), val('--assignee', 'assignee'), csv('--label', 'labels'), val('--parent', 'parent'), lit('--json')],
  out: { ...change, build: jsonAnswer('the created work item', d => isWorkItem(d) ? { ok: true, target: d['key'], message: `Work item ${String(d['key'])} has been created` } : undefined) },
};

const edit: OpDef = {
  name: 'edit', command: ['workitem', 'edit'], cls: 'common', limitS: 60,
  required: ['keys'], atLeastOne: [['summary', 'description', 'type', 'assignee', 'removeAssignee', 'labels', 'removeLabels']], exclusive: [['assignee', 'removeAssignee']],
  fields: {
    keys: KEYS, summary: field.str(), description: field.str('Plain text.'), type: field.str('The new work item type.'), assignee: field.str("An email, an account id, '@me' or 'default'."),
    removeAssignee: field.bool(), labels: field.strs('Labels to set.'), removeLabels: field.strs('Labels to remove.'),
  },
  args: [csv('--key', 'keys'), val('--summary', 'summary'), val('--description', 'description'), val('--type', 'type'), val('--assignee', 'assignee'), on('--remove-assignee', 'removeAssignee'), csv('--labels', 'labels'), csv('--remove-labels', 'removeLabels'), lit('--yes', '--json')],
  out: { ...change, build: batchAnswer() },
};

const transition: OpDef = {
  name: 'transition', command: ['workitem', 'transition'], cls: 'common', limitS: 60,
  required: ['keys', 'status'], fields: { keys: KEYS, status: field.str('The target status by name, for example "In Progress" (acli takes no transition id).') },
  args: [csv('--key', 'keys'), val('--status', 'status'), lit('--yes', '--json')],
  out: { ...change, build: batchAnswer() },
};

const assign: OpDef = {
  name: 'assign', command: ['workitem', 'assign'], cls: 'common', limitS: 60,
  required: ['keys'], oneOf: [['assignee', 'removeAssignee']], fields: { keys: KEYS, assignee: field.str("An email, an account id, '@me' or 'default'."), removeAssignee: field.bool() },
  args: [csv('--key', 'keys'), val('--assignee', 'assignee'), on('--remove-assignee', 'removeAssignee'), lit('--yes', '--json')],
  out: { ...change, build: batchAnswer() },
};

const clone: OpDef = {
  name: 'clone', command: ['workitem', 'clone'], cls: 'common', limitS: 60,
  required: ['keys', 'toProject'], fields: { keys: KEYS, toProject: field.str('The project key to clone into (acli requires it; use the same key to clone within a project).') },
  args: [csv('--key', 'keys'), val('--to-project', 'toProject'), lit('--yes', '--json')],
  out: { ...change, build: batchAnswer({ clone: true }) },
};

const keyed = (name: string, cls: OpDef['cls'], command: string): OpDef => ({
  name, command: ['workitem', command], cls, limitS: 60, required: ['keys'], fields: { keys: KEYS },
  args: [csv('--key', 'keys'), lit('--yes', '--json')], out: { ...change, build: batchAnswer() },
});
const archive = keyed('archive', 'common', 'archive');
const unarchive = keyed('unarchive', 'common', 'unarchive');
const del = keyed('delete', 'destructive', 'delete');

/** No --yes and no --json: acli prints a check-marked line. The success text is not yet recorded from a live deletion. */
const attachmentDelete: OpDef = {
  name: 'attachment-delete', command: ['workitem', 'attachment', 'delete'], cls: 'destructive', limitS: 60,
  required: ['id'], fields: { id: field.str('The attachment id.') }, args: [val('--id', 'id')],
  out: { ...change, build: markAnswer(i => String(i['id'])) },
};

const watcherRemove: OpDef = {
  name: 'watcher-remove', command: ['workitem', 'watcher', 'remove'], cls: 'common', limitS: 60,
  required: ['key', 'user'], fields: { key: field.str('The work item key.'), user: field.str('The account id of the watcher.') },
  args: [val('--key', 'key'), val('--user', 'user')],
  out: { ...change, build: markAnswer(i => String(i['key'])) },
};

export const WORKITEM_CHANGE_OPS: readonly OpDef[] = [create, edit, transition, assign, clone, archive, unarchive, del, attachmentDelete, watcherRemove];

export const WORKITEM_OPS: readonly OpDef[] = [...WORKITEM_READ_OPS, ...WORKITEM_CHANGE_OPS];

export const jiraWorkitemTool: GhFamilyTool = defineJiraFamily({
  id: 'jira_workitem',
  description: 'Read and change Jira work items through acli: view, search, count, create, edit, transition, assign, clone, archive, unarchive, delete, attachment-list, attachment-delete, watcher-list, watcher-remove. Changes address work items by key only.',
  ops: WORKITEM_OPS,
});

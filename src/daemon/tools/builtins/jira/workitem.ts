/** jira_workitem: the work item reads (view, search, count, attachment-list, watcher-list) and, below them, the changes. */

import { csv, field, lit, pos, val } from '../gh/op-table.js';
import type { OpDef } from '../gh/op-table.js';
import type { GhFamilyTool } from '../gh/op-table.js';
import { countAnswer, jsonAnswer } from './answers.js';
import { defineJiraFamily } from './family.js';
import { attachmentListShape, countShape, searchShape, viewShape, watcherListShape } from './schemas.js';

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

export const WORKITEM_OPS: readonly OpDef[] = [...WORKITEM_READ_OPS];

export const jiraWorkitemTool: GhFamilyTool = defineJiraFamily({
  id: 'jira_workitem',
  description: 'Read and change Jira work items through acli: view, search, count, attachment-list, watcher-list.',
  ops: WORKITEM_OPS,
});

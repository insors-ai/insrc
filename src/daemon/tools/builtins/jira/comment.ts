/** jira_comment: list, create, update, delete and the visibility lookups. A comment body comes only from the `body` field. */

import { csv, field, lit, on, val } from '../gh/op-table.js';
import type { GhFamilyTool, OpDef } from '../gh/op-table.js';
import { batchAnswer, jsonAnswer, markAnswer, rejected } from './answers.js';
import { defineJiraFamily } from './family.js';
import { readVisibility } from './readers.js';
import { changeShape, commentListShape, visibilityShape } from './schemas.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const change = { kind: 'custom', shape: changeShape } as const;

const list: OpDef = {
  name: 'list', command: ['workitem', 'comment', 'list'], cls: 'none', limitS: 30,
  required: ['key'], fields: { key: field.str('The work item key.'), limit: field.int('At most this many comments (default 50, at most 200).') },
  args: [val('--key', 'key'), val('--limit', 'limit'), lit('--json')],
  out: {
    kind: 'custom', shape: commentListShape,
    build: jsonAnswer('a list of comments', d => isObj(d) && Array.isArray(d['comments']) && typeof d['total'] === 'number' && typeof d['isLast'] === 'boolean'
      ? { total: d['total'], isLast: d['isLast'], comments: d['comments'] } : undefined),
  },
};

const create: OpDef = {
  name: 'create', command: ['workitem', 'comment', 'create'], cls: 'common', limitS: 60,
  required: ['keys', 'body'], fields: { keys: field.strs('One to 50 work item keys.'), body: field.str('The comment, in plain text.') },
  args: [csv('--key', 'keys'), val('--body', 'body'), lit('--json')],
  out: { ...change, build: batchAnswer() },
};

const update: OpDef = {
  name: 'update', command: ['workitem', 'comment', 'update'], cls: 'common', limitS: 60,
  required: ['key', 'id', 'body'], fields: { key: field.str(), id: field.str('The comment id.'), body: field.str('The new comment text.') },
  args: [val('--key', 'key'), val('--id', 'id'), val('--body', 'body')],
  out: { ...change, build: markAnswer(i => String(i['id'])) },
};

const del: OpDef = {
  name: 'delete', command: ['workitem', 'comment', 'delete'], cls: 'destructive', limitS: 60,
  required: ['key', 'id'], fields: { key: field.str(), id: field.str('The comment id.') },
  args: [val('--key', 'key'), val('--id', 'id')],
  out: { ...change, build: markAnswer(i => String(i['id'])) },
};

const visibility: OpDef = {
  name: 'visibility', command: ['workitem', 'comment', 'visibility'], cls: 'none', limitS: 30,
  oneOf: [['group', 'role']], with: { project: ['role'] },
  check: i => i['role'] === true && typeof i['project'] !== 'string' ? 'role needs the field project' : undefined,
  fields: { group: field.bool('List the groups a comment can be limited to.'), role: field.bool('List the project roles a comment can be limited to.'), project: field.str('The project key (with role).') },
  args: [on('--group', 'group'), on('--role', 'role'), val('--project', 'project')],
  out: {
    kind: 'custom', shape: visibilityShape,
    build: async ctx => {
      const kind = ctx.input['group'] === true ? 'group' : 'role';
      return readVisibility(ctx.stdout, kind) ?? rejected(`acli did not print the ${kind}s in the form expected`, ctx.stdout);
    },
  },
};

export const COMMENT_OPS: readonly OpDef[] = [list, create, update, del, visibility];

export const jiraCommentTool: GhFamilyTool = defineJiraFamily({
  id: 'jira_comment',
  description: 'Read and change Jira work item comments through acli: list, create, update, delete, visibility.',
  ops: COMMENT_OPS,
});

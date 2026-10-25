/** jira_link: list the links of a work item and the link types, create a link between two work items, delete a link by id. */

import { field, lit, val } from '../gh/op-table.js';
import type { GhFamilyTool, OpDef } from '../gh/op-table.js';
import { jsonAnswer, markAnswer } from './answers.js';
import { defineJiraFamily } from './family.js';
import { changeShape, linkListShape, linkTypesShape } from './schemas.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const change = { kind: 'custom', shape: changeShape } as const;

const list: OpDef = {
  name: 'list', command: ['workitem', 'link', 'list'], cls: 'none', limitS: 30,
  required: ['key'], fields: { key: field.str('The work item key.') }, args: [val('--key', 'key'), lit('--json')],
  out: { kind: 'custom', shape: linkListShape, build: jsonAnswer('a list of links', d => isObj(d) && Array.isArray(d['issueLinks']) ? { links: d['issueLinks'] } : undefined) },
};

const types: OpDef = {
  name: 'types', command: ['workitem', 'link', 'type'], cls: 'none', limitS: 30, fields: {}, args: [lit('--json')],
  out: {
    kind: 'custom', shape: linkTypesShape,
    build: jsonAnswer('a list of link types', d => {
      const raw = isObj(d) ? d['issueLinkTypes'] : undefined;
      if (!Array.isArray(raw) || !raw.every(t => isObj(t) && typeof t['name'] === 'string')) { return undefined; }
      return { types: raw.map(t => String((t as Obj)['name'])) };
    }),
  },
};

const create: OpDef = {
  name: 'create', command: ['workitem', 'link', 'create'], cls: 'common', limitS: 60,
  required: ['out', 'in', 'type'],
  fields: { out: field.str('The outward work item key.'), in: field.str('The inward work item key.'), type: field.str('The link type name, as listed by types (for example Blocks).') },
  args: [val('--out', 'out'), val('--in', 'in'), val('--type', 'type'), lit('--yes')],
  out: { ...change, build: markAnswer(i => `${String(i['out'])} ${String(i['type'])} ${String(i['in'])}`) },
};

const del: OpDef = {
  name: 'delete', command: ['workitem', 'link', 'delete'], cls: 'destructive', limitS: 60,
  required: ['id'], fields: { id: field.str('The link id, as listed by list.') }, args: [val('--id', 'id'), lit('--yes')],
  out: { ...change, build: markAnswer(i => String(i['id'])) },
};

export const LINK_OPS: readonly OpDef[] = [list, types, create, del];

export const jiraLinkTool: GhFamilyTool = defineJiraFamily({
  id: 'jira_link',
  description: 'Read and change links between Jira work items through acli: list, types, create, delete.',
  ops: LINK_OPS,
});

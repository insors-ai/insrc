/**
 * jira_project: list, view, create (from an existing project: acli's --from-project, company-managed projects only), update,
 * archive, restore, delete. The --from-json and --generate-json forms read or write a local file and are not offered.
 * The success text of the changing commands has not been recorded from a live site yet; their readers accept the success
 * mark only.
 */

import { field, lit, on, val } from '../gh/op-table.js';
import type { GhFamilyTool, OpDef } from '../gh/op-table.js';
import { jsonAnswer, markAnswer } from './answers.js';
import { defineJiraFamily } from './family.js';
import { changeShape, projectListShape, projectViewShape } from './schemas.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isProject = (v: unknown): v is Obj => isObj(v) && typeof v['key'] === 'string' && typeof v['id'] === 'string' && typeof v['name'] === 'string';
/** Only key, id and name are kept: acli prints dozens of properties (avatars, roles, permissions). */
const brief = (p: Obj): Obj => ({ key: p['key'], id: p['id'], name: p['name'] });
const change = { kind: 'custom', shape: changeShape } as const;

const list: OpDef = {
  name: 'list', command: ['project', 'list'], cls: 'none', limitS: 30,
  exclusive: [['limit', 'recent']],
  fields: { limit: field.int('At most this many projects (default 30, at most 200).'), recent: field.bool('The (up to 20) projects the user viewed recently, instead of a limit.') },
  args: [on('--recent', 'recent'), val('--limit', 'limit'), lit('--json')],
  out: { kind: 'custom', shape: projectListShape, build: jsonAnswer('a list of projects', d => Array.isArray(d) && d.every(isProject) ? { count: d.length, projects: d.map(brief) } : undefined) },
};

const view: OpDef = {
  name: 'view', command: ['project', 'view'], cls: 'none', limitS: 30,
  required: ['key'], fields: { key: field.str('The project key.') }, args: [val('--key', 'key'), lit('--json')],
  out: { kind: 'custom', shape: projectViewShape, build: jsonAnswer('a project', d => isProject(d) ? { project: brief(d) } : undefined) },
};

const create: OpDef = {
  name: 'create', command: ['project', 'create'], cls: 'common', limitS: 60,
  required: ['fromProject', 'key', 'name'],
  fields: {
    fromProject: field.str('The key of the existing project to create the new one from. Only a company-managed project can be the source.'),
    key: field.str('The key of the new project.'), name: field.str('The name of the new project.'),
    description: field.str(), url: field.str(), leadEmail: field.str("The lead's email (default: the lead of the source project)."),
  },
  args: [val('--from-project', 'fromProject'), val('--key', 'key'), val('--name', 'name'), val('--description', 'description'), val('--url', 'url'), val('--lead-email', 'leadEmail')],
  out: { ...change, build: markAnswer(i => String(i['key'])) },
};

const update: OpDef = {
  name: 'update', command: ['project', 'update'], cls: 'common', limitS: 60,
  required: ['projectKey'], atLeastOne: [['key', 'name', 'description', 'leadEmail', 'url']],
  fields: {
    projectKey: field.str('The key of the project to update.'), key: field.str('The new key.'), name: field.str('The new name.'),
    description: field.str(), url: field.str(), leadEmail: field.str("The new lead's email."),
  },
  args: [val('--project-key', 'projectKey'), val('--key', 'key'), val('--name', 'name'), val('--description', 'description'), val('--lead-email', 'leadEmail'), val('--url', 'url')],
  out: { ...change, build: markAnswer(i => String(i['projectKey'])) },
};

const byKey = (name: string, cls: OpDef['cls']): OpDef => ({
  name, command: ['project', name], cls, limitS: 60, required: ['key'], fields: { key: field.str('The project key.') }, args: [val('--key', 'key')],
  out: { ...change, build: markAnswer(i => String(i['key'])) },
});

export const PROJECT_OPS: readonly OpDef[] = [list, view, create, update, byKey('archive', 'destructive'), byKey('restore', 'common'), byKey('delete', 'destructive')];

export const jiraProjectTool: GhFamilyTool = defineJiraFamily({
  id: 'jira_project',
  description: 'Read and change Jira projects through acli: list, view, create (from an existing company-managed project), update, archive, restore, delete.',
  ops: PROJECT_OPS,
});

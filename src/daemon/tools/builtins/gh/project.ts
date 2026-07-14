/**
 * gh:project:* -- GitHub Projects v2.
 *
 * Classic (v1) projects are deprecated; these tools target v2 only.
 * The v2 surface is in `gh project` CLI (2.29+) and uses GraphQL
 * under the hood. All read-only ops are ungated; mutating ops gate.
 *
 * Ownership: GitHub Projects v2 are org-owned or user-owned. The
 * `owner` input is required for most ops. For repo-scoped project
 * lookups, `repo` can be supplied instead.
 */

import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, num, md, fail, shellFail, ghExec, parseJson } from './helpers.js';

interface RawProject {
  number: number;
  title: string;
  shortDescription?: string;
  public?: boolean;
  closed?: boolean;
  url?: string;
  owner?: { login?: string; type?: string };
  fields?: { totalCount?: number };
  items?: { totalCount?: number };
  updatedAt?: string;
}

interface RawField {
  id?: string;
  name: string;
  type?: string;
  options?: Array<{ id?: string; name: string }>;
}

interface RawItem {
  id: string;
  title?: string;
  content?: { title?: string; number?: number; url?: string; type?: string };
  fieldValues?: { nodes?: Array<Record<string, unknown>> };
}

// ---------------------------------------------------------------------------
// list / view (read-only)
// ---------------------------------------------------------------------------

export const ghProjectListTool: Tool = {
  id: 'gh_project_list',
  description: 'List Projects v2 for an owner (user or org).',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      owner: { type: 'string', description: 'User or org login. Default: current gh user.' },
      limit: { type: 'number', minimum: 1, maximum: 200 },
      closed: { type: 'boolean', description: 'Include closed projects.' },
      format: { type: 'string', enum: ['json', 'summary'], description: 'Default summary.' },
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const argv = ['gh', 'project', 'list', '--format', 'json'];
    if (str(input, 'owner'))    { argv.push('--owner', str(input, 'owner')!); }
    const limit = num(input, 'limit') ?? 30;
    argv.push('-L', String(limit));
    if (input['closed'] === true) { argv.push('--closed'); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd') });
    if (r.code !== 0) { return shellFail('gh_project_list', r); }
    const payload = parseJson<{ projects?: RawProject[] }>(r.stdout);
    const projects = payload?.projects ?? [];
    const lines: string[] = [`# ${projects.length} project${projects.length === 1 ? '' : 's'}`, ''];
    if (projects.length > 0) {
      lines.push('| # | Title | Owner | Items | Public | Updated |');
      lines.push('|---|-------|-------|-------|--------|---------|');
      for (const p of projects) {
        lines.push(`| ${p.number} | ${md(p.title)} | ${p.owner?.login ?? '—'} | ${p.items?.totalCount ?? 0} | ${p.public ? 'yes' : 'no'} | ${(p.updatedAt ?? '').slice(0, 10)} |`);
      }
    }
    return { output: lines.join('\n'), format: 'markdown', success: true, data: { count: projects.length, projects } };
  },
};

export const ghProjectViewTool: Tool = {
  id: 'gh_project_view',
  description: 'View a Project v2 (title, fields summary, item count).',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      number: { type: 'number', minimum: 1 },
      owner: { type: 'string' },
    },
    required: ['number'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const n = num(input, 'number');
    if (!n) { return fail('gh_project_view', 'missing number'); }
    const argv = ['gh', 'project', 'view', String(n), '--format', 'json'];
    if (str(input, 'owner')) { argv.push('--owner', str(input, 'owner')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd') });
    if (r.code !== 0) { return shellFail('gh_project_view', r); }
    const p = parseJson<RawProject>(r.stdout);
    if (!p) { return fail('gh_project_view', 'could not parse JSON'); }
    const lines: string[] = [];
    lines.push(`# Project #${p.number}: ${md(p.title)}`);
    lines.push('');
    lines.push(`Owner: ${p.owner?.login ?? '—'} -- Items: ${p.items?.totalCount ?? 0} -- Fields: ${p.fields?.totalCount ?? 0}`);
    if (p.shortDescription) { lines.push('', p.shortDescription); }
    if (p.url) { lines.push('', `URL: ${p.url}`); }
    return { output: lines.join('\n'), format: 'markdown', success: true, data: p };
  },
};

// ---------------------------------------------------------------------------
// item-list (read-only)
// ---------------------------------------------------------------------------

export const ghProjectItemListTool: Tool = {
  id: 'gh:project:item-list',
  description: 'List items in a Project v2.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      number: { type: 'number', minimum: 1 },
      owner: { type: 'string' },
      limit: { type: 'number', minimum: 1, maximum: 500 },
    },
    required: ['number'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const n = num(input, 'number');
    if (!n) { return fail('gh:project:item-list', 'missing number'); }
    const argv = ['gh', 'project', 'item-list', String(n), '--format', 'json'];
    if (str(input, 'owner')) { argv.push('--owner', str(input, 'owner')!); }
    const limit = num(input, 'limit') ?? 50;
    argv.push('-L', String(limit));
    const r = await ghExec(argv, { cwd: str(input, 'cwd') });
    if (r.code !== 0) { return shellFail('gh:project:item-list', r); }
    const payload = parseJson<{ items?: RawItem[] }>(r.stdout);
    const items = payload?.items ?? [];
    const lines: string[] = [`# ${items.length} item${items.length === 1 ? '' : 's'} in project #${n}`, ''];
    if (items.length > 0) {
      lines.push('| Type | #  | Title |');
      lines.push('|------|----|-------|');
      for (const it of items) {
        const type = it.content?.type ?? 'DRAFT_ISSUE';
        const num = it.content?.number ?? '—';
        const title = it.title ?? it.content?.title ?? '(untitled)';
        lines.push(`| ${type} | ${num} | ${md(title)} |`);
      }
    }
    return { output: lines.join('\n'), format: 'markdown', success: true, data: { count: items.length, items } };
  },
};

// ---------------------------------------------------------------------------
// item-add / update / archive / delete (gated)
// ---------------------------------------------------------------------------

export const ghProjectItemAddTool: Tool = {
  id: 'gh:project:item-add',
  description: 'Add an issue or PR to a Project v2.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      number: { type: 'number', minimum: 1, description: 'Project number.' },
      owner: { type: 'string' },
      url: { type: 'string', description: 'Issue or PR URL (preferred).' },
      repo: { type: 'string', description: 'owner/name for the issue. Used with issueNumber.' },
      issueNumber: { type: 'number', minimum: 1, description: 'Issue/PR number to add (requires repo).' },
    },
    required: ['number'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const ref = str(input, 'url') ?? (str(input, 'repo') && num(input, 'issueNumber') ? `${str(input, 'repo')}#${num(input, 'issueNumber')}` : '(missing)');
    return {
      title: 'gh:project:item-add',
      content: `Add \`${ref}\` to project #${num(input, 'number')} (owner: ${str(input, 'owner') ?? '(default)'}).`,
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const n = num(input, 'number');
    if (!n) { return fail('gh:project:item-add', 'missing number'); }
    const url = str(input, 'url')
      ?? (str(input, 'repo') && num(input, 'issueNumber')
        ? `https://github.com/${str(input, 'repo')}/issues/${num(input, 'issueNumber')}`
        : undefined);
    if (!url) { return fail('gh:project:item-add', 'need url or (repo + issueNumber)'); }
    const argv = ['gh', 'project', 'item-add', String(n), '--url', url];
    if (str(input, 'owner')) { argv.push('--owner', str(input, 'owner')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd') });
    if (r.code !== 0) { return shellFail('gh:project:item-add', r); }
    return { output: `Added \`${url}\` to project #${n}.`, format: 'markdown', success: true, data: { number: n, url } };
  },
};

export const ghProjectItemUpdateTool: Tool = {
  id: 'gh:project:item-update',
  description: 'Set a field value on a project item (status, priority, iteration, custom fields).',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      projectId: { type: 'string', description: 'Project node ID (ask gh:project:view).' },
      itemId: { type: 'string', description: 'Item node ID (ask gh:project:item-list).' },
      fieldId: { type: 'string' },
      owner: { type: 'string' },
      value: { type: 'string', description: 'For single-select: option name; for text/number/date: raw value.' },
      singleSelectOptionId: { type: 'string', description: 'Preferred for single-select fields (bypasses name matching).' },
      date: { type: 'string', description: 'For date fields: ISO date.' },
      number: { type: 'number', description: 'For number fields.' },
    },
    required: ['projectId', 'itemId', 'fieldId'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    return {
      title: 'gh:project:item-update',
      content: [
        `Project ID: \`${str(input, 'projectId')}\``,
        `Item ID: \`${str(input, 'itemId')}\``,
        `Field ID: \`${str(input, 'fieldId')}\``,
        str(input, 'value') ? `Value: "${str(input, 'value')}"` : '',
        str(input, 'singleSelectOptionId') ? `Option ID: \`${str(input, 'singleSelectOptionId')}\`` : '',
        str(input, 'date') ? `Date: ${str(input, 'date')}` : '',
        num(input, 'number') !== undefined ? `Number: ${num(input, 'number')}` : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const projectId = str(input, 'projectId');
    const itemId = str(input, 'itemId');
    const fieldId = str(input, 'fieldId');
    if (!projectId || !itemId || !fieldId) { return fail('gh:project:item-update', 'missing projectId / itemId / fieldId'); }

    const argv = ['gh', 'project', 'item-edit', '--project-id', projectId, '--id', itemId, '--field-id', fieldId];
    if (str(input, 'owner')) { argv.push('--owner', str(input, 'owner')!); }
    if (str(input, 'singleSelectOptionId')) { argv.push('--single-select-option-id', str(input, 'singleSelectOptionId')!); }
    else if (str(input, 'value')) { argv.push('--text', str(input, 'value')!); }
    else if (str(input, 'date'))  { argv.push('--date', str(input, 'date')!); }
    else if (num(input, 'number') !== undefined) { argv.push('--number', String(num(input, 'number'))); }
    else { return fail('gh:project:item-update', 'provide one of value / singleSelectOptionId / date / number'); }

    const r = await ghExec(argv, { cwd: str(input, 'cwd') });
    if (r.code !== 0) { return shellFail('gh:project:item-update', r); }
    return { output: `Updated item \`${itemId}\`.`, format: 'markdown', success: true, data: { projectId, itemId, fieldId } };
  },
};

export const ghProjectItemArchiveTool: Tool = {
  id: 'gh:project:item-archive',
  description: 'Archive an item (hides it without deleting).',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      projectId: { type: 'string' },
      itemId: { type: 'string' },
      owner: { type: 'string' },
      undo: { type: 'boolean', description: 'Unarchive instead.' },
    },
    required: ['projectId', 'itemId'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    return {
      title: input['undo'] === true ? 'gh:project:item-archive (undo)' : 'gh:project:item-archive',
      content: `${input['undo'] === true ? 'Unarchive' : 'Archive'} item \`${str(input, 'itemId')}\` in project \`${str(input, 'projectId')}\`.`,
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const projectId = str(input, 'projectId');
    const itemId = str(input, 'itemId');
    if (!projectId || !itemId) { return fail('gh:project:item-archive', 'missing projectId or itemId'); }
    const argv = ['gh', 'project', 'item-archive', '--project-id', projectId, '--id', itemId];
    if (input['undo'] === true) { argv.push('--undo'); }
    if (str(input, 'owner')) { argv.push('--owner', str(input, 'owner')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd') });
    if (r.code !== 0) { return shellFail('gh:project:item-archive', r); }
    return { output: `${input['undo'] === true ? 'Unarchived' : 'Archived'} item \`${itemId}\`.`, format: 'markdown', success: true, data: { projectId, itemId, undo: input['undo'] === true } };
  },
};

export const ghProjectItemDeleteTool: Tool = {
  id: 'gh:project:item-delete',
  description: 'Remove an item from a Project v2 (does not delete the issue/PR).',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      projectId: { type: 'string' },
      itemId: { type: 'string' },
      owner: { type: 'string' },
    },
    required: ['projectId', 'itemId'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    return {
      title: 'gh:project:item-delete',
      content: `Remove item \`${str(input, 'itemId')}\` from project \`${str(input, 'projectId')}\`.\n\nThe underlying issue/PR is **not** deleted.`,
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const projectId = str(input, 'projectId');
    const itemId = str(input, 'itemId');
    if (!projectId || !itemId) { return fail('gh:project:item-delete', 'missing projectId or itemId'); }
    const argv = ['gh', 'project', 'item-delete', '--project-id', projectId, '--id', itemId];
    if (str(input, 'owner')) { argv.push('--owner', str(input, 'owner')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd') });
    if (r.code !== 0) { return shellFail('gh:project:item-delete', r); }
    return { output: `Removed item \`${itemId}\` from project.`, format: 'markdown', success: true, data: { projectId, itemId } };
  },
};

// ---------------------------------------------------------------------------
// field-list (read-only)
// ---------------------------------------------------------------------------

export const ghProjectFieldListTool: Tool = {
  id: 'gh:project:field-list',
  description: 'List fields + options on a Project v2.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      number: { type: 'number', minimum: 1 },
      owner: { type: 'string' },
    },
    required: ['number'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const n = num(input, 'number');
    if (!n) { return fail('gh:project:field-list', 'missing number'); }
    const argv = ['gh', 'project', 'field-list', String(n), '--format', 'json'];
    if (str(input, 'owner')) { argv.push('--owner', str(input, 'owner')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd') });
    if (r.code !== 0) { return shellFail('gh:project:field-list', r); }
    const payload = parseJson<{ fields?: RawField[] }>(r.stdout);
    const fields = payload?.fields ?? [];
    const lines: string[] = [`# Fields in project #${n} (${fields.length})`, ''];
    for (const f of fields) {
      lines.push(`- **${md(f.name)}** (${f.type ?? '?'})${f.id ? ` -- \`${f.id}\`` : ''}`);
      for (const o of f.options ?? []) {
        lines.push(`  - option: ${md(o.name)}${o.id ? ` -- \`${o.id}\`` : ''}`);
      }
    }
    return { output: lines.join('\n'), format: 'markdown', success: true, data: { number: n, fields } };
  },
};

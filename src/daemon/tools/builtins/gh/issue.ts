/**
 * gh:issue:* -- GitHub Issues tools.
 *
 * Read-only: list, view  (no approval)
 * Mutating:  create, comment, edit, close, reopen, link  (approval)
 *
 * Shells out to the `gh` CLI. Repo resolution matches gh defaults --
 * current repo when run inside a checkout, or explicit via the `repo`
 * input (owner/name).
 */

import { Type } from '@sinclair/typebox';
import type { ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, num, strArr, joinCsv, md, fail, ghExec, ghApprovalClass, ghFailResult, parseJson, withGhFailureNet } from './helpers.js';
import {
  GhIssueCommentDataSchema, GhIssueCreateDataSchema, GhIssueLinkDataSchema, GhIssueListDataSchema, GhIssueRowSchema,
  GhIssueStateDataSchema, GhNumberDataSchema,
} from './schemas.js';
import type { GhIssueRow } from './schemas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RawIssue = GhIssueRow;

const ISSUE_JSON_FIELDS = 'number,title,state,author,assignees,labels,url,createdAt,updatedAt';
const ISSUE_VIEW_FIELDS = ISSUE_JSON_FIELDS + ',body,comments';

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

export const ghIssueListTool = withGhFailureNet({
  id: 'gh_issue_list',
  description: 'List / search issues in the current or named repo.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String({ description: "owner/name. Falls back to gh's current-repo detection." })),
    state: Type.Optional(Type.Unsafe<'open' | 'closed' | 'all'>({ type: 'string', enum: ['open', 'closed', 'all'] })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500 })),
    labels: Type.Optional(Type.Array(Type.String())),
    assignee: Type.Optional(Type.String()),
    author: Type.Optional(Type.String()),
    search: Type.Optional(Type.String({ description: 'Full-text search (gh issue list --search).' })),
  }, { additionalProperties: false }),
  outputSchema: GhIssueListDataSchema,

  async execute(input: ToolInput): Promise<ToolResult> {
    const argv = ['gh', 'issue', 'list', '--json', ISSUE_JSON_FIELDS];
    if (str(input, 'repo'))     { argv.push('-R', str(input, 'repo')!); }
    if (str(input, 'state'))    { argv.push('-s', str(input, 'state')!); }
    const limit = num(input, 'limit') ?? 30;
    argv.push('-L', String(limit));
    const labels = joinCsv(strArr(input, 'labels'));
    if (labels) { argv.push('-l', labels); }
    if (str(input, 'assignee')) { argv.push('-a', str(input, 'assignee')!); }
    if (str(input, 'author'))   { argv.push('-A', str(input, 'author')!); }
    if (str(input, 'search'))   { argv.push('-S', str(input, 'search')!); }

    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_issue_list' } });
    const bad = ghFailResult('gh_issue_list', r, false); if (bad) { return bad; }
    const issues = parseJson<RawIssue[]>(r.stdout) ?? [];
    const data = { count: issues.length, issues };
    return { output: renderIssueList(issues), format: 'markdown', success: true, data };
  },
});

// ---------------------------------------------------------------------------
// view
// ---------------------------------------------------------------------------

export const ghIssueViewTool = withGhFailureNet({
  id: 'gh_issue_view',
  description: 'View a single issue: body, comments, metadata.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    number: Type.Number({ minimum: 1, description: 'Issue number.' }),
  }, { additionalProperties: false }),
  outputSchema: GhIssueRowSchema,

  async execute(input: ToolInput): Promise<ToolResult> {
    const n = num(input, 'number');
    if (!n) { return fail('gh_issue_view', 'missing number'); }
    const argv = ['gh', 'issue', 'view', String(n), '--json', ISSUE_VIEW_FIELDS];
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_issue_view' } });
    const bad = ghFailResult('gh_issue_view', r, false); if (bad) { return bad; }
    const issue = parseJson<RawIssue>(r.stdout);
    if (!issue) { return fail('gh_issue_view', 'could not parse gh JSON'); }
    return { output: renderIssueView(issue), format: 'markdown', success: true, data: issue };
  },
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

export const ghIssueCreateTool = withGhFailureNet({
  id: 'gh_issue_create',
  description: 'Create an issue.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    title: Type.String(),
    body: Type.Optional(Type.String()),
    labels: Type.Optional(Type.Array(Type.String())),
    assignees: Type.Optional(Type.Array(Type.String())),
    milestone: Type.Optional(Type.String()),
    project: Type.Optional(Type.String({ description: 'Project (v2) title to add the issue to.' })),
  }, { additionalProperties: false }),
  outputSchema: GhIssueCreateDataSchema,
  approval: ghApprovalClass('gh_issue_create', {}),

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const title = str(input, 'title') ?? '';
    const body = str(input, 'body') ?? '';
    const repo = str(input, 'repo') ?? '(current)';
    const labels = strArr(input, 'labels')?.join(', ') ?? '(none)';
    const assignees = strArr(input, 'assignees')?.join(', ') ?? '(none)';
    return {
      title: 'gh_issue_create',
      content: [
        `Repo: **${repo}**`,
        `Title: **${title}**`,
        `Labels: ${labels}`,
        `Assignees: ${assignees}`,
        '',
        '**Body**',
        '```',
        body.length > 1500 ? body.slice(0, 1500) + '\n...[truncated]' : body || '_(empty)_',
        '```',
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
        { name: 'edit', label: 'Edit body', needsInput: true },
      ],
    };
  },

  applyEdit(input: ToolInput, feedback: string): ToolInput {
    return { ...input, body: feedback };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const title = str(input, 'title');
    if (!title) { return fail('gh_issue_create', 'missing title'); }
    const argv = ['gh', 'issue', 'create', '-t', title];
    if (str(input, 'body'))      { argv.push('-b', str(input, 'body')!); }
    else                         { argv.push('-b', ''); }
    if (str(input, 'repo'))      { argv.push('-R', str(input, 'repo')!); }
    const labels = joinCsv(strArr(input, 'labels'));
    if (labels)                  { argv.push('-l', labels); }
    const assignees = joinCsv(strArr(input, 'assignees'));
    if (assignees)               { argv.push('-a', assignees); }
    if (str(input, 'milestone')) { argv.push('-m', str(input, 'milestone')!); }
    if (str(input, 'project'))   { argv.push('-p', str(input, 'project')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_issue_create' } });
    const bad = ghFailResult('gh_issue_create', r, true); if (bad) { return bad; }
    const url = r.stdout.trim();
    return { output: `Created issue: ${url}`, format: 'markdown', success: true, data: { url } };
  },
});

// ---------------------------------------------------------------------------
// comment
// ---------------------------------------------------------------------------

export const ghIssueCommentTool = withGhFailureNet({
  id: 'gh_issue_comment',
  description: 'Add a comment to an issue.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    number: Type.Number({ minimum: 1 }),
    body: Type.String(),
  }, { additionalProperties: false }),
  outputSchema: GhIssueCommentDataSchema,
  approval: ghApprovalClass('gh_issue_comment', {}),

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const n = num(input, 'number');
    const body = str(input, 'body') ?? '';
    return {
      title: 'gh_issue_comment',
      content: [
        `Issue #${n} in **${str(input, 'repo') ?? '(current)'}**`,
        '',
        '**Comment**',
        '```',
        body.length > 1500 ? body.slice(0, 1500) + '\n...[truncated]' : body,
        '```',
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
        { name: 'edit', label: 'Edit comment', needsInput: true },
      ],
    };
  },

  applyEdit(input: ToolInput, feedback: string): ToolInput {
    return { ...input, body: feedback };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const n = num(input, 'number');
    const body = str(input, 'body');
    if (!n || !body) { return fail('gh_issue_comment', 'missing number or body'); }
    const argv = ['gh', 'issue', 'comment', String(n), '-b', body];
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_issue_comment' } });
    const bad = ghFailResult('gh_issue_comment', r, true); if (bad) { return bad; }
    return { output: `Commented on #${n}.`, format: 'markdown', success: true, data: { number: n, url: r.stdout.trim() } };
  },
});

// ---------------------------------------------------------------------------
// edit
// ---------------------------------------------------------------------------

export const ghIssueEditTool = withGhFailureNet({
  id: 'gh_issue_edit',
  description: 'Edit an issue\'s title / body / labels / assignees / milestone.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    number: Type.Number({ minimum: 1 }),
    title: Type.Optional(Type.String()),
    body: Type.Optional(Type.String()),
    addLabels: Type.Optional(Type.Array(Type.String())),
    removeLabels: Type.Optional(Type.Array(Type.String())),
    addAssignees: Type.Optional(Type.Array(Type.String())),
    removeAssignees: Type.Optional(Type.Array(Type.String())),
    milestone: Type.Optional(Type.String({ description: 'Use empty string to clear.' })),
  }, { additionalProperties: false }),
  outputSchema: GhNumberDataSchema,
  approval: ghApprovalClass('gh_issue_edit', {}),

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const parts: string[] = [];
    if (str(input, 'title')) { parts.push(`title -> "${str(input, 'title')}"`); }
    if (str(input, 'body') !== undefined) { parts.push('body changed'); }
    const adds = joinCsv(strArr(input, 'addLabels'));
    const rems = joinCsv(strArr(input, 'removeLabels'));
    if (adds) { parts.push(`+labels: ${adds}`); }
    if (rems) { parts.push(`-labels: ${rems}`); }
    const addAs = joinCsv(strArr(input, 'addAssignees'));
    const remAs = joinCsv(strArr(input, 'removeAssignees'));
    if (addAs) { parts.push(`+assignees: ${addAs}`); }
    if (remAs) { parts.push(`-assignees: ${remAs}`); }
    if ('milestone' in input) { parts.push(`milestone -> ${JSON.stringify(input['milestone'])}`); }
    return {
      title: 'gh_issue_edit',
      content: `Issue #${num(input, 'number')} in **${str(input, 'repo') ?? '(current)'}**\n\n` + (parts.length === 0 ? '_(no changes specified)_' : parts.map(p => `- ${p}`).join('\n')),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const n = num(input, 'number');
    if (!n) { return fail('gh_issue_edit', 'missing number'); }
    const argv = ['gh', 'issue', 'edit', String(n)];
    if (str(input, 'title'))     { argv.push('-t', str(input, 'title')!); }
    if (typeof input['body'] === 'string') { argv.push('-b', input['body'] as string); }
    const addLbls = joinCsv(strArr(input, 'addLabels'));
    if (addLbls)                 { argv.push('--add-label', addLbls); }
    const rmLbls = joinCsv(strArr(input, 'removeLabels'));
    if (rmLbls)                  { argv.push('--remove-label', rmLbls); }
    const addAs = joinCsv(strArr(input, 'addAssignees'));
    if (addAs)                   { argv.push('--add-assignee', addAs); }
    const rmAs = joinCsv(strArr(input, 'removeAssignees'));
    if (rmAs)                    { argv.push('--remove-assignee', rmAs); }
    if ('milestone' in input) {
      const m = input['milestone'];
      argv.push('-m', typeof m === 'string' ? m : '');
    }
    if (str(input, 'repo'))      { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_issue_edit' } });
    const bad = ghFailResult('gh_issue_edit', r, true); if (bad) { return bad; }
    return { output: `Edited #${n}.`, format: 'markdown', success: true, data: { number: n } };
  },
});

// ---------------------------------------------------------------------------
// close / reopen
// ---------------------------------------------------------------------------

function stateChangeTool(id: 'gh_issue_close' | 'gh_issue_reopen', op: 'close' | 'reopen') {
  return withGhFailureNet({
    id,
    description: op === 'close' ? 'Close an issue.' : 'Reopen an issue.',
    inputSchema: Type.Object({
      cwd: Type.Optional(Type.String()),
      repo: Type.Optional(Type.String()),
      number: Type.Number({ minimum: 1 }),
      reason: Type.Optional(Type.Unsafe<'completed' | 'not planned'>({ type: 'string', enum: ['completed', 'not planned'], description: 'close only: "completed" or "not planned".' })),
      comment: Type.Optional(Type.String({ description: 'Optional closing comment.' })),
    }, { additionalProperties: false }),
    outputSchema: GhIssueStateDataSchema,
    approval: ghApprovalClass(id, {}),

    buildApprovalGate(input: ToolInput): ToolApprovalGate {
      const n = num(input, 'number');
      const reason = str(input, 'reason');
      const comment = str(input, 'comment');
      return {
        title: id,
        content: [
          `Issue #${n} in **${str(input, 'repo') ?? '(current)'}**`,
          op === 'close' && reason ? `Reason: ${reason}` : '',
          comment ? `\n**Comment**\n\`\`\`\n${comment}\n\`\`\`` : '',
        ].filter(Boolean).join('\n'),
        actions: [
          { name: 'approve', label: 'Approve' },
          { name: 'skip', label: 'Skip' },
        ],
      };
    },

    async execute(input: ToolInput): Promise<ToolResult> {
      const n = num(input, 'number');
      if (!n) { return fail(id, 'missing number'); }
      const argv = ['gh', 'issue', op, String(n)];
      if (op === 'close' && str(input, 'reason'))   { argv.push('-r', str(input, 'reason')!); }
      if (op === 'close' && str(input, 'comment')) { argv.push('-c', str(input, 'comment')!); }
      if (str(input, 'repo'))                       { argv.push('-R', str(input, 'repo')!); }
      const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: id } });
      const bad = ghFailResult(id, r, true); if (bad) { return bad; }
      return { output: `${op === 'close' ? 'Closed' : 'Reopened'} #${n}.`, format: 'markdown', success: true, data: { number: n, op } };
    },
  });
}

export const ghIssueCloseTool = stateChangeTool('gh_issue_close', 'close');
export const ghIssueReopenTool = stateChangeTool('gh_issue_reopen', 'reopen');

// ---------------------------------------------------------------------------
// link (close as completed by PR, or add a reference comment)
// ---------------------------------------------------------------------------

export const ghIssueLinkTool = withGhFailureNet({
  id: 'gh_issue_link',
  description: 'Add a cross-reference comment linking an issue to a PR or another issue.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    number: Type.Number({ minimum: 1, description: 'Issue to comment on.' }),
    target: Type.String({ description: 'Target reference (e.g. "#42", "owner/repo#42", full URL).' }),
    relation: Type.Optional(Type.Unsafe<'closes' | 'fixes' | 'resolves' | 'relates-to' | 'blocks' | 'blocked-by'>({ type: 'string', enum: ['closes', 'fixes', 'resolves', 'relates-to', 'blocks', 'blocked-by'], description: 'Relation verb that goes into the auto-generated comment.' })),
  }, { additionalProperties: false }),
  outputSchema: GhIssueLinkDataSchema,
  approval: ghApprovalClass('gh_issue_link', {}),

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const rel = str(input, 'relation') ?? 'relates-to';
    return {
      title: 'gh_issue_link',
      content: [
        `Issue #${num(input, 'number')} in **${str(input, 'repo') ?? '(current)'}**`,
        `Will add a comment: **${rel}** \`${str(input, 'target')}\`.`,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const n = num(input, 'number');
    const target = str(input, 'target');
    if (!n || !target) { return fail('gh_issue_link', 'missing number or target'); }
    const rel = str(input, 'relation') ?? 'relates-to';
    const body = `${rel} ${target}`;
    const argv = ['gh', 'issue', 'comment', String(n), '-b', body];
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_issue_link' } });
    const bad = ghFailResult('gh_issue_link', r, true); if (bad) { return bad; }
    return { output: `Linked #${n} -> ${target} (${rel}).`, format: 'markdown', success: true, data: { number: n, target, relation: rel } };
  },
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderIssueList(issues: RawIssue[]): string {
  if (issues.length === 0) { return '_No issues._'; }
  const lines: string[] = [];
  lines.push(`# ${issues.length} issue${issues.length === 1 ? '' : 's'}`);
  lines.push('');
  lines.push('| # | State | Title | Labels | Assignees | Updated |');
  lines.push('|---|-------|-------|--------|-----------|---------|');
  for (const i of issues) {
    const labels = (i.labels ?? []).map(l => l.name).join(', ');
    const assignees = (i.assignees ?? []).map(a => a.login).join(', ');
    lines.push(`| ${i.number} | ${i.state} | ${md(i.title)} | ${md(labels)} | ${assignees} | ${(i.updatedAt ?? '').slice(0, 10)} |`);
  }
  return lines.join('\n');
}

function renderIssueView(i: RawIssue): string {
  const labels = (i.labels ?? []).map(l => l.name).join(', ') || '—';
  const assignees = (i.assignees ?? []).map(a => a.login).join(', ') || '—';
  const lines: string[] = [];
  lines.push(`# #${i.number}: ${md(i.title)}`);
  lines.push('');
  lines.push(`State: **${i.state}** -- ${i.author?.login ?? '(unknown)'} -- ${(i.createdAt ?? '').slice(0, 10)}`);
  lines.push(`Labels: ${labels} -- Assignees: ${assignees}`);
  if (i.url) { lines.push(`URL: ${i.url}`); }
  lines.push('');
  lines.push(i.body?.trim() || '_(no body)_');
  const comments = i.comments ?? [];
  if (comments.length > 0) {
    lines.push('');
    lines.push(`## Comments (${comments.length})`);
    lines.push('');
    for (const c of comments) {
      lines.push(`**${c.author?.login ?? '(unknown)'}** at ${(c.createdAt ?? '').slice(0, 19)}`);
      lines.push('');
      lines.push(c.body.trim());
      lines.push('');
    }
  }
  return lines.join('\n').trimEnd();
}

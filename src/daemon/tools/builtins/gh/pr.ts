/**
 * gh:pr:* -- GitHub Pull Request tools.
 *
 * Read-only: list / view / diff / checks / files  (no approval)
 * Mutating:  create / edit / comment / review / merge / close / ready (gated)
 *
 * All gate content shows the relevant PR number + repo so accidental
 * merges / closes are hard to click through without noticing. Merge
 * surfaces the merge method (squash / rebase / merge) so the caller
 * sees the exact integration shape.
 */

import { Type } from '@sinclair/typebox';
import type { ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, num, strArr, joinCsv, md, fail, ghExec, ghFailResult, parseJson, withGhFailureNet } from './helpers.js';
import {
  GhIssueCommentDataSchema, GhNumberDataSchema, GhPrChecksDataSchema, GhPrDiffDataSchema, GhPrFilesDataSchema, GhPrListDataSchema,
  GhPrMergeDataSchema, GhPrReviewDataSchema, GhPrRowSchema, GhPrUrlDataSchema,
} from './schemas.js';
import type { GhPrRow } from './schemas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RawPr = GhPrRow & { statusCheckRollup?: Array<{ name?: string; state?: string; status?: string; conclusion?: string }> };

const PR_JSON_FIELDS = 'number,title,state,isDraft,author,assignees,reviewRequests,labels,baseRefName,headRefName,url,createdAt,updatedAt,additions,deletions,changedFiles';
const PR_VIEW_FIELDS = PR_JSON_FIELDS + ',body,mergeable,mergeStateStatus';
const PR_CHECKS_FIELDS = 'statusCheckRollup,number';

// ---------------------------------------------------------------------------
// list / view (read-only)
// ---------------------------------------------------------------------------

export const ghPrListTool = withGhFailureNet({
  id: 'gh_pr_list',
  description: 'List / filter pull requests.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    state: Type.Optional(Type.Unsafe<'open' | 'closed' | 'merged' | 'all'>({ type: 'string', enum: ['open', 'closed', 'merged', 'all'] })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500 })),
    labels: Type.Optional(Type.Array(Type.String())),
    author: Type.Optional(Type.String()),
    assignee: Type.Optional(Type.String()),
    base: Type.Optional(Type.String({ description: 'Filter by base branch.' })),
    head: Type.Optional(Type.String({ description: 'Filter by head branch.' })),
    draft: Type.Optional(Type.Boolean()),
    search: Type.Optional(Type.String()),
  }, { additionalProperties: false }),
  outputSchema: GhPrListDataSchema,

  async execute(input: ToolInput): Promise<ToolResult> {
    const argv = ['gh', 'pr', 'list', '--json', PR_JSON_FIELDS];
    if (str(input, 'repo'))     { argv.push('-R', str(input, 'repo')!); }
    if (str(input, 'state'))    { argv.push('-s', str(input, 'state')!); }
    const limit = num(input, 'limit') ?? 30;
    argv.push('-L', String(limit));
    const labels = joinCsv(strArr(input, 'labels'));
    if (labels)                 { argv.push('-l', labels); }
    if (str(input, 'author'))   { argv.push('-A', str(input, 'author')!); }
    if (str(input, 'assignee')) { argv.push('-a', str(input, 'assignee')!); }
    if (str(input, 'base'))     { argv.push('-B', str(input, 'base')!); }
    if (str(input, 'head'))     { argv.push('-H', str(input, 'head')!); }
    if (input['draft'] === true)  { argv.push('-d'); }
    if (str(input, 'search'))   { argv.push('-S', str(input, 'search')!); }

    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_pr_list' } });
    const bad = ghFailResult('gh_pr_list', r, false); if (bad) { return bad; }
    const prs = parseJson<RawPr[]>(r.stdout) ?? [];
    return { output: renderPrList(prs), format: 'markdown', success: true, data: { count: prs.length, prs } };
  },
});

export const ghPrViewTool = withGhFailureNet({
  id: 'gh_pr_view',
  description: 'View a PR: body, metadata, review status.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    number: Type.Number({ minimum: 1 }),
  }, { additionalProperties: false }),
  outputSchema: GhPrRowSchema,

  async execute(input: ToolInput): Promise<ToolResult> {
    const n = num(input, 'number');
    if (!n) { return fail('gh_pr_view', 'missing number'); }
    const argv = ['gh', 'pr', 'view', String(n), '--json', PR_VIEW_FIELDS];
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_pr_view' } });
    const bad = ghFailResult('gh_pr_view', r, false); if (bad) { return bad; }
    const pr = parseJson<RawPr>(r.stdout);
    if (!pr) { return fail('gh_pr_view', 'could not parse gh JSON'); }
    return { output: renderPrView(pr), format: 'markdown', success: true, data: pr };
  },
});

// ---------------------------------------------------------------------------
// diff / checks / files  (read-only)
// ---------------------------------------------------------------------------

export const ghPrDiffTool = withGhFailureNet({
  id: 'gh_pr_diff',
  description: 'Unified diff of a PR. Output is capped.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    number: Type.Number({ minimum: 1 }),
    maxBytes: Type.Optional(Type.Number({ minimum: 1024, maximum: 2097152 })),
  }, { additionalProperties: false }),
  outputSchema: GhPrDiffDataSchema,

  async execute(input: ToolInput): Promise<ToolResult> {
    const n = num(input, 'number');
    if (!n) { return fail('gh_pr_diff', 'missing number'); }
    const maxBytes = num(input, 'maxBytes') ?? 256 * 1024;
    const argv = ['gh', 'pr', 'diff', String(n)];
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), maxBytes, cutIsAnswer: true, key: { toolId: 'gh_pr_diff' } });
    const bad = ghFailResult('gh_pr_diff', r, false); if (bad) { return bad; }
    const truncated = r.stdout.length >= maxBytes;
    const body = (truncated ? r.stdout.slice(0, maxBytes) : r.stdout).replace(/\n+$/, '');
    return {
      output: `# PR #${n} diff${truncated ? `  _(truncated at ${maxBytes} bytes)_` : ''}\n\n\`\`\`diff\n${body}\n\`\`\``,
      format: 'markdown',
      success: true,
      data: { number: n, diffBytes: body.length, truncated },
    };
  },
});

export const ghPrChecksTool = withGhFailureNet({
  id: 'gh_pr_checks',
  description: 'CI check status for a PR.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    number: Type.Number({ minimum: 1 }),
  }, { additionalProperties: false }),
  outputSchema: GhPrChecksDataSchema,

  async execute(input: ToolInput): Promise<ToolResult> {
    const n = num(input, 'number');
    if (!n) { return fail('gh_pr_checks', 'missing number'); }
    const argv = ['gh', 'pr', 'view', String(n), '--json', PR_CHECKS_FIELDS];
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_pr_checks' } });
    const bad = ghFailResult('gh_pr_checks', r, false); if (bad) { return bad; }
    const payload = parseJson<{ statusCheckRollup?: RawPr['statusCheckRollup'] }>(r.stdout);
    const checks = payload?.statusCheckRollup ?? [];
    const lines: string[] = [`# PR #${n} checks (${checks.length})`, ''];
    if (checks.length === 0) { lines.push('_No checks._'); }
    else {
      lines.push('| Name | Status | Conclusion |');
      lines.push('|------|--------|-----------|');
      for (const c of checks) {
        lines.push(`| ${md(c.name ?? '—')} | ${c.status ?? c.state ?? '—'} | ${c.conclusion ?? '—'} |`);
      }
    }
    return { output: lines.join('\n'), format: 'markdown', success: true, data: { number: n, checks } };
  },
});

export const ghPrFilesTool = withGhFailureNet({
  id: 'gh_pr_files',
  description: 'Changed files + per-file stats.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    number: Type.Number({ minimum: 1 }),
  }, { additionalProperties: false }),
  outputSchema: GhPrFilesDataSchema,

  async execute(input: ToolInput): Promise<ToolResult> {
    const n = num(input, 'number');
    if (!n) { return fail('gh_pr_files', 'missing number'); }
    // gh pr diff --name-only is the easiest + portable way; per-file
    // additions/deletions come from `gh api` with the PR's file list.
    const repoFlag = str(input, 'repo') ? ['-R', str(input, 'repo')!] : [];
    const apiArgv = ['gh', 'pr', 'view', String(n), '--json', 'files'];
    apiArgv.push(...repoFlag);
    const r = await ghExec(apiArgv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_pr_files' } });
    const bad = ghFailResult('gh_pr_files', r, false); if (bad) { return bad; }
    const payload = parseJson<{ files?: Array<{ path: string; additions: number; deletions: number }> }>(r.stdout);
    const files = payload?.files ?? [];
    const lines: string[] = [`# PR #${n} files (${files.length})`, ''];
    if (files.length === 0) { lines.push('_No files._'); }
    else {
      lines.push('| Path | +Ins | -Del |');
      lines.push('|------|------|------|');
      for (const f of files) { lines.push(`| \`${f.path}\` | ${f.additions} | ${f.deletions} |`); }
    }
    return { output: lines.join('\n'), format: 'markdown', success: true, data: { number: n, files } };
  },
});

// ---------------------------------------------------------------------------
// create / edit / comment / review / merge / close / ready  (mutating)
// ---------------------------------------------------------------------------

export const ghPrCreateTool = withGhFailureNet({
  id: 'gh_pr_create',
  description: 'Open a pull request.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    title: Type.String(),
    body: Type.Optional(Type.String()),
    base: Type.Optional(Type.String({ description: 'Base branch (default: repo default).' })),
    head: Type.Optional(Type.String({ description: 'Head branch (default: current branch).' })),
    draft: Type.Optional(Type.Boolean()),
    labels: Type.Optional(Type.Array(Type.String())),
    assignees: Type.Optional(Type.Array(Type.String())),
    reviewers: Type.Optional(Type.Array(Type.String())),
    fill: Type.Optional(Type.Boolean({ description: 'Fill title/body from commits (gh --fill).' })),
  }, { additionalProperties: false }),
  outputSchema: GhPrUrlDataSchema,
  approval: 'common',

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const title = str(input, 'title') ?? '';
    const body = str(input, 'body') ?? '';
    return {
      title: 'gh_pr_create',
      content: [
        `Repo: **${str(input, 'repo') ?? '(current)'}**`,
        `Title: **${title}**`,
        `Head -> Base: \`${str(input, 'head') ?? '(current)'}\` -> \`${str(input, 'base') ?? '(default)'}\``,
        input['draft'] === true ? 'Draft: **yes**' : '',
        '',
        '**Body**',
        '```',
        body.length > 1500 ? body.slice(0, 1500) + '\n...[truncated]' : body || '_(empty)_',
        '```',
      ].filter(Boolean).join('\n'),
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
    if (!title) { return fail('gh_pr_create', 'missing title'); }
    const argv = ['gh', 'pr', 'create', '-t', title];
    if (str(input, 'body') !== undefined) { argv.push('-b', str(input, 'body') ?? ''); }
    if (str(input, 'base')) { argv.push('-B', str(input, 'base')!); }
    if (str(input, 'head')) { argv.push('-H', str(input, 'head')!); }
    if (input['draft'] === true) { argv.push('-d'); }
    if (input['fill']  === true) { argv.push('-f'); }
    const labels = joinCsv(strArr(input, 'labels'));
    if (labels)    { argv.push('-l', labels); }
    const assignees = joinCsv(strArr(input, 'assignees'));
    if (assignees) { argv.push('-a', assignees); }
    const reviewers = joinCsv(strArr(input, 'reviewers'));
    if (reviewers) { argv.push('-r', reviewers); }
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_pr_create' } });
    const bad = ghFailResult('gh_pr_create', r, true); if (bad) { return bad; }
    const url = r.stdout.trim();
    return { output: `Opened PR: ${url}`, format: 'markdown', success: true, data: { url } };
  },
});

export const ghPrEditTool = withGhFailureNet({
  id: 'gh_pr_edit',
  description: 'Edit PR title / body / labels / assignees / reviewers / base.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    number: Type.Number({ minimum: 1 }),
    title: Type.Optional(Type.String()),
    body: Type.Optional(Type.String()),
    base: Type.Optional(Type.String()),
    addLabels: Type.Optional(Type.Array(Type.String())),
    removeLabels: Type.Optional(Type.Array(Type.String())),
    addReviewers: Type.Optional(Type.Array(Type.String())),
    removeReviewers: Type.Optional(Type.Array(Type.String())),
    addAssignees: Type.Optional(Type.Array(Type.String())),
    removeAssignees: Type.Optional(Type.Array(Type.String())),
  }, { additionalProperties: false }),
  outputSchema: GhNumberDataSchema,
  approval: 'common',

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const parts: string[] = [];
    if (str(input, 'title')) { parts.push(`title -> "${str(input, 'title')}"`); }
    if (str(input, 'body') !== undefined) { parts.push('body changed'); }
    if (str(input, 'base')) { parts.push(`base -> ${str(input, 'base')}`); }
    for (const [from, verb] of [['addLabels', '+labels'], ['removeLabels', '-labels'], ['addReviewers', '+reviewers'], ['removeReviewers', '-reviewers'], ['addAssignees', '+assignees'], ['removeAssignees', '-assignees']] as const) {
      const csv = joinCsv(strArr(input, from));
      if (csv) { parts.push(`${verb}: ${csv}`); }
    }
    return {
      title: 'gh_pr_edit',
      content: `PR #${num(input, 'number')} in **${str(input, 'repo') ?? '(current)'}**\n\n` + (parts.length === 0 ? '_(no changes)_' : parts.map(p => `- ${p}`).join('\n')),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const n = num(input, 'number');
    if (!n) { return fail('gh_pr_edit', 'missing number'); }
    const argv = ['gh', 'pr', 'edit', String(n)];
    if (str(input, 'title')) { argv.push('-t', str(input, 'title')!); }
    if (str(input, 'body') !== undefined) { argv.push('-b', str(input, 'body') ?? ''); }
    if (str(input, 'base'))  { argv.push('-B', str(input, 'base')!); }
    const add = joinCsv(strArr(input, 'addLabels'));    if (add) { argv.push('--add-label', add); }
    const rm = joinCsv(strArr(input, 'removeLabels')); if (rm)  { argv.push('--remove-label', rm); }
    const addR = joinCsv(strArr(input, 'addReviewers'));    if (addR) { argv.push('--add-reviewer', addR); }
    const rmR = joinCsv(strArr(input, 'removeReviewers')); if (rmR)  { argv.push('--remove-reviewer', rmR); }
    const addA = joinCsv(strArr(input, 'addAssignees'));    if (addA) { argv.push('--add-assignee', addA); }
    const rmA = joinCsv(strArr(input, 'removeAssignees')); if (rmA)  { argv.push('--remove-assignee', rmA); }
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_pr_edit' } });
    const bad = ghFailResult('gh_pr_edit', r, true); if (bad) { return bad; }
    return { output: `Edited PR #${n}.`, format: 'markdown', success: true, data: { number: n } };
  },
});

export const ghPrCommentTool = withGhFailureNet({
  id: 'gh_pr_comment',
  description: 'Add a top-level comment to a PR.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    number: Type.Number({ minimum: 1 }),
    body: Type.String(),
  }, { additionalProperties: false }),
  outputSchema: GhIssueCommentDataSchema,
  approval: 'common',

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const body = str(input, 'body') ?? '';
    return {
      title: 'gh_pr_comment',
      content: `PR #${num(input, 'number')} in **${str(input, 'repo') ?? '(current)'}**\n\n**Comment**\n\`\`\`\n${body.length > 1500 ? body.slice(0, 1500) + '\n...[truncated]' : body}\n\`\`\``,
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
    if (!n || !body) { return fail('gh_pr_comment', 'missing number or body'); }
    const argv = ['gh', 'pr', 'comment', String(n), '-b', body];
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_pr_comment' } });
    const bad = ghFailResult('gh_pr_comment', r, true); if (bad) { return bad; }
    return { output: `Commented on PR #${n}.`, format: 'markdown', success: true, data: { number: n, url: r.stdout.trim() } };
  },
});

export const ghPrReviewTool = withGhFailureNet({
  id: 'gh_pr_review',
  description: 'Submit a review on a PR (APPROVE / REQUEST_CHANGES / COMMENT).',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    number: Type.Number({ minimum: 1 }),
    event: Type.Unsafe<'approve' | 'request-changes' | 'comment'>({ type: 'string', enum: ['approve', 'request-changes', 'comment'] }),
    body: Type.Optional(Type.String({ description: 'Required for request-changes and comment.' })),
  }, { additionalProperties: false }),
  outputSchema: GhPrReviewDataSchema,
  approval: 'common',

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    return {
      title: `gh:pr:review ${str(input, 'event')}`,
      content: [
        `PR #${num(input, 'number')} in **${str(input, 'repo') ?? '(current)'}**`,
        `Event: **${str(input, 'event')}**`,
        str(input, 'body') ? `\n**Body**\n\`\`\`\n${str(input, 'body')}\n\`\`\`` : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const n = num(input, 'number');
    const event = str(input, 'event');
    if (!n || !event) { return fail('gh_pr_review', 'missing number or event'); }
    const argv = ['gh', 'pr', 'review', String(n)];
    if (event === 'approve') { argv.push('-a'); }
    else if (event === 'request-changes') { argv.push('-r'); }
    else { argv.push('-c'); }
    if (str(input, 'body')) { argv.push('-b', str(input, 'body')!); }
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_pr_review' } });
    const bad = ghFailResult('gh_pr_review', r, true); if (bad) { return bad; }
    return { output: `Submitted ${event} review on PR #${n}.`, format: 'markdown', success: true, data: { number: n, event } };
  },
});

export const ghPrMergeTool = withGhFailureNet({
  id: 'gh_pr_merge',
  description: 'Merge a PR (squash / rebase / merge).',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    number: Type.Number({ minimum: 1 }),
    method: Type.Unsafe<'squash' | 'rebase' | 'merge'>({ type: 'string', enum: ['squash', 'rebase', 'merge'] }),
    deleteBranch: Type.Optional(Type.Boolean()),
    autoMerge: Type.Optional(Type.Boolean({ description: '--auto: queue for auto-merge when all checks pass.' })),
    body: Type.Optional(Type.String({ description: 'Merge commit body (merge + squash only).' })),
    title: Type.Optional(Type.String({ description: 'Merge commit title (merge + squash only).' })),
    admin: Type.Optional(Type.Boolean({ description: 'Bypass branch protection rules.' })),
  }, { additionalProperties: false }),
  outputSchema: GhPrMergeDataSchema,
  approval: 'destructive',

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const method = str(input, 'method') ?? 'merge';
    return {
      title: 'gh_pr_merge',
      content: [
        `PR #${num(input, 'number')} in **${str(input, 'repo') ?? '(current)'}**`,
        `Method: **${method}**`,
        input['deleteBranch'] === true ? 'Delete head branch afterward.' : '',
        input['autoMerge'] === true ? 'Queue for auto-merge when checks pass.' : '',
        input['admin'] === true ? '\n⚠️ **Admin override** -- bypasses branch protections.' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const n = num(input, 'number');
    const method = str(input, 'method');
    if (!n || !method) { return fail('gh_pr_merge', 'missing number or method'); }
    const argv = ['gh', 'pr', 'merge', String(n)];
    if (method === 'squash') { argv.push('-s'); }
    else if (method === 'rebase') { argv.push('-r'); }
    else { argv.push('-m'); }
    if (input['deleteBranch'] === true) { argv.push('-d'); }
    if (input['autoMerge']    === true) { argv.push('--auto'); }
    if (input['admin']        === true) { argv.push('--admin'); }
    if (str(input, 'title')) { argv.push('-t', str(input, 'title')!); }
    if (str(input, 'body'))  { argv.push('-b', str(input, 'body')!); }
    if (str(input, 'repo'))  { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_pr_merge' } });
    const bad = ghFailResult('gh_pr_merge', r, true); if (bad) { return bad; }
    return { output: `Merged PR #${n} (${method}).\n\n\`\`\`\n${r.stdout.trim() || r.stderr.trim()}\n\`\`\``, format: 'markdown', success: true, data: { number: n, method } };
  },
});

export const ghPrCloseTool = withGhFailureNet({
  id: 'gh_pr_close',
  description: 'Close a PR without merging.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    number: Type.Number({ minimum: 1 }),
    comment: Type.Optional(Type.String()),
    deleteBranch: Type.Optional(Type.Boolean()),
  }, { additionalProperties: false }),
  outputSchema: GhNumberDataSchema,
  approval: 'destructive',

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    return {
      title: 'gh_pr_close',
      content: [
        `Close PR #${num(input, 'number')} in **${str(input, 'repo') ?? '(current)'}** (not merged).`,
        input['deleteBranch'] === true ? 'Head branch will be deleted.' : '',
        str(input, 'comment') ? `\n**Comment**\n\`\`\`\n${str(input, 'comment')}\n\`\`\`` : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const n = num(input, 'number');
    if (!n) { return fail('gh_pr_close', 'missing number'); }
    const argv = ['gh', 'pr', 'close', String(n)];
    if (str(input, 'comment')) { argv.push('-c', str(input, 'comment')!); }
    if (input['deleteBranch'] === true) { argv.push('-d'); }
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_pr_close' } });
    const bad = ghFailResult('gh_pr_close', r, true); if (bad) { return bad; }
    return { output: `Closed PR #${n}.`, format: 'markdown', success: true, data: { number: n } };
  },
});

export const ghPrReadyTool = withGhFailureNet({
  id: 'gh_pr_ready',
  description: 'Mark a draft PR as ready for review.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    number: Type.Number({ minimum: 1 }),
  }, { additionalProperties: false }),
  outputSchema: GhNumberDataSchema,
  approval: 'common',

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    return {
      title: 'gh_pr_ready',
      content: `Mark PR #${num(input, 'number')} in **${str(input, 'repo') ?? '(current)'}** as ready for review.`,
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const n = num(input, 'number');
    if (!n) { return fail('gh_pr_ready', 'missing number'); }
    const argv = ['gh', 'pr', 'ready', String(n)];
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_pr_ready' } });
    const bad = ghFailResult('gh_pr_ready', r, true); if (bad) { return bad; }
    return { output: `PR #${n} marked ready for review.`, format: 'markdown', success: true, data: { number: n } };
  },
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderPrList(prs: RawPr[]): string {
  if (prs.length === 0) { return '_No PRs._'; }
  const lines: string[] = [];
  lines.push(`# ${prs.length} PR${prs.length === 1 ? '' : 's'}`);
  lines.push('');
  lines.push('| # | State | Title | Head -> Base | Author | Labels | Updated |');
  lines.push('|---|-------|-------|--------------|--------|--------|---------|');
  for (const p of prs) {
    const labels = (p.labels ?? []).map(l => l.name).join(', ');
    const draft = p.isDraft ? ' _(draft)_' : '';
    lines.push(`| ${p.number} | ${p.state}${draft} | ${md(p.title)} | \`${p.headRefName ?? '?'}\` -> \`${p.baseRefName ?? '?'}\` | ${p.author?.login ?? '—'} | ${md(labels)} | ${(p.updatedAt ?? '').slice(0, 10)} |`);
  }
  return lines.join('\n');
}

function renderPrView(p: RawPr): string {
  const labels = (p.labels ?? []).map(l => l.name).join(', ') || '—';
  const reviewers = (p.reviewRequests ?? []).map(r => r.login ?? r.name ?? '').filter(Boolean).join(', ') || '—';
  const assignees = (p.assignees ?? []).map(a => a.login).join(', ') || '—';
  const lines: string[] = [];
  lines.push(`# PR #${p.number}: ${md(p.title)}${p.isDraft ? ' _(draft)_' : ''}`);
  lines.push('');
  lines.push(`State: **${p.state}** -- author ${p.author?.login ?? '(unknown)'} -- ${(p.createdAt ?? '').slice(0, 10)}`);
  lines.push(`Branch: \`${p.headRefName ?? '?'}\` -> \`${p.baseRefName ?? '?'}\``);
  lines.push(`+${p.additions ?? 0} / -${p.deletions ?? 0} across ${p.changedFiles ?? 0} file${p.changedFiles === 1 ? '' : 's'}`);
  lines.push(`Labels: ${labels} -- Assignees: ${assignees} -- Reviewers: ${reviewers}`);
  if (p.mergeable || p.mergeStateStatus) {
    lines.push(`Mergeable: ${p.mergeable ?? '?'} -- State: ${p.mergeStateStatus ?? '?'}`);
  }
  if (p.url) { lines.push(`URL: ${p.url}`); }
  lines.push('');
  lines.push(p.body?.trim() || '_(no body)_');
  return lines.join('\n').trimEnd();
}

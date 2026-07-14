/**
 * gh:repo:* -- GitHub repository management.
 *
 * view / list are read-only. create / fork / delete / clone gate --
 * delete gets an extra "DESTRUCTIVE" flag since it affects the remote
 * permanently.
 */

import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, num, md, fail, shellFail, ghExec, parseJson } from './helpers.js';

interface RawRepo {
  nameWithOwner: string;
  description?: string;
  visibility?: string;
  isPrivate?: boolean;
  isFork?: boolean;
  isArchived?: boolean;
  pushedAt?: string;
  stargazerCount?: number;
  forkCount?: number;
  defaultBranchRef?: { name?: string };
  primaryLanguage?: { name?: string };
  url?: string;
}

export const ghRepoViewTool: Tool = {
  id: 'gh_repo_view',
  description: 'View a repository\'s metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      repo: { type: 'string', description: 'owner/name. Default: current repo.' },
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const argv = ['gh', 'repo', 'view', '--json', 'nameWithOwner,description,visibility,isPrivate,isFork,isArchived,pushedAt,stargazerCount,forkCount,defaultBranchRef,primaryLanguage,url'];
    if (str(input, 'repo')) { argv.push(str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd') });
    if (r.code !== 0) { return shellFail('gh_repo_view', r); }
    const repo = parseJson<RawRepo>(r.stdout);
    if (!repo) { return fail('gh_repo_view', 'could not parse JSON'); }
    const lines: string[] = [
      `# ${md(repo.nameWithOwner)}`,
      '',
      `Visibility: **${repo.visibility ?? (repo.isPrivate ? 'PRIVATE' : 'PUBLIC')}**${repo.isFork ? ' (fork)' : ''}${repo.isArchived ? ' (archived)' : ''}`,
      `Default branch: \`${repo.defaultBranchRef?.name ?? '?'}\` -- language: ${repo.primaryLanguage?.name ?? '—'}`,
      `Stars: ${repo.stargazerCount ?? 0} -- Forks: ${repo.forkCount ?? 0} -- last push: ${repo.pushedAt ?? '?'}`,
      repo.url ? `URL: ${repo.url}` : '',
      '',
      repo.description || '_(no description)_',
    ].filter(Boolean);
    return { output: lines.join('\n').trimEnd(), format: 'markdown', success: true, data: repo };
  },
};

export const ghRepoListTool: Tool = {
  id: 'gh_repo_list',
  description: 'List repositories owned by a user or org.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      owner: { type: 'string', description: 'User or org. Default: current gh user.' },
      limit: { type: 'number', minimum: 1, maximum: 500 },
      visibility: { type: 'string', enum: ['public', 'private', 'internal'] },
      archived: { type: 'boolean' },
      source: { type: 'boolean', description: 'Only non-forks.' },
      fork: { type: 'boolean', description: 'Only forks.' },
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const argv = ['gh', 'repo', 'list'];
    if (str(input, 'owner')) { argv.push(str(input, 'owner')!); }
    const limit = num(input, 'limit') ?? 30;
    argv.push('-L', String(limit));
    argv.push('--json', 'nameWithOwner,description,visibility,isPrivate,isFork,isArchived,pushedAt,stargazerCount,forkCount,defaultBranchRef,primaryLanguage,url');
    if (str(input, 'visibility')) { argv.push('--visibility', str(input, 'visibility')!); }
    if (input['archived'] === true) { argv.push('--archived'); }
    if (input['source']   === true) { argv.push('--source'); }
    if (input['fork']     === true) { argv.push('--fork'); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd') });
    if (r.code !== 0) { return shellFail('gh_repo_list', r); }
    const repos = parseJson<RawRepo[]>(r.stdout) ?? [];
    const lines: string[] = [`# ${repos.length} repo${repos.length === 1 ? '' : 's'}`, ''];
    if (repos.length > 0) {
      lines.push('| Repo | Visibility | Lang | Stars | Pushed |');
      lines.push('|------|-----------|------|-------|--------|');
      for (const r of repos) {
        lines.push(`| ${md(r.nameWithOwner)} | ${r.visibility ?? (r.isPrivate ? 'private' : 'public')} | ${r.primaryLanguage?.name ?? '—'} | ${r.stargazerCount ?? 0} | ${r.pushedAt ?? '—'} |`);
      }
    }
    return { output: lines.join('\n'), format: 'markdown', success: true, data: { count: repos.length, repos } };
  },
};

export const ghRepoCreateTool: Tool = {
  id: 'gh_repo_create',
  description: 'Create a repository.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      name: { type: 'string', description: 'owner/name or bare name (uses current user as owner).' },
      visibility: { type: 'string', enum: ['public', 'private', 'internal'] },
      description: { type: 'string' },
      homepage: { type: 'string' },
      license: { type: 'string', description: 'Open-source license key (e.g. "mit").' },
      gitignore: { type: 'string', description: 'gitignore template.' },
      team: { type: 'string' },
      clone: { type: 'boolean', description: 'Clone locally after creation.' },
    },
    required: ['name', 'visibility'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    return {
      title: 'gh_repo_create',
      content: [
        `Name: **${str(input, 'name')}**`,
        `Visibility: **${str(input, 'visibility')}**`,
        str(input, 'description') ? `Description: ${str(input, 'description')}` : '',
        str(input, 'license') ? `License: ${str(input, 'license')}` : '',
        input['clone'] === true ? 'Will clone locally afterward.' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const name = str(input, 'name');
    const visibility = str(input, 'visibility');
    if (!name || !visibility) { return fail('gh_repo_create', 'missing name or visibility'); }
    const argv = ['gh', 'repo', 'create', name, `--${visibility}`];
    if (str(input, 'description')) { argv.push('-d', str(input, 'description')!); }
    if (str(input, 'homepage'))    { argv.push('-h', str(input, 'homepage')!); }
    if (str(input, 'license'))     { argv.push('-l', str(input, 'license')!); }
    if (str(input, 'gitignore'))   { argv.push('-g', str(input, 'gitignore')!); }
    if (str(input, 'team'))        { argv.push('-t', str(input, 'team')!); }
    if (input['clone'] === true)   { argv.push('--clone'); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), timeoutMs: 120_000 });
    if (r.code !== 0) { return shellFail('gh_repo_create', r); }
    return { output: `Created repo: ${r.stdout.trim()}`, format: 'markdown', success: true, data: { name, url: r.stdout.trim() } };
  },
};

export const ghRepoForkTool: Tool = {
  id: 'gh_repo_fork',
  description: 'Fork a repository.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      repo: { type: 'string', description: 'Source repo (owner/name).' },
      org: { type: 'string', description: 'Fork into this org instead of the current user.' },
      clone: { type: 'boolean' },
      defaultBranchOnly: { type: 'boolean', description: 'Only mirror the default branch.' },
    },
    required: ['repo'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    return {
      title: 'gh_repo_fork',
      content: [
        `Fork \`${str(input, 'repo')}\`${str(input, 'org') ? ` into **${str(input, 'org')}**` : ''}.`,
        input['clone'] === true ? 'Will clone locally.' : '',
        input['defaultBranchOnly'] === true ? 'Default branch only.' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const repo = str(input, 'repo');
    if (!repo) { return fail('gh_repo_fork', 'missing repo'); }
    const argv = ['gh', 'repo', 'fork', repo, '--remote=false'];
    if (str(input, 'org'))                    { argv.push('--org', str(input, 'org')!); }
    if (input['clone']              === true) { argv.push('--clone'); }
    if (input['defaultBranchOnly']  === true) { argv.push('--default-branch-only'); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), timeoutMs: 120_000 });
    if (r.code !== 0) { return shellFail('gh_repo_fork', r); }
    return { output: `Forked \`${repo}\`.\n\n\`\`\`\n${r.stdout.trim() || r.stderr.trim()}\n\`\`\``, format: 'markdown', success: true, data: { source: repo } };
  },
};

export const ghRepoDeleteTool: Tool = {
  id: 'gh_repo_delete',
  description: 'Delete a repository. DESTRUCTIVE -- no undo.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      repo: { type: 'string', description: 'owner/name.' },
    },
    required: ['repo'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    return {
      title: 'gh:repo:delete (DESTRUCTIVE)',
      content: [
        `**⚠️ Permanently delete** \`${str(input, 'repo')}\` on GitHub.`,
        '',
        'This is a one-way operation. There is no undo. All issues,',
        'PRs, releases, and contents are removed.',
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Delete' },
        { name: 'skip', label: 'Cancel' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const repo = str(input, 'repo');
    if (!repo) { return fail('gh_repo_delete', 'missing repo'); }
    const argv = ['gh', 'repo', 'delete', repo, '--yes'];
    const r = await ghExec(argv, { cwd: str(input, 'cwd') });
    if (r.code !== 0) { return shellFail('gh_repo_delete', r); }
    return { output: `Deleted \`${repo}\`.`, format: 'markdown', success: true, data: { repo } };
  },
};

export const ghRepoCloneTool: Tool = {
  id: 'gh_repo_clone',
  description: 'Clone a repository locally.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      repo: { type: 'string' },
      dir: { type: 'string', description: 'Target directory. Default: repo name.' },
      extraArgs: { type: 'array', items: { type: 'string' }, description: 'Extra git flags, e.g. ["--depth=1"].' },
    },
    required: ['repo'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    return {
      title: 'gh_repo_clone',
      content: `Clone \`${str(input, 'repo')}\` into ${str(input, 'dir') ? `\`${str(input, 'dir')}\`` : 'the default directory'}.`,
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const repo = str(input, 'repo');
    if (!repo) { return fail('gh_repo_clone', 'missing repo'); }
    const argv = ['gh', 'repo', 'clone', repo];
    if (str(input, 'dir')) { argv.push(str(input, 'dir')!); }
    const extra = Array.isArray(input['extraArgs']) ? (input['extraArgs'] as unknown[]).map(String) : [];
    if (extra.length > 0) {
      argv.push('--', ...extra);
    }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), timeoutMs: 600_000, maxBytes: 2 * 1024 * 1024 });
    if (r.code !== 0) { return shellFail('gh_repo_clone', r); }
    return { output: `Cloned \`${repo}\`.\n\n\`\`\`\n${r.stdout.trim() || r.stderr.trim()}\n\`\`\``, format: 'markdown', success: true, data: { repo, dir: str(input, 'dir') } };
  },
};

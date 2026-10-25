/**
 * gh:repo:* -- GitHub repository management.
 *
 * view / list are read-only. create / fork / delete / clone gate --
 * delete gets an extra "DESTRUCTIVE" flag since it affects the remote
 * permanently.
 */

import { Type } from '@sinclair/typebox';
import type { ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, num, md, fail, ghApprovalClass, ghExec, parseJson, withGhFailureNet } from './helpers.js';
import { ghFailResult } from './legacy.js';
import {
  GhRepoRowSchema, GhRepoListDataSchema, GhRepoCreateDataSchema, GhRepoForkDataSchema, GhRepoNameDataSchema, GhRepoCloneDataSchema,
} from './schemas.js';

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

export const ghRepoViewTool = withGhFailureNet({
  id: 'gh_repo_view',
  description: 'View a repository\'s metadata.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String({ description: 'owner/name. Default: current repo.' })),
  }, { additionalProperties: false }),
  outputSchema: GhRepoRowSchema,

  async execute(input: ToolInput): Promise<ToolResult> {
    const argv = ['gh', 'repo', 'view', '--json', 'nameWithOwner,description,visibility,isPrivate,isFork,isArchived,pushedAt,stargazerCount,forkCount,defaultBranchRef,primaryLanguage,url'];
    if (str(input, 'repo')) { argv.push(str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_repo_view' } });
    const bad = ghFailResult('gh_repo_view', r, false); if (bad) { return bad; }
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
});

export const ghRepoListTool = withGhFailureNet({
  id: 'gh_repo_list',
  description: 'List repositories owned by a user or org.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    owner: Type.Optional(Type.String({ description: 'User or org. Default: current gh user.' })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500 })),
    visibility: Type.Optional(Type.Unsafe<'public' | 'private' | 'internal'>({ type: 'string', enum: ['public', 'private', 'internal'] })),
    archived: Type.Optional(Type.Boolean()),
    source: Type.Optional(Type.Boolean({ description: 'Only non-forks.' })),
    fork: Type.Optional(Type.Boolean({ description: 'Only forks.' })),
  }, { additionalProperties: false }),
  outputSchema: GhRepoListDataSchema,

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
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_repo_list' } });
    const bad = ghFailResult('gh_repo_list', r, false); if (bad) { return bad; }
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
});

export const ghRepoCreateTool = withGhFailureNet({
  id: 'gh_repo_create',
  description: 'Create a repository.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    name: Type.String({ description: 'owner/name or bare name (uses current user as owner).' }),
    visibility: Type.Unsafe<'public' | 'private' | 'internal'>({ type: 'string', enum: ['public', 'private', 'internal'] }),
    description: Type.Optional(Type.String()),
    homepage: Type.Optional(Type.String()),
    license: Type.Optional(Type.String({ description: 'Open-source license key (e.g. "mit").' })),
    gitignore: Type.Optional(Type.String({ description: 'gitignore template.' })),
    team: Type.Optional(Type.String()),
    clone: Type.Optional(Type.Boolean({ description: 'Clone locally after creation.' })),
  }, { additionalProperties: false }),
  outputSchema: GhRepoCreateDataSchema,
  approval: ghApprovalClass('gh_repo_create', {}),

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
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_repo_create' } });
    const bad = ghFailResult('gh_repo_create', r, true); if (bad) { return bad; }
    return { output: `Created repo: ${r.stdout.trim()}`, format: 'markdown', success: true, data: { name, url: r.stdout.trim() } };
  },
});

export const ghRepoForkTool = withGhFailureNet({
  id: 'gh_repo_fork',
  description: 'Fork a repository.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.String({ description: 'Source repo (owner/name).' }),
    org: Type.Optional(Type.String({ description: 'Fork into this org instead of the current user.' })),
    clone: Type.Optional(Type.Boolean()),
    defaultBranchOnly: Type.Optional(Type.Boolean({ description: 'Only mirror the default branch.' })),
  }, { additionalProperties: false }),
  outputSchema: GhRepoForkDataSchema,
  approval: ghApprovalClass('gh_repo_fork', {}),

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
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_repo_fork' } });
    const bad = ghFailResult('gh_repo_fork', r, true); if (bad) { return bad; }
    return { output: `Forked \`${repo}\`.\n\n\`\`\`\n${r.stdout.trim() || r.stderr.trim()}\n\`\`\``, format: 'markdown', success: true, data: { source: repo } };
  },
});

export const ghRepoDeleteTool = withGhFailureNet({
  id: 'gh_repo_delete',
  description: 'Delete a repository. DESTRUCTIVE -- no undo.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.String({ description: 'owner/name.' }),
  }, { additionalProperties: false }),
  outputSchema: GhRepoNameDataSchema,
  approval: ghApprovalClass('gh_repo_delete', {}),

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
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_repo_delete' } });
    const bad = ghFailResult('gh_repo_delete', r, true); if (bad) { return bad; }
    return { output: `Deleted \`${repo}\`.`, format: 'markdown', success: true, data: { repo } };
  },
});

export const ghRepoCloneTool = withGhFailureNet({
  id: 'gh_repo_clone',
  description: 'Clone a repository locally.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.String(),
    dir: Type.Optional(Type.String({ description: 'Target directory. Default: repo name.' })),
    extraArgs: Type.Optional(Type.Array(Type.String(), { description: 'Extra git flags, e.g. ["--depth=1"].' })),
  }, { additionalProperties: false }),
  outputSchema: GhRepoCloneDataSchema,
  approval: (input: ToolInput) => ghApprovalClass('gh_repo_clone', input),

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
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_repo_clone' }, maxBytes: 2 * 1024 * 1024, cutIsAnswer: true });
    const bad = ghFailResult('gh_repo_clone', r, true); if (bad) { return bad; }
    return { output: `Cloned \`${repo}\`.\n\n\`\`\`\n${r.stdout.trim() || r.stderr.trim()}\n\`\`\``, format: 'markdown', success: true, data: { repo, dir: str(input, 'dir') } };
  },
});

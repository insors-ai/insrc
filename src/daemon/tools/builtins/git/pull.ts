/**
 * git:pull -- fetch + integrate from the current branch's upstream.
 *
 * Defaults to `--ff-only` so the integration is safe by default;
 * callers that want a merge or rebase pull opt in explicitly.
 */

import { runShell } from '../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, fail, spawnFail, currentBranch } from './helpers.js';

export type GitPullMode = 'ff-only' | 'merge' | 'rebase';

export interface GitPullData {
  remote: string;
  branch: string;
  mode: GitPullMode;
  /** Stdout/stderr from git pull -- free-form. */
  output: string;
}

export const gitPullTool: Tool = {
  id: 'git_pull',
  description: 'Pull from the current branch\'s upstream. Default --ff-only; merge / rebase modes opt-in.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: 'Repository root.' },
      remote: { type: 'string', description: 'Remote name. Default: upstream\'s remote (usually `origin`).' },
      branch: { type: 'string', description: 'Branch on remote to pull. Default: tracked upstream.' },
      mode: { type: 'string', enum: ['ff-only', 'merge', 'rebase'], description: 'Integration mode. Default: ff-only.' },
      autostash: { type: 'boolean', description: 'Auto-stash dirty worktree before rebase / merge (git --autostash).' },
      dryRun: { type: 'boolean', description: 'Only fetch, don\'t integrate.' },
    },
    additionalProperties: false,
  },
  requiresApproval: true,

  async buildApprovalGate(input: ToolInput): Promise<ToolApprovalGate> {
    const cwd = String(input['cwd'] ?? process.cwd());
    const mode = (str(input, 'mode') ?? 'ff-only') as GitPullMode;
    const remote = str(input, 'remote') ?? '(tracked remote)';
    const branch = str(input, 'branch') ?? (await currentBranch(cwd)) ?? '(current branch)';
    return {
      title: 'git_pull',
      content: [
        `Repo: \`${cwd}\``,
        `Pull \`${remote}/${branch}\` into **${branch}** using **${mode}**.`,
        input['autostash'] === true ? 'Auto-stashing dirty worktree.' : '',
        input['dryRun'] === true ? 'Dry run -- fetch only.' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const mode = (str(input, 'mode') ?? 'ff-only') as GitPullMode;
    const remote = str(input, 'remote');
    const branch = str(input, 'branch') ?? (await currentBranch(cwd)) ?? '';
    const autostash = input['autostash'] === true;
    const dryRun = input['dryRun'] === true;

    if (dryRun) {
      // A dry-run pull is effectively a fetch -- route through fetch
      // semantics so the caller gets a clean result rather than a
      // half-applied integration.
      const argv = ['git', 'fetch'];
      if (remote) { argv.push(remote); }
      if (branch) { argv.push(branch); }
      const result = await runShell(argv, { cwd, timeoutMs: 120_000 });
      if (result.spawnError) { return spawnFail('git_pull', result.stderr); }
      if (result.code !== 0) { return fail('git_pull', result.stderr, result.stdout, result.code); }
      const data: GitPullData = { remote: remote ?? '(tracked)', branch, mode, output: mergeStreams(result) };
      return { output: `Dry-run pull (fetch only) OK.\n\n\`\`\`\n${data.output.trim() || '(no updates)'}\n\`\`\``, format: 'markdown', success: true, data };
    }

    const argv = ['git', 'pull'];
    if (mode === 'ff-only') { argv.push('--ff-only'); }
    if (mode === 'rebase')  { argv.push('--rebase'); }
    if (mode === 'merge')   { argv.push('--no-rebase'); }
    if (autostash)          { argv.push('--autostash'); }
    if (remote)             { argv.push(remote); }
    if (branch && remote)   { argv.push(branch); }  // pull requires both or neither

    const result = await runShell(argv, { cwd, timeoutMs: 180_000 });
    if (result.spawnError) { return spawnFail('git_pull', result.stderr); }
    if (result.code !== 0) { return fail('git_pull', result.stderr, result.stdout, result.code); }

    const data: GitPullData = { remote: remote ?? '(tracked)', branch, mode, output: mergeStreams(result) };
    return {
      output: [
        `Pulled ${mode} from \`${data.remote}/${branch}\` into **${branch}**.`,
        '',
        '```',
        data.output.trim() || '(no updates)',
        '```',
      ].join('\n'),
      format: 'markdown',
      success: true,
      data,
    };
  },
};

function mergeStreams(res: { stdout: string; stderr: string }): string {
  const parts: string[] = [];
  if (res.stdout.trim()) { parts.push(res.stdout.trim()); }
  if (res.stderr.trim()) { parts.push(res.stderr.trim()); }
  return parts.join('\n');
}

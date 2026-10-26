/**
 * git:pull -- fetch + integrate from the current branch's upstream.
 *
 * Defaults to `--ff-only` so the integration is safe by default;
 * callers that want a merge or rebase pull opt in explicitly.
 */

import type { TypedTool } from '../../call-tool.js';
import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, assertSafeArg, fail, spawnFail, readBranch, readFailure, currentBranch } from './helpers.js';
import { GitPullDataSchema } from './schemas.js';
import type { GitPullData } from './schemas.js';

export type GitPullMode = 'ff-only' | 'merge' | 'rebase';

export type { GitPullData } from './schemas.js';

export const gitPullTool = {
  id: 'git_pull',
  description: 'Pull from the current branch\'s upstream. Default --ff-only; merge / rebase modes opt-in.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root.' })),
    remote: Type.Optional(Type.String({ description: 'Remote name. Default: upstream\'s remote (usually `origin`).' })),
    branch: Type.Optional(Type.String({ description: 'Branch on remote to pull. Default: tracked upstream.' })),
    mode: Type.Optional(Type.String({ enum: ['ff-only', 'merge', 'rebase'], description: 'Integration mode. Default: ff-only.' })),
    autostash: Type.Optional(Type.Boolean({ description: 'Auto-stash dirty worktree before rebase / merge (git --autostash).' })),
    dryRun: Type.Optional(Type.Boolean({ description: 'Only fetch, don\'t integrate.' })),
  }, { additionalProperties: false }),
  outputSchema: GitPullDataSchema,
  approval: 'common',

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
    let branch = str(input, 'branch');
    if (remote !== undefined) { assertSafeArg(remote, 'ref'); }
    if (branch !== undefined) { assertSafeArg(branch, 'ref'); }
    if (branch === undefined) {
      // The current branch decides what is pulled: a read that cannot run stops the call before anything changes.
      const brRead = await readBranch(cwd);
      if (!brRead.ok) { return readFailure('git_pull', brRead.failed); }
      branch = brRead.value ?? '';
    }
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
      if (result.code !== 0) { return fail('git_pull', result, { network: true, mutating: true }); }
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
    if (result.code !== 0) { return fail('git_pull', result, { network: true, mutating: true }); }

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
} satisfies TypedTool;

function mergeStreams(res: { stdout: string; stderr: string }): string {
  const parts: string[] = [];
  if (res.stdout.trim()) { parts.push(res.stdout.trim()); }
  if (res.stderr.trim()) { parts.push(res.stderr.trim()); }
  return parts.join('\n');
}

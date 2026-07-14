/**
 * git:reset -- move HEAD, optionally discarding index and/or worktree.
 *
 *   soft:  keep index + worktree (safe-ish: only HEAD moves)
 *   mixed: reset index, keep worktree (default in raw git; preserves edits)
 *   hard:  ALSO discard worktree -- destructive, cannot be undone without
 *          reflog, so the gate adds an extra-loud warning
 *
 * Additionally, resetting HEAD to a commit that's already been pushed
 * means a force push is needed afterwards; the gate content surfaces
 * that state so the caller sees it before approving.
 */

import { runShell } from '../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, fail, spawnFail, currentBranch } from './helpers.js';

export type GitResetMode = 'soft' | 'mixed' | 'hard';

export interface GitResetData {
  mode: GitResetMode;
  ref: string;
  branch: string;
  previousShortSha: string;
  requiresForcePush: boolean;
}

export const gitResetTool: Tool = {
  id: 'git_reset',
  description: 'Move HEAD to a ref. mode=hard also discards the worktree.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      mode: { type: 'string', enum: ['soft', 'mixed', 'hard'] },
      ref: { type: 'string', description: 'Target ref (commit / branch / tag / HEAD~N).' },
    },
    required: ['ref'],
    additionalProperties: false,
  },
  requiresApproval: true,

  async buildApprovalGate(input: ToolInput): Promise<ToolApprovalGate> {
    const cwd = String(input['cwd'] ?? process.cwd());
    const mode = (str(input, 'mode') ?? 'mixed') as GitResetMode;
    const ref = str(input, 'ref') ?? '(missing)';
    const branch = (await currentBranch(cwd)) ?? '(detached)';
    const forcePush = await willNeedForcePush(cwd, ref);

    const lines: string[] = [];
    lines.push(`Repo: \`${cwd}\``);
    lines.push(`Reset HEAD on **${branch}** to \`${ref}\` -- mode: **${mode}**.`);
    switch (mode) {
      case 'soft':  lines.push('Keeps index and worktree -- only HEAD moves.'); break;
      case 'mixed': lines.push('Resets the index; keeps worktree edits.'); break;
      case 'hard':
        lines.push('');
        lines.push('⚠️ **HARD RESET -- DISCARDS WORKTREE EDITS.** Uncommitted changes will be lost.');
        break;
    }
    if (forcePush) {
      lines.push('');
      lines.push('⚠️ The new HEAD is before the tracked upstream -- `git push --force-with-lease` will be required to republish.');
    }

    return {
      title: mode === 'hard' ? 'git:reset --hard (DESTRUCTIVE)' : 'git_reset',
      content: lines.join('\n'),
      actions: [ { name: 'approve', label: 'Approve' }, { name: 'skip', label: 'Skip' } ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const mode = (str(input, 'mode') ?? 'mixed') as GitResetMode;
    const ref = str(input, 'ref');
    if (!ref) { return fail('git_reset', 'missing ref', '', 1); }

    const branch = (await currentBranch(cwd)) ?? '(detached)';
    const priorShort = await runShell(['git', 'rev-parse', '--short', 'HEAD'], { cwd, timeoutMs: 5_000 });
    const previousShortSha = priorShort.code === 0 ? priorShort.stdout.trim() : '';
    const requiresForcePush = await willNeedForcePush(cwd, ref);

    const r = await runShell(['git', 'reset', `--${mode}`, ref], { cwd, timeoutMs: 30_000 });
    if (r.spawnError) { return spawnFail('git_reset', r.stderr); }
    if (r.code !== 0) { return fail('git_reset', r.stderr, r.stdout, r.code); }

    const afterShort = await runShell(['git', 'rev-parse', '--short', 'HEAD'], { cwd, timeoutMs: 5_000 });
    const data: GitResetData = {
      mode, ref, branch,
      previousShortSha,
      requiresForcePush,
    };
    const body = [
      `Reset ${mode} on **${branch}**: \`${previousShortSha}\` -> \`${afterShort.stdout.trim()}\`.`,
      requiresForcePush ? '\n⚠️ `git push --force-with-lease` required to update the remote.' : '',
      r.stdout.trim() ? '\n```\n' + r.stdout.trim() + '\n```' : '',
    ].filter(Boolean).join('\n');
    return { output: body, format: 'markdown', success: true, data };
  },
};

async function willNeedForcePush(cwd: string, ref: string): Promise<boolean> {
  // Force push is needed when HEAD, after reset, is behind @{upstream}.
  // We approximate by checking whether the target `ref` is an ancestor
  // of the upstream -- if so, moving HEAD there rewinds history relative
  // to the remote.
  const r = await runShell(['git', 'merge-base', '--is-ancestor', ref, '@{upstream}'], { cwd, timeoutMs: 5_000 });
  return r.code === 0;
}

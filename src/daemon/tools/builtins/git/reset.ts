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
import { str, fail, failureKind, ranToExit, readFailure, spawnFail, currentBranch, rejectInput } from './helpers.js';
import type { ShellResult } from '../../shell-helper.js';

export type GitResetMode = 'soft' | 'mixed' | 'hard';

export interface GitResetData {
  mode: GitResetMode;
  ref: string;
  branch: string;
  previousShortSha: string;
  requiresForcePush: boolean;
  /** Set when a read that only informs the result could not run. */
  warnings?: string[];
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
  approval: 'common',

  async buildApprovalGate(input: ToolInput): Promise<ToolApprovalGate> {
    const cwd = String(input['cwd'] ?? process.cwd());
    const mode = (str(input, 'mode') ?? 'mixed') as GitResetMode;
    const ref = str(input, 'ref') ?? '(missing)';
    const branch = (await currentBranch(cwd)) ?? '(detached)';
    const forceRead = await willNeedForcePush(cwd, ref);
    const forcePush = forceRead.ok && forceRead.value;

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
    if (!forceRead.ok) {
      lines.push('');
      lines.push(`⚠️ Could not tell whether a force push will be needed (${failureKind(forceRead.failed)}).`);
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
    if (!ref) { return rejectInput('git_reset', 'missing ref'); }

    const branch = (await currentBranch(cwd)) ?? '(detached)';
    const priorShort = await runShell(['git', 'rev-parse', '--short', 'HEAD'], { cwd, timeoutMs: 5_000 });
    const previousShortSha = priorShort.code === 0 ? priorShort.stdout.trim() : '';
    // Whether the new HEAD is behind the upstream is a precondition of a hard reset (it discards work); for the
    // other modes an unknown answer is reported as a warning.
    const forceRead = await willNeedForcePush(cwd, ref);
    if (!forceRead.ok && mode === 'hard') { return readFailure('git_reset', forceRead.failed); }
    const requiresForcePush = forceRead.ok && forceRead.value;
    const warnings = forceRead.ok ? [] : [`force-push check (git merge-base --is-ancestor) ${failureKind(forceRead.failed)}`];

    const r = await runShell(['git', 'reset', `--${mode}`, ref], { cwd, timeoutMs: 30_000 });
    if (r.spawnError) { return spawnFail('git_reset', r.stderr); }
    if (r.code !== 0) { return fail('git_reset', r, { mutating: true }); }

    const afterShort = await runShell(['git', 'rev-parse', '--short', 'HEAD'], { cwd, timeoutMs: 5_000 });
    const data: GitResetData = {
      mode, ref, branch,
      previousShortSha,
      requiresForcePush,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
    const body = [
      `Reset ${mode} on **${branch}**: \`${previousShortSha}\` -> \`${afterShort.stdout.trim()}\`.`,
      requiresForcePush ? '\n⚠️ `git push --force-with-lease` required to update the remote.' : '',
      r.stdout.trim() ? '\n```\n' + r.stdout.trim() + '\n```' : '',
    ].filter(Boolean).join('\n');
    return { output: body, format: 'markdown', success: true, data };
  },
};

type ForceRead = { ok: true; value: boolean } | { ok: false; failed: ShellResult };

async function willNeedForcePush(cwd: string, ref: string): Promise<ForceRead> {
  // Force push is needed when HEAD, after reset, is behind @{upstream}.
  // We approximate by checking whether the target `ref` is an ancestor
  // of the upstream -- if so, moving HEAD there rewinds history relative
  // to the remote.
  const r = await runShell(['git', 'merge-base', '--is-ancestor', ref, '@{upstream}'], { cwd, timeoutMs: 5_000 });
  if (!ranToExit(r)) { return { ok: false, failed: r }; }
  // exit 0 is true, exit 1 is false; exit 128 with no upstream configured is the answer false
  if (r.code === 0) { return { ok: true, value: true }; }
  if (r.code === 1 || /upstream/i.test(r.stderr)) { return { ok: true, value: false }; }
  return { ok: false, failed: r };
}

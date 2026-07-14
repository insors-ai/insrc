/**
 * git:checkout -- checkout a path or ref.
 *
 * This is the destructive sibling of git:branch switch. Two modes:
 *   mode: 'ref'  -- switch HEAD to ref (equivalent to `git switch`).
 *                   Refuses when the worktree has uncommitted changes
 *                   unless discard:true is set.
 *   mode: 'path' -- restore files to ref's state (git restore --source
 *                   --worktree). Discards uncommitted edits on those
 *                   paths unconditionally; the gate must be explicit.
 */

import { runShell } from '../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, fail, spawnFail, currentBranch } from './helpers.js';

export type GitCheckoutMode = 'ref' | 'path';

export interface GitCheckoutData {
  mode: GitCheckoutMode;
  ref?: string;
  paths?: string[];
  previous?: string;
}

export const gitCheckoutTool: Tool = {
  id: 'git_checkout',
  description: 'Switch HEAD to a ref, or restore specific paths to a ref\'s state. Destructive; gates with a warning.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      mode: { type: 'string', enum: ['ref', 'path'], description: 'ref = change HEAD; path = restore file contents.' },
      ref: { type: 'string', description: 'Target ref. Required for mode=ref; optional for mode=path (default HEAD).' },
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Paths to restore. Required for mode=path.',
      },
      discard: { type: 'boolean', description: 'mode=ref: allow overwriting uncommitted changes (-f). Use with care.' },
    },
    required: ['mode'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const cwd = String(input['cwd'] ?? process.cwd());
    const mode = String(input['mode'] ?? 'ref');
    const ref = str(input, 'ref');
    const paths = Array.isArray(input['paths']) ? (input['paths'] as unknown[]).map(String) : [];
    const discard = input['discard'] === true;

    const lines: string[] = [`Repo: \`${cwd}\``];
    if (mode === 'ref') {
      lines.push(`Switch HEAD to \`${ref ?? '(missing)'}\`.`);
      if (discard) {
        lines.push('**Discard flag set** -- uncommitted worktree changes will be overwritten.');
      } else {
        lines.push('Git will refuse if the worktree has uncommitted changes (set discard:true to force).');
      }
    } else {
      lines.push(`Restore ${paths.length} path${paths.length === 1 ? '' : 's'} to \`${ref ?? 'HEAD'}\`\'s state.`);
      lines.push('Uncommitted edits on these paths will be overwritten.');
      for (const p of paths.slice(0, 20)) { lines.push(`- \`${p}\``); }
      if (paths.length > 20) { lines.push(`- _... and ${paths.length - 20} more_`); }
    }

    return {
      title: mode === 'ref' && discard ? 'git:checkout (FORCED)' : 'git_checkout',
      content: lines.join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const mode = (str(input, 'mode') ?? 'ref') as GitCheckoutMode;

    if (mode === 'ref') {
      const ref = str(input, 'ref');
      if (!ref) { return fail('git_checkout', 'mode=ref requires ref', '', 1); }
      const previous = await currentBranch(cwd);
      const argv = ['git', 'switch'];
      if (input['discard'] === true) { argv.push('--force'); }
      argv.push(ref);
      const result = await runShell(argv, { cwd, timeoutMs: 15_000 });
      if (result.spawnError) { return spawnFail('git_checkout', result.stderr); }
      if (result.code !== 0) { return fail('git_checkout', result.stderr, result.stdout, result.code); }
      const data: GitCheckoutData = { mode, ref, ...(previous ? { previous } : {}) };
      return {
        output: previous
          ? `Switched HEAD from **${previous}** to **${ref}**.`
          : `Switched HEAD to **${ref}**.`,
        format: 'markdown', success: true, data,
      };
    }

    // mode === 'path'
    const ref = str(input, 'ref') ?? 'HEAD';
    const paths = Array.isArray(input['paths']) ? (input['paths'] as unknown[]).map(String).filter(Boolean) : [];
    if (paths.length === 0) { return fail('git_checkout', 'mode=path requires paths', '', 1); }

    const argv = ['git', 'restore', '--source', ref, '--worktree', '--', ...paths];
    const result = await runShell(argv, { cwd, timeoutMs: 15_000 });
    if (result.spawnError) { return spawnFail('git_checkout', result.stderr); }
    if (result.code !== 0) { return fail('git_checkout', result.stderr, result.stdout, result.code); }

    const data: GitCheckoutData = { mode, ref, paths };
    return {
      output: `Restored ${paths.length} path${paths.length === 1 ? '' : 's'} to \`${ref}\`.`,
      format: 'markdown', success: true, data,
    };
  },
};

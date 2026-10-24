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

import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { ApprovalClass, Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, assertSafeArg, fail, readBranch, readFailure, spawnFail, rejectInput } from './helpers.js';
import { GitCheckoutDataSchema } from './schemas.js';
import type { GitCheckoutData } from './schemas.js';

export type GitCheckoutMode = 'ref' | 'path';

export type { GitCheckoutData } from './schemas.js';

export const gitCheckoutTool: Tool = {
  id: 'git_checkout',
  description: 'Switch HEAD to a ref, or restore specific paths to a ref\'s state. Destructive; gates with a warning.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    mode: Type.String({ enum: ['ref', 'path'], description: 'ref = change HEAD; path = restore file contents.' }),
    ref: Type.Optional(Type.String({ description: 'Target ref. Required for mode=ref; optional for mode=path (default HEAD).' })),
    paths: Type.Optional(Type.Array(Type.String(), { description: 'Paths to restore. Required for mode=path.' })),
    discard: Type.Optional(Type.Boolean({ description: 'mode=ref: allow overwriting uncommitted changes (-f). Use with care.' })),
  }, { additionalProperties: false }),
  outputSchema: GitCheckoutDataSchema,

  // Restoring paths overwrites uncommitted edits and a forced switch overwrites the worktree: destructive. A plain switch is ordinary.
  approval(input: ToolInput): ApprovalClass {
    return input['mode'] === 'path' || input['discard'] === true ? 'destructive' : 'common';
  },

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
      if (!ref) { return rejectInput('git_checkout', 'mode=ref requires ref'); }
      assertSafeArg(ref, 'ref');
      // The branch being left is read before anything changes: a read that cannot run stops the call.
      const prevRead = await readBranch(cwd);
      if (!prevRead.ok) { return readFailure('git_checkout', prevRead.failed); }
      const previous = prevRead.value;
      const argv = ['git', 'switch'];
      if (input['discard'] === true) { argv.push('--force'); }
      argv.push(ref);
      const result = await runShell(argv, { cwd, timeoutMs: 15_000 });
      if (result.spawnError) { return spawnFail('git_checkout', result.stderr); }
      if (result.code !== 0) { return fail('git_checkout', result, { mutating: true }); }
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
    if (paths.length === 0) { return rejectInput('git_checkout', 'mode=path requires paths'); }
    assertSafeArg(ref, 'ref');
    for (const p of paths) { assertSafeArg(p, 'path'); }

    const argv = ['git', 'restore', '--source', ref, '--worktree', '--', ...paths];
    const result = await runShell(argv, { cwd, timeoutMs: 15_000 });
    if (result.spawnError) { return spawnFail('git_checkout', result.stderr); }
    if (result.code !== 0) { return fail('git_checkout', result, { mutating: true }); }

    const data: GitCheckoutData = { mode, ref, paths };
    return {
      output: `Restored ${paths.length} path${paths.length === 1 ? '' : 's'} to \`${ref}\`.`,
      format: 'markdown', success: true, data,
    };
  },
};

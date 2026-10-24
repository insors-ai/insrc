/**
 * git:merge -- merge a ref into the current branch.
 *
 * Gate shows the source ref, current branch, and the number of commits
 * about to be pulled in (via `git log <current>..<ref>`). On conflict
 * we report that state rather than leaving the caller guessing --
 * git's own stderr already lists the conflicting paths, and data.conflicts
 * captures them for programmatic follow-up.
 */

import { runShell } from '../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, fail, failureKind, ranToExit, spawnFail, withFailure, currentBranch, rejectInput } from './helpers.js';

export interface GitMergeData {
  ref: string;
  branch: string;
  strategy: 'ff-only' | 'no-ff' | 'default' | 'squash';
  merged: boolean;
  inConflict: boolean;
  conflicts: string[];
}

export const gitMergeTool: Tool = {
  id: 'git_merge',
  description: 'Merge a ref into the current branch. Gates with commit count + strategy.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      ref: { type: 'string', description: 'Ref to merge.' },
      strategy: { type: 'string', enum: ['ff-only', 'no-ff', 'default', 'squash'], description: 'default: fast-forward when possible, merge commit otherwise.' },
      message: { type: 'string', description: 'Merge-commit message (ignored for ff-only).' },
      abort: { type: 'boolean', description: 'Abort an in-progress merge instead of starting one.' },
    },
    additionalProperties: false,
  },
  approval: 'common',

  async buildApprovalGate(input: ToolInput): Promise<ToolApprovalGate> {
    const cwd = String(input['cwd'] ?? process.cwd());
    const abort = input['abort'] === true;
    if (abort) {
      return {
        title: 'git:merge --abort',
        content: `Repo: \`${cwd}\`\nAbort the in-progress merge and restore the pre-merge state.`,
        actions: [ { name: 'approve', label: 'Approve' }, { name: 'skip', label: 'Skip' } ],
      };
    }
    const ref = str(input, 'ref') ?? '(missing)';
    const strategy = (str(input, 'strategy') ?? 'default') as GitMergeData['strategy'];
    const branch = (await currentBranch(cwd)) ?? '(detached)';

    // Count commits about to land.
    const rev = await runShell(['git', 'rev-list', '--count', `${branch}..${ref}`], { cwd, timeoutMs: 10_000 });
    const incoming = rev.code === 0 ? rev.stdout.trim() : '?';

    const lines: string[] = [];
    lines.push(`Repo: \`${cwd}\``);
    lines.push(`Merge \`${ref}\` into **${branch}** -- ${incoming} incoming commit${incoming === '1' ? '' : 's'}.`);
    lines.push(`Strategy: **${strategy}**`);
    if (strategy === 'squash') {
      lines.push('Squash merge -- incoming commits will collapse into staged changes, no merge commit recorded.');
    }
    return {
      title: 'git_merge',
      content: lines.join('\n'),
      actions: [ { name: 'approve', label: 'Approve' }, { name: 'skip', label: 'Skip' } ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    if (input['abort'] === true) {
      const r = await runShell(['git', 'merge', '--abort'], { cwd, timeoutMs: 15_000 });
      if (r.spawnError) { return spawnFail('git_merge', r.stderr); }
      if (r.code !== 0) { return fail('git_merge', r, { mutating: true }); }
      return {
        output: 'Merge aborted.',
        format: 'markdown',
        success: true,
        data: { ref: '', branch: (await currentBranch(cwd)) ?? '', strategy: 'default', merged: false, inConflict: false, conflicts: [] } satisfies GitMergeData,
      };
    }

    const ref = str(input, 'ref');
    if (!ref) { return rejectInput('git_merge', 'missing ref'); }
    const strategy = (str(input, 'strategy') ?? 'default') as GitMergeData['strategy'];
    const message = str(input, 'message');
    const branch = (await currentBranch(cwd)) ?? '(detached)';

    const argv = ['git', 'merge'];
    if (strategy === 'ff-only') { argv.push('--ff-only'); }
    else if (strategy === 'no-ff') { argv.push('--no-ff'); }
    else if (strategy === 'squash') { argv.push('--squash'); }
    if (message) { argv.push('-m', message); }
    argv.push(ref);

    const result = await runShell(argv, { cwd, timeoutMs: 120_000 });
    if (result.spawnError) { return spawnFail('git_merge', result.stderr); }

    // A non-zero exit on merge can mean conflicts. Detect that so the
    // caller sees "inConflict: true" rather than a raw failure.
    if (result.code !== 0) {
      const { files: conflicts, problem } = await listConflicts(cwd);
      if (conflicts.length > 0) {
        const data: GitMergeData = { ref, branch, strategy, merged: false, inConflict: true, conflicts };
        return withFailure({
          output: [
            `**Merge conflict.** \`${ref}\` into **${branch}** paused.`,
            '',
            `${conflicts.length} file${conflicts.length === 1 ? '' : 's'} with conflicts:`,
            ...conflicts.slice(0, 40).map(p => `- \`${p}\``),
            conflicts.length > 40 ? `- _... and ${conflicts.length - 40} more_` : '',
            '',
            'Resolve them, `git add`, then `git commit`. Or use `git_merge` with `abort: true`.',
          ].filter(Boolean).join('\n'),
          format: 'markdown',
          success: false,
          error: 'merge conflict',
          data,
        }, failureKind(result), result.stderr.trim() || result.stdout.trim());
      }
      const failed = fail('git_merge', result, { mutating: true });
      return problem === undefined || failed.failure === undefined ? failed
        : { ...failed, failure: { ...failed.failure, message: `${failed.failure.message} (could not tell whether the merge left conflicts: ${problem})` } };
    }

    const data: GitMergeData = { ref, branch, strategy, merged: true, inConflict: false, conflicts: [] };
    return {
      output: [
        `Merged \`${ref}\` into **${branch}** (${strategy}).`,
        '',
        '```',
        result.stdout.trim() || '(fast-forward)',
        '```',
      ].join('\n'),
      format: 'markdown',
      success: true,
      data,
    };
  },
};

/** The conflicted paths; `problem` names a read that did not run to an exit (the merge outcome is then not known to be a conflict). */
async function listConflicts(cwd: string): Promise<{ files: string[]; problem?: string }> {
  const r = await runShell(['git', 'diff', '--name-only', '--diff-filter=U'], { cwd, timeoutMs: 10_000 });
  if (!ranToExit(r)) { return { files: [], problem: failureKind(r) }; }
  if (r.code !== 0) { return { files: [] }; }
  return { files: r.stdout.split('\n').map(s => s.trim()).filter(Boolean) };
}

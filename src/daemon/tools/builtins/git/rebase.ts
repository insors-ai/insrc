/**
 * git:rebase -- replay commits onto another ref.
 *
 * Interactive rebase (-i) is unsupported; programmatic flows don't
 * have a way to answer the editor's prompts. The `todo` input lets
 * callers pre-compose the rebase-todo script to get the same effect
 * non-interactively.
 *
 * Gate highlights:
 *   - number of commits being rebased
 *   - whether HEAD has already been pushed (force push will be needed)
 *   - continue / abort / skip operations are exposed via `op`
 */

import { runShell } from '../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, fail, spawnFail, currentBranch } from './helpers.js';

export type GitRebaseOp = 'start' | 'continue' | 'abort' | 'skip';

export interface GitRebaseData {
  op: GitRebaseOp;
  onto?: string;
  branch: string;
  inConflict: boolean;
  conflicts: string[];
  /** HEAD short SHA after the rebase (success only). */
  shortSha?: string;
}

export const gitRebaseTool: Tool = {
  id: 'git_rebase',
  description: 'Rebase the current branch onto a ref (or continue / abort / skip an in-progress rebase). Interactive mode unsupported.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      op: { type: 'string', enum: ['start', 'continue', 'abort', 'skip'], description: 'Default: start.' },
      onto: { type: 'string', description: 'For op=start: ref to rebase onto.' },
      upstream: { type: 'string', description: 'For op=start: upstream to detect commits from (git rebase --onto <onto> <upstream>).' },
      autostash: { type: 'boolean', description: 'Auto-stash dirty worktree.' },
      rerereAutoupdate: { type: 'boolean', description: 'Pass --rerere-autoupdate.' },
    },
    additionalProperties: false,
  },
  requiresApproval: true,

  async buildApprovalGate(input: ToolInput): Promise<ToolApprovalGate> {
    const cwd = String(input['cwd'] ?? process.cwd());
    const op = (str(input, 'op') ?? 'start') as GitRebaseOp;
    if (op !== 'start') {
      return {
        title: `git:rebase ${op}`,
        content: `Repo: \`${cwd}\`\n${op === 'continue' ? 'Continue the in-progress rebase (after conflict resolution).' : op === 'abort' ? 'Abort the in-progress rebase and restore the pre-rebase HEAD.' : 'Skip the current patch in the in-progress rebase.'}`,
        actions: [ { name: 'approve', label: 'Approve' }, { name: 'skip', label: 'Skip' } ],
      };
    }

    const onto = str(input, 'onto') ?? '(missing)';
    const branch = (await currentBranch(cwd)) ?? '(detached)';
    const upstream = str(input, 'upstream') ?? onto;
    const count = await runShell(['git', 'rev-list', '--count', `${upstream}..HEAD`], { cwd, timeoutMs: 5_000 });
    const commits = count.code === 0 ? count.stdout.trim() : '?';

    // Already pushed? warn.
    const pushed = await alreadyPushed(cwd);

    const lines: string[] = [];
    lines.push(`Repo: \`${cwd}\``);
    lines.push(`Rebase **${branch}** onto \`${onto}\` -- ${commits} commit${commits === '1' ? '' : 's'} will be replayed.`);
    if (pushed) {
      lines.push('\n⚠️ HEAD is at or behind the tracked upstream -- `git push --force-with-lease` will be required afterward.');
    }
    return {
      title: 'git_rebase',
      content: lines.join('\n'),
      actions: [ { name: 'approve', label: 'Approve' }, { name: 'skip', label: 'Skip' } ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const op = (str(input, 'op') ?? 'start') as GitRebaseOp;

    if (op !== 'start') {
      const argv = ['git', 'rebase', `--${op}`];
      const r = await runShell(argv, { cwd, timeoutMs: 120_000 });
      if (r.spawnError) { return spawnFail('git_rebase', r.stderr); }
      if (r.code !== 0) {
        const conflicts = await listConflicts(cwd);
        if (conflicts.length > 0) {
          return conflictResult(op, cwd, conflicts);
        }
        return fail('git_rebase', r.stderr, r.stdout, r.code);
      }
      return okResult(op, cwd);
    }

    const onto = str(input, 'onto');
    if (!onto) { return fail('git_rebase', 'missing onto for op=start', '', 1); }
    const upstream = str(input, 'upstream');
    const autostash = input['autostash'] === true;
    const rerere = input['rerereAutoupdate'] === true;

    const argv = ['git', 'rebase'];
    if (autostash) { argv.push('--autostash'); }
    if (rerere)    { argv.push('--rerere-autoupdate'); }
    if (upstream)  { argv.push('--onto', onto, upstream); }
    else           { argv.push(onto); }

    const r = await runShell(argv, { cwd, timeoutMs: 240_000 });
    if (r.spawnError) { return spawnFail('git_rebase', r.stderr); }
    if (r.code !== 0) {
      const conflicts = await listConflicts(cwd);
      if (conflicts.length > 0) {
        return conflictResult('start', cwd, conflicts, onto);
      }
      return fail('git_rebase', r.stderr, r.stdout, r.code);
    }
    return okResult('start', cwd, onto);
  },
};

async function okResult(op: GitRebaseOp, cwd: string, onto?: string): Promise<ToolResult> {
  const head = await runShell(['git', 'rev-parse', '--short', 'HEAD'], { cwd, timeoutMs: 5_000 });
  const shortSha = head.code === 0 ? head.stdout.trim() : '';
  const branch = (await currentBranch(cwd)) ?? '(detached)';
  const data: GitRebaseData = { op, ...(onto ? { onto } : {}), branch, inConflict: false, conflicts: [], shortSha };
  const verb = op === 'start' ? `Rebased onto \`${onto}\`` : op === 'continue' ? 'Rebase continued' : op === 'abort' ? 'Rebase aborted' : 'Patch skipped';
  return { output: `${verb}. HEAD -> \`${shortSha}\` on **${branch}**.`, format: 'markdown', success: true, data };
}

async function conflictResult(op: GitRebaseOp, cwd: string, conflicts: string[], onto?: string): Promise<ToolResult> {
  const branch = (await currentBranch(cwd)) ?? '(detached)';
  const data: GitRebaseData = { op, ...(onto ? { onto } : {}), branch, inConflict: true, conflicts };
  const body = [
    `**Rebase paused with ${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'}.**`,
    '',
    ...conflicts.slice(0, 40).map(p => `- \`${p}\``),
    conflicts.length > 40 ? `- _... and ${conflicts.length - 40} more_` : '',
    '',
    'Resolve, `git add`, then re-run `git_rebase` with `op: continue`. Or `op: abort`.',
  ].filter(Boolean).join('\n');
  return { output: body, format: 'markdown', success: false, error: 'rebase conflict', data };
}

async function listConflicts(cwd: string): Promise<string[]> {
  const r = await runShell(['git', 'diff', '--name-only', '--diff-filter=U'], { cwd, timeoutMs: 10_000 });
  if (r.code !== 0) { return []; }
  return r.stdout.split('\n').map(s => s.trim()).filter(Boolean);
}

async function alreadyPushed(cwd: string): Promise<boolean> {
  const r = await runShell(['git', 'merge-base', '--is-ancestor', 'HEAD', '@{upstream}'], { cwd, timeoutMs: 5_000 });
  return r.code === 0;
}

/**
 * git:revert -- create a new commit that undoes a target commit.
 *
 * Unlike reset, revert is history-preserving -- it records a new
 * commit. Safe to use on already-pushed history. Conflicts go back
 * through the continue / abort / skip flow.
 */

import { runShell } from '../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, fail, spawnFail, currentBranch } from './helpers.js';

export type GitRevertOp = 'start' | 'continue' | 'abort' | 'skip';

export interface GitRevertData {
  op: GitRevertOp;
  refs: string[];
  inConflict: boolean;
  conflicts: string[];
}

export const gitRevertTool: Tool = {
  id: 'git_revert',
  description: 'Create a new commit that undoes the specified commit(s).',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      op: { type: 'string', enum: ['start', 'continue', 'abort', 'skip'] },
      refs: { type: 'array', items: { type: 'string' }, description: 'Commits to revert (op=start).', minItems: 1 },
      noCommit: { type: 'boolean', description: 'Stage the reverts without committing (-n).' },
      mainline: { type: 'number', description: 'Parent number to revert against for merge commits.', minimum: 1 },
    },
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const cwd = String(input['cwd'] ?? process.cwd());
    const op = String(input['op'] ?? 'start');
    if (op !== 'start') {
      return {
        title: `git:revert ${op}`,
        content: `Repo: \`${cwd}\`\n${op === 'continue' ? 'Continue the in-progress revert.' : op === 'abort' ? 'Abort the in-progress revert.' : 'Skip the current patch.'}`,
        actions: [ { name: 'approve', label: 'Approve' }, { name: 'skip', label: 'Skip' } ],
      };
    }
    const refs = Array.isArray(input['refs']) ? (input['refs'] as unknown[]).map(String) : [];
    const noCommit = input['noCommit'] === true;
    const lines = [
      `Repo: \`${cwd}\``,
      `Revert ${refs.length} commit${refs.length === 1 ? '' : 's'}:`,
      ...refs.slice(0, 20).map(r => `- \`${r}\``),
      ...(refs.length > 20 ? [`- _... and ${refs.length - 20} more_`] : []),
      noCommit ? '\nStage only -- no commit will be recorded (--no-commit).' : '',
    ].filter(Boolean);
    return {
      title: 'git_revert',
      content: lines.join('\n'),
      actions: [ { name: 'approve', label: 'Approve' }, { name: 'skip', label: 'Skip' } ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const op = (str(input, 'op') ?? 'start') as GitRevertOp;

    if (op !== 'start') {
      const r = await runShell(['git', 'revert', `--${op}`], { cwd, timeoutMs: 60_000 });
      if (r.spawnError) { return spawnFail('git_revert', r.stderr); }
      if (r.code !== 0) {
        const conflicts = await listConflicts(cwd);
        if (conflicts.length > 0) { return conflictResult(op, [], conflicts); }
        return fail('git_revert', r.stderr, r.stdout, r.code);
      }
      return okResult(op, [], cwd);
    }

    const refs = Array.isArray(input['refs']) ? (input['refs'] as unknown[]).map(String).filter(Boolean) : [];
    if (refs.length === 0) { return fail('git_revert', 'op=start requires refs', '', 1); }
    const argv = ['git', 'revert', '--no-edit'];
    if (input['noCommit'] === true) { argv.push('--no-commit'); }
    if (typeof input['mainline'] === 'number') { argv.push('--mainline', String(Math.floor(input['mainline']))); }
    argv.push(...refs);

    const r = await runShell(argv, { cwd, timeoutMs: 120_000 });
    if (r.spawnError) { return spawnFail('git_revert', r.stderr); }
    if (r.code !== 0) {
      const conflicts = await listConflicts(cwd);
      if (conflicts.length > 0) { return conflictResult('start', refs, conflicts); }
      return fail('git_revert', r.stderr, r.stdout, r.code);
    }
    return okResult('start', refs, cwd);
  },
};

async function okResult(op: GitRevertOp, refs: string[], cwd: string): Promise<ToolResult> {
  const branch = (await currentBranch(cwd)) ?? '(detached)';
  const verb = op === 'start' ? `Reverted ${refs.length} commit${refs.length === 1 ? '' : 's'}` : op === 'continue' ? 'Revert continued' : op === 'abort' ? 'Revert aborted' : 'Patch skipped';
  const data: GitRevertData = { op, refs, inConflict: false, conflicts: [] };
  return { output: `${verb} on **${branch}**.`, format: 'markdown', success: true, data };
}

async function conflictResult(op: GitRevertOp, refs: string[], conflicts: string[]): Promise<ToolResult> {
  const data: GitRevertData = { op, refs, inConflict: true, conflicts };
  const body = [
    `**Revert paused with ${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'}.**`,
    '',
    ...conflicts.slice(0, 40).map(p => `- \`${p}\``),
    conflicts.length > 40 ? `- _... and ${conflicts.length - 40} more_` : '',
    '',
    'Resolve, `git add`, then `git_revert` with `op: continue`.',
  ].filter(Boolean).join('\n');
  return { output: body, format: 'markdown', success: false, error: 'revert conflict', data };
}

async function listConflicts(cwd: string): Promise<string[]> {
  const r = await runShell(['git', 'diff', '--name-only', '--diff-filter=U'], { cwd, timeoutMs: 10_000 });
  if (r.code !== 0) { return []; }
  return r.stdout.split('\n').map(s => s.trim()).filter(Boolean);
}

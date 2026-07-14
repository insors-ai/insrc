/**
 * git:cherry-pick -- apply a commit (or range) onto the current branch.
 */

import { runShell } from '../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, fail, spawnFail, currentBranch } from './helpers.js';

export type GitCherryPickOp = 'start' | 'continue' | 'abort' | 'skip';

export interface GitCherryPickData {
  op: GitCherryPickOp;
  refs: string[];
  inConflict: boolean;
  conflicts: string[];
}

export const gitCherryPickTool: Tool = {
  id: 'git:cherry-pick',
  description: 'Apply commit(s) from another ref onto the current branch.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      op: { type: 'string', enum: ['start', 'continue', 'abort', 'skip'] },
      refs: { type: 'array', items: { type: 'string' }, description: 'Commit refs or ranges (e.g. A..B).', minItems: 1 },
      noCommit: { type: 'boolean', description: 'Stage without committing (-n).' },
      signoff: { type: 'boolean', description: 'Add Signed-off-by (-s).' },
      mainline: { type: 'number', description: 'Parent number for merge commits.', minimum: 1 },
    },
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const cwd = String(input['cwd'] ?? process.cwd());
    const op = String(input['op'] ?? 'start');
    if (op !== 'start') {
      return {
        title: `git:cherry-pick ${op}`,
        content: `Repo: \`${cwd}\`\n${op === 'continue' ? 'Continue the cherry-pick.' : op === 'abort' ? 'Abort the cherry-pick.' : 'Skip the current patch.'}`,
        actions: [ { name: 'approve', label: 'Approve' }, { name: 'skip', label: 'Skip' } ],
      };
    }
    const refs = Array.isArray(input['refs']) ? (input['refs'] as unknown[]).map(String) : [];
    const noCommit = input['noCommit'] === true;
    return {
      title: 'git:cherry-pick',
      content: [
        `Repo: \`${cwd}\``,
        `Cherry-pick ${refs.length} ref${refs.length === 1 ? '' : 's'}:`,
        ...refs.slice(0, 20).map(r => `- \`${r}\``),
        ...(refs.length > 20 ? [`- _... and ${refs.length - 20} more_`] : []),
        noCommit ? '\nStage only -- no commit.' : '',
      ].filter(Boolean).join('\n'),
      actions: [ { name: 'approve', label: 'Approve' }, { name: 'skip', label: 'Skip' } ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const op = (str(input, 'op') ?? 'start') as GitCherryPickOp;

    if (op !== 'start') {
      const r = await runShell(['git', 'cherry-pick', `--${op}`], { cwd, timeoutMs: 60_000 });
      if (r.spawnError) { return spawnFail('git:cherry-pick', r.stderr); }
      if (r.code !== 0) {
        const conflicts = await listConflicts(cwd);
        if (conflicts.length > 0) { return conflictResult(op, [], conflicts); }
        return fail('git:cherry-pick', r.stderr, r.stdout, r.code);
      }
      return okResult(op, [], cwd);
    }

    const refs = Array.isArray(input['refs']) ? (input['refs'] as unknown[]).map(String).filter(Boolean) : [];
    if (refs.length === 0) { return fail('git:cherry-pick', 'op=start requires refs', '', 1); }
    const argv = ['git', 'cherry-pick'];
    if (input['noCommit'] === true) { argv.push('--no-commit'); }
    if (input['signoff'] === true) { argv.push('-s'); }
    if (typeof input['mainline'] === 'number') { argv.push('--mainline', String(Math.floor(input['mainline']))); }
    argv.push(...refs);

    const r = await runShell(argv, { cwd, timeoutMs: 120_000 });
    if (r.spawnError) { return spawnFail('git:cherry-pick', r.stderr); }
    if (r.code !== 0) {
      const conflicts = await listConflicts(cwd);
      if (conflicts.length > 0) { return conflictResult('start', refs, conflicts); }
      return fail('git:cherry-pick', r.stderr, r.stdout, r.code);
    }
    return okResult('start', refs, cwd);
  },
};

async function okResult(op: GitCherryPickOp, refs: string[], cwd: string): Promise<ToolResult> {
  const branch = (await currentBranch(cwd)) ?? '(detached)';
  const verb = op === 'start' ? `Cherry-picked ${refs.length} ref${refs.length === 1 ? '' : 's'}` : op === 'continue' ? 'Cherry-pick continued' : op === 'abort' ? 'Cherry-pick aborted' : 'Patch skipped';
  const data: GitCherryPickData = { op, refs, inConflict: false, conflicts: [] };
  return { output: `${verb} on **${branch}**.`, format: 'markdown', success: true, data };
}

async function conflictResult(op: GitCherryPickOp, refs: string[], conflicts: string[]): Promise<ToolResult> {
  const data: GitCherryPickData = { op, refs, inConflict: true, conflicts };
  const body = [
    `**Cherry-pick paused with ${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'}.**`,
    '',
    ...conflicts.slice(0, 40).map(p => `- \`${p}\``),
    '',
    'Resolve, `git add`, then `git:cherry-pick` with `op: continue`.',
  ].join('\n');
  return { output: body, format: 'markdown', success: false, error: 'cherry-pick conflict', data };
}

async function listConflicts(cwd: string): Promise<string[]> {
  const r = await runShell(['git', 'diff', '--name-only', '--diff-filter=U'], { cwd, timeoutMs: 10_000 });
  if (r.code !== 0) { return []; }
  return r.stdout.split('\n').map(s => s.trim()).filter(Boolean);
}

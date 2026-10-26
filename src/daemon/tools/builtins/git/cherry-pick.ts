/**
 * git:cherry-pick -- apply a commit (or range) onto the current branch.
 */

import type { TypedTool } from '../../call-tool.js';
import { runShell } from '../../shell-helper.js';
import { Type } from '@sinclair/typebox';
import type { ShellResult } from '../../shell-helper.js';
import type { ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, assertSafeArg, branchForReport, fail, ranToExit, readBranch, readFailure, spawnFail, rejectInput, conflictFailure } from './helpers.js';
import { GitCherryPickDataSchema } from './schemas.js';
import type { GitCherryPickData } from './schemas.js';

export type GitCherryPickOp = 'start' | 'continue' | 'abort' | 'skip';

export type { GitCherryPickData } from './schemas.js';

export const gitCherryPickTool = {
  id: 'git:cherry-pick',
  description: 'Apply commit(s) from another ref onto the current branch.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    op: Type.Optional(Type.String({ enum: ['start', 'continue', 'abort', 'skip'] })),
    refs: Type.Optional(Type.Array(Type.String(), { description: 'Commit refs or ranges (e.g. A..B).', minItems: 1 })),
    noCommit: Type.Optional(Type.Boolean({ description: 'Stage without committing (-n).' })),
    signoff: Type.Optional(Type.Boolean({ description: 'Add Signed-off-by (-s).' })),
    mainline: Type.Optional(Type.Number({ description: 'Parent number for merge commits.', minimum: 1 })),
  }, { additionalProperties: false }),
  outputSchema: GitCherryPickDataSchema,
  approval: 'common',

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

    if (op === 'start' && !(Array.isArray(input['refs']) && (input['refs'] as unknown[]).some(Boolean))) { return rejectInput('git:cherry-pick', 'op=start requires refs'); }

    // The current branch is read before anything changes: a read that cannot run stops the call.
    const before = await readBranch(cwd);
    if (!before.ok) { return readFailure('git:cherry-pick', before.failed); }

    if (op !== 'start') {
      const r = await runShell(['git', 'cherry-pick', `--${op}`], { cwd, timeoutMs: 60_000 });
      if (r.spawnError) { return spawnFail('git:cherry-pick', r.stderr); }
      if (r.code !== 0) {
        const conflicts = await listConflicts(cwd);
        if (conflicts.length > 0) { return conflictResult(op, [], conflicts, r); }
        return fail('git:cherry-pick', r, { mutating: true });
      }
      return okResult(op, [], cwd);
    }

    const refs = Array.isArray(input['refs']) ? (input['refs'] as unknown[]).map(String).filter(Boolean) : [];
    if (refs.length === 0) { return rejectInput('git:cherry-pick', 'op=start requires refs'); }
    const argv = ['git', 'cherry-pick'];
    if (input['noCommit'] === true) { argv.push('--no-commit'); }
    if (input['signoff'] === true) { argv.push('-s'); }
    if (typeof input['mainline'] === 'number') { argv.push('--mainline', String(Math.floor(input['mainline']))); }
    for (const ref of refs) { assertSafeArg(ref, 'ref'); }
    argv.push(...refs);

    const r = await runShell(argv, { cwd, timeoutMs: 120_000 });
    if (r.spawnError) { return spawnFail('git:cherry-pick', r.stderr); }
    if (r.code !== 0) {
      const conflicts = await listConflicts(cwd);
      if (conflicts.length > 0) { return conflictResult('start', refs, conflicts, r); }
      return fail('git:cherry-pick', r, { mutating: true });
    }
    return okResult('start', refs, cwd);
  },
} satisfies TypedTool;

async function okResult(op: GitCherryPickOp, refs: string[], cwd: string): Promise<ToolResult> {
  // The operation has happened: the branch only labels the answer, so a read that fails is a warning.
  const warnings: string[] = [];
  const branch = await branchForReport(cwd, warnings, '(detached)');
  const verb = op === 'start' ? `Cherry-picked ${refs.length} ref${refs.length === 1 ? '' : 's'}` : op === 'continue' ? 'Cherry-pick continued' : op === 'abort' ? 'Cherry-pick aborted' : 'Patch skipped';
  const data: GitCherryPickData = { op, refs, inConflict: false, conflicts: [], ...(warnings.length > 0 ? { warnings } : {}) };
  return { output: `${verb} on **${branch}**.`, format: 'markdown', success: true, data };
}

async function conflictResult(op: GitCherryPickOp, refs: string[], conflicts: string[], r: ShellResult): Promise<ToolResult> {
  const data: GitCherryPickData = { op, refs, inConflict: true, conflicts };
  const body = [
    `**Cherry-pick paused with ${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'}.**`,
    '',
    ...conflicts.slice(0, 40).map(p => `- \`${p}\``),
    '',
    'Resolve, `git add`, then `git:cherry-pick` with `op: continue`.',
  ].join('\n');
  return conflictFailure({ output: body, format: 'markdown', success: false, error: 'cherry-pick conflict', data }, r);
}

async function listConflicts(cwd: string): Promise<string[]> {
  const r = await runShell(['git', 'diff', '--name-only', '--diff-filter=U'], { cwd, timeoutMs: 10_000 });
  if (!ranToExit(r) || r.code !== 0) { return []; }
  return r.stdout.split('\n').map(s => s.trim()).filter(Boolean);
}

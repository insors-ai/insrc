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

import type { TypedTool } from '../../call-tool.js';
import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { ShellResult } from '../../shell-helper.js';
import type { ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, assertSafeArg, branchForReport, fail, failureKind, ranToExit, readBranch, readFailure, spawnFail, currentBranch, rejectInput, conflictFailure } from './helpers.js';
import { GitRebaseDataSchema } from './schemas.js';
import type { GitRebaseData } from './schemas.js';

export type GitRebaseOp = 'start' | 'continue' | 'abort' | 'skip';

export type { GitRebaseData } from './schemas.js';

export const gitRebaseTool = {
  id: 'git_rebase',
  description: 'Rebase the current branch onto a ref (or continue / abort / skip an in-progress rebase). Interactive mode unsupported.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    op: Type.Optional(Type.String({ enum: ['start', 'continue', 'abort', 'skip'], description: 'Default: start.' })),
    onto: Type.Optional(Type.String({ description: 'For op=start: ref to rebase onto.' })),
    upstream: Type.Optional(Type.String({ description: 'For op=start: upstream to detect commits from (git rebase --onto <onto> <upstream>).' })),
    autostash: Type.Optional(Type.Boolean({ description: 'Auto-stash dirty worktree.' })),
    rerereAutoupdate: Type.Optional(Type.Boolean({ description: 'Pass --rerere-autoupdate.' })),
  }, { additionalProperties: false }),
  outputSchema: GitRebaseDataSchema,
  approval: 'common',

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
    const commits = ranToExit(count) && count.code === 0 ? count.stdout.trim() : '?';

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

    if (op === 'start' && !str(input, 'onto')) { return rejectInput('git_rebase', 'missing onto for op=start'); }

    // The current branch is read before anything changes: a read that cannot run stops the call.
    const before = await readBranch(cwd);
    if (!before.ok) { return readFailure('git_rebase', before.failed); }

    if (op !== 'start') {
      const argv = ['git', 'rebase', `--${op}`];
      const r = await runShell(argv, { cwd, timeoutMs: 120_000 });
      if (r.spawnError) { return spawnFail('git_rebase', r.stderr); }
      if (r.code !== 0) {
        const conflicts = await listConflicts(cwd);
        if (conflicts.length > 0) {
          return conflictResult(op, cwd, conflicts, r);
        }
        return fail('git_rebase', r, { mutating: true });
      }
      return okResult(op, cwd);
    }

    const onto = str(input, 'onto');
    if (!onto) { return rejectInput('git_rebase', 'missing onto for op=start'); }
    const upstream = str(input, 'upstream');
    assertSafeArg(onto, 'ref');
    if (upstream !== undefined) { assertSafeArg(upstream, 'ref'); }
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
        return conflictResult('start', cwd, conflicts, r, onto);
      }
      return fail('git_rebase', r, { mutating: true });
    }
    return okResult('start', cwd, onto);
  },
} satisfies TypedTool;

async function okResult(op: GitRebaseOp, cwd: string, onto?: string): Promise<ToolResult> {
  // The rebase has happened: reads that only add detail keep their placeholders and are named in data.warnings.
  const warnings: string[] = [];
  const head = await runShell(['git', 'rev-parse', '--short', 'HEAD'], { cwd, timeoutMs: 5_000 });
  const headOk = ranToExit(head) && head.code === 0;
  const shortSha = headOk ? head.stdout.trim() : '';
  if (!headOk) { warnings.push(`git rev-parse --short HEAD ${failureKind(head)}: the short sha is empty`); }
  const branch = await branchForReport(cwd, warnings, '(detached)');
  const data: GitRebaseData = { op, ...(onto ? { onto } : {}), branch, inConflict: false, conflicts: [], shortSha, ...(warnings.length > 0 ? { warnings } : {}) };
  const verb = op === 'start' ? `Rebased onto \`${onto}\`` : op === 'continue' ? 'Rebase continued' : op === 'abort' ? 'Rebase aborted' : 'Patch skipped';
  return { output: `${verb}. HEAD -> \`${shortSha}\` on **${branch}**.`, format: 'markdown', success: true, data };
}

async function conflictResult(op: GitRebaseOp, cwd: string, conflicts: string[], r: ShellResult, onto?: string): Promise<ToolResult> {
  const warnings: string[] = [];
  const branch = await branchForReport(cwd, warnings, '(detached)');
  const data: GitRebaseData = { op, ...(onto ? { onto } : {}), branch, inConflict: true, conflicts, ...(warnings.length > 0 ? { warnings } : {}) };
  const body = [
    `**Rebase paused with ${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'}.**`,
    '',
    ...conflicts.slice(0, 40).map(p => `- \`${p}\``),
    conflicts.length > 40 ? `- _... and ${conflicts.length - 40} more_` : '',
    '',
    'Resolve, `git add`, then re-run `git_rebase` with `op: continue`. Or `op: abort`.',
  ].filter(Boolean).join('\n');
  return conflictFailure({ output: body, format: 'markdown', success: false, error: 'rebase conflict', data }, r);
}

async function listConflicts(cwd: string): Promise<string[]> {
  const r = await runShell(['git', 'diff', '--name-only', '--diff-filter=U'], { cwd, timeoutMs: 10_000 });
  if (!ranToExit(r) || r.code !== 0) { return []; }
  return r.stdout.split('\n').map(s => s.trim()).filter(Boolean);
}

async function alreadyPushed(cwd: string): Promise<boolean> {
  const r = await runShell(['git', 'merge-base', '--is-ancestor', 'HEAD', '@{upstream}'], { cwd, timeoutMs: 5_000 });
  return ranToExit(r) && r.code === 0;
}

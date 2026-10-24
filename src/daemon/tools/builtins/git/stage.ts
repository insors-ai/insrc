/**
 * git:stage -- stage / unstage paths (gated).
 *
 * First mutating git tool. Gate content includes the exact paths +
 * a summary of current unstaged / staged changes so the user can see
 * what's about to move between worktree and index.
 */

import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { assertSafeArg, fail, failureKind, ranToExit, spawnFail, withFailure } from './helpers.js';
import { GitStageDataSchema } from './schemas.js';
import type { GitStageData, GitStageOp } from './schemas.js';

export type { GitStageData, GitStageOp } from './schemas.js';

export const gitStageTool: Tool = {
  id: 'git_stage',
  description: 'Stage (git add) or unstage (git restore --staged) paths.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root.' })),
    op: Type.String({ enum: ['stage', 'unstage'], description: 'stage=`git add`, unstage=`git restore --staged`.' }),
    paths: Type.Array(Type.String(), { description: 'Paths relative to the repo root. Use ["."] to affect the whole tree.', minItems: 1 }),
    update: Type.Optional(Type.Boolean({ description: 'Stage-only: pass `-u` so only already-tracked files are staged (skip untracked).' })),
  }, { additionalProperties: false }),
  outputSchema: GitStageDataSchema,
  approval: 'common',

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const op = String(input['op'] ?? 'stage');
    const paths = Array.isArray(input['paths']) ? (input['paths'] as unknown[]).map(String) : [];
    const cwd = String(input['cwd'] ?? process.cwd());
    const update = input['update'] === true;

    const headline = op === 'stage'
      ? `Stage ${paths.length} path${paths.length === 1 ? '' : 's'}${update ? ' (only tracked files)' : ''}`
      : `Unstage ${paths.length} path${paths.length === 1 ? '' : 's'}`;

    const pathLines = paths.slice(0, 40).map(p => `- \`${p}\``);
    if (paths.length > 40) { pathLines.push(`- _... and ${paths.length - 40} more_`); }

    return {
      title: `git:${op}`,
      content: [
        `Repo: \`${cwd}\``,
        headline,
        '',
        ...pathLines,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const op = (str(input, 'op') ?? 'stage') as GitStageOp;
    const paths = Array.isArray(input['paths']) ? (input['paths'] as unknown[]).map(String).filter(Boolean) : [];
    if (paths.length === 0) {
      return withFailure({ output: '[git:stage] paths is empty', format: 'text', success: false, error: 'no paths' }, 'rejected');
    }
    for (const p of paths) { assertSafeArg(p, 'path'); }
    const update = input['update'] === true;

    const argv = op === 'stage'
      ? ['git', 'add', ...(update ? ['-u'] : []), '--', ...paths]
      : ['git', 'restore', '--staged', '--', ...paths];

    const result = await runShell(argv, { cwd, timeoutMs: 20_000 });
    if (result.spawnError) {
      return spawnFail('git:stage', result.stderr);
    }
    if (result.code !== 0) { return fail('git:stage', result, { mutating: true }); }

    // Capture post-state for the response: which paths still show up
    // in `git diff --cached --name-only`. Lets the caller verify the
    // staging area without running git:status separately.
    const post = await runShell(['git', 'diff', '--cached', '--name-only'], { cwd, timeoutMs: 10_000 });
    // The mutation has happened: a read that fails keeps the placeholder and says so.
    const postOk = ranToExit(post) && post.code === 0;
    const indexAfter = postOk
      ? post.stdout.split('\n').map(s => s.trim()).filter(Boolean)
      : [];

    const data: GitStageData = {
      op, paths, indexAfter,
      ...(postOk ? {} : { warnings: [`git diff --cached --name-only ${failureKind(post)}: the index listing is empty`] }),
    };
    const verb = op === 'stage' ? 'Staged' : 'Unstaged';
    const output = [
      `${verb} ${paths.length} path${paths.length === 1 ? '' : 's'} in \`${cwd}\`.`,
      '',
      `## Index after (${indexAfter.length} files staged)`,
      '',
      ...(indexAfter.length === 0 ? ['_(index is empty)_'] : indexAfter.slice(0, 40).map(p => `- \`${p}\``)),
      ...(indexAfter.length > 40 ? [`- _... and ${indexAfter.length - 40} more_`] : []),
    ].join('\n');

    return { output, format: 'markdown', success: true, data };
  },
};

function str(input: ToolInput, key: string): string | undefined {
  const v = input[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

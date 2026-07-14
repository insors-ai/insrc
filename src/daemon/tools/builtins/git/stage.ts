/**
 * git:stage -- stage / unstage paths (gated).
 *
 * First mutating git tool. Gate content includes the exact paths +
 * a summary of current unstaged / staged changes so the user can see
 * what's about to move between worktree and index.
 */

import { runShell } from '../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';

export type GitStageOp = 'stage' | 'unstage';

export interface GitStageData {
  op: GitStageOp;
  paths: string[];
  /** Paths that still had changes in the index after the op (for visibility). */
  indexAfter: string[];
}

export const gitStageTool: Tool = {
  id: 'git_stage',
  description: 'Stage (git add) or unstage (git restore --staged) paths.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: 'Repository root.' },
      op:  { type: 'string', enum: ['stage', 'unstage'], description: 'stage=`git add`, unstage=`git restore --staged`.' },
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Paths relative to the repo root. Use ["."] to affect the whole tree.',
        minItems: 1,
      },
      update: {
        type: 'boolean',
        description: 'Stage-only: pass `-u` so only already-tracked files are staged (skip untracked).',
      },
    },
    required: ['op', 'paths'],
    additionalProperties: false,
  },
  requiresApproval: true,

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
      return { output: '[git:stage] paths is empty', format: 'text', success: false, error: 'no paths' };
    }
    const update = input['update'] === true;

    const argv = op === 'stage'
      ? ['git', 'add', ...(update ? ['-u'] : []), '--', ...paths]
      : ['git', 'restore', '--staged', '--', ...paths];

    const result = await runShell(argv, { cwd, timeoutMs: 20_000 });
    if (result.spawnError) {
      return {
        output: `[git:stage] cannot spawn git -- ${result.stderr.trim() || 'unknown error'}`,
        format: 'text', success: false, error: 'git not found',
      };
    }
    if (result.code !== 0) {
      const msg = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
      return { output: `[git:stage] failed: ${msg}`, format: 'text', success: false, error: msg };
    }

    // Capture post-state for the response: which paths still show up
    // in `git diff --cached --name-only`. Lets the caller verify the
    // staging area without running git:status separately.
    const post = await runShell(['git', 'diff', '--cached', '--name-only'], { cwd, timeoutMs: 10_000 });
    const indexAfter = post.code === 0
      ? post.stdout.split('\n').map(s => s.trim()).filter(Boolean)
      : [];

    const data: GitStageData = { op, paths, indexAfter };
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

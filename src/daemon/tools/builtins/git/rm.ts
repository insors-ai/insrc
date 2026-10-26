/**
 * git_rm -- remove paths from the index and the work tree (destructive: always asks).
 *
 * `git rm [-q] --ignore-unmatch -- <paths>`: a path that matches nothing is a success. The argv puts '--' before the
 * paths, so a path may start with '-'; only a NUL is refused, by the input schema before anyone is asked.
 */

import type { TypedTool } from '../../call-tool.js';
import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { ToolApprovalGate, ToolDeps, ToolInput, ToolResult } from '../../types.js';
import { assertSafeArg, fail, ranToExit, spawnFail, str } from './helpers.js';
import { GitRmDataSchema } from './schemas.js';
import type { GitRmData } from './schemas.js';
import { SAFE_PATH } from './safe-args.js';

export const gitRmTool = {
  id: 'git_rm',
  description: 'Remove paths from the index and the work tree (git rm --ignore-unmatch). Always asks. A path that matches nothing is a success.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root or a worktree directory. Defaults to process cwd.' })),
    paths: Type.Array(Type.String({ pattern: SAFE_PATH }), { minItems: 1, maxItems: 200, description: 'The paths to remove (1 to 200).' }),
    quiet: Type.Optional(Type.Boolean({ description: 'Pass -q. Default true.' })),
  }, { additionalProperties: false }),
  outputSchema: GitRmDataSchema,
  approval: 'destructive' as const,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const paths = Array.isArray(input['paths']) ? (input['paths'] as unknown[]).map(String) : [];
    return {
      title: 'git_rm',
      content: [`Repo: \`${String(input['cwd'] ?? process.cwd())}\``, '**Remove**', ...paths.slice(0, 20).map(p => `- \`${p}\``), paths.length > 20 ? `- ... and ${paths.length - 20} more` : ''].filter(Boolean).join('\n'),
      actions: [{ name: 'approve', label: 'Approve' }, { name: 'skip', label: 'Skip' }],
    };
  },

  async execute(input: ToolInput, deps?: ToolDeps): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const paths = (input['paths'] as unknown[]).map(String);
    for (const p of paths) { assertSafeArg(p, 'path'); }
    const argv = ['git', 'rm'];
    if (input['quiet'] !== false) { argv.push('-q'); }
    argv.push('--ignore-unmatch', '--', ...paths);
    const r = await runShell(argv, { cwd, timeoutMs: 30_000, signal: deps?.signal });
    if (r.spawnError) { return spawnFail('git_rm', r.stderr); }
    if (!ranToExit(r) || r.code !== 0) { return fail('git_rm', r, { mutating: true }); }
    const data: GitRmData = { paths };
    return { output: `Removed ${paths.length} path${paths.length === 1 ? '' : 's'}.`, format: 'markdown', success: true, data };
  },
} satisfies TypedTool;

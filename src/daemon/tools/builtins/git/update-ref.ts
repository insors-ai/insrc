/**
 * git_update_ref -- delete a ref (destructive: always asks).
 *
 * Only deletion is supported (`git update-ref -d`). Deleting a ref that is already gone is a success (git exits 0).
 * Every safety condition is in the input schema, which executeTool checks before it asks anyone.
 */

import type { TypedTool } from '../../call-tool.js';
import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { ToolApprovalGate, ToolDeps, ToolInput, ToolResult } from '../../types.js';
import { assertSafeArg, fail, ranToExit, spawnFail, str } from './helpers.js';
import { GitUpdateRefDataSchema } from './schemas.js';
import type { GitUpdateRefData } from './schemas.js';
import { SAFE_REFS_REF } from './safe-args.js';

export const gitUpdateRefTool = {
  id: 'git_update_ref',
  description: 'Delete a ref (git update-ref -d). Always asks. Only deletion is supported; a ref that is already gone is a success.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root. Defaults to process cwd.' })),
    ref: Type.String({ pattern: SAFE_REFS_REF, description: 'The full ref name, starting with refs/.' }),
    delete: Type.Literal(true, { description: 'Required, always true: only deletion is supported.' }),
  }, { additionalProperties: false }),
  outputSchema: GitUpdateRefDataSchema,
  approval: 'destructive' as const,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    return {
      title: 'git_update_ref',
      content: [`Repo: \`${String(input['cwd'] ?? process.cwd())}\``, `**Delete ref** \`${String(input['ref'])}\``].join('\n'),
      actions: [{ name: 'approve', label: 'Approve' }, { name: 'skip', label: 'Skip' }],
    };
  },

  async execute(input: ToolInput, deps?: ToolDeps): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const ref = String(input['ref']);
    assertSafeArg(ref, 'ref');
    const r = await runShell(['git', 'update-ref', '-d', ref], { cwd, timeoutMs: 10_000, signal: deps?.signal });
    if (r.spawnError) { return spawnFail('git_update_ref', r.stderr); }
    if (!ranToExit(r) || r.code !== 0) { return fail('git_update_ref', r, { mutating: true }); }
    const data: GitUpdateRefData = { ref, deleted: true };
    return { output: `Deleted \`${ref}\`.`, format: 'markdown', success: true, data };
  },
} satisfies TypedTool;

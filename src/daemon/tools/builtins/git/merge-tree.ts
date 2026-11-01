/**
 * git_merge_tree -- the tree a merge of two commits would give, without touching the work tree, the index or any ref
 * (read-only for the repository's refs and files, no approval).
 *
 * `git merge-tree --write-tree <a> <b>`: git writes the merged tree (conflict markers included where the merge conflicts)
 * into the object store and prints its name first. Exit 0 is a clean merge, exit 1 a merge with conflicts; the tree is
 * returned either way.
 */

import type { TypedTool } from '../../call-tool.js';
import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { ToolDeps, ToolInput, ToolResult } from '../../types.js';
import { assertSafeArg, fail, ranToExit, rejectInput, spawnFail, str } from './helpers.js';
import { GitMergeTreeDataSchema } from './schemas.js';
import type { GitMergeTreeData } from './schemas.js';

export const gitMergeTreeTool = {
  id: 'git_merge_tree',
  description: 'Compute the tree a merge of two commits would give (git merge-tree --write-tree), and whether it is clean, without changing the work tree, the index or any ref.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root. Defaults to process cwd.' })),
    a: Type.String({ description: 'First commit.' }),
    b: Type.String({ description: 'Second commit.' }),
  }, { additionalProperties: false }),
  outputSchema: GitMergeTreeDataSchema,

  async execute(input: ToolInput, deps?: ToolDeps): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const a = str(input, 'a');
    const b = str(input, 'b');
    if (a === undefined || b === undefined) { return rejectInput('git_merge_tree', 'give a and b'); }
    assertSafeArg(a, 'ref'); assertSafeArg(b, 'ref');
    const r = await runShell(['git', 'merge-tree', '--write-tree', a, b], { cwd, timeoutMs: 30_000, signal: deps?.signal });
    if (r.spawnError) { return spawnFail('git_merge_tree', r.stderr); }
    if (!ranToExit(r) || (r.code !== 0 && r.code !== 1)) { return fail('git_merge_tree', r); }
    const tree = r.stdout.split('\n')[0]?.trim() ?? '';
    if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(tree)) {
      return r.code === 1 ? fail('git_merge_tree', r) : rejectInput('git_merge_tree', `git printed no tree name: ${JSON.stringify(tree.slice(0, 80))}`);
    }
    const data: GitMergeTreeData = { tree, clean: r.code === 0 };
    return { output: `${tree} (${data.clean ? 'clean' : 'conflicts'})`, format: 'text', success: true, data };
  },
} satisfies TypedTool;

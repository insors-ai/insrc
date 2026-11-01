/**
 * git_diff_tree -- the paths one commit changed (read-only, no approval).
 *
 * `git diff-tree --no-commit-id --name-only -r -z [--root] <rev>`: the files a single commit touched against its first
 * parent, recursively, names exactly as git holds them. With `root` a root commit lists all its files; without it a
 * root commit lists none, and a merge commit lists none (plain diff-tree shows no combined diff).
 */

import type { TypedTool } from '../../call-tool.js';
import { Type } from '@sinclair/typebox';
import type { ToolDeps, ToolInput, ToolResult } from '../../types.js';
import { assertSafeArg, readGit, rejectInput, str } from './helpers.js';
import { parseNulList, parseOutput } from './parsers.js';
import { GitDiffTreeDataSchema } from './schemas.js';
import type { GitDiffTreeData } from './schemas.js';

export const gitDiffTreeTool = {
  id: 'git_diff_tree',
  description: 'List the paths one commit changed (git diff-tree --name-only -r), names returned exactly; root also lists the files of a root commit.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root. Defaults to process cwd.' })),
    rev: Type.String({ description: 'The commit (a sha, a branch, HEAD).' }),
    root: Type.Optional(Type.Boolean({ description: 'Also list the files of a root commit (--root).' })),
  }, { additionalProperties: false }),
  outputSchema: GitDiffTreeDataSchema,

  async execute(input: ToolInput, deps?: ToolDeps): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const rev = str(input, 'rev');
    if (rev === undefined) { return rejectInput('git_diff_tree', 'missing rev'); }
    assertSafeArg(rev, 'ref');
    const argv = ['git', 'diff-tree', '--no-commit-id', '--name-only', '-r', '-z'];
    if (input['root'] === true) { argv.push('--root'); }
    argv.push(rev);
    const read = await readGit('git_diff_tree', argv, cwd, 30_000, deps?.signal);
    if (!read.ok) { return read.failure; }
    const parsed = parseOutput('git_diff_tree', read.r, parseNulList);
    if (!parsed.ok) { return parsed.failure; }
    const data: GitDiffTreeData = { paths: parsed.value };
    return { output: parsed.value.join('\n') || '(no changed paths)', format: 'text', success: true, data };
  },
} satisfies TypedTool;

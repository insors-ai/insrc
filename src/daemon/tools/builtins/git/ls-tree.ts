/**
 * git_ls_tree -- list the entries of a tree object (read-only, no approval).
 */

import { Type } from '@sinclair/typebox';
import type { Tool, ToolDeps, ToolInput, ToolResult } from '../../types.js';
import { assertSafeArg, readGit, rejectInput, str } from './helpers.js';
import { parseLsTree, parseNulList, parseOutput } from './parsers.js';
import { GitLsTreeDataSchema } from './schemas.js';
import type { GitLsTreeData } from './schemas.js';

export const gitLsTreeTool: Tool = {
  id: 'git_ls_tree',
  description: 'List the entries (mode, type, object name, path) of the tree at a revision, optionally recursively or limited to paths; or only their names.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root. Defaults to process cwd.' })),
    rev: Type.String({ description: 'Tree-ish: a commit, a tag or a tree (HEAD, origin/main, HEAD:dir).' }),
    paths: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { description: 'Limit to these paths.' })),
    nameOnly: Type.Optional(Type.Boolean({ description: 'Return only the names (--name-only).' })),
    recursive: Type.Optional(Type.Boolean({ description: 'Recurse into subtrees (-r).' })),
  }, { additionalProperties: false }),
  outputSchema: GitLsTreeDataSchema,

  async execute(input: ToolInput, deps?: ToolDeps): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const rev = str(input, 'rev');
    if (rev === undefined) { return rejectInput('git_ls_tree', 'missing rev'); }
    assertSafeArg(rev, 'ref');
    const paths = Array.isArray(input['paths']) ? (input['paths'] as unknown[]).map(String) : [];
    for (const p of paths) { assertSafeArg(p, 'path'); }
    const nameOnly = input['nameOnly'] === true;

    const argv = ['git', '--literal-pathspecs', 'ls-tree', '-z'];
    if (input['recursive'] === true) { argv.push('-r'); }
    if (nameOnly) { argv.push('--name-only'); }
    argv.push(rev);
    if (paths.length > 0) { argv.push('--', ...paths); }

    const read = await readGit('git_ls_tree', argv, cwd, 30_000, deps?.signal);
    if (!read.ok) { return read.failure; }
    if (nameOnly) {
      const names = parseOutput('git_ls_tree', read.r, parseNulList);
      if (!names.ok) { return names.failure; }
      const data: GitLsTreeData = { names: names.value };
      return { output: names.value.join('\n') || '(empty tree)', format: 'text', success: true, data };
    }
    const entries = parseOutput('git_ls_tree', read.r, parseLsTree);
    if (!entries.ok) { return entries.failure; }
    const data: GitLsTreeData = { entries: entries.value };
    return { output: entries.value.map(e => `${e.mode} ${e.type} ${e.sha}\t${e.path}`).join('\n') || '(empty tree)', format: 'text', success: true, data };
  },
};

/**
 * git_merge_base -- the best common ancestor(s) of two revisions, or whether one is an ancestor of the other
 * (read-only, no approval).
 */

import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { Tool, ToolInput, ToolResult } from '../../types.js';
import { assertSafeArg, fail, ranToExit, rejectInput, spawnFail, str } from './helpers.js';
import { parseOutput, parseRevList } from './parsers.js';
import { GitMergeBaseDataSchema } from './schemas.js';
import type { GitMergeBaseData } from './schemas.js';

export const gitMergeBaseTool: Tool = {
  id: 'git_merge_base',
  description: 'Find the common ancestor of two revisions (bases; all lists every best common ancestor), or ask whether a is an ancestor of b (isAncestor).',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root. Defaults to process cwd.' })),
    a: Type.String({ description: 'First revision.' }),
    b: Type.String({ description: 'Second revision.' }),
    isAncestor: Type.Optional(Type.Boolean({ description: 'Answer whether a is an ancestor of b (--is-ancestor) instead of listing bases.' })),
    all: Type.Optional(Type.Boolean({ description: 'List every best common ancestor (--all), not only one.' })),
  }, { additionalProperties: false }),
  outputSchema: GitMergeBaseDataSchema,

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const a = str(input, 'a');
    const b = str(input, 'b');
    if (a === undefined || b === undefined) { return rejectInput('git_merge_base', 'give a and b'); }
    assertSafeArg(a, 'ref'); assertSafeArg(b, 'ref');

    if (input['isAncestor'] === true) {
      const r = await runShell(['git', 'merge-base', '--is-ancestor', a, b], { cwd, timeoutMs: 10_000 });
      if (r.spawnError) { return spawnFail('git_merge_base', r.stderr); }
      // exit 0: a is an ancestor of b; exit 1: it is not; anything else is a failure
      if (ranToExit(r) && (r.code === 0 || r.code === 1)) {
        const data: GitMergeBaseData = { isAncestor: r.code === 0 };
        return { output: r.code === 0 ? `${a} is an ancestor of ${b}` : `${a} is not an ancestor of ${b}`, format: 'text', success: true, data };
      }
      return fail('git_merge_base', r);
    }

    const argv = ['git', 'merge-base'];
    if (input['all'] === true) { argv.push('--all'); }
    argv.push(a, b);
    const r = await runShell(argv, { cwd, timeoutMs: 10_000 });
    if (r.spawnError) { return spawnFail('git_merge_base', r.stderr); }
    // exit 1 with nothing printed: the histories are unrelated, which is the answer "no bases"
    if (ranToExit(r) && r.code === 1 && r.stdout === '') {
      const data: GitMergeBaseData = { bases: [] };
      return { output: 'no common ancestor', format: 'text', success: true, data };
    }
    if (r.code !== 0) { return fail('git_merge_base', r); }
    const parsed = parseOutput('git_merge_base', r, parseRevList);
    if (!parsed.ok) { return parsed.failure; }
    const data: GitMergeBaseData = { bases: parsed.value };
    return { output: parsed.value.join('\n'), format: 'text', success: true, data };
  },
};

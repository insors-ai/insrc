/**
 * git_rev_list -- list the commits reachable from a revision, or count them (read-only, no approval).
 */

import type { TypedTool } from '../../call-tool.js';
import { Type } from '@sinclair/typebox';
import type { ToolInput, ToolResult } from '../../types.js';
import { assertSafeArg, readGit, rejectInput, str } from './helpers.js';
import { parseOutput, parseRevList } from './parsers.js';
import { GitRevListDataSchema } from './schemas.js';
import type { GitRevListData } from './schemas.js';

export const gitRevListTool = {
  id: 'git_rev_list',
  description: 'List the commits reachable from a revision or range (newest first), or count them. Optionally only merges-free, first-parent or root commits.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root. Defaults to process cwd.' })),
    rev: Type.String({ description: 'Revision or range (HEAD, main..feature, origin/main).' }),
    count: Type.Optional(Type.Boolean({ description: 'Return only the number of commits (--count).' })),
    maxParents: Type.Optional(Type.Number({ description: 'Only commits with at most this many parents (--max-parents); 0 gives root commits.', minimum: 0 })),
    firstParent: Type.Optional(Type.Boolean({ description: 'Follow only the first parent of merges (--first-parent).' })),
    limit: Type.Optional(Type.Number({ description: 'At most this many commits (--max-count).', minimum: 1 })),
  }, { additionalProperties: false }),
  outputSchema: GitRevListDataSchema,

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const rev = str(input, 'rev');
    if (rev === undefined) { return rejectInput('git_rev_list', 'missing rev'); }
    assertSafeArg(rev, 'ref');
    const argv = ['git', 'rev-list'];
    if (input['count'] === true) { argv.push('--count'); }
    if (typeof input['maxParents'] === 'number') { argv.push(`--max-parents=${Math.floor(input['maxParents'])}`); }
    if (input['firstParent'] === true) { argv.push('--first-parent'); }
    if (typeof input['limit'] === 'number') { argv.push(`--max-count=${Math.floor(input['limit'])}`); }
    argv.push(rev);

    const read = await readGit('git_rev_list', argv, cwd, 30_000);
    if (!read.ok) { return read.failure; }

    if (input['count'] === true) {
      const count = Number(read.r.stdout.trim());
      if (!Number.isInteger(count) || count < 0) { return rejectInput('git_rev_list', `could not parse the count: ${JSON.stringify(read.r.stdout.trim())}`); }
      const data: GitRevListData = { count };
      return { output: String(count), format: 'text', success: true, data };
    }
    const parsed = parseOutput('git_rev_list', read.r, parseRevList);
    if (!parsed.ok) { return parsed.failure; }
    const data: GitRevListData = { commits: parsed.value };
    return { output: parsed.value.join('\n') || '(no commits)', format: 'text', success: true, data };
  },
} satisfies TypedTool;

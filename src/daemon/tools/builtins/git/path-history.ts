/**
 * git_path_history -- the commits that touched a path (or the whole history) with their committer time, in the forms the
 * workflow code asks: the commit that introduced a path, the first-parent history of a tracking ref, a pickaxe search
 * (read-only, no approval).
 */

import type { TypedTool } from '../../call-tool.js';
import { Type } from '@sinclair/typebox';
import type { ToolInput, ToolResult } from '../../types.js';
import { assertSafeArg, readGit, str } from './helpers.js';
import { parseOutput, parsePathHistory, PATH_HISTORY_FORMAT } from './parsers.js';
import { GitPathHistoryDataSchema } from './schemas.js';
import type { GitPathHistoryData } from './schemas.js';

export const gitPathHistoryTool = {
  id: 'git_path_history',
  description: 'List the commits (sha, committer time, subject) that touched a path, newest first or oldest first, optionally only those that added/deleted/modified/renamed it, along the first parent, or whose change adds or removes a text.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root. Defaults to process cwd.' })),
    path: Type.Optional(Type.String({ description: 'A path relative to the repository root, matched literally. Default: the whole history.' })),
    rev: Type.Optional(Type.String({ description: 'Where to start: HEAD (default) or a ref such as origin/main.' })),
    diffFilter: Type.Optional(Type.String({ enum: ['A', 'D', 'M', 'R'], description: 'Only commits that Added, Deleted, Modified or Renamed the path.' })),
    firstParent: Type.Optional(Type.Boolean({ description: 'Follow only the first parent of merges (--first-parent).' })),
    reverse: Type.Optional(Type.Boolean({ description: 'Oldest first (--reverse).' })),
    limit: Type.Optional(Type.Number({ description: 'At most this many commits (-n).', minimum: 1 })),
    pickaxe: Type.Optional(Type.String({ description: 'Only commits whose change adds or removes this text (-S).' })),
  }, { additionalProperties: false }),
  outputSchema: GitPathHistoryDataSchema,

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const path = str(input, 'path');
    const rev = str(input, 'rev') ?? 'HEAD';
    assertSafeArg(rev, 'ref');
    if (path !== undefined) { assertSafeArg(path, 'path'); }
    const pickaxe = str(input, 'pickaxe');

    const argv = ['git', 'log', '-z', `--format=${PATH_HISTORY_FORMAT}`];
    const filter = str(input, 'diffFilter');
    if (filter !== undefined) { argv.push(`--diff-filter=${filter}`); }
    if (input['firstParent'] === true) { argv.push('--first-parent'); }
    if (input['reverse'] === true) { argv.push('--reverse'); }
    if (typeof input['limit'] === 'number') { argv.push('-n', String(Math.floor(input['limit']))); }
    if (pickaxe !== undefined) { argv.push('-S', pickaxe); }
    argv.push(rev);
    if (path !== undefined) { argv.push('--', `:(top,literal)${path}`); }

    const read = await readGit('git_path_history', argv, cwd, 60_000);
    if (!read.ok) { return read.failure; }
    const parsed = parseOutput('git_path_history', read.r, parsePathHistory);
    if (!parsed.ok) { return parsed.failure; }
    const data: GitPathHistoryData = { commits: parsed.value };
    return { output: parsed.value.map(c => `${c.sha}\t${c.committerTime}${c.subject ? `\t${c.subject}` : ''}`).join('\n') || '(no commits)', format: 'text', success: true, data };
  },
} satisfies TypedTool;

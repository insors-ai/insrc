/**
 * git_ls_files -- list the files git tracks, or the untracked and ignored ones (read-only, no approval).
 */

import type { TypedTool } from '../../call-tool.js';
import { Type } from '@sinclair/typebox';
import type { ToolInput, ToolResult } from '../../types.js';
import { assertSafeArg, readGit, str } from './helpers.js';
import { parseNulList, parseOutput } from './parsers.js';
import { GitLsFilesDataSchema } from './schemas.js';
import type { GitLsFilesData } from './schemas.js';

/** The largest budget a caller may ask for: 50 MiB, what the repository ignore filter allowed before it used this tool. */
const MAX_LISTING_BYTES = 50 * 1024 * 1024;

export const gitLsFilesTool = {
  id: 'git_ls_files',
  description: 'List files: the tracked ones (default), the untracked ones (others), or the ignored ones; optionally limited to paths. Names are returned exactly, whatever characters they hold.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root. Defaults to process cwd.' })),
    paths: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { description: 'Limit to these paths (pathspecs are literal).' })),
    cached: Type.Optional(Type.Boolean({ description: 'Files in the index (the default when nothing else is asked).' })),
    others: Type.Optional(Type.Boolean({ description: 'Untracked files, without those git ignores.' })),
    ignored: Type.Optional(Type.Boolean({ description: 'Only files git ignores (with others: untracked ignored files; otherwise tracked ones that match an ignore rule).' })),
    maxBytes: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_LISTING_BYTES, description: 'The most output the listing may hold, in bytes (default 10 MiB). A listing over it fails; it is never returned cut.' })),
  }, { additionalProperties: false }),
  outputSchema: GitLsFilesDataSchema,

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const paths = Array.isArray(input['paths']) ? (input['paths'] as unknown[]).map(String) : [];
    for (const p of paths) { assertSafeArg(p, 'path'); }
    const others = input['others'] === true;
    const ignored = input['ignored'] === true;
    const cached = input['cached'] === true || (!others && !ignored);

    const argv = ['git', '--literal-pathspecs', 'ls-files', '-z'];
    if (cached) { argv.push('--cached'); }
    if (others) { argv.push('--others'); }
    if (ignored) { argv.push('--ignored'); }
    if (others || ignored) { argv.push('--exclude-standard'); }
    if (paths.length > 0) { argv.push('--', ...paths); }

    const maxBytes = typeof input['maxBytes'] === 'number' ? input['maxBytes'] : undefined;
    const read = await readGit('git_ls_files', argv, cwd, 30_000, undefined, maxBytes);
    if (!read.ok) { return read.failure; }
    const parsed = parseOutput('git_ls_files', read.r, parseNulList);
    if (!parsed.ok) { return parsed.failure; }
    const data: GitLsFilesData = { files: parsed.value };
    return { output: parsed.value.join('\n') || '(no files)', format: 'text', success: true, data };
  },
} satisfies TypedTool;

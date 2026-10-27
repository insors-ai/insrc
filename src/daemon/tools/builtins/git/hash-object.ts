/**
 * git_hash_object -- the object name git would give a file's content (read-only: nothing is written, no approval).
 */

import type { TypedTool } from '../../call-tool.js';
import { Type } from '@sinclair/typebox';
import type { ToolInput, ToolResult } from '../../types.js';
import { assertSafeArg, readGit, rejectInput, str } from './helpers.js';
import { parseOutput } from './parsers.js';
import { GitHashObjectDataSchema } from './schemas.js';
import type { GitHashObjectData } from './schemas.js';

export const gitHashObjectTool = {
  id: 'git_hash_object',
  description: 'Compute the object name git gives a file\'s content, without storing the object.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root. Defaults to process cwd.' })),
    path: Type.String({ description: 'The file to hash, relative to cwd or absolute.' }),
  }, { additionalProperties: false }),
  outputSchema: GitHashObjectDataSchema,

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const path = str(input, 'path');
    if (path === undefined) { return rejectInput('git_hash_object', 'missing path'); }
    assertSafeArg(path, 'path');
    const read = await readGit('git_hash_object', ['git', 'hash-object', '--', path], cwd, 15_000);
    if (!read.ok) { return read.failure; }
    const cut = parseOutput('git_hash_object', read.r, raw => raw.trim());   // a cut capture is a failure, before the name check
    if (!cut.ok) { return cut.failure; }
    const sha = cut.value;
    if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(sha)) { return rejectInput('git_hash_object', `git printed no object name: ${JSON.stringify(sha.slice(0, 80))}`); }
    const data: GitHashObjectData = { sha };
    return { output: sha, format: 'text', success: true, data };
  },
} satisfies TypedTool;

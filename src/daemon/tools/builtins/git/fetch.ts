/**
 * git:fetch -- update remote-tracking refs without touching local branches.
 *
 * Read-only with respect to the working tree and index, so no approval
 * is required by default. Does hit the network, which is the main
 * reason this is a distinct tool rather than just auto-running in
 * other git tools.
 */

import type { TypedTool } from '../../call-tool.js';
import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { ToolDeps, ToolInput, ToolResult } from '../../types.js';
import { str, assertSafeArg, fail, spawnFail } from './helpers.js';
import { GitFetchDataSchema } from './schemas.js';
import type { GitFetchData } from './schemas.js';

export type { GitFetchData } from './schemas.js';

export const gitFetchTool = {
  id: 'git_fetch',
  description: 'Fetch refs from a remote. No working-tree changes; no approval required.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root.' })),
    remote: Type.Optional(Type.String({ description: 'Remote name. Default: `origin`.' })),
    all: Type.Optional(Type.Boolean({ description: 'Fetch from every configured remote.' })),
    prune: Type.Optional(Type.Boolean({ description: 'Remove stale remote-tracking refs (git --prune).' })),
    tags: Type.Optional(Type.Boolean({ description: 'Fetch tags. Default behavior is implicit --tags via --follow-tags config, but explicit can help.' })),
    depth: Type.Optional(Type.Number({ description: 'Shallow-fetch depth.', minimum: 1 })),
  }, { additionalProperties: false }),
  outputSchema: GitFetchDataSchema,
  // approval stays none: a fetch updates remote-tracking refs only.

  async execute(input: ToolInput, deps?: ToolDeps): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const all = input['all'] === true;
    const prune = input['prune'] === true;
    const tags = input['tags'] === true;
    const depth = typeof input['depth'] === 'number' ? Math.floor(input['depth']) : undefined;
    const remote = all ? undefined : (str(input, 'remote') ?? 'origin');
    if (remote !== undefined) { assertSafeArg(remote, 'ref'); }

    const argv = ['git', 'fetch', '--verbose'];
    if (all)    { argv.push('--all'); }
    if (prune)  { argv.push('--prune'); }
    if (tags)   { argv.push('--tags'); }
    if (depth)  { argv.push(`--depth=${depth}`); }
    if (remote) { argv.push(remote); }

    const result = await runShell(argv, { cwd, timeoutMs: 120_000, signal: deps?.signal });
    if (result.spawnError) { return spawnFail('git_fetch', result.stderr); }
    if (result.code !== 0) { return fail('git_fetch', result, { network: true, mutating: true }); }

    // git fetch writes its progress / update summary to stderr by
    // convention. Extract meaningful lines (ref updates start with
    // spaces then a status indicator).
    const updates: string[] = [];
    for (const line of result.stderr.split('\n')) {
      const trimmed = line.trimEnd();
      if (!trimmed) { continue; }
      // Progress like "remote: Counting..." and "Receiving..." we skip.
      if (/^(remote: |Total |Receiving |Resolving |Unpacking )/.test(trimmed)) { continue; }
      if (/^\s+[^\s]/.test(trimmed)) { updates.push(trimmed.trim()); }
      else if (/From\s+/.test(trimmed)) { updates.push(trimmed); }
    }

    const data: GitFetchData = { remote: remote ?? 'all', updates, raw: result.stderr };
    const body = [
      `Fetched from \`${data.remote}\`${prune ? ' (pruned)' : ''}.`,
      '',
      updates.length > 0 ? '```\n' + updates.join('\n') + '\n```' : '_No new refs._',
    ].join('\n');
    return { output: body, format: 'markdown', success: true, data };
  },
} satisfies TypedTool;

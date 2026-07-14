/**
 * git:fetch -- update remote-tracking refs without touching local branches.
 *
 * Read-only with respect to the working tree and index, so no approval
 * is required by default. Does hit the network, which is the main
 * reason this is a distinct tool rather than just auto-running in
 * other git tools.
 */

import { runShell } from '../../shell-helper.js';
import type { Tool, ToolInput, ToolResult } from '../../types.js';
import { str, fail, spawnFail } from './helpers.js';

export interface GitFetchData {
  remote: string;
  /** Individual update lines parsed from stderr (e.g. "  abc..def  main -> origin/main"). */
  updates: string[];
  /** Raw stderr so the caller can inspect pruned / forced updates if interested. */
  raw: string;
}

export const gitFetchTool: Tool = {
  id: 'git_fetch',
  description: 'Fetch refs from a remote. No working-tree changes; no approval required.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: 'Repository root.' },
      remote: { type: 'string', description: 'Remote name. Default: `origin`.' },
      all: { type: 'boolean', description: 'Fetch from every configured remote.' },
      prune: { type: 'boolean', description: 'Remove stale remote-tracking refs (git --prune).' },
      tags: { type: 'boolean', description: 'Fetch tags. Default behavior is implicit --tags via --follow-tags config, but explicit can help.' },
      depth: { type: 'number', description: 'Shallow-fetch depth.', minimum: 1 },
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const all = input['all'] === true;
    const prune = input['prune'] === true;
    const tags = input['tags'] === true;
    const depth = typeof input['depth'] === 'number' ? Math.floor(input['depth']) : undefined;
    const remote = all ? undefined : (str(input, 'remote') ?? 'origin');

    const argv = ['git', 'fetch', '--verbose'];
    if (all)    { argv.push('--all'); }
    if (prune)  { argv.push('--prune'); }
    if (tags)   { argv.push('--tags'); }
    if (depth)  { argv.push(`--depth=${depth}`); }
    if (remote) { argv.push(remote); }

    const result = await runShell(argv, { cwd, timeoutMs: 120_000 });
    if (result.spawnError) { return spawnFail('git_fetch', result.stderr); }
    if (result.code !== 0) { return fail('git_fetch', result.stderr, result.stdout, result.code); }

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
};

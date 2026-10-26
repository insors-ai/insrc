/**
 * git_ls_remote -- list refs of a remote (read-only, network, no approval).
 *
 * The answer is parsed: '<sha>\t<ref>' lines are entries and 'ref: <target>\t<ref>' lines (with symref) are symrefs.
 * An empty answer is a success with empty lists (the ref is absent), not a failure.
 */

import type { TypedTool } from '../../call-tool.js';
import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { ToolDeps, ToolInput, ToolResult } from '../../types.js';
import { fail, ranToExit, spawnFail, str } from './helpers.js';
import { GitLsRemoteDataSchema } from './schemas.js';
import type { GitLsRemoteData } from './schemas.js';
import { SAFE_REF } from './safe-args.js';

export const gitLsRemoteTool = {
  id: 'git_ls_remote',
  description: 'List refs of a remote (git ls-remote), optionally only heads or only matching patterns, optionally with the symbolic refs (HEAD).',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root. Defaults to process cwd.' })),
    remote: Type.String({ pattern: SAFE_REF, description: 'A remote name or URL-free name accepted by git.' }),
    heads: Type.Optional(Type.Boolean({ description: 'Only refs/heads (--heads). Default false.' })),
    symref: Type.Optional(Type.Boolean({ description: 'Also report the symbolic refs, e.g. what HEAD points to (--symref). Default false.' })),
    patterns: Type.Optional(Type.Array(Type.String({ pattern: SAFE_REF }), { maxItems: 8, description: 'Ref patterns to match (default none).' })),
  }, { additionalProperties: false }),
  outputSchema: GitLsRemoteDataSchema,

  async execute(input: ToolInput, deps?: ToolDeps): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const remote = String(input['remote']);
    const patterns = Array.isArray(input['patterns']) ? (input['patterns'] as unknown[]).map(String) : [];
    const argv = ['git', 'ls-remote'];
    if (input['symref'] === true) { argv.push('--symref'); }
    if (input['heads'] === true) { argv.push('--heads'); }
    argv.push(remote, ...patterns);

    const r = await runShell(argv, { cwd, timeoutMs: 30_000, signal: deps?.signal });
    if (r.spawnError) { return spawnFail('git_ls_remote', r.stderr); }
    if (!ranToExit(r) || r.code !== 0) { return fail('git_ls_remote', r, { network: true }); }

    const entries: GitLsRemoteData['entries'] = [];
    const symrefs: GitLsRemoteData['symrefs'] = [];
    for (const line of r.stdout.split('\n')) {
      if (line === '') { continue; }
      const tab = line.indexOf('\t');
      if (tab < 0) { continue; }
      const left = line.slice(0, tab);
      const ref = line.slice(tab + 1);
      if (left.startsWith('ref: ')) { symrefs.push({ ref, target: left.slice('ref: '.length) }); }
      else { entries.push({ objectId: left, ref }); }
    }
    const data: GitLsRemoteData = { entries, symrefs };
    return { output: entries.map(e => `${e.objectId}\t${e.ref}`).join('\n') || '(no matching refs)', format: 'text', success: true, data };
  },
} satisfies TypedTool;

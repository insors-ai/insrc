/**
 * git_fetch_refs -- fetch named refs into explicit destinations, typed (the form policy refresh and the self-update run).
 *
 * Unlike git_fetch it takes explicit src:dst pairs and the options that keep a fetch from touching anything else
 * (no tags, no FETCH_HEAD, no submodules, no pruning, an empty refmap). Its class follows its destinations: a fetch that
 * writes only remote-tracking refs (refs/remotes/) is none, even forced; a forced refspec that would overwrite any other
 * ref is destructive; an unforced one into another ref is common.
 */

import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { ApprovalClass, Tool, ToolInput, ToolResult } from '../../types.js';
import { assertSafeArg, fail, rejectInput, spawnFail, str } from './helpers.js';
import { parseFetchPorcelain, parseOutput } from './parsers.js';
import { GitFetchRefsDataSchema } from './schemas.js';
import type { GitFetchRefsData } from './schemas.js';

/** [forced, destination] of a "src:dst" refspec, or undefined when it is not an explicit pair. */
function destination(refspec: unknown): { forced: boolean; dst: string } | undefined {
  if (typeof refspec !== 'string') { return undefined; }
  const forced = refspec.startsWith('+');
  const body = forced ? refspec.slice(1) : refspec;
  const colon = body.indexOf(':');
  if (colon <= 0 || colon === body.length - 1) { return undefined; }
  return { forced, dst: body.slice(colon + 1) };
}

export const gitFetchRefsTool: Tool = {
  id: 'git_fetch_refs',
  description: 'Fetch explicit src:dst refspecs from a remote, optionally without tags, FETCH_HEAD, submodules or pruning; returns the refs it updated.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root. Defaults to process cwd.' })),
    remote: Type.String({ description: 'Remote name or URL.' }),
    refspecs: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, description: 'Explicit src:dst pairs, e.g. +refs/heads/main:refs/remotes/origin/main.' }),
    noTags: Type.Optional(Type.Boolean({ description: '--no-tags.' })),
    noWriteFetchHead: Type.Optional(Type.Boolean({ description: '--no-write-fetch-head.' })),
    noRecurseSubmodules: Type.Optional(Type.Boolean({ description: '--no-recurse-submodules.' })),
    noPrune: Type.Optional(Type.Boolean({ description: '--no-prune.' })),
    refmap: Type.Optional(Type.String({ description: '--refmap=<value>; an empty string ignores the configured fetch refspecs.' })),
    depth: Type.Optional(Type.Number({ description: 'Shallow-fetch depth.', minimum: 1 })),
  }, { additionalProperties: false }),
  outputSchema: GitFetchRefsDataSchema,

  approval(input: ToolInput): ApprovalClass {
    const specs = Array.isArray(input['refspecs']) ? input['refspecs'] : [];
    let cls: ApprovalClass = 'none';
    for (const spec of specs) {
      const d = destination(spec);
      if (d === undefined) { return 'destructive'; } // not an explicit pair: unknown destination
      if (d.dst.startsWith('refs/remotes/')) { continue; }
      if (d.forced) { return 'destructive'; }
      cls = 'common';
    }
    return cls;
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const remote = str(input, 'remote');
    const specs = Array.isArray(input['refspecs']) ? (input['refspecs'] as unknown[]).map(String) : [];
    if (remote === undefined || specs.length === 0) { return rejectInput('git_fetch_refs', 'give remote and refspecs'); }
    assertSafeArg(remote, 'ref');
    for (const spec of specs) {
      if (destination(spec) === undefined) { return rejectInput('git_fetch_refs', `${JSON.stringify(spec)} is not an explicit src:dst pair`); }
      assertSafeArg(spec.replace(/^\+/, ''), 'ref');
    }

    const argv = ['git', 'fetch', '--porcelain'];
    if (input['noTags'] === true) { argv.push('--no-tags'); }
    if (input['noWriteFetchHead'] === true) { argv.push('--no-write-fetch-head'); }
    if (input['noRecurseSubmodules'] === true) { argv.push('--no-recurse-submodules'); }
    if (input['noPrune'] === true) { argv.push('--no-prune'); }
    if (typeof input['refmap'] === 'string') { argv.push(`--refmap=${input['refmap']}`); }
    if (typeof input['depth'] === 'number') { argv.push(`--depth=${Math.floor(input['depth'])}`); }
    argv.push(remote, ...specs);

    const r = await runShell(argv, { cwd, timeoutMs: 120_000 });
    if (r.spawnError) { return spawnFail('git_fetch_refs', r.stderr); }
    if (r.code !== 0) { return fail('git_fetch_refs', r, { network: true, mutating: true }); }
    const parsed = parseOutput('git_fetch_refs', r, parseFetchPorcelain);
    if (!parsed.ok) { return parsed.failure; }
    if (parsed.value.rejected.length > 0) { return rejectInput('git_fetch_refs', `git rejected the update of ${parsed.value.rejected.join(', ')}`); }
    const data: GitFetchRefsData = { updated: parsed.value.updated };
    return { output: parsed.value.updated.map(u => `${u.old.slice(0, 7)}..${u.new.slice(0, 7)}  ${u.ref}`).join('\n') || 'Nothing to update.', format: 'text', success: true, data };
  },
};

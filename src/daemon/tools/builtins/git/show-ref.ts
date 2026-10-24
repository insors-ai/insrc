/**
 * git_show_ref -- list refs with their object names, check that one exists or is valid (read-only, no approval).
 */

import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { Tool, ToolInput, ToolResult } from '../../types.js';
import { assertSafeArg, fail, ranToExit, spawnFail, str } from './helpers.js';
import { parseOutput, parseShowRef } from './parsers.js';
import { GitShowRefDataSchema } from './schemas.js';
import type { GitShowRefData } from './schemas.js';

export const gitShowRefTool: Tool = {
  id: 'git_show_ref',
  description: 'List refs and their object names (all, or those matching a pattern); with verify, require the exact ref; with exists, report whether it exists without failing when it does not.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root. Defaults to process cwd.' })),
    ref: Type.Optional(Type.String({ description: 'A ref name or pattern, e.g. refs/heads/main or main.' })),
    verify: Type.Optional(Type.Boolean({ description: 'Require the exact full ref (--verify): a missing one is a failure.' })),
    exists: Type.Optional(Type.Boolean({ description: 'Check that the exact full ref exists (--exists): a missing one is an empty list, not a failure.' })),
  }, { additionalProperties: false }),
  outputSchema: GitShowRefDataSchema,

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const ref = str(input, 'ref');
    if (ref !== undefined) { assertSafeArg(ref, 'ref'); }
    const exists = input['exists'] === true && ref !== undefined;

    if (exists) {
      // --exists answers by exit code (0: it does, 2: it does not); the object name comes from a --verify of the same ref
      const probe = await runShell(['git', 'show-ref', '--exists', ref!], { cwd, timeoutMs: 10_000 });
      if (probe.spawnError) { return spawnFail('git_show_ref', probe.stderr); }
      if (ranToExit(probe) && probe.code === 2) {
        const data: GitShowRefData = { refs: [] };
        return { output: `${ref} does not exist`, format: 'text', success: true, data };
      }
      if (probe.code !== 0) { return fail('git_show_ref', probe); }
    }

    const argv = ['git', 'show-ref'];
    if (input['verify'] === true || exists) { argv.push('--verify'); }
    if (ref !== undefined) { argv.push(ref); }
    const r = await runShell(argv, { cwd, timeoutMs: 10_000 });
    if (r.spawnError) { return spawnFail('git_show_ref', r.stderr); }
    // show-ref exits 1 when nothing matches a pattern: an empty list
    if (ranToExit(r) && r.code === 1 && input['verify'] !== true && !exists) {
      const data: GitShowRefData = { refs: [] };
      return { output: '(no refs)', format: 'text', success: true, data };
    }
    if (r.code !== 0) { return fail('git_show_ref', r); }
    const parsed = parseOutput('git_show_ref', r, parseShowRef);
    if (!parsed.ok) { return parsed.failure; }
    const data: GitShowRefData = { refs: parsed.value };
    return { output: parsed.value.map(x => `${x.sha} ${x.name}`).join('\n') || '(no refs)', format: 'text', success: true, data };
  },
};

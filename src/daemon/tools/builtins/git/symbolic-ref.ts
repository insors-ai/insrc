/**
 * git_symbolic_ref -- read, set or delete a symbolic ref such as HEAD or refs/remotes/origin/HEAD.
 *
 * get is a read (none), set repoints the ref (common: policy refresh points refs/remotes/<remote>/HEAD at a tracking
 * branch), delete removes it (destructive).
 */

import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { ApprovalClass, Tool, ToolDeps, ToolInput, ToolResult } from '../../types.js';
import { assertSafeArg, fail, ranToExit, rejectInput, spawnFail, str } from './helpers.js';
import { GitSymbolicRefDataSchema } from './schemas.js';
import type { GitSymbolicRefData } from './schemas.js';

export const gitSymbolicRefTool: Tool = {
  id: 'git_symbolic_ref',
  description: 'Read (get), repoint (set) or remove (delete) a symbolic ref such as HEAD or refs/remotes/origin/HEAD.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root. Defaults to process cwd.' })),
    ref: Type.String({ description: 'The symbolic ref: HEAD or a full ref name such as refs/remotes/origin/HEAD.' }),
    op: Type.String({ enum: ['get', 'set', 'delete'], description: 'get: the ref it points at; set: point it at target; delete: remove the symbolic ref.' }),
    target: Type.Optional(Type.String({ description: 'For set: the full ref name to point at, e.g. refs/remotes/origin/main.' })),
    quiet: Type.Optional(Type.Boolean({ description: 'For get: a ref that is not symbolic gives target null instead of a failure (-q).' })),
  }, { additionalProperties: false }),
  outputSchema: GitSymbolicRefDataSchema,

  // get is a read; set repoints a ref; delete removes one.
  approval(input: ToolInput): ApprovalClass {
    return input['op'] === 'delete' ? 'destructive' : input['op'] === 'set' ? 'common' : 'none';
  },

  async execute(input: ToolInput, deps?: ToolDeps): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const ref = str(input, 'ref');
    const op = str(input, 'op');
    if (ref === undefined || (op !== 'get' && op !== 'set' && op !== 'delete')) { return rejectInput('git_symbolic_ref', 'give ref and op (get, set or delete)'); }
    assertSafeArg(ref, 'ref');
    const argv = ['git', 'symbolic-ref'];

    if (op === 'set') {
      const target = str(input, 'target');
      if (target === undefined) { return rejectInput('git_symbolic_ref', 'set needs a target'); }
      assertSafeArg(target, 'ref');
      argv.push(ref, target);
    } else if (op === 'delete') {
      argv.push('--delete', ref);
    } else {
      if (input['quiet'] === true) { argv.push('-q'); }
      argv.push(ref);
    }

    const r = await runShell(argv, { cwd, timeoutMs: 10_000, signal: deps?.signal });
    if (r.spawnError) { return spawnFail('git_symbolic_ref', r.stderr); }
    // -q: exit 1 with nothing printed means "not a symbolic ref", which is the answer null, not a failure
    if (op === 'get' && input['quiet'] === true && ranToExit(r) && r.code === 1) {
      const data: GitSymbolicRefData = { target: null };
      return { output: `${ref} is not a symbolic ref`, format: 'text', success: true, data };
    }
    if (r.code !== 0) { return fail('git_symbolic_ref', r, { mutating: op !== 'get' }); }

    const target = op === 'delete' ? null : op === 'set' ? str(input, 'target')! : r.stdout.trim();
    const data: GitSymbolicRefData = { target };
    const text = op === 'get' ? `${ref} -> ${target}` : op === 'set' ? `${ref} now points at ${target}` : `Deleted ${ref}`;
    return { output: text, format: 'text', success: true, data };
  },
};

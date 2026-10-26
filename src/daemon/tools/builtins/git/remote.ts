/**
 * git:remote -- list / add / remove / set-url / rename remotes.
 */

import type { TypedTool } from '../../call-tool.js';
import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { ApprovalClass, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, assertSafeArg, fail, spawnFail, rejectInput } from './helpers.js';
import { GitRemoteDataSchema } from './schemas.js';
import type { GitRemoteData, GitRemoteEntry } from './schemas.js';

export type GitRemoteOp = 'list' | 'add' | 'remove' | 'set-url' | 'rename';

export type { GitRemoteData, GitRemoteEntry } from './schemas.js';

export const gitRemoteTool = {
  id: 'git_remote',
  description: 'Manage remote URLs. list is read-only; add / remove / set-url / rename gate.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    op: Type.String({ enum: ['list', 'add', 'remove', 'set-url', 'rename'] }),
    name: Type.Optional(Type.String()),
    url: Type.Optional(Type.String()),
    newName: Type.Optional(Type.String({ description: 'For op=rename.' })),
    push: Type.Optional(Type.Boolean({ description: 'For op=set-url: modify only the push URL (--push).' })),
  }, { additionalProperties: false }),
  outputSchema: GitRemoteDataSchema,

  // list is a read; the mutations are ordinary (remove deletes only remote-tracking refs and config).

  approval(input: ToolInput): ApprovalClass {
    return input['op'] !== 'list' ? 'common' : 'none';
  },

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const op = String(input['op'] ?? 'list');
    const cwd = String(input['cwd'] ?? process.cwd());
    const name = String(input['name'] ?? '');
    const url = String(input['url'] ?? '');
    const newName = String(input['newName'] ?? '');
    const lines: string[] = [`Repo: \`${cwd}\``];
    switch (op) {
      case 'add':     lines.push(`Add remote \`${name}\` -> \`${url}\`.`); break;
      case 'remove':  lines.push(`Remove remote \`${name}\` (does NOT delete the remote server).`); break;
      case 'set-url': lines.push(`Set URL for remote \`${name}\` to \`${url}\`${input['push'] === true ? ' (push only)' : ''}.`); break;
      case 'rename':  lines.push(`Rename remote \`${name}\` to \`${newName}\`.`); break;
    }
    return {
      title: `git:remote ${op}`,
      content: lines.join('\n'),
      actions: [ { name: 'approve', label: 'Approve' }, { name: 'skip', label: 'Skip' } ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const op = (str(input, 'op') ?? 'list') as GitRemoteOp;

    if (op === 'list') {
      const r = await runShell(['git', 'remote', '-v'], { cwd, timeoutMs: 10_000 });
      if (r.spawnError) { return spawnFail('git_remote', r.stderr); }
      if (r.code !== 0) { return fail('git_remote', r); }
      const remotes = parseRemotes(r.stdout);
      const body = remotes.length === 0
        ? '_No remotes configured._'
        : `# Remotes\n\n| Name | Fetch | Push |\n|------|-------|------|\n` +
          remotes.map(re => `| \`${re.name}\` | \`${re.fetchUrl}\` | \`${re.pushUrl}\` |`).join('\n');
      return { output: body, format: 'markdown', success: true, data: { op, remotes } satisfies GitRemoteData };
    }

    const name = str(input, 'name');
    if (!name) { return rejectInput('git_remote', `missing name for ${op}`); }
    assertSafeArg(name, 'ref');
    for (const key of ['url', 'newName']) { const v = str(input, key); if (v !== undefined) { assertSafeArg(v, 'ref'); } }

    let argv: string[];
    if (op === 'add') {
      const url = str(input, 'url');
      if (!url) { return rejectInput('git_remote', 'add requires url'); }
      argv = ['git', 'remote', 'add', name, url];
    } else if (op === 'remove') {
      argv = ['git', 'remote', 'remove', name];
    } else if (op === 'set-url') {
      const url = str(input, 'url');
      if (!url) { return rejectInput('git_remote', 'set-url requires url'); }
      argv = ['git', 'remote', 'set-url'];
      if (input['push'] === true) { argv.push('--push'); }
      argv.push(name, url);
    } else {
      // rename
      const newName = str(input, 'newName');
      if (!newName) { return rejectInput('git_remote', 'rename requires newName'); }
      argv = ['git', 'remote', 'rename', name, newName];
    }

    const r = await runShell(argv, { cwd, timeoutMs: 10_000 });
    if (r.spawnError) { return spawnFail('git_remote', r.stderr); }
    if (r.code !== 0) { return fail('git_remote', r, { mutating: true }); }

    const data: GitRemoteData = { op, name };
    if (op === 'add' || op === 'set-url') {
      const u = str(input, 'url');
      if (u !== undefined) { data.url = u; }
    }
    if (op === 'rename') {
      const n = str(input, 'newName');
      if (n !== undefined) { data.newName = n; }
    }
    return { output: `git remote ${op} \`${name}\` OK.`, format: 'markdown', success: true, data };
  },
} satisfies TypedTool;

function parseRemotes(raw: string): GitRemoteEntry[] {
  const map = new Map<string, GitRemoteEntry>();
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) { continue; }
    const match = trimmed.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!match) { continue; }
    const [, name, url, kind] = match;
    if (!name || !url || !kind) { continue; }
    const entry = map.get(name) ?? { name, fetchUrl: '', pushUrl: '' };
    if (kind === 'fetch') { entry.fetchUrl = url; }
    else { entry.pushUrl = url; }
    map.set(name, entry);
  }
  return Array.from(map.values());
}

/**
 * git:tag -- list / create / delete tags.
 */

import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { ApprovalClass, Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, assertSafeArg, fail, spawnFail, rejectInput } from './helpers.js';
import { GitTagDataSchema } from './schemas.js';
import type { GitTagData, GitTagEntry } from './schemas.js';

export type GitTagOp = 'list' | 'create' | 'delete';

export type { GitTagData, GitTagEntry } from './schemas.js';

export const gitTagTool: Tool = {
  id: 'git_tag',
  description: 'List / create / delete tags. list is read-only; create and delete gate.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    op: Type.String({ enum: ['list', 'create', 'delete'] }),
    name: Type.Optional(Type.String({ description: 'Tag name (create / delete).' })),
    ref: Type.Optional(Type.String({ description: 'Commit to tag (create). Default HEAD.' })),
    message: Type.Optional(Type.String({ description: 'Annotated-tag message. Omit for a lightweight tag.' })),
    pattern: Type.Optional(Type.String({ description: 'For list: glob pattern (e.g. "v*").' })),
  }, { additionalProperties: false }),
  outputSchema: GitTagDataSchema,

  // list is a read; delete removes a tag name; create is an ordinary mutation.
  approval(input: ToolInput): ApprovalClass {
    return input['op'] === 'delete' ? 'destructive' : input['op'] !== 'list' ? 'common' : 'none';
  },

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const op = String(input['op'] ?? 'list');
    const cwd = String(input['cwd'] ?? process.cwd());
    const name = String(input['name'] ?? '');
    const ref = String(input['ref'] ?? 'HEAD');
    const msg = str(input, 'message');
    const lines: string[] = [`Repo: \`${cwd}\``];
    if (op === 'create') {
      lines.push(msg ? `Create annotated tag \`${name}\` at \`${ref}\`.` : `Create lightweight tag \`${name}\` at \`${ref}\`.`);
      if (msg) { lines.push('', '**Message**', '```', msg, '```'); }
    } else {
      lines.push(`Delete tag \`${name}\`.`);
    }
    return {
      title: `git:tag ${op}`,
      content: lines.join('\n'),
      actions: [ { name: 'approve', label: 'Approve' }, { name: 'skip', label: 'Skip' } ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const op = (str(input, 'op') ?? 'list') as GitTagOp;

    if (op === 'list') {
      const pattern = str(input, 'pattern');
      if (pattern !== undefined) { assertSafeArg(pattern, 'ref'); }
      const argv = [
        'git', 'tag', '--list',
        '--format=%(refname:short)%09%(objectname:short)%09%(contents:subject)',
      ];
      if (pattern) { argv.push(pattern); }
      const r = await runShell(argv, { cwd, timeoutMs: 10_000 });
      if (r.spawnError) { return spawnFail('git_tag', r.stderr); }
      if (r.code !== 0) { return fail('git_tag', r); }
      const tags: GitTagEntry[] = [];
      for (const line of r.stdout.split('\n')) {
        if (!line.trim()) { continue; }
        const [name, short, ...subj] = line.split('\t');
        tags.push({ name: (name ?? '').trim(), shortSha: (short ?? '').trim(), subject: subj.join('\t').trim() });
      }
      const body = tags.length === 0
        ? '_No tags._'
        : `# Tags${pattern ? ` -- matching \`${pattern}\`` : ''}\n\n| Name | Tip | Subject |\n|------|-----|---------|\n` +
          tags.map(t => `| \`${t.name}\` | \`${t.shortSha}\` | ${t.subject.replace(/\|/g, '\\|')} |`).join('\n');
      const data: GitTagData = { op, tags };
      return { output: body, format: 'markdown', success: true, data };
    }

    const name = str(input, 'name');
    if (!name) { return rejectInput('git_tag', `missing name for ${op}`); }
    assertSafeArg(name, 'ref');

    if (op === 'create') {
      const ref = str(input, 'ref') ?? 'HEAD';
      assertSafeArg(ref, 'ref');
      const msg = str(input, 'message');
      const argv = ['git', 'tag'];
      if (msg) { argv.push('-a', '-m', msg); }
      argv.push(name, ref);
      const r = await runShell(argv, { cwd, timeoutMs: 15_000 });
      if (r.spawnError) { return spawnFail('git_tag', r.stderr); }
      if (r.code !== 0) { return fail('git_tag', r, { mutating: true }); }
      return { output: `Created tag \`${name}\` at \`${ref}\`.`, format: 'markdown', success: true, data: { op, target: name } satisfies GitTagData };
    }

    // delete
    const r = await runShell(['git', 'tag', '-d', name], { cwd, timeoutMs: 10_000 });
    if (r.spawnError) { return spawnFail('git_tag', r.stderr); }
    if (r.code !== 0) { return fail('git_tag', r, { mutating: true }); }
    return { output: `Deleted tag \`${name}\`.`, format: 'markdown', success: true, data: { op, target: name } satisfies GitTagData };
  },
};

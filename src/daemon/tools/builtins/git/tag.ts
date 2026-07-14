/**
 * git:tag -- list / create / delete tags.
 */

import { runShell } from '../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, fail, spawnFail } from './helpers.js';

export type GitTagOp = 'list' | 'create' | 'delete';

export interface GitTagEntry {
  name: string;
  /** Annotated tag subject if present, or commit subject. */
  subject: string;
  shortSha: string;
}

export interface GitTagData {
  op: GitTagOp;
  tags?: GitTagEntry[];
  target?: string;
}

export const gitTagTool: Tool = {
  id: 'git_tag',
  description: 'List / create / delete tags. list is read-only; create and delete gate.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      op:  { type: 'string', enum: ['list', 'create', 'delete'] },
      name: { type: 'string', description: 'Tag name (create / delete).' },
      ref:  { type: 'string', description: 'Commit to tag (create). Default HEAD.' },
      message: { type: 'string', description: 'Annotated-tag message. Omit for a lightweight tag.' },
      pattern: { type: 'string', description: 'For list: glob pattern (e.g. "v*").' },
    },
    required: ['op'],
    additionalProperties: false,
  },

  requiresApproval(input: ToolInput): boolean {
    return input['op'] !== 'list';
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
      const argv = [
        'git', 'tag', '--list',
        '--format=%(refname:short)%09%(objectname:short)%09%(contents:subject)',
      ];
      if (pattern) { argv.push(pattern); }
      const r = await runShell(argv, { cwd, timeoutMs: 10_000 });
      if (r.spawnError) { return spawnFail('git_tag', r.stderr); }
      if (r.code !== 0) { return fail('git_tag', r.stderr, r.stdout, r.code); }
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
    if (!name) { return fail('git_tag', `missing name for ${op}`, '', 1); }

    if (op === 'create') {
      const ref = str(input, 'ref') ?? 'HEAD';
      const msg = str(input, 'message');
      const argv = ['git', 'tag'];
      if (msg) { argv.push('-a', '-m', msg); }
      argv.push(name, ref);
      const r = await runShell(argv, { cwd, timeoutMs: 15_000 });
      if (r.spawnError) { return spawnFail('git_tag', r.stderr); }
      if (r.code !== 0) { return fail('git_tag', r.stderr, r.stdout, r.code); }
      return { output: `Created tag \`${name}\` at \`${ref}\`.`, format: 'markdown', success: true, data: { op, target: name } satisfies GitTagData };
    }

    // delete
    const r = await runShell(['git', 'tag', '-d', name], { cwd, timeoutMs: 10_000 });
    if (r.spawnError) { return spawnFail('git_tag', r.stderr); }
    if (r.code !== 0) { return fail('git_tag', r.stderr, r.stdout, r.code); }
    return { output: `Deleted tag \`${name}\`.`, format: 'markdown', success: true, data: { op, target: name } satisfies GitTagData };
  },
};

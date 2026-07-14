/**
 * git:stash -- multi-op helper for the stash stack.
 *
 * Ops:
 *   list                   -- show stash entries (no approval)
 *   push   (default)       -- stash current changes
 *   pop                    -- apply and drop top stash
 *   apply                  -- apply without dropping
 *   drop                   -- remove an entry
 *   clear                  -- drop everything (gated loud)
 *   show   <ref>           -- show contents (no approval)
 */

import { runShell } from '../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, fail, spawnFail } from './helpers.js';

export type GitStashOp = 'list' | 'push' | 'pop' | 'apply' | 'drop' | 'clear' | 'show';

export interface GitStashEntry {
  ref: string;
  branch: string;
  message: string;
}

export interface GitStashData {
  op: GitStashOp;
  entries?: GitStashEntry[];
  affectedRef?: string;
  output: string;
}

export const gitStashTool: Tool = {
  id: 'git_stash',
  description: 'Manage the stash stack. list / show are read-only; push / pop / apply / drop / clear gate.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      op: { type: 'string', enum: ['list', 'push', 'pop', 'apply', 'drop', 'clear', 'show'] },
      message: { type: 'string', description: 'For op=push: stash message.' },
      ref: { type: 'string', description: 'For op=pop/apply/drop/show: stash ref (default stash@{0}).' },
      includeUntracked: { type: 'boolean', description: 'For op=push: include untracked files (-u).' },
      keepIndex: { type: 'boolean', description: 'For op=push: preserve staged changes (--keep-index).' },
    },
    additionalProperties: false,
  },

  requiresApproval(input: ToolInput): boolean {
    const op = input['op'];
    return op !== 'list' && op !== 'show';
  },

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const cwd = String(input['cwd'] ?? process.cwd());
    const op = String(input['op'] ?? 'push');
    const ref = str(input, 'ref') ?? 'stash@{0}';
    const message = str(input, 'message');
    const lines: string[] = [`Repo: \`${cwd}\``];
    switch (op) {
      case 'push':  lines.push(`Stash current changes${message ? ` -- message: "${message}"` : ''}.`); break;
      case 'pop':   lines.push(`Apply and drop \`${ref}\`.`); break;
      case 'apply': lines.push(`Apply \`${ref}\` (kept on the stash stack).`); break;
      case 'drop':  lines.push(`Drop \`${ref}\` from the stash stack.`); break;
      case 'clear': lines.push('**Clear the entire stash stack.** All entries are discarded.'); break;
    }
    return {
      title: op === 'clear' ? 'git:stash clear (destructive)' : `git:stash ${op}`,
      content: lines.join('\n'),
      actions: [ { name: 'approve', label: 'Approve' }, { name: 'skip', label: 'Skip' } ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const op = (str(input, 'op') ?? 'push') as GitStashOp;

    if (op === 'list') {
      const r = await runShell(['git', 'stash', 'list', '--pretty=%gd\t%gs'], { cwd, timeoutMs: 10_000 });
      if (r.spawnError) { return spawnFail('git_stash', r.stderr); }
      if (r.code !== 0) { return fail('git_stash', r.stderr, r.stdout, r.code); }
      const entries: GitStashEntry[] = [];
      for (const line of r.stdout.split('\n')) {
        if (!line.trim()) { continue; }
        const [ref, ...msgParts] = line.split('\t');
        const msg = msgParts.join('\t');
        const match = msg.match(/^(?:WIP )?on ([^:]+):\s*(.*)$/);
        entries.push({
          ref: (ref ?? '').trim(),
          branch: match ? match[1]!.trim() : '',
          message: match ? match[2]!.trim() : msg.trim(),
        });
      }
      const body = entries.length === 0
        ? '_Stash stack is empty._'
        : `# Stash stack\n\n| Ref | Branch | Message |\n|-----|--------|---------|\n` + entries.map(e => `| \`${e.ref}\` | ${e.branch} | ${e.message} |`).join('\n');
      const data: GitStashData = { op, entries, output: r.stdout.trim() };
      return { output: body, format: 'markdown', success: true, data };
    }

    if (op === 'show') {
      const ref = str(input, 'ref') ?? 'stash@{0}';
      const r = await runShell(['git', 'stash', 'show', '-p', '--no-color', ref], { cwd, timeoutMs: 15_000, maxBytes: 512 * 1024 });
      if (r.spawnError) { return spawnFail('git_stash', r.stderr); }
      if (r.code !== 0) { return fail('git_stash', r.stderr, r.stdout, r.code); }
      const data: GitStashData = { op, affectedRef: ref, output: r.stdout };
      return { output: `# \`${ref}\`\n\n\`\`\`diff\n${r.stdout.trim()}\n\`\`\``, format: 'markdown', success: true, data };
    }

    const argv = ['git', 'stash', op];
    if (op === 'push') {
      if (input['includeUntracked'] === true) { argv.push('-u'); }
      if (input['keepIndex'] === true) { argv.push('--keep-index'); }
      const message = str(input, 'message');
      if (message) { argv.push('-m', message); }
    } else if (op === 'pop' || op === 'apply' || op === 'drop') {
      const ref = str(input, 'ref');
      if (ref) { argv.push(ref); }
    }

    const r = await runShell(argv, { cwd, timeoutMs: 30_000 });
    if (r.spawnError) { return spawnFail('git_stash', r.stderr); }
    if (r.code !== 0) { return fail('git_stash', r.stderr, r.stdout, r.code); }
    const data: GitStashData = { op, output: r.stdout.trim() || r.stderr.trim() };
    const ref = str(input, 'ref');
    if (ref !== undefined) { data.affectedRef = ref; }
    return {
      output: `git stash ${op} OK.\n\n\`\`\`\n${data.output || '(no output)'}\n\`\`\``,
      format: 'markdown', success: true, data,
    };
  },
};

/**
 * git:worktree -- list / add / remove / move worktrees.
 */

import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { ApprovalClass, Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, assertSafeArg, fail, spawnFail, rejectInput } from './helpers.js';
import { GitWorktreeDataSchema } from './schemas.js';
import type { GitWorktreeData, GitWorktreeEntry } from './schemas.js';

export type GitWorktreeOp = 'list' | 'add' | 'remove' | 'move' | 'prune';

export type { GitWorktreeData, GitWorktreeEntry } from './schemas.js';

export const gitWorktreeTool: Tool = {
  id: 'git_worktree',
  description: 'Manage git worktrees. list is read-only; add / remove / move / prune gate.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    op: Type.String({ enum: ['list', 'add', 'remove', 'move', 'prune'] }),
    path: Type.Optional(Type.String({ description: 'Worktree path (add / remove / move source).' })),
    branch: Type.Optional(Type.String({ description: 'For add: branch to check out (or create).' })),
    createBranch: Type.Optional(Type.Boolean({ description: 'For add: create the branch (-b).' })),
    detach: Type.Optional(Type.Boolean({ description: 'For add: detach HEAD instead of checking out a branch.' })),
    force: Type.Optional(Type.Boolean({ description: 'For remove / prune: -f.' })),
    newPath: Type.Optional(Type.String({ description: 'For move.' })),
  }, { additionalProperties: false }),
  outputSchema: GitWorktreeDataSchema,

  // list is a read; a forced remove discards a worktree with uncommitted work; the other mutations are ordinary.
  approval(input: ToolInput): ApprovalClass {
    if (input['op'] === 'list') { return 'none'; }
    return input['op'] === 'remove' && input['force'] === true ? 'destructive' : 'common';
  },

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const op = String(input['op'] ?? 'list');
    const cwd = String(input['cwd'] ?? process.cwd());
    const path = String(input['path'] ?? '');
    const lines: string[] = [`Repo: \`${cwd}\``];
    switch (op) {
      case 'add': {
        const branch = String(input['branch'] ?? '(none)');
        const create = input['createBranch'] === true;
        const detach = input['detach'] === true;
        lines.push(`Add worktree \`${path}\` -> ${detach ? 'detached HEAD' : create ? `new branch \`${branch}\`` : `branch \`${branch}\``}.`);
        break;
      }
      case 'remove': lines.push(`Remove worktree \`${path}\`${input['force'] === true ? ' (forced)' : ''}.`); break;
      case 'move':   lines.push(`Move worktree \`${path}\` -> \`${String(input['newPath'] ?? '')}\`.`); break;
      case 'prune':  lines.push(`Prune stale worktree administrative records${input['force'] === true ? ' (forced)' : ''}.`); break;
    }
    return {
      title: `git:worktree ${op}`,
      content: lines.join('\n'),
      actions: [ { name: 'approve', label: 'Approve' }, { name: 'skip', label: 'Skip' } ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const op = (str(input, 'op') ?? 'list') as GitWorktreeOp;

    if (op === 'list') {
      const r = await runShell(['git', 'worktree', 'list', '--porcelain'], { cwd, timeoutMs: 10_000 });
      if (r.spawnError) { return spawnFail('git_worktree', r.stderr); }
      if (r.code !== 0) { return fail('git_worktree', r); }
      const worktrees = parseList(r.stdout);
      const body = worktrees.length === 0
        ? '_No worktrees (this shouldn\'t happen -- at least the main worktree should be listed)._'
        : `# Worktrees\n\n| Path | Branch | HEAD | Flags |\n|------|--------|------|-------|\n` +
          worktrees.map(w => {
            const flags: string[] = [];
            if (w.detached) { flags.push('detached'); }
            if (w.locked)   { flags.push('locked'); }
            if (w.prunable) { flags.push('prunable'); }
            return `| \`${w.path}\` | ${w.branch ? `\`${w.branch}\`` : '—'} | \`${w.head}\` | ${flags.join(', ') || '—'} |`;
          }).join('\n');
      return { output: body, format: 'markdown', success: true, data: { op, worktrees } satisfies GitWorktreeData };
    }

    const path = str(input, 'path');
    if (op === 'add') {
      if (!path) { return rejectInput('git_worktree', 'add requires path'); }
      const branch = str(input, 'branch');
      assertSafeArg(path, 'path');
      if (branch !== undefined) { assertSafeArg(branch, 'ref'); }
      const argv = ['git', 'worktree', 'add'];
      if (input['detach'] === true) { argv.push('--detach'); }
      else if (input['createBranch'] === true && branch) { argv.push('-b', branch); }
      argv.push('--', path);
      if (branch && input['createBranch'] !== true && input['detach'] !== true) {
        argv.push(branch);
      }
      const r = await runShell(argv, { cwd, timeoutMs: 60_000 });
      if (r.spawnError) { return spawnFail('git_worktree', r.stderr); }
      if (r.code !== 0) { return fail('git_worktree', r, { mutating: true }); }
      return { output: `Added worktree \`${path}\`.`, format: 'markdown', success: true, data: { op, path, ...(branch ? { branch } : {}) } satisfies GitWorktreeData };
    }

    if (op === 'remove') {
      if (!path) { return rejectInput('git_worktree', 'remove requires path'); }
      const argv = ['git', 'worktree', 'remove'];
      if (input['force'] === true) { argv.push('-f'); }
      assertSafeArg(path, 'path');
      argv.push('--', path);
      const r = await runShell(argv, { cwd, timeoutMs: 30_000 });
      if (r.spawnError) { return spawnFail('git_worktree', r.stderr); }
      if (r.code !== 0) { return fail('git_worktree', r, { mutating: true }); }
      return { output: `Removed worktree \`${path}\`.`, format: 'markdown', success: true, data: { op, path } satisfies GitWorktreeData };
    }

    if (op === 'move') {
      const newPath = str(input, 'newPath');
      if (!path || !newPath) { return rejectInput('git_worktree', 'move requires path + newPath'); }
      assertSafeArg(path, 'path'); assertSafeArg(newPath, 'path');
      const r = await runShell(['git', 'worktree', 'move', '--', path, newPath], { cwd, timeoutMs: 30_000 });
      if (r.spawnError) { return spawnFail('git_worktree', r.stderr); }
      if (r.code !== 0) { return fail('git_worktree', r, { mutating: true }); }
      return { output: `Moved worktree \`${path}\` -> \`${newPath}\`.`, format: 'markdown', success: true, data: { op, path, newPath } satisfies GitWorktreeData };
    }

    // prune
    const argv = ['git', 'worktree', 'prune', '-v'];
    if (input['force'] === true) { argv.push('--expire=1.second.ago'); }
    const r = await runShell(argv, { cwd, timeoutMs: 15_000 });
    if (r.spawnError) { return spawnFail('git_worktree', r.stderr); }
    if (r.code !== 0) { return fail('git_worktree', r, { mutating: true }); }
    return {
      output: `Pruned stale worktree records.\n\n\`\`\`\n${r.stdout.trim() || '(nothing to prune)'}\n\`\`\``,
      format: 'markdown',
      success: true,
      data: { op } satisfies GitWorktreeData,
    };
  },
};

// Parse `git worktree list --porcelain`: stanzas separated by blank lines
// with key-value prefixes (worktree <path>, HEAD <sha>, branch <ref>,
// detached, locked, prunable).
function parseList(raw: string): GitWorktreeEntry[] {
  const out: GitWorktreeEntry[] = [];
  const stanzas = raw.split(/\n\n+/);
  for (const stanza of stanzas) {
    if (!stanza.trim()) { continue; }
    const entry: GitWorktreeEntry = { path: '', head: '', detached: false, locked: false, prunable: false };
    for (const line of stanza.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) { continue; }
      if (trimmed.startsWith('worktree ')) { entry.path = trimmed.slice('worktree '.length); }
      else if (trimmed.startsWith('HEAD '))   { entry.head = trimmed.slice('HEAD '.length); }
      else if (trimmed.startsWith('branch ')) { entry.branch = trimmed.slice('branch '.length).replace(/^refs\/heads\//, ''); }
      else if (trimmed === 'detached') { entry.detached = true; }
      else if (trimmed.startsWith('locked')) { entry.locked = true; }
      else if (trimmed.startsWith('prunable')) { entry.prunable = true; }
    }
    if (entry.path) { out.push(entry); }
  }
  return out;
}

/**
 * git:branch -- list / create / switch / delete branches.
 *
 * Multi-mode tool: the `op` input selects the action. Listing is
 * read-only and ungated; create / switch / delete gate with an
 * appropriate preview in the approval content.
 *
 * Delete uses -d by default (refuses to delete unmerged branches);
 * callers can pass force:true to use -D, but the gate content makes
 * the destruction explicit.
 */

import type { TypedTool } from '../../call-tool.js';
import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { ApprovalClass, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { assertSafeArg, fail, failureKind, ranToExit, spawnFail, rejectInput } from './helpers.js';
import { GitBranchDataSchema } from './schemas.js';
import type { GitBranchData, GitBranchEntry } from './schemas.js';

export type GitBranchOp = 'list' | 'create' | 'switch' | 'delete';

export type { GitBranchData, GitBranchEntry } from './schemas.js';

export const gitBranchTool = {
  id: 'git_branch',
  description: 'List / create / switch / delete branches. op=list is read-only; others gate.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root. Defaults to process cwd.' })),
    op: Type.String({ enum: ['list', 'create', 'switch', 'delete'], description: 'Operation to perform.' }),
    name: Type.Optional(Type.String({ description: 'Branch name (required for create / switch / delete).' })),
    startPoint: Type.Optional(Type.String({ description: 'Start point for create (commit / branch / tag). Default HEAD.' })),
    remote: Type.Optional(Type.Boolean({ description: 'For list: also list remote branches.' })),
    force: Type.Optional(Type.Boolean({ description: 'For delete: use -D to remove unmerged branches. Use with care.' })),
    track: Type.Optional(Type.Boolean({ description: 'For create: set upstream to startPoint (implies --track).' })),
  }, { additionalProperties: false }),
  outputSchema: GitBranchDataSchema,

  // list is a read; delete (forced or not) removes a branch name; create and switch are ordinary mutations.
  approval(input: ToolInput): ApprovalClass {
    return input['op'] === 'delete' ? 'destructive' : input['op'] !== 'list' ? 'common' : 'none';
  },

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const op = String(input['op'] ?? 'list');
    const name = String(input['name'] ?? '');
    const cwd = String(input['cwd'] ?? process.cwd());
    const force = input['force'] === true;

    let title = `git:branch ${op}`;
    const lines: string[] = [];
    lines.push(`Repo: \`${cwd}\``);

    if (op === 'create') {
      const start = String(input['startPoint'] ?? 'HEAD');
      const track = input['track'] === true ? ' (tracking)' : '';
      lines.push(`Create branch **${name}** from \`${start}\`${track}.`);
    } else if (op === 'switch') {
      lines.push(`Switch HEAD to **${name}** (any uncommitted changes must be clean).`);
    } else if (op === 'delete') {
      title = force ? 'git:branch delete (FORCE)' : 'git:branch delete';
      lines.push(
        force
          ? `**Force-delete** branch \`${name}\` even if unmerged. Unmerged work will be lost unless the SHA is reachable elsewhere.`
          : `Delete branch \`${name}\`. Git will refuse if unmerged; re-run with \`force: true\` to override.`,
      );
    }

    return {
      title,
      content: lines.join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const op = (str(input, 'op') ?? 'list') as GitBranchOp;

    switch (op) {
      case 'list':   return listBranches(cwd, input['remote'] === true);
      case 'create': return createBranch(cwd, input);
      case 'switch': return switchBranch(cwd, input);
      case 'delete': return deleteBranch(cwd, input);
    }
  },
} satisfies TypedTool;

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

async function listBranches(cwd: string, includeRemote: boolean): Promise<ToolResult> {
  const argv = [
    'git', 'branch',
    '--no-color',
    `--format=%(HEAD)%(refname:short)%09%(upstream:short)%09%(objectname:short)%09%(subject)`,
  ];
  if (includeRemote) { argv.push('-a'); }
  const result = await runShell(argv, { cwd, timeoutMs: 10_000 });
  if (result.spawnError) { return spawnFail('git_branch', result.stderr); }
  if (result.code !== 0) { return fail('git_branch', result); }

  const branches: GitBranchEntry[] = [];
  for (const line of result.stdout.split('\n')) {
    if (!line) { continue; }
    const first = line[0] ?? ' ';
    const current = first === '*';
    const rest = line.slice(1);
    const [name, upstream, shortSha, ...subjectParts] = rest.split('\t');
    if (!name) { continue; }
    branches.push({
      name: name.trim(),
      current,
      ...(upstream ? { upstream: upstream.trim() } : {}),
      shortSha: (shortSha ?? '').trim(),
      subject: subjectParts.join('\t').trim(),
    });
  }

  const data: GitBranchData = { op: 'list', branches };
  return { output: renderList(data, cwd), format: 'markdown', success: true, data };
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

async function createBranch(cwd: string, input: ToolInput): Promise<ToolResult> {
  const name = str(input, 'name');
  if (!name) { return rejectInput('git_branch', 'missing name for create'); }
  const startPoint = str(input, 'startPoint');
  assertSafeArg(name, 'ref');
  if (startPoint !== undefined) { assertSafeArg(startPoint, 'ref'); }
  const track = input['track'] === true;

  const argv = ['git', 'branch'];
  if (track) { argv.push('--track'); }
  argv.push(name);
  if (startPoint) { argv.push(startPoint); }

  const result = await runShell(argv, { cwd, timeoutMs: 10_000 });
  if (result.spawnError) { return spawnFail('git_branch', result.stderr); }
  if (result.code !== 0) { return fail('git_branch', result, { mutating: true }); }

  const data: GitBranchData = { op: 'create', target: name };
  return {
    output: `Created branch **${name}**${startPoint ? ` from \`${startPoint}\`` : ''}.`,
    format: 'markdown',
    success: true,
    data,
  };
}

// ---------------------------------------------------------------------------
// switch
// ---------------------------------------------------------------------------

async function switchBranch(cwd: string, input: ToolInput): Promise<ToolResult> {
  const name = str(input, 'name');
  if (!name) { return rejectInput('git_branch', 'missing name for switch'); }
  assertSafeArg(name, 'ref');

  // Capture previous branch for audit trail: it only adds detail, so a read that fails is a warning.
  const head = await runShell(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd, timeoutMs: 5_000 });
  const headOk = ranToExit(head) && head.code === 0;
  const previous = headOk ? head.stdout.trim() : undefined;

  const result = await runShell(['git', 'switch', name], { cwd, timeoutMs: 10_000 });
  if (result.spawnError) { return spawnFail('git_branch', result.stderr); }
  if (result.code !== 0) { return fail('git_branch', result, { mutating: true }); }

  const data: GitBranchData = {
    op: 'switch', target: name, ...(previous ? { previous } : {}),
    ...(headOk ? {} : { warnings: [`git rev-parse --abbrev-ref HEAD ${failureKind(head)}: the previous branch is unknown`] }),
  };
  return {
    output: previous
      ? `Switched from **${previous}** to **${name}**.`
      : `Switched to **${name}**.`,
    format: 'markdown',
    success: true,
    data,
  };
}

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

async function deleteBranch(cwd: string, input: ToolInput): Promise<ToolResult> {
  const name = str(input, 'name');
  if (!name) { return rejectInput('git_branch', 'missing name for delete'); }
  assertSafeArg(name, 'ref');
  const force = input['force'] === true;

  const argv = ['git', 'branch', force ? '-D' : '-d', name];
  const result = await runShell(argv, { cwd, timeoutMs: 10_000 });
  if (result.spawnError) { return spawnFail('git_branch', result.stderr); }
  if (result.code !== 0) { return fail('git_branch', result, { mutating: true }); }

  const data: GitBranchData = { op: 'delete', target: name };
  return {
    output: `Deleted branch \`${name}\`${force ? ' (forced)' : ''}.`,
    format: 'markdown',
    success: true,
    data,
  };
}

// ---------------------------------------------------------------------------
// Rendering + helpers
// ---------------------------------------------------------------------------

function renderList(data: GitBranchData, cwd: string): string {
  const lines: string[] = [];
  lines.push(`# git branches -- \`${cwd}\``);
  lines.push('');
  const branches = data.branches ?? [];
  if (branches.length === 0) {
    lines.push('_No branches found._');
    return lines.join('\n');
  }
  lines.push('| HEAD | Branch | Upstream | Tip | Subject |');
  lines.push('|------|--------|----------|-----|---------|');
  for (const b of branches) {
    lines.push(`| ${b.current ? '*' : ' '} | \`${b.name}\` | ${b.upstream ? `\`${b.upstream}\`` : '—'} | \`${b.shortSha}\` | ${escape(b.subject)} |`);
  }
  return lines.join('\n').trimEnd();
}

function str(input: ToolInput, key: string): string | undefined {
  const v = input[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function escape(s: string): string {
  return s.replace(/\|/g, '\\|');
}

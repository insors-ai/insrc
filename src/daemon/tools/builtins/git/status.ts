/**
 * git:status -- working tree status (no approval, read-only).
 *
 * Returns both a rendered markdown summary (for humans reading in chat)
 * and a structured data payload (for agents deciding what to do next).
 * Paths with special characters are handled via `git status -z` so
 * spaces / unicode / \n in filenames don't confuse the parser.
 */

import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import type { Tool, ToolInput, ToolResult } from '../../types.js';
import { fail, spawnFail } from './helpers.js';
import { parseOutput, parseStatusV2 } from './parsers.js';
import { GitStatusDataSchema } from './schemas.js';
import type { GitStatusData } from './schemas.js';

export type { GitStatusData, GitStatusEntry } from './schemas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export const gitStatusTool: Tool = {
  id: 'git_status',
  description: 'Show working tree status -- staged, unstaged, untracked, and conflicted paths.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({
      description: 'Repository root to run status in. Defaults to the daemon\'s current working directory.',
    })),
  }, { additionalProperties: false }),
  outputSchema: GitStatusDataSchema,

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = typeof input['cwd'] === 'string' && input['cwd'].length > 0
      ? input['cwd']
      : process.cwd();

    const result = await runShell(
      ['git', 'status', '--porcelain=v2', '--branch', '--null'],
      { cwd, timeoutMs: 15_000 },
    );

    if (result.spawnError) {
      return spawnFail('git:status', result.stderr);
    }

    // `git status` returns 0 even when there are changes. A non-zero code
    // means we're outside a repo or the command itself failed.
    if (result.code !== 0) {
      return fail('git:status', result);
    }

    const parsedRead = parseOutput('git:status', result, parseStatusV2);
    if (!parsedRead.ok) { return parsedRead.failure; }
    const parsed = parsedRead.value;
    const report = renderReport(parsed, cwd);

    return {
      output: report,
      format: 'markdown',
      success: true,
      data: parsed,
    };
  },
};

// ---------------------------------------------------------------------------
// Report rendering
// ---------------------------------------------------------------------------

const CODE_LABEL: Record<string, string> = {
  M: 'modified', A: 'added', D: 'deleted', R: 'renamed',
  C: 'copied', T: 'type-change', U: 'updated',
};

function label(code: string): string {
  return CODE_LABEL[code] ?? code;
}

function renderReport(d: GitStatusData, cwd: string): string {
  const lines: string[] = [];
  lines.push(`# git status -- ${cwd}`);
  lines.push('');

  const headerParts: string[] = [`Branch: **${d.branch}**`];
  if (d.upstream) {
    const ahead = d.ahead ?? 0;
    const behind = d.behind ?? 0;
    const track: string[] = [];
    if (ahead > 0) { track.push(`ahead ${ahead}`); }
    if (behind > 0) { track.push(`behind ${behind}`); }
    const trackStr = track.length > 0 ? ` (${track.join(', ')})` : '';
    headerParts.push(`tracking \`${d.upstream}\`${trackStr}`);
  }
  lines.push(headerParts.join(' -- '));
  lines.push('');

  if (d.clean) {
    lines.push('_Working tree clean._');
    return lines.join('\n');
  }

  if (d.conflicts.length > 0) {
    lines.push(`## Conflicts (${d.conflicts.length})`);
    lines.push('');
    for (const e of d.conflicts) {
      lines.push(`- \`${e.path}\``);
    }
    lines.push('');
  }

  if (d.staged.length > 0) {
    lines.push(`## Staged (${d.staged.length})`);
    lines.push('');
    for (const e of d.staged) {
      const from = e.origPath ? ` (from \`${e.origPath}\`)` : '';
      lines.push(`- ${label(e.code)}: \`${e.path}\`${from}`);
    }
    lines.push('');
  }

  if (d.unstaged.length > 0) {
    lines.push(`## Unstaged (${d.unstaged.length})`);
    lines.push('');
    for (const e of d.unstaged) {
      lines.push(`- ${label(e.code)}: \`${e.path}\``);
    }
    lines.push('');
  }

  if (d.untracked.length > 0) {
    lines.push(`## Untracked (${d.untracked.length})`);
    lines.push('');
    for (const p of d.untracked) {
      lines.push(`- \`${p}\``);
    }
  }

  return lines.join('\n').trimEnd();
}

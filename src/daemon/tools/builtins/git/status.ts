/**
 * git:status -- working tree status (no approval, read-only).
 *
 * Returns both a rendered markdown summary (for humans reading in chat)
 * and a structured data payload (for agents deciding what to do next).
 * Paths with special characters are handled via `git status -z` so
 * spaces / unicode / \n in filenames don't confuse the parser.
 */

import { runShell } from '../../shell-helper.js';
import type { Tool, ToolInput, ToolResult } from '../../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitStatusData {
  clean: boolean;
  branch: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  staged: GitStatusEntry[];
  unstaged: GitStatusEntry[];
  untracked: string[];
  conflicts: GitStatusEntry[];
}

export interface GitStatusEntry {
  path: string;
  /** For rename / copy operations, the original path. */
  origPath?: string | undefined;
  /** Git porcelain status letter for this side (M / A / D / R / C / U / ?). */
  code: string;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export const gitStatusTool: Tool = {
  id: 'git_status',
  description: 'Show working tree status -- staged, unstaged, untracked, and conflicted paths.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: {
        type: 'string',
        description: 'Repository root to run status in. Defaults to the daemon\'s current working directory.',
      },
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = typeof input['cwd'] === 'string' && input['cwd'].length > 0
      ? input['cwd']
      : process.cwd();

    const result = await runShell(
      ['git', 'status', '--porcelain=v2', '--branch', '--null'],
      { cwd, timeoutMs: 15_000 },
    );

    if (result.spawnError) {
      return {
        output: `[git:status] cannot spawn git -- ${result.stderr.trim() || 'unknown error'}`,
        format: 'text',
        success: false,
        error: 'git not found',
      };
    }

    // `git status` returns 0 even when there are changes. A non-zero code
    // means we're outside a repo or the command itself failed.
    if (result.code !== 0) {
      const msg = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
      return {
        output: `[git:status] failed: ${msg}`,
        format: 'text',
        success: false,
        error: msg,
      };
    }

    const parsed = parsePorcelainV2(result.stdout);
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
// Parser -- porcelain v2 with -z (null-terminated, no quoting).
// https://git-scm.com/docs/git-status#_porcelain_format_version_2
// ---------------------------------------------------------------------------

function parsePorcelainV2(raw: string): GitStatusData {
  const data: GitStatusData = {
    clean: true,
    branch: '(detached)',
    staged: [],
    unstaged: [],
    untracked: [],
    conflicts: [],
  };

  // Entries are null-terminated; rename / copy entries are two-part:
  //   "2 <XY> ... <path>\0<origPath>\0"
  // Split on NUL then walk with an index so we can consume the extra token.
  const parts = raw.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i];
    if (!line) { continue; }

    // Header lines start with '# '.
    if (line.startsWith('# branch.head ')) {
      data.branch = line.slice('# branch.head '.length).trim();
      continue;
    }
    if (line.startsWith('# branch.upstream ')) {
      data.upstream = line.slice('# branch.upstream '.length).trim();
      continue;
    }
    if (line.startsWith('# branch.ab ')) {
      const tail = line.slice('# branch.ab '.length).trim();
      const match = tail.match(/^\+(\d+)\s+-(\d+)$/);
      if (match) {
        data.ahead = Number(match[1]);
        data.behind = Number(match[2]);
      }
      continue;
    }

    // Changed entry: "1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>"
    if (line.startsWith('1 ')) {
      const tokens = line.split(' ');
      const xy = tokens[1] ?? '  ';
      const path = tokens.slice(8).join(' ');
      pushEntry(data, xy, path, undefined);
      continue;
    }

    // Renamed / copied: "2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>"
    // followed by a separate NUL-terminated orig-path token.
    if (line.startsWith('2 ')) {
      const tokens = line.split(' ');
      const xy = tokens[1] ?? '  ';
      const path = tokens.slice(9).join(' ');
      const origPath = parts[++i] ?? '';
      pushEntry(data, xy, path, origPath);
      continue;
    }

    // Unmerged / conflict: "u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>"
    if (line.startsWith('u ')) {
      const tokens = line.split(' ');
      const xy = tokens[1] ?? '  ';
      const path = tokens.slice(10).join(' ');
      data.conflicts.push({ path, code: xy });
      data.clean = false;
      continue;
    }

    // Untracked: "? <path>"
    if (line.startsWith('? ')) {
      data.untracked.push(line.slice(2));
      data.clean = false;
      continue;
    }

    // Ignored: "! <path>" -- we don't surface these.
  }

  return data;
}

function pushEntry(
  data: GitStatusData,
  xy: string,
  path: string,
  origPath: string | undefined,
): void {
  const staged = xy[0] ?? '.';
  const unstaged = xy[1] ?? '.';
  if (staged !== '.') {
    data.staged.push({ path, code: staged, ...(origPath ? { origPath } : {}) });
    data.clean = false;
  }
  if (unstaged !== '.') {
    data.unstaged.push({ path, code: unstaged, ...(origPath ? { origPath } : {}) });
    data.clean = false;
  }
}

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

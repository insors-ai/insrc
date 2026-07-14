/**
 * git:blame -- line-level authorship (read-only).
 *
 * Uses `git blame --porcelain` which gives a deterministic, parseable
 * structured format: a commit header followed by per-line attribution.
 * We return per-line attribution and a commit table so agents can see
 * how many lines each commit contributed.
 */

import { runShell } from '../../shell-helper.js';
import type { Tool, ToolInput, ToolResult } from '../../types.js';

export interface GitBlameLine {
  line: number;
  sha: string;
  shortSha: string;
  author: string;
  authorEmail: string;
  /** Epoch seconds. */
  authorTime: number;
  summary: string;
  content: string;
}

export interface GitBlameData {
  path: string;
  ref: string;
  lines: GitBlameLine[];
  /** Per-SHA line count. */
  commits: Array<{ sha: string; shortSha: string; author: string; summary: string; lineCount: number }>;
}

export const gitBlameTool: Tool = {
  id: 'git_blame',
  description: 'Show line-level authorship for a file (optionally a range).',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: 'Repository root. Defaults to process cwd.' },
      path: { type: 'string', description: 'File path relative to the repo root.' },
      ref:  { type: 'string', description: 'Revision to blame (default HEAD).' },
      startLine: { type: 'number', description: '1-based start line for a range blame.', minimum: 1 },
      endLine:   { type: 'number', description: '1-based end line (inclusive).', minimum: 1 },
      ignoreWhitespace: { type: 'boolean', description: 'Pass -w.' },
    },
    required: ['path'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const path = str(input, 'path');
    if (!path) {
      return fail('missing path');
    }
    const ref = str(input, 'ref') ?? 'HEAD';
    const start = numInput(input, 'startLine');
    const end = numInput(input, 'endLine');
    const ignoreWhitespace = input['ignoreWhitespace'] === true;

    const argv = ['git', 'blame', '--porcelain'];
    if (ignoreWhitespace) { argv.push('-w'); }
    if (start && end) { argv.push('-L', `${start},${end}`); }
    else if (start)   { argv.push('-L', `${start},`); }
    argv.push(ref, '--', path);

    const result = await runShell(argv, { cwd, timeoutMs: 30_000, maxBytes: 4 * 1024 * 1024 });
    if (result.spawnError) {
      return {
        output: `[git:blame] cannot spawn git -- ${result.stderr.trim() || 'unknown error'}`,
        format: 'text', success: false, error: 'git not found',
      };
    }
    if (result.code !== 0) {
      const msg = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
      return { output: `[git:blame] failed: ${msg}`, format: 'text', success: false, error: msg };
    }

    const lines = parsePorcelain(result.stdout);
    const commits = summarizeCommits(lines);
    const data: GitBlameData = { path, ref, lines, commits };

    return { output: renderReport(data, cwd), format: 'markdown', success: true, data };
  },
};

// ---------------------------------------------------------------------------
// Porcelain parser
// --------------------------------------------------------------------------
// `git blame --porcelain` format:
//   <sha> <origLine> <finalLine> [<numLines>]
//   author <name>
//   author-mail <email>
//   author-time <epoch>
//   ...
//   summary <subject>
//   filename <path>
//   \t<content>
// Subsequent hunks for the same commit omit author/etc lines.
// ---------------------------------------------------------------------------

function parsePorcelain(raw: string): GitBlameLine[] {
  const out: GitBlameLine[] = [];
  const commitCache = new Map<string, { author: string; authorEmail: string; authorTime: number; summary: string }>();
  let currentSha = '';
  let currentFinal = 0;
  let pending = { author: '', authorEmail: '', authorTime: 0, summary: '' };

  const rawLines = raw.split('\n');
  let i = 0;
  while (i < rawLines.length) {
    const headerLine = rawLines[i++];
    if (!headerLine) { continue; }

    const header = headerLine.match(/^([0-9a-f]{7,40})\s+(\d+)\s+(\d+)(?:\s+(\d+))?$/);
    if (!header) { continue; }

    currentSha = header[1] ?? '';
    currentFinal = Number(header[3] ?? '0') || 0;

    const cached = commitCache.get(currentSha);
    if (cached) {
      pending = { ...cached };
    } else {
      pending = { author: '', authorEmail: '', authorTime: 0, summary: '' };
    }

    while (i < rawLines.length) {
      const field = rawLines[i];
      if (typeof field !== 'string') { break; }
      if (field.startsWith('\t')) {
        const content = field.slice(1);
        if (!cached) {
          commitCache.set(currentSha, { ...pending });
        }
        out.push({
          line: currentFinal,
          sha: currentSha,
          shortSha: currentSha.slice(0, 7),
          author: pending.author,
          authorEmail: pending.authorEmail,
          authorTime: pending.authorTime,
          summary: pending.summary,
          content,
        });
        i++;
        break;
      }
      i++;
      if (field.startsWith('author '))       { pending.author      = field.slice('author '.length); continue; }
      if (field.startsWith('author-mail '))  { pending.authorEmail = field.slice('author-mail '.length).replace(/^<|>$/g, ''); continue; }
      if (field.startsWith('author-time '))  { pending.authorTime  = Number(field.slice('author-time '.length)) || 0; continue; }
      if (field.startsWith('summary '))      { pending.summary     = field.slice('summary '.length); continue; }
      // filename / committer / boundary / previous -- ignored for now.
    }
  }
  return out;
}

function summarizeCommits(lines: GitBlameLine[]): GitBlameData['commits'] {
  const map = new Map<string, { sha: string; shortSha: string; author: string; summary: string; lineCount: number }>();
  for (const l of lines) {
    const e = map.get(l.sha);
    if (e) { e.lineCount += 1; continue; }
    map.set(l.sha, { sha: l.sha, shortSha: l.shortSha, author: l.author, summary: l.summary, lineCount: 1 });
  }
  return Array.from(map.values()).sort((a, b) => b.lineCount - a.lineCount);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function renderReport(data: GitBlameData, cwd: string): string {
  const out: string[] = [];
  out.push(`# git blame -- \`${data.path}\` @ ${data.ref}`);
  out.push('');
  out.push(`Repo: \`${cwd}\` -- ${data.lines.length} line${data.lines.length === 1 ? '' : 's'} attributed`);
  out.push('');

  if (data.commits.length > 0) {
    out.push(`## Commits touching these lines`);
    out.push('');
    out.push('| SHA | Lines | Author | Summary |');
    out.push('|-----|-------|--------|---------|');
    for (const c of data.commits.slice(0, 30)) {
      out.push(`| \`${c.shortSha}\` | ${c.lineCount} | ${escape(c.author)} | ${escape(c.summary)} |`);
    }
    if (data.commits.length > 30) {
      out.push(`| _...and ${data.commits.length - 30} more_ | | | |`);
    }
    out.push('');
  }

  if (data.lines.length > 0) {
    out.push('## Lines');
    out.push('');
    out.push('```');
    for (const l of data.lines) {
      const stamp = l.authorTime ? new Date(l.authorTime * 1000).toISOString().slice(0, 10) : '          ';
      out.push(`${l.shortSha} ${stamp} ${padRight(l.author, 18)} ${String(l.line).padStart(5)} | ${l.content}`);
    }
    out.push('```');
  }

  return out.join('\n').trimEnd();
}

function padRight(s: string, width: number): string {
  return (s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length));
}

function escape(s: string): string {
  return s.replace(/\|/g, '\\|');
}

// ---------------------------------------------------------------------------
// Input helpers
// ---------------------------------------------------------------------------

function str(input: ToolInput, key: string): string | undefined {
  const v = input[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function numInput(input: ToolInput, key: string): number | undefined {
  const v = input[key];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined;
}

function fail(msg: string): ToolResult {
  return { output: `[git:blame] ${msg}`, format: 'text', success: false, error: msg };
}

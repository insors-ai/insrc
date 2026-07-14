/**
 * git:log -- commit history (read-only, no approval).
 *
 * Parses the log into structured commits so agents can filter / reason
 * over authors, dates, and subjects without re-parsing text. The
 * markdown output is a human-readable list; the structured data is on
 * result.data.
 */

import { runShell } from '../../shell-helper.js';
import type { Tool, ToolInput, ToolResult } from '../../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitLogCommit {
  sha: string;
  shortSha: string;
  author: string;
  authorEmail: string;
  /** ISO-8601 author date. */
  date: string;
  subject: string;
  /** Commit body, may be empty. Trailing whitespace trimmed. */
  body: string;
}

export interface GitLogData {
  commits: GitLogCommit[];
  /** Git revision range actually queried (resolved ref or HEAD). */
  ref: string;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 500;

// Unit-separator delimits fields; NUL delimits commits (from -z).
const FS = '\x1f';
const PRETTY = `%H${FS}%h${FS}%an${FS}%ae${FS}%aI${FS}%s${FS}%b`;

export const gitLogTool: Tool = {
  id: 'git_log',
  description: 'Show commit history, optionally filtered by ref, path, author, message, or date range.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: 'Repository root. Defaults to process cwd.' },
      ref: { type: 'string', description: 'Revision or range to log (e.g. "HEAD", "main..feature", "v1.0..HEAD"). Default: HEAD.' },
      path: { type: 'string', description: 'Restrict history to changes touching this path (file or directory).' },
      limit: { type: 'number', description: `Max commits to return (default ${DEFAULT_LIMIT}, cap ${MAX_LIMIT}).`, minimum: 1, maximum: MAX_LIMIT },
      author: { type: 'string', description: 'Filter by author name / email substring (git --author=).' },
      grep: { type: 'string', description: 'Filter by commit message substring (git --grep=).' },
      since: { type: 'string', description: 'ISO date -- only commits after this time (git --since=).' },
      until: { type: 'string', description: 'ISO date -- only commits before this time (git --until=).' },
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = strInput(input, 'cwd') ?? process.cwd();
    const ref = strInput(input, 'ref') ?? 'HEAD';
    const path = strInput(input, 'path');
    const limit = clampLimit(input['limit']);
    const author = strInput(input, 'author');
    const grep = strInput(input, 'grep');
    const since = strInput(input, 'since');
    const until = strInput(input, 'until');

    const argv: string[] = [
      'git', 'log',
      '-z',
      '--no-color',
      `--max-count=${limit}`,
      `--pretty=format:${PRETTY}`,
    ];
    if (author) { argv.push(`--author=${author}`); }
    if (grep)   { argv.push(`--grep=${grep}`); }
    if (since)  { argv.push(`--since=${since}`); }
    if (until)  { argv.push(`--until=${until}`); }
    argv.push(ref);
    if (path)   { argv.push('--', path); }

    const result = await runShell(argv, { cwd, timeoutMs: 30_000 });

    if (result.spawnError) {
      return {
        output: `[git:log] cannot spawn git -- ${result.stderr.trim() || 'unknown error'}`,
        format: 'text',
        success: false,
        error: 'git not found',
      };
    }

    if (result.code !== 0) {
      const msg = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
      return {
        output: `[git:log] failed: ${msg}`,
        format: 'text',
        success: false,
        error: msg,
      };
    }

    const commits = parseLog(result.stdout);
    const data: GitLogData = { commits, ref };
    const report = renderReport(data, cwd, { path, author, grep, since, until, limit });

    return {
      output: report,
      format: 'markdown',
      success: true,
      data,
    };
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function strInput(input: ToolInput, key: string): string | undefined {
  const v = input[key];
  if (typeof v === 'string' && v.length > 0) { return v; }
  return undefined;
}

function clampLimit(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) { return DEFAULT_LIMIT; }
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(raw)));
}

function parseLog(raw: string): GitLogCommit[] {
  if (!raw) { return []; }
  // `-z` separates commits by NUL. Trim a possible trailing NUL before splitting.
  const chunks = raw.replace(/\0$/, '').split('\0');
  const out: GitLogCommit[] = [];
  for (const chunk of chunks) {
    if (!chunk) { continue; }
    const fields = chunk.split(FS);
    if (fields.length < 7) { continue; }
    out.push({
      sha: fields[0] ?? '',
      shortSha: fields[1] ?? '',
      author: fields[2] ?? '',
      authorEmail: fields[3] ?? '',
      date: fields[4] ?? '',
      subject: fields[5] ?? '',
      body: (fields[6] ?? '').trimEnd(),
    });
  }
  return out;
}

interface FilterContext {
  path?: string | undefined;
  author?: string | undefined;
  grep?: string | undefined;
  since?: string | undefined;
  until?: string | undefined;
  limit: number;
}

function renderReport(data: GitLogData, cwd: string, filters: FilterContext): string {
  const lines: string[] = [];
  lines.push(`# git log -- ${data.ref}`);
  lines.push('');

  const filterSummary: string[] = [`up to ${filters.limit}`];
  if (filters.path)   { filterSummary.push(`path \`${filters.path}\``); }
  if (filters.author) { filterSummary.push(`author \`${filters.author}\``); }
  if (filters.grep)   { filterSummary.push(`grep \`${filters.grep}\``); }
  if (filters.since)  { filterSummary.push(`since \`${filters.since}\``); }
  if (filters.until)  { filterSummary.push(`until \`${filters.until}\``); }
  lines.push(`Repo: \`${cwd}\` -- ${filterSummary.join(', ')}`);
  lines.push('');

  if (data.commits.length === 0) {
    lines.push('_No commits match._');
    return lines.join('\n');
  }

  lines.push(`## ${data.commits.length} commit${data.commits.length === 1 ? '' : 's'}`);
  lines.push('');
  for (const c of data.commits) {
    const datePart = c.date ? ` _(${c.date.slice(0, 10)})_` : '';
    lines.push(`- \`${c.shortSha}\` **${escapeMd(c.subject)}**${datePart}`);
    const meta: string[] = [];
    if (c.author) { meta.push(c.author); }
    if (c.body) {
      const firstLine = c.body.split('\n')[0];
      if (firstLine && firstLine.trim()) { meta.push(escapeMd(firstLine.trim())); }
    }
    if (meta.length > 0) {
      lines.push(`  - ${meta.join(' -- ')}`);
    }
  }

  return lines.join('\n').trimEnd();
}

function escapeMd(s: string): string {
  // Light markdown safety -- just the characters that break a bullet list.
  return s.replace(/\|/g, '\\|').replace(/\*/g, '\\*');
}

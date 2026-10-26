/**
 * git:log -- commit history (read-only, no approval).
 *
 * Parses the log into structured commits so agents can filter / reason
 * over authors, dates, and subjects without re-parsing text. The
 * markdown output is a human-readable list; the structured data is on
 * result.data.
 */

import type { TypedTool } from '../../call-tool.js';
import { Type } from '@sinclair/typebox';
import { runShell } from '../../shell-helper.js';
import { assertSafeArg, fail, spawnFail } from './helpers.js';
import { LOG_FORMAT, parseLogRecords, parseOutput } from './parsers.js';
import { GitLogDataSchema } from './schemas.js';
import type { GitLogData } from './schemas.js';

export type { GitLogCommit, GitLogData } from './schemas.js';
import type { ToolInput, ToolResult } from '../../types.js';

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 500;

export const gitLogTool = {
  id: 'git_log',
  description: 'Show commit history, optionally filtered by ref, path, author, message, or date range.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root. Defaults to process cwd.' })),
    ref: Type.Optional(Type.String({ description: 'Revision or range to log (e.g. "HEAD", "main..feature", "v1.0..HEAD"). Default: HEAD.' })),
    path: Type.Optional(Type.String({ description: 'Restrict history to changes touching this path (file or directory).' })),
    limit: Type.Optional(Type.Number({ description: `Max commits to return (default ${DEFAULT_LIMIT}, cap ${MAX_LIMIT}).`, minimum: 1, maximum: MAX_LIMIT })),
    author: Type.Optional(Type.String({ description: 'Filter by author name / email substring (git --author=).' })),
    grep: Type.Optional(Type.String({ description: 'Filter by commit message substring (git --grep=).' })),
    since: Type.Optional(Type.String({ description: 'ISO date -- only commits after this time (git --since=).' })),
    until: Type.Optional(Type.String({ description: 'ISO date -- only commits before this time (git --until=).' })),
  }, { additionalProperties: false }),
  outputSchema: GitLogDataSchema,

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = strInput(input, 'cwd') ?? process.cwd();
    const ref = strInput(input, 'ref') ?? 'HEAD';
    const path = strInput(input, 'path');
    assertSafeArg(ref, 'ref');
    if (path !== undefined) { assertSafeArg(path, 'path'); }
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
      `--pretty=format:${LOG_FORMAT}`,
    ];
    if (author) { argv.push(`--author=${author}`); }
    if (grep)   { argv.push(`--grep=${grep}`); }
    if (since)  { argv.push(`--since=${since}`); }
    if (until)  { argv.push(`--until=${until}`); }
    argv.push(ref);
    if (path)   { argv.push('--', path); }

    const result = await runShell(argv, { cwd, timeoutMs: 30_000 });

    if (result.spawnError) {
      return spawnFail('git:log', result.stderr);
    }

    if (result.code !== 0) {
      return fail('git:log', result);
    }

    const commitsRead = parseOutput('git:log', result, parseLogRecords);
    if (!commitsRead.ok) { return commitsRead.failure; }
    const commits = commitsRead.value;
    const data: GitLogData = { commits, ref };
    const report = renderReport(data, cwd, { path, author, grep, since, until, limit });

    return {
      output: report,
      format: 'markdown',
      success: true,
      data,
    };
  },
} satisfies TypedTool;

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

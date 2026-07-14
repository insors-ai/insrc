/**
 * git:diff -- unified diff (read-only, no approval).
 *
 * Modes:
 *   - default              working tree vs index (unstaged changes)
 *   - staged: true         index vs HEAD (what `git commit` would record)
 *   - from / to            arbitrary two-side diff (commits or refs)
 *   - from + !to           diff from <commit> to HEAD
 *   - path                 restricts the diff to a file or directory
 *
 * Diffs can be huge. The tool caps output at maxBytes (default 256 KB,
 * configurable) and returns a structured summary alongside the raw
 * diff so agents can skim file counts / line deltas even when the
 * payload was truncated.
 */

import { runShell } from '../../shell-helper.js';
import type { Tool, ToolInput, ToolResult } from '../../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitDiffFileStat {
  path: string;
  /** Previous path when the file was renamed. */
  origPath?: string | undefined;
  insertions: number;
  deletions: number;
  /** 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'binary' */
  change: string;
}

export interface GitDiffData {
  /** Resolved mode label: 'unstaged' | 'staged' | 'range' | 'commit'. */
  mode: string;
  /** Git revision pair actually diffed (e.g. "HEAD -- worktree"). */
  range: string;
  files: GitDiffFileStat[];
  totalInsertions: number;
  totalDeletions: number;
  truncated: boolean;
  /** Bytes of diff body returned. */
  diffBytes: number;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const DEFAULT_MAX_BYTES = 256 * 1024;  // 256 KB
const MAX_MAX_BYTES = 2 * 1024 * 1024; // 2 MB hard cap

export const gitDiffTool: Tool = {
  id: 'git_diff',
  description: 'Show a unified diff. Supports unstaged (default), staged, arbitrary commit ranges, or a specific path.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: 'Repository root. Defaults to process cwd.' },
      staged: { type: 'boolean', description: 'When true, diff index vs HEAD (what `git commit` would record).' },
      from: { type: 'string', description: 'Starting ref for a range diff (commit SHA, branch, tag, "HEAD~3").' },
      to: { type: 'string', description: 'Ending ref. When omitted with `from`, defaults to HEAD.' },
      path: { type: 'string', description: 'Restrict the diff to this file or directory.' },
      context: { type: 'number', description: 'Lines of context around each change (git -U). Default 3.', minimum: 0, maximum: 50 },
      ignoreWhitespace: { type: 'boolean', description: 'Pass -w to git diff.' },
      maxBytes: {
        type: 'number',
        description: `Max diff body bytes to return (default ${DEFAULT_MAX_BYTES}, hard cap ${MAX_MAX_BYTES}).`,
        minimum: 1024,
        maximum: MAX_MAX_BYTES,
      },
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = strInput(input, 'cwd') ?? process.cwd();
    const staged = boolInput(input, 'staged');
    const from = strInput(input, 'from');
    const to = strInput(input, 'to');
    const path = strInput(input, 'path');
    const context = typeof input['context'] === 'number' ? input['context'] : undefined;
    const ignoreWhitespace = boolInput(input, 'ignoreWhitespace');
    const maxBytes = Math.min(
      Math.max(typeof input['maxBytes'] === 'number' ? input['maxBytes'] : DEFAULT_MAX_BYTES, 1024),
      MAX_MAX_BYTES,
    );

    const diffOpts: DiffOpts = { staged, ignoreWhitespace };
    if (from !== undefined) { diffOpts.from = from; }
    if (to !== undefined) { diffOpts.to = to; }
    if (path !== undefined) { diffOpts.path = path; }
    if (context !== undefined) { diffOpts.context = context; }
    const statOpts: DiffOpts = { staged };
    if (from !== undefined) { statOpts.from = from; }
    if (to !== undefined) { statOpts.to = to; }
    if (path !== undefined) { statOpts.path = path; }
    const { argv, mode, range } = buildDiffArgv(diffOpts);
    const statArgv = buildStatArgv(statOpts);

    const [diff, stat] = await Promise.all([
      runShell(argv, { cwd, timeoutMs: 30_000, maxBytes }),
      runShell(statArgv, { cwd, timeoutMs: 15_000 }),
    ]);

    if (diff.spawnError) {
      return {
        output: `[git:diff] cannot spawn git -- ${diff.stderr.trim() || 'unknown error'}`,
        format: 'text',
        success: false,
        error: 'git not found',
      };
    }
    if (diff.code !== 0) {
      const msg = diff.stderr.trim() || diff.stdout.trim() || `exit ${diff.code}`;
      return {
        output: `[git:diff] failed: ${msg}`,
        format: 'text',
        success: false,
        error: msg,
      };
    }

    const files = stat.code === 0 ? parseNumstat(stat.stdout) : [];
    const totalInsertions = files.reduce((n, f) => n + f.insertions, 0);
    const totalDeletions  = files.reduce((n, f) => n + f.deletions, 0);
    const truncated = diff.stdout.length >= maxBytes;
    const diffBody = truncated ? diff.stdout.slice(0, maxBytes) : diff.stdout;

    const data: GitDiffData = {
      mode,
      range,
      files,
      totalInsertions,
      totalDeletions,
      truncated,
      diffBytes: diffBody.length,
    };

    const report = renderReport(data, cwd, diffBody);

    return {
      output: report,
      format: 'markdown',
      success: true,
      data,
    };
  },
};

// ---------------------------------------------------------------------------
// argv builders
// ---------------------------------------------------------------------------

interface DiffOpts {
  staged?: boolean;
  from?: string;
  to?: string;
  path?: string;
  context?: number;
  ignoreWhitespace?: boolean;
}

function buildDiffArgv(o: DiffOpts): { argv: string[]; mode: string; range: string } {
  const base = ['git', 'diff', '--no-color'];
  if (o.ignoreWhitespace) { base.push('-w'); }
  if (typeof o.context === 'number') { base.push(`-U${o.context}`); }

  let mode: string;
  let range: string;
  if (o.staged) {
    base.push('--cached');
    mode = 'staged';
    range = 'HEAD -- index';
  } else if (o.from) {
    const end = o.to ?? 'HEAD';
    base.push(`${o.from}..${end}`);
    mode = 'range';
    range = `${o.from}..${end}`;
  } else {
    mode = 'unstaged';
    range = 'index -- worktree';
  }

  if (o.path) { base.push('--', o.path); }
  return { argv: base, mode, range };
}

function buildStatArgv(o: DiffOpts): string[] {
  const base = ['git', 'diff', '--no-color', '--numstat'];
  if (o.staged) { base.push('--cached'); }
  else if (o.from) { base.push(`${o.from}..${o.to ?? 'HEAD'}`); }
  if (o.path) { base.push('--', o.path); }
  return base;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function parseNumstat(raw: string): GitDiffFileStat[] {
  const out: GitDiffFileStat[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trimEnd();
    if (!trimmed) { continue; }
    // Formats:
    //   "<ins>\t<del>\t<path>"
    //   "<ins>\t<del>\t<origPath> => <newPath>"     (rename/copy)
    //   "-\t-\t<path>"                              (binary)
    const parts = trimmed.split('\t');
    if (parts.length < 3) { continue; }
    const insRaw = parts[0] ?? '';
    const delRaw = parts[1] ?? '';
    const pathPart = parts.slice(2).join('\t');

    const binary = insRaw === '-' || delRaw === '-';
    const insertions = binary ? 0 : Number(insRaw) || 0;
    const deletions  = binary ? 0 : Number(delRaw) || 0;

    const renameMatch = pathPart.match(/^(.+?) => (.+)$/);
    const entry: GitDiffFileStat = renameMatch
      ? {
          path: renameMatch[2] ?? pathPart,
          origPath: renameMatch[1] ?? '',
          insertions,
          deletions,
          change: binary ? 'binary' : 'renamed',
        }
      : {
          path: pathPart,
          insertions,
          deletions,
          change: binary ? 'binary' : classify(insertions, deletions),
        };
    out.push(entry);
  }
  return out;
}

function classify(ins: number, del: number): string {
  if (ins > 0 && del === 0) { return 'added'; }
  if (del > 0 && ins === 0) { return 'deleted'; }
  return 'modified';
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function renderReport(data: GitDiffData, cwd: string, body: string): string {
  const lines: string[] = [];
  lines.push(`# git diff -- ${data.range}`);
  lines.push('');
  lines.push(`Repo: \`${cwd}\` -- mode: **${data.mode}**`);
  lines.push('');

  if (data.files.length === 0 && !body) {
    lines.push('_No differences._');
    return lines.join('\n');
  }

  if (data.files.length > 0) {
    lines.push(`## ${data.files.length} file${data.files.length === 1 ? '' : 's'} changed (+${data.totalInsertions} / -${data.totalDeletions})`);
    lines.push('');
    for (const f of data.files) {
      const rename = f.origPath ? ` (from \`${f.origPath}\`)` : '';
      const delta = f.change === 'binary' ? 'binary' : `+${f.insertions} / -${f.deletions}`;
      lines.push(`- ${f.change}: \`${f.path}\`${rename} -- ${delta}`);
    }
    lines.push('');
  }

  if (body) {
    lines.push('## Diff');
    if (data.truncated) {
      lines.push('');
      lines.push(`_Truncated at ${data.diffBytes} bytes -- raise \`maxBytes\` to see more._`);
    }
    lines.push('');
    lines.push('```diff');
    lines.push(body.replace(/\r\n?/g, '\n').replace(/\n+$/, ''));
    lines.push('```');
  }

  return lines.join('\n').trimEnd();
}

// ---------------------------------------------------------------------------
// Input helpers
// ---------------------------------------------------------------------------

function strInput(input: ToolInput, key: string): string | undefined {
  const v = input[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function boolInput(input: ToolInput, key: string): boolean {
  return input[key] === true;
}

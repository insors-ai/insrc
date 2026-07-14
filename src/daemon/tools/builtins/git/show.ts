/**
 * git:show -- full details of a specific commit (read-only).
 *
 * Returns author / date / subject / body + the full diff of the commit.
 * Same byte cap strategy as git:diff to prevent accidental 5 MB outputs
 * when the commit touches many files.
 */

import { runShell } from '../../shell-helper.js';
import type { Tool, ToolInput, ToolResult } from '../../types.js';
import type { GitDiffFileStat } from './diff.js';

export interface GitShowData {
  sha: string;
  shortSha: string;
  author: string;
  authorEmail: string;
  date: string;
  subject: string;
  body: string;
  parents: string[];
  files: GitDiffFileStat[];
  totalInsertions: number;
  totalDeletions: number;
  truncated: boolean;
  diffBytes: number;
}

const DEFAULT_MAX_BYTES = 256 * 1024;
const MAX_MAX_BYTES = 2 * 1024 * 1024;

const FS = '\x1f';
const HEADER_PRETTY = `%H${FS}%h${FS}%P${FS}%an${FS}%ae${FS}%aI${FS}%s${FS}%b`;

export const gitShowTool: Tool = {
  id: 'git_show',
  description: 'Show a single commit: metadata + full diff.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: 'Repository root. Defaults to process cwd.' },
      ref: { type: 'string', description: 'Commit ref to show (SHA / branch / tag / HEAD~N). Default HEAD.' },
      path: { type: 'string', description: 'Limit the diff to this file or directory.' },
      maxBytes: { type: 'number', description: `Diff byte cap (default ${DEFAULT_MAX_BYTES}, max ${MAX_MAX_BYTES}).` },
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const ref = str(input, 'ref') ?? 'HEAD';
    const path = str(input, 'path');
    const maxBytes = Math.min(
      Math.max(typeof input['maxBytes'] === 'number' ? input['maxBytes'] : DEFAULT_MAX_BYTES, 1024),
      MAX_MAX_BYTES,
    );

    // Header fetch. Kept separate from the diff fetch so we can return
    // meaningful metadata even if the diff times out or overflows.
    const headerArgv = ['git', 'show', '--no-color', '--no-patch', `--pretty=format:${HEADER_PRETTY}`, ref];
    if (path) { headerArgv.push('--', path); }
    const header = await runShell(headerArgv, { cwd, timeoutMs: 15_000 });

    if (header.spawnError) {
      return spawnFail(header.stderr);
    }
    if (header.code !== 0) {
      const msg = header.stderr.trim() || header.stdout.trim() || `exit ${header.code}`;
      return {
        output: `[git:show] failed: ${msg}`,
        format: 'text',
        success: false,
        error: msg,
      };
    }

    const meta = parseHeader(header.stdout);
    if (!meta) {
      return {
        output: `[git:show] could not parse commit metadata for \`${ref}\``,
        format: 'text',
        success: false,
        error: 'parse error',
      };
    }

    // Diff + numstat in parallel.
    const diffArgv = ['git', 'show', '--no-color', '--pretty=format:', ref];
    if (path) { diffArgv.push('--', path); }
    const statArgv = ['git', 'show', '--no-color', '--numstat', '--pretty=format:', ref];
    if (path) { statArgv.push('--', path); }

    const [diff, stat] = await Promise.all([
      runShell(diffArgv, { cwd, timeoutMs: 30_000, maxBytes }),
      runShell(statArgv, { cwd, timeoutMs: 15_000 }),
    ]);

    const files = stat.code === 0 ? parseNumstat(stat.stdout) : [];
    const totalInsertions = files.reduce((n, f) => n + f.insertions, 0);
    const totalDeletions  = files.reduce((n, f) => n + f.deletions, 0);
    const truncated = diff.stdout.length >= maxBytes;
    const diffBody = (truncated ? diff.stdout.slice(0, maxBytes) : diff.stdout).replace(/^\n/, '');

    const data: GitShowData = {
      ...meta,
      files,
      totalInsertions,
      totalDeletions,
      truncated,
      diffBytes: diffBody.length,
    };

    return {
      output: renderReport(data, cwd, diffBody),
      format: 'markdown',
      success: true,
      data,
    };
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(input: ToolInput, key: string): string | undefined {
  const v = input[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function spawnFail(err: string): ToolResult {
  return {
    output: `[git:show] cannot spawn git -- ${err.trim() || 'unknown error'}`,
    format: 'text',
    success: false,
    error: 'git not found',
  };
}

function parseHeader(raw: string): Omit<GitShowData, 'files' | 'totalInsertions' | 'totalDeletions' | 'truncated' | 'diffBytes'> | null {
  const fields = raw.split(FS);
  if (fields.length < 8) { return null; }
  return {
    sha: fields[0] ?? '',
    shortSha: fields[1] ?? '',
    parents: (fields[2] ?? '').split(' ').filter(Boolean),
    author: fields[3] ?? '',
    authorEmail: fields[4] ?? '',
    date: fields[5] ?? '',
    subject: fields[6] ?? '',
    body: (fields[7] ?? '').trimEnd(),
  };
}

function parseNumstat(raw: string): GitDiffFileStat[] {
  const out: GitDiffFileStat[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trimEnd();
    if (!trimmed) { continue; }
    const parts = trimmed.split('\t');
    if (parts.length < 3) { continue; }
    const insRaw = parts[0] ?? '';
    const delRaw = parts[1] ?? '';
    const pathPart = parts.slice(2).join('\t');
    const binary = insRaw === '-' || delRaw === '-';
    const insertions = binary ? 0 : Number(insRaw) || 0;
    const deletions  = binary ? 0 : Number(delRaw) || 0;
    const rename = pathPart.match(/^(.+?) => (.+)$/);
    if (rename) {
      out.push({
        path: rename[2] ?? pathPart,
        origPath: rename[1] ?? '',
        insertions, deletions,
        change: binary ? 'binary' : 'renamed',
      });
    } else {
      out.push({
        path: pathPart,
        insertions, deletions,
        change: binary
          ? 'binary'
          : insertions > 0 && deletions === 0 ? 'added'
          : deletions > 0 && insertions === 0 ? 'deleted'
          : 'modified',
      });
    }
  }
  return out;
}

function renderReport(data: GitShowData, cwd: string, body: string): string {
  const lines: string[] = [];
  lines.push(`# ${data.shortSha} -- ${escape(data.subject)}`);
  lines.push('');

  const meta: string[] = [];
  meta.push(`\`${data.sha}\``);
  if (data.author) { meta.push(`${data.author} <${data.authorEmail}>`); }
  if (data.date)   { meta.push(data.date.slice(0, 10)); }
  if (data.parents.length > 0) { meta.push(`parents: ${data.parents.map(p => p.slice(0, 7)).join(', ')}`); }
  lines.push(meta.join(' -- '));
  lines.push(`Repo: \`${cwd}\``);
  lines.push('');

  if (data.body) {
    lines.push('> ' + data.body.split('\n').join('\n> '));
    lines.push('');
  }

  if (data.files.length > 0) {
    lines.push(`## ${data.files.length} file${data.files.length === 1 ? '' : 's'} (+${data.totalInsertions} / -${data.totalDeletions})`);
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

function escape(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\*/g, '\\*');
}

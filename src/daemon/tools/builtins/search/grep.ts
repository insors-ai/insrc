/**
 * search:grep -- search file contents by regex.
 *
 * Uses `rg` (ripgrep) when available -- fast, respects .gitignore,
 * handles binary files sanely. Falls back to a Node-only recursive
 * scan when ripgrep isn't on PATH.
 */

import { promises as fs, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { runShell } from '../../shell-helper.js';
import type { Tool, ToolInput, ToolResult } from '../../types.js';
import { searchAccess } from '../file/helpers.js';

export interface GrepHit {
  path: string;
  line: number;
  text: string;
}

/**
 * What a search left out. The hits and the limits are what they always were;
 * this says what is NOT in them, so a caller can tell a complete result from
 * a short one.
 */
export interface GrepOmitted {
  /** A file or directory the search did not read. Node backend only: ripgrep reports none. */
  readonly skippedFiles: readonly { readonly path: string; readonly reason: 'too-large' | 'unreadable' }[];
  /** A matching line whose text was cut to `MAX_LINE_CHARS`, with the length it had. */
  readonly shortenedLines: readonly { readonly path: string; readonly line: number; readonly totalChars: number }[];
  /** Ripgrep only: some file reached the per-file match limit, so it may hold more matches. */
  readonly perFileLimitReached: boolean;
  /** Ripgrep only: its output passed the size cap and the rest was dropped. */
  readonly outputDiscarded: boolean;
  /** Ripgrep started and failed; the Node backend's result is the one returned. */
  readonly backendFallback?: { readonly reason: 'timeout' | 'exit-code'; readonly detail: string } | undefined;
  /** What this backend never reads, in words. */
  readonly excludedByRule: string;
}

export interface SearchGrepData {
  pattern: string;
  root: string;
  usedRipgrep: boolean;
  hits: GrepHit[];
  truncated: boolean;
  omitted: GrepOmitted;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 5000;
const IGNORE_DIRS = new Set(['.git', 'node_modules', '.build', 'out', 'dist', '.next', '.cache']);
const MAX_LINE_CHARS = 500;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const RG_TIMEOUT_MS = 30_000;
const RG_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

export const RIPGREP_EXCLUDED_BY_RULE =
  'files and directories matched by an ignore file (.gitignore, .ignore, .rgignore), ' +
  'hidden files and directories (names starting with a dot), and binary files';

export const NODE_EXCLUDED_BY_RULE =
  `directories named ${[...IGNORE_DIRS].join(', ')}; ` +
  'every entry whose name starts with a dot, files and directories alike; ' +
  'and every entry that is neither a regular file nor a directory, such as a symbolic link';

// ---------------------------------------------------------------------------
// Shared entry point
// ---------------------------------------------------------------------------

/**
 * Public options for the shared grep helper. Callers outside the
 * Tool surface (e.g. the `search.text` exploration in the analyze
 * framework) use this to skip the `ToolResult` wrapping + get typed
 * `SearchGrepData` back directly.
 */
export interface GrepSearchOptions {
	readonly pattern:         string;
	readonly root:            string;
	readonly glob?:           string;
	readonly caseInsensitive?: boolean;
	readonly multiline?:      boolean;
	readonly limit?:          number;
	readonly context?:        number;
	/** Test seam: the ripgrep binary and its time limit. Production passes neither. */
	readonly _backend?: { readonly rgCommand?: string; readonly rgTimeoutMs?: number } | undefined;
}

/**
 * Run a grep-style search. Prefers ripgrep; falls back to a Node
 * recursive walk when `rg` isn't on PATH. Same result shape as the
 * `search_grep` tool exposes -- exactly one code path for both the
 * tool executor + internal callers.
 *
 * Throws for an empty pattern, for an invalid regex (the fallback path
 * compiles the pattern), and when the Node backend cannot read the search
 * ROOT: a search that could not run is not a search that found nothing.
 * A single unreadable file or directory below the root does not stop the
 * scan; it is listed in `omitted.skippedFiles`, as is a file over the size
 * limit.
 */
export async function runGrepSearch(opts: GrepSearchOptions): Promise<SearchGrepData> {
	if (opts.pattern.length === 0) throw new Error('runGrepSearch: pattern is required');
	const root = resolve(opts.root);
	const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
	const context = typeof opts.context === 'number' ? Math.floor(opts.context) : 0;
	const rg = await tryRipgrepRaw(opts.pattern, root, {
		...(opts.glob !== undefined ? { glob: opts.glob } : {}),
		caseInsensitive: opts.caseInsensitive === true,
		limit,
		context,
		...(opts._backend?.rgCommand   !== undefined ? { rgCommand: opts._backend.rgCommand }     : {}),
		...(opts._backend?.rgTimeoutMs !== undefined ? { rgTimeoutMs: opts._backend.rgTimeoutMs } : {}),
	});
	if (rg.data !== null) return rg.data;

	// No `g` flag on purpose: `regex.test()` with `g` advances
	// `lastIndex` across calls, so testing many lines with one shared
	// regex silently misses matches after the first hit. `.test` on a
	// non-global regex is stateless and correct here.
	const flags = (opts.caseInsensitive === true ? 'i' : '')
		+ (opts.multiline === true ? 'm' : '');
	const regex = new RegExp(opts.pattern, flags);
	const hits: GrepHit[] = [];
	let truncated = false;
	const globRe = opts.glob !== undefined ? globToFileRegex(opts.glob) : null;
	const skippedFiles: { path: string; reason: 'too-large' | 'unreadable' }[] = [];
	const shortenedLines: { path: string; line: number; totalChars: number }[] = [];

	async function walk(dir: string): Promise<void> {
		if (hits.length >= limit) { truncated = true; return; }
		let entries;
		try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch (err) {
			// The root itself: the search could not run. Anything below it: one skipped directory.
			if (dir === root) throw err;
			skippedFiles.push({ path: relative(root, dir), reason: 'unreadable' });
			return;
		}
		for (const entry of entries) {
			if (hits.length >= limit) { truncated = true; return; }
			const name = entry.name;
			if (name.startsWith('.') || IGNORE_DIRS.has(name)) { continue; }
			const full = join(dir, name);
			if (entry.isDirectory()) { await walk(full); continue; }
			if (!entry.isFile()) { continue; }
			if (globRe && !globRe.test(name)) { continue; }
			const path = relative(root, full);
			let contents: string;
			try {
				const stat = statSync(full);
				if (stat.size > MAX_FILE_BYTES) { skippedFiles.push({ path, reason: 'too-large' }); continue; }
				contents = await fs.readFile(full, 'utf8');
			} catch {
				skippedFiles.push({ path, reason: 'unreadable' });
				continue;
			}
			const lines = contents.split('\n');
			for (let i = 0; i < lines.length; i++) {
				const text = lines[i] ?? '';
				if (regex.test(text)) {
					hits.push({ path, line: i + 1, text: text.slice(0, MAX_LINE_CHARS) });
					if (text.length > MAX_LINE_CHARS) shortenedLines.push({ path, line: i + 1, totalChars: text.length });
					if (hits.length >= limit) { truncated = true; return; }
				}
			}
		}
	}

	await walk(root);
	return {
		pattern: opts.pattern, root, usedRipgrep: false, hits, truncated,
		omitted: {
			skippedFiles,
			shortenedLines,
			perFileLimitReached: false,
			outputDiscarded:     false,
			...(rg.fallback !== undefined ? { backendFallback: rg.fallback } : {}),
			excludedByRule:      NODE_EXCLUDED_BY_RULE,
		},
	};
}

export const searchGrepTool: Tool = {
  id: 'search_grep',
  description: 'Search file contents by regex. Uses ripgrep when available, Node fallback otherwise.',
  access: searchAccess('path'),
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern.' },
      path: { type: 'string', description: 'Root directory to search. Defaults to process cwd.' },
      glob: { type: 'string', description: 'File-glob filter (e.g. "*.ts").' },
      caseInsensitive: { type: 'boolean' },
      multiline: { type: 'boolean', description: 'Node fallback only: enable multi-line matching.' },
      limit: { type: 'number', minimum: 1, maximum: MAX_LIMIT, description: `Max hits (default ${DEFAULT_LIMIT}).` },
      context: { type: 'number', description: 'Lines of context around each match (rg -C).', minimum: 0, maximum: 10 },
    },
    required: ['pattern'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const pattern = typeof input['pattern'] === 'string' ? input['pattern'] : '';
    if (!pattern) {
      return { output: '[search:grep] missing pattern', format: 'text', success: false, error: 'no pattern' };
    }
    const root = typeof input['path'] === 'string' ? resolve(input['path']) : process.cwd();
    const glob = typeof input['glob'] === 'string' ? input['glob'] : undefined;
    const caseInsensitive = input['caseInsensitive'] === true;
    const multiline = input['multiline'] === true;
    const limit = typeof input['limit'] === 'number' ? input['limit'] : undefined;
    const context = typeof input['context'] === 'number' ? input['context'] : undefined;

    let data: SearchGrepData;
    try {
      data = await runGrepSearch({
        pattern,
        root,
        ...(glob !== undefined ? { glob } : {}),
        caseInsensitive,
        multiline,
        ...(limit !== undefined ? { limit } : {}),
        ...(context !== undefined ? { context } : {}),
      });
    } catch (err) {
      // A pattern that does not compile is the caller's to fix; anything else
      // (the root could not be read) is a search that could not run.
      const error = err instanceof SyntaxError ? 'bad regex' : 'search-failed';
      return { output: `[search:grep] ${(err as Error).message}`, format: 'text', success: false, error };
    }
    return { output: renderReport(data), format: 'markdown', success: true, data };
  },
};

/**
 * `data` is ripgrep's result, or null when the Node backend must run.
 * `fallback` is set when ripgrep STARTED and failed; a missing binary is an
 * ordinary condition and sets nothing.
 */
interface RipgrepAttempt {
  readonly data:      SearchGrepData | null;
  readonly fallback?: { readonly reason: 'timeout' | 'exit-code'; readonly detail: string } | undefined;
}

async function tryRipgrepRaw(
  pattern: string,
  root: string,
  opts: {
    glob?: string | undefined; caseInsensitive: boolean; limit: number; context: number;
    rgCommand?: string | undefined; rgTimeoutMs?: number | undefined;
  },
): Promise<RipgrepAttempt> {
  const argv = [opts.rgCommand ?? 'rg', '--no-heading', '--line-number', '--color=never'];
  if (opts.caseInsensitive) { argv.push('-i'); }
  if (opts.glob) { argv.push('-g', opts.glob); }
  if (opts.context > 0) { argv.push('-C', String(opts.context)); }
  argv.push('-m', String(opts.limit));
  argv.push('-e', pattern, root);

  const timeoutMs = opts.rgTimeoutMs ?? RG_TIMEOUT_MS;
  const result = await runShell(argv, { timeoutMs, maxBytes: RG_MAX_OUTPUT_BYTES });
  if (result.spawnError) { return { data: null }; }
  if (result.timedOut) {
    return { data: null, fallback: { reason: 'timeout', detail: `ripgrep was stopped after ${timeoutMs} ms` } };
  }
  if (result.code !== 0 && result.code !== 1) {
    const stderr = result.stderr.trim().split('\n')[0] ?? '';
    return {
      data: null,
      fallback: { reason: 'exit-code', detail: `ripgrep exited with ${result.code ?? `signal ${result.signal ?? 'unknown'}`}${stderr ? `: ${stderr}` : ''}` },
    };
  }

  const hits: GrepHit[] = [];
  const shortenedLines: { path: string; line: number; totalChars: number }[] = [];
  const matchesPerFile = new Map<string, number>();
  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) { continue; }
    const match = line.match(/^(.+?):(\d+):(.*)$/);
    if (!match) { continue; }
    const path = relative(root, match[1] ?? '') || (match[1] ?? '');
    const lineNo = Number(match[2] ?? '0');
    const text = match[3] ?? '';
    matchesPerFile.set(path, (matchesPerFile.get(path) ?? 0) + 1);
    if (hits.length < opts.limit && text.length > MAX_LINE_CHARS) {
      shortenedLines.push({ path, line: lineNo, totalChars: text.length });
    }
    hits.push({ path, line: lineNo, text: text.slice(0, MAX_LINE_CHARS) });
  }
  // `-m <limit>` stops ripgrep at <limit> matches in EACH file, so a file
  // with exactly that many may hold more.
  let perFileLimitReached = false;
  for (const n of matchesPerFile.values()) {
    if (n >= opts.limit) { perFileLimitReached = true; break; }
  }

  return {
    data: {
      pattern, root,
      usedRipgrep: true,
      hits: hits.slice(0, opts.limit),
      truncated: hits.length >= opts.limit,
      omitted: {
        skippedFiles:    [],
        shortenedLines,
        perFileLimitReached,
        outputDiscarded: result.stdoutTruncated,
        excludedByRule:  RIPGREP_EXCLUDED_BY_RULE,
      },
    },
  };
}

function renderReport(d: SearchGrepData): string {
  const lines: string[] = [];
  const head = `# ${d.hits.length}${d.truncated ? '+' : ''} match${d.hits.length === 1 ? '' : 'es'} for \`${d.pattern}\` in \`${d.root}\`${d.usedRipgrep ? ' _(rg)_' : ' _(node)_'}`;
  lines.push(head);
  lines.push('');
  if (d.hits.length === 0) {
    lines.push('_No matches._');
    return lines.join('\n');
  }
  lines.push('```');
  for (const h of d.hits) {
    lines.push(`${h.path}:${h.line}: ${h.text}`);
  }
  lines.push('```');
  return lines.join('\n');
}

function globToFileRegex(glob: string): RegExp {
  // Simple glob for filenames only -- *, ?, char class.
  let re = '^';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*') { re += '[^/]*'; continue; }
    if (c === '?') { re += '[^/]'; continue; }
    if (c === '[') {
      const end = glob.indexOf(']', i + 1);
      if (end === -1) { re += '\\['; continue; }
      re += glob.slice(i, end + 1);
      i = end;
      continue;
    }
    if ('.+^$(){}|'.includes(c)) { re += '\\' + c; continue; }
    re += c;
  }
  re += '$';
  return new RegExp(re);
}

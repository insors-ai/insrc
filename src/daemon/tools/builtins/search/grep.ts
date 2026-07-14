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

export interface SearchGrepData {
  pattern: string;
  root: string;
  usedRipgrep: boolean;
  hits: GrepHit[];
  truncated: boolean;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 5000;
const IGNORE_DIRS = new Set(['.git', 'node_modules', '.build', 'out', 'dist', '.next', '.cache']);

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
}

/**
 * Run a grep-style search. Prefers ripgrep; falls back to a Node
 * recursive walk when `rg` isn't on PATH. Same result shape as the
 * `search_grep` tool exposes -- exactly one code path for both the
 * tool executor + internal callers.
 *
 * Throws only for empty pattern / invalid regex (the fallback path
 * compiles the pattern). Missing files, permission errors, and
 * binary bodies are silently skipped so a single unreadable file
 * cannot poison the whole scan.
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
	});
	if (rg !== null) return rg;

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

	async function walk(dir: string): Promise<void> {
		if (hits.length >= limit) { truncated = true; return; }
		let entries;
		try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
		for (const entry of entries) {
			if (hits.length >= limit) { truncated = true; return; }
			const name = entry.name;
			if (name.startsWith('.') || IGNORE_DIRS.has(name)) { continue; }
			const full = join(dir, name);
			if (entry.isDirectory()) { await walk(full); continue; }
			if (!entry.isFile()) { continue; }
			if (globRe && !globRe.test(name)) { continue; }
			try {
				const stat = statSync(full);
				if (stat.size > 2 * 1024 * 1024) { continue; }
				const contents = await fs.readFile(full, 'utf8');
				const lines = contents.split('\n');
				for (let i = 0; i < lines.length; i++) {
					if (regex.test(lines[i] ?? '')) {
						hits.push({ path: relative(root, full), line: i + 1, text: (lines[i] ?? '').slice(0, 500) });
						if (hits.length >= limit) { truncated = true; return; }
					}
				}
			} catch { /* skip binary / permission-denied */ }
		}
	}

	await walk(root);
	return { pattern: opts.pattern, root, usedRipgrep: false, hits, truncated };
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
      return { output: `[search:grep] ${(err as Error).message}`, format: 'text', success: false, error: 'bad regex' };
    }
    return { output: renderReport(data), format: 'markdown', success: true, data };
  },
};

async function tryRipgrepRaw(
  pattern: string,
  root: string,
  opts: { glob?: string | undefined; caseInsensitive: boolean; limit: number; context: number },
): Promise<SearchGrepData | null> {
  const argv = ['rg', '--no-heading', '--line-number', '--color=never'];
  if (opts.caseInsensitive) { argv.push('-i'); }
  if (opts.glob) { argv.push('-g', opts.glob); }
  if (opts.context > 0) { argv.push('-C', String(opts.context)); }
  argv.push('-m', String(opts.limit));
  argv.push('-e', pattern, root);

  const result = await runShell(argv, { timeoutMs: 30_000, maxBytes: 4 * 1024 * 1024 });
  if (result.spawnError) { return null; }
  if (result.code !== 0 && result.code !== 1) { return null; }

  const hits: GrepHit[] = [];
  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) { continue; }
    const match = line.match(/^(.+?):(\d+):(.*)$/);
    if (!match) { continue; }
    hits.push({
      path: relative(root, match[1] ?? '') || (match[1] ?? ''),
      line: Number(match[2] ?? '0'),
      text: (match[3] ?? '').slice(0, 500),
    });
  }

  return {
    pattern, root,
    usedRipgrep: true,
    hits: hits.slice(0, opts.limit),
    truncated: hits.length >= opts.limit,
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

/**
 * search:glob -- match files by filename pattern.
 *
 * Supports standard glob syntax: `**` (any dirs), `*` (any chars except
 * /), `?` (one char), `[abc]` (char class). Returns paths relative to
 * the search root, sorted by most-recently-modified first.
 */

import { promises as fs, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Tool, ToolInput, ToolResult } from '../../types.js';
import { searchAccess } from '../file/helpers.js';

export interface SearchGlobData {
  pattern: string;
  cwd: string;
  matches: string[];
  /** Total scanned before hit limit; absent if full scan fit. */
  truncated: boolean;
}

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;
const IGNORE_DIRS = new Set(['.git', 'node_modules', '.build', 'out', 'dist', '.next', '.cache']);

export const searchGlobTool: Tool = {
  id: 'search_glob',
  description: 'Find files by glob pattern. Returns paths sorted by mtime (newest first).',
  access: searchAccess('cwd'),
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern (e.g. "src/**/*.ts").' },
      cwd: { type: 'string', description: 'Root directory. Defaults to process cwd.' },
      limit: { type: 'number', minimum: 1, maximum: MAX_LIMIT, description: `Max matches (default ${DEFAULT_LIMIT}, cap ${MAX_LIMIT}).` },
      includeHidden: { type: 'boolean', description: 'Include dotfiles. Default false.' },
    },
    required: ['pattern'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const pattern = typeof input['pattern'] === 'string' ? input['pattern'] : '';
    if (!pattern) {
      return { output: '[search:glob] missing pattern', format: 'text', success: false, error: 'no pattern' };
    }
    const cwd = typeof input['cwd'] === 'string' ? resolve(input['cwd']) : process.cwd();
    const limit = Math.min(Math.max(1, typeof input['limit'] === 'number' ? input['limit'] : DEFAULT_LIMIT), MAX_LIMIT);
    const includeHidden = input['includeHidden'] === true;

    const regex = globToRegex(pattern);
    const matches: Array<{ path: string; mtime: number }> = [];
    let truncated = false;

    async function walk(dir: string): Promise<void> {
      if (matches.length >= limit) { truncated = true; return; }
      let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
      try { entries = await fs.readdir(dir, { withFileTypes: true }); }
      catch { return; }

      for (const entry of entries) {
        if (matches.length >= limit) { truncated = true; return; }
        const name = entry.name;
        if (!includeHidden && name.startsWith('.')) { continue; }
        if (IGNORE_DIRS.has(name)) { continue; }
        const full = join(dir, name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile()) {
          const rel = relative(cwd, full);
          if (regex.test(rel)) {
            try {
              const st = statSync(full);
              matches.push({ path: rel, mtime: st.mtimeMs });
            } catch { /* skip vanished files */ }
          }
        }
      }
    }

    await walk(cwd);
    matches.sort((a, b) => b.mtime - a.mtime);
    const paths = matches.map(m => m.path);

    const data: SearchGlobData = { pattern, cwd, matches: paths, truncated };
    const body = paths.length === 0
      ? `_No files match \`${pattern}\` under \`${cwd}\`._`
      : `# ${paths.length}${truncated ? '+' : ''} match${paths.length === 1 ? '' : 'es'} for \`${pattern}\` in \`${cwd}\`\n\n` +
        paths.map(p => `- ${p}`).join('\n');
    return { output: body, format: 'markdown', success: true, data };
  },
};

// Convert a glob pattern to a regex anchored at start+end.
// Supported syntax: **, *, ?, [abc], escapes (\*).
function globToRegex(pattern: string): RegExp {
  let re = '^';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i]!;
    if (c === '\\' && i + 1 < pattern.length) {
      re += '\\' + pattern[i + 1];
      i += 2;
      continue;
    }
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        // **  ->  .* (crosses directory boundaries)
        re += '.*';
        i += 2;
        if (pattern[i] === '/') { i++; }
        continue;
      }
      re += '[^/]*';
      i++;
      continue;
    }
    if (c === '?') { re += '[^/]'; i++; continue; }
    if (c === '[') {
      // char class -- pass through up to ]
      const end = pattern.indexOf(']', i + 1);
      if (end === -1) { re += '\\['; i++; continue; }
      re += pattern.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if ('.+^$(){}|'.includes(c)) { re += '\\' + c; i++; continue; }
    re += c;
    i++;
  }
  re += '$';
  return new RegExp(re);
}

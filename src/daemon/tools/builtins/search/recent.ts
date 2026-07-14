/**
 * search:recent -- files modified in the last N minutes.
 *
 * Useful for "what did I just touch" flows. Walks the filesystem and
 * filters by mtime. Ignores node_modules / .git / build output by
 * default.
 */

import { promises as fs, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import type { Tool, ToolInput, ToolResult } from '../../types.js';
import { searchAccess } from '../file/helpers.js';

export interface RecentEntry {
  path: string;
  bytes: number;
  mtime: string;
  /** Age in seconds at the time of the scan. */
  ageSec: number;
}

export interface SearchRecentData {
  root: string;
  minutes: number;
  matches: RecentEntry[];
  truncated: boolean;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 5000;
const IGNORE_DIRS = new Set(['.git', 'node_modules', '.build', 'out', 'dist', '.next', '.cache']);

export const searchRecentTool: Tool = {
  id: 'search_recent',
  description: 'Files modified in the last N minutes (default 60).',
  access: searchAccess('path'),
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Root to scan. Defaults to cwd.' },
      minutes: { type: 'number', minimum: 1, description: 'Lookback window. Default 60.' },
      includeHidden: { type: 'boolean' },
      limit: { type: 'number', minimum: 1, maximum: MAX_LIMIT },
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const root = typeof input['path'] === 'string' ? resolve(input['path']) : process.cwd();
    const minutes = Math.max(1, typeof input['minutes'] === 'number' ? input['minutes'] : 60);
    const includeHidden = input['includeHidden'] === true;
    const limit = Math.min(Math.max(1, typeof input['limit'] === 'number' ? input['limit'] : DEFAULT_LIMIT), MAX_LIMIT);

    const cutoff = Date.now() - minutes * 60_000;
    const matches: RecentEntry[] = [];
    let truncated = false;

    async function walk(dir: string): Promise<void> {
      if (matches.length >= limit) { truncated = true; return; }
      let entries;
      try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (matches.length >= limit) { truncated = true; return; }
        if (!includeHidden && e.name.startsWith('.')) { continue; }
        if (IGNORE_DIRS.has(e.name)) { continue; }
        const full = join(dir, e.name);
        if (e.isDirectory()) { await walk(full); continue; }
        if (!e.isFile()) { continue; }
        try {
          const st = statSync(full);
          if (st.mtimeMs >= cutoff) {
            matches.push({
              path: relative(root, full) || e.name,
              bytes: st.size,
              mtime: st.mtime.toISOString(),
              ageSec: Math.round((Date.now() - st.mtimeMs) / 1000),
            });
          }
        } catch { /* vanished / permission-denied */ }
      }
    }

    await walk(root);
    matches.sort((a, b) => a.ageSec - b.ageSec);

    const data: SearchRecentData = { root, minutes, matches, truncated };
    const body = matches.length === 0
      ? `_No files modified in the last ${minutes} min under \`${root}\`._`
      : `# ${matches.length}${truncated ? '+' : ''} recent file${matches.length === 1 ? '' : 's'} (${minutes} min) in \`${root}\`\n\n` +
        matches.map(m => `- ${m.path}  \`${m.mtime}\`  (${m.ageSec}s ago, ${m.bytes} B)`).join('\n');

    return { output: body, format: 'markdown', success: true, data };
  },
};

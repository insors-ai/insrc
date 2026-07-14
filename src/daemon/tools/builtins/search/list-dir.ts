/**
 * search:list-dir -- directory listing (optionally recursive, with filter).
 */

import { promises as fs, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import type { Tool, ToolInput, ToolResult } from '../../types.js';
import { searchAccess } from '../file/helpers.js';

export type ListDirKind = 'file' | 'directory' | 'symlink' | 'other';

export interface ListDirEntry {
  name: string;
  path: string;
  kind: ListDirKind;
  size?: number;
  mtime?: string;
}

export interface SearchListDirData {
  path: string;
  recursive: boolean;
  entries: ListDirEntry[];
  truncated: boolean;
}

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;
const IGNORE_DIRS = new Set(['.git', 'node_modules', '.build', 'out', 'dist', '.next', '.cache']);

export const searchListDirTool: Tool = {
  id: 'search_list-dir',
  description: 'List directory entries. Optionally recursive.',
  access: searchAccess('path'),
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      recursive: { type: 'boolean', description: 'Walk subdirectories.' },
      includeHidden: { type: 'boolean' },
      onlyKind: { type: 'string', enum: ['file', 'directory', 'symlink'], description: 'Filter by entry kind.' },
      limit: { type: 'number', minimum: 1, maximum: MAX_LIMIT },
    },
    required: ['path'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const pathArg = typeof input['path'] === 'string' ? input['path'] : '';
    if (!pathArg) {
      return { output: '[search:list-dir] missing path', format: 'text', success: false, error: 'no path' };
    }
    const root = resolve(pathArg);
    const recursive = input['recursive'] === true;
    const includeHidden = input['includeHidden'] === true;
    const limit = Math.min(Math.max(1, typeof input['limit'] === 'number' ? input['limit'] : DEFAULT_LIMIT), MAX_LIMIT);
    const onlyKind = typeof input['onlyKind'] === 'string' ? input['onlyKind'] as ListDirKind : undefined;

    const entries: ListDirEntry[] = [];
    let truncated = false;

    async function walk(dir: string): Promise<void> {
      if (entries.length >= limit) { truncated = true; return; }
      let list;
      try { list = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of list) {
        if (entries.length >= limit) { truncated = true; return; }
        if (!includeHidden && e.name.startsWith('.')) { continue; }
        if (recursive && IGNORE_DIRS.has(e.name)) { continue; }
        const full = join(dir, e.name);
        const kind: ListDirKind =
          e.isDirectory() ? 'directory'
          : e.isSymbolicLink() ? 'symlink'
          : e.isFile() ? 'file'
          : 'other';
        if (!onlyKind || onlyKind === kind) {
          const rec: ListDirEntry = {
            name: e.name,
            path: relative(root, full) || e.name,
            kind,
          };
          if (kind === 'file' || kind === 'symlink') {
            try {
              const st = statSync(full);
              rec.size = st.size;
              rec.mtime = st.mtime.toISOString();
            } catch { /* ignore */ }
          }
          entries.push(rec);
        }
        if (recursive && e.isDirectory()) {
          await walk(full);
        }
      }
    }

    try { await walk(root); }
    catch (err) {
      return { output: `[search:list-dir] ${(err as Error).message}`, format: 'text', success: false, error: 'walk error' };
    }

    const data: SearchListDirData = { path: root, recursive, entries, truncated };
    const body = renderReport(data);
    return { output: body, format: 'markdown', success: true, data };
  },
};

function renderReport(d: SearchListDirData): string {
  const lines: string[] = [];
  lines.push(`# ${d.path}${d.recursive ? ' (recursive)' : ''} -- ${d.entries.length}${d.truncated ? '+' : ''} entries`);
  lines.push('');
  if (d.entries.length === 0) {
    lines.push('_Empty._');
    return lines.join('\n');
  }
  for (const e of d.entries) {
    const icon = e.kind === 'directory' ? 'dir'
      : e.kind === 'symlink' ? 'sym'
      : e.kind === 'file' ? 'file'
      : 'other';
    const size = e.size !== undefined ? `  ${e.size} B` : '';
    lines.push(`- [${icon}] ${e.path}${size}`);
  }
  return lines.join('\n');
}

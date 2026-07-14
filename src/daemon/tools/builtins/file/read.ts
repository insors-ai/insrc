/**
 * file:read -- read a file (or list a directory) with optional line range.
 */

import { promises as fs } from 'node:fs';
import type { Tool, ToolInput, ToolResult } from '../../types.js';
import { resolvePath, fail, humanBytes, FS_READ_ACCESS } from './helpers.js';

export interface FileReadData {
  path: string;
  kind: 'file' | 'directory';
  bytes?: number;
  lines?: number;
  linesReturned?: number;
  startLine?: number;
  endLine?: number;
  /** For directories: entries. */
  entries?: Array<{ name: string; kind: 'file' | 'directory' | 'symlink' | 'other'; size?: number }>;
}

const DEFAULT_LIMIT = 2000;
const MAX_LIMIT = 50_000;

export const fileReadTool: Tool = {
  id: 'file_read',
  description: 'Read a file. For directories, list contents. No approval (read-only).',
  access: FS_READ_ACCESS,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute or cwd-relative path.' },
      offset: { type: 'number', description: '1-based start line.', minimum: 1 },
      limit: { type: 'number', description: `Number of lines to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`, minimum: 1, maximum: MAX_LIMIT },
      showLineNumbers: { type: 'boolean', description: 'Prefix each line with its 1-based number. Default true.' },
    },
    required: ['path'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const path = resolvePath(input);
    if (!path) { return fail('file_read', 'missing path'); }

    let stat;
    try {
      stat = await fs.stat(path);
    } catch (err) {
      return fail('file_read', `stat failed: ${(err as Error).message}`);
    }

    if (stat.isDirectory()) {
      try {
        const entries = await fs.readdir(path, { withFileTypes: true });
        const entryList = await Promise.all(entries.map(async e => {
          const kind = e.isDirectory() ? 'directory'
            : e.isSymbolicLink() ? 'symlink'
            : e.isFile() ? 'file' : 'other';
          let size: number | undefined;
          if (kind === 'file') {
            try { size = (await fs.stat(path + '/' + e.name)).size; } catch { /* ignore */ }
          }
          return { name: e.name, kind: kind as 'file' | 'directory' | 'symlink' | 'other', ...(size !== undefined ? { size } : {}) };
        }));
        const body = ['# ' + path + '  (directory, ' + entryList.length + ' entries)', '']
          .concat(entryList.map(e => `- ${e.kind === 'directory' ? '📁' : e.kind === 'symlink' ? '🔗' : '📄'} ${e.name}${e.size !== undefined ? `  (${humanBytes(e.size)})` : ''}`))
          .join('\n');
        const data: FileReadData = { path, kind: 'directory', entries: entryList };
        return { output: body, format: 'markdown', success: true, data };
      } catch (err) {
        return fail('file_read', `readdir failed: ${(err as Error).message}`);
      }
    }

    // File path
    if (stat.size > 10 * 1024 * 1024) {
      return fail('file_read', `refusing to read ${humanBytes(stat.size)} file -- use offset/limit`);
    }

    let contents: string;
    try {
      contents = await fs.readFile(path, 'utf8');
    } catch (err) {
      return fail('file_read', `read failed: ${(err as Error).message}`);
    }

    const allLines = contents.split('\n');
    const offset = typeof input['offset'] === 'number' ? Math.max(1, Math.floor(input['offset'])) : 1;
    const rawLimit = typeof input['limit'] === 'number' ? Math.floor(input['limit']) : DEFAULT_LIMIT;
    const limit = Math.max(1, Math.min(MAX_LIMIT, rawLimit));
    const showLineNumbers = input['showLineNumbers'] !== false;

    const startIdx = offset - 1;
    const endIdx = Math.min(allLines.length, startIdx + limit);
    const sliced = allLines.slice(startIdx, endIdx);
    const rendered = showLineNumbers
      ? sliced.map((l, i) => String(startIdx + i + 1).padStart(6) + '\t' + l).join('\n')
      : sliced.join('\n');

    const data: FileReadData = {
      path,
      kind: 'file',
      bytes: stat.size,
      lines: allLines.length,
      linesReturned: sliced.length,
      startLine: offset,
      endLine: startIdx + sliced.length,
    };

    const header = `# ${path}  (${humanBytes(stat.size)}, ${allLines.length} lines)` +
      (sliced.length < allLines.length ? `  -- showing lines ${offset}-${startIdx + sliced.length}` : '');

    return {
      output: header + '\n\n```\n' + rendered + '\n```',
      format: 'markdown',
      success: true,
      data,
    };
  },
};

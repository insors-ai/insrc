/**
 * file:stat -- metadata (kind / size / mtime / permissions). Read-only.
 */

import { promises as fs } from 'node:fs';
import type { Tool, ToolInput, ToolResult } from '../../types.js';
import { resolvePath, fail, humanBytes, FS_READ_ACCESS } from './helpers.js';

export interface FileStatData {
  path: string;
  kind: 'file' | 'directory' | 'symlink' | 'other';
  bytes: number;
  /** Unix-style permission bits (octal string), e.g. "755". */
  mode: string;
  mtime: string;
  ctime: string;
  atime: string;
  /** symlink target when kind=symlink. */
  linkTarget?: string;
}

export const fileStatTool: Tool = {
  id: 'file_stat',
  description: 'Get file / directory metadata (size, mtime, mode). Follows symlinks by default.',
  access: FS_READ_ACCESS,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      followSymlinks: { type: 'boolean', description: 'Default true. Set false to return symlink metadata.' },
    },
    required: ['path'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const path = resolvePath(input);
    if (!path) { return fail('file_stat', 'missing path'); }
    const follow = input['followSymlinks'] !== false;

    try {
      const stat = follow ? await fs.stat(path) : await fs.lstat(path);
      const kind: FileStatData['kind'] = stat.isFile() ? 'file'
        : stat.isDirectory() ? 'directory'
        : stat.isSymbolicLink() ? 'symlink'
        : 'other';
      const mode = (stat.mode & 0o777).toString(8);

      const data: FileStatData = {
        path,
        kind,
        bytes: stat.size,
        mode,
        mtime: stat.mtime.toISOString(),
        ctime: stat.ctime.toISOString(),
        atime: stat.atime.toISOString(),
      };

      if (kind === 'symlink') {
        try { data.linkTarget = await fs.readlink(path); } catch { /* ignore */ }
      }

      const body = [
        `# ${path}`,
        '',
        `- Kind: **${kind}**${data.linkTarget ? ` -> \`${data.linkTarget}\`` : ''}`,
        `- Size: ${humanBytes(stat.size)}`,
        `- Mode: \`0${mode}\``,
        `- Modified: ${data.mtime}`,
        `- Changed:  ${data.ctime}`,
        `- Accessed: ${data.atime}`,
      ].join('\n');

      return { output: body, format: 'markdown', success: true, data };
    } catch (err) {
      return fail('file_stat', `stat failed: ${(err as Error).message}`);
    }
  },
};

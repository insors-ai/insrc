/**
 * file:write -- write or overwrite a file. Gates with diff preview.
 */

import { promises as fs, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { resolvePath, str, fail, humanBytes, previewLines, FS_WRITE_ACCESS } from './helpers.js';

export interface FileWriteData {
  path: string;
  bytesWritten: number;
  existed: boolean;
  replacedBytes?: number;
}

export const fileWriteTool: Tool = {
  id: 'file_write',
  description: 'Write or overwrite a file. Gates with old-size -> new-size + content preview.',
  access: FS_WRITE_ACCESS,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' },
      mkdirp: { type: 'boolean', description: 'Create parent directories if missing. Default true.' },
    },
    required: ['path', 'content'],
    additionalProperties: false,
  },
  requiresApproval: true,

  async buildApprovalGate(input: ToolInput): Promise<ToolApprovalGate> {
    const path = resolvePath(input) ?? '(missing)';
    const content = str(input, 'content') ?? '';
    let previousBytes: number | undefined;
    if (existsSync(path)) {
      try { previousBytes = (await fs.stat(path)).size; } catch { /* ignore */ }
    }
    const existed = previousBytes !== undefined;
    const lines: string[] = [];
    lines.push(`Path: \`${path}\``);
    if (existed) {
      lines.push(`Overwrite existing file (${humanBytes(previousBytes ?? 0)}) with ${humanBytes(Buffer.byteLength(content))}.`);
    } else {
      lines.push(`Create new file (${humanBytes(Buffer.byteLength(content))}).`);
    }
    lines.push('');
    lines.push('**New content**');
    lines.push(previewLines(content));
    return {
      title: existed ? 'file:write (overwrite)' : 'file:write (new)',
      content: lines.join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const path = resolvePath(input);
    if (!path) { return fail('file_write', 'missing path'); }
    const content = input['content'];
    if (typeof content !== 'string') { return fail('file_write', 'content is required'); }
    const mkdirp = input['mkdirp'] !== false;

    let previousBytes = 0;
    let existed = false;
    try {
      const s = await fs.stat(path);
      previousBytes = s.size;
      existed = true;
    } catch { /* not existing is fine */ }

    if (mkdirp) {
      try { await fs.mkdir(dirname(path), { recursive: true }); }
      catch (err) { return fail('file_write', `mkdir failed: ${(err as Error).message}`); }
    }

    try {
      await fs.writeFile(path, content, 'utf8');
    } catch (err) {
      return fail('file_write', `write failed: ${(err as Error).message}`);
    }

    const bytesWritten = Buffer.byteLength(content);
    const data: FileWriteData = {
      path, bytesWritten, existed,
      ...(existed ? { replacedBytes: previousBytes } : {}),
    };
    return {
      output: existed
        ? `Overwrote \`${path}\` (${humanBytes(previousBytes)} -> ${humanBytes(bytesWritten)}).`
        : `Wrote \`${path}\` (${humanBytes(bytesWritten)}).`,
      format: 'markdown',
      success: true,
      data,
    };
  },
};

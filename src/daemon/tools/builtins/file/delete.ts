/**
 * file:delete -- delete a file or directory.
 *
 * Gate shows file size (and first 5 lines for text files) or directory
 * entry count so the user sees what they're removing. Non-empty
 * directories require recursive:true.
 */

import { promises as fs } from 'node:fs';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { resolvePath, fail, humanBytes, FS_WRITE_ACCESS } from './helpers.js';

export interface FileDeleteData {
  path: string;
  kind: 'file' | 'directory';
  bytes?: number;
  entries?: number;
  recursive?: boolean;
}

export const fileDeleteTool: Tool = {
  id: 'file_delete',
  description: 'Delete a file or directory. Gates with content preview.',
  access: FS_WRITE_ACCESS,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      recursive: { type: 'boolean', description: 'Allow removing a non-empty directory.' },
    },
    required: ['path'],
    additionalProperties: false,
  },
  requiresApproval: true,

  async buildApprovalGate(input: ToolInput): Promise<ToolApprovalGate> {
    const path = resolvePath(input) ?? '(missing)';
    const recursive = input['recursive'] === true;
    const lines: string[] = [`Path: \`${path}\``];
    try {
      const s = await fs.stat(path);
      if (s.isDirectory()) {
        let count = 0;
        try { count = (await fs.readdir(path)).length; } catch { /* ignore */ }
        lines.push(`Directory -- ${count} ${count === 1 ? 'entry' : 'entries'}${recursive ? ', **recursive**' : ''}.`);
        if (count > 0 && !recursive) {
          lines.push('Non-empty; will fail without `recursive: true`.');
        }
      } else {
        lines.push(`File -- ${humanBytes(s.size)}.`);
        try {
          const preview = await fs.readFile(path, 'utf8');
          const snippet = preview.split('\n').slice(0, 5).join('\n');
          lines.push('', '**First lines**', '```', snippet, '```');
        } catch { /* not text; skip */ }
      }
    } catch (err) {
      lines.push(`_(stat failed: ${(err as Error).message})_`);
    }
    return {
      title: 'file_delete',
      content: lines.join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const path = resolvePath(input);
    if (!path) { return fail('file_delete', 'missing path'); }
    const recursive = input['recursive'] === true;

    let stat;
    try { stat = await fs.stat(path); }
    catch (err) { return fail('file_delete', `stat failed: ${(err as Error).message}`); }

    if (stat.isDirectory()) {
      try { await fs.rm(path, { recursive, force: false }); }
      catch (err) { return fail('file_delete', `rm failed: ${(err as Error).message}`); }
      const data: FileDeleteData = { path, kind: 'directory', recursive };
      return { output: `Deleted directory \`${path}\`.`, format: 'markdown', success: true, data };
    }

    try { await fs.rm(path); }
    catch (err) { return fail('file_delete', `rm failed: ${(err as Error).message}`); }
    const data: FileDeleteData = { path, kind: 'file', bytes: stat.size };
    return { output: `Deleted \`${path}\` (${humanBytes(stat.size)}).`, format: 'markdown', success: true, data };
  },
};

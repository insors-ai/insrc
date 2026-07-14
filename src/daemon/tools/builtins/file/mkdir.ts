/**
 * file:mkdir -- create a directory (and intermediate parents by default).
 */

import { promises as fs } from 'node:fs';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { resolvePath, fail, FS_WRITE_ACCESS } from './helpers.js';

export interface FileMkdirData {
  path: string;
  createdIntermediate: boolean;
}

export const fileMkdirTool: Tool = {
  id: 'file_mkdir',
  description: 'Create a directory. Recursive by default.',
  access: FS_WRITE_ACCESS,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      recursive: { type: 'boolean', description: 'Create intermediate directories. Default true.' },
    },
    required: ['path'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const path = resolvePath(input) ?? '(missing)';
    const recursive = input['recursive'] !== false;
    return {
      title: 'file_mkdir',
      content: `Path: \`${path}\`\n${recursive ? 'Creates intermediate directories if missing.' : 'Requires parent to exist.'}`,
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const path = resolvePath(input);
    if (!path) { return fail('file_mkdir', 'missing path'); }
    const recursive = input['recursive'] !== false;

    try { await fs.mkdir(path, { recursive }); }
    catch (err) { return fail('file_mkdir', `mkdir failed: ${(err as Error).message}`); }

    const data: FileMkdirData = { path, createdIntermediate: recursive };
    return { output: `Created \`${path}\`.`, format: 'markdown', success: true, data };
  },
};

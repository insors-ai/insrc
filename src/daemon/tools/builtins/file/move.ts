/**
 * file:move -- rename or move a file / directory.
 */

import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, fail, FS_MOVE_ACCESS } from './helpers.js';

export interface FileMoveData {
  from: string;
  to: string;
  overwritten: boolean;
}

export const fileMoveTool: Tool = {
  id: 'file_move',
  description: 'Rename or move a file / directory.',
  access: FS_MOVE_ACCESS,
  inputSchema: {
    type: 'object',
    properties: {
      from: { type: 'string' },
      to: { type: 'string' },
      overwrite: { type: 'boolean', description: 'Allow replacing an existing destination.' },
      mkdirp: { type: 'boolean', description: 'Create parent directories at the destination. Default true.' },
    },
    required: ['from', 'to'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const from = str(input, 'from') ? resolve(str(input, 'from')!) : '(missing)';
    const to = str(input, 'to') ? resolve(str(input, 'to')!) : '(missing)';
    const overwrite = input['overwrite'] === true;
    return {
      title: 'file_move',
      content: [
        `**Move**`,
        `From: \`${from}\``,
        `To:   \`${to}\``,
        overwrite ? '_overwrite allowed_' : '_refuse if destination exists_',
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const from = str(input, 'from');
    const to = str(input, 'to');
    if (!from || !to) { return fail('file_move', 'from and to required'); }
    const src = resolve(from);
    const dst = resolve(to);
    const overwrite = input['overwrite'] === true;
    const mkdirp = input['mkdirp'] !== false;

    let overwritten = false;
    try {
      await fs.stat(dst);
      if (!overwrite) { return fail('file_move', 'destination exists; set overwrite:true to replace'); }
      overwritten = true;
      await fs.rm(dst, { recursive: true, force: true });
    } catch { /* destination missing; fine */ }

    if (mkdirp) {
      try { await fs.mkdir(dirname(dst), { recursive: true }); }
      catch (err) { return fail('file_move', `mkdir failed: ${(err as Error).message}`); }
    }

    try { await fs.rename(src, dst); }
    catch (err) {
      // EXDEV = cross-device: fall back to copy + rm.
      if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
        try {
          await fs.cp(src, dst, { recursive: true, force: true });
          await fs.rm(src, { recursive: true, force: true });
        } catch (err2) {
          return fail('file_move', `cross-device move failed: ${(err2 as Error).message}`);
        }
      } else {
        return fail('file_move', `rename failed: ${(err as Error).message}`);
      }
    }

    const data: FileMoveData = { from: src, to: dst, overwritten };
    return {
      output: `Moved \`${src}\` -> \`${dst}\`${overwritten ? ' (destination replaced)' : ''}.`,
      format: 'markdown',
      success: true,
      data,
    };
  },
};

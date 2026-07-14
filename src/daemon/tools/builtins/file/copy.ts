/**
 * file:copy -- copy a file or directory.
 */

import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, fail, FS_MOVE_ACCESS } from './helpers.js';

export interface FileCopyData {
  from: string;
  to: string;
  recursive: boolean;
  overwritten: boolean;
}

export const fileCopyTool: Tool = {
  id: 'file_copy',
  description: 'Copy a file or directory.',
  access: FS_MOVE_ACCESS,
  inputSchema: {
    type: 'object',
    properties: {
      from: { type: 'string' },
      to: { type: 'string' },
      recursive: { type: 'boolean', description: 'Recurse when source is a directory. Default true.' },
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
    return {
      title: 'file_copy',
      content: [
        '**Copy**',
        `From: \`${from}\``,
        `To:   \`${to}\``,
        input['overwrite'] === true ? '_overwrite allowed_' : '_refuse if destination exists_',
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
    if (!from || !to) { return fail('file_copy', 'from and to required'); }
    const src = resolve(from);
    const dst = resolve(to);
    const recursive = input['recursive'] !== false;
    const overwrite = input['overwrite'] === true;
    const mkdirp = input['mkdirp'] !== false;

    let overwritten = false;
    try {
      await fs.stat(dst);
      if (!overwrite) { return fail('file_copy', 'destination exists; set overwrite:true to replace'); }
      overwritten = true;
    } catch { /* missing is fine */ }

    if (mkdirp) {
      try { await fs.mkdir(dirname(dst), { recursive: true }); }
      catch (err) { return fail('file_copy', `mkdir failed: ${(err as Error).message}`); }
    }

    try { await fs.cp(src, dst, { recursive, force: overwrite }); }
    catch (err) { return fail('file_copy', `copy failed: ${(err as Error).message}`); }

    const data: FileCopyData = { from: src, to: dst, recursive, overwritten };
    return {
      output: `Copied \`${src}\` -> \`${dst}\`${overwritten ? ' (destination replaced)' : ''}.`,
      format: 'markdown',
      success: true,
      data,
    };
  },
};

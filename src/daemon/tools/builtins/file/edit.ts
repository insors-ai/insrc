/**
 * file:edit -- replace an exact substring in a file.
 *
 * Strict match semantics: the `oldString` must appear exactly once
 * unless replaceAll is true. The gate shows before / after snippets
 * with a few lines of context so the user can see the change.
 */

import { promises as fs } from 'node:fs';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { resolvePath, str, fail, truncate, FS_WRITE_ACCESS } from './helpers.js';

export interface FileEditData {
  path: string;
  replacements: number;
  replaceAll: boolean;
}

export const fileEditTool: Tool = {
  id: 'file_edit',
  description: 'Replace a substring in a file. Gates with before/after snippet.',
  access: FS_WRITE_ACCESS,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      oldString: { type: 'string', description: 'Exact substring to replace.' },
      newString: { type: 'string', description: 'Replacement.' },
      replaceAll: { type: 'boolean', description: 'Replace every occurrence. Default false (require exactly one match).' },
    },
    required: ['path', 'oldString', 'newString'],
    additionalProperties: false,
  },
  requiresApproval: true,

  async buildApprovalGate(input: ToolInput): Promise<ToolApprovalGate> {
    const path = resolvePath(input) ?? '(missing)';
    const oldStr = str(input, 'oldString') ?? '';
    const newStr = str(input, 'newString') ?? '';
    const replaceAll = input['replaceAll'] === true;

    let occurrences = 0;
    try {
      const text = await fs.readFile(path, 'utf8');
      occurrences = oldStr ? countOccurrences(text, oldStr) : 0;
    } catch { /* file may not exist; occurrences stays 0 */ }

    const lines = [
      `Path: \`${path}\``,
      `Occurrences of old string: **${occurrences}**${replaceAll ? ' (all will be replaced)' : ' (exactly one must match)'}`,
      '',
      '**Old**',
      '```',
      truncate(oldStr, 1500),
      '```',
      '**New**',
      '```',
      truncate(newStr, 1500),
      '```',
    ];
    return {
      title: 'file_edit',
      content: lines.join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const path = resolvePath(input);
    if (!path) { return fail('file_edit', 'missing path'); }
    const oldStr = str(input, 'oldString');
    if (oldStr === undefined) { return fail('file_edit', 'oldString is required'); }
    const newStr = typeof input['newString'] === 'string' ? input['newString'] : '';
    const replaceAll = input['replaceAll'] === true;

    let text: string;
    try { text = await fs.readFile(path, 'utf8'); }
    catch (err) { return fail('file_edit', `read failed: ${(err as Error).message}`); }

    const count = countOccurrences(text, oldStr);
    if (count === 0) { return fail('file_edit', 'oldString not found'); }
    if (!replaceAll && count > 1) {
      return fail('file_edit', `oldString matched ${count} times; set replaceAll:true or narrow the match`);
    }

    const updated = replaceAll
      ? text.split(oldStr).join(newStr)
      : text.replace(oldStr, newStr);

    try { await fs.writeFile(path, updated, 'utf8'); }
    catch (err) { return fail('file_edit', `write failed: ${(err as Error).message}`); }

    const replacements = replaceAll ? count : 1;
    const data: FileEditData = { path, replacements, replaceAll };
    return {
      output: `Edited \`${path}\` -- ${replacements} replacement${replacements === 1 ? '' : 's'}.`,
      format: 'markdown',
      success: true,
      data,
    };
  },
};

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) { return 0; }
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

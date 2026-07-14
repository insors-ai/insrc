/**
 * file:multi-edit -- apply a sequence of edits to one file atomically.
 *
 * Edits apply in order. Each edit's oldString must match in the file
 * state at its turn (earlier edits can produce matches for later ones).
 * If any edit fails, no writes are performed -- the file is left
 * untouched.
 */

import { promises as fs } from 'node:fs';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { resolvePath, fail, truncate, FS_WRITE_ACCESS } from './helpers.js';

interface EditSpec {
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

export interface FileMultiEditData {
  path: string;
  edits: number;
  totalReplacements: number;
}

export const fileMultiEditTool: Tool = {
  id: 'file_multi-edit',
  description: 'Apply multiple edits to one file atomically. All-or-nothing.',
  access: FS_WRITE_ACCESS,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      edits: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            oldString: { type: 'string' },
            newString: { type: 'string' },
            replaceAll: { type: 'boolean' },
          },
          required: ['oldString', 'newString'],
          additionalProperties: false,
        },
      },
    },
    required: ['path', 'edits'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const path = resolvePath(input) ?? '(missing)';
    const edits = parseEdits(input);
    const summaryLines: string[] = [`Path: \`${path}\``, `${edits.length} edit${edits.length === 1 ? '' : 's'}`];
    edits.forEach((e, i) => {
      summaryLines.push('', `**Edit ${i + 1}**${e.replaceAll ? ' (replaceAll)' : ''}`);
      summaryLines.push('```', truncate(e.oldString, 400), '```');
      summaryLines.push('-> ');
      summaryLines.push('```', truncate(e.newString, 400), '```');
    });
    return {
      title: 'file_multi-edit',
      content: summaryLines.join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const path = resolvePath(input);
    if (!path) { return fail('file_multi-edit', 'missing path'); }
    const edits = parseEdits(input);
    if (edits.length === 0) { return fail('file_multi-edit', 'edits must be non-empty'); }

    let text: string;
    try { text = await fs.readFile(path, 'utf8'); }
    catch (err) { return fail('file_multi-edit', `read failed: ${(err as Error).message}`); }

    let current = text;
    let totalReplacements = 0;

    for (let i = 0; i < edits.length; i++) {
      const e = edits[i]!;
      const count = countOccurrences(current, e.oldString);
      if (count === 0) {
        return fail('file_multi-edit', `edit ${i + 1}: oldString not found (no writes performed)`);
      }
      if (!e.replaceAll && count > 1) {
        return fail('file_multi-edit', `edit ${i + 1}: oldString matched ${count} times; set replaceAll:true or narrow the match`);
      }
      current = e.replaceAll
        ? current.split(e.oldString).join(e.newString)
        : current.replace(e.oldString, e.newString);
      totalReplacements += e.replaceAll ? count : 1;
    }

    try { await fs.writeFile(path, current, 'utf8'); }
    catch (err) { return fail('file_multi-edit', `write failed: ${(err as Error).message}`); }

    const data: FileMultiEditData = { path, edits: edits.length, totalReplacements };
    return {
      output: `Applied ${edits.length} edit${edits.length === 1 ? '' : 's'} to \`${path}\` (${totalReplacements} replacement${totalReplacements === 1 ? '' : 's'}).`,
      format: 'markdown',
      success: true,
      data,
    };
  },
};

function parseEdits(input: ToolInput): EditSpec[] {
  const raw = input['edits'];
  if (!Array.isArray(raw)) { return []; }
  const out: EditSpec[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') { continue; }
    const o = item as Record<string, unknown>;
    if (typeof o['oldString'] !== 'string' || typeof o['newString'] !== 'string') { continue; }
    out.push({
      oldString: o['oldString'],
      newString: o['newString'],
      ...(o['replaceAll'] === true ? { replaceAll: true } : {}),
    });
  }
  return out;
}

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

/**
 * Shared helpers for file:* tools.
 */

import { resolve } from 'node:path';
import type { ToolInput, ToolResult } from '../../types.js';
import type { AccessPolicy } from '../../../../shared/access.js';

// ---------------------------------------------------------------------------
// Access policies (plans/access-gate.md Phase 3)
// ---------------------------------------------------------------------------

/**
 * Read-style file access -- kind: 'fs-path', single key from the
 * tool's `path` arg, resolved to absolute. Standard severity: prior
 * approval bypasses on subsequent calls in the same session.
 *
 * Used by file_read, file_stat. Shared with db_file_describe /
 * sample / sample_shape (those resolve the connection's path
 * through the pool and present the same kind+key pair, so a
 * `file_read` approval covers a `db_file_describe` against the
 * same path AND vice versa).
 */
export const FS_READ_ACCESS: AccessPolicy = {
  kind: 'fs-path',
  extractKey: (input) => resolvePath(input as ToolInput, 'path'),
  describe: (input) => `read \`${String(input['path'] ?? '?')}\``,
};

/**
 * Write-style file access -- kind: 'fs-path' (shared bucket with
 * reads), single key from `path`, **destructive severity**. The
 * dispatcher fires the gate on EVERY call regardless of prior
 * approvals -- read approval doesn't auto-promote to write.
 *
 * Used by file_write, file_edit, file_multi-edit, file_delete,
 * file_mkdir.
 */
export const FS_WRITE_ACCESS: AccessPolicy = {
  kind: 'fs-path',
  extractKey: (input) => resolvePath(input as ToolInput, 'path'),
  describe: (input) => `write \`${String(input['path'] ?? '?')}\``,
  severity: 'destructive',
};

/**
 * Move/copy two-key access -- destructive on both source (move
 * deletes it) and destination (write target). Returns a string[]
 * so the dispatcher gates BOTH keys before the call runs; the
 * destructive severity makes every call re-prompt.
 *
 * Used by file_move, file_copy. (Copy is technically not
 * destructive on `from`, but distinguishing read-from + write-to
 * in a single AccessPolicy is more API surface than the call
 * shape warrants; destructive on both is the safer default.)
 */
export const FS_MOVE_ACCESS: AccessPolicy = {
  kind: 'fs-path',
  extractKey: (input) => {
    const from = resolvePath(input as ToolInput, 'from');
    const to = resolvePath(input as ToolInput, 'to');
    const keys = [from, to].filter((s): s is string => typeof s === 'string');
    return keys.length > 0 ? keys : undefined;
  },
  describe: (input) => `move/copy \`${String(input['from'] ?? '?')}\` -> \`${String(input['to'] ?? '?')}\``,
  severity: 'destructive',
};

/**
 * Search-style fs access -- kind: 'fs-path', shared bucket with
 * file_read / db_file_*. Same severity (standard) so prior approvals
 * carry over: a `file_read` approval for `/foo` covers `search_grep`
 * scanning `/foo` afterwards.
 *
 * Differs from FS_READ_ACCESS in two ways:
 *   - Reads from `argName` (search_glob uses `cwd`; the rest use `path`).
 *   - Defaults to `process.cwd()` when the arg is absent. Search tools
 *     run on cwd if no path is given, so the gate must reflect what the
 *     call will actually scan.
 */
export function searchAccess(argName: string): AccessPolicy {
  return {
    kind: 'fs-path',
    extractKey: (input) => {
      const explicit = resolvePath(input as ToolInput, argName);
      return explicit ?? resolve(process.cwd());
    },
    describe: (input) => {
      const arg = (input as Record<string, unknown>)[argName];
      const path = typeof arg === 'string' && arg.length > 0 ? arg : '<cwd>';
      return `search \`${path}\``;
    },
  };
}

export function str(input: ToolInput, key: string): string | undefined {
  const v = input[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function resolvePath(input: ToolInput, key = 'path'): string | undefined {
  const raw = str(input, key);
  if (!raw) { return undefined; }
  return resolve(raw);
}

export function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

/** Read + format bytes into a human string. */
export function humanBytes(n: number): string {
  if (n < 1024) { return `${n} B`; }
  if (n < 1024 * 1024) { return `${(n / 1024).toFixed(1)} KB`; }
  if (n < 1024 * 1024 * 1024) { return `${(n / (1024 * 1024)).toFixed(1)} MB`; }
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Truncate a string to `max` chars, adding an ellipsis marker if cut. */
export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + `\n...[truncated ${s.length - max} chars]` : s;
}

/** Format a content preview for gate content (first N lines, backtick-fenced). */
export function previewLines(content: string, maxLines = 20): string {
  const lines = content.split('\n');
  if (lines.length <= maxLines) {
    return '```\n' + content + '\n```';
  }
  return '```\n' + lines.slice(0, maxLines).join('\n') + `\n...[${lines.length - maxLines} more lines]\n\`\`\``;
}

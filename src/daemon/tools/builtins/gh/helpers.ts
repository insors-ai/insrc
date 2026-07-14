/**
 * Shared helpers for gh:* tools.
 *
 * All gh tools shell out to the `gh` CLI so authentication + .netrc +
 * GH_TOKEN + gh config "just work" with the user's existing setup.
 * We rely on --json for structured output wherever gh supports it.
 */

import { runShell, type ShellResult } from '../../shell-helper.js';
import type { ToolInput, ToolResult } from '../../types.js';

export function str(input: ToolInput, key: string): string | undefined {
  const v = input[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function num(input: ToolInput, key: string): number | undefined {
  const v = input[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function strArr(input: ToolInput, key: string): string[] | undefined {
  const v = input[key];
  if (!Array.isArray(v)) { return undefined; }
  const out = (v as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0);
  return out.length > 0 ? out : undefined;
}

export function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

export function shellFail(id: string, r: ShellResult): ToolResult {
  if (r.spawnError) {
    return { output: `[${id}] gh CLI not on PATH or failed to spawn -- ${r.stderr.trim()}`, format: 'text', success: false, error: 'gh not found' };
  }
  const msg = r.stderr.trim() || r.stdout.trim() || `exit ${r.code}`;
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

export async function ghExec(argv: string[], opts: { cwd?: string | undefined; timeoutMs?: number; maxBytes?: number } = {}): Promise<ShellResult> {
  return runShell(argv, {
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs ?? 30_000,
    maxBytes: opts.maxBytes ?? 4 * 1024 * 1024,
  });
}

/** Parse gh's JSON stdout. Tolerates empty output (returns []). */
export function parseJson<T = unknown>(raw: string): T | undefined {
  const trimmed = raw.trim();
  if (!trimmed) { return undefined; }
  try { return JSON.parse(trimmed) as T; } catch { return undefined; }
}

/** Pass labels / assignees as comma-separated strings to gh, which is the CLI convention. */
export function joinCsv(arr: string[] | undefined): string | undefined {
  return arr && arr.length > 0 ? arr.join(',') : undefined;
}

/** Escape pipe chars for markdown tables. */
export function md(s: string): string {
  return s.replace(/\|/g, '\\|');
}

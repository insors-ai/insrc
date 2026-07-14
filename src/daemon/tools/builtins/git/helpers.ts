/**
 * Shared helpers for git tools.
 */

import { runShell } from '../../shell-helper.js';
import type { ToolInput, ToolResult } from '../../types.js';

export function str(input: ToolInput, key: string): string | undefined {
  const v = input[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function spawnFail(id: string, err: string): ToolResult {
  return {
    output: `[${id}] cannot spawn git -- ${err.trim() || 'unknown error'}`,
    format: 'text', success: false, error: 'git not found',
  };
}

export function fail(id: string, stderr: string, stdout: string, code: number | null): ToolResult {
  const msg = stderr.trim() || stdout.trim() || `exit ${code}`;
  return { output: `[${id}] failed: ${msg}`, format: 'text', success: false, error: msg };
}

/**
 * Resolve the current branch. Returns undefined for genuine detached
 * HEAD; returns the branch name even when the branch is unborn (fresh
 * repo with no commits yet) so initial commits aren't blocked.
 * `git symbolic-ref` succeeds on unborn branches but fails on
 * detached HEAD, which is the distinction we want.
 */
export async function currentBranch(cwd: string): Promise<string | undefined> {
  const res = await runShell(['git', 'symbolic-ref', '--short', 'HEAD'], { cwd, timeoutMs: 5_000 });
  if (res.code !== 0) { return undefined; }
  const name = res.stdout.trim();
  return name ? name : undefined;
}

/** Short-SHA for HEAD (or any ref). Returns empty string on failure. */
export async function revParse(cwd: string, ref: string): Promise<string> {
  const res = await runShell(['git', 'rev-parse', '--short', ref], { cwd, timeoutMs: 5_000 });
  return res.code === 0 ? res.stdout.trim() : '';
}

/** Number of commits the working index would include, i.e. staged file count. */
export async function stagedCount(cwd: string): Promise<number> {
  const res = await runShell(['git', 'diff', '--cached', '--name-only'], { cwd, timeoutMs: 5_000 });
  if (res.code !== 0) { return 0; }
  return res.stdout.split('\n').map(s => s.trim()).filter(Boolean).length;
}

/** Short summary of staged changes for the approval gate. */
export async function stagedSummary(cwd: string, maxFiles = 20): Promise<string> {
  const res = await runShell(['git', 'diff', '--cached', '--numstat'], { cwd, timeoutMs: 5_000 });
  if (res.code !== 0) { return '_(unable to read staged changes)_'; }
  const lines = res.stdout.split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length === 0) { return '_(index is empty)_'; }
  const body: string[] = [];
  for (const line of lines.slice(0, maxFiles)) {
    const parts = line.split('\t');
    if (parts.length < 3) { continue; }
    const ins = parts[0] ?? '-';
    const del = parts[1] ?? '-';
    const path = parts.slice(2).join('\t');
    const delta = ins === '-' || del === '-' ? 'binary' : `+${ins} / -${del}`;
    body.push(`- \`${path}\` -- ${delta}`);
  }
  if (lines.length > maxFiles) { body.push(`- _... and ${lines.length - maxFiles} more_`); }
  return body.join('\n');
}

/**
 * AccessPolicy values for shell_* tools.
 *
 * All shell execution is treated as `kind: 'shell-command'` with
 * destructive severity, so the gate fires on every call regardless of
 * prior approvals -- a `shell_exec` running `ls` doesn't auto-promote
 * to `shell_exec` running `rm -rf /`.
 *
 * The extracted key is the command-line itself (argv joined, command
 * literal, or pipeline script). It's not used for the bypass fast path
 * (destructive ops always re-prompt) but the AccessStore still records
 * the approval against this key for audit purposes.
 */

import type { AccessPolicy } from '../../../../shared/access.js';

const MAX_CMD_LABEL = 80;

function extractCmdLine(input: Record<string, unknown>): string | undefined {
  const argv = Array.isArray(input['argv']) ? (input['argv'] as unknown[]).map(String) : [];
  if (argv.length > 0) return argv.join(' ');
  const cmd = typeof input['command'] === 'string' ? input['command'] : '';
  return cmd.length > 0 ? cmd : undefined;
}

function truncateCmd(s: string, max = MAX_CMD_LABEL): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/**
 * Used by shell_exec and shell_exec-detached. Both accept argv | command.
 */
export const SHELL_EXEC_ACCESS: AccessPolicy = {
  kind: 'shell-command',
  extractKey: (input) => extractCmdLine(input as Record<string, unknown>),
  describe: (input) => {
    const cmd = extractCmdLine(input as Record<string, unknown>);
    return cmd ? `run \`${truncateCmd(cmd)}\`` : 'run shell command';
  },
  severity: 'destructive',
};

/**
 * Used by shell_exec-pipeline. The whole script is the gate identity.
 */
export const SHELL_PIPELINE_ACCESS: AccessPolicy = {
  kind: 'shell-command',
  extractKey: (input) => {
    const script = typeof (input as Record<string, unknown>)['script'] === 'string'
      ? (input as Record<string, unknown>)['script'] as string
      : '';
    return script.length > 0 ? script : undefined;
  },
  describe: (input) => {
    const script = typeof (input as Record<string, unknown>)['script'] === 'string'
      ? (input as Record<string, unknown>)['script'] as string
      : '';
    if (!script) return 'run shell pipeline';
    const lineCount = script.split('\n').length;
    const firstLine = (script.split('\n')[0] ?? '').trim();
    return `run pipeline (${lineCount} line${lineCount === 1 ? '' : 's'}, starts with \`${truncateCmd(firstLine, 60)}\`)`;
  },
  severity: 'destructive',
};

/**
 * shell:exec -- run a single command.
 *
 * Always gates. The `argv` form (array) is preferred -- no shell
 * expansion, no injection risk. The `command` form (string) runs via
 * `bash -c` so shell features (pipes, redirects, substitutions) work,
 * but the gate UI calls it out explicitly.
 *
 * Returns { stdout, stderr, code } structured so the caller can parse
 * cleanly without stripping stderr noise.
 */

import { runShell, type ShellResult } from '../../shell-helper.js';
import { getToolSettings } from '../../config.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { SHELL_EXEC_ACCESS } from './access-policies.js';

export interface ShellExecData {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  signal?: string;
  durationMs: number;
}

// NOTE: DEFAULT_TIMEOUT_MS is a fallback constant used only when the
// tool settings snapshot isn't available. The real default comes from
// insrc.tools.shell.defaultTimeoutMs (pushed from the IDE).
const DEFAULT_TIMEOUT_MS = 120_000;   // 2 min
const MAX_TIMEOUT_MS = 600_000;       // 10 min hard cap
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;  // 1 MB
const MAX_MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // 10 MB hard cap

export const shellExecTool: Tool = {
  id: 'shell_exec',
  description: 'Run a single command and return structured stdout/stderr/exit.',
  access: SHELL_EXEC_ACCESS,
  inputSchema: {
    type: 'object',
    properties: {
      argv: {
        type: 'array',
        items: { type: 'string' },
        description: 'Argv form. Preferred. No shell expansion -- safe from injection.',
      },
      command: {
        type: 'string',
        description: 'String form. Runs via `bash -c` so pipes / redirects / substitutions work. Only use when shell features are needed.',
      },
      cwd: { type: 'string' },
      env: { type: 'object', additionalProperties: { type: 'string' }, description: 'Extra environment variables to merge in.' },
      timeoutMs: { type: 'number', minimum: 100, maximum: MAX_TIMEOUT_MS, description: `Default ${DEFAULT_TIMEOUT_MS} ms, cap ${MAX_TIMEOUT_MS} ms.` },
      maxOutputBytes: { type: 'number', minimum: 1024, maximum: MAX_MAX_OUTPUT_BYTES },
    },
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const cwd = String(input['cwd'] ?? process.cwd());
    const argv = Array.isArray(input['argv']) ? (input['argv'] as unknown[]).map(String) : [];
    const command = String(input['command'] ?? '');
    const configDefault = getToolSettings().shell.defaultTimeoutMs;
    const timeoutMs = typeof input['timeoutMs'] === 'number' ? input['timeoutMs'] : configDefault;
    const usesShell = argv.length === 0 && !!command;

    const lines: string[] = [];
    lines.push(`Repo: \`${cwd}\``);
    if (usesShell) {
      lines.push('**Shell command** (runs through `bash -c` -- can expand globs, redirect, pipe)');
      lines.push('```bash');
      lines.push(command);
      lines.push('```');
    } else if (argv.length > 0) {
      lines.push('**Argv** (no shell expansion)');
      lines.push('```');
      lines.push(argv.map(a => /[\s"']/.test(a) ? JSON.stringify(a) : a).join(' '));
      lines.push('```');
    } else {
      lines.push('_(empty command)_');
    }
    lines.push(`Timeout: ${Math.round(timeoutMs / 1000)}s`);

    return {
      title: usesShell ? 'shell:exec (via bash -c)' : 'shell_exec',
      content: lines.join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
        { name: 'edit', label: 'Edit', needsInput: true },
      ],
    };
  },

  applyEdit(input: ToolInput, feedback: string): ToolInput {
    // Edit replaces the string form. If the caller was using argv, we
    // promote the edit to the command form so the user can rewrite
    // freely without reshaping the argv array.
    return { ...input, argv: undefined, command: feedback };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = typeof input['cwd'] === 'string' ? input['cwd'] : process.cwd();
    const argv = Array.isArray(input['argv']) ? (input['argv'] as unknown[]).map(String) : [];
    const command = typeof input['command'] === 'string' ? input['command'] : '';
    const extraEnv = input['env'] && typeof input['env'] === 'object' ? input['env'] as Record<string, string> : undefined;
    const timeoutMs = Math.min(
      typeof input['timeoutMs'] === 'number' ? input['timeoutMs'] : getToolSettings().shell.defaultTimeoutMs,
      MAX_TIMEOUT_MS,
    );
    const maxBytes = Math.min(
      typeof input['maxOutputBytes'] === 'number' ? input['maxOutputBytes'] : DEFAULT_MAX_OUTPUT_BYTES,
      MAX_MAX_OUTPUT_BYTES,
    );

    if (argv.length === 0 && !command) {
      return { output: '[shell:exec] empty argv and command', format: 'text', success: false, error: 'empty' };
    }

    const env = extraEnv ? { ...process.env, ...extraEnv } : process.env;
    const effectiveArgv = argv.length > 0 ? argv : ['bash', '-c', command];
    const started = Date.now();
    const result: ShellResult = await runShell(effectiveArgv, { cwd, env, timeoutMs, maxBytes });
    const durationMs = Date.now() - started;

    const data: ShellExecData = {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.code,
      timedOut: result.timedOut,
      durationMs,
      ...(result.signal ? { signal: result.signal } : {}),
    };

    if (result.spawnError) {
      return {
        output: `[shell:exec] spawn failed -- ${result.stderr.trim()}`,
        format: 'text',
        success: false,
        error: 'spawn error',
        data,
      };
    }

    const ok = result.code === 0;
    const body = [
      ok ? `Command exited 0 in ${durationMs} ms.` : `**Exit ${result.code}${result.timedOut ? ' (timed out)' : ''}** after ${durationMs} ms.`,
      result.stdout ? '\n**stdout**\n```\n' + result.stdout.replace(/\n+$/, '') + '\n```' : '',
      result.stderr ? '\n**stderr**\n```\n' + result.stderr.replace(/\n+$/, '') + '\n```' : '',
    ].filter(Boolean).join('\n');

    return {
      output: body,
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${result.code}` }),
      data,
    };
  },
};

/**
 * shell:exec-pipeline -- run a multi-stage bash script.
 *
 * Equivalent to `bash -c <script>` but with the whole script shown in
 * the approval gate and an explicit `set -euo pipefail` prepended by
 * default so a failing stage aborts the pipeline instead of silently
 * continuing.
 *
 * Use shell:exec for a single command. Use this tool when you need
 * multi-step orchestration: `cd X && make && make test && echo ok`.
 */

import { runShell, type ShellResult } from '../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { SHELL_PIPELINE_ACCESS } from './access-policies.js';

export interface ShellPipelineData {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  scriptBytes: number;
}

const DEFAULT_TIMEOUT_MS = 300_000;  // 5 min
const MAX_TIMEOUT_MS = 1_800_000;    // 30 min hard cap

export const shellExecPipelineTool: Tool = {
  id: 'shell_exec-pipeline',
  description: 'Run a multi-stage bash script. Whole script shown in the gate; fails fast with `set -euo pipefail` by default.',
  access: SHELL_PIPELINE_ACCESS,
  inputSchema: {
    type: 'object',
    properties: {
      script: { type: 'string', description: 'Bash script body.' },
      cwd: { type: 'string' },
      env: { type: 'object', additionalProperties: { type: 'string' } },
      timeoutMs: { type: 'number', minimum: 1000, maximum: MAX_TIMEOUT_MS, description: `Default ${DEFAULT_TIMEOUT_MS} ms, cap ${MAX_TIMEOUT_MS} ms.` },
      strict: { type: 'boolean', description: 'Prepend `set -euo pipefail`. Default true.' },
    },
    required: ['script'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const cwd = String(input['cwd'] ?? process.cwd());
    const script = String(input['script'] ?? '');
    const timeoutMs = typeof input['timeoutMs'] === 'number' ? input['timeoutMs'] : DEFAULT_TIMEOUT_MS;
    const strict = input['strict'] !== false;
    const preview = script.length > 4000 ? script.slice(0, 4000) + '\n...[truncated]' : script;
    return {
      title: 'shell_exec-pipeline',
      content: [
        `Repo: \`${cwd}\``,
        `Timeout: ${Math.round(timeoutMs / 1000)}s`,
        strict ? 'Mode: **strict** (`set -euo pipefail` prepended)' : 'Mode: lenient (no strict mode)',
        '',
        '**Script**',
        '```bash',
        preview,
        '```',
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
        { name: 'edit', label: 'Edit', needsInput: true },
      ],
    };
  },

  applyEdit(input: ToolInput, feedback: string): ToolInput {
    return { ...input, script: feedback };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = typeof input['cwd'] === 'string' ? input['cwd'] : process.cwd();
    const script = typeof input['script'] === 'string' ? input['script'] : '';
    if (!script.trim()) {
      return { output: '[shell:exec-pipeline] empty script', format: 'text', success: false, error: 'empty script' };
    }
    const strict = input['strict'] !== false;
    const extraEnv = input['env'] && typeof input['env'] === 'object' ? input['env'] as Record<string, string> : undefined;
    const timeoutMs = Math.min(
      typeof input['timeoutMs'] === 'number' ? input['timeoutMs'] : DEFAULT_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    );

    const prepared = strict
      ? 'set -euo pipefail\n' + script
      : script;

    const env = extraEnv ? { ...process.env, ...extraEnv } : process.env;
    const started = Date.now();
    const result: ShellResult = await runShell(['bash', '-c', prepared], { cwd, env, timeoutMs, maxBytes: 4 * 1024 * 1024 });
    const durationMs = Date.now() - started;

    const data: ShellPipelineData = {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.code,
      timedOut: result.timedOut,
      durationMs,
      scriptBytes: Buffer.byteLength(prepared),
    };

    if (result.spawnError) {
      return { output: `[shell:exec-pipeline] spawn failed -- ${result.stderr.trim()}`, format: 'text', success: false, error: 'spawn error', data };
    }

    const ok = result.code === 0;
    const body = [
      ok ? `Pipeline OK in ${durationMs} ms.` : `**Pipeline failed** with exit ${result.code}${result.timedOut ? ' (timed out)' : ''} after ${durationMs} ms.`,
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

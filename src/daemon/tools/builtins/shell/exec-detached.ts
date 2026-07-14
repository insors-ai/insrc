/**
 * shell:exec-detached -- run a long-lived command, tail its output.
 *
 * Intended for dev servers / file watchers / `npm run watch` / `tail
 * -f` use cases. The command runs for up to maxRuntimeMs (hard cap
 * 30 minutes) and stdout/stderr are streamed to the caller as
 * `progress` events, giving the chat a live tail.
 *
 * The tool returns when the command exits on its own OR maxRuntimeMs
 * elapses (whichever comes first). The approval gate makes clear how
 * long the process may run.
 */

import { spawn } from 'node:child_process';
import type { Tool, ToolApprovalGate, ToolDeps, ToolInput, ToolResult } from '../../types.js';
import { SHELL_EXEC_ACCESS } from './access-policies.js';

export interface ShellExecDetachedData {
  exitCode: number | null;
  timedOut: boolean;
  signal?: string;
  stdoutBytes: number;
  stderrBytes: number;
  durationMs: number;
}

const DEFAULT_MAX_RUNTIME_MS = 10 * 60_000;  // 10 min
const HARD_MAX_RUNTIME_MS = 30 * 60_000;     // 30 min
const LINE_STREAM_FLUSH_CHARS = 256;

export const shellExecDetachedTool: Tool = {
  id: 'shell_exec-detached',
  description: 'Run a long-lived command; streams output to the caller and returns when the process exits or the runtime cap elapses.',
  access: SHELL_EXEC_ACCESS,
  inputSchema: {
    type: 'object',
    properties: {
      argv: { type: 'array', items: { type: 'string' } },
      command: { type: 'string' },
      cwd: { type: 'string' },
      env: { type: 'object', additionalProperties: { type: 'string' } },
      maxRuntimeMs: {
        type: 'number',
        minimum: 1000,
        maximum: HARD_MAX_RUNTIME_MS,
        description: `How long the process may run before SIGKILL. Default ${DEFAULT_MAX_RUNTIME_MS} ms, hard cap ${HARD_MAX_RUNTIME_MS} ms.`,
      },
    },
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const cwd = String(input['cwd'] ?? process.cwd());
    const argv = Array.isArray(input['argv']) ? (input['argv'] as unknown[]).map(String) : [];
    const command = String(input['command'] ?? '');
    const maxRuntimeMs = Math.min(
      typeof input['maxRuntimeMs'] === 'number' ? input['maxRuntimeMs'] : DEFAULT_MAX_RUNTIME_MS,
      HARD_MAX_RUNTIME_MS,
    );
    const usesShell = argv.length === 0 && !!command;

    const lines: string[] = [];
    lines.push(`Repo: \`${cwd}\``);
    lines.push(`Long-lived process (may run up to ${Math.round(maxRuntimeMs / 1000)}s).`);
    lines.push('Output will stream live.');
    lines.push('');
    if (usesShell) {
      lines.push('**Shell command**');
      lines.push('```bash');
      lines.push(command);
      lines.push('```');
    } else if (argv.length > 0) {
      lines.push('**Argv**');
      lines.push('```');
      lines.push(argv.map(a => /[\s"']/.test(a) ? JSON.stringify(a) : a).join(' '));
      lines.push('```');
    }

    return {
      title: 'shell_exec-detached',
      content: lines.join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
    const cwd = typeof input['cwd'] === 'string' ? input['cwd'] : process.cwd();
    const argv = Array.isArray(input['argv']) ? (input['argv'] as unknown[]).map(String) : [];
    const command = typeof input['command'] === 'string' ? input['command'] : '';
    const extraEnv = input['env'] && typeof input['env'] === 'object' ? input['env'] as Record<string, string> : undefined;
    const maxRuntimeMs = Math.min(
      typeof input['maxRuntimeMs'] === 'number' ? input['maxRuntimeMs'] : DEFAULT_MAX_RUNTIME_MS,
      HARD_MAX_RUNTIME_MS,
    );

    if (argv.length === 0 && !command) {
      return { output: '[shell:exec-detached] empty argv and command', format: 'text', success: false, error: 'empty' };
    }

    const effectiveArgv = argv.length > 0 ? argv : ['bash', '-c', command];
    const [cmd, ...args] = effectiveArgv;
    const env = extraEnv ? { ...process.env, ...extraEnv } : process.env;

    const started = Date.now();
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutBuffer = '';
    let stderrBuffer = '';

    return new Promise<ToolResult>(resolve => {
      const child = spawn(cmd!, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
      let timedOut = false;

      const flushStdout = () => {
        if (stdoutBuffer) {
          deps.send({ id: deps.requestId, stream: 'progress', data: { message: stdoutBuffer } });
          stdoutBuffer = '';
        }
      };
      const flushStderr = () => {
        if (stderrBuffer) {
          deps.send({ id: deps.requestId, stream: 'progress', data: { message: '[stderr] ' + stderrBuffer } });
          stderrBuffer = '';
        }
      };

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, maxRuntimeMs);

      const onAbort = () => { child.kill('SIGKILL'); };
      deps.signal?.addEventListener('abort', onAbort, { once: true });

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        stdoutBytes += chunk.length;
        stdoutBuffer += text;
        if (stdoutBuffer.length >= LINE_STREAM_FLUSH_CHARS || stdoutBuffer.includes('\n')) {
          flushStdout();
        }
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        stderrBytes += chunk.length;
        stderrBuffer += text;
        if (stderrBuffer.length >= LINE_STREAM_FLUSH_CHARS || stderrBuffer.includes('\n')) {
          flushStderr();
        }
      });

      child.on('error', err => {
        clearTimeout(timer);
        deps.signal?.removeEventListener('abort', onAbort);
        flushStdout(); flushStderr();
        resolve({
          output: `[shell:exec-detached] spawn failed -- ${err.message}`,
          format: 'text',
          success: false,
          error: 'spawn error',
        });
      });

      child.on('close', (code, signal) => {
        clearTimeout(timer);
        deps.signal?.removeEventListener('abort', onAbort);
        flushStdout(); flushStderr();
        const durationMs = Date.now() - started;
        const data: ShellExecDetachedData = {
          exitCode: code,
          timedOut,
          stdoutBytes,
          stderrBytes,
          durationMs,
          ...(signal ? { signal } : {}),
        };
        const ok = code === 0 && !timedOut;
        const body = [
          ok ? `Process exited 0 after ${durationMs} ms.` : `Process ended${timedOut ? ' (timed out)' : ''} with code ${code} after ${durationMs} ms.`,
          `Output: ${stdoutBytes} B stdout, ${stderrBytes} B stderr (streamed live).`,
        ].join('\n');
        resolve({
          output: body,
          format: 'markdown',
          success: ok,
          ...(ok ? {} : { error: timedOut ? 'runtime cap exceeded' : `exit ${code}` }),
          data,
        });
      });
    });
  },
};

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

import { onUtf8Data } from '../../../../shared/utf8-stream.js';
import { spawnManaged } from '../../shell-helper.js';
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
  approval: 'common',

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

    // What the tool reports once the process has ended (or never started): the same for an exit, an abort and a time-out.
    const ended = (code: number | null, signal: string | null, timedOut: boolean): ToolResult => {
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
      return {
        output: body,
        format: 'markdown',
        success: ok,
        ...(ok ? {} : { error: timedOut ? 'runtime cap exceeded' : `exit ${code}` }),
        data,
      };
    };

    // The shared lifecycle owns the process group, the runtime cap and the abort; with an already-aborted
    // signal nothing is spawned and the result is the one an aborted run gives.
    const m = spawnManaged(cmd!, args, { cwd, env, timeoutMs: maxRuntimeMs, signal: deps.signal });
    if (!m.spawned) { return ended(null, null, false); }
    const { child } = m;

    return new Promise<ToolResult>(resolve => {
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

      onUtf8Data(child.stdout!, (decodedChunk, chunkBytes) => {
        stdoutBytes += chunkBytes;
        stdoutBuffer += decodedChunk;
        if (stdoutBuffer.length >= LINE_STREAM_FLUSH_CHARS || stdoutBuffer.includes('\n')) {
          flushStdout();
        }
      });
      onUtf8Data(child.stderr!, (decodedChunk, chunkBytes) => {
        stderrBytes += chunkBytes;
        stderrBuffer += decodedChunk;
        if (stderrBuffer.length >= LINE_STREAM_FLUSH_CHARS || stderrBuffer.includes('\n')) {
          flushStderr();
        }
      });

      child.on('error', err => {
        flushStdout(); flushStderr();
        resolve({
          output: `[shell:exec-detached] spawn failed -- ${err.message}`,
          format: 'text',
          success: false,
          error: 'spawn error',
        });
      });

      void m.settled.then(exit => {
        flushStdout(); flushStderr();
        resolve(ended(exit.code, exit.signal, exit.timedOut));
      });
    });
  },
};

/**
 * SSH tools -- exec / exec-detached / scp upload+download / port-forward.
 *
 * All shell out to the system `ssh` / `scp` clients, so the user's
 * existing ~/.ssh/config aliases, agent-forwarded keys, and
 * ControlPersist just work. `host` accepts either a config alias
 * ("my-dev") or the canonical form ("user@host[:port]").
 */

import { spawn } from 'node:child_process';
import { runShell } from '../../shell-helper.js';
import { registerTool } from '../../registry.js';
import type {
  Tool, ToolApprovalGate, ToolDeps, ToolInput, ToolResult,
} from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(input: ToolInput, key: string): string | undefined {
  const v = input[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function num(input: ToolInput, key: string): number | undefined {
  const v = input[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

/**
 * Convert `user@host:port` into the argv ssh needs. An alias like
 * "my-dev" passes straight through (ssh resolves it against
 * ~/.ssh/config). `user@host` and `user@host:port` get `-p` split out.
 */
function parseHost(host: string): { target: string; port?: number } {
  // If there's no `:` it's either an alias or user@host.
  const colon = host.lastIndexOf(':');
  if (colon < 0 || host.includes('/')) { return { target: host }; }
  const target = host.slice(0, colon);
  const portStr = host.slice(colon + 1);
  const port = Number(portStr);
  if (!Number.isFinite(port) || port <= 0) { return { target: host }; }
  return { target, port };
}

/** Patterns that cost an approval gate even for `scp:download`. */
const SENSITIVE_DOWNLOAD_PATTERNS = [
  /^\/etc(\/|$)/,
  /^\/var\/log(\/|$)/,
  /^\/root(\/|$)/,
  /secret/i,
  /\.key$/,
  /\.pem$/,
];
const LARGE_DOWNLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

function downloadIsSensitive(remotePath: string): boolean {
  return SENSITIVE_DOWNLOAD_PATTERNS.some(re => re.test(remotePath));
}

// ---------------------------------------------------------------------------
// ssh:exec
// ---------------------------------------------------------------------------

interface SshExecData {
  host: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

const DEFAULT_EXEC_TIMEOUT = 120_000;

export const sshExecTool: Tool = {
  id: 'ssh_exec',
  description: 'Run a command on a remote host via ssh. Supports ~/.ssh/config aliases.',
  inputSchema: {
    type: 'object',
    properties: {
      host: { type: 'string', description: 'Alias or user@host[:port].' },
      command: { type: 'string', description: 'Command to run. Remote shell interprets it.' },
      timeoutMs: { type: 'number', minimum: 1000, maximum: 600_000 },
      identity: { type: 'string', description: 'Path to a specific private key (-i).' },
      extraArgs: { type: 'array', items: { type: 'string' }, description: 'Extra ssh flags.' },
    },
    required: ['host', 'command'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    return {
      title: 'ssh_exec',
      content: [
        `Host: **${str(input, 'host')}**`,
        '',
        '**Command**',
        '```bash',
        str(input, 'command') ?? '',
        '```',
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
        { name: 'edit', label: 'Edit command', needsInput: true },
      ],
    };
  },

  applyEdit(input: ToolInput, feedback: string): ToolInput {
    return { ...input, command: feedback };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const host = str(input, 'host');
    const command = str(input, 'command');
    if (!host || !command) { return fail('ssh_exec', 'host and command required'); }

    const { target, port } = parseHost(host);
    const argv = ['ssh', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'BatchMode=yes'];
    if (port) { argv.push('-p', String(port)); }
    if (str(input, 'identity')) { argv.push('-i', str(input, 'identity')!); }
    const extra = Array.isArray(input['extraArgs']) ? (input['extraArgs'] as unknown[]).map(String) : [];
    argv.push(...extra);
    argv.push(target, '--', command);

    const timeoutMs = Math.min(num(input, 'timeoutMs') ?? DEFAULT_EXEC_TIMEOUT, 600_000);
    const started = Date.now();
    const r = await runShell(argv, { timeoutMs });
    const durationMs = Date.now() - started;

    if (r.spawnError) { return fail('ssh_exec', `ssh not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: SshExecData = {
      host, exitCode: r.code, stdout: r.stdout, stderr: r.stderr,
      timedOut: r.timedOut, durationMs,
    };
    const body = [
      ok ? `Exit 0 in ${durationMs} ms on **${host}**.` : `**Exit ${r.code}${r.timedOut ? ' (timed out)' : ''}** on **${host}** after ${durationMs} ms.`,
      r.stdout ? '\n**stdout**\n```\n' + r.stdout.replace(/\n+$/, '') + '\n```' : '',
      r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
    ].filter(Boolean).join('\n');
    return {
      output: body,
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

// ---------------------------------------------------------------------------
// ssh:exec-detached -- streams output via deps.send
// ---------------------------------------------------------------------------

interface SshExecDetachedData {
  host: string;
  exitCode: number | null;
  timedOut: boolean;
  stdoutBytes: number;
  stderrBytes: number;
  durationMs: number;
}

const DEFAULT_DETACHED_RUNTIME = 10 * 60_000;
const MAX_DETACHED_RUNTIME = 30 * 60_000;
const LINE_FLUSH_CHARS = 256;

export const sshExecDetachedTool: Tool = {
  id: 'ssh:exec-detached',
  description: 'Long-running command on a remote host. Streams output live; runtime is capped.',
  inputSchema: {
    type: 'object',
    properties: {
      host: { type: 'string' },
      command: { type: 'string' },
      maxRuntimeMs: { type: 'number', minimum: 1000, maximum: MAX_DETACHED_RUNTIME },
      identity: { type: 'string' },
      extraArgs: { type: 'array', items: { type: 'string' } },
    },
    required: ['host', 'command'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const maxRuntime = Math.min(num(input, 'maxRuntimeMs') ?? DEFAULT_DETACHED_RUNTIME, MAX_DETACHED_RUNTIME);
    return {
      title: 'ssh:exec-detached',
      content: [
        `Host: **${str(input, 'host')}**`,
        `Long-lived process (up to ${Math.round(maxRuntime / 1000)}s). Output streams live.`,
        '',
        '**Command**',
        '```bash',
        str(input, 'command') ?? '',
        '```',
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
    const host = str(input, 'host');
    const command = str(input, 'command');
    if (!host || !command) { return fail('ssh:exec-detached', 'host and command required'); }
    const maxRuntimeMs = Math.min(num(input, 'maxRuntimeMs') ?? DEFAULT_DETACHED_RUNTIME, MAX_DETACHED_RUNTIME);

    const { target, port } = parseHost(host);
    const argv = ['ssh', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'BatchMode=yes'];
    if (port) { argv.push('-p', String(port)); }
    if (str(input, 'identity')) { argv.push('-i', str(input, 'identity')!); }
    const extra = Array.isArray(input['extraArgs']) ? (input['extraArgs'] as unknown[]).map(String) : [];
    argv.push(...extra);
    argv.push(target, '--', command);

    const [cmd, ...args] = argv;
    const started = Date.now();
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutBuf = '';
    let stderrBuf = '';

    return new Promise<ToolResult>(resolve => {
      const child = spawn(cmd!, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
      let timedOut = false;

      const flushStdout = () => {
        if (stdoutBuf) { deps.send({ id: deps.requestId, stream: 'progress', data: { message: stdoutBuf } }); stdoutBuf = ''; }
      };
      const flushStderr = () => {
        if (stderrBuf) { deps.send({ id: deps.requestId, stream: 'progress', data: { message: '[stderr] ' + stderrBuf } }); stderrBuf = ''; }
      };

      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, maxRuntimeMs);
      const onAbort = () => child.kill('SIGKILL');
      deps.signal?.addEventListener('abort', onAbort, { once: true });

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutBytes += chunk.length;
        stdoutBuf += chunk.toString('utf8');
        if (stdoutBuf.length >= LINE_FLUSH_CHARS || stdoutBuf.includes('\n')) { flushStdout(); }
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderrBytes += chunk.length;
        stderrBuf += chunk.toString('utf8');
        if (stderrBuf.length >= LINE_FLUSH_CHARS || stderrBuf.includes('\n')) { flushStderr(); }
      });

      child.on('error', err => {
        clearTimeout(timer);
        deps.signal?.removeEventListener('abort', onAbort);
        flushStdout(); flushStderr();
        resolve(fail('ssh:exec-detached', `spawn failed: ${err.message}`));
      });

      child.on('close', code => {
        clearTimeout(timer);
        deps.signal?.removeEventListener('abort', onAbort);
        flushStdout(); flushStderr();
        const durationMs = Date.now() - started;
        const ok = code === 0 && !timedOut;
        const data: SshExecDetachedData = {
          host, exitCode: code, timedOut, stdoutBytes, stderrBytes, durationMs,
        };
        resolve({
          output: [
            ok ? `Exit 0 after ${durationMs} ms on **${host}**.` : `Process ended${timedOut ? ' (timed out)' : ''} with code ${code} after ${durationMs} ms on **${host}**.`,
            `Streamed: ${stdoutBytes} B stdout, ${stderrBytes} B stderr.`,
          ].join('\n'),
          format: 'markdown',
          success: ok,
          ...(ok ? {} : { error: timedOut ? 'runtime cap exceeded' : `exit ${code}` }),
          data,
        });
      });
    });
  },
};

// ---------------------------------------------------------------------------
// scp:upload
// ---------------------------------------------------------------------------

export const scpUploadTool: Tool = {
  id: 'scp:upload',
  description: 'Copy a local file to a remote host via scp.',
  inputSchema: {
    type: 'object',
    properties: {
      localPath: { type: 'string' },
      host: { type: 'string' },
      remotePath: { type: 'string' },
      recursive: { type: 'boolean' },
      preserve: { type: 'boolean', description: '-p preserve mtime / mode.' },
      identity: { type: 'string' },
    },
    required: ['localPath', 'host', 'remotePath'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    return {
      title: 'scp:upload',
      content: [
        `Local: \`${str(input, 'localPath')}\``,
        `-> Host: **${str(input, 'host')}** -- \`${str(input, 'remotePath')}\``,
        input['recursive'] === true ? 'Recursive (-r).' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const localPath = str(input, 'localPath');
    const host = str(input, 'host');
    const remotePath = str(input, 'remotePath');
    if (!localPath || !host || !remotePath) { return fail('scp:upload', 'localPath / host / remotePath required'); }
    const { target, port } = parseHost(host);

    const argv = ['scp', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'BatchMode=yes'];
    if (port) { argv.push('-P', String(port)); }
    if (input['recursive'] === true) { argv.push('-r'); }
    if (input['preserve']  === true) { argv.push('-p'); }
    if (str(input, 'identity')) { argv.push('-i', str(input, 'identity')!); }
    argv.push(localPath, `${target}:${remotePath}`);

    const r = await runShell(argv, { timeoutMs: 300_000 });
    if (r.spawnError) { return fail('scp:upload', `scp not found: ${r.stderr.trim()}`); }
    if (r.code !== 0) {
      return fail('scp:upload', r.stderr.trim() || r.stdout.trim() || `exit ${r.code}`);
    }
    return {
      output: `Uploaded \`${localPath}\` -> **${host}**:\`${remotePath}\`.`,
      format: 'markdown',
      success: true,
      data: { localPath, host, remotePath },
    };
  },
};

// ---------------------------------------------------------------------------
// scp:download -- "No" approval normally, but gates for large / sensitive paths
// ---------------------------------------------------------------------------

export const scpDownloadTool: Tool = {
  id: 'scp:download',
  description: 'Copy a remote file down via scp. Gates for sensitive paths or large files.',
  inputSchema: {
    type: 'object',
    properties: {
      host: { type: 'string' },
      remotePath: { type: 'string' },
      localPath: { type: 'string' },
      recursive: { type: 'boolean' },
      preserve: { type: 'boolean' },
      identity: { type: 'string' },
      acknowledgeSensitive: { type: 'boolean', description: 'Skip the sensitive-path gate bypass warning.' },
    },
    required: ['host', 'remotePath', 'localPath'],
    additionalProperties: false,
  },

  requiresApproval(input: ToolInput): boolean {
    const remote = str(input, 'remotePath') ?? '';
    return downloadIsSensitive(remote);
  },

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    return {
      title: 'scp:download (sensitive path)',
      content: [
        `Host: **${str(input, 'host')}**`,
        `Remote: \`${str(input, 'remotePath')}\``,
        `-> Local: \`${str(input, 'localPath')}\``,
        '',
        '⚠️ The remote path looks sensitive (/etc, /var/log, credentials, etc.). Confirm before downloading.',
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const host = str(input, 'host');
    const remotePath = str(input, 'remotePath');
    const localPath = str(input, 'localPath');
    if (!host || !remotePath || !localPath) { return fail('scp:download', 'host / remotePath / localPath required'); }
    const { target, port } = parseHost(host);

    // Size check (best-effort): ask the remote for the size first.
    const sizeArgv = ['ssh', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'BatchMode=yes'];
    if (port) { sizeArgv.push('-p', String(port)); }
    if (str(input, 'identity')) { sizeArgv.push('-i', str(input, 'identity')!); }
    sizeArgv.push(target, '--', `wc -c < "${remotePath.replace(/"/g, '\\"')}" 2>/dev/null || echo 0`);
    const sizeResult = await runShell(sizeArgv, { timeoutMs: 15_000 });
    const bytes = Number(sizeResult.stdout.trim()) || 0;
    if (bytes > LARGE_DOWNLOAD_BYTES && input['acknowledgeSensitive'] !== true) {
      return fail('scp:download', `remote path is ~${(bytes / 1024 / 1024).toFixed(1)} MB -- re-run with acknowledgeSensitive:true to proceed`);
    }

    const argv = ['scp', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'BatchMode=yes'];
    if (port) { argv.push('-P', String(port)); }
    if (input['recursive'] === true) { argv.push('-r'); }
    if (input['preserve']  === true) { argv.push('-p'); }
    if (str(input, 'identity')) { argv.push('-i', str(input, 'identity')!); }
    argv.push(`${target}:${remotePath}`, localPath);

    const r = await runShell(argv, { timeoutMs: 300_000 });
    if (r.spawnError) { return fail('scp:download', `scp not found: ${r.stderr.trim()}`); }
    if (r.code !== 0) {
      return fail('scp:download', r.stderr.trim() || r.stdout.trim() || `exit ${r.code}`);
    }
    return {
      output: `Downloaded **${host}**:\`${remotePath}\` -> \`${localPath}\` (${bytes > 0 ? `${bytes} B` : 'size unknown'}).`,
      format: 'markdown',
      success: true,
      data: { host, remotePath, localPath, bytes },
    };
  },
};

// ---------------------------------------------------------------------------
// ssh:port-forward -- runs a tunnel for up to maxRuntimeMs, tears down on exit
// ---------------------------------------------------------------------------

export const sshPortForwardTool: Tool = {
  id: 'ssh:port-forward',
  description: 'Open an SSH tunnel. Runs until maxRuntimeMs elapses or the tool is aborted.',
  inputSchema: {
    type: 'object',
    properties: {
      host: { type: 'string' },
      localPort: { type: 'number', minimum: 1, maximum: 65535 },
      remoteHost: { type: 'string', description: 'Usually "localhost" -- resolved on the jump host.' },
      remotePort: { type: 'number', minimum: 1, maximum: 65535 },
      reverse: { type: 'boolean', description: 'Reverse tunnel (-R instead of -L).' },
      maxRuntimeMs: { type: 'number', minimum: 1000, maximum: 3 * 60 * 60_000, description: 'Default 30 min, hard cap 3 h.' },
      identity: { type: 'string' },
    },
    required: ['host', 'localPort', 'remoteHost', 'remotePort'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const reverse = input['reverse'] === true;
    const maxRuntime = Math.min(num(input, 'maxRuntimeMs') ?? 30 * 60_000, 3 * 60 * 60_000);
    return {
      title: 'ssh:port-forward',
      content: [
        `Host: **${str(input, 'host')}**`,
        reverse
          ? `Reverse: remote \`${num(input, 'remotePort')}\` -> local \`${num(input, 'localPort')}\``
          : `Forward: local \`${num(input, 'localPort')}\` -> \`${str(input, 'remoteHost')}:${num(input, 'remotePort')}\``,
        `Runtime cap: ${Math.round(maxRuntime / 1000)}s`,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
    const host = str(input, 'host');
    const localPort = num(input, 'localPort');
    const remoteHost = str(input, 'remoteHost');
    const remotePort = num(input, 'remotePort');
    if (!host || !localPort || !remoteHost || !remotePort) { return fail('ssh:port-forward', 'missing host / localPort / remoteHost / remotePort'); }

    const reverse = input['reverse'] === true;
    const maxRuntimeMs = Math.min(num(input, 'maxRuntimeMs') ?? 30 * 60_000, 3 * 60 * 60_000);

    const { target, port } = parseHost(host);
    const argv = ['ssh', '-N', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes'];
    if (port) { argv.push('-p', String(port)); }
    if (str(input, 'identity')) { argv.push('-i', str(input, 'identity')!); }
    argv.push(reverse ? '-R' : '-L', `${localPort}:${remoteHost}:${remotePort}`, target);

    const [cmd, ...args] = argv;
    const started = Date.now();

    return new Promise<ToolResult>(resolve => {
      const child = spawn(cmd!, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
      let timedOut = false;
      let stderr = '';

      deps.send({ id: deps.requestId, stream: 'progress', data: { message: `Tunnel open: ${reverse ? `remote ${remotePort} -> local ${localPort}` : `local ${localPort} -> ${remoteHost}:${remotePort}`} via ${host}` } });

      const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, maxRuntimeMs);
      const onAbort = () => child.kill('SIGTERM');
      deps.signal?.addEventListener('abort', onAbort, { once: true });

      child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });

      child.on('error', err => {
        clearTimeout(timer);
        deps.signal?.removeEventListener('abort', onAbort);
        resolve(fail('ssh:port-forward', `spawn failed: ${err.message}`));
      });

      child.on('close', code => {
        clearTimeout(timer);
        deps.signal?.removeEventListener('abort', onAbort);
        const durationMs = Date.now() - started;
        // SIGTERM on timeout / abort is expected; ssh often exits 255 in that case.
        const ok = timedOut || code === 0 || code === 143 || code === 255;
        const data = { host, localPort, remoteHost, remotePort, reverse, timedOut, durationMs, exitCode: code };
        resolve({
          output: [
            timedOut
              ? `Tunnel timed out (cap ${Math.round(maxRuntimeMs / 1000)}s) after ${Math.round(durationMs / 1000)}s.`
              : code === 0
                ? `Tunnel closed cleanly after ${Math.round(durationMs / 1000)}s.`
                : `Tunnel exited code ${code} after ${Math.round(durationMs / 1000)}s.`,
            stderr.trim() ? '\n```\n' + stderr.trim().slice(0, 2000) + '\n```' : '',
          ].filter(Boolean).join('\n'),
          format: 'markdown',
          success: ok,
          ...(ok ? {} : { error: `exit ${code}` }),
          data,
        });
      });
    });
  },
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerSshTools(): void {
  registerTool(sshExecTool);
  registerTool(sshExecDetachedTool);
  registerTool(scpUploadTool);
  registerTool(scpDownloadTool);
  registerTool(sshPortForwardTool);
}

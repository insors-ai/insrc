/**
 * AWS CloudWatch Logs -- tail (follow) / filter.
 *
 * tail streams live events via deps.send so large log groups don't
 * blow out the single-response buffer; filter-log-events is a
 * bounded one-shot pull.
 */

import { spawn } from 'node:child_process';
import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolDeps, ToolInput, ToolResult } from '../../../types.js';
import { AWS_SCHEMA, awsAccess, awsArgv, awsFlags, awsScope, bool, num, str, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

// ---------------------------------------------------------------------------
// cloud:aws:logs:tail
// ---------------------------------------------------------------------------

interface AwsLogsTailData {
  logGroup: string;
  follow: boolean;
  exitCode: number | null;
  bytes: number;
  durationMs: number;
  timedOut: boolean;
}

const DEFAULT_TAIL_RUNTIME = 10 * 60_000;
const MAX_TAIL_RUNTIME = 30 * 60_000;

export const awsLogsTailTool: Tool = {
  id: 'cloud_aws_logs_tail',
  description: 'Tail CloudWatch Logs (live follow streams; one-shot otherwise).',
  access: awsAccess({
    resource: (input) => `logs:${str(input, 'logGroup') ?? '?'}`,
    verb: 'tail',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      logGroup: { type: 'string' },
      follow: { type: 'boolean' },
      since: { type: 'string', description: 'e.g. 5m, 2h, 1d. Default 10m.' },
      filterPattern: { type: 'string' },
      logStreamNames: { type: 'array', items: { type: 'string' } },
      maxRuntimeMs: { type: 'number', minimum: 1000, maximum: MAX_TAIL_RUNTIME, description: 'Follow cap.' },
      ...AWS_SCHEMA,
    },
    required: ['logGroup'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
    const logGroup = str(input, 'logGroup');
    if (!logGroup) { return fail('cloud_aws_logs_tail', 'logGroup required'); }
    const flags = awsFlags(input);
    const follow = bool(input, 'follow') ?? false;

    const argv = ['aws', 'logs', 'tail', logGroup];
    if (follow) { argv.push('--follow'); }
    const since = str(input, 'since');
    if (since) { argv.push('--since', since); }
    const filter = str(input, 'filterPattern');
    if (filter) { argv.push('--filter-pattern', filter); }
    const streams = Array.isArray(input['logStreamNames']) ? (input['logStreamNames'] as unknown[]).map(String) : [];
    if (streams.length > 0) { argv.push('--log-stream-names', ...streams); }
    argv.push(...awsArgv(flags, { defaultJson: false }));

    if (!follow) {
      const r = await runShell(argv, { timeoutMs: 120_000 });
      if (r.spawnError) { return fail('cloud_aws_logs_tail', `aws CLI not found: ${r.stderr.trim()}`); }
      const ok = r.code === 0;
      const data: AwsLogsTailData = {
        logGroup, follow: false, exitCode: r.code,
        bytes: Buffer.byteLength(r.stdout), durationMs: 0, timedOut: r.timedOut,
      };
      return {
        output: [
          ok ? `Logs from \`${logGroup}\` on ${awsScope(flags)}.` : `**Failed (exit ${r.code})**.`,
          '',
          '```',
          r.stdout.replace(/\n+$/, ''),
          '```',
          r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
        ].filter(Boolean).join('\n'),
        format: 'markdown',
        success: ok,
        ...(ok ? {} : { error: `exit ${r.code}` }),
        data,
      };
    }

    const maxRuntimeMs = Math.min(num(input, 'maxRuntimeMs') ?? DEFAULT_TAIL_RUNTIME, MAX_TAIL_RUNTIME);
    const [cmd, ...args] = argv;
    const started = Date.now();
    let buf = '';
    let bytes = 0;

    return new Promise<ToolResult>(resolve => {
      const child = spawn(cmd!, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, maxRuntimeMs);
      const onAbort = () => child.kill('SIGTERM');
      deps.signal?.addEventListener('abort', onAbort, { once: true });

      const flush = () => {
        if (buf) {
          deps.send({ id: deps.requestId, stream: 'progress', data: { message: buf } });
          buf = '';
        }
      };
      child.stdout?.on('data', (c: Buffer) => {
        bytes += c.length;
        buf += c.toString('utf8');
        if (buf.length >= 512 || buf.includes('\n')) { flush(); }
      });
      let stderrCapture = '';
      child.stderr?.on('data', (c: Buffer) => { stderrCapture += c.toString('utf8'); });

      child.on('error', err => {
        clearTimeout(timer);
        deps.signal?.removeEventListener('abort', onAbort);
        flush();
        resolve(fail('cloud_aws_logs_tail', `spawn failed: ${err.message}`));
      });
      child.on('close', code => {
        clearTimeout(timer);
        deps.signal?.removeEventListener('abort', onAbort);
        flush();
        const durationMs = Date.now() - started;
        const ok = code === 0 || (timedOut && code === null);
        const data: AwsLogsTailData = { logGroup, follow: true, exitCode: code, bytes, durationMs, timedOut };
        resolve({
          output: [
            `Log follow ended${timedOut ? ' (runtime cap)' : ''} after ${durationMs} ms.`,
            `Streamed ${bytes} B from \`${logGroup}\`.`,
            stderrCapture ? '\n**stderr tail**\n```\n' + stderrCapture.slice(-1000).replace(/\n+$/, '') + '\n```' : '',
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
// cloud:aws:logs:filter  (filter-log-events)
// ---------------------------------------------------------------------------

interface AwsLogsFilterData {
  logGroup: string;
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const awsLogsFilterTool: Tool = {
  id: 'cloud_aws_logs_filter',
  description: 'Run filter-log-events against a CloudWatch log group.',
  access: awsAccess({
    resource: (input) => `logs:${str(input, 'logGroup') ?? '?'}`,
    verb: 'filter logs in',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      logGroup: { type: 'string' },
      filterPattern: { type: 'string' },
      startTime: { type: 'number', description: 'epoch millis.' },
      endTime: { type: 'number', description: 'epoch millis.' },
      logStreamNames: { type: 'array', items: { type: 'string' } },
      logStreamNamePrefix: { type: 'string' },
      limit: { type: 'number', minimum: 1, maximum: 10000 },
      ...AWS_SCHEMA,
    },
    required: ['logGroup'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const logGroup = str(input, 'logGroup');
    if (!logGroup) { return fail('cloud_aws_logs_filter', 'logGroup required'); }
    const flags = awsFlags(input);
    const argv = ['aws', 'logs', 'filter-log-events', '--log-group-name', logGroup];
    const pattern = str(input, 'filterPattern');
    if (pattern) { argv.push('--filter-pattern', pattern); }
    const start = num(input, 'startTime');
    if (typeof start === 'number') { argv.push('--start-time', String(start)); }
    const end = num(input, 'endTime');
    if (typeof end === 'number')   { argv.push('--end-time', String(end)); }
    const streams = Array.isArray(input['logStreamNames']) ? (input['logStreamNames'] as unknown[]).map(String) : [];
    if (streams.length > 0) { argv.push('--log-stream-names', ...streams); }
    const prefix = str(input, 'logStreamNamePrefix');
    if (prefix) { argv.push('--log-stream-name-prefix', prefix); }
    const limit = num(input, 'limit');
    if (typeof limit === 'number') { argv.push('--limit', String(limit)); }
    argv.push(...awsArgv(flags));

    const r = await runShell(argv, { timeoutMs: 120_000 });
    if (r.spawnError) { return fail('cloud_aws_logs_filter', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AwsLogsFilterData = { logGroup, exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        ok ? `filter-log-events on \`${logGroup}\`.` : `**Failed (exit ${r.code})**.`,
        r.stdout ? '\n```json\n' + r.stdout.slice(0, 8000).replace(/\n+$/, '') + (r.stdout.length > 8000 ? '\n... (truncated)' : '') + '\n```' : '',
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

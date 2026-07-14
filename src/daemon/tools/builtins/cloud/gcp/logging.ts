/**
 * GCP Cloud Logging -- read.
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolInput, ToolResult } from '../../../types.js';
import { GCP_SCHEMA, gcloudCommonArgv, gcpAccess, gcpFlags, gcpScope, num, str, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

interface GcpLoggingReadData {
  filter: string | undefined;
  limit: number | undefined;
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const gcpLoggingReadTool: Tool = {
  id: 'cloud_gcp_logging_read',
  description: 'Run `gcloud logging read` with an advanced filter.',
  access: gcpAccess({ resource: () => 'logging', verb: 'read logs in' }),
  inputSchema: {
    type: 'object',
    properties: {
      filter: { type: 'string', description: 'Cloud Logging filter expression.' },
      limit: { type: 'number' },
      freshness: { type: 'string', description: 'e.g. 1h, 30m. Default 1d.' },
      orderBy: { type: 'string', enum: ['ASC', 'DESC'] },
      ...GCP_SCHEMA,
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const flags = gcpFlags(input);
    const filter = str(input, 'filter');
    const argv = ['gcloud', 'logging', 'read'];
    if (filter) { argv.push(filter); }
    argv.push('--format=json');
    const limit = num(input, 'limit');
    if (typeof limit === 'number') { argv.push('--limit', String(limit)); }
    const freshness = str(input, 'freshness');
    if (freshness) { argv.push('--freshness', freshness); }
    const orderBy = str(input, 'orderBy');
    if (orderBy) { argv.push('--order', orderBy); }
    argv.push(...gcloudCommonArgv(flags));

    const r = await runShell(argv, { timeoutMs: 120_000 });
    if (r.spawnError) { return fail('cloud_gcp_logging_read', `gcloud not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: GcpLoggingReadData = { filter, limit, exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        ok ? `Log entries on ${gcpScope(flags)}.` : `**Failed (exit ${r.code})**.`,
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

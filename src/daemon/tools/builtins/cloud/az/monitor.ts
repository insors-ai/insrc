/**
 * Azure Monitor -- log query against Log Analytics.
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolInput, ToolResult } from '../../../types.js';
import { AZ_SCHEMA, azAccess, azArgv, azFlags, azScope, str, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

interface AzMonitorLogQueryData {
  workspace: string;
  query: string;
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const azMonitorLogQueryTool: Tool = {
  id: 'cloud_az_monitor_log_query',
  description: 'Run a KQL query against a Log Analytics workspace (az monitor log-analytics query).',
  access: azAccess({
    resource: (input) => `monitor:${str(input, 'workspace') ?? '?'}`,
    verb: 'query Log Analytics workspace',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      workspace: { type: 'string', description: 'Workspace ID (customer-id GUID).' },
      query: { type: 'string' },
      timespan: { type: 'string', description: 'ISO8601 duration (e.g. PT1H) or two-timestamp range.' },
      ...AZ_SCHEMA,
    },
    required: ['workspace', 'query'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const workspace = str(input, 'workspace');
    const query = str(input, 'query');
    if (!workspace || !query) { return fail('cloud_az_monitor_log_query', 'workspace and query required'); }
    const flags = azFlags(input);
    const argv = ['az', 'monitor', 'log-analytics', 'query', '--workspace', workspace, '--analytics-query', query, '--output', 'json'];
    const timespan = str(input, 'timespan');
    if (timespan) { argv.push('--timespan', timespan); }
    argv.push(...azArgv(flags, { includeResourceGroup: false }));

    const r = await runShell(argv, { timeoutMs: 5 * 60_000 });
    if (r.spawnError) { return fail('cloud_az_monitor_log_query', `az CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AzMonitorLogQueryData = { workspace, query, exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        ok ? `Log query on workspace \`${workspace}\` (${azScope(flags)}).` : `**Failed (exit ${r.code})**.`,
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

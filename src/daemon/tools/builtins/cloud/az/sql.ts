/**
 * Azure SQL server -- list / start / stop.
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { AZ_SCHEMA, azAccess, azArgv, azFlags, azScope, str, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

// ---------------------------------------------------------------------------
// cloud:az:sql:server:list
// ---------------------------------------------------------------------------

interface AzSqlServerListData {
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const azSqlServerListTool: Tool = {
  id: 'cloud_az_sql_server_list',
  description: 'List Azure SQL servers.',
  access: azAccess({ resource: () => 'sql:*', verb: 'list SQL servers in' }),
  inputSchema: {
    type: 'object',
    properties: { ...AZ_SCHEMA },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const flags = azFlags(input);
    const argv = ['az', 'sql', 'server', 'list', '--output', 'json', ...azArgv(flags)];
    const r = await runShell(argv, { timeoutMs: 60_000 });
    if (r.spawnError) { return fail('cloud_az_sql_server_list', `az CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AzSqlServerListData = { exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        ok ? `SQL servers on ${azScope(flags)}.` : `**Failed (exit ${r.code})**.`,
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

// ---------------------------------------------------------------------------
// cloud:az:sql:server:start -- resume (SQL Managed Instance / serverless)
// ---------------------------------------------------------------------------

interface AzSqlServerStateData {
  server: string;
  action: 'start' | 'stop';
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const azSqlServerStartTool: Tool = {
  id: 'cloud_az_sql_server_start',
  description: 'Start / resume an Azure SQL server (uses sql mi start under the hood for Managed Instance).',
  access: azAccess({
    resource: (input) => `sql:${str(input, 'server') ?? '?'}`,
    verb: 'resume SQL server',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      server: { type: 'string' },
      managedInstance: { type: 'boolean', description: 'Treat as SQL Managed Instance (uses `az sql mi start`).' },
      ...AZ_SCHEMA,
    },
    required: ['server', 'resourceGroup'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = azFlags(input);
    return {
      title: 'cloud_az_sql_server_start',
      content: [
        `Scope: **${azScope(flags)}**`,
        `Server: \`${str(input, 'server')}\`${input['managedInstance'] === true ? ' (Managed Instance)' : ''}`,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const server = str(input, 'server');
    if (!server) { return fail('cloud_az_sql_server_start', 'server required'); }
    const flags = azFlags(input);
    if (!flags.resourceGroup) { return fail('cloud_az_sql_server_start', 'resourceGroup required'); }
    const miMode = input['managedInstance'] === true;
    const argv = miMode
      ? ['az', 'sql', 'mi', 'start-stop-schedule', 'create', '--mi', server, '--resource-group', flags.resourceGroup, '--output', 'json']
      : ['az', 'sql', 'server', 'resume', '--name', server, '--resource-group', flags.resourceGroup, '--output', 'json'];
    argv.push(...azArgv(flags, { includeResourceGroup: false }));

    const r = await runShell(argv, { timeoutMs: 15 * 60_000 });
    if (r.spawnError) { return fail('cloud_az_sql_server_start', `az CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: AzSqlServerStateData = { server, action: 'start', exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        ok ? `Started \`${server}\`.` : `**Start failed (exit ${r.code})**.`,
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

// ---------------------------------------------------------------------------
// cloud:az:sql:server:stop
// ---------------------------------------------------------------------------

export const azSqlServerStopTool: Tool = {
  id: 'cloud_az_sql_server_stop',
  description: 'Pause / stop an Azure SQL server.',
  access: azAccess({
    resource: (input) => `sql:${str(input, 'server') ?? '?'}`,
    verb: 'pause SQL server',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      server: { type: 'string' },
      managedInstance: { type: 'boolean' },
      ...AZ_SCHEMA,
    },
    required: ['server', 'resourceGroup'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = azFlags(input);
    return {
      title: 'cloud_az_sql_server_stop',
      content: [
        `Scope: **${azScope(flags)}**`,
        `Server: \`${str(input, 'server')}\`${input['managedInstance'] === true ? ' (Managed Instance)' : ''}`,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const server = str(input, 'server');
    if (!server) { return fail('cloud_az_sql_server_stop', 'server required'); }
    const flags = azFlags(input);
    if (!flags.resourceGroup) { return fail('cloud_az_sql_server_stop', 'resourceGroup required'); }
    const miMode = input['managedInstance'] === true;
    const argv = miMode
      ? ['az', 'sql', 'mi', 'stop', '--mi', server, '--resource-group', flags.resourceGroup, '--output', 'json']
      : ['az', 'sql', 'server', 'pause', '--name', server, '--resource-group', flags.resourceGroup, '--output', 'json'];
    argv.push(...azArgv(flags, { includeResourceGroup: false }));

    const r = await runShell(argv, { timeoutMs: 15 * 60_000 });
    if (r.spawnError) { return fail('cloud_az_sql_server_stop', `az CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: AzSqlServerStateData = { server, action: 'stop', exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        ok ? `Stopped \`${server}\`.` : `**Stop failed (exit ${r.code})**.`,
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

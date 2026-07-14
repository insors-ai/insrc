/**
 * Azure Functions (functionapp) -- list / deploy-zip.
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { AZ_SCHEMA, azAccess, azArgv, azFlags, azScope, bool, str, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

// ---------------------------------------------------------------------------
// cloud:az:functionapp:list
// ---------------------------------------------------------------------------

interface AzFunctionAppListData {
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const azFunctionAppListTool: Tool = {
  id: 'cloud_az_functionapp_list',
  description: 'List Azure Function apps (scoped to resourceGroup when supplied).',
  access: azAccess({ resource: () => 'functionapp:*', verb: 'list function apps in' }),
  inputSchema: {
    type: 'object',
    properties: { ...AZ_SCHEMA },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const flags = azFlags(input);
    const argv = ['az', 'functionapp', 'list', '--output', 'json', ...azArgv(flags)];
    const r = await runShell(argv, { timeoutMs: 60_000 });
    if (r.spawnError) { return fail('cloud_az_functionapp_list', `az CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AzFunctionAppListData = { exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        ok ? `Function apps on ${azScope(flags)}.` : `**Failed (exit ${r.code})**.`,
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
// cloud:az:functionapp:deploy  (zip deploy)
// ---------------------------------------------------------------------------

interface AzFunctionAppDeployData {
  name: string;
  zipPath: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const azFunctionAppDeployTool: Tool = {
  id: 'cloud_az_functionapp_deploy',
  description: 'Deploy a zip package to an Azure Function app (az functionapp deployment source config-zip).',
  access: azAccess({
    resource: (input) => `functionapp:${str(input, 'name') ?? '?'}`,
    verb: 'deploy zip to',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      zipPath: { type: 'string' },
      buildRemote: { type: 'boolean', description: '--build-remote: run oryx build on the server.' },
      ...AZ_SCHEMA,
    },
    required: ['name', 'zipPath', 'resourceGroup'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = azFlags(input);
    return {
      title: 'cloud_az_functionapp_deploy',
      content: [
        `Scope: **${azScope(flags)}**`,
        `Function app: \`${str(input, 'name')}\``,
        `Package: \`${str(input, 'zipPath')}\``,
        bool(input, 'buildRemote') === true ? '**--build-remote** (oryx builds on server).' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const name = str(input, 'name');
    const zipPath = str(input, 'zipPath');
    if (!name || !zipPath) { return fail('cloud_az_functionapp_deploy', 'name and zipPath required'); }
    const flags = azFlags(input);
    if (!flags.resourceGroup) { return fail('cloud_az_functionapp_deploy', 'resourceGroup required'); }
    const argv = [
      'az', 'functionapp', 'deployment', 'source', 'config-zip',
      '--name', name,
      '--resource-group', flags.resourceGroup,
      '--src', zipPath,
      '--output', 'json',
    ];
    if (bool(input, 'buildRemote') === true) { argv.push('--build-remote', 'true'); }
    argv.push(...azArgv(flags, { includeResourceGroup: false }));

    const r = await runShell(argv, { timeoutMs: 30 * 60_000 });
    if (r.spawnError) { return fail('cloud_az_functionapp_deploy', `az CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: AzFunctionAppDeployData = { name, zipPath, exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        ok ? `Deployed \`${zipPath}\` to function app \`${name}\`.` : `**Deploy failed (exit ${r.code})**.`,
        r.stdout ? '\n```json\n' + r.stdout.slice(0, 4000).replace(/\n+$/, '') + '\n```' : '',
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

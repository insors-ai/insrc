/**
 * Azure AKS -- list / get-credentials.
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { AZ_SCHEMA, azAccess, azArgv, azFlags, azScope, bool, str, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

// ---------------------------------------------------------------------------
// cloud:az:aks:list
// ---------------------------------------------------------------------------

interface AzAksListData {
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const azAksListTool: Tool = {
  id: 'cloud_az_aks_list',
  description: 'List AKS clusters (scoped to resourceGroup when supplied).',
  access: azAccess({ resource: () => 'aks:*', verb: 'list AKS clusters in' }),
  inputSchema: {
    type: 'object',
    properties: { ...AZ_SCHEMA },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const flags = azFlags(input);
    const argv = ['az', 'aks', 'list', '--output', 'json', ...azArgv(flags)];
    const r = await runShell(argv, { timeoutMs: 60_000 });
    if (r.spawnError) { return fail('cloud_az_aks_list', `az CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AzAksListData = { exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        ok ? `AKS clusters on ${azScope(flags)}.` : `**Failed (exit ${r.code})**.`,
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
// cloud_az_aks_get-credentials
// ---------------------------------------------------------------------------

interface AzAksCredsData {
  cluster: string;
  kubeconfigPath: string | undefined;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const azAksGetCredentialsTool: Tool = {
  id: 'cloud_az_aks_get-credentials',
  description: 'Write a kubeconfig entry for an AKS cluster. Mutates the kubeconfig file.',
  access: azAccess({
    resource: (input) => `aks:${str(input, 'cluster') ?? '?'}`,
    verb: 'write kubeconfig for',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      cluster: { type: 'string' },
      admin: { type: 'boolean', description: '--admin (cluster-admin credentials).' },
      overwrite: { type: 'boolean' },
      kubeconfig: { type: 'string' },
      ...AZ_SCHEMA,
    },
    required: ['cluster', 'resourceGroup'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = azFlags(input);
    return {
      title: 'cloud_az_aks_get-credentials',
      content: [
        `Scope: **${azScope(flags)}**`,
        `Cluster: \`${str(input, 'cluster')}\``,
        bool(input, 'admin') === true ? '**--admin** (cluster-admin kubeconfig).' : '',
        str(input, 'kubeconfig') ? `Kubeconfig: \`${str(input, 'kubeconfig')}\`` : 'Kubeconfig: default (KUBECONFIG / ~/.kube/config).',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cluster = str(input, 'cluster');
    if (!cluster) { return fail('cloud_az_aks_get-credentials', 'cluster required'); }
    const flags = azFlags(input);
    if (!flags.resourceGroup) { return fail('cloud_az_aks_get-credentials', 'resourceGroup required'); }
    const kubeconfig = str(input, 'kubeconfig');
    const argv = ['az', 'aks', 'get-credentials', '--name', cluster, '--resource-group', flags.resourceGroup, '--output', 'json'];
    if (bool(input, 'admin')     === true) { argv.push('--admin'); }
    if (bool(input, 'overwrite') === true) { argv.push('--overwrite-existing'); }
    if (kubeconfig) { argv.push('--file', kubeconfig); }
    argv.push(...azArgv(flags, { includeResourceGroup: false }));

    const r = await runShell(argv, { timeoutMs: 60_000 });
    if (r.spawnError) { return fail('cloud_az_aks_get-credentials', `az CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: AzAksCredsData = { cluster, kubeconfigPath: kubeconfig, exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        ok ? `Kubeconfig updated for AKS \`${cluster}\`.` : `**Failed (exit ${r.code})**.`,
        r.stdout ? '\n```\n' + r.stdout.replace(/\n+$/, '') + '\n```' : '',
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

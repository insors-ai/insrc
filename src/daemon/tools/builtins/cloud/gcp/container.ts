/**
 * GKE -- get-credentials (writes kubeconfig entry).
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { GCP_SCHEMA, gcloudCommonArgv, gcpAccess, gcpFlags, gcpScope, str } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

interface GcpContainerCredsData {
  cluster: string;
  location: 'region' | 'zone';
  kubeconfigPath: string | undefined;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const gcpContainerGetCredentialsTool: Tool = {
  id: 'cloud_gcp_container_get-credentials',
  description: 'Write a kubeconfig entry for a GKE cluster. Mutates the kubeconfig file.',
  access: gcpAccess({
    resource: (input) => `gke:${str(input, 'cluster') ?? '?'}`,
    verb: 'write kubeconfig for',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      cluster: { type: 'string' },
      location: { type: 'string', enum: ['region', 'zone'], description: 'Which location flag to use (region is default for Autopilot).' },
      internalIp: { type: 'boolean', description: 'Pass --internal-ip (private GKE).' },
      dnsEndpoint: { type: 'boolean', description: 'Pass --dns-endpoint.' },
      kubeconfig: { type: 'string', description: 'Override KUBECONFIG target path.' },
      ...GCP_SCHEMA,
    },
    required: ['cluster'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = gcpFlags(input);
    return {
      title: 'cloud_gcp_container_get-credentials',
      content: [
        `Scope: **${gcpScope(flags)}**`,
        `Cluster: \`${str(input, 'cluster')}\``,
        str(input, 'kubeconfig') ? `Kubeconfig: \`${str(input, 'kubeconfig')}\`` : 'Kubeconfig: default (KUBECONFIG / ~/.kube/config).',
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cluster = str(input, 'cluster');
    if (!cluster) { return fail('cloud_gcp_container_get-credentials', 'cluster required'); }
    const flags = gcpFlags(input);
    const location: GcpContainerCredsData['location'] = (str(input, 'location') ?? (flags.region ? 'region' : 'zone')) as 'region' | 'zone';
    const kubeconfig = str(input, 'kubeconfig');

    const argv = ['gcloud', 'container', 'clusters', 'get-credentials', cluster];
    if (location === 'region' && flags.region) { argv.push('--region', flags.region); }
    else if (location === 'zone' && flags.zone) { argv.push('--zone', flags.zone); }
    if (input['internalIp']  === true) { argv.push('--internal-ip'); }
    if (input['dnsEndpoint'] === true) { argv.push('--dns-endpoint'); }
    argv.push(...gcloudCommonArgv(flags));

    const env = { ...process.env };
    if (kubeconfig) { env['KUBECONFIG'] = kubeconfig; }

    const r = await runShell(argv, { timeoutMs: 60_000, env });
    if (r.spawnError) { return fail('cloud_gcp_container_get-credentials', `gcloud not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: GcpContainerCredsData = { cluster, location, kubeconfigPath: kubeconfig, exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        ok ? `Kubeconfig updated for GKE \`${cluster}\`.` : `**Failed (exit ${r.code})**.`,
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

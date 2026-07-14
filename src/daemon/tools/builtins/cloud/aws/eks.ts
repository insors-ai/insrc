/**
 * AWS EKS -- list clusters / update kubeconfig.
 *
 * update-kubeconfig mutates the caller's kubeconfig file so it is
 * always gated (we show the target kubeconfig path and context name
 * before running).
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { AWS_SCHEMA, awsAccess, awsArgv, awsFlags, awsScope, str, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

// ---------------------------------------------------------------------------
// cloud:aws:eks:list
// ---------------------------------------------------------------------------

interface AwsEksListData {
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const awsEksListTool: Tool = {
  id: 'cloud_aws_eks_list',
  description: 'List EKS clusters in the region.',
  access: awsAccess({ resource: () => 'eks:*', verb: 'list clusters in' }),
  inputSchema: {
    type: 'object',
    properties: { ...AWS_SCHEMA },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const flags = awsFlags(input);
    const argv = ['aws', 'eks', 'list-clusters', ...awsArgv(flags)];
    const r = await runShell(argv, { timeoutMs: 60_000 });
    if (r.spawnError) { return fail('cloud_aws_eks_list', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AwsEksListData = { exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        ok ? `EKS clusters on ${awsScope(flags)}.` : `**Failed (exit ${r.code})**.`,
        r.stdout ? '\n```json\n' + r.stdout.replace(/\n+$/, '') + '\n```' : '',
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
// cloud_aws_eks_update-kubeconfig
// ---------------------------------------------------------------------------

interface AwsEksUpdateKubeconfigData {
  clusterName: string;
  kubeconfigPath: string | undefined;
  alias: string | undefined;
  roleArn: string | undefined;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const awsEksUpdateKubeconfigTool: Tool = {
  id: 'cloud_aws_eks_update-kubeconfig',
  description: 'Write a kubeconfig entry for an EKS cluster. Mutates the kubeconfig file.',
  access: awsAccess({
    resource: (input) => `eks:${str(input, 'clusterName') ?? '?'}`,
    verb: 'write kubeconfig for',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      clusterName: { type: 'string' },
      alias: { type: 'string', description: 'Context alias to write (defaults to the cluster ARN).' },
      kubeconfig: { type: 'string', description: 'Kubeconfig path; defaults to KUBECONFIG env or ~/.kube/config.' },
      roleArn: { type: 'string' },
      dryRun: { type: 'boolean' },
      ...AWS_SCHEMA,
    },
    required: ['clusterName'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = awsFlags(input);
    return {
      title: 'cloud_aws_eks_update-kubeconfig',
      content: [
        `Scope: **${awsScope(flags)}**`,
        `Cluster: \`${str(input, 'clusterName')}\``,
        str(input, 'alias') ? `Context alias: \`${str(input, 'alias')}\`` : '',
        str(input, 'kubeconfig') ? `Kubeconfig: \`${str(input, 'kubeconfig')}\`` : 'Kubeconfig: default (KUBECONFIG / ~/.kube/config).',
        str(input, 'roleArn') ? `Assume role: \`${str(input, 'roleArn')}\`` : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cluster = str(input, 'clusterName');
    if (!cluster) { return fail('cloud_aws_eks_update-kubeconfig', 'clusterName required'); }
    const flags = awsFlags(input);
    const argv = ['aws', 'eks', 'update-kubeconfig', '--name', cluster];
    const alias = str(input, 'alias');
    if (alias) { argv.push('--alias', alias); }
    const kubeconfig = str(input, 'kubeconfig');
    if (kubeconfig) { argv.push('--kubeconfig', kubeconfig); }
    const roleArn = str(input, 'roleArn');
    if (roleArn) { argv.push('--role-arn', roleArn); }
    if (input['dryRun'] === true) { argv.push('--dry-run'); }
    argv.push(...awsArgv(flags, { defaultJson: false }));

    const r = await runShell(argv, { timeoutMs: 60_000 });
    if (r.spawnError) { return fail('cloud_aws_eks_update-kubeconfig', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: AwsEksUpdateKubeconfigData = {
      clusterName: cluster, kubeconfigPath: kubeconfig, alias, roleArn,
      exitCode: r.code, stdout: r.stdout, stderr: r.stderr,
    };
    return {
      output: [
        ok ? `Kubeconfig updated for \`${cluster}\`.` : `**Failed (exit ${r.code})**.`,
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

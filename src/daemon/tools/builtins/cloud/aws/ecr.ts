/**
 * AWS ECR -- docker registry login (get-login-password).
 *
 * The password itself is sensitive; we pass it back as data but
 * redact it in the rendered output unless reveal:true is set so
 * it does not get echoed into chat transcripts.
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { AWS_SCHEMA, awsAccess, awsArgv, awsFlags, awsScope, bool, str } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

interface AwsEcrLoginData {
  registry: string | undefined;
  revealed: boolean;
  password: string;
  dockerLoginCmd: string;
  exitCode: number | null;
}

export const awsEcrLoginTool: Tool = {
  id: 'cloud_aws_ecr_login',
  description: 'Produce docker login credentials for ECR (ecr get-login-password). Password redacted unless reveal:true.',
  access: awsAccess({
    resource: (input) => `ecr:${str(input, 'registryId') ?? '<account>'}`,
    verb: 'fetch ECR login for',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      registryId: { type: 'string', description: 'Account ID owning the registry. Default: current account.' },
      reveal: { type: 'boolean' },
      ...AWS_SCHEMA,
    },
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = awsFlags(input);
    return {
      title: 'cloud_aws_ecr_login',
      content: [
        `Scope: **${awsScope(flags)}**`,
        str(input, 'registryId') ? `Registry: \`${str(input, 'registryId')}\`` : 'Registry: current account.',
        bool(input, 'reveal') === true ? '**reveal:true** -- password will appear in output.' : 'Password will be redacted in output.',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const flags = awsFlags(input);
    const argv = ['aws', 'ecr', 'get-login-password'];
    const registryId = str(input, 'registryId');
    if (registryId) { argv.push('--registry-ids', registryId); }
    argv.push(...awsArgv(flags, { defaultJson: false }));

    const r = await runShell(argv, { timeoutMs: 30_000 });
    if (r.spawnError) { return fail('cloud_aws_ecr_login', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const password = r.stdout.trim();

    // Best-effort registry host for the docker login command (sts::account + region).
    const region = flags.region;
    const account = registryId;
    const registry = account && region
      ? `${account}.dkr.ecr.${region}.amazonaws.com`
      : undefined;

    const reveal = bool(input, 'reveal') === true;
    const dockerLoginCmd = registry
      ? `docker login --username AWS --password-stdin ${registry}`
      : 'docker login --username AWS --password-stdin <registry>';

    const data: AwsEcrLoginData = {
      registry,
      revealed: reveal,
      password,
      dockerLoginCmd,
      exitCode: r.code,
    };
    return {
      output: [
        ok ? 'ECR login token fetched.' : `**Failed (exit ${r.code})**.`,
        reveal
          ? '\n**Password**\n```\n' + password + '\n```'
          : `Password: **<redacted, ${password.length} chars>**`,
        `\nDocker login:\n\`\`\`\n${dockerLoginCmd}\n\`\`\``,
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

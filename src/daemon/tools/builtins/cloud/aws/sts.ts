/**
 * AWS STS tool -- who-am-I / credential inspection.
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolInput, ToolResult } from '../../../types.js';
import { AWS_SCHEMA, awsAccess, awsArgv, awsFlags, awsScope, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

interface AwsStsWhoAmIData {
  exitCode: number | null;
  stdout: string;
  parsed: unknown;
}

export const awsStsWhoAmITool: Tool = {
  id: 'cloud_aws_sts_whoami',
  description: 'Return the AWS principal behind the current credentials (aws sts get-caller-identity).',
  access: awsAccess({ resource: () => 'sts', verb: 'identity for' }),
  inputSchema: {
    type: 'object',
    properties: { ...AWS_SCHEMA },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const flags = awsFlags(input);
    const argv = ['aws', 'sts', 'get-caller-identity', ...awsArgv(flags)];
    const r = await runShell(argv, { timeoutMs: 30_000 });
    if (r.spawnError) { return fail('cloud_aws_sts_whoami', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AwsStsWhoAmIData = { exitCode: r.code, stdout: r.stdout, parsed };
    return {
      output: [
        ok ? `Caller identity on ${awsScope(flags)}.` : `**Failed (exit ${r.code})**.`,
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

/**
 * AWS Secrets Manager -- get / put.
 *
 * Both tools treat secret values as sensitive: the approval gate
 * shows only the name/ARN, never the plaintext, and the tool result
 * data payload redacts the secret string so accidental
 * persistence does not leak it.
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { AWS_SCHEMA, awsAccess, awsArgv, awsFlags, awsScope, bool, str, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

// ---------------------------------------------------------------------------
// cloud:aws:secretsmanager:get
// ---------------------------------------------------------------------------

interface AwsSecretGetData {
  secretId: string;
  versionId: string | undefined;
  versionStage: string | undefined;
  revealed: boolean;
  exitCode: number | null;
  name: string | undefined;
  arn: string | undefined;
  secretString: string | undefined;
  secretBinaryBytes: number | undefined;
}

export const awsSecretsGetTool: Tool = {
  id: 'cloud_aws_secretsmanager_get',
  description: 'Fetch a secret value. Secret stays redacted in the rendered output unless reveal:true.',
  access: awsAccess({
    resource: (input) => `secret:${str(input, 'secretId') ?? '?'}`,
    verb: 'read secret',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      secretId: { type: 'string', description: 'Secret ID or ARN.' },
      versionId: { type: 'string' },
      versionStage: { type: 'string', description: 'Default AWSCURRENT.' },
      reveal: { type: 'boolean', description: 'Include the secret string in rendered output (data still returned always).' },
      ...AWS_SCHEMA,
    },
    required: ['secretId'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = awsFlags(input);
    return {
      title: 'cloud_aws_secretsmanager_get',
      content: [
        `Scope: **${awsScope(flags)}**`,
        `Secret: \`${str(input, 'secretId')}\``,
        bool(input, 'reveal') === true ? '**reveal:true** -- value will appear in output.' : 'Value will be redacted in output.',
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const secretId = str(input, 'secretId');
    if (!secretId) { return fail('cloud_aws_secretsmanager_get', 'secretId required'); }
    const flags = awsFlags(input);
    const argv = ['aws', 'secretsmanager', 'get-secret-value', '--secret-id', secretId];
    const versionId = str(input, 'versionId');
    if (versionId) { argv.push('--version-id', versionId); }
    const stage = str(input, 'versionStage');
    if (stage) { argv.push('--version-stage', stage); }
    argv.push(...awsArgv(flags));

    const r = await runShell(argv, { timeoutMs: 30_000 });
    if (r.spawnError) { return fail('cloud_aws_secretsmanager_get', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;

    let name: string | undefined;
    let arn: string | undefined;
    let secretString: string | undefined;
    let secretBinaryBytes: number | undefined;
    if (parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>;
      if (typeof p['Name'] === 'string') { name = p['Name']; }
      if (typeof p['ARN']  === 'string') { arn  = p['ARN']; }
      if (typeof p['SecretString'] === 'string') { secretString = p['SecretString']; }
      if (typeof p['SecretBinary'] === 'string') { secretBinaryBytes = Buffer.from(p['SecretBinary'], 'base64').length; }
    }

    const reveal = bool(input, 'reveal') === true;
    const data: AwsSecretGetData = {
      secretId,
      versionId,
      versionStage: stage,
      revealed: reveal,
      exitCode: r.code,
      name, arn, secretString, secretBinaryBytes,
    };
    return {
      output: [
        ok ? `Fetched secret \`${name ?? secretId}\`.` : `**Failed (exit ${r.code})**.`,
        arn ? `ARN: \`${arn}\`` : '',
        secretString !== undefined
          ? (reveal
              ? '\n**Value**\n```\n' + secretString + '\n```'
              : `Value: **<redacted, ${secretString.length} chars>**`)
          : secretBinaryBytes !== undefined
            ? `Binary value: **<${secretBinaryBytes} bytes, redacted>**`
            : '',
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
// cloud:aws:secretsmanager:put  (put-secret-value, creates new version)
// ---------------------------------------------------------------------------

interface AwsSecretPutData {
  secretId: string;
  versionId: string | undefined;
  exitCode: number | null;
  parsed: unknown;
}

export const awsSecretsPutTool: Tool = {
  id: 'cloud_aws_secretsmanager_put',
  description: 'Write a new version to an existing Secrets Manager secret. Value hidden in gate.',
  access: awsAccess({
    resource: (input) => `secret:${str(input, 'secretId') ?? '?'}`,
    verb: 'write secret',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      secretId: { type: 'string' },
      secretString: { type: 'string' },
      stages: { type: 'array', items: { type: 'string' }, description: 'Version stages to attach.' },
      clientRequestToken: { type: 'string' },
      ...AWS_SCHEMA,
    },
    required: ['secretId', 'secretString'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = awsFlags(input);
    const v = str(input, 'secretString');
    return {
      title: 'cloud_aws_secretsmanager_put',
      content: [
        `Scope: **${awsScope(flags)}**`,
        `Secret: \`${str(input, 'secretId')}\``,
        `Value: **<redacted, ${v ? v.length : 0} chars>**`,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const secretId = str(input, 'secretId');
    const value = str(input, 'secretString');
    if (!secretId || value === undefined) {
      return fail('cloud_aws_secretsmanager_put', 'secretId and secretString required');
    }
    const flags = awsFlags(input);
    const argv = ['aws', 'secretsmanager', 'put-secret-value', '--secret-id', secretId, '--secret-string', value];
    const stages = Array.isArray(input['stages']) ? (input['stages'] as unknown[]).map(String) : [];
    if (stages.length > 0) { argv.push('--version-stages', ...stages); }
    const token = str(input, 'clientRequestToken');
    if (token) { argv.push('--client-request-token', token); }
    argv.push(...awsArgv(flags));

    const r = await runShell(argv, { timeoutMs: 30_000 });
    if (r.spawnError) { return fail('cloud_aws_secretsmanager_put', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    let versionId: string | undefined;
    if (parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>;
      if (typeof p['VersionId'] === 'string') { versionId = p['VersionId']; }
    }
    const data: AwsSecretPutData = { secretId, versionId, exitCode: r.code, parsed };
    return {
      output: [
        ok ? `Wrote new version of \`${secretId}\`${versionId ? ` (${versionId})` : ''}.` : `**Put failed (exit ${r.code})**.`,
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

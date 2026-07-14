/**
 * AWS SSM Parameter Store -- get / put.
 *
 * SecureString values are treated like secrets: --with-decryption
 * toggles decryption, and values redact in rendered output unless
 * reveal:true is set explicitly.
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { AWS_SCHEMA, awsAccess, awsArgv, awsFlags, awsScope, bool, str, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

// ---------------------------------------------------------------------------
// cloud_aws_ssm_get-parameter
// ---------------------------------------------------------------------------

interface AwsSsmGetData {
  name: string;
  withDecryption: boolean;
  revealed: boolean;
  exitCode: number | null;
  value: string | undefined;
  parameterType: string | undefined;
  version: number | undefined;
}

export const awsSsmGetParameterTool: Tool = {
  id: 'cloud_aws_ssm_get-parameter',
  description: 'Fetch a Parameter Store value. SecureString values stay redacted unless reveal:true.',
  access: awsAccess({
    resource: (input) => `ssm:${str(input, 'name') ?? '?'}`,
    verb: 'read SSM parameter',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      withDecryption: { type: 'boolean', description: 'Decrypt SecureString values.' },
      reveal: { type: 'boolean', description: 'Include value in rendered output.' },
      ...AWS_SCHEMA,
    },
    required: ['name'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = awsFlags(input);
    return {
      title: 'cloud_aws_ssm_get-parameter',
      content: [
        `Scope: **${awsScope(flags)}**`,
        `Parameter: \`${str(input, 'name')}\``,
        bool(input, 'withDecryption') === true ? '**--with-decryption** -- SecureString will decrypt.' : '',
        bool(input, 'reveal') === true ? '**reveal:true** -- value will appear in output.' : 'Value will be redacted in output.',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const name = str(input, 'name');
    if (!name) { return fail('cloud_aws_ssm_get-parameter', 'name required'); }
    const flags = awsFlags(input);
    const withDecryption = bool(input, 'withDecryption') === true;
    const argv = ['aws', 'ssm', 'get-parameter', '--name', name];
    if (withDecryption) { argv.push('--with-decryption'); }
    argv.push(...awsArgv(flags));

    const r = await runShell(argv, { timeoutMs: 30_000 });
    if (r.spawnError) { return fail('cloud_aws_ssm_get-parameter', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    let value: string | undefined;
    let parameterType: string | undefined;
    let version: number | undefined;
    if (parsed && typeof parsed === 'object') {
      const p = (parsed as { Parameter?: unknown }).Parameter;
      if (p && typeof p === 'object') {
        const pp = p as Record<string, unknown>;
        if (typeof pp['Value'] === 'string') { value = pp['Value']; }
        if (typeof pp['Type']  === 'string') { parameterType = pp['Type']; }
        if (typeof pp['Version'] === 'number') { version = pp['Version']; }
      }
    }
    const reveal = bool(input, 'reveal') === true;
    const secure = parameterType === 'SecureString';
    const data: AwsSsmGetData = { name, withDecryption, revealed: reveal, exitCode: r.code, value, parameterType, version };
    return {
      output: [
        ok ? `Parameter \`${name}\` (${parameterType ?? 'unknown'}, v${version ?? '?'}).` : `**Failed (exit ${r.code})**.`,
        value !== undefined
          ? ((reveal || !secure)
              ? '\n**Value**\n```\n' + value + '\n```'
              : `Value: **<redacted SecureString, ${value.length} chars>**`)
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
// cloud_aws_ssm_put-parameter
// ---------------------------------------------------------------------------

interface AwsSsmPutData {
  name: string;
  parameterType: string;
  overwrite: boolean;
  exitCode: number | null;
  parsed: unknown;
}

export const awsSsmPutParameterTool: Tool = {
  id: 'cloud_aws_ssm_put-parameter',
  description: 'Create or update a Parameter Store value.',
  access: awsAccess({
    resource: (input) => `ssm:${str(input, 'name') ?? '?'}`,
    verb: 'write SSM parameter',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      value: { type: 'string' },
      type: { type: 'string', enum: ['String', 'StringList', 'SecureString'] },
      overwrite: { type: 'boolean' },
      keyId: { type: 'string', description: 'KMS key for SecureString.' },
      description: { type: 'string' },
      tier: { type: 'string', enum: ['Standard', 'Advanced', 'Intelligent-Tiering'] },
      ...AWS_SCHEMA,
    },
    required: ['name', 'value', 'type'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = awsFlags(input);
    const type = str(input, 'type') ?? '';
    const v = str(input, 'value');
    return {
      title: 'cloud_aws_ssm_put-parameter',
      content: [
        `Scope: **${awsScope(flags)}**`,
        `Parameter: \`${str(input, 'name')}\` (${type})`,
        type === 'SecureString'
          ? `Value: **<redacted, ${v ? v.length : 0} chars>**`
          : v !== undefined ? '\n**Value**\n```\n' + v.slice(0, 400) + (v.length > 400 ? '\n... (truncated)' : '') + '\n```' : '',
        bool(input, 'overwrite') === true ? '--overwrite' : '(new value; will fail if parameter exists)',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const name = str(input, 'name');
    const value = str(input, 'value');
    const type = str(input, 'type');
    if (!name || value === undefined || !type) { return fail('cloud_aws_ssm_put-parameter', 'name, value and type required'); }
    const flags = awsFlags(input);
    const overwrite = bool(input, 'overwrite') === true;
    const argv = ['aws', 'ssm', 'put-parameter', '--name', name, '--value', value, '--type', type];
    if (overwrite) { argv.push('--overwrite'); }
    const keyId = str(input, 'keyId');
    if (keyId) { argv.push('--key-id', keyId); }
    const description = str(input, 'description');
    if (description) { argv.push('--description', description); }
    const tier = str(input, 'tier');
    if (tier) { argv.push('--tier', tier); }
    argv.push(...awsArgv(flags));

    const r = await runShell(argv, { timeoutMs: 30_000 });
    if (r.spawnError) { return fail('cloud_aws_ssm_put-parameter', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AwsSsmPutData = { name, parameterType: type, overwrite, exitCode: r.code, parsed };
    return {
      output: [
        ok ? `Wrote \`${name}\` (${type}).` : `**Put failed (exit ${r.code})**.`,
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

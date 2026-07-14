/**
 * AWS EC2 tools -- list / start / stop / terminate.
 *
 * We stick to the structured ec2 commands (not higher-level aws
 * commands) so callers pass instance IDs / selectors directly and the
 * approval gates always show the resolved target set.
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { AWS_SCHEMA, awsAccess, awsArgv, awsFlags, awsScope, bool, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

function instanceIdsFromInput(input: ToolInput): string[] {
  const raw = input['instanceIds'];
  return Array.isArray(raw) ? (raw as unknown[]).map(String).filter(s => s.length > 0) : [];
}

// ---------------------------------------------------------------------------
// cloud_aws_ec2_list  (describe-instances with optional filters)
// ---------------------------------------------------------------------------

interface AwsEc2ListData {
  filters: readonly string[];
  instanceIds: readonly string[];
  exitCode: number | null;
  stdout: string;
  parsed: unknown;
}

export const awsEc2ListTool: Tool = {
  id: 'cloud_aws_ec2_list',
  description: 'Describe EC2 instances. Filters and instance IDs supported.',
  access: awsAccess({
    resource: (input) => {
      const ids = instanceIdsFromInput(input);
      return ids.length > 0 ? `ec2:${ids.join(',')}` : 'ec2:*';
    },
    verb: 'describe',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      instanceIds: { type: 'array', items: { type: 'string' } },
      filters: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter strings, e.g. "Name=instance-state-name,Values=running".',
      },
      maxResults: { type: 'number' },
      ...AWS_SCHEMA,
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const flags = awsFlags(input);
    const argv = ['aws', 'ec2', 'describe-instances'];
    const ids = instanceIdsFromInput(input);
    if (ids.length > 0) { argv.push('--instance-ids', ...ids); }
    const filters = Array.isArray(input['filters'])
      ? (input['filters'] as unknown[]).map(String).filter(s => s.length > 0)
      : [];
    for (const f of filters) { argv.push('--filters', f); }
    const max = (input['maxResults'] as number | undefined);
    if (typeof max === 'number' && Number.isFinite(max)) { argv.push('--max-results', String(max)); }
    argv.push(...awsArgv(flags));

    const r = await runShell(argv, { timeoutMs: 120_000 });
    if (r.spawnError) { return fail('cloud_aws_ec2_list', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AwsEc2ListData = {
      filters, instanceIds: ids, exitCode: r.code, stdout: r.stdout, parsed,
    };
    return {
      output: [
        ok ? `EC2 describe on **${awsScope(flags)}**.` : `**Failed (exit ${r.code})**.`,
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
// cloud_aws_ec2_start
// ---------------------------------------------------------------------------

interface AwsEc2StateChangeData {
  instanceIds: readonly string[];
  action: 'start' | 'stop' | 'terminate';
  exitCode: number | null;
  stdout: string;
  parsed: unknown;
}

export const awsEc2StartTool: Tool = {
  id: 'cloud_aws_ec2_start',
  description: 'Start stopped EC2 instances.',
  access: awsAccess({
    resource: (input) => `ec2:${instanceIdsFromInput(input).join(',')}`,
    verb: 'start',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      instanceIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
      ...AWS_SCHEMA,
    },
    required: ['instanceIds'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = awsFlags(input);
    const ids = instanceIdsFromInput(input);
    return {
      title: 'cloud_aws_ec2_start',
      content: [
        `Scope: **${awsScope(flags)}**`,
        `Start instances: ${ids.map(id => '`' + id + '`').join(', ')}`,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const ids = instanceIdsFromInput(input);
    if (ids.length === 0) { return fail('cloud_aws_ec2_start', 'instanceIds required'); }
    const flags = awsFlags(input);
    const argv = ['aws', 'ec2', 'start-instances', '--instance-ids', ...ids, ...awsArgv(flags)];
    const r = await runShell(argv, { timeoutMs: 120_000 });
    if (r.spawnError) { return fail('cloud_aws_ec2_start', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AwsEc2StateChangeData = { instanceIds: ids, action: 'start', exitCode: r.code, stdout: r.stdout, parsed };
    return {
      output: [
        ok ? `Started instances: ${ids.join(', ')}.` : `**Start failed (exit ${r.code})**.`,
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
// cloud_aws_ec2_stop
// ---------------------------------------------------------------------------

export const awsEc2StopTool: Tool = {
  id: 'cloud_aws_ec2_stop',
  description: 'Stop running EC2 instances. Optional --force for immediate stop.',
  access: awsAccess({
    resource: (input) => `ec2:${instanceIdsFromInput(input).join(',')}`,
    verb: 'stop',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      instanceIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
      force: { type: 'boolean', description: 'Pass --force (ungraceful).' },
      ...AWS_SCHEMA,
    },
    required: ['instanceIds'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = awsFlags(input);
    const ids = instanceIdsFromInput(input);
    return {
      title: 'cloud_aws_ec2_stop',
      content: [
        `Scope: **${awsScope(flags)}**`,
        `Stop instances: ${ids.map(id => '`' + id + '`').join(', ')}`,
        bool(input, 'force') === true ? '**--force** (immediate stop).' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const ids = instanceIdsFromInput(input);
    if (ids.length === 0) { return fail('cloud_aws_ec2_stop', 'instanceIds required'); }
    const flags = awsFlags(input);
    const argv = ['aws', 'ec2', 'stop-instances', '--instance-ids', ...ids];
    if (bool(input, 'force') === true) { argv.push('--force'); }
    argv.push(...awsArgv(flags));
    const r = await runShell(argv, { timeoutMs: 120_000 });
    if (r.spawnError) { return fail('cloud_aws_ec2_stop', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AwsEc2StateChangeData = { instanceIds: ids, action: 'stop', exitCode: r.code, stdout: r.stdout, parsed };
    return {
      output: [
        ok ? `Stopped instances: ${ids.join(', ')}.` : `**Stop failed (exit ${r.code})**.`,
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
// cloud_aws_ec2_terminate
// ---------------------------------------------------------------------------

export const awsEc2TerminateTool: Tool = {
  id: 'cloud_aws_ec2_terminate',
  description: 'Terminate EC2 instances (irrecoverable). Always gated; requires confirmCount.',
  access: awsAccess({
    resource: (input) => `ec2:${instanceIdsFromInput(input).join(',')}`,
    verb: 'terminate',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      instanceIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
      confirmCount: { type: 'number', description: 'Must equal instanceIds.length.' },
      ...AWS_SCHEMA,
    },
    required: ['instanceIds', 'confirmCount'],
    additionalProperties: false,
  },
  requiresApproval: true,
  destructive: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = awsFlags(input);
    const ids = instanceIdsFromInput(input);
    return {
      title: 'cloud_aws_ec2_terminate',
      content: [
        `Scope: **${awsScope(flags)}**`,
        `**TERMINATE** (irrecoverable): ${ids.map(id => '`' + id + '`').join(', ')}`,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const ids = instanceIdsFromInput(input);
    if (ids.length === 0) { return fail('cloud_aws_ec2_terminate', 'instanceIds required'); }
    const confirm = input['confirmCount'];
    if (typeof confirm !== 'number' || confirm !== ids.length) {
      return fail('cloud_aws_ec2_terminate', `confirmCount must equal instanceIds.length (${ids.length})`);
    }
    const flags = awsFlags(input);
    const argv = ['aws', 'ec2', 'terminate-instances', '--instance-ids', ...ids, ...awsArgv(flags)];
    const r = await runShell(argv, { timeoutMs: 120_000 });
    if (r.spawnError) { return fail('cloud_aws_ec2_terminate', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AwsEc2StateChangeData = { instanceIds: ids, action: 'terminate', exitCode: r.code, stdout: r.stdout, parsed };
    return {
      output: [
        ok ? `Terminated instances: ${ids.join(', ')}.` : `**Terminate failed (exit ${r.code})**.`,
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

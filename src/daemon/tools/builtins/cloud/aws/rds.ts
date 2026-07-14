/**
 * AWS RDS -- describe / start / stop.
 *
 * Both start and stop call the aurora-cluster-aware verbs first
 * internally by letting `aws rds` figure out the resource type; the
 * caller just passes the DB instance identifier.
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { AWS_SCHEMA, awsAccess, awsArgv, awsFlags, awsScope, str, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

// ---------------------------------------------------------------------------
// cloud:aws:rds:describe
// ---------------------------------------------------------------------------

interface AwsRdsDescribeData {
  dbInstanceId: string | undefined;
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const awsRdsDescribeTool: Tool = {
  id: 'cloud_aws_rds_describe',
  description: 'Describe RDS DB instances (optionally filtered by identifier).',
  access: awsAccess({
    resource: (input) => `rds:${str(input, 'dbInstanceId') ?? '*'}`,
    verb: 'describe RDS',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      dbInstanceId: { type: 'string' },
      maxRecords: { type: 'number', minimum: 20, maximum: 100 },
      ...AWS_SCHEMA,
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const flags = awsFlags(input);
    const argv = ['aws', 'rds', 'describe-db-instances'];
    const id = str(input, 'dbInstanceId');
    if (id) { argv.push('--db-instance-identifier', id); }
    const maxRecords = input['maxRecords'];
    if (typeof maxRecords === 'number' && Number.isFinite(maxRecords)) {
      argv.push('--max-records', String(maxRecords));
    }
    argv.push(...awsArgv(flags));

    const r = await runShell(argv, { timeoutMs: 60_000 });
    if (r.spawnError) { return fail('cloud_aws_rds_describe', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AwsRdsDescribeData = { dbInstanceId: id, exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        ok ? `RDS instances on ${awsScope(flags)}.` : `**Failed (exit ${r.code})**.`,
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
// cloud:aws:rds:start
// ---------------------------------------------------------------------------

interface AwsRdsStateChangeData {
  dbInstanceId: string;
  action: 'start' | 'stop';
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const awsRdsStartTool: Tool = {
  id: 'cloud_aws_rds_start',
  description: 'Start a stopped RDS DB instance.',
  access: awsAccess({
    resource: (input) => `rds:${str(input, 'dbInstanceId') ?? '?'}`,
    verb: 'start RDS',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      dbInstanceId: { type: 'string' },
      ...AWS_SCHEMA,
    },
    required: ['dbInstanceId'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = awsFlags(input);
    return {
      title: 'cloud_aws_rds_start',
      content: [
        `Scope: **${awsScope(flags)}**`,
        `Start DB instance: \`${str(input, 'dbInstanceId')}\``,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const id = str(input, 'dbInstanceId');
    if (!id) { return fail('cloud_aws_rds_start', 'dbInstanceId required'); }
    const flags = awsFlags(input);
    const argv = ['aws', 'rds', 'start-db-instance', '--db-instance-identifier', id, ...awsArgv(flags)];
    const r = await runShell(argv, { timeoutMs: 120_000 });
    if (r.spawnError) { return fail('cloud_aws_rds_start', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AwsRdsStateChangeData = { dbInstanceId: id, action: 'start', exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        ok ? `Starting DB instance \`${id}\`.` : `**Start failed (exit ${r.code})**.`,
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
// cloud:aws:rds:stop
// ---------------------------------------------------------------------------

export const awsRdsStopTool: Tool = {
  id: 'cloud_aws_rds_stop',
  description: 'Stop an RDS DB instance (up to 7 days without auto-start).',
  access: awsAccess({
    resource: (input) => `rds:${str(input, 'dbInstanceId') ?? '?'}`,
    verb: 'stop RDS',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      dbInstanceId: { type: 'string' },
      dbSnapshotIdentifier: { type: 'string' },
      ...AWS_SCHEMA,
    },
    required: ['dbInstanceId'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = awsFlags(input);
    return {
      title: 'cloud_aws_rds_stop',
      content: [
        `Scope: **${awsScope(flags)}**`,
        `Stop DB instance: \`${str(input, 'dbInstanceId')}\``,
        str(input, 'dbSnapshotIdentifier') ? `Final snapshot: \`${str(input, 'dbSnapshotIdentifier')}\`` : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const id = str(input, 'dbInstanceId');
    if (!id) { return fail('cloud_aws_rds_stop', 'dbInstanceId required'); }
    const flags = awsFlags(input);
    const argv = ['aws', 'rds', 'stop-db-instance', '--db-instance-identifier', id];
    const snap = str(input, 'dbSnapshotIdentifier');
    if (snap) { argv.push('--db-snapshot-identifier', snap); }
    argv.push(...awsArgv(flags));

    const r = await runShell(argv, { timeoutMs: 120_000 });
    if (r.spawnError) { return fail('cloud_aws_rds_stop', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AwsRdsStateChangeData = { dbInstanceId: id, action: 'stop', exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        ok ? `Stopping DB instance \`${id}\`.` : `**Stop failed (exit ${r.code})**.`,
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

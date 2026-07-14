/**
 * GCP Cloud SQL -- instances describe / start / stop.
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { GCP_SCHEMA, gcloudCommonArgv, gcpAccess, gcpFlags, gcpScope, str, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

// ---------------------------------------------------------------------------
// cloud:gcp:sql:describe
// ---------------------------------------------------------------------------

interface GcpSqlDescribeData {
  instance: string | undefined;
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const gcpSqlDescribeTool: Tool = {
  id: 'cloud_gcp_sql_describe',
  description: 'Describe a Cloud SQL instance (or list all when instance omitted).',
  access: gcpAccess({
    resource: (input) => `sql:${str(input, 'instance') ?? '*'}`,
    verb: 'describe SQL',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      instance: { type: 'string' },
      ...GCP_SCHEMA,
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const flags = gcpFlags(input);
    const inst = str(input, 'instance');
    const argv = inst
      ? ['gcloud', 'sql', 'instances', 'describe', inst, '--format=json']
      : ['gcloud', 'sql', 'instances', 'list', '--format=json'];
    argv.push(...gcloudCommonArgv(flags));

    const r = await runShell(argv, { timeoutMs: 60_000 });
    if (r.spawnError) { return fail('cloud_gcp_sql_describe', `gcloud not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: GcpSqlDescribeData = { instance: inst, exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        ok
          ? (inst ? `Cloud SQL \`${inst}\` on ${gcpScope(flags)}.` : `Cloud SQL instances on ${gcpScope(flags)}.`)
          : `**Failed (exit ${r.code})**.`,
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
// cloud:gcp:sql:start / stop -- implemented as instance activation-policy patches
// ---------------------------------------------------------------------------

interface GcpSqlStateData {
  instance: string;
  action: 'start' | 'stop';
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function patchActivationPolicyArgv(instance: string, policy: 'ALWAYS' | 'NEVER', flags: ReturnType<typeof gcpFlags>): string[] {
  const argv = ['gcloud', 'sql', 'instances', 'patch', instance, '--activation-policy', policy, '--format=json', '--quiet'];
  argv.push(...gcloudCommonArgv(flags));
  return argv;
}

export const gcpSqlStartTool: Tool = {
  id: 'cloud_gcp_sql_start',
  description: 'Start a Cloud SQL instance (activation-policy=ALWAYS).',
  access: gcpAccess({
    resource: (input) => `sql:${str(input, 'instance') ?? '?'}`,
    verb: 'start SQL',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      instance: { type: 'string' },
      ...GCP_SCHEMA,
    },
    required: ['instance'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = gcpFlags(input);
    return {
      title: 'cloud_gcp_sql_start',
      content: [
        `Scope: **${gcpScope(flags)}**`,
        `Start Cloud SQL instance: \`${str(input, 'instance')}\``,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const instance = str(input, 'instance');
    if (!instance) { return fail('cloud_gcp_sql_start', 'instance required'); }
    const flags = gcpFlags(input);
    const r = await runShell(patchActivationPolicyArgv(instance, 'ALWAYS', flags), { timeoutMs: 10 * 60_000 });
    if (r.spawnError) { return fail('cloud_gcp_sql_start', `gcloud not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: GcpSqlStateData = { instance, action: 'start', exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        ok ? `Started Cloud SQL \`${instance}\`.` : `**Start failed (exit ${r.code})**.`,
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

export const gcpSqlStopTool: Tool = {
  id: 'cloud_gcp_sql_stop',
  description: 'Stop a Cloud SQL instance (activation-policy=NEVER).',
  access: gcpAccess({
    resource: (input) => `sql:${str(input, 'instance') ?? '?'}`,
    verb: 'stop SQL',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      instance: { type: 'string' },
      ...GCP_SCHEMA,
    },
    required: ['instance'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = gcpFlags(input);
    return {
      title: 'cloud_gcp_sql_stop',
      content: [
        `Scope: **${gcpScope(flags)}**`,
        `Stop Cloud SQL instance: \`${str(input, 'instance')}\``,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const instance = str(input, 'instance');
    if (!instance) { return fail('cloud_gcp_sql_stop', 'instance required'); }
    const flags = gcpFlags(input);
    const r = await runShell(patchActivationPolicyArgv(instance, 'NEVER', flags), { timeoutMs: 10 * 60_000 });
    if (r.spawnError) { return fail('cloud_gcp_sql_stop', `gcloud not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: GcpSqlStateData = { instance, action: 'stop', exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        ok ? `Stopped Cloud SQL \`${instance}\`.` : `**Stop failed (exit ${r.code})**.`,
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

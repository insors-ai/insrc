/**
 * GCE tools -- instances list / start / stop / delete.
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { GCP_SCHEMA, gcloudCommonArgv, gcpAccess, gcpFlags, gcpScope, str, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

function instanceNamesFromInput(input: ToolInput): string[] {
  const raw = input['names'];
  return Array.isArray(raw) ? (raw as unknown[]).map(String).filter(s => s.length > 0) : [];
}

// ---------------------------------------------------------------------------
// cloud:gcp:compute:list
// ---------------------------------------------------------------------------

interface GcpComputeListData {
  filter: string | undefined;
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const gcpComputeListTool: Tool = {
  id: 'cloud_gcp_compute_list',
  description: 'List GCE VM instances (gcloud compute instances list).',
  access: gcpAccess({ resource: () => 'compute:*', verb: 'list instances in' }),
  inputSchema: {
    type: 'object',
    properties: {
      filter: { type: 'string', description: 'gcloud filter expression.' },
      zones: { type: 'array', items: { type: 'string' } },
      limit: { type: 'number' },
      ...GCP_SCHEMA,
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const flags = gcpFlags(input);
    const argv = ['gcloud', 'compute', 'instances', 'list', '--format=json'];
    const filter = str(input, 'filter');
    if (filter) { argv.push('--filter', filter); }
    const zones = Array.isArray(input['zones']) ? (input['zones'] as unknown[]).map(String) : [];
    if (zones.length > 0) { argv.push('--zones', zones.join(',')); }
    const limit = input['limit'];
    if (typeof limit === 'number' && Number.isFinite(limit)) { argv.push('--limit', String(limit)); }
    argv.push(...gcloudCommonArgv(flags));

    const r = await runShell(argv, { timeoutMs: 60_000 });
    if (r.spawnError) { return fail('cloud_gcp_compute_list', `gcloud not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: GcpComputeListData = { filter, exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        ok ? `Instances on ${gcpScope(flags)}.` : `**Failed (exit ${r.code})**.`,
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
// Shared pattern for start / stop / delete
// ---------------------------------------------------------------------------

interface GcpComputeStateData {
  names: readonly string[];
  zone: string | undefined;
  action: 'start' | 'stop' | 'delete';
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function requireZone(input: ToolInput, id: string): string | ToolResult {
  const z = str(input, 'zone');
  if (!z) { return fail(id, 'zone required (gcloud compute instances start/stop/delete are zonal)'); }
  return z;
}

// ---------------------------------------------------------------------------
// cloud:gcp:compute:start
// ---------------------------------------------------------------------------

export const gcpComputeStartTool: Tool = {
  id: 'cloud_gcp_compute_start',
  description: 'Start GCE instances. Zonal -- zone is required.',
  access: gcpAccess({
    resource: (input) => `compute:${instanceNamesFromInput(input).join(',')}`,
    verb: 'start',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      names: { type: 'array', items: { type: 'string' }, minItems: 1 },
      ...GCP_SCHEMA,
    },
    required: ['names', 'zone'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = gcpFlags(input);
    const names = instanceNamesFromInput(input);
    return {
      title: 'cloud_gcp_compute_start',
      content: [
        `Scope: **${gcpScope(flags)}**`,
        `Start: ${names.map(n => '`' + n + '`').join(', ')}`,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const names = instanceNamesFromInput(input);
    if (names.length === 0) { return fail('cloud_gcp_compute_start', 'names required'); }
    const z = requireZone(input, 'cloud_gcp_compute_start');
    if (typeof z !== 'string') { return z; }
    const flags = gcpFlags(input);
    const argv = ['gcloud', 'compute', 'instances', 'start', ...names, '--zone', z, '--format=json', ...gcloudCommonArgv(flags)];
    const r = await runShell(argv, { timeoutMs: 5 * 60_000 });
    if (r.spawnError) { return fail('cloud_gcp_compute_start', `gcloud not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: GcpComputeStateData = { names, zone: z, action: 'start', exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        ok ? `Started: ${names.join(', ')}.` : `**Start failed (exit ${r.code})**.`,
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
// cloud:gcp:compute:stop
// ---------------------------------------------------------------------------

export const gcpComputeStopTool: Tool = {
  id: 'cloud_gcp_compute_stop',
  description: 'Stop GCE instances. Zonal.',
  access: gcpAccess({
    resource: (input) => `compute:${instanceNamesFromInput(input).join(',')}`,
    verb: 'stop',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      names: { type: 'array', items: { type: 'string' }, minItems: 1 },
      discardLocalSsd: { type: 'boolean' },
      ...GCP_SCHEMA,
    },
    required: ['names', 'zone'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = gcpFlags(input);
    const names = instanceNamesFromInput(input);
    return {
      title: 'cloud_gcp_compute_stop',
      content: [
        `Scope: **${gcpScope(flags)}**`,
        `Stop: ${names.map(n => '`' + n + '`').join(', ')}`,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const names = instanceNamesFromInput(input);
    if (names.length === 0) { return fail('cloud_gcp_compute_stop', 'names required'); }
    const z = requireZone(input, 'cloud_gcp_compute_stop');
    if (typeof z !== 'string') { return z; }
    const flags = gcpFlags(input);
    const argv = ['gcloud', 'compute', 'instances', 'stop', ...names, '--zone', z, '--format=json'];
    if (input['discardLocalSsd'] === true) { argv.push('--discard-local-ssd=true'); }
    argv.push(...gcloudCommonArgv(flags));
    const r = await runShell(argv, { timeoutMs: 5 * 60_000 });
    if (r.spawnError) { return fail('cloud_gcp_compute_stop', `gcloud not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: GcpComputeStateData = { names, zone: z, action: 'stop', exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        ok ? `Stopped: ${names.join(', ')}.` : `**Stop failed (exit ${r.code})**.`,
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
// cloud:gcp:compute:delete
// ---------------------------------------------------------------------------

export const gcpComputeDeleteTool: Tool = {
  id: 'cloud_gcp_compute_delete',
  description: 'Delete GCE instances (irrecoverable). Requires confirmCount.',
  access: gcpAccess({
    resource: (input) => `compute:${instanceNamesFromInput(input).join(',')}`,
    verb: 'delete',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      names: { type: 'array', items: { type: 'string' }, minItems: 1 },
      confirmCount: { type: 'number', description: 'Must equal names.length.' },
      deleteDisks: { type: 'string', enum: ['all', 'boot', 'data', 'none'] },
      ...GCP_SCHEMA,
    },
    required: ['names', 'zone', 'confirmCount'],
    additionalProperties: false,
  },
  requiresApproval: true,
  destructive: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = gcpFlags(input);
    const names = instanceNamesFromInput(input);
    return {
      title: 'cloud_gcp_compute_delete',
      content: [
        `Scope: **${gcpScope(flags)}**`,
        `**DELETE** (irrecoverable): ${names.map(n => '`' + n + '`').join(', ')}`,
        str(input, 'deleteDisks') ? `Delete-disks mode: ${str(input, 'deleteDisks')}` : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const names = instanceNamesFromInput(input);
    if (names.length === 0) { return fail('cloud_gcp_compute_delete', 'names required'); }
    const confirm = input['confirmCount'];
    if (typeof confirm !== 'number' || confirm !== names.length) {
      return fail('cloud_gcp_compute_delete', `confirmCount must equal names.length (${names.length})`);
    }
    const z = requireZone(input, 'cloud_gcp_compute_delete');
    if (typeof z !== 'string') { return z; }
    const flags = gcpFlags(input);
    const argv = ['gcloud', 'compute', 'instances', 'delete', ...names, '--zone', z, '--quiet', '--format=json'];
    const dd = str(input, 'deleteDisks');
    if (dd) { argv.push('--delete-disks', dd); }
    argv.push(...gcloudCommonArgv(flags));
    const r = await runShell(argv, { timeoutMs: 10 * 60_000 });
    if (r.spawnError) { return fail('cloud_gcp_compute_delete', `gcloud not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: GcpComputeStateData = { names, zone: z, action: 'delete', exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        ok ? `Deleted: ${names.join(', ')}.` : `**Delete failed (exit ${r.code})**.`,
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

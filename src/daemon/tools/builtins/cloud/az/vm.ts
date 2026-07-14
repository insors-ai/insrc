/**
 * Azure VM -- list / start / stop / delete.
 *
 * `stop` runs `az vm deallocate` so compute charges stop (plain
 * `stop` leaves the VM billed as reserved). Callers that want
 * graceful shutdown-without-deallocate pass graceful:true.
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { AZ_SCHEMA, azAccess, azArgv, azFlags, azScope, bool, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

function namesFromInput(input: ToolInput): string[] {
  const raw = input['names'];
  return Array.isArray(raw) ? (raw as unknown[]).map(String).filter(s => s.length > 0) : [];
}

// ---------------------------------------------------------------------------
// cloud:az:vm:list
// ---------------------------------------------------------------------------

interface AzVmListData {
  resourceGroup: string | undefined;
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const azVmListTool: Tool = {
  id: 'cloud_az_vm_list',
  description: 'List Azure VMs (scoped to resourceGroup when supplied).',
  access: azAccess({ resource: () => 'vm:*', verb: 'list VMs in' }),
  inputSchema: {
    type: 'object',
    properties: {
      showDetails: { type: 'boolean', description: 'Pass --show-details (hydrates IPs, power state, ...).' },
      ...AZ_SCHEMA,
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const flags = azFlags(input);
    const argv = ['az', 'vm', 'list', '--output', 'json'];
    if (bool(input, 'showDetails') === true) { argv.push('--show-details'); }
    argv.push(...azArgv(flags));

    const r = await runShell(argv, { timeoutMs: 60_000 });
    if (r.spawnError) { return fail('cloud_az_vm_list', `az CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AzVmListData = { resourceGroup: flags.resourceGroup, exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        ok ? `VMs on ${azScope(flags)}.` : `**Failed (exit ${r.code})**.`,
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
// cloud:az:vm:start
// ---------------------------------------------------------------------------

interface AzVmStateData {
  names: readonly string[];
  action: 'start' | 'stop' | 'delete';
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function requireRg(flags: ReturnType<typeof azFlags>, id: string): string | ToolResult {
  if (!flags.resourceGroup) { return fail(id, 'resourceGroup required'); }
  return flags.resourceGroup;
}

export const azVmStartTool: Tool = {
  id: 'cloud_az_vm_start',
  description: 'Start Azure VMs in a resource group.',
  access: azAccess({
    resource: (input) => `vm:${namesFromInput(input).join(',')}`,
    verb: 'start',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      names: { type: 'array', items: { type: 'string' }, minItems: 1 },
      ...AZ_SCHEMA,
    },
    required: ['names', 'resourceGroup'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = azFlags(input);
    const names = namesFromInput(input);
    return {
      title: 'cloud_az_vm_start',
      content: [
        `Scope: **${azScope(flags)}**`,
        `Start: ${names.map(n => '`' + n + '`').join(', ')}`,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const names = namesFromInput(input);
    if (names.length === 0) { return fail('cloud_az_vm_start', 'names required'); }
    const flags = azFlags(input);
    const rg = requireRg(flags, 'cloud_az_vm_start');
    if (typeof rg !== 'string') { return rg; }
    const argv = ['az', 'vm', 'start', '--name', ...names, '--resource-group', rg, '--output', 'json', ...azArgv(flags, { includeResourceGroup: false })];
    const r = await runShell(argv, { timeoutMs: 10 * 60_000 });
    if (r.spawnError) { return fail('cloud_az_vm_start', `az CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: AzVmStateData = { names, action: 'start', exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
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
// cloud:az:vm:stop  (deallocate by default)
// ---------------------------------------------------------------------------

export const azVmStopTool: Tool = {
  id: 'cloud_az_vm_stop',
  description: 'Stop Azure VMs. Deallocates by default so compute billing stops; graceful:true keeps the VM billed.',
  access: azAccess({
    resource: (input) => `vm:${namesFromInput(input).join(',')}`,
    verb: 'stop/deallocate',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      names: { type: 'array', items: { type: 'string' }, minItems: 1 },
      graceful: { type: 'boolean', description: 'Use `az vm stop` instead of deallocate. VM stays billed.' },
      ...AZ_SCHEMA,
    },
    required: ['names', 'resourceGroup'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = azFlags(input);
    const names = namesFromInput(input);
    const graceful = bool(input, 'graceful') === true;
    return {
      title: 'cloud_az_vm_stop',
      content: [
        `Scope: **${azScope(flags)}**`,
        `${graceful ? 'Graceful **stop** (still billed)' : '**Deallocate** (billing stops)'}: ${names.map(n => '`' + n + '`').join(', ')}`,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const names = namesFromInput(input);
    if (names.length === 0) { return fail('cloud_az_vm_stop', 'names required'); }
    const flags = azFlags(input);
    const rg = requireRg(flags, 'cloud_az_vm_stop');
    if (typeof rg !== 'string') { return rg; }
    const verb = bool(input, 'graceful') === true ? 'stop' : 'deallocate';
    const argv = ['az', 'vm', verb, '--name', ...names, '--resource-group', rg, '--output', 'json', ...azArgv(flags, { includeResourceGroup: false })];
    const r = await runShell(argv, { timeoutMs: 10 * 60_000 });
    if (r.spawnError) { return fail('cloud_az_vm_stop', `az CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: AzVmStateData = { names, action: 'stop', exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        ok ? `${verb === 'deallocate' ? 'Deallocated' : 'Stopped'}: ${names.join(', ')}.` : `**${verb} failed (exit ${r.code})**.`,
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
// cloud:az:vm:delete
// ---------------------------------------------------------------------------

export const azVmDeleteTool: Tool = {
  id: 'cloud_az_vm_delete',
  description: 'Delete Azure VMs. Requires confirmCount == names.length.',
  access: azAccess({
    resource: (input) => `vm:${namesFromInput(input).join(',')}`,
    verb: 'delete',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      names: { type: 'array', items: { type: 'string' }, minItems: 1 },
      confirmCount: { type: 'number' },
      forceDeletion: { type: 'boolean' },
      ...AZ_SCHEMA,
    },
    required: ['names', 'resourceGroup', 'confirmCount'],
    additionalProperties: false,
  },
  requiresApproval: true,
  destructive: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = azFlags(input);
    const names = namesFromInput(input);
    return {
      title: 'cloud_az_vm_delete',
      content: [
        `Scope: **${azScope(flags)}**`,
        `**DELETE** VMs: ${names.map(n => '`' + n + '`').join(', ')}`,
        bool(input, 'forceDeletion') === true ? '**--force-deletion** (bypass some safety guards).' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const names = namesFromInput(input);
    if (names.length === 0) { return fail('cloud_az_vm_delete', 'names required'); }
    const confirm = input['confirmCount'];
    if (typeof confirm !== 'number' || confirm !== names.length) {
      return fail('cloud_az_vm_delete', `confirmCount must equal names.length (${names.length})`);
    }
    const flags = azFlags(input);
    const rg = requireRg(flags, 'cloud_az_vm_delete');
    if (typeof rg !== 'string') { return rg; }
    const argv = ['az', 'vm', 'delete', '--name', ...names, '--resource-group', rg, '--yes', '--output', 'json'];
    if (bool(input, 'forceDeletion') === true) { argv.push('--force-deletion', 'true'); }
    argv.push(...azArgv(flags, { includeResourceGroup: false }));

    const r = await runShell(argv, { timeoutMs: 15 * 60_000 });
    if (r.spawnError) { return fail('cloud_az_vm_delete', `az CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: AzVmStateData = { names, action: 'delete', exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
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

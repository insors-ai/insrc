/**
 * Azure Key Vault -- secret show / set.
 *
 * Values redact in rendered output unless reveal:true; the data
 * payload always carries the plaintext so downstream tools can
 * forward it.
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { AZ_SCHEMA, azAccess, azArgv, azFlags, azScope, bool, str, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

// ---------------------------------------------------------------------------
// cloud:az:keyvault:secret:show
// ---------------------------------------------------------------------------

interface AzKvSecretShowData {
  vault: string;
  name: string;
  version: string | undefined;
  revealed: boolean;
  exitCode: number | null;
  value: string | undefined;
  parsed: unknown;
}

export const azKeyvaultSecretShowTool: Tool = {
  id: 'cloud_az_keyvault_secret_show',
  description: 'Show a Key Vault secret. Value redacts unless reveal:true.',
  access: azAccess({
    resource: (input) => `kv:${str(input, 'vault') ?? '?'}/${str(input, 'name') ?? '?'}`,
    verb: 'read secret',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      vault: { type: 'string', description: 'Key Vault name.' },
      name: { type: 'string', description: 'Secret name.' },
      version: { type: 'string' },
      reveal: { type: 'boolean' },
      ...AZ_SCHEMA,
    },
    required: ['vault', 'name'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = azFlags(input);
    return {
      title: 'cloud_az_keyvault_secret_show',
      content: [
        `Scope: **${azScope(flags)}**`,
        `Vault: \`${str(input, 'vault')}\`, secret: \`${str(input, 'name')}\`${str(input, 'version') ? ` (v${str(input, 'version')})` : ''}`,
        bool(input, 'reveal') === true ? '**reveal:true** -- value will appear in output.' : 'Value will be redacted in output.',
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const vault = str(input, 'vault');
    const name = str(input, 'name');
    if (!vault || !name) { return fail('cloud_az_keyvault_secret_show', 'vault and name required'); }
    const flags = azFlags(input);
    const argv = ['az', 'keyvault', 'secret', 'show', '--vault-name', vault, '--name', name, '--output', 'json'];
    const version = str(input, 'version');
    if (version) { argv.push('--version', version); }
    argv.push(...azArgv(flags, { includeResourceGroup: false }));

    const r = await runShell(argv, { timeoutMs: 30_000 });
    if (r.spawnError) { return fail('cloud_az_keyvault_secret_show', `az CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    let value: string | undefined;
    if (parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>;
      if (typeof p['value'] === 'string') { value = p['value']; }
    }
    const reveal = bool(input, 'reveal') === true;
    const data: AzKvSecretShowData = { vault, name, version, revealed: reveal, exitCode: r.code, value, parsed };
    return {
      output: [
        ok ? `Secret \`${name}\` from vault \`${vault}\`.` : `**Failed (exit ${r.code})**.`,
        value !== undefined
          ? (reveal
              ? '\n**Value**\n```\n' + value + '\n```'
              : `Value: **<redacted, ${value.length} chars>**`)
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
// cloud:az:keyvault:secret:set
// ---------------------------------------------------------------------------

interface AzKvSecretSetData {
  vault: string;
  name: string;
  exitCode: number | null;
  parsed: unknown;
}

export const azKeyvaultSecretSetTool: Tool = {
  id: 'cloud_az_keyvault_secret_set',
  description: 'Set a Key Vault secret (creates a new version).',
  access: azAccess({
    resource: (input) => `kv:${str(input, 'vault') ?? '?'}/${str(input, 'name') ?? '?'}`,
    verb: 'write secret',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      vault: { type: 'string' },
      name: { type: 'string' },
      value: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' }, description: 'KEY=VALUE pairs.' },
      contentType: { type: 'string' },
      ...AZ_SCHEMA,
    },
    required: ['vault', 'name', 'value'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = azFlags(input);
    const v = str(input, 'value');
    return {
      title: 'cloud_az_keyvault_secret_set',
      content: [
        `Scope: **${azScope(flags)}**`,
        `Vault: \`${str(input, 'vault')}\`, secret: \`${str(input, 'name')}\``,
        `Value: **<redacted, ${v ? v.length : 0} chars>**`,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const vault = str(input, 'vault');
    const name  = str(input, 'name');
    const value = str(input, 'value');
    if (!vault || !name || value === undefined) { return fail('cloud_az_keyvault_secret_set', 'vault, name and value required'); }
    const flags = azFlags(input);
    const argv = ['az', 'keyvault', 'secret', 'set', '--vault-name', vault, '--name', name, '--value', value, '--output', 'json'];
    const tags = Array.isArray(input['tags']) ? (input['tags'] as unknown[]).map(String).filter(s => s.length > 0) : [];
    if (tags.length > 0) { argv.push('--tags', ...tags); }
    const contentType = str(input, 'contentType');
    if (contentType) { argv.push('--content-type', contentType); }
    argv.push(...azArgv(flags, { includeResourceGroup: false }));

    const r = await runShell(argv, { timeoutMs: 30_000 });
    if (r.spawnError) { return fail('cloud_az_keyvault_secret_set', `az CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AzKvSecretSetData = { vault, name, exitCode: r.code, parsed };
    return {
      output: [
        ok ? `Set secret \`${name}\` in vault \`${vault}\`.` : `**Set failed (exit ${r.code})**.`,
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

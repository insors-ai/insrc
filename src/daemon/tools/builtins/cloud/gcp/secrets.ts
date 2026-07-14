/**
 * GCP Secret Manager -- versions access / add.
 *
 * Values redact in rendered output unless reveal:true is set, and
 * the data payload still carries the plaintext so downstream tools
 * can forward it without parsing markdown.
 */

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { GCP_SCHEMA, bool, gcloudCommonArgv, gcpAccess, gcpFlags, gcpScope, str } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

// ---------------------------------------------------------------------------
// cloud:gcp:secrets:access
// ---------------------------------------------------------------------------

interface GcpSecretsAccessData {
  secret: string;
  version: string;
  revealed: boolean;
  exitCode: number | null;
  value: string;
}

export const gcpSecretsAccessTool: Tool = {
  id: 'cloud_gcp_secrets_access',
  description: 'Access a Secret Manager version. Value redacts in output unless reveal:true.',
  access: gcpAccess({
    resource: (input) => `secrets:${str(input, 'secret') ?? '?'}`,
    verb: 'read secret',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      secret: { type: 'string' },
      version: { type: 'string', description: 'Default "latest".' },
      reveal: { type: 'boolean' },
      ...GCP_SCHEMA,
    },
    required: ['secret'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = gcpFlags(input);
    return {
      title: 'cloud_gcp_secrets_access',
      content: [
        `Scope: **${gcpScope(flags)}**`,
        `Secret: \`${str(input, 'secret')}\` (version \`${str(input, 'version') ?? 'latest'}\`)`,
        bool(input, 'reveal') === true ? '**reveal:true** -- value will appear in output.' : 'Value will be redacted in output.',
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const secret = str(input, 'secret');
    if (!secret) { return fail('cloud_gcp_secrets_access', 'secret required'); }
    const version = str(input, 'version') ?? 'latest';
    const flags = gcpFlags(input);
    const argv = ['gcloud', 'secrets', 'versions', 'access', version, '--secret', secret, ...gcloudCommonArgv(flags)];
    const r = await runShell(argv, { timeoutMs: 30_000 });
    if (r.spawnError) { return fail('cloud_gcp_secrets_access', `gcloud not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const reveal = bool(input, 'reveal') === true;
    const data: GcpSecretsAccessData = { secret, version, revealed: reveal, exitCode: r.code, value: r.stdout };
    return {
      output: [
        ok ? `Fetched secret \`${secret}\` (${version}).` : `**Failed (exit ${r.code})**.`,
        ok
          ? (reveal
              ? '\n**Value**\n```\n' + r.stdout + '\n```'
              : `Value: **<redacted, ${r.stdout.length} chars>**`)
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
// cloud:gcp:secrets:add  (versions add)
// ---------------------------------------------------------------------------

interface GcpSecretsAddData {
  secret: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const gcpSecretsAddTool: Tool = {
  id: 'cloud_gcp_secrets_add',
  description: 'Add a new version to an existing Secret Manager secret.',
  access: gcpAccess({
    resource: (input) => `secrets:${str(input, 'secret') ?? '?'}`,
    verb: 'add secret version',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      secret: { type: 'string' },
      value: { type: 'string', description: 'Secret value (kept redacted in gate and output).' },
      ...GCP_SCHEMA,
    },
    required: ['secret', 'value'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = gcpFlags(input);
    const v = str(input, 'value');
    return {
      title: 'cloud_gcp_secrets_add',
      content: [
        `Scope: **${gcpScope(flags)}**`,
        `Secret: \`${str(input, 'secret')}\``,
        `Value: **<redacted, ${v ? v.length : 0} chars>**`,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const secret = str(input, 'secret');
    const value = str(input, 'value');
    if (!secret || value === undefined) { return fail('cloud_gcp_secrets_add', 'secret and value required'); }
    const flags = gcpFlags(input);
    const tmpPath = join(tmpdir(), `insrc-gcp-secret-${process.pid}-${Date.now()}.bin`);
    await fs.writeFile(tmpPath, value, 'utf8');
    try {
      const argv = ['gcloud', 'secrets', 'versions', 'add', secret, '--data-file', tmpPath, '--format=json', ...gcloudCommonArgv(flags)];
      const r = await runShell(argv, { timeoutMs: 30_000 });
      if (r.spawnError) { return fail('cloud_gcp_secrets_add', `gcloud not found: ${r.stderr.trim()}`); }
      const ok = r.code === 0;
      const data: GcpSecretsAddData = { secret, exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
      return {
        output: [
          ok ? `Added new version to \`${secret}\`.` : `**Add failed (exit ${r.code})**.`,
          r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
        ].filter(Boolean).join('\n'),
        format: 'markdown',
        success: ok,
        ...(ok ? {} : { error: `exit ${r.code}` }),
        data,
      };
    } finally {
      try { await fs.unlink(tmpPath); } catch { /* ignore */ }
    }
  },
};

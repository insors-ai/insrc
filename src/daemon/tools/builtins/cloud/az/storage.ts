/**
 * Azure Blob Storage -- list / copy (upload/download) / delete.
 *
 * We shell out to `az storage blob ...` which requires a storage
 * account name and either --account-key / --sas-token / AAD auth.
 * Callers pass those per-call; we don't capture them for safety.
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { AZ_SCHEMA, azAccess, azArgv, azFlags, azScope, bool, str, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

function authArgv(input: ToolInput): string[] {
  const args: string[] = [];
  const accountKey = str(input, 'accountKey');
  const sasToken   = str(input, 'sasToken');
  const connStr    = str(input, 'connectionString');
  const authMode   = str(input, 'authMode');
  if (accountKey) { args.push('--account-key', accountKey); }
  if (sasToken)   { args.push('--sas-token',   sasToken); }
  if (connStr)    { args.push('--connection-string', connStr); }
  if (authMode)   { args.push('--auth-mode', authMode); }
  return args;
}

const AUTH_SCHEMA = {
  accountName:      { type: 'string', description: 'Storage account name.' },
  accountKey:       { type: 'string', description: 'Account key (alternative to SAS / AAD).' },
  sasToken:         { type: 'string' },
  connectionString: { type: 'string' },
  authMode:         { type: 'string', enum: ['key', 'login'], description: 'Default AAD with `login` when set.' },
} as const;

// ---------------------------------------------------------------------------
// cloud:az:storage:blob:ls
// ---------------------------------------------------------------------------

interface AzBlobListData {
  container: string;
  prefix: string | undefined;
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const azStorageBlobLsTool: Tool = {
  id: 'cloud_az_storage_blob_ls',
  description: 'List blobs in a storage container.',
  access: azAccess({
    resource: (input) => `blob:${str(input, 'accountName') ?? '?'}/${str(input, 'container') ?? '?'}`,
    verb: 'list blobs in',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      container: { type: 'string' },
      prefix: { type: 'string' },
      limit: { type: 'number' },
      ...AUTH_SCHEMA,
      ...AZ_SCHEMA,
    },
    required: ['container', 'accountName'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const container = str(input, 'container');
    const account = str(input, 'accountName');
    if (!container || !account) { return fail('cloud_az_storage_blob_ls', 'container and accountName required'); }
    const flags = azFlags(input);
    const argv = ['az', 'storage', 'blob', 'list', '--container-name', container, '--account-name', account, '--output', 'json'];
    const prefix = str(input, 'prefix');
    if (prefix) { argv.push('--prefix', prefix); }
    const limit = input['limit'];
    if (typeof limit === 'number' && Number.isFinite(limit)) { argv.push('--num-results', String(limit)); }
    argv.push(...authArgv(input));
    argv.push(...azArgv(flags, { includeResourceGroup: false }));

    const r = await runShell(argv, { timeoutMs: 60_000 });
    if (r.spawnError) { return fail('cloud_az_storage_blob_ls', `az CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AzBlobListData = { container, prefix, exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        ok ? `Blobs in \`${container}\` (account \`${account}\`) on ${azScope(flags)}.` : `**Failed (exit ${r.code})**.`,
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
// cloud:az:storage:blob:cp -- upload or download depending on direction
// ---------------------------------------------------------------------------

interface AzBlobCpData {
  direction: 'upload' | 'download';
  container: string;
  blobName: string;
  localPath: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const azStorageBlobCpTool: Tool = {
  id: 'cloud_az_storage_blob_cp',
  description: 'Upload or download a blob. direction=upload sends localPath to the blob; download does the reverse.',
  access: azAccess({
    resource: (input) => `blob:${str(input, 'accountName') ?? '?'}/${str(input, 'container') ?? '?'}/${str(input, 'blobName') ?? '?'}`,
    verb: 'upload/download blob',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      direction: { type: 'string', enum: ['upload', 'download'] },
      container: { type: 'string' },
      blobName: { type: 'string' },
      localPath: { type: 'string' },
      overwrite: { type: 'boolean' },
      ...AUTH_SCHEMA,
      ...AZ_SCHEMA,
    },
    required: ['direction', 'container', 'blobName', 'localPath', 'accountName'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = azFlags(input);
    const direction = str(input, 'direction') ?? '';
    return {
      title: 'cloud_az_storage_blob_cp',
      content: [
        `Scope: **${azScope(flags)}**`,
        `Account: \`${str(input, 'accountName')}\`, container: \`${str(input, 'container')}\``,
        direction === 'upload'
          ? `Upload: \`${str(input, 'localPath')}\` -> blob \`${str(input, 'blobName')}\``
          : `Download: blob \`${str(input, 'blobName')}\` -> \`${str(input, 'localPath')}\``,
        bool(input, 'overwrite') === true ? 'overwrite:true' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const direction = str(input, 'direction') as AzBlobCpData['direction'] | undefined;
    const container = str(input, 'container');
    const blobName = str(input, 'blobName');
    const localPath = str(input, 'localPath');
    const account = str(input, 'accountName');
    if (!direction || !container || !blobName || !localPath || !account) {
      return fail('cloud_az_storage_blob_cp', 'direction, container, blobName, localPath, accountName required');
    }
    const flags = azFlags(input);
    const verb = direction === 'upload' ? 'upload' : 'download';
    const argv = ['az', 'storage', 'blob', verb,
      '--container-name', container,
      '--name', blobName,
      '--file', localPath,
      '--account-name', account,
      '--output', 'json',
    ];
    if (bool(input, 'overwrite') === true) { argv.push('--overwrite'); }
    argv.push(...authArgv(input));
    argv.push(...azArgv(flags, { includeResourceGroup: false }));

    const r = await runShell(argv, { timeoutMs: 30 * 60_000 });
    if (r.spawnError) { return fail('cloud_az_storage_blob_cp', `az CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: AzBlobCpData = { direction, container, blobName, localPath, exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        ok
          ? (direction === 'upload'
              ? `Uploaded \`${localPath}\` -> \`${container}/${blobName}\`.`
              : `Downloaded \`${container}/${blobName}\` -> \`${localPath}\`.`)
          : `**${direction} failed (exit ${r.code})**.`,
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
// cloud:az:storage:blob:rm
// ---------------------------------------------------------------------------

interface AzBlobRmData {
  container: string;
  blobName: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const azStorageBlobRmTool: Tool = {
  id: 'cloud_az_storage_blob_rm',
  description: 'Delete a blob. Always gated.',
  access: azAccess({
    resource: (input) => `blob:${str(input, 'accountName') ?? '?'}/${str(input, 'container') ?? '?'}/${str(input, 'blobName') ?? '?'}`,
    verb: 'delete blob',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      container: { type: 'string' },
      blobName: { type: 'string' },
      deleteSnapshots: { type: 'string', enum: ['include', 'only'] },
      ...AUTH_SCHEMA,
      ...AZ_SCHEMA,
    },
    required: ['container', 'blobName', 'accountName'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = azFlags(input);
    return {
      title: 'cloud_az_storage_blob_rm',
      content: [
        `Scope: **${azScope(flags)}**`,
        `Account: \`${str(input, 'accountName')}\`, container: \`${str(input, 'container')}\``,
        `Delete blob: \`${str(input, 'blobName')}\``,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const container = str(input, 'container');
    const blobName = str(input, 'blobName');
    const account = str(input, 'accountName');
    if (!container || !blobName || !account) { return fail('cloud_az_storage_blob_rm', 'container, blobName, accountName required'); }
    const flags = azFlags(input);
    const argv = ['az', 'storage', 'blob', 'delete',
      '--container-name', container,
      '--name', blobName,
      '--account-name', account,
      '--output', 'json',
    ];
    const snap = str(input, 'deleteSnapshots');
    if (snap) { argv.push('--delete-snapshots', snap); }
    argv.push(...authArgv(input));
    argv.push(...azArgv(flags, { includeResourceGroup: false }));

    const r = await runShell(argv, { timeoutMs: 60_000 });
    if (r.spawnError) { return fail('cloud_az_storage_blob_rm', `az CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: AzBlobRmData = { container, blobName, exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        ok ? `Deleted blob \`${container}/${blobName}\`.` : `**Delete failed (exit ${r.code})**.`,
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

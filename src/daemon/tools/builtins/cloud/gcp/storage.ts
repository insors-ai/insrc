/**
 * GCS tools -- ls / cp / rm via `gcloud storage`.
 *
 * The newer `gcloud storage` subcommand is preferred over gsutil
 * because it is bundled with gcloud SDK and supports parallelism
 * without extra config.
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { GCP_SCHEMA, bool, gcloudCommonArgv, gcpAccess, gcpFlags, gcpScope, str } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

// ---------------------------------------------------------------------------
// cloud:gcp:storage:ls
// ---------------------------------------------------------------------------

interface GcpStorageLsData {
  path: string;
  recursive: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const gcpStorageLsTool: Tool = {
  id: 'cloud_gcp_storage_ls',
  description: 'List a GCS bucket or prefix.',
  access: gcpAccess({
    resource: (input) => `gcs:${str(input, 'path') ?? '<all>'}`,
    verb: 'list',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'gs://bucket[/prefix]; omit to list buckets.' },
      recursive: { type: 'boolean' },
      long: { type: 'boolean', description: 'Pass --long.' },
      ...GCP_SCHEMA,
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const flags = gcpFlags(input);
    const path = str(input, 'path') ?? '';
    const argv = ['gcloud', 'storage', 'ls'];
    if (path) { argv.push(path); }
    if (bool(input, 'recursive') === true) { argv.push('--recursive'); }
    if (bool(input, 'long')      === true) { argv.push('--long'); }
    argv.push(...gcloudCommonArgv(flags));

    const r = await runShell(argv, { timeoutMs: 60_000 });
    if (r.spawnError) { return fail('cloud_gcp_storage_ls', `gcloud not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: GcpStorageLsData = { path, recursive: bool(input, 'recursive') ?? false, exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        ok ? `\`gcloud storage ls ${path}\` on ${gcpScope(flags)}.` : `**Failed (exit ${r.code})**.`,
        r.stdout ? '\n```\n' + r.stdout.replace(/\n+$/, '') + '\n```' : '',
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
// cloud:gcp:storage:cp
// ---------------------------------------------------------------------------

interface GcpStorageCpData {
  source: string;
  destination: string;
  recursive: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const gcpStorageCpTool: Tool = {
  id: 'cloud_gcp_storage_cp',
  description: 'Copy to/from/within GCS via `gcloud storage cp`. Always gated.',
  access: gcpAccess({
    resource: (input) => `gcs:${str(input, 'source') ?? '?'}->${str(input, 'destination') ?? '?'}`,
    verb: 'copy',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string' },
      destination: { type: 'string' },
      recursive: { type: 'boolean' },
      preserveAcl: { type: 'boolean' },
      cacheControl: { type: 'string' },
      ...GCP_SCHEMA,
    },
    required: ['source', 'destination'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = gcpFlags(input);
    return {
      title: 'cloud_gcp_storage_cp',
      content: [
        `Scope: **${gcpScope(flags)}**`,
        `\`${str(input, 'source')}\` -> \`${str(input, 'destination')}\``,
        bool(input, 'recursive') === true ? 'Recursive.' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const src = str(input, 'source');
    const dst = str(input, 'destination');
    if (!src || !dst) { return fail('cloud_gcp_storage_cp', 'source and destination required'); }
    const flags = gcpFlags(input);
    const argv = ['gcloud', 'storage', 'cp', src, dst];
    if (bool(input, 'recursive')   === true) { argv.push('--recursive'); }
    if (bool(input, 'preserveAcl') === true) { argv.push('--preserve-acl'); }
    const cache = str(input, 'cacheControl');
    if (cache) { argv.push('--cache-control', cache); }
    argv.push(...gcloudCommonArgv(flags));

    const r = await runShell(argv, { timeoutMs: 30 * 60_000 });
    if (r.spawnError) { return fail('cloud_gcp_storage_cp', `gcloud not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: GcpStorageCpData = { source: src, destination: dst, recursive: bool(input, 'recursive') ?? false, exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        ok ? `Copied \`${src}\` -> \`${dst}\`.` : `**Copy failed (exit ${r.code})**.`,
        r.stdout ? '\n```\n' + r.stdout.replace(/\n+$/, '') + '\n```' : '',
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
// cloud:gcp:storage:rm
// ---------------------------------------------------------------------------

interface GcpStorageRmData {
  path: string;
  recursive: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const gcpStorageRmTool: Tool = {
  id: 'cloud_gcp_storage_rm',
  description: 'Delete GCS objects. Always gated; recursive requires confirmBucket.',
  access: gcpAccess({
    resource: (input) => `gcs:${str(input, 'path') ?? '?'}`,
    verb: 'delete',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      recursive: { type: 'boolean' },
      confirmBucket: { type: 'string', description: 'Required for recursive -- must equal the bucket name.' },
      ...GCP_SCHEMA,
    },
    required: ['path'],
    additionalProperties: false,
  },
  requiresApproval: true,
  destructive: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = gcpFlags(input);
    return {
      title: 'cloud_gcp_storage_rm',
      content: [
        `Scope: **${gcpScope(flags)}**`,
        `Delete \`${str(input, 'path')}\``,
        bool(input, 'recursive') === true ? '**Recursive**.' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const path = str(input, 'path');
    if (!path) { return fail('cloud_gcp_storage_rm', 'path required'); }
    const recursive = bool(input, 'recursive') === true;
    if (recursive) {
      const m = path.match(/^gs:\/\/([^/]+)/);
      const bucket = m?.[1];
      if (!bucket) { return fail('cloud_gcp_storage_rm', 'recursive rm: could not parse bucket from path'); }
      const confirm = str(input, 'confirmBucket');
      if (confirm !== bucket) {
        return fail('cloud_gcp_storage_rm', `recursive rm requires confirmBucket to match "${bucket}"`);
      }
    }
    const flags = gcpFlags(input);
    const argv = ['gcloud', 'storage', 'rm', path];
    if (recursive) { argv.push('--recursive'); }
    argv.push(...gcloudCommonArgv(flags));

    const r = await runShell(argv, { timeoutMs: 15 * 60_000 });
    if (r.spawnError) { return fail('cloud_gcp_storage_rm', `gcloud not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: GcpStorageRmData = { path, recursive, exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        ok ? `Deleted \`${path}\`.` : `**Delete failed (exit ${r.code})**.`,
        r.stdout ? '\n```\n' + r.stdout.replace(/\n+$/, '') + '\n```' : '',
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

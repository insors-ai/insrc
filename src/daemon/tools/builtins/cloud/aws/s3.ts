/**
 * AWS S3 tools -- ls / cp / rm / sync.
 *
 * `aws s3 ...` is a higher-level wrapper over the native service
 * commands; we shell out to it directly so recursive copies, glob
 * filters, and sync semantics are handled by the CLI.
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { AWS_SCHEMA, awsAccess, awsArgv, awsFlags, awsScope, bool, str } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

// ---------------------------------------------------------------------------
// aws:s3:ls
// ---------------------------------------------------------------------------

interface AwsS3LsData {
  path: string;
  recursive: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const awsS3LsTool: Tool = {
  id: 'cloud_aws_s3_ls',
  description: 'List an S3 bucket or prefix.',
  access: awsAccess({
    resource: (input) => `s3:${str(input, 'path') ?? '<all>'}`,
    verb: 'list',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 's3://bucket[/prefix]. Pass empty/omitted to list buckets.' },
      recursive: { type: 'boolean' },
      humanReadable: { type: 'boolean' },
      summarize: { type: 'boolean' },
      ...AWS_SCHEMA,
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const flags = awsFlags(input);
    const path = str(input, 'path') ?? '';
    const argv = ['aws', 's3', 'ls'];
    if (path) { argv.push(path); }
    if (bool(input, 'recursive')     === true) { argv.push('--recursive'); }
    if (bool(input, 'humanReadable') === true) { argv.push('--human-readable'); }
    if (bool(input, 'summarize')     === true) { argv.push('--summarize'); }
    argv.push(...awsArgv(flags, { defaultJson: false })); // ls defaults to table-ish output

    const r = await runShell(argv, { timeoutMs: 60_000 });
    if (r.spawnError) { return fail('cloud_aws_s3_ls', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: AwsS3LsData = {
      path, recursive: bool(input, 'recursive') ?? false,
      exitCode: r.code, stdout: r.stdout, stderr: r.stderr,
    };
    return {
      output: [
        ok ? `\`aws s3 ls ${path}\` on ${awsScope(flags)}` : `**Failed (exit ${r.code})**`,
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
// aws:s3:cp
// ---------------------------------------------------------------------------

interface AwsS3CpData {
  source: string;
  destination: string;
  recursive: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const awsS3CpTool: Tool = {
  id: 'cloud_aws_s3_cp',
  description: 'Copy to/from/within S3. Gated for write targets.',
  access: awsAccess({
    resource: (input) => `s3:${str(input, 'source') ?? '?'}->${str(input, 'destination') ?? '?'}`,
    verb: 'copy',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Local path or s3:// URI.' },
      destination: { type: 'string', description: 'Local path or s3:// URI.' },
      recursive: { type: 'boolean' },
      exclude: { type: 'array', items: { type: 'string' } },
      include: { type: 'array', items: { type: 'string' } },
      acl: { type: 'string', description: 'canned ACL, e.g. private, public-read.' },
      storageClass: { type: 'string' },
      sseKmsKeyId: { type: 'string' },
      ...AWS_SCHEMA,
    },
    required: ['source', 'destination'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = awsFlags(input);
    return {
      title: 'cloud_aws_s3_cp',
      content: [
        `Scope: **${awsScope(flags)}**`,
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
    if (!src || !dst) { return fail('cloud_aws_s3_cp', 'source and destination required'); }
    const flags = awsFlags(input);
    const argv = ['aws', 's3', 'cp', src, dst];
    if (bool(input, 'recursive') === true) { argv.push('--recursive'); }
    const excludes = Array.isArray(input['exclude']) ? (input['exclude'] as unknown[]).map(String) : [];
    for (const ex of excludes) { argv.push('--exclude', ex); }
    const includes = Array.isArray(input['include']) ? (input['include'] as unknown[]).map(String) : [];
    for (const inc of includes) { argv.push('--include', inc); }
    const acl = str(input, 'acl');
    if (acl) { argv.push('--acl', acl); }
    const sc = str(input, 'storageClass');
    if (sc) { argv.push('--storage-class', sc); }
    const kms = str(input, 'sseKmsKeyId');
    if (kms) { argv.push('--sse', 'aws:kms', '--sse-kms-key-id', kms); }
    argv.push(...awsArgv(flags, { defaultJson: false }));

    const r = await runShell(argv, { timeoutMs: 30 * 60_000 });
    if (r.spawnError) { return fail('cloud_aws_s3_cp', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: AwsS3CpData = {
      source: src, destination: dst,
      recursive: bool(input, 'recursive') ?? false,
      exitCode: r.code, stdout: r.stdout, stderr: r.stderr,
    };
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
// aws:s3:rm
// ---------------------------------------------------------------------------

interface AwsS3RmData {
  path: string;
  recursive: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const awsS3RmTool: Tool = {
  id: 'cloud_aws_s3_rm',
  description: 'Delete S3 objects. Always gated. Recursive delete requires confirmBucket to match.',
  access: awsAccess({
    resource: (input) => `s3:${str(input, 'path') ?? '?'}`,
    verb: 'delete',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 's3://bucket/key or s3://bucket/prefix for recursive.' },
      recursive: { type: 'boolean' },
      confirmBucket: { type: 'string', description: 'Required for recursive -- must equal the bucket name.' },
      exclude: { type: 'array', items: { type: 'string' } },
      include: { type: 'array', items: { type: 'string' } },
      ...AWS_SCHEMA,
    },
    required: ['path'],
    additionalProperties: false,
  },
  requiresApproval: true,
  destructive: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = awsFlags(input);
    return {
      title: 'cloud_aws_s3_rm',
      content: [
        `Scope: **${awsScope(flags)}**`,
        `Delete \`${str(input, 'path')}\``,
        bool(input, 'recursive') === true ? '**Recursive** -- entire prefix / bucket.' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const path = str(input, 'path');
    if (!path) { return fail('cloud_aws_s3_rm', 'path required'); }
    const recursive = bool(input, 'recursive') === true;
    if (recursive) {
      const m = path.match(/^s3:\/\/([^/]+)/);
      const bucket = m?.[1];
      const confirm = str(input, 'confirmBucket');
      if (!bucket) { return fail('cloud_aws_s3_rm', 'recursive rm: could not parse bucket from path'); }
      if (confirm !== bucket) {
        return fail('cloud_aws_s3_rm', `recursive rm requires confirmBucket to match "${bucket}"`);
      }
    }
    const flags = awsFlags(input);
    const argv = ['aws', 's3', 'rm', path];
    if (recursive) { argv.push('--recursive'); }
    const excludes = Array.isArray(input['exclude']) ? (input['exclude'] as unknown[]).map(String) : [];
    for (const ex of excludes) { argv.push('--exclude', ex); }
    const includes = Array.isArray(input['include']) ? (input['include'] as unknown[]).map(String) : [];
    for (const inc of includes) { argv.push('--include', inc); }
    argv.push(...awsArgv(flags, { defaultJson: false }));

    const r = await runShell(argv, { timeoutMs: 15 * 60_000 });
    if (r.spawnError) { return fail('cloud_aws_s3_rm', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: AwsS3RmData = {
      path, recursive,
      exitCode: r.code, stdout: r.stdout, stderr: r.stderr,
    };
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

// ---------------------------------------------------------------------------
// aws:s3:sync
// ---------------------------------------------------------------------------

interface AwsS3SyncData {
  source: string;
  destination: string;
  dryRun: boolean;
  deleteExtraneous: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const awsS3SyncTool: Tool = {
  id: 'cloud_aws_s3_sync',
  description: 'Sync a directory with an S3 prefix. Gated; --dry-run supported for preview.',
  access: awsAccess({
    resource: (input) => `s3:${str(input, 'source') ?? '?'}->${str(input, 'destination') ?? '?'}`,
    verb: 'sync',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string' },
      destination: { type: 'string' },
      dryRun: { type: 'boolean' },
      deleteExtraneous: { type: 'boolean', description: 'Pass --delete.' },
      exclude: { type: 'array', items: { type: 'string' } },
      include: { type: 'array', items: { type: 'string' } },
      ...AWS_SCHEMA,
    },
    required: ['source', 'destination'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = awsFlags(input);
    return {
      title: 'cloud_aws_s3_sync',
      content: [
        `Scope: **${awsScope(flags)}**`,
        `\`${str(input, 'source')}\` -> \`${str(input, 'destination')}\``,
        bool(input, 'deleteExtraneous') === true ? '**--delete** (removes dest files missing from src).' : '',
        bool(input, 'dryRun') === true ? 'Dry-run only.' : '',
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
    if (!src || !dst) { return fail('cloud_aws_s3_sync', 'source and destination required'); }
    const flags = awsFlags(input);
    const argv = ['aws', 's3', 'sync', src, dst];
    if (bool(input, 'dryRun')           === true) { argv.push('--dryrun'); }
    if (bool(input, 'deleteExtraneous') === true) { argv.push('--delete'); }
    const excludes = Array.isArray(input['exclude']) ? (input['exclude'] as unknown[]).map(String) : [];
    for (const ex of excludes) { argv.push('--exclude', ex); }
    const includes = Array.isArray(input['include']) ? (input['include'] as unknown[]).map(String) : [];
    for (const inc of includes) { argv.push('--include', inc); }
    argv.push(...awsArgv(flags, { defaultJson: false }));

    const r = await runShell(argv, { timeoutMs: 60 * 60_000 });
    if (r.spawnError) { return fail('cloud_aws_s3_sync', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: AwsS3SyncData = {
      source: src, destination: dst,
      dryRun: bool(input, 'dryRun') ?? false,
      deleteExtraneous: bool(input, 'deleteExtraneous') ?? false,
      exitCode: r.code, stdout: r.stdout, stderr: r.stderr,
    };
    return {
      output: [
        ok ? `Sync \`${src}\` -> \`${dst}\` done.` : `**Sync failed (exit ${r.code})**.`,
        r.stdout ? '\n```\n' + r.stdout.slice(-4000).replace(/\n+$/, '') + '\n```' : '',
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

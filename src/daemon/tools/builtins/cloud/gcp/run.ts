/**
 * Cloud Run -- services list / deploy / delete.
 *
 * Deploy is gated with the full image / source preview so the caller
 * sees what revision is about to roll out. Delete is irrecoverable
 * and requires confirmService to match.
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { GCP_SCHEMA, bool, gcloudCommonArgv, gcpAccess, gcpFlags, gcpScope, str, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

// ---------------------------------------------------------------------------
// cloud:gcp:run:list
// ---------------------------------------------------------------------------

interface GcpRunListData {
  platform: 'managed' | 'gke' | 'kubernetes';
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const gcpRunListTool: Tool = {
  id: 'cloud_gcp_run_list',
  description: 'List Cloud Run services.',
  access: gcpAccess({ resource: () => 'run:*', verb: 'list Cloud Run services in' }),
  inputSchema: {
    type: 'object',
    properties: {
      platform: { type: 'string', enum: ['managed', 'gke', 'kubernetes'] },
      ...GCP_SCHEMA,
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const flags = gcpFlags(input);
    const platform = (str(input, 'platform') ?? 'managed') as GcpRunListData['platform'];
    const argv = ['gcloud', 'run', 'services', 'list', '--format=json', '--platform', platform];
    if (flags.region) { argv.push('--region', flags.region); }
    argv.push(...gcloudCommonArgv(flags));

    const r = await runShell(argv, { timeoutMs: 60_000 });
    if (r.spawnError) { return fail('cloud_gcp_run_list', `gcloud not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: GcpRunListData = { platform, exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        ok ? `Services on ${gcpScope(flags)}.` : `**Failed (exit ${r.code})**.`,
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
// cloud:gcp:run:deploy
// ---------------------------------------------------------------------------

interface GcpRunDeployData {
  name: string;
  source: 'image' | 'sourceDir';
  exitCode: number | null;
  stdout: string;
  stderr: string;
  parsed: unknown;
}

export const gcpRunDeployTool: Tool = {
  id: 'cloud_gcp_run_deploy',
  description: 'Deploy or update a Cloud Run service from a container image or source directory.',
  access: gcpAccess({
    resource: (input) => `run:${str(input, 'name') ?? '?'}`,
    verb: 'deploy Cloud Run service',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      image: { type: 'string', description: 'Full image URI; mutually exclusive with sourceDir.' },
      sourceDir: { type: 'string', description: 'Path to a Buildpacks-compatible source tree.' },
      envVars: { type: 'array', items: { type: 'string' }, description: 'KEY=VALUE pairs.' },
      envFromFile: { type: 'string', description: 'Path to a .env-style file.' },
      serviceAccount: { type: 'string' },
      allowUnauthenticated: { type: 'boolean' },
      cpu: { type: 'string' },
      memory: { type: 'string' },
      concurrency: { type: 'number' },
      timeoutSeconds: { type: 'number' },
      platform: { type: 'string', enum: ['managed', 'gke', 'kubernetes'] },
      ...GCP_SCHEMA,
    },
    required: ['name'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = gcpFlags(input);
    const source = str(input, 'image') ? `image \`${str(input, 'image')}\`` : str(input, 'sourceDir') ? `source \`${str(input, 'sourceDir')}\`` : '_no source supplied_';
    return {
      title: 'cloud_gcp_run_deploy',
      content: [
        `Scope: **${gcpScope(flags)}**`,
        `Service: \`${str(input, 'name')}\``,
        `Source: ${source}`,
        bool(input, 'allowUnauthenticated') === true ? '**--allow-unauthenticated** (public access).' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const name = str(input, 'name');
    if (!name) { return fail('cloud_gcp_run_deploy', 'name required'); }
    const flags = gcpFlags(input);
    const image = str(input, 'image');
    const sourceDir = str(input, 'sourceDir');
    if (!image && !sourceDir) { return fail('cloud_gcp_run_deploy', 'image or sourceDir required'); }

    const source: GcpRunDeployData['source'] = image ? 'image' : 'sourceDir';
    const argv = ['gcloud', 'run', 'deploy', name, '--format=json', '--quiet'];
    const platform = str(input, 'platform') ?? 'managed';
    argv.push('--platform', platform);
    if (image) { argv.push('--image', image); }
    if (sourceDir) { argv.push('--source', sourceDir); }
    if (flags.region) { argv.push('--region', flags.region); }
    const envVars = Array.isArray(input['envVars']) ? (input['envVars'] as unknown[]).map(String).filter(s => s.length > 0) : [];
    if (envVars.length > 0) { argv.push('--set-env-vars', envVars.join(',')); }
    const envFile = str(input, 'envFromFile');
    if (envFile) { argv.push('--env-vars-file', envFile); }
    const sa = str(input, 'serviceAccount');
    if (sa) { argv.push('--service-account', sa); }
    if (bool(input, 'allowUnauthenticated') === true) { argv.push('--allow-unauthenticated'); }
    else if (bool(input, 'allowUnauthenticated') === false) { argv.push('--no-allow-unauthenticated'); }
    const cpu = str(input, 'cpu');
    if (cpu) { argv.push('--cpu', cpu); }
    const memory = str(input, 'memory');
    if (memory) { argv.push('--memory', memory); }
    const concurrency = input['concurrency'];
    if (typeof concurrency === 'number' && Number.isFinite(concurrency)) { argv.push('--concurrency', String(concurrency)); }
    const timeout = input['timeoutSeconds'];
    if (typeof timeout === 'number' && Number.isFinite(timeout)) { argv.push('--timeout', `${timeout}s`); }
    argv.push(...gcloudCommonArgv(flags));

    const r = await runShell(argv, { timeoutMs: 30 * 60_000 });
    if (r.spawnError) { return fail('cloud_gcp_run_deploy', `gcloud not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: GcpRunDeployData = { name, source, exitCode: r.code, stdout: r.stdout, stderr: r.stderr, parsed };
    return {
      output: [
        ok ? `Deployed Cloud Run service \`${name}\`.` : `**Deploy failed (exit ${r.code})**.`,
        r.stdout ? '\n```json\n' + r.stdout.slice(0, 4000).replace(/\n+$/, '') + '\n```' : '',
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
// cloud:gcp:run:delete
// ---------------------------------------------------------------------------

interface GcpRunDeleteData {
  name: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const gcpRunDeleteTool: Tool = {
  id: 'cloud_gcp_run_delete',
  description: 'Delete a Cloud Run service. Requires confirmService to match name.',
  access: gcpAccess({
    resource: (input) => `run:${str(input, 'name') ?? '?'}`,
    verb: 'delete Cloud Run service',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      confirmService: { type: 'string', description: 'Must equal name.' },
      platform: { type: 'string', enum: ['managed', 'gke', 'kubernetes'] },
      ...GCP_SCHEMA,
    },
    required: ['name', 'confirmService'],
    additionalProperties: false,
  },
  requiresApproval: true,
  destructive: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = gcpFlags(input);
    return {
      title: 'cloud_gcp_run_delete',
      content: [
        `Scope: **${gcpScope(flags)}**`,
        `**DELETE** Cloud Run service: \`${str(input, 'name')}\``,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const name = str(input, 'name');
    const confirm = str(input, 'confirmService');
    if (!name) { return fail('cloud_gcp_run_delete', 'name required'); }
    if (confirm !== name) { return fail('cloud_gcp_run_delete', 'confirmService must equal name'); }
    const flags = gcpFlags(input);
    const argv = ['gcloud', 'run', 'services', 'delete', name, '--quiet', '--format=json'];
    const platform = str(input, 'platform') ?? 'managed';
    argv.push('--platform', platform);
    if (flags.region) { argv.push('--region', flags.region); }
    argv.push(...gcloudCommonArgv(flags));

    const r = await runShell(argv, { timeoutMs: 5 * 60_000 });
    if (r.spawnError) { return fail('cloud_gcp_run_delete', `gcloud not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: GcpRunDeleteData = { name, exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        ok ? `Deleted Cloud Run service \`${name}\`.` : `**Delete failed (exit ${r.code})**.`,
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

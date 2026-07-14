/**
 * AWS CloudFormation -- list / deploy / delete.
 */

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { AWS_SCHEMA, awsAccess, awsArgv, awsFlags, awsScope, bool, str, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

// ---------------------------------------------------------------------------
// cloud:aws:cloudformation:list
// ---------------------------------------------------------------------------

interface AwsCfnListData {
  statusFilter: readonly string[];
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const awsCfnListTool: Tool = {
  id: 'cloud_aws_cloudformation_list',
  description: 'List CloudFormation stacks with optional status filter.',
  access: awsAccess({ resource: () => 'cfn:*', verb: 'list stacks in' }),
  inputSchema: {
    type: 'object',
    properties: {
      statusFilter: {
        type: 'array', items: { type: 'string' },
        description: 'Stack statuses, e.g. ["CREATE_COMPLETE", "UPDATE_COMPLETE"].',
      },
      ...AWS_SCHEMA,
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const flags = awsFlags(input);
    const argv = ['aws', 'cloudformation', 'list-stacks'];
    const statuses = Array.isArray(input['statusFilter']) ? (input['statusFilter'] as unknown[]).map(String) : [];
    if (statuses.length > 0) { argv.push('--stack-status-filter', ...statuses); }
    argv.push(...awsArgv(flags));

    const r = await runShell(argv, { timeoutMs: 60_000 });
    if (r.spawnError) { return fail('cloud_aws_cloudformation_list', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AwsCfnListData = { statusFilter: statuses, exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        ok ? `Stacks on ${awsScope(flags)}.` : `**Failed (exit ${r.code})**.`,
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
// cloud:aws:cloudformation:deploy
// ---------------------------------------------------------------------------

interface AwsCfnDeployData {
  stackName: string;
  templateSource: 'file' | 'inline';
  templatePath: string | undefined;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

async function writeTemplateToTemp(body: string): Promise<string> {
  const path = join(tmpdir(), `insrc-cfn-${process.pid}-${Date.now()}.yaml`);
  await fs.writeFile(path, body, 'utf8');
  return path;
}

export const awsCfnDeployTool: Tool = {
  id: 'cloud_aws_cloudformation_deploy',
  description: 'Deploy a CloudFormation stack (create-or-update, capabilities-aware).',
  access: awsAccess({
    resource: (input) => `cfn:${str(input, 'stackName') ?? '?'}`,
    verb: 'deploy stack',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      stackName: { type: 'string' },
      templatePath: { type: 'string' },
      templateBody: { type: 'string', description: 'Inline template (alternative to templatePath).' },
      parameters: {
        type: 'array', items: { type: 'string' },
        description: 'Key=Value pairs passed to --parameter-overrides.',
      },
      capabilities: {
        type: 'array', items: { type: 'string' },
        description: 'e.g. CAPABILITY_NAMED_IAM.',
      },
      noExecuteChangeset: { type: 'boolean' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Key=Value pairs passed to --tags.' },
      roleArn: { type: 'string' },
      ...AWS_SCHEMA,
    },
    required: ['stackName'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = awsFlags(input);
    const caps = Array.isArray(input['capabilities']) ? (input['capabilities'] as unknown[]).map(String) : [];
    return {
      title: 'cloud_aws_cloudformation_deploy',
      content: [
        `Scope: **${awsScope(flags)}**`,
        `Stack: \`${str(input, 'stackName')}\``,
        str(input, 'templatePath')   ? `Template: \`${str(input, 'templatePath')}\`` : '',
        str(input, 'templateBody')   ? 'Template: inline (via temp file)' : '',
        caps.length > 0              ? `Capabilities: ${caps.join(', ')}` : '',
        bool(input, 'noExecuteChangeset') === true ? 'Dry-run (no-execute-changeset).' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const stackName = str(input, 'stackName');
    if (!stackName) { return fail('cloud_aws_cloudformation_deploy', 'stackName required'); }
    const flags = awsFlags(input);
    const path = str(input, 'templatePath');
    const body = str(input, 'templateBody');
    if (!path && !body) { return fail('cloud_aws_cloudformation_deploy', 'templatePath or templateBody required'); }

    let templateSource: 'file' | 'inline';
    let templatePath: string;
    let cleanup: (() => Promise<void>) | undefined;
    if (path) {
      templateSource = 'file';
      templatePath = path;
    } else {
      templateSource = 'inline';
      templatePath = await writeTemplateToTemp(body!);
      cleanup = async () => { try { await fs.unlink(templatePath); } catch { /* ignore */ } };
    }

    const argv = [
      'aws', 'cloudformation', 'deploy',
      '--stack-name', stackName,
      '--template-file', templatePath,
    ];
    const params = Array.isArray(input['parameters']) ? (input['parameters'] as unknown[]).map(String).filter(s => s.length > 0) : [];
    if (params.length > 0) { argv.push('--parameter-overrides', ...params); }
    const caps = Array.isArray(input['capabilities']) ? (input['capabilities'] as unknown[]).map(String) : [];
    if (caps.length > 0)   { argv.push('--capabilities', ...caps); }
    if (bool(input, 'noExecuteChangeset') === true) { argv.push('--no-execute-changeset'); }
    const tags = Array.isArray(input['tags']) ? (input['tags'] as unknown[]).map(String) : [];
    if (tags.length > 0)   { argv.push('--tags', ...tags); }
    const roleArn = str(input, 'roleArn');
    if (roleArn)           { argv.push('--role-arn', roleArn); }
    argv.push(...awsArgv(flags, { defaultJson: false }));

    try {
      const r = await runShell(argv, { timeoutMs: 60 * 60_000 });
      if (r.spawnError) { return fail('cloud_aws_cloudformation_deploy', `aws CLI not found: ${r.stderr.trim()}`); }
      const ok = r.code === 0;
      const data: AwsCfnDeployData = {
        stackName, templateSource,
        templatePath: templateSource === 'file' ? templatePath : undefined,
        exitCode: r.code, stdout: r.stdout, stderr: r.stderr,
      };
      return {
        output: [
          ok ? `Deployed \`${stackName}\`.` : `**Deploy failed (exit ${r.code})**.`,
          r.stdout ? '\n```\n' + r.stdout.replace(/\n+$/, '') + '\n```' : '',
          r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
        ].filter(Boolean).join('\n'),
        format: 'markdown',
        success: ok,
        ...(ok ? {} : { error: `exit ${r.code}` }),
        data,
      };
    } finally {
      if (cleanup) { await cleanup(); }
    }
  },
};

// ---------------------------------------------------------------------------
// cloud:aws:cloudformation:delete
// ---------------------------------------------------------------------------

interface AwsCfnDeleteData {
  stackName: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const awsCfnDeleteTool: Tool = {
  id: 'cloud_aws_cloudformation_delete',
  description: 'Delete a CloudFormation stack. Always gated; requires confirmStack to match.',
  access: awsAccess({
    resource: (input) => `cfn:${str(input, 'stackName') ?? '?'}`,
    verb: 'delete stack',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      stackName: { type: 'string' },
      confirmStack: { type: 'string', description: 'Must equal stackName.' },
      retainResources: { type: 'array', items: { type: 'string' }, description: 'Logical IDs to retain.' },
      roleArn: { type: 'string' },
      ...AWS_SCHEMA,
    },
    required: ['stackName', 'confirmStack'],
    additionalProperties: false,
  },
  requiresApproval: true,
  destructive: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = awsFlags(input);
    return {
      title: 'cloud_aws_cloudformation_delete',
      content: [
        `Scope: **${awsScope(flags)}**`,
        `**DELETE** stack: \`${str(input, 'stackName')}\``,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const stackName = str(input, 'stackName');
    const confirm = str(input, 'confirmStack');
    if (!stackName) { return fail('cloud_aws_cloudformation_delete', 'stackName required'); }
    if (confirm !== stackName) { return fail('cloud_aws_cloudformation_delete', 'confirmStack must equal stackName'); }

    const flags = awsFlags(input);
    const argv = ['aws', 'cloudformation', 'delete-stack', '--stack-name', stackName];
    const retain = Array.isArray(input['retainResources']) ? (input['retainResources'] as unknown[]).map(String) : [];
    if (retain.length > 0) { argv.push('--retain-resources', ...retain); }
    const roleArn = str(input, 'roleArn');
    if (roleArn) { argv.push('--role-arn', roleArn); }
    argv.push(...awsArgv(flags));

    const r = await runShell(argv, { timeoutMs: 120_000 });
    if (r.spawnError) { return fail('cloud_aws_cloudformation_delete', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: AwsCfnDeleteData = { stackName, exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        ok ? `Delete initiated for \`${stackName}\`.` : `**Delete failed (exit ${r.code})**.`,
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

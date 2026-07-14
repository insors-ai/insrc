/**
 * AWS Lambda -- invoke / list / update-code.
 */

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { AWS_SCHEMA, awsAccess, awsArgv, awsFlags, awsScope, num, str, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

// ---------------------------------------------------------------------------
// cloud:aws:lambda:invoke
// ---------------------------------------------------------------------------

interface AwsLambdaInvokeData {
  functionName: string;
  invocationType: string;
  exitCode: number | null;
  payloadPath: string;
  responsePath: string;
  cliStdout: string;
  responseBody: string;
  parsedResponse: unknown;
  statusCode: number | undefined;
  functionError: string | undefined;
}

export const awsLambdaInvokeTool: Tool = {
  id: 'cloud_aws_lambda_invoke',
  description: 'Invoke a Lambda function (RequestResponse by default) and return its response.',
  access: awsAccess({
    resource: (input) => `lambda:${str(input, 'functionName') ?? '?'}`,
    verb: 'invoke',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      functionName: { type: 'string', description: 'Name, ARN, or partial ARN.' },
      payload: { description: 'JSON-serializable payload (object/array/string/number/etc).' },
      payloadString: { type: 'string', description: 'Use raw string as payload. Overrides `payload`.' },
      invocationType: { type: 'string', enum: ['RequestResponse', 'Event', 'DryRun'] },
      qualifier: { type: 'string', description: 'Version or alias.' },
      logType: { type: 'string', enum: ['None', 'Tail'], description: 'Include last 4KB of log in LogResult.' },
      ...AWS_SCHEMA,
    },
    required: ['functionName'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = awsFlags(input);
    const invocationType = str(input, 'invocationType') ?? 'RequestResponse';
    const preview = input['payloadString'] !== undefined && typeof input['payloadString'] === 'string'
      ? (input['payloadString'] as string)
      : input['payload'] !== undefined
        ? JSON.stringify(input['payload'], null, 2)
        : '{}';
    return {
      title: 'cloud_aws_lambda_invoke',
      content: [
        `Scope: **${awsScope(flags)}**`,
        `Function: \`${str(input, 'functionName')}\` (${invocationType})`,
        '',
        '**Payload**',
        '```json',
        preview.slice(0, 2000),
        '```',
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const fn = str(input, 'functionName');
    if (!fn) { return fail('cloud_aws_lambda_invoke', 'functionName required'); }
    const flags = awsFlags(input);
    const invocationType = str(input, 'invocationType') ?? 'RequestResponse';

    const payloadStr = typeof input['payloadString'] === 'string'
      ? (input['payloadString'] as string)
      : JSON.stringify(input['payload'] ?? {});
    const payloadPath = join(tmpdir(), `insrc-lambda-in-${process.pid}-${Date.now()}.json`);
    const responsePath = join(tmpdir(), `insrc-lambda-out-${process.pid}-${Date.now()}.json`);
    await fs.writeFile(payloadPath, payloadStr, 'utf8');

    const argv = [
      'aws', 'lambda', 'invoke',
      '--function-name', fn,
      '--payload', `fileb://${payloadPath}`,
      '--invocation-type', invocationType,
      '--cli-binary-format', 'raw-in-base64-out',
    ];
    const qualifier = str(input, 'qualifier');
    if (qualifier) { argv.push('--qualifier', qualifier); }
    const logType = str(input, 'logType');
    if (logType)   { argv.push('--log-type', logType); }
    argv.push(...awsArgv(flags));
    argv.push(responsePath);

    try {
      const r = await runShell(argv, { timeoutMs: 15 * 60_000 });
      if (r.spawnError) { return fail('cloud_aws_lambda_invoke', `aws CLI not found: ${r.stderr.trim()}`); }

      let responseBody = '';
      try { responseBody = await fs.readFile(responsePath, 'utf8'); } catch { /* may be empty for Event type */ }

      const cliJson = tryParseJson(r.stdout);
      let statusCode: number | undefined;
      let functionError: string | undefined;
      if (cliJson && typeof cliJson === 'object') {
        const j = cliJson as Record<string, unknown>;
        if (typeof j['StatusCode'] === 'number') { statusCode = j['StatusCode']; }
        if (typeof j['FunctionError'] === 'string') { functionError = j['FunctionError']; }
      }
      const parsedResponse = tryParseJson(responseBody);
      const ok = r.code === 0 && !functionError;

      const data: AwsLambdaInvokeData = {
        functionName: fn,
        invocationType,
        exitCode: r.code,
        payloadPath, responsePath,
        cliStdout: r.stdout,
        responseBody,
        parsedResponse,
        statusCode,
        functionError,
      };
      return {
        output: [
          ok
            ? `Invoked \`${fn}\` (${invocationType})${statusCode !== undefined ? ` -> status ${statusCode}` : ''}.`
            : `**Invoke failed** (exit ${r.code}${functionError ? `, ${functionError}` : ''}).`,
          responseBody ? '\n**Response**\n```json\n' + responseBody.slice(0, 4000).replace(/\n+$/, '') + '\n```' : '',
          r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
        ].filter(Boolean).join('\n'),
        format: 'markdown',
        success: ok,
        ...(ok ? {} : { error: functionError ?? `exit ${r.code}` }),
        data,
      };
    } finally {
      try { await fs.unlink(payloadPath); } catch { /* ignore */ }
      try { await fs.unlink(responsePath); } catch { /* ignore */ }
    }
  },
};

// ---------------------------------------------------------------------------
// cloud:aws:lambda:list  (list-functions)
// ---------------------------------------------------------------------------

interface AwsLambdaListData {
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const awsLambdaListTool: Tool = {
  id: 'cloud_aws_lambda_list',
  description: 'List Lambda functions in the account/region.',
  access: awsAccess({ resource: () => 'lambda:*', verb: 'list functions in' }),
  inputSchema: {
    type: 'object',
    properties: {
      maxItems: { type: 'number' },
      marker: { type: 'string', description: 'Pagination marker from a previous call.' },
      functionVersion: { type: 'string', description: 'ALL to include all versions.' },
      ...AWS_SCHEMA,
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const flags = awsFlags(input);
    const argv = ['aws', 'lambda', 'list-functions'];
    const maxItems = num(input, 'maxItems');
    if (typeof maxItems === 'number') { argv.push('--max-items', String(maxItems)); }
    const marker = str(input, 'marker');
    if (marker) { argv.push('--starting-token', marker); }
    const version = str(input, 'functionVersion');
    if (version) { argv.push('--function-version', version); }
    argv.push(...awsArgv(flags));

    const r = await runShell(argv, { timeoutMs: 60_000 });
    if (r.spawnError) { return fail('cloud_aws_lambda_list', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AwsLambdaListData = { exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        ok ? `Functions on ${awsScope(flags)}.` : `**Failed (exit ${r.code})**.`,
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
// cloud_aws_lambda_update-code
// ---------------------------------------------------------------------------

interface AwsLambdaUpdateCodeData {
  functionName: string;
  source: 'zipFile' | 's3' | 'imageUri';
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const awsLambdaUpdateCodeTool: Tool = {
  id: 'cloud_aws_lambda_update-code',
  description: 'Update Lambda function code from a local zip, S3 object, or container image URI.',
  access: awsAccess({
    resource: (input) => `lambda:${str(input, 'functionName') ?? '?'}`,
    verb: 'update code on',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      functionName: { type: 'string' },
      zipPath: { type: 'string', description: 'Local .zip; mutually exclusive with s3/imageUri.' },
      s3Bucket: { type: 'string' },
      s3Key: { type: 'string' },
      s3ObjectVersion: { type: 'string' },
      imageUri: { type: 'string', description: 'Container image URI.' },
      publish: { type: 'boolean', description: 'Publish a new version after update.' },
      dryRun: { type: 'boolean' },
      ...AWS_SCHEMA,
    },
    required: ['functionName'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = awsFlags(input);
    const source = str(input, 'zipPath')
      ? `zip \`${str(input, 'zipPath')}\``
      : str(input, 'imageUri')
        ? `image \`${str(input, 'imageUri')}\``
        : str(input, 's3Bucket') && str(input, 's3Key')
          ? `s3://${str(input, 's3Bucket')}/${str(input, 's3Key')}`
          : '_no source supplied_';
    return {
      title: 'cloud_aws_lambda_update-code',
      content: [
        `Scope: **${awsScope(flags)}**`,
        `Function: \`${str(input, 'functionName')}\``,
        `Source: ${source}`,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const fn = str(input, 'functionName');
    if (!fn) { return fail('cloud_aws_lambda_update-code', 'functionName required'); }
    const flags = awsFlags(input);
    const zipPath = str(input, 'zipPath');
    const imageUri = str(input, 'imageUri');
    const s3Bucket = str(input, 's3Bucket');
    const s3Key = str(input, 's3Key');

    let source: AwsLambdaUpdateCodeData['source'];
    const argv = ['aws', 'lambda', 'update-function-code', '--function-name', fn];
    if (zipPath) {
      source = 'zipFile';
      argv.push('--zip-file', `fileb://${zipPath}`, '--cli-binary-format', 'raw-in-base64-out');
    } else if (imageUri) {
      source = 'imageUri';
      argv.push('--image-uri', imageUri);
    } else if (s3Bucket && s3Key) {
      source = 's3';
      argv.push('--s3-bucket', s3Bucket, '--s3-key', s3Key);
      const version = str(input, 's3ObjectVersion');
      if (version) { argv.push('--s3-object-version', version); }
    } else {
      return fail('cloud_aws_lambda_update-code', 'must supply zipPath or imageUri or (s3Bucket + s3Key)');
    }
    if (input['publish'] === true) { argv.push('--publish'); }
    if (input['dryRun']  === true) { argv.push('--dry-run'); }
    argv.push(...awsArgv(flags));

    const r = await runShell(argv, { timeoutMs: 10 * 60_000 });
    if (r.spawnError) { return fail('cloud_aws_lambda_update-code', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AwsLambdaUpdateCodeData = { functionName: fn, source, exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        ok ? `Updated \`${fn}\` from ${source}.` : `**Update failed (exit ${r.code})**.`,
        r.stdout ? '\n```json\n' + r.stdout.replace(/\n+$/, '') + '\n```' : '',
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

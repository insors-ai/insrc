/**
 * GCP Cloud Functions -- list / call.
 *
 * Gen 2 functions surface through the same CLI (`gcloud functions`),
 * differentiated only by --gen2. We pass the flag through so callers
 * can pick the generation.
 */

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../../types.js';
import { GCP_SCHEMA, bool, gcloudCommonArgv, gcpAccess, gcpFlags, gcpScope, str, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

// ---------------------------------------------------------------------------
// cloud:gcp:functions:list
// ---------------------------------------------------------------------------

interface GcpFunctionsListData {
  gen2: boolean;
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const gcpFunctionsListTool: Tool = {
  id: 'cloud_gcp_functions_list',
  description: 'List Cloud Functions (region-scoped when region provided).',
  access: gcpAccess({ resource: () => 'functions:*', verb: 'list functions in' }),
  inputSchema: {
    type: 'object',
    properties: {
      gen2: { type: 'boolean', description: 'Include/use gen 2 functions (--gen2).' },
      filter: { type: 'string' },
      limit: { type: 'number' },
      ...GCP_SCHEMA,
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const flags = gcpFlags(input);
    const argv = ['gcloud', 'functions', 'list', '--format=json'];
    if (bool(input, 'gen2') === true) { argv.push('--gen2'); }
    const filter = str(input, 'filter');
    if (filter) { argv.push('--filter', filter); }
    const limit = input['limit'];
    if (typeof limit === 'number' && Number.isFinite(limit)) { argv.push('--limit', String(limit)); }
    if (flags.region) { argv.push('--regions', flags.region); }
    argv.push(...gcloudCommonArgv(flags));

    const r = await runShell(argv, { timeoutMs: 60_000 });
    if (r.spawnError) { return fail('cloud_gcp_functions_list', `gcloud not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: GcpFunctionsListData = {
      gen2: bool(input, 'gen2') === true,
      exitCode: r.code, parsed, stdout: r.stdout,
    };
    return {
      output: [
        ok ? `Functions on ${gcpScope(flags)}.` : `**Failed (exit ${r.code})**.`,
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
// cloud:gcp:functions:call
// ---------------------------------------------------------------------------

interface GcpFunctionsCallData {
  name: string;
  gen2: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  parsed: unknown;
}

export const gcpFunctionsCallTool: Tool = {
  id: 'cloud_gcp_functions_call',
  description: 'Invoke a Cloud Function (gcloud functions call) with a JSON payload.',
  access: gcpAccess({
    resource: (input) => `functions:${str(input, 'name') ?? '?'}`,
    verb: 'invoke function',
    severity: 'destructive',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      data: { description: 'JSON-serializable payload.' },
      dataString: { type: 'string', description: 'Raw string payload. Overrides `data`.' },
      gen2: { type: 'boolean' },
      ...GCP_SCHEMA,
    },
    required: ['name'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const flags = gcpFlags(input);
    const preview = typeof input['dataString'] === 'string'
      ? (input['dataString'] as string)
      : input['data'] !== undefined ? JSON.stringify(input['data'], null, 2) : '{}';
    return {
      title: 'cloud_gcp_functions_call',
      content: [
        `Scope: **${gcpScope(flags)}**`,
        `Function: \`${str(input, 'name')}\``,
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
    const name = str(input, 'name');
    if (!name) { return fail('cloud_gcp_functions_call', 'name required'); }
    const flags = gcpFlags(input);
    const payload = typeof input['dataString'] === 'string'
      ? (input['dataString'] as string)
      : JSON.stringify(input['data'] ?? {});
    const dataPath = join(tmpdir(), `insrc-gcp-fn-${process.pid}-${Date.now()}.json`);
    await fs.writeFile(dataPath, payload, 'utf8');

    const argv = ['gcloud', 'functions', 'call', name, '--data-from-file', dataPath, '--format=json'];
    if (bool(input, 'gen2') === true) { argv.push('--gen2'); }
    if (flags.region) { argv.push('--region', flags.region); }
    argv.push(...gcloudCommonArgv(flags));

    try {
      const r = await runShell(argv, { timeoutMs: 10 * 60_000 });
      if (r.spawnError) { return fail('cloud_gcp_functions_call', `gcloud not found: ${r.stderr.trim()}`); }
      const ok = r.code === 0;
      const parsed = ok ? tryParseJson(r.stdout) : null;
      const data: GcpFunctionsCallData = {
        name, gen2: bool(input, 'gen2') === true,
        exitCode: r.code, stdout: r.stdout, stderr: r.stderr, parsed,
      };
      return {
        output: [
          ok ? `Called \`${name}\`.` : `**Call failed (exit ${r.code})**.`,
          r.stdout ? '\n```json\n' + r.stdout.slice(0, 4000).replace(/\n+$/, '') + '\n```' : '',
          r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
        ].filter(Boolean).join('\n'),
        format: 'markdown',
        success: ok,
        ...(ok ? {} : { error: `exit ${r.code}` }),
        data,
      };
    } finally {
      try { await fs.unlink(dataPath); } catch { /* ignore */ }
    }
  },
};

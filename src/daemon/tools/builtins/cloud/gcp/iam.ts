/**
 * GCP IAM -- whoami (active account / project).
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolInput, ToolResult } from '../../../types.js';
import { GCP_SCHEMA, gcloudCommonArgv, gcpAccess, gcpFlags, gcpScope, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

interface GcpIamWhoAmIData {
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const gcpIamWhoAmITool: Tool = {
  id: 'cloud_gcp_iam_whoami',
  description: 'Return the active gcloud account and project (auth list + config list).',
  access: gcpAccess({ resource: () => 'iam', verb: 'show identity for' }),
  inputSchema: {
    type: 'object',
    properties: { ...GCP_SCHEMA },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const flags = gcpFlags(input);
    const authArgv = ['gcloud', 'auth', 'list', '--format=json', ...gcloudCommonArgv(flags)];
    const cfgArgv  = ['gcloud', 'config', 'list', '--format=json', ...gcloudCommonArgv(flags)];

    const [auth, cfg] = await Promise.all([
      runShell(authArgv, { timeoutMs: 20_000 }),
      runShell(cfgArgv,  { timeoutMs: 20_000 }),
    ]);
    if (auth.spawnError) { return fail('cloud_gcp_iam_whoami', `gcloud not found: ${auth.stderr.trim()}`); }
    const ok = auth.code === 0 && cfg.code === 0;
    const parsed = {
      auth: tryParseJson(auth.stdout),
      config: tryParseJson(cfg.stdout),
    };
    const data: GcpIamWhoAmIData = { exitCode: auth.code, parsed, stdout: auth.stdout };
    return {
      output: [
        ok ? `Auth + config on ${gcpScope(flags)}.` : `**Failed** (auth exit ${auth.code}, config exit ${cfg.code}).`,
        '\n**Auth list**\n```json\n' + auth.stdout.replace(/\n+$/, '') + '\n```',
        '\n**Config list**\n```json\n' + cfg.stdout.replace(/\n+$/, '') + '\n```',
        auth.stderr ? '\n**stderr**\n```\n' + auth.stderr.replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${auth.code} / ${cfg.code}` }),
      data,
    };
  },
};

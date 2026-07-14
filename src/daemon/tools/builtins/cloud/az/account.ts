/**
 * Azure account -- show (whoami equivalent).
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolInput, ToolResult } from '../../../types.js';
import { AZ_SCHEMA, azAccess, azArgv, azFlags, azScope, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

interface AzAccountShowData {
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const azAccountShowTool: Tool = {
  id: 'cloud_az_account_show',
  description: 'Return the active Azure subscription + tenant (az account show).',
  access: azAccess({ resource: () => 'account', verb: 'show identity for' }),
  inputSchema: {
    type: 'object',
    properties: { ...AZ_SCHEMA },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const flags = azFlags(input);
    const argv = ['az', 'account', 'show', '--output', 'json', ...azArgv(flags, { includeResourceGroup: false })];
    const r = await runShell(argv, { timeoutMs: 30_000 });
    if (r.spawnError) { return fail('cloud_az_account_show', `az CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AzAccountShowData = { exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        ok ? `Active account on ${azScope(flags)}.` : `**Failed (exit ${r.code})**.`,
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

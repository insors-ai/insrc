/**
 * AWS IAM -- list attached policies on the current caller.
 *
 * Deliberately narrow: this is the "who has access to what" lookup
 * that unblocks 90% of permissions debugging. Broader IAM ops
 * (create / delete user, attach policy, ...) stay behind a future
 * dedicated batch.
 */

import { runShell } from '../../../shell-helper.js';
import type { Tool, ToolInput, ToolResult } from '../../../types.js';
import { AWS_SCHEMA, awsAccess, awsArgv, awsFlags, awsScope, str, tryParseJson } from './helpers.js';

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

interface AwsIamListAttachedData {
  target: 'caller' | 'user' | 'role' | 'group';
  name: string | undefined;
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const awsIamListAttachedPoliciesTool: Tool = {
  id: 'cloud_aws_iam_list-attached-policies',
  description: 'List attached managed policies for the caller, a user, a role, or a group.',
  access: awsAccess({
    resource: (input) => {
      const target = str(input, 'target') ?? 'caller';
      const name = str(input, 'name');
      return name ? `iam:${target}:${name}` : `iam:${target}`;
    },
    verb: 'list policies for',
  }),
  inputSchema: {
    type: 'object',
    properties: {
      target: {
        type: 'string', enum: ['caller', 'user', 'role', 'group'],
        description: 'caller -> resolves via sts:GetCallerIdentity. user/role/group require `name`.',
      },
      name: { type: 'string' },
      ...AWS_SCHEMA,
    },
    required: ['target'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const target = str(input, 'target') as AwsIamListAttachedData['target'] | undefined;
    if (!target) { return fail('cloud_aws_iam_list-attached-policies', 'target required'); }
    const flags = awsFlags(input);
    const name = str(input, 'name');

    let resolvedName = name;
    if (target === 'caller') {
      const whoamiR = await runShell(['aws', 'sts', 'get-caller-identity', ...awsArgv(flags)], { timeoutMs: 20_000 });
      if (whoamiR.code !== 0) { return fail('cloud_aws_iam_list-attached-policies', 'sts:GetCallerIdentity failed: ' + whoamiR.stderr.trim()); }
      const whoami = tryParseJson(whoamiR.stdout);
      if (whoami && typeof whoami === 'object') {
        const arn = (whoami as { Arn?: unknown }).Arn;
        if (typeof arn === 'string') {
          const m = arn.match(/^arn:aws:(?:iam|sts)::[0-9]+:(user|assumed-role|role)\/([^/]+)/);
          if (m && m[2]) { resolvedName = m[2]; }
        }
      }
      if (!resolvedName) {
        return fail('cloud_aws_iam_list-attached-policies', 'could not resolve caller name; specify target/name manually');
      }
    } else if (!resolvedName) {
      return fail('cloud_aws_iam_list-attached-policies', `name required when target=${target}`);
    }

    const cmd = target === 'caller' || target === 'user' ? 'list-attached-user-policies'
              : target === 'role'                         ? 'list-attached-role-policies'
              : /* group */                                 'list-attached-group-policies';
    const flagName = target === 'caller' || target === 'user' ? '--user-name'
                   : target === 'role'                         ? '--role-name'
                   : /* group */                                 '--group-name';

    const argv = ['aws', 'iam', cmd, flagName, resolvedName, ...awsArgv(flags)];
    const r = await runShell(argv, { timeoutMs: 30_000 });
    if (r.spawnError) { return fail('cloud_aws_iam_list-attached-policies', `aws CLI not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const parsed = ok ? tryParseJson(r.stdout) : null;
    const data: AwsIamListAttachedData = { target, name: resolvedName, exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        ok ? `Attached policies for ${target}=\`${resolvedName}\` on ${awsScope(flags)}.` : `**Failed (exit ${r.code})**.`,
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

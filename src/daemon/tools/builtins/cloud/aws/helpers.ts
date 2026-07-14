/**
 * Shared helpers for AWS CLI tools.
 *
 * Every aws:* tool accepts the same (profile, region, endpoint,
 * output) triple; this module standardizes the flag mapping so a
 * caller's AWS_PROFILE / AWS_REGION env vars still take over when
 * the tool is invoked without an explicit override.
 */

import type { ToolInput } from '../../../types.js';
import type { AccessPolicy } from '../../../../../shared/access.js';

export interface AwsFlags {
  profile?: string;
  region?: string;
  endpointUrl?: string;
  output?: string;
}

export function str(input: ToolInput, key: string): string | undefined {
  const v = input[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function num(input: ToolInput, key: string): number | undefined {
  const v = input[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function bool(input: ToolInput, key: string): boolean | undefined {
  const v = input[key];
  return typeof v === 'boolean' ? v : undefined;
}

export function awsFlags(input: ToolInput): AwsFlags {
  const out: AwsFlags = {};
  const p = str(input, 'profile');
  const r = str(input, 'region');
  const e = str(input, 'endpointUrl');
  const o = str(input, 'output');
  if (p) { out.profile = p; }
  if (r) { out.region = r; }
  if (e) { out.endpointUrl = e; }
  if (o) { out.output = o; }
  return out;
}

/** Render AWS CLI flags for argv. Defaults output=json when unset. */
export function awsArgv(flags: AwsFlags, { defaultJson = true }: { defaultJson?: boolean } = {}): string[] {
  const args: string[] = [];
  if (flags.profile)     { args.push('--profile', flags.profile); }
  if (flags.region)      { args.push('--region', flags.region); }
  if (flags.endpointUrl) { args.push('--endpoint-url', flags.endpointUrl); }
  if (flags.output)      { args.push('--output', flags.output); }
  else if (defaultJson)  { args.push('--output', 'json'); }
  return args;
}

export function awsScope(flags: AwsFlags): string {
  const parts: string[] = [];
  if (flags.profile)     { parts.push(`profile=${flags.profile}`); }
  if (flags.region)      { parts.push(`region=${flags.region}`); }
  if (flags.endpointUrl) { parts.push(`endpoint=${flags.endpointUrl}`); }
  return parts.length > 0 ? parts.join(', ') : 'default profile / region';
}

export const AWS_SCHEMA = {
  profile: { type: 'string', description: 'Named AWS profile (~/.aws/config).' },
  region: { type: 'string', description: 'AWS region override.' },
  endpointUrl: { type: 'string', description: '--endpoint-url (LocalStack etc).' },
  output: { type: 'string', description: 'aws --output. Defaults to json.' },
} as const;

export function tryParseJson(stdout: string): unknown {
  try { return JSON.parse(stdout); } catch { return null; }
}

// ---------------------------------------------------------------------------
// AccessPolicy factory
// ---------------------------------------------------------------------------

/**
 * Build an AccessPolicy for an AWS tool (plans/access-gate.md Phase 3).
 *
 * Key shape: `aws:profile=<p>,region=<r>:<resource>` so:
 *   - read tools (severity standard) share an approval bucket per
 *     (profile, region) pair: once the user approves "profile=dev,
 *     region=us-east-1", subsequent list/describe calls in that
 *     scope bypass silently
 *   - mutate tools (severity destructive) re-prompt on every call
 *     regardless of prior approvals; the resource still gets baked
 *     into the key so the AccessStore audit log identifies what was
 *     touched
 *
 * The `resource` callback returns a short identifier used both in the
 * key suffix and the gate-body description. For multi-target tools
 * (e.g. ec2:terminate with several instance IDs) join them with ',';
 * the gate UI truncates long labels.
 */
export function awsAccess(opts: {
  resource: (input: ToolInput) => string;
  severity?: 'standard' | 'destructive';
  verb: string;
}): AccessPolicy {
  const severity = opts.severity ?? 'standard';
  return {
    kind: 'cloud-resource',
    extractKey: (input) => {
      const flags = awsFlags(input as ToolInput);
      const scope = `aws:profile=${flags.profile ?? 'default'},region=${flags.region ?? 'default'}`;
      const res = opts.resource(input as ToolInput);
      return res.length > 0 ? `${scope}:${res}` : scope;
    },
    describe: (input) => {
      const flags = awsFlags(input as ToolInput);
      const res = opts.resource(input as ToolInput);
      return `${opts.verb} ${res || '<no target>'} (aws ${awsScope(flags)})`;
    },
    severity,
  };
}

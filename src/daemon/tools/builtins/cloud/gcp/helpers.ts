/**
 * Shared helpers for gcloud-based tools.
 *
 * Every gcp:* tool accepts (project, account, region, zone). Callers
 * can omit them and gcloud falls back to its configured defaults
 * (~/.config/gcloud/configurations/config_default).
 */

import type { ToolInput } from '../../../types.js';
import type { AccessPolicy } from '../../../../../shared/access.js';

export interface GcpFlags {
  project?: string;
  account?: string;
  region?: string;
  zone?: string;
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

export function gcpFlags(input: ToolInput): GcpFlags {
  const out: GcpFlags = {};
  const p = str(input, 'project');
  const a = str(input, 'account');
  const r = str(input, 'region');
  const z = str(input, 'zone');
  if (p) { out.project = p; }
  if (a) { out.account = a; }
  if (r) { out.region = r; }
  if (z) { out.zone = z; }
  return out;
}

/**
 * Most gcloud subcommands accept --project / --account but not
 * --region or --zone; those two are included only when the caller
 * passes them. Tools that need them grab from flags themselves.
 */
export function gcloudCommonArgv(flags: GcpFlags): string[] {
  const args: string[] = [];
  if (flags.project) { args.push('--project', flags.project); }
  if (flags.account) { args.push('--account', flags.account); }
  return args;
}

export function gcpScope(flags: GcpFlags): string {
  const parts: string[] = [];
  if (flags.project) { parts.push(`project=${flags.project}`); }
  if (flags.account) { parts.push(`account=${flags.account}`); }
  if (flags.region)  { parts.push(`region=${flags.region}`); }
  if (flags.zone)    { parts.push(`zone=${flags.zone}`); }
  return parts.length > 0 ? parts.join(', ') : 'default gcloud config';
}

export const GCP_SCHEMA = {
  project: { type: 'string', description: 'GCP project ID override.' },
  account: { type: 'string', description: 'Active gcloud account.' },
  region:  { type: 'string' },
  zone:    { type: 'string' },
} as const;

export function tryParseJson(stdout: string): unknown {
  try { return JSON.parse(stdout); } catch { return null; }
}

// ---------------------------------------------------------------------------
// AccessPolicy factory
// ---------------------------------------------------------------------------

/**
 * Build an AccessPolicy for a GCP tool (plans/access-gate.md Phase 3).
 *
 * Key shape: `gcp:project=<p>,region=<r>,zone=<z>:<resource>` so reads
 * share an approval bucket per (project, region, zone) tuple while
 * mutating ops re-prompt on every call. See cloud/aws/helpers.ts:awsAccess
 * for rationale.
 */
export function gcpAccess(opts: {
  resource: (input: ToolInput) => string;
  severity?: 'standard' | 'destructive';
  verb: string;
}): AccessPolicy {
  const severity = opts.severity ?? 'standard';
  return {
    kind: 'cloud-resource',
    extractKey: (input) => {
      const flags = gcpFlags(input as ToolInput);
      const scope = `gcp:project=${flags.project ?? 'default'},region=${flags.region ?? 'default'},zone=${flags.zone ?? 'default'}`;
      const res = opts.resource(input as ToolInput);
      return res.length > 0 ? `${scope}:${res}` : scope;
    },
    describe: (input) => {
      const flags = gcpFlags(input as ToolInput);
      const res = opts.resource(input as ToolInput);
      return `${opts.verb} ${res || '<no target>'} (gcp ${gcpScope(flags)})`;
    },
    severity,
  };
}

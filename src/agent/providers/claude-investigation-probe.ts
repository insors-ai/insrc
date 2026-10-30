/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { ProcessGroupResult } from '../../shared/process-group.js';
import type { InvestigationProbeObservation } from '../../shared/review-investigation-probe.js';
import type { NativeProbeInvocationIdentity } from './native-investigation-probe.js';
import { createHash } from 'node:crypto';
import { PROBE_OBSERVATION_BYTES } from '../../shared/review-investigation-probe.js';
import { scopedReviewToolCatalog } from '../../shared/review-investigation-catalog.js';
import { readClaudeInvestigationEvents } from './claude-investigation-events.js';
import { CLAUDE_V2_ADAPTER, REVIEW_PROTOCOL_SCHEMA_DIGEST } from '../../shared/review-isolation-evidence.js';
import { digestValue } from '../../workflow/code-review/investigation/identity.js';

export const CLAUDE_PROBE_TELEMETRY_VERSION = '2.1.310 (Claude Code)';

/** Recognized init hints can expose violations, but are not a complete effective
 * configuration/denial transcript. In particular, result/structured_output text
 * and requested flags are never native isolation evidence. */
export function collectClaudeProbeObservations(result: ProcessGroupResult, identity: NativeProbeInvocationIdentity): readonly InvestigationProbeObservation[] {
  const common = { attemptId: identity.attemptId, launchDigest: identity.launchDigest, effectiveDigest: identity.effectiveDigest,
    provenance: 'runtime-event' as const, at: Date.now(), observationDigest: createHash('sha256')
      .update(String(Buffer.byteLength(result.stdout))).update(':').update(result.stdout).update(result.stderr).digest('hex') };
  const missing = (detail: string): InvestigationProbeObservation[] => [{ ...common, check: 'effective-inventory', verdict: 'unverifiable', detail }];
  if (identity.binaryVersion !== CLAUDE_PROBE_TELEMETRY_VERSION)
    return missing('Unsupported Claude telemetry version; no isolation inferred from version or flags');
  if (result.outputLimitExceeded || result.observerFailed || Buffer.byteLength(result.stdout) > PROBE_OBSERVATION_BYTES)
    return missing('Incomplete or over-limit native output cannot establish isolation');
  let events: readonly Record<string, unknown>[];
  try { events = readClaudeInvestigationEvents(result.stdout, result.aborted === true && result.exitSignal === 'SIGKILL'); }
  catch { return missing('Malformed, conflicting or incomplete Claude native event stream'); }
  const init = events.find(event => event['type'] === 'system' && event['subtype'] === 'init');
  if (!init) return missing('Claude result envelope does not expose complete effective inventory or independent denial probes');
  const observations = missing('Claude init hints do not prove hooks, instruction/config sources, credential handling and every required denial');
  const v2 = identity.adapterVersion === CLAUDE_V2_ADAPTER;
  const schemaBound = v2 && identity.schemaDigest === REVIEW_PROTOCOL_SCHEMA_DIGEST && init['claude_code_version'] === '2.1.310';
  const expected = scopedReviewToolCatalog(identity.sourceMode === 'indexed-impact').map(t => `mcp__insrc-scoped-review__${t.name}`);
  const add = (check: InvestigationProbeObservation['check'], detail: string) => {
    if (!observations.some(o => o.check === check)) observations.push({ ...common, check, verdict: 'observed-allowed', detail });
  };
  if (Array.isArray(init['tools'])) {
    const tools = init['tools'].filter((tool): tool is string => typeof tool === 'string');
    const broad = tools.filter(tool => v2 ? !expected.includes(tool) && !(schemaBound && tool === 'StructuredOutput') : !tool.startsWith('mcp__insrc-scoped-review__'));
    if (broad.length) add('builtin-tools', 'Native init advertises tools outside the dedicated scoped MCP server');
    if (v2 && new Set(tools).size !== tools.length) add('builtin-tools', 'Native init advertises duplicate capabilities');
    if (tools.includes('Bash') || tools.includes('Shell')) add('shell', 'Native init advertises a shell tool');
    if (tools.includes('Read') || tools.includes('Glob') || tools.includes('Grep')) add('raw-filesystem', 'Native init advertises unscoped filesystem tools');
    if (tools.includes('WebFetch') || tools.includes('WebSearch')) add('network', 'Native init advertises unscoped network tools');
  }
  if (Array.isArray(init['plugins']) && init['plugins'].length) add('plugins', 'Native init advertises loaded plugins');
  for (const event of events) if (event['type'] === 'system' &&
    ['hook_started', 'hook_response', 'hook_progress'].includes(String(event['subtype'])))
    add('hooks', 'Native stream reports a hook running in the restricted launch');
  // A version-pinned complete inventory establishes tool exposure only. It
  // does not assert OS sandboxing or absence of unreported instruction sources.
  if (identity.sourceMode !== undefined && typeof init['session_id'] === 'string' &&
    Array.isArray(init['tools']) && init['tools'].every(t => typeof t === 'string')) {
    const actual = init['tools'] as string[];
    const available = v2 ? [...expected, 'StructuredOutput'] : expected;
    const nativeV2 = schemaBound && init['permissionMode'] === 'dontAsk' &&
      Array.isArray(init['plugins']) && init['plugins'].length === 0 &&
      Array.isArray(init['skills']) && init['skills'].length === 0 &&
      Array.isArray(init['slash_commands']) && init['slash_commands'].length === 0 &&
      Array.isArray(init['mcp_servers']) && init['mcp_servers'].length === 1 &&
      digestValue(init['mcp_servers']) === digestValue([{ name: 'insrc-scoped-review', status: 'connected', source: 'dynamic' }]);
    if ((!v2 || nativeV2) && actual.length === available.length && new Set(actual).size === actual.length && available.every(t => actual.includes(t))) {
      for (const check of ['builtin-tools', 'shell', 'raw-filesystem', 'network'] as const)
        observations.push({ ...common, check, verdict: 'observed-denied', detail: 'Complete native startup tool inventory exposes only the pinned scoped bridge; no OS-level sandbox claim' });
    }
  }
  // Complete configuration provenance and active canary evidence are separate:
  // no overall inventory, hook, plugin or instruction denial from mere silence.
  return observations;
}

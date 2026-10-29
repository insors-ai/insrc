/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import type { ProcessGroupResult } from '../../shared/process-group.js';
import type { InvestigationProbeObservation } from '../../shared/review-investigation-probe.js';
import { PROBE_OBSERVATION_BYTES } from '../../shared/review-investigation-probe.js';
import type { NativeProbeInvocationIdentity } from './native-investigation-probe.js';

export const CODEX_PROBE_TELEMETRY_VERSION = 'codex-cli 0.164.0';

/** Execution events can prove an unwanted capability was available. An absent
 * event or a model-authored agent_message can never prove a denied capability. */
export function collectCodexProbeObservations(result: ProcessGroupResult, identity: NativeProbeInvocationIdentity): readonly InvestigationProbeObservation[] {
  const common = { attemptId: identity.attemptId, launchDigest: identity.launchDigest, effectiveDigest: identity.effectiveDigest,
    provenance: 'runtime-event' as const, at: Date.now(), observationDigest: createHash('sha256')
      .update(String(Buffer.byteLength(result.stdout))).update(':').update(result.stdout).update(result.stderr).digest('hex') };
  const missing = (detail: string): InvestigationProbeObservation[] => [{ ...common, check: 'effective-inventory', verdict: 'unverifiable', detail }];
  if (identity.binaryVersion !== CODEX_PROBE_TELEMETRY_VERSION)
    return missing('Unsupported Codex telemetry version; binary metadata and flags do not qualify isolation');
  if (result.outputLimitExceeded || result.observerFailed || Buffer.byteLength(result.stdout) > PROBE_OBSERVATION_BYTES)
    return missing('Incomplete or over-limit Codex output cannot establish isolation');
  const events: Record<string, unknown>[] = [];
  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (!value || typeof value !== 'object' || Array.isArray(value)) return missing('Unsupported Codex runtime event shape');
      events.push(value as Record<string, unknown>);
    } catch { return missing('Incomplete Codex runtime event transcript'); }
  }
  const observations = missing('Codex JSON events do not establish complete effective configuration and every required denial');
  const add = (check: InvestigationProbeObservation['check'], detail: string) => {
    if (!observations.some(o => o.check === check)) observations.push({ ...common, check, verdict: 'observed-allowed', detail });
  };
  for (const event of events) {
    if (event['type'] !== 'item.started' && event['type'] !== 'item.completed') continue;
    const item = event['item']; if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (record['type'] === 'command_execution') {
      add('shell', 'Native Codex event reports an unscoped command execution');
      add('builtin-tools', 'Native Codex event reports an unscoped execution tool');
    }
    if (record['type'] === 'web_search') add('network', 'Native Codex event reports web search access');
    if (record['type'] === 'mcp_tool_call' && typeof record['server'] === 'string' && record['server'] !== 'insrc-scoped-review')
      add('builtin-tools', 'Native Codex event reports an MCP server outside the dedicated scoped catalogue');
  }
  return observations;
}

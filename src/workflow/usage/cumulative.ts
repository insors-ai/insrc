/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { ObservationRecord } from './basis.js';
import type { AccountingScope, LedgerRecord, NormalizedCounters, RequestStarted } from './types.js';

const buckets = ['inputUncachedTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens', 'reasoningTokens'] as const;
export interface CumulativeInterval {
  readonly counters: NormalizedCounters | null;
  readonly estimated: boolean;
  readonly notices: readonly string[];
}
const isObservation = (row: LedgerRecord | undefined): row is ObservationRecord => row?.recordKind === 'request.finished' || row?.recordKind === 'usage.corrected';

/** Only an explicitly selected qualified interval contributes, never raw snapshots. */
export function cumulativeInterval(current: ObservationRecord, start: RequestStarted, records: ReadonlyMap<string, LedgerRecord>, starts: ReadonlyMap<string, RequestStarted>, blockedCalls: ReadonlySet<string>, scope: AccountingScope): CumulativeInterval {
  const unavailable = (reason: string): CumulativeInterval => ({ counters: null, estimated: false, notices: [`baseline-unavailable:${current.eventId}`, `${reason}:${current.eventId}`].sort() });
  const evidence = scope.evidence, observation = current.observation;
  if (records.size !== evidence.expectedRecordCount || evidence.expectedEventIds.some(id => !records.has(id))) return unavailable('interval-closure-missing');
  if (current.eventId !== evidence.selectedCurrentEventId || !evidence.baselineEventId || !evidence.referenceOnlyEventIds.includes(evidence.baselineEventId)) return unavailable('interval-unselected');
  const baseline = records.get(evidence.baselineEventId);
  if (!isObservation(baseline) || blockedCalls.has(baseline.callId)) return unavailable('baseline-missing');
  const baselineStart = starts.get(baseline.callId), base = baseline.observation;
  if (!baselineStart || !evidence.referenceOnlyEventIds.includes(baselineStart.eventId)) return unavailable('baseline-closure-missing');
  if ([...records.values()].some(row => row.recordKind === 'usage.corrected' && row.control.supersedesEventId === baseline.eventId)) return unavailable('baseline-stale');
  const capability = evidence.sourceCapabilities.find(item => item.capabilityId === observation.sourceCapabilityId);
  if (!capability || capability.qualification === 'unqualified' || !capability.baselineRequired || capability.granularity !== 'cumulative-snapshot' || base.sourceCapabilityId !== observation.sourceCapabilityId) return unavailable('baseline-unqualified');
  const context = start.context, priorContext = baselineStart.context;
  if (context.granularity !== 'cumulative-snapshot' || priorContext.granularity !== 'cumulative-snapshot' || !observation.cumulative || !base.cumulative || !context.nativeSessionId || context.nativeSessionId !== priorContext.nativeSessionId || context.nativeSessionId !== observation.cumulative.nativeSessionId || context.nativeSessionId !== base.cumulative.nativeSessionId || observation.cumulative.baselineEventId !== baseline.eventId) return unavailable('session-mismatch');
  if (context.modelSliceId !== priorContext.modelSliceId || context.modelKind !== priorContext.modelKind || context.requestedModel !== priorContext.requestedModel || (observation.reportedModel !== null && base.reportedModel !== null && observation.reportedModel !== base.reportedModel) || (priorContext.reportedModel !== null && base.reportedModel !== null && priorContext.reportedModel !== base.reportedModel)) return unavailable('model-mismatch');
  const baselineModel = priorContext.reportedModel ?? base.reportedModel;
  const currentModel = context.reportedModel ?? observation.reportedModel;
  if ((baselineModel === null) !== (currentModel === null)) return unavailable('model-unverified');
  const reportedModels = new Set([context.reportedModel, priorContext.reportedModel, observation.reportedModel, base.reportedModel].filter(model => model !== null));
  if (reportedModels.size > 1) return unavailable('model-mismatch');
  if (context.source.provider !== priorContext.source.provider || context.source.transport !== priorContext.source.transport || context.source.version !== priorContext.source.version || capability.provider !== priorContext.source.provider || capability.transport !== priorContext.source.transport || (capability.version !== null && priorContext.source.version !== capability.version) || observation.nativeUnit !== base.nativeUnit) return unavailable('source-mismatch');
  const roots = new Set(evidence.rootWatermarkRefs.map(ref => ref.rootArtifactId));
  if (!roots.has(current.rootArtifactId) || !roots.has(baseline.rootArtifactId)) return unavailable('baseline-watermark-missing');
  if (observation.quality === 'unavailable' || base.quality === 'unavailable') return unavailable('baseline-metrics-unavailable');
  if (observation.cumulative.frameId === base.cumulative.frameId && buckets.some(bucket => observation.counters[bucket] !== base.counters[bucket])) return unavailable('frame-conflict');
  const deltas = {} as Record<keyof NormalizedCounters, number | null>;
  for (const bucket of buckets) {
    const end = observation.counters[bucket], begin = base.counters[bucket];
    if (end === null || begin === null) deltas[bucket] = null;
    else {
      const delta = BigInt(end) - BigInt(begin);
      if (delta < 0n) return unavailable('counter-reset');
      deltas[bucket] = Number(delta);
    }
  }
  for (const id of evidence.referenceOnlyEventIds) {
    if (id === baseline.eventId || id === baselineStart.eventId) continue;
    const intermediate = records.get(id);
    if (!isObservation(intermediate) || intermediate.observation.cumulative?.baselineEventId !== baseline.eventId) continue;
    const middle = intermediate.observation, middleStart = starts.get(intermediate.callId);
    if (!middleStart || blockedCalls.has(intermediate.callId) || middle.quality === 'unavailable' || middle.cumulative!.nativeSessionId !== context.nativeSessionId || middleStart.context.nativeSessionId !== context.nativeSessionId || middleStart.context.modelSliceId !== context.modelSliceId || middleStart.context.modelKind !== context.modelKind || middleStart.context.requestedModel !== context.requestedModel || middleStart.context.source.provider !== context.source.provider || middleStart.context.source.transport !== context.source.transport || middleStart.context.source.version !== context.source.version || !roots.has(intermediate.rootArtifactId) || middle.sourceCapabilityId !== observation.sourceCapabilityId || middle.nativeUnit !== observation.nativeUnit || (middle.reportedModel !== null && observation.reportedModel !== null && middle.reportedModel !== observation.reportedModel)) return unavailable('intermediate-mismatch');
    const middleModel = middleStart.context.reportedModel ?? middle.reportedModel;
    if ((middleModel === null) !== (currentModel === null)) return unavailable('model-unverified');
    for (const model of [middleStart.context.reportedModel, middle.reportedModel]) if (model !== null) reportedModels.add(model);
    if (reportedModels.size > 1) return unavailable('model-mismatch');
    for (const bucket of buckets) {
      const mid = middle.counters[bucket], low = base.counters[bucket], high = observation.counters[bucket];
      if (mid !== null && ((low !== null && mid < low) || (high !== null && mid > high))) return unavailable('counter-reset');
    }
  }
  if (deltas.reasoningTokens !== null && deltas.outputTokens !== null && deltas.reasoningTokens > deltas.outputTokens) return unavailable('counter-inconsistent');
  return { counters: deltas, estimated: observation.quality === 'estimated' || base.quality === 'estimated', notices: [] };
}

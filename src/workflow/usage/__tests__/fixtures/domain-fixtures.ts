/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { sourceDigest } from '../../canonical.js';
import { eventSetDigest } from '../../validation.js';
import type { AccountingScope, LedgerRecord, Observation, RequestFinished, RequestStarted, SourceCapability, UsageBinding } from '../../types.js';

export const binding: UsageBinding = { repo: '/repo', rootArtifactId: 'EPIC-0123456789abcdef', artifactId: 'TASK-0123456789abcdef-s1-t1', workItemId: 's1/t1', workflowRunId: 'run', version: 'v1', provenance: 'stored-owner' };
export const capability: SourceCapability = {
  capabilityId: 'fixture', provider: 'test-only', transport: 'in-memory', version: 'fixture-v1', sourceRevision: null,
  evidenceRefs: ['fixture:unit-test-declaration-only'], granularity: 'model-call', physicalCallCoverage: 'complete',
  observedModelIdentity: 'reported', inputConvention: 'disjoint', reasoningInOutput: true,
  supportedCounterBuckets: ['inputUncachedTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens', 'reasoningTokens'],
  baselineRequired: false, qualification: 'source-inspected',
};
export function signed<T extends LedgerRecord>(record: T): T { return { ...record, payloadDigest: sourceDigest(record) }; }
export function finish(observation: Partial<Observation> = {}): RequestFinished {
  return signed({ schemaVersion: 1, eventId: 'finish', rootArtifactId: binding.rootArtifactId, artifactId: binding.artifactId,
    sequence: 1, recordedAt: '2026-10-26T00:00:00.000Z', recordKind: 'request.finished', payloadDigest: '0'.repeat(64), callId: 'call', context: null, control: null,
    observation: { outcome: 'success', reportedModel: null, finishedAt: '2026-10-26T00:00:00.000Z', quality: 'reported',
      counters: { inputUncachedTokens: 1, cacheReadTokens: 0, cacheWriteTokens: null, outputTokens: 2, reasoningTokens: 1 },
      normalizationVersion: 'disjoint-v1', nativeUnit: 'tokens', sourceCapabilityId: 'fixture', reason: null, cumulative: null, ...observation },
  });
}
export function start(): RequestStarted {
  return signed({ ...finish(), eventId: 'start', sequence: 0, recordKind: 'request.started', observation: null,
    context: { logicalRequestId: 'logical', invocationId: 'invocation', nativeSessionId: null, parentCallId: null,
      workflow: 'build', runId: 'run', stepId: 'step', activity: 'task-implement', attempt: 1,
      source: { provider: 'test-only', transport: 'in-memory', version: 'fixture-v1', evidenceId: 'fixture:unit-test-declaration-only' },
      granularity: 'model-call', modelSliceId: 'slice', modelKind: 'completion', requestedModel: 'requested', reportedModel: null, review: null, binding },
  });
}
export function scope(): AccountingScope {
  return { group: { invocationId: 'invocation', modelSliceId: 'slice', isolatedCallId: null }, metric: 'processed', expectedBindings: [binding], closure: 'complete-observed-group',
    evidence: { rootWatermarkRefs: [{ rootArtifactId: binding.rootArtifactId, watermarkId: 'watermark' }],
      expectedEventIds: ['start', 'finish'], expectedRecordCount: 2, eventSetDigest: eventSetDigest(['start', 'finish']), referenceOnlyEventIds: [],
      sourceCapabilities: [capability], expectedBindingVersions: [{ rootArtifactId: binding.rootArtifactId, artifactId: binding.artifactId, version: binding.version }], coverageState: 'observed' },
  };
}
export async function* stream(rows: readonly LedgerRecord[]): AsyncIterable<LedgerRecord> { for (const row of rows) yield row; }
export function scoped(rows: readonly LedgerRecord[]): AccountingScope {
  const base = scope(), ids = [...new Set(rows.map(row => row.eventId))];
  return { ...base, evidence: { ...base.evidence, expectedEventIds: ids, expectedRecordCount: ids.length, eventSetDigest: eventSetDigest(ids) } };
}

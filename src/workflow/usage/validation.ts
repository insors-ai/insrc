/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import { Ajv } from 'ajv';
import { ArtifactIds } from '../artifact-ids.js';
import { canonicalData, canonicalSource, sourceDigest, UsageInputError } from './canonical.js';
import { validateSourceCapability } from './capabilities.js';
import { ledgerRecordV1Schema } from './schemas.js';
import { USAGE_LIMITS } from './types.js';
import type { AccountingScope, LedgerRecord, UsageBinding } from './types.js';

const ajv = new Ajv({ strict: false, useDefaults: false, removeAdditional: false });
const recordShape = ajv.compile<LedgerRecord>(ledgerRecordV1Schema);
const id = { type: 'string', minLength: 1, maxLength: USAGE_LIMITS.idCharacters };
const ids = { type: 'array', maxItems: USAGE_LIMITS.referenceItems, uniqueItems: true, items: id };
const ref = (name: string) => ({ $ref: `#/$defs/${name}` });
const object = (properties: Record<string, unknown>, optional: string[] = []) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties).filter(key => !optional.includes(key)), properties });
const scopeShape = ajv.compile({
  ...object({
    group: ref('Group'), metric: { enum: ['processed', 'inputUncachedTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens', 'reasoningTokens'] },
    expectedBindings: { type: 'array', maxItems: 1024, items: ref('Binding') },
    evidence: object({
      rootWatermarkRefs: { type: 'array', maxItems: 1024, items: object({ rootArtifactId: id, watermarkId: id }) },
      expectedEventIds: ids, expectedRecordCount: { type: 'integer', minimum: 0, maximum: 1024 },
      eventSetDigest: { type: 'string', pattern: '^[a-f0-9]{64}$' }, referenceOnlyEventIds: ids,
      sourceCapabilities: { type: 'array', maxItems: 1024, items: { type: 'object' } },
      expectedBindingVersions: { type: 'array', maxItems: 1024, items: object({ rootArtifactId: id, artifactId: id, version: id }) },
      coverageState: { enum: ['observed', 'partial', 'legacy', 'missing', 'unsupported'] },
      selectedCurrentEventId: id, baselineEventId: id,
    }, ['selectedCurrentEventId', 'baselineEventId']),
    closure: { enum: ['complete-observed-group', 'partial'] },
  }),
  $defs: ledgerRecordV1Schema.$defs,
});
const rootKinds = new Set(['EPIC', 'STORY', 'ISSUE', 'SPEC']);
const rootId = (value: string): boolean => rootKinds.has(ArtifactIds.parse(value)?.kind ?? '');
const artifactId = (value: string): boolean => ArtifactIds.parse(value) !== undefined;
const utcTime = (value: string): boolean => {
  try { return new Date(value).toISOString() === value; } catch { return false; }
};
const bindingKey = (binding: Pick<UsageBinding, 'rootArtifactId' | 'artifactId'>): string => `${binding.rootArtifactId}/${binding.artifactId}`;
function bindingNotices(binding: UsageBinding, path: string): string[] {
  const notices: string[] = [];
  if (!rootId(binding.rootArtifactId)) notices.push(`binding-invalid:${path}/rootArtifactId`);
  if (!artifactId(binding.artifactId)) notices.push(`binding-invalid:${path}/artifactId`);
  const root = ArtifactIds.parse(binding.rootArtifactId), artifact = ArtifactIds.parse(binding.artifactId);
  if (root && artifact && (root.kind === 'EPIC' || root.kind === 'STORY') &&
      (root.epicHash !== artifact.epicHash || (root.kind === 'STORY' && root.story !== artifact.story))) {
    notices.push(`binding-invalid:${path}/rootArtifactId`);
  }
  return notices;
}
function safeCopy(input: unknown, maxBytes: number): { value?: unknown; notice?: string } {
  try { return { value: JSON.parse(canonicalData(input, maxBytes)) as unknown }; }
  catch (error) {
    return { notice: `${error instanceof UsageInputError && error.code === 'resource-limit' ? 'resource-limit' : 'invalid-field'}:${error instanceof UsageInputError ? error.path || '/' : '/'}` };
  }
}

/** v1 set identity is a domain-separated hash of sorted, unique event IDs. */
export function eventSetDigest(eventIds: readonly string[]): string {
  const snapshot = safeCopy(eventIds, USAGE_LIMITS.groupBytes);
  if (snapshot.notice || !Array.isArray(snapshot.value) || snapshot.value.length > 1024 || snapshot.value.some(value => typeof value !== 'string' || value.length < 1 || value.length > 256) || new Set(snapshot.value).size !== snapshot.value.length) throw new UsageInputError('invalid-input', '/expectedEventIds');
  return createHash('sha256').update('insrc.usage.event-set.v1\0').update(canonicalData([...snapshot.value].sort(), USAGE_LIMITS.groupBytes)).digest('hex');
}

/** Local record checks only; start/reference closure and owner authority are separate. */
export function validateRecord(input: unknown): readonly string[] {
  const copied = safeCopy(input, USAGE_LIMITS.sourceBytes + 1024);
  if (copied.notice) return [copied.notice.replace(/^invalid-field:(\/observation\/counters(?:\/|$))/, 'counter-invalid:$1')];
  const raw = copied.value;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return ['invalid-field:/'];
  const tag = raw as Record<string, unknown>;
  if (tag.schemaVersion !== 1) return ['unsupported-version:/schemaVersion'];
  if (!ledgerRecordV1Schema.properties.recordKind.enum.includes(tag.recordKind as never)) return ['unknown-kind:/recordKind'];
  const observation = tag.observation;
  if (observation && typeof observation === 'object' && !Array.isArray(observation)) {
    const counters = (observation as Record<string, unknown>).counters;
    if (counters && typeof counters === 'object' && !Array.isArray(counters)) {
      for (const key of ['inputUncachedTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens', 'reasoningTokens']) {
        const value = (counters as Record<string, unknown>)[key];
        if (value !== null && value !== undefined && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)) return [`counter-invalid:/observation/counters/${key}`];
      }
    }
  }
  if (!recordShape(raw)) return [`invalid-field:${recordShape.errors?.[0]?.instancePath || '/'}`];
  const record = raw as LedgerRecord;
  const notices: string[] = [];
  try {
    canonicalSource(record);
    if (sourceDigest(record) !== record.payloadDigest) notices.push('digest-mismatch:/payloadDigest');
  } catch (error) {
    notices.push(`${error instanceof UsageInputError && error.code === 'resource-limit' ? 'resource-limit' : 'invalid-field'}:/`);
  }
  if (!rootId(record.rootArtifactId)) notices.push('invalid-field:/rootArtifactId');
  if (!artifactId(record.artifactId)) notices.push('invalid-field:/artifactId');
  if (!utcTime(record.recordedAt)) notices.push('invalid-field:/recordedAt');
  if (record.context) {
    const context = record.context;
    notices.push(...bindingNotices(context.binding, '/context/binding'));
    if (context.attempt < 1) notices.push('invalid-field:/context/attempt');
    if (context.review && context.review.round < 1) notices.push('invalid-field:/context/review/round');
    if (context.binding.rootArtifactId !== record.rootArtifactId || context.binding.artifactId !== record.artifactId || context.binding.workflowRunId !== context.runId) notices.push('binding-unresolved:/context/binding');
    if (context.granularity !== 'model-call' && context.invocationId === null) notices.push('invalid-field:/context/invocationId');
    if (context.granularity === 'cumulative-snapshot' && context.nativeSessionId === null) notices.push('invalid-field:/context/nativeSessionId');
  }
  if (record.observation) {
    const observation = record.observation, counters = observation.counters;
    if (!utcTime(observation.finishedAt)) notices.push('invalid-field:/observation/finishedAt');
    if (counters.reasoningTokens !== null && counters.outputTokens !== null && counters.reasoningTokens > counters.outputTokens) notices.push('counter-invalid:/observation/counters/reasoningTokens');
    if (observation.quality === 'unavailable' && (Object.values(counters).some(value => value !== null) || !observation.reason?.trim())) notices.push('quality-conflict:/observation');
    if (observation.quality === 'estimated' && !observation.reason?.trim()) notices.push('quality-conflict:/observation/reason');
  }
  if (record.recordKind === 'usage.reconciled') {
    const control = record.control;
    for (const key of ['candidateEventIds', 'selectedEventIds', 'excludedEventIds', 'evidenceEventIds'] as const) if (new Set(control[key]).size !== control[key].length) notices.push(`invalid-field:/control/${key}`);
    const selected = new Set(control.selectedEventIds), excluded = new Set(control.excludedEventIds), candidates = new Set(control.candidateEventIds);
    if ([...selected].some(value => excluded.has(value)) || selected.size + excluded.size !== candidates.size || [...selected, ...excluded].some(value => !candidates.has(value))) notices.push('reconciliation-conflict:/control');
  }
  if (record.recordKind === 'root.reserved' || record.recordKind === 'artifact.bound' || record.recordKind === 'binding.reconciled') {
    notices.push(...bindingNotices(record.control.binding, '/control/binding'));
    if (record.control.binding.rootArtifactId !== record.rootArtifactId || record.control.binding.artifactId !== record.artifactId) notices.push('binding-unresolved:/control/binding');
  }
  if (record.recordKind.startsWith('transfer.')) {
    const control = (record as Extract<LedgerRecord, { recordKind: 'transfer.prepared' | 'transfer.accepted' | 'transfer.committed' }>).control;
    if (!rootId(control.sourceRootId) || !rootId(control.destinationRootId) || !rootId(control.originalObservationRef.rootArtifactId) || !artifactId(control.fromArtifactId) || !artifactId(control.destinationArtifactId)) notices.push('invalid-field:/control');
    if ((control.mode === 'same-root') !== (control.sourceRootId === control.destinationRootId)) notices.push('transfer-conflict:/control/mode');
  }
  return [...new Set(notices)].sort();
}

/** Validate evidence structure and internal consistency; never invent closure or root authority. */
export function validateScope(input: unknown): readonly string[] {
  const copied = safeCopy(input, USAGE_LIMITS.groupBytes);
  if (copied.notice) return [copied.notice];
  if (!scopeShape(copied.value)) return [`scope-invalid:${scopeShape.errors?.[0]?.instancePath || '/'}`];
  const scope = copied.value as AccountingScope, evidence = scope.evidence;
  const notices: string[] = [], expected = new Set(evidence.expectedEventIds);
  if (evidence.expectedRecordCount !== expected.size || eventSetDigest(evidence.expectedEventIds) !== evidence.eventSetDigest) notices.push('closure-invalid:/evidence/expectedEventIds');
  if (evidence.referenceOnlyEventIds.some(value => !expected.has(value))) notices.push('closure-invalid:/evidence/referenceOnlyEventIds');
  if (Boolean(evidence.selectedCurrentEventId) !== Boolean(evidence.baselineEventId)) notices.push('closure-invalid:/evidence/baselineEventId');
  if (evidence.baselineEventId && (!expected.has(evidence.baselineEventId) || !evidence.referenceOnlyEventIds.includes(evidence.baselineEventId) || !expected.has(evidence.selectedCurrentEventId!) || evidence.referenceOnlyEventIds.includes(evidence.selectedCurrentEventId!) || evidence.selectedCurrentEventId === evidence.baselineEventId)) notices.push('closure-invalid:/evidence/baselineEventId');
  if (scope.closure === 'complete-observed-group' && (evidence.coverageState !== 'observed' || evidence.rootWatermarkRefs.length === 0)) notices.push('closure-incomplete:/evidence');
  if (scope.closure === 'complete-observed-group' && expected.size > 0) {
    if (scope.expectedBindings.length === 0) notices.push('binding-unresolved:/expectedBindings');
    if (evidence.sourceCapabilities.length === 0) notices.push('scope-capability-invalid:/evidence/sourceCapabilities');
  }
  const roots = new Set<string>();
  for (const mark of evidence.rootWatermarkRefs) {
    if (!rootId(mark.rootArtifactId) || roots.has(mark.rootArtifactId)) notices.push('closure-invalid:/evidence/rootWatermarkRefs');
    roots.add(mark.rootArtifactId);
  }
  const versions = new Map<string, string>();
  for (const version of evidence.expectedBindingVersions) {
    const key = bindingKey(version);
    if (!rootId(version.rootArtifactId) || !artifactId(version.artifactId) || versions.has(key)) notices.push('binding-unresolved:/evidence/expectedBindingVersions');
    versions.set(key, version.version);
  }
  const bindings = new Set<string>();
  for (const binding of scope.expectedBindings) {
    notices.push(...bindingNotices(binding, '/expectedBindings'));
    const key = bindingKey(binding);
    if (bindings.has(key) || versions.get(key) !== binding.version || (scope.closure === 'complete-observed-group' && !roots.has(binding.rootArtifactId))) notices.push('binding-unresolved:/expectedBindings');
    bindings.add(key);
  }
  if (bindings.size !== versions.size) notices.push('binding-unresolved:/evidence/expectedBindingVersions');
  const capabilities = new Set<string>();
  for (const capability of evidence.sourceCapabilities) {
    notices.push(...validateSourceCapability(capability).map(notice => `scope-${notice}`));
    if (capabilities.has(capability.capabilityId)) notices.push('scope-capability-invalid:/evidence/sourceCapabilities');
    capabilities.add(capability.capabilityId);
  }
  return [...new Set(notices)].sort();
}

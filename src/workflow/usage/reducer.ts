/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { canonicalData, canonicalSource, UsageInputError } from './canonical.js';
import { validateAttribution } from './attribution.js';
import { resolveObservationBasis } from './basis.js';
import { eventSetDigest, validateRecord, validateScope } from './validation.js';
import { USAGE_LIMITS } from './types.js';
import type { AccountingScope, EffectiveAccounting, LedgerRecord, NormalizedCounters, RequestStarted, UsageDomainError, UsageQuality } from './types.js';

export class UsageReductionError extends Error implements UsageDomainError {
  constructor(readonly code: 'resource-limit' | 'source-unavailable') { super(code); this.name = 'UsageReductionError'; }
}
export interface CollectedGroup {
  readonly records: ReadonlyMap<string, LedgerRecord>;
  readonly eventIds: ReadonlySet<string>;
  readonly conflicts: ReadonlySet<string>;
  readonly conflictingCalls: ReadonlySet<string>;
  readonly ambiguousControl: boolean;
  readonly notices: readonly string[];
  readonly receivedRows: number;
  readonly receivedBytes: number;
  readonly invalid: boolean;
}
const bindingKey = (root: string, artifact: string): string => `${root}/${artifact}`;
const counters = ['inputUncachedTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens'] as const;
const checkAbort = (signal?: AbortSignal): void => { if (signal?.aborted) throw new UsageReductionError('source-unavailable'); };
async function nextRecord(iterator: AsyncIterator<LedgerRecord>, signal?: AbortSignal): Promise<IteratorResult<LedgerRecord>> {
  checkAbort(signal);
  if (!signal) return iterator.next();
  return new Promise((resolve, reject) => {
    const abort = (): void => { reject(new UsageReductionError('source-unavailable')); };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => { checkAbort(signal); return iterator.next(); }).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Internal bounded input stage; replay still consumes row and byte budgets. */
export async function collectGroup(records: AsyncIterable<LedgerRecord>, signal?: AbortSignal): Promise<CollectedGroup> {
  const unique = new Map<string, LedgerRecord>(), sources = new Map<string, string>(), conflicts = new Set<string>(), notices = new Set<string>();
  const conflictingCalls = new Set<string>();
  let receivedRows = 0, receivedBytes = 0, invalid = false, done = false, ambiguousControl = false;
  let iterator: AsyncIterator<LedgerRecord> | undefined;
  try {
    iterator = records[Symbol.asyncIterator]();
    while (true) {
      const next = await nextRecord(iterator, signal);
      checkAbort(signal);
      if (next.done) { done = true; break; }
      if (++receivedRows > USAGE_LIMITS.groupRecords) throw new UsageReductionError('resource-limit');
      let snapshot: LedgerRecord, source: string, serialized: string | undefined;
      try {
        serialized = canonicalData(next.value, USAGE_LIMITS.sourceBytes + 1024);
        snapshot = JSON.parse(serialized) as LedgerRecord;
        source = canonicalSource(snapshot);
      } catch (error) {
        if (error instanceof UsageInputError && error.code === 'resource-limit') throw new UsageReductionError('resource-limit');
        // Invalid source cannot evade the work budget. If it cannot be safely
        // serialized, charge its bounded worst-case traversal allowance.
        receivedBytes += serialized === undefined ? USAGE_LIMITS.sourceBytes + 1024 : Buffer.byteLength(serialized);
        if (receivedBytes > USAGE_LIMITS.groupBytes) throw new UsageReductionError('resource-limit');
        invalid = true; notices.add('invalid-record:/'); continue;
      }
      receivedBytes += Buffer.byteLength(source);
      if (receivedBytes > USAGE_LIMITS.groupBytes) throw new UsageReductionError('resource-limit');
      const errors = validateRecord(snapshot);
      if (errors.some(error => error.startsWith('resource-limit:'))) throw new UsageReductionError('resource-limit');
      if (errors.length) { invalid = true; for (const error of errors) notices.add(error); conflicts.add(snapshot.eventId); }
      const prior = sources.get(snapshot.eventId);
      if (prior !== undefined && prior !== source) {
        conflicts.add(snapshot.eventId); notices.add(`identity-conflict:${snapshot.eventId}`);
        const previous = unique.get(snapshot.eventId), previousCall = previous?.callId;
        if (previousCall) conflictingCalls.add(previousCall);
        if (snapshot.callId) conflictingCalls.add(snapshot.callId);
        if (previous?.callId === null || snapshot.callId === null) ambiguousControl = true;
        // No variant of a conflicted ID is a usable reference-graph node.
        // Retain its ID/fingerprint for closure and replay-work accounting only.
        unique.delete(snapshot.eventId);
      }
      if (prior === undefined) { sources.set(snapshot.eventId, source); unique.set(snapshot.eventId, snapshot); }
    }
  } catch (error) {
    if (error instanceof UsageReductionError) throw error;
    throw new UsageReductionError('source-unavailable');
  } finally {
    if (!done && iterator?.return) {
      // A pending source next() may never settle; do not await its return().
      try { void Promise.resolve(iterator.return()).catch(() => {}); } catch { /* best effort */ }
    }
  }
  return { records: unique, eventIds: new Set(sources.keys()), conflicts, conflictingCalls, ambiguousControl, notices: [...notices].sort(), receivedRows, receivedBytes, invalid };
}

/** Sum only known components. Unknown required buckets remain explicitly unknown. */
export function metricValue(value: NormalizedCounters, metric: AccountingScope['metric']): { known: bigint; unknown: boolean } {
  const selected = metric === 'processed' ? counters.map(key => value[key]) : [value[metric]];
  return { known: selected.reduce<bigint>((sum, item) => sum + (item === null ? 0n : BigInt(item)), 0n), unknown: selected.some(item => item === null) };
}
function orderedNotices(notices: Iterable<string>): string[] {
  const unique = new Set(notices);
  if (unique.size > USAGE_LIMITS.referenceItems) throw new UsageReductionError('resource-limit');
  return [...unique].sort();
}
const empty = (notices: readonly string[], quality: readonly UsageQuality[]): EffectiveAccounting => ({ knownTokens: '0', estimatedTokens: '0', quality: [...new Set(quality)].sort(), basisEventIds: [], notices: orderedNotices(notices) });

/**
 * Internal t6 composition, intentionally absent from the public barrel while
 * cumulative/ownership stages are built in t8-t9.
 * Unhandled accounting controls are refused explicitly, never approximated.
 */
export async function reduceGroupCore(records: AsyncIterable<LedgerRecord>, input: unknown, options: { readonly signal?: AbortSignal | undefined } = {}): Promise<EffectiveAccounting> {
  checkAbort(options.signal);
  const scopeErrors = validateScope(input);
  if (scopeErrors.some(error => error.startsWith('resource-limit:'))) throw new UsageReductionError('resource-limit');
  if (scopeErrors.length) return empty(scopeErrors, ['conflict', 'unavailable']);
  const scope = JSON.parse(canonicalData(input, USAGE_LIMITS.groupBytes)) as AccountingScope;
  const collected = await collectGroup(records, options.signal);
  const notices = new Set(collected.notices), quality = new Set<UsageQuality>();
  const actual = [...collected.eventIds].sort(), expected = [...scope.evidence.expectedEventIds].sort();
  if (actual.length !== scope.evidence.expectedRecordCount || eventSetDigest(actual) !== scope.evidence.eventSetDigest || canonicalData(actual, USAGE_LIMITS.groupBytes) !== canonicalData(expected, USAGE_LIMITS.groupBytes)) {
    notices.add('closure-incomplete:/evidence/expectedEventIds'); quality.add('unavailable');
  }
  if (scope.closure !== 'complete-observed-group' || scope.evidence.coverageState !== 'observed') {
    notices.add('closure-incomplete:/evidence'); quality.add('unavailable');
    if (scope.evidence.coverageState === 'legacy' || scope.evidence.coverageState === 'missing' || scope.evidence.coverageState === 'unsupported') quality.add(scope.evidence.coverageState);
  }
  if (collected.invalid) return empty([...notices], [...quality, 'conflict', 'unavailable']);
  const rows = [...collected.records.values()].sort((a, b) => a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0);
  if (collected.ambiguousControl) return empty([...notices], [...quality, 'conflict', 'unavailable']);
  if (rows.some(row => row.recordKind.startsWith('transfer.'))) return empty([...notices, 'unsupported-control:/'], [...quality, 'unsupported', 'unavailable']);
  const starts = new Map<string, RequestStarted>(), startIdentity = new Map<string, string>(), badCalls = new Set(collected.conflictingCalls);
  const referenceOnly = new Set(scope.evidence.referenceOnlyEventIds);
  for (const row of rows) {
    if (collected.conflicts.has(row.eventId)) { quality.add('conflict'); if (row.callId) badCalls.add(row.callId); continue; }
    if (row.recordKind !== 'request.started') continue;
    const identity = canonicalData({ root: row.rootArtifactId, artifact: row.artifactId, context: row.context });
    if (startIdentity.has(row.callId) && startIdentity.get(row.callId) !== identity) { badCalls.add(row.callId); notices.add(`identity-conflict:${row.callId}`); quality.add('conflict'); }
    if (!starts.has(row.callId)) { starts.set(row.callId, row); startIdentity.set(row.callId, identity); }
  }
  const resolved = resolveObservationBasis(rows, starts, scope, badCalls, collected.conflicts);
  for (const callId of resolved.blockedCalls) badCalls.add(callId);
  for (const notice of resolved.notices) notices.add(notice);
  for (const flag of resolved.quality) quality.add(flag);
  let known = 0n, estimated = 0n;
  const basis: string[] = [];
  const bindings = new Map(scope.expectedBindings.map(binding => [bindingKey(binding.rootArtifactId, binding.artifactId), binding]));
  const capabilities = new Map(scope.evidence.sourceCapabilities.map(capability => [capability.capabilityId, capability]));
  for (const [callId, start] of starts) {
    if (referenceOnly.has(start.eventId)) continue;
    if (badCalls.has(callId)) continue;
    const context = start.context;
    const inGroup = context.modelSliceId === scope.group.modelSliceId && (scope.group.invocationId !== null ? context.invocationId === scope.group.invocationId : context.invocationId === null && callId === scope.group.isolatedCallId);
    if (!inGroup) { notices.add(`scope-conflict:${callId}`); quality.add('conflict'); continue; }
    const expectedBinding = bindings.get(bindingKey(start.rootArtifactId, start.artifactId));
    const attribution = validateAttribution({ activity: context.activity, chargedArtifactId: start.artifactId, subjectArtifactId: context.binding.artifactId,
      ...(['definition-review', 'epic-design-review', 'design-review'].includes(context.activity) ? { reviewedArtifactId: context.binding.artifactId } : {}),
      ...(context.activity.startsWith('task-') ? { taskId: context.binding.artifactId } : {}),
      ...(['shared-validate', 'code-review'].includes(context.activity) ? { storyBuildId: context.binding.artifactId } : {}),
      ...(context.activity === 'workflow-context' ? { parentBinding: context.binding } : {}),
    });
    if (!expectedBinding || canonicalData(expectedBinding) !== canonicalData(context.binding) || attribution.length) { notices.add(`binding-unresolved:${callId}`); quality.add('conflict'); continue; }
    const end = resolved.heads.get(callId);
    if (!end) {
      if (!resolved.observedCalls.has(callId)) { quality.add('pending'); notices.add(`pending:${callId}`); }
      continue;
    }
    if (end.rootArtifactId !== start.rootArtifactId || end.artifactId !== start.artifactId) { notices.add(`identity-conflict:${callId}`); quality.add('conflict'); continue; }
    const observation = end.observation, capability = capabilities.get(observation.sourceCapabilityId);
    if (!capability || capability.provider !== context.source.provider || capability.transport !== context.source.transport || (capability.version !== null && context.source.version !== capability.version) || (capability.granularity !== 'unknown' && capability.granularity !== context.granularity)) { notices.add(`source-unavailable:${end.eventId}`); quality.add('unavailable'); continue; }
    if (context.reportedModel !== null && observation.reportedModel !== null && context.reportedModel !== observation.reportedModel) { notices.add(`model-conflict:${end.eventId}`); quality.add('conflict'); continue; }
    if (context.granularity === 'cumulative-snapshot' || observation.cumulative !== null) { notices.add(`baseline-unavailable:${end.eventId}`); quality.add('unavailable'); continue; }
    if (observation.quality === 'unavailable') { notices.add(`usage-unavailable:${end.eventId}`); quality.add('unavailable'); continue; }
    const selected = scope.metric === 'processed' ? counters : [scope.metric];
    if (selected.some(bucket => observation.counters[bucket] !== null && !capability.supportedCounterBuckets.includes(bucket))) { notices.add(`counter-unsupported:${end.eventId}`); quality.add('unsupported'); quality.add('unavailable'); continue; }
    const amount = metricValue(observation.counters, scope.metric);
    if (amount.unknown) { notices.add(`counter-unavailable:${end.eventId}`); quality.add('unavailable'); }
    if (selected.some(bucket => observation.counters[bucket] !== null)) {
      if (observation.quality === 'estimated') { estimated += amount.known; quality.add('estimated'); }
      else { known += amount.known; quality.add('reported'); }
      basis.push(end.eventId);
    }
    if (observation.outcome !== 'success') notices.add(`${observation.outcome}:${end.eventId}`);
  }
  if (!starts.size) { quality.add('unavailable'); notices.add('usage-missing:/'); }
  if (collected.conflicts.size) quality.add('conflict');
  checkAbort(options.signal);
  return { knownTokens: known.toString(), estimatedTokens: estimated.toString(), quality: [...quality].sort(), basisEventIds: basis.sort(), notices: orderedNotices(notices) };
}

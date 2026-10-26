/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { canonicalData } from './canonical.js';
import type { AccountingScope, LedgerRecord, RequestFinished, RequestStarted, UsageCorrected, UsageQuality, UsageReconciled } from './types.js';

export type ObservationRecord = RequestFinished | UsageCorrected;
export interface ResolvedBasis {
  readonly heads: ReadonlyMap<string, ObservationRecord>;
  readonly observedCalls: ReadonlySet<string>;
  readonly blockedCalls: ReadonlySet<string>;
  readonly notices: readonly string[];
  readonly quality: readonly UsageQuality[];
}
const isObservation = (row: LedgerRecord | undefined): row is ObservationRecord => row?.recordKind === 'request.finished' || row?.recordKind === 'usage.corrected';
const inGroup = (start: RequestStarted | undefined, scope: AccountingScope): boolean => start !== undefined && start.context.modelSliceId === scope.group.modelSliceId && (scope.group.invocationId === null ? start.context.invocationId === null && start.callId === scope.group.isolatedCallId : start.context.invocationId === scope.group.invocationId);
const equalIds = (left: readonly string[], right: readonly string[]): boolean => canonicalData([...left].sort(), 1024 * 1024) === canonicalData([...right].sort(), 1024 * 1024);

/** Pure bounded reference graph. Never chooses by timestamp or sequence. */
export function resolveObservationBasis(rows: readonly LedgerRecord[], starts: ReadonlyMap<string, RequestStarted>, scope: AccountingScope, identityConflicts: ReadonlySet<string>, conflictedEvents: ReadonlySet<string>): ResolvedBasis {
  const byId = new Map(rows.map(row => [row.eventId, row]));
  const observations = rows.filter(isObservation), observedCalls = new Set<string>(), blockedCalls = new Set(identityConflicts);
  const notices = new Set<string>(), quality = new Set<UsageQuality>(), successors = new Map<string, ObservationRecord[]>();
  const references = new Set(scope.evidence.referenceOnlyEventIds);
  const fail = (row: ObservationRecord, code: string, partial = false): void => { blockedCalls.add(row.callId); notices.add(`${code}:${row.eventId}`); quality.add(partial ? 'unavailable' : 'conflict'); };
  for (const row of observations) {
    if (!references.has(row.eventId)) observedCalls.add(row.callId);
    if (!starts.has(row.callId)) fail(row, 'reference-missing', true);
    if (row.recordKind !== 'usage.corrected') continue;
    const prior = byId.get(row.control.supersedesEventId);
    if (!prior) { fail(row, 'reference-missing', true); continue; }
    if (!isObservation(prior) || prior.callId !== row.callId || prior.rootArtifactId !== row.rootArtifactId || prior.artifactId !== row.artifactId) {
      fail(row, 'correction-conflict'); if (isObservation(prior)) blockedCalls.add(prior.callId); continue;
    }
    const children = successors.get(prior.eventId) ?? []; children.push(row); successors.set(prior.eventId, children);
    if (children.length > 1) fail(row, 'correction-conflict');
    if (prior.observation.reportedModel !== null && row.observation.reportedModel !== null && prior.observation.reportedModel !== row.observation.reportedModel) fail(row, 'correction-conflict');
    if (prior.observation.reportedModel === null && row.observation.reportedModel !== null && row.control.provenanceEventIds.length === 0) fail(row, 'reference-missing', true);
    for (const id of row.control.provenanceEventIds) {
      const evidence = byId.get(id);
      if (!evidence) fail(row, 'reference-missing', true);
      else if (conflictedEvents.has(id)) fail(row, 'correction-conflict');
      else if (id === row.eventId) fail(row, 'correction-conflict');
      else if (evidence.rootArtifactId !== row.rootArtifactId || evidence.artifactId !== row.artifactId || (evidence.callId !== null && evidence.callId !== row.callId)) fail(row, 'correction-conflict');
    }
  }
  for (const row of observations) {
    let current: LedgerRecord | undefined = row;
    const visited = new Set<string>();
    while (isObservation(current)) {
      if (visited.has(current.eventId)) { fail(row, 'correction-conflict'); break; }
      if (row.observation.reportedModel !== null && current.observation.reportedModel !== null && row.observation.reportedModel !== current.observation.reportedModel) fail(row, 'correction-conflict');
      visited.add(current.eventId);
      if (current.recordKind !== 'usage.corrected') break;
      current = byId.get(current.control.supersedesEventId);
    }
  }
  const heads = new Map<string, ObservationRecord>();
  for (const row of observations) {
    if (references.has(row.eventId) || successors.has(row.eventId) || blockedCalls.has(row.callId)) continue;
    const start = starts.get(row.callId);
    if (start && (row.rootArtifactId !== start.rootArtifactId || row.artifactId !== start.artifactId)) { fail(row, 'identity-conflict'); continue; }
    if (heads.has(row.callId)) { fail(row, 'terminal-conflict'); continue; }
    heads.set(row.callId, row);
  }
  for (const callId of blockedCalls) heads.delete(callId);
  const candidates = [...heads.values()].filter(row => inGroup(starts.get(row.callId), scope));
  const reconciliations = rows.filter((row): row is UsageReconciled => row.recordKind === 'usage.reconciled');
  const aggregates = candidates.filter(row => starts.get(row.callId)!.context.granularity !== 'model-call');
  const overlaps = aggregates.length > 1 || (aggregates.length > 0 && candidates.length > aggregates.length);
  let selected = candidates;
  const rejectReconciliation = (code: string): void => { notices.add(code); quality.add(code.startsWith('reference-missing') ? 'unavailable' : 'conflict'); selected = []; };
  if (reconciliations.length) {
    const child = new Map<string, UsageReconciled[]>();
    let invalid = false;
    for (const row of reconciliations) {
      if (canonicalData(row.control.group) !== canonicalData(scope.group)) { rejectReconciliation(`reconciliation-conflict:${row.eventId}`); invalid = true; }
      const previous = row.control.previousReconciliationEventId;
      if (previous !== null) {
        const parent = byId.get(previous);
        if (!parent || parent.recordKind !== 'usage.reconciled') { rejectReconciliation(`reference-missing:${row.eventId}`); invalid = true; }
        const children = child.get(previous) ?? []; children.push(row); child.set(previous, children);
        if (children.length > 1) { rejectReconciliation(`reconciliation-conflict:${row.eventId}`); invalid = true; }
      }
      const seen = new Set<string>(); let current: UsageReconciled | undefined = row;
      while (current) {
        if (seen.has(current.eventId)) { rejectReconciliation(`reconciliation-conflict:${row.eventId}`); invalid = true; break; }
        seen.add(current.eventId);
        const parent: LedgerRecord | undefined = current.control.previousReconciliationEventId === null ? undefined : byId.get(current.control.previousReconciliationEventId);
        current = parent?.recordKind === 'usage.reconciled' ? parent : undefined;
      }
      for (const id of [...row.control.candidateEventIds, ...row.control.evidenceEventIds]) {
        const evidence = byId.get(id);
        if (!evidence) { rejectReconciliation(`reference-missing:${row.eventId}`); invalid = true; }
        else if (conflictedEvents.has(id)) { rejectReconciliation(`reconciliation-conflict:${row.eventId}`); invalid = true; }
        else if (evidence.callId !== null && !inGroup(starts.get(evidence.callId), scope) && !(row.control.evidenceEventIds.includes(id) && references.has(id))) { rejectReconciliation(`reconciliation-conflict:${row.eventId}`); invalid = true; }
      }
    }
    const current = reconciliations.filter(row => !child.has(row.eventId));
    if (current.length !== 1 || invalid) rejectReconciliation('reconciliation-conflict:/');
    else {
      const row = current[0]!, control = row.control;
      const leaf = candidates.filter(candidate => starts.get(candidate.callId)!.context.granularity === 'model-call');
      if (!equalIds(control.candidateEventIds, candidates.map(candidate => candidate.eventId)) || control.selectedEventIds.length === 0) rejectReconciliation(`reconciliation-conflict:${row.eventId}`);
      else {
        selected = candidates.filter(candidate => control.selectedEventIds.includes(candidate.eventId));
        const capability = scope.evidence.sourceCapabilities.find(item => item.capabilityId === control.sourceCapabilityId);
        if (!capability) rejectReconciliation(`reconciliation-conflict:${row.eventId}`);
        else if (control.coverage === 'aggregate-fallback') {
          if (selected.length !== 1 || starts.get(selected[0]!.callId)!.context.granularity === 'model-call' || selected[0]!.observation.sourceCapabilityId !== capability.capabilityId) rejectReconciliation(`reconciliation-conflict:${row.eventId}`);
        } else {
          const pendingLeaf = [...starts.values()].some(start => inGroup(start, scope) && start.context.granularity === 'model-call' && !heads.has(start.callId));
          if (capability.qualification !== 'source-inspected' || capability.physicalCallCoverage !== 'complete' || capability.granularity !== 'model-call' || control.evidenceEventIds.length === 0 || pendingLeaf || !equalIds(selected.map(item => item.eventId), leaf.map(item => item.eventId)) || selected.some(item => item.observation.sourceCapabilityId !== capability.capabilityId)) rejectReconciliation(`reconciliation-conflict:${row.eventId}`);
        }
      }
    }
  } else if (overlaps) rejectReconciliation('overlap-unresolved:/');
  const selectedIds = new Set(selected.map(row => row.eventId));
  for (const [callId, head] of heads) if (!selectedIds.has(head.eventId)) heads.delete(callId);
  return { heads, observedCalls, blockedCalls, notices: [...notices].sort(), quality: [...quality].sort() };
}

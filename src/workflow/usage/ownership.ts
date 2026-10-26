/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { canonicalData } from './canonical.js';
import { validateAttribution } from './attribution.js';
import type { ObservationRecord } from './basis.js';
import type { AccountingScope, EffectiveAccounting, EffectiveOwner, LedgerRecord, RequestStarted, TransferIdentity, UsageBinding } from './types.js';

type TransferRecord = Extract<LedgerRecord, { recordKind: 'transfer.prepared' | 'transfer.accepted' | 'transfer.committed' }>;
interface Operation {
  readonly identity: TransferIdentity;
  readonly state: 'committed' | 'pending' | 'conflict' | 'unavailable';
  readonly commitIds: readonly string[];
  readonly provenance: readonly string[];
  readonly notice?: string | undefined;
}
export interface OwnershipResult { readonly owner: EffectiveOwner; readonly notices: readonly string[]; }
/** Old totals-only results remain valid, but cannot authorize artifact grouping. */
export function requireEffectiveOwners(result: EffectiveAccounting): readonly EffectiveOwner[] {
  if (!Array.isArray(result.effectiveOwners)) throw new Error('effective-ownership-unavailable');
  return result.effectiveOwners;
}
const isTransfer = (row: LedgerRecord): row is TransferRecord => row.recordKind === 'transfer.prepared' || row.recordKind === 'transfer.accepted' || row.recordKind === 'transfer.committed';
const key = (root: string, artifact: string): string => `${root}/${artifact}`;
const sortedIds = (rows: readonly LedgerRecord[]): string[] => rows.map(row => row.eventId).sort();
const intent = (row: TransferRecord): string => {
  const { transferId, originalObservationRef, sourceRootId, destinationRootId, fromArtifactId, destinationArtifactId, expectedBindingVersion, reason, mode } = row.control;
  return canonicalData({ transferId, originalObservationRef, sourceRootId, destinationRootId, fromArtifactId, destinationArtifactId, expectedBindingVersion, reason, mode });
};
function subjectValid(binding: UsageBinding, start: RequestStarted): boolean {
  const activity = start.context.activity, artifactId = binding.artifactId;
  return validateAttribution({ activity, chargedArtifactId: artifactId, subjectArtifactId: artifactId, parentBinding: binding,
    ...(['definition-review', 'epic-design-review', 'design-review'].includes(activity) ? { reviewedArtifactId: artifactId } : {}),
    ...(activity.startsWith('task-') ? { taskId: artifactId } : {}),
    ...(['shared-validate', 'code-review'].includes(activity) ? { storyBuildId: artifactId } : {}),
  }).length === 0;
}

/** Pure effective assignment state. Binding descriptors prove supplied membership;
 * per-call owner versions advance to committed event IDs, not to wall clocks. */
export function resolveEffectiveOwner(start: RequestStarted, basis: ObservationRecord, records: ReadonlyMap<string, LedgerRecord>, scope: AccountingScope, closureComplete: boolean): OwnershipResult {
  const rows = [...records.values()].sort((a, b) => a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0);
  const bindings = new Map(scope.expectedBindings.map(binding => [key(binding.rootArtifactId, binding.artifactId), binding]));
  const watermarks = new Set(scope.evidence.rootWatermarkRefs.map(ref => ref.rootArtifactId));
  const provenance: string[] = [start.eventId];
  const ancestry: string[] = [], seen = new Set<string>();
  let current: LedgerRecord | undefined = basis;
  while (current?.recordKind === 'request.finished' || current?.recordKind === 'usage.corrected') {
    if (seen.has(current.eventId)) break;
    seen.add(current.eventId); ancestry.push(current.eventId);
    current = current.recordKind === 'usage.corrected' ? records.get(current.control.supersedesEventId) : undefined;
  }
  for (const row of rows) if ((row.recordKind === 'root.reserved' || row.recordKind === 'artifact.bound' || row.recordKind === 'binding.reconciled') && canonicalData(row.control.binding) === canonicalData(start.context.binding)) provenance.push(row.eventId);
  if (basis.observation.cumulative && scope.evidence.baselineEventId) provenance.push(scope.evidence.baselineEventId);
  provenance.push(...ancestry.reverse());
  const trace = () => ({ callId: start.callId, captureRootArtifactId: start.rootArtifactId, captureArtifactId: start.artifactId, basisEventIds: [basis.eventId], provenanceEventIds: [...new Set(provenance)] });
  const unresolved = (state: 'conflict' | 'unavailable', notice: string): OwnershipResult => ({ owner: { ...trace(), state, rootArtifactId: null, artifactId: null, ownerVersion: null }, notices: [notice] });
  const grouped = new Map<string, TransferRecord[]>();
  for (const row of rows) if (isTransfer(row)) { const group = grouped.get(row.control.transferId) ?? []; group.push(row); grouped.set(row.control.transferId, group); }
  // An incomplete set can omit a successor or competing commitment. Neither
  // capture membership nor visible phase records prove the current assignment.
  if (!closureComplete) {
    provenance.push(...rows.filter(isTransfer).filter(row => row.control.originalObservationRef.callId === start.callId).map(row => row.eventId));
    return unresolved('unavailable', 'transfer-closure-incomplete:/');
  }
  const operations: Operation[] = [];
  for (const [transferId, group] of grouped) {
    if (!group.some(row => row.control.originalObservationRef.callId === start.callId)) continue;
    const first = group[0]!, identity = first.control;
    const prepared = group.filter(row => row.recordKind === 'transfer.prepared'), accepted = group.filter(row => row.recordKind === 'transfer.accepted'), committed = group.filter(row => row.recordKind === 'transfer.committed');
    const phaseIds = [...sortedIds(prepared), ...sortedIds(accepted), ...sortedIds(committed)];
    const fail = (state: 'conflict' | 'unavailable', code: string): void => { operations.push({ identity, state, commitIds: [], provenance: phaseIds, notice: `${code}:${transferId}` }); };
    if (group.some(row => intent(row) !== intent(first))) { fail('conflict', 'transfer-conflict'); continue; }
    const reference = records.get(identity.originalObservationRef.eventId);
    if (!reference) { fail('unavailable', 'reference-missing'); continue; }
    if (!seen.has(reference.eventId) || reference.callId !== start.callId || reference.rootArtifactId !== identity.originalObservationRef.rootArtifactId || reference.rootArtifactId !== start.rootArtifactId || reference.artifactId !== start.artifactId) { fail('conflict', 'transfer-conflict'); continue; }
    const source = bindings.get(key(identity.sourceRootId, identity.fromArtifactId)), destination = bindings.get(key(identity.destinationRootId, identity.destinationArtifactId));
    if (!source || !destination || !watermarks.has(identity.sourceRootId) || !watermarks.has(identity.destinationRootId) || !watermarks.has(start.rootArtifactId)) { fail('unavailable', 'binding-unresolved'); continue; }
    if (!subjectValid(destination, start)) { fail('conflict', 'attribution-invalid'); continue; }
    if (group.some(row => row.rootArtifactId !== (row.recordKind === 'transfer.accepted' ? identity.destinationRootId : identity.sourceRootId) || row.artifactId !== (row.recordKind === 'transfer.accepted' ? identity.destinationArtifactId : identity.fromArtifactId))) { fail('conflict', 'transfer-conflict'); continue; }
    if (identity.mode === 'same-root') {
      if (prepared.length || accepted.length || !committed.length || identity.sourceRootId !== identity.destinationRootId) { fail('conflict', 'transfer-conflict'); continue; }
    } else {
      if (!prepared.length) { fail('unavailable', 'reference-missing'); continue; }
      const preparedIds = new Set(sortedIds(prepared)), acceptedIds = new Set(sortedIds(accepted));
      if (accepted.some(row => row.control.preparedEventId === null || !preparedIds.has(row.control.preparedEventId)) || committed.some(row => row.control.preparedEventId === null || row.control.acceptedEventId === null || !preparedIds.has(row.control.preparedEventId) || !acceptedIds.has(row.control.acceptedEventId))) { fail('unavailable', 'reference-missing'); continue; }
    }
    // Repeated identical intent/phase facts are aliases, not another ownership
    // transition. Use a deterministic committed ID and accept every equivalent
    // committed alias as the expected version of a subsequent transition.
    const membership = rows.filter(row => (row.recordKind === 'root.reserved' || row.recordKind === 'artifact.bound' || row.recordKind === 'binding.reconciled') && (canonicalData(row.control.binding) === canonicalData(source) || canonicalData(row.control.binding) === canonicalData(destination)));
    operations.push({ identity, state: committed.length ? 'committed' : 'pending', commitIds: sortedIds(committed), provenance: [...sortedIds(membership), ...phaseIds] });
  }
  let root = start.rootArtifactId, artifact = start.artifactId, version = start.context.binding.version;
  let aliases = new Set([version]);
  const visited = new Set([key(root, artifact)]), remaining = [...operations];
  while (remaining.length) {
    const invalid = remaining.find(operation => operation.state === 'conflict') ?? remaining.find(operation => operation.state === 'unavailable');
    if (invalid) { provenance.push(...remaining.flatMap(operation => operation.provenance).sort()); return unresolved(invalid.state as 'conflict' | 'unavailable', invalid.notice!); }
    const next = remaining.filter(operation => operation.identity.sourceRootId === root && operation.identity.fromArtifactId === artifact && aliases.has(operation.identity.expectedBindingVersion));
    if (next.length !== 1) { provenance.push(...remaining.flatMap(operation => operation.provenance).sort()); return unresolved('conflict', 'transfer-version-conflict:/'); }
    const operation = next[0]!;
    provenance.push(...operation.provenance);
    remaining.splice(remaining.indexOf(operation), 1);
    if (operation.state === 'pending') {
      if (remaining.length) return unresolved('unavailable', 'transfer-closure-incomplete:/');
      return { owner: { ...trace(), state: 'pending', rootArtifactId: root, artifactId: artifact, ownerVersion: version }, notices: [`transfer-pending:${operation.identity.transferId}`] };
    }
    const target = key(operation.identity.destinationRootId, operation.identity.destinationArtifactId);
    if (visited.has(target)) return unresolved('conflict', 'transfer-cycle:/');
    visited.add(target); root = operation.identity.destinationRootId; artifact = operation.identity.destinationArtifactId;
    aliases = new Set(operation.commitIds); version = operation.commitIds[0]!;
  }
  return { owner: { ...trace(), state: 'resolved', rootArtifactId: root, artifactId: artifact, ownerVersion: version }, notices: [] };
}

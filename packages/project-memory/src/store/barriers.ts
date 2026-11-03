import { MemoryError } from '../errors.js';
import type { SourceIdentity } from '../types.js';
import type { QueueFrame } from '../queue/types.js';
import { shape } from '../queue/shape.js';
import { physicalId, STORE_LIMITS, validateRow, validateSelector } from './codec.js';
import type { GuardLookup } from './guards.js';
import { admittedPayload, canonical, domainId, invalidPlan, requirePrepared } from './plan.js';
import type { PreparedPlan } from './plan.js';
import type { EmbeddingProfile, ForgetSelector, RootPayload, SourcePayload, StoreRow } from './types.js';

export interface FrameEligibility { readonly eligible: boolean; readonly rejectedByTombstoneIds: readonly string[]; }
export type ProtectionRow = Extract<StoreRow, { rowKind: 'tombstone' }>;
function unavailable(): never { throw new MemoryError('STORE_UNAVAILABLE', 'Memory lifecycle protection could not be verified.'); }
function overflow(): never { throw new MemoryError('CONTEXT_OVERFLOW', 'Memory protection exceeds its validation bound.'); }
export function broadSelector(selector: ForgetSelector): boolean { return ['session', 'conversation', 'project'].includes(selector.kind); }
export function sourceLifecycleMatches(selector: ForgetSelector, source: SourceIdentity): boolean {
  switch (selector.kind) {
    case 'project': return true;
    case 'session': return selector.sessionId === source.sessionId;
    case 'conversation': return selector.producerId === source.producerId && selector.sessionId === source.sessionId;
    default: return false;
  }
}
/** Storage control syntax is parsed before applying existing barriers. Trust in
 * authorization comes from the host-admitted final frame, never model row prose. */
export function forgetTarget(frame: QueueFrame): ForgetSelector | null {
  if (frame.command.kind !== 'forget') return null;
  const payload = frame.command.payload; shape(invalidPlan, payload, ['schemaVersion', 'input', 'source', 'admitted']);
  shape(invalidPlan, payload.input, ['target']); validateSelector(payload.input.target);
  const target = payload.input.target as unknown as ForgetSelector;
  if (target.kind === 'memory') domainId('memory', target.memoryId);
  if (target.kind === 'source') domainId('source', target.sourceId);
  if (broadSelector(target) && (frame.command.scope.sessionId !== undefined || frame.command.scope.branch !== undefined || frame.command.scope.environment !== undefined)) throw new MemoryError('POLICY_DENIED', 'Broad forgetting requires project authority.');
  return target;
}
export async function loadProtections(frame: QueueFrame, root: RootPayload, profile: EmbeddingProfile, lookup: GuardLookup): Promise<readonly ProtectionRow[]> {
  if (root.queueId !== null && root.queueId !== frame.queueId) unavailable();
  const raw = await lookup.tombstones(frame.command.scope.projectId, frame.scopeEpoch);
  if (!Array.isArray(raw) || raw.length > STORE_LIMITS.maxReferences) overflow();
  const result: ProtectionRow[] = [], seen = new Set<string>(); let bytes = 0;
  for (const value of raw) {
    let row: StoreRow; try { row = validateRow(value, profile); } catch { unavailable(); }
    if (row.rowKind !== 'tombstone' || row.projectId !== frame.command.scope.projectId || row.scopeEpoch !== frame.scopeEpoch || row.payload.queueId !== frame.queueId || row.payload.invalidFromGeneration === '0' || BigInt(row.payload.invalidFromGeneration) > BigInt(root.generation) || seen.has(row.rowId)) unavailable();
    if (broadSelector(row.payload.selector) && (row.sessionId !== null || row.branch !== null || row.environment !== null)) unavailable();
    bytes += Buffer.byteLength(canonical(row)); if (bytes > STORE_LIMITS.maxBytes) overflow();
    seen.add(row.rowId); result.push(row);
  }
  return Object.freeze(result);
}
function result(ids: Iterable<string>): FrameEligibility {
  const rejectedByTombstoneIds = Object.freeze([...new Set(ids)].sort());
  return Object.freeze({ eligible: rejectedByTombstoneIds.length === 0, rejectedByTombstoneIds });
}
export function frameProtection(frame: QueueFrame, markers: readonly ProtectionRow[], markerOnlyForget = false): FrameEligibility {
  // A closed lifecycle can acquire further monotone protection without recalling
  // its content. Other effects never receive this exemption.
  if (frame.command.kind === 'forget' && markerOnlyForget) return result([]);
  return result(markers.filter(row => sourceLifecycleMatches(row.payload.selector, frame.command.source)).map(row => row.payload.tombstoneId));
}
export async function planProtection(prepared: PreparedPlan, root: RootPayload, profile: EmbeddingProfile, lookup: GuardLookup): Promise<FrameEligibility> {
  requirePrepared(prepared); const { plan } = prepared;
  try { admittedPayload(plan.frame); forgetTarget(plan.frame); }
  catch (error) {
    // Legacy malformed accepted frames may still acquire exactly their validated
    // no-effect failure. They never acquire source or memory effects.
    if (plan.rows.length === 0 && ['failed', 'quarantined'].includes(plan.disposition.state) && error instanceof MemoryError && plan.disposition.errorCode === error.code) return result([]);
    throw error;
  }
  const markers = await loadProtections(plan.frame, root, profile, lookup);
  const ids = new Set(frameProtection(plan.frame, markers, plan.rows.every(row => row.rowKind === 'tombstone')).rejectedByTombstoneIds);
  if (ids.size) return result(ids);
  const incoming = new Map(plan.rows.map(row => [row.rowId, row]));
  const checked = new Map<string, SourcePayload>(); let references = markers.length, bytes = 0;
  const source = async (namespace: string, id: string) => {
    domainId('source', id); const rowId = physicalId('source', namespace, id);
    if (checked.has(rowId)) return checked.get(rowId)!;
    if (++references > STORE_LIMITS.maxReferences) overflow();
    const value = incoming.get(rowId) ?? await lookup.get(rowId);
    if (value === null) invalidPlan();
    const row = validateRow(value, profile);
    if (row.rowKind !== 'source' || row.rowId !== rowId || row.namespaceKey !== namespace || row.scopeEpoch !== plan.scopeEpoch) invalidPlan();
    bytes += Buffer.byteLength(canonical(row)); if (bytes > STORE_LIMITS.maxBytes) overflow();
    checked.set(rowId, row.payload); return row.payload;
  };
  // Every planned/current source dependency is checked, including carried history
  // from an older closed source lifecycle and evidence in a narrower namespace.
  // Do not enumerate stored current IDs as an oracle for unknown pending frames.
  for (const row of plan.rows) {
    let dependencies: readonly string[] = [];
    if (row.rowKind === 'current') dependencies = row.payload.sourceIds;
    if (row.rowKind === 'revision') dependencies = row.payload.snapshot.sourceIds;
    if (row.rowKind === 'evidence') dependencies = [row.payload.sourceId];
    if (row.rowKind === 'source') dependencies = [row.payload.sourceId];
    for (const id of dependencies) {
      const dependency = await source(row.namespaceKey, id);
      for (const marker of markers) if (sourceLifecycleMatches(marker.payload.selector, dependency.identity)) ids.add(marker.payload.tombstoneId);
    }
  }
  const outcome = result(ids);
  if (outcome.eligible && plan.disposition.rejectedByTombstoneIds.length) invalidPlan();
  return outcome;
}

import { getGraphStore, withWriteTxn } from '../db/graph/store.js';
import type { GraphStore } from '../db/graph/store.js';
import { prefixSuccessor } from '../db/graph/keys.js';
import { AssessmentError, parseRecord } from '../shared/understanding.js';
import type { AssessmentRecord } from '../shared/understanding.js';

export const assessmentNamespaces = ['understandingCurrent', 'understandingAttempt', 'understandingAudit',
  'understandingRequest', 'understandingOwnerIndex', 'understandingScopeIndex', 'understandingReceipt', 'understandingMeta'] as const;

export function tupleKey(...parts: string[]): Buffer {
  const buffers = parts.map(part => {
    const value = Buffer.from(part, 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(value.length);
    return Buffer.concat([length, value]);
  });
  return Buffer.concat(buffers);
}
const versionKey = tupleKey('schemaVersion');

export function assertAssessmentSchema(store: GraphStore): void {
  if (store.understandingMeta.get(versionKey) !== 1) throw new AssessmentError('schema-unsupported');
}

export async function initializeAssessmentStorage(): Promise<void> {
  await withWriteTxn(store => {
    const version = store.understandingMeta.get(versionKey);
    if (version === 1) return;
    if (version !== undefined || assessmentNamespaces.some(name => {
      for (const _row of store[name].getRange({ limit: 1 })) return true;
      return false;
    })) {
      throw new AssessmentError('schema-unsupported');
    }
    store.understandingMeta.putSync(versionKey, 1);
  });
}

export function readAssessment(store: GraphStore, id: string): AssessmentRecord | undefined {
  assertAssessmentSchema(store);
  const value: unknown = store.understandingCurrent.get(tupleKey(id));
  if (value === undefined) return undefined;
  const record = parseRecord(value);
  if (record.view.id !== id) throw new AssessmentError('schema-unsupported');
  return record;
}

// Caller must hold the existing GraphStore write transaction.
export function writeAssessment(store: GraphStore, input: AssessmentRecord): void {
  assertAssessmentSchema(store);
  const record = parseRecord(input);
  const old = readAssessment(store, record.view.id);
  if (old && (old.ownerPrincipal !== record.ownerPrincipal || old.scopeFingerprint !== record.scopeFingerprint)) {
    throw new AssessmentError('scope-mismatch');
  }
  store.understandingCurrent.putSync(tupleKey(record.view.id), record);
  store.understandingOwnerIndex.putSync(tupleKey(record.ownerPrincipal, record.learner.key, record.view.scope.repoId, record.view.id), record.view.id);
  store.understandingScopeIndex.putSync(tupleKey(record.scopeFingerprint, record.view.id), record.view.id);
}

export async function listAssessments(owner: string, learnerKey: string, repoId: string, limit = 50, after?: string): Promise<AssessmentRecord[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100
    || (after !== undefined && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(after))) throw new AssessmentError('invalid-input');
  const store = await getGraphStore();
  assertAssessmentSchema(store);
  const prefix = tupleKey(owner, learnerKey, repoId);
  const start = after === undefined ? prefix : tupleKey(owner, learnerKey, repoId, after);
  const rows: AssessmentRecord[] = [];
  for (const { key, value } of store.understandingOwnerIndex.getRange({ start, end: prefixSuccessor(prefix), limit: limit + 1 })) {
    if (after !== undefined && Buffer.from(key as Buffer).equals(start)) continue;
    if (typeof value !== 'string') throw new AssessmentError('schema-unsupported');
    const record = readAssessment(store, value);
    if (!record || record.ownerPrincipal !== owner || record.learner.key !== learnerKey || record.view.scope.repoId !== repoId || !Buffer.from(key as Buffer).equals(tupleKey(owner, learnerKey, repoId, value))) {
      throw new AssessmentError('schema-unsupported');
    }
    rows.push(record);
    if (rows.length === limit) break;
  }
  return rows;
}

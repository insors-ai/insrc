import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryError } from '../errors.js';
import { snapshotJson } from '../queue/codec.js';
import { arrowSchema, decodeRow, encodeRow, makeRow, namespaceKey, physicalId, snapshotRows, validateRow } from '../store/codec.js';
import { embeddingProfile } from '../store/embedding-profile.js';
import { currentPayload, epoch, profile, scope, storeRows } from './fixtures/store-rows.js';

const fails = (run: () => unknown, code = 'INVALID_REQUEST') => assert.throws(run, e => e instanceof MemoryError && e.code === code);
const copy = (value: unknown) => structuredClone(value) as Record<string, any>;
test('store-codec-canonical-roundtrip-all-row-kinds', () => {
  const rows = storeRows(); assert.equal(rows.length, 8);
  for (const row of rows) {
    const encoded = encodeRow(row, profile); const decoded = decodeRow(encoded, profile);
    assert.equal(snapshotJson(decoded, 65_536).text, snapshotJson(row, 65_536).text);
    assert.ok(Object.isFrozen(decoded)); assert.ok(Object.isFrozen(decoded.payload));
  }
  const current = rows.find(r => r.rowKind === 'current')!;
  assert.equal(current.rowKind, 'current');
  if (current.rowKind === 'current') assert.ok(Object.is(current.payload.assertion.value, -0));
  const encoded = encodeRow(current, profile);
  fails(() => decodeRow({ ...encoded, payload: ' ' + encoded.payload }, profile));
  fails(() => decodeRow({ ...encoded, payload: '{invalid' }, profile));
});
test('store-codec-rejects-missing-extra-and-duplicated-envelope-fields', () => {
  for (const row of storeRows()) {
    for (const key of Object.keys(row)) { const bad = copy(row); delete bad[key]; fails(() => validateRow(bad, profile)); }
    fails(() => validateRow({ ...row, extra: 'hidden' }, profile));
    fails(() => validateRow({ ...row, scopeEpoch: 'other-epoch' }, profile));
    fails(() => validateRow({ ...row, rowId: 'current:' + '0'.repeat(64) }, profile));
    fails(() => validateRow({ ...row, entityId: 'unrelated' }, profile));
    const bad = copy(row); bad.payload.extra = true; fails(() => validateRow(bad, profile));
    for (const key of Object.keys(row.payload)) {
      const missing = copy(row); delete missing.payload[key]; fails(() => validateRow(missing, profile));
    }
    const unsupported = copy(row); unsupported.payload.schemaVersion = 2;
    fails(() => validateRow(unsupported, profile), 'UNSUPPORTED_VERSION');
  }
  const row = storeRows()[2]!;
  fails(() => validateRow({ ...row, rowKind: 'delivery' }, profile), 'NOT_READY');
  fails(() => validateRow({ ...row, rowKind: 'unknown' }, profile));
  fails(() => validateRow({ ...row, payload: null }, profile));
  fails(() => validateRow({ ...row, embedding: [Infinity, 0] }, profile));
  fails(() => validateRow({ ...row, embedding: [1] }, profile));
  fails(() => validateRow({ ...storeRows()[0], embedding: [1, 0] }, profile));
});
test('store-codec-validates-nested-lineage-outcomes-and-source-shapes', () => {
  const rows = storeRows();
  const mutate = (kind: string, change: (p: any) => void) => { const row = copy(rows.find(r => r.rowKind === kind)!); change(row.payload); fails(() => validateRow(row, profile)); };
  mutate('current', p => { p.kind = 'unknown'; });
  mutate('current', p => { p.sourceIds.push(p.sourceIds[0]); });
  mutate('current', p => { p.authority.origin = 'system'; });
  mutate('current', p => { p.assertion.polarity = 'maybe'; });
  mutate('current', p => { p.createdAt = 101; });
  mutate('current', p => { p.validFrom = 10; p.validUntil = 10; });
  mutate('revision', p => { delete p.sourceEvent.payloadHash; });
  mutate('revision', p => { delete p.processingVersion.prompt; });
  mutate('revision', p => { p.snapshot.revisionId = 'other'; });
  mutate('revision', p => { p.mutationReason.code = 'arbitrary'; });
  mutate('source', p => { p.span.end--; });
  mutate('source', p => { p.span.unit = 'line'; });
  mutate('source', p => { p.identity.extra = true; });
  mutate('source', p => { p.location.reference = 'unexpected'; });
  mutate('source', p => { p.occurredAt = Number.MAX_SAFE_INTEGER + 1; });
  mutate('evidence', p => { p.relation = 'unrelated'; });
  mutate('receipt', p => { p.affectedRevisions.push(p.affectedRevisions[0]); });
  mutate('receipt', p => { p.state = 'processing'; });
  mutate('receipt', p => { p.errorCode = 'INVALID_REQUEST'; });
  mutate('receipt', p => { p.queueTerminal = false; });
  mutate('tombstone', p => { p.selector.sourceId = 'second-target'; });
  mutate('tombstone', p => { p.cutoffSequence = '01'; });
  mutate('tombstone', p => { p.mode = 'reopen'; });
  const receipt = copy(rows.find(r => r.rowKind === 'receipt')!);
  receipt.payload.state = 'failed'; receipt.payload.errorCode = 'POLICY_DENIED';
  receipt.payload.affectedRevisions = []; receipt.payload.sourceIds = [];
  receipt.payload.rejectedByTombstoneIds = ['existing-protection']; receipt.status = 'failed';
  assert.equal(validateRow(receipt, profile).rowKind, 'receipt');
});
test('store-codec-reserves-bounded-immutable-effect-batches', () => {
  const rows = storeRows(); const snapshot = snapshotRows(rows, profile, 16_384);
  assert.equal(snapshot.rows.length, rows.length); assert.ok(snapshot.bytes > 0);
  assert.ok(Object.isFrozen(snapshot.rows));
  fails(() => snapshotRows([rows[0], rows[0]], profile, 16_384));
  fails(() => snapshotRows(Array(4097).fill(rows[0]), profile, 16_384));
  fails(() => snapshotRows(rows, profile, 64));
  fails(() => snapshotRows(rows, profile, Infinity));
  let invoked = false;
  const getter = Object.defineProperty({}, 'payload', { enumerable: true, get() { invoked = true; return null; } });
  fails(() => validateRow(getter, profile)); assert.equal(invoked, false);
  const array = [rows[0]]; Object.defineProperty(array, '0', { enumerable: true, get() { invoked = true; return rows[0]; } });
  fails(() => snapshotRows(array, profile, 16_384)); assert.equal(invoked, false);
  fails(() => snapshotRows(new Array(1), profile, 16_384));
  const hostile = copy(rows[2]!); hostile.payload.text = '\ud800'; fails(() => validateRow(hostile, profile));
});
test('store-codec-qualified-identities-and-explicit-arrow-schema', async () => {
  const ns = namespaceKey(scope, epoch);
  assert.notEqual(ns, namespaceKey(scope, 'next-epoch'));
  assert.notEqual(ns, namespaceKey({ projectId: 'other', branch: 'main' }, epoch));
  assert.match(physicalId('current', ns, 'key'), /^current:[a-f0-9]{64}$/);
  assert.notEqual(physicalId('current', ns, 'key'), physicalId('revision', ns, 'key'));
  const schema = await arrowSchema(profile);
  assert.equal(schema.fields.length, 20);
  assert.equal(schema.fields.find(f => f.name === 'payload')?.nullable, false);
  assert.equal(schema.fields.find(f => f.name === 'embedding')?.nullable, true);
  assert.equal(schema.fields.find(f => f.name === 'embedding')?.type.toString(), 'FixedSizeList[2]<Float32>');
  const mutable = { ...profile }; const pendingSchema = arrowSchema(mutable); mutable.dimension = 3;
  assert.equal((await pendingSchema).fields.find(f => f.name === 'embedding')?.type.toString(), 'FixedSizeList[2]<Float32>');
  const changed = embeddingProfile('other-model', 2);
  fails(() => validateRow(storeRows()[0], changed), 'UNSUPPORTED_VERSION');
  const row = makeRow('current', scope, epoch, currentPayload(), profile, [0.1, 0.2]);
  assert.deepEqual(row.embedding, [Math.fround(0.1), Math.fround(0.2)]);
});

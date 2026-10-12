/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashBytes } from '../../canonical.js';
import { recordFixture } from '../../__tests__/fixtures.js';
import { stageSources } from '../eligibility.js';
import { validateOutputLineage, lineageBytes } from '../lineage.js';
import type { Lineage } from '../contracts.js';
import { sourceFixture, makeBytes } from './fixtures.js';
function fixture() {
  const f = sourceFixture(); const stage = stageSources(f.policy, f.request, f.blobs); assert.equal(stage.ok, true); if (!stage.ok) throw new Error('fixture');
  const ids = stage.value.admitted.map(a => a.source.sourceId);
  const output = { path: 'derived.json', bytes: makeBytes('Combined original fixture sources') };
  const lineage: Lineage = { schemaVersion: 1, bindings: [{ path: output.path, digest: hashBytes(output.bytes), authorship: 'derived', sourceIds: ids,
    transformation: 'fixture-composition-v1', modifications: ['Combined fixtures'], reviewedBy: 'Fixture reviewer' }], originals: [] };
  return { stage: stage.value, output, lineage };
}
test('lineage-closure retains every source and transformation for derived outputs', () => {
  const f = fixture(); const checked = validateOutputLineage(f.lineage, [f.output], [f.stage]); assert.equal(checked.ok, true);
  if (checked.ok) {
    assert.deepEqual(new Set(checked.value.bindings[0]!.sourceIds), new Set(f.stage.admitted.map(a => a.source.sourceId)));
    assert.equal(checked.value.bindings[0]!.transformation, 'fixture-composition-v1');
    const reordered = structuredClone(f.lineage); reordered.bindings[0]!.sourceIds.reverse();
    assert.deepEqual(lineageBytes(reordered), lineageBytes(checked.value));
  }
  const imported = f.stage.admitted.find(a => a.source.path === 'good.txt')!;
  const lineage: Lineage = { schemaVersion: 1, originals: [], bindings: [{ path: 'copy', digest: imported.source.digest, authorship: 'imported',
    sourceIds: [imported.source.sourceId], transformation: 'byte-copy', modifications: [], reviewedBy: 'Reviewer' }] };
  assert.equal(validateOutputLineage(lineage, [{ path: 'copy', bytes: imported.bytes }], [f.stage]).ok, true);
});
test('lineage-closure rejects unbound specimens inconsistent provenance and stale outputs', () => {
  const f = fixture();
  assert.equal(validateOutputLineage(f.lineage, [f.output, { path: 'unbound', bytes: makeBytes('unbound') }], [f.stage]).ok, false);
  assert.equal(validateOutputLineage(f.lineage, [{ ...f.output, bytes: makeBytes('tampered') }], [f.stage]).ok, false);
  for (const patch of [{ sourceIds: ['source:' + 'f'.repeat(64)] }, { modifications: [] }, { authorship: 'imported' }]) {
    const lineage = structuredClone(f.lineage); Object.assign(lineage.bindings[0]!, patch);
    assert.equal(validateOutputLineage(lineage, [f.output], [f.stage]).ok, false);
  }
  const record = { ...recordFixture(), examples: [], provenance: { authorship: 'derived' as const, author: 'Fixture', sourceRefs: [], modificationNotes: ['Combined fixtures'] } };
  assert.equal(validateOutputLineage(f.lineage, [f.output], [f.stage], [{ path: f.output.path, record }]).ok, false);
  record.provenance.sourceRefs = f.lineage.bindings[0]!.sourceIds;
  assert.equal(validateOutputLineage(f.lineage, [f.output], [f.stage], [{ path: f.output.path, record }]).ok, true);
});
test('lineage-closure requires explicit original and inferred output declarations', () => {
  for (const authorship of ['original', 'inferred'] as const) {
    const record = { ...recordFixture(), examples: [], rationale: 'Independently authored fixture', provenance: { authorship, author: 'Author', sourceRefs: [], modificationNotes: [] } };
    const output = { path: 'record.json', bytes: makeBytes(JSON.stringify(record)) };
    const lineage: Lineage = { schemaVersion: 1, bindings: [], originals: [{ path: output.path, digest: hashBytes(output.bytes), authorship, author: 'Author', rationale: record.rationale }] };
    assert.equal(validateOutputLineage(lineage, [output], [], [{ path: output.path, record }]).ok, true);
    assert.equal(validateOutputLineage({ ...lineage, originals: [] }, [output], []).ok, false);
    lineage.originals[0]!.author = 'Other'; assert.equal(validateOutputLineage(lineage, [output], [], [{ path: output.path, record }]).ok, false);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CORPUS_DOMAINS, decodeGuidanceRecord, decodeEvidenceRef, decodeReleaseManifest } from '../contracts.js';
import { recordFixture } from './fixtures.js';

test('closed schemas preserve original fixtures for every guidance kind', () => {
  for (const kind of ['foundation', 'pattern', 'style-recipe'] as const) {
    const record = recordFixture(kind), before = structuredClone(record);
    const result = decodeGuidanceRecord(record);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.value, before);
    assert.deepEqual(record, before);
  }
  assert.equal(CORPUS_DOMAINS.length, 10);
});
test('closed schemas reject missing fields unknown nested fields and invalid enums', () => {
  const base = recordFixture();
  for (const key of Object.keys(base)) {
    if (key === 'noMeasurableChecksRationale') continue;
    const value: Record<string, unknown> = { ...base }; delete value[key];
    assert.equal(decodeGuidanceRecord(value).ok, false, key);
  }
  for (const override of [{ schemaVersion: 2 }, { recordId: '../bad' }, { recordVersion: 'A'.repeat(64) },
    { domains: ['unknown'] }, { domains: ['Layout', 'Layout'] }, { kind: 'react' },
    { applicability: { ...base.applicability, uiTypes: ['ios'] } }, { provenance: { ...base.provenance, secret: true } }]) {
    assert.equal(decodeGuidanceRecord({ ...base, ...override }).ok, false);
  }
  const result = decodeGuidanceRecord({ ...base, schemaVersion: 2 });
  assert.ok(!result.ok && result.issues.some(x => x.code === 'schema.unsupported'));
});
test('evidence and manifest schemas require pinned identities without coercion', () => {
  const ref = { releaseId: 'a'.repeat(64), recordId: 'test:overview', recordVersion: 'b'.repeat(64) };
  assert.equal(decodeEvidenceRef(ref).ok, true);
  assert.equal(decodeEvidenceRef({ ...ref, releaseId: 5 }).ok, false);
  assert.equal(decodeReleaseManifest({ schemaVersion: '1' }).ok, false);
});

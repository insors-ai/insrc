import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGuidanceRecord } from '../validate.js';
import { recordFixture, sealRecord, specimenPaths } from './fixtures.js';

test('record roundtrip preserves all fields and rejects stale incomplete or draft reviews', () => {
  const source = recordFixture('style-recipe');
  const record = sealRecord({ ...source, provenance: { ...source.provenance, authorship: 'derived', sourceRefs: ['source:original'], modificationNotes: ['Adapted to fixture'] },
    relations: [{ kind: 'alternative', recordId: 'test:other', recordVersion: 'a'.repeat(64) }] });
  const options = { mode: 'publication' as const, contentPaths: specimenPaths };
  const result = validateGuidanceRecord(JSON.parse(JSON.stringify(record)), options);
  assert.equal(result.ok, true); if (result.ok) assert.deepEqual(result.value, record);
  const invalid = [
    { ...record, rationale: 'Edited after review' },
    { ...record, review: { ...record.review, status: 'draft' } },
    { ...record, review: { ...record.review, reviewer: '' } },
    { ...record, review: { ...record.review, reviewedAt: '2026-02-30T00:00:00Z' } },
    { ...record, review: { ...record.review, reviewedAt: '2026-10-11T01:00:00+01:00' } },
    { ...record, review: { ...record.review, contentDigest: 'b'.repeat(64) } },
  ];
  for (const value of invalid) assert.equal(validateGuidanceRecord(value, options).ok, false);
  const draft = { ...record, review: { status: 'draft', reviewer: '', reviewedAt: '', contentDigest: '' } };
  assert.equal(validateGuidanceRecord(draft, { mode: 'draft' }).ok, true);
  const first = validateGuidanceRecord(invalid[0], options);
  assert.deepEqual(first, validateGuidanceRecord(invalid[0], options));
  if (!first.ok) assert.equal(first.issues.some(i => i.message.includes('Edited after review')), false);
});

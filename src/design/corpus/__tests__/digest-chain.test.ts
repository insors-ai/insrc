/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordContentDigest, candidateContentDigest, reviewContentDigest, releaseContentDigest, hashBytes } from '../canonical.js';
import type { ReleaseManifest } from '../contracts.js';
import { recordFixture } from './fixtures.js';

function manifestFixture(): ReleaseManifest {
  return { schemaVersion: 1, releaseId: '0'.repeat(64), label: 'test', createdAt: '2026-10-11T00:00:00.000Z', maintainer: 'test',
    records: [{ recordId: 'test:overview', recordVersion: 'a'.repeat(64), path: 'records/overview.json', digest: 'b'.repeat(64) }],
    files: [{ path: 'records/overview.json', digest: 'b'.repeat(64), mediaType: 'application/json' },
      { path: 'coverage.json', digest: 'c'.repeat(64), mediaType: 'application/json' }],
    sourceManifestPath: 'sources.json', noticesPath: 'NOTICE.txt', coveragePath: 'coverage.json', reviewDigest: 'd'.repeat(64) };
}
test('digest chain excludes self fields and binds content and review separately', () => {
  const record = recordFixture(); const version = recordContentDigest(record);
  assert.equal(recordContentDigest({ ...record, recordVersion: version, review: { ...record.review, reviewer: 'reviewer' } }), version);
  assert.notEqual(recordContentDigest({ ...record, explanation: 'Changed' }), version);
  const manifest = manifestFixture(); const candidate = candidateContentDigest(manifest);
  const envelope = { candidateContentDigest: candidate, cells: [] };
  const reviewed = { ...manifest, reviewDigest: reviewContentDigest(envelope) };
  const release = releaseContentDigest(reviewed);
  assert.equal(releaseContentDigest({ ...reviewed, releaseId: release }), release);
  assert.equal(candidateContentDigest({ ...reviewed, files: [...reviewed.files].reverse() }), candidate);
  assert.equal(releaseContentDigest({ ...reviewed, files: [...reviewed.files].reverse() }), release);
  assert.notEqual(releaseContentDigest({ ...reviewed, reviewDigest: hashBytes('different review') }), release);
  assert.equal(candidateContentDigest({ ...manifest, files: manifest.files.map(f => f.path === 'coverage.json' ? { ...f, digest: 'e'.repeat(64) } : f) }), candidate);
  assert.notEqual(candidateContentDigest({ ...manifest, files: manifest.files.map(f => f.path !== 'coverage.json' ? { ...f, digest: 'e'.repeat(64) } : f) }), candidate);
});

test('candidate identity binds every non-cyclic manifest field without mutating input', () => {
  const original = manifestFixture(); const before = structuredClone(original);
  const digest = candidateContentDigest(original);
  const mutations: ((m: ReleaseManifest) => void)[] = [
    m => { m.label += ' changed'; }, m => { m.maintainer += ' changed'; },
    m => { m.createdAt = '2026-10-12T00:00:00.000Z'; },
    m => { m.sourceManifestPath = 'other-sources.json'; }, m => { m.noticesPath = 'other-notices.txt'; },
    m => { m.coveragePath = 'other-coverage.json'; m.files[1]!.path = m.coveragePath; },
    m => { m.records[0]!.recordId = 'test:other'; }, m => { m.records[0]!.recordVersion = 'e'.repeat(64); },
    m => { m.records[0]!.path = 'records/other.json'; }, m => { m.records[0]!.digest = 'e'.repeat(64); },
    m => { m.files[0]!.path = 'records/other.json'; }, m => { m.files[0]!.digest = 'e'.repeat(64); },
    m => { m.files[0]!.mediaType = 'text/plain'; }, m => { m.files[1]!.mediaType = 'text/plain'; },
  ];
  for (const mutate of mutations) { const changed = structuredClone(original); mutate(changed); assert.notEqual(candidateContentDigest(changed), digest); }
  // The schema currently admits only version 1; the hash must still bind the slot.
  assert.notEqual(candidateContentDigest({ ...original, schemaVersion: 2 } as unknown as ReleaseManifest), digest);
  for (const field of ['releaseId', 'reviewDigest'] as const) assert.equal(candidateContentDigest({ ...original, [field]: 'f'.repeat(64) }), digest);
  assert.deepEqual(original, before);
  const two = { ...original, records: [...original.records, { ...original.records[0]!, recordId: 'test:another' }] };
  assert.equal(candidateContentDigest(two), candidateContentDigest({ ...two, records: [...two.records].reverse(), files: [...two.files].reverse() }));
});

test('candidate identity is not computable for missing or duplicate coverage entries', () => {
  const manifest = manifestFixture();
  assert.equal(candidateContentDigest({ ...manifest, files: manifest.files.filter(f => f.path !== manifest.coveragePath) }), '');
  assert.equal(candidateContentDigest({ ...manifest, files: [...manifest.files, { ...manifest.files[1]! }] }), '');
});

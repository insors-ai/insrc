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

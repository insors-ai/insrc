import { candidateContentDigest, hashBytes, recordContentDigest, releaseContentDigest, reviewContentDigest } from '../canonical.js';
import type { GuidanceRecord, ReleaseManifest } from '../contracts.js';
import type { PackageFile, ReleaseCandidate } from '../validate.js';
import { recordFixture, sealRecord } from './fixtures.js';
export const bytes = (value: unknown): Uint8Array => Buffer.from(JSON.stringify(value));
export interface FixtureCandidate extends ReleaseCandidate { manifest: ReleaseManifest; files: PackageFile[]; }
/** Build test envelopes from original fixtures, with no external assets or policy claims. */
export function packageFixture(records: GuidanceRecord[] = [sealRecord(recordFixture())]): FixtureCandidate {
  const files: PackageFile[] = [
    { path: 'sources.json', kind: 'regular', bytes: bytes({ sources: [] }) },
    { path: 'NOTICE.txt', kind: 'regular', bytes: Buffer.from('Independently authored test data.') },
    { path: 'examples/good.json', kind: 'regular', bytes: bytes({ readingPosition: 'retained' }) },
    { path: 'examples/bad.json', kind: 'regular', bytes: bytes({ readingPosition: 'lost' }) },
    ...records.map((record, i) => ({ path: `records/${i}.json`, kind: 'regular' as const, bytes: bytes(record) })),
  ];
  const base: ReleaseManifest = { schemaVersion: 1, releaseId: '0'.repeat(64), label: 'Original test fixture', createdAt: '2026-10-11T00:00:00.000Z', maintainer: 'insrc tests',
    records: records.map((record, i) => ({ recordId: record.recordId, recordVersion: record.recordVersion, path: `records/${i}.json`, digest: hashBytes(bytes(record)) })),
    files: files.map(file => ({ path: file.path, digest: hashBytes(file.bytes), mediaType: file.path.endsWith('.json') ? 'application/json' : 'text/plain' })),
    sourceManifestPath: 'sources.json', noticesPath: 'NOTICE.txt', coveragePath: 'coverage.json', reviewDigest: '0'.repeat(64),
  };
  const envelope = { candidateContentDigest: candidateContentDigest(base), fixtureReview: 'complete' };
  const coverage = { path: 'coverage.json', kind: 'regular' as const, bytes: bytes(envelope) }; files.push(coverage);
  const reviewed = { ...base, files: [...base.files, { path: coverage.path, digest: hashBytes(coverage.bytes), mediaType: 'application/json' }], reviewDigest: reviewContentDigest(envelope) };
  return { manifest: { ...reviewed, releaseId: releaseContentDigest(reviewed) }, files };
}
export function relatedRecords(): GuidanceRecord[] {
  const target = sealRecord({ ...recordFixture(), recordId: 'test:target' });
  const source = sealRecord({ ...recordFixture(), relations: [{ kind: 'alternative', recordId: target.recordId, recordVersion: recordContentDigest(target) }] });
  return [source, target];
}

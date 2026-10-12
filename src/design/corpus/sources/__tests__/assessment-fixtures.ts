/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { hashBytes, candidateContentDigest, reviewContentDigest, releaseContentDigest, canonicalJson } from '../../canonical.js';
import { packageFixture } from '../../__tests__/package-fixtures.js';
import { recordFixture, sealRecord } from '../../__tests__/fixtures.js';
import { stageSources } from '../eligibility.js';
import { assembleSourceMetadata } from '../notices.js';
import { bindLineageToManifest } from '../lineage.js';
import type { Lineage } from '../contracts.js';
import type { EligibilityReview } from '../assessment.js';
import { sourceFixture } from './fixtures.js';
export function assessmentFixture(withSources = true) {
  const f = sourceFixture(), stage = stageSources(f.policy, f.request, f.blobs); if (!stage.ok) throw new Error('source fixture');
  const source = stage.value.admitted.find(s => s.source.path === 'good.txt')!;
  const record = sealRecord(withSources ? { ...recordFixture(), provenance: { authorship: 'derived', author: 'Fixture author',
    sourceRefs: [source.source.sourceId], modificationNotes: ['Converted original fixture guidance'] } } : recordFixture());
  const base = packageFixture([record]);
  const outputs = base.files.filter(file => !['sources.json', 'NOTICE.txt', 'coverage.json'].includes(file.path)).map(({ path, bytes }) => ({ path, bytes }));
  const lineage: Lineage = { schemaVersion: 1, bindings: [], originals: [] };
  for (const output of outputs) {
    if (withSources) lineage.bindings.push({ path: output.path, digest: hashBytes(output.bytes), authorship: 'derived', sourceIds: [source.source.sourceId],
      transformation: 'fixture-curation-v1', modifications: ['Converted original fixture guidance'], reviewedBy: 'Fixture reviewer' });
    else lineage.originals.push({ path: output.path, digest: hashBytes(output.bytes), authorship: 'original', author: record.provenance.author,
      rationale: output.path.startsWith('records/') ? record.rationale : 'Independently authored specimen fixture' });
  }
  const review: EligibilityReview = { policy: f.policy, imports: withSources ? [{ request: f.request, blobs: f.blobs }] : [], lineage };
  const metadata = assembleSourceMetadata(withSources ? [stage.value] : [], lineage, { policyVersion: f.policy.policyVersion, sourceManifestPath: base.manifest.sourceManifestPath, noticesPath: base.manifest.noticesPath });
  if (!metadata.ok) throw new Error('metadata fixture');
  const files = [...outputs, ...metadata.value.files];
  const bound = bindLineageToManifest(base.manifest, lineage); if (!bound.ok) throw new Error('lineage fixture');
  const manifest = { ...bound.value.manifest, files: [...files.map(file => ({ path: file.path, digest: hashBytes(file.bytes), mediaType: file.path.endsWith('.json') ? 'application/json' : 'text/plain' })),
    { path: 'coverage.json', digest: '0'.repeat(64), mediaType: 'application/json' }], releaseId: '0'.repeat(64), reviewDigest: '0'.repeat(64) };
  return { f, manifest, files, review, lineage };
}
export function finalizeFixture(candidate: ReturnType<typeof assessmentFixture>) {
  const envelope = { candidateContentDigest: candidateContentDigest(candidate.manifest), fixtureOnly: true };
  const coverage = { path: candidate.manifest.coveragePath, bytes: Buffer.from(canonicalJson(envelope)) };
  const manifest = { ...candidate.manifest, reviewDigest: reviewContentDigest(envelope),
    files: candidate.manifest.files.map(file => file.path === coverage.path ? { ...file, digest: hashBytes(coverage.bytes) } : file) };
  return { manifest: { ...manifest, releaseId: releaseContentDigest(manifest) }, files: [...candidate.files, coverage].map(file => ({ ...file, kind: 'regular' as const })) };
}

/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashBytes, candidateContentDigest } from '../../canonical.js';
import { checkPublication } from '../../validate.js';
import { assessEligibility, prepareEligibilityCandidate } from '../assessment.js';
import { assessmentFixture, finalizeFixture } from './assessment-fixtures.js';
function passed(f: ReturnType<typeof assessmentFixture>) { const result = assessEligibility(f.manifest, f.files, f.review); return result.ok && result.value.passed; }
function resealFile(f: ReturnType<typeof assessmentFixture>, path: string, bytes: Uint8Array) {
  f.files.find(file => file.path === path)!.bytes = bytes;
  f.manifest.files.find(file => file.path === path)!.digest = hashBytes(bytes);
}
test('eligibility-binding reconstructs obligations and rejects modified candidate metadata', () => {
  assert.equal(passed(assessmentFixture()), true);
  for (const path of ['sources.json', 'NOTICE.txt', 'sources/lineage.json']) {
    const f = assessmentFixture(); resealFile(f, path, Buffer.from('{}')); assert.equal(passed(f), false, path);
  }
  const f = assessmentFixture(); const metadata = JSON.parse(Buffer.from(f.files.find(file => file.path === 'sources.json')!.bytes).toString());
  metadata.files[0].attribution = ['Omitted real contributor']; resealFile(f, 'sources.json', Buffer.from(JSON.stringify(metadata)));
  assert.equal(passed(f), false);
  const omitted = assessmentFixture(); const evidence = omitted.files.find(file => file.path.startsWith('sources/evidence/'))!;
  omitted.files = omitted.files.filter(file => file !== evidence); omitted.manifest.files = omitted.manifest.files.filter(file => file.path !== evidence.path);
  assert.equal(passed(omitted), false);
});
test('eligibility-binding rejects role swaps stale profiles and changed output evidence', () => {
  const swapped = assessmentFixture(); [swapped.manifest.sourceManifestPath, swapped.manifest.noticesPath] = [swapped.manifest.noticesPath, swapped.manifest.sourceManifestPath]; assert.equal(passed(swapped), false);
  const stale = assessmentFixture(); stale.f.policy.profiles[0]!.digest = 'f'.repeat(64); assert.equal(passed(stale), false);
  for (const select of [(path: string) => path === 'examples/good.json', (path: string) => path.startsWith('sources/evidence/')]) {
    const f = assessmentFixture(); const output = f.files.find(file => select(file.path))!;
    resealFile(f, output.path, Buffer.from('Tampered but resealed')); assert.equal(passed(f), false);
  }
  const malformed = assessmentFixture(); const result = assessEligibility(malformed.manifest, malformed.files, { ...malformed.review, policy: {} });
  assert.equal(result.ok && result.value.passed, false);
});
test('acyclic-staging assesses before coverage finalization and rejects missing or duplicate coverage', () => {
  const f = assessmentFixture();
  const outputPaths = new Set([...f.lineage.bindings, ...f.lineage.originals].map(binding => binding.path));
  const prepared = prepareEligibilityCandidate(f.manifest, f.files.filter(file => outputPaths.has(file.path)), f.review);
  assert.equal(prepared.ok, true); if (prepared.ok) assert.equal(prepared.value.assessment.passed, true);
  assert.equal(f.files.some(file => file.path === f.manifest.coveragePath), false);
  const result = assessEligibility(f.manifest, f.files, f.review); assert.equal(result.ok && result.value.passed, true); if (!result.ok) return;
  const final = finalizeFixture(f); assert.equal(candidateContentDigest(final.manifest), result.value.candidateContentDigest);
  assert.equal(checkPublication(final, [result.value, { ...result.value, stage: 'coverage' }]).eligible, true);
  for (const duplicate of [false, true]) {
    const bad = assessmentFixture(); const entry = bad.manifest.files.find(file => file.path === bad.manifest.coveragePath)!;
    if (duplicate) bad.manifest.files.push({ ...entry }); else bad.manifest.files = bad.manifest.files.filter(file => file !== entry);
    const failure = assessEligibility(bad.manifest, bad.files, bad.review); assert.equal(failure.ok, false);
    assert.equal('value' in failure, false);
  }
  const original = assessmentFixture(false); assert.equal(passed(original), true);
});

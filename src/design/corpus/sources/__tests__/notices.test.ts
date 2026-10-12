/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashBytes } from '../../canonical.js';
import { stageSources, evidencePath } from '../eligibility.js';
import { assembleSourceMetadata } from '../notices.js';
import { sourceFixture } from './fixtures.js';
const emptyLineage = { schemaVersion: 1, bindings: [], originals: [] };
const options = { policyVersion: 'fixture-v1', sourceManifestPath: 'sources.json', noticesPath: 'NOTICE.txt' };
function fixture() { const f = sourceFixture(); const stage = stageSources(f.policy, f.request, f.blobs); assert.equal(stage.ok, true); if (!stage.ok) throw new Error('fixture'); return { f, stage: stage.value }; }
test('notice-closure preserves exact evidence bytes and all source obligations', () => {
  const f = sourceFixture();
  const license = new Uint8Array(Buffer.from('\ufeffSynthetic license\r\n'));
  f.blobs.find(blob => blob.path === 'LICENSE')!.bytes = license;
  for (const profile of f.policy.profiles) profile.licenseEvidence[0]!.digest = hashBytes(license);
  f.policy.profiles.find(profile => profile.path === 'LICENSE')!.digest = hashBytes(license);
  const noticeBytes = new Uint8Array(Buffer.from('Original fixture notice\r\n'));
  const noticeProfile = { ...structuredClone(f.policy.profiles[0]!), path: 'UPSTREAM-NOTICE', digest: hashBytes(noticeBytes) };
  f.policy.profiles.push(noticeProfile); f.blobs.push({ path: noticeProfile.path, bytes: noticeBytes });
  f.policy.profiles[0]!.noticeEvidence = [{ path: noticeProfile.path, digest: noticeProfile.digest }];
  f.policy.profiles[0]!.attribution.push('Second fixture author'); f.policy.profiles[0]!.modifications = ['Retained upstream modification'];
  const staged = stageSources(f.policy, f.request, f.blobs); assert.equal(staged.ok, true); if (!staged.ok) return;
  const stage = staged.value; const result = assembleSourceMetadata([stage], emptyLineage, options); assert.equal(result.ok, true); if (!result.ok) return;
  assert.equal(result.value.sourceManifest.files.length, 3);
  for (const entry of result.value.notice.sources) {
    const profile = f.policy.profiles.find(p => p.path === entry.source.path)!;
    assert.equal(entry.source.repositoryUrl, profile.repositoryUrl); assert.equal(entry.source.revision, profile.revision);
    assert.equal(entry.source.digest, profile.digest); assert.deepEqual(entry.source.attribution, profile.attribution);
    assert.deepEqual(entry.source.modifications, profile.modifications); assert.deepEqual(entry.source.licenseIds, profile.licenseIds);
    assert.deepEqual(entry.conditions, profile.conditions); assert.equal(entry.modificationNoticeRequired, profile.modificationNoticeRequired);
    for (const ref of entry.source.licenseTextRefs) {
      const evidence = result.value.files.find(file => file.path === ref)!;
      assert.deepEqual(evidence.bytes, f.blobs.find(blob => blob.path === 'LICENSE')!.bytes);
    }
    for (const ref of entry.source.noticeRefs) {
      assert.deepEqual(result.value.files.find(file => file.path === ref)!.bytes, noticeBytes);
    }
  }
  const bad = structuredClone(stage); bad.admitted.find(a => a.source.path === 'LICENSE')!.bytes[0] = 0;
  assert.equal(assembleSourceMetadata([bad], emptyLineage, options).ok, false);
  assert.equal(result.value.sourceManifest.files.some(file => file.path === 'unknown.txt' || file.path === 'excluded.txt'), false);
});
test('notice-closure deduplicates shared evidence without losing attribution', () => {
  const { stage } = fixture();
  const result = assembleSourceMetadata([stage, structuredClone(stage)], emptyLineage, options); assert.equal(result.ok, true); if (!result.ok) return;
  const evidence = result.value.files.filter(file => file.path.startsWith('sources/evidence/')); assert.equal(evidence.length, 1);
  assert.equal(result.value.notice.sources.length, 2);
  assert.ok(result.value.notice.sources.every(entry => entry.source.licenseTextRefs.includes(evidence[0]!.path)));
  assert.equal(evidence[0]!.path, evidencePath(hashBytes(evidence[0]!.bytes)));
  const reordered = { ...stage, admitted: [...stage.admitted].reverse() };
  assert.deepEqual(assembleSourceMetadata([reordered], emptyLineage, options), result);
});
test('notice-closure produces stable expected bytes and rejects invalid evidence text', () => {
  const malformed = fixture().stage;
  malformed.admitted[0]!.profile.licenseEvidence[0]!.path = '../invalid';
  assert.equal(assembleSourceMetadata([malformed], emptyLineage, options).ok, false);
  const original = assembleSourceMetadata([], emptyLineage, { ...options, policyVersion: 'original-v1' }); assert.equal(original.ok, true); if (!original.ok) return;
  // Independently specified fixture, not computed by the formatter under test.
  const expected = 'insrc-design-notices-v1\n{"lineage":{"bindings":[],"originals":[],"schemaVersion":1},"policyVersion":"original-v1","schemaVersion":1,"sources":[]}\n';
  assert.equal(Buffer.from(original.value.files.find(file => file.path === 'NOTICE.txt')!.bytes).toString('utf8'), expected);
  const f = sourceFixture(), invalid = Uint8Array.from([255, 254]);
  f.blobs.find(blob => blob.path === 'LICENSE')!.bytes = invalid;
  f.policy.profiles.find(profile => profile.path === 'LICENSE')!.digest = hashBytes(invalid);
  for (const profile of f.policy.profiles) profile.licenseEvidence[0]!.digest = hashBytes(invalid);
  const stage = stageSources(f.policy, f.request, f.blobs); assert.equal(stage.ok, true);
  if (stage.ok) assert.equal(assembleSourceMetadata([stage.value], emptyLineage, options).ok, false);
});

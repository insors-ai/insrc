/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashBytes } from '../../canonical.js';
import { decodeSourceManifest } from '../contracts.js';
import { stageSources } from '../eligibility.js';
import { sourceFixture, makeBytes } from './fixtures.js';

test('mixed-eligibility admits only reviewed exact-file profiles with complete evidence', () => {
  const f = sourceFixture(), input = structuredClone(f); const result = stageSources(f.policy, f.request, f.blobs);
  assert.equal(result.ok, true); if (!result.ok) return;
  assert.deepEqual(result.value.report, { admitted: ['good.txt'], excluded: [{ path: 'excluded.txt', reason: 'Synthetic fixture decision' }], unresolved: ['unknown.txt'] });
  assert.deepEqual(result.value.admitted.map(s => s.source.path), ['LICENSE', 'good.txt']);
  assert.equal(decodeSourceManifest({ schemaVersion: 1, policyVersion: result.value.policyVersion, files: result.value.admitted.map(s => s.source) }).ok, true);
  assert.deepEqual(f, input); result.value.admitted[0]!.bytes.fill(0); assert.deepEqual(f, input);
  assert.equal(stageSources(f.policy, f.request, [...f.blobs, f.blobs[0]]).ok, false);
  assert.equal(stageSources(f.policy, { ...f.request, paths: ['bad%path'] }, []).ok, false);
  assert.equal(stageSources(f.policy, f.request, f.blobs.slice(1)).ok, false);
  const absentReview = structuredClone(f); absentReview.policy.profiles[0]!.reviewedBy = '';
  const absent = stageSources(absentReview.policy, absentReview.request, absentReview.blobs);
  assert.equal(absent.ok && absent.value.report.unresolved.includes('good.txt'), true);
  const blocked = stageSources({ ...f.policy, repositories: [] }, f.request, f.blobs);
  assert.equal(blocked.ok && blocked.value.report.excluded.length, 3);
  assert.equal(blocked.ok && blocked.value.admitted.length, 0);
  let reads = 0; assert.equal(stageSources(f.policy, f.request, [{ path: 'good.txt', get bytes() { reads++; return makeBytes('bad'); } }]).ok, false); assert.equal(reads, 0);
});
test('mixed-eligibility propagates stale evidence without rejecting independent eligible files', () => {
  const f = sourceFixture();
  const independent = structuredClone(f.policy.profiles[0]!);
  independent.path = 'independent.txt'; independent.digest = hashBytes('Independent fixture');
  independent.licenseEvidence = [{ path: 'LICENSE2', digest: hashBytes('Second synthetic license') }];
  const license = { ...structuredClone(independent), path: 'LICENSE2', digest: hashBytes('Second synthetic license') };
  f.policy.profiles.push(independent, license); f.request.paths.push(independent.path);
  f.blobs.push({ path: independent.path, bytes: makeBytes('Independent fixture') }, { path: 'LICENSE2', bytes: makeBytes('Second synthetic license') });
  const staleFile = structuredClone(f); staleFile.blobs.find(b => b.path === 'good.txt')!.bytes = makeBytes('Changed file');
  const r1 = stageSources(staleFile.policy, staleFile.request, staleFile.blobs);
  assert.equal(r1.ok && r1.value.report.unresolved.includes('good.txt'), true);
  f.blobs.find(b => b.path === 'LICENSE')!.bytes = makeBytes('Changed evidence');
  const r2 = stageSources(f.policy, f.request, f.blobs); assert.equal(r2.ok, true); if (!r2.ok) return;
  assert.deepEqual(r2.value.report.admitted, ['independent.txt']);
  assert.deepEqual(r2.value.admitted.map(a => a.source.path), ['LICENSE2', 'independent.txt']);
  const reordered = stageSources({ ...f.policy, profiles: [...f.policy.profiles].reverse() }, { ...f.request, paths: [...f.request.paths].reverse() }, [...f.blobs].reverse());
  assert.deepEqual(reordered, r2);
});
test('mixed-eligibility requires explicit font and compound-license decisions', () => {
  for (const category of ['font', 'compound']) {
    const f = sourceFixture(); const profile = f.policy.profiles[0]!;
    profile.category = category; profile.licenseIds = category === 'font' ? ['OFL-1.1'] : ['MIT OR Apache-2.0'];
    const absent = stageSources(f.policy, f.request, f.blobs); assert.equal(absent.ok && absent.value.report.unresolved.includes('good.txt'), true);
    f.policy.categories.push({ id: category, licenseIds: [...profile.licenseIds], conditions: ['Explicit redistribution conditions'], reviewedBy: 'Category reviewer' });
    profile.conditions.push('Explicit redistribution conditions'); profile.termsResolved = false;
    const unknown = stageSources(f.policy, f.request, f.blobs); assert.equal(unknown.ok && unknown.value.report.unresolved.includes('good.txt'), true);
    profile.termsResolved = true;
    const resolved = stageSources(f.policy, f.request, f.blobs); assert.equal(resolved.ok && resolved.value.report.admitted.includes('good.txt'), true);
  }
});

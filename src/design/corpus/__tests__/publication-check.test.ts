/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateContentDigest, checkPublication, releaseContentDigest, sortIssues } from '../index.js';
import type { StageAssessment } from '../index.js';
import { packageFixture } from './package-fixtures.js';

test('publication requires exactly one successful current assessment per downstream stage', () => {
  const candidate = packageFixture();
  const digest = candidateContentDigest(candidate.manifest);
  const good: StageAssessment[] = ['eligibility', 'coverage'].map(stage => ({ stage: stage as StageAssessment['stage'], candidateContentDigest: digest, passed: true, issues: [] }));
  assert.deepEqual(checkPublication(candidate, good), { eligible: true, issues: [], manifestDigest: candidate.manifest.releaseId });
  const bad = [[], [good[0]], [...good, good[0]], good.map(a => ({ ...a, passed: false })), good.map(a => ({ ...a, candidateContentDigest: 'f'.repeat(64) })),
    good.map(a => ({ ...a, issues: [{ code: 'domain.invalid', path: '/coverage/cells', message: 'Coverage gap.' }] })), [{ stage: 'unknown' }], null];
  for (const assessments of bad) {
    const result = checkPublication(candidate, assessments); assert.equal(result.eligible, false);
    assert.ok(result.issues.length); assert.equal(result.manifestDigest, candidate.manifest.releaseId);
  }
});
test('publication preserves deterministic diagnostics and reports only computable manifest identity', () => {
  const candidate = packageFixture();
  const diagnostic = { code: 'domain.invalid' as const, path: '/coverage/cells/0', message: 'Coverage gap.' };
  const assessments: StageAssessment[] = [{ stage: 'coverage', passed: false, candidateContentDigest: candidateContentDigest(candidate.manifest), issues: [diagnostic] }];
  const result = checkPublication(candidate, assessments);
  assert.ok(result.issues.some(i => i.code === diagnostic.code && i.path === diagnostic.path && i.message === diagnostic.message));
  assert.deepEqual(result.issues, sortIssues(result.issues));
  assert.deepEqual(result, checkPublication(candidate, assessments));
  const stale = { ...candidate, manifest: { ...candidate.manifest, releaseId: 'f'.repeat(64) } };
  assert.equal(checkPublication(stale, assessments).manifestDigest, releaseContentDigest(stale.manifest));
  assert.equal(checkPublication({ manifest: null, files: [] }, assessments).manifestDigest, '');
  assert.equal(checkPublication({ ...candidate, files: [] }, assessments).manifestDigest, candidate.manifest.releaseId);
  let calls = 0;
  const accessors = [{ get stage() { calls++; return 'eligibility'; } }];
  assert.equal(checkPublication(candidate, accessors).eligible, false); assert.equal(calls, 0);
});

test('role reassignment and metadata changes invalidate previously successful assessments', () => {
  const original = packageFixture();
  const assessments = ['eligibility', 'coverage'].map(stage => ({ stage, candidateContentDigest: candidateContentDigest(original.manifest), passed: true, issues: [] }));
  assert.equal(checkPublication(original, assessments).eligible, true);
  const changes = [
    { sourceManifestPath: original.manifest.noticesPath, noticesPath: original.manifest.sourceManifestPath },
    { maintainer: 'another maintainer' }, { label: 'another release' }, { createdAt: '2026-10-12T00:00:00.000Z' },
    { files: original.manifest.files.map(f => ({ ...f, mediaType: 'text/plain' })) },
    { records: original.manifest.records.map(r => ({ ...r, path: 'records/changed.json' })) },
  ];
  for (const change of changes) {
    const manifest = { ...original.manifest, ...change };
    manifest.releaseId = releaseContentDigest(manifest);
    const result = checkPublication({ ...original, manifest }, assessments);
    assert.equal(result.eligible, false);
    assert.equal(result.issues.filter(i => i.code === 'assessment.stale').length, 2);
    assert.ok(result.issues.some(i => i.code === 'review.stale'));
    assert.equal(result.manifestDigest, manifest.releaseId);
  }
});

test('noncomputable coverage membership makes every assessment stale but preserves manifest identity', () => {
  for (const duplicate of [false, true]) {
    const candidate = packageFixture();
    const digest = candidateContentDigest(candidate.manifest);
    const assessments = ['eligibility', 'coverage'].map(stage => ({ stage, candidateContentDigest: digest, passed: true, issues: [] }));
    const coverage = candidate.manifest.files.find(f => f.path === candidate.manifest.coveragePath)!;
    candidate.manifest.files = duplicate ? [...candidate.manifest.files, { ...coverage }] : candidate.manifest.files.filter(f => f.path !== coverage.path);
    candidate.manifest.releaseId = releaseContentDigest(candidate.manifest);
    assert.equal(candidateContentDigest(candidate.manifest), '');
    const result = checkPublication(candidate, assessments);
    assert.equal(result.eligible, false); assert.equal(result.manifestDigest, candidate.manifest.releaseId);
    assert.equal(result.issues.filter(i => i.code === 'assessment.stale').length, assessments.length);
    assert.ok(result.issues.some(i => duplicate ? i.code === 'inventory.invalid' : i.code === 'reference.missing'));
  }
});

test('invalid release fallback hashes a detached manifest without live property reads', () => {
  const candidate = packageFixture(); let reads = 0;
  const manifest = new Proxy(candidate.manifest, { get() { reads++; throw new Error('Live manifest read'); } });
  const result = checkPublication({ ...candidate, manifest, files: [] }, []);
  assert.equal(result.eligible, false); assert.equal(result.manifestDigest, candidate.manifest.releaseId); assert.equal(reads, 0);
});

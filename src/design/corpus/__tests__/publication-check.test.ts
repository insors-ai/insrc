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

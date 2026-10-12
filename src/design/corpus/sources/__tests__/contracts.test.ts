/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeSourceManifest, decodeSourcePolicy, decodeImportReport, decodeLineage } from '../contracts.js';
import { isCanonicalRepositoryUrl, isPortablePath, isUtcDate, pathCollisionKey, sourceIdentity } from '../validation-primitives.js';
import { validateGuidanceRecord, validateRelease } from '../../validate.js';
import { packageFixture } from '../../__tests__/package-fixtures.js';
import { recordFixture, sealRecord } from '../../__tests__/fixtures.js';

const url = 'https://example.org/authored-fixtures', revision = 'a'.repeat(40), digest = 'b'.repeat(64);
const file = () => ({ sourceId: sourceIdentity(url, revision, 'file.txt'), repositoryUrl: url, revision, path: 'file.txt', digest,
  licenseIds: ['MIT'], licenseTextRefs: ['evidence/license.txt'], noticeRefs: [], attribution: ['Fixture author'], modifications: [],
  retrievedAt: '2026-10-12T00:00:00Z', eligibility: 'eligible', eligibilityReason: 'Synthetic reviewed fixture', reviewedBy: 'Reviewer' });
test('source-schema preserves exact sc3 shapes and rejects invalid identities and fields', () => {
  assert.equal(isCanonicalRepositoryUrl('ssh://example.org/repository'), true);
  for (const invalid of ['https://user:secret@example.org/repo', 'ssh://git@example.org/repo', 'https://example.org/repo?q=x',
    'https://example.org/repo#ref', 'https://example.org/re%70o']) assert.equal(isCanonicalRepositoryUrl(invalid), false);
  const input = { schemaVersion: 1, policyVersion: 'test-v1', files: [file()] };
  const decoded = decodeSourceManifest(input); assert.equal(decoded.ok, true);
  if (decoded.ok) { assert.deepEqual(decoded.value, input); assert.notEqual(decoded.value, input); }
  for (const patch of [{ revision: 'a'.repeat(7) }, { revision: 'A'.repeat(40) }, { digest: 'b'.repeat(63) },
    { sourceId: 'source:' + 'c'.repeat(64) }, { path: '../bad' }, { repositoryUrl: url + '/' },
    { licenseTextRefs: ['https://remote/license'] }, { retrievedAt: '2026-02-30T00:00:00Z' }, { reviewedBy: '' },
    { extra: true }, { eligibility: true }]) {
    assert.equal(decodeSourceManifest({ ...input, files: [{ ...file(), ...patch }] }).ok, false, JSON.stringify(patch));
  }
  assert.equal(decodeSourceManifest({ ...input, files: [file(), file()] }).ok, false);
  assert.equal(decodeSourceManifest({ ...input, schemaVersion: '1' }).ok, false);
  let reads = 0;
  assert.equal(decodeSourceManifest({ get files() { reads++; return []; } }).ok, false); assert.equal(reads, 0);
  assert.equal(decodeImportReport({ admitted: ['x'], excluded: [], unresolved: [] }).ok, true);
  assert.equal(decodeImportReport({ admitted: ['x'], excluded: [], unresolved: ['X'] }).ok, false);
  const profile = { repositoryUrl: url, revision, path: 'file.txt', digest, category: 'code', decision: 'eligible', reason: 'Reviewed',
    reviewedBy: 'Reviewer', termsResolved: true, licenseIds: ['MIT'], licenseEvidence: [{ path: 'LICENSE', digest }], noticeEvidence: [],
    attribution: ['Author'], modifications: [], conditions: ['Retain license'], modificationNoticeRequired: false };
  const policy = { schemaVersion: 1, policyVersion: 'test-v1', repositories: [url], categories: [{ id: 'code', licenseIds: ['MIT'], conditions: ['Retain license'], reviewedBy: 'Reviewer' }], profiles: [profile] };
  assert.equal(decodeSourcePolicy(policy).ok, true);
  assert.equal(decodeSourcePolicy({ ...policy, profiles: [{ ...profile, decision: 'auto' }] }).ok, false);
  assert.equal(decodeSourcePolicy({ ...policy, profiles: [profile, profile] }).ok, false);
  const lineage = { schemaVersion: 1, bindings: [], originals: [{ path: 'output', digest, authorship: 'original', author: 'Fixture author', rationale: 'Authored here' }] };
  assert.equal(decodeLineage(lineage).ok, true);
  assert.equal(decodeLineage({ ...lineage, candidateContentDigest: digest }).ok, false);
  assert.equal(sourceIdentity(url, revision, 'file.txt'), file().sourceId);
  assert.notEqual(sourceIdentity(url, revision, 'other.txt'), file().sourceId);
  assert.equal(sourceIdentity(url, 'a'.repeat(64), 'file.txt').length, 71);
});
test('validation-parity matches S001 path collision and UTC timestamp behavior', () => {
  for (const date of ['2024-02-29T00:00:00Z', '2023-02-29T00:00:00Z', '2026-02-30T00:00:00Z',
    '2026-10-12T00:00:00.123Z', '2026-10-12T00:00:00.12Z', '2026-10-12T00:00:00+00:00', '2026-13-01T00:00:00Z']) {
    const base = sealRecord(recordFixture()); const result = validateGuidanceRecord({ ...base, review: { ...base.review, reviewedAt: date } }, { mode: 'publication' });
    const accepted = result.ok || !result.issues.some(i => i.code === 'review.required');
    assert.equal(isUtcDate(date), accepted, date);
  }
  for (const [a, b] of [['café', 'cafe\u0301'], ['A', 'a'], ['A', 'b']]) {
    const candidate = packageFixture();
    candidate.files.push({ path: a!, kind: 'regular', bytes: new Uint8Array() }, { path: b!, kind: 'regular', bytes: new Uint8Array() });
    const result = validateRelease(candidate);
    assert.equal(!result.ok && result.issues.some(i => i.code === 'inventory.invalid' && i.message.includes('case collisions')), pathCollisionKey(a!) === pathCollisionKey(b!));
  }
  for (const path of ['ok/path', 'bad\u0001', 'bad\u0085', '../bad', 'a:b', '%20', '/bad', 'a\\b']) {
    const candidate = packageFixture(); candidate.files.push({ path, kind: 'regular', bytes: new Uint8Array() });
    const result = validateRelease(candidate);
    assert.equal(!result.ok && result.issues.some(i => i.code === 'path.invalid' && i.path.startsWith('/files/')), !isPortablePath(path), path);
  }
});

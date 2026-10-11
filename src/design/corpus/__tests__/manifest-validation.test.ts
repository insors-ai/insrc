/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CORPUS_LIMITS, hashBytes, releaseContentDigest, reviewContentDigest } from '../canonical.js';
import { isPortablePath, validateRelease } from '../validate.js';
import { packageFixture, relatedRecords, bytes } from './package-fixtures.js';
import { recordFixture, sealRecord } from './fixtures.js';
import type { ValidationIssue } from '../contracts.js';
function fails(value: unknown, code?: ValidationIssue['code']): void {
  const result = validateRelease(value); assert.equal(result.ok, false);
  if (!result.ok && code) assert.ok(result.issues.some(issue => issue.code === code), JSON.stringify(result.issues));
}
test('manifest requires exact inventory portable paths and regular files', () => {
  const valid = packageFixture(); assert.equal(validateRelease(valid).ok, true);
  const before = structuredClone(valid); validateRelease(valid); assert.deepEqual(structuredClone(valid), before);
  fails({ ...valid, files: valid.files.slice(1) }, 'reference.missing');
  fails({ ...valid, files: [...valid.files, { path: 'extra', kind: 'regular', bytes: bytes({}) }] }, 'inventory.invalid');
  fails({ ...valid, files: [...valid.files, valid.files[0]] }, 'inventory.invalid');
  fails({ ...valid, files: [...valid.files, { ...valid.files[0], path: 'SOURCES.json' }] }, 'inventory.invalid');
  for (const kind of ['symlink', 'directory', 'other']) fails({ ...valid, files: valid.files.map((file, i) => i === 0 ? { ...file, kind } : file) }, 'inventory.invalid');
  for (const path of ['', '/absolute', '../escape', 'a/./b', 'a//b', 'C:/path', 'a\\b', 'a%2fb', 'a\0b', 'a\nb']) {
    assert.equal(isPortablePath(path), false);
    fails({ ...valid, files: [...valid.files, { path, kind: 'regular', bytes: bytes({}) }] }, 'path.invalid');
  }
  fails({ ...valid, files: [...valid.files, { path: 'manifest.json', kind: 'regular', bytes: bytes(valid.manifest) }] }, 'inventory.invalid');
  fails({ ...valid, manifest: { ...valid.manifest, files: [...valid.manifest.files, valid.manifest.files[0]] } }, 'inventory.invalid');
  fails({ ...valid, manifest: { ...valid.manifest, records: [...valid.manifest.records, valid.manifest.records[0]] } }, 'inventory.invalid');
  fails({ ...valid, manifest: { ...valid.manifest, sourceManifestPath: 'missing.json' } }, 'reference.missing');
});
test('manifest validates exact record references and rejects duplicate self and cyclic relations', () => {
  assert.equal(validateRelease(packageFixture(relatedRecords())).ok, true);
  const [source, target] = relatedRecords(); assert.ok(source && target);
  fails(packageFixture([sealRecord({ ...source, relations: [{ kind: 'alternative', recordId: target.recordId, recordVersion: 'f'.repeat(64) }] }), target]), 'reference.missing');
  fails(packageFixture([source]), 'reference.missing');
  fails(packageFixture([sealRecord({ ...source, relations: [...source.relations, ...source.relations] }), target]), 'inventory.invalid');
  fails(packageFixture([sealRecord({ ...source, relations: [{ kind: 'alternative', recordId: source.recordId, recordVersion: source.recordVersion }] })]), 'reference.cycle');
  // Cyclic content hashes cannot be sealed simultaneously: report cycle alongside stale digest/reference errors.
  const cycleTarget = sealRecord({ ...target, relations: [{ kind: 'alternative', recordId: source.recordId, recordVersion: source.recordVersion }] });
  fails(packageFixture([source, cycleTarget]), 'reference.cycle');
  const valid = packageFixture();
  fails({ ...valid, manifest: { ...valid.manifest, records: valid.manifest.records.map(r => ({ ...r, recordId: 'test:wrong' })) } }, 'digest.mismatch');
});
test('manifest detects tampering across raw record candidate review and release hashes', () => {
  const valid = packageFixture();
  fails({ ...valid, files: valid.files.map((f, i) => i === 0 ? { ...f, bytes: bytes({ changed: true }) } : f) }, 'digest.mismatch');
  fails(packageFixture([{ ...sealRecord(recordFixture()), rationale: 'Tampered' }]), 'review.stale');
  fails({ ...valid, manifest: { ...valid.manifest, releaseId: 'f'.repeat(64) } }, 'digest.mismatch');
  fails({ ...valid, manifest: { ...valid.manifest, reviewDigest: 'f'.repeat(64) } }, 'digest.mismatch');
  for (const envelope of [{ candidateContentDigest: 'f'.repeat(64) }, { candidateContentDigest: 'f'.repeat(64), nested: { releaseId: valid.manifest.releaseId } }]) {
    const payload = bytes(envelope);
    const reviewed = { ...valid.manifest, reviewDigest: reviewContentDigest(envelope), files: valid.manifest.files.map(f => f.path === 'coverage.json' ? { ...f, digest: hashBytes(payload) } : f) };
    const changed = { manifest: { ...reviewed, releaseId: releaseContentDigest(reviewed) }, files: valid.files.map(f => f.path === 'coverage.json' ? { ...f, bytes: payload } : f) };
    fails(changed, 'review.stale');
    if ('nested' in envelope) fails(changed, 'inventory.invalid');
  }
  fails({ ...valid, files: valid.files.map(f => f.path === 'records/0.json' ? { ...f, bytes: new Uint8Array([0xff]) } : f) }, 'schema.invalid');
});
test('manifest format limits and accessor boundaries fail explicitly', () => {
  const valid = packageFixture();
  fails({ ...valid, files: Array(CORPUS_LIMITS.files + 1).fill(valid.files[0]) }, 'limit.exceeded');
  fails({ ...valid, files: [{ ...valid.files[0], bytes: new Uint8Array(CORPUS_LIMITS.packageBytes) }] }, 'limit.exceeded');
  fails({ ...valid, files: valid.files.map(f => f.path === 'records/0.json' ? { ...f, bytes: new Uint8Array(CORPUS_LIMITS.recordBytes + 1) } : f) }, 'limit.exceeded');
  let calls = 0;
  fails({ get manifest() { calls++; return valid.manifest; }, files: valid.files }, 'schema.invalid');
  const files = [...valid.files]; Object.defineProperty(files, '0', { get() { calls++; return valid.files[0]; } });
  fails({ ...valid, files }, 'inventory.invalid'); assert.equal(calls, 0);
});

test('manifest overrides and diagnostic pointers identify actual candidate fields', () => {
  const valid = packageFixture();
  assert.equal(validateRelease({ ...valid, manifestPath: 'release/custom.json' }).ok, true);
  fails({ ...valid, manifestPath: '../invalid.json' }, 'path.invalid');
  fails({ ...valid, manifestPath: 'sources.json' }, 'inventory.invalid');
  const changed = { ...valid, files: [...valid.files, { path: 'extra.json', kind: 'regular', bytes: bytes({}) }],
    manifest: { ...valid.manifest, files: valid.manifest.files.map((f, i) => i === 0 ? { ...f, digest: 'f'.repeat(64) } : f) } };
  const result = validateRelease(changed); assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some(i => i.path === '/manifest/files/0/digest'));
    assert.ok(result.issues.some(i => i.path === `/files/${valid.files.length}`));
    for (const issue of result.issues) {
      let target: unknown = changed;
      for (const part of issue.path.split('/').slice(1)) target = (target as Record<string, unknown>)[part.replaceAll('~1', '/').replaceAll('~0', '~')];
      assert.notEqual(target, undefined, issue.path);
    }
  }
});

test('specimens cannot reference metadata records or unbound coverage bytes', () => {
  for (const contentRef of ['coverage.json', 'sources.json', 'NOTICE.txt', 'records/0.json']) {
    const source = recordFixture();
    const record = sealRecord({ ...source, examples: source.examples.map(example => ({ ...example, contentRef })) });
    fails(packageFixture([record]), 'reference.missing');
  }
});
test('coverage decode errors and Unicode-equivalent inventory paths are rejected', () => {
  const valid = packageFixture();
  for (const payload of [new Uint8Array([0xff]), Buffer.from('{invalid JSON')]) {
    fails({ ...valid, files: valid.files.map(file => file.path === 'coverage.json' ? { ...file, bytes: payload } : file) }, 'schema.invalid');
  }
  fails({ ...valid, files: [...valid.files,
    { path: 'examples/\u00e9.json', kind: 'regular', bytes: bytes({}) },
    { path: 'examples/e\u0301.json', kind: 'regular', bytes: bytes({}) },
  ] }, 'inventory.invalid');
});

test('release validation snapshots manifest and bytes and rejects C1 controls', () => {
  const candidate = packageFixture(); let reads = 0;
  const proxy = new Proxy(candidate.manifest, { get() { reads++; throw new Error('Live manifest read'); } });
  const bytes = candidate.files[0]!.bytes;
  Object.defineProperty(bytes, 'byteLength', { get() { reads++; throw new Error('Custom byte length'); } });
  const result = validateRelease({ ...candidate, manifest: proxy });
  assert.equal(result.ok, true); assert.equal(reads, 0);
  if (result.ok) {
    candidate.manifest.records[0]!.path = 'mutated.json';
    assert.notEqual(result.value.manifest.records[0]!.path, candidate.manifest.records[0]!.path);
  }
  assert.equal(isPortablePath('examples/\u0085.json'), false);
});

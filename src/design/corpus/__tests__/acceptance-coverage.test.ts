/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPublication, decodeEvidenceRef, candidateContentDigest, recordContentDigest, reviewContentDigest, releaseContentDigest, validateRelease } from '../index.js';
import { recordFixture, sealRecord } from './fixtures.js';
import { packageFixture, relatedRecords } from './package-fixtures.js';

test('ac1 incomplete or stale guidance cannot pass the record to manifest preflight', () => {
  for (const kind of ['foundation', 'pattern', 'style-recipe'] as const) {
    const record = sealRecord(recordFixture(kind));
    const candidate = packageFixture([record]);
    const assessments = ['eligibility', 'coverage'].map(stage => ({ stage, candidateContentDigest: candidateContentDigest(candidate.manifest), passed: true, issues: [] }));
    assert.equal(checkPublication(candidate, assessments).eligible, true);
    const incomplete = packageFixture([sealRecord({ ...record, examples: [] })]);
    assert.equal(checkPublication(incomplete, assessments).eligible, false);
    const stale = packageFixture([{ ...record, explanation: 'Changed without review' }]);
    assert.equal(checkPublication(stale, assessments).eligible, false);
  }
});
test('ac2 exact evidence preserves complete records and pins independently calculated digest vectors', () => {
  const records = relatedRecords(); const related = packageFixture(records);
  const validated = validateRelease(related); assert.equal(validated.ok, true);
  if (validated.ok) assert.deepEqual(validated.value.records, records);
  for (const record of records) {
    const evidence = { releaseId: related.manifest.releaseId, recordId: record.recordId, recordVersion: record.recordVersion };
    assert.deepEqual(decodeEvidenceRef(JSON.parse(JSON.stringify(evidence))), { ok: true, value: evidence });
  }
  // Independently recomputed with Python json.dumps(sort_keys=True,separators=(',',':'))
  // and hashlib.sha256 from the ASCII fixture bytes, with the specified exclusions.
  const candidate = packageFixture();
  const record = JSON.parse(Buffer.from(candidate.files.find(f => f.path === 'records/0.json')!.bytes).toString());
  const envelope = JSON.parse(Buffer.from(candidate.files.find(f => f.path === 'coverage.json')!.bytes).toString());
  assert.equal(recordContentDigest(record), '01113944fa814efa913e8f0025616eb9a69bb0ae7a9ab66f5d89a3b5c9225dd3');
  assert.equal(candidateContentDigest(candidate.manifest), '3924cd36440385e5bf5bca1522f6d3ac909e8ff12b93cc834d1c4539dd0bdcbc');
  assert.equal(reviewContentDigest(envelope), 'e92afaa6f7a5f06c1b6e6f0339e260f40b9927333ed4cef6de7205b5aee747c6');
  assert.equal(releaseContentDigest(candidate.manifest), '07cbadefe74c827d64405594877af0806f06e7d9fa8606738c2d1354c96742a1');
});

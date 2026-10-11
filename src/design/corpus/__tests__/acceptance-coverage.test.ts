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
  assert.equal(candidateContentDigest(candidate.manifest), '5691f92a44d349401cadc1627ad74e4abd71488a0e288f0eb1636ca6ab627571');
  assert.equal(reviewContentDigest(envelope), 'd14f50250c702486cdef9238d977a33b4dc3c0ddb7fb35b4772d630d7dffaeab');
  assert.equal(releaseContentDigest(candidate.manifest), '9bfd98dbd4d2db3c4a4f197d1212ed90d432067d528a755a206ae6acb581acc3');
});

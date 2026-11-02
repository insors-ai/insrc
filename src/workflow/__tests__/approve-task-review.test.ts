import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, hash } from '../code-review/task-review/__tests__/publication-fixture.js';
import { publishTaskCheckpoint } from '../code-review/task-review/publication.js';
import { reviewedBuildFingerprint } from '../code-review/build-freshness.js';
import { approveJson, approveTarget } from './helpers/approve.js';

for (const route of ['direct', 'target', 'batch'] as const) {
 test(`task review approval via ${route} preserves reviewed BUILD content`, async () => {
  const f = await fixture(true);
  try {
   await publishTaskCheckpoint(f.repo, hash, 'publication', f.deps);
   const path = join(f.repo, `.insrc/artifacts/BUILD-${hash}-s1.json`);
   const before = JSON.parse(readFileSync(path, 'utf8'));
   if (route === 'direct') await approveJson(path);
   else {
    const result = await approveTarget({ repoPath: f.repo, ...(route === 'target' ? { artifactPath: path } : { epicHash: hash }) });
    assert.ok(result.approved.some(entry => entry.path === path), JSON.stringify(result));
   }
   const after = JSON.parse(readFileSync(path, 'utf8'));
   assert.equal(after.meta.lifecycle.status, 'approved');
   assert.deepEqual(after.body, before.body);
   assert.equal(reviewedBuildFingerprint(after), reviewedBuildFingerprint(before));
  } finally { f.cleanup(); }
 });
}

for (const defect of ['stale', 'incomplete', 'task-only', 'foreign', 'same-party', 'coverage', 'unknown-version'] as const) {
 test(`both approval routes reject ${defect} task review without mutating BUILD`, async () => {
  for (const direct of [true, false]) {
   const f = await fixture(defect !== 'task-only');
   try {
    const published = await publishTaskCheckpoint(f.repo, hash, 'publication', f.deps);
    const path = join(f.repo, `.insrc/artifacts/BUILD-${hash}-s1.json`);
    const build = JSON.parse(readFileSync(path, 'utf8'));
    const cr = JSON.parse(readFileSync(published.jsonPath, 'utf8'));
    if (defect === 'stale') build.body.summary = 'New implementation';
    if (defect === 'incomplete') { cr.body.status = 'incomplete'; cr.body.reviews[0].status = 'incomplete'; }
    if (defect === 'foreign') cr.meta.storyId = 's2';
    if (defect === 'same-party') { cr.meta.reviewedBy = 'controller'; cr.body.reviews[0].reviewer = 'controller'; }
    if (defect === 'coverage') build.body.tasks.push({ id: 't2', passed: true });
    if (defect === 'unknown-version') cr.meta.schemaVersion = 99;
    f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`, build);
    f.put(`.insrc/artifacts/CR-${hash}-s1.json`, cr);
    const before = readFileSync(path, 'utf8');
    if (direct) await assert.rejects(approveJson(path));
    else {
     const result = await approveTarget({ repoPath: f.repo, artifactPath: path });
     assert.equal(result.approved.length, 0); assert.equal(result.skipped.length, 1);
    }
    assert.equal(readFileSync(path, 'utf8'), before);
   } finally { f.cleanup(); }
  }
 });
}


test('approval still creates a missing BUILD before withholding an unbound review', async () => {
 const f = await fixture(true);
 try {
  const path = join(f.repo, `.insrc/artifacts/BUILD-${hash}-s1.json`);
  unlinkSync(path);
  const result = await approveTarget({ repoPath: f.repo, artifactPath: path });
  assert.ok(existsSync(path));
  assert.equal(result.approved.length, 0);
  assert.equal(result.skipped.length, 1);
 } finally { f.cleanup(); }
});

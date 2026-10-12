/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { runGitBinary } from '../git-reader.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashBytes } from '../../canonical.js';
import { checkPublication } from '../../validate.js';
import { stageLocalSources } from '../stage.js';
import { prepareEligibilityCandidate, assessEligibility } from '../assessment.js';
import { assessmentFixture, finalizeFixture } from './assessment-fixtures.js';
import { sourceFixture, makeBytes } from './fixtures.js';
import { gitFixture } from './git-fixtures.js';

test('candidate-roundtrip admits only eligible material and exports complete notices', async () => {
  const git = gitFixture(), f = sourceFixture();
  try {
    for (const blob of f.blobs) writeFileSync(join(git.dir, blob.path), blob.bytes);
    git.git('add', '.'); git.git('commit', '-qm', 'Synthetic source corpus');
    f.request.revision = git.git('rev-parse', 'HEAD'); for (const profile of f.policy.profiles) profile.revision = f.request.revision;
    const staged = await stageLocalSources(f.policy, [{ localRepository: git.dir, request: f.request }]); assert.equal(staged.ok, true); if (!staged.ok) return;
    assert.deepEqual(staged.value.stages[0]!.report.admitted, ['good.txt']);
    const importedPaths = (staged.value.imports[0]!.blobs as { path: string }[]).map(blob => blob.path);
    assert.deepEqual(importedPaths, ['LICENSE', 'good.txt']);
    const fxt = assessmentFixture(true, f), review = { ...fxt.review, imports: staged.value.imports };
    const outputPaths = new Set(fxt.lineage.bindings.map(binding => binding.path));
    const prepared = prepareEligibilityCandidate(fxt.manifest, fxt.files.filter(file => outputPaths.has(file.path)), review);
    assert.equal(prepared.ok, true); if (!prepared.ok) return;
    const completed = finalizeFixture({ ...fxt, manifest: prepared.value.manifest, files: prepared.value.files });
    assert.equal(checkPublication(completed, [prepared.value.assessment, { ...prepared.value.assessment, stage: 'coverage' }]).eligible, true);
    const sourceManifest = JSON.parse(Buffer.from(prepared.value.files.find(file => file.path === fxt.manifest.sourceManifestPath)!.bytes).toString());
    assert.ok(sourceManifest.files.every((file: { revision: string }) => file.revision === f.request.revision));
    assert.equal(sourceManifest.files.some((file: { path: string }) => ['unknown.txt', 'excluded.txt'].includes(file.path)), false);
    for (const source of sourceManifest.files) for (const ref of [...source.licenseTextRefs, ...source.noticeRefs]) assert.ok(prepared.value.files.some(file => file.path === ref));
    // All requests are checked before any I/O, even if only the last selected path is unsafe.
    let calls = 0;
    const invalid = await stageLocalSources(f.policy, [{ localRepository: git.dir, request: f.request },
      { localRepository: git.dir, request: { ...f.request, paths: ['bad%path'] } }], { run: async () => { calls++; throw new Error('Must not run'); } });
    assert.equal(invalid.ok, false); assert.equal(calls, 0);
    const inputs = [{ localRepository: git.dir, request: f.request }, { localRepository: git.dir, request: f.request }];
    const countLimit = await stageLocalSources(f.policy, inputs, { limits: { files: 7 }, run: async () => { calls++; throw new Error('Must not run'); } });
    assert.equal(!countLimit.ok && countLimit.issues[0]!.code, 'limit.exceeded'); assert.equal(calls, 0);
    const relative = await stageLocalSources(f.policy, [{ localRepository: 'relative/repo', request: f.request }], { run: async () => { calls++; throw new Error('Must not run'); } });
    assert.equal(!relative.ok && relative.issues[0]!.code, 'path.invalid'); assert.equal(calls, 0);
    const exactBytes = f.blobs.reduce((sum, blob) => sum + blob.bytes.byteLength, 0);
    const exact = await stageLocalSources(f.policy, inputs.slice(0, 1), { limits: { bytes: exactBytes } }); assert.equal(exact.ok, true);
    const exhausted = await stageLocalSources(f.policy, inputs, { limits: { bytes: exactBytes } });
    assert.equal(!exhausted.ok && exhausted.issues[0]!.message, 'No remaining source-byte budget.');
    const short = await stageLocalSources(f.policy, inputs, { limits: { bytes: exactBytes * 2 - 1 } });
    assert.equal(!short.ok && short.issues[0]!.code, 'limit.exceeded'); assert.equal('value' in short, false);
    const external = new AbortController(); let observed: AbortSignal | undefined; let commits = 0;
    const batch = await stageLocalSources(f.policy, inputs, { signal: external.signal, limits: { requestTimeoutMs: 1000 },
      run: async (args, input, options) => {
        observed = options.signal;
        if (Buffer.from(input).toString().trim() === f.request.revision && ++commits === 2) return new Promise(() => {});
        return runGitBinary(args, input, options);
      } });
    assert.equal(!batch.ok && batch.issues[0]!.message, 'Source staging deadline exceeded.');
    assert.equal(commits, 2);
    assert.equal(getEventListeners(external.signal, 'abort').length, 0); assert.ok(observed?.aborted);
  } finally { git.dispose(); }
});
test('candidate-roundtrip validates original-only and multi-source derived packages', () => {
  const original = assessmentFixture(false); const originalAssessment = assessEligibility(original.manifest, original.files, original.review);
  assert.equal(originalAssessment.ok && originalAssessment.value.passed, true);
  const f = sourceFixture(), bytes = makeBytes('Second original synthetic asset');
  const profile = { ...structuredClone(f.policy.profiles[0]!), path: 'second.txt', digest: hashBytes(bytes), attribution: ['Another fixture author'] };
  f.policy.profiles.push(profile); f.blobs.push({ path: profile.path, bytes }); f.request.paths.push(profile.path);
  const multiple = assessmentFixture(true, f); assert.equal(multiple.lineage.bindings[0]!.sourceIds.length, 2);
  const assessment = assessEligibility(multiple.manifest, multiple.files, multiple.review); assert.equal(assessment.ok && assessment.value.passed, true);
  if (assessment.ok) assert.equal(checkPublication(finalizeFixture(multiple), [assessment.value, { ...assessment.value, stage: 'coverage' }]).eligible, true);
  const omitted = structuredClone(multiple.lineage); omitted.bindings[0]!.sourceIds.pop();
  const lineageFile = multiple.files.find(file => file.path === 'sources/lineage.json')!; lineageFile.bytes = Buffer.from(JSON.stringify(omitted));
  multiple.manifest.files.find(file => file.path === lineageFile.path)!.digest = hashBytes(lineageFile.bytes);
  const invalid = assessEligibility(multiple.manifest, multiple.files, multiple.review); assert.equal(invalid.ok && invalid.value.passed, false);
});

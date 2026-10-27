import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { captureReviewInputFingerprint, compareReviewInputFingerprint, isReviewInputFingerprint, readReviewInputSnapshot, ReviewInputChangedError, ReviewInputUnavailableError } from '../input-fingerprint.js';
import { testRecordView } from '../dimensions/test-record-view.js';
import { resolveCodeReviewSubject } from '../subject.js';

const epic = 'e1a2b3c4d5e6f708', story = 'S001';
function fixture() {
 const repo = mkdtempSync(join(tmpdir(), 'insrc-fingerprint-'));
 const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
 git('init', '-q'); git('config', 'user.name', 'Fingerprint Test'); git('config', 'user.email', 'test@example.invalid');
 mkdirSync(join(repo, 'src')); writeFileSync(join(repo, 'src/a.ts'), 'export const value = 1;\n');
 writeFileSync(join(repo, 'src/data.bin'), Buffer.from([0, 1, 2]));
 git('add', 'src'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
 mkdirSync(join(repo, '.insrc/build-start'), { recursive: true }); mkdirSync(join(repo, '.insrc/artifacts'), { recursive: true });
 writeFileSync(join(repo, `.insrc/build-start/${epic}-${story}.json`), JSON.stringify({ epicHash: epic, storyId: story, rangeBase: base, stampedAt: '2026-10-27T00:00:00Z' }));
 writeFileSync(join(repo, 'src/a.ts'), 'export const value = 2;\n'); writeFileSync(join(repo, 'src/data.bin'), Buffer.from([0, 3, 4]));
 git('add', 'src'); git('commit', '-qm', 'Story implementation', '-m', `Insrc-Story: ${epic}/${story}`);
 const artifact = (kind: string) => join(repo, `.insrc/artifacts/${kind}-${epic}-${story}.json`);
 const build = { meta: { workflow: 'build', epicHash: epic, storyId: story, createdAt: '2026-10-27T00:00:00Z', updatedAt: '2026-10-27T00:01:00Z', authoredBy: 'controller', rangeBase: base }, body: { tasks: [{ id: 't1', passed: true }], summary: 'implementation' } };
 const tests = { meta: { workflow: 'tests', epicHash: epic, storyId: story, createdAt: '2026-10-27T00:00:00Z', updatedAt: '2026-10-27T00:01:00Z' }, body: { tasks: [
  { taskId: 't1', ranAt: '2026-10-27T00:01:00Z', commit: 'c1', tests: [], files: [{ file: 'src/a.test.ts', exitCode: 0, timedOut: false, titles: [{ title: 'case', result: 'pass' }] }] },
  { taskId: 't2', ranAt: '2026-10-27T00:02:00Z', commit: 'c2', tests: [], files: [{ file: 'src/a.test.ts', exitCode: 1, timedOut: false, titles: [{ title: 'case', result: 'fail' }] }] },
 ] } };
 const save = (kind: string, value: unknown) => writeFileSync(artifact(kind), JSON.stringify(value));
 save('BUILD', build); save('TESTS', tests);
 const read = () => readReviewInputSnapshot(repo, epic, story);
 return { repo, git, artifact, build, tests, save, read, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

test('DIFF-FINGERPRINT-SNAPSHOT: consistent source, scoped diff, author and contracts bind the actual resolved review evidence', async () => {
 const f = fixture();
 try {
  const admitted = f.read(), identity = admitted.fingerprint;
  assert.ok(isReviewInputFingerprint(identity)); assert.deepEqual(compareReviewInputFingerprint(identity, f.repo, epic, story), { status: 'fresh' });
  const resolved = await resolveCodeReviewSubject(f.repo, epic, story); assert.ok(resolved.ok);
  if (resolved.ok) assert.equal(captureReviewInputFingerprint(resolved.subject).digest, identity.digest);
  const changed = (mutate: () => void, restore: () => void) => { mutate(); assert.notEqual(f.read().fingerprint.digest, identity.digest); restore(); assert.equal(f.read().fingerprint.digest, identity.digest); };
  const source = readFileSync(join(f.repo, 'src/a.ts'));
  changed(() => writeFileSync(join(f.repo, 'src/a.ts'), 'export const value = 3;\n'), () => writeFileSync(join(f.repo, 'src/a.ts'), source));
  changed(() => chmodSync(join(f.repo, 'src/a.ts'), 0o755), () => chmodSync(join(f.repo, 'src/a.ts'), 0o644));
  changed(() => writeFileSync(join(f.repo, 'src/data.bin'), Buffer.from([0, 9, 9])), () => writeFileSync(join(f.repo, 'src/data.bin'), Buffer.from([0, 3, 4])));
  changed(() => f.save('BUILD', { ...f.build, meta: { ...f.build.meta, authoredBy: 'daemon' } }), () => f.save('BUILD', f.build));
  const lld = { meta: { workflow: 'design.story', epicHash: epic, storyId: story, standalone: true, createdAt: '2026-10-27T00:00:00Z', approvedAt: '2026-10-27T00:00:01Z' }, body: { summary: 'approved requirement' } };
  changed(() => f.save('LLD', lld), () => rmSync(f.artifact('LLD')));
  const plan = { meta: { ...lld.meta, workflow: 'plan' }, body: { tasks: [{ id: 't1', summary: 'approved implementation' }] } };
  changed(() => f.save('PLAN', plan), () => rmSync(f.artifact('PLAN')));
  f.git('commit', '--allow-empty', '-qm', 'new HEAD, unchanged source bytes');
  assert.notEqual(f.read().fingerprint.sourceDigest, identity.sourceDigest);
  // New commits and rename identities are included even when the working bytes remain available.
  f.git('mv', 'src/a.ts', 'src/renamed.ts'); f.git('commit', '-qm', 'rename', '-m', `Insrc-Story: ${epic}/${story}`);
  assert.notEqual(f.read().fingerprint.sourceDigest, identity.sourceDigest);
  assert.equal(compareReviewInputFingerprint(identity, f.repo, epic, story).status, 'stale-review');
 } finally { f.cleanup(); }
});

test('DIFF-FINGERPRINT-SNAPSHOT: exact BUILD approval exclusions preserve identity while semantic fields and capture races fail closed', () => {
 const f = fixture();
 try {
  const first = f.read();
  for (const meta of [
   { ...f.build.meta, approvedAt: 'now', rejectedAt: 'old', rejectReason: 'rejected', reviewOverride: { reason: 'approved findings', at: 'now' } },
   { ...f.build.meta },
  ]) { f.save('BUILD', { ...f.build, meta }); assert.equal(f.read().fingerprint.digest, first.fingerprint.digest); }
  for (const build of [
   { ...f.build, meta: { ...f.build.meta, updatedAt: 'new semantic ledger revision' } },
   { ...f.build, body: { ...f.build.body, summary: 'different implementation' } },
   { ...f.build, body: { ...f.build.body, tasks: [{ id: 't1', passed: false }] } },
  ]) { f.save('BUILD', build); assert.notEqual(f.read().fingerprint.buildDigest, first.fingerprint.buildDigest); }
  f.save('BUILD', f.build);
  assert.throws(() => readReviewInputSnapshot(f.repo, epic, story, () => writeFileSync(join(f.repo, 'src/a.ts'), 'raced source')), ReviewInputChangedError);
  assert.equal(compareReviewInputFingerprint(first.fingerprint, f.repo, epic, story).reason, 'mismatch');
  writeFileSync(join(f.repo, 'src/a.ts'), 'export const value = 2;\n');
  assert.throws(() => readReviewInputSnapshot(f.repo, epic, story, () => f.save('TESTS', { ...f.tests, meta: { ...f.tests.meta, updatedAt: 'race' } })), ReviewInputChangedError);
  assert.throws(() => captureReviewInputFingerprint(first.subject), ReviewInputChangedError);
  rmSync(f.artifact('BUILD'));
  assert.throws(f.read, ReviewInputUnavailableError);
  assert.deepEqual(compareReviewInputFingerprint(first.fingerprint, f.repo, epic, story).reason, 'unavailable');
  assert.equal(compareReviewInputFingerprint({ ...first.fingerprint, schemaVersion: 2 }, f.repo, epic, story).reason, 'invalid');
  assert.equal(compareReviewInputFingerprint({ digest: first.fingerprint.digest }, f.repo, epic, story).reason, 'invalid');
  assert.throws(() => readReviewInputSnapshot(f.repo, epic, '../../outside'), /Invalid review target/);
 } finally { f.cleanup(); }
});

test('DIFF-IDENTITY-TESTS: complete ordered TESTS content, ranAt, malformed states, reports and absence each affect identity', () => {
 const f = fixture();
 try {
  const baseline = f.read().fingerprint;
  const variant = (mutate: (record: typeof f.tests) => void) => { const copy = structuredClone(f.tests); mutate(copy); f.save('TESTS', copy); const next = f.read().fingerprint; assert.notEqual(next.testsDigest, baseline.testsDigest); assert.equal(next.sourceDigest, baseline.sourceDigest); assert.equal(next.buildDigest, baseline.buildDigest); };
  variant(r => { r.body.tasks[0]!.ranAt = '2026-10-27T00:03:00Z'; });
  variant(r => { r.body.tasks.reverse(); });
  variant(r => { r.body.tasks[1]!.files[0]!.titles[0]!.result = 'pass'; });
  variant(r => { r.body.tasks[1]!.files[0]!.titles.push({ title: 'another case', result: 'fail' }); });
  variant(r => { r.body.tasks[1]!.files[0]!.timedOut = true; });
  variant(r => { r.body.tasks[1]!.files[0] = { file: 'src/a.test.ts', titles: 'malformed' } as never; });
  variant(r => { r.body.tasks[0]!.tests.push({ name: 'live proof', reported: { result: 'fail', evidence: 'run changed' } } as never); });
  variant(r => { r.meta.updatedAt = 'only TESTS metadata changed'; });
  const tied = structuredClone(f.tests);
  tied.body.tasks[1]!.ranAt = tied.body.tasks[0]!.ranAt;
  tied.body.tasks[1]!.files[0]!.exitCode = 0;
  tied.body.tasks[1]!.files[0]!.titles[0] = { title: 'tied other title', result: 'pass' };
  f.save('TESTS', tied); const tiedFirst = f.read();
  tied.body.tasks.reverse(); f.save('TESTS', tied); const tiedSecond = f.read();
  assert.notEqual(tiedFirst.fingerprint.testsDigest, tiedSecond.fingerprint.testsDigest);
  assert.notEqual(testRecordView(tiedFirst.subject)!.files[0]!.decidedBy.taskId, testRecordView(tiedSecond.subject)!.files[0]!.decidedBy.taskId, 'ordered ties change the actual evidence shown to the judge');
  f.save('TESTS', f.tests); assert.equal(f.read().fingerprint.digest, baseline.digest);
  // Object-key order/whitespace does not change parsed evidence; array order above does.
  writeFileSync(f.artifact('TESTS'), JSON.stringify({ body: f.tests.body, meta: Object.fromEntries(Object.entries(f.tests.meta).reverse()) }, null, 2));
  assert.equal(f.read().fingerprint.digest, baseline.digest);
  const states = [baseline.testsDigest];
  writeFileSync(f.artifact('TESTS'), '{bad json'); states.push(f.read().fingerprint.testsDigest);
  writeFileSync(f.artifact('TESTS'), '{different invalid'); states.push(f.read().fingerprint.testsDigest);
  f.save('TESTS', { malformed: true }); states.push(f.read().fingerprint.testsDigest);
  rmSync(f.artifact('TESTS')); const absent = f.read(); states.push(absent.fingerprint.testsDigest); assert.equal(absent.subject.testRecord, null);
  assert.equal(new Set(states).size, states.length);
  mkdirSync(f.artifact('TESTS')); assert.throws(f.read, ReviewInputUnavailableError);
 } finally { f.cleanup(); }
});

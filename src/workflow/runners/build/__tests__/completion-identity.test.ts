import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { ensureBuildRecordOnCompletion } from '../completion-record.js';
import { persistBuildRecord, type BuildRecord } from '../standalone-record.js';
import { reconcileCompletionChangeLog } from '../changed-files.js';
import { readReviewInputSnapshot } from '../../../code-review/input-fingerprint.js';

const epicHash = 'e1a2b3c4d5e6f708', storyId = 'S001', at = '2026-10-26T00:00:00Z';
function fixture() {
 const repo = mkdtempSync(join(tmpdir(), 'insrc-completion-identity-'));
 const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
 git('init', '-q'); git('config', 'user.name', 'Completion Test'); git('config', 'user.email', 'test@example.invalid');
 mkdirSync(join(repo, 'src')); writeFileSync(join(repo, 'src/a.ts'), 'a1'); writeFileSync(join(repo, 'src/b.ts'), 'b1');
 git('add', 'src'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
 writeFileSync(join(repo, 'src/a.ts'), 'a2'); writeFileSync(join(repo, 'src/b.ts'), 'b2');
 git('add', 'src'); git('commit', '-qm', 'story', '-m', `Insrc-Story: ${epicHash}/${storyId}`);
 const commit = git('rev-parse', 'HEAD');
 mkdirSync(join(repo, '.insrc/build-start'), { recursive: true }); mkdirSync(join(repo, '.insrc/artifacts'), { recursive: true });
 writeFileSync(join(repo, `.insrc/build-start/${epicHash}-${storyId}.json`), JSON.stringify({ epicHash, storyId, rangeBase: base, stampedAt: at }));
 const tests = join(repo, `.insrc/artifacts/TESTS-${epicHash}-${storyId}.json`);
 writeFileSync(tests, JSON.stringify({ meta: { workflow: 'tests', epicHash, storyId, createdAt: at, updatedAt: at, standalone: true }, body: { tasks: [{ taskId: 't1', ranAt: at, tests: [], files: [] }] } }));
 const record: BuildRecord = { meta: { workflow: 'build', epicHash, storyId, createdAt: at, updatedAt: at, authoredBy: 'controller', standalone: true }, body: { commit, tasks: [{ id: 't1', passed: true }], summary: 'built', changeLog: [
  { target: { file: './src/b.ts', version: commit }, author: 'original B', timestamp: at },
  { target: { file: 'src/a.ts', version: commit }, author: 'original A', timestamp: at },
 ] } };
 const paths = persistBuildRecord(repo, record);
 const read = () => JSON.parse(readFileSync(paths.json, 'utf8')) as BuildRecord;
 return { repo, git, paths, tests, commit, record, read, fingerprint: () => readReviewInputSnapshot(repo, epicHash, storyId).fingerprint, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

test('DIFF-COMPLETION-NOOP: real completion preserves BUILD bytes, file identities, provenance order/version/author and TESTS ranAt', async () => {
 const f = fixture();
 try {
  const before = { json: readFileSync(f.paths.json), md: readFileSync(f.paths.md), tests: readFileSync(f.tests), jsonStat: statSync(f.paths.json), mdStat: statSync(f.paths.md), fingerprint: f.fingerprint(), record: f.read() };
  for (let i = 0; i < 2; i++) {
   assert.deepEqual(await ensureBuildRecordOnCompletion(f.repo, { epicHash, storyId }), f.paths);
   assert.ok(readFileSync(f.paths.json).equals(before.json)); assert.ok(readFileSync(f.paths.md).equals(before.md));
   assert.equal(statSync(f.paths.json).ino, before.jsonStat.ino); assert.equal(statSync(f.paths.json).mtimeMs, before.jsonStat.mtimeMs);
   assert.equal(statSync(f.paths.md).ino, before.mdStat.ino); assert.equal(statSync(f.paths.md).mtimeMs, before.mdStat.mtimeMs);
   assert.deepEqual(f.read().body.changeLog, before.record.body.changeLog); assert.equal(f.read().meta.authoredBy, 'controller');
   assert.ok(readFileSync(f.tests).equals(before.tests)); assert.equal(f.fingerprint().digest, before.fingerprint.digest);
  }
 } finally { f.cleanup(); }
});

test('DIFF-APPROVE-IDENTITY: approval metadata and no-op completion stay stable while normal validate persistence still refreshes semantic time', async () => {
 const f = fixture();
 try {
  const initial = f.fingerprint(); const rec = f.read();
  writeFileSync(f.paths.json, JSON.stringify({ ...rec, meta: { ...rec.meta, approvedAt: 'approved', reviewOverride: { reason: 'findings accepted', at: 'approved' } } }, null, 2) + '\n');
  assert.equal(f.fingerprint().digest, initial.digest);
  await ensureBuildRecordOnCompletion(f.repo, { epicHash, storyId }); assert.equal(f.fingerprint().digest, initial.digest);
  const beforeValidate = f.read(), tests = readFileSync(f.tests);
  persistBuildRecord(f.repo, { meta: { ...beforeValidate.meta, createdAt: 'ignored new creation', updatedAt: 'genuine new validate time' }, body: { tasks: [{ id: 't1', passed: true }] } });
  assert.equal(f.read().meta.createdAt, at); assert.equal(f.read().meta.updatedAt, 'genuine new validate time');
  assert.notEqual(f.fingerprint().buildDigest, initial.buildDigest); assert.ok(readFileSync(f.tests).equals(tests));
 } finally { f.cleanup(); }
});

test('DIFF-COMPLETION-CHANGE: new commits/files and changed tasks persist; unchanged per-file provenance survives the new Story revision', async () => {
 const f = fixture();
 try {
  const initial = f.fingerprint(), before = f.read();
  writeFileSync(join(f.repo, 'src/c.ts'), 'new file'); f.git('add', 'src/c.ts'); f.git('commit', '-qm', 'new story file', '-m', `Insrc-Story: ${epicHash}/${storyId}`);
  await ensureBuildRecordOnCompletion(f.repo, { epicHash, storyId });
  const next = f.read(); assert.notEqual(next.body.commit, before.body.commit); assert.notEqual(next.meta.updatedAt, before.meta.updatedAt);
  assert.deepEqual(next.body.changeLog!.slice(0, 2), before.body.changeLog); assert.equal(next.body.changeLog![2]!.target.file, 'src/c.ts');
  assert.equal(f.git('rev-parse', `${next.body.changeLog![2]!.target.version}^{commit}`), f.git('rev-parse', 'HEAD')); assert.notEqual(next.body.changeLog![2]!.timestamp, at);
  assert.notEqual(f.fingerprint().digest, initial.digest);
  const observed = [{ target: { file: 'src/c.ts' }, author: 'completion', timestamp: 'new' }];
  const removed = reconcileCompletionChangeLog(f.repo, observed, next.body.changeLog!, next.body.commit, next.body.commit);
  assert.deepEqual(removed.map(e => e.target.file), ['src/c.ts']);
  const tests = readFileSync(f.tests), beforeTasks = f.fingerprint();
  persistBuildRecord(f.repo, { meta: { ...next.meta, updatedAt: 'changed task time', authoredBy: 'daemon' }, body: { tasks: [{ id: 't1', passed: false }] } }, { mode: 'completion' });
  assert.equal(f.read().body.tasks![0]!.passed, false); assert.equal(f.read().meta.authoredBy, 'controller');
  assert.notEqual(f.fingerprint().buildDigest, beforeTasks.buildDigest); assert.ok(readFileSync(f.tests).equals(tests));
  const stableLedger = readFileSync(f.paths.json), previous = f.fingerprint();
  writeFileSync(join(f.repo, 'src/a.ts'), 'working bytes changed without a new commit');
  await ensureBuildRecordOnCompletion(f.repo, { epicHash, storyId });
  assert.ok(readFileSync(f.paths.json).equals(stableLedger), 'retained file provenance never claims identical working bytes');
  assert.notEqual(f.fingerprint().sourceDigest, previous.sourceDigest);
 } finally { f.cleanup(); }
});


test('DIFF-COMPLETION-CHANGE: a malformed prior takes the fresh-record path and cannot retain the previous fingerprint', async () => {
 const f = fixture();
 try {
  const before = f.fingerprint(), tests = readFileSync(f.tests);
  writeFileSync(f.paths.json, JSON.stringify({ meta: f.record.meta, body: { tasks: [{ id: 't1', passed: 'malformed' }] } }));
  assert.ok(await ensureBuildRecordOnCompletion(f.repo, { epicHash, storyId }));
  assert.deepEqual(f.read().body.tasks, []); assert.notEqual(f.fingerprint().digest, before.digest);
  assert.ok(readFileSync(f.tests).equals(tests));
 } finally { f.cleanup(); }
});
